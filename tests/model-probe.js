"use strict";

const { createServer } = require("../server");

const candidates = (process.env.CHATIMAGE_MODEL_CANDIDATES || [
  process.env.CHATIMAGE_TEXT_MODEL,
  "mimo-v2.5-pro"
].filter(Boolean).join(","))
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

async function main() {
  const apiKey = process.env.CHATIMAGE_API_KEY || process.env.WUYIN_API_KEY || "";
  const textApiKey = process.env.CHATIMAGE_TEXT_API_KEY || apiKey;
  if (!textApiKey) {
    console.log("model-probe.js skipped: CHATIMAGE_TEXT_API_KEY or CHATIMAGE_API_KEY is not set");
    return;
  }
  const textBaseUrl = String(process.env.CHATIMAGE_TEXT_BASE_URL || "https://api.xiaomimimo.com/v1").trim().replace(/\/+$/, "");

  const server = createServer({
    port: 0,
    apiKey,
    textApiKey,
    textModel: candidates[0],
    imageModel: process.env.CHATIMAGE_IMAGE_MODEL || "GPT-Image-2",
    textEndpoint:
      process.env.CHATIMAGE_TEXT_ENDPOINT ||
      (/\/chat\/completions$/i.test(textBaseUrl) ? textBaseUrl : `${textBaseUrl}/chat/completions`),
    textRequestFormat: process.env.CHATIMAGE_TEXT_REQUEST_FORMAT || "openai-chat",
    textSystemPrompt: process.env.CHATIMAGE_TEXT_SYSTEM_PROMPT || "",
    textThinkingType: process.env.CHATIMAGE_TEXT_THINKING_TYPE || "disabled",
    imageEndpoint: "https://api.wuyinkeji.com/api/async/image_gpt",
    imageDetailEndpoint: "https://api.wuyinkeji.com/api/async/detail"
  });

  await listen(server);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const results = [];

  try {
    for (const model of [...new Set(candidates)]) {
      try {
        const response = await postJson(`${baseUrl}/api/llm`, {
          purpose: "model_probe",
          content: "请回复 OK",
          model
        });
        results.push({ model, ok: true, sample: String(response.content).slice(0, 80) });
        console.log(`OK ${model}: ${String(response.content).slice(0, 80)}`);
      } catch (error) {
        results.push({ model, ok: false, error: error.message });
        console.log(`FAIL ${model}: ${error.message}`);
      }
    }
  } finally {
    await close(server);
  }

  if (!results.some((result) => result.ok)) {
    process.exitCode = 1;
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
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error || JSON.stringify(json));
  return json;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
