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

On phones (≤620px):

- **Size:** the wordmark spans the hero exactly, margin to margin: `font-size: calc((100vw - 32px) / 4.57)`
  (the word measures 4.57em at its −.03em tracking). Re-measure if the tracking or typeface changes.

- **Intro** (phones and desktop, at the top of the page; skipped under reduced motion, when loaded scrolled, with a
  `#hash` other than `#top`, with `?set=`, or in a background tab):
  1. *Armed before first paint.* An inline script in `app/layout.tsx` adds `intro-pending` to `<html>`: the CSS
     tubes are hidden and `.hero-room` (a dark layer over the video) is at 95%, so the first frames never show
     the resting word or a fallback font. The script releases the wordmark after 4s if the page's JS never runs.
     The font is preconnected and preloaded from the media origin. On phones (≤620px) it also adds
     `intro-ui-hidden`, which hides the header, the hero tag and Library button (`.hero-bottom`) and the player
     dock while the sign powers on centred; `NeonWordmark` swaps it for `intro-ui-reveal` (a 0.9s fade,
     `INTRO_UI_FADE_MS`) as the sign lands, with a 9s safety reveal (`INTRO_UI_SAFETY_MS`). Skipped intros never
     hide the UI.
  2. *Gated start.* `NeonWordmark` measures the centring offset at once (the heading box doesn't depend on the
     font), then waits for the Ethnocentric font and the 3D sign's first frame, up to `INTRO_GATE_MS` (1.4s),
     before starting the ignition. The 3D build happens in the dark, not mid-animation, and when the 3D sign leads
     the flat CSS tubes are hidden instantly rather than faded. (A side-on 3D reveal was tried and dropped.)
  3. *The sign lights the room.* `.hero-room` holds three compositor-only layers driven per frame by
     `NeonWordmark` from the tubes' live levels: darkness over the whole room (`.hero-room-dark`), darkness beyond
     the light's reach (`.hero-room-reach`, a soft hole centred on the sign and scaled with its light) and the
     neon's blue spill (`.hero-room-spill`). They flicker with the tubes (barely eased), lean toward whichever
     letters are lit, travel down with the sign as it settles, and open up to the whole room as it arrives.
  4. *God rays and depth light* (`app/_hero/hero-light.ts`, ambience effects `rays` and `depthlight`, each
     switchable): a half-resolution WebGL2 layer over the room (`.hero-light`, blended as light) driven by the same
     per-frame state. *Rays* march from each pixel toward the sign, gathering its glow and the haze it lights,
     dimmed where dark silhouettes (and, with depth on, anything nearer than the sign) block the way. *Depth
     light* lights the room by distance and angle from the sign using a depth map of the phone hero video baked
     offline with Depth Anything V2 Small (`scripts/hero-depth/build.py` -> `app/_hero/depth/hero-mobile-depth.webp`
     + `.json`: 550 frames at 12 fps in one ~211 KB atlas, blended between frames by the video's time but never across a
     shot cut listed in the JSON's `cuts`). Re-bake if
     the phone hero video changes (the script needs a Python with torch and transformers; it isn't a site
     dependency). Test with `?ambience=-depthlight` (rays only), `?ambience=-rays` (depth only), the default
     (both) or `?ambience=-rays,-depthlight` (neither). After the intro the layer stays on at a resting level
     (`HERO_REST_LIGHT`, ~34% of the peak) following the tubes' hum and flickers, so the room keeps a trace of the
     sign's light; phone pages that skip the intro get the resting light too. It only runs while the hero is on
     screen and the tab is visible, redraws at most at 30 fps at rest, and re-copies the video only when its
     playback time has moved on (read from whichever video element is current, so the copy can't freeze).
     The rays hold for `RAYS_CALM_AFTER` (3s) after the sign settles, then ease down over 2.5s to 35% of that
     (`RAYS_CALM_TO`). Surfaces lit by the depth light keep most of their own colour (a red wall brightens red),
     while the rays stay the neon's blue, which keeps the depth effect legible. Over the same time both effects gather from the intro's wide pool (`INTRO_LIGHT_FOCUS`,
     a pool about 0.62 x 0.32 of the hero around the sign, so the room beyond it keeps its own colour and the peak
     never reads as an even blue filter) into a tight pool around the
     sign (`focus`/`reach`). Pure black in the footage stays black, and a contrast curve drops faint spread-out
     light faster than the shafts and lit surfaces. Depth frames are baked at 12 fps with the video's cut and strobe times
     (`cuts` in the JSON) and never blended across one, which would light a new shot with the last one's shapes.
     *Desktop* gets the same layer at a steady level (`HERO_REST_LIGHT_DESKTOP`, started at full strength to be
     tuned down), lit from the left-aligned wordmark, with its own depth bake of `hero-desktop-v1.mp4`
     (`hero-desktop-depth.webp`, 134 frames, ~69 KB; the layer picks the bake matching the playing video's shape).
     The light follows the 3D sign as it sways with the pointer (`NeonSignScene.lightShift()`: its parallax
     against the video plus a throw toward where it faces). Wherever the watermark mattes show, a mask keeps the
     light out of the matte bands, so the masking contract is untouched.
  *Desktop* plays the same intro: the wordmark rests large and left-aligned, so it starts centred on screen
     (`clock.intro.dx` as well as `dy`, a little larger, within 86% of the width) and glides down and across into
     place. The word's width comes from its font size and tracking (4.72em + tracking), not the rendered text.
  `?neon-debug` also exposes the light layer as `window.__dosenHeroLight`. (Artificial beams fanning from
     behind the word were tried and dropped.)
  5. *Dolly and landing.* Once lit and after a 0.5s hold, the sign pulls back and down into its resting place in
     one continuous 1.5s move (`NEON_DOLLY`/`neonDolly`, mirrored by the `neon-dolly` keyframes on `.neon-tubes`):
     it starts as large as the screen allows with ~14px clear each side (`clock.intro.scale`, from the font size),
     glides with an unhurried start and a long gentle arrival a hair past its mark, then eases onto it. The 3D
     sign moves through depth rather than being scaled, so perspective shrinks it naturally. The arrival hits the
     sign with light (`neonLandingPulse`: gas, bloom and a flash across the glass) while `.hero-flash` throws a
     pulse of blue light on the room behind it. A letter-by-letter drop was tried first and replaced: it read as
     choppy. Haptics were left out: phones only allow vibration after the visitor has touched the page.
  6. *Clean-up.* The 3D band (taller during the intro) shrinks 1.2s after landing, once the sign is still, so
     the canvas resize never lands on a moving frame. The ticker's video reflection only runs once at least a
     quarter of the strip is on screen, so it doesn't load the intro while sitting just below the fold.
- **Glow boost:** the CSS tubes' outer glow runs at `--neon-boost: 1.45`, and the 3D sign's bloom and light
  pools at ×1.4 and ×1.45 (`PHONE_*_BOOST` in the scene), because the letters have less area to carry the light.
- **Depth and glass:** the letters extrude 2.6× deeper (`PHONE_DEPTH`, a z-scale behind the front faces, which
  stay on the DOM glyphs), sway 1.7× further (`PHONE_SWAY`), and the glass reflection and highlights run 1.9× and
  1.7× stronger (`PHONE_REFLECT`, `PHONE_SHEEN`), because the sides and glass are easy to miss at this size.
- **Frame rate and watchdog:** the sign draws every display refresh (up to 120 Hz where the screen and browser
  allow; there is no phone frame cap). Phones are judged against a 24 fps floor (desktop 45), since iPhones in
  Low Power Mode cap pages at 30 fps. Phones step quality down twice (device
  pixel ratio 1, then 0.75) before handing back to the CSS tubes.
- - **Tilt to move (`gyro` effect):** tilting the device sways the sign like the cursor does on desktop, ±18° for a
  full sweep, re-centring on however the phone is held. Android starts straight away; iPhones ask permission on
  the first tap in the hero that isn't on a link, button or video. Needs https. Doesn't work on a local `http://`
  LAN preview; test it with Chrome DevTools > Sensors.

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

- **room** (reactions to the hero video): `exposure`, `hue` (capped at 35°), `strobe`, `reflection`, `spill`,
  `rays` and `depthlight` (the phone intro's god rays and depth light).
- **site** (other light effects): `ambilight`, `posters`, `circuit`, `tilt`, `gyro`, `bookend`.

`ambienceToggles()` in `app/_hero/ambience-store.ts` is the shared state. A switched-off effect is also mirrored
as `data-no-<id>` on `<html>` so CSS can drop it. Test and debug controls:

- `?ambience=none`, `?ambience=all`, `?ambience=a,b` (only these), `?ambience=-a` (all but this).
- `?ambience-panel` shows a toggle panel. Choices are saved in `localStorage` under `dosen:ambience`.
- `?neon-debug` shows the panel with live readings and exposes `window.__dosenNeonSign` / `window.__dosenAmbience`.
  If the 3D sign falls back to the CSS tubes, the reason (`slow`, `context-lost`, a WebGL error, or "Ethnocentric
  is not available") is shown in a red label on screen, set as `data-sign-fallback` on the heading and logged to
  the console. Use it to diagnose phones, which have no console to hand.

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
