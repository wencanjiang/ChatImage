# 热点定位 + 区域详解问题修复报告

> 日期：2026-06-20 · 涉及文件：`src/alignment.js`、`src/structure.js`、`tests/alignment.test.js`、`tests/browser-api-alignment-error.test.js`

---

## 一、问题一：热点定位错（opened 错误区域 / click-failed / timeout）

### 根因

**`src/alignment.js:110-113`（修复前）** ——「一个模块缺失，整盘对齐作废」：

```js
const missing = modules.filter((module) => !seen.has(module.id));
if (missing.length) {
  throw new Error(`视觉对齐失败：缺少模块 ${...}`);
}
```

`parseAlignmentResponse` 一旦发现某个模块没拿到 LocateAnything box 就 `throw`。这个 throw 被 `service.js:1054` 的 catch 捕获后，**直接放弃全部对齐结果**，`alignment.layout` 退回原始 `layout`——里面所有 `region.bounds` 都是 **planned（按数组 index 的硬编码网格/模板坐标）**，与实际生成图像内容毫无关系。

**后果**：即使 N-1 个模块的 LocateAnything 定位是正确的，也全部被作废，所有热点落到网格固定位置 → 点击开的都是错区域。

这与 agent-eval 失败完全吻合：
- `Timed out waiting for !#detailPanel.hidden` = 对齐服务超时→整盘回退 planned→热点落在空白区→点击不开详情
- `opened 错误区域` = planned 网格与图像实际内容错位
- `aux_N click-failed` = planned box 落空白/重叠区

### 修复

**`alignment.js` `parseAlignmentResponse`**：缺模块不再 throw，直接返回已有的 alignments。缺模块的 planned 回退在 `applyAlignmentsToLayout`（有 `layout` 上下文）里合成。

**`alignment.js` `applyAlignmentsToLayout`**：
1. 缺模块（对齐响应里完全没有）→ 保留 planned bounds，标记 `alignedBy: "planned-fallback"`，并合成 `missingModules` 记录进 alignment 报告。
2. reject 模块分两种处理：
   - `candidate_far_from_planned_card`（模型找到了区域，只是偏离 planned）→ **保留 grounded box**，标记 `alignedBy: "vision-low-confidence"`（低置信但比硬编码网格更接近真实）。
   - `candidate_looks_like_header_strip` / `cross_panel_strip`（模型找错了对象——标题条/边框）→ 回退 planned（旧行为，这些 box 确实是错区域）。

**效果**：一个模块定位失败不再连累其余模块；定位偏差但找对区域的模块保留低置信 box 而非错误网格。

---

## 二、问题二：区域详解显示生图提示词

### 根因

详情面板 body 只读 `hotspot.detail`（fallback `hotspot.shortText`/`imageText`），render 链路本身**不读 `regionPrompt`**（`render.js:331-334`、`layout.js:547-555`）。所以不是简单的字段错读，而是 `detail` 字段被污染的 5 条路径：

1. **LLM 直接在 detail 输出指令式文本，normalization 透传不清洗**（`structure.js:1858` `detail: module.detail || module.imageText`）。agent-eval 的 "区域后解量用途和风貌" 就是 locator 指令片段混进了 detail。
2. **`repairThinMapDetail` 通用模板不清洗**：`detail < 180` 字时触发，`base = detail || imageText || title`——若 base 已污染，模板只追加句子不清洗。
3. **`sourceExcerpt` 注入 `regionPrompt`**（`structure.js:2252`）：`[title, regionPrompt, imageText].join("；")` → 喂给 followup LLM → 追问回答冒出 prompt 文本。
4. **evidence filter 词表不全**：`VISUAL_SYSTEM_VOCAB` 只列 ~15 个 token，漏网的 prompt 词汇经 `userFacingEvidence` 进 detail。
5. **`buildDefaultAuxiliaryModules` 硬编码元脚手架 detail**（`structure.js:2616`）：当 LLM 没生成 auxiliaryModules 时，回退到硬编码默认模块（"输入与环境"/"外部工具"/"图例说明"），其 detail 是**面向系统的元描述**——"这个未编号区域说明流程开始前需要读取的输入条件…它适合作为热点，因为很多追问会围绕…展开"。这是被 `sanitizeDetailForUser` 漏掉的路径：它不是 visual-system vocab，而是另一类污染——把"这个区域的作用/为什么是热点"这种设计注脚当成解释展示给用户。
6. **`buildTopicFallbackSpec` 五段框架元脚手架 detail**（`structure.js:1504`）：当问题不匹配任何专用模板时，回退到通用五段框架（背景基础/当前现状/核心驱动/主要挑战/未来趋势），其 detail 同样是元指令措辞——"这一层用来说明问题为什么会出现"、"点击后可以从…展开讲解"、"让读者能快速拼出…生成逻辑"、"详情区应关注…"、"建议同时列出…"。这是用户报告的"当前现状"模块污染的来源。该路径同样绕过了 visual-system vocab 清洗（措辞是"对详情区/读者的指令"，不是 locator 词汇）。

