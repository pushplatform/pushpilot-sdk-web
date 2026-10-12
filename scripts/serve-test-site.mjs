import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
const { root } = JSON.parse(
  await readFile(new URL("../.artifacts/site.json", import.meta.url), "utf8"),
);
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
};
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(
      new URL(request.url, "http://localhost").pathname,
    );
    if (pathname === "/existing-worker.js") {
      response.setHeader("Content-Type", types[".js"]);
      response.setHeader("Cache-Control", "no-store");
      response.end(
        await readFile(
          new URL("../test/e2e/fixtures/existing-worker.js", import.meta.url),
        ),
      );
      return;
    }
    const path = resolve(
      root,
      `.${pathname === "/" ? "/index.html" : pathname}`,
    );
    if (!path.startsWith(root + sep)) throw new Error("Invalid path");
    response.setHeader(
      "Content-Type",
      types[extname(path)] || "application/octet-stream",
    );
    response.setHeader("Cache-Control", "no-store");
    response.end(await readFile(path));
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
});
server.listen(3000, "127.0.0.1", () =>
  console.log("Clean package consumer served on http://127.0.0.1:3000"),
);
