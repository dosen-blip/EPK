import { ambienceToggles } from "./_hero/ambience-store";

const CARDS = ".clip-card, .set-dossier-highlight";
const WIDTH = 32;
const HEIGHT = 18;
/** How deep into the frame each side's strip reaches, as a share of the frame. */
const DEPTH = 0.2;
const INTERVAL = 100;

/** How light the glow is drawn: bright enough to read as light, dark enough to keep the colour. */
const GLOW_LIGHTNESS = 64;

/**
 * The light one side of the frame gives off: the strip's average colour as the eye sees it, with its hue and
 * saturation kept exactly and only its lightness raised, so a neutral edge stays neutral and a tinted edge keeps
 * its tint. How bright the strip really is sets how strongly that side glows.
 */
function edgeColour(data: Uint8ClampedArray, x0: number, y0: number, x1: number, y1: number) {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * WIDTH + x) * 4;
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      n += 1;
    }
  }
  [r, g, b] = [r / n / 255, g / n / 255, b / n / 255];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  // A black edge casts no light (and must not darken the page around the frame).
  if (max < 10 / 255) return "rgb(0 0 0 / 0)";
  const spread = max - min;
  const saturation = spread === 0 ? 0 : spread / (1 - Math.abs(max + min - 1));
  let hue = 0;
  if (spread) {
    if (max === r) hue = ((g - b) / spread + 6) % 6;
    else if (max === g) hue = (b - r) / spread + 2;
    else hue = (r - g) / spread + 4;
  }
  const strength = Math.min(1, max * 1.8);
  return `hsl(${Math.round(hue * 60)} ${Math.round(Math.min(1, saturation) * 100)}% ${GLOW_LIGHTNESS}% / ${(0.72 + 0.28 * strength).toFixed(2)})`;
}

/**
 * Bias lighting for performance clips: while a clip plays in the video library or a set's highlights, the
 * space around its frame glows with the true colours at the matching edge of the picture. It samples a 32×18
 * copy of the frame about ten times a second, only for the clip that is playing, and fades out on pause.
 * Returns a function that stops it.
 */
export function startVideoAmbilight() {
  const toggles = ambienceToggles();
  const context = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  if (!context) return () => {};
  context.canvas.width = WIDTH;
  context.canvas.height = HEIGHT;
  const across = Math.round(WIDTH * DEPTH);
  const down = Math.round(HEIGHT * DEPTH);

  const active = new Map<HTMLVideoElement, number>();
  const refused = new WeakSet<HTMLVideoElement>();

  const card = (video: HTMLVideoElement) => video.closest<HTMLElement>(CARDS);

  const stop = (video: HTMLVideoElement) => {
    window.clearInterval(active.get(video));
    active.delete(video);
    card(video)?.classList.remove("is-ambilit");
  };

  const sample = (video: HTMLVideoElement) => {
    const target = card(video);
    if (!target || video.paused || video.ended) return stop(video);
    if (!toggles.ambilight) {
      target.classList.remove("is-ambilit");
      return;
    }
    if (video.readyState < 2 || !video.videoWidth) return;
    let data: Uint8ClampedArray;
    try {
      context.drawImage(video, 0, 0, WIDTH, HEIGHT);
      data = context.getImageData(0, 0, WIDTH, HEIGHT).data;
    } catch {
      refused.add(video);
      return stop(video);
    }
    target.style.setProperty("--amb-top", edgeColour(data, 0, 0, WIDTH, down));
    target.style.setProperty("--amb-bottom", edgeColour(data, 0, HEIGHT - down, WIDTH, HEIGHT));
    target.style.setProperty("--amb-left", edgeColour(data, 0, 0, across, HEIGHT));
    target.style.setProperty("--amb-right", edgeColour(data, WIDTH - across, 0, WIDTH, HEIGHT));
    target.classList.add("is-ambilit");
  };

  const onPlay = (event: Event) => {
    const video = event.target;
    if (!(video instanceof HTMLVideoElement) || !card(video) || refused.has(video) || active.has(video)) return;
    sample(video);
    active.set(video, window.setInterval(() => sample(video), INTERVAL));
  };
  const onStop = (event: Event) => {
    if (event.target instanceof HTMLVideoElement && active.has(event.target)) stop(event.target);
  };

  // Media events don't bubble, so listen in the capture phase for every clip on the page.
  document.addEventListener("play", onPlay, true);
  document.addEventListener("pause", onStop, true);
  document.addEventListener("ended", onStop, true);
  document.addEventListener("emptied", onStop, true);

  return () => {
    document.removeEventListener("play", onPlay, true);
    document.removeEventListener("pause", onStop, true);
    document.removeEventListener("ended", onStop, true);
    document.removeEventListener("emptied", onStop, true);
    for (const video of [...active.keys()]) stop(video);
  };
}
