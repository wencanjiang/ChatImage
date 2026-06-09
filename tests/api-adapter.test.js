"use strict";

const assert = require("assert");
const { callImageApi, callTextApi, callVisionApi, createServer } = require("../server");
const {
  buildWuyinVisionContent,
  createVisionHeaders,
  parseJsonResponse,
  resolveTextRequestFormat,
  resolveVisionRequestFormat
} = require("../server/providers");
const { createLlmHealthPrompt } = require("../server/routes/llm");
const { createVisionHealthPrompt } = require("../server/routes/vision");

async function main() {
  await testTextApiPayload();
  await testOpenAiTextApiPayload();
  await testOpenAiNativeJsonResponseFormat();
  await testParseJsonResponseAcceptsLeadingJson();
  testLlmHealthPromptIsStable();
  await testLlmHealthRoute();
  await testVisionApiPayload();
  await testWuyinFormVisionApiPayload();
  await testVisionApiKeyAuthPayload();
  testVisionAuthHeaders();
  await testVisionRouteRejectsInvalidImageUrl();
  await testVisionRouteRejectsInvalidImageDimensions();
  await testVisionRouteRequiresEndpoint();
  testVisionHealthPromptIsStable();
  await testVisionHealthConfig();
  await testVisionHealthProbe();
  await testVisionHealthRejectsInvisibleImage();
  await testImageApiPayload();
  await testImageApiPayloadWithoutModel();
  await testImageDimensionProbe();
  await testImageRouteOmitsDefaultModel();
  await testImageAsyncPolling();
  console.log("api-adapter.test.js passed");
}

async function testParseJsonResponseAcceptsLeadingJson() {
  const response = new Response(
    '{"code":200,"msg":"成功","data":{"content":"ok"}}{"code":500,"msg":"系统错误","data":null}',
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
  const data = await parseJsonResponse(response);
  assert.deepStrictEqual(data, { code: 200, msg: "成功", data: { content: "ok" } });
}

async function testWuyinFormVisionApiPayload() {
  const calls = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return jsonResponse({ data: { content: "{\"ok\":true,\"imageVisible\":true}" } });
  };

  try {
    const result = await callVisionApi(
      {
        apiKey: "base-key",
        textModel: "gpt-5.5",
        visionEndpoint: "https://api.wuyinkeji.com/api/chat/index",
        visionModel: "gpt-5.5",
        visionRequestFormat: "wuyin-form"
      },
      {
        content: "Inspect image",
        imageUrl: "https://cdn.example.com/info.png",
        purpose: "vision_health",
        responseFormat: "json"
      }
    );

    assert.strictEqual(result, "{\"ok\":true,\"imageVisible\":true}");
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].url, "https://api.wuyinkeji.com/api/chat/index");
    assert.match(calls[0].options.headers["Content-Type"], /application\/x-www-form-urlencoded/);
    assert.strictEqual(calls[0].options.headers.Authorization, "base-key");
    assert.strictEqual(calls[0].options.body.get("model"), "gpt-5.5");
    assert.strictEqual(calls[0].options.body.get("key"), "base-key");
    assert.strictEqual(calls[0].options.body.get("image_url"), "https://cdn.example.com/info.png");
    assert.strictEqual(calls[0].options.body.get("imageUrl"), "https://cdn.example.com/info.png");
    assert.strictEqual(calls[0].options.body.get("images"), "[\"https://cdn.example.com/info.png\"]");
    assert.match(calls[0].options.body.get("content"), /Inspect image/);
    assert.match(calls[0].options.body.get("content"), /https:\/\/cdn\.example\.com\/info\.png/);
    assert.strictEqual(resolveVisionRequestFormat({ visionEndpoint: "https://api.wuyinkeji.com/api/chat/index" }), "wuyin-form");
    assert.strictEqual(resolveVisionRequestFormat({ visionEndpoint: "https://vision.example.com/v1/chat/completions" }), "openai-chat");
    assert.match(buildWuyinVisionContent("Prompt", "https://cdn.example.com/a.png"), /Image input/);
  } finally {
    global.fetch = originalFetch;
  }
}

