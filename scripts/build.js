"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");
const assetsDir = path.join(distDir, "assets");
const indexPath = path.join(rootDir, "index.html");

function main() {
  const html = readText(indexPath);
  const jsEntries = extractScriptEntries(html);
  const cssHref = extractStylesheetHref(html);

  const jsBuild = buildJavaScript(jsEntries);
  const cssBuild = buildCss(cssHref);

  resetDir(distDir);
  fs.mkdirSync(assetsDir, { recursive: true });

  const jsHash = hash(jsBuild.code);
  const cssHash = hash(cssBuild.code);
  const jsFile = `chatimage.${jsHash}.min.js`;
  const cssFile = `chatimage.${cssHash}.min.css`;

  writeText(path.join(assetsDir, jsFile), `${jsBuild.code}\n//# sourceMappingURL=${jsFile}.map\n`);
  writeJson(path.join(assetsDir, `${jsFile}.map`), {
    version: 3,
    file: jsFile,
    sources: jsBuild.sources,
    sourcesContent: jsBuild.sourcesContent,
    names: [],
    mappings: jsBuild.mappings
  });

  writeText(path.join(assetsDir, cssFile), `${cssBuild.code}\n/*# sourceMappingURL=${cssFile}.map */\n`);
  writeJson(path.join(assetsDir, `${cssFile}.map`), {
    version: 3,
    file: cssFile,
    sources: [cssHref],
    sourcesContent: [cssBuild.original],
    names: [],
    mappings: ""
  });

  writeText(
    path.join(distDir, "index.html"),
    rewriteHtml(html, {
      cssHref: `assets/${cssFile}`,
      jsHref: `assets/${jsFile}`
    })
  );
  copyStaticAssets();

  writeJson(path.join(distDir, "build-manifest.json"), {
    builtAt: new Date().toISOString(),
    scripts: jsEntries,
    stylesheet: cssHref,
    outputs: {
      html: "index.html",
      script: `assets/${jsFile}`,
      scriptMap: `assets/${jsFile}.map`,
      stylesheet: `assets/${cssFile}`,
      stylesheetMap: `assets/${cssFile}.map`
    }
  });

  console.log(`Built ChatImage to ${path.relative(rootDir, distDir)}`);
}

function copyStaticAssets() {
  const sourceAssetsDir = path.join(rootDir, "assets");
  if (!fs.existsSync(sourceAssetsDir)) return;
  copyDir(sourceAssetsDir, assetsDir);
}

function copyDir(sourceDir, targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      copyDir(sourcePath, targetPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}

function extractScriptEntries(html) {
  const entries = [];
  const pattern = /<script\s+src="([^"]+)"\s+defer><\/script>/g;
  let match = pattern.exec(html);
  while (match) {
    entries.push(match[1]);
    match = pattern.exec(html);
  }
  if (!entries.length) throw new Error("No deferred script entries found in index.html");
  return entries;
}

function extractStylesheetHref(html) {
  const match = html.match(/<link\s+rel="stylesheet"\s+href="([^"]+)"\s*\/>/);
  if (!match) throw new Error("No stylesheet link found in index.html");
  return match[1];
}

function buildJavaScript(entries) {
  const lines = [];
  const sourceLineRefs = [];
  const sourcesContent = [];

  entries.forEach((entry, sourceIndex) => {
    const source = readText(path.join(rootDir, entry));
    sourcesContent.push(source);
    const sourceLines = source.split(/\r?\n/);
    for (let index = 0; index < sourceLines.length; index += 1) {
      const line = sourceLines[index].trim();
      if (!line || line.startsWith("//")) continue;
      lines.push(line);
      sourceLineRefs.push({ sourceIndex, sourceLine: index });
    }
  });

  return {
    code: lines.join("\n"),
    sources: entries,
    sourcesContent,
    mappings: createLineMappings(sourceLineRefs)
  };
}

function buildCss(href) {
  const original = readText(path.join(rootDir, href));
  const code = original
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ")
    .replace(/\s*([{}:;,>])\s*/g, "$1")
    .replace(/;}/g, "}")
    .trim();
  return { code, original };
}

function rewriteHtml(html, { cssHref, jsHref }) {
  const rewritten = html
    .replace(/<link\s+rel="stylesheet"\s+href="[^"]+"\s*\/>/, `<link rel="stylesheet" href="${cssHref}" />`)
    .replace(/\s*<script\s+src="[^"]+"\s+defer><\/script>/g, "")
    .replace(/\s*<\/body>/, `\n    <script src="${jsHref}" defer></script>\n  </body>`);
  return minifyHtml(rewritten);
}

function minifyHtml(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/>\s+</g, "><")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function createLineMappings(lineRefs) {
  let previousSourceIndex = 0;
  let previousSourceLine = 0;
  let previousSourceColumn = 0;

  return lineRefs
    .map(({ sourceIndex, sourceLine }) => {
      const segment = encodeVlq(0);
      const sourceDelta = encodeVlq(sourceIndex - previousSourceIndex);
      const lineDelta = encodeVlq(sourceLine - previousSourceLine);
      const columnDelta = encodeVlq(0 - previousSourceColumn);
      previousSourceIndex = sourceIndex;
      previousSourceLine = sourceLine;
      previousSourceColumn = 0;
      return `${segment}${sourceDelta}${lineDelta}${columnDelta}`;
    })
    .join(";");
}

function encodeVlq(value) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let vlq = value < 0 ? ((-value) << 1) + 1 : value << 1;
  let encoded = "";
  do {
    let digit = vlq & 31;
    vlq >>>= 5;
    if (vlq > 0) digit |= 32;
    encoded += chars[digit];
  } while (vlq > 0);
  return encoded;
}

function hash(content) {
  return crypto.createHash("sha256").update(content).digest("hex").slice(0, 10);
}

function resetDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function writeText(filePath, content) {
  fs.writeFileSync(filePath, content, "utf8");
}

function writeJson(filePath, value) {
  writeText(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

if (require.main === module) {
  main();
}

module.exports = {
  buildCss,
  buildJavaScript,
  copyStaticAssets,
  createLineMappings,
  encodeVlq,
  minifyHtml,
  rewriteHtml
};
