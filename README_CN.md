<p align="center">
  <img src="docs/assets/logo.svg" alt="ChatImage" width="120" />
</p>

# ChatImage

<p align="center">
  <a href="Arxiv/chatimage_paper/chatimage.pdf"><img src="https://img.shields.io/badge/Paper-draft-b31b1b?style=flat-square&logo=arxiv" alt="Paper draft" /></a>
  <a href="docs/index.html"><img src="https://img.shields.io/badge/Project%20page-demo-1f6feb?style=flat-square&logo=googlechrome" alt="Project page" /></a>
  <a href="docs/TECHNICAL_REPORT.md"><img src="https://img.shields.io/badge/Technical%20report-docs-25a36a?style=flat-square&logo=googledocs" alt="Technical report" /></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node.js-22.5%2B-339933?style=flat-square&logo=nodedotjs" alt="Node.js 22.5+" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue?style=flat-square&logo=opensourceinitiative" alt="MIT license" /></a>
</p>

> ChatImage 将长篇 LLM 回答转化为一张可交互的生成图：用户可以点击图中区域，查看局部解释，并围绕该区域继续追问。

<p align="center">
  <img src="docs/assets/demos/real-west-lake-tour-map.png" alt="West Lake hand-drawn tour map ChatImage demo" width="760" />
</p>

[English](README.md) | 简体中文

## 项目定位

ChatImage 是一个本地优先的交互式图像回答原型。它不是把图片当作文字旁边的装饰，而是尝试让生成图本身承担解释任务：系统先规划一份结构化视觉答案，再生成一张完整图片，随后把可点击热点对齐到真实渲染出来的内容上。

这个仓库同时包含应用原型、公开 demo、技术报告和论文草稿，方便继续做实验、展示和复现。

## 核心能力

- **可交互的视觉回答**：在生成图上叠加透明热点，用户可以直接点击图中对象或区域。
- **区域级解释**：每个热点都有独立标题、摘要、详细说明和上下文追问线程。
- **视觉对齐热点**：真实 provider 模式下，可使用 LocateAnything、MiMo vision、本地 OCR 和可选 SAM 掩码精修，将热点移动到图中实际出现的位置。
- **支持 mock 与真实 provider**：`mock` 模式不需要密钥；`api` 模式通过本地后端代理文本、图像和视觉 provider，密钥不会进入浏览器。
- **本地持久化**：生成结果、热点、校准数据和追问历史保存到 SQLite。
- **文本文件上下文**：可以附加代码、Markdown、CSV、JSON、日志等文本类文件作为提示词上下文。
- **轻量前端**：浏览器端使用原生 JavaScript，构建脚本零依赖，输出静态资源到 `dist/`。

## 快速开始

环境要求：

- Node.js 22.5 或更高版本
- npm
- 可选：Python 3.9+，用于本地 OCR、LocateAnything 或 SAM 精修
- 可选：CUDA GPU，用于本地视觉 worker

启动本地服务：

```bash
git clone https://github.com/wencanjiang/ChatImage.git
cd ChatImage
npm install
npm start
```

打开公开 demo 页面：

```text
http://127.0.0.1:5178/docs/index.html
```

不配置 API 密钥，直接生成一个确定性的本地 mock 示例：

```text
http://127.0.0.1:5178?provider=mock
```

## 使用真实 Provider

复制环境变量模板，并填写你要使用的 provider：

```bash
cp .env.example .env.local
```

Windows PowerShell：

```powershell
Copy-Item .env.example .env.local
```

常用变量：

| 变量 | 作用 |
| --- | --- |
| `CHATIMAGE_PORT` | 本地服务端口，默认 `5178`。 |
| `CHATIMAGE_TEXT_API_KEY` | 文本模型 API 密钥。 |
| `CHATIMAGE_TEXT_BASE_URL` | OpenAI 兼容的文本 API 基础地址。 |
| `CHATIMAGE_TEXT_MODEL` | 文本模型名称。 |
| `CHATIMAGE_API_KEY` | 图像生成 API 密钥。 |
| `CHATIMAGE_IMAGE_MODEL` | 图像生成模型名称。 |
| `CHATIMAGE_IMAGE_API_SIZE` | 向图像网关请求的位图尺寸。 |
| `CHATIMAGE_VISION_MODE` | 视觉对齐模式：`local-ocr`、`locateanything`、`mimo-vision` 或 `remote`。 |
| `CHATIMAGE_VISION_FALLBACK_MODE` | 可选的视觉对齐 fallback 模式。 |
| `CHATIMAGE_SAM3_ENABLED` | 在相关依赖配置完成后，启用可选 SAM 掩码精修。 |
| `CHATIMAGE_DATABASE_PATH` | SQLite 数据库路径，默认 `tmp/chatimage.sqlite`。 |
| `CHATIMAGE_STATIC_DIR` | 后端服务的静态目录，例如构建后的 `dist`。 |

真实密钥只应放在 `.env.local`。浏览器只访问本地后端，实际上游调用由后端完成。

## Demo 展示页

