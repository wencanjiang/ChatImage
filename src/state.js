(function initState(global) {
  "use strict";

  function createChatImageState() {
    return {
      result: null,
      selectedHotspotId: null,
      threadsByHotspotId: {},
      pendingByHotspotId: {},
      followupErrorsByHotspotId: {},
      modalOpen: false,
      detailOpen: false,
      lastQuestion: ""
    };
  }

  function beginGeneration(state, question) {
    state.lastQuestion = question;
    state.result = null;
    state.selectedHotspotId = null;
    state.detailOpen = false;
    state.threadsByHotspotId = {};
    state.pendingByHotspotId = {};
    state.followupErrorsByHotspotId = {};
  }

  function resetConversation(state) {
    state.result = null;
    state.selectedHotspotId = null;
    state.threadsByHotspotId = {};
    state.pendingByHotspotId = {};
    state.followupErrorsByHotspotId = {};
    state.modalOpen = false;
    state.detailOpen = false;
  }

  function setResult(state, result) {
    state.result = result;
    state.selectedHotspotId = null;
    state.detailOpen = false;
    state.threadsByHotspotId = {};
    state.pendingByHotspotId = {};
    state.followupErrorsByHotspotId = {};
  }

  function selectHotspot(state, hotspotId) {
    state.selectedHotspotId = hotspotId;
    state.detailOpen = true;
  }

  function closeDetail(state) {
    state.detailOpen = false;
  }

  function setModalOpen(state, value) {
    state.modalOpen = Boolean(value);
  }

  function setHotspotPending(state, hotspotId, value) {
    state.pendingByHotspotId[hotspotId] = Boolean(value);
  }

  function setHotspotError(state, hotspotId, error) {
    if (error) {
      state.followupErrorsByHotspotId[hotspotId] = {
        message: error.message || String(error),
        retryQuestion: error.retryQuestion || ""
      };
      return;
    }
    delete state.followupErrorsByHotspotId[hotspotId];
  }

  function getHotspotError(state, hotspotId) {
    return state.followupErrorsByHotspotId[hotspotId] || null;
  }

  function getThread(state, hotspotId) {
    return state.threadsByHotspotId[hotspotId] || null;
  }

  function setThread(state, hotspotId, thread) {
    state.threadsByHotspotId[hotspotId] = thread;
  }

  function setResultThread(state, thread) {
    if (!state.result || !thread || !thread.hotspotId) return;
    const existingThreads = Array.isArray(state.result.threads) ? state.result.threads : [];
    const index = existingThreads.findIndex((item) => item.hotspotId === thread.hotspotId);
    const nextThreads = existingThreads.slice();
    if (index >= 0) {
      nextThreads[index] = thread;
    } else {
      nextThreads.push(thread);
    }
    state.result.threads = nextThreads;
  }

  function getPending(state, hotspotId) {
    return Boolean(state.pendingByHotspotId[hotspotId]);
  }

  const api = {
    beginGeneration,
    closeDetail,
    createChatImageState,
    getHotspotError,
    getPending,
    getThread,
    resetConversation,
    selectHotspot,
    setHotspotError,
    setHotspotPending,
    setModalOpen,
    setResult,
    setResultThread,
    setThread
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  global.ChatImageState = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
