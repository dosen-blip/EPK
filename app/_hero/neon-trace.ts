/* Traces the DOSEN wordmark from the browser's own rendering of Ethnocentric.
   Each glyph is drawn by the canvas font engine at the exact pen position the DOM laid it out at
   (kerning and letter-spacing included), and the outline is the half-coverage iso-line of the
   anti-aliased glyph with no pre-blur, so Ethnocentric's sharp corners survive. Straight runs are
   then simplified to single segments. A separately blurred coverage field shades the letter faces. */

export type Point = { x: number; y: number };
export type NeonLoop = { points: Point[]; letter: number };
export type NeonTrace = {
  text: string;
  letters: string[];
  /** Pen position of each glyph in em, relative to the first. */
  origins: number[];
  loops: NeonLoop[];
  /** Ink bounds in em, origin at the first glyph's pen position on the baseline, y up. */
  ink: { minX: number; maxX: number; minY: number; maxY: number };
  /** Stroke coverage blurred across the stroke (0.5 at the edge, ~1 down the middle). */
  field: { data: Float32Array; width: number; height: number; x0: number; y0: number; scale: number };
};

const TRACE_SIZE = 320;
/** Maximum deviation (em) when collapsing straight runs; ~0.2 CSS px at desktop size. */
const SIMPLIFY = 0.0009;
const FIELD_SIGMA = 0.03;

function boxBlur(src: Float32Array, dst: Float32Array, w: number, h: number, r: number, horizontal: boolean) {
  const span = r * 2 + 1;
  const outer = horizontal ? h : w;
  const inner = horizontal ? w : h;
  const stride = horizontal ? 1 : w;
  for (let o = 0; o < outer; o++) {
    const base = horizontal ? o * w : o;
    let sum = 0;
    for (let i = -r; i <= r; i++) sum += src[base + Math.min(inner - 1, Math.max(0, i)) * stride];
    for (let i = 0; i < inner; i++) {
      dst[base + i * stride] = sum / span;
      const add = Math.min(inner - 1, i + r + 1);
      const remove = Math.max(0, i - r);
      sum += src[base + add * stride] - src[base + remove * stride];
    }
  }
}

/** Three box passes approximate a Gaussian with the given sigma (pixels). */
export function gaussianBlur(field: Float32Array, w: number, h: number, sigma: number) {
  const r = Math.max(1, Math.round((Math.sqrt(4 * sigma * sigma + 1) - 1) / 2));
  const tmp = new Float32Array(field.length);
  for (let pass = 0; pass < 3; pass++) {
    boxBlur(field, tmp, w, h, r, true);
    boxBlur(tmp, field, w, h, r, false);
  }
}

function marchingSquares(f: Float32Array, w: number, h: number, t: number): Point[][] {
  const points = new Map<number, Point>();
  const links = new Map<number, number[]>();
  const hEdge = (x: number, y: number) => (y * w + x) * 2;
  const vEdge = (x: number, y: number) => (y * w + x) * 2 + 1;
  const lerp = (a: number, b: number) => (t - a) / (b - a || 1e-6);
  const link = (a: number, b: number) => {
    (links.get(a) ?? links.set(a, []).get(a)!).push(b);
    (links.get(b) ?? links.set(b, []).get(b)!).push(a);
  };
  for (let y = 0; y < h - 1; y++) {
    for (let x = 0; x < w - 1; x++) {
      const a = f[y * w + x];
      const b = f[y * w + x + 1];
      const c = f[(y + 1) * w + x + 1];
      const d = f[(y + 1) * w + x];
      const index = (a > t ? 8 : 0) | (b > t ? 4 : 0) | (c > t ? 2 : 0) | (d > t ? 1 : 0);
      if (index === 0 || index === 15) continue;
      const top = hEdge(x, y);
      const bottom = hEdge(x, y + 1);
      const left = vEdge(x, y);
      const right = vEdge(x + 1, y);
      const put = (id: number) => {
        if (points.has(id)) return;
        if (id === top) points.set(id, { x: x + lerp(a, b), y });
        else if (id === bottom) points.set(id, { x: x + lerp(d, c), y: y + 1 });
        else if (id === left) points.set(id, { x, y: y + lerp(a, d) });
        else points.set(id, { x: x + 1, y: y + lerp(b, c) });
      };
      const seg = (p: number, q: number) => {
        put(p);
        put(q);
        link(p, q);
      };
      const centre = (a + b + c + d) / 4 > t;
      switch (index) {
        case 1: case 14: seg(left, bottom); break;
        case 2: case 13: seg(bottom, right); break;
        case 3: case 12: seg(left, right); break;
        case 4: case 11: seg(top, right); break;
        case 6: case 9: seg(top, bottom); break;
        case 7: case 8: seg(left, top); break;
        case 5:
          if (centre) { seg(left, top); seg(bottom, right); } else { seg(top, right); seg(left, bottom); }
          break;
        case 10:
          if (centre) { seg(top, right); seg(left, bottom); } else { seg(left, top); seg(bottom, right); }
          break;
      }
    }
  }
  const loops: Point[][] = [];
  const seen = new Set<number>();
  for (const start of links.keys()) {
    if (seen.has(start)) continue;
    const loop: Point[] = [];
    let prev = -1;
    let current = start;
    while (!seen.has(current)) {
      seen.add(current);
      loop.push(points.get(current)!);
      const next = (links.get(current) ?? []).find((n) => n !== prev && !seen.has(n));
      if (next === undefined) break;
      prev = current;
      current = next;
    }
    if (loop.length > 8) loops.push(loop);
  }
  return loops;
}

