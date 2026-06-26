(function initApiClient(global) {
  "use strict";

  function createApiClient(options = {}) {
    const providerConfig = {
      mode:
        options.mode ||
        new URLSearchParams(global.location ? global.location.search : "").get("provider") ||
        "auto",
      endpoints: {
        config: "/api/config",
        textGeneration: "/api/llm",
        imageGeneration: "/api/image",
        visionAlignment: "/api/vision",
        chatImages: "/api/chatimages",
        ...(options.endpoints || {})
      }
    };

    let runtimeConfigPromise = null;

    async function getRuntimeConfig() {
      if (!runtimeConfigPromise) {
        runtimeConfigPromise = fetch(providerConfig.endpoints.config, { cache: "no-store" })
          .then((response) => (response.ok ? response.json() : null))
          .catch(() => null);
      }
      return runtimeConfigPromise;
    }

    async function shouldUseApi() {
      if (providerConfig.mode === "mock") return false;
      const runtimeConfig = await getRuntimeConfig();
      if (providerConfig.mode === "api") return Boolean(runtimeConfig);
      return Boolean(runtimeConfig && runtimeConfig.realApiAvailable);
    }

    async function post(url, payload) {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throwApiError(response, data);
      }
      return data;
    }

    async function patch(url, payload) {
      const response = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throwApiError(response, data);
      }
      return data;
    }

    async function del(url) {
      const response = await fetch(url, { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throwApiError(response, data);
      }
      return data;
    }

    async function get(url) {
      const response = await fetch(url, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throwApiError(response, data);
      }
      return data;
    }

    function throwApiError(response, data) {
      const error = new Error(data.error || `API request failed: ${response.status}`);
      error.statusCode = response.status;
      error.payload = data;
      throw error;
    }

    return {
      config: providerConfig,
      delete: del,
      get,
      getRuntimeConfig,
      patch,
      post,
      shouldUseApi
    };
  }

  const api = { createApiClient };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  global.ChatImageApi = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