async function testVisionApiKeyAuthPayload() {
  const calls = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return jsonResponse({ choices: [{ message: { content: "{\"modules\":[]}" } }] });
  };

  try {
    await callVisionApi(
      {
        apiKey: "base-key",
        visionApiKey: "azure-key",
        visionEndpoint: "https://azure.example.com/openai/v1/chat/completions",
        visionModel: "vision-deployment",
        visionAuthMode: "api-key"
      },
      {
        content: "Locate cards",
        imageUrl: "https://cdn.example.com/info.png",
        model: "vision-deployment",
        purpose: "vision_align",
        responseFormat: "json"
      }
    );

    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].options.headers["api-key"], "azure-key");
    assert.strictEqual(calls[0].options.headers.Authorization, undefined);
  } finally {
    global.fetch = originalFetch;
  }
}

function testVisionAuthHeaders() {
  assert.deepStrictEqual(createVisionHeaders({}, "vision-key"), {
    "Content-Type": "application/json",
    Authorization: "Bearer vision-key"
  });
  assert.deepStrictEqual(createVisionHeaders({ visionAuthMode: "api-key" }, "vision-key"), {
    "Content-Type": "application/json",
    "api-key": "vision-key"
  });
  assert.deepStrictEqual(createVisionHeaders({ visionAuthMode: "azure" }, "vision-key"), {
    "Content-Type": "application/json",
    "api-key": "vision-key"
  });
  assert.deepStrictEqual(createVisionHeaders({ visionAuthMode: "none" }, "vision-key"), {
    "Content-Type": "application/json"
  });
}

function testLlmHealthPromptIsStable() {
  const prompt = createLlmHealthPrompt();
  assert.match(prompt, /OK/);
  assert.match(prompt, /text health check/);
  assert.doesNotMatch(prompt, /\uFFFD/);
}

async function testLlmHealthRoute() {
  const calls = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    if (String(url).startsWith("http://127.0.0.1:")) {
      return originalFetch(url, options);
    }
    calls.push({ url: String(url), options });
    return jsonResponse({ data: { content: "OK" } });
  };

  const server = createServer({
    port: 0,
    apiKey: "test-key",
    textModel: "gpt-5.5",
    imageModel: "GPT-Image-2",
    textEndpoint: "https://text.example.com/chat"
  });
  try {
    await listen(server);
    const { port } = server.address();
    const configResponse = await fetch(`http://127.0.0.1:${port}/api/llm/health`);
    assert.strictEqual(configResponse.status, 200);
    const config = await configResponse.json();
    assert.strictEqual(config.configured, true);
    assert.strictEqual(config.endpointConfigured, true);
    assert.strictEqual(config.keyConfigured, true);

    const healthResponse = await fetch(`http://127.0.0.1:${port}/api/llm/health`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ purpose: "test_health", responseFormat: "text" })
    });
    assert.strictEqual(healthResponse.status, 200);
    const health = await healthResponse.json();
    assert.strictEqual(health.ok, true);
    assert.strictEqual(health.content, "OK");
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].url, "https://text.example.com/chat");
    const body = JSON.parse(calls[0].options.body);
    assert.strictEqual(body.purpose, undefined);
    assert.strictEqual(body.messages[0].content, createLlmHealthPrompt());
  } finally {
    global.fetch = originalFetch;
    await close(server);
  }
}

function testVisionHealthPromptIsStable() {
  const prompt = createVisionHealthPrompt();
  assert.match(prompt, /return only JSON/i);
  assert.match(prompt, /imageVisible/);
  assert.doesNotMatch(prompt, /\uFFFD/);
  assert.doesNotMatch(prompt, /璇|鍥|锛|€/);
}

async function testVisionHealthConfig() {
  const server = createServer({
    port: 0,
    apiKey: "test-key",
    textModel: "gpt-5.5",
    imageModel: "GPT-Image-2",
    visionEndpoint: "",
    visionModel: ""
  });
  try {
    await listen(server);
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/vision/health`);
    assert.strictEqual(response.status, 200);
    const body = await response.json();
    assert.strictEqual(body.configured, false);
    assert.strictEqual(body.endpointConfigured, false);
    assert.strictEqual(body.keyConfigured, true);
  } finally {
    await close(server);
  }
}

async function testVisionHealthProbe() {
  const calls = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    if (String(url).startsWith("http://127.0.0.1:")) {
      return originalFetch(url, options);
    }
    calls.push({ url: String(url), options });
    return jsonResponse({ choices: [{ message: { content: "{\"ok\":true,\"imageVisible\":true}" } }] });
  };

  const server = createServer({
    port: 0,
    apiKey: "test-key",
    textModel: "gpt-5.5",
    imageModel: "GPT-Image-2",
    visionEndpoint: "https://vision.example.com/v1/chat/completions",
    visionModel: "vision-health"
  });
  try {
    await listen(server);
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/vision/health`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: "只返回 JSON",
        imageUrl: "https://cdn.example.com/health.png"
      })
    });
    assert.strictEqual(response.status, 200);
    const body = await response.json();
    assert.strictEqual(body.configured, true);
    assert.strictEqual(body.ok, true);
    assert.deepStrictEqual(body.parsed, { ok: true, imageVisible: true });
    assert.strictEqual(calls.length, 1);
    const upstreamBody = JSON.parse(calls[0].options.body);
    assert.strictEqual(upstreamBody.purpose, "vision_health");
    assert.strictEqual(upstreamBody.messages[0].content[1].image_url.url, "https://cdn.example.com/health.png");
  } finally {
    global.fetch = originalFetch;
    await close(server);
  }
}

