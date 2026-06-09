"use strict";

const assert = require("assert");
const { callImageApi, callTextApi } = require("../server");

async function main() {
  await testTextNonJsonError();
  await testTextRequestTimeout();
  await testImageTaskFailure();
  await testImageDimensionProbeUnsupportedFormat();
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

async function testImageDimensionProbeUnsupportedFormat() {
  let calls = 0;
  const originalFetch = global.fetch;
  global.fetch = async () => {
    calls += 1;
    if (calls === 1) return jsonResponse({ data: { imageUrl: "https://cdn.example.com/generated.webp" } });
    return {
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "image/webp" }),
      async arrayBuffer() {
        return Buffer.from("RIFF0000WEBP", "ascii").buffer;
      }
    };
  };

  try {
    await assert.rejects(
      () =>
        callImageApi(
          {
            apiKey: "test-key",
            imageEndpoint: "https://api.wuyinkeji.com/api/async/image_gpt",
            imageDetailEndpoint: "https://api.wuyinkeji.com/api/async/detail"
          },
          {
            prompt: "unsupported image header",
            size: "1600x900",
            model: null
          }
        ),
      /PNG, JPEG or SVG/
    );
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
