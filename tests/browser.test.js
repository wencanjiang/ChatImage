"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { createServer } = require("../server");

async function main() {
  const chromePath = findChrome();
  if (!chromePath) {
    console.log("browser.test.js skipped: Chrome or Edge was not found");
    return;
  }

  const server = createServer({
    port: 0,
    apiKey: "",
    textModel: "gpt-5.5",
    imageModel: "GPT-Image-2",
    textEndpoint: "https://api.wuyinkeji.com/api/chat/index",
    imageEndpoint: "https://api.wuyinkeji.com/api/async/image_gpt",
    imageDetailEndpoint: "https://api.wuyinkeji.com/api/async/detail"
  });
  await listen(server);
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;
  const debugPort = await getFreePort();
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "chatimage-browser-"));
  const artifactDir = path.join(process.cwd(), "tmp", "test-artifacts");
  fs.mkdirSync(artifactDir, { recursive: true });
  const chrome = spawn(chromePath, [
    "--headless=new",
    "--disable-gpu",
    "--disable-software-rasterizer",
    "--disable-features=VizDisplayCompositor",
    "--disable-extensions",
    "--disable-dev-shm-usage",
    "--no-sandbox",
    "--no-first-run",
    "--no-default-browser-check",
    "--remote-debugging-address=127.0.0.1",
    `--user-data-dir=${profileDir}`,
    `--remote-debugging-port=${debugPort}`,
    "about:blank"
  ]);
  let chromeStderr = "";
  chrome.stderr.on("data", (chunk) => {
    chromeStderr += chunk.toString();
  });

  try {
    const wsUrl = await waitForWebSocketUrl(debugPort, () => chromeStderr);
    const cdp = await connectCdp(wsUrl);
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("DOM.enable");
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 1440,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: false
    });
    await cdp.send("Page.navigate", { url: `${baseUrl}/?provider=mock` });
    await cdp.waitFor("Page.loadEventFired", 10000);

    const sidebarBefore = await cdp.evaluate(`({
      shellCollapsed: document.querySelector(".app-shell").classList.contains("is-sidebar-collapsed"),
      sidebarWidth: document.querySelector("#historyPanel").getBoundingClientRect().width,
      chatLeft: document.querySelector(".chat-shell").getBoundingClientRect().left
    })`);
    await cdp.evaluate(`document.querySelector("#sidebarCollapseButton").click()`);
    await cdp.waitForFunction(`document.querySelector(".chat-shell").getBoundingClientRect().left < 100`, 3000);
    const sidebarCollapsed = await cdp.evaluate(`({
      shellCollapsed: document.querySelector(".app-shell").classList.contains("is-sidebar-collapsed"),
      sidebarWidth: document.querySelector("#historyPanel").getBoundingClientRect().width,
      chatLeft: document.querySelector(".chat-shell").getBoundingClientRect().left,
      expanded: document.querySelector("#sidebarCollapseButton").getAttribute("aria-expanded")
    })`);
    await cdp.evaluate(`document.querySelector("#sidebarCollapseButton").click()`);
    await cdp.waitForFunction(`document.querySelector(".chat-shell").getBoundingClientRect().left > 250`, 3000);
    const sidebarRestored = await cdp.evaluate(`({
      shellCollapsed: document.querySelector(".app-shell").classList.contains("is-sidebar-collapsed"),
      sidebarWidth: document.querySelector("#historyPanel").getBoundingClientRect().width,
      chatLeft: document.querySelector(".chat-shell").getBoundingClientRect().left,
      expanded: document.querySelector("#sidebarCollapseButton").getAttribute("aria-expanded")
    })`);
    assert.strictEqual(sidebarBefore.shellCollapsed, false);
    assert.strictEqual(sidebarCollapsed.shellCollapsed, true);
    assert.ok(sidebarCollapsed.sidebarWidth < sidebarBefore.sidebarWidth);
    assert.ok(sidebarCollapsed.chatLeft < sidebarBefore.chatLeft);
    assert.strictEqual(sidebarCollapsed.expanded, "false");
    assert.strictEqual(sidebarRestored.shellCollapsed, false);
    assert.ok(sidebarRestored.sidebarWidth > sidebarCollapsed.sidebarWidth);
    assert.strictEqual(sidebarRestored.expanded, "true");

    await cdp.evaluate(`(() => {
      window.__copiedText = "";
      Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText: async (text) => { window.__copiedText = text; } },
        configurable: true
      });
      document.querySelector("#shareButton").click();
    })()`);
    await cdp.waitForFunction(`document.querySelector("#statusPill").textContent === "链接已复制"`, 3000);
    const copiedUrl = await cdp.evaluate(`window.__copiedText`);
    assert.strictEqual(copiedUrl, `${baseUrl}/?provider=mock`);

    const fencedJson = JSON.stringify('```json\n{"title":"测试标题","modules":[1,2,3]}\n```');
    const parsedTitle = await cdp.evaluate(
      `window.ChatImageTestHooks.parseJsonFromText(${fencedJson}).title`
    );
    assert.strictEqual(parsedTitle, "测试标题");

    const normalizedCount = await cdp.evaluate(`
      window.ChatImageTestHooks.normalizeVisualSpec({
        title: "结构化结果",
        summary: "摘要",
        relationType: "flow",
        modules: [
          { title: "一", imageText: "短文案一", detail: "详情一" },
          { title: "二", imageText: "短文案二", detail: "详情二" },
          { title: "三", imageText: "短文案三", detail: "详情三" }
        ]
      }, "问题", "回答").modules.length
    `);
    assert.strictEqual(normalizedCount, 3);
    const layoutValidation = await cdp.evaluate(`
      const spec = window.ChatImageTestHooks.normalizeVisualSpec({
        title: "布局校验",
        summary: "摘要",
        relationType: "flow",
        modules: Array.from({ length: 6 }, (_, index) => ({
          title: "步骤" + index,
          imageText: "短文案" + index,
          detail: "详情" + index,
          iconHint: index === 0 ? "risk" : "step"
        }))
      }, "问题", "回答");
      const layout = window.ChatImageTestHooks.layoutPlanner.create(spec);
      ({
        valid: layout.validation.valid,
        regionCount: layout.regions.filter((region) => region.role === "module").length,
        riskIcon: window.ChatImageTestHooks.iconGlyph("risk"),
        stepIcon: window.ChatImageTestHooks.iconGlyph("step")
      })
    `);
    assert.strictEqual(layoutValidation.valid, true);
    assert.strictEqual(layoutValidation.regionCount, 6);
    assert.strictEqual(layoutValidation.riskIcon, "RK");
    assert.strictEqual(layoutValidation.stepIcon, "ST");

    const uploadPath = path.join(artifactDir, "browser-upload-notes.md");
    fs.writeFileSync(uploadPath, "# 上传材料\n请结合这份材料总结 ChatImage 的文件上传能力。", "utf8");
    const documentNode = await cdp.send("DOM.getDocument");
    const fileInputNode = await cdp.send("DOM.querySelector", {
      nodeId: documentNode.root.nodeId,
      selector: "#fileInput"
    });
    await cdp.send("DOM.setFileInputFiles", {
      nodeId: fileInputNode.nodeId,
      files: [uploadPath]
    });
    await cdp.waitForFunction(`document.querySelectorAll(".attachment-chip").length === 1`, 3000);
    const uploadState = await cdp.evaluate(`({
      chipText: document.querySelector(".attachment-chip").textContent,
      accept: document.querySelector("#fileInput").getAttribute("accept"),
      help: document.querySelector("#attachButton").title
    })`);
    assert.match(uploadState.chipText, /browser-upload-notes\.md/);
    assert.match(uploadState.accept, /\.md/);
    assert.match(uploadState.accept, /\.toml/);
    assert.match(uploadState.help, /Markdown/);

    await cdp.evaluate(`
      document.querySelector("#questionInput").value = "请解释一下 ChatImage 的工作流程";
      document.querySelector("#questionForm").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    `);

    await cdp.waitForFunction(
      `document.querySelectorAll("[data-hotspot-id]").length >= 5 && document.querySelectorAll(".module-label").length === 0 && document.querySelector(".image-stage img")`,
      8000
    );
    const hotspotCount = await cdp.evaluate(`document.querySelectorAll("[data-hotspot-id]").length`);
    assert.ok(hotspotCount >= 5);
    const hotspotVisualState = await cdp.evaluate(`
      Array.from(document.querySelectorAll("[data-hotspot-id]")).map((node) => {
        const style = getComputedStyle(node);
        return {
          borderWidth: style.borderTopWidth,
          background: style.backgroundColor,
          pseudoContent: getComputedStyle(node, "::after").content
        };
      })
    `);
    assert.deepStrictEqual(
      hotspotVisualState,
      Array.from({ length: hotspotCount }, () => ({
        borderWidth: "0px",
        background: "rgba(0, 0, 0, 0)",
        pseudoContent: "none"
      }))
    );
    const stageImageDelta = await cdp.evaluate(`
      const stageNode = document.querySelector(".image-stage");
      const stage = stageNode.getBoundingClientRect();
      const image = document.querySelector(".image-stage img").getBoundingClientRect();
      ({
        width: Math.abs(stageNode.clientWidth - image.width),
        height: Math.abs(stageNode.clientHeight - image.height),
        left: Math.abs(stage.left + stageNode.clientLeft - image.left),
        top: Math.abs(stage.top + stageNode.clientTop - image.top)
      })
    `);
    assert.ok(stageImageDelta.width < 1);
    assert.ok(stageImageDelta.height < 1);
    assert.ok(stageImageDelta.left < 1);
    assert.ok(stageImageDelta.top < 1);
    const hotspotRectDelta = await cdp.evaluate(`
      (() => {
        const stageNode = document.querySelector(".image-stage");
        const stage = stageNode.getBoundingClientRect();
        const originLeft = stage.left + stageNode.clientLeft;
        const originTop = stage.top + stageNode.clientTop;
        return Math.max(
          ...Array.from(document.querySelectorAll(".image-stage > [data-hotspot-id]")).flatMap((node) => {
            const rect = node.getBoundingClientRect();
            const left = parseFloat(node.style.left) / 100;
            const top = parseFloat(node.style.top) / 100;
            const width = parseFloat(node.style.width) / 100;
            const height = parseFloat(node.style.height) / 100;
            return [
              Math.abs(rect.left - (originLeft + left * stageNode.clientWidth)),
              Math.abs(rect.top - (originTop + top * stageNode.clientHeight)),
              Math.abs(rect.width - width * stageNode.clientWidth),
              Math.abs(rect.height - height * stageNode.clientHeight)
            ];
          })
        );
      })()
    `);
    assert.ok(hotspotRectDelta < 1, `hotspot rects drifted from normalized bounds by ${hotspotRectDelta}px`);
    const imageFrameWidth = await cdp.evaluate(`document.querySelector(".image-frame").getBoundingClientRect().width`);
    assert.ok(imageFrameWidth >= 1000, `result image frame is too small: ${imageFrameWidth}`);

    const detailHiddenBeforeClick = await cdp.evaluate(`document.querySelector("#detailPanel").hidden`);
    assert.strictEqual(detailHiddenBeforeClick, true);
    const debugText = await cdp.evaluate(`document.querySelector(".debug-panel").innerText`);
    assert.match(debugText, /原始文本回答/);
    assert.match(debugText, /结构化解析成果/);
    assert.match(debugText, /布局 LayoutSpec/);
    assert.match(debugText, /生图提示词/);
    assert.match(debugText, /质量检查/);
    assert.match(debugText, /热点绑定/);
    assert.match(debugText, /热点校准/);
    assert.match(debugText, /热点校准数据/);
    const calibrationState = await cdp.evaluate(`
      const button = document.querySelector("[data-toggle-hotspot-calibration]");
      button.click();
      const hotspot = document.querySelector("[data-hotspot-id]");
      const style = getComputedStyle(hotspot);
      const label = getComputedStyle(hotspot, "::before").content;
      ({
        enabled: document.querySelector(".image-stage").classList.contains("show-calibration"),
        buttonText: button.textContent,
        outline: style.outlineStyle,
        background: style.backgroundColor,
        label
      })
    `);
    assert.strictEqual(calibrationState.enabled, true);
    assert.strictEqual(calibrationState.buttonText, "隐藏热点边界");
    assert.strictEqual(calibrationState.outline, "solid");
    assert.notStrictEqual(calibrationState.background, "rgba(0, 0, 0, 0)");
    assert.notStrictEqual(calibrationState.label, "none");
    await cdp.evaluate(`document.querySelector("[data-toggle-hotspot-calibration]").click()`);
    const calibrationDisabled = await cdp.evaluate(`
      !document.querySelector(".image-stage").classList.contains("show-calibration") &&
      getComputedStyle(document.querySelector("[data-hotspot-id]")).backgroundColor === "rgba(0, 0, 0, 0)"
    `);
    assert.strictEqual(calibrationDisabled, true);
    const calibrationApplied = await cdp.evaluate(`
      const input = document.querySelector("[data-calibration-input]");
      const data = JSON.parse(input.value);
      const before = document.querySelector("[data-hotspot-id='module_1']").getAttribute("style");
      const target = data.find((item) => item.id === "module_1");
      target.bounds.x = Number((target.bounds.x + 0.004).toFixed(3));
      input.value = JSON.stringify(data, null, 2);
      document.querySelector("[data-apply-hotspot-calibration]").click();
      ({ before, expectedLeft: (target.bounds.x * 100) + "%" });
    `);
    await cdp.waitForFunction(
      `document.querySelector("[data-hotspot-id='module_1']").getAttribute("style") !== ${JSON.stringify(
        calibrationApplied.before
      )}`,
      3000
    );
    const calibratedState = await cdp.evaluate(`({
      status: document.querySelector("#statusPill").textContent,
      style: document.querySelector("[data-hotspot-id='module_1']").getAttribute("style"),
      raw: document.querySelector(".debug-panel").innerText
    })`);
    assert.strictEqual(calibratedState.status, "热点已校准");
    assert.notStrictEqual(calibratedState.style, calibrationApplied.before);
    assert.match(calibratedState.raw, /manual-calibration/);

    const clickedFeedback = await cdp.evaluate(`
      const node = document.querySelector("[data-hotspot-id]");
      node.click();
      getComputedStyle(node, "::after").content;
    `);
    assert.notStrictEqual(clickedFeedback, "none");
    await cdp.waitForFunction(`!document.querySelector("#detailPanel").hidden && document.querySelector(".detail-content h2")`, 3000);
    const selectedTitle = await cdp.evaluate(`document.querySelector(".detail-content h2").textContent`);
    assert.ok(selectedTitle.trim().length > 0);
    const detailLayout = await cdp.evaluate(`(() => {
      const panel = document.querySelector("#detailPanel").getBoundingClientRect();
      const preview = document.querySelector(".detail-preview-crop").getBoundingClientRect();
      const summary = document.querySelector(".detail-summary").getBoundingClientRect();
      return { panelWidth: panel.width, previewWidth: preview.width, summaryWidth: summary.width };
    })()`);
    assert.ok(detailLayout.panelWidth >= 760, `detail panel is too narrow: ${detailLayout.panelWidth}`);
    assert.ok(detailLayout.previewWidth >= 340, `detail preview is too narrow: ${detailLayout.previewWidth}`);
    assert.ok(detailLayout.summaryWidth >= 250, `detail summary is too narrow: ${detailLayout.summaryWidth}`);
    const previewCrop = await cdp.evaluate(`(() => {
      const hotspot = document.querySelector("[data-hotspot-id='module_1']");
      const preview = document.querySelector(".detail-preview-crop");
      const style = getComputedStyle(preview);
      const bounds = {
        x: parseFloat(hotspot.style.left) / 100,
        y: parseFloat(hotspot.style.top) / 100,
        width: parseFloat(hotspot.style.width) / 100,
        height: parseFloat(hotspot.style.height) / 100
      };
      const crop = {
        x: Number(style.getPropertyValue("--crop-x")),
        y: Number(style.getPropertyValue("--crop-y")),
        width: Number(style.getPropertyValue("--crop-w")),
        height: Number(style.getPropertyValue("--crop-h"))
      };
      return { bounds, crop, aspectRatio: preview.getBoundingClientRect().width / preview.getBoundingClientRect().height };
    })()`);
    assert.ok(previewCrop.crop.x < previewCrop.bounds.x);
    assert.ok(previewCrop.crop.y < previewCrop.bounds.y);
    assert.ok(previewCrop.crop.width <= previewCrop.bounds.width + 0.05);
    assert.ok(previewCrop.crop.height <= previewCrop.bounds.height + 0.05);
    const imageAspect = 1600 / 900;
    const hotspotPreviewAspect = (previewCrop.bounds.width * imageAspect) / previewCrop.bounds.height;
    assert.ok(
      Math.abs(previewCrop.aspectRatio - hotspotPreviewAspect) < 0.35,
      `preview aspect ${previewCrop.aspectRatio} should follow hotspot shape ${hotspotPreviewAspect}`
    );
    const detailFocus = await cdp.evaluate(`document.activeElement.id`);
    assert.strictEqual(detailFocus, "detailPanel");
    await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
    await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
    const firstTabFocusInside = await cdp.evaluate(`document.querySelector("#detailPanel").contains(document.activeElement)`);
    assert.strictEqual(firstTabFocusInside, true);
    await cdp.evaluate(`document.querySelector("#followupInput").focus()`);
    await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
    await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
    await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
    await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
    const wrappedFocus = await cdp.evaluate(`document.activeElement.id`);
    assert.strictEqual(wrappedFocus, "closeDetailButton");
    await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await cdp.waitForFunction(`document.querySelector("#detailPanel").hidden`, 3000);
    await cdp.evaluate(`document.querySelector("[data-hotspot-id]").click()`);
    await cdp.waitForFunction(`!document.querySelector("#detailPanel").hidden`, 3000);
    const detailBackdropVisible = await cdp.evaluate(`Boolean(document.querySelector("#detailBackdrop") && !document.querySelector("#detailBackdrop").hidden)`);
    assert.strictEqual(detailBackdropVisible, true);
    await cdp.evaluate(`document.querySelector("#detailBackdrop").click()`);
    await cdp.waitForFunction(`document.querySelector("#detailPanel").hidden && document.querySelector("#detailBackdrop").hidden`, 3000);
    await cdp.evaluate(`document.querySelector("[data-hotspot-id]").click()`);
    await cdp.waitForFunction(`!document.querySelector("#detailPanel").hidden`, 3000);
    const desktopColumns = await cdp.evaluate(`getComputedStyle(document.querySelector(".workspace")).display`);
    assert.strictEqual(desktopColumns, "grid");
    await saveScreenshot(cdp, path.join(artifactDir, "desktop-main.png"));

    const downloadIntent = await cdp.evaluate(`
      window.__downloadIntent = null;
      HTMLAnchorElement.prototype.__chatImageOriginalClick = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () {
        window.__downloadIntent = { href: this.href, download: this.download };
      };
      document.querySelector("#saveButton").click();
      window.__downloadIntent;
    `);
    assert.ok(downloadIntent.href.startsWith("data:image/svg+xml"));
    assert.match(downloadIntent.download, /\.svg$/);
    const pngDownloadName = await cdp.evaluate(`
      window.ChatImageTestHooks.buildImageDownloadName({
        title: "Chat/Image: Value?.svg",
        imageUrl: "https://cdn.example.com/generated.png?token=1"
      })
    `);
    assert.strictEqual(pngDownloadName, "Chat_Image_ Value_.png");

    await cdp.evaluate(`
      document.querySelector("#followupInput").value = "这个区域如何继续追问？";
      document.querySelector("#followupForm").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    `);
    await cdp.waitForFunction(`document.querySelectorAll(".message.user").length === 1`, 6000);
    await cdp.waitForFunction(
      `document.querySelectorAll(".message.assistant").length === 1 && document.querySelector(".message.assistant").textContent.includes("真实 API 接入")`,
      6000
    );

    const firstTitle = await cdp.evaluate(`document.querySelector(".detail-content h2").textContent`);
    await cdp.evaluate(`document.querySelectorAll("[data-hotspot-id]")[1].click()`);
    await cdp.waitForFunction(
      `document.querySelector(".detail-content h2").textContent !== ${JSON.stringify(firstTitle)}`,
      3000
    );
    const secondTitle = await cdp.evaluate(`document.querySelector(".detail-content h2").textContent`);
    assert.notStrictEqual(secondTitle, firstTitle);
    const secondThreadInitial = await cdp.evaluate(`document.querySelectorAll(".message.user").length`);
    assert.strictEqual(secondThreadInitial, 0);

    await cdp.evaluate(`
      document.querySelector("#followupInput").value = "这是第二个区域自己的追问吗？";
      document.querySelector("#followupForm").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    `);
    await cdp.waitForFunction(`document.querySelectorAll(".message.user").length === 1`, 6000);
    await cdp.evaluate(`document.querySelectorAll("[data-hotspot-id]")[0].click()`);
    await cdp.waitForFunction(
      `document.querySelector(".detail-content h2").textContent === ${JSON.stringify(firstTitle)} && document.querySelector(".message.user").textContent.includes("这个区域如何继续追问")`,
      3000
    );

    await cdp.evaluate(`document.querySelector("#zoomButton").click()`);
    await cdp.waitForFunction(`document.querySelector("#imageModal:not([hidden]) .image-stage img")`, 3000);
    const modalVisible = await cdp.evaluate(`Boolean(document.querySelector("#imageModal:not([hidden])"))`);
    assert.strictEqual(modalVisible, true);
    const modalHotspotCount = await cdp.evaluate(
      `document.querySelectorAll("#imageModal [data-hotspot-id]").length`
    );
    assert.ok(modalHotspotCount >= 5);
    const modalInitialFocus = await cdp.evaluate(
      `document.activeElement.matches("#imageModal .modal-toolbar [data-close-modal]")`
    );
    assert.strictEqual(modalInitialFocus, true);
    await cdp.evaluate(`
      const hotspots = document.querySelectorAll("#imageModal [data-hotspot-id]");
      hotspots[hotspots.length - 1].focus();
    `);
    await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
    await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
    const modalWrappedFocus = await cdp.evaluate(
      `document.activeElement.matches("#imageModal .modal-toolbar [data-close-modal]")`
    );
    assert.strictEqual(modalWrappedFocus, true);
    await cdp.send("Input.dispatchKeyEvent", {
      type: "keyDown",
      key: "Tab",
      code: "Tab",
      windowsVirtualKeyCode: 9,
      modifiers: 8
    });
    await cdp.send("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: "Tab",
      code: "Tab",
      windowsVirtualKeyCode: 9,
      modifiers: 8
    });
    const modalShiftWrappedFocus = await cdp.evaluate(
      `document.querySelector("#imageModal").contains(document.activeElement) && document.activeElement.hasAttribute("data-hotspot-id")`
    );
    assert.strictEqual(modalShiftWrappedFocus, true);
    await cdp.evaluate(`document.querySelectorAll("#imageModal [data-hotspot-id]")[1].click()`);
    await cdp.waitForFunction(
      `document.querySelector(".detail-content h2").textContent === ${JSON.stringify(secondTitle)}`,
      3000
    );

    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 920,
      deviceScaleFactor: 1,
      mobile: true
    });
    await cdp.send("Page.navigate", { url: `${baseUrl}/?provider=mock` });
    await cdp.waitFor("Page.loadEventFired", 10000);
    await cdp.evaluate(`
      document.querySelector("#questionInput").value = "移动端测试 ChatImage";
      document.querySelector("#questionForm").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    `);
    await cdp.waitForFunction(`document.querySelectorAll("[data-hotspot-id]").length >= 5`, 8000);
    const mobileLabelCount = await cdp.evaluate(`document.querySelectorAll(".module-label").length`);
    assert.strictEqual(mobileLabelCount, 0);
    const mobileWorkspaceDisplay = await cdp.evaluate(`getComputedStyle(document.querySelector(".workspace")).display`);
    assert.strictEqual(mobileWorkspaceDisplay, "block");
    await saveScreenshot(cdp, path.join(artifactDir, "mobile-main.png"));
    await cdp.evaluate(`document.querySelector("#zoomButton").click()`);
    await cdp.waitForFunction(`document.querySelector("#imageModal:not([hidden]) .image-stage img")`, 3000);
    const mobileModalIsLarge = await cdp.evaluate(`
      document.querySelector("#imageModal .image-frame").getBoundingClientRect().width > window.innerWidth
    `);
    assert.strictEqual(mobileModalIsLarge, true);

    await cdp.send("Page.navigate", { url: `${baseUrl}/?provider=api` });
    await cdp.waitFor("Page.loadEventFired", 10000);
    await cdp.evaluate(`
      document.querySelector("#questionInput").value = "这个请求会触发缺少 key 的失败";
      document.querySelector("#questionForm").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    `);
    await cdp.waitForFunction(`document.querySelector("#retryButton")`, 5000);
    const retryText = await cdp.evaluate(`document.querySelector("#retryButton").textContent`);
    assert.strictEqual(retryText, "重试");

    await cdp.close();
  } finally {
    await stopProcess(chrome);
    await close(server);
    await rmWithRetry(profileDir);
  }

  assertPngArtifact(path.join(artifactDir, "desktop-main.png"), { minWidth: 1000, minHeight: 700 });
  assertPngArtifact(path.join(artifactDir, "mobile-main.png"), { minWidth: 300, minHeight: 700 });

  console.log("browser.test.js passed");
}

