"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { createConfig, createServer } = require("../server");
const {
  applyTextBudgets,
  buildStyleImagePrompt,
  createLayout
} = require("../src/layout");

const SAMPLES = [
  {
    id: "agent-workflow",
    question: "大模型 Agent 工作流程",
    spec: {
      title: "大模型 Agent 工作流程",
      language: "zh-CN",
      summary: "Agent 通过感知、规划、记忆、行动和反馈形成可迭代闭环。",
      relationType: "flow",
      visualComposition: {
        compositionType: "swimlane-flow",
        visualFocus: "从输入到反馈的闭环路径",
        primaryModules: ["module_2", "module_4", "module_5"],
        secondaryModules: ["module_1", "module_3"],
        densityStrategy: "用主路径、状态标签和反馈回路表现流程，避免五张等宽大卡片平铺。"
      },
      modules: [
        {
          id: "module_1",
          title: "接收输入",
          imageText: "识别目标、约束与上下文",
          detail: "Agent 首先解析用户意图、任务边界、可用上下文和外部环境状态。输入质量会影响后续规划颗粒度，也决定是否需要补充信息、调用工具或检索记忆。",
          sourceExcerpt: "解析用户意图、任务边界、上下文和环境状态。",
          iconHint: "target",
          priority: 1
        },
        {
          id: "module_2",
          title: "思考规划",
          imageText: "拆解步骤并选择执行策略",
          detail: "模型把目标拆成可执行子任务，判断依赖关系、风险点和完成顺序。复杂任务通常会形成计划、检查点和备用路径，而不是直接给出一次性答案。",
          sourceExcerpt: "拆解可执行子任务，判断依赖关系和完成顺序。",
          iconHint: "nodes",
          priority: 2
        },
        {
          id: "module_3",
          title: "记忆检索",
          imageText: "调用短期与长期上下文",
          detail: "Agent 会读取当前对话、任务状态、历史偏好或外部知识库，减少重复询问并保持任务连续性。记忆也需要被过滤，避免无关信息干扰判断。",
          sourceExcerpt: "读取当前对话、任务状态、历史偏好或外部知识库。",
          iconHint: "layout",
          priority: 3
        },
        {
          id: "module_4",
          title: "工具行动",
          imageText: "调用 API、搜索或执行代码",
          detail: "当内部推理不足以完成任务时，Agent 会选择合适工具并传入参数，例如搜索资料、读取文件、运行代码或调用业务 API。工具结果会回到模型继续判断。",
          sourceExcerpt: "选择工具并传入参数，工具结果回到模型继续判断。",
          iconHint: "image",
          priority: 4
        },
        {
          id: "module_5",
          title: "反馈迭代",
          imageText: "评估结果并修正下一步",
          detail: "Agent 会检查输出是否满足目标、是否出现错误或遗漏，并根据反馈更新计划。这个循环让它能处理开放式任务，但也要求有明确终止条件。",
          sourceExcerpt: "检查输出是否满足目标，根据反馈更新计划。",
          iconHint: "step",
          priority: 5
        }
      ]
    }
  },
  {
    id: "rest-graphql",
    question: "REST 和 GraphQL 的差异",
    spec: {
      title: "REST 与 GraphQL 对比",
      language: "zh-CN",
      summary: "两者核心差异在资源建模、查询粒度、缓存方式和演进成本。",
      relationType: "compare",
      visualComposition: {
        compositionType: "matrix",
        visualFocus: "资源端点与查询图谱的对照",
        primaryModules: ["module_1", "module_2"],
        secondaryModules: ["module_3", "module_4", "module_5"],
        densityStrategy: "用双栏矩阵承载差异，用底部场景建议收束结论。"
      },
      modules: [
        {
          id: "module_1",
          title: "资源模型",
          imageText: "REST 按资源端点组织",
          detail: "REST 通常围绕资源 URL 和 HTTP 方法建模，例如 GET /users、POST /orders。它的边界清晰、语义直观，适合资源关系稳定的服务接口。",
          sourceExcerpt: "REST 围绕资源 URL 和 HTTP 方法建模。",
          iconHint: "nodes",
          priority: 1
        },
        {
          id: "module_2",
          title: "查询粒度",
          imageText: "GraphQL 由客户端声明字段",
          detail: "GraphQL 用单一查询入口描述需要的字段和嵌套关系，客户端能减少过度获取或多次请求。但查询自由度更高，也需要服务端控制复杂度。",
          sourceExcerpt: "GraphQL 用单一查询入口描述字段和嵌套关系。",
          iconHint: "target",
          priority: 2
        },
        {
          id: "module_3",
          title: "缓存性能",
          imageText: "REST 天然契合 HTTP 缓存",
          detail: "REST 更容易利用 HTTP 状态码、缓存头和 CDN。GraphQL 通常需要额外设计查询缓存、字段级缓存或持久化查询，否则性能治理会更复杂。",
          sourceExcerpt: "REST 更容易利用 HTTP 缓存，GraphQL 需要额外缓存设计。",
          iconHint: "step",
          priority: 3
        },
        {
          id: "module_4",
          title: "演进成本",
          imageText: "GraphQL Schema 承担契约治理",
          detail: "REST 常通过版本化端点演进，GraphQL 更多依赖 Schema、字段废弃和类型约束管理兼容性。前者简单直接，后者适合多端统一数据契约。",
          sourceExcerpt: "GraphQL 依赖 Schema、字段废弃和类型约束管理兼容性。",
          iconHint: "layout",
          priority: 4
        },
        {
          id: "module_5",
          title: "适用场景",
          imageText: "多端复杂视图更适合 GraphQL",
          detail: "如果接口稳定、缓存优先、团队希望保持简单，REST 更合适；如果移动端、Web 端和后台需要不同字段组合，GraphQL 能减少接口碎片。",
          sourceExcerpt: "接口稳定缓存优先选 REST，多端字段组合复杂选 GraphQL。",
          iconHint: "idea",
          priority: 5
        }
      ]
    }
  },
  {
    id: "http-render",
    question: "从输入 URL 到页面渲染发生了什么",
    spec: {
      title: "URL 到页面渲染",
      language: "zh-CN",
      summary: "浏览器从解析地址开始，经过网络请求、资源解析和渲染合成显示页面。",
      relationType: "timeline",
      visualComposition: {
        compositionType: "timeline",
        visualFocus: "浏览器主线程与网络线程的协作链路",
        primaryModules: ["module_2", "module_4", "module_5"],
        secondaryModules: ["module_1", "module_3"],
        densityStrategy: "用分段时间线和线程标签表现顺序，同时加入关键状态点提升密度。"
      },
      modules: [
        {
          id: "module_1",
          title: "解析地址",
          imageText: "补全协议并检查缓存",
          detail: "浏览器会解析 URL、补全协议、判断是否命中本地缓存或 Service Worker，并检查 HSTS、重定向等规则，为后续网络请求确定目标。",
          sourceExcerpt: "解析 URL、补全协议、检查缓存和重定向规则。",
          iconHint: "target",
          priority: 1
        },
        {
          id: "module_2",
          title: "DNS 与连接",
          imageText: "找到 IP 并建立 TCP/TLS",
          detail: "浏览器通过 DNS 获取服务器 IP，然后建立 TCP 连接；HTTPS 还需要 TLS 握手确认加密参数和证书。连接复用会减少重复握手成本。",
          sourceExcerpt: "DNS 获取 IP，建立 TCP 连接，HTTPS 进行 TLS 握手。",
          iconHint: "nodes",
          priority: 2
        },
        {
          id: "module_3",
          title: "请求响应",
          imageText: "发送 HTTP 并接收 HTML",
          detail: "浏览器发送 HTTP 请求，服务端返回状态码、响应头和正文。缓存头、压缩、重定向和安全策略都会影响资源是否继续下载与解析。",
          sourceExcerpt: "服务端返回状态码、响应头和正文，缓存头影响后续解析。",
          iconHint: "image",
          priority: 3
        },
        {
          id: "module_4",
          title: "解析资源",
          imageText: "构建 DOM、CSSOM 与依赖图",
          detail: "HTML 解析生成 DOM，CSS 解析生成 CSSOM，脚本可能阻塞或修改文档。浏览器还会发现图片、字体、脚本等子资源并并行加载。",
          sourceExcerpt: "HTML 生成 DOM，CSS 生成 CSSOM，脚本可能阻塞文档。",
          iconHint: "layout",
          priority: 4
        },
        {
          id: "module_5",
          title: "渲染合成",
          imageText: "布局、绘制并提交到屏幕",
          detail: "渲染引擎计算元素尺寸位置，生成绘制指令，再把图层交给合成线程输出到屏幕。动画、滚动和 GPU 合成会影响最终流畅度。",
          sourceExcerpt: "计算布局、生成绘制指令，把图层合成输出到屏幕。",
          iconHint: "step",
          priority: 5
        }
      ]
    }
  }
];

