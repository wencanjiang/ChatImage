"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn, spawnSync } = require("child_process");
const { createServer } = require("../server");
const {
  close,
  connectCdp,
  findChrome,
  getFreePort,
  listen,
  rmWithRetry,
  saveScreenshot,
  stopProcess,
  waitForWebSocketUrl
} = require("./browser.test");

const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");

async function main() {
  const chromePath = findChrome();
  if (!chromePath) {
    console.log("browser-dist.test.js skipped: Chrome or Edge was not found");
    return;
  }

  const build = spawnSync(process.execPath, ["scripts/build.js"], {
    cwd: rootDir,
    encoding: "utf8",
    shell: false
  });
  assert.strictEqual(build.status, 0, build.stderr || build.stdout);

  const server = createServer({
    port: 0,
    apiKey: "",
    textModel: "gpt-5.5",
    imageModel: "GPT-Image-2",
    staticDir: distDir
  });
  await listen(server);
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;
  const debugPort = await getFreePort();
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "chatimage-dist-browser-"));
  const artifactDir = path.join(rootDir, "tmp", "test-artifacts");
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
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 1280,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false
    });
    await cdp.send("Page.navigate", { url: `${baseUrl}/?provider=mock` });
    await cdp.waitFor("Page.loadEventFired", 10000);

    const loadedScripts = await cdp.evaluate(`
      Array.from(document.scripts)
        .map((script) => script.getAttribute("src") || "")
        .filter((name) => name.startsWith("assets/chatimage.") && name.endsWith(".min.js"))
    `);
    assert.strictEqual(loadedScripts.length, 1);
    const sourceScripts = await cdp.evaluate(`
      performance.getEntriesByType("resource")
        .map((entry) => entry.name)
        .filter((name) => name.includes("/src/"))
    `);
    assert.deepStrictEqual(sourceScripts, []);

    const hookWorks = await cdp.evaluate(`
      window.ChatImageTestHooks.parseJsonFromText('{"title":"dist"}').title
    `);
    assert.strictEqual(hookWorks, "dist");

    await cdp.evaluate(`
      document.querySelector("#questionInput").value = "dist 构建产物能否生成 ChatImage";
      document.querySelector("#questionForm").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    `);
    await cdp.waitForFunction(
      `document.querySelectorAll("[data-hotspot-id]").length === 5 && document.querySelector(".debug-panel")`,
      8000
    );

    const stage = await cdp.evaluate(`
      const node = document.querySelector(".image-stage");
      const img = document.querySelector(".image-stage img");
      ({
        hotspotCount: document.querySelectorAll("[data-hotspot-id]").length,
        labelCount: document.querySelectorAll(".module-label").length,
        imageSrc: img.getAttribute("src"),
        stageWidth: Math.round(node.getBoundingClientRect().width)
      })
    `);
    assert.strictEqual(stage.hotspotCount, 5);
    assert.strictEqual(stage.labelCount, 0);
    assert.ok(stage.imageSrc.startsWith("data:image/svg+xml;charset=utf-8,"));
    assert.ok(stage.stageWidth > 800);

    await cdp.evaluate(`document.querySelector("[data-hotspot-id]").click()`);
    await cdp.waitForFunction(`!document.querySelector("#detailPanel").hidden`, 3000);
    const detailTitle = await cdp.evaluate(`document.querySelector(".detail-content h2").textContent.trim()`);
    assert.ok(detailTitle.length > 0);

    await saveScreenshot(cdp, path.join(artifactDir, "desktop-dist.png"));
    await cdp.close();
  } finally {
    await stopProcess(chrome);
    await close(server);
    await rmWithRetry(profileDir);
  }

  assertPngExists(path.join(artifactDir, "desktop-dist.png"));
  console.log("browser-dist.test.js passed");
}

function assertPngExists(filePath) {
  assert.ok(fs.existsSync(filePath), `${filePath} does not exist`);
  const buffer = fs.readFileSync(filePath);
  assert.ok(buffer.length > 50_000, `${filePath} is unexpectedly small`);
  assert.strictEqual(buffer.toString("hex", 0, 8), "89504e470d0a1a0a");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
