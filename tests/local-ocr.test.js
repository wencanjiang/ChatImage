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
    server.listen(0, "127.0.0.1", resolve);
  });
}

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