async function testVisionHealthRejectsInvisibleImage() {
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    if (String(url).startsWith("http://127.0.0.1:")) {
      return originalFetch(url, options);
    }
    return jsonResponse({ choices: [{ message: { content: "{\"ok\":true,\"imageVisible\":false}" } }] });
  };

  const server = createServer({
    port: 0,
    apiKey: "test-key",
    textModel: "gpt-5.5",
    imageModel: "GPT-Image-2",
    visionEndpoint: "https://vision.example.com/v1/chat/completions",
    visionModel: "vision-health"
  });
  try {
    await listen(server);
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/vision/health`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: "只返回 JSON",
        imageUrl: "https://cdn.example.com/health.png"
      })
    });
    assert.strictEqual(response.status, 502);
    const body = await response.json();
    assert.match(body.error, /imageVisible=true/);
  } finally {
    global.fetch = originalFetch;
    await close(server);
  }
}

async function testVisionApiPayload() {
  const calls = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    return jsonResponse({ choices: [{ message: { content: "{\"modules\":[]}" } }] });
  };

  try {
    const result = await callVisionApi(
      {
        apiKey: "base-key",
        visionApiKey: "vision-key",
        visionEndpoint: "https://vision.example.com/v1/chat/completions",
        visionModel: "vision-test"
      },
      {
        content: "定位卡片",
        imageUrl: "https://cdn.example.com/info.png",
        model: "vision-model",
        purpose: "vision_align",
        responseFormat: "json"
      }
    );

    assert.strictEqual(result, "{\"modules\":[]}");
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].url, "https://vision.example.com/v1/chat/completions");
    assert.strictEqual(calls[0].options.method, "POST");
    assert.strictEqual(calls[0].options.headers.Authorization, "Bearer vision-key");
    const body = JSON.parse(calls[0].options.body);
    assert.strictEqual(body.model, "vision-model");
    assert.deepStrictEqual(body.response_format, { type: "json_object" });
    assert.strictEqual(body.messages[0].content[0].text, "定位卡片");
    assert.strictEqual(body.messages[0].content[1].image_url.url, "https://cdn.example.com/info.png");
  } finally {
    global.fetch = originalFetch;
  }
}

async function testVisionRouteRejectsInvalidImageUrl() {
  let upstreamCalls = 0;
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    if (String(url).startsWith("http://127.0.0.1:")) {
      return originalFetch(url, options);
    }
    upstreamCalls += 1;
    return jsonResponse({ choices: [{ message: { content: "{\"modules\":[]}" } }] });
  };

  const server = createServer({
    port: 0,
    apiKey: "test-key",
    textModel: "gpt-5.5",
    imageModel: "GPT-Image-2",
    visionEndpoint: "https://vision.example.com/v1/chat/completions",
    visionModel: "vision-test"
  });
  try {
    await listen(server);
    const { port } = server.address();
    const alignResponse = await fetch(`http://127.0.0.1:${port}/api/vision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: "定位卡片",
        imageUrl: "javascript:alert(1)"
      })
    });
    assert.strictEqual(alignResponse.status, 400);
    assert.match(await alignResponse.text(), /imageUrl must be an http\(s\) URL or data:image URL/);

    const healthResponse = await fetch(`http://127.0.0.1:${port}/api/vision/health`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imageUrl: "/relative/image.png"
      })
    });
    assert.strictEqual(healthResponse.status, 400);
    assert.match(await healthResponse.text(), /imageUrl must be an http\(s\) URL or data:image URL/);

    const privateResponse = await fetch(`http://127.0.0.1:${port}/api/vision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: "定位卡片",
        imageUrl: "http://127.0.0.1:5173/internal.png"
      })
    });
    assert.strictEqual(privateResponse.status, 400);
    assert.match(await privateResponse.text(), /vision proxy must be a public/);
    assert.strictEqual(upstreamCalls, 0);
  } finally {
    global.fetch = originalFetch;
    await close(server);
  }
}

async function testVisionRouteRejectsInvalidImageDimensions() {
  let upstreamCalls = 0;
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    if (String(url).startsWith("http://127.0.0.1:")) {
      return originalFetch(url, options);
    }
    upstreamCalls += 1;
    return jsonResponse({ choices: [{ message: { content: "{\"modules\":[]}" } }] });
  };

  const server = createServer({
    port: 0,
    apiKey: "test-key",
    textModel: "gpt-5.5",
    imageModel: "GPT-Image-2",
    visionEndpoint: "https://vision.example.com/v1/chat/completions",
    visionModel: "vision-test"
  });
  try {
    await listen(server);
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/vision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: "Locate cards",
        imageUrl: "https://cdn.example.com/info.png",
        imageWidth: 1600,
        imageHeight: 0
      })
    });
    assert.strictEqual(response.status, 400);
    assert.match(await response.text(), /imageHeight must be an integer >= 16/);
    assert.strictEqual(upstreamCalls, 0);
  } finally {
    global.fetch = originalFetch;
    await close(server);
  }
}

async function testVisionRouteRequiresEndpoint() {
  const server = createServer({
    port: 0,
    apiKey: "test-key",
    textModel: "gpt-5.5",
    imageModel: "GPT-Image-2"
  });
  try {
    await listen(server);
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/vision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: "定位卡片",
        imageUrl: "https://cdn.example.com/info.png",
        imageWidth: 1600,
        imageHeight: 900
      })
    });
    assert.strictEqual(response.status, 503);
    const body = await response.json();
    assert.match(body.error, /CHATIMAGE_VISION_ENDPOINT/);
  } finally {
    await close(server);
  }
}

async function testTextApiPayload() {
  const calls = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    return jsonResponse({ data: { content: "文本接口返回" } });
  };

  try {
    const result = await callTextApi(
      {
        apiKey: "test-key",
        textEndpoint: "https://api.wuyinkeji.com/api/chat/index"
      },
      {
        content: "测试文本",
        model: "GPT5.5",
        purpose: "answer",
        responseFormat: "json"
      }
    );

    assert.strictEqual(result, "文本接口返回");
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].url, "https://api.wuyinkeji.com/api/chat/index");
    assert.strictEqual(calls[0].options.method, "POST");
    assert.strictEqual(calls[0].options.headers.Authorization, "test-key");
    assert.match(calls[0].options.headers["Content-Type"], /application\/x-www-form-urlencoded/);
    assert.strictEqual(calls[0].options.body.get("content"), "测试文本");
    assert.strictEqual(calls[0].options.body.get("model"), "GPT5.5");
    assert.strictEqual(calls[0].options.body.get("key"), "test-key");
    assert.strictEqual(calls[0].options.body.get("response_format"), "json");
    assert.strictEqual(resolveTextRequestFormat({ textEndpoint: "https://api.wuyinkeji.com/api/chat/index" }), "wuyin-form");
  } finally {
    global.fetch = originalFetch;
  }
}

async function testOpenAiTextApiPayload() {
  const calls = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return jsonResponse({ choices: [{ message: { content: "{\"ok\":true}" } }] });
  };

  try {
    const result = await callTextApi(
      {
        textApiKey: "text-key",
        apiKey: "image-key",
        textEndpoint: "https://api.xiaomimimo.com/v1/chat/completions",
        textModel: "mimo-v2.5-pro",
        textRequestFormat: "openai-chat",
        textSystemPrompt: "You are MiMo.",
        textJsonResponseFormat: "prompt",
        textThinkingType: "disabled",
        apiRequestTimeoutMs: 1000
      },
      {
        content: "只返回 JSON",
        model: "mimo-v2.5-pro",
        purpose: "answer_structure",
        responseFormat: "json"
      }
    );

    assert.strictEqual(result, "{\"ok\":true}");
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].url, "https://api.xiaomimimo.com/v1/chat/completions");
    assert.strictEqual(calls[0].options.method, "POST");
    assert.strictEqual(calls[0].options.headers.Authorization, "Bearer text-key");
    assert.strictEqual(calls[0].options.headers["Content-Type"], "application/json");
    const body = JSON.parse(calls[0].options.body);
    assert.strictEqual(body.model, "mimo-v2.5-pro");
    assert.strictEqual(body.purpose, undefined);
    assert.strictEqual(body.response_format, undefined);
    assert.deepStrictEqual(body.messages, [
      { role: "system", content: "You are MiMo." },
      { role: "user", content: "只返回 JSON" }
    ]);
    assert.strictEqual(body.max_completion_tokens, 4096);
    assert.strictEqual(body.temperature, 1);
    assert.strictEqual(body.top_p, 0.95);
    assert.deepStrictEqual(body.thinking, { type: "disabled" });
    assert.strictEqual(body.stream, false);
    assert.strictEqual(resolveTextRequestFormat({ textEndpoint: "https://api.xiaomimimo.com/v1/chat/completions" }), "openai-chat");
  } finally {
    global.fetch = originalFetch;
  }
}

async function testOpenAiNativeJsonResponseFormat() {
  const calls = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return jsonResponse({ choices: [{ message: { content: "{\"ok\":true}" } }] });
  };

  try {
    await callTextApi(
      {
        textApiKey: "text-key",
        textEndpoint: "https://api.example.com/v1/chat/completions",
        textModel: "chat-model",
        textRequestFormat: "openai-chat",
        textJsonResponseFormat: "native"
      },
      {
        content: "只返回 JSON",
        model: "chat-model",
        responseFormat: "json"
      }
    );

    const body = JSON.parse(calls[0].options.body);
    assert.deepStrictEqual(body.response_format, { type: "json_object" });
  } finally {
    global.fetch = originalFetch;
  }
}

async function testImageApiPayloadWithoutModel() {
  const calls = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return jsonResponse({ data: { imageUrl: "https://cdn.example.com/no-model.png", width: 1600, height: 900 } });
  };

  try {
    const result = await callImageApi(
      {
        apiKey: "test-key",
        imageEndpoint: "https://api.wuyinkeji.com/api/async/image_gpt",
        imageDetailEndpoint: "https://api.wuyinkeji.com/api/async/detail"
      },
      {
        prompt: "不传模型",
        size: "1600x900",
        model: null
      }
    );

    assert.strictEqual(result.imageUrl, "https://cdn.example.com/no-model.png");
    assert.strictEqual(result.width, 1600);
    assert.strictEqual(result.height, 900);
    assert.deepStrictEqual(JSON.parse(calls[0].options.body), {
      prompt: "不传模型",
      size: "1600x900"
    });
  } finally {
    global.fetch = originalFetch;
  }
}

async function testImageDimensionProbe() {
  const calls = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    if (calls.length === 1) {
      return jsonResponse({ data: { imageUrl: "https://cdn.example.com/probe.png" } });
    }
    return imageResponse(createPngHeader(1358, 1159), "image/png");
  };

  try {
    const result = await callImageApi(
      {
        apiKey: "test-key",
        imageEndpoint: "https://api.wuyinkeji.com/api/async/image_gpt",
        imageDetailEndpoint: "https://api.wuyinkeji.com/api/async/detail",
        apiRequestTimeoutMs: 1000
      },
      {
        prompt: "探测真实图片尺寸",
        size: "1600x900",
        model: null
      }
    );

    assert.strictEqual(result.imageUrl, "https://cdn.example.com/probe.png");
    assert.strictEqual(result.width, 1358);
    assert.strictEqual(result.height, 1159);
    assert.strictEqual(calls.length, 2);
    assert.strictEqual(calls[1].options.headers.Accept, "image/png,image/jpeg,image/svg+xml");
  } finally {
    global.fetch = originalFetch;
  }
}

async function testImageRouteOmitsDefaultModel() {
  const calls = [];
  const server = createServer({
    port: 0,
    apiKey: "test-key",
    textModel: "gpt-5.5",
    imageModel: "GPT-Image-2",
    imageEndpoint: "https://api.wuyinkeji.com/api/async/image_gpt",
    imageDetailEndpoint: "https://api.wuyinkeji.com/api/async/detail"
  });
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    if (String(url).startsWith("http://127.0.0.1:")) {
      return originalFetch(url, options);
    }
    calls.push({ url: String(url), options });
    return jsonResponse({ data: { imageUrl: "https://cdn.example.com/no-default-model.png", width: 1600, height: 900 } });
  };

  try {
    await listen(server);
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/image`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: "省略模型字段",
        size: "1600x900"
      })
    });
    assert.strictEqual(response.status, 200);
    assert.deepStrictEqual(JSON.parse(calls[0].options.body), {
      prompt: "省略模型字段",
      size: "1600x900"
    });
  } finally {
    global.fetch = originalFetch;
    await close(server);
  }
}

