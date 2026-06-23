# ChatImage 技术实现方案

## 1. 技术目标

ChatImage 的第一版目标是实现一个网页应用，将用户问题对应的 LLM 文本回答转换为“图片 + 透明热点层 + 点击详情”的交互式结果。

核心技术难点有两个：

- 如何把长文本稳定压缩成适合视觉表达的结构化数据。
- 如何让前端热点区域与生图结果中的视觉分区尽量一致。

MVP 的关键原则是：不要依赖生图模型自由发挥布局，而是由 ChatImage 先生成结构化布局，再让图片生成和热点层都基于同一份布局数据。

## 2. 推荐架构

系统由以下模块组成：

- Web 前端：聊天输入、生成状态、交互式图片展示、详情弹窗、放大和保存。
- API 服务：接收用户问题，编排 LLM、生图、存储和结果返回。
- LLM 回答模块：生成原始文本回答。
- 结构化解析模块：将原始回答转换为视觉信息结构。
- 布局规划模块：为每个信息模块分配固定区域和热点坐标。
- 生图提示词模块：把结构化内容和布局要求转换成生图提示词。
- 图片生成模块：调用第三方文本转图片 API。
- 区域对话模块：基于 hotspot 创建独立追问分支，并管理多轮上下文。
- 存储模块：保存原文、结构化数据、图片 URL、热点数据、分支消息。

## 3. 端到端流程

1. 前端提交用户问题到 `POST /api/chatimage`.
2. 后端调用 LLM，生成原始文本回答。
3. 后端调用结构化解析 LLM，将回答转换为 JSON。
4. 后端根据 JSON 选择布局模板，并生成 normalized 坐标。
5. 后端生成生图 prompt。
6. 后端调用第三方生图 API。
7. 后端保存图片、LayoutSpec、hotspots 和 metadata 到 SQLite。
8. 后端返回图片 URL、热点坐标、详情内容。
9. 前端渲染图片，并在图片上叠加透明按钮区域。
10. 用户点击热点，前端展示对应详情。
11. 用户在该热点区域的详情面板中继续追问。
12. 前端提交 `chatImageId`、`hotspotId`、可选 `threadId` 和用户问题。
13. 后端读取原始问题、原始回答、当前 hotspot 详情和该 thread 历史消息，拼装局部上下文。
14. 后端调用 LLM 生成追问回答，并将消息追加到该 hotspot 的 thread。
15. 前端在当前热点详情面板中展示新的多轮回答。

## 4. 数据模型

### 4.1 ChatImageResult

```ts
type ChatImageResult = {
  id: string;
  question: string;
  rawAnswer: string;
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  title: string;
  summary: string;
  layout: LayoutSpec;
  hotspots: Hotspot[];
  threads?: HotspotThreadSummary[];
  createdAt: string;
};
```

### 4.1.1 LayoutSpec

布局不应只用 `grid-2x2 / grid-2x3 / flow-5 / compare-2` 四个枚举表示。更合适的设计是使用 `LayoutSpec` 描述一张图的结构、区域和热点绑定。

```ts
type LayoutSpec = {
  id: string;
  family: "grid" | "flow" | "compare" | "hub" | "timeline" | "matrix" | "freeform";
  aspectRatio: "16:9" | "4:5" | "1:1";
  canvas: {
    width: number;
    height: number;
    safeArea: Box;
  };
  regions: LayoutRegion[];
  validation?: {
    valid: boolean;
    errors: string[];
  };
};

type Box = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type LayoutRegion = {
  id: string;
  hotspotId?: string;
  role: "title" | "summary" | "module" | "connector" | "legend" | "decoration";
  bounds: Box;
  shape: "rect" | "pill" | "circle" | "polygon";
  anchor?: "top-left" | "top-right" | "bottom-left" | "bottom-right" | "center";
  zIndex: number;
};
```

热点层只绑定 `role = "module"` 且存在 `hotspotId` 的 region。标题、连接线、装饰元素可以参与视觉布局，但不一定可点击。

### 4.2 Hotspot

```ts
type Hotspot = {
  id: string;
  label: string;
  shortText: string;
  detail: string;
  sourceExcerpt?: string;
  iconHint?: string;
  x: number;
  y: number;
  width: number;
  height: number;
};
```

坐标使用 0 到 1 的 normalized 坐标，而不是像素坐标。前端根据图片当前显示尺寸实时换算点击区域，适配响应式布局和大图模式。

前端渲染图片时必须使用 `imageWidth/imageHeight` 预留舞台比例，并把同一尺寸写入 `<img width height>`。这样在图片资源还没加载完成时，透明热点层也有稳定坐标系，避免热点短暂塌缩或跳动。

示例：

```json
{
  "id": "module_1",
  "label": "核心结论",
  "shortText": "先抓住主要判断，再展开原因。",
  "detail": "这里保存该区域点击后展示的详细说明。",
  "iconHint": "target",
  "x": 0.06,
  "y": 0.22,
  "width": 0.40,
  "height": 0.28
}
```

### 4.3 HotspotThread

每个热点区域可以拥有一个独立 thread。MVP 推荐一个 hotspot 默认对应一个 thread，首次追问时创建；后续用户回到同一个 hotspot 时继续使用该 thread。

