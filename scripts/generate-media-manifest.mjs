import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readdir, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const publicRoot = join(root, "public");
const output = join(root, "source-of-truth", "media-manifest.json");
const origin = "https://dosen-media.matiadosen.workers.dev";
const pagesLocalAssets = new Set(["favicon.svg", "og-dosen-wordmark.png"]);

const contentTypes = {
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".otf": "font/otf",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    if (entry.isFile()) files.push(path);
  }
  return files;
}

async function sha256(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

const objects = [];
for (const path of await walk(publicRoot)) {
  const key = relative(publicRoot, path).split("\\").join("/");
  if (pagesLocalAssets.has(key)) continue;
  const details = await stat(path);
  objects.push({
    key,
    bytes: details.size,
    sha256: await sha256(path),
    contentType: contentTypes[extname(path).toLowerCase()] ?? "application/octet-stream",
    url: `${origin}/${key.split("/").map(encodeURIComponent).join("/")}`,
  });
}

const manifest = {
  schemaVersion: 1,
  authority: "Cloudflare R2",
  bucket: "dosenepk",
  deliveryWorker: "dosen-media",
  origin,
  cacheControl: "public, max-age=31536000, immutable",
  objectCount: objects.length,
  totalBytes: objects.reduce((sum, object) => sum + object.bytes, 0),
  hashAlgorithm: "sha256",
  objects,
};

await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote ${objects.length} objects (${manifest.totalBytes} bytes) to ${relative(root, output)}`);