function perimeter(points: Point[]) {
  let total = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return total;
}

function segmentDistance(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len)) : 0;
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}

/** Ramer-Douglas-Peucker on an open run, iterative. */
function simplifyRun(points: Point[], tolerance: number) {
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [from, to] = stack.pop()!;
    let worst = 0;
    let index = -1;
    for (let i = from + 1; i < to; i++) {
      const d = segmentDistance(points[i], points[from], points[to]);
      if (d > worst) {
        worst = d;
        index = i;
      }
    }
    if (index >= 0 && worst > tolerance) {
      keep[index] = 1;
      stack.push([from, index], [index, to]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/** Splits the closed loop at two far-apart points so both halves simplify independently. */
function simplifyLoop(points: Point[], tolerance: number) {
  let far = 0;
  let best = 0;
  points.forEach((p, i) => {
    const d = Math.hypot(p.x - points[0].x, p.y - points[0].y);
    if (d > best) {
      best = d;
      far = i;
    }
  });
  const first = simplifyRun(points.slice(0, far + 1), tolerance);
  const second = simplifyRun([...points.slice(far), points[0]], tolerance);
  return [...first, ...second.slice(1, -1)];
}

/**
 * @param text the wordmark as rendered, e.g. "DOSEN"
 * @param family the CSS font-family list the heading uses
 * @param origins each glyph's pen position in em relative to the first, measured from the DOM
 */
export function traceNeonWordmark(text: string, family: string, origins: number[]): NeonTrace {
  const size = TRACE_SIZE;
  const font = `400 ${size}px ${family}`;
  const letters = [...text];
  const probe = document.createElement("canvas").getContext("2d")!;
  probe.font = font;
  const metrics = letters.map((letter) => probe.measureText(letter));
  const ascent = Math.max(...metrics.map((m) => m.actualBoundingBoxAscent));
  const descent = Math.max(...metrics.map((m) => m.actualBoundingBoxDescent));
  const left = Math.min(...metrics.map((m, i) => origins[i] * size - m.actualBoundingBoxLeft));
  const right = Math.max(...metrics.map((m, i) => origins[i] * size + m.actualBoundingBoxRight));
  const pad = Math.ceil(size * 0.12);
  const w = Math.ceil(right - left) + pad * 2;
  const h = Math.ceil(ascent + descent) + pad * 2;
  const ox = pad - left;
  const oy = pad + ascent;

  // A transparent surface keeps the glyphs on greyscale anti-aliasing (no LCD fringes).
  const surface = document.createElement("canvas");
  surface.width = w;
  surface.height = h;
  const ctx = surface.getContext("2d", { willReadFrequently: true })!;
  ctx.clearRect(0, 0, w, h);
  ctx.font = font;
  ctx.fillStyle = "#fff";
  ctx.textBaseline = "alphabetic";
  letters.forEach((letter, i) => ctx.fillText(letter, ox + origins[i] * size, oy));
  const rgba = ctx.getImageData(0, 0, w, h).data;
  const coverage = new Float32Array(w * h);
  for (let i = 0; i < coverage.length; i++) coverage[i] = rgba[i * 4 + 3] / 255;

  const loops: NeonLoop[] = [];
  for (const raw of marchingSquares(coverage, w, h, 0.5)) {
    // Sample (i, j) is the centre of canvas pixel i, j: half a pixel in from its corner.
    const em = raw.map((p) => ({ x: (p.x + 0.5 - ox) / size, y: (oy - p.y - 0.5) / size }));
    if (perimeter(em) < 0.05) continue;
    const points = simplifyLoop(em, SIMPLIFY);
    if (points.length < 3) continue;
    const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
    let letter = 0;
    origins.forEach((origin, i) => { if (cx >= origin - 0.02) letter = i; });
    loops.push({ points, letter });
  }
  const all = loops.flatMap((loop) => loop.points);
  const ink = {
    minX: Math.min(...all.map((p) => p.x)),
    maxX: Math.max(...all.map((p) => p.x)),
    minY: Math.min(...all.map((p) => p.y)),
    maxY: Math.max(...all.map((p) => p.y)),
  };

  // Face shading field, stored at half resolution: it is smooth by construction.
  gaussianBlur(coverage, w, h, FIELD_SIGMA * size);
  const fw = Math.floor(w / 2);
  const fh = Math.floor(h / 2);
  const data = new Float32Array(fw * fh);
  for (let y = 0; y < fh; y++) {
    for (let x = 0; x < fw; x++) {
      const i = y * 2 * w + x * 2;
      data[y * fw + x] = (coverage[i] + coverage[i + 1] + coverage[i + w] + coverage[i + w + 1]) / 4;
    }
  }
  // Field texel (i, j) sits at em (x0 + i / scale, y0 - j / scale).
  const field = { data, width: fw, height: fh, x0: -ox / size, y0: oy / size, scale: size / 2 };
  return { text, letters, origins, loops, ink, field };
}