function findChrome() {
  const candidates = getChromeCandidates();
  return candidates.find((candidate) => fs.existsSync(candidate));
}

function getChromeCandidates(env = process.env, platform = process.platform) {
  const candidates = [];
  if (env.CHATIMAGE_BROWSER_PATH) candidates.push(env.CHATIMAGE_BROWSER_PATH);
  if (platform === "win32") {
    candidates.push(
      "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"
    );
  } else if (platform === "darwin") {
    candidates.push(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      "/Applications/Chromium.app/Contents/MacOS/Chromium"
    );
  } else {
    candidates.push(
      "/usr/bin/google-chrome",
      "/usr/bin/google-chrome-stable",
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
      "/snap/bin/chromium",
      "/opt/google/chrome/chrome",
      "/microsoft/msedge/msedge"
    );
  }
  return [...new Set(candidates.filter(Boolean))];
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function getFreePort() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const server = require("net").createServer();
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const { port } = server.address();
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    if (!UNSAFE_FETCH_PORTS.has(port)) return port;
  }
  throw new Error("Could not allocate a browser-safe local port");
}

const UNSAFE_FETCH_PORTS = new Set([
  1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79, 87, 95,
  101, 102, 103, 104, 109, 110, 111, 113, 115, 117, 119, 123, 135, 137, 139, 143, 161,
  179, 389, 427, 465, 512, 513, 514, 515, 526, 530, 531, 532, 540, 548, 554, 556, 563,
  587, 601, 636, 989, 990, 993, 995, 1719, 1720, 1723, 2049, 3659, 4045, 5060, 5061,
  6000, 6566, 6665, 6666, 6667, 6668, 6669, 6697, 10080
]);

