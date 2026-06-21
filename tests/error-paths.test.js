"use strict";

const assert = require("assert");
const { callImageApi, callTextApi } = require("../server");

async function main() {
  await testTextNonJsonError();
  await testTextRequestTimeout();
  await testTextRequestFetchFailureRetry();
  await testImageCreateTransientPayloadRetry();
  await testImageCreateAmbiguous400Retry();
  await testImageCreateParameter400NoRetry();
  await testImageTaskFailure();
  await testImageDetailTransientPayloadRetry();
  await testImageDimensionProbeFallbackSize();
  await testImageDetailRequestTimeout();
  await testImageTimeout();
  console.log("error-paths.test.js passed");
}

async function testTextNonJsonError() {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    status: 200,
    async text() {
      return "<html>bad gateway</html>";
    }
  });

  try {
    await assert.rejects(
      () =>
        callTextApi(
          {
            apiKey: "test-key",
            textEndpoint: "https://api.wuyinkeji.com/api/chat/index"
          },
          {
            content: "测试",
            model: "GPT5.5"
          }
        ),
      /non-JSON/
    );
  } finally {
    global.fetch = originalFetch;
  }
}

async function testImageCreateTransientPayloadRetry() {
  let calls = 0;
  const originalFetch = global.fetch;
  global.fetch = async () => {
    calls += 1;
    if (calls === 1) {
      return jsonResponse({
        code: 500,
        message: "CURL request failed: Connection timed out after 30001 milliseconds"
      });
    }
    return jsonResponse({ data: { imageUrl: "https://cdn.example.com/create-retry-ok.png" } });
  };

  try {
    const result = await callImageApi(
      {
        apiKey: "test-key",
        imageEndpoint: "https://api.wuyinkeji.com/api/async/image_gpt",
        imageDetailEndpoint: "https://api.wuyinkeji.com/api/async/detail",
        apiFetchRetryAttempts: 1,
        apiFetchRetryDelayMs: 0
      },
      {
        prompt: "创建任务临时超时后成功",
        size: "1600x900",
        model: "GPT-Image-2"
      }
    );
    assert.strictEqual(result.imageUrl, "https://cdn.example.com/create-retry-ok.png");
    assert.ok(calls >= 2);
  } finally {
    global.fetch = originalFetch;
  }
}

async function testImageCreateAmbiguous400Retry() {
  let createCalls = 0;
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    if (String(url).includes("/api/async/image_gpt")) {
      createCalls += 1;
    }
    if (createCalls === 1 && String(url).includes("/api/async/image_gpt")) {
      return jsonResponse({ code: 400 });
    }
    return jsonResponse({ data: { imageUrl: "https://cdn.example.com/ambiguous-400-retry-ok.png" } });
  };

  try {
    const result = await callImageApi(
      {
        apiKey: "test-key",
        imageEndpoint: "https://api.wuyinkeji.com/api/async/image_gpt",
        imageDetailEndpoint: "https://api.wuyinkeji.com/api/async/detail",
        apiFetchRetryAttempts: 1,
        apiFetchRetryDelayMs: 0
      },
      {
        prompt: "ambiguous 400 retry",
        size: "1024x1024",
        model: null
      }
    );
    assert.strictEqual(result.imageUrl, "https://cdn.example.com/ambiguous-400-retry-ok.png");
    assert.strictEqual(createCalls, 2);
  } finally {
    global.fetch = originalFetch;
  }
}

async function testImageCreateParameter400NoRetry() {
  let createCalls = 0;
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    if (String(url).includes("/api/async/image_gpt")) {
      createCalls += 1;
    }
    return jsonResponse({ code: 400, msg: "invalid model parameter" });
  };

  try {
    await assert.rejects(
      () =>
        callImageApi(
          {
            apiKey: "test-key",
            imageEndpoint: "https://api.wuyinkeji.com/api/async/image_gpt",
            imageDetailEndpoint: "https://api.wuyinkeji.com/api/async/detail",
            apiFetchRetryAttempts: 2,
            apiFetchRetryDelayMs: 0
          },
          {
            prompt: "parameter 400 should not retry",
            size: "1024x1024",
            model: null
          }
        ),
      /Image API error/
    );
    assert.strictEqual(createCalls, 1);
  } finally {
    global.fetch = originalFetch;
  }
}

async function testImageTaskFailure() {
  let calls = 0;
  const originalFetch = global.fetch;
  global.fetch = async () => {
    calls += 1;
    if (calls === 1) return jsonResponse({ data: { task_id: "task_fail" } });
    return jsonResponse({ data: { status: "failed" } });
  };

  try {
    await assert.rejects(
      () =>
        callImageApi(
          {
            apiKey: "test-key",
            imageEndpoint: "https://api.wuyinkeji.com/api/async/image_gpt",
            imageDetailEndpoint: "https://api.wuyinkeji.com/api/async/detail",
            imagePollAttempts: 2,
            imagePollInitialDelayMs: 0,
            imagePollDelayMs: 0
          },
          {
            prompt: "失败任务",
            size: "1600x900",
            model: "GPT-Image-2"
          }
        ),
      /failed/
    );
  } finally {
    global.fetch = originalFetch;
  }
}

