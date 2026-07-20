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
  assert.match(layout, /openGraph/);
  assert.match(layout, /\/og-ethnocentric\.png/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});
