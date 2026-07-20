# DOSEN EPK website

Responsive one-page scaffold for the DOSEN electronic press kit. The visual direction combines **Signal Archive** with **Contact Sheet After Midnight**: broadcast-like navigation, a transmission archive, a chronological booking record, working artist copy, and a clean contact layer.

## Current status

- Site structure, responsive layout, motion, and interaction shells are implemented.
- Performance-media areas are intentional placeholders pending the quality and rights review.
- The booking contact and final approved biography are visibly marked as pending.
- The social preview uses the supplied Ethnocentric mark at `public/og-ethnocentric.png`.
- The displayed wordmark uses the supplied Ethnocentric source crop at `public/brand/dosen-wordmark-v2.png`; the site does not substitute another face for the mark.

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
