"use strict";

function createConcurrencyGate(limit, label = "Upstream API") {
  const max = Number(limit);
  let active = 0;

  async function run(task) {
    // Increment-then-check is more robust than check-then-increment: if any
    // future change introduces an await between the check and the increment
    // (today both are synchronous so the order does not matter), this version
    // still cannot exceed max. The decrement on the early-exit path keeps the
    // counter stable when we reject.
    active += 1;
    if (Number.isFinite(max) && max > 0 && active > max) {
      active -= 1;
      const error = new Error(`${label} concurrency limit reached`);
      error.statusCode = 429;
      throw error;
    }
    try {
      return await task();
    } finally {
      active -= 1;
    }
  }

  function getActiveCount() {
    return active;
  }

  return { getActiveCount, run };
}

module.exports = { createConcurrencyGate };
