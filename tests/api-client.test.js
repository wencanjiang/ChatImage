"use strict";

const assert = require("assert");
const { createApiClient } = require("../src/api-client");

async function main() {
  await testAutoModeUsesApiOnlyWhenConfigHasKey();
  await testApiModeUsesReachableConfig();
  await testPostAndGetErrorMessages();
  console.log("api-client.test.js passed");
}

async function testAutoModeUsesApiOnlyWhenConfigHasKey() {
  const originalFetch = global.fetch;
  global.fetch = async () => jsonResponse({ realApiAvailable: false });
  try {
    const client = createApiClient({ mode: "auto" });
    assert.strictEqual(await client.shouldUseApi(), false);
  } finally {
    global.fetch = originalFetch;
  }
}

async function testApiModeUsesReachableConfig() {
  const originalFetch = global.fetch;
  global.fetch = async () => jsonResponse({ realApiAvailable: false });
  try {
    const client = createApiClient({ mode: "api" });
    assert.strictEqual(await client.shouldUseApi(), true);
  } finally {
    global.fetch = originalFetch;
  }
}

async function testPostAndGetErrorMessages() {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (String(url).includes("fail")) {
      return jsonResponse({ error: "明确错误" }, 500);
    }
    return jsonResponse({ ok: true });
  };
  try {
    const client = createApiClient({ mode: "mock" });
    assert.strictEqual(client.config.endpoints.visionAlignment, "/api/vision");
    assert.deepStrictEqual(await client.get("/ok"), { ok: true });
    assert.deepStrictEqual(await client.post("/ok", { value: 1 }), { ok: true });
    assert.deepStrictEqual(await client.patch("/ok", { title: "新标题" }), { ok: true });
    assert.deepStrictEqual(await client.delete("/ok"), { ok: true });
    assert.strictEqual(calls[1].options.method, "POST");
    assert.deepStrictEqual(JSON.parse(calls[1].options.body), { value: 1 });
    assert.strictEqual(calls[2].options.method, "PATCH");
    assert.strictEqual(calls[3].options.method, "DELETE");
    await assert.rejects(() => client.get("/fail"), /明确错误/);
  } finally {
    global.fetch = originalFetch;
  }
}

function jsonResponse(value, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return value;
    }
  };
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
