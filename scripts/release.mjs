import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PROJECT = "dosen-epk";
const PRODUCTION_BRANCH = "main";
const PAGES_URL = "https://dosen-epk.pages.dev";
const CANONICAL_URL = "https://www.dosen.ca";
const APEX_URL = "https://dosen.ca";
const REQUIRED_DOMAINS = ["dosen-epk.pages.dev", "dosen.ca", "www.dosen.ca"];
const command = process.argv[2];
const args = parseArgs(process.argv.slice(3));

if (!["check", "deploy", "help", "--help", "-h"].includes(command)) {
  usage("Choose either check or deploy.");
}

if (["help", "--help", "-h"].includes(command)) {
  usage();
}

if (command === "check") {
  runReleaseGate();
  console.log("\nRelease checks passed.");
}

if (command === "deploy") {
  if (!args.reason || !args.receipt) {
    usage("Deploy requires --reason and --receipt.");
  }
  assertSafeReceiptSlug(args.receipt);
  const releasedAt = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const releaseDate = releasedAt.slice(0, 10);
  const receiptPath = join(
    root,
    "source-of-truth",
    "releases",
    `${releaseDate}-${args.receipt}.json`,
  );
  await assertReceiptAvailable(receiptPath);
  assertProductionSource();
  runReleaseGate();
  verifyPagesProject();

  const deploymentOutput = run(
    "npx",
    [
      "wrangler",
      "pages",
      "deploy",
      ".pages-dist",
      `--project-name=${PROJECT}`,
      `--branch=${PRODUCTION_BRANCH}`,
      "--commit-dirty=false",
    ],
    { capture: true },
  );
  const deploymentUrl = deploymentOutput.match(
    /https:\/\/[a-f0-9]{8}\.dosen-epk\.pages\.dev/i,
  )?.[0];
  if (!deploymentUrl) fail("Wrangler did not return the expected version deployment URL.");

  const head = git("rev-parse", "HEAD").trim();
  const shortHead = head.slice(0, 7);
  const deployments = run(
    "npx",
    ["wrangler", "pages", "deployment", "list", `--project-name=${PROJECT}`],
    { capture: true },
  );
  const deploymentRow = deployments
    .split("\n")
    .find((line) => line.includes(deploymentUrl));
  if (!deploymentRow) fail("The new deployment was not present in the Pages deployment list.");

  const fields = deploymentRow.split("│").map((field) => field.trim()).filter(Boolean);
  const [deploymentId, environment, branch, source] = fields;
  if (environment !== "Production" || branch !== PRODUCTION_BRANCH || source !== shortHead) {
    fail(`Unexpected deployment identity: ${environment} / ${branch} / ${source}.`);
  }

  const manifestBuffer = await readFile(join(root, "source-of-truth", "media-manifest.json"));
  const mediaManifest = JSON.parse(manifestBuffer);
  const verification = await verifyProduction(deploymentUrl, mediaManifest.objectCount);
  const manifestDigest = createHash("sha256")
    .update(manifestBuffer)
    .digest("hex");
  const receipt = {
    schemaVersion: 1,
    releasedAt,
    reason: args.reason,
    sourceCommit: head,
    repository: {
      url: "https://github.com/dosen-blip/EPK",
      visibility: "public",
      branch: PRODUCTION_BRANCH,
    },
    cloudflarePages: {
      project: PROJECT,
      deploymentId,
      deploymentUrl,
      productionUrl: PAGES_URL,
      canonicalUrl: CANONICAL_URL,
    },
    mediaManifestSha256: manifestDigest,
    verification,
  };

  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx" });
  console.log(`\nProduction deployed: ${deploymentUrl}`);
  console.log(`Release receipt created: ${receiptPath}`);
  console.log("Review, commit, and push the receipt to complete the release record.");
}

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const flag = values[index];
    if (!["--reason", "--receipt"].includes(flag)) usage(`Unknown argument: ${flag}`);
    const value = values[index + 1];
    if (!value || value.startsWith("--")) usage(`Missing value for ${flag}`);
    parsed[flag.slice(2)] = value;
    index += 1;
  }
  return parsed;
}

function assertSafeReceiptSlug(value) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) {
    fail("Receipt slug must use lowercase letters, numbers, and single hyphens.");
  }
}

