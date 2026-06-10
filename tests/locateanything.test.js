"use strict";

const assert = require("assert");
const http = require("http");
const path = require("path");
const { createServer } = require("../server");
const { createHealthFixtureDataUrl } = require("../server/local-ocr");
const {
  buildSemanticHint,
  normalizeLocateAnythingOutput,
  runLocateAnythingAlignment,
  runLocateAnythingAlignmentWithFallback,
  runLocateAnythingPreload
} = require("../server/locateanything");

async function main() {
  await testLicenseAckRequired();
  await testFakeLocateAnythingPreload();
  await testFakeLocateAnythingSuccess();
  await testPlannedFallbackForMissingModule();
  await testInvalidBoundsReject();
  await testVisionRoutesExposeLocateAnything();
  testSemanticHintUsesPrimaryChineseLabels();
  testNormalizeRejectsBadConfidence();
  console.log("locateanything.test.js passed");
}

async function testFakeLocateAnythingPreload() {
  await withEnv("CHATIMAGE_FAKE_LOCATE_MODE", "success", async () => {
    const parsed = await runLocateAnythingPreload(createConfig());
    assert.strictEqual(parsed.provider, "locateanything");
    assert.strictEqual(parsed.loaded, true);
    assert.strictEqual(parsed.model, "fake-locate");
  });
}

function createConfig(overrides = {}) {
  return {
    apiKey: "test-key",
    visionMode: "locateanything",
    locateAnythingPython: "python",
    locateAnythingWorkerPath: path.join(process.cwd(), "tests", "fixtures", "locateanything_fake.py"),
    locateAnythingModel: "fake-locate",
    locateAnythingDevice: "cuda",
    locateAnythingTimeoutMs: 1000,
    locateAnythingMaxNewTokens: 128,
    locateAnythingGenerationMode: "hybrid",
    locateAnythingLicenseAck: "research-evaluation",
    localOcrPython: "python",
    localOcrWorkerPath: path.join(process.cwd(), "tests", "fixtures", "local_ocr_fake.py"),
    localOcrTimeoutMs: 1000,
    localOcrMaxImageBytes: 1024 * 1024,
    apiRequestTimeoutMs: 1000,
    ...overrides
  };
}

function createModules() {
  return [
    { moduleId: "module_1", label: "Input", order: 1, text: "Ask", plannedBounds: { x: 0.1, y: 0.2, width: 0.2, height: 0.2 } },
    { moduleId: "module_2", label: "Layout", order: 2, text: "Plan", plannedBounds: { x: 0.4, y: 0.2, width: 0.2, height: 0.2 } },
    { moduleId: "module_3", label: "Thread", order: 3, text: "Follow", plannedBounds: { x: 0.7, y: 0.2, width: 0.2, height: 0.2 } }
  ];
}

async function testLicenseAckRequired() {
  await assert.rejects(
    () =>
      runLocateAnythingAlignment(createConfig({ locateAnythingLicenseAck: "" }), {
        imageUrl: createHealthFixtureDataUrl(),
        imageWidth: 640,
        imageHeight: 360,
        modules: createModules()
      }),
    /CHATIMAGE_LOCATEANYTHING_LICENSE_ACK/
  );
}

async function testFakeLocateAnythingSuccess() {
  await withEnv("CHATIMAGE_FAKE_LOCATE_MODE", "success", async () => {
    const parsed = await runLocateAnythingAlignment(createConfig(), {
      imageUrl: createHealthFixtureDataUrl(),
      imageWidth: 640,
      imageHeight: 360,
      modules: createModules(),
      purpose: "test_success"
    });
    assert.strictEqual(parsed.modules.length, 3);
    assert.strictEqual(parsed.modules[0].source, "locateanything");
    assert.match(parsed.modules[0].answer, /<box>/);
    assert.deepStrictEqual(parsed.warnings, ["fake locate"]);
  });
}

