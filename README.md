# DOSEN EPK website

Production source for the DOSEN electronic press kit. The visual direction is media-first and editorial: a full-bleed performance hero, a selected-set archive, a chronological booking record, artist copy, and a clean contact layer.

## Current status

- Site structure, responsive layout, motion, media lightboxes, and set-player interactions are implemented.
- The hero uses separate full-duration desktop and mobile compilations.
- The hero expands into a seven-clip library where each full source clip can be played with its original audio.
- The booking contact and final approved biography are visibly marked as pending.
- Every media URL, including the Ethnocentric font and social card, is served from the dedicated Cloudflare R2 media Worker.
- The signal player streams the complete 1:31:44 Escapade afterparty opening set as 62 sequential 320 kbps MP3 segments presented as one continuous timeline.
- The full ignored `public/` library is retained locally as a rollback source; it is not copied into application deployments.

## Replacing media

Media surfaces in `app/page.tsx` have stable `data-media-slot` values:

- `hero-escapade`
- `offgrid-anniversary`
- `solstice-frequency`
- `offgrid-halloween`

The rollback copies of the hero compilations live under `public/media/hero/`; web-delivery copies of the full source clips and their posters live under `public/media/library/`. Production objects live in R2 under the same keys and are pinned in `source-of-truth/media-manifest.json`.

Add or replace local rollback media only after clearance. Regenerate the media manifest, upload the new R2 object deliberately, and verify both local checksums and remote range delivery before committing.

## Local commands

```bash
npm run dev
npm run build
npm test
npm run build:pages
npm run verify:sot:local
npm run verify:sot:remote
```

The project uses vinext and Cloudflare's Vite runtime. Cloudflare Pages receives the advanced-mode bundle in `.pages-dist`; all production media remains in R2. See `source-of-truth/` for the release contract and regression gates.