async function assertReceiptAvailable(path) {
  try {
    await access(path);
    fail(`Release receipt already exists: ${path}`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

function assertProductionSource() {
  if (git("status", "--porcelain").trim()) {
    fail("Production deploy requires a clean working tree.");
  }
  if (git("branch", "--show-current").trim() !== PRODUCTION_BRANCH) {
    fail(`Production deploy must run from ${PRODUCTION_BRANCH}.`);
  }

  run("git", ["fetch", "origin", PRODUCTION_BRANCH]);
  const head = git("rev-parse", "HEAD").trim();
  const remoteHead = git("rev-parse", `origin/${PRODUCTION_BRANCH}`).trim();
  if (head !== remoteHead) {
    fail(`Local ${PRODUCTION_BRANCH} must exactly match origin/${PRODUCTION_BRANCH}.`);
  }
}

function runReleaseGate() {
  run("npm", ["ci"]);
  run("npm", ["test"]);
  run("npm", ["run", "lint"]);
  run("npm", ["run", "build:pages"]);
  run("npm", ["run", "verify:sot:remote"]);
}

function verifyPagesProject() {
  const output = run("npx", ["wrangler", "pages", "project", "list"], { capture: true });
  if (!output.includes(PROJECT)) fail(`Cloudflare Pages project ${PROJECT} was not found.`);
  for (const domain of REQUIRED_DOMAINS) {
    if (!output.includes(domain)) fail(`Cloudflare Pages is missing required domain ${domain}.`);
  }
}

async function verifyProduction(deploymentUrl, mediaObjectCount) {
  const [deployment, pages, canonical, apex] = await Promise.all([
    fetch(deploymentUrl, { redirect: "manual", signal: AbortSignal.timeout(30_000) }),
    fetch(PAGES_URL, { redirect: "manual", signal: AbortSignal.timeout(30_000) }),
    fetch(CANONICAL_URL, { redirect: "manual", signal: AbortSignal.timeout(30_000) }),
    fetch(`${APEX_URL}/release-check?source=codex`, {
      redirect: "manual",
      signal: AbortSignal.timeout(30_000),
    }),
  ]);

  for (const [label, response] of [
    ["deployment", deployment],
    ["stable Pages", pages],
    ["canonical", canonical],
  ]) {
    if (response.status !== 200) fail(`${label} URL returned HTTP ${response.status}.`);
  }

  const expectedRedirect = `${CANONICAL_URL}/release-check?source=codex`;
  if (apex.status !== 301 || apex.headers.get("location") !== expectedRedirect) {
    fail(`Apex redirect changed: HTTP ${apex.status} to ${apex.headers.get("location")}.`);
  }

  const html = await canonical.text();
  for (const marker of ["Persistent set player", "dock-toggle", "--dock-progress"]) {
    if (!html.includes(marker)) fail(`Canonical HTML is missing ${marker}.`);
  }

  return {
    unitAndRenderTests: "passed via npm test",
    remoteMediaObjects: `${mediaObjectCount} passed`,
    deploymentHtml: "HTTP 200",
    pagesHtml: "HTTP 200",
    canonicalHtml: "HTTP 200",
    apexRedirect: `HTTP 301 to ${CANONICAL_URL}/release-check?source=codex`,
    livePersistentPlayer: "present",
  };
}

function git(...gitArgs) {
  return run("git", gitArgs, { capture: true });
}

function run(executable, executableArgs, { capture = false } = {}) {
  console.log(`\n> ${executable} ${executableArgs.join(" ")}`);
  const result = spawnSync(executable, executableArgs, {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      NO_COLOR: "1",
      WRANGLER_LOG_PATH: join(root, ".wrangler", "wrangler.log"),
    },
    stdio: capture ? ["inherit", "pipe", "pipe"] : "inherit",
  });

  if (capture) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
  }
  if (result.error) fail(result.error.message);
  if (result.status !== 0) fail(`${executable} exited with status ${result.status}.`);
  return capture ? `${result.stdout ?? ""}${result.stderr ?? ""}` : "";
}

function usage(error) {
  if (error) console.error(`Error: ${error}\n`);
  console.log(`Usage:
  npm run release:check
  npm run release:cloudflare -- --reason "Release description" --receipt release-slug

The deploy command only targets ${PROJECT} on ${PRODUCTION_BRANCH}. It requires a clean,
pushed branch, runs the complete release gate, verifies project domains, deploys,
checks production routing, and writes a non-overwriting release receipt.`);
  process.exit(error ? 1 : 0);
}

function fail(message) {
  console.error(`\nRelease stopped: ${message}`);
  process.exit(1);
}
