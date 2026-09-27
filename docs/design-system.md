# DOSEN EPK design system — V2 "electric flat"

Production since the V2 release (`3c126a8`, receipt `source-of-truth/releases/2026-09-26-v2-electric-flat-3c126a8.json`).
The pre-V2 site is tagged `legacy-pre-overhaul-2026-09-25` (`af9bffd`) for rollback reference.

The direction in one line: **flat, dark surfaces lit by neon light sources.** The 3D treatment is reserved for the
hero wordmark; everything else stays flat and gets its drama from light (glows, neon-tube hovers, reflections),
not from bevels, glass keys or depth effects.

## Principles

1. **One loud thing per section.** The hero's loud thing is the wordmark. Glows make every element cost more
   attention than it used to, so repeated labels, second buttons and decorative metadata were removed in V2 and
   should not come back. Before adding an element, check it isn't already said elsewhere on screen.
2. **Light, not texture.** Effects read as light falling on or coming from things. Anything that looks like a
   texture pasted on top (moving sheens, rigid glow boxes, overlays that follow a shape too exactly) has been
   tried and rejected.
3. **Restraint over spectacle.** Tune effects to be noticeable but tasteful. When the owner says "more obvious",
   raise them a step, not to the maximum.
4. **Every effect is switchable, pauses when unseen and respects reduced motion** (see "Effects" below).

## Tokens

Defined in `app/globals.css`:

| Token | Value | Use |
| --- | --- | --- |
| `--ink` | `#020203` | Page background. Deliberately near-black so glows read as light. |
| `--paper` | `#eeeae1` | Primary text, outline buttons. |
| `--muted` | `#aaa69d` | Secondary text and labels. |
| `--line` | `rgba(238,234,225,.24)` | Hairlines, resting button borders, section separators. |
| `--violet` | `#b748ff` | Site accent: nav letter glow, library/index buttons, default dossier accent. |
| `--magenta`, `--amber`, `--red` | `#ff3ba7`, `#ff9933`, `#ff4938` | Per-set tones (`tone-*`, `.set-dossier.dossier-*` → `--dossier-accent`). |
| `--neon`, `--neon-hot`, `--neon-core` | `#2f5bff`, `#2fa8ff`, `#eef7ff` | The wordmark's blue neon (on `.neon-mark`) and the primary neon-tube buttons. |
| `--player-accent` | per active set | The main player, set selector and vinyl play button. |
| `--dossier-accent` | per set | Everything inside a set overview (dossier). |

Type:

- **Wordmark:** Ethnocentric (served from R2, `/fonts/Ethnocentric-Regular.otf`). **Never change the hero
  wordmark's typeface or size.** Its on-screen position is also locked: measure the wordmark's box before and
  after any hero edit at 1280×800, 820×1000 and 375×812.
- **Labels, buttons, metadata:** the mono stack (`"SFMono-Regular", Consolas, monospace`), uppercase, tracked.
- **Headings and body:** the existing sans stack. The "Signal" type experiment (Archivo Expanded / Martian Mono)
  was set aside.

## Components

### Hero

