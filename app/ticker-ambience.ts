import { ambienceToggles } from "./_hero/ambience-store";
import {
  analyzeFrame,
  createStrobeDetector,
  exposureAmount,
  hueShift,
  roomTint,
} from "./_hero/ambience-model.mjs";

/** CSS px per mirror pixel: fine enough not to look pixelated once softened, cheap enough to redraw at 30 fps. */
const MIRROR_SCALE = 2;
const MIRROR_SCALE_COARSE = 2.5;
/** Glossy black acrylic reflects little: bright sources come through, mid-tones and darks drop away. */
const GLOSS_TONE = "contrast(1.5) brightness(0.78) saturate(1.3)";
/** Distance blur, top (the contact edge) to bottom: [blur in mirror px, where it starts taking over 0..1]. */
const DISTANCE_BLUR: [number, number][] = [[2.2, 0.16], [5, 0.48]];
const STATS_WIDTH = 32;
const STATS_HEIGHT = 18;
/** Hue of the ticker's tube colour (#2fa8ff) in turns. */
const TUBE_HUE = 0.5695;
const TUBE_SATURATION = 1;
const TUBE_LIGHTNESS = 0.592;

const damp = (current: number, target: number, rate: number, dt: number) => current + (target - current) * (1 - Math.exp(-rate * dt));
const clamp = (value: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, value));

/**
 * Renders the video as a glossy surface would reflect it: mirrored, toned like dark acrylic, and softening
 * with distance from the edge it meets. The canvas keeps the strip's own proportions, so nothing is stretched.
 */
class GlossyMirror {
  private readonly out: CanvasRenderingContext2D;
  private readonly sharp: CanvasRenderingContext2D;
  private readonly soft: CanvasRenderingContext2D;
  private fades: CanvasGradient[] = [];
  private width = 0;
  private height = 0;
  readonly canFilter = "filter" in CanvasRenderingContext2D.prototype;

  constructor(canvas: HTMLCanvasElement, private readonly scale: number) {
    this.out = canvas.getContext("2d")!;
    this.sharp = document.createElement("canvas").getContext("2d")!;
    this.soft = document.createElement("canvas").getContext("2d")!;
  }

  fit(cssWidth: number, cssHeight: number) {
    const width = Math.max(48, Math.round(cssWidth / this.scale));
    const height = Math.max(12, Math.round(cssHeight / this.scale));
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    for (const context of [this.out, this.sharp, this.soft]) {
      context.canvas.width = width;
      context.canvas.height = height;
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
    }
    this.fades = DISTANCE_BLUR.map(([, from]) => {
      const fade = this.soft.createLinearGradient(0, 0, 0, height);
      fade.addColorStop(0, "rgba(0,0,0,0)");
      fade.addColorStop(from, "rgba(0,0,0,0)");
      fade.addColorStop(Math.min(1, from + 0.32), "#000");
      fade.addColorStop(1, "#000");
      return fade;
    });
  }

  /** Draws the reflection of a source rectangle of the video; throws if the browser refuses the pixels. */
  draw(film: HTMLVideoElement, sx: number, sy: number, sw: number, sh: number) {
    const { out, sharp, soft, width, height } = this;
    if (!width || !height) return;
    sharp.setTransform(1, 0, 0, -1, 0, height);
    sharp.filter = this.canFilter ? GLOSS_TONE : "none";
    sharp.drawImage(film, sx, sy, sw, sh, 0, 0, width, height);
    sharp.setTransform(1, 0, 0, 1, 0, 0);
    sharp.filter = "none";

    out.clearRect(0, 0, width, height);
    out.filter = this.canFilter ? "blur(0.6px)" : "none";
    out.drawImage(sharp.canvas, 0, 0);
    out.filter = "none";
    if (!this.canFilter) return;
    DISTANCE_BLUR.forEach(([blur], index) => {
      soft.globalCompositeOperation = "source-over";
      soft.clearRect(0, 0, width, height);
      soft.filter = `blur(${blur}px)`;
      soft.drawImage(sharp.canvas, 0, 0);
      soft.filter = "none";
      soft.globalCompositeOperation = "destination-in";
      soft.fillStyle = this.fades[index];
      soft.fillRect(0, 0, width, height);
      out.drawImage(soft.canvas, 0, 0);
    });
  }
}

/**
 * Lets the genre ticker live under the hero video. The glossy strip mirrors the bottom of the video above it
 * (stopping above the desktop watermark matte), its tubes lean toward the room's colour, its lettering meters
 * the room's brightness, and it flickers on strobes. It runs only while the ticker is on screen and uses the
 * page's shared effect switches. Returns a function that stops it.
 */
