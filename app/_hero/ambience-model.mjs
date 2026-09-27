/**
 * How the 3D neon sign reads the hero video behind it.
 *
 * The sign (`app/_hero/neon-ambience.ts`) and the genre ticker (`app/ticker-ambience.ts`) each sample a tiny
 * copy of the current video frame and feed the numbers here. Each effect applies wherever it makes sense and
 * can be switched on or off for testing: in code (`AMBIENCE_DEFAULTS`), from
 * the URL (`?ambience=none`, `?ambience=exposure,hue`, `?ambience=-strobe`), or live from the panel shown
 * with `?ambience-panel`, which remembers its choices in localStorage.
 *
 * @typedef {"exposure" | "hue" | "strobe" | "reflection" | "spill" | "ambilight" | "posters" | "circuit" | "tilt" | "bookend"} AmbienceEffect
 * @typedef {Record<AmbienceEffect, boolean>} AmbienceToggles
 * @typedef {{ x0: number, y0: number, x1: number, y1: number }} SampleRect
 *   Pixel rectangle inside the sampled frame.
 * @typedef {{ luma: number, bandLuma: number, hueX: number, hueY: number }} FrameStats
 *   Mean luma of the whole frame and of the band behind the wordmark (0..1), and the colour-weighted
 *   hue vector of the frame (its angle is the room's hue, its length how strongly coloured it is).
 */

/** @type {readonly { id: AmbienceEffect, group: "room" | "site", label: string, hint: string }[]} */
export const AMBIENCE_EFFECTS = [
  { id: "exposure", group: "room", label: "Auto-exposure", hint: "The sign's brightness, glow and glass clarity, and the ticker's lettering, meter the video." },
  { id: "hue", group: "room", label: "Colour pickup", hint: "The sign's halo, spill and dust and the ticker's tubes lean toward the room's colour (capped at 35°); the letters stay DOSEN blue." },
  { id: "strobe", group: "room", label: "Strobe reaction", hint: "A sudden flash in the video makes the sign sag and letters blip, and the ticker flickers. Off under reduced motion." },
  { id: "reflection", group: "room", label: "Reflections", hint: "The sign's glass reflects a blurred copy of the video, and the ticker's glossy strip mirrors the video above it." },
  { id: "spill", group: "room", label: "Spill adaptation", hint: "The sign's light on the video fades over bright parts of the frame and carries over dark ones." },
  { id: "ambilight", group: "site", label: "Video glow", hint: "A clip you play in the video library or a set's highlights glows around its frame in its own colours." },
  { id: "posters", group: "site", label: "Poster light", hint: "Each performance card glows beneath in its poster's own dominant colour instead of a set tone." },
  { id: "circuit", group: "site", label: "Ticker ignition", hint: "The ticker's tubes power on with a flicker the first time it scrolls into view after the sign is lit." },
  { id: "tilt", group: "site", label: "Cover tilt", hint: "Vinyl covers tilt gently away wherever the cursor is closest, with the artwork drifting slightly in its frame. Mouse only; off under reduced motion." },
  { id: "bookend", group: "site", label: "Bookend sign", hint: "The DOSEN watermark in the Book section is a neon outline that powers on once when you reach it." },
];

export const AMBIENCE_IDS = AMBIENCE_EFFECTS.map((effect) => effect.id);

/** @type {Readonly<AmbienceToggles>} */
export const AMBIENCE_DEFAULTS = {
  exposure: true,
  hue: true,
  strobe: true,
  reflection: true,
  spill: true,
  ambilight: true,
  posters: true,
  circuit: true,
  tilt: true,
  bookend: true,
};

export const AMBIENCE_STORAGE_KEY = "dosen:ambience";

/** Largest hue shift (in turns) the room may push onto the sign's light. */
export const MAX_HUE_SHIFT = 35 / 360;

/**
 * Applies saved panel choices, then the `?ambience=` query, on top of the defaults.
 * Query tokens: `all`/`on`, `none`/`off`, effect ids (only those on), and `-id` (that one off).
 * @param {string | null} query
 * @param {string | null} stored JSON saved by the panel
 * @returns {AmbienceToggles}
 */
export function resolveAmbienceToggles(query, stored) {
  /** @type {AmbienceToggles} */
  const toggles = { ...AMBIENCE_DEFAULTS };
  if (stored) {
    try {
      const saved = JSON.parse(stored);
      for (const id of AMBIENCE_IDS) if (typeof saved?.[id] === "boolean") toggles[id] = saved[id];
    } catch {
      // A corrupt entry just falls back to the defaults.
    }
  }
  if (!query) return toggles;
  const tokens = query.split(",").map((token) => token.trim().toLowerCase()).filter(Boolean);
  if (tokens.some((token) => token === "none" || token === "off")) for (const id of AMBIENCE_IDS) toggles[id] = false;
  if (tokens.some((token) => token === "all" || token === "on")) for (const id of AMBIENCE_IDS) toggles[id] = true;
  const only = tokens.filter((token) => AMBIENCE_IDS.includes(/** @type {AmbienceEffect} */ (token)));
  if (only.length) for (const id of AMBIENCE_IDS) toggles[id] = only.includes(id);
  for (const token of tokens) {
    const id = /** @type {AmbienceEffect} */ (token.slice(1));
    if (token.startsWith("-") && AMBIENCE_IDS.includes(id)) toggles[id] = false;
  }
  return toggles;
}

