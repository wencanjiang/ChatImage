"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

function main() {
  const root = process.cwd();
  const envExample = fs.readFileSync(path.join(root, ".env.example"), "utf8");
  for (const key of [
    "CHATIMAGE_API_KEY",
    "CHATIMAGE_TEXT_API_KEY",
    "CHATIMAGE_TEXT_BASE_URL",
    "CHATIMAGE_TEXT_ENDPOINT",
    "CHATIMAGE_TEXT_MODEL",
    "CHATIMAGE_TEXT_REQUEST_FORMAT",
    "CHATIMAGE_TEXT_MAX_COMPLETION_TOKENS",
    "CHATIMAGE_TEXT_TEMPERATURE",
    "CHATIMAGE_TEXT_TOP_P",
    "CHATIMAGE_TEXT_JSON_RESPONSE_FORMAT",
    "CHATIMAGE_TEXT_THINKING_TYPE",
    "CHATIMAGE_IMAGE_MODEL",
    "CHATIMAGE_VISION_MODE",
    "CHATIMAGE_VISION_ENDPOINT",
    "CHATIMAGE_VISION_API_KEY",
    "CHATIMAGE_VISION_MODEL",
    "CHATIMAGE_VISION_AUTH_MODE",
    "CHATIMAGE_VISION_REQUEST_FORMAT",
    "CHATIMAGE_LOCAL_OCR_PYTHON",
    "CHATIMAGE_LOCAL_OCR_TIMEOUT_MS",
    "CHATIMAGE_LOCAL_OCR_MAX_IMAGE_BYTES",
    "CHATIMAGE_LOCATEANYTHING_LICENSE_ACK",
    "CHATIMAGE_LOCATEANYTHING_PYTHON",
    "CHATIMAGE_LOCATEANYTHING_MODEL",
    "CHATIMAGE_LOCATEANYTHING_DEVICE",
    "CHATIMAGE_LOCATEANYTHING_TIMEOUT_MS",
    "CHATIMAGE_LOCATEANYTHING_MAX_NEW_TOKENS",
    "CHATIMAGE_LOCATEANYTHING_MAX_IMAGE_SIDE",
    "CHATIMAGE_LOCATEANYTHING_GENERATION_MODE",
    "CHATIMAGE_IMAGE_POLL_ATTEMPTS",
    "CHATIMAGE_MAX_UPSTREAM_REQUESTS"
  ]) {
    assert.match(envExample, new RegExp(`^${key}=`, "m"), `.env.example missing ${key}`);
  }

  const contract = fs.readFileSync(path.join(root, "docs", "archive", "vision-endpoint-contract.md"), "utf8");
  assert.match(contract, /OpenAI-compatible chat completions/);
  assert.match(contract, /local-ocr/);
  assert.match(contract, /locateanything/);
  assert.match(contract, /NVIDIA License/);
  assert.match(contract, /wuyin-form/);
  assert.match(contract, /image_url/);
  assert.match(contract, /response_format/);
  assert.match(contract, /moduleId/);
  assert.match(contract, /bounds/);
  assert.match(contract, /confidence/);
  assert.match(contract, /imageWidth/);
  assert.match(contract, /imageHeight/);
  assert.match(contract, /\/api\/vision\/health/);
  assert.match(contract, /\/api\/llm\/health/);
  assert.match(contract, /imageVisible/);
  assert.match(contract, /Real Instance Readiness/);
  assert.match(contract, /textHealth/);
  assert.match(contract, /npm\.cmd run test:real-instance/);

  const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
  assert.match(readme, /docs\/archive\/vision-endpoint-contract\.md/);

  console.log("docs.test.js passed");
}

main();
