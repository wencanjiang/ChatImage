"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { createConfig, createServer } = require("../server");
const {
  connectCdp,
  findChrome,
  getFreePort,
  rmWithRetry,
  saveScreenshot,
  stopProcess,
  waitForWebSocketUrl
} = require("./browser.test");

async function main() {
  const chromePath = findChrome();
  if (!chromePath) {
    console.log("docs-demo-interaction.test.js skipped: Chrome or Edge was not found");
    return;
  }

  const server = createServer(createConfig({ port: 0 }));
  await listen(server);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const debugPort = await getFreePort();
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "chatimage-docs-demo-"));
  const chrome = spawn(chromePath, [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--no-first-run",
    "--no-default-browser-check",
    `--user-data-dir=${profileDir}`,
    `--remote-debugging-port=${debugPort}`,
    "about:blank"
  ]);
  let stderr = "";
  chrome.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  let cdp;
  try {
    const wsUrl = await waitForWebSocketUrl(debugPort, () => stderr);
    cdp = await connectCdp(wsUrl);
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 1440,
      height: 980,
      deviceScaleFactor: 1,
      mobile: false
    });
    await cdp.send("Page.navigate", { url: `${baseUrl}/docs/index.html` });
    await cdp.waitFor("Page.loadEventFired", 10000);
    await cdp.waitForFunction(`document.querySelectorAll(".demo[data-demo]").length === 6`, 5000);
    await cdp.waitForFunction(`window.ChatImageI18n && document.querySelector("#langToggle")`, 5000);
    await cdp.waitForFunction(`localStorage.getItem("ci.lang") === "en" || localStorage.getItem("ci.lang") === "zh"`, 5000);
    await cdp.evaluate(`window.ChatImageI18n.setLang("en")`);
    await cdp.waitForFunction(`document.documentElement.lang === "en"`, 3000);

    // hero is a single image; clicking a hotspot opens a popover (preview + title + detail).
    const heroSrc = await cdp.evaluate(`document.querySelector("#heroStageImg").getAttribute("src")`);
    assert.ok(heroSrc.includes("real-west-lake-tour-map.png"), "docs hero should use the regenerated strict West Lake demo");
    await cdp.waitForFunction(
      `document.querySelectorAll("#heroHotspots .hero-hotspot").length === 9`,
      8000
    );
    // popover starts closed
    const initiallyOpen = await cdp.evaluate(`!!document.querySelector("#heroPopover.open")`);
    assert.strictEqual(initiallyOpen, false, "hero popover should be closed by default");
    // click the first hotspot -> popover opens with preview image + title + detail text
    await cdp.evaluate(`document.querySelectorAll("#heroHotspots .hero-hotspot")[0].click()`);
    await cdp.waitForFunction(
      `(function(){var p=document.querySelector("#heroPopover.open");if(!p)return false;var img=p.querySelector("img");var det=document.querySelector("#heroPopoverDetail");return !!(img && img.getAttribute("src")) && !!(det && det.textContent && det.textContent.trim().length>0);})()`,
      8000
    );
    const heroFirstTitle = await cdp.evaluate(`document.querySelector("#heroPopoverTitle").textContent`);
    const heroFirstDetail = await cdp.evaluate(`document.querySelector("#heroPopoverDetail").textContent`);
    assert.ok(typeof heroFirstTitle === "string" && heroFirstTitle.length > 0, "popover should have a region title");
    assert.ok(typeof heroFirstDetail === "string" && heroFirstDetail.length > 0, "popover should have detail text");
    // click a different hotspot -> popover content changes
    await cdp.evaluate(`document.querySelectorAll("#heroHotspots .hero-hotspot")[1].click()`);
    await cdp.waitForFunction(
      `document.querySelector("#heroPopoverTitle").textContent !== ${JSON.stringify(heroFirstTitle)}`,
      4000
    );
    const heroSecondDetail = await cdp.evaluate(`document.querySelector("#heroPopoverDetail").textContent`);
    assert.notStrictEqual(heroSecondDetail, heroFirstDetail, "clicking another hero hotspot should swap the popover detail");
    const heroSecondTitle = await cdp.evaluate(`document.querySelector("#heroPopoverTitle").textContent`);
    await cdp.evaluate(`document.querySelector("#langToggle").click()`);
    await cdp.waitForFunction(
      `document.documentElement.lang === "zh-CN" && document.querySelector("#heroPopoverDetail").textContent !== ${JSON.stringify(heroSecondDetail)}`,
      4000
    );
    const heroZhTitle = await cdp.evaluate(`document.querySelector("#heroPopoverTitle").textContent`);
    const heroZhDetail = await cdp.evaluate(`document.querySelector("#heroPopoverDetail").textContent`);
    assert.notStrictEqual(heroZhTitle, heroSecondTitle, "hero popover title should switch language in place");
    assert.match(heroZhTitle + heroZhDetail, /[\u4e00-\u9fff]/, "hero popover should expose Chinese hotspot copy after switching language");
    await cdp.evaluate(`document.querySelector("#langToggle").click()`);
    await cdp.waitForFunction(
      `document.documentElement.lang === "en" && document.querySelector("#heroPopoverDetail").textContent === ${JSON.stringify(heroSecondDetail)}`,
      4000
    );

    await cdp.evaluate(`document.querySelector(".demo[data-demo]").click()`);
    await cdp.waitForFunction(
      `document.querySelector("#lightbox.open") && document.querySelectorAll("#demoHotspots .demo-hotspot").length >= 3`,
      5000
    );
    const hotspotCount = await cdp.evaluate(`document.querySelectorAll("#demoHotspots .demo-hotspot").length`);
    // The full demo uses a stable right-side detail panel instead of an on-image popover.
    const demoInitiallyOpen = await cdp.evaluate(`!!document.querySelector("#demoPopover.open")`);
    assert.strictEqual(demoInitiallyOpen, false, "demo popover should stay closed by default");
    const initialDetailTitle = await cdp.evaluate(`document.querySelector("#demoDetailTitle").textContent`);
    assert.match(initialDetailTitle, /Select a region|选择一个区域/, "demo detail panel should start in a neutral selection state");

    // click first demo hotspot -> right detail panel updates with preview img + title + detail
    await cdp.evaluate(`document.querySelectorAll("#demoHotspots .demo-hotspot")[0].click()`);
    await cdp.waitForFunction(
      `(function(){var p=document.querySelector("#demoDetail");var img=document.querySelector("#demoDetailPreview img");var det=document.querySelector("#demoDetailText");return !!(p && p.classList.contains("active") && img && img.getAttribute("src") && det && det.textContent && det.textContent.trim().length>0 && !document.querySelector("#demoPopover.open"));})()`,
      6000
    );
    const firstTitle = await cdp.evaluate(`document.querySelector("#demoDetailTitle").textContent`);
    const firstDetail = await cdp.evaluate(`document.querySelector("#demoDetailText").textContent`);
    const firstPreviewKind = await cdp.evaluate(`document.querySelector("#demoDetailPreview").className`);
    assert.ok(firstTitle && firstTitle.length > 0, "demo detail panel should have a title");
    assert.ok(firstDetail && firstDetail.length > 0, "demo detail panel should have detail text");
    assert.match(firstPreviewKind, /organic|cutout|fallback/, "demo detail panel should classify the preview kind");
    await cdp.evaluate(`document.querySelector("#langToggle").click()`);
    await cdp.waitForFunction(
      `document.documentElement.lang === "zh-CN" && document.querySelector("#demoDetailText").textContent !== ${JSON.stringify(firstDetail)}`,
      4000
    );
    const firstZhTitle = await cdp.evaluate(`document.querySelector("#demoDetailTitle").textContent`);
    const firstZhDetail = await cdp.evaluate(`document.querySelector("#demoDetailText").textContent`);
    assert.notStrictEqual(firstZhTitle, firstTitle, "demo detail title should switch language in place");
    assert.match(firstZhTitle + firstZhDetail, /[\u4e00-\u9fff]/, "demo detail should expose Chinese hotspot copy after switching language");
    await cdp.evaluate(`document.querySelector("#langToggle").click()`);
    await cdp.waitForFunction(
      `document.documentElement.lang === "en" && document.querySelector("#demoDetailText").textContent === ${JSON.stringify(firstDetail)}`,
      4000
    );
    // click another hotspot -> detail panel content switches
    await cdp.evaluate(`document.querySelectorAll("#demoHotspots .demo-hotspot")[1].click()`);
    await cdp.waitForFunction(
      `document.querySelector("#demoDetailTitle").textContent !== ${JSON.stringify(firstTitle)}`,
      4000
    );
    const secondTitle = await cdp.evaluate(`document.querySelector("#demoDetailTitle").textContent`);
    const secondDetail = await cdp.evaluate(`document.querySelector("#demoDetailText").textContent`);
    // re-click same hotspot keeps the stable detail panel open, instead of disappearing.
    await cdp.evaluate(`document.querySelectorAll("#demoHotspots .demo-hotspot")[1].click()`);
    await cdp.waitForFunction(`document.querySelector("#demoDetail.active") && !document.querySelector("#demoPopover.open")`, 3000);

    const screenshot = path.join("tmp", "docs-demo-interaction.png");
    await saveScreenshot(cdp, screenshot);
    assert.notStrictEqual(secondDetail, firstDetail, "clicking another hotspot should swap the popover detail");
    assert.ok(hotspotCount >= 3, "opened demo should expose reusable hotspots");
    console.log("docs-demo-interaction.test.js passed");
  } finally {
    if (cdp) cdp.close();
    await stopProcess(chrome);
    await rmWithRetry(profileDir);
    await close(server);
  }
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    if (!server || !server.listening) return resolve();
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
