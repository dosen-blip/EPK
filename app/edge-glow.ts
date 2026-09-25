import { useEffect } from "react";

// Cards, rows and player buttons that light the edge nearest the pointer; the CSS reads --edge-x / --edge-y.
const EDGE_GLOW_TARGETS = [
  ".set-selector-card",
  ".archive-card-trigger",
  ".timeline-row",
  ".dock-toggle",
  ".vinyl-play-button",
].join(", ");

export function useEdgeGlow() {
  useEffect(() => {
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

    let frame = 0;
    let pending: PointerEvent | null = null;

    const apply = () => {
      frame = 0;
      const event = pending;
      pending = null;
      const target = event && (event.target as Element | null)?.closest<HTMLElement>(EDGE_GLOW_TARGETS);
      if (!event || !target) return;
      const rect = target.getBoundingClientRect();
      target.style.setProperty("--edge-x", `${(event.clientX - rect.left).toFixed(1)}px`);
      target.style.setProperty("--edge-y", `${(event.clientY - rect.top).toFixed(1)}px`);
    };

    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      pending = event;
      if (!frame) frame = window.requestAnimationFrame(apply);
    };

    document.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      document.removeEventListener("pointermove", onMove);
      window.cancelAnimationFrame(frame);
    };
  }, []);
}
