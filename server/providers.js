"use strict";

async function callTextApi(serverConfig, { content, model, purpose, responseFormat }) {
  if (!content.trim()) {
    const error = new Error("content is required");
    error.statusCode = 400;
    throw error;
  }

  const requestFormat = resolveTextRequestFormat(serverConfig);
  if (requestFormat === "wuyin-form") {
    return callWuyinFormTextApi(serverConfig, { content, model, purpose, responseFormat });
  }

  return callOpenAiChatTextApi(serverConfig, { content, model, purpose, responseFormat });
}

async function callTextApiDetailed(serverConfig, { content, model, purpose, responseFormat }) {
  const primaryModel = model || serverConfig.textModel || "";
  try {
    const primaryContent = await callTextApi(serverConfig, {
      content,
      model: primaryModel,
      purpose,
      responseFormat
    });
    return {
      content: primaryContent,
      modelUsed: primaryModel,
      fallbackReason: ""
    };
  } catch (error) {
    if (!shouldFallbackTextApi(serverConfig, error, primaryModel)) throw error;
    const fallbackModel = String(serverConfig.textFallbackModel || "").trim();
    try {
      const fallbackContent = await callTextApi(serverConfig, {
        content,
        model: fallbackModel,
        purpose,
        responseFormat
      });
      return {
        content: fallbackContent,
        modelUsed: fallbackModel,
        fallbackReason: formatTextFallbackReason(error, primaryModel, fallbackModel)
      };
    } catch (fallbackError) {
      fallbackError.message = `${fallbackError.message || fallbackError} (fallback ${fallbackModel} after ${primaryModel} failed; primary: ${
        error.message || error
      })`;
      throw fallbackError;
    }
  }
}

function shouldFallbackTextApi(serverConfig, error, primaryModel) {
  if (!serverConfig || serverConfig.textFallbackOn5xx === false) return false;
  const fallbackModel = String(serverConfig.textFallbackModel || "").trim();
  if (!fallbackModel || fallbackModel === String(primaryModel || "").trim()) return false;
  return isTransientApiFailure(error);
}

function formatTextFallbackReason(error, primaryModel, fallbackModel) {
  const status = Number(error && error.statusCode);
  const statusText = Number.isFinite(status) ? `status ${status}` : "request error";
  const message = String((error && error.message) || error || "").slice(0, 240);
  return `${primaryModel || "primary"} -> ${fallbackModel}: ${statusText}; ${message}`;
}

function isTransientApiFailure(error) {
  const status = Number(error && error.statusCode);
  if (Number.isFinite(status)) return status >= 500 || status === 408 || status === 429;
  const message = String((error && error.message) || error || "");
  return /timed out|timeout|fetch failed|network|socket|ECONNRESET|ETIMEDOUT|UND_ERR|Bad Gateway|Gateway Timeout|Operation timed out/i.test(message);
}

async function callWuyinFormTextApi(serverConfig, { content, model, purpose, responseFormat }) {
  const apiKey = serverConfig.textApiKey || serverConfig.apiKey;

  const payload = new URLSearchParams({
    content,
    model,
    stream: "false",
    key: apiKey
  });

  if (purpose) payload.set("purpose", purpose);
  if (responseFormat) payload.set("response_format", responseFormat);

  const response = await fetchWithTimeout(
    serverConfig.textEndpoint,
    {
      method: "POST",
      headers: {
        Authorization: apiKey,
        "Content-Type": "application/x-www-form-urlencoded;charset=utf-8"
      },
      body: payload
    },
    createFetchOptions(serverConfig, "Text API request")
  );

  const data = await parseJsonResponse(response);
  if (isApiErrorPayload(data)) {
    throw new Error(`Text API error: ${formatApiError(data)}`);
  }
  const contentValue = extractTextContent(data);
  if (!contentValue) {
    throw new Error("Text API returned no content");
  }
  return contentValue;
}

