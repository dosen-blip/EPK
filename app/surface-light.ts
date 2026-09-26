import { ambienceToggles } from "./_hero/ambience-store";

const TILT_RATE = 12;
/** Once the cursor leaves, a cover settles straight back rather than drifting down. */
const RELEASE_RATE = 40;

type Tilt = { rect: DOMRect; x: number; y: number; tx: number; ty: number; active: boolean };

const damp = (current: number, target: number, rate: number, dt: number) => current + (target - current) * (1 - Math.exp(-rate * dt));
const clamp = (value: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, value));

/** The cover under the pointer and its untransformed box (so the tilt never feeds back into its own maths). */
function surfaceAt(target: EventTarget | null) {
  if (!(target instanceof Element)) return null;
  const card = target.closest<HTMLElement>(".set-selector-card");
  const cover = card?.querySelector<HTMLElement>(".set-selector-cover");
  if (card && cover) {
    const box = card.getBoundingClientRect();
    return { element: cover, rect: new DOMRect(box.left, box.top, cover.offsetWidth, cover.offsetHeight) };
  }
  const sleeve = target.closest<HTMLElement>(".vinyl-sleeve");
  const stage = sleeve?.closest<HTMLElement>(".vinyl-stage");
  if (sleeve && stage) {
    const box = stage.getBoundingClientRect();
    return { element: sleeve, rect: new DOMRect(box.left + sleeve.offsetLeft, box.top + sleeve.offsetTop, sleeve.offsetWidth, sleeve.offsetHeight) };
  }
  return null;
}

/**
 * Vinyl covers tilt away wherever the cursor is closest and ease back when it leaves, with the artwork drifting
 * slightly inside its frame. Mouse only; nothing moves under reduced motion. Returns a function that stops it.
 */
export function startSurfaceLight() {
  const toggles = ambienceToggles();
  if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return () => {};
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return () => {};

  const tilts = new Map<HTMLElement, Tilt>();
  let raf = 0;
  let last = 0;

  const frame = (now: number) => {
    raf = 0;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    let busy = false;

    for (const [element, tilt] of tilts) {
      const on = tilt.active && toggles.tilt;
      const rate = on ? TILT_RATE : RELEASE_RATE;
      tilt.x = damp(tilt.x, on ? tilt.tx : 0, rate, dt);
      tilt.y = damp(tilt.y, on ? tilt.ty : 0, rate, dt);
      if (!on && Math.abs(tilt.x) < 0.003 && Math.abs(tilt.y) < 0.003) {
        element.classList.remove("is-tilting");
        for (const name of ["--tilt-x", "--tilt-y", "--glare-x", "--glare-y"]) element.style.removeProperty(name);
        tilts.delete(element);
        continue;
      }
      busy = true;
      element.classList.add("is-tilting");
      element.style.setProperty("--tilt-x", tilt.x.toFixed(3));
      element.style.setProperty("--tilt-y", tilt.y.toFixed(3));
      element.style.setProperty("--glare-x", `${((tilt.x + 1) * 50).toFixed(1)}%`);
      element.style.setProperty("--glare-y", `${((tilt.y + 1) * 50).toFixed(1)}%`);
    }

    if (busy) raf = window.requestAnimationFrame(frame);
    else last = 0;
  };

  const kick = () => {
    if (!raf) raf = window.requestAnimationFrame(frame);
  };

  const onMove = (event: PointerEvent) => {
    if (event.pointerType !== "mouse") return;
    const surface = toggles.tilt ? surfaceAt(event.target) : null;
    for (const [element, tilt] of tilts) if (element !== surface?.element) tilt.active = false;
    if (surface) {
      let tilt = tilts.get(surface.element);
      if (!tilt) {
        tilt = { rect: surface.rect, x: 0, y: 0, tx: 0, ty: 0, active: false };
        tilts.set(surface.element, tilt);
      }
      if (!tilt.active) tilt.rect = surface.rect;
      tilt.active = true;
      tilt.tx = clamp(((event.clientX - tilt.rect.left) / tilt.rect.width) * 2 - 1, -1, 1);
      tilt.ty = clamp(((event.clientY - tilt.rect.top) / tilt.rect.height) * 2 - 1, -1, 1);
    }
    kick();
  };

  const release = () => {
    for (const tilt of tilts.values()) tilt.active = false;
    kick();
  };

  window.addEventListener("pointermove", onMove, { passive: true });
  document.documentElement.addEventListener("pointerleave", release);
  // Scrolling moves covers under a still cursor; their boxes are re-measured on the next move.
  window.addEventListener("scroll", release, { passive: true });

  return () => {
    window.removeEventListener("pointermove", onMove);
    document.documentElement.removeEventListener("pointerleave", release);
    window.removeEventListener("scroll", release);
    window.cancelAnimationFrame(raf);
  };
}