async function testImageAsyncPolling() {
  const calls = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (calls.length === 1) {
      return jsonResponse({ data: { task_id: "task_123" } });
    }
    return jsonResponse({ data: { url: "https://cdn.example.com/final.png", status: "succeeded", width: 2048, height: 1152 } });
  };

  try {
    const result = await callImageApi(
      {
        apiKey: "test-key",
        imageEndpoint: "https://api.wuyinkeji.com/api/async/image_gpt",
        imageDetailEndpoint: "https://api.wuyinkeji.com/api/async/detail",
        imagePollAttempts: 2,
        imagePollInitialDelayMs: 0,
        imagePollDelayMs: 0
      },
      {
        prompt: "异步任务信息图",
        size: "1600x900",
        model: "GPT-Image-2"
      }
    );

    assert.strictEqual(result.imageUrl, "https://cdn.example.com/final.png");
    assert.strictEqual(result.width, 2048);
    assert.strictEqual(result.height, 1152);
    assert.strictEqual(calls.length, 2);
    assert.match(calls[1].url, /^https:\/\/api\.wuyinkeji\.com\/api\/async\/detail\?key=test-key&id=task_123$/);
    assert.strictEqual(calls[1].options.headers.Authorization, "test-key");
  } finally {
    global.fetch = originalFetch;
  }
}

