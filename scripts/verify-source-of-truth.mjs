import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, readFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(await readFile(join(root, "source-of-truth", "media-manifest.json"), "utf8"));
const requireLocal = process.argv.includes("--require-local");
const verifyRemote = process.argv.includes("--remote");

assert.equal(manifest.schemaVersion, 1);
assert.equal(manifest.bucket, "dosenepk");
assert.equal(manifest.origin, "https://dosen-media.matiadosen.workers.dev");
assert.equal(manifest.objectCount, manifest.objects.length);
assert.equal(manifest.totalBytes, manifest.objects.reduce((sum, object) => sum + object.bytes, 0));
assert.equal(new Set(manifest.objects.map((object) => object.key)).size, manifest.objectCount);
assert.equal(manifest.objectCount, 120);

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function sha256(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

const publicRoot = join(root, "public");
if (await exists(publicRoot)) {
  for (const object of manifest.objects) {
    const path = join(publicRoot, ...object.key.split("/"));
    const details = await stat(path);
    assert.equal(details.size, object.bytes, `${object.key}: local byte count changed`);
    assert.equal(await sha256(path), object.sha256, `${object.key}: local SHA-256 changed`);
  }
  console.log(`Local media verified: ${manifest.objectCount} objects, ${manifest.totalBytes} bytes`);
} else if (requireLocal) {
  throw new Error("public/ rollback media is required for this verification run");
} else {
  console.log("Local rollback media absent; manifest integrity checks passed");
}

async function verifyRemoteObject(object) {
  const headers = { Range: "bytes=0-0" };
  const response = await fetch(object.url, { headers });
  assert.equal(response.status, 206, `${object.key}: unexpected HTTP status`);
  assert.equal(response.headers.get("access-control-allow-origin"), "*", `${object.key}: CORS changed`);
  assert.equal(response.headers.get("content-type")?.split(";")[0], object.contentType, `${object.key}: MIME type changed`);
  assert.equal(response.headers.get("content-range"), `bytes 0-0/${object.bytes}`, `${object.key}: range size changed`);
  await response.body?.cancel();
}

if (verifyRemote) {
  const queue = [...manifest.objects];
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (queue.length) await verifyRemoteObject(queue.shift());
  }));
  console.log(`R2 delivery verified: ${manifest.objectCount} objects available at the canonical origin`);
}

const page = await readFile(join(root, "app", "page.tsx"), "utf8");
const css = await readFile(join(root, "app", "globals.css"), "utf8");
assert.match(page, /backdropFilter: "blur\(13px\)"/);
assert.match(page, /WebkitBackdropFilter: "blur\(13px\)"/);
assert.match(page, /hero-film-matte hero-film-matte-top/);
assert.match(page, /hero-film-matte hero-film-matte-bottom/);
assert.match(css, /\.hero-film-matte \{ display: none; \}/);
console.log("Hero watermark masking contract verified");
