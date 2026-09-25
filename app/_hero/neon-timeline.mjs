/**
 * One timeline for the DOSEN neon wordmark.
 *
 * The CSS tubes (app/globals.css, `neon-ignite-*`, `neon-fault-*`, `neon-settle`, `neon-hum`) and the
 * WebGL sign read the same plan and the same keyframe tables, so either renderer shows every letter
 * at the same level at the same moment and the 3D sign can take over mid-ignition without a seam.
 * Keyframe stops are `[offset 0..1, level]`. They hold until the next stop (CSS `step-end`), except
 * the "warm" ignition, which the CSS runs with linear timing.
 *
 * @typedef {"snap" | "stutter" | "warm" | "stubborn"} NeonIgnition
 * @typedef {"blip" | "dropout"} NeonFaultKind
 * @typedef {[number, number][]} NeonStops
 * @typedef {{ delay: number, duration: number, ignition: NeonIgnition }} NeonTube
 * @typedef {{ index: number, kind: NeonFaultKind, at: number }} NeonFault
 * @typedef {{
 *   still: boolean,
 *   tubes: NeonTube[] | null,
 *   start: number | null,
 *   lit: number | null,
 *   fault: NeonFault | null,
 * }} NeonClock
 *   Times are `performance.now()` milliseconds. `start` is when the CSS ignition began, `lit` when the
 *   sign settled (`is-lit`). `still` means reduced motion: statically lit.
 */

export const NEON_LETTERS = ["D", "O", "S", "E", "N"];

/** Base duration (seconds) of each ignition personality before per-letter jitter. */
export const NEON_IGNITION_SECONDS = { snap: 0.62, stutter: 1.05, warm: 1.3, stubborn: 1.9 };

/** @type {Record<NeonIgnition, NeonStops>} */
export const NEON_IGNITION_KEYFRAMES = {
  snap: [[0, 0], [0.2, 1], [0.28, 0], [0.44, 0.5], [0.5, 0], [0.64, 1], [1, 1]],
  stutter: [[0, 0], [0.08, 0.6], [0.11, 0], [0.22, 1], [0.25, 0], [0.27, 0.35], [0.38, 0], [0.52, 1], [0.56, 0.2], [0.6, 1], [0.71, 0.5], [0.74, 1], [1, 1]],
  warm: [[0, 0], [0.1, 0.15], [0.22, 0.28], [0.3, 0.1], [0.42, 0.38], [0.5, 0.2], [0.6, 0.58], [0.66, 0.3], [0.76, 0.82], [0.8, 0.45], [0.88, 1], [1, 1]],
  stubborn: [[0, 0], [0.06, 0.8], [0.08, 0], [0.12, 0.5], [0.14, 0], [0.44, 1], [0.46, 0], [0.62, 0.4], [0.64, 1], [0.67, 0.2], [0.7, 1], [1, 1]],
};

/** Fault animation length (seconds) and how long the fault class stays on the tube (milliseconds). */
export const NEON_FAULT_SECONDS = { blip: 0.45, dropout: 1.35 };
export const NEON_FAULT_HOLD_MS = { blip: 520, dropout: 1400 };

/** @type {Record<NeonFaultKind, NeonStops>} */
export const NEON_FAULT_KEYFRAMES = {
  blip: [[0, 1], [0.18, 0], [0.3, 1], [0.46, 0.3], [0.58, 1], [1, 1]],
  dropout: [[0, 1], [0.06, 0.2], [0.1, 1], [0.14, 0], [0.62, 0.6], [0.66, 0], [0.78, 1], [0.82, 0.4], [0.86, 1], [1, 1]],
};

/** Whole-sign brightness once lit: a short settle, then a slow irregular mains hum. */
export const NEON_SETTLE_SECONDS = 0.5;
export const NEON_HUM_SECONDS = 9;
/** @type {NeonStops} */
export const NEON_SETTLE_KEYFRAMES = [[0, 1], [0.12, 0.55], [0.2, 1], [1, 1]];
/** @type {NeonStops} */
export const NEON_HUM_KEYFRAMES = [[0, 1], [0.47, 0.9], [0.48, 1], [0.73, 0.95], [0.74, 1], [0.88, 0.93], [0.886, 1], [1, 1]];

/** `is-lit` lands this long after the last tube finishes. */
export const NEON_LIT_DELAY_MS = 80;

const cents = (value) => Math.round(value * 100) / 100;

/**
 * Random order, personality, delay, and duration for each letter. Values are rounded to the
 * hundredths the CSS custom properties carry, so both renderers use identical numbers.
 * @param {() => number} [random]
 * @returns {NeonTube[]}
 */
