import { cp, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(root, "dist", "client");

await mkdir(output, { recursive: true });

for (const filename of ["favicon.svg", "og-dosen-wordmark.png"]) {
  await cp(join(root, "public", filename), join(output, filename));
}
