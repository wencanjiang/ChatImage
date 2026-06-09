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
    if (isMapQuestion(question)) {
      return buildMapFallbackSpec(question, rawAnswer);
    }
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
      visualMode: "infographic",
      summary: "两者差异集中在资源建模、查询粒度、缓存治理、契约演进和适用场景。",
      relationType: "compare",
      visualComposition: {
        compositionType: "matrix",
        layoutVariant: "compare-matrix",
        visualFocus: "资源端点与查询图谱的对照",
        primaryModules: ["module_1", "module_2"],
        secondaryModules: ["module_3", "module_4", "module_5"],
        densityStrategy: "用双栏矩阵承载差异，用底部场景建议收束结论，避免背景现状式泛化。",
        moduleCountReason: "REST/GraphQL 对比需要覆盖资源模型、查询粒度、缓存、契约演进和场景五个关键维度。"
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

  function buildMapFallbackSpec(question, rawAnswer) {
    const source = String(rawAnswer || question || "");
    const westLake = /西湖|west lake/i.test(String(question || ""));
    const subject = compactTitle(extractQuestionSubject(question));
    return {
      title: westLake ? "西湖手绘游览地图" : `${subject}手绘地图`,
      language: inferQuestionLanguage(question),
      visualMode: "map",
      summary: westLake
        ? "以西湖水面为中心，串联堤桥、岛屿、塔影、荷区和山景，形成可点击的手绘地理导览。"
        : "以手绘地图方式呈现地理区域、路径、地标和自然风貌，点击区域后查看具体讲解。",
      relationType: "hierarchy",
      visualComposition: {
        compositionType: "hand-drawn-map",
        layoutVariant: "map",
        visualFocus: westLake ? "西湖水面与环湖地标" : "地图中心地理对象与周边区域",
        primaryModules: ["module_1", "module_2", "module_3"],
        secondaryModules: ["module_4", "module_5", "module_6"],
        densityStrategy: "用水域、堤岸、岛屿、塔影、山体和游线组织画面，避免流程图卡片和编号模块。",
        moduleCountReason: "地图需要覆盖中心水域、线性游线、标志性建筑、岛屿和周边自然风貌。"
      },
      auxiliaryModules: [],
      modules: [
        {
          id: "module_1",
          title: westLake ? "西湖水域" : "中心水域",
          imageText: "湖面、游船、倒影",
          detail: westLake
            ? "西湖水域是整张地图的视觉中心，应画出开阔湖面、游船、水波和远山倒影。点击这里时，详情应讲清它如何把白堤、苏堤、湖心岛和南岸塔影联系起来：水面不是空白背景，而是西湖空间感、季节气息和游览路线的核心。"
            : "这个区域在手绘地图中应以地理风貌和游览体验为核心，而不是做成信息图卡片。点击后需要说明它在画面中的位置、周边关系、典型景观、文化气质和适合观察的细节。",
          sourceExcerpt: source.slice(0, 140),
          iconHint: "data",
          regionKind: "water",
          regionPrompt: westLake ? "西湖中央大面积湖水区域，包含湖面、游船、水波和倒影" : "地图中央水域或主要自然区域",
          priority: 1
        },
        {
          id: "module_2",
          title: "白堤断桥",
          imageText: "北岸长堤与桥",
          detail:
            "白堤和断桥适合作为北岸横向游线来画，能提供清晰的方向感。断桥不是单独图标，而应与堤岸、柳树、湖面边界连在一起。点击后可以说明它在西湖北侧的位置、与孤山和湖面视线的关系，以及为什么常被用来代表西湖的诗意入口。",
          sourceExcerpt: source.slice(140, 280),
          iconHint: "route",
          regionKind: "route",
          regionPrompt: "西湖北侧的白堤和断桥，长堤、桥、柳树、湖岸线组成的线性区域",
          priority: 2
        },
        {
          id: "module_3",
          title: "苏堤春晓",
          imageText: "纵贯湖面的堤路",
          detail:
            "苏堤应像一条纵向的绿色脊线穿过湖面，两侧有水面、拱桥、垂柳和步行游线。点击此区域时，详情应讲它如何把西湖南北两端串联起来，以及春日柳色、桥影和湖风如何构成典型的西湖游览体验。",
          sourceExcerpt: source.slice(280, 420),
          iconHint: "timeline",
          regionKind: "route",
          regionPrompt: "纵贯西湖的苏堤，堤路、桥、柳树和两侧湖水形成的长条区域",
          priority: 3
        },
        {
          id: "module_4",
          title: "三潭印月",
          imageText: "湖心岛与石塔",
          detail:
            "三潭印月应位于湖心附近，以小岛、水中石塔和环形游线表达。它适合承担地图中的精致焦点：面积不必最大，但要清楚可辨。点击后可以解释石塔、月影、水面和岛屿之间的关系，以及它为什么适合用局部放大的方式讲述。",
          sourceExcerpt: source.slice(420, 560),
          iconHint: "target",
          regionKind: "landmark",
          regionPrompt: "西湖湖心附近的三潭印月，小岛、三座石塔和周围水面",
          priority: 4
        },
        {
          id: "module_5",
          title: "雷峰塔",
          imageText: "南岸塔影与山色",
          detail:
            "雷峰塔适合画在西湖南岸偏高处，与山体、夕照和湖面倒影形成垂直视觉锚点。点击后应说明它不是普通建筑标记，而是南岸天际线、历史传说和远眺视角的集中表达，也能帮助用户理解湖面南北方向。",
          sourceExcerpt: source.slice(560, 700),
          iconHint: "idea",
          regionKind: "building",
          regionPrompt: "西湖南岸的雷峰塔，塔身、山坡、夕照和湖面倒影组成的区域",
          priority: 5
        },
        {
          id: "module_6",
          title: "荷区山景",
          imageText: "荷叶、远山、岸线",
          detail:
            "荷区和远山是让地图像一幅画的关键层次。它们不一定是单一景点，却能提供季节、前景和背景：近处荷叶让湖岸有细节，远处山体让画面有纵深。点击后应讲这些自然元素如何衬托主要地标，并提示后续可升级为更精细的 mask 区域。",
          sourceExcerpt: source.slice(700, 860),
          iconHint: "summary",
          regionKind: "mountain",
          regionPrompt: "西湖周边荷花区、湖岸植物、远山背景和自然风貌区域",
          priority: 6
        }
      ]
    };
  }

  function buildTopicFallbackSpec(title, subject, question, rawAnswer, relationType) {
    const source = String(rawAnswer || question || "");
    const development = subject.endsWith("\u53d1\u5c55") ? subject : `${subject}\u7684\u53d1\u5c55`;
    const targetModuleCount = inferTargetModuleCount(question, relationType, rawAnswer);
    return {
      title,
      language: inferQuestionLanguage(question),
      visualMode: "infographic",
      summary: `${subject}\u53ef\u6309 ${targetModuleCount} \u4e2a\u6838\u5fc3\u89c6\u89d2\u7ec4\u7ec7\uff0c\u628a\u6982\u5ff5\u3001\u673a\u5236\u548c\u5224\u65ad\u8981\u70b9\u538b\u7f29\u6210\u53ef\u4e92\u52a8\u7684\u89c6\u89c9\u6a21\u5757\u3002`,
      relationType,
      visualComposition: {
        compositionType: relationType === "flow" ? "swimlane-flow" : "layered-cards",
        layoutVariant: inferDefaultLayoutVariant(relationType),
        visualFocus: `${subject}的核心逻辑`,
        primaryModules: inferPrimaryModuleIds(targetModuleCount),
        secondaryModules: inferSecondaryModuleIds(targetModuleCount),
        densityStrategy: "用模块标题、短句、序号徽章和少量关键词标签建立层级，避免模板化平铺。",
        moduleCountReason: `根据问题复杂度和回答长度选择 ${targetModuleCount} 个主模块。`
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
      ].slice(0, targetModuleCount)
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

  function inferTargetModuleCount(question, relationType, rawAnswer) {
    const text = `${question || ""}\n${rawAnswer || ""}`;
    const lower = text.toLowerCase();
    const relation = String(relationType || "").toLowerCase();
    const answerLength = String(rawAnswer || "").length;
    if (isRestGraphqlQuestion(question)) return 5;
    if (/简单|简要|一句话|是什么|what is|define|definition/i.test(text) && answerLength < 700) return 3;
    if (relation === "flow" || relation === "timeline") {
      if (/agent|workflow|pipeline|闭环|循环|复杂|系统|架构/i.test(lower) || answerLength > 900) return 5;
      return 4;
    }
    if (relation === "compare" || relation === "matrix") {
      return answerLength > 1000 ? 6 : 5;
    }
    if (/产业|战略|生态|架构|系统|机制|全流程|多维|趋势|挑战|tradeoff|architecture|system/i.test(text)) {
      return answerLength > 1200 ? 6 : 5;
    }
    if (answerLength > 1200) return 6;
    if (answerLength > 700) return 5;
    if (answerLength > 360) return 4;
    return 3;
  }

  function inferPrimaryModuleIds(count) {
    const safeCount = Math.max(3, Math.min(Number(count) || 3, 6));
    if (safeCount <= 3) return ["module_1"];
    return ["module_1", "module_3"].filter((id) => Number(id.split("_")[1]) <= safeCount);
  }

  function inferSecondaryModuleIds(count) {
    const primary = new Set(inferPrimaryModuleIds(count));
    return Array.from({ length: Math.max(3, Math.min(Number(count) || 3, 6)) }, (_, index) => `module_${index + 1}`).filter(
      (id) => !primary.has(id)
    );
  }

  function buildStructurePrompt(question, rawAnswer) {
    return [
      "请把下面的 LLM 原始回答转换成 ChatImage 可视化结构 JSON。",
      "只返回 JSON，不要返回 Markdown，不要代码块。",
      "JSON 格式：",
      '{"title":"不超过18个中文字符","summary":"一句话摘要","relationType":"parallel|flow|compare|hierarchy|timeline|matrix","visualComposition":{"compositionType":"grid|swimlane-flow|hub-spoke|matrix|timeline|layered-cards|annotated-clusters","visualFocus":"整张图的视觉焦点","primaryModules":["module_1"],"secondaryModules":["module_2"],"densityStrategy":"如何避免模板感并提升信息密度","moduleCountReason":"为什么选择当前模块数"},"modules":[{"id":"module_1","title":"短标题","imageText":"不超过28个中文字符","detail":"点击后展示的详细说明","sourceExcerpt":"原文相关片段","iconHint":"target|nodes|layout|image|thread|idea|risk|step","priority":1}],"auxiliaryModules":[{"title":"未编号区域","imageText":"短辅助说明","detail":"点击后展示的辅助区域说明","sourceExcerpt":"原文相关片段","iconHint":"user|source|data|tool|summary|risk","priority":10}]}',
      "补充字段：visualMode 可为 infographic|map|poster|scene；visualComposition.compositionType 可使用 hand-drawn-map、editorial-poster、illustrated-scene；每个 module 可提供 regionKind 与 regionPrompt，用于描述完整可点击语义区域。",
      "约束：",
      "- visualMode 默认 infographic。用户要求手绘地图、旅游地图、地理区域、景区导览、路线图、可点击地理区域时使用 map；要求海报感时使用 poster；要求像一幅画、插画场景时使用 scene。",
      "- map/poster/scene 下，modules 表示可点击的语义区域、路线、地标、对象或人物，不一定是编号卡片；regionPrompt 必须描述完整视觉区域，不要只写标题文字。",
      "- map/poster/scene 下不要强行画成流程图、大卡片、箭头或编号 GUI 模块，除非用户明确要求信息图。",
      "- modules 数量必须自适应，允许 3 到 6 个主模块；不要固定 5 个。",
      "- 模块数选择规则：简单定义/单点解释用 3 个；标准概念或短流程用 4 个；多维对比、复杂流程、产业/战略/系统分析用 5 个；信息很密或需要覆盖多个子系统时才用 6 个。",
      "- 用尽量少但足够完整的模块承载信息；不要为了凑数拆出空泛的背景/现状/趋势模板。",
      "- visualComposition.moduleCountReason 用一句话说明为什么选择当前模块数。",
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
      "Answer the user's question first, then convert the answer into a visual spec for an interactive visual work.",
      "Return JSON only. Do not return Markdown. Do not wrap the JSON in a code block.",
      "Return one compact JSON object. Escape line breaks inside JSON strings as \\n. Do not use unescaped quotes inside string values.",
      "JSON shape:",
      '{"rawAnswer":"complete answer text for the user","visualSpec":{"language":"same language as the user question, e.g. zh-CN or en","title":"short title","summary":"one sentence summary","relationType":"parallel|flow|compare|hierarchy|timeline|matrix","visualComposition":{"compositionType":"grid|swimlane-flow|hub-spoke|matrix|timeline|layered-cards|annotated-clusters","visualFocus":"main visual focus","primaryModules":["module_1"],"secondaryModules":["module_2"],"densityStrategy":"how to increase information hierarchy and avoid template-like design","moduleCountReason":"why this module count is appropriate"},"modules":[{"title":"short module title","imageText":"very short card text","detail":"detail shown after hotspot click","sourceExcerpt":"related excerpt from rawAnswer","iconHint":"target|nodes|layout|image|thread|idea|risk|step","priority":1}],"auxiliaryModules":[{"title":"unnumbered panel title","imageText":"short helper text","detail":"detail shown after hotspot click","sourceExcerpt":"related excerpt from rawAnswer","iconHint":"user|source|data|tool|summary|risk","priority":10}]}}',
      "Additional schema fields: visualSpec.visualMode is infographic|map|poster|scene. visualSpec.visualComposition.compositionType may also be hand-drawn-map, editorial-poster, or illustrated-scene. Each module may include regionKind and regionPrompt.",
      "Constraints:",
      "- rawAnswer, visualSpec.title, summary, modules.title, imageText, detail, and sourceExcerpt must use the same language as the user's question.",
      "- If the user asks in Chinese, use Chinese in the image. If the user asks in English, use English in the image.",
      "- rawAnswer must be fact-focused, clear, and complete enough for follow-up questions. For explanatory or analytical questions, provide enough substance: definitions, mechanism, sequence, tradeoffs, examples, and caveats where relevant.",
      "- Unless the user explicitly asks about ChatImage itself, never mention ChatImage internals, image generation APIs, LayoutSpec, hotspots, transparent layers, prompt engineering, or follow-up branch mechanics in rawAnswer or visualSpec.",
      "- The answer must directly address the user's subject matter, not describe how this product processes answers.",
      "- visualSpec.visualMode defaults to infographic. Use map for hand-drawn maps, tourist maps, geography, scenic guides, route maps, and clickable geographic regions. Use poster for poster-like visual works and scene for painterly/illustrated scenes.",
      "- For map/poster/scene, modules should be semantic clickable regions or objects, not necessarily GUI cards. Provide regionKind and regionPrompt for every module so a vision locator can identify the full region.",
      "- For map/poster/scene, avoid flowchart/card-number language. The image can use short labels, but it must not draw the raw user question as the title.",
      "- visualSpec.modules must use an adaptive count from 3 to 6 main modules. Do not default to 5.",
      "- Module count guide: use 3 for simple definitions or single-focus explanations; 4 for standard concepts or compact processes; 5 for multi-dimensional comparisons, complex workflows, industry/strategy/system analysis; use 6 only for dense answers that truly need more coverage.",
      "- Choose the smallest module count that preserves the answer's real structure. Do not invent filler modules, and do not split content into generic background/current state/drivers/challenges/trends just to reach 5.",
      "- visualSpec.visualComposition.moduleCountReason should briefly explain why the chosen module count fits the content.",
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
      "- layoutVariant must be one of compare-matrix, compare-split, asymmetric-focus-stack, swimlane-flow, timeline, grid, or map.",
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
      visualMode: normalizeVisualMode(value.visualMode || fallback.visualMode || inferVisualMode(question)),
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
        regionKind: normalizeRegionKind(module.regionKind || module.kind || "area"),
        regionPrompt: String(module.regionPrompt || module.visualPrompt || module.title || "").slice(0, 180),
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
      densityStrategy: String(source.densityStrategy || fallbackValue.densityStrategy || "").slice(0, 180),
      moduleCountReason: String(source.moduleCountReason || fallbackValue.moduleCountReason || "").slice(0, 160)
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
    const allowed = ["compare-matrix", "compare-split", "asymmetric-focus-stack", "swimlane-flow", "timeline", "grid", "map"];
    if (allowed.includes(source)) return source;
    return inferDefaultLayoutVariant(relationType, compositionType);
  }

  function inferDefaultLayoutVariant(relationType, compositionType) {
    const relation = String(relationType || "").toLowerCase();
    const composition = String(compositionType || "").toLowerCase();
    if (composition.includes("map")) return "map";
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
      "- visualSpec.modules must use an adaptive count from 3 to 6. Choose the smallest count that preserves the answer structure; do not force exactly 5 modules.",
      "- visualComposition.moduleCountReason should briefly explain the chosen module count.",
      "- visualComposition.layoutVariant must be one of compare-matrix, compare-split, asymmetric-focus-stack, swimlane-flow, timeline, grid, or map.",
      "- Preserve visualMode, regionKind, and regionPrompt when they are present. For map/poster/scene, repair them instead of dropping them.",
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

  function inferVisualMode(question) {
    const text = String(question || "").toLowerCase();
    const mapKeywords = [
      "\u5730\u56fe",
      "\u624b\u7ed8\u5730\u56fe",
      "\u897f\u6e56",
      "\u666f\u533a",
      "\u5730\u7406",
      "\u8def\u7ebf",
      "\u6e38\u89c8",
      "\u5bfc\u89c8",
      "\u5730\u6807"
    ];
    if (/hand[-\s]?drawn map|tourist map|route map|map\b|atlas|geographic/.test(text) || mapKeywords.some((keyword) => text.includes(keyword))) {
      return "map";
    }
    if (/poster|one[-\s]?sheet|\u6d77\u62a5|\u5c55\u677f|\u4e3b\u89c6\u89c9/.test(text)) return "poster";
    if (/scene|illustration|\u573a\u666f|\u63d2\u753b|\u4e00\u5e45\u753b|\u50cf\u4e00\u5e45\u753b/.test(text)) return "scene";
    return "infographic";
  }

  function normalizeVisualMode(value) {
    const source = String(value || "").trim().toLowerCase();
    if (["infographic", "map", "poster", "scene"].includes(source)) return source;
    return "infographic";
  }

  function normalizeRegionKind(value) {
    const source = String(value || "").trim().toLowerCase();
    const allowed = [
      "area",
      "card",
      "water",
      "route",
      "landmark",
      "building",
      "mountain",
      "object",
      "person",
      "background",
      "foreground",
      "panel"
    ];
    if (allowed.includes(source)) return source;
    return "area";
  }

  function isMapQuestion(question) {
    return inferVisualMode(question) === "map";
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
    inferVisualMode,
    normalizeAnswerStructure,
    normalizeLanguage,
    normalizeLayoutVariant,
    normalizeRelationType,
    normalizeRegionKind,
    normalizeVisualMode,
    normalizeVisualComposition,
    normalizeVisualSpec,
    parseJsonFromText
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  global.ChatImageStructure = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
