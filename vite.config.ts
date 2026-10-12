import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { resolve } from "path";
const __dirname = fileURLToPath(new URL(".", import.meta.url));
import dts from "vite-plugin-dts";

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "PushPilot",
      formats: ["es", "cjs", "iife"],
      fileName: (format) => {
        if (format === "es") return "index.js";
        if (format === "cjs") return "index.cjs";
        return "sdk.global.js";
      },
    },
    rollupOptions: {
      external: [],
      output: { exports: "named" },
    },
    sourcemap: true,
    minify: "terser",
    terserOptions: {
      compress: {
        drop_console: false,
      },
    },
  },
  plugins: [
    dts({
      include: ["src/**/*"],
      outDir: "dist",
      bundleTypes: true,
    }),
  ],
  test: {
    globals: true,
    environment: "jsdom",
    exclude: ["**/node_modules/**", "**/dist/**", "**/e2e/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/",
        "dist/",
        "example/",
        "test/",
        "**/*.test.ts",
        "**/*.config.ts",
      ],
    },
  },
});