export function planNeonIgnition(random = Math.random) {
  const order = NEON_LETTERS.map((_, index) => index);
  for (let index = order.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [order[index], order[swap]] = [order[swap], order[index]];
  }

  /** @type {NeonIgnition[]} */
  const casual = ["snap", "stutter", "warm"];
  /** @type {NeonTube[]} */
  const tubes = [];
  let cursor = 0.35 + random() * 0.2;
  order.forEach((letterIndex, rank) => {
    /** @type {NeonIgnition} */
    const ignition = rank === order.length - 1 && random() < 0.7
      ? "stubborn"
      : casual[Math.floor(random() * casual.length)];
    tubes[letterIndex] = {
      delay: cents(cursor),
      duration: cents(NEON_IGNITION_SECONDS[ignition] * (0.85 + random() * 0.3)),
      ignition,
    };
    cursor += 0.12 + random() * 0.26;
  });
  return tubes;
}

/**
 * Seconds from the start of ignition until every tube is fully on.
 * @param {NeonTube[]} tubes
 */
export function neonLitAt(tubes) {
  return Math.max(...tubes.map((tube) => tube.delay + tube.duration));
}

/**
 * Level of a keyframe table at `progress` (0..1).
 * @param {NeonStops} stops
 * @param {number} progress
 * @param {boolean} [linear]
 */
export function sampleNeonStops(stops, progress, linear = false) {
  const p = Math.min(1, Math.max(0, progress));
  let index = 0;
  while (index < stops.length - 2 && stops[index + 1][0] <= p) index += 1;
  const [from, fromLevel] = stops[index];
  const [to, toLevel] = stops[index + 1];
  if (!linear) return p >= to ? toLevel : fromLevel;
  return fromLevel + (toLevel - fromLevel) * (to > from ? (p - from) / (to - from) : 1);
}

/**
 * A tube's level `seconds` after ignition began (`animation-fill-mode: both`).
 * @param {NeonTube} tube
 * @param {number} seconds
 */
export function neonTubeLevel(tube, seconds) {
  if (seconds < tube.delay) return 0;
  const progress = (seconds - tube.delay) / tube.duration;
  if (progress >= 1) return 1;
  return sampleNeonStops(NEON_IGNITION_KEYFRAMES[tube.ignition], progress, tube.ignition === "warm");
}

/**
 * A lit tube's level `seconds` into a fault.
 * @param {NeonFaultKind} kind
 * @param {number} seconds
 */
export function neonFaultLevel(kind, seconds) {
  const duration = NEON_FAULT_SECONDS[kind];
  if (seconds < 0 || seconds >= duration) return 1;
  return sampleNeonStops(NEON_FAULT_KEYFRAMES[kind], seconds / duration);
}

/**
 * Whole-sign brightness `seconds` after the sign settled.
 * @param {number} seconds
 */
export function neonHum(seconds) {
  if (seconds < 0) return 1;
  if (seconds < NEON_SETTLE_SECONDS) return sampleNeonStops(NEON_SETTLE_KEYFRAMES, seconds / NEON_SETTLE_SECONDS);
  const loop = ((seconds - NEON_SETTLE_SECONDS) % NEON_HUM_SECONDS) / NEON_HUM_SECONDS;
  return sampleNeonStops(NEON_HUM_KEYFRAMES, loop);
}

/**
 * Writes every letter's level at time `now` into `out` and returns the whole-sign hum.
 * @param {NeonClock} clock
 * @param {number} now `performance.now()` milliseconds
 * @param {Float32Array | number[]} out
 */
export function readNeonLevels(clock, now, out) {
  const count = Math.min(out.length, NEON_LETTERS.length);
  if (clock.still) {
    for (let index = 0; index < count; index += 1) out[index] = 1;
    return 1;
  }
  const { tubes, start, lit, fault } = clock;
  if (!tubes || start === null) {
    for (let index = 0; index < count; index += 1) out[index] = 0;
    return 1;
  }
  if (lit !== null && now >= lit) {
    for (let index = 0; index < count; index += 1) {
      out[index] = fault && fault.index === index ? neonFaultLevel(fault.kind, (now - fault.at) / 1000) : 1;
    }
    return neonHum((now - lit) / 1000);
  }
  const seconds = (now - start) / 1000;
  for (let index = 0; index < count; index += 1) out[index] = tubes[index] ? neonTubeLevel(tubes[index], seconds) : 1;
  return 1;
}