```ts
type HotspotThreadSummary = {
  id: string;
  hotspotId: string;
  messageCount: number;
  updatedAt: string;
};

type HotspotThread = {
  id: string;
  chatImageId: string;
  hotspotId: string;
  messages: HotspotMessage[];
  createdAt: string;
  updatedAt: string;
};

type HotspotMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};
```

### 4.4 上下文边界

区域追问的上下文应由以下部分组成：

- 原始用户问题。
- 原始 LLM 回答。
- 当前 ChatImage 的标题和摘要。
- 当前 hotspot 的标题、短文本、详情和原文引用。
- 当前 hotspot thread 的历史消息。

默认不注入其他 hotspot 的 thread 历史，避免不同区域的追问互相污染。若用户问题需要跨区域比较，可以注入所有 hotspot 的标题和短摘要，但仍不注入其他区域的完整追问记录。
实际 prompt 中会包含原始回答，但需要做长度裁剪，避免长回答挤占当前 hotspot 详情和 thread 历史。当前 MVP 对原始回答使用字符数上限截断，并保留“已截断”标记。

### 4.5 持久化表设计

当前 MVP 使用本地 SQLite 保存结构化结果和追问分支，默认路径为 `tmp/chatimage.sqlite`。后续可迁移到 PostgreSQL。

推荐表：

```sql
chat_images (
  id text primary key,
  question text not null,
  raw_answer text not null,
  title text not null,
  summary text not null,
  image_url text not null,
  image_width integer not null,
  image_height integer not null,
  layout_json text not null,
  provider_raw_json text not null,
  created_at timestamp not null,
  updated_at timestamp not null
);

hotspots (
  storage_id text primary key,
  id text not null,
  chat_image_id text not null references chat_images(id),
  label text not null,
  short_text text not null,
  detail text not null,
  source_excerpt text,
  icon_hint text,
  bounds_json text not null,
  unique (chat_image_id, id)
);

hotspot_threads (
  id text primary key,
  chat_image_id text not null references chat_images(id),
  hotspot_id text not null,
  created_at timestamp not null,
  updated_at timestamp not null,
  unique (chat_image_id, hotspot_id)
);

hotspot_messages (
  id text primary key,
  thread_id text not null references hotspot_threads(id),
  role text not null,
  content text not null,
  created_at timestamp not null
);
```

`hotspots.storage_id` 使用 `${chatImageId}:${hotspotId}` 作为数据库内部主键，避免不同 ChatImage 都使用 `module_1` 时发生主键冲突。业务层仍使用 `hotspots.id` 作为图片内 hotspotId。
`hotspots.bounds_json` 保存 normalized bounds，同时保存可选 `textBudget`，确保历史恢复后质量检查仍能验证图片内标题和短文本是否在预算内。

`unique (chat_image_id, hotspot_id)` 表示 MVP 中每个热点只有一个默认追问分支。后续如果要支持“同一热点开启多个分支”，可以移除该唯一约束，并增加 `title`、`parent_message_id` 或 `branch_name`。

## 5. 结构化解析设计

结构化解析模块输入原始 LLM 回答，输出严格 JSON。建议使用支持 JSON schema 或结构化输出的 LLM 接口。

输出字段建议：

```ts
type VisualContentSpec = {
  title: string;
  summary: string;
  relationType: "parallel" | "flow" | "compare" | "hierarchy";
  modules: {
    id: string;
    title: string;
    imageText: string;
    detail: string;
    iconHint: string;
    priority: number;
  }[];
};
```

约束：

- `modules` 控制在 3 到 6 个。
- `title` 不超过 18 个中文字符。
- `imageText` 不超过 28 个中文字符。
- `detail` 可以较长，但应来自原始回答。
- 不生成原始回答中没有的信息。

## 6. 布局规划方案

为了兼顾视觉灵活性和热点准确性，MVP 不建议只采用 4 个固定模板，也不建议完全交给生图模型自由排版。推荐采用“约束式自适应布局”：由 ChatImage 先生成机器可读的 `LayoutSpec`，再用同一份 `LayoutSpec` 驱动生图 prompt 和前端热点层。

### 6.1 为什么不用纯固定模板

只保留 `grid-2x2 / grid-2x3 / flow-5 / compare-2` 会有几个问题：

- 内容结构稍复杂时，很难表达中心主题、时间线、矩阵、因果链等形态。
- 所有图片容易长得像模板填空，产品感会比较弱。
- 用户点击区域虽然稳定，但视觉表达能力不足。
- 后续扩展模板会变成不断增加枚举，维护成本高。

### 6.2 推荐方案：布局组件库 + LayoutSpec

布局系统分两层：

- 布局 family：描述整体信息关系，例如 `grid`、`flow`、`compare`、`hub`、`timeline`、`matrix`。
- 布局 regions：描述具体区域坐标，每个模块 region 都绑定一个 hotspot。

可支持的 family：

- `grid`：多个并列模块，适合总结、清单、分类。
- `flow`：步骤、流程、路线图。
- `compare`：双方或多方对比。
- `hub`：中心主题 + 周围分支，适合概念解释。
- `timeline`：时间顺序、阶段演进。
- `matrix`：二维判断、优先级、象限分析。
- `freeform`：少量受控自由布局，用于特殊内容，但仍必须输出 region 坐标。

`grid-2x2 / grid-2x3 / flow-5 / compare-2` 可以保留为 family 内部的 preset，而不是整个系统的唯一模板。

