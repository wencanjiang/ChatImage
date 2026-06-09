(function () {
  "use strict";

  const core = window.ChatImageCore;
  const structureModel = window.ChatImageStructure;
  const layoutModel = window.ChatImageLayout;
  const alignmentModel = window.ChatImageAlignment;
  const calibrationModel = window.ChatImageCalibration;
  const apiClient = window.ChatImageApi.createApiClient();
  const mockSvg = window.ChatImageMockSvg;
  const stateModel = window.ChatImageState;
  const threadModel = window.ChatImageThread;
  const serviceModel = window.ChatImageService;
  const renderModel = window.ChatImageRender;
  const downloadModel = window.ChatImageDownload;
  const filesModel = window.ChatImageFiles;
  const providerConfig = apiClient.config;

  const state = stateModel.createChatImageState();
  let attachments = [];
  let isGenerating = false;
  let activeHistoryId = null;
  let progressHideTimer = null;
  let historyItems = [];
  let historySearchQuery = "";

  const ATTACHMENT_ICON_GROUPS = {
    code: new Set([
      ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".vue", ".svelte", ".astro",
      ".py", ".java", ".go", ".rs", ".c", ".cpp", ".h", ".hpp", ".cs", ".php",
      ".rb", ".swift", ".kt", ".kts", ".sh", ".bat", ".ps1", ".r", ".scala",
      ".lua", ".sql", ".graphql", ".gql", ".css", ".scss"
    ]),
    data: new Set([
      ".json", ".jsonl", ".csv", ".tsv", ".yaml", ".yml", ".toml", ".ipynb", ".xml"
    ]),
    web: new Set([".html", ".htm", ".svg"])
  };

  const ATTACHMENT_ICON_PATHS = {
    code: '<path d="M8 8l-4 4 4 4M16 8l4 4-4 4" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    data: '<path d="M4 7c0-1.1 3.6-2 8-2s8 .9 8 2-3.6 2-8 2-8-.9-8-2zM4 7v10c0 1.1 3.6 2 8 2s8-.9 8-2V7" stroke="currentColor" stroke-width="1.6" fill="none"/>',
    web: '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18z" stroke="currentColor" stroke-width="1.6" fill="none"/>',
    file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/><path d="M14 3v5h5" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/>'
  };

  function attachmentIconSvg(extension) {
    const ext = String(extension || "").toLowerCase();
    let kind = "file";
    if (ATTACHMENT_ICON_GROUPS.code.has(ext)) kind = "code";
    else if (ATTACHMENT_ICON_GROUPS.data.has(ext)) kind = "data";
    else if (ATTACHMENT_ICON_GROUPS.web.has(ext)) kind = "web";
    return `<svg class="attachment-chip-icon" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ATTACHMENT_ICON_PATHS[kind]}</svg>`;
  }

  function ensureDetailBackdrop() {
    let backdrop = document.getElementById("detailBackdrop");
    if (backdrop) return backdrop;
    backdrop = document.createElement("button");
    backdrop.id = "detailBackdrop";
    backdrop.className = "detail-backdrop";
    backdrop.type = "button";
    backdrop.hidden = true;
    backdrop.setAttribute("aria-label", "关闭区域详情");
    document.body.appendChild(backdrop);
    return backdrop;
  }

  const elements = {
    appShell: document.querySelector(".app-shell"),
    form: document.getElementById("questionForm"),
    questionInput: document.getElementById("questionInput"),
    generateButton: document.getElementById("generateButton"),
    newConversationButton: document.getElementById("newConversationButton"),
    sidebarCollapseButton: document.getElementById("sidebarCollapseButton"),
    shareButton: document.getElementById("shareButton"),
    historySearchToggle: document.getElementById("historySearchToggle"),
    historySearchWrap: document.getElementById("historySearchWrap"),
    historySearchInput: document.getElementById("historySearchInput"),
    historySearchClear: document.getElementById("historySearchClear"),
    attachButton: document.getElementById("attachButton"),
    fileInput: document.getElementById("fileInput"),
    attachmentList: document.getElementById("attachmentList"),
    progress: document.getElementById("progress"),
    resultArea: document.getElementById("resultArea"),
    detailPanel: document.getElementById("detailPanel"),
    detailBackdrop: ensureDetailBackdrop(),
    historyPanel: document.getElementById("historyPanel"),
    historyList: document.getElementById("historyList"),
    statusPill: document.getElementById("statusPill"),
    modal: document.getElementById("imageModal"),
    modalStage: document.getElementById("modalStage"),
    modalTitle: document.getElementById("modalTitle")
  };
  const initialResultAreaHtml = elements.resultArea ? elements.resultArea.innerHTML : "";

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const focusableSelector = [
    "a[href]",
    "button:not([disabled])",
    "textarea:not([disabled])",
    "input:not([disabled])",
    "select:not([disabled])",
    "[tabindex]:not([tabindex='-1'])"
  ].join(",");

  const uid = (prefix) => {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return `${prefix}_${window.crypto.randomUUID()}`;
    }
    if (window.crypto && typeof window.crypto.getRandomValues === "function") {
      const bytes = new Uint8Array(16);
      window.crypto.getRandomValues(bytes);
      return `${prefix}_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
    }
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
  };
  let lastModalFocus = null;
  const SIDEBAR_COLLAPSED_STORAGE_KEY = "chatimage.sidebarCollapsed";

  const getRuntimeConfig = apiClient.getRuntimeConfig;
  const shouldUseApi = apiClient.shouldUseApi;
  const apiPost = apiClient.post;
  const apiGet = apiClient.get;
  const apiPatch = apiClient.patch;
  const apiDelete = apiClient.delete;
  const services = serviceModel.createDefaultServices({
    apiGet,
    apiDelete,
    apiPatch,
    apiPost,
    alignmentModel,
    layoutModel,
    mockSvg,
    providerConfig,
    getRuntimeConfig,
    shouldUseApi,
    sleep,
    state,
    stateModel,
    structureModel,
    threadModel,
    uid
  });
  const { chatImageService, layoutPlanner, persistence } = services;

  function setStatus(step) {
    const order = ["answering", "structuring", "layout", "image", "align"];
    clearProgressHideTimer();
    elements.progress.hidden = false;
    elements.progress.classList.remove("is-hiding", "is-complete");
    elements.progress.querySelectorAll(".progress-step").forEach((item) => {
      const index = order.indexOf(item.dataset.step);
      const currentIndex = order.indexOf(step);
      item.classList.toggle("active", item.dataset.step === step);
      item.classList.toggle("done", index < currentIndex);
    });
    const labels = {
      answering: "正在生成文本",
      structuring: "正在结构化",
      layout: "正在规划热点",
      image: "正在生成图片",
      align: "正在对齐热点"
    };
    elements.statusPill.textContent = labels[step] || "Mock API";
  }

  function finishStatus() {
    elements.progress.querySelectorAll(".progress-step").forEach((item) => {
      item.classList.remove("active");
      item.classList.add("done");
    });
    elements.progress.classList.add("is-complete");
    elements.statusPill.textContent = "可交互";
    progressHideTimer = setTimeout(() => {
      elements.progress.classList.add("is-hiding");
      progressHideTimer = setTimeout(() => {
        elements.progress.hidden = true;
        elements.progress.classList.remove("is-hiding", "is-complete");
        progressHideTimer = null;
      }, 260);
    }, 1400);
  }

  function clearProgressHideTimer() {
    if (!progressHideTimer) return;
    clearTimeout(progressHideTimer);
    progressHideTimer = null;
  }

  function hideProgress() {
    clearProgressHideTimer();
    elements.progress.hidden = true;
    elements.progress.classList.remove("is-hiding", "is-complete");
    elements.progress.querySelectorAll(".progress-step").forEach((item) => {
      item.classList.remove("active", "done");
    });
  }

  function renderResult() {
    const result = state.result;
    if (!result) return;
    elements.resultArea.innerHTML = renderModel.renderResult(result, {
      selectedHotspotId: state.selectedHotspotId
    });

    bindImageInteractions(elements.resultArea);
    bindQualityActions(elements.resultArea);
    bindDebugActions(elements.resultArea);
    document.getElementById("zoomButton").addEventListener("click", openModal);
    document.getElementById("saveButton").addEventListener("click", saveImage);
  }

  function bindImageInteractions(root) {
    bindHotspots(root);
    bindImageLoadFailure(root);
  }

  function bindQualityActions(root) {
    root.querySelectorAll("[data-retry-quality]").forEach((button) => {
      button.addEventListener("click", retryCurrentResultQuestion);
    });
  }

  function bindDebugActions(root) {
    root.querySelectorAll("[data-toggle-hotspot-calibration]").forEach((button) => {
      button.addEventListener("click", () => {
        const stage = root.querySelector(".image-stage");
        if (!stage) return;
        const enabled = stage.classList.toggle("show-calibration");
        button.textContent = enabled ? "隐藏热点边界" : "显示热点边界";
      });
    });
    root.querySelectorAll("[data-apply-hotspot-calibration]").forEach((button) => {
      button.addEventListener("click", () => applyHotspotCalibration(root));
    });
  }

  async function applyHotspotCalibration(root) {
    if (!state.result) return;
    const input = root.querySelector("[data-calibration-input]");
    if (!input) return;
    try {
      const nextResult = calibrationModel.buildCalibratedResult(state.result, input.value);
      state.result = nextResult;
      await persistence.saveResult(nextResult);
      elements.statusPill.textContent = "热点已校准";
      renderResult();
      renderDetail();
      if (state.modalOpen) renderModalStage();
    } catch (error) {
      elements.statusPill.textContent = "校准失败";
      input.focus();
      input.setAttribute("aria-invalid", "true");
      input.title = error.message || String(error);
    }
  }

  function bindHotspots(root) {
    root.querySelectorAll("[data-hotspot-id]").forEach((button) => {
      button.addEventListener("click", () => {
        button.classList.remove("clicked");
        void button.offsetWidth;
        button.classList.add("clicked");
        selectHotspot(button.dataset.hotspotId);
      });
      button.addEventListener("animationend", () => button.classList.remove("clicked"));
    });
  }

  function bindImageLoadFailure(root) {
    root.querySelectorAll(".image-stage img").forEach((image) => {
      image.addEventListener("load", () => syncImageStageSize(image));
      image.addEventListener("error", () => showImageLoadError(image));
      if (image.complete && image.naturalWidth > 0) {
        syncImageStageSize(image);
      }
      if (image.complete && image.naturalWidth === 0) {
        showImageLoadError(image);
      }
    });
  }

  function syncImageStageSize(image) {
    const stage = image.closest(".image-stage");
    const width = Number(image.naturalWidth);
    const height = Number(image.naturalHeight);
    if (!stage || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;
    stage.style.setProperty("--fallback-aspect-ratio", `${width} / ${height}`);
    stage.classList.add("has-natural-size");
    if (state.result && image.getAttribute("src") === state.result.imageUrl) {
      state.result.imageWidth = width;
      state.result.imageHeight = height;
    }
  }

  function showImageLoadError(image) {
    const stage = image.closest(".image-stage");
    if (!stage || stage.querySelector(".image-load-error")) return;
    stage.classList.add("image-failed");
    stage.insertAdjacentHTML("beforeend", renderModel.renderImageLoadError());
    stage.querySelector("[data-retry-image]").addEventListener("click", retryCurrentResultQuestion);
  }

  function selectHotspot(hotspotId) {
    stateModel.selectHotspot(state, hotspotId);
    renderResult();
    renderDetail({ focusPanel: true });
    if (state.modalOpen) renderModalStage();
  }

  function renderDetail(options = {}) {
    const result = state.result;
    if (!result || !state.selectedHotspotId || !state.detailOpen) {
      elements.detailPanel.hidden = true;
      elements.detailBackdrop.hidden = true;
      return;
    }

    const hotspot = result.hotspots.find((item) => item.id === state.selectedHotspotId);
    const thread = stateModel.getThread(state, hotspot.id);
    const messages = thread ? thread.messages : [];
    const pending = stateModel.getPending(state, hotspot.id);
    const error = stateModel.getHotspotError(state, hotspot.id);
    const preview = buildHotspotPreview(result, hotspot);

    elements.detailPanel.hidden = false;
    elements.detailBackdrop.hidden = false;
    elements.detailPanel.innerHTML = renderModel.renderDetail({ hotspot, messages, pending, error, preview });

    elements.detailPanel.querySelector("#closeDetailButton").addEventListener("click", closeDetail);
    elements.detailPanel.querySelector("#followupForm").addEventListener("submit", onFollowup);
    const followupInput = elements.detailPanel.querySelector("#followupInput");
    if (followupInput) {
      const autoSizeFollowup = () => {
        followupInput.style.height = "auto";
        followupInput.style.height = `${Math.min(followupInput.scrollHeight, 140)}px`;
      };
      followupInput.addEventListener("input", autoSizeFollowup);
      followupInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
          event.preventDefault();
          elements.detailPanel
            .querySelector("#followupForm")
            .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        }
      });
      autoSizeFollowup();
    }
    if (error && error.retryQuestion) {
      elements.detailPanel.querySelector("#followupInput").value = error.retryQuestion;
    }
    const retryButton = elements.detailPanel.querySelector("#retryFollowupButton");
    if (retryButton) {
      retryButton.addEventListener("click", () => {
        const input = elements.detailPanel.querySelector("#followupInput");
        if (input && !input.value.trim()) input.value = error.retryQuestion || "";
        elements.detailPanel.querySelector("#followupForm").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      });
    }
    if (options.focusPanel) {
      elements.detailPanel.focus({ preventScroll: true });
    }
  }

  function buildHotspotPreview(result, hotspot) {
    if (!result || !hotspot || !result.imageUrl) return null;
    const dimensions = renderModel.getImageDimensions(result);
    const expanded = expandNormalizedBounds(
      {
        x: Number(hotspot.x || 0),
        y: Number(hotspot.y || 0),
        width: Number(hotspot.width || 0),
        height: Number(hotspot.height || 0)
      },
      0.035
    );
    const aspectRatio = (expanded.width * dimensions.width) / Math.max(1, expanded.height * dimensions.height);
    return {
      imageUrl: result.imageUrl,
      alt: `${hotspot.label} 区域图像`,
      caption: "热点区域预览",
      crop: expanded,
      aspectRatio
    };
  }

  function expandNormalizedBounds(bounds, ratio) {
    const width = Math.max(0.01, Math.min(1, bounds.width));
    const height = Math.max(0.01, Math.min(1, bounds.height));
    const x0 = Math.max(0, Math.min(1, Number(bounds.x || 0)));
    const y0 = Math.max(0, Math.min(1, Number(bounds.y || 0)));
    const x1 = Math.min(1, x0 + width);
    const y1 = Math.min(1, y0 + height);
    const touchesLeft = x0 <= 0;
    const touchesTop = y0 <= 0;
    const touchesRight = x1 >= 1;
    const touchesBottom = y1 >= 1;
    const padX = Math.max(0.004, Math.min(0.014, width * ratio));
    const padY = Math.max(0.004, Math.min(0.014, height * ratio));
    const x = touchesLeft ? x0 : Math.max(0, x0 - padX);
    const y = touchesTop ? y0 : Math.max(0, y0 - padY);
    const right = touchesRight ? x1 : Math.min(1, x1 + padX);
    const bottom = touchesBottom ? y1 : Math.min(1, y1 + padY);
    return {
      x,
      y,
      width: Math.max(0.01, right - x),
      height: Math.max(0.01, bottom - y)
    };
  }

  function fitCropAspect(bounds, dimensions, minAspect, maxAspect) {
    const imageAspect = Math.max(0.1, Number(dimensions.width || 1600) / Math.max(1, Number(dimensions.height || 900)));
    let next = { ...bounds };
    const aspect = () => (next.width * imageAspect) / Math.max(0.01, next.height);
    if (aspect() < minAspect) {
      const targetWidth = Math.min(1, (minAspect * next.height) / imageAspect);
      next = expandCropWidth(next, targetWidth);
    }
    if (aspect() > maxAspect) {
      const targetHeight = Math.min(1, (next.width * imageAspect) / maxAspect);
      next = expandCropHeight(next, targetHeight);
    }
    return next;
  }

  function expandCropWidth(bounds, targetWidth) {
    if (targetWidth <= bounds.width) return bounds;
    const extra = targetWidth - bounds.width;
    let x = bounds.x - extra / 2;
    if (x < 0) x = 0;
    if (x + targetWidth > 1) x = Math.max(0, 1 - targetWidth);
    return { ...bounds, x, width: Math.min(1, targetWidth) };
  }

  function expandCropHeight(bounds, targetHeight) {
    if (targetHeight <= bounds.height) return bounds;
    const extra = targetHeight - bounds.height;
    let y = bounds.y - extra / 2;
    if (y < 0) y = 0;
    if (y + targetHeight > 1) y = Math.max(0, 1 - targetHeight);
    return { ...bounds, y, height: Math.min(1, targetHeight) };
  }

  function closeDetail() {
    stateModel.closeDetail(state);
    elements.detailPanel.hidden = true;
    elements.detailBackdrop.hidden = true;
  }

  function startNewConversation() {
    if (isGenerating) return;
    stateModel.resetConversation(state);
    activeHistoryId = null;
    attachments = [];
    hideProgress();
    if (elements.questionInput) {
      elements.questionInput.value = "";
      autoSizeQuestion();
      elements.questionInput.focus({ preventScroll: true });
    }
    renderAttachmentList();
    syncSendButton();
    markActiveHistory(null);
    elements.resultArea.innerHTML = initialResultAreaHtml;
    bindExamplePrompts();
    elements.detailPanel.hidden = true;
    elements.detailBackdrop.hidden = true;
    elements.modal.hidden = true;
    elements.statusPill.textContent = "新对话";
  }

  async function renderHistory() {
    if (!elements.historyPanel || !elements.historyList) return;
    try {
      historyItems = await persistence.loadHistory();
      elements.historyPanel.hidden = false;
      renderHistoryList();
    } catch {
      historyItems = [];
      elements.historyPanel.hidden = false;
      elements.historyList.innerHTML = '<div class="history-empty">历史记录加载失败</div>';
    }
  }

  function renderHistoryList() {
    if (!elements.historyList) return;
    const items = filterHistoryItems(historyItems, historySearchQuery);
    if (!historyItems.length) {
      elements.historyList.innerHTML = '<div class="history-empty">暂无最近对话</div>';
      syncHistorySearchControls();
      return;
    }
    if (!items.length) {
      elements.historyList.innerHTML = '<div class="history-empty">没有匹配的对话</div>';
      syncHistorySearchControls();
      return;
    }
    elements.historyList.innerHTML = renderModel.renderHistoryList(items, activeHistoryId);
    bindHistoryListActions();
    syncHistorySearchControls();
  }

  function filterHistoryItems(items, query) {
    const keyword = normalizeSearchText(query);
    if (!keyword) return items;
    return items.filter((item) => {
      const haystack = normalizeSearchText(
        [
          item.title,
          item.question,
          item.summary,
          item.createdAt,
          item.updatedAt
        ]
          .filter(Boolean)
          .join(" ")
      );
      return haystack.includes(keyword);
    });
  }

  function normalizeSearchText(value) {
    return String(value || "").trim().toLowerCase();
  }

  function bindHistoryListActions() {
    if (!elements.historyList) return;
    elements.historyList.querySelectorAll("[data-history-id]").forEach((node) => {
      node.addEventListener("click", () => restoreHistoryItem(node.dataset.historyId));
    });
    elements.historyList.querySelectorAll("[data-history-pin]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleHistoryPin(button);
      });
    });
    elements.historyList.querySelectorAll("[data-history-rename]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        renameHistoryItem(button);
      });
    });
    elements.historyList.querySelectorAll("[data-history-delete]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        deleteHistoryItem(button.dataset.historyDelete);
      });
    });
  }

  function toggleHistorySearch(forceOpen) {
    if (!elements.historySearchWrap || !elements.historySearchToggle || !elements.historySearchInput) return;
    const shouldOpen = forceOpen === undefined ? elements.historySearchWrap.hidden : Boolean(forceOpen);
    elements.historySearchWrap.hidden = !shouldOpen;
    elements.historySearchToggle.classList.toggle("is-active", shouldOpen);
    elements.historySearchToggle.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
    if (shouldOpen) {
      window.requestAnimationFrame(() => elements.historySearchInput.focus({ preventScroll: true }));
    } else {
      historySearchQuery = "";
      elements.historySearchInput.value = "";
      renderHistoryList();
    }
    syncHistorySearchControls();
  }

  function syncHistorySearchControls() {
    if (elements.historySearchClear) {
      elements.historySearchClear.hidden = !historySearchQuery;
    }
  }

  function clearHistorySearch() {
    if (!elements.historySearchInput) return;
    historySearchQuery = "";
    elements.historySearchInput.value = "";
    renderHistoryList();
    elements.historySearchInput.focus({ preventScroll: true });
  }

  function initializeSidebarState() {
    if (!elements.appShell || !elements.sidebarCollapseButton) return;
    const collapsed = window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "true";
    applySidebarCollapsed(collapsed);
  }

  function toggleSidebarCollapsed() {
    if (!elements.appShell) return;
    applySidebarCollapsed(!elements.appShell.classList.contains("is-sidebar-collapsed"));
  }

  function applySidebarCollapsed(collapsed) {
    if (!elements.appShell || !elements.sidebarCollapseButton) return;
    elements.appShell.classList.toggle("is-sidebar-collapsed", collapsed);
    elements.sidebarCollapseButton.setAttribute("aria-expanded", collapsed ? "false" : "true");
    elements.sidebarCollapseButton.setAttribute("aria-label", collapsed ? "展开侧边栏" : "收起侧边栏");
    elements.sidebarCollapseButton.title = collapsed ? "展开侧边栏" : "收起侧边栏";
    window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, collapsed ? "true" : "false");
  }

  async function shareCurrentConversation() {
    const title = state.result && state.result.title ? state.result.title : "ChatImage";
    const text = state.result && state.result.summary ? state.result.summary : "查看这个 ChatImage 对话";
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title, text, url });
        elements.statusPill.textContent = "已分享";
        return;
      }
      await copyTextToClipboard(url);
      elements.statusPill.textContent = "链接已复制";
    } catch (error) {
      if (error && error.name === "AbortError") return;
      elements.statusPill.textContent = "分享失败";
    }
  }

  async function copyTextToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const input = document.createElement("textarea");
    input.value = text;
    input.setAttribute("readonly", "");
    input.style.position = "fixed";
    input.style.left = "-9999px";
    document.body.appendChild(input);
    input.select();
    const copied = document.execCommand("copy");
    input.remove();
    if (!copied) throw new Error("clipboard unavailable");
  }

  function markActiveHistory(chatImageId) {
    if (!elements.historyList) return;
    elements.historyList.querySelectorAll(".history-item").forEach((item) => {
      const node = item.querySelector("[data-history-id]");
      if (!node) return;
      const isActive = node.dataset.historyId === chatImageId;
      item.classList.toggle("is-active", isActive);
      item.setAttribute("aria-current", isActive ? "true" : "false");
    });
  }

  async function restoreHistoryItem(chatImageId) {
    try {
      const result = await persistence.loadResult(chatImageId);
      if (!result) return;
      stateModel.setResult(state, result);
      for (const thread of result.threads || []) {
        stateModel.setThread(state, thread.hotspotId, thread);
      }
      activeHistoryId = chatImageId;
      markActiveHistory(chatImageId);
      elements.statusPill.textContent = "已恢复";
      hideProgress();
      renderResult();
      renderDetail();
    } catch (error) {
      elements.statusPill.textContent = "恢复失败";
      showHistoryRestoreError(error, chatImageId);
    }
  }

  async function toggleHistoryPin(button) {
    const row = button.closest(".history-item");
    const mainButton = row && row.querySelector("[data-history-id]");
    const chatImageId = (mainButton && mainButton.dataset.historyId) || button.dataset.historyPin;
    const pinned = button.dataset.historyPinned === "true";
    if (!chatImageId) return;
    try {
      await persistence.updateHistoryItem(chatImageId, { pinned: !pinned });
      elements.statusPill.textContent = pinned ? "已取消置顶" : "已置顶";
      await renderHistory();
    } catch (error) {
      showHistoryRestoreError(error, chatImageId, {
        title: pinned ? "取消置顶失败" : "置顶失败",
        retryLabel: "重试",
        onRetry: () => toggleHistoryPin(button)
      });
    }
  }

  async function renameHistoryItem(button) {
    const chatImageId = button.dataset.historyRename;
    if (!chatImageId) return;
    const currentTitle = button.dataset.historyTitle || "";
    const nextTitle = window.prompt("重命名历史记录", currentTitle);
    if (nextTitle === null) return;
    const title = nextTitle.trim();
    if (!title || title === currentTitle) return;
    try {
      const item = await persistence.updateHistoryItem(chatImageId, { title });
      if (state.result && state.result.id === chatImageId) {
        state.result.title = (item && item.title) || title;
        renderResult();
        renderDetail();
      }
      elements.statusPill.textContent = "已重命名";
      await renderHistory();
    } catch (error) {
      showHistoryRestoreError(error, chatImageId, { title: "重命名失败" });
    }
  }

  async function deleteHistoryItem(chatImageId) {
    if (!chatImageId) return;
    if (!window.confirm("删除这条历史记录？此操作会同时删除该记录的追问分支。")) return;
    try {
      await persistence.deleteHistoryItem(chatImageId);
      if (activeHistoryId === chatImageId) activeHistoryId = null;
      elements.statusPill.textContent = "历史记录已删除";
      await renderHistory();
    } catch (error) {
      showHistoryRestoreError(error, chatImageId, { title: "删除失败" });
    }
  }

  function showHistoryRestoreError(error, chatImageId, options = {}) {
    if (!elements.historyList) return;
    elements.historyList.querySelectorAll("[data-history-error]").forEach((node) => node.remove());
    elements.historyList.insertAdjacentHTML(
      "afterbegin",
      renderModel.renderHistoryRestoreError(error.message || String(error), chatImageId, options)
    );
    const retryButton = elements.historyList.querySelector("[data-retry-history-id]");
    if (retryButton) {
      retryButton.addEventListener("click", () => {
        if (typeof options.onRetry === "function") {
          options.onRetry();
          return;
        }
        restoreHistoryItem(retryButton.dataset.retryHistoryId);
      });
    }
  }

  async function onGenerate(event) {
    event.preventDefault();
    const question = elements.questionInput.value.trim();
    if (!question && !attachments.length) {
      elements.questionInput.focus();
      return;
    }
    const displayQuestion = filesModel.buildVisibleQuestion(question, attachments);
    const prompt = filesModel.buildPromptWithAttachments(question, attachments);
    stateModel.beginGeneration(state, displayQuestion);

    isGenerating = true;
    syncSendButton();
    elements.resultArea.innerHTML = renderModel.renderGeneratingState();
    renderDetail();

    try {
      const result = await chatImageService.create(prompt, setStatus, { displayQuestion });
      stateModel.setResult(state, result);
      activeHistoryId = result.id || null;
      finishStatus();
      renderResult();
      renderDetail();
      renderHistory();
    } catch (error) {
      elements.statusPill.textContent = "生成失败";
      elements.resultArea.innerHTML = renderModel.renderErrorState(error.message, error.partialResult);
      bindImageInteractions(elements.resultArea);
      bindQualityActions(elements.resultArea);
      bindDebugActions(elements.resultArea);
      document.getElementById("retryButton").addEventListener("click", retryLastQuestion);
    } finally {
      isGenerating = false;
      syncSendButton();
    }
  }

  async function onFileChange(event) {
    await handleSelectedFiles(event.target.files);
    elements.fileInput.value = "";
  }

  async function handleSelectedFiles(files) {
    if (!files || !files.length) return;
    elements.generateButton.disabled = true;
    renderAttachmentList({ status: "正在读取文件..." });
    try {
      const result = await filesModel.readFileAttachments(files, attachments);
      attachments = result.attachments;
      renderAttachmentList({
        rejected: result.rejected
      });
    } catch (error) {
      renderAttachmentList({
        rejected: [
          {
            name: "上传文件",
            reason: error.message || "文件读取失败，已忽略"
          }
        ]
      });
    } finally {
      syncSendButton();
    }
  }

  function syncSendButton() {
    if (!elements.generateButton) return;
    const hasText = Boolean(elements.questionInput && elements.questionInput.value.trim());
    const hasFiles = attachments.length > 0;
    elements.generateButton.disabled = isGenerating || !(hasText || hasFiles);
    if (elements.newConversationButton) {
      elements.newConversationButton.disabled = isGenerating;
    }
  }

  function autoSizeQuestion() {
    const textarea = elements.questionInput;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
  }

  function submitComposer() {
    if (typeof elements.form.requestSubmit === "function") {
      elements.form.requestSubmit();
    } else {
      elements.form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    }
  }

  function renderAttachmentList(options = {}) {
    const rejected = options.rejected || [];
    const status = options.status || "";
    if (!elements.attachmentList) return;
    const acceptedHtml = attachments
      .map(
        (attachment) => `
          <span class="attachment-chip" title="${renderModel.escapeHtml(attachment.name)}">
            ${attachmentIconSvg(attachment.extension)}
            <span>${renderModel.escapeHtml(attachment.name)}</span>
            <small>${filesModel.formatBytes(attachment.size)}${attachment.truncated ? " / 已截断" : ""}</small>
            <button type="button" aria-label="移除 ${renderModel.escapeHtml(attachment.name)}" data-remove-attachment="${renderModel.escapeHtml(attachment.id)}">×</button>
          </span>
        `
      )
      .join("");
    const rejectedHtml = rejected
      .map(
        (item) =>
          `<span class="attachment-error">${renderModel.escapeHtml(item.name)}：${renderModel.escapeHtml(item.reason)}</span>`
      )
      .join("");
    elements.attachmentList.innerHTML = [
      acceptedHtml,
      status ? `<span class="attachment-status">${renderModel.escapeHtml(status)}</span>` : "",
      rejectedHtml
    ]
      .filter(Boolean)
      .join("");
    elements.attachmentList.querySelectorAll("[data-remove-attachment]").forEach((button) => {
      button.addEventListener("click", () => {
        attachments = attachments.filter((item) => item.id !== button.dataset.removeAttachment);
        renderAttachmentList();
        syncSendButton();
      });
    });
  }

  function bindAttachmentDropZone() {
    if (!elements.form || !elements.fileInput || !filesModel) return;
    const stop = (event) => {
      event.preventDefault();
      event.stopPropagation();
    };
    elements.form.addEventListener("dragenter", (event) => {
      stop(event);
      elements.form.classList.add("drag-over");
    });
    elements.form.addEventListener("dragover", (event) => {
      stop(event);
      elements.form.classList.add("drag-over");
    });
    elements.form.addEventListener("dragleave", (event) => {
      stop(event);
      if (!elements.form.contains(event.relatedTarget)) elements.form.classList.remove("drag-over");
    });
    elements.form.addEventListener("drop", async (event) => {
      stop(event);
      elements.form.classList.remove("drag-over");
      await handleSelectedFiles(event.dataTransfer && event.dataTransfer.files);
    });
  }

  function bindExamplePrompts() {
    document.querySelectorAll("[data-example]").forEach((button) => {
      button.addEventListener("click", () => {
        elements.questionInput.value = button.dataset.example || "";
        autoSizeQuestion();
        syncSendButton();
        elements.questionInput.focus();
        submitComposer();
      });
    });
  }

  function retryLastQuestion() {
    if (!state.lastQuestion) return;
    elements.questionInput.value = state.lastQuestion;
    elements.form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  }

  function retryCurrentResultQuestion() {
    const question = (state.result && state.result.question) || state.lastQuestion;
    if (!question) return;
    stateModel.setModalOpen(state, false);
    elements.modal.hidden = true;
    elements.questionInput.value = question;
    elements.form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  }

  async function onFollowup(event) {
    event.preventDefault();
    if (!state.result || !state.selectedHotspotId) return;
    const input = elements.detailPanel.querySelector("#followupInput");
    const message = input.value.trim();
    if (!message) {
      input.focus();
      return;
    }

    const hotspotId = state.selectedHotspotId;
    stateModel.setHotspotError(state, hotspotId, null);
    stateModel.setHotspotPending(state, hotspotId, true);
    renderDetail();
    try {
      await chatImageService.followup(state.result, hotspotId, message);
    } catch (error) {
      stateModel.setHotspotError(state, hotspotId, {
        message: error.message || "追问失败",
        retryQuestion: message
      });
    } finally {
      stateModel.setHotspotPending(state, hotspotId, false);
      renderDetail();
    }
  }

  function openModal() {
    if (!state.result) return;
    lastModalFocus = document.activeElement;
    stateModel.setModalOpen(state, true);
    elements.modal.hidden = false;
    elements.modalTitle.textContent = state.result.title;
    renderModalStage();
    const closeButton = elements.modal.querySelector(".modal-toolbar [data-close-modal]");
    if (closeButton) closeButton.focus({ preventScroll: true });
  }

  function renderModalStage() {
    if (!state.result) return;
    elements.modalStage.innerHTML = renderModel.renderImageFrame(state.result, {
      selectedHotspotId: state.selectedHotspotId
    });
    bindImageInteractions(elements.modalStage);
  }

  function closeModal() {
    stateModel.setModalOpen(state, false);
    elements.modal.hidden = true;
    const fallback = document.getElementById("zoomButton");
    const target = lastModalFocus && document.contains(lastModalFocus) ? lastModalFocus : fallback;
    if (target && typeof target.focus === "function") target.focus({ preventScroll: true });
    lastModalFocus = null;
  }

  function saveImage() {
    if (!state.result) return;
    const link = document.createElement("a");
    link.href = state.result.imageUrl;
    link.download = downloadModel.buildImageDownloadName(state.result);
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  elements.form.addEventListener("submit", onGenerate);
  if (elements.newConversationButton) {
    elements.newConversationButton.addEventListener("click", startNewConversation);
  }
  if (elements.sidebarCollapseButton) {
    elements.sidebarCollapseButton.addEventListener("click", toggleSidebarCollapsed);
  }
  if (elements.shareButton) {
    elements.shareButton.addEventListener("click", shareCurrentConversation);
  }
  if (elements.historySearchToggle) {
    elements.historySearchToggle.addEventListener("click", () => toggleHistorySearch());
  }
  if (elements.historySearchInput) {
    elements.historySearchInput.addEventListener("input", () => {
      historySearchQuery = elements.historySearchInput.value;
      renderHistoryList();
    });
    elements.historySearchInput.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      if (historySearchQuery) {
        event.preventDefault();
        clearHistorySearch();
        return;
      }
      event.preventDefault();
      toggleHistorySearch(false);
      elements.historySearchToggle && elements.historySearchToggle.focus({ preventScroll: true });
    });
  }
  if (elements.historySearchClear) {
    elements.historySearchClear.addEventListener("click", clearHistorySearch);
  }
  if (elements.questionInput) {
    elements.questionInput.addEventListener("input", () => {
      autoSizeQuestion();
      syncSendButton();
    });
    elements.questionInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        submitComposer();
      }
    });
    autoSizeQuestion();
  }
  bindExamplePrompts();
  initializeSidebarState();
  syncSendButton();
  if (elements.fileInput && filesModel) {
    elements.fileInput.accept = filesModel.supportedAccept;
    elements.fileInput.title = filesModel.getSupportedFileSummary();
    elements.fileInput.addEventListener("change", onFileChange);
  }
  if (elements.attachButton && elements.fileInput) {
    elements.attachButton.title = filesModel.getSupportedFileSummary();
    elements.attachButton.addEventListener("click", () => elements.fileInput.click());
  }
  bindAttachmentDropZone();
  elements.detailBackdrop.addEventListener("click", closeDetail);
  elements.modal.querySelectorAll("[data-close-modal]").forEach((node) => {
    node.addEventListener("click", closeModal);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Tab") {
      if (state.modalOpen) {
        trapFocus(elements.modal, event);
        return;
      }
      if (state.detailOpen) {
        trapFocus(elements.detailPanel, event);
        return;
      }
      return;
    }
    if (event.key !== "Escape") return;
    if (state.modalOpen) {
      closeModal();
      return;
    }
    if (state.detailOpen) closeDetail();
  });

  function trapFocus(container, event) {
    if (!container || container.hidden) return;
    const focusable = Array.from(container.querySelectorAll(focusableSelector)).filter(
      (node) => !node.hidden && node.offsetParent !== null
    );
    if (!focusable.length) {
      event.preventDefault();
      container.focus({ preventScroll: true });
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!container.contains(document.activeElement)) {
      event.preventDefault();
      first.focus();
      return;
    }
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
      return;
    }
    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  window.ChatImageTestHooks = {
    parseJsonFromText: structureModel.parseJsonFromText,
    normalizeVisualSpec: structureModel.normalizeVisualSpec,
    buildMockSpec: structureModel.buildMockSpec,
    inferRelationType: core.inferRelationType,
    chooseFamily: core.chooseFamily,
    layoutPlanner,
    alignmentModel,
    calibrationModel,
    validateLayoutRegions: core.validateLayoutRegions,
    iconGlyph: core.iconGlyph,
    buildImageDownloadName: downloadModel.buildImageDownloadName
  };

  getRuntimeConfig().then((runtimeConfig) => {
    if (providerConfig.mode === "mock") {
      elements.statusPill.textContent = "Mock API";
    } else if (runtimeConfig && runtimeConfig.realApiAvailable) {
      const visionLabel = runtimeConfig.visionApiAvailable ? runtimeConfig.visionModel || "Vision" : "未配置视觉对齐";
      elements.statusPill.textContent = `${runtimeConfig.textModel} / ${runtimeConfig.imageModel} / ${visionLabel}`;
    } else {
      elements.statusPill.textContent = "Mock fallback";
    }
    renderHistory();
  });
})();