async function callOpenAiChatTextApi(serverConfig, { content, model, purpose, responseFormat }) {
  const apiKey = serverConfig.textApiKey || serverConfig.apiKey;
  const messages = [];
  if (serverConfig.textSystemPrompt) {
    messages.push({ role: "system", content: serverConfig.textSystemPrompt });
  }
  messages.push({ role: "user", content });

  const payload = {
    model: model || serverConfig.textModel || undefined,
    messages,
    temperature: Number(serverConfig.textTemperature ?? 1.0),
    top_p: Number(serverConfig.textTopP ?? 0.95),
    stream: false,
    stop: null,
    frequency_penalty: 0,
    presence_penalty: 0
  };
  const maxCompletionTokens = Number(serverConfig.textMaxCompletionTokens);
  if (Number.isFinite(maxCompletionTokens) && maxCompletionTokens > 0) {
    payload.max_completion_tokens = maxCompletionTokens;
  }
  if (serverConfig.textThinkingType) {
    payload.thinking = { type: serverConfig.textThinkingType };
  }
  if (responseFormat === "json" && serverConfig.textJsonResponseFormat === "native") {
    payload.response_format = { type: "json_object" };
  }

  const response = await fetchWithTimeout(
    serverConfig.textEndpoint,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    },
    createFetchOptions(serverConfig, "Text API request")
  );

  const data = await parseJsonResponse(response);
  if (isApiErrorPayload(data)) {
    throw new Error(`Text API error: ${formatApiError(data)}`);
  }
  const contentValue = extractTextContent(data);
  if (!contentValue) {
    throw new Error("Text API returned no content");
  }
  return contentValue;
}

function resolveTextRequestFormat(serverConfig) {
  const explicit = String(serverConfig.textRequestFormat || "").trim().toLowerCase();
  if (explicit) return explicit;
  const endpoint = String(serverConfig.textEndpoint || "").toLowerCase();
  if (endpoint.includes("api.wuyinkeji.com/api/chat/index")) return "wuyin-form";
  return "openai-chat";
}

async function callVisionApi(serverConfig, { content, imageUrl, model, purpose, responseFormat }) {
  if (!content.trim()) {
    const error = new Error("content is required");
    error.statusCode = 400;
    throw error;
  }
  if (!String(imageUrl || "").trim()) {
    const error = new Error("imageUrl is required");
    error.statusCode = 400;
    throw error;
  }
  if (!serverConfig.visionEndpoint) {
    const error = new Error("CHATIMAGE_VISION_ENDPOINT is required for real image hotspot alignment");
    error.statusCode = 503;
    throw error;
  }

  const mimoVisionRequest = isMimoVisionRequest(serverConfig);
  const apiKey = serverConfig.visionApiKey || (mimoVisionRequest ? serverConfig.textApiKey : "") || serverConfig.apiKey;
  if (!apiKey) {
    const error = new Error("CHATIMAGE_VISION_API_KEY, CHATIMAGE_TEXT_API_KEY, or CHATIMAGE_API_KEY is required for real image hotspot alignment");
    error.statusCode = 503;
    throw error;
  }

  const requestFormat = resolveVisionRequestFormat(serverConfig);
  if (requestFormat === "wuyin-form") {
    return callWuyinFormVisionApi(serverConfig, {
      apiKey,
      content,
      imageUrl,
      model,
      purpose,
      responseFormat
    });
  }

  const payload = {
    model: model || serverConfig.visionModel || (mimoVisionRequest ? "mimo-v2.5" : undefined),
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: content },
          { type: "image_url", image_url: { url: imageUrl } }
        ]
      }
    ]
  };
  if (purpose) payload.purpose = purpose;
  if (responseFormat === "json") payload.response_format = { type: "json_object" };

  const response = await fetchWithTimeout(
    serverConfig.visionEndpoint,
    {
      method: "POST",
      headers: createVisionHeaders(serverConfig, apiKey),
      body: JSON.stringify(payload)
    },
    createFetchOptions(serverConfig, "Vision API request")
  );

  const data = await parseJsonResponse(response);
  if (isApiErrorPayload(data)) {
    throw new Error(`Vision API error: ${formatApiError(data)}`);
  }
  const contentValue = extractTextContent(data);
  if (!contentValue) {
    throw new Error("Vision API returned no content");
  }
  return contentValue;
}

