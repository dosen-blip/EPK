# Deployment contract

## Cloudflare Pages

- Sole production platform: Cloudflare Pages. ChatGPT Sites and other deployment targets are not production mirrors or fallbacks.
- Project name: `dosen-epk`
- Production branch: `main`
- Canonical hostname: `www.dosen.ca`
- Redirect hostname: `dosen.ca` (permanent redirect to the canonical hostname, preserving path and query)
- Stable Pages hostname: `dosen-epk.pages.dev`
- Build command: `npm run build:pages`
- Output directory: `.pages-dist`
- Runtime: Pages Functions advanced mode (`_worker.js`)
- Node.js: `22.13.0` or newer 22.x

Both hostnames are attached once at the Pages project level. Every approved update must deploy to the existing `dosen-epk` project on `main`; Cloudflare then routes them to the newest successful production deployment automatically. Requests to `dosen.ca` are redirected by the application Worker to the canonical `www.dosen.ca` hostname. Do not create a new deployment project, attach either hostname to another platform, or treat a version-specific URL as production.

IONOS remains the registrar, but authoritative DNS is hosted by Cloudflare. Cloudflare must provide proxied, flattened routing from the apex and proxied CNAME routing from `www` to `dosen-epk.pages.dev`. IONOS forwarding and IONOS-managed A/AAAA records are forbidden because they can overwrite or bypass the Pages hostnames and break TLS.

The Pages output contains the application Worker, content-hashed JavaScript/CSS, favicon, and social-preview image. Audio, video, event imagery, and fonts stay in R2 and are addressed through the canonical media origin.

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
