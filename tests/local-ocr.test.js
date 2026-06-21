"use strict";

const assert = require("assert");
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createServer } = require("../server");
const {
  createHealthFixtureDataUrl,
  createHealthModules,
  materializeImage,
  runLocalOcrAlignment
} = require("../server/local-ocr");

async function main() {
  await testLocalOcrSuccess();
  await testLocalOcrHealthRoute();
  await testRejectsNonImageRemoteResponse();
  await testRejectsOversizedDataImage();
  await testWorkerFailureModes();
  console.log("local-ocr.test.js passed");
}

function createConfig(overrides = {}) {
  return {
    apiKey: "test-key",
    localOcrPython: "python",
    localOcrWorkerPath: path.join(process.cwd(), "tests", "fixtures", "local_ocr_fake.py"),
    localOcrTimeoutMs: 1000,
    localOcrMaxImageBytes: 1024 * 1024,
    apiRequestTimeoutMs: 1000,
    ...overrides
  };
}

async function testLocalOcrSuccess() {
  const parsed = await runLocalOcrAlignment(createConfig(), {
    imageUrl: createHealthFixtureDataUrl(),
    imageWidth: 640,
    imageHeight: 360,
    modules: createHealthModules(),
    purpose: "test_success"
  });
  assert.strictEqual(parsed.modules.length, 3);
  assert.strictEqual(parsed.modules[0].moduleId, "module_1");
  assert.match(parsed.modules[0].matchedText, /01/);
  assert.deepStrictEqual(parsed.ocrRaw, [{ text: "01 Input" }]);
  assert.deepStrictEqual(parsed.warnings, ["fake worker"]);
}

async function testLocalOcrHealthRoute() {
  const server = createServer({
    port: 0,
    apiKey: "test-key",
    textModel: "gemini-3.1-pro",
    imageModel: "GPT-Image-2",
    visionMode: "local-ocr",
    localOcrPython: "python",
    localOcrWorkerPath: path.join(process.cwd(), "tests", "fixtures", "local_ocr_fake.py"),
    localOcrTimeoutMs: 1000,
    localOcrHealthFixtureDataUrl: createHealthFixtureDataUrl()
  });
  try {
    await listen(server);
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/vision/health`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}"
    });
    assert.strictEqual(response.status, 200);
    const body = await response.json();
    assert.strictEqual(body.ok, true);
    assert.strictEqual(body.parsed.provider, "local-ocr");
    assert.strictEqual(body.parsed.modules.length, 3);
  } finally {
    await close(server);
  }
}

async function testRejectsNonImageRemoteResponse() {
  const upstream = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("not image");
  });
  await listen(upstream);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "chatimage-local-ocr-test-"));
  try {
    await assert.rejects(
      () =>
        materializeImage(
          createConfig(),
          `http://127.0.0.1:${upstream.address().port}/bad.txt`,
          tempDir
        ),
      /non-image/
    );
  } finally {
    await close(upstream);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

async function testRejectsOversizedDataImage() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "chatimage-local-ocr-test-"));
  await assert.rejects(
    () =>
      materializeImage(
        createConfig({ localOcrMaxImageBytes: 10 }),
        createHealthFixtureDataUrl(),
        tempDir
      ),
    /exceeds/
  );
  fs.rmSync(tempDir, { recursive: true, force: true });
}

async function testWorkerFailureModes() {
  await withEnv("CHATIMAGE_FAKE_OCR_MODE", "timeout", async () => {
    await assert.rejects(
      () =>
        runLocalOcrAlignment(createConfig({ localOcrTimeoutMs: 50 }), {
          imageUrl: createHealthFixtureDataUrl(),
          imageWidth: 640,
          imageHeight: 360,
          modules: createHealthModules()
        }),
      /timed out/
    );
  });

  await withEnv("CHATIMAGE_FAKE_OCR_MODE", "non-json", async () => {
    await assert.rejects(
      () =>
        runLocalOcrAlignment(createConfig(), {
          imageUrl: createHealthFixtureDataUrl(),
          imageWidth: 640,
          imageHeight: 360,
          modules: createHealthModules()
        }),
      /non-JSON/
    );
  });

  await withEnv("CHATIMAGE_FAKE_OCR_MODE", "exit", async () => {
    await assert.rejects(
      () =>
        runLocalOcrAlignment(createConfig(), {
          imageUrl: createHealthFixtureDataUrl(),
          imageWidth: 640,
          imageHeight: 360,
          modules: createHealthModules()
        }),
      /exited with code 7/
    );
  });

  await withEnv("CHATIMAGE_FAKE_OCR_MODE", "invalid-bounds", async () => {
    await assert.rejects(
      () =>
        runLocalOcrAlignment(createConfig(), {
          imageUrl: createHealthFixtureDataUrl(),
          imageWidth: 640,
          imageHeight: 360,
          modules: createHealthModules()
        }),
      /outside normalized image bounds/
    );
  });
}

async function withEnv(key, value, fn) {
  const previous = process.env[key];
  process.env[key] = value;
  try {
    await fn();
  } finally {
    if (previous === undefined) delete process.env[key];
    else process.env[key] = previous;
  }
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    listenOnSafePort(server, resolve, reject);
  });
}

async function listenOnSafePort(server, resolve, reject) {
  try {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const port = await getFreeSafePort();
      try {
        server.listen(port, "127.0.0.1", resolve);
        return;
      } catch {
        // Try another port.
      }
    }
    reject(new Error("Could not allocate a safe test port"));
  } catch (error) {
    reject(error);
  }
}

async function getFreeSafePort() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const probe = http.createServer();
    await new Promise((resolve, reject) => {
      probe.once("error", reject);
      probe.listen(0, "127.0.0.1", resolve);
    });
    const { port } = probe.address();
    await close(probe);
    if (!UNSAFE_FETCH_PORTS.has(port)) return port;
  }
  throw new Error("Could not allocate a browser-safe local port");
}

const UNSAFE_FETCH_PORTS = new Set([
  1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79, 87, 95,
  101, 102, 103, 104, 109, 110, 111, 113, 115, 117, 119, 123, 135, 137, 139, 143, 161,
  179, 389, 427, 465, 512, 513, 514, 515, 526, 530, 531, 532, 540, 548, 554, 556, 563,
  587, 601, 636, 989, 990, 993, 995, 1719, 1720, 1723, 2049, 3659, 4045, 5060, 5061,
  6000, 6566, 6665, 6666, 6667, 6668, 6669, 6697, 10080
]);

function close(server) {
  return new Promise((resolve, reject) => {
    if (!server || !server.listening) {
      resolve();
      return;
    }
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
