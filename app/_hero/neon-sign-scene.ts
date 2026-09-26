/* The DOSEN wordmark as a real sign: extruded smoked-glass letters that light from the inside,
   composited over the live hero video. The canvas is transparent. Glass darkens the film behind it,
   and every light term (the lit faces, bloom, the per-letter light pools and the dust caught in them)
   is written as premultiplied colour whose coverage is its own brightness, so it lays onto the
   video like a screen blend.
   Letter levels come from the shared neon timeline, so this picks up exactly where the CSS tubes are.
   The sign also reads the video behind it (see ambience-model.mjs): it meters the room's brightness,
   leans its halo toward the room's colour, sags on strobes, reflects the room in its glass and lets
   its spill fade over bright film. Each of those can be switched off independently. */

import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { toCreasedNormals } from "three/addons/utils/BufferGeometryUtils.js";
import {
  AMBIENCE_IDS,
  createStrobeDetector,
  exposureAmount,
  hueShift,
  roomTint,
  strobeBlip,
  strobeSag,
  type AmbienceToggles,
  type FrameStats,
} from "./ambience-model.mjs";
import { VideoAmbience, type AmbienceReading, type Rect } from "./neon-ambience";
import { readNeonLevels, type NeonClock } from "./neon-timeline.mjs";
import { gaussianBlur, traceNeonWordmark, type NeonTrace, type Point } from "./neon-trace";

export type NeonSignOptions = {
  canvas: HTMLCanvasElement;
  /** The hero section: the virtual frame the camera sees, in CSS pixels. */
  section: HTMLElement;
  /** The real, transparent heading text: size authority and glyph positions. */
  text: HTMLElement;
  clock: NeonClock;
  /** The hero video behind the sign (it is replaced when the viewport crosses the mobile breakpoint). */
  video: () => HTMLVideoElement | null;
  /** Live effect switches; the scene reads them every frame. */
  ambience: AmbienceToggles;
  reducedMotion: boolean;
  onReady: () => void;
  /** WebGL went away or cannot keep up: the CSS tubes take back over. */
  onLost: () => void;
};

type DebugPose = { rest?: boolean; pointer?: { x: number; y: number } | null; at?: number };

const FAMILY = '"Ethnocentric", sans-serif';
const FOV = 36;
/** Overscan (CSS px) the camera may travel without exposing the edge of the virtual frame. */
const MARGIN = 140;
/** How far the sign floats off the video plane toward the camera, as a share of camera distance. */
const LIFT = 0.15;
const MAX_LETTERS = 8;

/* Sign construction, in em. */
const DEPTH = 0.1;
const BAND_ABOVE = 1.4;
const BAND_BELOW = 1.05;
const LIGHT_MARGIN = 1.1;
const LIGHT_RES = 32;
/* The soft shadow the old CSS text-shadow cast (7px down, 45px blur, 34% at desktop size). */
const SHADOW_DROP = 0.033;
const SHADOW_SIGMA = 0.1;
const SHADOW_STRENGTH = 0.34;

const VIOLET = new THREE.Color("#2f5bff");
const HOT = new THREE.Color("#2fa8ff");
const CORE = new THREE.Color("#eef7ff");
const DUST = new THREE.Color("#9ad0ff");
const BASE_GLOW_GAIN = 0.19;
const BASE_POOL_GAIN = 0.018;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const damp = (current: number, target: number, rate: number, dt: number) => current + (target - current) * (1 - Math.exp(-rate * dt));
const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/* ---------- shaders ---------- */

const lightGLSL = /* glsl */ `
  uniform sampler2D uLightA;
  uniform sampler2D uLightB;
  uniform vec4 uLightRect;
  uniform vec3 uLevelsA;
  uniform vec3 uLevelsB;
  float neonLight(vec2 uv) {
    return dot(texture2D(uLightA, uv).rgb, uLevelsA) + dot(texture2D(uLightB, uv).rgb, uLevelsB);
  }
`;

const letterVertex = /* glsl */ `
  attribute float aLetter;
  uniform float uLevels[${MAX_LETTERS}];
  varying vec3 vPos;
  varying vec3 vObjectNormal;
  varying vec3 vNormal;
  varying vec3 vView;
  varying float vLevel;
  varying vec3 vAxisX;
  varying vec3 vAxisY;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vAxisX = normalMatrix * vec3(1.0, 0.0, 0.0);
    vAxisY = normalMatrix * vec3(0.0, 1.0, 0.0);
    vView = -mv.xyz;
    vNormal = normalMatrix * normal;
    vObjectNormal = normal;
    vPos = position;
    vLevel = uLevels[int(aLetter + 0.5)];
    gl_Position = projectionMatrix * mv;
  }
`;

