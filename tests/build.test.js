"use strict";

const assert = require("assert");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { spawnSync } = require("child_process");
const { createServer, createStore } = require("../server");
const { minifyHtml } = require("../scripts/build");

const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");

async function main() {
  const build = spawnSync(process.execPath, ["scripts/build.js"], {
    cwd: rootDir,
    encoding: "utf8",
    shell: false
  });
  assert.strictEqual(build.status, 0, build.stderr || build.stdout);

  const manifest = readJson(path.join(distDir, "build-manifest.json"));
  assert.deepStrictEqual(manifest.scripts, [
    "src/core.js",
    "src/structure.js",
    "src/layout.js",
    "src/alignment.js",
    "src/calibration.js",
    "src/api-client.js",
    "src/mock-svg.js",
    "src/state.js",
    "src/thread.js",
    "src/service.js",
    "src/quality.js",
    "src/render.js",
    "src/download.js",
    "src/files.js",
    "src/preview-strategy.js",
    "src/app.js"
  ]);
  assert.strictEqual(manifest.stylesheet, "styles.css");

  const html = readText(path.join(distDir, "index.html"));
  assert.match(html, /assets\/chatimage\.[a-f0-9]{10}\.min\.css/);
  assert.match(html, /assets\/chatimage\.[a-f0-9]{10}\.min\.js/);
  assert.doesNotMatch(html, /src\/app\.js/);
  assert.doesNotMatch(html, /styles\.css/);
  assert.doesNotMatch(html, /\n\s+</);
  assert.strictEqual(html, html.trim());
  assert.strictEqual(minifyHtml("<main>\n  <section>Test</section>\n</main>"), "<main><section>Test</section></main>");

  const scriptPath = path.join(distDir, manifest.outputs.script);
  const scriptMapPath = path.join(distDir, manifest.outputs.scriptMap);
  const stylePath = path.join(distDir, manifest.outputs.stylesheet);
  const styleMapPath = path.join(distDir, manifest.outputs.stylesheetMap);
  const fontPath = path.join(distDir, "assets", "fonts", "LXGWWenKaiMono-Medium.ttf");
  for (const filePath of [scriptPath, scriptMapPath, stylePath, styleMapPath, fontPath]) {
    assert.ok(fs.existsSync(filePath), `${filePath} should exist`);
    assert.ok(fs.statSync(filePath).size > 100, `${filePath} should not be empty`);
  }

  const bundle = readText(scriptPath);
  assert.match(bundle, /ChatImageThread/);
  assert.match(bundle, /ChatImageDownload/);
  assert.match(bundle, /ChatImageFiles/);
  assert.match(bundle, /sourceMappingURL=/);
  const sourceMap = readJson(scriptMapPath);
  assert.ok(sourceMap.sources.includes("src/app.js"));
  assert.ok(sourceMap.sourcesContent.some((content) => content.includes("window.ChatImageTestHooks")));
  assert.ok(sourceMap.mappings.length > 100);
  const style = readText(stylePath);
  assert.match(style, /ChatImage LXGW WenKai Mono/);
  assert.match(style, /LXGWWenKaiMono-Medium\.ttf/);

  await testServingDist(manifest);
  console.log("build.test.js passed");
}

async function testServingDist(manifest) {
  const store = createStore(":memory:");
  const server = createServer({
    port: 0,
    apiKey: "",
    textModel: "gpt-5.5",
    imageModel: "GPT-Image-2",
    staticDir: distDir,
    store
  });

  await listen(server);
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const index = await fetch(`${baseUrl}/`);
    assert.strictEqual(index.status, 200);
    const html = await index.text();
    assert.match(html, new RegExp(escapeRegex(manifest.outputs.script)));

    const script = await fetch(`${baseUrl}/${manifest.outputs.script}`);
    assert.strictEqual(script.status, 200);
    assert.strictEqual(script.headers.get("content-type"), "text/javascript; charset=utf-8");

    const font = await fetch(`${baseUrl}/assets/fonts/LXGWWenKaiMono-Medium.ttf`);
    assert.strictEqual(font.status, 200);
    assert.strictEqual(font.headers.get("content-type"), "font/ttf");
    assert.ok((await font.arrayBuffer()).byteLength > 1_000_000);

    const traversalStatus = await getStatusRaw(port, "/%2e%2e%2fserver.js");
    assert.strictEqual(traversalStatus, 403);
  } finally {
    await close(server);
    store.close();
  }
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function readJson(filePath) {
  return JSON.parse(readText(filePath));
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    if (typeof server.closeIdleConnections === "function") server.closeIdleConnections();
    server.close((error) => (error ? reject(error) : resolve()));
    if (typeof server.closeAllConnections === "function") server.closeAllConnections();
  });
}

function getStatusRaw(port, requestPath) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        path: requestPath,
        method: "GET"
      },
      (res) => {
        res.resume();
        res.on("end", () => resolve(res.statusCode));
      }
    );
    req.on("error", reject);
    req.end();
  });
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
