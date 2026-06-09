"use strict";

const assert = require("assert");
const {
  beginGeneration,
  closeDetail,
  createChatImageState,
  getPending,
  getHotspotError,
  getThread,
  resetConversation,
  selectHotspot,
  setHotspotError,
  setHotspotPending,
  setModalOpen,
  setResult,
  setResultThread,
  setThread
} = require("../src/state");

function main() {
  const state = createChatImageState();
  assert.deepStrictEqual(state.threadsByHotspotId, {});

  beginGeneration(state, "question one");
  assert.strictEqual(state.lastQuestion, "question one");
  assert.strictEqual(state.result, null);
  assert.strictEqual(state.detailOpen, false);

  setResult(state, { id: "ci_1" });
  assert.strictEqual(state.result.id, "ci_1");
  assert.strictEqual(state.selectedHotspotId, null);

  selectHotspot(state, "module_1");
  assert.strictEqual(state.selectedHotspotId, "module_1");
  assert.strictEqual(state.detailOpen, true);

  setHotspotPending(state, "module_1", true);
  assert.strictEqual(getPending(state, "module_1"), true);
  setHotspotPending(state, "module_1", false);
  assert.strictEqual(getPending(state, "module_1"), false);

  setHotspotError(state, "module_1", { message: "followup failed<script>", retryQuestion: "original question" });
  assert.strictEqual(getHotspotError(state, "module_1").message, "followup failed<script>");
  assert.strictEqual(getHotspotError(state, "module_1").retryQuestion, "original question");
  setHotspotError(state, "module_1", null);
  assert.strictEqual(getHotspotError(state, "module_1"), null);

  setThread(state, "module_1", { id: "thread_1" });
  assert.strictEqual(getThread(state, "module_1").id, "thread_1");
  assert.strictEqual(getThread(state, "missing"), null);

  state.result.threads = [];
  setResultThread(state, { id: "thread_1", hotspotId: "module_1", messages: [] });
  assert.strictEqual(state.result.threads.length, 1);
  setResultThread(state, { id: "thread_1b", hotspotId: "module_1", messages: [{ role: "user" }] });
  assert.strictEqual(state.result.threads.length, 1);
  assert.strictEqual(state.result.threads[0].id, "thread_1b");
  setResultThread(state, { id: "thread_2", hotspotId: "module_2", messages: [] });
  assert.strictEqual(state.result.threads.length, 2);

  setHotspotError(state, "module_1", { message: "old error", retryQuestion: "old question" });
  setResult(state, { id: "ci_2" });
  assert.deepStrictEqual(state.threadsByHotspotId, {});
  assert.deepStrictEqual(state.pendingByHotspotId, {});
  assert.deepStrictEqual(state.followupErrorsByHotspotId, {});

  setModalOpen(state, true);
  assert.strictEqual(state.modalOpen, true);
  closeDetail(state);
  assert.strictEqual(state.detailOpen, false);

  setResult(state, { id: "ci_reset", threads: [] });
  selectHotspot(state, "module_1");
  setThread(state, "module_1", { id: "thread_reset" });
  setHotspotPending(state, "module_1", true);
  setHotspotError(state, "module_1", { message: "reset error" });
  setModalOpen(state, true);
  resetConversation(state);
  assert.strictEqual(state.result, null);
  assert.strictEqual(state.selectedHotspotId, null);
  assert.strictEqual(state.detailOpen, false);
  assert.strictEqual(state.modalOpen, false);
  assert.deepStrictEqual(state.threadsByHotspotId, {});
  assert.deepStrictEqual(state.pendingByHotspotId, {});
  assert.deepStrictEqual(state.followupErrorsByHotspotId, {});

  beginGeneration(state, "question two");
  assert.strictEqual(state.lastQuestion, "question two");
  assert.deepStrictEqual(state.threadsByHotspotId, {});
  assert.deepStrictEqual(state.pendingByHotspotId, {});
  assert.deepStrictEqual(state.followupErrorsByHotspotId, {});

  console.log("state.test.js passed");
}

main();