### 修复

1. **新增 `sanitizeDetailForUser(value, fallback)`**（`structure.js`）：按句切分 detail，剔除含 visual-system vocab 的子句，**保留句末标点**（关键：早期版本用 `；` 重连会破坏 `splitCombinedMapRouteModule`/`extractMapTargetSentence` 的句子边界，导致"西海岸栈道"模块被吞掉——已修正为保留原 `。！？` 分隔）。整条 detail 是短 locator 片段则丢弃回退 fallback。接入主模块 + 辅助模块两条 normalize 路径。
2. **`sourceExcerpt` 不再拼 `regionPrompt`**（`structure.js:2252`）：只留 `title + imageText`，避免 locator 词汇进 followup LLM。
3. **`repairThinMapDetail` 的 `base` 走 `sanitizeDetailForUser`**：模板句子开头的 base 不再携带污染。
4. **`VISUAL_SYSTEM_VOCAB` 扩充**：新增 "必须包含"、"包含图标"、"包含房屋"、"用途和风貌"、"图例或标签"、"实体标记" 等 LLM 常见 prompt 回显词。
5. **重写 `buildDefaultAuxiliaryModules` 硬编码 detail**（`structure.js:2616`，中英文各 3 个）：移除所有"这个未编号区域/适合作为热点/辅助区域把"等设计注脚措辞，改为**基于实际 rawAnswer 内容**的实用说明——每个面板的 detail 现在从 `source` 截取真实片段（"原文相关片段：…"）+ 描述该面板在流程中的实际作用。验证：3 个辅助模块 `hasScaffold: false`，且能过 `sanitizeDetailForUser`。
6. **重写 `buildTopicFallbackSpec` 五段框架 detail**（`structure.js:1504`，5 个模块）：移除所有"这一层用来说明/点击后可以从…展开/让读者能/详情区应关注/建议同时列出"等元指令措辞，改为基于 `${development}`/`${topic}` 的事实陈述。同时避免 `${development}的…` 造成的"的发展的"冗余（structure.test.js:265 断言禁止该模式）。验证：5 个模块 `hits: []`（无元指令）、无"的发展的"冗余。
7. **新增 `META_INSTRUCTION_VOCAB` + `looksLikeUserFacingNoise`（纵深防御）**：除 visual-system vocab 外，新增元指令词表（"详情区应关注/建议同时列出/适合作为热点/未编号区域/这一层用来说明/点击后可以从/展开讲解/让读者能/读者在动手"等）。`sanitizeDetailForUser` 改用 `looksLikeUserFacingNoise`（visual-system ∪ meta-instruction）清洗，这样即使 LLM 在真实生成时回显这类指令措辞（非 fallback 路径），也会被剔除。`repairThinMapDetail` 的 evidence filter 同步改用 `looksLikeUserFacingNoise`。
8. **新增 `sanitizeSpecFields(spec)` 集中式 spec 清洗（根治 mock/fallback 绕过）**：审查发现 `sanitizeDetailForUser` 只清洗 LLM 路径的 `module.detail`，**从不触及** `summary`/`sourceExcerpt`，且**所有 mock/fallback spec 全部绕过清洗**（14 个生成器：智能表/通用地图/西湖/三清/场景/语义目标/对比维度/OAuth/K8s/RAG/HTTP 渲染/电商漏斗/话题框架/legacy mock 直接返回，不经过 normalize 的 detail 清洗）。新增 `sanitizeSpecFields` 在 `ensureVisualTargetContracts`（所有 mock 的单一瓶颈）里统一清洗 `modules[].detail`/`auxiliaryModules[].detail`/`summary`/`sourceExcerpt`/`imageText`；`normalizeVisualSpec` LLM 路径的 `summary`/`sourceExcerpt` 也接入清洗。一处修复覆盖全部 14 个生成器，而非逐个改字符串。
9. **扩充 `META_INSTRUCTION_VOCAB` 实测词**：批量测试 10 个 mock spec 后，补充实际遇到的元指令短语——"点击此区域/点击这个区域/点击后可以/点击后需要/图中应把/图中这一区域/图上应该把/详情里应/详情还应/详情可以/这个辅助区/这个区域不是/这个区域用于/应画出/画成可点击/应像一条/应作为独立/用户点击不同/应能看到/避免把说明"。验证后 10/10 mock spec 污染清零。

