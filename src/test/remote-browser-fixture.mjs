import http from "node:http";

const port = Number(process.env.VSGO_FIXTURE_PORT || 18768);
const html = `<!doctype html>
<html>
  <head><meta charset="utf-8"><title>VsGo Remote Browser Fixture</title></head>
  <body>
    <main>
      <h1>Remote Browser Fixture</h1>
      <label>Name <input id="name" value="before"></label>
      <button id="increment" type="button">Increment</button>
      <output id="count">0</output>
    </main>
    <script src="/app.js"></script>
  </body>
</html>`;

const script = `document.querySelector("#increment").addEventListener("click",()=>{const output=document.querySelector("#count");output.textContent=String(Number(output.textContent)+1)});window.fixtureReady=true;//# sourceMappingURL=/app.js.map`;
const sourceMap = {
  version: 3,
  file: "app.js",
  sources: ["fixture-original.ts"],
  sourcesContent: [
    "export function installFixture(): void {\n  document.querySelector('#increment')?.addEventListener('click', () => {});\n}\n",
  ],
  names: ["installFixture"],
  mappings: "AAAAA",
};

const server = http.createServer((request, response) => {
  const url = new URL(request.url || "/", `http://127.0.0.1:${port}`);
  if (url.pathname === "/") {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(html);
    return;
  }
  if (url.pathname === "/app.js") {
    response.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
    response.end(script);
    return;
  }
  if (url.pathname === "/app.js.map") {
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(sourceMap));
    return;
  }
  if (url.pathname === "/api/fail") {
    response.writeHead(503, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "fixture failure" }));
    return;
  }
  response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  response.end("not found");
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`fixture-ready:${port}\n`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => server.close(() => process.exit(0)));
}