async function callWuyinFormVisionApi(serverConfig, { apiKey, content, imageUrl, model, purpose, responseFormat }) {
  const payload = new URLSearchParams({
    content: buildWuyinVisionContent(content, imageUrl),
    model: model || serverConfig.visionModel || serverConfig.textModel || "gemini-3.1-pro",
    stream: "false",
    key: apiKey,
    image_url: imageUrl,
    imageUrl,
    images: JSON.stringify([imageUrl])
  });

  if (purpose) payload.set("purpose", purpose);
  if (responseFormat) payload.set("response_format", responseFormat);

  const response = await fetchWithTimeout(
    serverConfig.visionEndpoint,
    {
      method: "POST",
      headers: {
        Authorization: apiKey,
        "Content-Type": "application/x-www-form-urlencoded;charset=utf-8"
      },
      body: payload
    },
    createFetchOptions(serverConfig, "Vision API request")
  );

  const data = await parseJsonResponse(response);
  if (isApiErrorPayload(data)) {
    throw new Error(`Vision API error: ${formatApiError(data)}`);
  }
  const contentValue = extractTextContent(data);
  if (!contentValue) {
    throw new Error("Vision API returned no content");
  }
  return contentValue;
}

function buildWuyinVisionContent(content, imageUrl) {
  return [
    content,
    "",
    "Image input for visual inspection:",
    imageUrl,
    "Use the supplied image input/URL only when you can actually inspect the image."
  ].join("\n");
}

function resolveVisionRequestFormat(serverConfig) {
  const explicit = String(serverConfig.visionRequestFormat || "").trim().toLowerCase();
  if (explicit) return explicit;
  const endpoint = String(serverConfig.visionEndpoint || "").toLowerCase();
  if (endpoint.includes("api.wuyinkeji.com/api/chat/index")) return "wuyin-form";
  return "openai-chat";
}

function isMimoVisionRequest(serverConfig) {
  return (
    String(serverConfig.visionMode || "").trim().toLowerCase() === "mimo-vision" ||
    String(serverConfig.visionFallbackMode || "").trim().toLowerCase() === "mimo-vision"
  );
}

function createVisionHeaders(serverConfig, apiKey) {
  const mode = String(serverConfig.visionAuthMode || "bearer").trim().toLowerCase();
  const headers = {
    "Content-Type": "application/json"
  };
  if (mode === "none") return headers;
  if (mode === "api-key" || mode === "azure") {
    headers["api-key"] = apiKey;
    return headers;
  }
  headers.Authorization = `Bearer ${apiKey}`;
  return headers;
}

async function callImageApi(serverConfig, { prompt, size, model, signal }) {
  if (!prompt.trim()) {
    const error = new Error("prompt is required");
    error.statusCode = 400;
    throw error;
  }

  const url = new URL(serverConfig.imageEndpoint);
  // Upstream image API authenticates via the bare key in the Authorization header.
  // The key must NOT be a Bearer token (that is rejected as code:403) and must NOT
  // be placed in the URL query string (it leaks into upstream access logs).
  // CHATIMAGE_IMAGE_KEY_IN_QUERY=1 keeps the legacy leaky form only if an upstream
  // ever requires it.
  if (serverConfig.imageKeyInQuery) url.searchParams.set("key", serverConfig.apiKey);
  const payload = model
    ? {
        prompt,
        size,
        model
      }
    : {
        prompt,
        size
      };
  const data = await createImageTaskOrDirectResult(serverConfig, url, payload);
  const directUrl = extractImageUrl(data);
  if (directUrl) {
    return {
      imageUrl: directUrl,
      ...(await resolveImageDimensions(serverConfig, data, directUrl, size)),
      providerRaw: data
    };
  }

  const taskId = extractTaskId(data);
  if (!taskId) {
    throw new Error("Image API returned no task id or image url");
  }

  const detail = await pollImageTask(serverConfig, taskId, signal);
  const imageUrl = extractImageUrl(detail);
  if (!imageUrl) {
    throw new Error("Image task completed without image url");
  }

  return {
    imageUrl,
    ...(await resolveImageDimensions(serverConfig, detail, imageUrl, size)),
    providerRaw: { task: data, detail }
  };
}

