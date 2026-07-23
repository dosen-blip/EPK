import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the DOSEN EPK scaffold", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>DOSEN — Electronic Press Kit<\/title>/i);
  assert.match(html, /Selected sets/);
  assert.match(html, /ESCAPADE OFFICIAL AFTERPARTY/);
  assert.match(html, /SELECT A SET/);
  assert.match(html, /Ottawa DJ playing tech house, house, trance, and techno\./);
  assert.match(html, /Recent dates/);
  assert.match(html, /Make a night of it\./);
  assert.ok(html.indexOf("SELECT A SET") < html.indexOf("Selected sets"));
  assert.ok(html.indexOf('href="#signal">Listen') < html.indexOf('href="#archive">Sets'));
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("keeps production media and visual treatments explicit", async () => {
  await Promise.all([
    access(new URL("../dist/client/favicon.svg", import.meta.url)),
    access(new URL("../dist/client/og-dosen-wordmark.png", import.meta.url)),
  ]);

  const [
    page,
    contentAdapter,
    playerModel,
    layout,
    css,
    favicon,
    packageJson,
    manifestJson,
    contentManifestJson,
    routingJson,
    viteConfig,
    workerEntry,
    releaseScript,
  ] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/content.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/player-model.mjs", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../public/favicon.svg", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../source-of-truth/media-manifest.json", import.meta.url), "utf8"),
    readFile(new URL("../source-of-truth/content-manifest.json", import.meta.url), "utf8"),
    readFile(new URL("../source-of-truth/production-routing.json", import.meta.url), "utf8"),
    readFile(new URL("../vite.config.ts", import.meta.url), "utf8"),
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../scripts/release.mjs", import.meta.url), "utf8"),
  ]);
  const manifest = JSON.parse(manifestJson);
  const content = JSON.parse(contentManifestJson);
  const routing = JSON.parse(routingJson);
  const mediaKeys = new Set(manifest.objects.map((object) => object.key));
  const transmissions = new Map(content.transmissions.map((item) => [item.slug, item]));
  assert.equal(routing.platform, "cloudflare-pages");
  assert.equal(routing.projectName, "dosen-epk");
  assert.equal(routing.canonicalHostname, "www.dosen.ca");
  assert.equal(routing.redirectHostname, "dosen.ca");
  assert.equal(routing.dnsAuthority, "Cloudflare");
  assert.equal(routing.requiredDns.www.target, "dosen-epk.pages.dev");
  assert.equal(routing.requiredDns.apex.target, "dosen-epk.pages.dev");
  assert.doesNotMatch(viteConfig, /sites-vite-plugin|hosting\.json/);
  assert.match(workerEntry, /url\.hostname === "dosen\.ca"/);
  assert.match(workerEntry, /url\.hostname = "www\.dosen\.ca"/);
  assert.match(workerEntry, /Response\.redirect\(url\.toString\(\), 301\)/);
  assert.match(releaseScript, /const PROJECT = "dosen-epk"/);
  assert.match(releaseScript, /const PRODUCTION_BRANCH = "main"/);
  assert.match(releaseScript, /--commit-dirty=false/);
  assert.match(releaseScript, /writeFile\(receiptPath,[\s\S]*flag: "wx"/);
  assert.doesNotMatch(releaseScript, /pages", "project", "create/);
  assert.match(packageJson, /"release:check": "node scripts\/release\.mjs check"/);
  assert.match(packageJson, /"release:cloudflare": "node scripts\/release\.mjs deploy"/);
  assert.ok(mediaKeys.has("media/profile/dosen-headshot-2026.jpeg"));
  assert.match(page, /className="press-headshot"/);
  assert.match(page, /DOSEN \/ ARTIST PORTRAIT/);
  assert.match(page, /SELECT A SET/);
  assert.match(page, /className="dock-toggle"/);
  assert.match(page, /--dock-progress/);
  assert.match(css, /\.signal-dock \{[^}]*border-radius: 23px/);
  assert.match(css, /\.progress::\-webkit-slider-runnable-track \{[^}]*border-radius: 999px/);
  assert.equal(content.schemaVersion, 1);
  assert.equal(content.transmissionCount, 6);
  assert.equal(content.playableSetCount, 5);
  assert.equal(content.libraryClipCount, 18);
  assert.equal(content.defaultFeaturedSetSlug, "escapade-afterparty");
  assert.match(contentAdapter, /rawContentManifest/);
  assert.match(contentAdapter, /contentManifest\.transmissions/);
  assert.doesNotMatch(page, /const transmissions\s*=/);

  for (const slot of [
    "hero-escapade",
    "offgrid-anniversary",
    "solstice-frequency",
    "frequency-shift",
    "offgrid-halloween",
  ]) {
    assert.ok(content.transmissions.some((item) => item.slot === slot), `content manifest is missing ${slot}`);
  }

  assert.match(page, /Open video library/);
  assert.match(page, /SET DOSSIER/);
  assert.match(page, /DossierVinylPlayer/);
  assert.match(page, /dossier-vinyl-player/);
  assert.match(page, /selectedPlayableSet &&/);
  assert.match(page, /className="set-dossier-main"/);
  assert.doesNotMatch(page, /set-dossier-audio/);
  assert.match(page, /SET LIBRARY/);
  assert.match(page, /archiveLibraryOpen/);
  assert.doesNotMatch(page, /ArchiveMode|mode-switch|LOOSE \/|COMPACT \/|setMode/);
  assert.match(page, /VIEW ALL \{selectedLibraryEvent\.clips\.length\} EVENT VIDEOS/);
  assert.match(page, /window\.history\.pushState/);
  assert.ok(transmissions.has("off-grid-1-year"));
  assert.equal(
    transmissions.get("off-grid-1-year").player.src,
    "/audio/off-grid-1-year-dosen-b2b-fastr.mp3",
  );
  assert.ok(transmissions.has("escapade-afterparty"));
  assert.match(page, /autoPlay/);
  assert.match(page, /playsInline/);
  assert.match(page, /\/media\/hero\/hero-desktop-v1\.mp4/);
  assert.match(page, /\/media\/hero\/hero-mobile-v1\.mp4/);
  assert.match(page, /hero-film-matte hero-film-matte-top/);
  assert.match(page, /hero-film-matte hero-film-matte-bottom/);
  assert.match(page, /backdropFilter: "blur\(13px\)"/);
  assert.match(page, /WebkitBackdropFilter: "blur\(13px\)"/);
  assert.match(css, /\.hero-film-matte \{ display: none; \}/);
  assert.doesNotMatch(page, /PERFORMANCE REEL|LOADING FILM|hero-film-placeholder/);
  assert.match(page, /FULL CLIP LIBRARY \/ ORIGINAL AUDIO/);
  assert.equal(content.mediaOrigin, "https://dosen-media.matiadosen.workers.dev");
  assert.match(contentAdapter, /MEDIA_ORIGIN = contentManifest\.mediaOrigin/);
  assert.match(page, /audio\.src = mediaUrl\(segment\.src\)/);
  assert.match(page, /src=\{mediaUrl\(activeSegments\[0\]\.src\)\}/);
  assert.match(page, /PROFESSIONAL MEDIA/);
  assert.match(page, /SOCIAL MEDIA POST/);
  assert.doesNotMatch(page, /ORIGINAL AUDIO \/ FULL CLIP/);
  assert.match(page, /const clipLabel = `\$\{eventTitle\} CLIP \$\{clipNumber\}`/);
  assert.match(page, /startIndex=\{landscapeClips\.length\}/);
  assert.match(page, /controls/);
  assert.match(page, /mailto:matiadosen@outlook\.com/);
  assert.match(page, /ARTIST PROFILE \/ OFFICIAL BIO/);
  assert.doesNotMatch(page, /WORKING COPY|DRAFT|FINAL APPROVAL|ADD BEFORE LAUNCH|EPK PREVIEW|IN PROGRESS/);
  assert.match(playerModel, /Array\.from\(\{ length: 62 \}/);
  assert.match(playerModel, /dosen-escapade-ap-\$\{String\(index\)\.padStart\(3, "0"\)\}\.mp3/);
  assert.doesNotMatch(page, /\/audio\/dosen-escapade-ap\.mp3/);
  assert.equal(
    transmissions.get("escapade-afterparty").artwork.vinylCover,
    "/media/escapade-ap-cover.png",
  );
  assert.match(page, /transmitting \? "PAUSE" : "PLAY"/);
  assert.match(page, /function PlaybackIcon/);
  assert.doesNotMatch(page, /▶|Ⅱ/);
  assert.match(page, /320 KBPS/);
  assert.match(page, /Seek through \$\{activeSet\.title\}/);
  assert.match(page, /data-active-set/);
  assert.match(page, /signalSectionRef/);
  assert.match(page, /IntersectionObserver/);
  assert.match(page, /set-selector-track/);
  assert.match(page, /aria-pressed=\{isActive\}/);
  assert.equal(
    transmissions.get("off-grid-frequency-shift").artwork.vinylCover,
    "/media/dossiers/off-grid-frequency-shift-soundcloud.png",
  );
  assert.equal(
    transmissions.get("off-grid-halloweekend").artwork.vinylCover,
    "/media/dossiers/off-grid-halloweekend-soundcloud.png",
  );
  assert.equal(
    transmissions.get("off-grid-frequency-shift").artwork.eventPoster,
    "/media/dossiers/off-grid-frequency-shift-poster.jpg",
  );
  assert.equal(
    transmissions.get("off-grid-halloweekend").artwork.eventPoster,
    "/media/dossiers/off-grid-halloweekend-poster.jpeg",
  );
  assert.match(contentAdapter, /function getEventArtwork/);
  assert.match(contentAdapter, /set\.artwork\.eventPoster \?\? set\.artwork\.vinylCover/);
  assert.match(page, /mediaUrl\(getEventArtwork\(item\)\)/);
  assert.match(page, /mediaUrl\(getEventArtwork\(selectedSet\)\)/);
  assert.match(page, /mediaUrl\(set\.artwork\.vinylCover\)/);
  assert.doesNotMatch(page, /mediaUrl\(set\.artwork\.eventPoster\)/);
  assert.match(page, /selectedFeaturedClip\.orientation/);
  assert.match(css, /\.set-dossier-media\.is-portrait video/);
  assert.match(page, /event-visual-lightbox/);
  assert.match(page, /setEventVisualOpen\(true\)/);
  assert.match(page, /Close \$\{selectedSet\.title\} event visual/);
  assert.match(page, /createSingleFileSegments/);
  assert.match(page, /fadeAudio\(audio, 0, 180/);
  assert.match(page, /fadeAudio\(audio, 1, 320/);
  assert.doesNotMatch(page, /PLACEHOLDER AUDIO|Pause placeholder player|Play placeholder player/);
  assert.match(page, /className="hero-mark">DOSEN<\/h1>/);
  assert.doesNotMatch(page, /dosen-wordmark|wordmark-on-dark|wordmark-on-light/);
  assert.match(layout, /openGraph/);
  assert.match(layout, /\/og-dosen-wordmark\.png/);
  assert.match(layout, /width: 1262, height: 718/);
  assert.match(layout, /alt: "DOSEN wordmark"/);
  assert.match(layout, /\/favicon\.svg/);
  assert.match(favicon, /DOSEN D monogram/);
  assert.match(css, /font-family:\s*"Ethnocentric"/);
  assert.match(css, /https:\/\/dosen-media\.matiadosen\.workers\.dev\/fonts\/Ethnocentric-Regular\.otf/);
  assert.doesNotMatch(css, /dosen-wordmark/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  for (const key of [
    "fonts/Ethnocentric-Regular.otf",
    "media/hero/hero-desktop-v1.mp4",
    "media/hero/hero-mobile-v1.mp4",
    "media/dossiers/off-grid-halloween.jpg",
    "media/dossiers/off-grid-halloweekend-soundcloud.png",
    "media/dossiers/off-grid-halloweekend-poster.jpeg",
    "media/dossiers/off-grid-anniversary-soundcloud.png",
    "media/dossiers/off-grid-1-year-poster.jpg",
    "media/dossiers/solstice-frequency-poster.png",
    "media/dossiers/off-grid-frequency-shift-soundcloud.png",
    "media/dossiers/off-grid-frequency-shift-poster.jpg",
    "media/dossiers/exosphere-002-sky-lounge-cover.png",
    "audio/offgrid-032.mp3",
    "audio/off-grid-1-year-dosen-b2b-fastr.mp3",
    "audio/offgrid-x-frequency-shift.mp3",
    "audio/exosphere-002-sky-lounge.mp3",
  ]) {
    assert.ok(mediaKeys.has(key), `media manifest is missing ${key}`);
  }
  for (const clip of [
    "off-grid-anniversary-2",
    "off-grid-anniversary-3",
    "off-grid-anniversary-4",
    "off-grid-anniversary-5",
    "off-grid-anniversary-6",
    "off-grid-anniversary-7",
    "off-grid-anniversary-8",
    "off-grid-anniversary-9",
    "off-grid-blue-crowd-vertical",
    "off-grid-blue-room-vertical",
    "off-grid-red-decks-vertical",
    "frequency-shift-jan-03-1",
    "frequency-shift-jan-03-2",
    "frequency-shift-jan-03-3",
    "solstice-frequency-1",
    "solstice-frequency-2",
    "solstice-frequency-4",
    "solstice-magenta-room-vertical",
  ]) {
    assert.ok(mediaKeys.has(`media/library/${clip}.mp4`), `media manifest is missing ${clip}.mp4`);
    assert.ok(mediaKeys.has(`media/library/posters/${clip}.jpg`), `media manifest is missing ${clip}.jpg`);
  }
});
