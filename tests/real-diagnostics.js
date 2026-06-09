"use strict";

function createHttpError(payload, fallbackMessage = "HTTP request failed") {
  const message = extractErrorMessage(payload) || fallbackMessage;
  const error = new Error(message);
  if (payload && typeof payload === "object") {
    error.payload = payload;
  }
  return error;
}

function describeError(error) {
  return {
    message: error && error.message ? error.message : String(error),
    payload: error && error.payload ? error.payload : null
  };
}

function extractErrorMessage(value, seen = new Set()) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const message = extractErrorMessage(item, seen);
      if (message) return message;
    }
    return "";
  }
  if (typeof value !== "object") return "";
  if (seen.has(value)) return "";
  seen.add(value);

  const fields = [
    value.error,
    value.message,
    value.msg,
    value.detail,
    value.data && value.data.error,
    value.data && value.data.message,
    value.data && value.data.msg
  ];
  for (const field of fields) {
    const message = extractErrorMessage(field, seen);
    if (message) return message;
  }
  return "";
}

module.exports = {
  createHttpError,
  describeError,
  extractErrorMessage
};