async function createImageTaskOrDirectResult(serverConfig, url, payload) {
  const retryAttempts = Number(serverConfig.apiFetchRetryAttempts || 0);
  const attempts = Math.max(1, Number(serverConfig.imageCreateAttempts || 0) || retryAttempts + 1);
  const delayMs = Number(serverConfig.apiFetchRetryDelayMs || 800);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetchWithTimeout(
        url,
        {
          method: "POST",
          headers: {
            Authorization: serverConfig.apiKey,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload)
        },
        createFetchOptions(serverConfig, "Image API request")
      );
      const data = await parseJsonResponse(response);
      if (isApiErrorPayload(data)) {
        const formatted = formatApiError(data);
        if (attempt < attempts - 1 && shouldRetryImageCreatePayloadError(data, formatted)) {
          await sleep(delayMs * (attempt + 1));
          continue;
        }
        throw new Error(`Image API error: ${formatted}`);
      }
      return data;
    } catch (error) {
      if (attempt < attempts - 1 && isTransientApiFailure(error)) {
        await sleep(delayMs * (attempt + 1));
        continue;
      }
      throw error;
    }
  }
  throw new Error("Image API request failed after retries");
}

function shouldRetryImageCreatePayloadError(data, formatted) {
  if (isTransientApiFailure(formatted)) return true;
  const code = Number(data && (data.code ?? data.status ?? data.error?.code));
  if (code !== 400) return false;
  const rawText = [
    data && data.msg,
    data && data.message,
    data && (typeof data.error === "string" ? data.error : ""),
    data && data.error && data.error.message,
    data && data.error && data.error.msg
  ]
    .map((value) => String(value || ""))
    .join(" ");
  return !/invalid|parameter|model|size|auth|key|permission|forbidden|unbound|missing|required/i.test(rawText);
}

async function pollImageTask(serverConfig, taskId, signal) {
  const maxAttempts = Number(serverConfig.imagePollAttempts || 30);
  const firstDelay = Number(serverConfig.imagePollInitialDelayMs ?? 1200);
  const nextDelay = Number(serverConfig.imagePollDelayMs ?? 2000);
  const startedAt = Date.now();
  let lastStatus = "";
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (signal && signal.aborted) {
      const abortError = new Error("Image task polling aborted by client disconnect");
      abortError.statusCode = 499;
      throw abortError;
    }
    await sleepAbortable(attempt === 0 ? firstDelay : nextDelay, signal);
    const url = new URL(serverConfig.imageDetailEndpoint);
    if (serverConfig.imageKeyInQuery) url.searchParams.set("key", serverConfig.apiKey);
    url.searchParams.set("id", taskId);
    let data;
    try {
      const response = await fetchWithTimeout(
        url,
        {
          headers: { Authorization: serverConfig.apiKey }
        },
        createFetchOptions(serverConfig, "Image detail API request")
      );
      data = await parseJsonResponse(response);
    } catch (error) {
      if (attempt < maxAttempts - 1 && isTransientApiFailure(error)) {
        continue;
      }
      throw error;
    }
    if (isApiErrorPayload(data)) {
      const formatted = formatApiError(data);
      if (attempt < maxAttempts - 1 && isTransientApiFailure(formatted)) {
        continue;
      }
      logImageTaskEvent("failed", taskId, attempt + 1, startedAt, lastStatus);
      throw new Error(`Image detail API error: ${formatted}`);
    }
    const imageUrl = extractImageUrl(data);
    if (imageUrl) {
      logImageTaskEvent("ready", taskId, attempt + 1, startedAt, lastStatus);
      return data;
    }
    const status = String(data.status || data.state || data.data?.status || "").toLowerCase();
    if (status) lastStatus = status;
    if (status.includes("fail") || status.includes("error")) {
      logImageTaskEvent("failed", taskId, attempt + 1, startedAt, lastStatus);
      throw new Error(`Image task failed: ${formatApiError(data)}`);
    }
  }
  logImageTaskEvent("timeout", taskId, maxAttempts, startedAt, lastStatus);
  throw new Error(
    `Image task timed out (taskId=${taskId}, attempts=${maxAttempts}, elapsedMs=${Date.now() - startedAt}, lastStatus=${lastStatus || "unknown"})`
  );
}

