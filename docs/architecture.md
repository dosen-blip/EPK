# DOSEN EPK architecture

## System boundary

The repository produces one client-heavy EPK page and two Cloudflare delivery surfaces:

```text
Git main
  -> vinext build
  -> scripts/prepare-pages.mjs
  -> .pages-dist/_worker.js
  -> Cloudflare Pages project dosen-epk
  -> www.dosen.ca

Local rollback media
  -> immutable R2 objects in bucket dosenepk
  -> dosen-media Worker
  -> https://dosen-media.matiadosen.workers.dev
```

IONOS is the registrar. Cloudflare is authoritative DNS and the production platform.

## Sources of truth

| Concern | Authority |
| --- | --- |
| Event and set content | `source-of-truth/content-manifest.json` |
| Media checksums and delivery keys | `source-of-truth/media-manifest.json` |
| Domain and Pages identity | `source-of-truth/production-routing.json` |
| Deployment invariants | `source-of-truth/deployment-contract.md` |
| Historical production proof | `source-of-truth/releases/*.json` |
| Segmented Escapade timeline | `app/player-model.mjs` |

`app/content.ts` is the typed adapter between the content manifest and the UI. It may derive
playable sets, the timeline, and artwork fallbacks, but must not introduce a competing content
authority.

## Application ownership

### `app/page.tsx`

Owns the page composition and interactive state:

- hero and performance-film library;
- set library and fullscreen dossiers;
- event-poster overlay;
- main and dossier vinyl players;
- persistent playback dock;
- audio selection, seeking, fades, and segment transitions;
- archive, timeline, biography, and contact sections.

Keep bounded edits bounded. Extract a component only when the requested work benefits from the
separation; do not combine an unrelated refactor with a visual fix.

Page-level effects are started from an idle loader in `page.tsx` (dynamic `import()` after
`requestIdleCallback`) so they never delay first paint. Videos whose pixels are sampled are loaded through
`corsMediaUrl()` with `crossOrigin="anonymous"`; see `docs/design-system.md`.

### `app/globals.css`

Owns all visual layout, breakpoints, motion, focus states, media orientation, and reduced-motion
behavior. Desktop and mobile should be checked independently. The V2 visual language (tokens, neon-tube
buttons, glows, what was tried and set aside) is documented in `docs/design-system.md`.

### Light and ambience modules (V2)

| Module | Owns |
| --- | --- |
| `app/_hero/neon-sign-scene.ts` | The three.js 3D neon wordmark: extrusion, bloom, light pools, power-on, and its reactions to the hero video. Falls back to the CSS `.neon-mark` when WebGL2 is unavailable or the context is lost. |
| `app/_hero/neon-ambience.ts` | `VideoAmbience`, which samples the hero video (48×36) for brightness, hue and strobes, plus the `?ambience-panel` / `?neon-debug` panel. |
| `app/_hero/ambience-model.mjs` | The effect registry (`AMBIENCE_EFFECTS`, groups `room` and `site`), URL parsing for `?ambience=`, frame analysis and strobe detection. Pure and unit-tested in `tests/ambience-model.test.mjs`. |
| `app/_hero/ambience-store.ts` | The shared switch state (`ambienceToggles()`) and the `data-no-<id>` flags on `<html>`. |
| `app/ticker-ambience.ts` | The genre ticker's glossy video reflection (`GlossyMirror`) and its colour, brightness and strobe response. |
| `app/video-ambilight.ts` | Glow around playing library and highlight clips, coloured from the clip's edges. |
| `app/poster-light.ts` | Performance-card glow in each poster's dominant colour. |
| `app/surface-light.ts` | Vinyl cover tilt (mouse only). |
| `app/edge-glow.ts` | Cursor-tracking edge light on cards and buttons. |

Every module stops its loops off screen and in hidden tabs, does nothing under reduced motion where it
animates, and reads its switch from `ambienceToggles()`.

### `app/player-model.mjs`

Owns audio-source math. Escapade is 62 segments presented as one recording. Other playable sets
use the same interface through single-file segments. Tests cover duration, clamping, boundary
selection, and completion behavior.

### `app/layout.tsx`

Owns metadata, favicon, and the social preview image.

### `worker/index.ts`

Owns the apex-to-`www` redirect and hands application requests to vinext. Static same-origin
assets are favicon and social preview only.

## Content and asset semantics

Each transmission in `content-manifest.json` has:

- stable `id`, `slug`, and `slot`;
- approved display copy and metadata;
- `artwork.vinylCover` for records and mix presentation;
- nullable `artwork.eventPoster` for event presentation;
- nullable `featureVideo`, which must belong to its linked library event;
- nullable `player`, which determines whether the set appears in playable-set surfaces.

Artwork fallback is centralized in `getEventArtwork()`:

```text
event surface -> eventPoster when present -> otherwise vinylCover
vinyl surface -> vinylCover only
video surface -> matching library clip and its native orientation
```

Library clips declare `landscape` or `portrait`. The dossier uses the matching clip record to
shape featured video; clip posters are used only as video poster frames in the library.

## Playback flow

One audio element and one active-set state serve every playback surface:

```text
set selector or dossier play
  -> resolve manifest player
  -> segmented or single-file source
  -> load/seek shared audio element
  -> update main player, dossier player, and persistent dock
```

Changing sets while playing uses a cancellable fade down and fade up. Paused selection resets
to zero. Playback errors return to a paused error state. Vinyl rotation is visual state only and
must respect reduced motion.

## Build and release

`npm run build:pages` builds vinext and adapts it to Pages advanced mode. The generated
`.pages-dist` directory is never source.

`npm run release:check` runs the complete non-deploying production gate.

`npm run release:cloudflare -- --reason "..." --receipt slug` requires clean, pushed `main`,
rechecks the gate and Cloudflare project domains, deploys only to `dosen-epk`, verifies the
version/stable/canonical/apex URLs, and writes a non-overwriting release receipt.

The receipt is committed separately so it records the exact application source commit that was
deployed.