### 6.3 热点优先的布局原则

布局规划必须先满足热点可点击，再追求视觉自由。

硬性规则：

- 每个可交互模块必须有唯一 `hotspotId`。
- 每个 `hotspotId` 必须对应一个 `LayoutRegion.bounds`。
- mock 模式下，hotspot 的实际点击区域直接来自 `LayoutRegion.bounds`。
- 真实 API 模式下，`LayoutRegion.bounds` 是生图前的近似布局；生图后必须通过视觉对齐把 module region 替换成真实卡片 bounds，再派生 hotspot。
- 模块 region 之间不能明显重叠。
- 最小点击区域不低于图片宽度的 12% 和高度的 12%，移动端可进一步放大。
- 标题、摘要、连接线、装饰图形不能遮挡模块热点。
- 所有坐标使用 normalized 坐标，范围为 0 到 1。

示例：

```json
{
  "family": "hub",
  "aspectRatio": "16:9",
  "regions": [
    {
      "id": "title",
      "role": "title",
      "bounds": { "x": 0.08, "y": 0.06, "width": 0.84, "height": 0.10 },
      "shape": "rect",
      "zIndex": 1
    },
    {
      "id": "center",
      "hotspotId": "module_1",
      "role": "module",
      "bounds": { "x": 0.35, "y": 0.34, "width": 0.30, "height": 0.24 },
      "shape": "circle",
      "anchor": "center",
      "zIndex": 2
    },
    {
      "id": "top_left",
      "hotspotId": "module_2",
      "role": "module",
      "bounds": { "x": 0.08, "y": 0.24, "width": 0.24, "height": 0.22 },
      "shape": "rect",
      "anchor": "top-left",
      "zIndex": 2
    }
  ]
}
```

### 6.4 布局生成流程

1. 结构化解析得到 `relationType`、模块数量、模块优先级和模块文本长度。
2. 布局规划器选择 layout family。
3. 布局规划器从 family 的 preset 中生成初始 region。
4. 根据模块数量和文本长度调整 region 尺寸。
5. 执行碰撞检测、最小点击面积检测、安全边距检测。
6. 若当前 family 校验失败，回退到更稳的自适应 grid；若仍失败，终止生成并返回布局错误。
7. 生成最终 `LayoutSpec`，并写入 `validation`。
8. mock 模式直接从 `LayoutSpec.regions` 派生 `hotspots`。
9. 真实 API 模式先用风格化 prompt 生图，再执行视觉对齐，把真实卡片 bounds 写回 `LayoutSpec.regions`，最后派生 `hotspots`。

关键点：不要假设生图模型会精确遵循坐标。mock SVG 可以做到坐标 100% 确定；真实生图必须让视觉模型测量最终图片里的真实卡片位置，热点只绑定测量后的 module region。

## 7. 生图 Prompt 设计

真实 API 模式采用两遍法。第一遍生图只要求图片好看、模块清晰、卡片独立可辨识，不再强求像素级坐标；第二遍视觉对齐负责定位真实卡片位置。

Prompt 应包含：

- 图片比例和尺寸。
- 标题文本。
- 模块数量。
- 每个模块的标题和短文本。
- 每个模块的 `textBudget`，包括标题每行字符数、标题最大行数、正文每行字符数和正文最大行数。
- icon 风格。
- 视觉风格。
- 卡片独立可辨识、不要合并相邻卡片、中文清晰可读。
- 禁止项，例如不要添加额外模块、不要改变模块标题、不要加入未支持事实。

示例 prompt 框架：

```text
Create a clean Chinese infographic in 16:9 ratio.
Title: "{title}"
Subtitle: "{summary}"

Cards:
1. title "{module1.title}", text "{module1.imageText}", icon representing "{module1.iconHint}".
2. title "{module2.title}", text "{module2.imageText}", icon representing "{module2.iconHint}".
3. title "{module3.title}", text "{module3.imageText}", icon representing "{module3.iconHint}".
4. title "{module4.title}", text "{module4.imageText}", icon representing "{module4.iconHint}".

Style: modern web app infographic, high readability, clear grid boundaries, simple icons, balanced spacing.
Every module must be an independent, clearly recognizable card. Do not merge cards.
Do not add extra sections. Do not invent new text. Keep all Chinese text legible.
```

当前实现会在布局完成后执行 `applyTextBudgets`：
- 主标题最长 18 个字符，摘要最长 46 个字符。
- 每个模块根据 `LayoutRegion.bounds` 和画布宽度计算 `textBudget`。
- 图片内模块标题和短文本会按预算截断，长解释仍保留在 hotspot detail 中。
- 生图 prompt 明确要求模型遵守 `textBudget`，必要时换行或缩小字号，不能让文本越过卡片边界。
- mock SVG 使用同一套预算渲染，避免本地样例和真实生图 prompt 的排版规则不一致。

### 7.1 视觉对齐 Prompt

第二遍对齐必须通过独立视觉模型接口完成，不能复用只处理文本的 `/api/llm`。输入包括图片 URL、图片尺寸、模块 `moduleId/title/imageText` 和近似布局族；输出只允许 JSON：

```json
{
  "modules": [
    {
      "moduleId": "module_1",
      "label": "目标识别",
      "bounds": { "x": 0.05, "y": 0.30, "width": 0.17, "height": 0.35 },
      "confidence": 0.9
    }
  ]
}
```

