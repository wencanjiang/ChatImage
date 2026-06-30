# ChatImage 技术报告

> **在线文档** · [项目主页](index.html) · [GitHub 仓库](https://github.com/wencanjiang/ChatImage)

本报告是 ChatImage 项目的权威技术文档，涵盖架构设计、核心数据流、模块职责、视觉对齐管线、测试策略和已知限制。它替代了早期散落在 `docs/archive/` 中的开发日志和审计笔记，是理解项目实现细节的首选入口。

---

## 目录

1. [项目概述](#1-项目概述)
2. [系统架构](#2-系统架构)
3. [端到端数据流](#3-端到端数据流)
4. [核心数据模型](#4-核心数据模型)
5. [结构化回答归一化](#5-结构化回答归一化)
6. [布局规划](#6-布局规划)
7. [图像生成](#7-图像生成)
8. [视觉对齐管线](#8-视觉对齐管线)
9. [热点层与交互](#9-热点层与交互)
10. [追问线程](#10-追问线程)
11. [持久化（SQLite）](#11-持久化sqlite)
12. [API 参考](#12-api-参考)
13. [测试策略](#13-测试策略)
14. [已知限制与设计取舍](#14-已知限制与设计取舍)
15. [配置参考](#15-配置参考)

---

## 1. 项目概述

ChatImage 将一段长文本 LLM 回答转换为**可交互的视觉图像**——在生成的图片上叠加透明可点击热点，每个热点打开独立的详解面板和上下文追问线程。

核心技术难点：

- **文本→结构化**：将长文本稳定压缩为适合视觉表达的结构化数据（modules）。
- **热点↔图像对齐**：让前端热点区域与生图结果中的视觉分区尽量一致。

MVP 关键原则：**不依赖生图模型自由发挥布局**，而是由 ChatImage 先生成结构化布局，再让图像生成和热点层都基于同一份布局数据。

### 视觉模式

| 模式 | 说明 | 典型场景 |
|------|------|----------|
| `infographic` | 信息图（swimlane / layered / funnel / compare） | 技术流程、架构图、对比分析 |
| `map` | 手绘导览地图 | 景区导览、校园地图 |
| `scene` | 场景插画 | 博物馆、产品拆解、空间布局 |
| `poster` | 海报 | 单主题视觉总结 |

---

## 2. 系统架构

```
┌──────────────────────────────────────────────────────┐
│                    Browser (前端)                      │
│  index.html + src/app.js (编排) + src/render.js (渲染) │
│  src/service.js (供应商编排) · src/structure.js (归一化)│
│  src/layout.js (布局) · src/alignment.js (对齐)        │
│  src/preview-strategy.js (预览策略) · src/quality.js   │
└───────────────────────┬──────────────────────────────┘
                        │ HTTP (fetch)
┌───────────────────────▼──────────────────────────────┐
│              Local Server (server.js)                 │
│  server/http.js · server/providers.js · server/store.js│
│  server/validation.js · server/concurrency.js         │
│  server/routes/: config / image / llm / vision         │
│  server/locateanything.js · server/sam3.js · server/local-ocr.js │
└───────┬──────────────┬───────────────┬───────────────┘
        │              │               │
   ┌────▼────┐   ┌─────▼─────┐   ┌────▼──────┐
   │  SQLite  │   │ 上游 API   │   │ Python    │
   │ (持久化)  │   │ (LLM/图/视觉)│   │ Workers   │
   └─────────┘   └───────────┘   └───────────┘
```

### 前端模块（`src/`）

| 文件 | 职责 |
|------|------|
| `app.js` | 浏览器编排、UI 绑定、状态管理（IIFE，~1900 行） |
| `service.js` | 供应商编排：生成、追问、对齐的 API 调用链 |
| `structure.js` | 结构化回答归一化 + mock/fallback spec 生成（~3300 行，项目最大模块） |
| `layout.js` | 布局规划：LayoutSpec 生成、区域坐标、热点几何 |
| `alignment.js` | 视觉对齐：解析对齐结果、应用到布局、reject/fallback 策略 |
| `render.js` | 结果渲染工具：热点层、详情面板、预览变体 |
| `preview-strategy.js` | 热点预览变体选择（cutout / organic / soft / masked） |
| `quality.js` | 质量校验：模块数、内容覆盖、布局合理性 |
| `calibration.js` | 热点校准工具 |
| `core.js` | 生成管线编排 |
| `files.js` | 文件附件处理 |
| `api-client.js` | 前端 API 客户端封装 |

### 后端模块（`server/`）

| 文件 | 职责 |
|------|------|
| `server.js` | 服务器入口、运行时配置加载、路由挂载 |
| `http.js` | HTTP 服务器、静态文件服务 |
| `providers.js` | 上游供应商适配（文本/图像/视觉） |
| `store.js` | SQLite 持久化（CRUD + 线程管理） |
| `validation.js` | 请求校验：payload 结构、URL 协议、热点边界 |
| `concurrency.js` | 并发闸门：`CHATIMAGE_MAX_UPSTREAM_REQUESTS=4`，超限返回 429 |
| `routes/config.js` | `GET /api/config` — 前端可见的运行时配置 |
| `routes/image.js` | `POST /api/image` — 图像生成代理 |
| `routes/llm.js` | `POST /api/llm` — 文本模型代理 |
| `routes/vision.js` | `POST /api/vision` — 视觉对齐代理 |
| `locateanything.js` | LocateAnything 视觉定位客户端（JSONL 协议） |
| `sam3.js` | SAM3 掩码精修客户端 |
| `local-ocr.js` | 本地 OCR 回退 |

### Python Workers（`scripts/`）

| 文件 | 职责 |
|------|------|
| `locateanything_worker.py` | LocateAnything 视觉定位模型 worker（transformers） |
| `sam3_worker.py` | SAM3 分割模型 worker |
| `build.js` | 零依赖前端构建脚本（拼接 + 压缩 → `dist/`） |

---

## 3. 端到端数据流

```
用户提问
  │
  ▼
① 获取原始 LLM 回答 ──────────── POST /api/llm（或 mock）
  │
  ▼
② 归一化为结构化 VisualSpec ──── structure.js: normalizeVisualSpec
  │   modules[] + auxiliaryModules[]，每个模块含 title/detail/regionPrompt/...
  │
  ▼
③ 规划布局 LayoutSpec ────────── layout.js: createLayout
  │   为每个模块分配 region + normalized bounds (0~1)
  │
  ▼
④ 生成图像提示词 ──────────────── core.js: buildImagePrompt
  │   基于结构化内容 + 布局意图
  │
  ▼
⑤ 调用图像生成 API ──────────── POST /api/image
  │   返回 imageUrl + 从图像头解析真实尺寸 (imageWidth/imageHeight)
  │
  ▼
⑥ 视觉对齐（真实 API 模式） ──── POST /api/vision
  │   LocateAnything → SAM3 精修 → 对齐结果覆盖 region.bounds
  │   Mock 模式跳过此步，使用 planned bounds
  │
  ▼
⑦ 派生热点 ────────────────────── layout.js: deriveHotspots
  │   region.bounds → hotspot.{x,y,width,height} + alignmentSource
  │
  ▼
⑧ 渲染 ────────────────────────── render.js
  │   图片 + 透明热点层 + 详情面板
  │
  ▼
⑨ 持久化 ──────────────────────── server/store.js → SQLite
      chat_images / hotspots / hotspot_threads / hotspot_messages
```

### 两趟生成策略

真实 API 模式采用**两趟策略**（two-pass），不假设生图模型会精确遵循坐标：

1. **第一趟**：结构化 → 近似布局 → 风格化图像提示词 → 生成图像
2. **第二趟**：视觉模型定位每个模块在生成图中的真实位置 → 对齐热点

这解决了"生图模型不遵循坐标"的核心难题——与其要求模型精确画在指定位置，不如先生成再定位。

---

## 4. 核心数据模型

### VisualSpec

```typescript
type VisualSpec = {
  visualMode: "infographic" | "map" | "scene" | "poster";
  title: string;
  summary: string;          // 结果区标题下方的一句话摘要
  relationType: string;     // flow | parallel | hierarchy | compare
  visualComposition: {      // 布局元信息
    compositionType: string;
    layoutVariant: string;
  };
  modules: Module[];        // 主模块（3~8 个）
  auxiliaryModules: Module[]; // 辅助模块（输入环境/外部工具/图例等）
};
```

### Module

```typescript
type Module = {
  id: string;               // "module_1" ... "module_N"
  title: string;            // 热点标签 / 校准标签
  imageText: string;        // 图上短文字
  detail: string;           // 详解面板正文（用户可见，经 sanitizeDetailForUser 清洗）
  sourceExcerpt: string;    // 原文片段（喂给追问 LLM）
  regionKind: string;       // step | route | landmark | water | legend | ...
  regionPrompt: string;     // 图像搜索/定位提示词（内部使用，不展示给用户）
  iconHint: string;         // 图标语义
  priority: number;
  visualEvidence: string[]; // 视觉证据描述
  maskPolicy: string;       // subject-with-label | full-region | ...
  locatorQueries: string[]; // LocateAnything 定位短语
  componentHints: object[]; // 组件提示
};
```

### LayoutSpec

```typescript
type LayoutSpec = {
  family: "grid" | "flow" | "compare" | "hub" | "timeline" | "matrix" | "freeform";
  visualMode: string;
  regions: Region[];        // 每个区域有 hotspotId 关联 module.id
};

type Region = {
  id: string;
  role: "title" | "module" | "legend";
  hotspotId?: string;       // 关联 module.id
  bounds: { x: number; y: number; width: number; height: number }; // 0~1 归一化
  alignedBy?: string;       // vision | planned | planned-fallback | vision-low-confidence
};
```

### Hotspot

```typescript
type Hotspot = {
  id: string;               // = module.id
  label: string;            // = module.title
  shortText: string;        // = module.imageText
  detail: string;           // = module.detail
  x: number; y: number; width: number; height: number; // 0~1
  alignmentSource: string; // = region.alignedBy
  clickShape: "rect";       // 点击命中用矩形
  maskUsableForClick: false; // SAM3 mask 不用于命中测试
};
```

---

## 5. 结构化回答归一化

`structure.js` 的 `normalizeVisualSpec` 是最核心的模块（~3300 行），负责将 LLM 的 JSON 回答转换为干净的 VisualSpec。

### 归一化管线

```
LLM JSON 回答
  │
  ├─ normalizeAnswerStructure → 解析 + 字段映射
  │     ├─ modules[].detail → sanitizeDetailForUser（清洗 prompt/元指令污染）
  │     ├─ modules[].sourceExcerpt → sanitizeDetailForUser
  │     └─ summary → sanitizeDetailForUser
  │
  ├─ useFallbackForModeConflict → 模式冲突检测 → 回退 mock spec
  │
  ├─ repairMapModulesQuality → 地图模块质量修复（合并路线拆分等）
  │     └─ repairThinMapDetail → 薄 detail 回填
  │
  └─ ensureVisualTargetContracts → 目标契约 + sanitizeSpecFields（集中清洗）
```

### 用户可见文本清洗

项目历史上发现 `detail` 字段会被两类文本污染：

| 污染类型 | 特征 | 清洗方式 |
|----------|------|----------|
| **Visual-system vocab**（定位器词汇） | "短标签"、"必须包含"、"包含图标"、"便于热点定位" | `VISUAL_SYSTEM_VOCAB` 词表 |
| **Meta-instruction**（元指令/设计注脚） | "这一层用来说明"、"点击后可以"、"详情区应关注"、"建议同时列出"、"适合作为热点" | `META_INSTRUCTION_VOCAB` 词表 |

清洗由 `sanitizeDetailForUser` 实现：
1. 整条 detail 是短片段（<60 字）且命中词表 → 丢弃，回退 fallback
2. 按句切分（保留 `。！？` 句末标点），剔除含词表的子句
3. 清洗后 <24 字 → 回退 fallback
4. `sanitizeSpecFields` 在 `ensureVisualTargetContracts`（所有 mock 的瓶颈）统一清洗 `detail`/`sourceExcerpt`/`imageText`/`summary`

### Mock/Fallback Spec 生成器

当 LLM 未返回有效结构或问题匹配特定模式时，`buildMockSpec` 分发到专用 fallback：

| 生成器 | 触发 | 模式 | 模块数 |
|--------|------|------|--------|
| `buildRestGraphqlFallbackSpec` | REST + GraphQL | infographic | 5 |
| `buildSqlNoSqlFallbackSpec` | SQL + NoSQL | infographic | 5 |
| `buildOAuthFallbackSpec` | OAuth 2.0 | infographic (swimlane) | 5 |
| `buildKubernetesFallbackSpec` | Kubernetes/K8s | infographic (layered) | 5 |
| `buildRagPipelineFallbackSpec` | RAG | infographic (swimlane) | 6+2 aux |
| `buildHttpRenderFlowFallbackSpec` | HTTP 渲染流程 | infographic (swimlane) | 5+1 aux |
| `buildEcommerceFunnelFallbackSpec` | 电商漏斗 | infographic (funnel) | 5 |
| `buildAgentWorkflowFallbackSpec` | Agent 工作流 | infographic (swimlane) | 5-6 |
| `buildCompareDimensionFallbackSpec` | 对比类问题 | infographic | varies |
| `buildWestLakeMapFallbackSpec` | 西湖 | map | 9 |
| `buildSanqingMapFallbackSpec` | 三清山 | map | 5 |
| `buildHuangshanMapFallbackSpec` | 黄山 | map | 6 |
| `buildMapFallbackSpec` | 通用地图 | map | 6 |
| `buildSmartwatchStructureFallbackSpec` | 智能手表结构 | scene | 6 |
| `buildSceneFallbackSpec` | 通用场景 | scene | 4 |
| `buildTopicFallbackSpec` | 通用话题 | infographic | 5 |
| `buildDefaultAuxiliaryModules` | flow 类问题 | — | 3 aux |

所有 mock spec 经过 `ensureVisualTargetContracts` → `sanitizeSpecFields` 统一清洗。

---

## 6. 布局规划

`layout.js` 的 `createLayout` 根据 `visualMode` 和 `family` 为每个模块分配归一化坐标。

### 布局族

| 族 | 适用 | 坐标策略 |
|----|------|----------|
| `grid` | 信息图 | 按数组 index 的固定网格 |
| `flow` | 流程图 | swimlane 横向/纵向 |
| `compare` | 对比 | 左右/上下分栏 |
| `hub` | 中心辐射 | 中心 + 环绕 |
| `timeline` | 时间线 | 纵向序列 |
| `matrix` | 矩阵 | 行列网格 |
| `freeform` | 自由 | 地图语义槽 |

### 地图语义槽

地图模式（`buildMapRegions`）不使用固定网格，而是通过关键词匹配 `module.title`/`regionPrompt` 分配语义槽（`slotCatalog`）——如"入口"→底部中央、"核心景区"→中心。未匹配的模块回退到 `fallbackMapPosition(index)`。

---

## 7. 图像生成

### 图像提示词构建

图像提示词由 `core.js` 从结构化内容 + 布局意图合成，包含：
- 整体风格指令（hand-drawn / infographic / scene）
- 每个模块的文字标签和位置意图
- 画布比例（默认 16:9，可选 4:5 / 1:1）

### 图像尺寸解析

**关键设计决策**：图像实际尺寸必须从图像文件头（PNG/JPEG/SVG）解析，而非请求参数。生产中观察到"请求 1600×900、实际返回 1536×1024"的情况——生图模型不保证精确尺寸。

`assertImageDimensions` 从图像头提取真实 `imageWidth`/`imageHeight`，前端用此值预留舞台比例（`--fallback-aspect-ratio`），确保热点坐标与图像像素精确对应。

### 图像 API 适配

- 图像 API 不接受 `model` 字段（"存在未绑定的参数: model"）→ `CHATIMAGE_IMAGE_MODEL` 仅用于显示
- 默认文本模型 `gpt-5.5`（小写），通过 `tests/model-probe.js` 发现

---

## 8. 视觉对齐管线

视觉对齐是 ChatImage 的核心技术——让热点落在生成图的正确位置上。

### 管线

```
POST /api/vision (imageUrl + imageWidth + imageHeight + modules + plannedBounds)
  │
  ├─ LocateAnything（主定位器）
  │     ├─ scripts/locateanything_worker.py（transformers，nvidia/LocateAnything-3B）
  │     ├─ 对每个模块构建 1~4 个定位短语（label + regionPrompt + semanticHint）
  │     ├─ ground_gui(image, phrase) → <box>x1 y1 x2 y2</box>（0~1000 缩放）
  │     ├─ 与 plannedBounds 评分（score_locate_bounds）
  │     ├─ 可选裁剪重定位（locate_module_in_crop）
  │     └─ 返回每模块 bounds + confidence
  │
  ├─ MiMo-vision（回退定位器）
  │     └─ 当 LocateAnything 不可用时
  │
  ├─ local-ocr（最后回退）
  │     └─ scripts/local_ocr_fake.py
  │
  └─ SAM3 精修（可选）
        ├─ server/sam3.js: refineAlignmentWithSam3
        ├─ 对已对齐模块扩展 box → SAM3 预测 mask → 紧凑 bbox + polygon
        ├─ 不替换 module.bounds，只附加 module.mask
        └─ mask 用于预览（cutout/organic），不用于点击命中
```

### 对齐结果应用

`alignment.js` 的 `applyAlignmentsToLayout`：

| 情况 | 处理 | 标签 |
|------|------|------|
| 对齐成功 | 用 grounded bounds 覆盖 planned bounds | `vision` |
| 置信度过低 / bounds 越界 | throw（parseAlignmentResponse） | — |
| `far_from_planned_card` reject | 保留 grounded box（比网格更接近真实） | `vision-low-confidence` |
| `header_strip` / `cross_panel_strip` reject | 回退 planned（找错对象） | — |
| 模块完全缺失 | 保留 planned bounds | `planned-fallback` |

**关键修复**：一个模块缺失不再导致整盘对齐作废（旧逻辑 throw → service.js catch → 全部回退 planned 网格）。现在缺模块保留 planned，其余模块保留真实定位。

### LocateAnything 许可

`nvidia/LocateAnything-3B` 权重受 NVIDIA 许可约束，需 `CHATIMAGE_LOCATEANYTHING_LICENSE_ACK=research-evaluation` 确认。默认视觉模式 `local-ocr`。

---

## 9. 热点层与交互

### 热点渲染

`render.js` 的 `renderHotspotLayer` 将 `hotspot.{x,y,width,height}`（0~1）转为百分比定位的 `<button>`：

```css
left: ${x*100}%; top: ${y*100}%;
width: ${width*100}%; height: ${height*100}%;
```

### 热点状态

| 状态 | 视觉 | 说明 |
|------|------|------|
| 默认 | 完全透明 | 用户只看到生成图 |
| hover | box-shadow 软暖晕 | 不改 background/border（测试契约） |
| clicked | 点击反馈动画 | 420ms 淡出 |
| 校准模式 | outline + 背景 + ::before 标签 + ::after 来源 | 可视化边界 |

**测试契约**：常态下 `borderTopWidth=0px`、`backgroundColor=transparent`、`::after content=none`，用 `!important` 锁定（browser.test.js 断言）。

### 详情面板

点击热点打开居中详情面板（`detail-panel`），含：
- 标题（`module.title`）
- 摘要（`module.detail`，经清洗）
- 预览（根据 `preview-strategy.js` 选择变体）
- 追问线程
- 追问输入框

面板入场动效：backdrop → panel → preview → copy → form 分层入场（`is-entering`/`is-closing`/`is-preview-entering`），`prefers-reduced-motion` 守卫。

### 预览变体

`preview-strategy.js` 根据热点形状和 mask 可用性选择：

| 变体 | 类名 | 说明 |
|------|------|------|
| 抠图 | `detail-preview-cutout` | 棋盘格背景 + drop-shadow |
| 有机羽化 | `detail-preview-organic` | 透明背景 + drop-shadow |
| 柔化 | `detail-preview-soft` | radial-gradient mask 羽化边缘 |
| 掩膜 | `has-mask` | SAM3 polygon mask |

---

## 10. 追问线程

每个热点拥有独立的追问线程，上下文隔离：

```
点击热点 → 打开详情面板 → 在面板内追问
  │
  ▼
POST /api/chatimages/:id/hotspots/:hotspotId/thread
  { question, threadId? }
  │
  ▼
后端拼装局部上下文：
  原始问题 + 原始回答 + 当前 hotspot.detail + 该 thread 历史
  │
  ▼
调用 LLM → 追问回答 → 追加到该 hotspot 的 thread
  │
  ▼
前端在当前热点详情面板中展示多轮回答
```

线程消息存储在 `hotspot_messages` 表，通过 `hotspot_threads` 关联。`hotspots.storage_id = ${chatImageId}:${hotspotId}` 避免跨 ChatImage 的主键冲突。

---

## 11. 持久化（SQLite）

### 数据库

- 引擎：内置 `node:sqlite`（`DatabaseSync`，需 Node 22.5+）
- 路径：`CHATIMAGE_DATABASE_PATH`，默认 `tmp/chatimage.sqlite`
- 外键：已启用（`PRAGMA foreign_keys = ON`）

### 表结构

```sql
-- ChatImage 主表
chat_images (
  id TEXT PRIMARY KEY,          -- "ci_xxxxxxxx"
  question TEXT,
  raw_answer TEXT,
  image_url TEXT,
  image_width INTEGER,
  image_height INTEGER,
  title TEXT,
  summary TEXT,
  layout TEXT,                  -- JSON LayoutSpec
  structured_spec TEXT,         -- JSON VisualSpec
  alignment_raw TEXT,           -- JSON 对齐结果
  calibration_data TEXT,        -- JSON 校准数据
  pinned_at INTEGER,            -- 置顶时间戳
  created_at INTEGER,
  updated_at INTEGER
)

-- 热点
hotspots (
  id TEXT PRIMARY KEY,
  storage_id TEXT UNIQUE,       -- "${chatImageId}:${hotspotId}"
  chat_image_id TEXT REFERENCES chat_images(id),
  hotspot_id TEXT,
  label TEXT,
  detail TEXT,
  bounds TEXT,                  -- JSON {x,y,width,height}
  alignment_source TEXT,
  ...
)

-- 追问线程
hotspot_threads (
  id TEXT PRIMARY KEY,
  hotspot_storage_id TEXT REFERENCES hotspots(storage_id),
  created_at INTEGER
)

-- 线程消息
hotspot_messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT REFERENCES hotspot_threads(id),
  role TEXT,                    -- user | assistant
  content TEXT,
  created_at INTEGER
)
```

---

## 12. API 参考

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/config` | 前端可见的运行时供应商配置 |
| POST | `/api/chatimages` | 生成并持久化 ChatImage |
| GET | `/api/chatimages` | 列出最近的 ChatImage |
| GET | `/api/chatimages/:id` | 加载已保存的 ChatImage |
| PATCH | `/api/chatimages/:id` | 更新校准数据 / 置顶 |
| DELETE | `/api/chatimages/:id` | 删除 ChatImage |
| POST | `/api/chatimages/:id/hotspots/:hotspotId/thread` | 热点追问 |
| POST | `/api/llm` | 文本模型代理 |
| POST | `/api/image` | 图像生成代理 |
| POST | `/api/vision` | 视觉对齐代理 |
| GET | `/api/llm/health` | 文本模型健康检查 |
| GET | `/api/vision/health` | 视觉端点健康检查 |

### 请求校验

- `validation.js` 校验 payload 结构、图像 URL 协议（仅 `http(s)` / `data:image`）、热点边界（0~1）
- SSRF 防护：拒绝 localhost / 私有 IP
- 并发闸门：`CHATIMAGE_MAX_UPSTREAM_REQUESTS=4`，超限返回 429

---

## 13. 测试策略

### 测试套件

| 套件 | 说明 | 命令 |
|------|------|------|
| 核心逻辑 | structure/layout/alignment/render/quality | `npm run test:core` |
| 服务端 | server/store/validation/concurrency | `npm run test:server` |
| 浏览器 | CDP 计算样式 + 布局断言（1440px + 390px） | `npm run test:browser` |
| 结构化文本 | 归一化 + mock spec 生成 | `npm run test:structured-text` |
| 定位 | locateanything/sam3 worker | `npm run test:locateanything` |
| 构建 | dist 产物完整性 | `npm run test:build` |
| Agent 评估 | 在线真实生图 + 视觉判官（13 案例） | `npm run test:agent-eval` |
| 全量 | 所有本地套件 | `npm test` |

### 浏览器测试契约

`browser.test.js` 在 1440×1000（桌面）和 390×920（移动）视口下断言：

- 热点常态：`borderTopWidth=0px`、`backgroundColor=transparent`、`::after content=none`
- 校准态：`outlineStyle=solid`、背景非透明、`::before` 非 none
- `.workspace`：桌面 `grid` / 移动 `block`
- 详情面板：宽≥760px、预览≥340px、摘要≥250px
- `.image-frame`：桌面≥1000px
- 图像精确填满舞台（delta<1px）
- 侧边栏折叠：`#historyPanel` 宽度收缩、`.chat-shell` 左移

### Agent 评估

7 项自动指标：`visual_mode`、`keyword_coverage`、`hotspot_coverage`、`click_detail`、`detail_quality`、`image_generation`、`diversity_fields`。可选手动 `expectedBounds` IoU。

覆盖 13 个案例：流程/对比/地图/海报/场景/产品图。离线模式（mock）全 100 分；在线模式受上游模型稳定性影响。

---

## 14. 已知限制与设计取舍

### 设计取舍

| 取舍 | 理由 |
|------|------|
| 两趟生成而非单趟坐标控制 | 生图模型不保证精确遵循坐标，先生成再定位更可靠 |
| 热点点击用矩形而非 mask polygon | 简化命中测试，mask 仅用于预览 |
| 视觉模型独立于文本模型 | 文本模型把图片链接当普通文本解释，无法定位 |
| `detail` 经 sanitizeDetailForUser 清洗 | LLM 会回显 regionPrompt 指令式文本，需剔除 |
| 缺模块不再整盘作废 | 一个定位失败不应连累其余正确定位 |

### 已知限制

- **文件上传**：仅支持文本类文件（代码/MD/CSV/JSON/日志），最多 5 个 × 512KB，12,000 字符上限。PDF/Word/PPT/Excel/图片/压缩包不支持。
- **在线视觉稳定性**：LocateAnything/MiMo 视觉定位在复杂地图场景下仍可能漏检模块，依赖上游模型质量。
- **`app.js` 单文件**：~1900 行 IIFE，未拆分（列为后续 P1 重构项）。
- **`styles.css`**：已从 4600 行重写为 2200 行单一来源，但仍可进一步拆分为 base/layout/components。

---

## 15. 配置参考

### 环境变量（`.env.local`）

| 变量 | 默认 | 说明 |
|------|------|------|
| `CHATIMAGE_PORT` | `5178` | 本地服务器端口 |
| `CHATIMAGE_TEXT_API_KEY` | — | 文本模型 API 密钥 |
| `CHATIMAGE_TEXT_BASE_URL` | — | OpenAI 兼容文本 API 基础 URL |
| `CHATIMAGE_TEXT_MODEL` | `gpt-5.5` | 文本模型名称 |
| `CHATIMAGE_API_KEY` | — | 图像生成 API 密钥 |
| `CHATIMAGE_IMAGE_MODEL` | — | 图像模型名称（仅显示） |
| `CHATIMAGE_VISION_MODE` | `local-ocr` | 视觉对齐模式 |
| `CHATIMAGE_VISION_ENDPOINT` | — | 视觉端点 URL |
| `CHATIMAGE_VISION_AUTH_MODE` | `bearer` | 视觉认证模式 |
| `CHATIMAGE_LOCATEANYTHING_MODEL` | `nvidia/LocateAnything-3B` | LocateAnything 模型 |
| `CHATIMAGE_LOCATEANYTHING_LICENSE_ACK` | — | 许可确认（`research-evaluation`） |
| `CHATIMAGE_SAM3_ENABLED` | `false` | 启用 SAM3 精修 |
| `CHATIMAGE_DATABASE_PATH` | `tmp/chatimage.sqlite` | SQLite 路径 |
| `CHATIMAGE_STATIC_DIR` | — | 静态目录（`dist`） |
| `CHATIMAGE_MAX_UPSTREAM_REQUESTS` | `4` | 上游并发上限 |

### 运行模式

| 模式 | URL 参数 | 需要密钥 | 说明 |
|------|----------|----------|------|
| mock | `?provider=mock` | 否 | 确定性本地供应商 + SVG mock |
| api | `?provider=api` | 是 | 调用配置的真实供应商 |
| auto | — | — | 前端根据后端配置自动选择（默认） |

### 视觉对齐就绪检查

1. `GET /api/config` → 报告密钥可用性
2. `GET /api/llm/health` → 文本模型预检
3. `CHATIMAGE_VISION_ENDPOINT` 已配置（或默认 Wuyin GPT5.5）
4. `GET /api/vision/health` → `ok:true, imageVisible:true`

---

## 归档文档

以下历史文档已移至 [`docs/archive/`](archive/)，保留用于追溯设计决策和修复历史，但不再作为活跃文档维护：

- `technical-design.md` — 原始技术设计文档（部分已过时）
- `requirements.md` — 产品需求文档
- `agent-evaluation.md` — Agent 评估方法论
- `vision-endpoint-contract.md` — 视觉端点集成契约
- `development-log.md` — 开发日志（2026-05-28 ~ 2026-06-03）
- `code-review-2025-06-09.md` — 代码审查报告
- `frontend-audit-2026-06-20.md` — 前端审美审查报告
- `hotspot-detail-fix-2026-06-20.md` — 热点定位与详解修复报告
- `latest-common-case-test-report.md` — 常见用例测试报告
- `mimo-vision-sam3-progress.md` — MiMo 视觉 + SAM3 进展
- `test-questions.md` — 测试问题集

---

*本报告由项目开发团队维护。如有疑问请提 [GitHub Issue](https://github.com/wencanjiang/ChatImage/issues)。*
