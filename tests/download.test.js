"use strict";

const assert = require("assert");
const {
  buildImageDownloadName,
  inferImageExtension,
  sanitizeFilename
} = require("../src/download");

function main() {
  assert.strictEqual(inferImageExtension("data:image/svg+xml;charset=utf-8,<svg></svg>"), "svg");
  assert.strictEqual(inferImageExtension("data:image/png;base64,abc"), "png");
  assert.strictEqual(inferImageExtension("https://cdn.example.com/a/final.PNG?token=1"), "png");
  assert.strictEqual(inferImageExtension("https://cdn.example.com/a/final.jpeg"), "jpg");
  assert.strictEqual(inferImageExtension("https://cdn.example.com/image-without-extension"), "png");
  assert.strictEqual(inferImageExtension("data:image/unknown;base64,abc"), "png");

  assert.strictEqual(sanitizeFilename(' Chat/Image: "Value"*? '), "Chat_Image_ _Value_");
  assert.strictEqual(sanitizeFilename("..."), "chatimage");
  assert.strictEqual(sanitizeFilename("x".repeat(120)).length, 80);

  assert.strictEqual(
    buildImageDownloadName({
      title: "Chat/Image: Value?.png",
      imageUrl: "https://cdn.example.com/generated.webp?x=1"
    }),
    "Chat_Image_ Value_.webp"
  );
  assert.strictEqual(
    buildImageDownloadName({
      title: "",
      imageUrl: "data:image/svg+xml;charset=utf-8,<svg></svg>"
    }),
    "chatimage.svg"
  );

  console.log("download.test.js passed");
}

main();
