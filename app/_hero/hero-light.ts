import desktopDepthImage from "./depth/hero-desktop-depth.webp";
import desktopDepthMeta from "./depth/hero-desktop-depth.json";
import mobileDepthImage from "./depth/hero-mobile-depth.webp";
import mobileDepthMeta from "./depth/hero-mobile-depth.json";

/**
 * Phone intro light: the sign's light reaching into the room, drawn over the hero video in a full-screen layer and
 * blended as light. Two parts, each switchable on its own (ambience effects `rays` and `depthlight`):
 *
 * - God rays: light streaming outward from the sign through the room's haze, blocked by dark silhouettes (and,
 *   with depth on, by whatever stands nearer than the sign).
 * - Depth light: the sign lighting the room by distance and angle, using a depth map of the video baked offline
 *   (scripts/hero-depth/build.py, one per hero video; the one matching the playing video is used): nearer
 *   surfaces facing the sign catch the most.
 *
 * It renders at reduced resolution, redraws the video copy only when the video's time has moved on, and pauses
 * whenever the hero is off screen or the tab is hidden.
 */

export type HeroLightState = {
  /** How much light the sign gives (0..1, the tubes' live level). */
  light: number;
  /** Overall strength (fades out as the room opens up after landing). */
  fade: number;
  /** The sign's centre and each letter's x, in section CSS px, and its font size times its current scale. */
  centre: { x: number; y: number };
  letters: { x: number; level: number }[];
  fontPx: number;
  rays: boolean;
  depth: boolean;
  /** Extra strength for the rays alone (they calm down a few seconds after the sign settles); defaults to 1. */
  rayGain?: number;
  /** 0: light the whole room (the intro); 1: keep the light to a pool around the sign, `reach` px across and tall. */
  focus?: number;
  reach?: { x: number; y: number };
};

type Meta = { fps: number; frames: number; cols: number; rows: number; cellWidth: number; cellHeight: number; cuts: number[] };
const urlOf = (image: string | { src: string }) => (typeof image === "string" ? image : image.src);
/** One baked depth map per hero video, picked by the playing video's shape. */
const ATLASES = {
  portrait: { url: urlOf(mobileDepthImage), meta: mobileDepthMeta as Meta },
  landscape: { url: urlOf(desktopDepthImage), meta: desktopDepthMeta as Meta },
};
const RAY_STEPS = 36;
const LETTERS = 5;
const LIGHT_SCALE = 0.5;
/** The neon's blue, as the light it casts: deep and saturated, so the lit room stays coloured rather than pale. */
const TINT = [0.2, 0.46, 1.0];

const VERTEX = `#version 300 es
in vec2 aPosition;
void main() { gl_Position = vec4(aPosition, 0.0, 1.0); }`;

// Pass 1: the video, cropped and placed exactly as the page shows it (object-fit: cover), into a small buffer.
const SCENE = `#version 300 es
precision mediump float;
uniform sampler2D uVideo;
uniform vec2 uTarget;
uniform vec2 uSize;
uniform vec4 uVideoBox;
out vec4 color;
void main() {
  vec2 glUv = gl_FragCoord.xy / uTarget;
  vec2 px = vec2(glUv.x * uSize.x, (1.0 - glUv.y) * uSize.y);
  vec2 v = clamp((px - uVideoBox.xy) / uVideoBox.zw, 0.0, 1.0);
  color = vec4(texture(uVideo, v).rgb, 1.0);
}`;