async function testImageApiPayload() {
  const calls = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return jsonResponse({ data: { imageUrl: "https://cdn.example.com/chatimage.png", width: 1024, height: 1024 } });
  };

  try {
    const result = await callImageApi(
      {
        apiKey: "test-key",
        imageEndpoint: "https://api.wuyinkeji.com/api/async/image_gpt",
        imageDetailEndpoint: "https://api.wuyinkeji.com/api/async/detail"
      },
      {
        prompt: "生成信息图",
        size: "1600x900",
        model: "GPT-Image-2"
      }
    );

    assert.strictEqual(result.imageUrl, "https://cdn.example.com/chatimage.png");
    assert.strictEqual(result.width, 1024);
    assert.strictEqual(result.height, 1024);
    assert.strictEqual(calls.length, 1);
    assert.match(calls[0].url, /^https:\/\/api\.wuyinkeji\.com\/api\/async\/image_gpt\?key=test-key$/);
    assert.strictEqual(calls[0].options.method, "POST");
    assert.strictEqual(calls[0].options.headers.Authorization, "test-key");
    assert.strictEqual(calls[0].options.headers["Content-Type"], "application/json");
    assert.deepStrictEqual(JSON.parse(calls[0].options.body), {
      prompt: "生成信息图",
      size: "1600x900",
      model: "GPT-Image-2"
    });
  } finally {
    global.fetch = originalFetch;
  }
}

function jsonResponse(value) {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "application/json" }),
    async text() {
      return JSON.stringify(value);
    }
  };
}

function imageResponse(bytes, contentType) {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": contentType }),
    async arrayBuffer() {
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    }
  };
}

function createPngHeader(width, height) {
  const bytes = Buffer.alloc(24);
  Buffer.from("89504e470d0a1a0a", "hex").copy(bytes, 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write("IHDR", 12, 4, "ascii");
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

function listen(server) {
  return new Promise((resolve, reject) => {
    const tryListen = (attemptsLeft) => {
      const onError = (error) => {
        server.removeListener("listening", onListening);
        reject(error);
      };
      const onListening = () => {
        server.removeListener("error", onError);
        const port = server.address() && server.address().port;
        if (UNSAFE_FETCH_PORTS.has(port) && attemptsLeft > 0) {
          server.close(() => tryListen(attemptsLeft - 1));
          return;
        }
        if (UNSAFE_FETCH_PORTS.has(port)) {
          reject(new Error(`test server received fetch-blocked port ${port}`));
          return;
        }
        resolve();
      };
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(0, "127.0.0.1");
    };
    tryListen(10);
  });
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
    if (!server.listening) return resolve();
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