对齐结果必须通过以下校验：

- 每个结构化模块都有且只有一个返回项。
- 返回项必须能通过 `moduleId` 或精确标题匹配到结构化模块。
- `confidence >= 0.5`。
- bounds 必须在 0 到 1 范围内，满足最小点击面积、安全边距和重叠校验。
- 任一校验失败时，本次生成失败并允许用户重试；不能回退到生图前的旧坐标。
- 如果没有配置 `CHATIMAGE_VISION_ENDPOINT`，真实 API 模式必须在生图前失败，避免先消耗生图任务再输出无法准确点击的结果。
- `/api/vision/health` 用于接入阶段的能力探测：`GET` 返回配置状态，`POST` 发送测试图片并要求视觉上游返回可解析 JSON，且必须明确包含 `ok: true` 和 `imageVisible: true`。该检查不替代真实热点精度测试，只用于提前发现“接口不能收图”“输出不是 JSON”或“模型没有确认看见图片”的问题。

如果生图 API 对中文文字支持不稳定，建议采用替代方案：图片只生成背景、图标、容器和视觉结构，前端用 HTML/CSS 在相同布局上叠加真实文字。这个方案文字质量和热点精度更高，也更适合 MVP。

## 8. 文件上传输入

当前文件上传是前端本地读取方案：浏览器通过 `File.text()` 读取文本型文件，将文件名、类型、大小和截断后的正文拼入用户问题上下文，再进入原有的回答、结构化、生图和热点对齐链路。

支持范围：
- 文本与 Markdown：`.txt`、`.md`、`.markdown`、`.rst`、`.adoc`
- 表格与数据：`.csv`、`.tsv`、`.json`、`.jsonl`、`.ipynb`、`.yaml`、`.yml`、`.toml`
- 网页与结构化文本：`.html`、`.htm`、`.xml`、`.svg`
- 日志与配置：`.log`、`.ini`、`.conf`、`.config`、`.properties`、`.env`
- 常见代码文件：JS/TS/CSS/Python/Java/Go/Rust/C/C++/C#/PHP/Ruby/Swift/Kotlin/Shell/SQL/GraphQL 等

限制：
- 最多 5 个文件。
- 单个文件最大 512 KB。
- 单个文件进入 prompt 的正文最多 12,000 字符，超出后前端标记为“已截断”。
- 暂不支持 PDF、Word、PPT、Excel、图片和压缩包。原因是当前链路没有服务端文档解析、表格抽取、OCR 或视觉理解步骤；强行读取二进制会给模型传递不可用内容。

产品行为：
- 用户可点击“上传文件”或将文件拖拽到输入区。
- 有用户问题时，界面和历史记录显示原始问题；模型收到的是“原始问题 + 文件上下文”。
- 用户未输入问题但上传了文件时，默认问题为“请基于 N 个上传文件生成结构化总结。”。

## 9. 热点层实现

前端以相对定位容器承载图片和透明热点层。

```tsx
<div className="imageStage">
  <img src={result.imageUrl} alt={result.title} />
  {result.hotspots.map((hotspot) => (
    <button
      key={hotspot.id}
      className="hotspot"
      style={{
        left: `${hotspot.x * 100}%`,
        top: `${hotspot.y * 100}%`,
        width: `${hotspot.width * 100}%`,
        height: `${hotspot.height * 100}%`
      }}
      onClick={() => openDetail(hotspot)}
      aria-label={hotspot.label}
    />
  ))}
</div>
```

交互要求：

- 默认透明，但 hover 时显示轻微描边或半透明高亮。
- 当前实现中热点常态、hover、focus 和选中后都保持透明，不覆盖图片内容。
- 点击时通过短暂 pulse 动画反馈点击成功，动画结束后恢复完全透明。
- 键盘用户可以 tab 到每个 hotspot。
- 移动端点击区域不能过小。
- 选中 hotspot 后，详情面板进入该 hotspot 对应的 thread。

## 9. 区域追问实现

区域追问是 ChatImage 的核心交互扩展。它把“点击图片看详情”升级为“围绕图片局部继续对话”。

### 9.1 Thread 创建策略

MVP 推荐懒创建 thread：

- 用户首次点击 hotspot 时，只展示 detail，不立即创建 thread。
- 用户在该 hotspot 输入追问并提交时，后端创建 thread。
- 如果该 hotspot 已有 thread，则继续追加消息。
- 一个 `chatImageId + hotspotId` 默认只维护一个 active thread。

这样可以避免用户只是浏览热点区域时产生大量空 thread。

### 9.2 追问上下文构造

后端收到区域追问后，应构造专门的 prompt，而不是直接把用户问题转发给 LLM。

上下文结构：

```ts
type HotspotFollowupContext = {
  originalQuestion: string;
  rawAnswer: string;
  chatImageTitle: string;
  chatImageSummary: string;
  currentHotspot: {
    label: string;
    shortText: string;
    detail: string;
    sourceExcerpt?: string;
  };
  siblingHotspots: {
    id: string;
    label: string;
    shortText: string;
  }[];
  threadMessages: HotspotMessage[];
  userQuestion: string;
};
```

Prompt 规则：

