"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { cacheRemoteImage, isRemoteHttpUrl, guessExtensionFromUrl } = require("../server/image-cache");
const { createServer } = require("../server");

function listen(server) {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

function makeImageResponse(buffer, contentType) {
  return {
    ok: true,
    headers: { get: (name) => (name.toLowerCase() === "content-type" ? contentType : null) },
    arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
  };
}

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "chatimage-cache-test-"));
}

async function testCachesRemoteImageToDisk() {
  const cacheDir = makeTempDir();
  try {
    const png = Buffer.from("fake-png-bytes-1");
    const result = await cacheRemoteImage("https://cdn.example.com/a.png", {
      cacheDir,
      fetchImpl: async () => makeImageResponse(png, "image/png")
    });
    assert.ok(result, "expected a cache result");
    assert.match(result.localUrl, /^\/image-cache\/[a-f0-9]{32}\.png$/);
    assert.strictEqual(result.bytes, png.length);
    assert.ok(fs.existsSync(result.filePath), "cached file should exist on disk");
    assert.deepStrictEqual(fs.readFileSync(result.filePath), png);
  } finally {
    fs.rmSync(cacheDir, { recursive: true, force: true });
  }
}

async function testSkipsNonImageContentType() {
  const cacheDir = makeTempDir();
  try {
    const json = Buffer.from(JSON.stringify({ data: { imageUrl: "https://cdn.example.com/x.png" } }));
    const result = await cacheRemoteImage("https://cdn.example.com/looks-like.png", {
      cacheDir,
      fetchImpl: async () => makeImageResponse(json, "application/json")
    });
    assert.strictEqual(result, null, "non-image responses must not be cached");
    assert.deepStrictEqual(fs.readdirSync(cacheDir), [], "cache dir should stay empty");
  } finally {
    fs.rmSync(cacheDir, { recursive: true, force: true });
  }
}

async function testSkipsNonHttpUrls() {
  const cacheDir = makeTempDir();
  try {
    let called = false;
    const fetchImpl = async () => {
      called = true;
      return makeImageResponse(Buffer.from("x"), "image/png");
    };
    assert.strictEqual(await cacheRemoteImage("data:image/png;base64,AAAA", { cacheDir, fetchImpl }), null);
    assert.strictEqual(await cacheRemoteImage("/image-cache/local.png", { cacheDir, fetchImpl }), null);
    assert.strictEqual(await cacheRemoteImage("", { cacheDir, fetchImpl }), null);
    assert.strictEqual(called, false, "must not fetch for non-remote URLs");
  } finally {
    fs.rmSync(cacheDir, { recursive: true, force: true });
  }
}

async function testDeduplicatesByContent() {
  const cacheDir = makeTempDir();
  try {
    const png = Buffer.from("identical-content");
    const first = await cacheRemoteImage("https://cdn.example.com/one.png", {
      cacheDir,
      fetchImpl: async () => makeImageResponse(png, "image/png")
    });
    const second = await cacheRemoteImage("https://cdn.example.com/two-different-url.png", {
      cacheDir,
      fetchImpl: async () => makeImageResponse(png, "image/png")
    });
    assert.strictEqual(first.localUrl, second.localUrl, "identical content must map to the same cache file");
    assert.deepStrictEqual(fs.readdirSync(cacheDir), [path.basename(first.filePath)]);
  } finally {
    fs.rmSync(cacheDir, { recursive: true, force: true });
  }
}

async function testFetchFailureIsBestEffort() {
  const cacheDir = makeTempDir();
  try {
    const result = await cacheRemoteImage("https://cdn.example.com/boom.png", {
      cacheDir,
      fetchImpl: async () => {
        throw new Error("network down");
      }
    });
    assert.strictEqual(result, null, "fetch errors must resolve to null, not throw");
  } finally {
    fs.rmSync(cacheDir, { recursive: true, force: true });
  }
}

async function testRejectsOversizedImage() {
  const cacheDir = makeTempDir();
  try {
    const big = Buffer.alloc(2048, 1);
    const result = await cacheRemoteImage("https://cdn.example.com/big.png", {
      cacheDir,
      maxBytes: 1024,
      fetchImpl: async () => makeImageResponse(big, "image/png")
    });
    assert.strictEqual(result, null, "images exceeding maxBytes must be rejected");
  } finally {
    fs.rmSync(cacheDir, { recursive: true, force: true });
  }
}

async function testServesCachedImagesViaStaticRoute() {
  const cacheDir = makeTempDir();
  const png = Buffer.from("served-cache-bytes");
  fs.writeFileSync(path.join(cacheDir, "deadbeef.png"), png);
  const server = createServer({
    apiKey: "test-key",
    imageCacheDir: cacheDir,
    imageCacheUrlPrefix: "/image-cache/",
    maxUpstreamRequests: 4
  });
  try {
    await listen(server);
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/image-cache/deadbeef.png`);
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.headers.get("content-type"), "image/png");
    assert.deepStrictEqual(Buffer.from(await response.arrayBuffer()), png);
    const missing = await fetch(`http://127.0.0.1:${port}/image-cache/not-there.png`);
    assert.strictEqual(missing.status, 404);
  } finally {
    await close(server);
    fs.rmSync(cacheDir, { recursive: true, force: true });
  }
}

function testHelpers() {
  assert.strictEqual(isRemoteHttpUrl("https://x/y.png"), true);
  assert.strictEqual(isRemoteHttpUrl("data:image/png;base64,AA"), false);
  assert.strictEqual(guessExtensionFromUrl("https://x/y.JPEG"), ".jpg");
  assert.strictEqual(guessExtensionFromUrl("https://x/y.webp?token=1"), ".webp");
  assert.strictEqual(guessExtensionFromUrl("https://x/y"), "");
}

async function main() {
  await testCachesRemoteImageToDisk();
  await testSkipsNonImageContentType();
  await testSkipsNonHttpUrls();
  await testDeduplicatesByContent();
  await testFetchFailureIsBestEffort();
  await testRejectsOversizedImage();
  await testServesCachedImagesViaStaticRoute();
  testHelpers();
  console.log("image-cache.test.js passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