Composition is fixed: video, the 3D wordmark, **one** caption (`.hero-tag`, "DJ · Electronic press kit") and
**one** action (`.hero-action`, "Library", opens the video library dialog; screen-reader label "Open video
library"). Genres live in the ticker, location in the header; don't repeat them in the hero. The desktop matte
values in `deployment-contract.md` still apply.

### Buttons: flat at rest, neon tube on hover

Buttons are flat outlines at rest. On hover, keyboard focus (`:focus-visible`) and touch press (`:active` under
`hover: none`) they light like a neon tube: a `::before` layer fills the inside with light (white core fading
to the tube colour) and a layered `box-shadow` throws glow around it. The label turns dark to sit on the light.

- **Blue tube** (`--neon*` colours): the hero Library button, the nav Book button, the performances Library
  button, and the contact actions. Block begins "Buttons stay flat at rest" in `globals.css`.
- **Accent tube** (driven by `--tube`): buttons inside overlays and menus. Violet in the video library, set
  library and mobile index; the set's `--dossier-accent` inside set overviews and the event-visual overlay.
  Block begins "The same neon tube for the buttons inside the overlays".

**Adding a button:** add its selector to the matching list, blue for primary page-level actions or accent for
buttons inside a coloured context. For the accent list, set `--tube` if it needs a colour other than the
default. Don't invent a third button style. The round play buttons (sleeve, dossier player, dock) have their
own edge-glow treatment and are intentionally excluded.

### Glows

- **Section ambience:** soft coloured light behind sections (`--energy`, "Energy flow" block).
- **Card edge glow:** a light that tracks the cursor around card and button edges (`app/edge-glow.ts`,
  `--glow`, `--edge-x/y`).
- **Poster light:** each performance card glows in its poster's dominant colour (`app/poster-light.ts`).
- **Video glow (ambilight):** a playing clip in the library or a set's highlights is lit around its frame in
  the clip's own colours (`app/video-ambilight.ts`). The glow's **shape is fixed**: four edge gradients,
  `scale(1.22)`, `blur(30px)`. Only its colours adapt. Colour = each edge strip's perceived average colour with
  hue and saturation kept and lightness raised. An 8-zone version (a rigid box) and an oval-masked version were
  both rejected. Clip rows that clip overflow (`.event-clip-track`, and `.set-dossier-highlights-grid` on phones)
  carry 110px of `padding-block` with a matching negative margin so the glow isn't cut off. The headings and
  buttons beside those rows sit above with `position: relative; z-index: 1`. Don't use `pointer-events: none`
  on the rows: it breaks swiping on phones.

### Wordmark (3D neon sign)

`app/_hero/neon-sign-scene.ts` (three.js, loaded lazily after idle) replaces the CSS neon tubes once WebGL2 is
ready; the CSS `.neon-mark` stays as the fallback and the first frame. Extruded Ethnocentric letters, per-letter
light pools, selective bloom, and a random letter-by-letter power-on. Blue, with bloom radius kept modest. It
reacts to the hero video through the "room" effects below.

### Ticker

Flat neon lettering scrolling over a glossy strip that reflects the bottom of the hero video
(`app/ticker-ambience.ts`, `GlossyMirror`). The strip is lacquer-dark with a tone curve and progressive blur,
not a sharp mirror. Tubes start dark (`is-dormant`) and ignite the first time the ticker is scrolled into view.

### Covers

Vinyl covers (sleeve and set cards) tilt away from the cursor with a slight drift of the artwork inside the
frame (`app/surface-light.ts`): mouse only, off under reduced motion, snapping back in about 0.15s when the cursor
leaves. Depth effects on cover art (WebGL depth maps, cut-out 2.5D layers) and a moving sheen were all tried and
rejected; don't reintroduce them.

### Set cards and sections

Set cards show only "ON AIR" on the active card; no index numbers or "SELECT" labels. Section headers carry
an eyebrow and a heading; no counters or coordinates. The press profile keeps only the "SETS" fact.

## Effects framework

All video-reactive and site-wide light effects are registered in `app/_hero/ambience-model.mjs`
(`AMBIENCE_EFFECTS`), grouped as:

- **room** (reactions to the hero video): `exposure`, `hue` (capped at 35°), `strobe`, `reflection`, `spill`.
- **site** (other light effects): `ambilight`, `posters`, `circuit`, `tilt`, `bookend`.

`ambienceToggles()` in `app/_hero/ambience-store.ts` is the shared state. A switched-off effect is also mirrored
as `data-no-<id>` on `<html>` so CSS can drop it. Test and debug controls:

- `?ambience=none`, `?ambience=all`, `?ambience=a,b` (only these), `?ambience=-a` (all but this).
- `?ambience-panel` shows a toggle panel. Choices are saved in `localStorage` under `dosen:ambience`.
- `?neon-debug` shows the panel with live readings and exposes `window.__dosenNeonSign` / `window.__dosenAmbience`.

**Adding an effect:** add it to `AMBIENCE_EFFECTS` (and its test in `tests/ambience-model.test.mjs`), read its
switch from `ambienceToggles()`, and add a `:root[data-no-<id>]` rule if it has CSS. Load it from the idle loader
in `app/page.tsx`, not the critical path.

### Performance and accessibility rules for effects

- Stop animation loops when the element is off screen (`IntersectionObserver`) or the tab is hidden
  (`visibilitychange`).
- No motion under `prefers-reduced-motion: reduce`. Pointer-driven effects are gated on
  `(hover: hover) and (pointer: fine)`.
- Cap device pixel ratio for WebGL (1.5 on touch, 1.75 desktop), and read pixels from tiny canvases only
  (16–48px wide), at 6–15 samples per second at most.
- Load heavy code (three.js is ~150 KB gzipped) with dynamic `import()` from the idle loader.
- Keep keyboard focus visible. Neon-tube hover styles are mirrored on `:focus-visible`.

## Media and CORS for pixel-reading effects

Effects that read video or image pixels need CORS responses. Rules:

- Videos that are sampled use `crossOrigin="anonymous"` and are loaded through `corsMediaUrl()` in
  `app/page.tsx`, which appends `?cors=1`. This gives the CORS response its own browser-cache entry, separate
  from plain requests for the same file, and avoids `ERR_CACHE_WRITE_FAILURE` and broken media.
- **Don't add `crossOrigin` to `<img>` posters.** Poster light samples posters with a separate
  `fetch(..., { mode: "cors", cache: "force-cache" })` after load, one at a time.
- The `dosen-media` Worker must keep sending `Access-Control-Allow-Origin: *` and must accept query strings
  (see `deployment-contract.md`).

## Directions tried and set aside (don't re-propose without a new reason)

- Glass "key" 3D buttons, smoked-glass button hybrids, and the Signal font pairing: looked dated.
- 3D treatment anywhere beyond the wordmark.
- Moving sheen/shine on the vinyl sleeve.
- Cover depth maps (rubber-sheet warp) and cut-out 2.5D cover layers.
- 8-zone or oval-masked video glow (box-shaped or too faint). The shape stays as described above.
- A "max" sharp-mirror wordmark reflection is being explored on `experimental/wordmark-reflection-max` and is
  not approved for production.
