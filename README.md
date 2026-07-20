# DOSEN EPK website

Responsive one-page scaffold for the DOSEN electronic press kit. The visual direction combines **Signal Archive** with **Contact Sheet After Midnight**: broadcast-like navigation, a transmission archive, a chronological booking record, working artist copy, and a clean contact layer.

## Current status

- Site structure, responsive layout, motion, and interaction shells are implemented.
- Performance-media areas are intentional placeholders pending the quality and rights review.
- The booking contact and final approved biography are visibly marked as pending.
- Every on-page wordmark is live `DOSEN` text rendered with the embedded `public/fonts/Ethnocentric-Regular.otf` webfont.
- The social preview remains a bitmap at `public/og-ethnocentric.png`, as required by social-unfurl platforms, but its mark is rendered in Ethnocentric.
- The signal player streams the complete 1:31:44 Escapade afterparty opening set as 31 sequential 320 kbps MP3 delivery segments under `public/audio/`. The player presents them as one continuous timeline; the supplied WAV master remains untouched outside the site.
- The player artwork is the supplied 1254×1254 Escapade afterparty cover at `public/media/escapade-ap-cover.png`.

## Replacing media

Media surfaces in `app/page.tsx` have stable `data-media-slot` values:

- `hero-loop`
- `hero-escapade`
- `offgrid-anniversary`
- `solstice-frequency`
- `offgrid-halloween`

Replace the internal placeholder markup for a slot with the approved image, video, or embed while retaining the surrounding card metadata and slot name. New media should be placed under `public/media/` after clearance.

## Local commands

```bash
npm run dev
npm run build
npm test
```

The project uses the bundled vinext/Sites structure and declares no database or object storage.
