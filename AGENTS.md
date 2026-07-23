# DOSEN EPK operating contract

These instructions apply to the entire repository.

## Read first

Before changing the site, read:

1. `source-of-truth/content-manifest.json` for event, set, artwork, audio, and video identity.
2. `source-of-truth/deployment-contract.md` for production routing and release invariants.
3. `docs/architecture.md` for component ownership and data flow.

For site changes, media ingestion, or releases, also use
`.agents/skills/dosen-site-operator/SKILL.md`.

## Authorities

- Application source is this repository on `main`.
- Event and playable-set content is `source-of-truth/content-manifest.json`.
- Production media identity is `source-of-truth/media-manifest.json`.
- Production routing is `source-of-truth/production-routing.json`.
- Production hosting is the existing Cloudflare Pages project `dosen-epk`.
- Production media is the R2 bucket `dosenepk`, delivered by the `dosen-media` Worker.

Never create a second content list in application code. Derive views and navigation from the
content manifest.

## Media roles

- `artwork.eventPoster` is for event cards, dossiers, and the event-visual overlay.
- `artwork.vinylCover` is for vinyl sleeves, record labels, and playable-set selectors.
- Fall back to the vinyl cover on event surfaces only when no separate event poster exists.
- A featured video has no event-poster thumbnail. Render the video at the orientation declared
  by its matching library clip.
- Library clip `poster` values are video-poster frames, not event posters or vinyl covers.

Do not overwrite an existing R2 object. Use a new key, regenerate the media manifest, upload
deliberately, and verify the exact checksum and range behavior.

## Change discipline

- Preserve unrelated user changes.
- Do not edit generated `dist/`, `.pages-dist/`, `.vinext/`, or `.wrangler/` output.
- Do not copy the ignored 1.3 GB rollback media library into a deployment.
- Keep the current desktop and mobile visual behavior unless the request changes it.
- Preserve reduced-motion handling, keyboard operation, native media aspect ratios, and visible
  focus.
- Keep desktop hero matte values from the deployment contract intact.
- Avoid broad component refactors during a bounded visual or copy change.

## Validation

For ordinary application changes, run:

```bash
npm test
npm run lint
npm run build:pages
npm run verify:sot
```

For media or production work, run the complete remote gate:

```bash
npm run release:check
```

Do not claim a browser state was checked unless it was actually rendered at the relevant
desktop and mobile viewport.

## Production releases

Deploy only when the user explicitly asks. Use:

```bash
npm run release:cloudflare -- --reason "Release description" --receipt release-slug
```

The command must stop if the tree is dirty, `main` is not pushed, the Pages project or domains
are wrong, a gate fails, or production verification fails. After a successful deploy, review,
commit, and push the generated receipt.

Never:

- deploy through ChatGPT Sites, Vercel, or another platform;
- create or attach a new Cloudflare Pages project;
- add `.openai/hosting.json`;
- treat a version-specific Pages URL as the canonical production URL;
- replace Cloudflare DNS with IONOS forwarding or IONOS-managed A/AAAA records.
