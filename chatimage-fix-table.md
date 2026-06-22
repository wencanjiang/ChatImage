# ChatImage 改造清单

> 优先级：🔴 P0 = 本周修 | 🟠 P1 = 本月修 | 🟡 P2 = 下个迭代修

---

## 安全 (Security)

| # | 级别 | 改哪里 | 怎么改 | 为什么改 |
|---|------|--------|--------|----------|
| 1 | 🔴 P0 | `server/providers.js:274, 337` | 删除 `url.searchParams.set("key", apiKey)`，仅保留 header 鉴权；确认上游用 `Authorization: Bearer <key>` 还是 `X-Api-Key: <key>` | API Key 暴露在 URL 查询参数中，会进入上游服务 access log、Node 请求日志、代理工具抓包记录，属于**敏感信息泄露** |
| 2 | 🟡 P2 | `server/providers.js:280, 342` | `Authorization: serverConfig.apiKey` → `Authorization: Bearer ${serverConfig.apiKey}` | 标准 Bearer Token 格式缺少 `Bearer ` 前缀，部分服务端会拒绝该请求或误解鉴权方式 |

---

## 架构重构 (Architecture)

| # | 级别 | 改哪里 | 怎么改 | 为什么改 |
|---|------|--------|--------|----------|
| 3 | 🟠 P1 | `src/service.js` (1039行, 13个工厂函数) | 拆分为 `src/service/llm.js`、`src/service/structure.js`、`src/service/image.js`、`src/service/alignment.js`、`src/service/followup.js`、`src/service/persistence.js`、`src/service/orchestrator.js`，每个文件 ≤ 200 行 | 13个功能完全不同的工厂函数堆在一个文件里，**新人上手需要看通整个文件才能改一行代码**；拆分后每个文件职责单一，改 LLM 逻辑不用看 alignment 代码 |
| 4 | 🟠 P1 | `src/structure.js` (1674行) | 按职责拆分为：解析与修复(`parse/`)、normalize 各字段(`normalize/`)、prompt 模板(`prompts/`)，每个子目录下 ≤ 300 行 | 1674 行的核心业务逻辑已经是"不可读区"——**任何重构都没有安全网**（无 TypeScript），一行改错全局崩 |
| 5 | 🟠 P1 | `src/app.js` (1342行 IIFE) | 拆出 `src/ui/attachments.js`、`src/ui/history.js`、`src/ui/composer.js`、`src/ui/preview.js`，app.js 仅保留状态机 + 编排调度 (≤ 300行) | 前端入口 + 状态机 + 渲染调度 + UI 逻辑全部混在一个 IIFE 中；**改 UI 动辄影响到核心状态逻辑** |
| 6 | 🟠 P1 | `server/locateanything.js` (1094行) | 拆出核心视觉链逻辑（`chain/`）和 fallback 策略（`fallback/`），主文件仅保留路由编排 (≤ 400行) | 视觉链逻辑 + fallback 降级 + SAM3 调用全部耦合，**改 fallback 逻辑时容易误触核心视觉链** |
| 7 | 🟠 P1 | `styles.css` (3917行, 69KB) | 拆分为 `base.css`、`layout.css`、`components/*.css`、`themes/*.css`，通过 PostCSS `@import` 或 esbuild 合并 | 3917 行 CSS 无 BEM、无组件化命名、无 design token；**改一行按钮样式可能意外影响页面其他区域** |

---

## 工程基础设施 (Engineering Infrastructure)

| # | 级别 | 改哪里 | 怎么改 | 为什么改 |
|---|------|--------|--------|----------|
| 8 | 🟠 P1 | 项目根目录 | 新增 `devDependencies`: `typescript@^5`、`esbuild@^0.20`、`eslint@^9`；开 `allowJs: true` 允许混编 `.js` 和 `.ts`；esbuild 将 `src/` 打包到 `dist/chatimage.bundle.js`（复用已有 dist/ 流程） | 18.6k 行源码零类型检查，**1674 行 structure.js 重构时重命名变量没有任何安全网**；15个 `<script>` 串行加载无 tree-shaking；eslint 缺失导致团队风格逐渐漂移 |
| 9 | 🟡 P2 | 所有源文件 | 创建 `src/types.d.ts`，定义 `Hotspot`、`VisualSpec`、`ChatImageResult`、`LayoutTemplate`、`Thread` 等核心类型 | 这些核心类型只存在于文档和注释中，**IDE 没有任何智能提示**，新人拿到代码不知道一个函数该传什么参数 |
| 10 | 🟡 P2 | `src/*.js` 14个全局命名空间 | 合并到 `window.ChatImage = { core, structure, layout, alignment, calibration, state, thread, render, quality, mockSvg, files, download, api, service }` | 14个 `global.ChatImage*` 变量污染全局作用域，**其他库或脚本可能意外覆盖**；加载顺序被隐式耦合在 script 标签顺序上 |

---

## 工具链与质量 (Tooling & Quality)

| # | 级别 | 改哪里 | 怎么改 | 为什么改 |
|---|------|--------|--------|----------|
| 11 | 🟡 P2 | 项目根目录 | 在 `eslint.config.js` 中设置 `max-lines: 500` 规则；将 real-visual-acceptance 的 score 阈值 (≥ 90) 写入 CI 配置文件 | 无行数约束是文件巨石化的重要原因；视觉评分无 CI 阈值导致**回归可能在合并后才被发现** |
| 12 | 🟡 P2 | 前端管线 | 在关键阶段加 `console.time`/`console.timeLog`：LLM 回答耗时、结构化解析耗时、布局规划耗时、生图 API 耗时、alignment 耗时 | 当前完全没有性能埋点，**遇到慢请求无法判断瓶颈在哪**（是 LLM 慢还是生图 API 慢？） |

---

## 团队能力成长 (Team Growth)

| # | 级别 | 改哪里 | 怎么改 | 为什么改 |
|---|------|--------|--------|----------|
| 13 | 🟢 P3 | 团队流程 | 每个 sprint 预留 20% 时间还技术债；P0 安全问题加入 Definition of Done，**P0 修复 SLA ≤ 1 周** | 上次 P0-1（API Key 泄露）**拖了 9 个月没修**，说明"安全问题是最高优先级"在团队中没有落地为纪律 |
| 14 | 🟢 P3 | 团队文化 | 建立 Code Review Checklist，包含：安全（API Key/输入校验）、类型（有 TS 定义吗）、行数（单文件 ≤ 500？）、测试（有对应测试吗） | 当前 PR 评审缺乏统一检查标准，**同样的 P0 问题可能在下一次迭代再次漏掉** |

---

## 简要数据

| 指标 | 当前值 |
|------|--------|
| 总代码行数 | 18,644 |
| 超 500 行文件数 | 8 |
| 超 1000 行文件数 | 5 |
| 最大文件 | styles.css (3,917行) |
| 全局命名空间数 | 14 |
| script 标签数 | 15 |
| 工厂函数堆叠数 | 13 (service.js) |

> **精简版操作建议**：建议从修复 #1 (API Key) → 拆分 #3 (service.js) → 引入 #8 (TypeScript+esbuild) → 拆分 #7 (CSS) 的顺序推进，每一步都在上一不动摇。
