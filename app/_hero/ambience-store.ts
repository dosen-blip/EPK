import { AMBIENCE_IDS, AMBIENCE_STORAGE_KEY, resolveAmbienceToggles, type AmbienceToggles } from "./ambience-model.mjs";

let shared: AmbienceToggles | null = null;

/**
 * One set of effect switches for the whole page: the sign, the genre ticker and the testing panel share it,
 * so flipping a switch changes that effect everywhere at once.
 */
export function ambienceToggles(): AmbienceToggles {
  if (shared) return shared;
  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem(AMBIENCE_STORAGE_KEY);
  } catch {
    // Storage can be blocked; the defaults apply.
  }
  shared = resolveAmbienceToggles(new URLSearchParams(window.location.search).get("ambience"), stored);
  applyAmbienceFlags(shared);
  return shared;
}

/** Mirrors each switched-off effect as `data-no-<effect>` on the root, so CSS-only effects obey the switches too. */
export function applyAmbienceFlags(toggles: AmbienceToggles) {
  const root = document.documentElement;
  for (const id of AMBIENCE_IDS) root.toggleAttribute(`data-no-${id}`, !toggles[id]);
}
