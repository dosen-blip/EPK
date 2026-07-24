import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, readFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(await readFile(join(root, "source-of-truth", "media-manifest.json"), "utf8"));
const content = JSON.parse(await readFile(join(root, "source-of-truth", "content-manifest.json"), "utf8"));
const routing = JSON.parse(await readFile(join(root, "source-of-truth", "production-routing.json"), "utf8"));
const requireLocal = process.argv.includes("--require-local");
const verifyRemote = process.argv.includes("--remote");

assert.equal(manifest.schemaVersion, 1);
assert.equal(manifest.bucket, "dosenepk");
assert.equal(manifest.origin, "https://dosen-media.matiadosen.workers.dev");
assert.equal(manifest.objectCount, manifest.objects.length);
assert.equal(manifest.totalBytes, manifest.objects.reduce((sum, object) => sum + object.bytes, 0));
assert.equal(new Set(manifest.objects.map((object) => object.key)).size, manifest.objectCount);
assert.equal(manifest.objectCount, 121);

assert.equal(content.schemaVersion, 1);
assert.equal(content.mediaOrigin, manifest.origin);
assert.equal(content.transmissionCount, content.transmissions.length);
assert.equal(content.playableSetCount, content.transmissions.filter((item) => item.player).length);
assert.equal(
  content.libraryClipCount,
  content.libraryEvents.reduce((total, event) => total + event.clips.length, 0),
);
assert.equal(new Set(content.transmissions.map((item) => item.id)).size, content.transmissionCount);
assert.equal(new Set(content.transmissions.map((item) => item.slug)).size, content.transmissionCount);
assert.equal(new Set(content.transmissions.map((item) => item.slot)).size, content.transmissionCount);
assert.equal(new Set(content.libraryEvents.map((event) => event.id)).size, content.libraryEvents.length);
assert.equal(content.timelineOrder.length, content.transmissionCount);
assert.deepEqual(
  new Set(content.timelineOrder),
  new Set(content.transmissions.map((item) => item.slug)),
  "timeline must contain every transmission exactly once",
);

const transmissionBySlug = new Map(content.transmissions.map((item) => [item.slug, item]));
const libraryEventById = new Map(content.libraryEvents.map((event) => [event.id, event]));
assert.ok(transmissionBySlug.get(content.defaultFeaturedSetSlug)?.player, "default featured set must be playable");
for (const event of content.libraryEvents) {
  assert.ok(
    content.transmissions.some((item) => item.libraryEventId === event.id),
    `${event.id}: library event must belong to a transmission`,
  );
}

const contentMediaPaths = new Set();
for (const event of content.libraryEvents) {
  assert.ok(event.clips.length > 0, `${event.id}: library event must contain clips`);
  for (const clip of event.clips) {
    assert.ok(["landscape", "portrait"].includes(clip.orientation), `${clip.src}: invalid orientation`);
    assert.ok(!contentMediaPaths.has(clip.src), `${clip.src}: duplicate clip source`);
    contentMediaPaths.add(clip.src);
    contentMediaPaths.add(clip.poster);
  }
}

for (const transmission of content.transmissions) {
  const { artwork, featureVideo, libraryEventId, player } = transmission;
  assert.ok(artwork.vinylCover, `${transmission.slug}: vinyl cover is required`);
  contentMediaPaths.add(artwork.vinylCover);
  if (artwork.eventPoster) contentMediaPaths.add(artwork.eventPoster);

  const libraryEvent = libraryEventId ? libraryEventById.get(libraryEventId) : null;
  if (libraryEventId) assert.ok(libraryEvent, `${transmission.slug}: unknown library event`);
  if (featureVideo) {
    assert.ok(libraryEvent, `${transmission.slug}: featured video requires a library event`);
    assert.ok(
      libraryEvent.clips.some((clip) => clip.src === featureVideo),
      `${transmission.slug}: featured video must belong to its library event`,
    );
  }

  if (player?.kind === "file") {
    assert.ok(player.durationSeconds > 0, `${transmission.slug}: player duration must be positive`);
    contentMediaPaths.add(player.src);
  } else if (player?.kind === "segmented") {
    assert.equal(player.model, "escapade-62-segment");
    for (let index = 0; index < 62; index += 1) {
      contentMediaPaths.add(`/audio/dosen-escapade-ap-${String(index).padStart(3, "0")}.mp3`);
    }
  }
}

const mediaKeys = new Set(manifest.objects.map((object) => object.key));
for (const path of contentMediaPaths) {
  assert.ok(path.startsWith("/"), `${path}: content media path must be origin-relative`);
  assert.ok(mediaKeys.has(path.slice(1)), `${path}: missing from media manifest`);
}
console.log(
  `Content verified: ${content.transmissionCount} transmissions, `
  + `${content.playableSetCount} playable sets, ${content.libraryClipCount} clips`,
);

assert.deepEqual(routing, {
  schemaVersion: 1,
  platform: "cloudflare-pages",
  accountId: "c2491bcbdd23a575e03d8dcf400800de",
  projectName: "dosen-epk",
  productionBranch: "main",
  pagesHostname: "dosen-epk.pages.dev",
  canonicalHostname: "www.dosen.ca",
  redirectHostname: "dosen.ca",
  dnsAuthority: "Cloudflare",
  registrar: "IONOS",
  requiredDns: {
    www: {
      type: "CNAME",
      name: "www",
      target: "dosen-epk.pages.dev",
      proxied: true,
    },
    apex: {
      type: "CNAME",
      name: "@",
      target: "dosen-epk.pages.dev",
      proxied: true,
      flattened: true,
    },
  },
  releasePolicy: {
    reuseProject: true,
    customDomainIsProjectLevel: true,
    deployEveryMainUpdateToProduction: true,
    alternateDeploymentPlatformsAllowed: false,
  },
});
assert.equal(await exists(join(root, ".openai", "hosting.json")), false, "ChatGPT Sites hosting config must remain absent");
console.log(`Production routing verified: ${routing.canonicalHostname} -> ${routing.projectName} (${routing.platform})`);

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
const localPresence = await Promise.all(
  manifest.objects.map((object) => exists(join(publicRoot, ...object.key.split("/")))),
);
if (localPresence.every(Boolean)) {
  for (const object of manifest.objects) {
    const path = join(publicRoot, ...object.key.split("/"));
    const details = await stat(path);
    assert.equal(details.size, object.bytes, `${object.key}: local byte count changed`);
    assert.equal(await sha256(path), object.sha256, `${object.key}: local SHA-256 changed`);
  }
  console.log(`Local media verified: ${manifest.objectCount} objects, ${manifest.totalBytes} bytes`);
} else if (requireLocal) {
  const missingCount = localPresence.filter((present) => !present).length;
  throw new Error(`public/ rollback media is incomplete (${missingCount} objects missing)`);
} else {
  console.log("Complete local rollback library absent; manifest integrity checks passed");
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
