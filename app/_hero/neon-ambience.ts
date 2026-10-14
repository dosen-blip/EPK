import * as THREE from "three";
import { FullScreenQuad } from "three/addons/postprocessing/Pass.js";
import {
  AMBIENCE_DEFAULTS,
  AMBIENCE_EFFECTS,
  AMBIENCE_IDS,
  AMBIENCE_STORAGE_KEY,
  analyzeFrame,
  type AmbienceToggles,
  type FrameStats,
} from "./ambience-model.mjs";
import { applyAmbienceFlags } from "./ambience-store";

/** Where the video's picture sits inside the hero section (CSS px), after object-fit: cover and its scale. */
export type VideoBox = { x0: number; y0: number; w: number; h: number };
export type Rect = { left: number; top: number; right: number; bottom: number };

/** What the panel shows about the room and the sign's response. */
export type AmbienceReading = {
  sampling: boolean;
  luma: number;
  bandLuma: number;
  hue: number;
  strength: number;
  exposure: number;
  shiftDegrees: number;
  strobeAgo: number;
};

const SAMPLE_WIDTH = 48;
const SAMPLE_HEIGHT = 36;

/** A frame's numbers, and when the frame was taken (performance.now() ms). */
export type RoomSample = { stats: FrameStats; at: number };

/* One bilinear tap per sample pixel, at the same points a 2D canvas drawImage() of the whole frame reads. The video
   is uploaded raw (sRGB-encoded, so it filters as stored, like the canvas did) and the sRGB target re-encodes on
   write, so the stored bytes and the decoded colour the sign's shaders sample are what the canvas used to hold. */
const sampleVertex = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;
const sampleFragment = /* glsl */ `
  uniform sampler2D uVideo;
  varying vec2 vUv;
  vec3 decode(vec3 c) { return mix(pow((c + 0.055) / 1.055, vec3(2.4)), c / 12.92, vec3(lessThanEqual(c, vec3(0.04045)))); }
  void main() { gl_FragColor = vec4(decode(texture2D(uVideo, vec2(vUv.x, 1.0 - vUv.y)).rgb), 1.0); }
`;

/**
 * Samples the hero video into a tiny texture on the GPU. The texture doubles as the blurred "room" the glass
 * reflects; its pixels are read back asynchronously for the numbers the sign reacts to, so sampling never stalls
 * a frame waiting on the GPU (a 2D canvas read of a video frame copies the whole frame back and flushes the GPU,
 * 5-15 ms on the main thread). Portrait (mobile) video is squeezed into it; every mapping is in normalised units,
 * so nothing moves. The video must be requested with `crossOrigin="anonymous"`; if the browser still refuses the
 * pixels, sampling switches itself off and the sign keeps its fixed look.
 */