/**
 * Reduces an RGBA frame to the few numbers the sign reacts to.
 * Bright, saturated pixels (lasers, LED walls) dominate the hue; grey haze barely counts.
 * @param {Uint8ClampedArray | number[]} data
 * @param {number} width
 * @param {number} height
 * @param {SampleRect} band
 * @returns {FrameStats}
 */
export function analyzeFrame(data, width, height, band) {
  let lumaSum = 0;
  let bandSum = 0;
  let bandCount = 0;
  let hueX = 0;
  let hueY = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = data[i] / 255;
      const g = data[i + 1] / 255;
      const b = data[i + 2] / 255;
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      lumaSum += luma;
      const cx = x + 0.5;
      const cy = y + 0.5;
      if (cx >= band.x0 && cx <= band.x1 && cy >= band.y0 && cy <= band.y1) {
        bandSum += luma;
        bandCount += 1;
      }
      const max = Math.max(r, g, b);
      const chroma = max - Math.min(r, g, b);
      if (chroma < 0.04 || max < 0.08) continue;
      let hue;
      if (max === r) hue = ((g - b) / chroma + 6) % 6;
      else if (max === g) hue = (b - r) / chroma + 2;
      else hue = (r - g) / chroma + 4;
      const angle = (hue / 6) * Math.PI * 2;
      const weight = chroma * max;
      hueX += Math.cos(angle) * weight;
      hueY += Math.sin(angle) * weight;
    }
  }
  const count = Math.max(1, width * height);
  const luma = lumaSum / count;
  return { luma, bandLuma: bandCount ? bandSum / bandCount : luma, hueX: hueX / count, hueY: hueY / count };
}

/**
 * The room's hue (0..1 turns) and how strongly it is coloured (0..1).
 * @param {number} hueX
 * @param {number} hueY
 */
export function roomTint(hueX, hueY) {
  const length = Math.hypot(hueX, hueY);
  const hue = ((Math.atan2(hueY, hueX) / (Math.PI * 2)) % 1 + 1) % 1;
  return { hue, strength: Math.min(1, length / 0.08) };
}

/**
 * Leans a base hue toward the room's hue by at most `MAX_HUE_SHIFT`, scaled by strength.
 * @param {number} base hue in turns
 * @param {number} room hue in turns
 * @param {number} strength 0..1
 * @returns {number} the signed shift in turns
 */
export function hueShift(base, room, strength) {
  const delta = ((room - base + 1.5) % 1) - 0.5;
  return Math.max(-MAX_HUE_SHIFT, Math.min(MAX_HUE_SHIFT, delta)) * Math.max(0, Math.min(1, strength));
}

/**
 * How brightly lit the band behind the wordmark is, as an exposure amount 0 (dark) .. 1 (bright).
 * @param {number} bandLuma
 */
export function exposureAmount(bandLuma) {
  const t = Math.max(0, Math.min(1, (bandLuma - 0.06) / (0.45 - 0.06)));
  return t * t * (3 - 2 * t);
}

/**
 * Watches frame luma for strobes: a jump above the slow average fires once, then rests.
 * Returns the flash strength (0..1) on the sample where a strobe starts, otherwise 0.
 * @param {{ threshold?: number, cooldown?: number, rate?: number }} [options]
 */
export function createStrobeDetector({ threshold = 0.06, cooldown = 1.1, rate = 1.2 } = {}) {
  /** @type {number | null} */
  let slow = null;
  let armed = true;
  let until = -Infinity;
  /**
   * @param {number} luma current frame luma
   * @param {number} time seconds
   * @param {number} dt seconds since the previous sample
   */
  return (luma, time, dt) => {
    if (slow === null) {
      slow = luma;
      return 0;
    }
    const flash = luma - slow;
    slow += (luma - slow) * (1 - Math.exp(-rate * Math.max(0, dt)));
    if (flash < threshold * 0.5) armed = true;
    if (!armed || flash <= threshold || time < until) return 0;
    armed = false;
    until = time + cooldown;
    return Math.min(1, flash / (threshold * 3));
  };
}

/**
 * The sign's brightness multiplier after a strobe: a drop, a catch, a second sag, recovery, then a brief surge
 * as the ballast overshoots.
 * @param {number} since seconds since the strobe
 * @param {number} depth 0..1
 */
export function strobeSag(since, depth) {
  if (since < 0 || since > 0.7) return 1;
  if (since < 0.05) return 1 - depth;
  if (since < 0.1) return 1 - depth * 0.1;
  if (since < 0.15) return 1 - depth * 0.7;
  if (since < 0.3) return 1 - depth * 0.7 * Math.exp(-(since - 0.15) * 14);
  return 1 + 0.08 * Math.sin(((since - 0.3) / 0.4) * Math.PI);
}

/**
 * The one letter that blips on a strobe: out briefly, a flicker, back on.
 * @param {number} since seconds since the blip started
 */
export function strobeBlip(since) {
  if (since < 0 || since > 0.2) return 1;
  if (since < 0.07) return 0.12;
  if (since < 0.11) return 0.75;
  if (since < 0.14) return 0.3;
  return 1;
}
