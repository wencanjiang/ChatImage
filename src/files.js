(function initFiles(global) {
  "use strict";

  const MAX_FILES = 5;
  const MAX_FILE_BYTES = 512 * 1024;
  const MAX_ATTACHMENT_CHARS = 12_000;
  const MAX_TEXT_SNIFF_CHARS = 4096;
  const MAX_CONTROL_CHAR_RATIO = 0.02;

  const supportedGroups = [
    {
      label: "文本与 Markdown",
      extensions: [".txt", ".md", ".markdown", ".rst", ".adoc"]
    },
    {
      label: "表格与数据",
      extensions: [".csv", ".tsv", ".json", ".jsonl", ".ipynb", ".yaml", ".yml", ".toml"]
    },
    {
      label: "网页与结构化文本",
      extensions: [".html", ".htm", ".xml", ".svg"]
    },
    {
      label: "日志与配置",
      extensions: [".log", ".ini", ".conf", ".config", ".properties", ".env"]
    },
    {
      label: "代码文件",
      extensions: [
        ".sql",
        ".js",
        ".mjs",
        ".cjs",
        ".ts",
        ".tsx",
        ".jsx",
        ".vue",
        ".svelte",
        ".astro",
        ".css",
        ".scss",
        ".py",
        ".java",
        ".go",
        ".rs",
        ".c",
        ".cpp",
        ".h",
        ".hpp",
        ".cs",
        ".php",
        ".rb",
        ".swift",
        ".kt",
        ".kts",
        ".sh",
        ".bat",
        ".ps1",
        ".r",
        ".scala",
        ".lua",
        ".graphql",
        ".gql"
      ]
    }
  ];

  const textExtensions = new Set(supportedGroups.flatMap((group) => group.extensions));
  const textFileNames = new Set(["dockerfile", "makefile", "gemfile", "rakefile"]);
  const unsupportedBinaryExtensions = new Set([
    ".pdf",
    ".doc",
    ".docx",
    ".ppt",
    ".pptx",
    ".xls",
    ".xlsx",
    ".pages",
    ".numbers",
    ".key",
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
    ".gif",
    ".bmp",
    ".tif",
    ".tiff",
    ".zip",
    ".rar",
    ".7z"
  ]);

  const supportedMimeTypes = new Set([
    "application/json",
    "application/ld+json",
    "application/xml",
    "application/xhtml+xml",
    "application/x-yaml",
    "application/yaml",
    "text/yaml",
    "application/toml",
    "application/x-toml",
    "application/x-ndjson"
  ]);

  const supportedAccept = [
    ...Array.from(textExtensions).sort(),
    "text/*",
    "application/json",
    "application/xml",
    "application/x-yaml",
    "application/x-ndjson",
    "application/toml"
  ].join(",");

  function getExtension(name) {
    const normalized = String(name || "").trim().toLowerCase();
    const index = normalized.lastIndexOf(".");
    return index <= 0 ? "" : normalized.slice(index);
  }

  function isSupportedFile(file) {
    const type = String((file && file.type) || "").toLowerCase();
    const name = String((file && file.name) || "").trim().toLowerCase();
    if (type.startsWith("text/") || supportedMimeTypes.has(type)) return true;
    if (textFileNames.has(name)) return true;
    return textExtensions.has(getExtension(file && file.name));
  }

  function validateFile(file) {
    if (!file || !file.name) return { valid: false, reason: "文件无效" };
    const unsupportedReason = getUnsupportedBinaryReason(file);
    if (unsupportedReason) return { valid: false, reason: unsupportedReason };
    if (!isSupportedFile(file)) {
      return {
        valid: false,
        reason: getSupportedFileSummary()
      };
    }
    if (Number(file.size || 0) > MAX_FILE_BYTES) {
      return { valid: false, reason: `单个文件不能超过 ${formatBytes(MAX_FILE_BYTES)}` };
    }
    return { valid: true };
  }

  function getUnsupportedBinaryReason(file) {
    const extension = getExtension(file && file.name);
    if (!unsupportedBinaryExtensions.has(extension)) return "";
    if (/\.(png|jpe?g|webp|gif|bmp|tiff?)$/.test(extension)) {
      return "暂不支持图片上传；当前只读取文本型材料，图片后续需要接 OCR 或视觉模型";
    }
    if (/\.(pdf|docx?|pptx?|xlsx?)$/.test(extension)) {
      return "暂不支持 PDF、Word、PPT 或 Excel；当前版本只读取可直接转成文本的文件";
    }
    return "暂不支持压缩包或二进制文件；请先解压或导出为文本";
  }

  async function readFileAttachment(file, options = {}) {
    const validation = validateFile(file);
    if (!validation.valid) {
      const error = new Error(validation.reason);
      error.fileName = file && file.name ? file.name : "";
      throw error;
    }

    const maxChars = options.maxChars || MAX_ATTACHMENT_CHARS;
    let text;
    try {
      text = await file.text();
    } catch (error) {
      const readError = new Error("文件读取失败，请确认文件未损坏并重新上传");
      readError.fileName = file && file.name ? file.name : "";
      throw readError;
    }
    const normalized = normalizeText(text);
    if (!normalized) {
      const emptyError = new Error("文件内容为空，已忽略");
      emptyError.fileName = file && file.name ? file.name : "";
      throw emptyError;
    }
    if (looksLikeBinaryText(normalized)) {
      const binaryError = new Error("不支持该文件内容：看起来不是可读文本，请导出为 txt、md、csv 或 json 等文本格式");
      binaryError.fileName = file && file.name ? file.name : "";
      throw binaryError;
    }
    const truncated = normalized.length > maxChars;
    return {
      id: options.id || createAttachmentId(file),
      name: file.name,
      type: file.type || "",
      size: file.size || normalized.length,
      extension: getExtension(file.name),
      content: truncated ? normalized.slice(0, maxChars) : normalized,
      truncated
    };
  }

  async function readFileAttachments(fileList, existingAttachments = [], options = {}) {
    const incomingFiles = Array.from(fileList || []);
    const attachments = existingAttachments.slice();
    const rejected = [];
    for (const file of incomingFiles) {
      if (attachments.length >= MAX_FILES) {
        rejected.push({ name: file.name, reason: `最多上传 ${MAX_FILES} 个文件` });
        continue;
      }
      try {
        attachments.push(await readFileAttachment(file, options));
      } catch (error) {
        rejected.push({ name: error.fileName || file.name, reason: error.message || String(error) });
      }
    }
    return { attachments, rejected };
  }

  function buildPromptWithAttachments(question, attachments) {
    const cleanQuestion = buildVisibleQuestion(question, attachments);
    const list = Array.isArray(attachments) ? attachments.filter((item) => item && item.content) : [];
    if (!list.length) return cleanQuestion;
    const context = list
      .map((item, index) =>
        [
          `### 文件 ${index + 1}: ${item.name}`,
          `类型: ${item.type || item.extension || "text"}`,
          `大小: ${formatBytes(item.size || 0)}${item.truncated ? "，内容已截断" : ""}`,
          "",
          item.content
        ].join("\n")
      )
      .join("\n\n---\n\n");
    return [
      cleanQuestion,
      "",
      "以下是用户上传的文件内容，请在回答和结构化图片规划中结合这些材料：",
      "",
      context
    ].join("\n");
  }

  function buildVisibleQuestion(question, attachments) {
    const cleanQuestion = String(question || "").trim();
    if (cleanQuestion) return cleanQuestion;
    const count = Array.isArray(attachments) ? attachments.length : 0;
    return count ? `请基于 ${count} 个上传文件生成结构化总结。` : "请基于上传文件内容生成结构化总结。";
  }

  function getSupportedFileSummary() {
    return `支持文本型文件：${supportedGroups
      .map((group) => `${group.label}（${group.extensions.join(" ")}）`)
      .join("；")}。最多 ${MAX_FILES} 个，单个不超过 ${formatBytes(MAX_FILE_BYTES)}。`;
  }

  function normalizeText(value) {
    return String(value || "").replace(/\r\n?/g, "\n").trim();
  }

  function looksLikeBinaryText(value) {
    const sample = String(value || "").slice(0, MAX_TEXT_SNIFF_CHARS);
    if (!sample) return false;
    if (sample.includes("\u0000")) return true;
    let controlCount = 0;
    for (let index = 0; index < sample.length; index += 1) {
      const code = sample.charCodeAt(index);
      const allowedWhitespace = code === 9 || code === 10 || code === 13;
      if (code < 32 && !allowedWhitespace) controlCount += 1;
    }
    return controlCount / sample.length > MAX_CONTROL_CHAR_RATIO;
  }

  function formatBytes(bytes) {
    const value = Number(bytes || 0);
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${Math.ceil(value / 1024)} KB`;
    return `${(value / 1024 / 1024).toFixed(1)} MB`;
  }

  function createAttachmentId(file) {
    return `file_${createRandomIdPart()}_${String(file.name || "upload").replace(/\W+/g, "_")}`;
  }

  function createRandomIdPart() {
    const cryptoApi =
      typeof globalThis !== "undefined" && globalThis.crypto && typeof globalThis.crypto.getRandomValues === "function"
        ? globalThis.crypto
        : null;
    if (cryptoApi) {
      const bytes = new Uint8Array(6);
      cryptoApi.getRandomValues(bytes);
      return Array.from(bytes, (byte) => byte.toString(36).padStart(2, "0")).join("");
    }
    return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  const api = {
    MAX_ATTACHMENT_CHARS,
    MAX_FILE_BYTES,
    MAX_FILES,
    buildPromptWithAttachments,
    buildVisibleQuestion,
    formatBytes,
    getExtension,
    getSupportedFileSummary,
    isSupportedFile,
    looksLikeBinaryText,
    readFileAttachment,
    readFileAttachments,
    supportedAccept,
    validateFile
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  global.ChatImageFiles = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
