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
  const previewStrategyModel = window.ChatImagePreviewStrategy;
  const providerConfig = apiClient.config;

  const state = stateModel.createChatImageState();
  let attachments = [];
  let isGenerating = false;
  let activeHistoryId = null;
  let progressHideTimer = null;
  let historyItems = [];
  let historySearchQuery = "";
  const cutoutPreviewCache = new Map();

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

  function setStatusText(text) {
    if (elements.statusPill) elements.statusPill.textContent = text;
  }

  function setStatus(step) {
    const order = ["answering", "structuring", "layout", "image", "align"];
    clearProgressHideTimer();
    if (elements.progress) {
      elements.progress.hidden = false;
      elements.progress.classList.remove("is-hiding", "is-complete");
      elements.progress.querySelectorAll(".progress-step").forEach((item) => {
        const index = order.indexOf(item.dataset.step);
        const currentIndex = order.indexOf(step);
        item.classList.toggle("active", item.dataset.step === step);
        item.classList.toggle("done", index < currentIndex);
      });
    }
    const labels = {
      answering: "正在生成文本",
      structuring: "正在结构化",
      layout: "正在规划热点",
      image: "正在生成图片",
      align: "正在对齐热点"
    };
    setStatusText(labels[step] || "Mock API");
  }

  function finishStatus() {
    if (elements.progress) {
      elements.progress.querySelectorAll(".progress-step").forEach((item) => {
        item.classList.remove("active");
        item.classList.add("done");
      });
      elements.progress.classList.add("is-complete");
    }
    setStatusText("可交互");
    progressHideTimer = setTimeout(() => {
      if (!elements.progress) return;
      elements.progress.classList.add("is-hiding");
      progressHideTimer = setTimeout(() => {
        if (!elements.progress) return;
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
    if (!elements.progress) return;
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
      setStatusText("热点已校准");
      renderResult();
      renderDetail();
      if (state.modalOpen) renderModalStage();
    } catch (error) {
      setStatusText("校准失败");
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
      button.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        button.click();
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

  // Set the CSS variables --origin-x / --origin-y on the detail panel so the
  // open animation visually emanates from the hotspot the user clicked.
  // Falls back to the panel center when the hotspot element is not in the DOM.
  function setDetailAnchorOrigin(hotspotId) {
    if (!elements.detailPanel || !hotspotId) return;
    let originX = "50%";
    let originY = "50%";
    try {
      const safeId = (typeof CSS !== "undefined" && typeof CSS.escape === "function")
        ? CSS.escape(String(hotspotId))
        : String(hotspotId).replace(/"/g, "\\\"");
      const target = document.querySelector(`[data-hotspot-id="${safeId}"]`);
      if (target) {
        const rect = target.getBoundingClientRect();
        originX = `${Math.round(rect.left + rect.width / 2)}px`;
        originY = `${Math.round(rect.top + rect.height / 2)}px`;
      }
    } catch (_) {
      // ignore — keep defaults
    }
    elements.detailPanel.style.setProperty("--origin-x", originX);
    elements.detailPanel.style.setProperty("--origin-y", originY);
  }

  function renderDetail(options = {}) {
    const result = state.result;
    if (!result || !state.selectedHotspotId || !state.detailOpen) {
      // Cancel any pending close animation callback before force-hiding so a
      // late timer cannot strip classes off / re-hide the panel unexpectedly.
      cancelDetailCloseTimer();
      cancelDetailMotionTimer();
      cancelPreviewFlight();
      if (elements.detailPanel) {
        elements.detailPanel.classList.remove("is-closing", "is-entering", "is-preview-entering");
        elements.detailPanel.hidden = true;
      }
      if (elements.detailBackdrop) {
        elements.detailBackdrop.classList.remove("is-closing", "is-entering");
        elements.detailBackdrop.hidden = true;
      }
      return;
    }

    // If a previous close animation is still pending its hidden=true callback,
    // cancel it now — we are about to show a new hotspot's detail and the
    // delayed callback would otherwise hide the freshly-opened panel.
    cancelDetailCloseTimer();

    const hotspot = result.hotspots.find((item) => item.id === state.selectedHotspotId);
    const thread = stateModel.getThread(state, hotspot.id);
    const messages = thread ? thread.messages : [];
    const pending = stateModel.getPending(state, hotspot.id);
    const error = stateModel.getHotspotError(state, hotspot.id);
    const preview = buildHotspotPreview(result, hotspot);

    // Anchor the panel's open animation to the clicked hotspot's location so
    // the detail surface visually grows out of the spot the user just clicked
    // (Apple/Claude-style transition origin).
    setDetailAnchorOrigin(hotspot.id);

    elements.detailPanel.classList.remove("is-closing");
    elements.detailBackdrop.classList.remove("is-closing");
    elements.detailPanel.hidden = false;
    elements.detailBackdrop.hidden = false;
    elements.detailPanel.innerHTML = renderModel.renderDetail({ hotspot, messages, pending, error, preview });
    hydrateHotspotCutoutPreview(result, hotspot);

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
    restartDetailMotion({
      panel: Boolean(options.focusPanel),
      preview: Boolean(options.focusPanel || options.animatePreview)
    });
    if (options.focusPanel || options.animatePreview) startPreviewFlight(result, hotspot, preview);
  }

  const inferPreviewStrategy = previewStrategyModel.inferPreviewStrategy;
  const getOrganicPreviewGeometry = previewStrategyModel.getOrganicPreviewGeometry;
  const padNormalizedBounds = previewStrategyModel.padNormalizedBounds;
  const normalizeBounds = previewStrategyModel.normalizeBounds;
  const shouldUseContextPreviewShape = previewStrategyModel.shouldUseContextPreviewShape;
  const FULL_PREVIEW_CROP = { x: 0, y: 0, width: 1, height: 1 };

  function buildHotspotPreview(result, hotspot) {
    if (!result || !hotspot || !result.imageUrl) return null;
    const dimensions = renderModel.getImageDimensions(result);
    const rawMaskBounds = findHotspotMaskBounds(result, hotspot.id);
    const rawMaskImage = findHotspotMaskImage(result, hotspot.id);
    const rawMaskPolygon = findHotspotMaskPolygon(result, hotspot.id);
    const rawServerOrganicImage = findHotspotOrganicImage(result, hotspot.id);
    const rawServerOrganicBounds = findHotspotOrganicBounds(result, hotspot.id);
    const rawServerOrganicAspectRatio = findHotspotOrganicAspectRatio(result, hotspot.id);
    const rawServerCutoutImage = findHotspotCutoutImage(result, hotspot.id);
    const strategy = inferPreviewStrategy(result, hotspot);
    const preferContextCrop = strategy.preferContextCrop;
    const hotspotBounds = {
      x: Number(hotspot.x || 0),
      y: Number(hotspot.y || 0),
      width: Number(hotspot.width || 0),
      height: Number(hotspot.height || 0)
    };
    const maskConsistent = isMaskConsistentWithHotspot(rawMaskBounds, hotspotBounds, strategy);
    const maskBounds = maskConsistent ? rawMaskBounds : null;
    const maskImage = maskConsistent ? rawMaskImage : "";
    const maskPolygon = maskConsistent ? rawMaskPolygon : [];
    const serverOrganicImage = maskConsistent ? rawServerOrganicImage : "";
    const serverOrganicBounds = maskConsistent ? rawServerOrganicBounds : null;
    const serverOrganicAspectRatio = maskConsistent ? rawServerOrganicAspectRatio : null;
    const serverCutoutImage = maskConsistent ? rawServerCutoutImage : "";
    const forceContextShape = shouldForceContextShapePreview(strategy, maskBounds, hotspotBounds);
    const contextPreviewShape = shouldUseContextPreviewShape(strategy) || forceContextShape;
    const segmentedBounds = getSegmentedPreviewBounds(maskBounds, maskPolygon) || maskBounds;
    const previewAnchorBounds = segmentedBounds || hotspotBounds;
    const previewSourceBounds = getOrganicSourceBounds(result, hotspot, previewAnchorBounds, strategy);
    const previewKey = getCutoutPreviewKey(
      result,
      hotspot.id,
      maskImage,
      strategy,
      contextPreviewShape ? [] : maskPolygon,
      previewSourceBounds,
      { contextPreviewShape }
    );
    const cached = previewKey ? cutoutPreviewCache.get(previewKey) : null;
    const baseBounds = previewSourceBounds;
    const expanded = expandNormalizedBounds(baseBounds, maskBounds && !preferContextCrop && !contextPreviewShape ? 0.018 : 0.026);
    const keepTargetShape = !contextPreviewShape && !preferContextCrop && Boolean(maskBounds || hotspot.mask || hotspot.shape === "mask" || hotspot.shape === "freeform");
    const targetCrop = keepTargetShape ? expanded : fitCropAspect(expanded, dimensions, 0.9, 3.0);
    const fallbackCrop = fitCropAspect(expanded, dimensions, 0.9, 3.0);
    const aspectRatio = (targetCrop.width * dimensions.width) / Math.max(1, targetCrop.height * dimensions.height);

    // Independent subject: transparent SAM3 cutout (server or client canvas).
    if (!preferContextCrop && !contextPreviewShape) {
      if (serverCutoutImage) {
        return {
          imageUrl: result.imageUrl,
          cutoutUrl: serverCutoutImage,
          alt: `${hotspot.label} 独立抠图`,
          caption: strategy.caption || "主体抠图预览",
          crop: FULL_PREVIEW_CROP,
          maskBounds,
          aspectRatio: clampPreviewAspect(aspectRatio),
          source: "sam3-server-cutout",
          maskImage
        };
      }
      if (cached && cached.url && !cached.organic) {
        return {
          imageUrl: result.imageUrl,
          cutoutUrl: cached.url,
          alt: `${hotspot.label} 独立抠图`,
          caption: strategy.caption || "主体抠图预览",
          crop: FULL_PREVIEW_CROP,
          maskBounds,
          aspectRatio: clampPreviewAspect(cached.aspectRatio || aspectRatio),
          source: "sam3-cutout",
          maskImage
        };
      }
    }

    // Map/scene region with a mask: prefer the async organic feathered preview
    // once it is ready. It is an opaque, irregularly-shaped region image with
    // a soft halo — not a transparent cutout, not a hard rectangle.
    if (cached && cached.url && cached.organic) {
      const organicBounds = getOrganicSourceBounds(result, hotspot, previewSourceBounds, strategy);
      const organicPolygon = cached.synthetic ? [] : (contextPreviewShape ? [] : maskPolygon);
      const organicCrop = computeOrganicCropBounds(result, hotspot, organicBounds, dimensions, organicPolygon);
      return {
        imageUrl: result.imageUrl,
        organicUrl: cached.url,
        alt: `${hotspot.label} 区域图像`,
        caption: strategy.caption || "区域上下文预览",
        crop: FULL_PREVIEW_CROP,
        aspectRatio: clampPreviewAspect(cached.aspectRatio || organicCrop.aspectRatio),
        source: "organic-mask",
        maskImage: ""
      };
    }

    const canUseServerOrganicPreview = Boolean(
      serverOrganicImage &&
        maskBounds &&
        (preferContextCrop || contextPreviewShape) &&
        isSemanticVisualPreview(strategy)
    );
    if (canUseServerOrganicPreview) {
      const organicCrop = computeOrganicCropBounds(
        result,
        hotspot,
        serverOrganicBounds || previewSourceBounds,
        dimensions,
        serverOrganicBounds ? [] : (contextPreviewShape ? [] : maskPolygon)
      );
      return {
        imageUrl: result.imageUrl,
        organicUrl: serverOrganicImage,
        alt: `${hotspot.label} \u533a\u57df\u56fe\u50cf`,
        caption: strategy.caption || "\u533a\u57df\u4e0a\u4e0b\u6587\u9884\u89c8",
        crop: FULL_PREVIEW_CROP,
        aspectRatio: clampPreviewAspect(serverOrganicAspectRatio || organicCrop.aspectRatio || aspectRatio),
        source: "sam3-server-organic-context",
        maskImage: ""
      };
    }

    // Fallback while the organic preview is generating, or when there is no
    // mask at all. If a mask exists, keep the CSS mask-image so the preview is
    // already irregular (hard-edged) instead of a plain rectangle; the organic
    // soft-edge version replaces it once rendered.
    const fallbackAspectRatio = (fallbackCrop.width * dimensions.width) / Math.max(1, fallbackCrop.height * dimensions.height);
    const fallbackCaption = strategy.caption || (maskBounds ? "SAM3 精细区域预览" : "热点区域预览");
    // Do not expose a raw SAM CSS mask as the fallback preview. In real cases
    // the mask can be sparse or holey, so the user sees a shredded fragment
    // before the organic preview finishes. Use a soft original-image crop first;
    // the async organic/cutout renderer replaces it with the shaped preview.
    const useMaskFallback = false;
    return {
      imageUrl: result.imageUrl,
      alt: `${hotspot.label} 区域图像`,
      caption: fallbackCaption,
      crop: fallbackCrop,
      maskBounds: useMaskFallback ? maskBounds : null,
      aspectRatio: clampPreviewAspect(fallbackAspectRatio),
      source: maskBounds ? "sam3" : "bounds",
      maskImage: "",
      softEdge: true
    };
  }

  // Compute the crop window shown while the organic preview is the source. The
  // organic canvas already includes its own buffer/feather, so the visible crop
  // should match the padded bounds used to build it.
  function computeOrganicCropBounds(result, hotspot, maskBounds, dimensions, polygon) {
    if (!maskBounds) {
      return { crop: { x: 0, y: 0, width: 1, height: 1 }, aspectRatio: 1.5 };
    }
    const geometry = getOrganicPreviewGeometry(maskBounds, dimensions, polygon);
    const padded = geometry.paddedBounds;
    const aspectRatio = (padded.width * dimensions.width) / Math.max(1, padded.height * dimensions.height);
    return { crop: padded, aspectRatio };
  }

  function getSegmentedPreviewBounds(maskBounds, maskPolygon) {
    return getPolygonBounds(maskPolygon) || normalizeBounds(maskBounds);
  }

  function hydrateHotspotCutoutPreview(result, hotspot) {
    if (!result || !hotspot || !state.detailOpen || state.selectedHotspotId !== hotspot.id) return;
    const strategy = inferPreviewStrategy(result, hotspot);
    const rawMaskBounds = findHotspotMaskBounds(result, hotspot.id);
    const rawMaskImage = findHotspotMaskImage(result, hotspot.id);
    const rawMaskPolygon = findHotspotMaskPolygon(result, hotspot.id);
    const hotspotBounds = normalizeBounds({
      x: Number(hotspot.x),
      y: Number(hotspot.y),
      width: Number(hotspot.width),
      height: Number(hotspot.height)
    });
    const maskConsistent = isMaskConsistentWithHotspot(rawMaskBounds, hotspotBounds, strategy);
    const maskBounds = maskConsistent ? rawMaskBounds : null;
    const maskImage = maskConsistent ? rawMaskImage : "";
    const maskPolygon = maskConsistent ? rawMaskPolygon : [];
    const forceContextShape = shouldForceContextShapePreview(strategy, maskBounds, hotspotBounds);
    const contextPreviewShape = shouldUseContextPreviewShape(strategy) || forceContextShape;
    const segmentedBounds = getSegmentedPreviewBounds(maskBounds, maskPolygon) || maskBounds;
    const previewBounds = getOrganicSourceBounds(result, hotspot, segmentedBounds || hotspotBounds, strategy);
    const key = getCutoutPreviewKey(
      result,
      hotspot.id,
      maskImage,
      strategy,
      contextPreviewShape ? [] : maskPolygon,
      previewBounds,
      { contextPreviewShape }
    );
    if (!previewBounds || !key || cutoutPreviewCache.has(key)) return;
    cutoutPreviewCache.set(key, { loading: true });
    const useCutoutBuilder = Boolean(strategy.independentSubject && !strategy.mapLike && !contextPreviewShape && maskBounds && maskImage);
    const builder = useCutoutBuilder ? createHotspotCutoutPreview : createOrganicPreview;
    builder
      .call(null, result, hotspot, previewBounds, maskImage, {
        forceContextShape: contextPreviewShape || !useCutoutBuilder,
        synthetic: !maskBounds || contextPreviewShape
      })
      .then((cutout) => {
        if (!cutout || !cutout.url) {
          cutoutPreviewCache.delete(key);
          return;
        }
        cutoutPreviewCache.set(key, cutout);
        if (state.detailOpen && state.selectedHotspotId === hotspot.id && state.result === result) {
          renderDetail({ focusPanel: false, animatePreview: true });
        }
      })
      .catch(() => {
        cutoutPreviewCache.delete(key);
      });
  }

  function getCutoutPreviewKey(result, hotspotId, maskImage, strategy, polygon, bounds, options = {}) {
    if (!result || !hotspotId) return "";
    const kind = strategy && (strategy.preferContextCrop || shouldUseContextPreviewShape(strategy)) ? "organic" : "cutout";
    const polygonSignature = Array.isArray(polygon) && polygon.length >= 3
      ? polygon
          .slice(0, 64)
          .map((point) => `${Number(point.x || 0).toFixed(4)},${Number(point.y || 0).toFixed(4)}`)
          .join(";")
      : "";
    const normalizedBounds = normalizeBounds(bounds);
    const boundsSignature = normalizedBounds
      ? [
          Number(normalizedBounds.x || 0).toFixed(4),
          Number(normalizedBounds.y || 0).toFixed(4),
          Number(normalizedBounds.width || 0).toFixed(4),
          Number(normalizedBounds.height || 0).toFixed(4)
        ].join(",")
      : "";
    const marker = [
      options && options.contextPreviewShape ? "context-shape" : "",
      maskImage ? `img:${maskImage.length}` : "",
      polygonSignature ? `poly:${polygon.length}:${polygonSignature}` : "",
      boundsSignature ? `bounds:${boundsSignature}` : ""
    ]
      .filter(Boolean)
      .join(":");
    if (!marker) return "";
    return [result.id || result.title || result.imageUrl, hotspotId, kind, marker].join("|");
  }

  async function createHotspotCutoutPreview(result, hotspot, maskBounds, maskImage) {
    const dimensions = renderModel.getImageDimensions(result);
    const strategy = inferPreviewStrategy(result, hotspot);
    const image = await loadCanvasImage(result.imageUrl);
    const mask = await loadCanvasImage(maskImage);
    const sourceWidth = image.naturalWidth || image.width || dimensions.width;
    const sourceHeight = image.naturalHeight || image.height || dimensions.height;
    const crop = normalizedBoundsToPixels(maskBounds, sourceWidth, sourceHeight);
    if (!crop.width || !crop.height) return null;
    const maxSide = 720;
    const scale = Math.min(1, maxSide / Math.max(crop.width, crop.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(crop.width * scale));
    canvas.height = Math.max(1, Math.round(crop.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(mask, 0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = "source-over";
    if (!strategy.route) fillMaskAlphaHoles(ctx, canvas.width, canvas.height);
    const tight = cropCanvasToAlpha(canvas, 10);
    if (!tight) return null;
    return {
      url: tight.canvas.toDataURL("image/png"),
      width: tight.canvas.width,
      height: tight.canvas.height,
      aspectRatio: tight.canvas.width / Math.max(1, tight.canvas.height),
      label: hotspot.label
    };
  }

  // Builds an organic, feathered region preview: the original image filled
  // inside the mask silhouette, with the mask dilated outward (buffer scales
  // with mask area) and blurred so the edge fades softly instead of a hard
  // rectangle cut. This is what the user wants for map/scene hotspots like
  // 三潭印月 / 宝石山: an irregular shape that hugs the region contour with a
  // little surrounding context, not a flat rectangle and not a shredded
  // transparent cutout.
  //
  // Deliberately simple and deterministic: no pixel-level content detection,
  // no edge filtering. Just mask geometry + dilation + blur + image fill.
  async function createOrganicPreview(result, hotspot, maskBounds, maskImage, options = {}) {
    const dimensions = renderModel.getImageDimensions(result);
    const image = await loadCanvasImage(result.imageUrl);
    const strategy = inferPreviewStrategy(result, hotspot);
    const forceContextShape = Boolean(options && options.forceContextShape);
    const useContextShape = forceContextShape || shouldUseContextPreviewShape(strategy);
    let organicBounds = getOrganicSourceBounds(result, hotspot, maskBounds, strategy);
    if (useContextShape) {
      const padRatio = strategy && strategy.visualMode === "infographic" ? 0.08 : 0.045;
      organicBounds = padNormalizedBounds(organicBounds, padRatio);
    }
    const maskPolygon = useContextShape ? [] : findHotspotMaskPolygon(result, hotspot.id);
    const hasMaskImage = Boolean(maskImage);
    const mask = hasMaskImage && maskPolygon.length < 3 ? await loadCanvasImage(maskImage) : null;
    const sourceWidth = image.naturalWidth || image.width || dimensions.width;
    const sourceHeight = image.naturalHeight || image.height || dimensions.height;

    const geometry = getOrganicPreviewGeometry(organicBounds, dimensions, maskPolygon);
    const paddedBounds = geometry.paddedBounds;
    const crop = normalizedBoundsToPixels(paddedBounds, sourceWidth, sourceHeight);
    if (!crop.width || !crop.height) return null;

    const maxSide = 760;
    const scale = Math.min(1, maxSide / Math.max(crop.width, crop.height));
    const cw = Math.max(1, Math.round(crop.width * scale));
    const ch = Math.max(1, Math.round(crop.height * scale));

    // Step 1: build the mask silhouette on a canvas matching the crop window.
    const maskCanvas = document.createElement("canvas");
    maskCanvas.width = cw;
    maskCanvas.height = ch;
    const maskCtx = maskCanvas.getContext("2d");
    if (!maskCtx) return null;
    maskCtx.imageSmoothingEnabled = true;
    maskCtx.imageSmoothingQuality = "high";
    maskCtx.clearRect(0, 0, cw, ch);
    const trimGeneratedBoundary = shouldTrimGeneratedBoundaryFromPreview(strategy, maskPolygon);
    if (maskPolygon.length >= 3) {
      const displayPolygon = trimGeneratedBoundary
        ? scalePolygonAroundCenter(maskPolygon, 0.965)
        : geometry.polygon;
      drawNormalizedPolygonMask(maskCtx, displayPolygon, paddedBounds, cw, ch);
    } else if (useContextShape) {
      drawContextRegionMask(maskCtx, cw, ch, strategy);
    } else if (mask) {
      // mask.image is alpha over maskBounds; place it proportionally inside
      // the padded crop window.
      const maskPlacedW = (maskBounds.width / paddedBounds.width) * cw;
      const maskPlacedH = (maskBounds.height / paddedBounds.height) * ch;
      const maskPlacedX = ((maskBounds.x - paddedBounds.x) / paddedBounds.width) * cw;
      const maskPlacedY = ((maskBounds.y - paddedBounds.y) / paddedBounds.height) * ch;
      maskCtx.drawImage(mask, maskPlacedX, maskPlacedY, maskPlacedW, maskPlacedH);
    } else {
      // No SAM3 mask available (worker timeout / not configured). Instead of
      // returning null (which degrades to a hard rectangle crop), draw a
      // rounded-rect silhouette from the hotspot bounds so the preview still
      // gets the dilate + feather + halo treatment. This ensures every
      // hotspot preview looks organic, not a raw rectangle.
      const inset = Math.round(Math.min(cw, ch) * 0.04);
      const r = Math.round(Math.min(cw, ch) * 0.08);
      maskCtx.fillStyle = "rgba(255,255,255,1)";
      roundRectPath(maskCtx, inset, inset, cw - inset * 2, ch - inset * 2, r);
      maskCtx.fill();
    }
    fillMaskAlphaHoles(maskCtx, cw, ch);

    // Step 2: dilate (grow) the silhouette outward so a little surrounding
    // context is included, then blur for a feathered edge.
    const maskArea = Math.max(0.0001, maskBounds.width * maskBounds.height);
    const growFactor = trimGeneratedBoundary ? 0.07 : 0.12;
    const growMax = trimGeneratedBoundary ? 14 : 28;
    const growPx = Math.round(Math.max(2, Math.min(growMax, Math.sqrt(maskArea) * Math.min(cw, ch) * growFactor)));
    dilateMaskAlpha(maskCtx, cw, ch, growPx);
    const featherRadius = Math.max(3, Math.round(Math.min(cw, ch) * 0.028));
    const featherCanvas = document.createElement("canvas");
    featherCanvas.width = cw;
    featherCanvas.height = ch;
    const featherCtx = featherCanvas.getContext("2d");
    if (!featherCtx) return null;
    featherCtx.filter = `blur(${featherRadius}px)`;
    featherCtx.drawImage(maskCanvas, 0, 0);
    featherCtx.filter = "none";
    maskCtx.globalCompositeOperation = "copy";
    maskCtx.drawImage(featherCanvas, 0, 0);
    maskCtx.filter = "none";
    maskCtx.globalCompositeOperation = "source-over";

    // Step 3: composite the original image with the feathered mask.
    const canvas = document.createElement("canvas");
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, cw, ch);
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(maskCanvas, 0, 0);
    ctx.globalCompositeOperation = "source-over";

    // Step 4: trim near-empty borders but keep the feathered halo.
    const tight = cropCanvasToAlpha(canvas, featherRadius);
    if (!tight) return null;
    return {
      url: tight.canvas.toDataURL("image/png"),
      width: tight.canvas.width,
      height: tight.canvas.height,
      aspectRatio: tight.canvas.width / Math.max(1, tight.canvas.height),
      label: hotspot.label,
      organic: true,
      synthetic: Boolean(options && options.synthetic)
    };
  }


  function drawNormalizedPolygonMask(ctx, polygon, bounds, width, height) {
    if (!ctx || !Array.isArray(polygon) || polygon.length < 3 || !bounds) return;
    ctx.beginPath();
    polygon.forEach((point, index) => {
      const x = clamp01((point.x - bounds.x) / bounds.width) * width;
      const y = clamp01((point.y - bounds.y) / bounds.height) * height;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = "rgba(0, 0, 0, 1)";
    ctx.fill();
  }

  function drawContextRegionMask(ctx, width, height, strategy) {
    const insetX = Math.max(3, Math.round(width * 0.025));
    const insetY = Math.max(3, Math.round(height * 0.025));
    const x = insetX;
    const y = insetY;
    const w = Math.max(1, width - insetX * 2);
    const h = Math.max(1, height - insetY * 2);
    const route = strategy && strategy.route;
    const flowStrip = strategy && strategy.flowStrip;
    const radius = route || flowStrip
      ? Math.max(10, Math.min(w, h) * 0.42)
      : Math.max(12, Math.min(w, h) * 0.18);
    drawRoundedRectPath(ctx, x, y, w, h, radius);
    ctx.fillStyle = "rgba(0, 0, 0, 1)";
    ctx.fill();
  }

  function shouldTrimGeneratedBoundaryFromPreview(strategy, polygon) {
    if (!strategy || !Array.isArray(polygon) || polygon.length < 3) return false;
    if (!strategy.mapLike || strategy.route || strategy.flowStrip || strategy.subjectWithLabel) return false;
    const visualMode = String(strategy.visualMode || "").toLowerCase();
    return visualMode === "map" || visualMode === "scene" || visualMode === "poster";
  }

  function isSemanticVisualPreview(strategy) {
    if (!strategy) return false;
    const visualMode = String(strategy.visualMode || "").toLowerCase();
    return strategy.mapLike || visualMode === "map" || visualMode === "scene" || visualMode === "poster";
  }

  function drawRoundedRectPath(ctx, x, y, width, height, radius) {
    const r = Math.max(0, Math.min(radius, width / 2, height / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function createPolygonMaskDataUrl(polygon, bounds) {
    const normalizedBounds = normalizeBounds(bounds);
    const normalizedPolygon = normalizePolygonPoints(polygon);
    if (!normalizedBounds || normalizedPolygon.length < 3) return "";
    const points = normalizedPolygon
      .map((point) => {
        const x = clamp01((point.x - normalizedBounds.x) / normalizedBounds.width);
        const y = clamp01((point.y - normalizedBounds.y) / normalizedBounds.height);
        return `${Math.round(x * 1000)},${Math.round(y * 1000)}`;
      })
      .join(" ");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000"><polygon points="${points}" fill="#fff"/></svg>`;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  }

  function normalizePolygonPoints(polygon) {
    if (!Array.isArray(polygon)) return [];
    return polygon
      .map((point) => ({
        x: clamp01(Number(point && point.x)),
        y: clamp01(Number(point && point.y))
      }))
      .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  }

  function getPolygonBounds(polygon) {
    const points = normalizePolygonPoints(polygon);
    if (points.length < 3) return null;
    let minX = 1;
    let minY = 1;
    let maxX = 0;
    let maxY = 0;
    points.forEach((point) => {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    });
    if (maxX <= minX || maxY <= minY) return null;
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }

  function expandPolygonAroundCenter(polygon, scale) {
    return scalePolygonAroundCenter(polygon, Math.max(1, Number(scale) || 1));
  }

  function scalePolygonAroundCenter(polygon, scale) {
    const points = normalizePolygonPoints(polygon);
    const bounds = getPolygonBounds(points);
    if (!bounds || points.length < 3) return [];
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;
    const factor = Math.max(0.1, Number(scale) || 1);
    return points.map((point) => ({
      x: clamp01(centerX + (point.x - centerX) * factor),
      y: clamp01(centerY + (point.y - centerY) * factor)
    }));
  }

  // Draw a rounded-rectangle path on a 2D context.
  function roundRectPath(ctx, x, y, w, h, r) {
    if (!ctx) return;
    const radius = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function fillMaskAlphaHoles(ctx, width, height) {
    if (!ctx || width <= 0 || height <= 0) return;
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    const total = width * height;
    const visited = new Uint8Array(total);
    const queue = [];
    const enqueue = (x, y) => {
      if (x < 0 || y < 0 || x >= width || y >= height) return;
      const index = y * width + x;
      if (visited[index]) return;
      const alpha = data[index * 4 + 3];
      if (alpha > 32) return;
      visited[index] = 1;
      queue.push(index);
    };
    for (let x = 0; x < width; x += 1) {
      enqueue(x, 0);
      enqueue(x, height - 1);
    }
    for (let y = 1; y < height - 1; y += 1) {
      enqueue(0, y);
      enqueue(width - 1, y);
    }
    for (let head = 0; head < queue.length; head += 1) {
      const index = queue[head];
      const x = index % width;
      const y = Math.floor(index / width);
      enqueue(x + 1, y);
      enqueue(x - 1, y);
      enqueue(x, y + 1);
      enqueue(x, y - 1);
    }
    let changed = false;
    for (let index = 0; index < total; index += 1) {
      if (visited[index]) continue;
      const alphaIndex = index * 4 + 3;
      if (data[alphaIndex] > 32) continue;
      data[alphaIndex] = 255;
      changed = true;
    }
    if (changed) ctx.putImageData(imageData, 0, 0);
  }

  // Cheap morphological dilation of an alpha silhouette by `radius` px using
  // stacked shadow-offset draws. Good enough for a soft preview edge without a
  // separate image-processing dependency.
  function dilateMaskAlpha(ctx, width, height, radius) {
    if (radius <= 0) return;
    const source = document.createElement("canvas");
    source.width = width;
    source.height = height;
    const sctx = source.getContext("2d");
    if (!sctx) return;
    sctx.drawImage(ctx.canvas, 0, 0);
    const steps = 8;
    for (let i = 0; i < steps; i += 1) {
      const angle = (i / steps) * Math.PI * 2;
      const dx = Math.round(Math.cos(angle) * radius);
      const dy = Math.round(Math.sin(angle) * radius);
      ctx.drawImage(source, dx, dy);
    }
  }

  function unionNormalizedBounds(a, b) {
    const first = normalizeBounds(a);
    const second = normalizeBounds(b);
    if (!first) return second;
    if (!second) return first;
    const x = Math.max(0, Math.min(first.x, second.x));
    const y = Math.max(0, Math.min(first.y, second.y));
    const right = Math.min(1, Math.max(first.x + first.width, second.x + second.width));
    const bottom = Math.min(1, Math.max(first.y + first.height, second.y + second.height));
    return normalizeBounds({ x, y, width: right - x, height: bottom - y }) || first;
  }

  function clamp01(value) {
    if (!Number.isFinite(value)) return NaN;
    return Math.max(0, Math.min(1, value));
  }

  function loadCanvasImage(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      if (!String(src || "").startsWith("data:")) image.crossOrigin = "anonymous";
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("image load failed"));
      image.src = src;
    });
  }

  function normalizedBoundsToPixels(bounds, width, height) {
    const x = Math.max(0, Math.min(width - 1, Math.floor(Number(bounds.x || 0) * width)));
    const y = Math.max(0, Math.min(height - 1, Math.floor(Number(bounds.y || 0) * height)));
    const right = Math.max(x + 1, Math.min(width, Math.ceil((Number(bounds.x || 0) + Number(bounds.width || 0)) * width)));
    const bottom = Math.max(y + 1, Math.min(height, Math.ceil((Number(bounds.y || 0) + Number(bounds.height || 0)) * height)));
    return { x, y, width: right - x, height: bottom - y };
  }

  function cropCanvasToAlpha(canvas, padding) {
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const width = canvas.width;
    const height = canvas.height;
    const pixels = ctx.getImageData(0, 0, width, height);
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const alpha = pixels.data[(y * width + x) * 4 + 3];
        if (alpha < 8) continue;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
    if (maxX < minX || maxY < minY) return null;
    const pad = Math.max(0, Number(padding || 0));
    minX = Math.max(0, minX - pad);
    minY = Math.max(0, minY - pad);
    maxX = Math.min(width - 1, maxX + pad);
    maxY = Math.min(height - 1, maxY + pad);
    const output = document.createElement("canvas");
    output.width = Math.max(1, maxX - minX + 1);
    output.height = Math.max(1, maxY - minY + 1);
    const outputCtx = output.getContext("2d");
    if (!outputCtx) return null;
    outputCtx.clearRect(0, 0, output.width, output.height);
    outputCtx.drawImage(canvas, minX, minY, output.width, output.height, 0, 0, output.width, output.height);
    return { canvas: output };
  }

  function findHotspotMaskBounds(result, hotspotId) {
    const mask = findHotspotMaskRecord(result, hotspotId);
    return normalizeBounds(mask && mask.bounds);
  }

  function findHotspotMaskInputBounds(result, hotspotId) {
    const regions = result && result.layout && Array.isArray(result.layout.regions) ? result.layout.regions : [];
    const region = regions.find((item) => item && item.hotspotId === hotspotId);
    return normalizeBounds(region && region.mask && region.mask.inputBounds);
  }

  function findHotspotLayoutBounds(result, hotspotId) {
    const regions = result && result.layout && Array.isArray(result.layout.regions) ? result.layout.regions : [];
    const region = regions.find((item) => item && item.hotspotId === hotspotId);
    return normalizeBounds(region && region.bounds);
  }

  function findHotspotMaskImage(result, hotspotId) {
    const mask = findHotspotMaskRecord(result, hotspotId);
    const image = mask && mask.image;
    return typeof image === "string" && image.startsWith("data:image/png;base64,") ? image : "";
  }

  function findHotspotOrganicImage(result, hotspotId) {
    const mask = findHotspotMaskRecord(result, hotspotId);
    const image = mask && mask.organicImage;
    return typeof image === "string" && image.startsWith("data:image/png;base64,") ? image : "";
  }

  function findHotspotOrganicBounds(result, hotspotId) {
    const mask = findHotspotMaskRecord(result, hotspotId);
    return normalizeBounds(mask && mask.organicBounds);
  }

  function findHotspotOrganicAspectRatio(result, hotspotId) {
    const mask = findHotspotMaskRecord(result, hotspotId);
    const ratio = Number(mask && mask.organicAspectRatio);
    return Number.isFinite(ratio) && ratio > 0 ? ratio : null;
  }

  function findHotspotMaskPolygon(result, hotspotId) {
    const mask = findHotspotMaskRecord(result, hotspotId);
    const polygon = (mask && mask.polygon) || [];
    return normalizePolygonPoints(polygon);
  }

  function findHotspotCutoutImage(result, hotspotId) {
    const mask = findHotspotMaskRecord(result, hotspotId);
    const image = mask && mask.cutoutImage;
    return typeof image === "string" && image.startsWith("data:image/png;base64,") ? image : "";
  }

  function findHotspotMaskRecord(result, hotspotId) {
    const regions = result && result.layout && Array.isArray(result.layout.regions) ? result.layout.regions : [];
    const region = regions.find((item) => item && item.hotspotId === hotspotId);
    const hotspots = result && Array.isArray(result.hotspots) ? result.hotspots : [];
    const hotspot = hotspots.find((item) => item && item.id === hotspotId);
    const mask = (region && region.mask) || (hotspot && hotspot.mask) || null;
    return isReliableMaskForPreview(result, hotspot, region, mask) ? mask : null;
  }

  function isReliableMaskForPreview(result, hotspot, region, mask) {
    if (!mask) return false;
    const score = Number(mask.score);
    const visualMode = String((result && result.structuredSpec && result.structuredSpec.visualMode) || "").toLowerCase();
    const kind = String((hotspot && hotspot.regionKind) || "").toLowerCase();
    const policy = String((hotspot && hotspot.maskPolicy) || "").toLowerCase();
    const alignedBy = String((region && region.alignedBy) || (hotspot && hotspot.alignmentSource) || "").toLowerCase();
    const cardLike = visualMode === "infographic" && !["route", "axis", "object", "person", "product", "object-with-label"].includes(kind) && policy !== "route";
    if (cardLike && Number.isFinite(score) && score < 0.35) return false;
    if (cardLike && alignedBy === "planned" && Number.isFinite(score) && score < 0.5) return false;
    return true;
  }

  function getOrganicSourceBounds(result, hotspot, maskBounds, strategy) {
    const hotspotBounds = normalizeBounds({
      x: Number(hotspot && hotspot.x),
      y: Number(hotspot && hotspot.y),
      width: Number(hotspot && hotspot.width),
      height: Number(hotspot && hotspot.height)
    });
    let bounds = normalizeBounds(maskBounds) || hotspotBounds || { x: 0, y: 0, width: 1, height: 1 };
    if (shouldUseUnionPreviewBounds(strategy)) {
      bounds = unionNormalizedBounds(bounds, hotspotBounds) || bounds;
      bounds = unionNormalizedBounds(bounds, findHotspotMaskInputBounds(result, hotspot.id)) || bounds;
      bounds = unionNormalizedBounds(bounds, findHotspotLayoutBounds(result, hotspot.id)) || bounds;
    }
    if (strategy && strategy.route) return ensureMinimumNormalizedSize(bounds, 0.18, 0.18);
    if (strategy && strategy.flowStrip) return expandFlowStripSourceBounds(bounds);
    if (strategy && strategy.visualMode === "map" && strategy.subjectWithLabel) {
      return ensureMinimumNormalizedSize(bounds, 0.16, 0.12);
    }
    return bounds;
  }

  function shouldUseUnionPreviewBounds(strategy) {
    if (!strategy) return false;
    if (shouldUseContextPreviewShape(strategy)) return true;
    if (!strategy.preferContextCrop || strategy.independentSubject) return false;
    return false;
  }

  function shouldForceContextShapePreview(strategy, maskBounds, hotspotBounds) {
    if (!strategy || !strategy.preferContextCrop || strategy.independentSubject || strategy.route || strategy.flowStrip) {
      return false;
    }
    const visualMode = String(strategy.visualMode || "").toLowerCase();
    if (!strategy.mapLike && visualMode !== "map" && visualMode !== "scene" && visualMode !== "poster") return false;
    const mask = normalizeBounds(maskBounds);
    const hotspot = normalizeBounds(hotspotBounds);
    if (!mask || !hotspot) return false;
    const maskArea = mask.width * mask.height;
    const hotspotArea = Math.max(0.0001, hotspot.width * hotspot.height);
    const maskCenter = {
      x: mask.x + mask.width / 2,
      y: mask.y + mask.height / 2
    };
    const hotspotCenter = {
      x: hotspot.x + hotspot.width / 2,
      y: hotspot.y + hotspot.height / 2
    };
    const centerDistance = Math.hypot(maskCenter.x - hotspotCenter.x, maskCenter.y - hotspotCenter.y);
    const allowedDistance = Math.max(0.028, Math.max(hotspot.width, hotspot.height) * 0.16);
    if (maskArea / hotspotArea < 0.64) return true;
    if (centerDistance > allowedDistance) return true;
    return false;
  }

  function isMaskConsistentWithHotspot(maskBounds, hotspotBounds, strategy) {
    const mask = normalizeBounds(maskBounds);
    const hotspot = normalizeBounds(hotspotBounds);
    if (!mask) return false;
    if (!hotspot) return true;
    if (strategy && strategy.visualMode === "infographic" && !strategy.independentSubject) {
      const tightHotspot = padNormalizedBounds(hotspot, 0.08);
      const overlap = getNormalizedIntersectionArea(mask, tightHotspot);
      const maskArea = Math.max(0.0001, mask.width * mask.height);
      const maskCenter = {
        x: mask.x + mask.width / 2,
        y: mask.y + mask.height / 2
      };
      const hotspotCenter = {
        x: hotspot.x + hotspot.width / 2,
        y: hotspot.y + hotspot.height / 2
      };
      const centerDistance = Math.hypot(maskCenter.x - hotspotCenter.x, maskCenter.y - hotspotCenter.y);
      const allowedDistance = Math.max(hotspot.width, hotspot.height) * 0.58;
      if (overlap / maskArea < 0.34) return false;
      if (!pointInNormalizedBounds(maskCenter, tightHotspot) && centerDistance > allowedDistance) return false;
      return true;
    }
    const paddedHotspot = padNormalizedBounds(hotspot, strategy && strategy.mapLike ? 0.26 : 0.18);
    const overlap = getNormalizedIntersectionArea(mask, paddedHotspot);
    const minArea = Math.min(mask.width * mask.height, paddedHotspot.width * paddedHotspot.height);
    if (minArea > 0 && overlap / minArea >= 0.18) return true;
    const maskCenter = {
      x: mask.x + mask.width / 2,
      y: mask.y + mask.height / 2
    };
    if (pointInNormalizedBounds(maskCenter, paddedHotspot)) return true;
    const hotspotCenter = {
      x: hotspot.x + hotspot.width / 2,
      y: hotspot.y + hotspot.height / 2
    };
    if (pointInNormalizedBounds(hotspotCenter, padNormalizedBounds(mask, 0.24))) return true;
    return false;
  }

  function getNormalizedIntersectionArea(a, b) {
    const first = normalizeBounds(a);
    const second = normalizeBounds(b);
    if (!first || !second) return 0;
    const left = Math.max(first.x, second.x);
    const top = Math.max(first.y, second.y);
    const right = Math.min(first.x + first.width, second.x + second.width);
    const bottom = Math.min(first.y + first.height, second.y + second.height);
    return Math.max(0, right - left) * Math.max(0, bottom - top);
  }

  function pointInNormalizedBounds(point, bounds) {
    const normalized = normalizeBounds(bounds);
    if (!point || !normalized) return false;
    const x = Number(point.x);
    const y = Number(point.y);
    return (
      Number.isFinite(x) &&
      Number.isFinite(y) &&
      x >= normalized.x &&
      x <= normalized.x + normalized.width &&
      y >= normalized.y &&
      y <= normalized.y + normalized.height
    );
  }

  function clampPreviewAspect(value) {
    const aspect = Number(value);
    if (!Number.isFinite(aspect) || aspect <= 0) return 1.35;
    return Math.max(0.9, Math.min(3, aspect));
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

  function ensureMinimumNormalizedSize(bounds, minWidth, minHeight) {
    const normalized = normalizeBounds(bounds) || { x: 0, y: 0, width: 1, height: 1 };
    const targetWidth = Math.min(1, Math.max(normalized.width, Number(minWidth) || normalized.width));
    const targetHeight = Math.min(1, Math.max(normalized.height, Number(minHeight) || normalized.height));
    const centerX = normalized.x + normalized.width / 2;
    const centerY = normalized.y + normalized.height / 2;
    const x = Math.max(0, Math.min(1 - targetWidth, centerX - targetWidth / 2));
    const y = Math.max(0, Math.min(1 - targetHeight, centerY - targetHeight / 2));
    return {
      x,
      y,
      width: targetWidth,
      height: targetHeight
    };
  }

  function expandFlowStripSourceBounds(bounds) {
    const normalized = normalizeBounds(bounds) || { x: 0, y: 0, width: 1, height: 1 };
    const targetWidth = Math.min(0.92, Math.max(normalized.width, 0.84));
    const targetHeight = Math.min(0.22, Math.max(normalized.height, 0.12));
    const nearLeft = normalized.x < 0.18;
    const nearRight = normalized.x + normalized.width > 0.82;
    const centerX = normalized.x + normalized.width / 2;
    const centerY = normalized.y + normalized.height / 2;
    const x = nearLeft
      ? Math.max(0, Math.min(normalized.x, 0.04))
      : nearRight
        ? Math.min(1 - targetWidth, Math.max(normalized.x + normalized.width - targetWidth, 0))
        : Math.max(0, Math.min(1 - targetWidth, centerX - targetWidth / 2));
    return {
      x,
      y: Math.max(0, Math.min(1 - targetHeight, centerY - targetHeight / 2)),
      width: targetWidth,
      height: targetHeight
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

  function startPreviewFlight(result, hotspot, preview) {
    if (!result || !hotspot || !preview || !elements.detailPanel) return;
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const target = findDetailPreviewVisual(elements.detailPanel);
    if (!target) return;
    const sourceRect = getPreviewFlightSourceRect(result, hotspot);
    // Measure the preview's RESTING geometry. restartDetailMotion() has just
    // added is-entering (panel scales 0.972 -> 1 over 320ms) and
    // is-preview-entering (preview floats up), so a naive getBoundingClientRect()
    // here reads the mid-entrance, scaled-down, shifted rect. The ghost would
    // then land at that transient spot while the real preview settles 2-3%
    // larger and higher — the misaligned "snap" the user sees when the ghost is
    // removed. Stripping the entrance classes during the read (then restoring
    // them, which simply replays the entrance from t=0) yields the final rect
    // the preview will actually occupy when the flight ends.
    const panel = elements.detailPanel;
    const hadEntering = panel.classList.contains("is-entering");
    const hadPreviewEntering = panel.classList.contains("is-preview-entering");
    if (hadEntering) panel.classList.remove("is-entering");
    if (hadPreviewEntering) panel.classList.remove("is-preview-entering");
    const targetRect = target.getBoundingClientRect();
    if (hadEntering) panel.classList.add("is-entering");
    if (hadPreviewEntering) panel.classList.add("is-preview-entering");
    if (!sourceRect || !isUsableRect(sourceRect) || !isUsableRect(targetRect)) return;

    cancelPreviewFlight();
    const ghost = target.cloneNode(true);
    ghost.classList.add("detail-preview-flight-ghost");
    ghost.setAttribute("aria-hidden", "true");
    ghost.style.boxSizing = "border-box";
    ghost.style.left = `${targetRect.left}px`;
    ghost.style.top = `${targetRect.top}px`;
    ghost.style.width = `${targetRect.width}px`;
    ghost.style.height = `${targetRect.height}px`;
    ghost.style.maxWidth = "none";
    ghost.style.maxHeight = "none";
    ghost.style.aspectRatio = "auto";
    document.body.appendChild(ghost);

    const sourceCenterX = sourceRect.left + sourceRect.width / 2;
    const sourceCenterY = sourceRect.top + sourceRect.height / 2;
    const targetCenterX = targetRect.left + targetRect.width / 2;
    const targetCenterY = targetRect.top + targetRect.height / 2;
    const dx = sourceCenterX - targetCenterX;
    const dy = sourceCenterY - targetCenterY;
    const scale = Math.max(
      0.16,
      Math.min(0.72, Math.min(sourceRect.width / targetRect.width, sourceRect.height / targetRect.height))
    );
    const duration = 760;
    elements.detailPanel.classList.add("is-preview-flight-running");
    const keyframes = [
      {
        opacity: 0,
        filter: "blur(12px) saturate(0.94)",
        transform: `translate(${dx}px, ${dy}px) scale(${scale})`
      },
      {
        opacity: 0.92,
        filter: "blur(2px) saturate(1.02)",
        transform: `translate(${dx * 0.18}px, ${dy * 0.18}px) scale(${Math.min(1.03, scale + 0.22)})`,
        offset: 0.72
      },
      {
        opacity: 1,
        filter: "blur(0) saturate(1)",
        transform: "translate(0, 0) scale(1)"
      }
    ];
    if (typeof ghost.animate === "function") {
      const animation = ghost.animate(keyframes, {
        duration,
        easing: "cubic-bezier(0.18, 0.78, 0.2, 1)",
        fill: "both"
      });
      animation.finished.catch(() => {}).finally(() => finishPreviewFlight(ghost));
    } else {
      ghost.style.opacity = "1";
      ghost.style.transform = "translate(0, 0) scale(1)";
    }
    previewFlightTimer = setTimeout(() => finishPreviewFlight(ghost), duration + 80);
  }

  function findDetailPreviewVisual(container) {
    if (!container) return null;
    return container.querySelector(".detail-preview-crop, .detail-preview-organic, .detail-preview-cutout");
  }

  function finishPreviewFlight(ghost) {
    if (previewFlightTimer !== null) {
      clearTimeout(previewFlightTimer);
      previewFlightTimer = null;
    }
    if (ghost && ghost.parentNode) ghost.remove();
    if (elements.detailPanel) elements.detailPanel.classList.remove("is-preview-flight-running");
  }

  function getPreviewFlightSourceRect(result, hotspot) {
    const image = findVisibleResultImage();
    if (!image) return null;
    const imageRect = image.getBoundingClientRect();
    if (!isUsableRect(imageRect)) return null;
    const strategy = inferPreviewStrategy(result, hotspot);
    const hotspotBounds = normalizeBounds({
      x: Number(hotspot && hotspot.x),
      y: Number(hotspot && hotspot.y),
      width: Number(hotspot && hotspot.width),
      height: Number(hotspot && hotspot.height)
    });
    const rawMaskBounds = findHotspotMaskBounds(result, hotspot.id);
    const rawMaskPolygon = findHotspotMaskPolygon(result, hotspot.id);
    const maskBounds = isMaskConsistentWithHotspot(rawMaskBounds, hotspotBounds, strategy) ? rawMaskBounds : null;
    const maskPolygon = maskBounds ? rawMaskPolygon : [];
    const organicBounds = maskBounds ? findHotspotOrganicBounds(result, hotspot.id) : null;
    const baseBounds = organicBounds || getSegmentedPreviewBounds(maskBounds, maskPolygon) || hotspotBounds;
    if (!baseBounds) return null;
    const bounds = expandNormalizedBounds(baseBounds, 0.018);
    return {
      left: imageRect.left + bounds.x * imageRect.width,
      top: imageRect.top + bounds.y * imageRect.height,
      width: Math.max(18, bounds.width * imageRect.width),
      height: Math.max(18, bounds.height * imageRect.height)
    };
  }

  function findVisibleResultImage() {
    const images = Array.from(document.querySelectorAll(".image-stage img"));
    return images.find((image) => {
      const rect = image.getBoundingClientRect();
      return rect.width > 10 && rect.height > 10 && image.offsetParent !== null;
    }) || null;
  }

  function isUsableRect(rect) {
    return Boolean(
      rect &&
        Number.isFinite(rect.left) &&
        Number.isFinite(rect.top) &&
        Number.isFinite(rect.width) &&
        Number.isFinite(rect.height) &&
        rect.width > 1 &&
        rect.height > 1
    );
  }

  let detailCloseTimer = null;
  let detailMotionTimer = null;
  let previewFlightTimer = null;

  function cancelDetailMotionTimer() {
    if (detailMotionTimer !== null) {
      clearTimeout(detailMotionTimer);
      detailMotionTimer = null;
    }
  }

  function cancelPreviewFlight() {
    if (previewFlightTimer !== null) {
      clearTimeout(previewFlightTimer);
      previewFlightTimer = null;
    }
    document.querySelectorAll(".detail-preview-flight-ghost").forEach((node) => node.remove());
    if (elements.detailPanel) elements.detailPanel.classList.remove("is-preview-flight-running");
  }

  // Entrance animation orchestration. The detail surface is layered so the
  // motion reads as a single, deliberate reveal rather than a single pop:
  //   1. backdrop fades in                       (220ms, starts immediately)
  //   2. panel scales + de-blurs into place      (280ms, starts immediately)
  //   3. hotspot preview floats up               (520ms, starts immediately)
  //   4. summary copy fades in                   (360ms, starts at +70ms)
  //   5. followup form fades in                  (360ms, starts at +130ms)
  // The cleanup timer must outlast the longest animation (520ms) plus the
  // followup form delay (130ms) = 650ms; we use 700ms for a small safety
  // margin so the classes are not stripped while an animation is still on
  // its final frame, which would cause a visible snap.
  const DETAIL_MOTION_MS = 700;

  function restartDetailMotion(options = {}) {
    if (!elements.detailPanel) return;
    cancelDetailMotionTimer();
    // is-preview-entering is replayed on both the initial open and the async
    // hydrate callback, so it is always stripped + re-added here.
    elements.detailPanel.classList.remove("is-preview-entering");
    // is-entering (the panel pop-in) is ONLY replayed when the caller asks for
    // a full panel entrance (options.panel). The async hydrate path passes
    // panel:false; if we stripped is-entering there, we would cut short the
    // 320ms panel pop-in animation mid-flight. So leave it alone when the
    // caller did not request a panel re-entrance.
    if (options.panel) {
      elements.detailPanel.classList.remove("is-entering");
      if (elements.detailBackdrop) elements.detailBackdrop.classList.remove("is-entering");
    }
    // Force a style flush so repeated hotspot clicks replay the same motion.
    void elements.detailPanel.offsetWidth;
    if (options.panel) {
      elements.detailPanel.classList.add("is-entering");
      if (elements.detailBackdrop) elements.detailBackdrop.classList.add("is-entering");
    }
    if (options.preview) {
      elements.detailPanel.classList.add("is-preview-entering");
    }
    detailMotionTimer = setTimeout(() => {
      elements.detailPanel.classList.remove("is-entering", "is-preview-entering");
      if (elements.detailBackdrop) elements.detailBackdrop.classList.remove("is-entering");
      detailMotionTimer = null;
    }, DETAIL_MOTION_MS);
  }

  function cancelDetailCloseTimer() {
    if (detailCloseTimer !== null) {
      clearTimeout(detailCloseTimer);
      detailCloseTimer = null;
    }
  }

  // Close the detail surface with a graceful exit animation instead of an
  // abrupt `hidden = true`. We add the `is-closing` class to let the CSS
  // exit keyframes play, then hide the nodes once the longest exit animation
  // (panel 200ms) has finished. If the user re-opens a hotspot mid-close,
  // `cancelDetailCloseTimer()` (called from `renderDetail`) cancels the
  // pending hide so the freshly-opened panel is never wrongly hidden.
  const DETAIL_CLOSE_ANIM_MS = 220;

  function closeDetail() {
    stateModel.closeDetail(state);
    cancelDetailMotionTimer();
    cancelPreviewFlight();

    if (!elements.detailPanel || elements.detailPanel.hidden) {
      if (elements.detailBackdrop) elements.detailBackdrop.hidden = true;
      return;
    }

    // Remove any in-progress entrance classes so only the exit animation runs.
    elements.detailPanel.classList.remove("is-entering", "is-preview-entering");
    if (elements.detailBackdrop) elements.detailBackdrop.classList.remove("is-entering");
    // Force a style flush so the exit animation replays on rapid re-close.
    void elements.detailPanel.offsetWidth;
    elements.detailPanel.classList.add("is-closing");
    if (elements.detailBackdrop) elements.detailBackdrop.classList.add("is-closing");

    cancelDetailCloseTimer();
    detailCloseTimer = setTimeout(() => {
      elements.detailPanel.classList.remove("is-closing");
      elements.detailPanel.hidden = true;
      if (elements.detailBackdrop) {
        elements.detailBackdrop.classList.remove("is-closing");
        elements.detailBackdrop.hidden = true;
      }
      detailCloseTimer = null;
    }, DETAIL_CLOSE_ANIM_MS);
  }

  function startNewConversation() {
    if (isGenerating) return;
    stateModel.resetConversation(state);
    cutoutPreviewCache.clear();
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
    cancelDetailCloseTimer();
    cancelDetailMotionTimer();
    cancelPreviewFlight();
    if (elements.detailPanel) {
      elements.detailPanel.classList.remove("is-closing", "is-entering", "is-preview-entering");
      elements.detailPanel.hidden = true;
    }
    if (elements.detailBackdrop) {
      elements.detailBackdrop.classList.remove("is-closing", "is-entering");
      elements.detailBackdrop.hidden = true;
    }
    elements.modal.hidden = true;
    setStatusText("新对话");
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
        setStatusText("已分享");
        return;
      }
      await copyTextToClipboard(url);
      setStatusText("链接已复制");
    } catch (error) {
      if (error && error.name === "AbortError") return;
      setStatusText("分享失败");
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
    let copied = false;
    try {
      input.select();
      copied = document.execCommand("copy");
    } finally {
      input.remove();
    }
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
      cutoutPreviewCache.clear();
      for (const thread of result.threads || []) {
        stateModel.setThread(state, thread.hotspotId, thread);
      }
      activeHistoryId = chatImageId;
      markActiveHistory(chatImageId);
      setStatusText("已恢复");
      hideProgress();
      renderResult();
      renderDetail();
    } catch (error) {
      setStatusText("恢复失败");
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
      setStatusText(pinned ? "已取消置顶" : "已置顶");
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
      setStatusText("已重命名");
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
      setStatusText("历史记录已删除");
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
    cutoutPreviewCache.clear();
    // Clear the composer so the user gets immediate visual feedback that the
    // submission was accepted (Claude/ChatGPT-style behaviour).
    elements.questionInput.value = "";
    autoSizeQuestion();

    isGenerating = true;
    syncSendButton();
    elements.resultArea.innerHTML = renderModel.renderGeneratingState(displayQuestion);
    renderDetail();

    try {
      const result = await chatImageService.create(prompt, setStatus, { displayQuestion });
      stateModel.setResult(state, result);
      cutoutPreviewCache.clear();
      activeHistoryId = result.id || null;
      finishStatus();
      renderResult();
      renderDetail();
      renderHistory();
    } catch (error) {
      setStatusText("生成失败");
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
    if (!elements.questionInput || !elements.form) return;
    elements.questionInput.value = state.lastQuestion;
    elements.form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  }

  function retryCurrentResultQuestion() {
    const question = (state.result && state.result.question) || state.lastQuestion;
    if (!question) return;
    if (!elements.questionInput || !elements.form) return;
    stateModel.setModalOpen(state, false);
    if (elements.modal) elements.modal.hidden = true;
    elements.questionInput.value = question;
    elements.form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  }

  async function onFollowup(event) {
    event.preventDefault();
    if (!state.result || !state.selectedHotspotId) return;
    if (!elements.detailPanel) return;
    const input = elements.detailPanel.querySelector("#followupInput");
    if (!input) return;
    const message = input.value.trim();
    if (!message) {
      input.focus();
      return;
    }

    const hotspotId = state.selectedHotspotId;
    // Snapshot the active result so a concurrent regeneration mid-await cannot
    // write the followup thread into a result that no longer matches the UI.
    const inFlightResult = state.result;
    stateModel.setHotspotError(state, hotspotId, null);
    stateModel.setHotspotPending(state, hotspotId, true);
    renderDetail();
    try {
      await chatImageService.followup(inFlightResult, hotspotId, message);
    } catch (error) {
      if (state.result === inFlightResult) {
        stateModel.setHotspotError(state, hotspotId, {
          message: error.message || "追问失败",
          retryQuestion: message
        });
      }
    } finally {
      if (state.result === inFlightResult) {
        stateModel.setHotspotPending(state, hotspotId, false);
        renderDetail();
      }
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
    buildImageDownloadName: downloadModel.buildImageDownloadName,
    previewStrategyModel,
    buildHotspotPreviewForTest: buildHotspotPreview,
    createHotspotCutoutPreviewForTest: createHotspotCutoutPreview,
    createOrganicPreviewForTest: createOrganicPreview,
    fillMaskAlphaHolesForTest: fillMaskAlphaHoles,
    createPolygonMaskDataUrlForTest: createPolygonMaskDataUrl
  };

  getRuntimeConfig().then((runtimeConfig) => {
    if (providerConfig.mode === "mock") {
      setStatusText("Mock API");
    } else if (runtimeConfig && runtimeConfig.realApiAvailable) {
      const visionLabel = runtimeConfig.visionApiAvailable ? runtimeConfig.visionModel || "Vision" : "未配置视觉对齐";
      setStatusText(`${runtimeConfig.textModel} / ${runtimeConfig.imageModel} / ${visionLabel}`);
    } else {
      setStatusText("Mock fallback");
    }
    renderHistory();
  });
})();