export class VideoAmbience {
  box: VideoBox | null = null;
  readonly texture: THREE.Texture;
  private target: THREE.WebGLRenderTarget;
  private material: THREE.ShaderMaterial;
  private quad: FullScreenQuad;
  private source: THREE.VideoTexture | null = null;
  private pixels = new Uint8Array(SAMPLE_WIDTH * SAMPLE_HEIGHT * 4);
  private frame = new Uint8ClampedArray(SAMPLE_WIDTH * SAMPLE_HEIGHT * 4);
  private reading = false;
  private latest: RoomSample | null = null;
  private broken = false;
  private disposed = false;
  /** The video the box was measured for, and at what size; the box is re-measured only when these or the hero change. */
  private boxOf: { video: HTMLVideoElement | null; width: number; height: number } = { video: null, width: 0, height: 0 };
  private observer: ResizeObserver;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly video: () => HTMLVideoElement | null,
    private readonly section: HTMLElement,
  ) {
    this.target = new THREE.WebGLRenderTarget(SAMPLE_WIDTH, SAMPLE_HEIGHT, {
      depthBuffer: false,
      colorSpace: THREE.SRGBColorSpace,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: false,
    });
    this.texture = this.target.texture;
    this.material = new THREE.ShaderMaterial({
      uniforms: { uVideo: { value: null } },
      vertexShader: sampleVertex,
      fragmentShader: sampleFragment,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.material);
    this.observer = new ResizeObserver(() => {
      this.boxOf = { video: null, width: 0, height: 0 };
    });
    this.observer.observe(section);
  }

  get available() {
    return !this.broken;
  }

  /**
   * Copies the current frame into the room texture and starts reading it back; `band` is the area behind the
   * wordmark in section CSS px. The numbers arrive a frame or so later through `take()`. False when there was no
   * frame to sample.
   */
  sample(band: Rect, now: number): boolean {
    const video = this.video();
    if (this.broken || this.disposed || !video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return false;
    if (this.source?.image !== video && !this.adopt(video)) return false;

    const of = this.boxOf;
    if (!this.box || of.video !== video || of.width !== video.videoWidth || of.height !== video.videoHeight) {
      const frame = this.section.getBoundingClientRect();
      const shown = video.getBoundingClientRect();
      const scale = Math.max(shown.width / video.videoWidth, shown.height / video.videoHeight);
      const w = video.videoWidth * scale;
      const h = video.videoHeight * scale;
      this.box = { x0: shown.left - frame.left + (shown.width - w) / 2, y0: shown.top - frame.top + (shown.height - h) / 2, w, h };
      this.boxOf = { video, width: video.videoWidth, height: video.videoHeight };
    }
    const box = this.box;

    const renderer = this.renderer;
    const previous = renderer.getRenderTarget();
    this.source!.needsUpdate = true;
    renderer.setRenderTarget(this.target);
    this.quad.render(renderer);
    renderer.setRenderTarget(previous);

    // One read in flight at a time; a sample that lands while one is pending still refreshes the room texture.
    if (this.reading) return true;
    this.reading = true;
    const width = SAMPLE_WIDTH;
    const height = SAMPLE_HEIGHT;
    const rect = {
      x0: ((band.left - box.x0) / box.w) * width,
      x1: ((band.right - box.x0) / box.w) * width,
      y0: ((band.top - box.y0) / box.h) * height,
      y1: ((band.bottom - box.y0) / box.h) * height,
    };
    renderer
      .readRenderTargetPixelsAsync(this.target, 0, 0, width, height, this.pixels)
      .then(() => {
        if (this.disposed) return;
        // GL rows run bottom-up; the numbers are taken over the frame top-down, as a canvas holds it.
        const row = width * 4;
        for (let y = 0; y < height; y++) this.frame.set(this.pixels.subarray((height - 1 - y) * row, (height - y) * row), y * row);
        this.latest = { stats: analyzeFrame(this.frame, width, height, rect), at: now };
      })
      .catch(() => undefined)
      .finally(() => {
        this.reading = false;
      });
    return true;
  }

  /** The newest frame's numbers since the last call, if any. */
  take() {
    const latest = this.latest;
    this.latest = null;
    return latest;
  }

  /** Starts sampling a (new) video element, once it has proved its pixels can be read. */
  private adopt(video: HTMLVideoElement) {
    const renderer = this.renderer;
    const gl = renderer.getContext();
    const probe = gl.createTexture();
    let readable = true;
    gl.bindTexture(gl.TEXTURE_2D, probe);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
    } catch {
      readable = false;
    }
    gl.deleteTexture(probe);
    // Raw GL calls above: three's cached bindings no longer match the context.
    renderer.resetState();
    if (!readable) {
      this.broken = true;
      return false;
    }
    this.source?.dispose();
    this.source = new THREE.VideoTexture(video);
    this.source.flipY = false;
    this.material.uniforms.uVideo.value = this.source;
    return true;
  }

  dispose() {
    this.disposed = true;
    this.observer.disconnect();
    this.source?.dispose();
    this.quad.dispose();
    this.material.dispose();
    this.target.dispose();
  }
}

function save(toggles: AmbienceToggles) {
  try {
    window.localStorage.setItem(AMBIENCE_STORAGE_KEY, JSON.stringify(toggles));
  } catch {
    // Private windows can refuse storage; the toggles still apply for this visit.
  }
}

/**
 * A small testing panel (`?ambience-panel`) that switches each effect live and shows what the sign reads.
 * Returns a function that removes it.
 */
