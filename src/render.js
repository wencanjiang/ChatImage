(function initRender(global) {
  "use strict";

  const qualityModel =
    global.ChatImageQuality ||
    (typeof require !== "undefined" && typeof module !== "undefined" && module.exports
      ? require("./quality")
      : null);
  const calibrationModel =
    global.ChatImageCalibration ||
    (typeof require !== "undefined" && typeof module !== "undefined" && module.exports
      ? require("./calibration")
      : null);
  const threadModel =
    global.ChatImageThread ||
    (typeof require !== "undefined" && typeof module !== "undefined" && module.exports
      ? require("./thread")
      : null);

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function renderResult(result, options = {}) {
    return `
      <div class="result-header">
        <div>
          <h2>${escapeHtml(result.title)}</h2>
          <p>${escapeHtml(result.summary)}</p>
        </div>
        <div class="result-actions">
          <button class="tool-button result-icon-button" type="button" id="zoomButton" aria-label="查看大图" title="查看大图">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
              <circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2" />
              <path d="M16.5 16.5L21 21" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            </svg>
          </button>
          <button class="tool-button result-icon-button" type="button" id="saveButton" aria-label="保存图片" title="保存图片">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
              <path d="M12 4v10M7.5 9.5L12 14l4.5-4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              <path d="M5 19h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            </svg>
          </button>
        </div>
      </div>
      ${renderImageFrame(result, options)}
      ${renderAlignmentNotice(result)}
      <div class="image-hint">点击图片中的模块查看详情，并在弹出的区域面板中继续追问。</div>
      ${renderGenerationProcess(result, { interactive: Boolean((result.hotspots || []).length) })}
      ${renderDebugPanel(result)}
    `;
  }

  function renderImageFrame(result, options = {}) {
    const dimensions = getImageDimensions(result);
    const selectedHotspotId = options.selectedHotspotId || "";
    const sourceByHotspotId = buildAlignmentSourceByHotspotId(result);
    const hotspots = (result.hotspots || [])
      .map(
        (hotspot) => {
          const sourceLabel = formatAlignmentSource(sourceByHotspotId.get(hotspot.id));
          return `
          <button
            class="hotspot${hotspot.id === selectedHotspotId ? " is-selected" : ""}"
            type="button"
            data-hotspot-id="${escapeHtml(hotspot.id)}"
            data-alignment-source="${escapeHtml(sourceLabel)}"
            data-calibration-label="${escapeHtml(`${hotspot.label} / ${sourceLabel}`)}"
            aria-label="${escapeHtml(hotspot.label)}"
            aria-pressed="${hotspot.id === selectedHotspotId ? "true" : "false"}"
            style="left:${hotspot.x * 100}%;top:${hotspot.y * 100}%;width:${hotspot.width * 100}%;height:${hotspot.height * 100}%"
          ></button>
        `;
        }
      )
      .join("");
    return `
      <div class="image-frame">
        <div class="image-stage" style="--fallback-aspect-ratio:${dimensions.width} / ${dimensions.height}">
          <img src="${escapeHtml(result.imageUrl)}" alt="${escapeHtml(result.title)}" width="${dimensions.width}" height="${dimensions.height}" />
          ${hotspots}
        </div>
      </div>
    `;
  }

  function renderAlignmentNotice(result) {
    const raw = (result && result.alignmentRaw) || {};
    const provider = String(raw.provider || "");
    const layoutProvider = String(raw.layoutProvider || "");
    const fallbackCount = Array.isArray(raw.fallbackModules) ? raw.fallbackModules.length : 0;
    const rejectedCount = Array.isArray(raw.rejectedModules) ? raw.rejectedModules.length : 0;
    const total = fallbackCount + rejectedCount;
    if (!provider || provider === "mock-alignment") return "";
    if (provider === "alignment-fallback") {
      return `
        <div class="alignment-notice fail" role="status">
          <strong>视觉对齐已回退</strong>
          <span>${escapeHtml(raw.error || "LocateAnything/视觉定位结果没有通过布局校验，当前使用规划热点。")}</span>
        </div>
      `;
    }
    if (layoutProvider === "vision-fallback") {
      return `
        <div class="alignment-notice warn" role="status">
          <strong>热点使用规划回退</strong>
          <span>视觉模型返回的候选框存在重叠或越界，已保留诊断并使用规划布局。</span>
        </div>
      `;
    }
    if (layoutProvider === "planned-fallback" || raw.effectiveProvider === "planned") {
      return `
        <div class="alignment-notice fail" role="status">
          <strong>热点使用规划回退</strong>
          <span>LocateAnything/local-ocr 未能产生可采用的模块边界，当前点击区使用 LayoutSpec 规划坐标。</span>
        </div>
      `;
    }
    if (layoutProvider === "vision-mixed") {
      return `
        <div class="alignment-notice warn" role="status">
          <strong>部分热点已回退</strong>
          <span>部分区域使用视觉定位，部分使用规划坐标，校准模式可查看来源。</span>
        </div>
      `;
    }
    if (total > 0) {
      return `
        <div class="alignment-notice warn" role="status">
          <strong>部分热点已回退</strong>
          <span>${escapeHtml(provider)} 有 ${total} 个模块未采用视觉定位，校准模式可查看来源。</span>
        </div>
      `;
    }
    return "";
  }

  function getImageDimensions(result) {
    const width = Number(result && result.imageWidth);
    const height = Number(result && result.imageHeight);
    if (Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0) {
      return { width, height };
    }
    return { width: 1600, height: 900 };
  }

  function buildAlignmentSourceByHotspotId(result) {
    const sourceByHotspotId = new Map();
    const regions = Array.isArray(result && result.layout && result.layout.regions) ? result.layout.regions : [];
    for (const region of regions) {
      if (region && region.hotspotId) sourceByHotspotId.set(region.hotspotId, region.alignedBy || "planned");
    }
    const diagnostics =
      result && result.alignmentRaw && result.alignmentRaw.displayDiagnostics
        ? result.alignmentRaw.displayDiagnostics.moduleRegions
        : [];
    for (const region of Array.isArray(diagnostics) ? diagnostics : []) {
      if (region && region.hotspotId) sourceByHotspotId.set(region.hotspotId, region.alignedBy || "planned");
    }
    return sourceByHotspotId;
  }

  function formatAlignmentSource(source) {
    const value = String(source || "planned").toLowerCase();
    if (value.includes("locate")) return "LocateAnything";
    if (value.includes("local-ocr")) return "local-ocr";
    if (value.includes("vision")) return "remote vision";
    if (value.includes("manual")) return "manual";
    if (value.includes("mock")) return "mock";
    return "planned";
  }

  function renderDetail({ hotspot, messages, pending, error, preview }) {
    return `
      <div class="detail-content">
        <div class="detail-header">
          <div>
            <div class="detail-kicker">当前区域</div>
            <h2>${escapeHtml(hotspot.label)}</h2>
          </div>
          <button class="icon-button detail-close" type="button" id="closeDetailButton" aria-label="关闭" title="关闭">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            </svg>
          </button>
        </div>
        <div class="detail-overview">
          ${renderHotspotPreview(preview)}
          ${renderDetailSummary(hotspot)}
        </div>
        <div class="thread" id="threadList">
          ${renderMessages(messages)}
          ${
            pending
              ? `<div class="message assistant pending"><span class="typing-dots" aria-hidden="true"><i></i><i></i><i></i></span>正在基于当前区域生成回答</div>`
              : ""
          }
        </div>
        ${
          error
            ? `<div class="followup-error" role="alert">
                <div>追问失败：${escapeHtml(error.message)}</div>
                <button class="ghost-button compact" type="button" id="retryFollowupButton">重试</button>
              </div>`
            : ""
        }
        <form class="followup-form" id="followupForm">
          <div class="followup-field">
            <textarea id="followupInput" rows="1" placeholder="围绕“${escapeHtml(
              hotspot.label
            )}”继续追问"></textarea>
            <button class="send-button" type="submit" aria-label="追问" title="追问（Enter 发送，Shift+Enter 换行）" ${
              pending ? "disabled" : ""
            }>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
                <path d="M12 19V5M5 12l7-7 7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>
          </div>
        </form>
      </div>
    `;
  }

  function renderDetailSummary(hotspot) {
    const paragraphs = splitDetailParagraphs(hotspot.detail);
    const body = paragraphs.length
      ? paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")
      : `<p>${escapeHtml(hotspot.shortText || "")}</p>`;
    return `
      <section class="detail-summary" aria-label="区域详解">
        <div class="detail-summary-label">区域详解</div>
        ${body}
      </section>
    `;
  }

  function splitDetailParagraphs(value) {
    const source = String(value || "").trim();
    if (!source) return [];
    const explicit = source
      .split(/\n+/)
      .map((item) => item.trim())
      .filter(Boolean);
    if (explicit.length > 1) return explicit.slice(0, 4);
    const sentences = source.match(/[^。！？!?]+[。！？!?]?/g) || [source];
    const paragraphs = [];
    let buffer = "";
    for (const sentence of sentences.map((item) => item.trim()).filter(Boolean)) {
      if (buffer && `${buffer}${sentence}`.length > 130) {
        paragraphs.push(buffer);
        buffer = sentence;
      } else {
        buffer += sentence;
      }
    }
    if (buffer) paragraphs.push(buffer);
    return paragraphs.slice(0, 4);
  }

  function renderHotspotPreview(preview) {
    if (!preview || !preview.imageUrl || !preview.crop) return "";
    const crop = preview.crop;
    const aspectRatio = Number(preview.aspectRatio || 1.5);
    const style = [
      `--crop-x:${Number(crop.x || 0).toFixed(5)}`,
      `--crop-y:${Number(crop.y || 0).toFixed(5)}`,
      `--crop-w:${Number(crop.width || 1).toFixed(5)}`,
      `--crop-h:${Number(crop.height || 1).toFixed(5)}`,
      `aspect-ratio:${aspectRatio.toFixed(4)}`
    ].join(";");
    return `
      <figure class="detail-preview" aria-label="当前热点区域图像">
        <div class="detail-preview-crop" style="${style}">
          <img src="${escapeHtml(preview.imageUrl)}" alt="${escapeHtml(preview.alt || "当前热点区域图像")}" />
        </div>
        <figcaption>${escapeHtml(preview.caption || "热点区域预览")}</figcaption>
      </figure>
    `;
  }

  function renderMessages(messages) {
    return messages.length
      ? messages
          .map((message) => renderMessage(message))
          .join("")
      : "";
  }

  function renderMessage(message) {
    const role = message && message.role ? message.role : "assistant";
    const artifact =
      role === "assistant" && threadModel && threadModel.parseFollowupArtifact
        ? threadModel.parseFollowupArtifact(message.content)
        : null;
    if (artifact) return renderFollowupArtifactMessage(artifact);
    return `<div class="message ${escapeHtml(role)}">${escapeHtml(message.content)}</div>`;
  }

  function renderFollowupArtifactMessage(artifact) {
    const dimensions = getImageDimensions(artifact);
    return `
      <article class="message assistant followup-artifact">
        <div class="followup-artifact-head">
          <div>
            <div class="followup-artifact-kicker">静态追问图</div>
            <h3>${escapeHtml(artifact.title || "追问结果")}</h3>
            <p>${escapeHtml(artifact.summary || artifact.question || "")}</p>
          </div>
          <span class="noninteractive-badge">不可交互</span>
        </div>
        <div class="followup-artifact-image" style="aspect-ratio:${dimensions.width} / ${dimensions.height}">
          <img src="${escapeHtml(artifact.imageUrl || "")}" alt="${escapeHtml(artifact.title || "追问结果")}" width="${dimensions.width}" height="${dimensions.height}" />
        </div>
        ${renderGenerationProcess(artifact, { interactive: false })}
      </article>
    `;
  }

  function renderGenerationProcess(result, options = {}) {
    const processItems = buildGenerationProcessItems(result, options);
    return `
      <details class="thought-process" open>
        <summary>思考过程</summary>
        <section>
          <h4>原文本回答</h4>
          <pre>${escapeHtml(result.rawAnswer || "")}</pre>
        </section>
        <section>
          <h4>生成流程</h4>
          <ol>
            ${processItems
              .map(
                (item) => `
                  <li>
                    <strong>${escapeHtml(item.label || "")}</strong>
                    <span>${escapeHtml(item.detail || "")}</span>
                  </li>
                `
              )
              .join("")}
          </ol>
        </section>
        ${renderProcessArtifacts(result)}
      </details>
    `;
  }

  function buildGenerationProcessItems(result, options = {}) {
    if (Array.isArray(result.process) && result.process.length) return result.process;
    const modules = Array.isArray(result.structuredSpec && result.structuredSpec.modules)
      ? result.structuredSpec.modules
      : [];
    const visualMode = String((result.structuredSpec && result.structuredSpec.visualMode) || "infographic").toLowerCase();
    const areaLabel = visualMode === "infographic" ? "视觉模块" : "视觉区域";
    const sourceLabel = visualMode === "infographic" ? "信息图" : "视觉作品";
    const layoutFamily = result.layout && result.layout.family ? result.layout.family : "默认";
    return [
      { label: "生成文本回答", detail: `先根据用户问题生成完整文本答案，作为${sourceLabel}的内容来源。` },
      {
        label: "结构化解析",
        detail: modules.length ? `将文本拆成标题、摘要和 ${modules.length} 个${areaLabel}。` : `将文本拆成标题、摘要和${areaLabel}。`
      },
      { label: "规划版式", detail: `选择 ${layoutFamily} 版式并计算图片区域。` },
      { label: "生成图片", detail: "根据结构化内容、版式和视觉提示词生成最终图片。" },
      options.interactive
        ? { label: "热点对齐", detail: `把透明点击区域绑定到图片${areaLabel}，支持点击查看详情和区域追问。` }
        : { label: "静态输出", detail: "本次结果不添加可点击热点，避免继续产生新的交互分支。" }
    ];
  }

  function renderProcessArtifacts(result) {
    const modules = Array.isArray(result.structuredSpec && result.structuredSpec.modules)
      ? result.structuredSpec.modules
      : [];
    const prompt = result.imagePrompt || "";
    if (!modules.length && !prompt) return "";
    return `
      <section class="process-artifacts">
        <h4>生成产物</h4>
        ${
          modules.length
            ? `<div class="process-modules">${modules
                .slice(0, 6)
                .map((module, index) => `<span>${escapeHtml(module.title || module.id || `模块 ${index + 1}`)}</span>`)
                .join("")}</div>`
            : ""
        }
        ${prompt ? `<pre>${escapeHtml(prompt)}</pre>` : ""}
      </section>
    `;
  }

  function renderDebugPanel(result) {
    const structured = result.structuredSpec || buildStructuredFallback(result);
    return `
      <section class="debug-panel" aria-label="开发调试信息">
        <details open>
          <summary>开发调试信息</summary>
          ${renderQualityReport(qualityModel.buildQualityReport(result))}
          ${renderCalibrationComparison(result)}
          <section class="calibration-tools" aria-label="热点校准工具">
            <div>
              <h3>热点校准</h3>
              <p>默认热点层完全透明；打开校准显示后，只在开发态叠加边框，方便核对图片模块和热点 bounds 是否一致。</p>
            </div>
            <div class="calibration-actions">
              <button class="ghost-button compact" type="button" data-toggle-hotspot-calibration>显示热点边界</button>
              <button class="ghost-button compact" type="button" data-apply-hotspot-calibration>应用热点坐标</button>
            </div>
          </section>
          <textarea class="calibration-input" data-calibration-input rows="8" spellcheck="false">${escapeHtml(
            JSON.stringify(buildHotspotCalibrationData(result), null, 2)
          )}</textarea>
          <div class="debug-grid">
            <section>
              <h3>原始文本回答</h3>
              <pre>${escapeHtml(result.rawAnswer)}</pre>
            </section>
            <section>
              <h3>结构化解析成果</h3>
              <pre>${escapeHtml(JSON.stringify(structured, null, 2))}</pre>
            </section>
            <section>
              <h3>布局 LayoutSpec</h3>
              <pre>${escapeHtml(JSON.stringify(result.layout, null, 2))}</pre>
            </section>
            <section>
              <h3>生图提示词</h3>
              <pre>${escapeHtml(result.imagePrompt || "")}</pre>
            </section>
            <section>
              <h3>上游生图返回</h3>
              <pre>${escapeHtml(JSON.stringify(result.providerRaw || null, null, 2))}</pre>
            </section>
            <section>
              <h3>视觉对齐返回</h3>
              <pre>${escapeHtml(JSON.stringify(result.alignmentRaw || null, null, 2))}</pre>
            </section>
            <section>
              <h3>热点校准数据</h3>
              <pre>${escapeHtml(JSON.stringify(buildHotspotCalibrationData(result), null, 2))}</pre>
            </section>
          </div>
        </details>
      </section>
    `;
  }

  function buildHotspotCalibrationData(result) {
    return (result.hotspots || []).map((hotspot) => ({
      id: hotspot.id,
      label: hotspot.label,
      bounds: {
        x: Number(hotspot.x),
        y: Number(hotspot.y),
        width: Number(hotspot.width),
        height: Number(hotspot.height)
      }
    }));
  }

  function buildStructuredFallback(result) {
    return {
      title: result.title,
      summary: result.summary,
      hotspots: result.hotspots.map((hotspot) => ({
        id: hotspot.id,
        label: hotspot.label,
        shortText: hotspot.shortText,
        detail: hotspot.detail,
        sourceExcerpt: hotspot.sourceExcerpt,
        iconHint: hotspot.iconHint,
        textBudget: hotspot.textBudget || null
      }))
    };
  }

  function renderQualityReport(report) {
    const checks = report.checks
      .map(
        (check) => `
          <li class="quality-check ${escapeHtml(check.status)}">
            <span class="quality-status">${escapeHtml(formatQualityStatus(check.status))}</span>
            <span class="quality-label">${escapeHtml(check.label)}</span>
            <span class="quality-detail">${escapeHtml(check.detail)}</span>
          </li>
        `
      )
      .join("");
    return `
      <section class="quality-report" aria-label="质量检查">
        <div class="quality-report-head">
          <h3>质量检查</h3>
          <span class="quality-score ${escapeHtml(report.status)}">${escapeHtml(formatQualityStatus(report.status))} ${report.score}</span>
        </div>
        <div class="quality-summary">${escapeHtml(report.summary || "")}</div>
        <ul>${checks}</ul>
        ${
          report.canRegenerate
            ? `<button class="ghost-button compact quality-retry" type="button" data-retry-quality>按当前问题重新生成</button>`
            : ""
        }
      </section>
    `;
  }

  function renderCalibrationComparison(result) {
    const report = calibrationModel && calibrationModel.buildCalibrationComparison
      ? calibrationModel.buildCalibrationComparison(result)
      : { available: false, status: "none", summary: "热点校准误差评估模块不可用。" };
    return `
      <section class="calibration-report" aria-label="校准误差评估">
        <div class="quality-report-head">
          <h3>校准误差评估</h3>
          <span class="quality-score ${escapeHtml(report.status || "none")}">${escapeHtml(formatQualityStatus(report.status || "none"))}</span>
        </div>
        <div class="quality-summary">${escapeHtml(report.summary || "")}</div>
        <pre>${escapeHtml(JSON.stringify(report, null, 2))}</pre>
      </section>
    `;
  }

  function formatQualityStatus(status) {
    return {
      ok: "通过",
      warn: "注意",
      fail: "失败"
    }[status] || "无数据";
  }

  function renderHistoryList(items, activeId, options = {}) {
    const now = options.now === undefined ? Date.now() : options.now;
    return items
      .slice(0, 6)
      .map(
        (item) => {
          const title = item.title || item.question || "未命名对话";
          const time = formatHistoryTime(item.updatedAt || item.createdAt || item.pinnedAt, now);
          return `
          <div class="history-item${item.id === activeId ? " is-active" : ""}${item.pinnedAt ? " is-pinned" : ""}" aria-current="${item.id === activeId ? "true" : "false"}">
            <button class="history-item-main" type="button" data-history-id="${escapeHtml(item.id)}">
              <span class="history-item-title">${escapeHtml(title)}</span>
              <span class="history-item-time">${escapeHtml(time)}</span>
            </button>
            <span class="history-item-actions" aria-label="历史记录操作">
              <button class="history-action-button" type="button" data-history-pin="${escapeHtml(item.id)}" data-history-pinned="${item.pinnedAt ? "true" : "false"}" aria-label="${item.pinnedAt ? "取消置顶" : "置顶"}" title="${item.pinnedAt ? "取消置顶" : "置顶"}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
                  <path d="M8 4h8l-1 6 4 4v2h-6v5h-2v-5H5v-2l4-4-1-6z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" />
                </svg>
              </button>
              <button class="history-action-button" type="button" data-history-rename="${escapeHtml(item.id)}" data-history-title="${escapeHtml(item.title || item.question || "")}" aria-label="重命名" title="重命名">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
                  <path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" />
                  <path d="M14 7l3 3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
                </svg>
              </button>
              <button class="history-action-button danger" type="button" data-history-delete="${escapeHtml(item.id)}" aria-label="删除" title="删除">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
                  <path d="M5 7h14M10 11v6M14 11v6M8 7l1-3h6l1 3M7 7l1 14h8l1-14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </button>
            </span>
          </div>
        `;
        }
      )
      .join("");
  }

  function formatHistoryTime(value, nowValue) {
    if (!value) return "";
    const timestamp = new Date(value).getTime();
    const now = nowValue instanceof Date ? nowValue.getTime() : Number(nowValue);
    if (!Number.isFinite(timestamp) || !Number.isFinite(now)) return "";
    const diffMs = Math.max(0, now - timestamp);
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;
    const month = 30 * day;
    const year = 365 * day;
    if (diffMs < minute) return "刚刚";
    if (diffMs < hour) return `${Math.max(1, Math.floor(diffMs / minute))} 分钟`;
    if (diffMs < day) return `${Math.max(1, Math.floor(diffMs / hour))} 小时`;
    if (diffMs < month) return `${Math.max(1, Math.floor(diffMs / day))} 天`;
    if (diffMs < year) return `${Math.max(1, Math.floor(diffMs / month))} 个月`;
    return `${Math.max(1, Math.floor(diffMs / year))} 年`;
  }

  function renderHistoryRestoreError(message, chatImageId, options = {}) {
    const title = options.title || "恢复失败";
    const retryLabel = options.retryLabel || "重试";
    return `
      <div class="history-restore-error" role="alert" data-history-error>
        <div>
          <strong>${escapeHtml(title)}</strong>
          <span>${escapeHtml(message || "无法恢复这条历史记录")}</span>
        </div>
        <button class="ghost-button compact" type="button" data-retry-history-id="${escapeHtml(chatImageId)}">${escapeHtml(retryLabel)}</button>
      </div>
    `;
  }

  function renderGeneratingState() {
    return `
      <div class="empty-state">
        <h1>正在生成</h1>
        <p>正在依次模拟 LLM 回答、结构化解析、LayoutSpec 规划和生图接口。</p>
      </div>
    `;
  }

  function renderErrorState(message, partialResult) {
    const partial = partialResult
      ? `
        <div class="partial-debug-result">
          <h2>Image generated, hotspot alignment failed</h2>
          <p>The generated image is kept for debugging. No clickable hotspots were saved.</p>
          ${renderResult(partialResult)}
        </div>
      `
      : "";
    return `
      <div class="empty-state">
        <h1>生成失败</h1>
        <p>${escapeHtml(message)}</p>
        <button class="primary-button retry-button" type="button" id="retryButton">重试</button>
      </div>
      ${partial}
    `;
  }

  function renderImageLoadError() {
    return `
      <div class="image-load-error" role="alert">
        <div>
          <strong>图片加载失败</strong>
          <span>当前图片地址无法显示，可以重新生成。</span>
        </div>
        <button class="ghost-button compact" type="button" data-retry-image>重试生成</button>
      </div>
    `;
  }

  const api = {
    escapeHtml,
    buildHotspotCalibrationData,
    buildStructuredFallback,
    formatHistoryTime,
    getImageDimensions,
    renderCalibrationComparison,
    renderQualityReport,
    renderDebugPanel,
    renderDetail,
    renderDetailSummary,
    renderHotspotPreview,
    renderErrorState,
    renderGeneratingState,
    renderGenerationProcess,
    renderHistoryList,
    renderHistoryRestoreError,
    renderImageFrame,
    renderImageLoadError,
    renderMessage,
    renderMessages,
    renderResult
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  global.ChatImageRender = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
