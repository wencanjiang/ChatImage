"use strict";

const AGENT_EVALUATION_CASES = [
  {
    id: "agent-workflow",
    category: "infographic-flow",
    offline: true,
    question: "解释大模型 Agent 的工作流程，重点说明感知、规划、记忆、工具调用和反馈迭代",
    expectedVisualModes: ["infographic"],
    expectedKeywords: ["Agent", "感知", "规划", "记忆", "工具", "反馈"],
    minHotspots: 4,
    minKeywordCoverage: 0.6,
    minAverageDetailChars: 70
  },
  {
    id: "rest-graphql",
    category: "comparison",
    offline: true,
    question: "对比 REST 和 GraphQL 的设计差异、优缺点和适用场景",
    expectedVisualModes: ["infographic"],
    expectedKeywords: ["REST", "GraphQL", "缓存", "Schema", "适用"],
    forbiddenTitleFragments: ["对比 REST 和 Graph"],
    minHotspots: 5,
    minKeywordCoverage: 0.8,
    minAverageDetailChars: 90
  },
  {
    id: "http-render-flow",
    category: "technical-flow",
    offline: true,
    question: "梳理一次 HTTP 请求从输入网址到页面渲染的完整过程，覆盖 DNS、TCP、TLS、请求响应、DOM、CSSOM 和渲染流水线",
    expectedVisualModes: ["infographic"],
    expectedKeywords: ["DNS", "TCP", "TLS", "DOM", "CSSOM", "渲染"],
    minHotspots: 5,
    minKeywordCoverage: 0.75,
    minAverageDetailChars: 80
  },
  {
    id: "west-lake-map",
    category: "hand-drawn-map",
    offline: true,
    question: "手绘地图，西湖，画在一张图上，点击交互地理区域，可以呈现具体的地理风貌",
    expectedVisualModes: ["map"],
    expectedKeywords: ["西湖", "白堤", "苏堤", "三潭", "雷峰塔", "孤山", "宝石山", "曲院风荷", "柳浪闻莺"],
    allowedRegionKinds: ["water", "route", "landmark", "building", "mountain"],
    expectedMaskPolicies: ["full-region", "route", "subject"],
    minDistinctRegionKinds: 3,
    minHotspots: 8,
    minKeywordCoverage: 0.8,
    minAverageDetailChars: 90
  },
  {
    id: "sanqing-map",
    category: "tourist-map",
    offline: true,
    question:
      "生成三清山的地理风貌图，我下周想去游玩。画在一张图上，不要流程图。请包含南清园核心景区、西海岸栈道、阳光海岸栈道、交通索道入口、山上住宿点，点击区域后解释具体风貌和游玩建议。",
    expectedVisualModes: ["map"],
    expectedKeywords: ["三清山", "南清园", "西海岸", "阳光海岸", "索道", "住宿"],
    allowedRegionKinds: ["route", "landmark", "legend", "object-with-label"],
    expectedMaskPolicies: ["route", "subject-with-label"],
    minDistinctRegionKinds: 3,
    minHotspots: 5,
    minKeywordCoverage: 0.8,
    minAverageDetailChars: 90
  },
  {
    id: "city-poster",
    category: "poster",
    offline: false,
    question: "做一张低碳城市主题海报，不要流程图，图中应有建筑、公共交通、能源和居民生活区域，点击不同元素解释设计含义",
    expectedVisualModes: ["poster", "scene"],
    expectedKeywords: ["低碳", "城市", "交通", "能源", "居民"],
    minHotspots: 4,
    minKeywordCoverage: 0.6,
    minAverageDetailChars: 80
  },
  {
    id: "museum-scene",
    category: "illustrated-scene",
    offline: true,
    question: "画一个未来博物馆的插画场景，用户可以点击展品、观众、导览机器人、空间结构来了解细节",
    expectedVisualModes: ["scene", "poster"],
    expectedKeywords: ["博物馆", "展品", "观众", "机器人", "空间"],
    expectedMaskPolicies: ["subject-with-label"],
    minHotspots: 4,
    minKeywordCoverage: 0.6,
    minAverageDetailChars: 80
  },
  {
    id: "product-exploded-view",
    category: "product-diagram",
    offline: true,
    question: "生成一张智能手表产品爆炸图，点击屏幕、电池、传感器、表带和外壳可以解释结构和功能",
    expectedVisualModes: ["infographic", "poster", "scene"],
    expectedKeywords: ["屏幕", "电池", "传感器", "表带", "外壳"],
    minHotspots: 5,
    minKeywordCoverage: 0.7,
    minAverageDetailChars: 80
  },
  {
    id: "rag-pipeline",
    category: "technical-flow",
    offline: true,
    question: "解释 RAG 检索增强生成系统的工作链路，覆盖文档切分、向量化、召回、重排、上下文拼接和答案生成",
    expectedVisualModes: ["infographic"],
    expectedKeywords: ["RAG", "文档切分", "向量化", "召回", "重排", "上下文", "答案生成"],
    minHotspots: 5,
    minKeywordCoverage: 0.7,
    minAverageDetailChars: 80
  },
  {
    id: "oauth2-login-flow",
    category: "technical-flow",
    offline: true,
    question: "解释 OAuth 2.0 授权码登录流程，覆盖客户端、授权服务器、资源服务器、授权码、Access Token、Refresh Token 和 scope",
    expectedVisualModes: ["infographic"],
    expectedKeywords: ["OAuth", "客户端", "授权服务器", "资源服务器", "授权码", "Access Token", "Refresh Token", "scope"],
    minHotspots: 5,
    minKeywordCoverage: 0.7,
    minAverageDetailChars: 80
  },
  {
    id: "sql-nosql-compare",
    category: "comparison",
    offline: true,
    question: "对比 SQL 数据库和 NoSQL 数据库的差异、事务一致性、数据模型、扩展方式和适用场景",
    expectedVisualModes: ["infographic"],
    expectedKeywords: ["SQL", "NoSQL", "事务", "一致性", "数据模型", "扩展", "适用"],
    forbiddenTitleFragments: ["对比 SQL 数据库和"],
    minHotspots: 5,
    minKeywordCoverage: 0.75,
    minAverageDetailChars: 80
  },
  {
    id: "kubernetes-deployment",
    category: "technical-architecture",
    offline: true,
    question: "解释 Kubernetes 应用部署架构，覆盖 Pod、Deployment、Service、Ingress、ConfigMap、Secret 和自动扩缩容",
    expectedVisualModes: ["infographic"],
    expectedKeywords: ["Kubernetes", "Pod", "Deployment", "Service", "Ingress", "ConfigMap", "Secret", "扩缩容"],
    minHotspots: 5,
    minKeywordCoverage: 0.7,
    minAverageDetailChars: 80
  },
  {
    id: "ecommerce-funnel",
    category: "business-funnel",
    offline: true,
    question: "为电商网站设计转化漏斗分析图，覆盖流量来源、商品详情页、加购、结算、支付成功和复购",
    expectedVisualModes: ["infographic"],
    expectedKeywords: ["电商", "流量", "商品详情页", "加购", "结算", "支付", "复购"],
    minHotspots: 5,
    minKeywordCoverage: 0.7,
    minAverageDetailChars: 75
  },
  {
    id: "campus-guide-map",
    category: "hand-drawn-map",
    offline: true,
    question: "手绘一张大学校园导览地图，画在一张图上，不要流程图，包含教学楼、图书馆、食堂、宿舍区、操场、校门和主路线，点击区域后解释用途和风貌",
    expectedVisualModes: ["map"],
    expectedKeywords: ["校园", "教学楼", "图书馆", "食堂", "宿舍", "操场", "校门", "路线"],
    allowedRegionKinds: ["route", "landmark", "building", "mountain", "legend", "object-with-label"],
    expectedMaskPolicies: ["route", "subject-with-label"],
    minDistinctRegionKinds: 3,
    minHotspots: 6,
    minKeywordCoverage: 0.75,
    minAverageDetailChars: 85
  }
];

function getAgentEvaluationCases(options = {}) {
  const includeRealOnly = Boolean(options.includeRealOnly);
  const ids = Array.isArray(options.ids) ? new Set(options.ids) : null;
  return AGENT_EVALUATION_CASES.filter((testCase) => {
    if (ids && !ids.has(testCase.id)) return false;
    if (!includeRealOnly && testCase.offline === false) return false;
    return true;
  });
}

module.exports = {
  AGENT_EVALUATION_CASES,
  getAgentEvaluationCases
};
