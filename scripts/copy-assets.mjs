import { copyFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("..", import.meta.url));
const destination = resolve(
  process.argv[2] || resolve(root, "example"),
  "vendor",
);
await mkdir(destination, { recursive: true });
for (const name of ["sdk.global.js", "service-worker.js"]) {
  await copyFile(resolve(root, "dist", name), resolve(destination, name));
}
console.log(`SDK assets copied to ${destination}`);
