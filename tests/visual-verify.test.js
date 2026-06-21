// Visual + motion verification for the detail panel convergence layer.
// Reuses the CDP helpers exported by browser.test.js so we get the same
// Chrome launch / connect logic for free.
//
// Verifies:
//   1. Clicking a hotspot adds is-entering + is-preview-entering classes
//   2. The entrance classes are cleaned up after the motion window
//   3. Closing adds is-closing before hidden=true, then hidden after the anim
//   4. detail-panel background is the warm rgb(255,250,240) (#fffaf0)
//   5. default hotspot background stays transparent (test-safe hover feedback)

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { createServer } = require("../server");
const {
  assertPngArtifact,
  close,
  connectCdp,
  findChrome,
  getFreePort,
  listen,
  rmWithRetry,
  saveScreenshot,
  sleep,
  stopProcess,
  waitForWebSocketUrl
} = require("./browser.test.js");

async function main() {
  const chromePath = findChrome();
  if (!chromePath) {
    console.log("visual-verify.test.js skipped: Chrome or Edge was not found");
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
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "chatimage-visual-"));
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
      height: 900,
      deviceScaleFactor: 1,
      mobile: false
    });

    await cdp.send("Page.navigate", { url: baseUrl + "/" });
    await cdp.send("Runtime.evaluate", {
      expression: `new Promise(r => { if (document.readyState === 'complete') return r(); window.addEventListener('load', () => r()); })`,
      awaitPromise: true
    });

    // Submit a mock question so hotspots appear.
    await cdp.send("Runtime.evaluate", {
      expression: `
        document.querySelector("#questionInput").value = "请解释一下 ChatImage 的工作流程";
        document.querySelector("#questionForm").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        true
      `
    });

    // Wait for hotspots + image.
    await waitForPredicate(
      cdp,
      `document.querySelectorAll("[data-hotspot-id]").length >= 5 && document.querySelector(".image-stage img")`,
      8000
    );

    // 1. Default hotspot must stay transparent (browser.test.js also asserts this).
    const defaultHotspot = await cdp.send("Runtime.evaluate", {
      expression: `JSON.stringify((() => {
        const h = document.querySelector("[data-hotspot-id]");
        const s = getComputedStyle(h);
        return { background: s.backgroundColor, border: s.borderTopWidth, boxShadow: s.boxShadow };
      })())`,
      returnByValue: true
    });
    const dh = JSON.parse(defaultHotspot.result.value);
    console.log("default hotspot:", JSON.stringify(dh));
    const defaultTransparent = dh.background === "rgba(0, 0, 0, 0)";

    // 2. Click the first hotspot and immediately sample the detail panel classes.
    await cdp.send("Runtime.evaluate", {
      expression: `document.querySelector("[data-hotspot-id]").click(); true`,
      awaitPromise: false
    });

    const enteringRaw = await cdp.send("Runtime.evaluate", {
      expression: `JSON.stringify((() => {
        const p = document.querySelector(".detail-panel");
        const b = document.querySelector(".detail-backdrop");
        return {
          panelHidden: p ? p.hidden : null,
          panelClasses: p ? p.className : null,
          backdropHidden: b ? b.hidden : null,
          backdropClasses: b ? b.className : null
        };
      })())`,
      returnByValue: true
    });
    const entering = JSON.parse(enteringRaw.result.value);
    console.log("entering state:", JSON.stringify(entering));
    const hasEntering =
      entering.panelClasses &&
      entering.panelClasses.includes("is-entering") &&
      entering.panelClasses.includes("is-preview-entering") &&
      entering.backdropClasses &&
      entering.backdropClasses.includes("is-entering");

    // 3. Verify the warm palette is applied to the detail panel.
    const colorRaw = await cdp.send("Runtime.evaluate", {
      expression: `getComputedStyle(document.querySelector(".detail-panel")).backgroundColor`,
      returnByValue: true
    });
    const panelColor = colorRaw.result.value;
    console.log("detail-panel background:", panelColor);
    // rgb(255, 250, 240) == #fffaf0 (warm). rgb(255, 255, 255) == #ffffff (cold).
    const isWarm = panelColor.includes("250") && panelColor.includes("240");

    // Take a screenshot of the open panel.
    await saveScreenshot(cdp, path.join(artifactDir, "visual-verify-open.png"));

    // 4. Wait for the motion cleanup window (700ms + margin).
    await sleep(900);
    const settledRaw = await cdp.send("Runtime.evaluate", {
      expression: `JSON.stringify((() => {
        const p = document.querySelector(".detail-panel");
        return { panelClasses: p ? p.className : null, panelHidden: p ? p.hidden : null };
      })())`,
      returnByValue: true
    });
    const settled = JSON.parse(settledRaw.result.value);
    console.log("settled state:", JSON.stringify(settled));
    const classesCleaned =
      settled.panelClasses &&
      !settled.panelClasses.includes("is-entering") &&
      !settled.panelClasses.includes("is-preview-entering");

    // 5. Close the panel and verify is-closing is added before hidden=true.
    await cdp.send("Runtime.evaluate", {
      expression: `document.querySelector("#closeDetailButton").click(); true`
    });
    const closingRaw = await cdp.send("Runtime.evaluate", {
      expression: `JSON.stringify((() => {
        const p = document.querySelector(".detail-panel");
        return { panelClasses: p ? p.className : null, panelHidden: p ? p.hidden : null };
      })())`,
      returnByValue: true
    });
    const closing = JSON.parse(closingRaw.result.value);
    console.log("closing state (immediately after close):", JSON.stringify(closing));
    const hasClosingClass =
      closing.panelClasses && closing.panelClasses.includes("is-closing") && !closing.panelHidden;

    // 6. Wait for the close animation to finish.
    await sleep(300);
    const closedRaw = await cdp.send("Runtime.evaluate", {
      expression: `JSON.stringify((() => {
        const p = document.querySelector(".detail-panel");
        return { panelClasses: p ? p.className : null, panelHidden: p ? p.hidden : null };
      })())`,
      returnByValue: true
    });
    const closed = JSON.parse(closedRaw.result.value);
    console.log("closed state (after close animation):", JSON.stringify(closed));
    const fullyClosed =
      closed.panelHidden === true && !closed.panelClasses.includes("is-closing");

    // Summary
    console.log("\n=== VISUAL VERIFICATION SUMMARY ===");
    console.log("1. default hotspot transparent:", defaultTransparent);
    console.log("2. is-entering + is-preview-entering on click:", hasEntering);
    console.log("3. warm #fffaf0 panel background:", isWarm);
    console.log("4. entrance classes cleaned after motion:", classesCleaned);
    console.log("5. is-closing added before hidden:", hasClosingClass);
    console.log("6. panel fully closed + is-closing stripped:", fullyClosed);

    const allPass =
      defaultTransparent &&
      hasEntering &&
      isWarm &&
      classesCleaned &&
      hasClosingClass &&
      fullyClosed;
    console.log("\nall checks pass:", allPass);

    // Validate the screenshot artifact is real.
    assertPngArtifact(path.join(artifactDir, "visual-verify-open.png"), {
      minWidth: 200,
      minHeight: 200
    });

    if (!allPass) {
      throw new Error("visual verification failed — see log above");
    }
    console.log("\nvisual-verify.test.js passed");
  } finally {
    await stopProcess(chrome);
    try {
      await close(server);
    } catch (_) {}
    try {
      await rmWithRetry(profileDir);
    } catch (_) {}
  }
}

function waitForPredicate(cdp, expression, timeoutMs) {
  return cdp.send("Runtime.evaluate", {
    expression: `new Promise((resolve, reject) => {
      const start = Date.now();
      const tick = () => {
        try {
          if (eval(${JSON.stringify(expression)})) return resolve(true);
        } catch (e) {}
        if (Date.now() - start > ${timeoutMs}) return reject(new Error("timeout"));
        setTimeout(tick, 120);
      };
      tick();
    })`,
    awaitPromise: true
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