async function testImageDetailTransientPayloadRetry() {
  let calls = 0;
  const originalFetch = global.fetch;
  global.fetch = async () => {
    calls += 1;
    if (calls === 1) return jsonResponse({ data: { task_id: "task_retry" } });
    if (calls === 2) {
      return jsonResponse({
        code: 500,
        message: "CURL request failed: Operation timed out after 30001 milliseconds with 0 bytes received"
      });
    }
    return jsonResponse({ data: { imageUrl: "https://cdn.example.com/retry-ok.png" } });
  };

  try {
    const result = await callImageApi(
      {
        apiKey: "test-key",
        imageEndpoint: "https://api.wuyinkeji.com/api/async/image_gpt",
        imageDetailEndpoint: "https://api.wuyinkeji.com/api/async/detail",
        imagePollAttempts: 3,
        imagePollInitialDelayMs: 0,
        imagePollDelayMs: 0,
        apiFetchRetryAttempts: 0
      },
      {
        prompt: "详情临时超时后成功",
        size: "1600x900",
        model: "GPT-Image-2"
      }
    );
    assert.strictEqual(result.imageUrl, "https://cdn.example.com/retry-ok.png");
    assert.ok(calls >= 3);
  } finally {
    global.fetch = originalFetch;
  }
}

async function testImageDimensionProbeFallbackSize() {
  let calls = 0;
  const originalFetch = global.fetch;
  global.fetch = async () => {
    calls += 1;
    if (calls === 1) return jsonResponse({ data: { imageUrl: "https://cdn.example.com/generated.webp" } });
    throw new TypeError("fetch failed");
  };

  try {
    const result = await callImageApi(
      {
        apiKey: "test-key",
        imageEndpoint: "https://api.wuyinkeji.com/api/async/image_gpt",
        imageDetailEndpoint: "https://api.wuyinkeji.com/api/async/detail",
        apiFetchRetryAttempts: 0
      },
      {
        prompt: "dimension fallback",
        size: "1600x900",
        model: null
      }
    );
    assert.strictEqual(result.width, 1600);
    assert.strictEqual(result.height, 900);
  } finally {
    global.fetch = originalFetch;
  }
}

async function testTextRequestTimeout() {
  const originalFetch = global.fetch;
  global.fetch = neverResolvingFetch;

  try {
    await assert.rejects(
      () =>
        callTextApi(
          {
            apiKey: "test-key",
            textEndpoint: "https://api.wuyinkeji.com/api/chat/index",
            apiRequestTimeoutMs: 5
          },
          {
            content: "超时文本",
            model: "gpt-5.5"
          }
        ),
      /Text API request timed out/
    );
  } finally {
    global.fetch = originalFetch;
  }
}

async function testTextRequestFetchFailureRetry() {
  let calls = 0;
  const originalFetch = global.fetch;
  global.fetch = async () => {
    calls += 1;
    if (calls === 1) throw new TypeError("fetch failed");
    return jsonResponse({ data: { choices: [{ message: { content: "retry ok" } }] } });
  };

  try {
    const result = await callTextApi(
      {
        apiKey: "test-key",
        textEndpoint: "https://api.example.com/v1/chat/completions",
        textRequestFormat: "openai-chat",
        apiFetchRetryAttempts: 1,
        apiFetchRetryDelayMs: 0
      },
      {
        content: "retry text",
        model: "test-model"
      }
    );
    assert.strictEqual(result, "retry ok");
    assert.strictEqual(calls, 2);
  } finally {
    global.fetch = originalFetch;
  }
}

async function testImageDetailRequestTimeout() {
  let calls = 0;
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    calls += 1;
    if (calls === 1) return jsonResponse({ data: { task_id: "task_timeout" } });
    return neverResolvingFetch(url, options);
  };

  try {
    await assert.rejects(
      () =>
        callImageApi(
          {
            apiKey: "test-key",
            imageEndpoint: "https://api.wuyinkeji.com/api/async/image_gpt",
            imageDetailEndpoint: "https://api.wuyinkeji.com/api/async/detail",
            imagePollAttempts: 2,
            imagePollInitialDelayMs: 0,
            imagePollDelayMs: 0,
            apiRequestTimeoutMs: 5
          },
          {
            prompt: "详情请求超时",
            size: "1600x900",
            model: "GPT-Image-2"
          }
        ),
      /Image detail API request timed out/
    );
  } finally {
    global.fetch = originalFetch;
  }
}

async function testImageTimeout() {
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    if (String(url).includes("image_gpt")) return jsonResponse({ data: { task_id: "task_pending" } });
    return jsonResponse({ data: { status: "running" } });
  };

  try {
    await assert.rejects(
      () =>
        callImageApi(
          {
            apiKey: "test-key",
            imageEndpoint: "https://api.wuyinkeji.com/api/async/image_gpt",
            imageDetailEndpoint: "https://api.wuyinkeji.com/api/async/detail",
            imagePollAttempts: 1,
            imagePollInitialDelayMs: 0,
            imagePollDelayMs: 0
          },
          {
            prompt: "超时任务",
            size: "1600x900",
            model: "GPT-Image-2"
          }
        ),
      /timed out/
    );
  } finally {
    global.fetch = originalFetch;
  }
}

function jsonResponse(value) {
  return {
    ok: true,
    status: 200,
    async text() {
      return JSON.stringify(value);
    }
  };
}

function neverResolvingFetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    if (options.signal) {
      options.signal.addEventListener("abort", () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      });
    }
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
