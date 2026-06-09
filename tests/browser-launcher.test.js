"use strict";

const assert = require("assert");
const { getChromeCandidates } = require("./browser.test");

function main() {
  testEnvironmentPathFirst();
  testWindowsCandidates();
  testMacCandidates();
  testLinuxCandidates();
  console.log("browser-launcher.test.js passed");
}

function testEnvironmentPathFirst() {
  const candidates = getChromeCandidates({ CHATIMAGE_BROWSER_PATH: "/custom/chrome" }, "linux");
  assert.strictEqual(candidates[0], "/custom/chrome");
  assert.ok(candidates.includes("/usr/bin/chromium"));
}

function testWindowsCandidates() {
  const candidates = getChromeCandidates({}, "win32");
  assert.ok(candidates.some((candidate) => candidate.endsWith("msedge.exe")));
  assert.ok(candidates.some((candidate) => candidate.endsWith("chrome.exe")));
}

function testMacCandidates() {
  const candidates = getChromeCandidates({}, "darwin");
  assert.ok(candidates.some((candidate) => candidate.includes("Google Chrome.app")));
  assert.ok(candidates.some((candidate) => candidate.includes("Microsoft Edge.app")));
}

function testLinuxCandidates() {
  const candidates = getChromeCandidates({}, "linux");
  assert.ok(candidates.includes("/usr/bin/google-chrome"));
  assert.ok(candidates.includes("/usr/bin/chromium"));
}

main();