// 记录生图轮询的关键阶段，便于排查上游超时/失败：task id、轮询次数、累计耗时、最后一次上游状态。
function logImageTaskEvent(phase, taskId, attempts, startedAt, lastStatus) {
  const elapsedMs = Date.now() - startedAt;
  const line = `[${new Date().toISOString()}] image-task ${phase} taskId=${taskId} attempts=${attempts} elapsedMs=${elapsedMs} lastStatus=${lastStatus || "n/a"}`;
  if (phase === "timeout" || phase === "failed") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

async function parseJsonResponse(response) {
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch (error) {
    data = parseLeadingJsonValue(text);
    if (!data) {
      const nonJsonError = new Error(`API returned non-JSON response (${response.status})`);
      nonJsonError.statusCode = response.status;
      throw nonJsonError;
    }
  }

  if (!response.ok) {
    const error = new Error(`API request failed (${response.status})`);
    error.statusCode = response.status;
    error.upstreamError = summarizeUpstreamError(data);
    throw error;
  }
  return data;
}

function summarizeUpstreamError(value) {
  if (!value || typeof value !== "object") return "";
  const code = value.code ?? value.status ?? value.error?.code;
  const type = value.type ?? value.error?.type;
  return [code !== undefined ? `code=${String(code).slice(0, 40)}` : "", type ? `type=${String(type).slice(0, 40)}` : ""]
    .filter(Boolean)
    .join(" ");
}

function parseLeadingJsonValue(text) {
  const source = String(text || "").trimStart();
  if (!source || !["{", "["].includes(source[0])) return null;

  const stack = [];
  let inString = false;
  let escaped = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === "{" || char === "[") {
      stack.push(char);
      continue;
    }
    if (char === "}" || char === "]") {
      const open = stack.pop();
      if ((char === "}" && open !== "{") || (char === "]" && open !== "[")) return null;
      if (stack.length === 0) {
        try {
          return JSON.parse(source.slice(0, index + 1));
        } catch (error) {
          return null;
        }
      }
    }
  }
  return null;
}

async function fetchWithTimeout(
  url,
  options = {},
  { label = "API request", timeoutMs, retryAttempts = 0, retryDelayMs = 800 } = {}
) {
  const ms = Number(timeoutMs ?? 45_000);
  const attempts = Math.max(1, Number.isInteger(Number(retryAttempts)) ? Number(retryAttempts) + 1 : 1);
  let lastError = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = Number.isFinite(ms) && ms > 0 ? new AbortController() : null;
    // Abort stops local waiting/request signaling; it does not guarantee upstream work or TCP resources end immediately.
    const timeout = controller ? setTimeout(() => controller.abort(), ms) : null;
    try {
      return await fetch(url, controller ? { ...options, signal: controller.signal } : options);
    } catch (error) {
      lastError = normalizeFetchError(error, label, ms);
      if (attempt >= attempts - 1 || !isRetriableFetchError(error)) throw lastError;
      await sleep(Number(retryDelayMs) * (attempt + 1));
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }
  throw lastError;
}

function extractTextContent(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.map(extractTextContent).find(Boolean) || "";
  }
  const fields = [
    value.content,
    value.text,
    value.message,
    value.answer,
    value.result,
    value.response,
    value.data?.content,
    value.data?.text,
    value.data?.message,
    value.data?.answer,
    value.data?.result,
    value.data?.choices?.[0]?.message?.content,
    value.data?.choices?.[0]?.text,
    value.choices?.[0]?.message?.content,
    value.choices?.[0]?.text
  ];
  return fields.map(extractTextContent).find(Boolean) || "";
}

function isApiErrorPayload(value) {
  if (!value || typeof value !== "object") return false;
  if (value.error) return true;
  if (typeof value.code === "number" && value.code !== 0 && value.code !== 200) return true;
  if (typeof value.status === "number" && value.status >= 400) return true;
  return false;
}

function formatApiError(value) {
  if (!value || typeof value !== "object") return safeUpstreamSnippet(String(value));
  if (value.error && typeof value.error === "object") {
    return safeUpstreamSnippet(
      value.error.message || value.error.msg || `code=${value.error.code ?? "?"}`
    );
  }
  return safeUpstreamSnippet(
    value.msg
      || value.message
      || (typeof value.error === "string" ? value.error : "")
      || `code=${value.code ?? "?"}`
  );
}

