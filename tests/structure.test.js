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
  parseJsonFromText
} = require("../src/structure");

function main() {
  assert.strictEqual(compactTitle("介绍一下 ChatImage 的产品价值。"), "介绍一下 ChatImage 的产品...");
  assert.strictEqual(compactTitle(""), "ChatImage 结构图");
  assert.strictEqual(normalizeRelationType("FLOW"), "flow");
  assert.strictEqual(normalizeRelationType("unknown"), "hierarchy");
  assert.strictEqual(inferVisualMode("手绘地图，西湖，点击地理区域展示风貌"), "map");
  assert.strictEqual(inferRegionKind({ title: "西湖水域" }, "map"), "water");
  assert.strictEqual(inferRegionKind({ title: "白堤断桥" }, "map"), "route");
  assert.strictEqual(inferRegionKind({ title: "雷峰塔" }, "map"), "building");
  assert.strictEqual(inferRegionKind({ title: "三潭印月湖心岛", regionKind: "water" }, "map"), "landmark");
  assert.strictEqual(inferRegionKind({ title: "西湖湖面与三岛", detail: "周边连接苏堤和白堤" }, "map"), "water");
  assert.strictEqual(inferRegionKind({ title: "西湖十景核心地标", detail: "沿路线分布在湖区周边" }, "map"), "landmark");
  assert.strictEqual(inferRegionKind({ title: "堤桥系统（苏堤与白堤）", regionPrompt: "两侧湖岸线与湖面" }, "map"), "route");
  assert.strictEqual(inferRegionKind({ title: "湖心岛与三潭印月", regionPrompt: "周围开阔水面" }, "map"), "landmark");
  assert.strictEqual(normalizeVisualMode("poster"), "poster");
  assert.strictEqual(normalizeVisualMode("unknown"), "infographic");

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
  assert.strictEqual(normalized.modules[0].title.length, 12);
  assert.strictEqual(normalized.modules[0].iconHint, "risk");
  assert.strictEqual(normalized.relationType, "matrix");
  assert.strictEqual(normalized.language, "zh-CN");
  assert.strictEqual(normalized.visualComposition.compositionType, "layered-cards");
  assert.strictEqual(normalized.auxiliaryModules.length, 1);
  assert.strictEqual(normalized.auxiliaryModules[0].id, "aux_1");
  assert.doesNotMatch(normalized.auxiliaryModules[0].title, /^01/);

  const fallback = normalizeVisualSpec({ modules: [{}, {}] }, "问题", "回答");
  assert.strictEqual(fallback.modules.length, 3);
  const topicMock = buildMockSpec("\u4ecb\u7ecd\u4e00\u4e0b\u5177\u8eab\u667a\u80fd\u4ea7\u4e1a\u7684\u53d1\u5c55", "\u539f\u59cb\u56de\u7b54".repeat(20));
  const topicMockText = JSON.stringify(topicMock);
  assert.strictEqual(extractQuestionSubject("\u4ecb\u7ecd\u4e00\u4e0b\u5177\u8eab\u667a\u80fd\u4ea7\u4e1a\u7684\u53d1\u5c55"), "\u5177\u8eab\u667a\u80fd\u4ea7\u4e1a\u7684\u53d1\u5c55");
  assert.doesNotMatch(topicMock.summary, /\u4ecb\u7ecd\u4e00\u4e0b/);
  assert.doesNotMatch(JSON.stringify(topicMock.modules.map((item) => item.detail)), /\u4ecb\u7ecd\u4e00\u4e0b/);
  assert.doesNotMatch(JSON.stringify(topicMock.modules.map((item) => item.detail)), /\u7684\u53d1\u5c55\u7684\u53d1\u5c55|\u7684\u53d1\u5c55\u7684/);
  assert.match(topicMock.modules[3].detail, /^\u5177\u8eab\u667a\u80fd\u4ea7\u4e1a\u7684\u53d1\u5c55\u4ecd\u53ef\u80fd\u9762\u4e34/);
  assert.doesNotMatch(topicMockText, /ChatImage|LayoutSpec|hotspot|imageProvider|\u751f\u56fe\u63a5\u53e3|\u70ed\u70b9|\u533a\u57df\u8ffd\u95ee/);
  assert.match(topicMockText, /\u80cc\u666f\u57fa\u7840|\u672a\u6765\u8d8b\u52bf/);

  const restMock = buildMockSpec("对比 REST 和 GraphQL 的设计差异、优缺点和适用场景", "REST GraphQL cache Schema scenarios".repeat(20));
  const restMockText = JSON.stringify(restMock);
  assert.strictEqual(restMock.title, "REST 与 GraphQL 对比");
  assert.strictEqual(restMock.visualComposition.layoutVariant, "compare-matrix");
  assert.match(restMockText, /资源模型|查询粒度|缓存性能|契约演进|适用场景/);
  assert.doesNotMatch(restMockText, /背景基础|当前现状|核心驱动|未来趋势/);
  assert.deepStrictEqual(assessAnswerStructureQuality({ rawAnswer: restMock.modules.map((item) => item.detail).join(""), visualSpec: restMock }, restMock.title), []);

  const mapMock = buildMockSpec("手绘地图，西湖，画在一张图上，点击交互地理区域呈现地理风貌", "西湖导览".repeat(40));
  const mapMockText = JSON.stringify(mapMock);
  assert.strictEqual(mapMock.visualMode, "map");
  assert.strictEqual(mapMock.visualComposition.layoutVariant, "map");
  assert.strictEqual(mapMock.modules.length, 6);
  assert.ok(mapMock.modules.every((module) => module.regionKind && module.regionPrompt));
  assert.match(mapMockText, /西湖水域|白堤断桥|苏堤春晓|三潭印月|雷峰塔/);

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
  assert.deepStrictEqual(normalizedMap.modules.map((module) => module.regionKind), ["water", "route", "building"]);
  assert.strictEqual(normalizedMap.auxiliaryModules[0].regionKind, "water");

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
  assert.match(combinedPrompt, /adaptive count from 3 to 6/);
  assert.match(combinedPrompt, /Do not default to 5/);
  assert.match(combinedPrompt, /moduleCountReason/);
  assert.match(combinedPrompt, /auxiliaryModules/);
  assert.match(combinedPrompt, /unnumbered/);
  assert.match(combinedPrompt, /visualMode/);
  assert.match(combinedPrompt, /regionPrompt/);
  assert.match(combinedPrompt, /hand-drawn maps/);
  assert.match(combinedPrompt, /grid, or map/);
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

  console.log("structure.test.js passed");
}

main();