- 回答必须优先围绕当前 hotspot。
- 可以引用原始回答补充背景。
- 当用户要求对比其他区域时，可以参考 sibling hotspots 的标题和短文本。
- 不要假装图片里有未提供的信息。
- 如果用户问题已经超出当前 hotspot，应说明与当前区域的关系，再给出回答。
- 原始回答和当前 hotspot 历史都必须有长度预算：原始回答只保留裁剪后的背景，历史消息只保留最近若干条，并限制单条消息与总历史长度，避免长分支把 prompt 撑爆。

### 9.3 追问回答生成

追问回答建议直接返回文本，不触发新的生图流程。

原因：

- 用户此时是在局部深挖，文本更快。
- 每轮追问都重新生图成本高、等待久。
- 新图会让主图和分支关系复杂化。

后续增强可以提供显式按钮“基于当前追问生成新图”，但不应作为默认行为。

### 9.4 前端状态

前端需要维护：

```ts
type ChatImageViewState = {
  selectedHotspotId: string | null;
  openPanel: boolean;
  activeThreadsByHotspotId: Record<string, HotspotThread>;
  pendingFollowupByHotspotId: Record<string, boolean>;
};
```

交互规则：

- 点击 hotspot 后设置 `selectedHotspotId`，打开详情面板。
- 详情面板打开后应获得焦点，键盘用户可以直接阅读、关闭或继续追问。
- `Escape` 应关闭当前详情面板；如果大图 modal 已打开，`Escape` 优先关闭大图 modal。
- 详情面板展示 hotspot detail 和该 hotspot 的 messages。
- 用户提交追问时，只锁定当前 hotspot 的输入框，不影响其他 hotspot 浏览。
- 追问失败时应在当前详情面板内展示错误，保留原追问文本，并允许用户直接重试。
- 切换 hotspot 时，保留之前 hotspot 的 thread 消息。
- 大图模式下点击 hotspot 应复用同一个 `selectedHotspotId` 和 thread。
- 追问成功后必须同时更新 `activeThreadsByHotspotId` 和当前 `result.threads` 快照，避免详情面板、调试区、导出或历史恢复使用到不一致的数据。

## 10. 大图与保存

### 10.1 大图查看

前端提供 image modal：

- 显示更大尺寸图片。
- 继续保留热点层。
- 继续支持点击热点打开对应详情和追问分支。
- 支持关闭。
- 移动端支持手势缩放可作为后续增强。

### 10.2 保存图片

MVP 可直接下载 `imageUrl` 对应图片。

保存文件名应根据 `imageUrl` 推导扩展名：mock SVG 使用 `.svg`，真实生图 URL 常见 `.png/.jpg/.webp` 应保留真实格式。标题作为文件名时需要清理 `/ \ : * ? " < > |` 等不稳定字符，避免浏览器或操作系统下载行为异常。

后续增强：

- 使用 canvas 合成图片和前端叠加文字。
- 导出包含热点 metadata 的交互式链接。
- 导出 HTML 包。

## 11. API 设计

### 11.1 创建 ChatImage

`POST /api/chatimage`

请求：

```json
{
  "question": "请解释一下大模型 Agent 的工作流程"
}
```

响应：

```json
{
  "id": "ci_123",
  "status": "completed",
  "title": "Agent 工作流程",
  "summary": "从任务理解到工具调用再到结果反馈。",
  "imageUrl": "https://example.com/images/ci_123.png",
  "imageWidth": 1600,
  "imageHeight": 900,
  "layout": {
    "id": "layout_123",
    "family": "flow",
    "aspectRatio": "16:9",
    "regions": []
  },
  "hotspots": []
}
```

### 11.2 查询状态

如果生成耗时较长，建议使用异步任务。

`GET /api/chatimage/:id`

响应：

```json
{
  "id": "ci_123",
  "status": "generating_image",
  "progressText": "正在生成交互式图片"
}
```

状态枚举：

- `answering`
- `structuring`
- `generating_image`
- `completed`
- `failed`

当前 Node MVP 已额外实现历史结果读取接口：

`GET /api/chatimages/:id`

响应：
```json
{
  "result": {
    "id": "ci_123",
    "question": "原始问题",
    "rawAnswer": "原始回答",
    "title": "标题",
    "summary": "摘要",
    "layout": {},
    "hotspots": [],
    "threads": [],
    "imageUrl": "data:image/svg+xml,...",
    "imageWidth": 1600,
    "imageHeight": 900,
    "imagePrompt": "生图提示词",
    "providerRaw": {},
    "createdAt": "2026-05-31T00:00:00.000Z",
    "updatedAt": "2026-05-31T00:00:00.000Z"
  }
}
```

前端点击“最近记录”时会调用该接口，把 `result` 恢复到当前页面，并把返回的 `threads` 写回各 hotspot 对应的本地 thread 缓存。这样刷新后不仅能看到历史图片，也能继续点击热点并查看之前的区域追问。

### 11.3 创建或继续区域追问

`POST /api/chatimage/:id/hotspots/:hotspotId/messages`

请求：

```json
{
  "threadId": "thread_123",
  "message": "这里为什么说工具调用是 Agent 的关键步骤？"
}
```

`threadId` 可选。没有传入时，后端查找该 `chatImageId + hotspotId` 的 active thread；如果不存在则创建。

响应：