// Sanitize a string before embedding it into a client-visible error message.
// Strips bearer tokens, "key=" segments and full URL query strings that some
// upstream gateways echo back inside their error bodies, and caps the length.
function safeUpstreamSnippet(text) {
  if (!text) return "";
  let out = String(text);
  out = out.replace(/(?:Bearer|api[_-]?key|token|key)\s*[:=]\s*[A-Za-z0-9._\-+/=]+/gi, "[redacted]");
  out = out.replace(/(https?:\/\/[^\s?]+)\?[^\s]*/gi, "$1?[redacted]");
  return out.slice(0, 200);
}

function extractTaskId(value) {
  if (!value || typeof value !== "object") return "";
  return (
    value.id ||
    value.task_id ||
    value.taskId ||
    value.data?.id ||
    value.data?.task_id ||
    value.data?.taskId ||
    value.result?.id ||
    value.result?.task_id ||
    ""
  );
}

function extractImageUrl(value) {
  if (!value) return "";
  if (typeof value === "string") {
    if (/^data:image\//.test(value)) return value;
    if (/^https?:\/\/.+\.(png|jpe?g|webp|gif|svg)(\?.*)?$/i.test(value)) return value;
    if (/^https?:\/\/.+/i.test(value) && /(image|img|oss|cdn|files?)/i.test(value)) return value;
    return "";
  }
  if (Array.isArray(value)) {
    return value.map(extractImageUrl).find(Boolean) || "";
  }
  return (
    extractImageUrl(value.image_url) ||
    extractImageUrl(value.imageUrl) ||
    extractImageUrl(value.url) ||
    extractImageUrl(value.output) ||
    extractImageUrl(value.result) ||
    extractImageUrl(value.data) ||
    extractImageUrl(value.images)
  );
}

function extractImageDimensions(value, fallbackSize) {
  const direct = findDimensions(value);
  if (direct) return direct;
  return parseImageSize(fallbackSize);
}

async function resolveImageDimensions(serverConfig, value, imageUrl, fallbackSize) {
  const direct = findDimensions(value);
  if (direct) return direct;
  try {
    const probed = await probeImageDimensions(serverConfig, imageUrl);
    if (probed) return probed;
  } catch (error) {
    if (serverConfig.strictImageDimensionProbe) throw error;
  }
  return parseImageSize(fallbackSize);
}

async function probeImageDimensions(serverConfig, imageUrl) {
  const source = String(imageUrl || "");
  if (!source) return null;
  if (source.startsWith("data:image/")) {
    return parseImageBufferDimensions(bufferFromDataImage(source));
  }
  if (!/^https?:\/\//i.test(source)) return null;
  const response = await fetchWithTimeout(
    source,
    {
      headers: {
        Accept: "image/png,image/jpeg,image/svg+xml"
      }
    },
    createFetchOptions(serverConfig, "Image dimension probe")
  );
  if (!response.ok) {
    throw new Error(`Image dimension probe failed (${response.status}): ${source.slice(0, 160)}`);
  }
  const contentType = response.headers.get("content-type") || "";
  if (contentType && !/^image\//i.test(contentType)) {
    throw new Error(`Image dimension probe returned non-image content (${contentType})`);
  }
  const dimensions = parseImageBufferDimensions(Buffer.from(await response.arrayBuffer()));
  if (!dimensions) {
    throw new Error(
      `Image dimension probe could not parse PNG, JPEG or SVG dimensions (${contentType || "unknown content type"})`
    );
  }
  return dimensions;
}

function bufferFromDataImage(source) {
  const comma = source.indexOf(",");
  if (comma === -1) return Buffer.alloc(0);
  const meta = source.slice(0, comma);
  const body = source.slice(comma + 1);
  return /;base64/i.test(meta) ? Buffer.from(body, "base64") : Buffer.from(decodeURIComponent(body), "utf8");
}

function parseImageBufferDimensions(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 24) return null;
  const pngSignature = bytes.subarray(0, 8).toString("hex");
  if (pngSignature === "89504e470d0a1a0a") {
    return {
      width: bytes.readUInt32BE(16),
      height: bytes.readUInt32BE(20)
    };
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    return parseJpegDimensions(bytes);
  }
  const text = bytes.subarray(0, Math.min(bytes.length, 2048)).toString("utf8").trim();
  if (text.startsWith("<svg") || text.startsWith("<?xml")) {
    return parseSvgDimensions(text);
  }
  return null;
}

function parseJpegDimensions(bytes) {
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1];
    const length = bytes.readUInt16BE(offset + 2);
    if (length < 2) return null;
    if (
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)
    ) {
      return {
        width: bytes.readUInt16BE(offset + 7),
        height: bytes.readUInt16BE(offset + 5)
      };
    }
    offset += 2 + length;
  }
  return null;
}

