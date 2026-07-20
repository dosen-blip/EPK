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
  assert.match(html, /Signal archive/);
  assert.match(html, /Built for the late hours\./);
  assert.match(html, /Recent frequency/);
  assert.match(html, /Lock the signal\./);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("keeps placeholder media explicit and replaceable", async () => {
  const [page, layout, css, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  for (const slot of [
    "hero-loop",
    "hero-escapade",
    "offgrid-anniversary",
    "solstice-frequency",
    "offgrid-halloween",
  ]) {
    assert.match(page, new RegExp(slot));
  }

  assert.match(page, /MEDIA PENDING/);
  assert.match(page, /ADD BEFORE LAUNCH/);
  assert.match(page, /Array\.from\(\{ length: 31 \}/);
  assert.match(page, /dosen-escapade-ap-\$\{String\(index\)\.padStart\(3, "0"\)\}\.mp3/);
  assert.doesNotMatch(page, /\/audio\/dosen-escapade-ap\.mp3/);
  assert.match(page, /\/media\/escapade-ap-cover\.png/);
  assert.match(page, /PLAY FULL SET/);
  assert.match(page, /320 KBPS/);
  assert.match(page, /Seek through Escapade opening set/);
  assert.doesNotMatch(page, /PLACEHOLDER AUDIO|Pause placeholder player|Play placeholder player/);
  assert.match(page, /className="hero-mark">DOSEN<\/h1>/);
  assert.doesNotMatch(page, /dosen-wordmark|wordmark-on-dark|wordmark-on-light/);
  assert.match(layout, /openGraph/);
  assert.match(layout, /\/og-ethnocentric\.png/);
  assert.match(css, /font-family:\s*"Ethnocentric"/);
  assert.match(css, /\/fonts\/Ethnocentric-Regular\.otf/);
  assert.doesNotMatch(css, /dosen-wordmark/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  await access(new URL("../public/fonts/Ethnocentric-Regular.otf", import.meta.url));
});
