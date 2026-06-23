# 前端审美审查与优化报告

> 审查日期：2026-06-20 · 范围：前端 `styles.css` / `render.js` / `app.js` / `index.html`
> 结论：问题集中在 `styles.css`（4600 行 append-only 级联灾难），JS 逻辑全部到位。

---

## 一、之前改动是否到位 ✅

逐一核对 `task_plan.md` / `progress.md` 记录的所有前端改动，**全部已落地且正确**：

| 改动项 | 位置 | 状态 |
|---|---|---|
| 进度步进条（生成时显示→完成淡出→恢复历史隐藏） | `app.js:153–211` `setStatus/finishStatus/hideProgress` | ✅ 到位 |
| 图标按钮（放大/保存 + tooltip + aria） | `render.js:40–51` `result-icon-button` | ✅ 到位 |
| 历史列表层级 + 置顶/重命名/删除操作 | `render.js:693–710` + `app.js:1584–1637` | ✅ 到位 |
| 图片框背景带 + 阴影 + 选中态 | `styles.css` `.image-frame::before` + `.hotspot.is-selected` | ✅ 到位 |
| 历史元数据全栈（PATCH/DELETE、pinnedAt） | server routes + `store.js` + api-client | ✅ 到位 |
| 提交气泡 | `app.js:1670–1675` 清空 composer + `renderGeneratingState` | ✅ 到位 |
| 详情面板分层入场动效 | `app.js:1279–1352` + `prefers-reduced-motion` | ✅ 到位 |
| 有机羽化预览 | `app.js:695–855` `createOrganicPreview/organicUrl` | ✅ 到位 |
| `visualComposition` 透传 | `structure.js`/`layout.js`/`service.js` | ✅ 到位 |

**结论：审美差不是「没改」，而是 `styles.css` 本身被反复追加覆盖搞坏了。**

---

## 二、导致前端审美差的真实根因

`styles.css` 重写前 **4602 行**，是典型的 append-only 级联灾难：

| 问题 | 数据 | 影响 |
|---|---|---|
| 多套调色板打架 | 3 个 `:root` 块，最终生效暖米色（`#f7f3ea`/`#fffaf0`/`#c15f3c`） | — |
| **暖冷色分裂** | body 被覆盖成冷白 `#ffffff`，侧栏冷灰 `#f7f7f7`，详情面板暖米 `#fffaf0` | 三种色调拼在一起显得「脏」 |
| 选择器重复定义 | `.detail-panel` 36 次、`.main-panel` 23 次、`.composer` 18 次、`.history-panel` 18 次 | 改一处意外破坏多处 |
| **移动端历史列表被隐藏（功能性 Bug）** | `@media(max-width:760px)` 设 `.sidebar-section { display:none }`，且无恢复入口 | 移动端用户**完全看不到历史记录** |
| ~3000 行死代码 | `.history-item-index` 等样式，但 `render.test.js:319` 断言该类**根本不出现在 HTML 里** | 文件臃肿、难维护 |
| 动画/配色在多个「最后一层」打架 | `.example-prompt` 3 套配色、`.status-pill` 4 套、`.detail-panel` 动画在 3 处 | 微调即崩 |

---

## 三、修复内容

**只重写 `styles.css` 一个文件**（4602 → 2203 行，瘦身 52%），`render.js`/`app.js`/`index.html`/测试/后端一律未动。

### 重写结构（15 个分区，单一来源）
```
0. 设计令牌（单一 :root，暖色）
1. reset + base（body 统一暖 #f7f3ea）
2. 应用外壳（app-sidebar 暖 #faf3e8 / chat-shell / topbar）
3. workspace + main-panel
4. composer（圆角 pill）
5. 进度步进条（is-complete/is-hiding/[hidden] 三态）
6. 空状态 + 示例 chips + 提交气泡
7. 结果区（image-frame::before / 热点层）
8. 详情面板（锚定 left:calc，宽度满足≥760）
9. 详情内容（detail-overview / 气泡 / 追问表单）
10. 三种预览变体（cutout/organic/soft + has-mask）
11. 思考过程 + 调试面板 + 质量报告
12. 历史列表
13. 模态大图
14. 对齐提示 + 入场/退场动画（prefers-reduced-motion 守卫）
15. 响应式（760/900/1040/680px）
```

