import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(root, ".pages-dist");

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(join(root, "dist", "client"), output, { recursive: true });
await cp(join(root, "dist", "server"), join(output, "server"), { recursive: true });
await writeFile(
  join(output, "_worker.js"),
  `import app from "./server/index.js";

export default {
  fetch(request, env, ctx) {
    const pathname = new URL(request.url).pathname;
    if (pathname.startsWith("/assets/")) return env.ASSETS.fetch(request);
    return app.fetch(request, env, ctx);
  },
};
`,
);
// The Cloudflare Vite plugin writes a Worker-deploy redirect for its own
// output. Pages must use the checked-in Pages configuration instead.
await rm(join(root, ".wrangler", "deploy", "config.json"), { force: true });

console.log("Prepared Cloudflare Pages advanced-mode output in .pages-dist");