公开 demo 不是单独手写出来的一条产品路径。它展示的是同一套生成与视觉对齐流程跑出的精选结果，并导出到 `docs/assets/demos/`，这样访问者不需要 API 密钥、模型权重或 GPU，也能检查交互效果。

当前发布 demo 需要通过严格视觉对齐门槛：每个热点都要有主要视觉定位来源、掩码数据、可用的抠图或 organic 预览，以及向外扩展后的 organic bounds。

| Demo | 类型 | 热点数 | 入选原因 |
| --- | --- | ---: | --- |
| West Lake hand-drawn tour map | 地图 | 9 | 自然景区区域可点击，没有数字 pin 或人为切分边框。 |
| Healthy breakfast options | 场景 | 6 | 早餐食物对象边界清晰，适合做营养和适用场景解释。 |
| Boutique coffee shop scene | 场景 | 6 | 吧台、座位、甜品柜和排队区等空间目标清楚。 |
| Sunny reading nook | 场景 | 5 | 小型室内场景稳定，物体边界明确。 |
| Independent record-store corner | 场景 | 5 | 零售空间较密集，但区域仍可读。 |
| Indoor plant care corner | 场景 | 5 | 日常养护工具和植物目标区分度较好。 |

较弱或被拒绝的 case 记录在 `docs/demo-eligibility.md`，用于说明失败模式，避免只展示好看的成功样例。

## 工作流程

1. 用户在浏览器中提交问题。
2. 文本模型或确定性的 mock provider 生成长篇回答。
3. 系统将回答整理成结构化视觉计划，包括区域和辅助说明。
4. 图像 provider 根据该计划生成一张完整图片。
5. 视觉对齐阶段检查这些计划区域在生成图中实际出现的位置。
6. 前端在通过校验的区域上叠加可点击热点。
7. 用户点击热点后，查看该区域解释并继续追问。
8. 结果保存到本地，后续可以重新打开或校准。

## 目录概览

| 路径 | 作用 |
| --- | --- |
| `index.html`、`styles.css`、`src/` | 浏览器应用、渲染、生成编排、布局、对齐和交互状态。 |
| `server.js`、`server/` | 本地 HTTP 服务、API 路由、provider 适配、校验和 SQLite 持久化。 |
| `tests/` | 单元、集成、浏览器、provider、安全和真实诊断测试。 |
| `docs/` | 项目页、技术报告、demo 资源和历史工程记录。 |
| `Arxiv/chatimage_paper/` | 论文草稿、LaTeX 源码、实验表格和配图。 |
| `scripts/` | 构建与维护脚本。 |

## 构建

```bash
npm run build
```

用本地服务运行构建产物：

```bash
CHATIMAGE_STATIC_DIR=dist npm start
```

Windows PowerShell：

```powershell
$env:CHATIMAGE_STATIC_DIR = "dist"
npm start
```

## 测试

运行完整本地测试：

```bash
npm test
```

运行常用子集：

```bash
npm run test:core
npm run test:server
npm run test:browser
npm run test:docs-demos
npm run test:structured-text
```

真实 provider 测试是 opt-in，因为可能调用付费 API 或本地模型 worker：

```bash
npm run test:api
npm run test:real-diagnostics
npm run test:real-visual-acceptance
```

## 论文与文档

| 资源 | 说明 |
| --- | --- |
| [论文草稿](Arxiv/chatimage_paper/chatimage.pdf) | 单栏技术论文草稿，覆盖任务、方法、实现和当前真实 provider 实验。 |
| [技术报告](docs/TECHNICAL_REPORT.md) | 系统参考文档，包含架构、数据流、视觉对齐、API 行为、测试和限制。 |
| [项目页](docs/index.html) | 静态项目页和交互式 demo gallery。 |
| [测试 case 目录](docs/test-cases-catalog.md) | 常见 demo 和评测 prompt 的场景覆盖说明。 |

## 安全说明

- 不要提交 `.env.local` 或真实 provider 密钥。
- API 密钥只由后端使用，不暴露在前端代码中。
- 服务端会校验路由输入、图像 URL 协议、请求体大小和热点边界。
- 上游调用使用可配置超时和并发限制。
- `tmp/` 下的本地数据库、生成图和诊断信息已被 Git 忽略。

## Roadmap

- 将交互式 ChatImage 导出为可分享的 HTML 包。
- 支持更丰富的 PDF、Word、表格、幻灯片和图片输入解析。
- 改进生成图与热点定位的自动视觉 QA。
- 增加用户可选的视觉模板和布局风格。
- 支持云端持久化和多设备历史同步。

## 引用

如果 ChatImage 对你的研究或原型有帮助，可以引用当前论文草稿：

```bibtex
@misc{chatimage2026,
  title  = {ChatImage: Turning Long-Form LLM Answers into Interactive Visual Images},
  author = {ChatImage Contributors},
  year   = {2026},
  url    = {https://github.com/wencanjiang/ChatImage}
}
```

## 许可证

[MIT](LICENSE) (c) ChatImage Contributors