const letterFragment = /* glsl */ `
  uniform sampler2D uField;
  uniform vec4 uFieldRect;
  uniform vec3 uViolet;
  uniform vec3 uHot;
  uniform vec3 uCore;
  uniform float uDepth;
  uniform float uExposure;
  uniform float uGlassAlpha;
  uniform vec3 uHaloViolet;
  uniform vec3 uHaloHot;
  uniform sampler2D uRoom;
  uniform vec4 uRoomMap;
  uniform float uReflect;
  varying vec3 vPos;
  varying vec3 vObjectNormal;
  varying vec3 vNormal;
  varying vec3 vView;
  varying float vLevel;
  varying vec3 vAxisX;
  varying vec3 vAxisY;
  float coverageAt(vec2 p) {
    return texture2D(uField, vec2((p.x - uFieldRect.x) * uFieldRect.z, (uFieldRect.y - p.y) * uFieldRect.w)).r;
  }
  void main() {
    vec3 n = normalize(vNormal);
    vec3 v = normalize(vView);
    float cov = coverageAt(vPos.xy);
    float nz = vObjectNormal.z;
    float front = smoothstep(0.95, 0.99, nz);
    float side = 1.0 - smoothstep(0.1, 0.3, nz);
    // The glass lip is shaded rather than modelled: a geometric inset would fold inside
    // Ethnocentric's hairline notches. The coverage slope tilts the lip's normal outward.
    float lip = front * (1.0 - smoothstep(0.5, 0.6, cov));
    vec2 slope = vec2(coverageAt(vPos.xy + vec2(0.004, 0.0)) - coverageAt(vPos.xy - vec2(0.004, 0.0)),
      coverageAt(vPos.xy + vec2(0.0, 0.004)) - coverageAt(vPos.xy - vec2(0.0, 0.004)));
    if (dot(slope, slope) > 1e-6) n = normalize(mix(n, normalize(-vAxisX * slope.x - vAxisY * slope.y), 0.6 * lip));
    float ndv = clamp(dot(n, v), 0.0, 1.0);
    float face = front - lip;
    float bevel = lip + clamp(1.0 - front - side, 0.0, 1.0);
    float along = clamp(1.0 + vPos.z / uDepth, 0.0, 1.0);
    float level = vLevel;

    // Lit: the diffuser burns white-pink down the middle of each stroke and magenta at the edge,
    // the bevelled lip runs hottest, and the returns fade from magenta to violet toward the back.
    float core = smoothstep(0.5, 0.92, cov);
    vec3 faceEmit = mix(uHot * 1.3, uCore * 1.65, core);
    vec3 bevelEmit = mix(uHot * 1.7, uCore * 1.2, 0.3);
    vec3 sideEmit = mix(uViolet * 0.05, uHot * 0.8, along * along * along);
    vec3 emit = (faceEmit * face + bevelEmit * bevel + sideEmit * side) * level * uExposure;

#ifdef GLOW
    // The halo is coloured gas light, not the white-hot core: magenta close in, violet in the returns.
    vec3 halo = mix(uHaloViolet, uHaloHot, 0.3 + 0.5 * face + 0.2 * bevel);
    gl_FragColor = vec4(halo * level * uExposure * (0.42 * face + 0.75 * bevel + 0.4 * side), 1.0);
#else
    // Unlit: smoked violet glass with a faint dead tube down each stroke, a fresnel rim, two glints
    // from fixed lights and a soft overhead sheen that slide across the bevels as the sign moves.
    vec3 r = reflect(-v, n);
    float key = pow(max(dot(r, normalize(vec3(-0.45, 0.7, 0.55))), 0.0), 36.0);
    float kick = pow(max(dot(r, normalize(vec3(0.7, 0.2, 0.68))), 0.0), 80.0);
    float sky = smoothstep(-0.2, 0.95, r.y);
    float fres = pow(1.0 - ndv, 3.0);
    float tube = smoothstep(0.9, 0.99, cov) * face;
    float dark = 1.0 - level;
    vec3 glass = vec3(0.008, 0.012, 0.026) + vec3(0.05, 0.07, 0.1) * tube * dark;
    vec3 sheen = vec3(0.78, 0.85, 0.96) * (key * 0.85 + kick * 0.6) * (0.35 + 0.65 * (1.0 - face))
      + mix(vec3(0.04, 0.05, 0.075), uViolet * 0.1, 0.5) * sky * (0.25 + 0.75 * (1.0 - face));
    vec3 rim = mix(vec3(0.46, 0.54, 0.66), uViolet, 0.45) * fres * 0.5;
    float alpha = mix(0.6, 0.92, 1.0 - face) * uGlassAlpha;
    alpha = mix(alpha, 1.0, face * level);
    vec3 col = glass * alpha + (sheen + rim) * (1.0 - 0.65 * face * level) + emit;
    // The room: a blurred copy of the video, bent by the glass normal, strongest at grazing angles.
    vec2 roomUv = vec2(gl_FragCoord.x * uRoomMap.x + uRoomMap.y, gl_FragCoord.y * uRoomMap.z + uRoomMap.w);
    vec2 bent = roomUv + n.xy * vec2(0.08, 0.13);
    vec3 room = (texture2D(uRoom, clamp(bent, 0.0, 1.0)).rgb * 0.5
      + texture2D(uRoom, clamp(bent + vec2(0.0, 0.05), 0.0, 1.0)).rgb * 0.25
      + texture2D(uRoom, clamp(bent - vec2(0.0, 0.05), 0.0, 1.0)).rgb * 0.25);
    col += room * uReflect * (0.14 + fres * 1.0 + bevel * 0.45 + side * 0.5) * (1.0 - 0.6 * face * level);
    gl_FragColor = vec4(col, alpha);
#endif
  }
`;

const poolVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const poolFragment = /* glsl */ `
  uniform vec3 uViolet;
  uniform vec3 uHot;
  uniform float uGain;
  uniform float uShadow;
  uniform vec2 uShadowShift;
  uniform sampler2D uRoom;
  uniform vec4 uRoomWorld;
  uniform float uSpillAdapt;
  varying vec2 vUv;
  ${lightGLSL}
  void main() {
    float light = neonLight(vUv);
    // Light carries over dark film and washes out where the video is already bright (linear luma).
    vec2 world = uLightRect.xy + vUv * uLightRect.zw;
    vec2 roomUv = clamp(vec2(world.x * uRoomWorld.x + uRoomWorld.y, world.y * uRoomWorld.z + uRoomWorld.w), 0.0, 1.0);
    float roomLuma = dot(texture2D(uRoom, roomUv).rgb, vec3(0.2126, 0.7152, 0.0722));
    float adapt = (1.0 - 0.85 * smoothstep(0.02, 0.2, roomLuma)) * (1.0 + 0.5 * (1.0 - smoothstep(0.002, 0.015, roomLuma)));
    light *= mix(1.0, adapt, uSpillAdapt);
    vec2 e = smoothstep(vec2(0.0), vec2(0.14), vUv) * smoothstep(vec2(0.0), vec2(0.14), 1.0 - vUv);
    float fade = e.x * e.y;
    float shadow = texture2D(uLightA, vUv + uShadowShift).a * uShadow * fade;
    vec3 col = mix(uViolet, uHot, smoothstep(0.35, 1.0, light)) * light * uGain * fade;
    // Premultiplied: the shadow darkens the film, the light adds on top of it.
    gl_FragColor = vec4(col, shadow);
  }
`;

const dustVertex = /* glsl */ `
  attribute float aSeed;
  uniform float uTime;
  uniform float uPixel;
  uniform vec4 uBox;
  varying float vAlpha;
  ${lightGLSL}
  void main() {
    vec3 p = position;
    p.y = fract(p.y + 0.5 + uTime * (0.006 + aSeed * 0.012)) - 0.5;
    p.x += sin(uTime * (0.12 + aSeed * 0.22) + aSeed * 40.0) * 0.01;
    vec3 world = vec3(uBox.xy + p.xy * uBox.zw, p.z);
    vec2 luv = clamp((world.xy - uLightRect.xy) / uLightRect.zw, 0.0, 1.0);
    vec4 mv = modelViewMatrix * vec4(world, 1.0);
    gl_PointSize = uPixel * (1.1 + aSeed * 2.1) * (1100.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
    float edge = smoothstep(0.5, 0.34, abs(p.y)) * smoothstep(0.5, 0.4, abs(p.x));
    float twinkle = 0.55 + 0.45 * sin(uTime * (0.7 + aSeed * 1.3) + aSeed * 90.0);
    vAlpha = neonLight(luv) * edge * twinkle * (0.3 + 0.7 * fract(aSeed * 7.31));
  }
`;

