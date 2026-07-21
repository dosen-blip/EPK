# Deployment contract

## Cloudflare Pages

- Project name: `dosen-epk`
- Production branch: `main`
- Build command: `npm run build:pages`
- Output directory: `.pages-dist`
- Runtime: Pages Functions advanced mode (`_worker.js`)
- Node.js: `22.13.0` or newer 22.x

The Pages output contains only the application Worker and content-hashed JavaScript/CSS. Audio, video, imagery, fonts, and social artwork stay in R2 and are addressed through the canonical media origin.

## Non-negotiable visual behavior

- Desktop hero video scale: `1.025`.
- Top matte: 17% height.
- Bottom matte: 21% height.
- Both desktop mattes: standard and WebKit `backdrop-filter: blur(13px)` inline on rendered elements.
- Radial film grain remains present over the hero.
- Mobile portrait presentation does not render the desktop watermark mattes.

These details are deliberate watermark masking, not optional decoration. The source checks fail if the browser-compatible blur declarations or matte elements disappear.

## Media delivery

- R2 bucket: `dosenepk`
- Worker: `dosen-media`
- Origin: `https://dosen-media.matiadosen.workers.dev`
- Immutable cache policy: `public, max-age=31536000, immutable`
- Streaming: audio/video must return HTTP `206` for range requests.
- CORS: `Access-Control-Allow-Origin: *`.

Never overwrite an existing R2 key merely because a filename matches. Regenerate the manifest, verify the new checksum, upload deliberately, then commit both the source change and updated manifest.
