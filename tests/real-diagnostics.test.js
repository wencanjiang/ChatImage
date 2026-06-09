"use strict";

const assert = require("assert");
const { createHttpError, describeError, extractErrorMessage } = require("./real-diagnostics");

function main() {
  assert.strictEqual(extractErrorMessage({ error: "Text API error" }), "Text API error");
  assert.strictEqual(extractErrorMessage({ data: { msg: "Account has no permission" } }), "Account has no permission");
  assert.strictEqual(extractErrorMessage({ errors: ["ignored"] }), "");

  const error = createHttpError({ error: "Text API error: account unavailable" });
  assert.strictEqual(error.message, "Text API error: account unavailable");
  assert.deepStrictEqual(error.payload, { error: "Text API error: account unavailable" });

  const details = describeError(error);
  assert.deepStrictEqual(details, {
    message: "Text API error: account unavailable",
    payload: { error: "Text API error: account unavailable" }
  });

  const fallback = createHttpError({}, "fallback message");
  assert.strictEqual(fallback.message, "fallback message");
  assert.deepStrictEqual(fallback.payload, {});

  console.log("real-diagnostics.test.js passed");
}

main();
