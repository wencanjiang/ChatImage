(function initMockSvg(global) {
  "use strict";

  const core = global.ChatImageCore || (typeof require !== "undefined" ? require("./core") : null);
  const layoutModel = global.ChatImageLayout || (typeof require !== "undefined" ? require("./layout") : null);

  const escapeXml = (value) =>
    String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  const wrapText = (text, maxChars, maxLines) => {
    const source = String(text || "").trim();
    const lines = [];
    for (let cursor = 0; cursor < source.length && lines.length < maxLines; cursor += maxChars) {
      lines.push(source.slice(cursor, cursor + maxChars));
    }
    if (source.length > maxChars * maxLines && lines.length) {
      lines[lines.length - 1] = `${lines[lines.length - 1].slice(0, -1)}...`;
    }
    return lines.length ? lines : [""];
  };

  function renderSvg(spec, layout) {
    const width = layout.canvas.width;
    const height = layout.canvas.height;
    if (String(spec.visualMode || "").toLowerCase() === "map") {
      return renderMapSvg(spec, layout, width, height);
    }
    const interactiveModules = layoutModel && typeof layoutModel.getInteractiveModules === "function"
      ? layoutModel.getInteractiveModules(spec)
      : spec.modules;
    const moduleById = Object.fromEntries(interactiveModules.map((module) => [module.id, module]));
    const titleRegion = layout.regions.find((item) => item.role === "title");
    const summaryRegion = layout.regions.find((item) => item.role === "summary");
    const moduleRegions = layout.regions
      .filter((item) => item.hotspotId)
      .sort((a, b) => a.zIndex - b.zIndex);

    const accents = ["#0f766e", "#db6b4d", "#4078a0", "#c58b28", "#4f8f5a", "#8b5a3c"];
    const familyLabel = {
      grid: "Grid",
      flow: "Flow",
      compare: "Compare",
      hub: "Hub",
      timeline: "Timeline",
      matrix: "Matrix",
      freeform: "Freeform"
    }[layout.family];

    const cards = moduleRegions
      .map((region, index) => {
        const module = moduleById[region.hotspotId];
        if (!module) return "";
        const box = toPixels(region.bounds, width, height);
        const accent = accents[index % accents.length];
        const textBudget = module.textBudget || layoutModel.estimateRegionTextBudget(region, layout.canvas);
        const titleFont = clamp(Math.floor(box.width / 7.2), 21, 31);
        const bodyFont = clamp(Math.floor(box.width / 10.5), 16, 22);
        const titleLines = wrapText(module.title, textBudget.titleLineChars, textBudget.titleMaxLines);
        const bodyLines = wrapText(module.imageText, textBudget.imageTextLineChars, textBudget.imageTextMaxLines);
        const radius = region.shape === "circle" ? Math.min(box.width, box.height) / 2 : 26;
        const icon = core.iconGlyph(module.iconHint);
        const iconSize = clamp(Math.floor(box.width / 8), 22, 28);
        const iconR = clamp(Math.floor(box.width / 10), 22, 28);
        const iconX = box.x + clamp(Math.floor(box.width * 0.25), 44, 58);
        const iconY = box.y + 54;
        const titleX = box.x + clamp(Math.floor(box.width * 0.45), 86, 104);
        const bodyY = box.y + clamp(Math.floor(box.height * 0.56), 98, 136);
        const moduleIndex = spec.modules.findIndex((item) => item.id === region.hotspotId);
        const cardNumber = moduleIndex >= 0 ? String(moduleIndex + 1).padStart(2, "0") : "";
        const badgeW = 46;
        const badgeH = 28;
        const badgeX = box.x + box.width - badgeW - 18;
        const badgeY = box.y + 16;
        return `
          <rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="${radius}" fill="#fffefb" stroke="${accent}" stroke-opacity="0.55" stroke-width="2" filter="url(#ci-card-shadow)"/>
          <rect x="${box.x}" y="${box.y}" width="${box.width}" height="6" rx="3" fill="${accent}" opacity="0.85"/>
          ${
            cardNumber
              ? `<rect x="${badgeX}" y="${badgeY}" width="${badgeW}" height="${badgeH}" rx="9" fill="${accent}" opacity="0.14"/>
          <text x="${badgeX + badgeW / 2}" y="${badgeY + 20}" text-anchor="middle" font-size="17" font-weight="800" fill="${accent}">${cardNumber}</text>`
              : ""
          }
          <circle cx="${iconX}" cy="${iconY}" r="${iconR}" fill="${accent}" opacity="0.16" filter="url(#ci-soft-shadow)"/>
          <text x="${iconX}" y="${iconY + Math.round(iconSize * 0.35)}" text-anchor="middle" font-size="${iconSize}" font-weight="800" fill="${accent}">${icon}</text>
          ${renderTextLines(titleLines, titleX, box.y + 52, titleFont, titleFont + 4, "#1d2528", 800)}
          ${renderTextLines(bodyLines, box.x + 28, bodyY, bodyFont, bodyFont + 7, "#667176", 560)}
        `;
      })
      .join("");

    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
        <defs>
          <linearGradient id="ci-bg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#fbf7ef"/>
            <stop offset="1" stop-color="#efe9dd"/>
          </linearGradient>
          <radialGradient id="ci-glow" cx="0.5" cy="0.16" r="0.9">
            <stop offset="0" stop-color="#ffffff" stop-opacity="0.75"/>
            <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
          </radialGradient>
          <filter id="ci-card-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="10" stdDeviation="16" flood-color="#3b2e22" flood-opacity="0.12"/>
          </filter>
          <filter id="ci-soft-shadow" x="-40%" y="-40%" width="180%" height="180%">
            <feDropShadow dx="0" dy="4" stdDeviation="8" flood-color="#3b2e22" flood-opacity="0.10"/>
          </filter>
        </defs>
        <rect width="${width}" height="${height}" fill="url(#ci-bg)"/>
        <rect width="${width}" height="${height}" fill="url(#ci-glow)"/>
        <circle cx="${width - 120}" cy="120" r="220" fill="#e8efe8" opacity="0.5"/>
        <circle cx="140" cy="${height - 80}" r="180" fill="#f3e4da" opacity="0.5"/>
        <rect x="46" y="42" width="${width - 92}" height="${height - 84}" rx="34" fill="#ffffff" opacity="0.55" stroke="#e3dccd" stroke-width="1.5"/>
        ${renderTitle(spec, titleRegion, summaryRegion, width, height, familyLabel)}
        ${renderConnectors(layout, width, height)}
        ${cards}
        <text x="${width - 114}" y="${height - 78}" text-anchor="end" font-size="20" fill="#9a9082">ChatImage LayoutSpec</text>
      </svg>
    `;
  }

  function renderMapSvg(spec, layout, width, height) {
    const modules = layoutModel && typeof layoutModel.getInteractiveModules === "function"
      ? layoutModel.getInteractiveModules(spec)
      : spec.modules;
    const moduleById = Object.fromEntries(modules.map((module) => [module.id, module]));
    const moduleRegions = layout.regions.filter((item) => item.hotspotId);
    const labelFor = (region) => {
      const module = moduleById[region.hotspotId] || {};
      const box = toPixels(region.bounds, width, height);
      return `<text x="${box.x + box.width / 2}" y="${box.y + box.height / 2 + 8}" text-anchor="middle" font-size="26" font-weight="760" fill="#35504a">${escapeXml(module.title || "")}</text>`;
    };
    const labels = moduleRegions.map(labelFor).join("");
    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
        <defs>
          <filter id="paper-shadow" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="12" stdDeviation="18" flood-color="#4d3a26" flood-opacity="0.14"/>
          </filter>
        </defs>
        <rect width="${width}" height="${height}" fill="#f5ead5"/>
        <path d="M70 70 C260 30 380 105 520 74 C760 20 930 80 1110 56 C1280 36 1410 80 1530 62 L1548 832 C1340 872 1180 816 1010 850 C760 906 610 824 430 852 C260 880 150 836 62 858 Z" fill="#fff8e7" stroke="#c9b68c" stroke-width="3" filter="url(#paper-shadow)"/>
        <path d="M465 250 C620 155 870 170 990 300 C1100 422 1032 593 850 626 C676 658 474 604 390 480 C320 375 350 302 465 250 Z" fill="#9ec8c4" stroke="#477f79" stroke-width="6" opacity="0.92"/>
        <path d="M360 260 C520 230 640 226 810 250" fill="none" stroke="#927642" stroke-width="18" stroke-linecap="round" opacity="0.55"/>
        <path d="M285 330 C320 430 302 526 278 640" fill="none" stroke="#8a7c48" stroke-width="18" stroke-linecap="round" opacity="0.55"/>
        <ellipse cx="1140" cy="680" rx="105" ry="70" fill="#d7b46a" stroke="#8d6d2f" stroke-width="5"/>
        <path d="M1120 626 L1168 626 L1155 540 L1132 540 Z" fill="#b85d45" stroke="#7f372a" stroke-width="4"/>
        <ellipse cx="1180" cy="780" rx="160" ry="52" fill="#b7bf78" opacity="0.75"/>
        <circle cx="1170" cy="760" r="12" fill="#cf6b8a"/><circle cx="1210" cy="782" r="10" fill="#cf6b8a"/><circle cx="1128" cy="788" r="9" fill="#cf6b8a"/>
        <ellipse cx="1120" cy="250" rx="170" ry="58" fill="#b7c28c" opacity="0.82"/>
        <path d="M1010 255 C1050 205 1100 198 1142 248 C1190 210 1250 218 1290 266" fill="none" stroke="#71815d" stroke-width="12" stroke-linecap="round" opacity="0.65"/>
        <ellipse cx="750" cy="474" rx="80" ry="54" fill="#e5d8a2" stroke="#9c8551" stroke-width="4"/>
        <circle cx="720" cy="455" r="8" fill="#8b6f36"/><circle cx="760" cy="447" r="8" fill="#8b6f36"/><circle cx="790" cy="476" r="8" fill="#8b6f36"/>
        <path d="M450 690 C560 718 690 704 790 724" fill="none" stroke="#4f897e" stroke-width="4" opacity="0.5"/>
        <text x="112" y="124" font-size="44" font-weight="820" fill="#44554d">${escapeXml(spec.title)}</text>
        <text x="112" y="174" font-size="24" font-weight="540" fill="#6f715f">${escapeXml(spec.summary || "")}</text>
        ${labels}
      </svg>
    `;
  }

  function renderTitle(spec, titleRegion, summaryRegion, width, height, familyLabel) {
    const titleBox = toPixels(titleRegion.bounds, width, height);
    const summaryBox = toPixels(summaryRegion.bounds, width, height);
    return `
      <text x="${titleBox.x}" y="${titleBox.y + 52}" font-size="46" font-weight="840" fill="#1d2528">${escapeXml(spec.title)}</text>
      <text x="${summaryBox.x}" y="${summaryBox.y + 40}" font-size="27" font-weight="520" fill="#667176">${escapeXml(spec.summary)}</text>
      <rect x="1270" y="72" width="210" height="54" rx="27" fill="#d9f0eb" stroke="#0f766e" stroke-width="2"/>
      <text x="1375" y="108" text-anchor="middle" font-size="23" font-weight="760" fill="#0b5f59">${familyLabel}</text>
    `;
  }

  function renderConnectors(layout, width, height) {
    if (layout.family !== "hub" && layout.family !== "flow" && layout.family !== "timeline") return "";
    const moduleRegions = layout.regions.filter((item) => item.role === "module");
    if (layout.family === "flow" || layout.family === "timeline") {
      return moduleRegions
        .slice(0, -1)
        .map((region, index) => {
          const a = center(region.bounds, width, height);
          const b = center(moduleRegions[index + 1].bounds, width, height);
          return `<path d="M${a.x} ${a.y}L${b.x} ${b.y}" stroke="#0f766e" stroke-width="5" stroke-linecap="round" opacity="0.30"/>`;
        })
        .join("");
    }
    const centerRegion = moduleRegions[0];
    if (!centerRegion) return "";
    const hub = center(centerRegion.bounds, width, height);
    return moduleRegions
      .slice(1)
      .map((region) => {
        const point = center(region.bounds, width, height);
        return `<path d="M${hub.x} ${hub.y}L${point.x} ${point.y}" stroke="#0f766e" stroke-width="4" stroke-linecap="round" opacity="0.24"/>`;
      })
      .join("");
  }

  function renderTextLines(lines, x, y, size, lineHeight, fill, weight) {
    return lines
      .map(
        (line, index) =>
          `<text x="${x}" y="${y + index * lineHeight}" font-size="${size}" font-weight="${weight}" fill="${fill}">${escapeXml(line)}</text>`
      )
      .join("");
  }

  function toPixels(bounds, width, height) {
    return {
      x: Math.round(bounds.x * width),
      y: Math.round(bounds.y * height),
      width: Math.round(bounds.width * width),
      height: Math.round(bounds.height * height)
    };
  }

  function center(bounds, width, height) {
    const box = toPixels(bounds, width, height);
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }

  const api = { renderSvg };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  global.ChatImageMockSvg = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