export function startTickerAmbience(marquee: HTMLElement) {
  const toggles = ambienceToggles();
  const reflection = marquee.querySelector<HTMLCanvasElement>(".marquee-reflection");
  const probe = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  if (!reflection || !reflection.getContext("2d") || !probe) return () => {};
  const mirror = new GlossyMirror(reflection, coarse ? MIRROR_SCALE_COARSE : MIRROR_SCALE);
  const fit = () => mirror.fit(marquee.offsetWidth, marquee.offsetHeight);
  fit();
  const resize = new ResizeObserver(fit);
  resize.observe(marquee);
  marquee.classList.toggle("no-canvas-filter", !mirror.canFilter);
  probe.canvas.width = STATS_WIDTH;
  probe.canvas.height = STATS_HEIGHT;

  const detect = createStrobeDetector();
  let visible = false;
  let raf = 0;
  let last = 0;
  let nextStats = 0;
  let lastStats = 0;
  let strobeTimer = 0;
  let broken = false;
  let shift = 0;
  let gain = 1;
  let targetShift = 0;
  let targetGain = 1;
  let shownShift = Number.NaN;
  let shownGain = Number.NaN;

  const hero = () => document.querySelector<HTMLElement>(".hero");
  const video = () => document.querySelector<HTMLVideoElement>(".hero .hero-video");

  const draw = (now: number, dt: number) => {
    const section = hero();
    const film = video();
    if (broken || !section || !film || film.readyState < 2 || !film.videoWidth || !film.videoHeight) return;

    // Where the picture sits in the hero (object-fit: cover, centred, including its CSS scale).
    const frame = section.getBoundingClientRect();
    const shown = film.getBoundingClientRect();
    const scale = Math.max(shown.width / film.videoWidth, shown.height / film.videoHeight);
    const boxW = film.videoWidth * scale;
    const boxH = film.videoHeight * scale;
    const boxX = shown.left - frame.left + (shown.width - boxW) / 2;
    const boxY = shown.top - frame.top + (shown.height - boxH) / 2;

    if (toggles.reflection) {
      // Mirror the lowest visible band of the hero, but never what the desktop matte hides. As the strip rises
      // up the viewport the reflected band climbs the hero, the way a reflection shifts with the viewing angle.
      const matte = section.querySelector<HTMLElement>(".hero-film-matte-bottom");
      const bottom = matte && getComputedStyle(matte).display !== "none" ? matte.getBoundingClientRect().top - frame.top : frame.height;
      const span = Math.min(bottom * 0.5, 360);
      const view = marquee.getBoundingClientRect();
      const tilt = clamp((view.top + view.height / 2) / window.innerHeight - 0.5, -0.6, 0.6);
      const lift = (0.6 - tilt) * span * 0.3;
      const top = Math.max(0, bottom - span - lift);
      const sx = Math.max(0, ((0 - boxX) / boxW) * film.videoWidth);
      const sw = Math.min(film.videoWidth - sx, (frame.width / boxW) * film.videoWidth);
      const sy = Math.max(0, ((top - boxY) / boxH) * film.videoHeight);
      const sh = Math.min(film.videoHeight - sy, (span / boxH) * film.videoHeight);
      try {
        mirror.draw(film, sx, sy, sw, sh);
      } catch {
        broken = true;
        return;
      }
    }
    marquee.classList.toggle("is-reflecting", toggles.reflection);

    if (now >= nextStats && (toggles.hue || toggles.exposure || toggles.strobe)) {
      nextStats = now + 150;
      try {
        probe.drawImage(film, 0, 0, STATS_WIDTH, STATS_HEIGHT);
      } catch {
        broken = true;
        return;
      }
      const stats = analyzeFrame(probe.getImageData(0, 0, STATS_WIDTH, STATS_HEIGHT).data, STATS_WIDTH, STATS_HEIGHT, {
        x0: 0,
        y0: 0,
        x1: STATS_WIDTH,
        y1: STATS_HEIGHT,
      });
      const gap = lastStats ? (now - lastStats) / 1000 : 0;
      lastStats = now;
      const tint = roomTint(stats.hueX, stats.hueY);
      targetShift = toggles.hue ? hueShift(TUBE_HUE, tint.hue, tint.strength) : 0;
      const e = exposureAmount(stats.luma * 1.6);
      targetGain = toggles.exposure ? 0.82 + 0.5 * e : 1;
      if (detect(stats.luma, now / 1000, gap) > 0 && toggles.strobe && !reducedMotion) {
        // Restart the flicker even if the previous one is still running.
        marquee.classList.remove("is-strobe");
        void marquee.offsetWidth;
        marquee.classList.add("is-strobe");
        window.clearTimeout(strobeTimer);
        strobeTimer = window.setTimeout(() => marquee.classList.remove("is-strobe"), 700);
      }
    }
    if (!toggles.hue) targetShift = 0;
    if (!toggles.exposure) targetGain = 1;

    shift = damp(shift, targetShift, 2.2, dt || 1 / 30);
    gain = damp(gain, targetGain, 4, dt || 1 / 30);
    // Only touch styles when the change is visible; the tubes repaint, the lettering is a compositor filter.
    if (!(Math.abs(shift - shownShift) < 0.5 / 360)) {
      shownShift = shift;
      const hue = ((TUBE_HUE + shift) % 1 + 1) % 1;
      marquee.style.setProperty("--room-shift", `${(shift * 360).toFixed(1)}deg`);
      marquee.style.setProperty("--tube-live", `hsl(${(hue * 360).toFixed(1)} ${TUBE_SATURATION * 100}% ${TUBE_LIGHTNESS * 100}%)`);
    }
    if (!(Math.abs(gain - shownGain) < 0.01)) {
      shownGain = gain;
      marquee.style.setProperty("--room-gain", gain.toFixed(3));
    }
  };

  const frame = (now: number) => {
    raf = window.requestAnimationFrame(frame);
    // About 30 fps is plenty for a blurred reflection; reduced motion keeps a slowly refreshed still.
    if (now - last < (reducedMotion ? 1000 : 33)) return;
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
    last = now;
    draw(now, dt);
  };

  const sync = () => {
    const run = visible && document.visibilityState === "visible";
    if (run && !raf) {
      last = 0;
      raf = window.requestAnimationFrame(frame);
    } else if (!run && raf) {
      window.cancelAnimationFrame(raf);
      raf = 0;
    }
  };

  const seen = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    sync();
  }, { rootMargin: "120px 0px" });
  seen.observe(marquee);
  document.addEventListener("visibilitychange", sync);

  return () => {
    seen.disconnect();
    resize.disconnect();
    document.removeEventListener("visibilitychange", sync);
    window.cancelAnimationFrame(raf);
    window.clearTimeout(strobeTimer);
    marquee.classList.remove("is-reflecting", "is-strobe", "no-canvas-filter");
  };
}