export function mountAmbiencePanel(toggles: AmbienceToggles, read: () => AmbienceReading | null) {
  const panel = document.createElement("aside");
  panel.setAttribute("aria-label", "Neon ambience testing panel");
  panel.style.cssText = [
    "position:fixed", "z-index:300", "top:76px", "right:12px", "width:250px", "padding:12px 14px",
    "border:1px solid rgba(150,205,255,.35)", "border-radius:10px", "background:rgba(3,6,12,.92)",
    "color:#dfefff", "font:11px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace",
    "box-shadow:0 12px 40px rgba(0,0,0,.6)", "backdrop-filter:blur(8px)", "max-height:calc(100vh - 96px)", "overflow-y:auto",
  ].join(";");

  const title = document.createElement("strong");
  title.textContent = "NEON AMBIENCE";
  title.style.cssText = "display:block;margin-bottom:8px;letter-spacing:.12em;color:#8fd0ff";
  panel.append(title);

  const boxes = new Map<string, HTMLInputElement>();
  let group = "";
  for (const effect of AMBIENCE_EFFECTS) {
    if (effect.group !== group) {
      group = effect.group;
      const heading = document.createElement("span");
      heading.textContent = group === "room" ? "SIGN + TICKER · READS THE VIDEO" : "AROUND THE SITE";
      heading.style.cssText = "display:block;margin:8px 0 2px;color:#6f8aa3;font-size:9.5px;letter-spacing:.1em";
      panel.append(heading);
    }
    const label = document.createElement("label");
    label.title = effect.hint;
    label.style.cssText = "display:flex;gap:8px;align-items:center;padding:3px 0;cursor:pointer";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = toggles[effect.id];
    input.addEventListener("change", () => {
      toggles[effect.id] = input.checked;
      applyAmbienceFlags(toggles);
      save(toggles);
    });
    boxes.set(effect.id, input);
    label.append(input, effect.label);
    panel.append(label);
  }

  const actions = document.createElement("div");
  actions.style.cssText = "display:flex;gap:6px;margin:8px 0";
  const button = (text: string, apply: () => void) => {
    const element = document.createElement("button");
    element.type = "button";
    element.textContent = text;
    element.style.cssText = "flex:1;padding:4px 0;border:1px solid rgba(150,205,255,.35);border-radius:6px;background:transparent;color:inherit;font:inherit;cursor:pointer";
    element.addEventListener("click", () => {
      apply();
      for (const id of AMBIENCE_IDS) boxes.get(id)!.checked = toggles[id];
      applyAmbienceFlags(toggles);
      save(toggles);
    });
    actions.append(element);
  };
  button("All on", () => { for (const id of AMBIENCE_IDS) toggles[id] = true; });
  button("All off", () => { for (const id of AMBIENCE_IDS) toggles[id] = false; });
  button("Defaults", () => Object.assign(toggles, AMBIENCE_DEFAULTS));
  panel.append(actions);

  const readout = document.createElement("div");
  readout.style.cssText = "white-space:pre;color:#9fb6cc";
  panel.append(readout);

  const update = () => {
    for (const id of AMBIENCE_IDS) boxes.get(id)!.checked = toggles[id];
    applyAmbienceFlags(toggles);
    const reading = read();
    if (!reading) {
      readout.textContent = "waiting for the 3D sign";
      return;
    }
    if (!reading.sampling) {
      readout.textContent = "video not readable yet";
      return;
    }
    const pct = (value: number) => `${Math.round(value * 100)}%`.padStart(4);
    readout.textContent = [
      `frame luma ${pct(reading.luma)}`,
      `band luma  ${pct(reading.bandLuma)}`,
      `room hue   ${String(Math.round(reading.hue * 360)).padStart(3)}° @${pct(reading.strength)}`,
      `exposure   ${pct(reading.exposure)}`,
      `hue shift  ${reading.shiftDegrees >= 0 ? "+" : ""}${reading.shiftDegrees.toFixed(1)}°`,
      `strobe     ${reading.strobeAgo < 0.6 ? "● HIT" : reading.strobeAgo < 60 ? `${reading.strobeAgo.toFixed(1)}s ago` : "—"}`,
    ].join("\n");
  };
  update();
  const timer = window.setInterval(update, 200);
  document.body.append(panel);
  return () => {
    window.clearInterval(timer);
    panel.remove();
  };
}
