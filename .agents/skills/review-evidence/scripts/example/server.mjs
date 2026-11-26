import { createServer } from "node:http";
import { readFile } from "node:fs/promises";

const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
const server = createServer((request, response) => {
  const url = new URL(request.url, "http://127.0.0.1");
  if (!["/", "/before", "/after"].includes(url.pathname)) {
    response.writeHead(404).end();
    return;
  }
  const variant = url.pathname === "/before" ? "before" : "after";
  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  response.end(page.replace('data-variant="after"', `data-variant="${variant}"`));
});
server.listen(Number(process.argv[2] ?? 4173), "127.0.0.1", () => {
  console.log(`Demo listening on http://127.0.0.1:${server.address().port}`);
});