async function main() {
  const apiKey = process.env.CHATIMAGE_API_KEY || process.env.WUYIN_API_KEY;
  if (!apiKey) {
    console.log("real-image-quality-samples.js skipped: CHATIMAGE_API_KEY is not set");
    return;
  }

  const artifactDir = path.join(process.cwd(), "tmp", "image-quality-samples");
  fs.mkdirSync(artifactDir, { recursive: true });

  const server = createServer(
    createConfig({
      port: 0,
      apiKey,
      databasePath: path.join(artifactDir, "probe.sqlite")
    })
  );

  await listen(server);
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;
  const selectedSamples = selectSamples(SAMPLES, process.env);
  const report = {
    checkedAt: new Date().toISOString(),
    count: selectedSamples.length,
    samples: []
  };

  try {
    for (const sample of selectedSamples) {
      const uid = createUidFactory(sample.id);
      const layout = createLayout(sample.spec, { uid });
      const visualSpec = applyTextBudgets(sample.spec, layout);
      const prompt = buildStyleImagePrompt(visualSpec, layout);
      const promptPath = path.join(artifactDir, `${sample.id}-prompt.txt`);
      fs.writeFileSync(promptPath, prompt);

      const startedAt = Date.now();
      try {
        const imageResult = await postJson(`${baseUrl}/api/image`, {
          prompt,
          size: "1600x900",
          model: null
        });
        assert.ok(imageResult.imageUrl, "image API must return imageUrl");
        const artifact = await downloadImageArtifact(
          imageResult.imageUrl,
          path.join(artifactDir, `${sample.id}.png`)
        );

        const result = {
          id: sample.id,
          question: sample.question,
          ok: true,
          durationMs: Date.now() - startedAt,
          width: imageResult.width || null,
          height: imageResult.height || null,
          detectedDimensions: artifact.dimensions,
          byteLength: artifact.byteLength,
          imageUrl: imageResult.imageUrl,
          artifactPath: artifact.filePath,
          promptPath
        };
        report.samples.push(result);
        console.log(
          `${sample.id}: ok / ${result.width || "?"}x${result.height || "?"} / ${artifact.byteLength} bytes`
        );
      } catch (error) {
        const result = {
          id: sample.id,
          question: sample.question,
          ok: false,
          durationMs: Date.now() - startedAt,
          error: error.message,
          promptPath
        };
        report.samples.push(result);
        console.log(`${sample.id}: failed / ${error.message}`);
      }
    }
  } finally {
    fs.writeFileSync(
      path.join(artifactDir, "image-quality-report.json"),
      JSON.stringify(report, null, 2)
    );
    await close(server);
  }
}

