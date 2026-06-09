"use strict";

function createConcurrencyGate(limit, label = "Upstream API") {
  const max = Number(limit);
  let active = 0;

  async function run(task) {
    if (Number.isFinite(max) && max > 0 && active >= max) {
      const error = new Error(`${label} concurrency limit reached`);
      error.statusCode = 429;
      throw error;
    }
    active += 1;
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
