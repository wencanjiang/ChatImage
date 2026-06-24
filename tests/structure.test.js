"use strict";

const assert = require("assert");
const {
  assessAnswerStructureQuality,
  buildAnswerStructurePrompt,
  buildMockSpec,
  buildStructurePrompt,
  compactTitle,
  extractQuestionSubject,
  inferQuestionLanguage,
  inferRegionKind,
  inferVisualMode,
  normalizeAnswerStructure,
  normalizeVisualMode,
  normalizeRelationType,
  normalizeVisualSpec,
  parseJsonFromText,
  repairThinMapDetail
} = require("../src/structure");

function main() {
  assert.strictEqual(compactTitle("介绍一下 ChatImage 的产品价值。"), "介绍一下 ChatImage 的产品");
  assert.strictEqual(compactTitle(""), "ChatImage 结构图");
  assert.strictEqual(normalizeRelationType("FLOW"), "flow");
  assert.strictEqual(normalizeRelationType("unknown"), "hierarchy");
  assert.strictEqual(inferVisualMode("手绘地图，西湖，点击地理区域展示风貌"), "map");
  assert.strictEqual(inferVisualMode("解释 Kubernetes 应用部署架构，覆盖 Pod、Deployment、Service、Ingress、ConfigMap、Secret"), "infographic");
  assert.strictEqual(inferVisualMode("画一个未来博物馆的沉浸式插画场景，包含导览机器人"), "scene");
  assert.strictEqual(inferRegionKind({ title: "西湖水域" }, "map"), "water");
  assert.strictEqual(inferRegionKind({ title: "白堤断桥" }, "map"), "route");
  assert.strictEqual(inferRegionKind({ title: "雷峰塔" }, "map"), "building");
  assert.strictEqual(inferRegionKind({ title: "三潭印月湖心岛", regionKind: "water" }, "map"), "landmark");
  assert.strictEqual(inferRegionKind({ title: "西湖湖面与三岛", detail: "周边连接苏堤和白堤" }, "map"), "water");
  assert.strictEqual(inferRegionKind({ title: "西湖十景核心地标", detail: "沿路线分布在湖区周边" }, "map"), "landmark");
  assert.strictEqual(inferRegionKind({ title: "堤桥系统（苏堤与白堤）", regionPrompt: "两侧湖岸线与湖面" }, "map"), "route");
  assert.strictEqual(inferRegionKind({ title: "湖心岛与三潭印月", regionPrompt: "周围开阔水面" }, "map"), "landmark");
  assert.strictEqual(inferRegionKind({ title: "南北对景轴线", regionPrompt: "雷峰塔与保俶塔隔湖相望" }, "map"), "axis");
  assert.strictEqual(inferRegionKind({ title: "五水划分图例", regionPrompt: "色块说明" }, "map"), "legend");
  assert.strictEqual(inferRegionKind({ title: "西海岸（云海栈道）", regionPrompt: "蜿蜒于山体西侧悬崖上的栈道线路" }, "map"), "route");
  assert.strictEqual(inferRegionKind({ title: "东海岸（阳光海岸）", regionPrompt: "连接主要观景台的栈道线路" }, "map"), "route");
  assert.strictEqual(inferRegionKind({ title: "交通接驳指南", regionPrompt: "高铁站、巴士路线和索道位置" }, "map"), "legend");
  assert.strictEqual(inferRegionKind({ title: "游览准备与住宿", regionPrompt: "住宿、天气、装备等实用信息图例" }, "map"), "legend");
  assert.strictEqual(inferRegionKind({ title: "AI个性化导览", regionPrompt: "导览机器人和贴近身体的文字徽标" }, "scene"), "object-with-label");
  assert.strictEqual(normalizeVisualMode("poster"), "poster");
  assert.strictEqual(normalizeVisualMode("unknown"), "infographic");

  const sceneTargets = normalizeVisualSpec(
    {
      visualMode: "scene",
      title: "Future Museum",
      summary: "Interactive museum scene",
      relationType: "hierarchy",
      modules: [
        {
          title: "Guide robot",
          imageText: "AI guide",
          detail: "The guide robot explains exhibits and has an attached short AI personalized guide label.",
          regionKind: "object-with-label",
          regionPrompt: "the guide robot plus the attached AI personalized guide label badge"
        },
        {
          title: "Main exhibit",
          imageText: "Immersive dome",
          detail: "The main exhibit is a visible immersive dome installation in the center of the hall.",
          regionKind: "object",
          regionPrompt: "central immersive dome exhibit object"
        },
        {
          title: "Visitors",
          imageText: "People interact",
          detail: "Visitors stand around the exhibit and interact with projected content.",
          regionKind: "person",
          regionPrompt: "visible visitor group near the exhibit"
        }
      ]
    },
    "future museum interactive scene",
    "Future museum answer"
  );
  assert.strictEqual(sceneTargets.visualComposition.layoutVariant, "scene");
  assert.strictEqual(sceneTargets.modules[0].maskPolicy, "subject-with-label");
  assert.ok(sceneTargets.modules[0].componentHints.some((item) => item.kind === "object"));
  assert.ok(sceneTargets.modules[0].componentHints.some((item) => item.kind === "label"));
  assert.ok(sceneTargets.modules[0].locatorQueries.some((item) => /object\/person plus attached label/.test(item)));
  assert.strictEqual(sceneTargets.modules[1].maskPolicy, "subject");

  const contaminatedSceneDetail = normalizeVisualSpec(
    {
      visualMode: "scene",
      title: "博物馆场景",
      summary: "博物馆里有展品、观众和导览机器人。",
      relationType: "hierarchy",
      modules: [
        {
          title: "展品",
          imageText: "恐龙骨架",
          detail:
            "展品是场景里一个独立的对象或区域。它有自己的轮廓、用途和与人或其他物体之间的关系：用户进入这个场景时，会下意识把它当作一个可以走近、操作或观察的目标。它的位置和样貌决定了它在场景里的角色——是焦点、辅助、还是背景里的一处细节——也影响周围其他元素的安排。",
          regionKind: "object"
        },
        {
          title: "观众",
          imageText: "参观人群",
          detail: "观众围绕展柜停留并观察展品细节。",
          regionKind: "person"
        },
        {
          title: "导览机器人",
          imageText: "互动讲解",
          detail: "导览机器人在展厅中为观众讲解展品。",
          regionKind: "object-with-label"
        }
      ]
    },
    "画一幅博物馆场景插画，展示大厅、展品、观众和导览机器人",
    "核心展品是一具恐龙骨架，摆在展厅中央，是观众最容易停留观察的对象。观众围绕展柜移动，导览机器人负责把视线带到骨架、说明牌和互动屏幕上。"
  );
  const exhibitDetail = contaminatedSceneDetail.modules.find((module) => /展品/.test(module.title || module.imageText || ""));
  assert.ok(exhibitDetail, "expected a normalized exhibit module");
  assert.doesNotMatch(exhibitDetail.detail, /独立的对象或区域/);
  assert.doesNotMatch(exhibitDetail.detail, /下意识把它当作/);
  assert.match(exhibitDetail.detail, /恐龙骨架/);
  assert.match(exhibitDetail.detail, /主要展示目标|视线锚点/);

  const crossSectionScene = buildMockSpec(
    "用横切面剖视图展示智能仓库，点击机器人、货架、传感器、控制台可以看详情",
    "智能仓库横切面 机器人 货架 传感器 控制台".repeat(20)
  );
  assert.strictEqual(crossSectionScene.visualMode, "scene");
  assert.strictEqual(crossSectionScene.title, "智能仓库横切面剖视图");
  assert.strictEqual(crossSectionScene.summary, "用可点击对象、人物、设备和空间区域组织成一个完整场景。");
  assert.doesNotMatch(crossSectionScene.title, /^用/);
  assert.doesNotMatch(crossSectionScene.summary, new RegExp(crossSectionScene.title));
  assert.deepStrictEqual(
    crossSectionScene.modules.map((module) => module.title),
    ["机器人", "货架", "传感器", "控制台"]
  );
  const castleSectionScene = buildMockSpec(
    "用横切面剖视图展示一座中世纪城堡的内部结构：城墙、瞭望塔、礼拜堂、大厅、地牢、马厩与水井",
    "中世纪城堡横切面 城墙 瞭望塔 礼拜堂 大厅 地牢 马厩 水井".repeat(20)
  );
  assert.strictEqual(castleSectionScene.title, "一座中世纪城堡的内部结构横切面剖视图");
  assert.doesNotMatch(castleSectionScene.title, /^用/);
  assert.deepStrictEqual(
    castleSectionScene.modules.map((module) => module.title),
    ["城墙", "瞭望塔", "礼拜堂", "大厅", "地牢", "马厩与水井"]
  );
  const coffeeShopScene = buildMockSpec(
    "用等距俯视插画画一家精品咖啡馆：咖啡师、意式咖啡机、甜品柜、靠窗座位、取餐架、入口排队区",
    "精品咖啡馆 咖啡师 意式咖啡机 甜品柜 靠窗座位 取餐架 入口排队区".repeat(20)
  );
  assert.strictEqual(coffeeShopScene.title, "一家精品咖啡馆等距俯视插画");
  assert.doesNotMatch(coffeeShopScene.title, /插画画/);

  const emergencyExitTarget = normalizeVisualSpec(
    {
      visualMode: "scene",
      title: "Factory scene",
      summary: "Emergency exit signage should include the sign and attached door area.",
      relationType: "hierarchy",
      modules: [
        {
          title: "应急出口",
          imageText: "exit sign",
          detail: "The emergency exit is a visible green sign and doorway region in a factory scene.",
          regionPrompt: "green emergency exit sign attached to a visible doorway"
        },
        {
          title: "Inspection robot",
          imageText: "robot",
          detail: "A visible inspection robot patrols the factory aisle.",
          regionPrompt: "inspection robot body"
        },
        {
          title: "Control screen",
          imageText: "screen",
          detail: "A control screen displays live safety status.",
          regionPrompt: "factory safety dashboard screen"
        }
      ]
    },
    "factory scene with emergency exit",
    "factory safety answer"
  );
  assert.strictEqual(emergencyExitTarget.modules[0].regionKind, "object-with-label");
  assert.strictEqual(emergencyExitTarget.modules[0].maskPolicy, "subject-with-label");

  const parsed = parseJsonFromText('```json\n{"title":"测试","modules":[1,2,3]}\n```');
  assert.strictEqual(parsed.title, "测试");
  const repaired = parseJsonFromText('{"rawAnswer":"ok","visualSpec":{"title":"REST","modules":[{"title":"A"}]}');
  assert.strictEqual(repaired.visualSpec.title, "REST");

  const mock = buildMockSpec("说明 ChatImage 的流程", "原始回答".repeat(20));
  assert.strictEqual(mock.modules.length, 4);
  assert.strictEqual(mock.relationType, "flow");
  assert.match(mock.visualComposition.moduleCountReason, /4/);
  assert.ok(mock.modules[0].sourceExcerpt.length <= 90);
  assert.ok(Array.isArray(mock.auxiliaryModules));
  assert.ok(mock.auxiliaryModules.length >= 1);

  const normalized = normalizeVisualSpec(
    {
      title: "很长的结构化标题应该被截断到合理长度",
      summary: "摘要".repeat(80),
      relationType: "matrix",
      auxiliaryModules: [
        {
          title: "01 External tools",
          imageText: "Search and calculators",
          detail: "Explain an unnumbered external tools panel.",
          sourceExcerpt: "tools",
          iconHint: "tool"
        }
      ],
      modules: [
        { title: "模块一很长很长很长很长很", imageText: "短文案一", detail: "详情一", iconHint: "risk" },
        { title: "模块二", shortText: "短文案二", detail: "详情二" },
        { title: "模块三", detail: "详情三" },
        { title: "模块四", imageText: "短文案四", detail: "详情四" },
        { title: "模块五", imageText: "短文案五", detail: "详情五" },
        { title: "模块六", imageText: "短文案六", detail: "详情六" },
        { title: "模块七", imageText: "短文案七", detail: "详情七" }
      ]
    },
    "问题",
    "回答"
  );
  assert.strictEqual(normalized.modules.length, 6);
  assert.strictEqual(normalized.modules[0].id, "module_1");
  assert.ok(normalized.modules[0].title.length <= 24);
  assert.strictEqual(normalized.modules[0].iconHint, "risk");
  assert.strictEqual(normalized.relationType, "matrix");
  assert.strictEqual(normalized.language, "zh-CN");
  assert.strictEqual(normalized.visualComposition.compositionType, "layered-cards");
  assert.strictEqual(normalized.auxiliaryModules.length, 1);
  assert.strictEqual(normalized.auxiliaryModules[0].id, "aux_1");
  assert.doesNotMatch(normalized.auxiliaryModules[0].title, /^01/);

  const flowStripAux = normalizeVisualSpec(
    {
      title: "Kubernetes deployment architecture",
      summary: "Resources cooperate across controller and networking layers.",
      relationType: "flow",
      visualMode: "infographic",
      auxiliaryModules: [
        {
          title: "Resource collaboration workflow",
          imageText: "Deployment -> ReplicaSet -> Pod -> Service -> Ingress",
          detail: "Complete end-to-end resource flow from the Deployment declaration through ReplicaSet, Pod, Service, Ingress, and configuration resources.",
          regionPrompt: "complete workflow overview strip with connected resource nodes"
        }
      ],
      modules: [
        { title: "Deployment", imageText: "desired state", detail: "Deployment manages desired state." },
        { title: "ReplicaSet", imageText: "replica count", detail: "ReplicaSet keeps Pod replicas." },
        { title: "Service", imageText: "stable access", detail: "Service exposes Pod groups." }
      ]
    },
    "Explain Kubernetes deployment architecture",
    "Deployment ReplicaSet Pod Service Ingress ConfigMap Secret"
  );
  assert.strictEqual(flowStripAux.auxiliaryModules[0].regionKind, "flow-strip");
  assert.strictEqual(flowStripAux.auxiliaryModules[0].maskPolicy, "full-region");
  assert.ok(flowStripAux.auxiliaryModules[0].visualEvidence.some((item) => /workflow strip/.test(item)));
  assert.ok(flowStripAux.auxiliaryModules[0].locatorQueries.some((item) => /complete horizontal workflow strip/.test(item)));

  const repairedK8sTitles = normalizeVisualSpec(
    {
      title: "Kubernetes 部署架构",
      summary: "Kubernetes resources",
      relationType: "hierarchy",
      visualMode: "infographic",
      modules: [
        { title: "Deployment：声明期望状态并管理滚动更新", imageText: "deploy", detail: "Deployment detail" },
        { title: "ConfigMap：非机密配置数据", imageText: "config", detail: "ConfigMap detail" },
        { title: "Secret：敏感信息保护", imageText: "secret", detail: "Secret detail" }
      ]
    },
    "解释 Kubernetes 应用部署架构",
    "Kubernetes Pod Deployment Service Ingress ConfigMap Secret HPA"
  );
  assert.deepStrictEqual(
    repairedK8sTitles.modules.map((module) => module.title),
    ["Deployment 编排", "ConfigMap 配置", "Secret 密钥"]
  );

  const fallback = normalizeVisualSpec({ modules: [{}, {}] }, "问题", "回答");
  assert.strictEqual(fallback.modules.length, 3);
  const topicMock = buildMockSpec("\u4ecb\u7ecd\u4e00\u4e0b\u5177\u8eab\u667a\u80fd\u4ea7\u4e1a\u7684\u53d1\u5c55", "\u539f\u59cb\u56de\u7b54".repeat(20));
  const topicMockText = JSON.stringify(topicMock);
  assert.strictEqual(extractQuestionSubject("\u4ecb\u7ecd\u4e00\u4e0b\u5177\u8eab\u667a\u80fd\u4ea7\u4e1a\u7684\u53d1\u5c55"), "\u5177\u8eab\u667a\u80fd\u4ea7\u4e1a\u7684\u53d1\u5c55");
  assert.strictEqual(
    extractQuestionSubject("\u753b\u4e00\u4e2a\u672a\u6765\u535a\u7269\u9986\u7684\u6c89\u6d78\u5f0f\u63d2\u753b\u573a\u666f\uff0c\u7528\u6237\u53ef\u4ee5\u70b9\u51fb\u5c55\u54c1\u3001\u89c2\u4f17\u548c\u5bfc\u89c8\u673a\u5668\u4eba"),
    "\u672a\u6765\u535a\u7269\u9986\u7684\u6c89\u6d78\u5f0f\u63d2\u753b\u573a\u666f"
  );
  assert.strictEqual(
    extractQuestionSubject("\u751f\u6210\u4e09\u6e05\u5c71\u7684\u5730\u7406\u98ce\u8c8c\u56fe\uff0c\u6211\u4e0b\u5468\u60f3\u53bb\u6e38\u73a9"),
    "\u4e09\u6e05\u5c71\u7684\u5730\u7406\u98ce\u8c8c\u56fe"
  );
  assert.doesNotMatch(topicMock.summary, /\u4ecb\u7ecd\u4e00\u4e0b/);
  assert.doesNotMatch(JSON.stringify(topicMock.modules.map((item) => item.detail)), /\u4ecb\u7ecd\u4e00\u4e0b/);
  assert.doesNotMatch(JSON.stringify(topicMock.modules.map((item) => item.detail)), /\u7684\u53d1\u5c55\u7684\u53d1\u5c55|\u7684\u53d1\u5c55\u7684/);
  assert.match(topicMock.modules[3].detail, /^\u7406\u89e3\u5177\u8eab\u667a\u80fd\u4ea7\u4e1a\u7684\u53d1\u5c55\u9700\u8981\u56de\u5230\u5177\u4f53\u60c5\u5883/);
  assert.doesNotMatch(topicMockText, /ChatImage|LayoutSpec|hotspot|imageProvider|\u751f\u56fe\u63a5\u53e3|\u70ed\u70b9|\u533a\u57df\u8ffd\u95ee/);
  assert.match(topicMockText, /\u95ee\u9898\u5b9a\u4e49|\u884c\u52a8\u5efa\u8bae/);
  assert.doesNotMatch(topicMockText, /\u6280\u672f\u6210\u719f|\u6210\u672c\u4e0b\u964d|\u77ed\u671f\u52a0\u901f\u5668|\u957f\u671f\u57fa\u7840\u6761\u4ef6/);

  const restMock = buildMockSpec("对比 REST 和 GraphQL 的设计差异、优缺点和适用场景", "REST GraphQL cache Schema scenarios".repeat(20));
  const restMockText = JSON.stringify(restMock);
  assert.strictEqual(extractQuestionSubject("解释 OAuth 2.0 授权码登录流程"), "OAuth 2.0 授权码登录流程");
  const oauthMock = buildMockSpec("解释 OAuth 2.0 授权码登录流程", "OAuth roles authorization code token scope PKCE".repeat(20));
  assert.strictEqual(oauthMock.title, "OAuth 2.0 授权码流程");
  assert.strictEqual(oauthMock.visualComposition.layoutVariant, "swimlane-flow");
  assert.match(JSON.stringify(oauthMock), /角色边界|授权请求|授权码交换|Token 使用|安全控制/);
  assert.deepStrictEqual(assessAnswerStructureQuality({ rawAnswer: oauthMock.modules.map((item) => item.detail).join(""), visualSpec: oauthMock }, "解释 OAuth 2.0 授权码登录流程"), []);

  const k8sMock = buildMockSpec("解释 Kubernetes 应用部署架构", "Kubernetes Pod Deployment Service Ingress ConfigMap Secret HPA".repeat(20));
  assert.strictEqual(k8sMock.title, "Kubernetes 部署架构");
  assert.match(JSON.stringify(k8sMock), /Pod 运行单元|Deployment 编排|Service 与 Ingress|配置与密钥|发布与扩缩容/);
  assert.doesNotMatch(JSON.stringify(k8sMock.modules.map((module) => module.title)), /背景基础|当前现状|核心驱动|未来趋势/);

  const httpRenderQuestion = "梳理一次 HTTP 请求从输入网址到页面渲染的完整过程，覆盖 DNS、TCP、TLS、请求响应、DOM、CSSOM 和渲染流水线";
  const httpRenderMock = buildMockSpec(httpRenderQuestion, "HTTP DNS TCP TLS request response DOM CSSOM render pipeline".repeat(20));
  assert.strictEqual(httpRenderMock.title, "HTTP 页面渲染流程");
  assert.strictEqual(httpRenderMock.visualComposition.layoutVariant, "swimlane-flow");
  assert.match(JSON.stringify(httpRenderMock), /地址与 DNS|TCP\/TLS 连接|请求与响应|DOM 与 CSSOM|布局绘制合成/);
  assert.doesNotMatch(JSON.stringify(httpRenderMock.modules.map((module) => module.title)), /背景基础|当前现状|核心驱动|主要挑战|未来趋势/);

  const ragQuestion = "解释 RAG 检索增强生成系统的工作链路，覆盖文档切分、向量化、召回、重排、上下文拼接和答案生成";
  const ragMock = buildMockSpec(ragQuestion, "RAG chunk embedding retrieval rerank context answer generation".repeat(20));
  assert.strictEqual(ragMock.title, "RAG 检索增强流程");
  assert.strictEqual(ragMock.visualComposition.layoutVariant, "swimlane-flow");
  assert.match(JSON.stringify(ragMock), /文档切分|向量化入库|召回候选|重排筛选|上下文拼接|答案生成/);
  assert.doesNotMatch(JSON.stringify(ragMock.modules.map((module) => module.title)), /背景基础|当前现状|核心驱动|主要挑战|未来趋势/);
  const ragGenericNormalized = normalizeVisualSpec(
    {
      title: "RAG 检索增强生成系统的工作链路覆盖",
      relationType: "flow",
      visualMode: "infographic",
      modules: ["背景基础", "当前现状", "核心驱动", "主要挑战", "未来趋势"].map((title) => ({
        title,
        imageText: title,
        detail: "这是一段通用模板说明，虽然长度足够，但没有覆盖 RAG 真实链路。".repeat(4),
        sourceExcerpt: "generic"
      }))
    },
    ragQuestion,
    "RAG chunk embedding retrieval rerank context answer generation".repeat(20)
  );
  assert.strictEqual(ragGenericNormalized.title, "RAG 检索增强流程");
  assert.match(JSON.stringify(ragGenericNormalized.modules.map((module) => module.title)), /文档切分|向量化入库|召回候选|重排筛选/);

  const funnelMock = buildMockSpec("为电商网站设计转化漏斗分析图", "ecommerce traffic product detail cart checkout payment retention".repeat(20));
  assert.strictEqual(funnelMock.title, "电商转化漏斗分析");
  assert.match(JSON.stringify(funnelMock), /流量来源|商品详情页|加购意图|结算支付|复购留存/);
  assert.doesNotMatch(JSON.stringify(funnelMock), /为电商网站设计/);

  const genericWarnings = assessAnswerStructureQuality(
    {
      rawAnswer: "OAuth 2.0 授权码登录流程用于第三方授权登录，需要区分角色、授权请求、授权码交换、token 使用和安全控制。".repeat(4),
      visualSpec: {
        title: "解释 OAuth 2.0 授权码登录流程",
        summary: "模板",
        modules: ["背景基础", "当前现状", "核心驱动", "主要挑战", "未来趋势"].map((title, index) => ({
          id: `module_${index + 1}`,
          title,
          imageText: title,
          detail: "这里是足够长的模板详情，用来触发通用五段框架检查，同时避免 thin detail 干扰主要断言。".repeat(3),
          sourceExcerpt: "source"
        }))
      }
    },
    "解释 OAuth 2.0 授权码登录流程"
  );
  assert.ok(genericWarnings.includes("generic_five_part_framework"));
  assert.ok(genericWarnings.includes("title_raw_question"));
  assert.strictEqual(restMock.title, "REST 与 GraphQL 对比");
  assert.strictEqual(restMock.visualComposition.layoutVariant, "compare-matrix");
  assert.match(restMockText, /资源模型|查询粒度|缓存性能|契约演进|适用场景/);
  assert.doesNotMatch(restMockText, /背景基础|当前现状|核心驱动|未来趋势/);
  assert.deepStrictEqual(assessAnswerStructureQuality({ rawAnswer: restMock.modules.map((item) => item.detail).join(""), visualSpec: restMock }, "REST GraphQL comparison"), []);

  const sqlNoSqlMock = buildMockSpec("对比 SQL 数据库和 NoSQL 数据库的差异、事务一致性、数据模型、扩展方式和适用场景", "SQL NoSQL transaction consistency model scaling scenarios".repeat(20));
  const sqlNoSqlText = JSON.stringify(sqlNoSqlMock);
  assert.strictEqual(sqlNoSqlMock.title, "SQL 与 NoSQL 对比");
  assert.strictEqual(sqlNoSqlMock.visualComposition.layoutVariant, "compare-matrix");
  assert.match(sqlNoSqlText, /数据模型|事务一致性|查询能力|扩展方式|适用场景/);
  assert.doesNotMatch(sqlNoSqlText, /背景基础|当前现状|核心驱动|未来趋势/);

  const containerVmMock = buildMockSpec(
    "对比容器和虚拟机，生成一张可交互的比较图，重点是隔离模型、启动速度、资源占用、运维方式、适用场景",
    "container vm isolation startup resource operations scenario".repeat(20)
  );
  const containerVmText = JSON.stringify(containerVmMock);
  assert.strictEqual(containerVmMock.title, "容器 与 虚拟机 对比");
  assert.strictEqual(containerVmMock.visualComposition.layoutVariant, "compare-matrix");
  assert.match(containerVmText, /隔离模型|启动速度|资源占用|运维方式|适用场景/);
  assert.doesNotMatch(containerVmText, /背景基础|当前现状|核心驱动|未来趋势/);

  const agentWorkflowMock = buildMockSpec(
    "解释大模型 Agent 的工作流程，重点说明感知、规划、记忆、工具调用和反馈迭代",
    "Agent 会读取用户目标和环境上下文，规划步骤，维护记忆状态，调用工具执行动作，再根据观察结果反馈迭代。".repeat(12)
  );
  const agentWorkflowText = JSON.stringify(agentWorkflowMock);
  assert.strictEqual(agentWorkflowMock.title, "大模型 Agent 工作流程");
  assert.strictEqual(agentWorkflowMock.visualComposition.layoutVariant, "swimlane-flow");
  assert.match(agentWorkflowText, /感知输入|任务规划|记忆与状态|工具调用|反馈迭代/);
  assert.doesNotMatch(JSON.stringify(agentWorkflowMock.modules.map((module) => module.title)), /背景基础|当前现状|核心驱动|主要挑战|未来趋势/);
  assert.ok(
    agentWorkflowMock.modules.every((module) => String(module.detail || "").length >= 90),
    "Agent fallback details should be concrete enough for interaction panels"
  );
  const repairedAgentWorkflow = normalizeVisualSpec(
    {
      title: "解释大模型 Agent 的工作流程",
      visualMode: "infographic",
      relationType: "flow",
      modules: ["背景基础", "当前现状", "核心驱动", "主要挑战", "未来趋势"].map((title) => ({
        title,
        imageText: title,
        detail: "这是一段泛化模板详情，没有解释 Agent 的感知、规划、记忆、工具和反馈闭环。".repeat(4)
      }))
    },
    "解释大模型 Agent 的工作流程，重点说明感知、规划、记忆、工具调用和反馈迭代",
    "Agent 会读取用户目标和环境上下文，规划步骤，维护记忆状态，调用工具执行动作，再根据观察结果反馈迭代。".repeat(12)
  );
  assert.match(JSON.stringify(repairedAgentWorkflow.modules.map((module) => module.title)), /感知输入|任务规划|工具调用|反馈迭代/);

  const tradingAgentMock = buildMockSpec(
    "自动化交易Agent结构是什么样的",
    "自动化交易 Agent 由行情感知、策略规划、记忆状态、交易工具调用、风控校验和执行反馈组成。系统需要先读取市场数据和账户约束，再规划交易动作，最后根据成交和风险结果迭代。".repeat(10)
  );
  const tradingAgentText = JSON.stringify(tradingAgentMock);
  assert.strictEqual(tradingAgentMock.title, "自动化交易 Agent 工作流");
  assert.strictEqual(tradingAgentMock.visualComposition.layoutVariant, "swimlane-flow");
  assert.match(tradingAgentText, /行情感知|策略规划|记忆状态|风控校验|工具执行|反馈迭代/);
  assert.doesNotMatch(tradingAgentText, /背景基础|当前现状|核心驱动|主要挑战|未来趋势/);
  assert.doesNotMatch(tradingAgentText, /技术成熟|成本下降|短期加速器|长期基础条件/);

  const genericFallbackMock = buildMockSpec(
    "解释一个暂时没有专用模板的新概念",
    "这个概念包含定义、组成、运作机制、适用场景和后续判断建议，需要按原回答内容组织成可交互模块。".repeat(12)
  );
  const genericFallbackText = JSON.stringify(genericFallbackMock);
  assert.doesNotMatch(genericFallbackText, /技术成熟|成本下降|投入增加|短期加速器|长期基础条件/);
  assert.doesNotMatch(genericFallbackText, /产业正在扩展|技术与需求共振|走向规模应用/);

  const mapMock = buildMockSpec("手绘地图，西湖，画在一张图上，点击交互地理区域呈现地理风貌", "西湖导览".repeat(40));
  const mapMockText = JSON.stringify(mapMock);
  assert.strictEqual(mapMock.visualMode, "map");
  assert.strictEqual(mapMock.visualComposition.layoutVariant, "map");
  assert.strictEqual(mapMock.modules.length, 9);
  assert.ok(mapMock.modules.every((module) => module.regionKind && module.regionPrompt));
  assert.ok(mapMock.modules.every((module) => Array.isArray(module.visualEvidence) && module.visualEvidence.length >= 1));
  assert.ok(mapMock.modules.every((module) => Array.isArray(module.locatorQueries) && module.locatorQueries.length >= 1));
  assert.strictEqual(mapMock.modules.find((module) => module.regionKind === "route").maskPolicy, "route");
  assert.match(mapMockText, /西湖水域|白堤断桥|苏堤春晓|三潭印月|雷峰塔/);
  assert.match(mapMockText, /孤山|宝石山|曲院风荷|柳浪闻莺/);

  assert.strictEqual(inferVisualMode("黄山旅游攻略"), "map");
  const huangshanMock = buildMockSpec(
    "黄山旅游攻略",
    "黄山旅游攻略适合做成一张手绘导览地图，包含核心景区、索道入口、住宿补给和自然地貌。".repeat(8)
  );
  const huangshanText = JSON.stringify(huangshanMock);
  assert.strictEqual(huangshanMock.title, "黄山手绘导览地图");
  assert.strictEqual(huangshanMock.visualMode, "map");
  assert.strictEqual(huangshanMock.visualComposition.layoutVariant, "map");
  assert.match(huangshanText, /云谷索道入口|迎客松玉屏线|光明顶与云海|西海大峡谷|山上住宿补给/);
  assert.doesNotMatch(JSON.stringify(huangshanMock.modules.map((module) => module.title)), /背景基础|当前现状|核心驱动|主要挑战|未来趋势/);
  const repairedHuangshan = normalizeVisualSpec(
    {
      title: "黄山旅游攻略",
      visualMode: "infographic",
      relationType: "hierarchy",
      modules: ["背景基础", "当前现状", "核心驱动"].map((title) => ({
        title,
        imageText: title,
        detail: "这是一段通用模板详情，无法描述黄山真实景区、路线和补给。".repeat(5)
      }))
    },
    "黄山旅游攻略",
    "黄山旅游攻略适合做成一张手绘导览地图，包含核心景区、索道入口、住宿补给和自然地貌。".repeat(8)
  );
  assert.strictEqual(repairedHuangshan.visualMode, "map");
  assert.strictEqual(repairedHuangshan.title, "黄山手绘导览地图");
  assert.match(JSON.stringify(repairedHuangshan.modules.map((module) => module.title)), /云谷索道入口|迎客松玉屏线|光明顶与云海/);

  const campusMapMock = buildMockSpec(
    "画一张大学校园手绘导览地图，点击图书馆、体育馆、学生宿舍、食堂、湖边草坪、校史馆可以看详情",
    "campus map".repeat(40)
  );
  assert.strictEqual(campusMapMock.title, "大学校园手绘导览地图");
  assert.deepStrictEqual(
    campusMapMock.modules.map((module) => module.title),
    ["图书馆", "体育馆", "学生宿舍", "食堂", "湖边草坪", "校史馆"]
  );

  const campusHandDrawnPrefixMock = buildMockSpec(
    "手绘一张大学校园导览地图，画在一张图上，不要流程图，包含教学楼、图书馆、食堂、宿舍区、操场、校门和主路线，点击区域后解释用途和风貌",
    "campus map".repeat(40)
  );
  assert.strictEqual(campusHandDrawnPrefixMock.title, "大学校园导览地图");
  assert.doesNotMatch(campusHandDrawnPrefixMock.title, /手绘一张|画在一张图上|点击|解释用途/);

  const sleepLampPosterMock = buildMockSpec(
    "设计一张智能睡眠灯产品海报，需要展示灯体、柔和光晕、手机 app 界面、卧室场景、睡眠数据、一句标语",
    "sleep lamp poster".repeat(40)
  );
  assert.strictEqual(sleepLampPosterMock.title, "智能睡眠灯产品海报");
  assert.deepStrictEqual(
    sleepLampPosterMock.modules.map((module) => module.title),
    ["灯体", "柔和光晕", "手机 app 界面", "卧室场景", "睡眠数据", "一句标语"]
  );

  const partialWestLake = normalizeVisualSpec(
    {
      visualMode: "map",
      title: "西湖手绘地图",
      summary: "西湖地图",
      relationType: "hierarchy",
      visualComposition: { compositionType: "hand-drawn-map", layoutVariant: "map" },
      modules: [
        { title: "西湖水域", imageText: "湖面", detail: "西湖中心水面和游船。", regionKind: "water" },
        { title: "白堤断桥", imageText: "北岸长堤", detail: "白堤和断桥位于北岸。", regionKind: "route" },
        { title: "苏堤春晓", imageText: "纵向堤路", detail: "苏堤贯穿湖面。", regionKind: "route" },
        { title: "三潭印月", imageText: "湖心岛", detail: "湖心小岛与石塔。", regionKind: "landmark" },
        { title: "雷峰塔", imageText: "南岸塔影", detail: "南岸塔身与山色。", regionKind: "building" }
      ]
    },
    "手绘地图，西湖，点击柳浪闻莺、孤山、宝石山、曲院风荷等区域",
    "西湖导览回答"
  );
  assert.strictEqual(partialWestLake.modules.length, 9);
  assert.match(JSON.stringify(partialWestLake.modules.map((module) => module.title)), /孤山|宝石山|曲院风荷|柳浪闻莺/);

  const normalizedMap = normalizeVisualSpec(
    {
      visualMode: "map",
      title: "西湖地图",
      summary: "西湖地理区域",
      relationType: "hierarchy",
      visualComposition: { compositionType: "hand-drawn-map", layoutVariant: "map" },
      auxiliaryModules: [
        { title: "西湖格局", imageText: "湖区整体", detail: "说明湖面与周边景点的整体关系" }
      ],
      modules: [
        { title: "西湖水域", imageText: "湖面", detail: "说明湖面区域", sourceExcerpt: "湖面" },
        { title: "白堤断桥", imageText: "长堤", detail: "说明路线区域", sourceExcerpt: "白堤" },
        { title: "雷峰塔", imageText: "塔影", detail: "说明建筑区域", sourceExcerpt: "雷峰塔" }
      ]
    },
    "手绘地图，西湖",
    "西湖地图回答"
  );
  assert.strictEqual(normalizedMap.modules.length, 9);
  assert.deepStrictEqual(normalizedMap.modules.slice(0, 3).map((module) => module.regionKind), ["water", "route", "building"]);
  assert.strictEqual(normalizedMap.auxiliaryModules[0].regionKind, "axis");

  const splitRouteMap = normalizeVisualSpec(
    {
      visualMode: "map",
      title: "三清山地图",
      summary: "三清山手绘导览",
      relationType: "hierarchy",
      visualComposition: { compositionType: "hand-drawn-map", layoutVariant: "map" },
      modules: [
        { title: "南清园核心景区", imageText: "奇峰集中", detail: "南清园集中了巨蟒出山、司春女神等景观。", regionKind: "landmark" },
        {
          title: "西海岸与阳光海岸栈道",
          imageText: "两段悬崖栈道",
          detail: "西海岸栈道适合看云海。阳光海岸栈道位于东侧，沿途植被茂密。",
          regionKind: "route",
          regionPrompt: "山体东西两侧蜿蜒的栈道路径线条，西海岸栈道旁有云海图案，阳光海岸栈道旁有树木图案"
        },
        { title: "交通索道入口", imageText: "索道上山", detail: "索道入口和接驳路线。", regionKind: "legend" },
        { title: "山上住宿点", imageText: "住宿标记", detail: "山上住宿点需要提前预订。", regionKind: "legend" }
      ]
    },
    "生成三清山的地理风貌图",
    "三清山导览"
  );
  assert.deepStrictEqual(
    splitRouteMap.modules.map((module) => module.title),
    ["南清园核心景区", "西海岸栈道", "阳光海岸栈道", "交通索道入口", "山上住宿点"]
  );
  assert.deepStrictEqual(splitRouteMap.modules.map((module) => module.regionKind), ["landmark", "route", "route", "legend", "object-with-label"]);
  assert.strictEqual(splitRouteMap.modules.find((module) => module.title === "山上住宿点").maskPolicy, "subject-with-label");
  const sanqingFallback = buildMockSpec(
    "生成三清山的地理风貌图，点击西海岸栈道、阳光海岸栈道、交通索道、山上住宿点",
    "三清山导览"
  );
  assert.strictEqual(sanqingFallback.visualMode, "map");
  assert.deepStrictEqual(
    sanqingFallback.modules.map((module) => module.title),
    ["南清园核心景区", "西海岸栈道", "阳光海岸栈道", "交通索道入口", "山上住宿点"]
  );
  assert.doesNotMatch(JSON.stringify(sanqingFallback), /西湖|白堤|苏堤|雷峰塔/);
  assert.strictEqual(
    sanqingFallback.modules.find((module) => module.title.includes("阳光海岸")).spatialHint,
    "east"
  );
  assert.strictEqual(
    sanqingFallback.modules.find((module) => module.title.includes("西海岸")).spatialHint,
    "west"
  );
  const repairedSanqingRoutes = normalizeVisualSpec(
    {
      visualMode: "map",
      title: "三清山地图",
      summary: "三清山导览",
      relationType: "hierarchy",
      visualComposition: { compositionType: "hand-drawn-map", layoutVariant: "map" },
      modules: [
        {
          title: "西海岸栈道",
          imageText: "西侧悬崖栈道",
          detail: "西海岸路线",
          regionKind: "route",
          maskPolicy: "route",
          regionPrompt: "山体西侧悬崖上悬挂的空中栈道，下方为深切峡谷",
          locatorQueries: ["西海岸栈道", "西海岸空中栈道"]
        },
        {
          title: "西海岸栈道",
          imageText: "西海岸路线",
          detail: "阳光海岸路线",
          regionKind: "route",
          maskPolicy: "route",
          regionPrompt: "地图东侧或山体东侧的阳光海岸栈道，包含朝阳、树林、山脊栈道线和短标签",
          locatorQueries: ["阳光海岸栈道", "阳光海岸", "东侧栈道", "乾坤台"]
        },
        {
          title: "阳光海岸栈",
          imageText: "阳光海岸路线",
          detail: "阳光海岸路线",
          regionKind: "route",
          maskPolicy: "route",
          regionPrompt: "地图东侧或山体东侧的阳光海岸栈道，包含朝阳、树林、山脊栈道线和短标签",
          locatorQueries: ["阳光海岸栈道", "阳光海岸", "东侧栈道"]
        },
        {
          title: "山上住宿点",
          imageText: "女神宾馆·日上山庄",
          detail: "住宿标记",
          regionKind: "legend",
          maskPolicy: "full-region",
          regionPrompt: "山顶住宿建筑点，用房屋图标标注",
          locatorQueries: ["女神宾馆", "日上山庄", "三清山山顶住宿"]
        }
      ]
    },
    "生成三清山的地理风貌图，我下周想去游玩。请包含西海岸栈道、阳光海岸栈道、山上住宿点。",
    "三清山导览包含西海岸栈道、阳光海岸栈道和山上住宿点。"
  );
  const repairedTitles = repairedSanqingRoutes.modules.map((module) => module.title);
  assert.ok(repairedTitles.includes("西海岸栈道"));
  assert.ok(repairedTitles.includes("阳光海岸栈道"));
  assert.strictEqual(repairedTitles.filter((title) => title === "西海岸栈道").length, 1);
  const repairedSunshineRoute = repairedSanqingRoutes.modules.find((module) => module.title === "阳光海岸栈道");
  assert.ok(repairedSunshineRoute.detail.length >= 120);
  assert.doesNotMatch(repairedSunshineRoute.imageText, /西海岸/);
  assert.match(repairedSunshineRoute.imageText, /东侧|日出|山脊|阳光海岸/);
  assert.ok(repairedSanqingRoutes.modules.find((module) => module.title === "山上住宿点").detail.length >= 120);
  assert.strictEqual(repairedSanqingRoutes.modules.find((module) => module.title === "山上住宿点").regionKind, "object-with-label");
  assert.strictEqual(repairedSanqingRoutes.modules.find((module) => module.title === "山上住宿点").maskPolicy, "subject-with-label");
  const nanqingNotRoute = normalizeVisualSpec(
    {
      visualMode: "map",
      title: "三清山地图",
      summary: "三清山导览",
      relationType: "hierarchy",
      visualComposition: { compositionType: "hand-drawn-map", layoutVariant: "map" },
      modules: [
        {
          title: "西海岸栈道",
          imageText: "南清园核心峰林",
          detail: "南清园是三清山自然景观精华所在，以巨蟒出山、司春女神和花岗岩峰林著称。",
          regionKind: "route",
          maskPolicy: "full-region",
          regionPrompt: "地图中心的南清园核心景区，包含巨蟒出山和司春女神"
        },
        {
          title: "西海岸栈道",
          imageText: "西侧悬崖栈道",
          detail: "西海岸栈道适合看云海。",
          regionKind: "route",
          maskPolicy: "route",
          regionPrompt: "地图西侧的西海岸栈道"
        }
      ]
    },
    "生成三清山的地理风貌图",
    "三清山导览"
  );
  assert.strictEqual(nanqingNotRoute.modules[0].title, "南清园核心景区");
  assert.strictEqual(nanqingNotRoute.modules.filter((module) => module.title === "西海岸栈道").length, 1);
  const missingLodgingSanqing = normalizeVisualSpec(
    {
      visualMode: "map",
      title: "三清山地图",
      summary: "三清山导览",
      relationType: "hierarchy",
      visualComposition: { compositionType: "hand-drawn-map", layoutVariant: "map" },
      modules: [
        { title: "南清园核心景区", imageText: "核心峰林", detail: "南清园核心景区。", regionKind: "landmark" },
        { title: "西海岸栈道", imageText: "西侧栈道", detail: "西海岸栈道。", regionKind: "route" },
        { title: "阳光海岸栈道", imageText: "东侧栈道", detail: "阳光海岸栈道。", regionKind: "route" },
        {
          title: "阳光海岸栈道",
          imageText: "索道入口",
          detail: "外双溪索道和金沙索道。",
          regionKind: "legend",
          maskPolicy: "subject-with-label",
          regionPrompt: "外双溪索道和金沙索道入口",
          locatorQueries: ["外双溪索道", "金沙索道", "索道入口"]
        }
      ]
    },
    "生成三清山的地理风貌图，我下周想去游玩。请包含交通索道入口、山上住宿点。",
    "三清山导览需要包含索道入口和山上住宿点。"
  );
  assert.ok(missingLodgingSanqing.modules.some((module) => module.title === "交通索道入口"));
  assert.ok(missingLodgingSanqing.modules.some((module) => module.title === "山上住宿点"));
  assert.strictEqual(missingLodgingSanqing.modules.find((module) => module.title === "交通索道入口").maskPolicy, "legend");
  assert.strictEqual(missingLodgingSanqing.modules.find((module) => module.title === "山上住宿点").regionKind, "object-with-label");
  assert.strictEqual(missingLodgingSanqing.modules.find((module) => module.title === "山上住宿点").maskPolicy, "subject-with-label");
  const sanqingDetailMentionDoesNotCoverTarget = normalizeVisualSpec(
    {
      visualMode: "map",
      title: "三清山地图",
      summary: "三清山导览",
      relationType: "hierarchy",
      visualComposition: { compositionType: "hand-drawn-map", layoutVariant: "map" },
      modules: [
        {
          title: "交通索道入口",
          imageText: "外双溪与金沙索道入口",
          detail: "南清园是三清山地貌的精华，以巨蟒出山、司春女神等象形石柱闻名。",
          regionKind: "legend",
          regionPrompt: "地图底部或边缘的交通索道入口图例",
          visualEvidence: ["两个索道站图标"],
          locatorQueries: ["外双溪索道", "金沙索道"]
        },
        { title: "西海岸栈道", imageText: "西侧栈道", detail: "西海岸栈道。", regionKind: "route" },
        { title: "阳光海岸栈道", imageText: "东侧栈道", detail: "阳光海岸栈道。", regionKind: "route" }
      ]
    },
    "生成三清山的地理风貌图，我下周想去游玩。请包含南清园核心景区、交通索道入口、山上住宿点。",
    "三清山导览需要包含南清园、交通和住宿。"
  );
  assert.ok(sanqingDetailMentionDoesNotCoverTarget.modules.some((module) => module.title === "南清园核心景区"));
  assert.ok(
    assessAnswerStructureQuality(
      {
        rawAnswer: "养一只猫一个月的花销主要包括食物、猫砂、医疗保健和玩具。",
        visualSpec: {
          title: "养猫开销",
          summary: "拆解养猫支出",
          modules: [
            { id: "module_1", title: "食物开销", imageText: "猫粮", detail: "猫粮和零食。" },
            { id: "module_2", title: "医疗保健", imageText: "疫苗", detail: "疫苗和驱虫。" },
            { id: "module_3", title: "日用品", imageText: "猫砂", detail: "猫砂和用品。" }
          ]
        }
      },
      "生成三清山的地理风貌图，点击西海岸栈道、阳光海岸栈道、山上住宿点"
    ).includes("topic_mismatch")
  );

  const leaked = normalizeVisualSpec(
    {
      title: "\u5185\u90e8\u6d41\u7a0b",
      summary: "\u751f\u56fe\u63a5\u53e3\u548c\u70ed\u70b9",
      relationType: "hierarchy",
      modules: [
        { title: "\u751f\u56fe\u63a5\u53e3", imageText: "\u9884\u7559\u751f\u56fe\u63a5\u53e3", detail: "LayoutSpec" },
        { title: "\u5e03\u5c40\u89c4\u5212", imageText: "\u70ed\u70b9\u533a\u57df", detail: "hotspot" },
        { title: "\u533a\u57df\u8ffd\u95ee", imageText: "\u5bf9\u8bdd\u5206\u652f", detail: "ChatImage internals" }
      ]
    },
    "\u4ecb\u7ecd\u4e00\u4e0b\u5177\u8eab\u667a\u80fd\u4ea7\u4e1a\u7684\u53d1\u5c55",
    "\u5177\u8eab\u667a\u80fd\u4ea7\u4e1a\u539f\u59cb\u56de\u7b54"
  );
  assert.doesNotMatch(JSON.stringify(leaked), /\u751f\u56fe\u63a5\u53e3|LayoutSpec|hotspot|\u533a\u57df\u8ffd\u95ee/);

  const prompt = buildStructurePrompt("问题", "回答");
  assert.match(prompt, /只返回 JSON/);
  assert.match(prompt, /modules 数量必须自适应/);
  assert.match(prompt, /允许 3 到 6 个主模块/);
  assert.match(prompt, /建议提供 160 到 320 个中文字符/);
  assert.match(prompt, /尽量覆盖三类信息：机制\/原因、影响\/结果、例子\/边界\/注意点/);
  assert.match(prompt, /信息密度高/);
  assert.match(prompt, /visualComposition/);
  assert.match(prompt, /视觉焦点/);
  assert.match(prompt, /用户问题：问题/);
  assert.match(prompt, /原始回答：回答/);

  const combinedPrompt = buildAnswerStructurePrompt("ChatImage value");
  assert.match(combinedPrompt, /rawAnswer/);
  assert.match(combinedPrompt, /visualSpec/);
  assert.match(combinedPrompt, /same language as the user's question/);
  assert.match(combinedPrompt, /mechanism/);
  assert.match(combinedPrompt, /90-160 words/);
  assert.match(combinedPrompt, /dense and specific/);
  assert.match(combinedPrompt, /visualComposition/);
  assert.match(combinedPrompt, /layoutVariant/);
  assert.match(combinedPrompt, /Infographics use 3 to 6/);
  assert.match(combinedPrompt, /maps may use 4 to 12/);
  assert.match(combinedPrompt, /moduleCountReason/);
  assert.match(combinedPrompt, /auxiliaryModules/);
  assert.match(combinedPrompt, /unnumbered/);
  assert.match(combinedPrompt, /visualMode/);
  assert.match(combinedPrompt, /regionPrompt/);
  assert.match(combinedPrompt, /hand-drawn maps/);
  assert.match(combinedPrompt, /grid, map, scene, or poster/);
  assert.match(combinedPrompt, /resource model/);
  assert.match(combinedPrompt, /User question: ChatImage value/);

  const combined = normalizeAnswerStructure(
    {
      rawAnswer: "ChatImage turns long answers into clickable visual modules.",
      visualSpec: {
        title: "Value",
        language: "en",
        summary: "Long answers become interactive visuals.",
        relationType: "flow",
        visualComposition: {
          compositionType: "swimlane-flow",
          visualFocus: "Interactive value",
          primaryModules: ["module_1"],
          secondaryModules: ["module_2", "module_3"],
          densityStrategy: "Use compact labels."
        },
        modules: [
          { title: "Input", imageText: "Ask", detail: "User asks a question.", iconHint: "idea" },
          { title: "Image", imageText: "Visual", detail: "System generates an infographic.", iconHint: "image" },
          { title: "Follow", imageText: "Thread", detail: "User follows up by hotspot.", iconHint: "thread" }
        ]
      }
    },
    "ChatImage value"
  );
  assert.strictEqual(combined.rawAnswer, "ChatImage turns long answers into clickable visual modules.");
  assert.strictEqual(combined.visualSpec.title, "Value");
  assert.strictEqual(combined.visualSpec.language, "en");
  assert.strictEqual(combined.visualSpec.visualComposition.compositionType, "swimlane-flow");
  assert.deepStrictEqual(combined.visualSpec.visualComposition.primaryModules, ["module_1"]);
  assert.strictEqual(combined.visualSpec.modules.length, 3);
  assert.throws(() => normalizeAnswerStructure({ visualSpec: {} }, "Question"), /rawAnswer/);
  assert.strictEqual(inferQuestionLanguage("介绍 ChatImage"), "zh-CN");
  assert.strictEqual(inferQuestionLanguage("Explain ChatImage"), "en");

  testRepairThinMapDetailDoesNotLeakRegionPrompt();
  testFallbackSpecsDoNotEmitPainterInstructions();
  testTopicFallbackDoesNotEchoLongQuestion();
  testSanitizeModuleTitleRejectsPunctuationOnly();
  testHotspotDetailsAreUserFacingNotMetaInstructions();
  testInferVisualModeClassifiesCommonCases();
  testMapExplicitTargetsIgnoreInstructionPhrases();
  testCampusMapDoesNotTreatClickInstructionAsTarget();

  console.log("structure.test.js passed");
}

// Regression: inferVisualMode must correctly classify common map/scene/poster
// phrasings. Earlier the keyword list missed "指引图", "平面图", "航站楼",
// "剖视图", "全景图" etc., so e.g. an airport-terminal wayfinding map fell
// back to a generic 5-segment infographic ("背景基础/当前现状/...") instead
// of a real map layout.
function testInferVisualModeClassifiesCommonCases() {
  const cases = [
    // Maps / wayfinding / floor plans
    ["画一张机场航站楼指引图：值机柜台、安检、候机区", "map"],
    ["画一张商场平面图：化妆品区、餐饮区、儿童乐园", "map"],
    ["画一张大学校园园区图：图书馆、食堂、体育馆", "map"],
    ["画一张大型音乐节场地地图：主舞台、副舞台、餐饮街", "map"],
    ["画一张日式枯山水庭院导览地图", "map"],
    ["画一张台北夜市手绘导览地图", "map"],
    // Scenes (cutaway / exploded / isometric / panoramic)
    ["用横切面剖视图展示一座中世纪城堡的内部结构", "scene"],
    ["用爆炸视图展示一枚 SpaceX 猎鹰9号火箭", "scene"],
    ["用等距俯视插画画一家精品咖啡馆", "scene"],
    ["画一张珊瑚礁生态系统全景图", "scene"],
    // Posters
    ["用海报展示循环经济的核心理念", "poster"],
    ["用公共卫生海报展示传染病传播链路", "poster"],
    // Infographic (must not be hijacked by "路线" inside roadmap)
    ["用时间线展示一款 SaaS 产品 12 个月的发布路线图", "infographic"],
    ["用流程图解释 GitHub Pull Request 的完整生命周期", "infographic"],
    ["用对照图解释 CSS 层叠优先级规则", "infographic"]
  ];
  for (const [q, expected] of cases) {
    const got = inferVisualMode(q);
    assert.strictEqual(
      got,
      expected,
      `inferVisualMode misclassified: "${q}" => ${got} (expected ${expected})`
    );
  }
}

function testMapExplicitTargetsIgnoreInstructionPhrases() {
  const question =
    "画一张机场航站楼指引图：值机柜台、安检、候机区、登机口、行李提取、地铁出租车接驳，要求每个区域都可以点击查看说明。";
  const spec = buildMockSpec(question, question);
  const titles = spec.modules.map((module) => module.title);
  assert.deepStrictEqual(titles, ["值机柜台", "安检", "候机区", "登机口", "行李提取", "地铁出租车接驳"]);
  assert.doesNotMatch(JSON.stringify(titles), /查看说明|要求|详情|每个区域/);

  const normalized = normalizeVisualSpec(
    {
      title: "机场航站楼指引图",
      summary: "机场导览",
      relationType: "hierarchy",
      visualMode: "map",
      visualComposition: { compositionType: "hand-drawn-map", layoutVariant: "map" },
      modules: [
        { title: "查看说明", imageText: "查看说明", detail: "查看说明", regionPrompt: "查看说明" },
        { title: "值机柜台", imageText: "值机柜台", detail: "值机柜台区域说明" },
        { title: "安检", imageText: "安检", detail: "安检区域说明" },
        { title: "候机区", imageText: "候机区", detail: "候机区说明" },
        { title: "要求", imageText: "要求", detail: "要求每个区域可以点击", regionPrompt: "要求" }
      ]
    },
    question,
    question
  );
  const normalizedTitles = normalized.modules.map((module) => module.title);
  assert.doesNotMatch(JSON.stringify(normalizedTitles), /查看说明|要求/);
  for (const expected of ["值机柜台", "安检", "候机区", "登机口", "行李提取", "地铁出租车接驳"]) {
    assert.ok(normalizedTitles.includes(expected), `missing explicit target after repair: ${expected}`);
  }

  const contaminatedRaw =
    "围绕“画一张机场航站楼接驳指引图：值机柜台、安检、候机区、登机口、行李提取、地铁出租车接驳，需要每个区域都可以点击查看说明”，需要先给出直接回答，再拆成若干可视化模块。每个模块应对应一个真实概念、对象、步骤或区域，并在详情中说明机制、影响、例子和注意事项。";
  const cleaned = normalizeVisualSpec(
    {
      title: "机场航站楼接驳指引图",
      summary: "机场导览",
      relationType: "hierarchy",
      visualMode: "map",
      visualComposition: { compositionType: "hand-drawn-map", layoutVariant: "map" },
      modules: [
        { title: "值机柜台", imageText: "值机柜台", detail: contaminatedRaw, sourceExcerpt: contaminatedRaw },
        { title: "安检", imageText: "安检", detail: contaminatedRaw, sourceExcerpt: contaminatedRaw },
        { title: "行李提取", imageText: "行李提取", detail: contaminatedRaw, sourceExcerpt: contaminatedRaw }
      ]
    },
    "画一张机场航站楼接驳指引图：值机柜台、安检、候机区、登机口、行李提取、地铁出租车接驳，需要每个区域都可以点击查看说明",
    contaminatedRaw
  );
  const cleanedDetailText = cleaned.modules.map((module) => `${module.detail}\n${module.sourceExcerpt}`).join("\n");
  assert.doesNotMatch(cleanedDetailText, /需要先给出直接回答/);
  assert.doesNotMatch(cleanedDetailText, /拆成若干可视化模块/);
  assert.doesNotMatch(cleanedDetailText, /每个区域都可以点击查看说明/);
}

// Regression: hotspot detail must read as user-facing prose about the named
// target itself, NOT as a meta-instruction telling the system what should be
// shown. Earlier templates wrote things like "点击后需要说明它在整体空间
// 中的方位..." which made the panel describe the system's contract instead
// of giving the user real information about the place/element.
function testHotspotDetailsAreUserFacingNotMetaInstructions() {
  const META_PHRASES = [
    "点击后应",
    "点击后需要",
    "点击后要",
    "点击后须",
    "点击这里时",
    "说明用于帮助用户",
    "帮助用户把.*转化",
    "应该解释",
    "需要说明它",
    "详情应",
    "说明应",
    "应该说明",
    "应在图中画",
    "应画成",
    "不能只写在说明里",
    "可点击范围"
  ];
  const cases = [
    "三清山一日游路线",
    "西湖游览导览图：白堤断桥、苏堤、雷峰塔、宝石山、柳浪闻莺",
    "用对比图解释 OAuth2 授权码模式",
    "用海报展示循环经济",
    "画一座智能手表的爆炸视图",
    "画一个未来博物馆的沉浸式插画场景",
    "用流程图解释 RAG 检索增强生成"
  ];
  for (const q of cases) {
    const spec = buildMockSpec(q, q);
    const allModules = [...(spec.modules || []), ...(spec.auxiliaryModules || [])];
    for (const m of allModules) {
      const detail = String(m.detail || "");
      for (const phrase of META_PHRASES) {
        const re = new RegExp(phrase);
        assert.ok(
          !re.test(detail),
          `[${q}] module ${m.id} (${m.title}) detail leaks meta-instruction "${phrase}":\n  ${detail.slice(0, 200)}`
        );
      }
    }
  }
}

// Regression: when a long imperative question hits the generic 5-segment
// fallback (buildTopicFallbackSpec), the resulting hotspot.detail must not
// splice the entire question in as its subject (was producing awkward strings
// like "用爆炸视图展示一个无线耳机的内部组件的发展需要先理解其技术…").
function testTopicFallbackDoesNotEchoLongQuestion() {
  const longQuestion = "用爆炸视图展示一个无线耳机的内部组件：扬声器、电池、主板、麦克风、外壳";
  const spec = buildMockSpec(longQuestion, longQuestion);
  for (const m of spec.modules || []) {
    assert.ok(
      !String(m.detail || "").includes(longQuestion),
      `topic fallback echoed long question into detail: ${m.detail}`
    );
    // The subject for long questions should fall back to "该主题".
    assert.ok(
      !String(m.detail || "").includes("用爆炸视图展示一个无线耳机的内部组件的发展"),
      `topic fallback produced awkward subject splice: ${m.detail}`
    );
  }
  // A short concise topic should still be used as the noun.
  const shortSpec = buildMockSpec("机器学习", "机器学习");
  const m1 = (shortSpec.modules || [])[0];
  if (m1) {
    assert.ok(/机器学习/.test(m1.detail || ""), `short topic should appear in detail: ${m1 && m1.detail}`);
  }
}

// Regression: sanitizeModuleTitle must reject titles consisting entirely of
// punctuation/brackets (e.g. "）", "：", "——") that some LLM outputs emit, and
// fall back to a numbered placeholder. Previously such strings rendered as a
// blank-looking hotspot label in the UI.
function testSanitizeModuleTitleRejectsPunctuationOnly() {
  // sanitizeModuleTitle is not exported, but normalizeAnswerStructure runs it
  // for every module title on the way through. Round-trip a module with a
  // punctuation-only title and assert the rendered title is NOT that string.
  const result = normalizeAnswerStructure({
    rawAnswer: "测试问题的回答",
    visualSpec: {
      title: "测试",
      summary: "测试",
      relationType: "flow",
      visualMode: "infographic",
      modules: [
        { id: "module_1", title: "）", imageText: "x", detail: "y" },
        { id: "module_2", title: "：", imageText: "x", detail: "y" },
        { id: "module_3", title: "——", imageText: "x", detail: "y" },
        { id: "module_4", title: "正常标题", imageText: "x", detail: "y" }
      ]
    }
  }, "测试问题");
  const titles = result.visualSpec.modules.map((m) => m.title);
  for (const t of titles.slice(0, 3)) {
    assert.ok(t && /[\u4e00-\u9fff0-9A-Za-z]/.test(t), `punctuation-only title leaked: "${t}"`);
  }
  assert.strictEqual(titles[3], "正常标题", "valid title should be preserved");
}

// Regression: hotspot.detail (rendered as the click-detail panel) must never
// contain phrasing that addresses the image generator instead of the user.
// We test the buildMockSpec/normalizeAnswerStructure path because that's what
// runs when an upstream LLM is unreachable or returns a thin payload.
function testFallbackSpecsDoNotEmitPainterInstructions() {
  const PAINTER_TOKENS = [
    "必须画成",
    "应画出",
    "适合画成",
    "适合表现为",
    "旁边可画",
    "适合作为地图中央视觉焦点",
    "应该以清楚的轮廓",
    "从背景中分离",
    "方便后续定位",
    "方便后续抠图",
    "画面中应有",
    "画面中需要",
    "用于定位",
    "用于抠图",
    "可点击范围应",
    "应覆盖路线",
    "应覆盖文字"
  ];
  const cases = [
    { question: "三清山一日游路线" },
    { question: "西湖一日游" },
    { question: "未来城市的人口流动是什么样的（请用海报形式呈现）" },
    { question: "画一个未来博物馆的沉浸式插画场景" },
    { question: "解释 OAuth2 授权码流程" }
  ];
  for (const tc of cases) {
    const spec = buildMockSpec(tc.question, tc.question);
    const modules = [...(spec.modules || []), ...(spec.auxiliaryModules || [])];
    for (const m of modules) {
      const detail = String(m.detail || "");
      for (const token of PAINTER_TOKENS) {
        assert.ok(
          !detail.includes(token),
          `[${tc.question}] module ${m.id} detail leaks painter token "${token}": ${detail.slice(0, 200)}`
        );
      }
    }
  }
}

// Regression: a thin-detail map module must never have its user-facing detail
// filled from module.regionPrompt. regionPrompt is the visual-locator prompt
// (image-search vocabulary used by SAM3/LocateAnything) and must not surface
// in the click-detail panel.
function testCampusMapDoesNotTreatClickInstructionAsTarget() {
  const question =
    "\u624b\u7ed8\u4e00\u5f20\u5927\u5b66\u6821\u56ed\u5bfc\u89c8\u5730\u56fe\uff0c\u753b\u5728\u4e00\u5f20\u56fe\u4e0a\uff0c\u4e0d\u8981\u6d41\u7a0b\u56fe\uff0c\u5305\u542b\u6559\u5b66\u697c\u3001\u56fe\u4e66\u9986\u3001\u98df\u5802\u3001\u5bbf\u820d\u533a\u3001\u64cd\u573a\u3001\u6821\u95e8\u548c\u4e3b\u8def\u7ebf\uff0c\u70b9\u51fb\u533a\u57df\u540e\u89e3\u91ca\u7528\u9014\u548c\u98ce\u8c8c";
  const spec = buildMockSpec(question, "campus map".repeat(40));
  const titles = spec.modules.map((module) => module.title);
  const titleText = JSON.stringify(titles);
  assert.doesNotMatch(titleText, /\u533a\u57df\u540e|\u89e3\u91ca\u7528\u9014|\u7528\u9014\u548c\u98ce\u8c8c/);
  assert.match(titleText, /\u6559\u5b66\u697c/);
  assert.match(titleText, /\u56fe\u4e66\u9986/);
  assert.match(titleText, /\u6821\u95e8|\u4e3b\u8def\u7ebf/);
  const averageDetailLength =
    spec.modules.reduce((sum, module) => sum + String(module.detail || "").length, 0) / spec.modules.length;
  assert.ok(averageDetailLength >= 85, `campus detail text is too thin: ${averageDetailLength}`);
}

function testRepairThinMapDetailDoesNotLeakRegionPrompt() {
  const visualPrompt =
    "地图东侧或山体东侧的阳光海岸栈道，包含朝阳、树林、山脊栈道线和'阳光海岸栈道'短标签";
  // 1. Generic map module (title not in the hard-coded sanqing whitelist):
  const generic = repairThinMapDetail(
    {
      title: "雷峰塔与夕照山",
      imageText: "雷峰塔在夕照山南面",
      detail: "",
      regionPrompt: visualPrompt,
      visualEvidence: ["塔身轮廓", "夕照山山体"],
      locatorQueries: ["雷峰塔", "夕照山"]
    },
    "西湖游览路线",
    ""
  );
  assert.ok(!generic.includes(visualPrompt), `generic detail leaked regionPrompt: ${generic}`);
  assert.ok(generic.includes("雷峰塔"), `generic detail should reference the title: ${generic}`);
  // The generic template must not carry the legacy "应覆盖路线" instruction.
  assert.ok(!generic.includes("可点击范围应"), `generic detail leaked locator instruction: ${generic}`);
  assert.ok(!generic.includes("应覆盖路线"), `generic detail leaked locator instruction: ${generic}`);

  // 2. Whitelisted sanqing title path also passes regionPrompt through `base`:
  const whitelisted = repairThinMapDetail(
    {
      title: "阳光海岸栈道",
      imageText: "阳光海岸栈道·东侧日出山脊",
      detail: "",
      regionPrompt: visualPrompt,
      visualEvidence: ["朝阳", "山脊"],
      locatorQueries: ["阳光海岸栈道"]
    },
    "三清山游览路线",
    ""
  );
  assert.ok(
    !whitelisted.includes(visualPrompt),
    `whitelisted detail leaked regionPrompt: ${whitelisted}`
  );
  // Whitelisted template should also have no "短标签" / "应覆盖" residue.
  assert.ok(!whitelisted.includes("短标签"), `whitelisted detail leaked vocab: ${whitelisted}`);

  // 3. Visual-evidence vocabulary that the system uses as a fallback list
  //    (see buildSemanticTargetEvidence) must be filtered out of the user-
  //    facing context interpolation.
  const filtered = repairThinMapDetail(
    {
      title: "迎客松",
      imageText: "迎客松",
      detail: "",
      regionPrompt: "迎客松实体标记",
      visualEvidence: ["可见地理边界或路线", "贴近目标的短标签", "迎客松弯枝特征"],
      locatorQueries: ["迎客松"]
    },
    "黄山一日游",
    ""
  );
  assert.ok(!filtered.includes("短标签"), `filtered detail leaked system vocab: ${filtered}`);
  assert.ok(!filtered.includes("可见地理边界或路线"), `filtered detail leaked system vocab: ${filtered}`);
  // Real LLM-supplied evidence should still survive the filter.
  assert.ok(filtered.includes("迎客松弯枝特征"), `filtered detail dropped real evidence: ${filtered}`);

  // 4. Already-rich detail is returned untouched (no fallback path).
  const richDetail = "已经很长的解释。" + "x".repeat(200);
  const passthrough = repairThinMapDetail(
    { title: "白堤", imageText: "白堤", detail: richDetail, regionPrompt: visualPrompt },
    "西湖",
    ""
  );
  assert.strictEqual(passthrough, richDetail);
}

main();
