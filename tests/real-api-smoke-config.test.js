"use strict";

const assert = require("assert");
const { createRealApiSmokeOptions, inferFailureStage } = require("./real-api-smoke");

function main() {
  assert.deepStrictEqual(createRealApiSmokeOptions({}), {
    includeText: true,
    includeImage: false,
    includeVision: false
  });
  assert.deepStrictEqual(
    createRealApiSmokeOptions({
      CHATIMAGE_TEST_TEXT: "0",
      CHATIMAGE_TEST_IMAGE: "1",
      CHATIMAGE_TEST_VISION: "1"
    }),
    {
      includeText: false,
      includeImage: true,
      includeVision: true
    }
  );

  assert.strictEqual(inferFailureStage({ includeText: true, text: null }), "text");
  assert.strictEqual(
    inferFailureStage({
      includeText: false,
      text: { skipped: true },
      includeImage: true,
      image: { skipped: true }
    }),
    "image"
  );
  assert.strictEqual(
    inferFailureStage({
      includeText: false,
      text: { skipped: true },
      includeImage: false,
      includeVision: true,
      vision: { skipped: true }
    }),
    "vision"
  );
  assert.strictEqual(
    inferFailureStage({
      includeText: false,
      text: { skipped: true },
      includeImage: false,
      includeVision: false
    }),
    "unknown"
  );

  console.log("real-api-smoke-config.test.js passed");
}

main();
