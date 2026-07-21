import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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
  assert.match(html, /CHOOSE A SET/);
  assert.match(html, /Recent dates/);
  assert.match(html, /Make a night of it\./);
  assert.ok(html.indexOf("CHOOSE A SET") < html.indexOf("Selected sets"));
  assert.ok(html.indexOf('href="#signal">Listen') < html.indexOf('href="#archive">Sets'));
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("keeps production media and visual treatments explicit", async () => {
  const [page, playerModel, layout, css, favicon, packageJson, manifestJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/player-model.mjs", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../public/favicon.svg", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../source-of-truth/media-manifest.json", import.meta.url), "utf8"),
  ]);
  const manifest = JSON.parse(manifestJson);
  const mediaKeys = new Set(manifest.objects.map((object) => object.key));

  for (const slot of [
    "hero-escapade",
    "offgrid-anniversary",
    "solstice-frequency",
    "frequency-shift",
    "offgrid-halloween",
  ]) {
    assert.match(page, new RegExp(slot));
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
  assert.match(page, /VIEW ALL EVENT MEDIA/);
  assert.match(page, /window\.history\.pushState/);
  assert.match(page, /off-grid-1-year/);
  assert.match(page, /off-grid-1-year-dosen-b2b-fastr\.mp3/);
  assert.match(page, /escapade-afterparty/);
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
  assert.match(page, /const MEDIA_ORIGIN = "https:\/\/dosen-media\.matiadosen\.workers\.dev"/);
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
  assert.match(page, /\/media\/escapade-ap-cover\.png/);
  assert.match(page, /transmitting \? "PAUSE" : "PLAY"/);
  assert.match(page, /320 KBPS/);
  assert.match(page, /Seek through \$\{activeSet\.title\}/);
  assert.match(page, /data-active-set/);
  assert.match(page, /signalSectionRef/);
  assert.match(page, /IntersectionObserver/);
  assert.match(page, /set-selector-track/);
  assert.match(page, /aria-pressed=\{isActive\}/);
  assert.match(page, /off-grid-frequency-shift-soundcloud\.png/);
  assert.match(page, /off-grid-halloweekend-soundcloud\.png/);
  assert.match(page, /off-grid-frequency-shift-poster\.jpg/);
  assert.match(page, /off-grid-halloweekend-poster\.jpeg/);
  assert.match(page, /item\.cardPoster \?\? item\.poster/);
  assert.match(page, /selectedSet\.eventPoster \?\? selectedSet\.cardPoster \?\? selectedSet\.poster/);
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
  assert.match(layout, /https:\/\/dosen-media\.matiadosen\.workers\.dev/);
  assert.match(layout, /\/og-ethnocentric\.png/);
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