// Pass 2: the light.
const LIGHT = `#version 300 es
precision highp float;
uniform sampler2D uScene;
uniform sampler2D uDepth;
uniform vec2 uTarget;
uniform vec2 uSize;
uniform vec4 uVideoBox;
uniform vec4 uCellA;
uniform vec4 uCellB;
uniform float uDepthMix;
uniform float uDepthOn;
uniform float uRaysOn;
uniform float uRayGain;
uniform float uFocus;
uniform vec2 uReach;
uniform float uLight;
uniform float uFade;
uniform vec2 uSign;
uniform vec2 uLetters[${LETTERS}];
uniform float uFont;
uniform vec3 uTint;
out vec4 color;

vec2 toGl(vec2 px) { return vec2(px.x / uSize.x, 1.0 - px.y / uSize.y); }

// The tubes themselves, as soft glowing blobs, each as bright as its letter is lit.
float signGlow(vec2 px) {
  float glow = 0.0;
  for (int i = 0; i < ${LETTERS}; i++) {
    vec2 d = (px - vec2(uLetters[i].x, uSign.y)) / vec2(uFont * 0.42, uFont * 0.5);
    glow += uLetters[i].y * exp(-dot(d, d));
  }
  return glow;
}

// Baked depth (0 far .. 1 near), blended between the two nearest baked frames.
float depthAt(vec2 px) {
  vec2 v = clamp((px - uVideoBox.xy) / uVideoBox.zw, 0.0, 1.0);
  return mix(texture(uDepth, uCellA.xy + v * uCellA.zw).r, texture(uDepth, uCellB.xy + v * uCellB.zw).r, uDepthMix);
}

void main() {
  vec2 glUv = gl_FragCoord.xy / uTarget;
  vec2 px = vec2(glUv.x * uSize.x, (1.0 - glUv.y) * uSize.y);
  vec3 scene = texture(uScene, glUv).rgb;
  // Light is gathered as a single intensity and coloured at the end, so it keeps the neon's hue however strong.
  float light = 0.0;
  float lit = 0.0;

  if (uDepthOn > 0.5) {
    // The room as a relief: depth pushes surfaces back up to ~1.2 screen heights; the sign floats in front.
    float d = depthAt(px);
    vec3 p = vec3(px, mix(-1.2, 0.0, d) * uSize.y);
    vec3 source = vec3(uSign, 0.22 * uSize.y);
    float e = 0.012 * uSize.x;
    float dx = depthAt(px + vec2(e, 0.0)) - depthAt(px - vec2(e, 0.0));
    float dy = depthAt(px + vec2(0.0, e)) - depthAt(px - vec2(0.0, e));
    vec3 n = normalize(vec3(-dx * 28.0, -dy * 28.0, 1.0));
    vec3 toLight = source - p;
    float dist = length(toLight);
    float facing = pow(max(dot(n, toLight / dist), 0.0), 1.3) * 0.9 + 0.1;
    float falloff = 1.0 / (1.0 + pow(dist / (0.46 * uSize.y), 2.0));
    // Dark surfaces still catch some light; brighter ones catch more.
    float albedo = sqrt(dot(scene, vec3(0.2126, 0.7152, 0.0722))) * 0.85 + 0.06;
    // Near surfaces catch far more than the back of the room, so the room reads in depth.
    lit = albedo * facing * falloff * (0.2 + 1.5 * d * d) * 3.8;
    light += lit;
  }

  if (uRaysOn > 0.5) {
    // March toward the sign, gathering its glow and the haze it lights, dimmed where silhouettes block the way.
    vec2 step = (uSign - px) / float(${RAY_STEPS}) * 0.96;
    vec2 q = px;
    float gathered = 0.0;
    float weight = 1.0;
    float reach = 0.66 * uSize.y;
    for (int i = 0; i < ${RAY_STEPS}; i++) {
      q += step;
      float lum = dot(texture(uScene, toGl(q)).rgb, vec3(0.2126, 0.7152, 0.0722));
      float through = mix(0.1, 1.0, smoothstep(0.02, 0.12, lum));
      if (uDepthOn > 0.5) through *= 1.0 - 0.8 * smoothstep(0.6, 0.85, depthAt(q));
      // Haze adds light in proportion to how lit it already is, capped so a strobe frame can't flood the room.
      float emit = signGlow(q) * 1.1 + smoothstep(0.03, 0.45, lum) * 2.0 * exp(-length(q - uSign) / reach);
      gathered += emit * through * weight;
      weight *= 0.97;
    }
    light += gathered / float(${RAY_STEPS}) * 3.6 * uRayGain;
  }

  // The light rides on what's already there: shadows and silhouettes stay mostly dark instead of fogging over,
  // which keeps the footage's contrast and colour.
  float here = dot(scene, vec3(0.2126, 0.7152, 0.0722));
  float raw = light;
  // Pure black stays black: the light only builds on what's there, so the darkest parts of the room keep their depth.
  light *= uLight * uFade * smoothstep(0.012, 0.2, here);
  // After the intro the light gathers into a pool around the sign rather than filling the room.
  vec2 fromSign = (px - uSign) / uReach;
  light *= mix(1.0, exp(-dot(fromSign, fromSign)), uFocus);
  // A contrast curve: faint, spread-out light (what reads as a wash) drops away much faster than the shafts and
  // lit surfaces. Then roll the intensity off and colour it, so strong light stays a deep neon blue.
  light = pow(light, 1.45) * 1.1;
  // Surfaces lit by the depth light keep much of their own colour (a red wall brightens red, not blue), so it
  // reads as light landing on the room rather than a blue filter. The rays stay the neon's blue.
  float surface = lit / max(raw, 1e-4);
  vec3 own = scene / max(max(scene.r, max(scene.g, scene.b)), 0.05);
  vec3 tint = mix(uTint, mix(uTint, own, 0.85), clamp(surface, 0.0, 1.0));
  vec3 rgb = tint * (1.0 - exp(-light)) * 0.8;

  color = vec4(rgb, 1.0);
}`;

