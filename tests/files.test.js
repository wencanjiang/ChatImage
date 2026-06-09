"use strict";

const assert = require("assert");
const {
  MAX_FILE_BYTES,
  MAX_FILES,
  buildPromptWithAttachments,
  buildVisibleQuestion,
  formatBytes,
  getSupportedFileSummary,
  isSupportedFile,
  looksLikeBinaryText,
  readFileAttachments,
  validateFile
} = require("../src/files");

async function main() {
  assert.strictEqual(isSupportedFile(createFile("notes.md", "text/markdown", "# ok")), true);
  assert.strictEqual(isSupportedFile(createFile("data.json", "application/json", "{}")), true);
  assert.strictEqual(isSupportedFile(createFile("notebook.ipynb", "application/json", "{}")), true);
  assert.strictEqual(isSupportedFile(createFile("config.toml", "application/toml", "a=1")), true);
  assert.strictEqual(isSupportedFile(createFile("App.vue", "", "<template></template>")), true);
  assert.strictEqual(isSupportedFile(createFile("Dockerfile", "", "FROM node")), true);
  assert.strictEqual(isSupportedFile(createFile("script.py", "", "print(1)")), true);
  assert.strictEqual(isSupportedFile(createFile("report.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "")), false);
  assert.strictEqual(isSupportedFile(createFile("photo.png", "image/png", "")), false);
  assert.match(validateFile(createFile("report.pdf", "application/pdf", "")).reason, /PDF/);
  assert.match(validateFile(createFile("photo.png", "image/png", "")).reason, /图片上传/);

  assert.strictEqual(validateFile(createFile("large.txt", "text/plain", "x", MAX_FILE_BYTES + 1)).valid, false);

  const existing = Array.from({ length: MAX_FILES - 1 }, (_, index) => ({
    id: `file_${index}`,
    name: `old-${index}.txt`,
    content: "old"
  }));
  const result = await readFileAttachments(
    [createFile("new.txt", "text/plain", "hello"), createFile("extra.txt", "text/plain", "ignored")],
    existing
  );
  assert.strictEqual(result.attachments.length, MAX_FILES);
  assert.strictEqual(result.rejected.length, 1);
  assert.match(result.rejected[0].reason, /最多上传/);

  const prompt = buildPromptWithAttachments("请总结", [
    {
      name: "notes.md",
      type: "text/markdown",
      size: 1024,
      content: "# 标题\n正文",
      truncated: false
    }
  ]);
  assert.match(prompt, /请总结/);
  assert.match(prompt, /文件 1: notes\.md/);
  assert.match(prompt, /# 标题/);
  assert.strictEqual(buildVisibleQuestion("", [{ name: "a.md" }, { name: "b.md" }]), "请基于 2 个上传文件生成结构化总结。");
  assert.match(getSupportedFileSummary(), /Markdown/);
  assert.match(getSupportedFileSummary(), /512 KB/);
  assert.strictEqual(buildPromptWithAttachments("", []).startsWith("请基于上传文件内容"), true);
  assert.strictEqual(formatBytes(2048), "2 KB");

  await testRejectedUnreadableFiles();

  console.log("files.test.js passed");
}

async function testRejectedUnreadableFiles() {
  assert.strictEqual(looksLikeBinaryText("hello\nworld"), false);
  assert.strictEqual(looksLikeBinaryText("hello\u0000world"), true);

  const binaryLike = await readFileAttachments([createFile("fake.txt", "text/plain", "abc\u0000def")]);
  assert.strictEqual(binaryLike.attachments.length, 0);
  assert.strictEqual(binaryLike.rejected.length, 1);
  assert.match(binaryLike.rejected[0].reason, /不是可读文本/);

  const emptyFile = await readFileAttachments([createFile("empty.md", "text/markdown", "")]);
  assert.strictEqual(emptyFile.attachments.length, 0);
  assert.match(emptyFile.rejected[0].reason, /内容为空/);

  const readFailed = await readFileAttachments([createBrokenFile("broken.md", "text/markdown")]);
  assert.strictEqual(readFailed.attachments.length, 0);
  assert.match(readFailed.rejected[0].reason, /读取失败/);
}

function createFile(name, type, content, size) {
  return {
    name,
    type,
    size: typeof size === "number" ? size : Buffer.byteLength(content || ""),
    async text() {
      return content || "";
    }
  };
}

function createBrokenFile(name, type) {
  return {
    name,
    type,
    size: 16,
    async text() {
      throw new Error("broken read");
    }
  };
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