function parseSvgDimensions(text) {
  const svgMatch = String(text || "").match(/<svg\b[^>]*>/i);
  if (!svgMatch) return null;
  const svgTag = svgMatch[0];
  const width = parseSvgLength(svgTag.match(/\bwidth=["']?([0-9.]+)/i)?.[1]);
  const height = parseSvgLength(svgTag.match(/\bheight=["']?([0-9.]+)/i)?.[1]);
  if (width && height) return { width, height };
  const viewBox = svgTag.match(/\bviewBox=["']?([0-9.\s-]+)/i)?.[1];
  if (!viewBox) return null;
  const parts = viewBox.trim().split(/\s+/).map(Number);
  if (parts.length !== 4 || !Number.isFinite(parts[2]) || !Number.isFinite(parts[3])) return null;
  return {
    width: Math.round(parts[2]),
    height: Math.round(parts[3])
  };
}

function parseSvgLength(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 16 ? Math.round(number) : null;
}

function findDimensions(value, seen = new Set()) {
  if (!value || typeof value !== "object") return null;
  if (seen.has(value)) return null;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      const dimensions = findDimensions(item, seen);
      if (dimensions) return dimensions;
    }
    return null;
  }

  const width = pickImageDimension(value.width, value.w, value.image_width, value.imageWidth);
  const height = pickImageDimension(value.height, value.h, value.image_height, value.imageHeight);
  if (width && height) {
    return { width, height };
  }

  const nestedKeys = ["data", "result", "output", "image", "images", "file", "files"];
  for (const key of nestedKeys) {
    const dimensions = findDimensions(value[key], seen);
    if (dimensions) return dimensions;
  }
  return null;
}

function pickImageDimension(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isInteger(number) && number >= 16) return number;
  }
  return null;
}

function parseImageSize(size) {
  const match = String(size || "").match(/^\s*(\d{2,5})\s*[xX×]\s*(\d{2,5})\s*$/);
  if (!match) return { width: 1600, height: 900 };
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 16 || height < 16) {
    return { width: 1600, height: 900 };
  }
  return { width, height };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Abortable sleep used by long polling loops. Resolves either when the timer
// fires or when the supplied AbortSignal is aborted, ensuring we stop holding
// upstream-gate slots after the originating client has disconnected.
function sleepAbortable(ms, signal) {
  if (!signal) return sleep(ms);
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      resolve();
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function createFetchOptions(serverConfig, label) {
  return {
    label,
    timeoutMs: serverConfig.apiRequestTimeoutMs,
    retryAttempts: serverConfig.apiFetchRetryAttempts,
    retryDelayMs: serverConfig.apiFetchRetryDelayMs
  };
}

function normalizeFetchError(error, label, ms) {
  if (error && error.name === "AbortError") {
    return new Error(`${label} timed out after ${ms}ms`);
  }
  return error;
}

function isRetriableFetchError(error) {
  if (!error) return false;
  if (error.name === "AbortError") return false;
  const message = String(error.message || error.cause?.message || "");
  const code = String(error.code || error.cause?.code || "");
  return /fetch failed|network|socket|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|UND_ERR/i.test(
    `${message} ${code}`
  );
}

module.exports = {
  buildWuyinVisionContent,
  callImageApi,
  callTextApi,
  callTextApiDetailed,
  callVisionApi,
  callOpenAiChatTextApi,
  callWuyinFormTextApi,
  createVisionHeaders,
  resolveTextRequestFormat,
  resolveVisionRequestFormat,
  extractImageDimensions,
  extractImageUrl,
  extractTaskId,
  extractTextContent,
  fetchWithTimeout,
  formatApiError,
  isApiErrorPayload,
  parseImageBufferDimensions,
  parseImageSize,
  parseJsonResponse,
  pollImageTask
};
