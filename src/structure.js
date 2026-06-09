(function initStructure(global) {
  "use strict";

  const core =
    global.ChatImageCore ||
    (typeof require !== "undefined" && typeof module !== "undefined" && module.exports
      ? require("./core")
      : null);

  function buildMockSpec(question, rawAnswer) {
    const relationType = core.inferRelationType(question);
    const title = compactTitle(question);
    const subject = compactTitle(extractQuestionSubject(question));
    if (isRestGraphqlQuestion(question)) {
      return buildRestGraphqlFallbackSpec(question, rawAnswer);
    }
    return buildTopicFallbackSpec(title, subject, question, rawAnswer, relationType);
  }

  function buildRestGraphqlFallbackSpec(question, rawAnswer) {
    const source = String(rawAnswer || question || "");
    return {
      title: "REST 与 GraphQL 对比",
      language: inferQuestionLanguage(question),
      summary: "两者差异集中在资源建模、查询粒度、缓存治理、契约演进和适用场景。",
      relationType: "compare",
      visualComposition: {
        compositionType: "matrix",
        layoutVariant: "compare-matrix",
        visualFocus: "资源端点与查询图谱的对照",
        primaryModules: ["module_1", "module_2"],
        secondaryModules: ["module_3", "module_4", "module_5"],
        densityStrategy: "用双栏矩阵承载差异，用底部场景建议收束结论，避免背景现状式泛化。"
      },
      modules: [
        {
          id: "module_1",
          title: "资源模型",
          imageText: "REST 按资源端点组织",
          detail:
            "REST 通常围绕资源 URL 和 HTTP 方法建模，例如 GET /users、POST /orders。它的边界清晰、语义直观，天然贴合 HTTP 状态码、缓存头和网关治理，适合资源关系稳定、接口职责明确的服务。但当客户端需要跨多个资源拼装复杂视图时，REST 容易出现多次请求或专用接口膨胀。",
          sourceExcerpt: source.slice(0, 120),
          iconHint: "nodes",
          priority: 1
        },
        {
          id: "module_2",
          title: "查询粒度",
          imageText: "GraphQL 由客户端声明字段",
          detail:
            "GraphQL 用单一查询入口描述需要的字段和嵌套关系，客户端能精确拿到页面所需数据，减少过度获取和接口碎片。代价是服务端需要管理查询复杂度、N+1 访问、权限边界和错误返回，否则灵活查询会转化为性能与治理压力。",
          sourceExcerpt: source.slice(120, 260),
          iconHint: "target",
          priority: 2
        },
        {
          id: "module_3",
          title: "缓存性能",
          imageText: "REST 更贴合 HTTP 缓存",
          detail:
            "REST 可以直接利用 HTTP 方法、状态码、ETag、Cache-Control 和 CDN 做通用缓存。GraphQL 的查询体更灵活，通常需要持久化查询、字段级缓存、DataLoader 或网关层缓存来弥补。选择时要看性能瓶颈在网络往返、服务端聚合还是缓存命中率。",
          sourceExcerpt: source.slice(260, 420),
          iconHint: "step",
          priority: 3
        },
        {
          id: "module_4",
          title: "契约演进",
          imageText: "Schema 管理多端兼容",
          detail:
            "REST 常用版本化端点或新增字段演进，规则直接但容易形成多套接口。GraphQL 依赖 Schema、类型系统、字段废弃和查询约束管理兼容性，更适合多端共享数据契约。它要求团队具备 Schema 评审、权限设计和兼容策略，否则长期维护成本会被低估。",
          sourceExcerpt: source.slice(420, 580),
          iconHint: "layout",
          priority: 4
        },
        {
          id: "module_5",
          title: "适用场景",
          imageText: "稳定资源用 REST，复杂视图用 GraphQL",
          detail:
            "如果接口形态稳定、缓存优先、团队希望保持简单治理，REST 往往更合适；如果移动端、Web 端和后台需要不同字段组合，GraphQL 能减少接口碎片并提升前端取数效率。实际项目也可以混用：核心公共资源保留 REST，复杂聚合视图交给 GraphQL。",
          sourceExcerpt: source.slice(580, 760),
          iconHint: "idea",
          priority: 5
        }
      ]
    };
  }

  function buildTopicFallbackSpec(title, subject, question, rawAnswer, relationType) {
    const source = String(rawAnswer || question || "");
    const development = subject.endsWith("\u53d1\u5c55") ? subject : `${subject}\u7684\u53d1\u5c55`;
    return {
      title,
      language: inferQuestionLanguage(question),
      summary: `${subject}\u53ef\u4ee5\u4ece\u80cc\u666f\u3001\u73b0\u72b6\u3001\u9a71\u52a8\u3001\u6311\u6218\u548c\u8d8b\u52bf\u4e94\u4e2a\u89d2\u5ea6\u7406\u89e3\u3002`,
      relationType,
      visualComposition: {
        compositionType: relationType === "flow" ? "swimlane-flow" : "layered-cards",
        layoutVariant: inferDefaultLayoutVariant(relationType),
        visualFocus: `${subject}的核心逻辑`,
        primaryModules: ["module_1", "module_3"],
        secondaryModules: ["module_2", "module_4", "module_5"],
        densityStrategy: "用模块标题、短句、序号徽章和少量关键词标签建立层级，避免模板化平铺。"
      },
      auxiliaryModules: normalizeAuxiliaryModules(null, question, rawAnswer, relationType, inferQuestionLanguage(question)),
      modules: [
        {
          id: "module_1",
          title: "\u80cc\u666f\u57fa\u7840",
          imageText: "\u5148\u770b\u5f62\u6210\u80cc\u666f",
          detail: `${development}\u9700\u8981\u5148\u7406\u89e3\u5176\u6280\u672f\u3001\u5e02\u573a\u548c\u5e94\u7528\u80cc\u666f\u3002\u8fd9\u4e00\u5c42\u7528\u6765\u8bf4\u660e\u95ee\u9898\u4e3a\u4ec0\u4e48\u4f1a\u51fa\u73b0\u3001\u53d7\u54ea\u4e9b\u6761\u4ef6\u5f71\u54cd\uff0c\u4ee5\u53ca\u540e\u7eed\u5224\u65ad\u5e94\u4ece\u54ea\u4e9b\u4f9d\u636e\u5c55\u5f00\u3002`,
          sourceExcerpt: source.slice(0, 90),
          iconHint: "target",
          priority: 1
        },
        {
          id: "module_2",
          title: "\u5f53\u524d\u73b0\u72b6",
          imageText: "\u4ea7\u4e1a\u6b63\u5728\u6269\u5c55",
          detail: `${subject}\u901a\u5e38\u4f1a\u7ecf\u5386\u4ece\u6280\u672f\u9a8c\u8bc1\u5230\u573a\u666f\u843d\u5730\u3001\u518d\u5230\u89c4\u6a21\u5316\u5e94\u7528\u7684\u8fc7\u7a0b\u3002\u8be6\u60c5\u533a\u5e94\u5173\u6ce8\u5f53\u524d\u5df2\u7ecf\u89e3\u51b3\u4e86\u4ec0\u4e48\u3001\u8fd8\u5361\u5728\u54ea\u4e9b\u73af\u8282\uff0c\u4ee5\u53ca\u8fd9\u4e9b\u72b6\u6001\u5bf9\u4e0b\u4e00\u6b65\u51b3\u7b56\u7684\u5f71\u54cd\u3002`,
          sourceExcerpt: source.slice(90, 180),
          iconHint: "nodes",
          priority: 2
        },
        {
          id: "module_3",
          title: "\u6838\u5fc3\u9a71\u52a8",
          imageText: "\u6280\u672f\u4e0e\u9700\u6c42\u5171\u632f",
          detail: `\u5176\u589e\u957f\u5f80\u5f80\u6765\u81ea\u6280\u672f\u6210\u719f\u3001\u6210\u672c\u4e0b\u964d\u3001\u6295\u5165\u589e\u52a0\u548c\u771f\u5b9e\u9700\u6c42\u5171\u540c\u63a8\u52a8\u3002\u5206\u6790\u65f6\u9700\u8981\u628a\u5355\u4e00\u56e0\u7d20\u548c\u591a\u56e0\u7d20\u5171\u632f\u533a\u5206\u5f00\uff0c\u5c24\u5176\u770b\u6e05\u54ea\u4e2a\u56e0\u7d20\u662f\u77ed\u671f\u52a0\u901f\u5668\uff0c\u54ea\u4e2a\u662f\u957f\u671f\u57fa\u7840\u6761\u4ef6\u3002`,
          sourceExcerpt: source.slice(180, 270),
          iconHint: "idea",
          priority: 3
        },
        {
          id: "module_4",
          title: "\u4e3b\u8981\u6311\u6218",
          imageText: "\u843d\u5730\u4ecd\u6709\u95e8\u69db",
          detail: `${development}\u4ecd\u53ef\u80fd\u9762\u4e34\u6210\u672c\u3001\u53ef\u9760\u6027\u3001\u6570\u636e\u3001\u4f9b\u5e94\u94fe\u3001\u76d1\u7ba1\u6216\u5546\u4e1a\u6a21\u5f0f\u7b49\u6311\u6218\u3002\u8fd9\u4e00\u533a\u57df\u9700\u8bf4\u660e\u963b\u529b\u6765\u81ea\u54ea\u91cc\u3001\u4f1a\u5bfc\u81f4\u4ec0\u4e48\u7ed3\u679c\uff0c\u5e76\u533a\u5206\u53ef\u901a\u8fc7\u6267\u884c\u6539\u5584\u7684\u95ee\u9898\u548c\u9700\u8981\u5916\u90e8\u6761\u4ef6\u53d8\u5316\u7684\u95ee\u9898\u3002`,
          sourceExcerpt: source.slice(270, 360),
          iconHint: "risk",
          priority: 4
        },
        {
          id: "module_5",
          title: "\u672a\u6765\u8d8b\u52bf",
          imageText: "\u8d70\u5411\u89c4\u6a21\u5e94\u7528",
          detail: `\u540e\u7eed\u53ef\u91cd\u70b9\u5173\u6ce8${development}\u4e2d\u7684\u6807\u6746\u573a\u666f\u3001\u5546\u4e1a\u5316\u8282\u594f\u3001\u751f\u6001\u534f\u540c\u548c\u957f\u671f\u7ade\u4e89\u683c\u5c40\u3002\u8be6\u60c5\u533a\u5e94\u5e2e\u7528\u6237\u770b\u5230\u4e0b\u4e00\u9636\u6bb5\u7684\u4fe1\u53f7\uff1a\u54ea\u4e9b\u6307\u6807\u8868\u793a\u8d8b\u52bf\u5728\u52a0\u901f\uff0c\u54ea\u4e9b\u53d8\u91cf\u53ef\u80fd\u6539\u53d8\u672a\u6765\u5224\u65ad\u3002`,
          sourceExcerpt: source.slice(360, 450),
          iconHint: "step",
          priority: 5
        }
      ]
    };
  }

  function buildLegacyMockSpec(question, rawAnswer) {
    const relationType = core.inferRelationType(question);
    return {
      title: compactTitle(question),
      language: inferQuestionLanguage(question),
      summary: "先把长回答变成结构化视觉模块，再让用户按区域深入追问。",
      relationType,
      modules: [
        {
          id: "module_1",
          title: "目标识别",
          imageText: "明确用户真正要理解的问题",
          detail:
            "系统先保存原始问题和原始回答，再判断这次回答适合用总结、流程、对比、中心辐射、时间线还是矩阵呈现。",
          sourceExcerpt: rawAnswer.slice(0, 90),
          iconHint: "target",
          priority: 1
        },
        {
          id: "module_2",
          title: "结构化",
          imageText: "把长文本拆成可视模块",
          detail:
            "结构化阶段会提取标题、摘要、模块短文案、详情文本、图标语义和模块关系。图片内只放短文本，长解释放入点击详情。",
          sourceExcerpt: "把回答压缩成能被视觉模块承载的信息单元。",
          iconHint: "nodes",
          priority: 2
        },
        {
          id: "module_3",
          title: "布局规划",
          imageText: "生成布局规范和热点区域",
          detail:
            "布局不是固定四选一，而是根据内容生成 LayoutSpec。每个可点击模块都有明确 bounds，热点层直接复用这些坐标。",
          sourceExcerpt: "用布局规划把模块映射到稳定区域。",
          iconHint: "layout",
          priority: 3
        },
        {
          id: "module_4",
          title: "生图接口",
          imageText: "预留生图接口",
          detail:
            "当前版本用 SVG mock 模拟第三方生图。后续接入真实 API 时，只需要替换 imageProvider.generate 方法，并保持返回 imageUrl。",
          sourceExcerpt: "用透明热点层把图片局部和详情文本绑定。",
          iconHint: "image",
          priority: 4
        },
        {
          id: "module_5",
          title: "区域追问",
          imageText: "每个热点拥有独立对话分支",
          detail:
            "用户点击某个区域后，可以在该区域上下文中继续提问。每个 hotspot 拥有独立 thread，切换区域不会混淆历史。",
          sourceExcerpt: "用户点击某个区域后，可以在该区域上下文中继续追问。",
          iconHint: "thread",
          priority: 5
        }
      ]
    };
  }

  function buildStructurePrompt(question, rawAnswer) {
    return [
      "请把下面的 LLM 原始回答转换成 ChatImage 可视化结构 JSON。",
      "只返回 JSON，不要返回 Markdown，不要代码块。",
      "JSON 格式：",
      '{"title":"不超过18个中文字符","summary":"一句话摘要","relationType":"parallel|flow|compare|hierarchy|timeline|matrix","visualComposition":{"compositionType":"grid|swimlane-flow|hub-spoke|matrix|timeline|layered-cards|annotated-clusters","visualFocus":"整张图的视觉焦点","primaryModules":["module_1"],"secondaryModules":["module_2"],"densityStrategy":"如何避免模板感并提升信息密度"},"modules":[{"id":"module_1","title":"短标题","imageText":"不超过28个中文字符","detail":"点击后展示的详细说明","sourceExcerpt":"原文相关片段","iconHint":"target|nodes|layout|image|thread|idea|risk|step","priority":1}],"auxiliaryModules":[{"title":"未编号区域","imageText":"短辅助说明","detail":"点击后展示的辅助区域说明","sourceExcerpt":"原文相关片段","iconHint":"user|source|data|tool|summary|risk","priority":10}]}',
      "约束：",
      "- modules 数量为 4 到 6；除非内容确实很简单，否则优先 5 到 6 个模块。",
      "- 所有 detail 必须基于原始回答，不要新增事实；但不要只是改写标题，必须解释机制、原因、影响、限制或例子。",
      "- 每个 detail 面向点击后的详情面板，建议提供 160 到 320 个中文字符的信息量；英文问题建议 90 到 160 个英文词。",
      "- detail 尽量覆盖三类信息：机制/原因、影响/结果、例子/边界/注意点；不要只写一句概括。",
      "- imageText 是图片内短文本，要短但信息密度高，优先使用具体动词、对象、条件、结果，不要写“了解背景”“进行分析”这类空泛词。",
      "- sourceExcerpt 用于追问上下文，不会直接展示；选取与 detail 最相关的原文片段。",
      "- visualComposition 必须先决定构图，不要只复述 relationType；要说明视觉焦点、哪些模块是主模块、哪些是辅助模块，以及如何避免模板感。",
      "- auxiliaryModules 表示图中明显独立但不属于主序号卡片的区域，例如输入/环境信息、外部工具、状态说明、关键机制、底部图例。数量 0 到 4；不要在标题或 imageText 中写 01/02 序号。",
      `用户问题：${question}`,
      `原始回答：${rawAnswer}`
    ].join("\n\n");
  }

  function buildAnswerStructurePrompt(question) {
    return [
      "You are ChatImage's answer-and-structure engine.",
      "Do not write analysis, reasoning steps, planning notes, or explanations outside the final JSON.",
      "Think internally only if needed, then output the final JSON immediately.",
      "Answer the user's question first, then convert the answer into a visual spec for an interactive infographic.",
      "Return JSON only. Do not return Markdown. Do not wrap the JSON in a code block.",
      "Return one compact JSON object. Escape line breaks inside JSON strings as \\n. Do not use unescaped quotes inside string values.",
      "JSON shape:",
      '{"rawAnswer":"complete answer text for the user","visualSpec":{"language":"same language as the user question, e.g. zh-CN or en","title":"short title","summary":"one sentence summary","relationType":"parallel|flow|compare|hierarchy|timeline|matrix","visualComposition":{"compositionType":"grid|swimlane-flow|hub-spoke|matrix|timeline|layered-cards|annotated-clusters","visualFocus":"main visual focus","primaryModules":["module_1"],"secondaryModules":["module_2"],"densityStrategy":"how to increase information hierarchy and avoid template-like design"},"modules":[{"title":"short module title","imageText":"very short card text","detail":"detail shown after hotspot click","sourceExcerpt":"related excerpt from rawAnswer","iconHint":"target|nodes|layout|image|thread|idea|risk|step","priority":1}],"auxiliaryModules":[{"title":"unnumbered panel title","imageText":"short helper text","detail":"detail shown after hotspot click","sourceExcerpt":"related excerpt from rawAnswer","iconHint":"user|source|data|tool|summary|risk","priority":10}]}}',
      "Constraints:",
      "- rawAnswer, visualSpec.title, summary, modules.title, imageText, detail, and sourceExcerpt must use the same language as the user's question.",
      "- If the user asks in Chinese, use Chinese in the image. If the user asks in English, use English in the image.",
      "- rawAnswer must be fact-focused, clear, and complete enough for follow-up questions. For explanatory or analytical questions, provide enough substance: definitions, mechanism, sequence, tradeoffs, examples, and caveats where relevant.",
      "- Unless the user explicitly asks about ChatImage itself, never mention ChatImage internals, image generation APIs, LayoutSpec, hotspots, transparent layers, prompt engineering, or follow-up branch mechanics in rawAnswer or visualSpec.",
      "- The answer must directly address the user's subject matter, not describe how this product processes answers.",
      "- visualSpec.modules must contain 4 to 6 modules. Prefer 5 or 6 modules for processes, systems, comparisons, industries, technical concepts, and strategic analysis.",
      "- imageText must be short enough to fit inside an infographic card, but it must be dense and specific: include concrete nouns, verbs, conditions, outcomes, or mini-claims instead of generic labels.",
      "- detail and sourceExcerpt must be grounded in rawAnswer.",
      "- Each module.detail is for the click detail panel. It must be substantially richer than imageText: explain the mechanism, why it matters, and at least one concrete implication, example, boundary, or caveat.",
      "- For Chinese questions, each module.detail should usually be 160-320 Chinese characters. For English questions, each module.detail should usually be 90-160 words.",
      "- Each module.detail should usually contain 2-4 compact sentences, so the detail panel feels useful before the user asks a follow-up.",
      "- Avoid empty phrases such as 'understand the background', 'conduct analysis', 'improve efficiency' unless they are tied to specific objects, causes, or outcomes.",
      "- visualSpec.title must be a distilled topic title, not a direct copy of the user's question. Do not use ellipses or truncated question text.",
      "- visualSpec.visualComposition must make a concrete composition decision before image generation. It should name the composition type, layoutVariant, visual focus, primary/secondary modules, and density strategy. Do not merely repeat relationType.",
      "- visualSpec.auxiliaryModules may contain 0 to 4 unnumbered but clickable regions when the image should include clearly separated panels beyond the numbered main cards, such as input/environment, external tools, status legend, key mechanism, notes, or source context.",
      "- auxiliaryModules must be semantic and useful for follow-up. Do not duplicate the main modules, and do not use 01/02 style numbers in their title or imageText.",
      "- layoutVariant must be one of compare-matrix, compare-split, asymmetric-focus-stack, swimlane-flow, timeline, or grid.",
      "- For REST vs GraphQL or API comparison questions, use real comparison dimensions such as resource model, query granularity, caching/performance, Schema/version evolution, and suitable scenarios. Do not use a generic background/current state/drivers/challenges/trends framework.",
      "- Do not invent facts that are not present in rawAnswer.",
      `User question: ${question}`
    ].join("\n\n");
  }

  function normalizeAnswerStructure(value, question) {
    const rawAnswer = String(
      value.rawAnswer ||
        value.answer ||
        value.originalAnswer ||
        value.content ||
        ""
    ).trim();
    if (!rawAnswer) {
      throw new Error("answer_structure response is missing rawAnswer");
    }
    const visualValue = value.visualSpec || value.structuredSpec || value.spec;
    if (!visualValue || typeof visualValue !== "object" || Array.isArray(visualValue)) {
      throw new Error("answer_structure response is missing visualSpec");
    }
    return {
      rawAnswer,
      visualSpec: normalizeVisualSpec(visualValue, question, rawAnswer)
    };
  }

  function parseJsonFromText(text) {
    const source = String(text || "").trim();
    if (!source) throw new Error("结构化接口返回为空");
    const fenced = source.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const jsonText = fenced ? fenced[1].trim() : source.slice(source.indexOf("{"), source.lastIndexOf("}") + 1);
    try {
      return JSON.parse(jsonText);
    } catch (error) {
      const repaired = repairLooseJsonText(jsonText);
      if (repaired !== jsonText) return JSON.parse(repaired);
      throw error;
    }
  }

  function repairLooseJsonText(text) {
    let repaired = String(text || "").trim().replace(/,\s*([}\]])/g, "$1");
    const stack = [];
    let inString = false;
    let escaped = false;
    for (const char of repaired) {
      if (inString) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === "\"") inString = false;
        continue;
      }
      if (char === "\"") inString = true;
      else if (char === "{") stack.push("}");
      else if (char === "[") stack.push("]");
      else if ((char === "}" || char === "]") && stack[stack.length - 1] === char) stack.pop();
    }
    if (inString || stack.length > 8) return repaired;
    while (stack.length) repaired += stack.pop();
    return repaired;
  }

  function normalizeVisualSpec(value, question, rawAnswer) {
    const fallback = buildMockSpec(question, rawAnswer);
    const modules = Array.isArray(value.modules) ? value.modules.slice(0, 6) : [];
    if (modules.length < 3) return fallback;
    if (containsInternalProductLeak(value, question)) return fallback;
    const relationType = normalizeRelationType(value.relationType || fallback.relationType);
    const visualComposition = normalizeVisualComposition(value.visualComposition, fallback.visualComposition, relationType);
    const auxiliaryModules = normalizeAuxiliaryModules(
      value.auxiliaryModules || value.auxModules || value.supportingModules,
      question,
      rawAnswer,
      relationType,
      inferQuestionLanguage(question)
    );
    return {
      title: sanitizeVisualTitle(value.title, question, fallback.title),
      language: normalizeLanguage(value.language || fallback.language || inferQuestionLanguage(question)),
      summary: String(value.summary || fallback.summary).slice(0, 80),
      relationType,
      visualComposition,
      auxiliaryModules,
      modules: modules.map((module, index) => ({
        id: `module_${index + 1}`,
        title: String(module.title || `模块 ${index + 1}`).slice(0, 12),
        imageText: String(module.imageText || module.shortText || module.detail || "").slice(0, 32),
        detail: String(module.detail || module.imageText || "").slice(0, 1400),
        sourceExcerpt: String(module.sourceExcerpt || "").slice(0, 160),
        iconHint: String(module.iconHint || "idea"),
        priority: Number(module.priority || index + 1)
      }))
    };
  }

  function normalizeAuxiliaryModules(value, question, rawAnswer, relationType, language) {
    const explicit = Array.isArray(value) ? value.slice(0, 4) : [];
    const source = explicit.length ? explicit : buildDefaultAuxiliaryModules(question, rawAnswer, relationType, language);
    return source
      .map((module, index) => ({
        id: `aux_${index + 1}`,
        title: sanitizeAuxiliaryTitle(module.title || module.label || `辅助区域 ${index + 1}`, language),
        imageText: String(module.imageText || module.shortText || module.detail || "").slice(0, 36),
        detail: String(module.detail || module.imageText || "").slice(0, 1400),
        sourceExcerpt: String(module.sourceExcerpt || "").slice(0, 160),
        iconHint: String(module.iconHint || "summary"),
        priority: Number(module.priority || 10 + index)
      }))
      .filter((module) => module.title && module.imageText && module.detail);
  }

  function sanitizeAuxiliaryTitle(value, language) {
    const source = String(value || "").replace(/^\s*\d{1,2}[\s.、:-]+/, "").trim();
    const fallback = language === "en" ? "Supporting panel" : "辅助区域";
    return (source || fallback).slice(0, 14);
  }

  function buildDefaultAuxiliaryModules(question, rawAnswer, relationType, language) {
    const relation = String(relationType || "").toLowerCase();
    const source = String(rawAnswer || question || "");
    if (relation !== "flow" && !/agent|流程|工作流|workflow|process/i.test(String(question || ""))) return [];
    if (language === "en") {
      return [
        {
          title: "Input context",
          imageText: "User intent, context, constraints",
          detail: "This unnumbered region explains the starting context that feeds the main process: the user's request, available context, constraints, and any environment signals the system must consider before choosing an action.",
          sourceExcerpt: source.slice(0, 140),
          iconHint: "user",
          priority: 10
        },
        {
          title: "External tools",
          imageText: "Search, code, data, calculators",
          detail: "This supporting panel groups outside capabilities that may be invoked by the process. It is useful as a hotspot because follow-up questions often ask which tools are available, when they should be used, and what risks or limits they introduce.",
          sourceExcerpt: source.slice(140, 300),
          iconHint: "tool",
          priority: 11
        },
        {
          title: "Legend",
          imageText: "Status, symbols, decision markers",
          detail: "This region summarizes the visual legend or status vocabulary used by the infographic. It helps explain icons, colors, state chips, and connector meanings without forcing that explanatory content into the numbered main cards.",
          sourceExcerpt: source.slice(300, 460),
          iconHint: "summary",
          priority: 12
        }
      ];
    }
    return [
      {
        title: "输入与环境",
        imageText: "用户意图、上下文、约束",
        detail: "这个未编号区域说明流程开始前需要读取的输入条件，包括用户意图、已有上下文、任务边界、环境状态和可用信息。它适合作为热点，因为很多追问会围绕“系统到底拿到了哪些前提、哪些信息会影响后续决策”展开。",
        sourceExcerpt: source.slice(0, 140),
        iconHint: "user",
        priority: 10
      },
      {
        title: "外部工具",
        imageText: "搜索、代码、数据、计算器",
        detail: "这个辅助区域把流程中可能调用的外部能力集中展示，例如搜索、代码解释、数据库、计算器或其他工具。它不属于主步骤本身，但会影响执行质量、成本和风险，因此点击后应能解释工具何时调用、返回什么、如何被模型继续使用。",
        sourceExcerpt: source.slice(140, 300),
        iconHint: "tool",
        priority: 11
      },
      {
        title: "图例说明",
        imageText: "状态、符号、颜色含义",
        detail: "这个区域用于解释信息图里的状态点、颜色、图标、连接线和标签含义，避免把说明性内容塞进主编号卡片。它适合覆盖底部或边缘的说明栏，用户点击后可以理解整张图的阅读规则和状态变化。",
        sourceExcerpt: source.slice(300, 460),
        iconHint: "summary",
        priority: 12
      }
    ];
  }

  function normalizeVisualComposition(value, fallback, relationType) {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const fallbackValue = fallback || {};
    const compositionType = String(source.compositionType || fallbackValue.compositionType || "layered-cards").slice(0, 40);
    return {
      compositionType,
      layoutVariant: normalizeLayoutVariant(source.layoutVariant || fallbackValue.layoutVariant, relationType, compositionType),
      visualFocus: String(source.visualFocus || fallbackValue.visualFocus || "").slice(0, 80),
      primaryModules: normalizeModuleIdList(source.primaryModules || fallbackValue.primaryModules),
      secondaryModules: normalizeModuleIdList(source.secondaryModules || fallbackValue.secondaryModules),
      densityStrategy: String(source.densityStrategy || fallbackValue.densityStrategy || "").slice(0, 180)
    };
  }

  function normalizeModuleIdList(value) {
    if (!Array.isArray(value)) return [];
    return value.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 6);
  }

  function normalizeRelationType(value) {
    const relation = String(value || "").toLowerCase();
    if (["parallel", "flow", "compare", "hierarchy", "timeline", "matrix"].includes(relation)) {
      return relation;
    }
    return "hierarchy";
  }

  function normalizeLayoutVariant(value, relationType, compositionType) {
    const source = String(value || "").trim().toLowerCase();
    const allowed = ["compare-matrix", "compare-split", "asymmetric-focus-stack", "swimlane-flow", "timeline", "grid"];
    if (allowed.includes(source)) return source;
    return inferDefaultLayoutVariant(relationType, compositionType);
  }

  function inferDefaultLayoutVariant(relationType, compositionType) {
    const relation = String(relationType || "").toLowerCase();
    const composition = String(compositionType || "").toLowerCase();
    if (relation === "compare" || relation === "matrix" || composition.includes("matrix")) return "compare-matrix";
    if (relation === "flow" || composition.includes("flow")) return "swimlane-flow";
    if (relation === "timeline" || composition.includes("timeline")) return "timeline";
    if (composition.includes("cluster") || composition.includes("layer")) return "asymmetric-focus-stack";
    return "grid";
  }

  function sanitizeVisualTitle(value, question, fallback) {
    if (isRestGraphqlQuestion(question)) return inferQuestionLanguage(question) === "zh-CN" ? "REST 与 GraphQL 对比" : "REST vs GraphQL";
    const raw = String(value || "").trim();
    const fallbackTitle = String(fallback || "").trim();
    let title = raw || fallbackTitle || extractQuestionSubject(question);
    const questionText = String(question || "").trim();
    const generic = /(\.\.\.|…|可以从|五个角度|背景.*现状.*驱动|current state.*drivers.*trends)/i.test(title);
    if (generic || (questionText && title.includes(questionText.slice(0, Math.min(12, questionText.length))))) {
      title = extractQuestionSubject(question);
    }
    title = title.replace(/\.{3,}|…/g, "").replace(/[？?。！!，,]+$/g, "").trim();
    if (!title) title = fallbackTitle || "ChatImage 结构图";
    return title.length > 24 ? title.slice(0, 24) : title;
  }

  function assessAnswerStructureQuality(normalized, question) {
    const warnings = [];
    const rawAnswer = String((normalized && normalized.rawAnswer) || "");
    const spec = normalized && normalized.visualSpec ? normalized.visualSpec : normalized || {};
    const modules = Array.isArray(spec.modules) ? spec.modules : [];
    if (rawAnswer.length && rawAnswer.length < 180) warnings.push("rawAnswer_too_short");
    if (/(\.\.\.|…|可以从|五个角度|背景.*现状.*驱动)/i.test(String(spec.title || ""))) {
      warnings.push("title_looks_like_raw_question_or_template");
    }
    if (isRestGraphqlQuestion(question)) {
      const joined = [rawAnswer, spec.title, spec.summary, ...modules.flatMap((module) => [module.title, module.imageText, module.detail])].join("\n");
      const joinedLower = joined.toLowerCase();
      const requiredGroups = [["REST"], ["GraphQL"], ["缓存", "cache"], ["Schema", "schema", "类型系统", "版本", "version"], ["适用", "场景", "scenario", "suitable"]];
      for (const group of requiredGroups) {
        if (!group.some((keyword) => joinedLower.includes(String(keyword).toLowerCase()))) warnings.push(`missing_${group[0]}_dimension`);
      }
      const genericTitles = ["背景基础", "当前现状", "核心驱动", "主要挑战", "未来趋势"];
      if (modules.filter((module) => genericTitles.includes(module.title)).length >= 3) {
        warnings.push("generic_five_part_framework");
      }
    }
    for (const module of modules) {
      if (String(module.detail || "").length < 90) warnings.push(`thin_detail_${module.id || module.title || "module"}`);
      if (!String(module.sourceExcerpt || "").trim()) warnings.push(`missing_source_${module.id || module.title || "module"}`);
    }
    return Array.from(new Set(warnings));
  }

  function buildAnswerStructureRepairPrompt(question, normalized, warnings) {
    return [
      "Rewrite and repair this answer_structure JSON. Return JSON only.",
      "Keep the same language as the user question. Do not add facts that conflict with the current answer; you may use broadly known domain knowledge when the current answer is too generic.",
      "Preserve the overall JSON shape: rawAnswer plus visualSpec.",
      "Fix these quality warnings:",
      JSON.stringify(warnings || [], null, 2),
      "Rules:",
      "- rawAnswer should directly answer the user's topic with concrete mechanisms, tradeoffs, examples, and caveats.",
      "- visualSpec.title must be a concise topic title, not the raw user question and not truncated with ellipses.",
      "- module.detail should be useful for a click detail panel and should explain mechanism, impact, and boundary or example.",
      "- visualComposition.layoutVariant must be one of compare-matrix, compare-split, asymmetric-focus-stack, swimlane-flow, timeline, or grid.",
      "- For REST vs GraphQL, use concrete comparison dimensions: resource model, query granularity, caching/performance, Schema/version evolution, and suitable scenarios.",
      `User question: ${question}`,
      "Current JSON:",
      JSON.stringify(normalized, null, 2)
    ].join("\n\n");
  }

  function buildAnswerStructureParseRepairPrompt(question, brokenContent, parseError) {
    return [
      "Repair the following broken answer_structure JSON. Return JSON only.",
      "Do not add Markdown, comments, explanations, or code fences.",
      "Preserve the intended content and the required shape: rawAnswer plus visualSpec.",
      "Fix only JSON syntax problems such as missing braces, trailing commas, unescaped quotes, invalid control characters, or truncated object endings.",
      "If a string contains quotation marks, escape them correctly.",
      `User question: ${question}`,
      `Parse error: ${parseError}`,
      "Broken content:",
      String(brokenContent || "").slice(0, 24000)
    ].join("\n\n");
  }

  function attachQualityWarnings(normalized, warnings) {
    const list = Array.from(new Set(warnings || []));
    if (!normalized || !normalized.visualSpec) return normalized;
    return {
      ...normalized,
      qualityWarnings: list,
      visualSpec: {
        ...normalized.visualSpec,
        qualityWarnings: list
      }
    };
  }

  function containsInternalProductLeak(value, question) {
    if (/chatimage/i.test(String(question || ""))) return false;
    const text = JSON.stringify(value || "");
    return /ChatImage|LayoutSpec|hotspot|prompt|imageProvider|\u751f\u56fe\u63a5\u53e3|\u70ed\u70b9|\u900f\u660e\u5c42|\u533a\u57df\u8ffd\u95ee|\u5e03\u5c40\u89c4\u5212|\u7ed3\u6784\u5316\u9636\u6bb5/.test(text);
  }

  function isRestGraphqlQuestion(question) {
    const text = String(question || "");
    return /REST/i.test(text) && /GraphQL/i.test(text);
  }

  function extractQuestionSubject(question) {
    let cleaned = String(question || "")
      .replace(/[\u3002\uff0c\uff1f\uff01!?,.]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!cleaned) return "\u4e3b\u9898";
    const prefixes = [
      /^\u8bf7?\s*(?:\u4ecb\u7ecd|\u8bf4\u660e|\u89e3\u91ca|\u5206\u6790|\u8bb2\u8bb2|\u8c08\u8c08|\u6982\u8ff0|\u603b\u7ed3)\s*(?:\u4e00\u4e0b|\u4e0b)?\s*(?:\u5173\u4e8e)?\s*/i,
      /^\u5e2e\u6211\s*(?:\u4ecb\u7ecd|\u8bf4\u660e|\u89e3\u91ca|\u5206\u6790|\u68b3\u7406)\s*(?:\u4e00\u4e0b|\u4e0b)?\s*(?:\u5173\u4e8e)?\s*/i,
      /^(?:what is|explain|introduce|summarize|analyze|describe)\s+/i
    ];
    for (const pattern of prefixes) {
      cleaned = cleaned.replace(pattern, "").trim();
    }
    cleaned = cleaned.replace(/^(?:\u5173\u4e8e|about)\s+/i, "").trim();
    return cleaned || compactTitle(question);
  }

  function compactTitle(question) {
    const cleaned = String(question || "").replace(/[？?。.!！]/g, "").trim();
    if (!cleaned) return "ChatImage 结构图";
    return cleaned.length > 18 ? `${cleaned.slice(0, 18)}...` : cleaned;
  }

  function inferQuestionLanguage(question) {
    const source = String(question || "");
    if (/[\u4e00-\u9fff]/.test(source)) return "zh-CN";
    if (/[\u3040-\u30ff]/.test(source)) return "ja";
    if (/[\uac00-\ud7af]/.test(source)) return "ko";
    return "en";
  }

  function normalizeLanguage(value) {
    const source = String(value || "").trim();
    if (!source) return "en";
    return source.slice(0, 24);
  }

  const api = {
    assessAnswerStructureQuality,
    attachQualityWarnings,
    buildAnswerStructureParseRepairPrompt,
    buildAnswerStructureRepairPrompt,
    buildAnswerStructurePrompt,
    buildMockSpec,
    buildStructurePrompt,
    compactTitle,
    extractQuestionSubject,
    inferQuestionLanguage,
    normalizeAnswerStructure,
    normalizeLanguage,
    normalizeLayoutVariant,
    normalizeRelationType,
    normalizeVisualComposition,
    normalizeVisualSpec,
    parseJsonFromText
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  global.ChatImageStructure = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
