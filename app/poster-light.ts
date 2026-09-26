import { ambienceToggles } from "./_hero/ambience-store";

const SIZE = 24;

/**
 * The poster's own light: the average of its brightest, most saturated pixels (the neon, lasers and type
 * that make a poster glow), pushed to full brightness. Grey or very dark posters return null.
 */
function dominantLight(data: Uint8ClampedArray) {
  const pixels: { r: number; g: number; b: number; weight: number }[] = [];
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const max = Math.max(r, g, b);
    const chroma = max - Math.min(r, g, b);
    if (max < 40 || chroma < 30) continue;
    pixels.push({ r, g, b, weight: (chroma / 255) * (max / 255) });
  }
  if (pixels.length < 6) return null;
  pixels.sort((a, b) => b.weight - a.weight);
  const top = pixels.slice(0, Math.max(6, Math.round(pixels.length * 0.2)));
  let r = 0;
  let g = 0;
  let b = 0;
  let total = 0;
  for (const pixel of top) {
    r += pixel.r * pixel.weight;
    g += pixel.g * pixel.weight;
    b += pixel.b * pixel.weight;
    total += pixel.weight;
  }
  const colour = [r / total, g / total, b / total];
  const lift = 245 / Math.max(...colour, 1);
  return `rgb(${colour.map((c) => Math.round(Math.min(255, c * lift))).join(" ")})`;
}

/**
 * Samples each performance poster once and hands its dominant light colour to the card, so the card's pooled
 * light and hover glow shine in the poster's own colour. The CSS falls back to the card's set tone when this is
 * switched off or a poster cannot be read.
 *
 * The page's <img> stays a plain request: the same artwork is shown and preloaded elsewhere (vinyl sleeve,
 * label), and overlapping CORS and plain requests for one URL make Chrome fail a cache write. So posters are
 * read only once the page has fully loaded and gone idle, one at a time, from the HTTP cache (the media
 * server sends CORS headers on every response, so the cached copy is readable). Returns a function that stops it.
 */
export function startPosterLight() {
  if (!ambienceToggles().posters) return () => {};
  const context = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  if (!context) return () => {};
  context.canvas.width = SIZE;
  context.canvas.height = SIZE;
  const cleanups: (() => void)[] = [];
  const abort = new AbortController();
  const done = new WeakSet<HTMLImageElement>();

  const read = async (image: HTMLImageElement) => {
    const card = image.closest<HTMLElement>(".archive-card");
    if (!card || !image.naturalWidth || done.has(image)) return;
    done.add(image);
    try {
      const response = await fetch(image.currentSrc || image.src, { mode: "cors", credentials: "omit", cache: "force-cache", signal: abort.signal });
      const bitmap = await createImageBitmap(await response.blob(), { resizeWidth: SIZE, resizeHeight: SIZE, resizeQuality: "medium" });
      context.clearRect(0, 0, SIZE, SIZE);
      context.drawImage(bitmap, 0, 0, SIZE, SIZE);
      bitmap.close();
      const light = dominantLight(context.getImageData(0, 0, SIZE, SIZE).data);
      if (!light) return;
      card.style.setProperty("--poster-light", light);
      card.classList.add("has-poster-light");
    } catch {
      // Unreadable or aborted: the card keeps its set tone.
    }
  };

  const images = [...document.querySelectorAll<HTMLImageElement>(".archive-card .archive-poster")];
  const run = async () => {
    for (const image of images) {
      if (abort.signal.aborted) return;
      if (!image.complete) await new Promise((resolve) => image.addEventListener("load", resolve, { once: true }));
      await read(image);
    }
  };
  const begin = () => {
    const idle = typeof window.requestIdleCallback === "function"
      ? window.requestIdleCallback(() => void run(), { timeout: 2500 })
      : window.setTimeout(() => void run(), 600);
    cleanups.push(() => (typeof window.cancelIdleCallback === "function" ? window.cancelIdleCallback(idle) : window.clearTimeout(idle)));
  };
  if (document.readyState === "complete") begin();
  else {
    window.addEventListener("load", begin, { once: true });
    cleanups.push(() => window.removeEventListener("load", begin));
  }
  return () => {
    abort.abort();
    cleanups.forEach((cleanup) => cleanup());
  };
}
