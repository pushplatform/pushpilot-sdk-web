import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { resolve } from "path";
const __dirname = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  build: {
    // The package build runs after the main library build. Keep the main
    // entrypoints in dist so the published files match package.json exports.
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, "service-worker/index.ts"),
      name: "PushPlatformServiceWorker",
      // Classic importScripts shares the host worker's global lexical scope.
      // Keep our bindings inside an IIFE, including minified names such as `t`.
      formats: ["iife", "cjs"],
      fileName: (format) => {
        if (format === "iife") return "service-worker.js";
        if (format === "cjs") return "service-worker.cjs";
        return `service-worker.${format}.js`;
      },
    },
    rollupOptions: {
      external: [],
    },
    sourcemap: true,
    minify: "terser",
    terserOptions: {
      compress: {
        drop_console: false,
      },
    },
  },
});
