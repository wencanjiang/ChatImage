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
    id: "west-lake-map",
    category: "hand-drawn-map",
    offline: true,
    question: "手绘地图，西湖，画在一张图上，点击交互地理区域，可以呈现具体的地理风貌",
    expectedVisualModes: ["map"],
    expectedKeywords: ["西湖", "白堤", "苏堤", "三潭", "雷峰塔"],
    allowedRegionKinds: ["water", "route", "landmark", "building", "mountain"],
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
    offline: false,
    question: "画一个未来博物馆的插画场景，用户可以点击展品、观众、导览机器人、空间结构来了解细节",
    expectedVisualModes: ["scene", "poster"],
    expectedKeywords: ["博物馆", "展品", "观众", "机器人", "空间"],
    minHotspots: 4,
    minKeywordCoverage: 0.6,
    minAverageDetailChars: 80
  },
  {
    id: "product-exploded-view",
    category: "product-diagram",
    offline: false,
    question: "生成一张智能手表产品爆炸图，点击屏幕、电池、传感器、表带和外壳可以解释结构和功能",
    expectedVisualModes: ["infographic", "poster", "scene"],
    expectedKeywords: ["屏幕", "电池", "传感器", "表带", "外壳"],
    minHotspots: 5,
    minKeywordCoverage: 0.7,
    minAverageDetailChars: 80
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
