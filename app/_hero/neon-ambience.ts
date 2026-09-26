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

// Fixed size: the canvas backs a WebGL texture, and WebGL2 textures keep the size they were created with.
// Portrait (mobile) video is squeezed into it; every mapping is in normalised units, so nothing moves.
const SAMPLE_WIDTH = 48;
const SAMPLE_HEIGHT = 36;

/**
 * Samples the hero video into a tiny canvas. The canvas doubles as the blurred "room" texture the glass
 * reflects. The video must be requested with `crossOrigin="anonymous"`; if the browser still refuses the
 * pixels, sampling switches itself off and the sign keeps its fixed look.
 */
export class VideoAmbience {
  readonly canvas = document.createElement("canvas");
  box: VideoBox | null = null;
  private context: CanvasRenderingContext2D | null;
  private broken = false;

  constructor(private readonly video: () => HTMLVideoElement | null, private readonly section: HTMLElement) {
    this.canvas.width = SAMPLE_WIDTH;
    this.canvas.height = SAMPLE_HEIGHT;
    this.context = this.canvas.getContext("2d", { willReadFrequently: true });
    if (this.context) {
      this.context.fillStyle = "#000";
      this.context.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  get available() {
    return !this.broken && !!this.context;
  }

  /** Reads the current frame; `band` is the area behind the wordmark in section CSS px. */
  sample(band: Rect): FrameStats | null {
    const video = this.video();
    const context = this.context;
    if (this.broken || !context || !video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return null;

    const frame = this.section.getBoundingClientRect();
    const shown = video.getBoundingClientRect();
    const scale = Math.max(shown.width / video.videoWidth, shown.height / video.videoHeight);
    const w = video.videoWidth * scale;
    const h = video.videoHeight * scale;
    this.box = { x0: shown.left - frame.left + (shown.width - w) / 2, y0: shown.top - frame.top + (shown.height - h) / 2, w, h };

    const width = SAMPLE_WIDTH;
    const height = SAMPLE_HEIGHT;

    let data: Uint8ClampedArray;
    try {
      context.drawImage(video, 0, 0, width, height);
      data = context.getImageData(0, 0, width, height).data;
    } catch {
      this.broken = true;
      return null;
    }
    const box = this.box;
    return analyzeFrame(data, width, height, {
      x0: ((band.left - box.x0) / box.w) * width,
      x1: ((band.right - box.x0) / box.w) * width,
      y0: ((band.top - box.y0) / box.h) * height,
      y1: ((band.bottom - box.y0) / box.h) * height,
    });
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
