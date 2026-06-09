"use strict";

const assert = require("assert");
const {
  buildStructuredFallback,
  buildHotspotCalibrationData,
  escapeHtml,
  formatHistoryTime,
  getImageDimensions,
  renderDetail,
  renderErrorState,
  renderGeneratingState,
  renderGenerationProcess,
  renderHistoryList,
  renderHistoryRestoreError,
  renderHotspotPreview,
  renderCalibrationComparison,
  renderImageFrame,
  renderImageLoadError,
  renderMessages,
  renderResult
} = require("../src/render");

function createResult() {
  return {
    title: "标题<script>",
    summary: "摘要 & 说明",
    rawAnswer: "原始<script>回答",
    structuredSpec: {
      title: "结构化标题<script>",
      summary: "结构化摘要",
      relationType: "grid",
      modules: [{ id: "module_1", title: "模块", imageText: "图中文字", sourceExcerpt: "来源" }]
    },
    imageUrl: "data:image/svg+xml,test",
    imageWidth: 1600,
    imageHeight: 900,
    imagePrompt: "Prompt <keep>",
    providerRaw: { provider: "test<script>" },
    alignmentRaw: { provider: "align<script>" },
    layout: { family: "grid", regions: [] },
    hotspots: [
      {
        id: "module_1",
        label: "目标<script>",
        shortText: "短文本",
        detail: "详情<script>",
        sourceExcerpt: "片段<script>",
        iconHint: "target",
        x: 0.1,
        y: 0.2,
        width: 0.3,
        height: 0.4
      }
    ]
  };
}