---

## 三、验证

| 测试 | 结果 | 说明 |
|---|---|---|
| `alignment` | ✅ | 含新增 `testMissingModuleFallsBackToPlanned`（验证缺模块保留 grounded + planned-fallback 标记）|
| `structure` | ✅ | 修复了 `sanitizeDetailForUser` 标点回归（西海岸栈道拆分正常）；`buildDefaultAuxiliaryModules` + `buildTopicFallbackSpec` 元脚手架 detail 重写后无回归；断言更新适配新主要挑战 detail 措辞 |
| `service` / `quality` / `layout` / `render` / `preview-strategy` / `core` / `calibration` / `error-paths` / `api-adapter` / `locateanything` / `sam3` / `local-ocr` / `validation` / `security` / `server` / `server-modules` / `proxy-integration` / `build` / `browser-dist` | ✅ | 全 21 套件无回归 |
| **10 mock spec 批量污染检测** | ✅ | 对比维度/三清山/西湖/智能手表/RAG/K8s/电商漏斗/OAuth2/HTTP渲染/话题框架 — 全部 0 残留污染（含之前漏掉的 5 个 mock：西湖苏堤/三潭、智能手表表带、RAG 三模块、K8s 两模块、电商加购） |
| `locateanything` / `locateanything-worker` / `sam3` / `local-ocr` / `proxy-integration` / `server` / `server-modules` / `validation` / `security` / `build` | ✅ | 无回归 |
| `browser`（1440+390px CSS 契约） | ✅ | |
| `browser-dist`（构建后 1280px） | ✅ | |
| `browser-api-alignment-error` | ✅ | 断言更新为期望 `vision-mixed`/`planned-fallback`（部分对齐）而非 `alignment-fallback`（整盘失败）|

### 关键测试断言更新
- `testInvalidAlignmentResponse`：缺模块不再 throw（改验证返回已有 alignments）；置信度不足 / bounds 越界仍 throw。
- `testRepairInvalidAlignmentBounds`：恢复 committed 版本的 `provider === "vision-repaired"`（工作区有一处预存的错误编辑 `"vision"`，已纠正）。
- `browser-api-alignment-error`：单模块缺失现在走部分对齐（`vision-mixed`/`planned-fallback`），3 个热点仍全渲染，不再标记为整盘 `alignment-fallback`。

### 未改动的行为
- `service.js:1054` 的 catch（provider **抛异常**时 → `alignment-fallback`）保留不变——这是真正的对齐服务故障路径，`service.test.js:134` 仍验证通过。

---

## 四、后续建议

1. **`vision-low-confidence` 的 UI 反馈**：目前低置信热点在 CSS 上无区分。建议给 `alignedBy === "vision-low-confidence"` 的热点加一个微弱的视觉标记（如校准模式下用不同 outline 颜色），让用户知道该热点定位可能不准。
2. **`missingModules` 上报前端**：当前 `missingModules` 只在 alignmentRaw 里。建议在质量报告（`quality.js`）里显式列出哪些模块用了 planned 回退，方便排查。
3. **`sanitizeDetailForUser` 的单测**：该函数是 detail 清洗的核心，建议补独立单测覆盖各类污染输入（纯 prompt 片段、混合、干净 detail、空值）。
4. **在线视觉定位稳定性**：本次修复了"缺模块整盘作废"的放大效应，但 LocateAnything/MiMo 视觉本身漏检模块的根因仍在上游模型。`progress.md` 记录的在线不稳定性需要持续观察。
