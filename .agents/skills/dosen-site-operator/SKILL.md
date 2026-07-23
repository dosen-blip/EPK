---
name: dosen-site-operator
description: Safely maintain, extend, validate, and release the DOSEN EPK repository. Use for site copy or layout changes, event and playable-set updates, poster/mix/video/audio ingestion, player work, mobile or motion QA, Cloudflare Pages releases, R2 media changes, domain routing checks, and release receipts in the DOSEN EPK repo.
---

# DOSEN Site Operator

## Orient

1. Read `AGENTS.md`.
2. Read `source-of-truth/content-manifest.json` for content or media work.
3. Read `docs/architecture.md` when changing interactions, playback, or system boundaries.
4. Read `source-of-truth/deployment-contract.md` before production or DNS work.
5. Inspect the working tree and preserve unrelated changes.

Treat paths above as relative to the repository root.

## Modify the site

- Change event and set data in `source-of-truth/content-manifest.json`; do not recreate it in
  `app/page.tsx`.
- Keep typed derivation in `app/content.ts`.
- Use event posters on event cards, dossiers, and event-visual overlays.
- Use vinyl covers only on vinyl, label, and playable-selector surfaces unless no event poster
  exists.
- Resolve featured video orientation through its matching library clip.
- Preserve keyboard support, focus visibility, reduced motion, and native media proportions.
- Avoid unrelated refactors of the page or stylesheet.

Run:

```bash
npm test
npm run lint
npm run build:pages
npm run verify:sot
```

Render desktop and mobile when layout, motion, controls, typography, or cropping changed.

## Add or replace media

1. Confirm the intended role: event poster, vinyl cover, library clip, clip poster, audio, hero,
   font, or same-origin metadata asset.
2. Use a new immutable R2 key. Never overwrite an existing key.
3. Update `content-manifest.json` and local rollback media together.
4. Run `npm run media:manifest`.
5. Upload the deliberate key to the `dosenepk` bucket through the established media workflow.
6. Run `npm run verify:sot:local` and `npm run verify:sot:remote`.
7. Confirm audio/video range requests and CORS remain valid.

Do not copy rollback media into the Pages bundle.

## Release to production

Only release when the user explicitly requests it.

1. Commit the approved application changes and push `main`.
2. Run:

```bash
npm run release:cloudflare -- --reason "Release description" --receipt release-slug
```

3. Review the generated receipt.
4. Commit and push only that receipt.
5. Confirm the working tree is clean.

The release command is the authority for gates and Pages verification. Do not bypass it with a
new project, another platform, or a version URL presented as production.

## Diagnose production

Separate these layers:

1. source commit and Pages deployment identity;
2. Pages project domain attachments;
3. Cloudflare authoritative DNS;
4. application apex redirect;
5. R2 media Worker delivery.

Use read-only verification first. Do not change IONOS, DNS, Pages domains, or TLS configuration
without evidence identifying the failing layer and explicit authority for the mutation.