export class HeroLight {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;
  private sceneProgram: WebGLProgram;
  private lightProgram: WebGLProgram;
  private videoTexture: WebGLTexture;
  private depthTexture: WebGLTexture;
  private sceneTexture: WebGLTexture;
  private sceneTarget: WebGLFramebuffer;
  private sceneSize = { w: 1, h: 1 };
  private depthReady = false;
  private atlas: keyof typeof ATLASES | null = null;
  private meta: Meta = ATLASES.portrait.meta;
  private freshFrame = true;
  /** The video time last copied: the copy is redone only when the footage has moved on (30 fps on a 60-120 Hz
   * screen). Read from whichever video element is current, so it can never go stale. */
  private copiedAt = -1;
  private copiedFrom: HTMLVideoElement | null = null;
  private uniforms = new Map<string, WebGLUniformLocation | null>();
  private disposed = false;

  private constructor(
    private readonly section: HTMLElement,
    private readonly video: () => HTMLVideoElement | null,
    canvas: HTMLCanvasElement,
    gl: WebGL2RenderingContext,
  ) {
    this.canvas = canvas;
    this.gl = gl;
    this.sceneProgram = this.program(SCENE);
    this.lightProgram = this.program(LIGHT);
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.videoTexture = this.texture();
    this.depthTexture = this.texture();
    this.sceneTexture = this.texture();
    this.sceneTarget = gl.createFramebuffer()!;
    this.resize();
  }

  /** Null when WebGL2 isn't available. */
  static create(section: HTMLElement, video: () => HTMLVideoElement | null) {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2", { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false });
    if (!gl) return null;
    canvas.className = "hero-light";
    canvas.setAttribute("aria-hidden", "true");
    try {
      return new HeroLight(section, video, canvas, gl);
    } catch {
      return null;
    }
  }