```json
{
  "threadId": "thread_123",
  "hotspotId": "module_2",
  "messages": [
    {
      "id": "msg_1",
      "role": "user",
      "content": "这里为什么说工具调用是 Agent 的关键步骤？",
      "createdAt": "2026-05-28T10:00:00.000Z"
    },
    {
      "id": "msg_2",
      "role": "assistant",
      "content": "因为工具调用让 Agent 能把语言理解转化为实际操作，例如查询资料、执行代码或调用业务系统。",
      "createdAt": "2026-05-28T10:00:02.000Z"
    }
  ]
}
```

### 11.4 获取区域对话分支

`GET /api/chatimage/:id/hotspots/:hotspotId/thread`

响应：

```json
{
  "threadId": "thread_123",
  "hotspotId": "module_2",
  "messages": []
}
```

如果 thread 尚不存在，可以返回 `threadId: null` 和空消息列表。

## 12. 推荐技术栈

MVP 可使用：

- 前端：Next.js 或 Vite + React。
- 后端：Next.js API Routes / Node.js + Express / Python FastAPI。
- 数据库：PostgreSQL 或 SQLite。
- 文件存储：本地文件系统起步，后续迁移到对象存储。
- LLM：任意支持结构化输出的模型。
- 生图：先抽象成 provider interface，避免绑定单一供应商。

如果追求最快原型，推荐 Next.js 全栈实现：

- 页面、API、图片结果展示在同一个项目中完成。
- `app/api/chatimage/route.ts` 负责编排。
- `app/api/chatimage/[id]/hotspots/[hotspotId]/messages/route.ts` 处理区域追问。
- `lib/llm.ts`、`lib/imageProvider.ts`、`lib/layout.ts`、`lib/threadContext.ts` 分别封装模型、生图、布局和追问上下文。

当前静态 Node MVP 的实际拆分：

- `server.js`：负责装配配置、route handlers、store、provider 和静态资源根目录，保持薄入口。
- `server/http.js`：封装 `.env` 加载、JSON body 读取、API key 校验、JSON 响应和静态资源服务。
- `server/providers.js`：封装文本 API、生图 API、视觉 API、异步生图轮询、响应字段提取和上游错误格式化。
- `server/store.js`：封装 SQLite schema、迁移、ChatImage 保存、历史列表和 hotspot thread 持久化。
- `server/validation.js`：封装服务端输入校验，覆盖 ChatImage payload、热点坐标、Layout region、thread 归属和消息角色。
- `server/routes/config.js`：处理 `/api/config`。
- `server/routes/llm.js`：处理 `/api/llm` 文本代理。
- `server/routes/image.js`：处理 `/api/image` 生图代理。
- `server/routes/vision.js`：处理 `/api/vision` 视觉对齐代理。
- `server/routes/chatimages.js`：处理 ChatImage 结果、热点 thread 和消息持久化接口。
- `src/core.js`：前端和 Node 单元测试共用的纯函数，例如 `inferRelationType`、`chooseFamily`、`validateLayoutRegions`、`iconGlyph`。
- `src/structure.js`：封装结构化 prompt、JSON 提取、mock spec 和结构化结果归一化。
- `src/layout.js`：封装 LayoutSpec、region 规划、hotspot 派生和生图 prompt。
- `src/calibration.js`：封装手动热点校准 JSON 解析、bounds 校验、校准后 result 生成，以及手动校准与上一轮视觉对齐 bounds 的误差评估。
- `src/api-client.js`：封装前端运行配置、`GET/POST` 请求、`provider=mock/api/auto` 判断。
- `src/mock-svg.js`：封装本地 SVG mock 信息图渲染，避免 SVG 排版逻辑继续堆在 `app.js`。
- `src/state.js`：封装页面状态、详情抽屉、modal、thread 缓存和 pending 状态。
- `src/thread.js`：封装 hotspot thread 创建、追问上下文和消息追加。
- `src/service.js`：封装文本、结构化、布局、生图、持久化和追问编排。
- `src/quality.js`：封装图片尺寸、布局、热点绑定、文字预算和 prompt 约束质量检查。
- `src/render.js`：封装结果区、图片框、详情抽屉、debug 面板、历史列表和错误状态 HTML。

当前 `app.js` 主要承担 DOM 挂载、事件绑定和页面控制器逻辑，后续可继续压缩为更薄的 controller，或迁移到正式前端框架。

暂缓项：

- 暂不引入 Express、Next 或 Fastify，避免 MVP 在验证阶段被框架迁移打断。
- 暂不做 PostgreSQL，SQLite 继续承担本地 MVP 持久化。
- 暂不做 OCR 图片质量评估，先用人工验收和 prompt 约束提升质量。

## 13. Provider 抽象

图片生成需要封装 provider，避免后续更换 API 时改动业务逻辑。

当前无印科技生图接口虽然产品侧使用 GPT-Image-2，但 HTTP 请求体不接受 `model` 字段。实现约束：

- `CHATIMAGE_IMAGE_MODEL` 只用于配置展示和文档记录。
- `/api/image` 默认只向上游发送 `prompt` 和 `size`。
- 只有当调用方显式传入非空字符串 `model` 时才会转发 `model` 字段。
- 真实 API smoke test 覆盖省略 `model` 的路径。