async function waitForWebSocketUrl(port, getDebugOutput) {
  const listUrl = `http://127.0.0.1:${port}/json/list`;
  const versionUrl = `http://127.0.0.1:${port}/json/version`;
  const startedAt = Date.now();
  while (Date.now() - startedAt < 10000) {
    try {
      const listResponse = await fetch(listUrl);
      if (listResponse.ok) {
        const targets = await listResponse.json();
        const page = targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl);
        if (page) return page.webSocketDebuggerUrl;
      }
      const versionResponse = await fetch(versionUrl);
      if (versionResponse.ok) {
        await versionResponse.json();
      }
    } catch {
      // Chrome is still starting.
    }
    await sleep(150);
  }
  throw new Error(`Timed out waiting for Chrome DevTools endpoint\n${getDebugOutput()}`);
}

function connectCdp(wsUrl) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl);
    let nextId = 1;
    const callbacks = new Map();
    const waiters = new Map();

    socket.addEventListener("open", () => {
      resolve({
        send(method, params = {}) {
          const id = nextId++;
          socket.send(JSON.stringify({ id, method, params }));
          return new Promise((methodResolve, methodReject) => {
            callbacks.set(id, { resolve: methodResolve, reject: methodReject });
          });
        },
        evaluate(expression) {
          return this.send("Runtime.evaluate", {
            expression,
            awaitPromise: true,
            returnByValue: true
          }).then((result) => {
            if (result.exceptionDetails) {
              throw new Error(JSON.stringify(result.exceptionDetails));
            }
            return result.result.value;
          });
        },
        waitFor(eventName, timeoutMs) {
          return waitForEvent(waiters, eventName, timeoutMs);
        },
        waitForFunction(expression, timeoutMs) {
          return waitForPredicate(this, expression, timeoutMs);
        },
        close() {
          socket.close();
        }
      });
    });

    socket.addEventListener("message", (event) => {
      const payload = JSON.parse(event.data);
      if (payload.id && callbacks.has(payload.id)) {
        const callback = callbacks.get(payload.id);
        callbacks.delete(payload.id);
        if (payload.error) callback.reject(new Error(JSON.stringify(payload.error)));
        else callback.resolve(payload.result || {});
        return;
      }
      if (payload.method && waiters.has(payload.method)) {
        for (const waiter of waiters.get(payload.method)) {
          waiter.resolve(payload.params || {});
        }
        waiters.delete(payload.method);
      }
    });

    socket.addEventListener("error", reject);
  });
}

