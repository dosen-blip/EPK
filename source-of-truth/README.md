# DOSEN EPK source of truth

This directory defines what must remain true for every production release.

## Authorities

- **Application source:** this Git repository on `main`.
- **Event and set content:** `content-manifest.json`, consumed through `app/content.ts`.
- **Production media:** R2 bucket `dosenepk`, delivered by the `dosen-media` Worker at `https://dosen-media.matiadosen.workers.dev`.
- **Media identity:** `media-manifest.json`. Every object is pinned by key, byte count, MIME type, and SHA-256.
- **Deployment shape:** the vinext Worker bundle is adapted to Cloudflare Pages advanced mode by `scripts/prepare-pages.mjs`.
- **Visual regression contract:** `tests/rendered-html.test.mjs` and `scripts/verify-source-of-truth.mjs`, including the exact desktop hero mattes used to mask source watermarks.

The ignored local `public/` directory is a rollback copy, not deployment input. It can be verified byte-for-byte against the manifest with `npm run verify:sot:local`. A clean clone verifies the live R2 delivery surface with `npm run verify:sot:remote`.

## Release gate

Run these before every production deploy:

```bash
npm ci
npm test
npm run lint
npm run build:pages
npm run verify:sot:remote
```

The equivalent non-deploying command is `npm run release:check`. An explicitly requested
production release uses:

```bash
npm run release:cloudflare -- --reason "Release description" --receipt release-slug
```

That command only targets the existing `dosen-epk` project on pushed `main`, verifies the
project domains and live URLs, and creates a non-overwriting receipt for review and commit.

The GitHub workflow runs the same checks for every pull request and every push to `main`.

Verified production releases are recorded under `releases/`. A receipt identifies the exact source commit, Pages deployment, production URL, and media-manifest digest used for that release.