图片尺寸必须由 provider adapter 显式返回：
- 优先读取上游响应中的 `width/height`、`w/h`、`image_width/image_height` 或 `imageWidth/imageHeight`。
- 如果上游没有返回尺寸，则读取图片资源头部解析 PNG/JPEG/SVG 的真实宽高。
- 如果上游返回 WebP 等当前无法解析头部尺寸的格式，响应 JSON 必须显式提供尺寸字段。
- 真实 API 模式不得把请求 `size` 当成最终图片尺寸；真实样本已经出现请求 `1600x900`、实际返回 `1536x1024` 的情况。
- 如果既没有响应尺寸，也无法从图片资源解析尺寸，应让生成失败，而不是回退到猜测尺寸。
- 尺寸值必须是像素级整数，不能把 normalized bounds 里的 `0.3/0.4` 误当成图片尺寸。

服务端不得把具体人物、机构或时效事实硬编码为“已核验上下文”。如果后续需要事实校验，应独立接入检索、RAG 或可信知识源，并在结果中保留来源和时间戳。

```ts
type ImageGenerationInput = {
  prompt: string;
  aspectRatio: "16:9" | "4:5" | "1:1";
  seed?: number;
};

type ImageGenerationResult = {
  imageUrl: string;
  width: number;
  height: number;
  providerRaw?: unknown;
};

interface ImageProvider {
  generate(input: ImageGenerationInput): Promise<ImageGenerationResult>;
}
```

## 14. 质量校验

MVP 至少做以下校验：

- 结构化 JSON schema 校验。
- 模块数量校验。
- 图片 URL 协议校验：持久化前只允许 `http(s)` URL 或 `data:image/*`，禁止 `javascript:`、`file:`、`data:text/html` 等非图片地址进入历史和保存链路。
- 图片 URL 可访问校验。
- 热点坐标范围校验。
- 区域追问必须校验 `hotspotId` 属于当前 `chatImageId`。
- thread 追加消息时必须校验 `thread.chatImageId` 和 `thread.hotspotId`。
- 持久化接口必须在写入 SQLite 前校验 ChatImage payload：必填字符串、图片尺寸、热点唯一 id、热点 normalized bounds、Layout region bounds。
- 持久化接口必须校验 `LayoutSpec.regions` 与 `hotspots` 的绑定关系：每个 hotspot 都要有一个 module region，每个 module region 必须引用已存在 hotspot，且 bounds 必须一致。
- 持久化接口必须复用布局质量校验：module region 需要满足安全边距、最小点击面积和重叠检测，不能只检查 normalized bounds。
- 如果 hotspot 携带 `textBudget`，持久化接口必须校验 `label` 不超过 `titleMaxChars`，`shortText` 不超过 `imageTextMaxChars`，避免明显会溢出的结果进入历史记录。
- thread 持久化接口必须校验消息数组、消息 id 唯一性、消息角色只能是 `user` 或 `assistant`。
- 前端展示时必须处理图片加载失败：显示错误状态，并允许基于当前问题重新生成。
- 前端开发调试区应展示原始文本回答、真实结构化解析成果 `structuredSpec`、`LayoutSpec`、生图 prompt、上游生图返回 `providerRaw`、视觉对齐返回、热点校准数据、校准误差评估和质量检查报告。质量检查至少覆盖图片尺寸、布局校验、hotspot 与 `LayoutSpec.regions` 绑定关系、文字预算和生图 prompt 关键约束；当报告为注意或失败时，应提供基于当前问题重新生成的入口。热点校准显示必须是开发态显式开关，默认热点层仍保持完全透明，避免影响用户体验。开发者可以编辑校准 JSON 并应用，应用时必须校验 bounds 范围、最小点击面积、安全边距和重叠，并同步更新 `hotspots`、`LayoutSpec.regions` 与 `alignmentRaw`；真实 API 模式下应保存校准后的结果。若 `alignmentRaw.previous` 存在视觉对齐数据，调试区还应输出手动校准与视觉对齐之间的中心点偏差、尺寸偏差、IoU、模块级状态和总体状态，用于评估视觉对齐模型的可靠性。

增强校验：

- 调用 OCR 检查图片中文字是否和结构化文本一致。
- 对生成图片做视觉审核，判断是否严重偏离模板。
- 若校验失败，自动重试生图。
- 对区域追问做上下文长度裁剪，避免历史消息过长。

## 15. 核心风险与应对

### 15.1 生图文字不稳定

风险：生图 API 可能生成错字、乱码、额外文字。

应对：

- MVP 优先选择文字渲染能力较强的 API。
- 限制图片内文字长度。
- 必要时采用“生图生成底图 + 前端叠加真实文字”的混合方案。

### 15.2 热点坐标偏移

风险：生图模型没有严格按照提示词布局，导致热点层覆盖不准。

应对：

- 使用 `LayoutSpec` 先生成可验证的模块 region。
- prompt 明确每个模块的区域、形状和位置。
- 前端热点层基于 `LayoutSpec.regions` 派生坐标。
- 对偏移严重的图片提供重新生成。
- 中期引入 OCR 或视觉检测校验。

### 15.3 响应慢

风险：LLM 回答、结构化、生图串行执行，总耗时较长。

应对：