function waitForEvent(waiters, eventName, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${eventName}`)), timeoutMs);
    const list = waiters.get(eventName) || [];
    list.push({
      resolve(value) {
        clearTimeout(timeout);
        resolve(value);
      }
    });
    waiters.set(eventName, list);
  });
}

async function waitForPredicate(cdp, expression, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const value = await cdp.evaluate(`Boolean(${expression})`);
    if (value) return;
    await sleep(120);
  }
  throw new Error(`Timed out waiting for predicate: ${expression}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function saveScreenshot(cdp, filePath) {
  const result = await cdp.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true
  });
  fs.writeFileSync(filePath, Buffer.from(result.data, "base64"));
}

function assertPngArtifact(filePath, { minWidth, minHeight }) {
  assert.ok(fs.existsSync(filePath), `${filePath} does not exist`);
  const buffer = fs.readFileSync(filePath);
  assert.ok(buffer.length > 50_000, `${filePath} is unexpectedly small`);
  assert.strictEqual(buffer.toString("hex", 0, 8), "89504e470d0a1a0a");
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  assert.ok(width >= minWidth, `${filePath} width ${width} < ${minWidth}`);
  assert.ok(height >= minHeight, `${filePath} height ${height} < ${minHeight}`);
}

function stopProcess(child) {
  return new Promise((resolve) => {
    if (child.exitCode !== null) return resolve();
    child.once("exit", resolve);
    child.kill();
    setTimeout(resolve, 2000);
  });
}

async function rmWithRetry(targetPath) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      fs.rmSync(targetPath, { recursive: true, force: true });
      return;
    } catch (error) {
      if (attempt === 7) throw error;
      await sleep(250);
    }
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  assertPngArtifact,
  close,
  connectCdp,
  findChrome,
  getChromeCandidates,
  getFreePort,
  listen,
  rmWithRetry,
  saveScreenshot,
  sleep,
  stopProcess,
  waitForWebSocketUrl
};