  private program(fragment: string) {
    const gl = this.gl;
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? "shader");
      return shader;
    };
    const program = gl.createProgram()!;
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment));
    gl.bindAttribLocation(program, 0, "aPosition");
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? "link");
    return program;
  }

  private texture() {
    const gl = this.gl;
    const texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    return texture;
  }

  /** Loads the depth map baked for the playing video (the hero swaps videos between phone and desktop shapes). */
  private useAtlas(key: keyof typeof ATLASES) {
    if (this.atlas === key) return;
    this.atlas = key;
    this.meta = ATLASES[key].meta;
    this.depthReady = false;
    const image = new Image();
    image.decoding = "async";
    image.src = ATLASES[key].url;
    void image.decode().then(() => {
      if (this.disposed || this.atlas !== key) return;
      this.gl.bindTexture(this.gl.TEXTURE_2D, this.depthTexture);
      this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, image);
      this.depthReady = true;
    }).catch(() => undefined);
  }

  private resize() {
    const gl = this.gl;
    const w = Math.max(1, this.section.clientWidth);
    const h = Math.max(1, this.section.clientHeight);
    // Soft light needs little resolution: half the CSS size for the light, a third for the video copy.
    this.canvas.width = Math.round(w * LIGHT_SCALE);
    this.canvas.height = Math.round(h * LIGHT_SCALE);
    this.sceneSize = { w: Math.round(w / 3), h: Math.round(h / 3) };
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.sceneSize.w, this.sceneSize.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneTarget);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.sceneTexture, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.freshFrame = true;
  }

  private set(program: WebGLProgram, name: string, apply: (location: WebGLUniformLocation | null) => void) {
    const key = `${program === this.sceneProgram ? "s" : "l"}:${name}`;
    if (!this.uniforms.has(key)) this.uniforms.set(key, this.gl.getUniformLocation(program, name));
    apply(this.uniforms.get(key) ?? null);
  }

  /** Where the video's picture sits in the section (object-fit: cover, centred, including its CSS scale). */
  private videoBox(video: HTMLVideoElement) {
    const frame = this.section.getBoundingClientRect();
    const shown = video.getBoundingClientRect();
    const scale = Math.max(shown.width / video.videoWidth, shown.height / video.videoHeight);
    const w = video.videoWidth * scale;
    const h = video.videoHeight * scale;
    return [shown.left - frame.left + (shown.width - w) / 2, shown.top - frame.top + (shown.height - h) / 2, w, h] as const;
  }

  render(state: HeroLightState) {
    if (this.disposed) return;
    const gl = this.gl;
    const video = this.video();
    const w = this.section.clientWidth;
    const h = this.section.clientHeight;
    if (Math.round(w * LIGHT_SCALE) !== this.canvas.width || Math.round(h * LIGHT_SCALE) !== this.canvas.height) this.resize();
    // Without a frame on screen to light, the layer hides rather than drawing a picture the page isn't showing,
    // which would sit over the footage as a frozen ghost: while the video loads or was just swapped for another,
    // and while it has never started (iOS can refuse autoplay, e.g. in Low Power Mode, and then shows nothing
    // although WebGL can still read the first frame).
    const ready = !!video && video.readyState >= 2 && video.videoWidth > 0 && (!video.paused || video.currentTime > 0);
    const on = (state.rays || state.depth) && state.fade > 0.001 && ready;
    this.canvas.classList.toggle("is-on", on);
    if (!on || !video) return;
    const box = this.videoBox(video);
    if (state.depth) this.useAtlas(video.videoWidth >= video.videoHeight ? "landscape" : "portrait");

    if (this.freshFrame || video.currentTime !== this.copiedAt || video !== this.copiedFrom) {
      this.freshFrame = false;
      this.copiedAt = video.currentTime;
      this.copiedFrom = video;
      gl.bindTexture(gl.TEXTURE_2D, this.videoTexture);
      try {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
      } catch {
        return;
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneTarget);
      gl.viewport(0, 0, this.sceneSize.w, this.sceneSize.h);
      gl.useProgram(this.sceneProgram);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.videoTexture);
      this.set(this.sceneProgram, "uVideo", (l) => gl.uniform1i(l, 0));
      this.set(this.sceneProgram, "uTarget", (l) => gl.uniform2f(l, this.sceneSize.w, this.sceneSize.h));
      this.set(this.sceneProgram, "uSize", (l) => gl.uniform2f(l, w, h));
      this.set(this.sceneProgram, "uVideoBox", (l) => gl.uniform4f(l, ...box));
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    // The two baked depth frames either side of the video's current time.
    // The two baked depth frames either side of the video's current time, blended, unless a cut (or strobe flash)
    // falls between them: then only the frame from the current side is used, so no other shot's shapes show.
    const meta = this.meta;
    const at = (video.currentTime * meta.fps) % meta.frames;
    const a = Math.floor(at);
    const b = (a + 1) % meta.frames;
    const now = video.currentTime % (meta.frames / meta.fps);
    const cut = meta.cuts.find((time) => time > a / meta.fps && time <= (a + 1) / meta.fps);
    const mix = cut === undefined ? at - a : now < cut ? 0 : 1;
    const cell = (i: number) => {
      const col = i % meta.cols;
      const row = Math.floor(i / meta.cols);
      return [col / meta.cols, row / meta.rows, 1 / meta.cols, 1 / meta.rows] as const;
    };

    const p = this.lightProgram;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTexture);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.depthTexture);
    this.set(p, "uScene", (l) => gl.uniform1i(l, 0));
    this.set(p, "uDepth", (l) => gl.uniform1i(l, 1));
    this.set(p, "uTarget", (l) => gl.uniform2f(l, this.canvas.width, this.canvas.height));
    this.set(p, "uSize", (l) => gl.uniform2f(l, w, h));
    this.set(p, "uVideoBox", (l) => gl.uniform4f(l, ...box));
    this.set(p, "uCellA", (l) => gl.uniform4f(l, ...cell(a)));
    this.set(p, "uCellB", (l) => gl.uniform4f(l, ...cell(b)));
    this.set(p, "uDepthMix", (l) => gl.uniform1f(l, mix));
    this.set(p, "uDepthOn", (l) => gl.uniform1f(l, state.depth && this.depthReady ? 1 : 0));
    this.set(p, "uRaysOn", (l) => gl.uniform1f(l, state.rays ? 1 : 0));
    this.set(p, "uRayGain", (l) => gl.uniform1f(l, state.rayGain ?? 1));
    this.set(p, "uFocus", (l) => gl.uniform1f(l, state.focus ?? 0));
    this.set(p, "uReach", (l) => gl.uniform2f(l, state.reach?.x ?? w, state.reach?.y ?? h));
    this.set(p, "uLight", (l) => gl.uniform1f(l, state.light));
    this.set(p, "uFade", (l) => gl.uniform1f(l, state.fade));
    this.set(p, "uSign", (l) => gl.uniform2f(l, state.centre.x, state.centre.y));
    const letters = new Float32Array(LETTERS * 2);
    state.letters.slice(0, LETTERS).forEach((letter, i) => {
      letters[i * 2] = letter.x;
      letters[i * 2 + 1] = letter.level;
    });
    this.set(p, "uLetters", (l) => gl.uniform2fv(l, letters));
    this.set(p, "uFont", (l) => gl.uniform1f(l, state.fontPx));
    this.set(p, "uTint", (l) => gl.uniform3f(l, TINT[0], TINT[1], TINT[2]));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.canvas.remove();
    this.gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}