async function testPlannedFallbackForMissingModule() {
  await withEnv("CHATIMAGE_FAKE_LOCATE_MODE", "no-box", async () => {
    const parsed = await runLocateAnythingAlignmentWithFallback(
      createConfig({ localOcrWorkerPath: path.join(process.cwd(), "missing-worker.py") }),
      {
        imageUrl: createHealthFixtureDataUrl(),
        imageWidth: 640,
        imageHeight: 360,
        modules: createModules(),
        purpose: "test_planned_fallback"
      },
      {}
    );
    assert.strictEqual(parsed.modules.length, 3);
    assert.strictEqual(parsed.modules[0].source, "planned");
    assert.strictEqual(parsed.effectiveProvider, "locateanything");
    assert.deepStrictEqual(parsed.sourceCounts, { planned: 1, locateanything: 2 });
    assert.deepStrictEqual(parsed.acceptedLocateAnythingModules, ["module_2", "module_3"]);
    assert.deepStrictEqual(parsed.acceptedLocalOcrModules, []);
    assert.deepStrictEqual(parsed.fallbackModules, ["module_1"]);
    assert.match(parsed.warnings.join("\n"), /fake locate/);
  });
}

async function testInvalidBoundsReject() {
  await withEnv("CHATIMAGE_FAKE_LOCATE_MODE", "invalid-bounds", async () => {
    await assert.rejects(
      () =>
        runLocateAnythingAlignment(createConfig(), {
          imageUrl: createHealthFixtureDataUrl(),
          imageWidth: 640,
          imageHeight: 360,
          modules: createModules()
        }),
      /outside normalized image bounds/
    );
  });
}

async function testVisionRoutesExposeLocateAnything() {
  await withEnv("CHATIMAGE_FAKE_LOCATE_MODE", "success", async () => {
    const server = createServer(createConfig({ port: 0 }));
    try {
      await listen(server);
      const { port } = server.address();
      const configResponse = await fetch(`http://127.0.0.1:${port}/api/config`);
      assert.strictEqual(configResponse.status, 200);
      const config = await configResponse.json();
      assert.strictEqual(config.visionMode, "locateanything");
      assert.strictEqual(config.locateAnythingConfigured, true);
      assert.strictEqual(config.locateAnythingLicenseAck, true);

      const healthResponse = await fetch(`http://127.0.0.1:${port}/api/vision/health`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}"
      });
      assert.strictEqual(healthResponse.status, 200);
      const health = await healthResponse.json();
      assert.strictEqual(health.parsed.provider, "locateanything");

      const alignResponse = await fetch(`http://127.0.0.1:${port}/api/vision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl: createHealthFixtureDataUrl(),
          imageWidth: 640,
          imageHeight: 360,
          modules: createModules()
        })
      });
      assert.strictEqual(alignResponse.status, 200);
      const body = await alignResponse.json();
      const parsed = JSON.parse(body.content);
      assert.strictEqual(parsed.provider, "locateanything");
      assert.strictEqual(parsed.modules.length, 3);
      assert.deepStrictEqual(parsed.providerChain, ["locateanything"]);
    } finally {
      await close(server);
    }
  });
}

function testNormalizeRejectsBadConfidence() {
  assert.throws(
    () =>
      normalizeLocateAnythingOutput(
        {
          modules: [{ moduleId: "module_1", bounds: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 }, confidence: 2 }]
        },
        createModules()
      ),
    /confidence/
  );
}

function testSemanticHintUsesPrimaryChineseLabels() {
  assert.strictEqual(
    buildSemanticHint({
      label: "\u9ad8\u5bc6\u5ea6\u8f6f\u5305\u7535\u6c60",
      regionPrompt: "\u9ad8\u5bc6\u5ea6\u8f6f\u5305\u7535\u6c60",
      text: "\u7ed3\u6784 \u4f20\u611f \u82af\u7247"
    }),
    "battery pack power cell"
  );
  assert.strictEqual(
    buildSemanticHint({
      label: "\u667a\u80fd\u4ea4\u4e92\u8868\u5e26",
      regionPrompt: "\u667a\u80fd\u4ea4\u4e92\u8868\u5e26",
      text: "\u4f20\u611f\u5668\u63a5\u89e6 NFC"
    }),
    "watch strap band"
  );
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