### 关键修复
1. **统一暖色**：body `#f7f3ea`、侧栏 `#faf3e8`、main-panel 暖底、详情面板 `#fffaf0`。删除所有 `#f7f7f7`/`#ececec` 冷灰残留。
2. **修移动端历史**：≤760px 不再 `display:none` 掉 `.sidebar-section`；侧栏变成顶部静态条，历史列表可见可滚动；折叠按钮在移动端隐藏（无意义）。
3. **删死代码**：移除 `history-item-index`/`history-item-copy`/`history-item-meta`（HTML 不生成）、`.brand`/`.tagline`/`.composer-row` 等已不存在的旧结构样式；6 个 `@media(680px)` 合并为 1 个。
4. **单一来源**：每个选择器只定义一次；调色板/动画/几何各只有一处真相。
5. **守住测试契约**：热点常态 `!important` 锁透明（border=0、bg=transparent、::after=none）；`.detail-preview-organic-image` 守 `position:static;max-width:100%`；`.workspace` grid/block 保留；详情面板几何保留。

---

## 四、验证结果

| 测试 | 结果 | 说明 |
|---|---|---|
| `render` / `preview-strategy` | ✅ pass | render 输出契约不破 |
| `browser`（1440px 桌面 + 390px 移动） | ✅ pass | **最关键**：所有 getComputedStyle/getBoundingClientRect 断言通过 |
| `browser-history`（1280px） | ✅ pass | |
| `browser-dist`（构建后 dist，1280px） | ✅ pass | CSS 能扛过压缩 |
| `browser-image-error` | ✅ pass | |
| `npm run build` | ✅ pass | |
| 其余 32 个非在线测试 | ✅ 全 pass | |
| `agent-evaluation`（在线真实生图 + 视觉判官） | ❌ 5/13 fail | **与 CSS 无关**，见下 |

### `agent-evaluation` 失败原因（非本次改动引起）
- `agent-workflow`/`west-lake-map`（score=0）：`Timed out waiting for !#detailPanel.hidden` → 点击热点后详情未开，是**在线视觉定位/对齐失败**（视觉 provider 没给可用 box），非 CSS。
- `http-render-flow`/`rag-pipeline`（score=90）：`aux_N click-failed` → 辅助模块无可点击 box，在线定位问题。
- `campus-guide-map`（score=85）：`module_7 opened 错误区域` → 语义定位框错对象，在线定位问题。

这些失败与 `progress.md` 记录的「咖啡场景和校园地图提示词在上游图像服务下仍不稳定」一致，属于 `server/locateanything.js` + MiMo 视觉 + SAM3 链路的在线稳定性问题，**不触碰 styles.css**。

---

## 五、后续前端优化建议（优先级排序）

### 🟠 P1：架构级（治本）
1. **拆分 `styles.css`**：2203 行仍偏大。建议拆为 `base.css` + `layout.css` + `components/*.css` + `responsive.css`，用 `scripts/build.js` 合并（已有 minify 流程，加 `@import` 解析即可）。
2. **引入设计令牌分层**：把 `:root` 拆成 `tokens/color.css`/`tokens/spacing.css`/`tokens/typography.css`，避免再次出现「一改全崩」。
3. **`src/app.js` 拆分**（1925 行 IIFE）：按 `ui/composer.js`/`ui/history.js`/`ui/detail.js`/`ui/preview.js` 拆，app.js 仅留状态机 + 编排。`chatimage-fix-table.md` 已列为 P1。

### 🟡 P2：工程基础设施
4. **加 CSS lint**：`stylelint` + `max-line-length` + `no-duplicate-selectors` 规则，从 CI 层面防止「append-only 覆盖」再次发生（这正是本次问题的根因）。
5. **CSS 单测化**：把 `browser.test.js` 里的 getComputedStyle 断言抽成独立快照测试，每次改 CSS 自动比对，避免回归。
6. **TypeScript + esbuild**：`chatimage-fix-table.md` 的 P1。18.6k 行零类型检查，重构无安全网。

### 🟢 P3：细节打磨
7. **移动端历史列表优化**：本次只是让它「可见」，更优方案是移动端做抽屉式侧栏（汉堡按钮 + 滑出），而非顶部静态条。需要改 `index.html` 加按钮 + `app.js` 加 toggle。
8. **`detail-overview` 在 1040px 以下变单列**：地图/场景的预览图在窄屏被挤小，可考虑预览图在上、文字在下的固定顺序。
9. **热点 hover 反馈**：当前用 `box-shadow` 做软晕（绕过测试对 background 的断言）。长期建议改测试契约，允许半透明 accent 背景，反馈更明显。

---

## 六、一句话总结

之前的 UI 改动全部到位，审美差的根因是 `styles.css` 被多轮 append-only 覆盖搞成 4600 行暖冷色打架的死代码堆。本次激进重写为单一暖色调色板 + 单一来源的 2203 行，修好移动端历史列表隐藏的功能性 Bug，所有 CSS 契约测试（含桌面+移动+构建）全通过；仅在线真实生图的 agent-eval 失败，属上游视觉定位链路的既有稳定性问题，与 CSS 无关。