function main() {
  assert.strictEqual(escapeHtml(`<tag a="1">&'`), "&lt;tag a=&quot;1&quot;&gt;&amp;&#039;");

  const resultHtml = renderResult(createResult());
  assert.match(resultHtml, /result-header/);
  assert.match(resultHtml, /debug-panel/);
  assert.match(resultHtml, /质量检查/);
  assert.match(resultHtml, /结构化标题&lt;script&gt;/);
  assert.match(resultHtml, /上游生图返回/);
  assert.match(resultHtml, /test&lt;script&gt;/);
  assert.match(resultHtml, /视觉对齐返回/);
  assert.match(resultHtml, /align&lt;script&gt;/);
  assert.match(resultHtml, /quality-report/);
  assert.match(resultHtml, /校准误差评估/);
  assert.match(resultHtml, /按当前问题重新生成/);
  assert.match(resultHtml, /data-retry-quality/);
  assert.match(resultHtml, /热点校准/);
  assert.match(resultHtml, /data-toggle-hotspot-calibration/);
  assert.match(resultHtml, /data-apply-hotspot-calibration/);
  assert.match(resultHtml, /data-calibration-input/);
  assert.match(resultHtml, /热点校准数据/);
  assert.match(resultHtml, /思考过程/);
  assert.match(resultHtml, /原文本回答/);
  assert.match(resultHtml, /生成流程/);
  assert.match(resultHtml, /热点对齐/);
  assert.match(resultHtml, /Prompt &lt;keep&gt;/);
  assert.match(renderGenerationProcess({ ...createResult(), hotspots: [] }, { interactive: false }), /静态输出/);
  assert.match(renderCalibrationComparison(createResult()), /当前结果不是手动校准结果/);
  assert.match(resultHtml, /data-hotspot-id="module_1"/);
  assert.match(resultHtml, /left:10%;top:20%;width:30%;height:40%/);
  assert.match(resultHtml, /标题&lt;script&gt;/);
  assert.doesNotMatch(resultHtml, /标题<script>/);
  assert.doesNotMatch(resultHtml, /module-label/);

  const fallbackHtml = renderResult({
    ...createResult(),
    alignmentRaw: {
      provider: "alignment-fallback",
      fallback: "planned-layout",
      error: "region_module_1 overlaps region_module_2"
    }
  });
  assert.match(fallbackHtml, /alignment-notice fail/);
  assert.match(fallbackHtml, /region_module_1 overlaps region_module_2/);

  const frameHtml = renderImageFrame(createResult());
  assert.match(frameHtml, /class="hotspot"/);
  assert.match(frameHtml, /aria-label="目标&lt;script&gt;"/);

  assert.match(frameHtml, /--fallback-aspect-ratio:1600 \/ 900/);
  assert.match(frameHtml, /width="1600" height="900"/);
  assert.deepStrictEqual(getImageDimensions({ imageWidth: 1200, imageHeight: 800 }), { width: 1200, height: 800 });
  assert.deepStrictEqual(getImageDimensions({ imageWidth: 0, imageHeight: 0 }), { width: 1600, height: 900 });

  const fallback = buildStructuredFallback({ ...createResult(), structuredSpec: undefined });
  assert.strictEqual(fallback.hotspots[0].sourceExcerpt, "片段<script>");
  assert.deepStrictEqual(buildHotspotCalibrationData(createResult()), [
    {
      id: "module_1",
      label: "目标<script>",
      bounds: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 }
    }
  ]);

  const loadErrorHtml = renderImageLoadError();
  assert.match(loadErrorHtml, /class="image-load-error"/);
  assert.match(loadErrorHtml, /data-retry-image/);

  const detailHtml = renderDetail({
    hotspot: createResult().hotspots[0],
    messages: [{ role: "user", content: "追问<script>" }],
    pending: true,
    error: { message: "followup failed <script>", retryQuestion: "retry me" },
    preview: {
      imageUrl: "data:image/svg+xml,test",
      alt: "目标<script> 区域图像",
      caption: "热点区域预览",
      aspectRatio: 1.4,
      crop: { x: 0.08, y: 0.18, width: 0.34, height: 0.44 }
    }
  });
  assert.match(detailHtml, /当前区域/);
  assert.match(detailHtml, /区域详解/);
  assert.match(detailHtml, /class="detail-summary"/);
  assert.match(detailHtml, /<p>详情&lt;script&gt;<\/p>/);
  assert.match(detailHtml, /class="detail-preview"/);
  assert.match(detailHtml, /--crop-x:0\.08000/);
  assert.match(detailHtml, /追问&lt;script&gt;/);
  assert.match(detailHtml, /正在基于当前区域生成回答/);
  assert.doesNotMatch(detailHtml, /追问<script>/);

  assert.match(detailHtml, /class="followup-error"/);
  assert.match(detailHtml, /id="retryFollowupButton"/);
  assert.match(detailHtml, /followup failed &lt;script&gt;/);
  assert.doesNotMatch(detailHtml, /class="source-box"/);
  assert.match(detailHtml, /class="followup-field"/);

  const emptyMessages = renderMessages([]);
  assert.strictEqual(emptyMessages, "");
  const artifactHtml = renderMessages([
    {
      role: "assistant",
      content: JSON.stringify({
        type: "chatimage.followup.image",
        version: 1,
        artifact: {
          interactive: false,
          title: "Static <script>",
          summary: "No branches",
          rawAnswer: "Answer <script>",
          imageUrl: "data:image/svg+xml,static",
          imageWidth: 1600,
          imageHeight: 900,
          hotspots: [],
          process: [{ label: "Step <script>", detail: "Done <script>" }]
        }
      })
    }
  ]);
  assert.match(artifactHtml, /followup-artifact/);
  assert.match(artifactHtml, /Static &lt;script&gt;/);
  assert.match(artifactHtml, /Answer &lt;script&gt;/);
  assert.match(artifactHtml, /思考过程/);
  assert.match(artifactHtml, /不可交互/);
  assert.doesNotMatch(artifactHtml, /data-hotspot-id/);
  assert.strictEqual(renderHotspotPreview(null), "");

  const historyHtml = renderHistoryList([
    { id: "ci_1", title: "标题一", question: "问题一", pinnedAt: "2026-06-04T00:00:00.000Z", updatedAt: "2026-06-04T05:00:00.000Z" },
    { id: "ci_2", title: "标题二", question: "问题二", updatedAt: "2026-06-03T10:00:00.000Z" },
    { id: "ci_3", title: "标题三", question: "问题三", updatedAt: "2026-06-02T10:00:00.000Z" },
    { id: "ci_4", title: "标题四", question: "问题四", updatedAt: "2026-06-01T10:00:00.000Z" },
    { id: "ci_5", title: "标题五", question: "问题五", updatedAt: "2026-05-31T10:00:00.000Z" },
    { id: "ci_6", title: "标题六", question: "问题六", updatedAt: "2026-05-30T10:00:00.000Z" },
    { id: "ci_7", title: "标题七", question: "问题七", updatedAt: "2026-05-29T10:00:00.000Z" }
  ], "ci_1", { now: new Date("2026-06-05T00:00:00.000Z") });
  assert.strictEqual((historyHtml.match(/<div class="history-item/g) || []).length, 6);
  assert.match(historyHtml, /data-history-pin="ci_1"/);
  assert.match(historyHtml, /data-history-rename="ci_1"/);
  assert.match(historyHtml, /data-history-delete="ci_1"/);
  assert.match(historyHtml, /class="history-item-time">19 小时/);
  assert.match(historyHtml, /class="history-item-time">1 天/);
  assert.doesNotMatch(historyHtml, /history-item-index/);
  assert.doesNotMatch(historyHtml, />PIN</);
  assert.doesNotMatch(historyHtml, /标题七/);
  assert.strictEqual(formatHistoryTime("2026-06-04T23:59:30.000Z", new Date("2026-06-05T00:00:00.000Z")), "刚刚");

  const historyErrorHtml = renderHistoryRestoreError("恢复失败<script>", "ci_<1>");
  assert.match(historyErrorHtml, /class="history-restore-error"/);
  assert.match(historyErrorHtml, /data-history-error/);
  assert.match(historyErrorHtml, /data-retry-history-id="ci_&lt;1&gt;"/);
  assert.match(historyErrorHtml, /恢复失败&lt;script&gt;/);
  assert.doesNotMatch(historyErrorHtml, /恢复失败<script>/);
  const pinErrorHtml = renderHistoryRestoreError("Not found", "ci_1", { title: "置顶失败", retryLabel: "再试一次" });
  assert.match(pinErrorHtml, /置顶失败/);
  assert.match(pinErrorHtml, /再试一次/);

  assert.match(renderGeneratingState(), /正在生成/);
  const errorHtml = renderErrorState("失败<script>");
  assert.match(errorHtml, /失败&lt;script&gt;/);
  assert.match(errorHtml, /id="retryButton"/);

  const partialHtml = renderErrorState("align failed", { ...createResult(), failed: true, hotspots: [] });
  assert.match(partialHtml, /partial-debug-result/);
  assert.match(partialHtml, /Image generated, hotspot alignment failed/);
  assert.match(partialHtml, /debug-panel/);
  assert.doesNotMatch(partialHtml, /data-hotspot-id=/);

  console.log("render.test.js passed");
}

main();
