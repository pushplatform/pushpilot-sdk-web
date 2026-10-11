import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cp, mkdir, mkdtemp, realpath, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const artifacts = resolve(root, ".artifacts");
await mkdir(artifacts, { recursive: true });
const run = (program, args, cwd = root) => {
  try {
    return execFileSync(program, args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
    });
  } catch (error) {
    if (error.stdout) console.error(error.stdout);
    throw new Error(`${program} ${args[0]} failed (exit ${error.status})`);
  }
};
console.log(run("npm", ["run", "build"]));
const [pack] = JSON.parse(
  run("npm", [
    "pack",
    "--ignore-scripts",
    "--json",
    "--pack-destination",
    artifacts,
  ]),
);
const names = new Set(pack.files.map((file) => file.path));
for (const name of [
  "dist/index.js",
  "dist/index.cjs",
  "dist/index.d.ts",
  "dist/index.d.cts",
  "dist/sdk.global.js",
  "dist/service-worker.js",
  "dist/service-worker.cjs",
  "LICENSE",
  "README.md",
  "docs/API.md",
  "example/index.html",
  "example/npm.html",
  "example/main.js",
  "example/service-worker.js",
  "scripts/copy-assets.mjs",
]) {
  assert(names.has(name), `Missing package file: ${name}`);
}
for (const name of names) {
  assert(
    /^(dist\/|docs\/(API|WEB_SDK_RELEASE)\.md$|example\/(index\.html|npm\.html|main\.js|service-worker\.js|README\.md)$|scripts\/copy-assets\.mjs$|package\.json$|README\.md$|CHANGELOG\.md$|LICENSE$)/.test(
      name,
    ),
    `Unexpected package file: ${name}`,
  );
}
const consumer = await realpath(
  await mkdtemp(resolve(tmpdir(), "pushpilot-web-sdk-consumer-")),
);
await writeFile(
  resolve(consumer, "package.json"),
  JSON.stringify({
    name: "pushpilot-clean-site",
    private: true,
    type: "module",
  }),
);
console.log(
  run(
    "npm",
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--package-lock=false",
      resolve(artifacts, pack.filename),
    ],
    consumer,
  ),
);
console.log(
  run(
    "node",
    [
      "--input-type=module",
      "-e",
      "import { PushPlatform, PushPilot } from '@pushplatform/web-sdk'; if (PushPlatform !== PushPilot || typeof PushPlatform.initialize !== 'function') throw Error('ESM export');",
    ],
    consumer,
  ),
);
console.log(
  run(
    "node",
    [
      "-e",
      "const { PushPlatform } = require('@pushplatform/web-sdk'); if (typeof PushPlatform.initialize !== 'function') throw Error('CJS export');",
    ],
    consumer,
  ),
);
for (const extension of ["mts", "cts"]) {
  await writeFile(
    resolve(consumer, `types.${extension}`),
    "import { PushPlatform, type PushPlatformConfig } from '@pushplatform/web-sdk'; const config: PushPlatformConfig = { apiKey: 'demo', applicationId: 'demo', apiBaseURL: 'http://localhost', serviceWorkerScope: '/' }; void PushPlatform.initialize(config);\n",
  );
}
console.log(
  run(
    "node",
    [
      resolve(root, "node_modules/typescript/bin/tsc"),
      "--noEmit",
      "--module",
      "NodeNext",
      "--moduleResolution",
      "NodeNext",
      "--target",
      "ES2020",
      "types.mts",
      "types.cts",
    ],
    consumer,
  ),
);
const installed = resolve(consumer, "node_modules/@pushplatform/web-sdk");
for (const file of ["index.html", "npm.html", "main.js"]) {
  await cp(resolve(installed, "example", file), resolve(consumer, file));
}
await mkdir(resolve(consumer, "public"), { recursive: true });
await cp(
  resolve(installed, "example/service-worker.js"),
  resolve(consumer, "public/service-worker.js"),
);
console.log(
  run(
    "node",
    [
      resolve(installed, "scripts/copy-assets.mjs"),
      resolve(consumer, "public"),
    ],
    consumer,
  ),
);
// The npm example resolves the installed tarball, with no alias to repository source.
await build({
  configFile: false,
  root: consumer,
  publicDir: "public",
  build: {
    outDir: "dist",
    rollupOptions: {
      input: {
        script: resolve(consumer, "index.html"),
        npm: resolve(consumer, "npm.html"),
      },
    },
  },
});
await writeFile(
  resolve(artifacts, "site.json"),
  JSON.stringify({ root: resolve(consumer, "dist") }, null, 2),
);
await writeFile(
  resolve(artifacts, "pack-report.json"),
  JSON.stringify(pack, null, 2),
);
console.log(
  `Verified ${pack.filename}: ${pack.files.length} files, ${pack.size} bytes; ESM/CJS/types and clean site build passed.`,
);