- 前端显示分阶段进度。
- 结构化和 prompt 构建尽量轻量。
- 使用异步任务和轮询。
- 服务端代理对文本、生图和任务详情请求设置 `CHATIMAGE_API_REQUEST_TIMEOUT_MS` 超时，避免单次上游请求让前端无限等待。该超时通过 `AbortController` 中止本地等待与请求信号，但不能保证上游已经开始执行的任务立即停止，也不能把它描述成完全释放所有已建立 TCP 资源。当前实现额外提供 `CHATIMAGE_MAX_UPSTREAM_REQUESTS` 进程内并发上限，超过上限时返回 429；真实生产环境后续仍可继续接入上游任务取消接口、连接池限制和跨实例限流。
- 缓存相同问题或相同原文的生成结果。

### 15.4 成本高

风险：每次请求同时消耗文本模型和生图模型。

应对：

- MVP 增加用户生成频率限制。
- 失败重试设置上限。
- 只对较长回答自动生成 ChatImage，短回答保持文本。

### 15.5 分支上下文混乱

风险：用户从多个热点区域追问时，LLM 可能混入其他区域的历史，导致回答不像是在解释当前点击区域。

应对：

- 每个 hotspot 独立 thread。
- prompt 明确当前 hotspot 是主上下文。
- 默认不注入其他 hotspot 的追问历史。
- 前端始终显示当前区域标题和选中高亮。

## 16. MVP 里程碑

### 阶段 1：静态原型

- 输入问题。
- 模拟 LLM 文本。
- 使用固定 JSON 生成图片展示和热点层。
- 完成点击详情、区域追问面板、放大、保存。

### 阶段 2：真实 LLM + 结构化

- 接入 LLM 生成原始回答。
- 接入结构化 JSON 输出。
- 根据模块数选择布局模板。
- 接入区域追问接口，基于 mock 或真实 LLM 生成追问回答。

### 阶段 3：真实生图

- 接入第三方生图 API。
- 生成信息图图片。
- 与热点层联动。

### 阶段 4：质量与体验优化

- 错误处理和重试。
- 生成状态优化。
- 移动端适配。
- 保存图片优化。
- 成本和耗时监控。
- 分支上下文裁剪和追问体验优化。

## 17. 建议的第一版取舍

第一版建议优先做“可用、可信、可演示”，而不是追求完全由生图模型控制所有视觉元素。

最稳的 MVP 路线是：

1. LLM 生成原始回答。
2. LLM 将回答转为结构化 JSON。
3. ChatImage 使用 `LayoutSpec` 生成受约束但可自适应的模块区域和热点坐标。
4. 生图 API 按照 `LayoutSpec` 生成接近规划布局的信息图。
5. 前端叠加热点层、详情和区域追问入口。
6. 用户围绕 hotspot 的追问以独立 thread 文本回答，不默认重新生成图片。

如果图片中文字质量不稳定，应尽快切换为混合渲染方案：图片 API 负责视觉底图，前端负责真实文字和交互层。

## 18. 当前实现同步

截至 2026-05-31，静态前端仍保留可直接打开的源码入口，同时新增零依赖构建流水线，用于生成可部署的 `dist` 产物。前端已从单文件逐步拆出可测试模块：

- `src/core.js`：布局 family 选择、关系类型识别、热点坐标校验、图标 hint 映射等纯函数。
- `src/structure.js`：mock 结构化结果、结构化 prompt、JSON 提取、结构化结果归一化。
- `src/layout.js`：LayoutSpec 生成、布局 region 生成、hotspot 派生、生图 prompt 生成。
- `src/api-client.js`：运行时 provider 配置、mock/api/auto 判断、GET/POST 请求封装。
- `src/mock-svg.js`：本地 mock 信息图 SVG 渲染。
- `src/state.js`：页面状态、选中热点、抽屉开关、线程缓存和 pending 状态管理。
- `src/thread.js`：热点追问 thread 创建、局部上下文组装、用户/助手消息追加。
- `src/service.js`：文本回答、结构化、布局、生图、持久化和 hotspot followup 的端到端编排。
- `src/render.js`：结果区、图片框、详情抽屉、debug 面板、历史列表、生成中和失败状态 HTML 渲染。
- `src/app.js`：保留 DOM 挂载、状态展示和事件绑定，已从约 1230 行降到约 265 行。
- `scripts/build.js`：读取 `index.html` 中的脚本顺序，合并并做轻量压缩，压缩 `dist/index.html` 空白，输出 hash 资源、source map 和 `build-manifest.json`。

这次拆分的原则是先抽离纯函数和低耦合状态逻辑，再补上构建产物能力，避免在原型验证阶段被外部依赖安装或框架迁移打断。当前测试已覆盖 `core/structure/layout/api-client/mock-svg/state/thread/service/render` 独立模块，并继续通过浏览器端主流程测试校验热点点击、详情抽屉、追问和截图输出。

构建相关能力：

- `npm.cmd run build` 生成 `dist/index.html` 和 `dist/assets/chatimage.<hash>.min.{js,css}`。
- JS/CSS 均输出 `.map` 文件，JS source map 包含原始源码内容和行级映射。
- `server.js` 支持 `staticDir` / `CHATIMAGE_STATIC_DIR`，可以在源码目录和构建目录之间切换静态资源根目录。
- `tests/build.test.js` 会真实运行构建、检查 manifest/source map/hash 资源，并启动服务验证 `dist` 可被读取。
- `tests/browser-dist.test.js` 会用 `dist` 作为静态资源根目录启动真实浏览器 smoke，验证打包后的单文件 JS 能完成 mock 生成、热点渲染和详情抽屉打开。
