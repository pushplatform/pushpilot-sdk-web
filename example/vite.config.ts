import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("..", import.meta.url));
export default defineConfig({
  root,
  server: { host: "127.0.0.1", port: 3000, strictPort: true, open: false },
  resolve: { alias: { "@pushplatform/web-sdk": `${root}/dist/index.js` } },
});