function selectSamples(samples, env) {
  const requestedId = String(env.CHATIMAGE_IMAGE_QUALITY_SAMPLE || "").trim();
  let selected = requestedId
    ? samples.filter((sample) => sample.id === requestedId)
    : samples.slice();
  const limit = Number(env.CHATIMAGE_IMAGE_QUALITY_LIMIT || 0);
  if (Number.isFinite(limit) && limit > 0) selected = selected.slice(0, limit);
  if (requestedId && selected.length === 0) {
    throw new Error(`Unknown sample id: ${requestedId}`);
  }
  return selected;
}

function createUidFactory(seed) {
  let index = 0;
  return (prefix) => `${prefix}_${seed}_${++index}`;
}

async function downloadImageArtifact(imageUrl, filePath) {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Image artifact download failed (${response.status}): ${imageUrl}`);
  }
  const contentType = response.headers.get("content-type") || "";
  assert.match(contentType, /^image\//i);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.ok(bytes.length > 10_000, `Image artifact is too small: ${bytes.length} bytes`);
  fs.writeFileSync(filePath, bytes);
  return {
    filePath,
    byteLength: bytes.length,
    contentType,
    dimensions: getPngDimensions(bytes)
  };
}

function getPngDimensions(bytes) {
  if (bytes.length < 24) return null;
  const signature = bytes.subarray(0, 8).toString("hex");
  if (signature !== "89504e470d0a1a0a") return null;
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20)
  };
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    if (!server || !server.listening) {
      resolve();
      return;
    }
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(json.error || `POST ${url} failed with ${response.status}`);
  }
  return json;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  SAMPLES,
  createUidFactory,
  selectSamples
};