const dustFragment = /* glsl */ `
  uniform vec3 uTint;
  uniform float uGain;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(uTint * a * a * vAlpha * uGain, 0.0);
  }
`;

/* One display pass: add the bloom, roll overexposed neon toward white, encode sRGB, dither. */
const finalShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uGlow: { value: null as THREE.Texture | null },
    uGlowGain: { value: BASE_GLOW_GAIN },
    uSeed: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform sampler2D uGlow;
    uniform float uGlowGain;
    uniform float uSeed;
    varying vec2 vUv;
    float h(vec2 p) { return fract(sin(dot(p + uSeed, vec2(12.9898, 78.233))) * 43758.5453); }
    vec3 encode(vec3 c) {
      c = max(c, 0.0);
      return mix(pow(c, vec3(0.41666)) * 1.055 - 0.055, c * 12.92, vec3(lessThanEqual(c, vec3(0.0031308))));
    }
    void main() {
      vec4 base = texture2D(tDiffuse, vUv);
      vec3 c = base.rgb + texture2D(uGlow, vUv).rgb * uGlowGain;
      float peak = max(c.r, max(c.g, c.b));
      if (peak > 1.0) c = mix(c / peak, vec3(1.0), clamp((peak - 1.0) * 0.6, 0.0, 1.0));
      c = encode(c);
      float present = step(0.0015, base.a + max(c.r, max(c.g, c.b)));
      c += (h(gl_FragCoord.xy) + h(gl_FragCoord.yx + 3.1) - 1.0) / 255.0 * present;
      // Light must stay valid premultiplied colour for the page compositor, so it carries coverage
      // equal to its brightest channel: over the film that reads like a screen blend.
      c = clamp(c, 0.0, 1.0);
      gl_FragColor = vec4(c, max(clamp(base.a, 0.0, 1.0), max(c.r, max(c.g, c.b))));
    }
  `,
};

/* ---------- construction helpers ---------- */

function insidePolygon(p: Point, poly: Point[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function area(poly: Point[]) {
  let sum = 0;
  poly.forEach((p, i) => {
    const q = poly[(i + 1) % poly.length];
    sum += p.x * q.y - q.x * p.y;
  });
  return sum / 2;
}

/** Outer outlines become shapes; outlines nested an odd number of times become their holes. */
function shapesFromLoops(loops: Point[][]) {
  const sorted = [...loops].sort((a, b) => Math.abs(area(b)) - Math.abs(area(a)));
  const shapes: THREE.Shape[] = [];
  const owners: Point[][] = [];
  for (const loop of sorted) {
    const depth = sorted.filter((other) => other !== loop && Math.abs(area(other)) > Math.abs(area(loop)) && insidePolygon(loop[0], other)).length;
    const pts = loop.map((p) => new THREE.Vector2(p.x, p.y));
    if (depth % 2 === 0) {
      shapes.push(new THREE.Shape(pts));
      owners.push(loop);
    } else {
      const owner = owners.findIndex((o) => insidePolygon(loop[0], o));
      if (owner >= 0) shapes[owner].holes.push(new THREE.Path(pts));
    }
  }
  return shapes;
}

function halfTexture(data: Uint16Array, width: number, height: number, format: THREE.PixelFormat) {
  const texture = new THREE.DataTexture(data, width, height, format, THREE.HalfFloatType);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function fieldTexture(trace: NeonTrace) {
  const { data, width, height } = trace.field;
  const half = new Uint16Array(data.length);
  for (let i = 0; i < data.length; i++) half[i] = THREE.DataUtils.toHalfFloat(data[i]);
  return halfTexture(half, width, height, THREE.RedFormat);
}

/** Soft light pools cast by each letter (three letters per RGB texture) plus the drop shadow in A's alpha. */
function lightMaps(trace: NeonTrace, count: number) {
  const res = LIGHT_RES;
  const x0 = trace.ink.minX - LIGHT_MARGIN;
  const y0 = trace.ink.minY - LIGHT_MARGIN;
  const wEm = trace.ink.maxX - trace.ink.minX + LIGHT_MARGIN * 2;
  const hEm = trace.ink.maxY - trace.ink.minY + LIGHT_MARGIN * 2;
  const w = Math.ceil(wEm * res);
  const h = Math.ceil(hEm * res);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  const coverage = (letter: number | null) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    for (const loop of trace.loops) {
      if (letter !== null && loop.letter !== letter) continue;
      loop.points.forEach((p, i) => {
        const x = (p.x - x0) * res;
        const y = h - (p.y - y0) * res;
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      });
      ctx.closePath();
    }
    ctx.fill("evenodd");
    const data = ctx.getImageData(0, 0, w, h).data;
    const out = new Float32Array(w * h);
    for (let i = 0; i < out.length; i++) out[i] = data[i * 4 + 3] / 255;
    return out;
  };
  const fields = Array.from({ length: count }, (_, letter) => {
    const wide = coverage(letter);
    const near = wide.slice();
    gaussianBlur(wide, w, h, 0.42 * res);
    gaussianBlur(near, w, h, 0.1 * res);
    return wide.map((v, i) => v * 2.4 + near[i] * 0.7);
  });
  const shadow = coverage(null);
  gaussianBlur(shadow, w, h, SHADOW_SIGMA * res);
  let peak = 1e-6;
  for (let i = 0; i < w * h; i++) {
    let sum = 0;
    fields.forEach((f) => { sum += f[i]; });
    peak = Math.max(peak, sum);
  }
  const pack = (offset: number, alpha: Float32Array | null) => {
    const data = new Uint16Array(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const src = (h - 1 - y) * w + x;
        const dst = (y * w + x) * 4;
        for (let ch = 0; ch < 3; ch++) {
          const f = fields[offset + ch];
          data[dst + ch] = THREE.DataUtils.toHalfFloat(f ? f[src] / peak : 0);
        }
        data[dst + 3] = THREE.DataUtils.toHalfFloat(alpha ? alpha[src] : 0);
      }
    }
    return halfTexture(data, w, h, THREE.RGBAFormat);
  };
  return { a: pack(0, shadow), b: pack(3, null), rect: { x0, y0, w: wEm, h: hEm } };
}

/* ---------- the scene ---------- */

export class NeonSignScene {
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer;
  private glowComposer: EffectComposer;
  private finalPass: ShaderPass;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(FOV, 1, 1, 10000);
  private sign = new THREE.Group();
  private signInner = new THREE.Group();
  private letterMaterial: THREE.ShaderMaterial;
  private glowMaterial: THREE.ShaderMaterial;
  private pool: THREE.Mesh;
  private dust: THREE.Points;
  private swapped = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  private disposables: { dispose(): void }[] = [];
  private signParts: { dispose(): void }[] = [];
  private observers: { disconnect(): void }[] = [];
  private probe = document.createElement("canvas").getContext("2d")!;
  private trace: NeonTrace | null = null;
  private lightRect = { x0: 0, y0: 0, w: 1, h: 1 };
  private coarse: boolean;
  private dpr = 1;
  private quality = 2;
  private perfTime = 0;
  private perfFrames = 0;

  private w = 1;
  private h = 1;
  private bandTop = 0;
  private bandH = 1;
  private dist = 1000;
  private sectionTop = 0;
  private scroll = 0;
  private last = 0;
  private lastDrawn = 0;
  private readyAt = 0;
  private raf = 0;
  private layoutFrame = 0;
  private running = false;
  private visible = true;
  private readyCalled = false;
  private disposed = false;
  private pointer = new THREE.Vector2();
  private pointerSeen = false;
  private offset = new THREE.Vector2();
  private turn = new THREE.Vector2();
  private raw = new Float32Array(5);
  private levels = new Float32Array(MAX_LETTERS);
  private debugPose: DebugPose | null = null;

  // Ambience: what the sign reads from the video and how it answers.
  private room: VideoAmbience;
  private roomTexture: THREE.CanvasTexture;
  private band: Rect | null = null;
  private stats: FrameStats | null = null;
  private nextSample = 0;
  private lastSample = 0;
  private detectStrobe = createStrobeDetector();
  private strobeAt = 0;
  private strobeDepth = 0;
  private blipLetter = -1;
  private blipSecond = -1;
  private gain = { emit: 1, bloom: 1, pool: 1, glass: 1 };
  private exposure = 0;
  private shift = 0;
  private reflect = 0;
  private spill = 0;
  private baseHsl = { violet: { h: 0, s: 0, l: 0 }, hot: { h: 0, s: 0, l: 0 }, dust: { h: 0, s: 0, l: 0 } };

  private levelUniform = { value: this.levels };
  private lightUniforms: Record<string, THREE.IUniform>;
  private letterUniforms: Record<string, THREE.IUniform>;
  private poolUniforms: Record<string, THREE.IUniform>;
  private dustUniforms: Record<string, THREE.IUniform>;

  static async create(options: NeonSignOptions) {
    const font = `400 100px ${FAMILY}`;
    await document.fonts.load(font);
    // Only ever trace the real typeface: a fallback font would not sit on the DOM glyphs.
    if (!document.fonts.check(font)) throw new Error("Ethnocentric is not available");
    const sign = new NeonSignScene(options);
    try {
      await sign.warmUp();
    } catch (error) {
      sign.dispose();
      throw error;
    }
    return sign;
  }

  private constructor(private options: NeonSignOptions) {
    const renderer = new THREE.WebGLRenderer({
      canvas: options.canvas,
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      stencil: false,
      powerPreference: "default",
      failIfMajorPerformanceCaveat: true,
    });
    if (!renderer.capabilities.isWebGL2) {
      renderer.dispose();
      throw new Error("WebGL2 unavailable");
    }
    this.renderer = renderer;
    this.coarse = window.matchMedia("(pointer: coarse)").matches;
    this.dpr = Math.min(window.devicePixelRatio || 1, this.coarse ? 1.5 : 1.75);
    renderer.setPixelRatio(this.dpr);
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.lightUniforms = {
      uLightA: { value: null },
      uLightB: { value: null },
      uLightRect: { value: new THREE.Vector4(0, 0, 1, 1) },
      uLevelsA: { value: new THREE.Vector3() },
      uLevelsB: { value: new THREE.Vector3() },
    };
    const colors = { uViolet: { value: VIOLET.clone() }, uHot: { value: HOT.clone() }, uCore: { value: CORE.clone() } };
    this.room = new VideoAmbience(options.video, options.section);
    this.roomTexture = this.track(new THREE.CanvasTexture(this.room.canvas));
    this.roomTexture.colorSpace = THREE.SRGBColorSpace;
    this.roomTexture.minFilter = THREE.LinearFilter;
    this.roomTexture.magFilter = THREE.LinearFilter;
    this.roomTexture.generateMipmaps = false;
    const room = { value: this.roomTexture };
    VIOLET.getHSL(this.baseHsl.violet);
    HOT.getHSL(this.baseHsl.hot);
    DUST.getHSL(this.baseHsl.dust);
    this.letterUniforms = {
      ...colors,
      uLevels: this.levelUniform,
      uField: { value: null },
      uFieldRect: { value: new THREE.Vector4() },
      uDepth: { value: DEPTH },
      uExposure: { value: 1 },
      uGlassAlpha: { value: 1 },
      uHaloViolet: { value: VIOLET.clone() },
      uHaloHot: { value: HOT.clone() },
      uRoom: room,
      uRoomMap: { value: new THREE.Vector4() },
      uReflect: { value: 0 },
    };
    this.poolUniforms = {
      ...this.lightUniforms,
      uViolet: { value: VIOLET.clone() },
      uHot: { value: HOT.clone() },
      uGain: { value: BASE_POOL_GAIN },
      uShadow: { value: SHADOW_STRENGTH },
      uShadowShift: { value: new THREE.Vector2() },
      uRoom: room,
      uRoomWorld: { value: new THREE.Vector4() },
      uSpillAdapt: { value: 0 },
    };
    this.dustUniforms = {
      ...this.lightUniforms,
      uTime: { value: 0 },
      uPixel: { value: 1 },
      uBox: { value: new THREE.Vector4() },
      uTint: { value: DUST.clone() },
      uGain: { value: 0.55 },
    };

    // Premultiplied "over": colour already carries its coverage; light is colour without coverage.
    const over = {
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    } as const;
    this.letterMaterial = this.track(new THREE.ShaderMaterial({ uniforms: this.letterUniforms, vertexShader: letterVertex, fragmentShader: letterFragment, ...over }));
    this.glowMaterial = this.track(new THREE.ShaderMaterial({ uniforms: this.letterUniforms, vertexShader: letterVertex, fragmentShader: letterFragment, defines: { GLOW: 1 } }));

    const pool = this.track(new THREE.ShaderMaterial({ uniforms: this.poolUniforms, vertexShader: poolVertex, fragmentShader: poolFragment, depthWrite: false, ...over }));
    this.pool = new THREE.Mesh(this.track(new THREE.PlaneGeometry(1, 1)), pool);
    this.pool.renderOrder = -1;
    this.pool.frustumCulled = false;
    this.pool.userData.glowHide = true;
    this.scene.add(this.pool);

    this.dust = this.buildDust(this.coarse ? 36 : 90);
    this.scene.add(this.dust);
    this.scene.add(this.sign);
    this.sign.add(this.signInner);

    // Glow pass: emitters only, blurred at reduced resolution, added in the final pass.
    this.glowComposer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType }));
    this.glowComposer.renderToScreen = false;
    this.glowComposer.setPixelRatio(this.glowDpr());
    this.glowComposer.addPass(new RenderPass(this.scene, this.camera));
    this.glowComposer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), 0.42, 0.05, 0.0));

    this.composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }));
    this.composer.setPixelRatio(this.dpr);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.finalPass = new ShaderPass(finalShader);
    this.finalPass.uniforms.uGlow.value = this.glowComposer.renderTarget2.texture;
    this.composer.addPass(this.finalPass);

    this.layout(false);
  }

  private track<T extends { dispose(): void }>(item: T) {
    this.disposables.push(item);
    return item;
  }

  private part<T extends { dispose(): void }>(item: T) {
    this.signParts.push(item);
    return item;
  }

  private glowDpr() {
    return Math.min(1, this.dpr * (this.quality === 2 ? 0.5 : 0.38));
  }

  /* ----- construction ----- */

  private buildDust(count: number) {
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = Math.random() - 0.5;
      positions[i * 3 + 1] = Math.random() - 0.5;
      positions[i * 3 + 2] = -40 + Math.random() * 320;
      seeds[i] = Math.random();
    }
    const geometry = this.track(new THREE.BufferGeometry());
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
    const material = this.track(new THREE.ShaderMaterial({
      uniforms: this.dustUniforms,
      vertexShader: dustVertex,
      fragmentShader: dustFragment,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
      blendSrcAlpha: THREE.ZeroFactor,
      blendDstAlpha: THREE.OneFactor,
    }));
    const dust = new THREE.Points(geometry, material);
    dust.frustumCulled = false;
    dust.renderOrder = 1;
    dust.userData.glowHide = true;
    dust.visible = !this.options.reducedMotion;
    return dust;
  }

  private buildSign(trace: NeonTrace) {
    this.signParts.forEach((d) => d.dispose());
    this.signParts = [];
    this.signInner.clear();
    const count = Math.min(MAX_LETTERS, trace.letters.length);

    const f = trace.field;
    this.letterUniforms.uField.value = this.part(fieldTexture(trace));
    (this.letterUniforms.uFieldRect.value as THREE.Vector4).set(f.x0, f.y0, f.scale / f.width, f.scale / f.height);

    for (let i = 0; i < count; i++) {
      const shapes = shapesFromLoops(trace.loops.filter((l) => l.letter === i).map((l) => l.points));
      if (!shapes.length) continue;
      const extruded = new THREE.ExtrudeGeometry(shapes, { depth: DEPTH, bevelEnabled: false, curveSegments: 1 });
      // Front face at z = 0 (on the DOM glyph), body extending back.
      extruded.translate(0, 0, -DEPTH);
      // Smooth the facets of curved returns but keep every real corner and the bevel steps crisp.
      // (Scaled up first: the crease pass welds positions on a 0.01 grid.)
      extruded.scale(100, 100, 100);
      const geometry = this.part(toCreasedNormals(extruded, THREE.MathUtils.degToRad(34)));
      if (geometry !== extruded) extruded.dispose();
      geometry.scale(0.01, 0.01, 0.01);
      geometry.deleteAttribute("uv");
      geometry.setAttribute("aLetter", new THREE.BufferAttribute(new Float32Array(geometry.getAttribute("position").count).fill(i), 1));
      const letter = new THREE.Mesh(geometry, this.letterMaterial);
      letter.userData.glow = this.glowMaterial;
      this.signInner.add(letter);
    }
    const cx = (trace.ink.minX + trace.ink.maxX) / 2;
    const cy = (trace.ink.minY + trace.ink.maxY) / 2;
    this.signInner.position.set(-cx, -cy, 0);

    const light = lightMaps(trace, count);
    this.lightUniforms.uLightA.value = this.part(light.a);
    this.lightUniforms.uLightB.value = this.part(light.b);
    this.lightRect = light.rect;
    (this.poolUniforms.uShadowShift.value as THREE.Vector2).set(0, SHADOW_DROP / light.rect.h);
    this.trace = trace;
  }

  private async warmUp() {
    const { renderer, scene, camera } = this;
    await renderer.compileAsync(scene, camera);
    this.swapToGlow();
    await renderer.compileAsync(scene, camera);
    this.restore();
    if (this.disposed) return;
    this.bindEvents();
    this.last = performance.now();
    this.draw(this.last, 0);
    this.syncRunning();
  }

  /* ----- input & layout ----- */

  private bindEvents() {
    window.addEventListener("pointermove", this.onPointer, { passive: true });
    window.addEventListener("scroll", this.onScroll, { passive: true });
    document.addEventListener("visibilitychange", this.syncRunning);
    this.options.canvas.addEventListener("webglcontextlost", this.onContextLost);
    const resize = new ResizeObserver(this.queueLayout);
    resize.observe(this.options.section);
    resize.observe(this.options.text);
    const seen = new IntersectionObserver(([entry]) => {
      this.visible = entry.isIntersecting;
      this.syncRunning();
    });
    seen.observe(this.options.canvas);
    this.observers.push(resize, seen);
    this.onScroll();
  }

  private onPointer = (event: PointerEvent) => {
    if (event.pointerType !== "mouse") return;
    this.pointerSeen = true;
    this.pointer.set((event.clientX / window.innerWidth) * 2 - 1, (event.clientY / window.innerHeight) * 2 - 1);
  };

  private onScroll = () => {
    this.scroll = Math.max(0, window.scrollY - this.sectionTop);
  };

  private onContextLost = (event: Event) => {
    event.preventDefault();
    this.stop();
    this.options.onLost();
  };

  private queueLayout = () => {
    cancelAnimationFrame(this.layoutFrame);
    this.layoutFrame = requestAnimationFrame(() => this.layout(true));
  };

  /** Glyph pen positions (em) exactly as the DOM laid them out, kerning and letter-spacing included. */
  private measureOrigins(fontPx: number) {
    const node = this.options.text.firstChild;
    const text = node?.textContent ?? "";
    const range = document.createRange();
    if (!node || !text) return { text, origins: [] as number[] };
    range.selectNodeContents(this.options.text);
    const left = range.getBoundingClientRect().left;
    const origins = [...text].map((_, i) => {
      range.setStart(node, i);
      range.setEnd(node, i + 1);
      return (range.getBoundingClientRect().left - left) / fontPx;
    });
    return { text, origins };
  }

  private layout(draw: boolean) {
    if (this.disposed) return;
    const { section, text, canvas } = this.options;
    const w = Math.max(1, section.clientWidth);
    const h = Math.max(1, section.clientHeight);
    const fontPx = parseFloat(getComputedStyle(text).fontSize) || 100;
    const measured = this.measureOrigins(fontPx);
    if (!measured.text) return;
    const stale = !this.trace
      || this.trace.text !== measured.text
      || measured.origins.some((o, i) => Math.abs(o - (this.trace?.origins[i] ?? 0)) > 0.002);
    if (stale) this.buildSign(traceNeonWordmark(measured.text, FAMILY, measured.origins));
    const trace = this.trace!;

    // The DOM text box starts at the first pen position; the baseline sits one font ascent down.
    const frame = section.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(text);
    const box = range.getBoundingClientRect();
    this.probe.font = `400 ${fontPx}px ${FAMILY}`;
    const ascent = this.probe.measureText(measured.text).fontBoundingBoxAscent;
    const penX = box.left - frame.left;
    const baseY = box.top - frame.top + ascent;

    // Only a band around the wordmark is drawn; the edges fade out in CSS.
    const top = clamp(Math.floor(baseY - (trace.ink.maxY + BAND_ABOVE) * fontPx), 0, h - 1);
    const bottom = clamp(Math.ceil(baseY - (trace.ink.minY - BAND_BELOW) * fontPx), top + 1, h);
    if (top !== this.bandTop || bottom - top !== this.bandH || w !== this.w || !canvas.style.height) {
      canvas.style.top = `${top}px`;
      canvas.style.height = `${bottom - top}px`;
    }
    this.w = w;
    this.h = h;
    this.bandTop = top;
    this.bandH = bottom - top;
    this.renderer.setSize(w, this.bandH, false);
    this.composer.setSize(w, this.bandH);
    this.glowComposer.setSize(w, this.bandH);

    // World units are CSS px on the video plane (z = 0), origin at the section centre, y up.
    this.dist = h / 2 / Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const signZ = this.dist * LIFT;
    const k = (this.dist - signZ) / this.dist;
    const ox = penX - w / 2;
    const oy = h / 2 - baseY;
    const cx = (trace.ink.minX + trace.ink.maxX) / 2;
    const cy = (trace.ink.minY + trace.ink.maxY) / 2;
    // Floated toward the camera and scaled down to compensate: at rest the front faces land on the DOM glyphs.
    this.sign.position.set((ox + cx * fontPx) * k, (oy + cy * fontPx) * k, signZ);
    this.sign.scale.setScalar(fontPx * k);

    const r = this.lightRect;
    this.pool.position.set(ox + (r.x0 + r.w / 2) * fontPx, oy + (r.y0 + r.h / 2) * fontPx, 0);
    this.pool.scale.set(r.w * fontPx, r.h * fontPx, 1);
    (this.lightUniforms.uLightRect.value as THREE.Vector4).set(ox + r.x0 * fontPx, oy + r.y0 * fontPx, r.w * fontPx, r.h * fontPx);
    (this.dustUniforms.uBox.value as THREE.Vector4).set(
      ox + cx * fontPx,
      oy + cy * fontPx,
      (trace.ink.maxX - trace.ink.minX + 1.2) * fontPx,
      (trace.ink.maxY - trace.ink.minY + 1.3) * fontPx,
    );
    this.dustUniforms.uPixel.value = this.renderer.getPixelRatio() * clamp(fontPx / 200, 0.55, 1.2);

    // The area behind the wordmark that the exposure meters, in section CSS px.
    this.band = {
      left: penX + (trace.ink.minX - 0.15) * fontPx,
      right: penX + (trace.ink.maxX + 0.15) * fontPx,
      top: baseY - (trace.ink.maxY + 0.2) * fontPx,
      bottom: baseY - (trace.ink.minY - 0.2) * fontPx,
    };
    this.updateRoomMaps();

    this.sectionTop = frame.top + window.scrollY;
    this.onScroll();
    this.updateCamera();
    if (draw && (!this.running || this.options.reducedMotion)) this.draw(performance.now(), 0);
  }

  private updateCamera() {
    const { w, h, dist } = this;
    const ox = clamp(this.offset.x, -MARGIN + 4, MARGIN - 4);
    const oy = clamp(this.offset.y, -MARGIN + 4, MARGIN - 4);
    const fullW = w + MARGIN * 2;
    const fullH = h + MARGIN * 2;
    this.camera.position.set(ox, oy, dist);
    this.camera.aspect = fullW / fullH;
    this.camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(fullH / 2 / dist));
    this.camera.near = dist * 0.05;
    this.camera.far = dist * 4;
    // Keep the video plane pinned while the camera moves; only the band is rendered.
    this.camera.setViewOffset(fullW, fullH, MARGIN - ox, MARGIN + oy + this.bandTop, w, this.bandH);
    this.camera.updateProjectionMatrix();
  }

  /* ----- loop ----- */

  private syncRunning = () => {
    if (this.disposed) return;
    const run = this.visible && document.visibilityState === "visible" && !this.options.reducedMotion && !this.debugPose;
    if (run && !this.running) {
      this.running = true;
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.frame);
    } else if (!run && this.running) {
      this.running = false;
      cancelAnimationFrame(this.raf);
    }
  };

  private stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    cancelAnimationFrame(this.layoutFrame);
  }

  private frame = (now: number) => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.frame);
    const raw = Math.max(0, (now - this.last) / 1000);
    this.last = now;
    this.watchPerformance(raw);
    // Phones draw at up to ~30 fps; the flicker tables step far slower than that.
    if (this.coarse && now - this.lastDrawn < 31) return;
    const dt = Math.min(1 / 20, (now - (this.lastDrawn || now)) / 1000);
    this.lastDrawn = now;
    this.draw(now, dt);
  };

  private watchPerformance(frame: number) {
    if (!this.readyAt || performance.now() - this.readyAt < 2500 || frame > 0.25) return;
    this.perfTime += frame;
    this.perfFrames += 1;
    if (this.perfFrames < 90) return;
    const average = this.perfTime / this.perfFrames;
    this.perfTime = 0;
    this.perfFrames = 0;
    if (average < 1 / 45) return;
    if (this.quality === 2) {
      // First step: fewer pixels and a cheaper bloom.
      this.quality = 1;
      this.dpr = Math.min(this.dpr, 1);
      this.renderer.setPixelRatio(this.dpr);
      this.composer.setPixelRatio(this.dpr);
      this.glowComposer.setPixelRatio(this.glowDpr());
      this.layout(false);
    } else {
      // Still slow: the CSS tubes are in sync, so hand the sign back to them.
      this.stop();
      this.options.onLost();
    }
  }

  /* ----- per frame ----- */

  private draw(now: number, dt: number) {
    const { reducedMotion, clock } = this.options;
    const pose = this.debugPose;
    const at = pose?.at !== undefined && clock.start !== null ? clock.start + pose.at * 1000 : now;
    const hum = readNeonLevels(clock, at, this.raw);
    const t = now / 1000;
    const count = Math.min(this.raw.length, MAX_LETTERS);
    const { sag, blip, blipSecond } = this.updateAmbience(now, dt);
    let sum = 0;
    for (let i = 0; i < count; i++) {
      let level = this.raw[i];
      // A faint mains shimmer and the CSS hum ride on the gas, never on the glass.
      if (!reducedMotion && level > 0) level *= hum * (0.988 + 0.012 * Math.sin(t * 47 + i * 2.3) * Math.sin(t * 2.9 + i * 1.1));
      if (level > 0) level *= sag * (i === this.blipLetter ? blip : i === this.blipSecond ? blipSecond : 1);
      this.levels[i] = level;
      sum += level;
    }
    (this.lightUniforms.uLevelsA.value as THREE.Vector3).set(this.levels[0], this.levels[1], this.levels[2]);
    (this.lightUniforms.uLevelsB.value as THREE.Vector3).set(this.levels[3], this.levels[4], this.levels[5]);
    this.dustUniforms.uTime.value = t % 1000;
    this.dust.visible = !reducedMotion && sum > 0.01;
    this.finalPass.uniforms.uSeed.value = reducedMotion ? 0 : t % 1;

    if (reducedMotion || pose?.rest) {
      this.offset.set(0, 0);
      this.turn.set(0, 0);
      this.sign.rotation.set(0, 0, 0);
    } else {
      if (pose?.pointer) {
        this.pointerSeen = true;
        this.pointer.set(pose.pointer.x, pose.pointer.y);
      }
      // Motion eases in from rest, so the hand-off from the CSS tubes is exact.
      const presence = this.readyAt ? smoothstep(0, 2.4, (now - this.readyAt) / 1000) : 0;
      const driftX = Math.sin(t * 0.23) * 0.5 + Math.sin(t * 0.61 + 1.3) * 0.14;
      const driftY = Math.cos(t * 0.17) * 0.36;
      const px = this.pointerSeen ? this.pointer.x * 0.85 + driftX * 0.15 : driftX;
      const py = this.pointerSeen ? this.pointer.y * 0.85 + driftY * 0.15 : driftY;
      const scroll = Math.min(this.scroll, this.h) / this.h;
      const step = pose ? 1 : dt;
      const rate = pose ? 60 : 1;
      // The camera orbits with the pointer and the sign leans the other way, opening up its returns.
      this.offset.x = damp(this.offset.x, presence * px * 48, 2.4 * rate, step);
      this.offset.y = damp(this.offset.y, presence * (-py * 26 - scroll * 70), 2.8 * rate, step);
      this.turn.x = damp(this.turn.x, presence * -px * 0.055, 2 * rate, step);
      this.turn.y = damp(this.turn.y, presence * (-py * 0.04 + scroll * 0.12), 2 * rate, step);
      this.sign.rotation.set(this.turn.y, this.turn.x, presence * Math.sin(t * 0.41) * 0.0035);
    }
    this.updateCamera();
    this.render();

    if (!this.readyCalled) {
      this.readyCalled = true;
      this.readyAt = now;
      this.options.onReady();
    }
  }

  /** Samples the video on its own cadence and eases every ambience response toward its target. */
  private updateAmbience(now: number, dt: number) {
    const toggles = this.options.ambience;
    const reducedMotion = this.options.reducedMotion;
    const step = dt > 0 ? dt : 1 / 60;
    if (this.band && now >= this.nextSample && AMBIENCE_IDS.some((id) => toggles[id])) {
      this.nextSample = now + (this.coarse ? 100 : 66);
      const stats = this.room.sample(this.band);
      if (stats) {
        const gap = this.lastSample ? (now - this.lastSample) / 1000 : 0;
        this.lastSample = now;
        this.stats = stats;
        this.roomTexture.needsUpdate = true;
        this.updateRoomMaps();
        const hit = this.detectStrobe(stats.luma, now / 1000, gap);
        if (hit > 0 && toggles.strobe && !reducedMotion) {
          this.strobeAt = now;
          this.strobeDepth = 0.3 + 0.45 * hit;
          const letters = Math.min(this.raw.length, MAX_LETTERS);
          this.blipLetter = Math.floor(Math.random() * letters);
          this.blipSecond = Math.random() < 0.4 ? (this.blipLetter + 1 + Math.floor(Math.random() * (letters - 1))) % letters : -1;
        }
      }
    }
    const stats = this.stats;

    // 1. Auto-exposure: a brighter room gets a hotter core, stronger bloom and clearer glass.
    this.exposure = stats ? exposureAmount(stats.bandLuma) : 0;
    const metered = toggles.exposure && !!stats;
    const e = this.exposure;
    this.gain.emit = damp(this.gain.emit, metered ? lerp(0.84, 1.4, e) : 1, 4, step);
    this.gain.bloom = damp(this.gain.bloom, metered ? lerp(0.7, 1.6, e) : 1, 4, step);
    this.gain.pool = damp(this.gain.pool, metered ? lerp(0.8, 1.35, e) : 1, 4, step);
    this.gain.glass = damp(this.gain.glass, metered ? lerp(1, 0.66, e) : 1, 4, step);
    this.letterUniforms.uExposure.value = this.gain.emit;
    this.letterUniforms.uGlassAlpha.value = this.gain.glass;
    this.finalPass.uniforms.uGlowGain.value = BASE_GLOW_GAIN * this.gain.bloom;
    this.poolUniforms.uGain.value = BASE_POOL_GAIN * this.gain.pool;

    // 2. Colour pickup: halo, spill and dust lean toward the room's hue; the letters stay blue.
    const tint = stats ? roomTint(stats.hueX, stats.hueY) : null;
    const target = toggles.hue && tint ? hueShift(this.baseHsl.hot.h, tint.hue, tint.strength) : 0;
    this.shift = damp(this.shift, target, 2.2, step);
    const { violet, hot, dust } = this.baseHsl;
    const turn = (h: number) => ((h + this.shift) % 1 + 1) % 1;
    (this.letterUniforms.uHaloViolet.value as THREE.Color).setHSL(turn(violet.h), violet.s, violet.l);
    (this.letterUniforms.uHaloHot.value as THREE.Color).setHSL(turn(hot.h), hot.s, hot.l);
    (this.poolUniforms.uViolet.value as THREE.Color).setHSL(turn(violet.h), violet.s, violet.l);
    (this.poolUniforms.uHot.value as THREE.Color).setHSL(turn(hot.h), hot.s, hot.l);
    (this.dustUniforms.uTint.value as THREE.Color).setHSL(turn(dust.h), dust.s, dust.l);

    // 4 and 5. Reflections and spill adaptation fade in and out rather than switching.
    this.reflect = damp(this.reflect, toggles.reflection && stats ? 1 : 0, 4, step);
    this.spill = damp(this.spill, toggles.spill && stats ? 1 : 0, 4, step);
    this.letterUniforms.uReflect.value = this.reflect * 1.25;
    this.poolUniforms.uSpillAdapt.value = this.spill;

    // 3. Strobe reaction: the whole sign sags and one letter blips.
    if (!toggles.strobe || reducedMotion || !this.strobeAt) return { sag: 1, blip: 1, blipSecond: 1 };
    const since = (now - this.strobeAt) / 1000;
    return { sag: strobeSag(since, this.strobeDepth), blip: strobeBlip(since - 0.03), blipSecond: strobeBlip(since - 0.09) };
  }

  /** Maps screen fragments (letters) and video-plane points (spill) to the sampled video frame. */
  private updateRoomMaps() {
    const box = this.room.box;
    if (!box) return;
    const dpr = this.dpr;
    (this.letterUniforms.uRoomMap.value as THREE.Vector4).set(
      1 / (dpr * box.w),
      -box.x0 / box.w,
      1 / (dpr * box.h),
      1 - (this.bandTop + this.bandH - box.y0) / box.h,
    );
    (this.poolUniforms.uRoomWorld.value as THREE.Vector4).set(
      1 / box.w,
      (this.w / 2 - box.x0) / box.w,
      1 / box.h,
      1 - (this.h / 2 - box.y0) / box.h,
    );
  }

  /** What the sign currently reads from the room, for the testing panel. */
  readAmbience(): AmbienceReading {
    const stats = this.stats;
    const tint = stats ? roomTint(stats.hueX, stats.hueY) : { hue: 0, strength: 0 };
    return {
      sampling: this.room.available && !!stats,
      luma: stats?.luma ?? 0,
      bandLuma: stats?.bandLuma ?? 0,
      hue: tint.hue,
      strength: tint.strength,
      exposure: this.exposure,
      shiftDegrees: this.shift * 360,
      strobeAgo: this.strobeAt ? (performance.now() - this.strobeAt) / 1000 : Infinity,
    };
  }

  private swapToGlow() {
    this.scene.traverse((object) => {
      if (object.userData.glowHide) {
        object.userData.wasVisible = object.visible;
        object.visible = false;
        return;
      }
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh || !mesh.userData.glow) return;
      this.swapped.set(mesh, mesh.material);
      mesh.material = mesh.userData.glow as THREE.Material;
    });
  }

  private restore() {
    this.swapped.forEach((material, mesh) => { mesh.material = material; });
    this.swapped.clear();
    this.scene.traverse((object) => {
      if (object.userData.glowHide) object.visible = object.userData.wasVisible !== false;
    });
  }

  private render() {
    this.swapToGlow();
    this.glowComposer.render();
    this.restore();
    this.composer.render();
  }

  /* ----- development aids ----- */

  /** Renders one deterministic frame: `rest` is the registered pose, `at` is seconds into ignition. */
  debugRender(pose: DebugPose = {}) {
    this.debugPose = pose;
    this.syncRunning();
    const now = performance.now();
    for (let i = 0; i < (pose.rest ? 1 : 90); i++) this.draw(now, 1 / 60);
  }

  debugResume() {
    this.debugPose = null;
    this.syncRunning();
  }

  /** Screen rectangle (viewport px) of the front-face ink at the current pose. */
  debugInk() {
    const trace = this.trace;
    if (!trace) return null;
    this.sign.updateMatrixWorld(true);
    const rect = this.options.canvas.getBoundingClientRect();
    const xs: number[] = [];
    const ys: number[] = [];
    for (const loop of trace.loops) {
      for (const p of loop.points) {
        const v = new THREE.Vector3(p.x, p.y, 0).applyMatrix4(this.signInner.matrixWorld).project(this.camera);
        xs.push(rect.left + ((v.x + 1) / 2) * rect.width);
        ys.push(rect.top + ((1 - v.y) / 2) * rect.height);
      }
    }
    return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.stop();
    window.removeEventListener("pointermove", this.onPointer);
    window.removeEventListener("scroll", this.onScroll);
    document.removeEventListener("visibilitychange", this.syncRunning);
    this.options.canvas.removeEventListener("webglcontextlost", this.onContextLost);
    this.observers.forEach((o) => o.disconnect());
    this.signParts.forEach((d) => d.dispose());
    this.disposables.forEach((d) => d.dispose());
    this.composer.dispose();
    this.glowComposer.dispose();
    this.glowComposer.passes.forEach((pass) => pass.dispose());
    this.composer.passes.forEach((pass) => pass.dispose());
    this.renderer.dispose();
  }
}
