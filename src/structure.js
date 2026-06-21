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
    const visualMode = inferVisualMode(question);
    if (isHuangshanQuestion(question)) {
      return ensureVisualTargetContracts(buildHuangshanMapFallbackSpec(question, rawAnswer));
    }
    if (/三清山|sanqing/i.test(String(question || ""))) {
      return ensureVisualTargetContracts(buildSanqingMapFallbackSpec(question, rawAnswer));
    }
    const subject = compactTitle(extractQuestionSubject(question));
    if (visualMode === "map") {
      if (isWestLakeQuestion(question)) return ensureVisualTargetContracts(buildMapFallbackSpec(question, rawAnswer));
      const targets = extractExplicitVisualTargets(question, visualMode);
      if (targets.length >= 4) return ensureVisualTargetContracts(buildSemanticTargetFallbackSpec(question, rawAnswer, "map", targets));
    }
    if (visualMode === "poster") {
      return ensureVisualTargetContracts(buildSemanticTargetFallbackSpec(question, rawAnswer, "poster", extractExplicitVisualTargets(question, visualMode)));
    }
    if (visualMode === "scene") {
      const targets = extractExplicitVisualTargets(question, visualMode);
      if (targets.length >= 3) return ensureVisualTargetContracts(buildSemanticTargetFallbackSpec(question, rawAnswer, "scene", targets));
      return ensureVisualTargetContracts(buildSceneFallbackSpec(question, rawAnswer));
    }
    if (isSmartwatchStructureQuestion(question)) {
      return ensureVisualTargetContracts(buildSmartwatchStructureFallbackSpec(question, rawAnswer));
    }
    if (isMapQuestion(question)) {
      return ensureVisualTargetContracts(buildMapFallbackSpec(question, rawAnswer));
    }
    if (isRestGraphqlQuestion(question)) {
      return ensureVisualTargetContracts(buildRestGraphqlFallbackSpec(question, rawAnswer));
    }
    if (isSqlNoSqlQuestion(question)) {
      return ensureVisualTargetContracts(buildSqlNoSqlFallbackSpec(question, rawAnswer));
    }
    if (isExplicitCompareQuestion(question)) {
      return ensureVisualTargetContracts(buildCompareDimensionFallbackSpec(question, rawAnswer));
    }
    if (isOAuthQuestion(question)) {
      return ensureVisualTargetContracts(buildOAuthFallbackSpec(question, rawAnswer));
    }
    if (isKubernetesQuestion(question)) {
      return ensureVisualTargetContracts(buildKubernetesFallbackSpec(question, rawAnswer));
    }
    if (isHttpRenderFlowQuestion(question)) {
      return ensureVisualTargetContracts(buildHttpRenderFlowFallbackSpec(question, rawAnswer));
    }
    if (isRagQuestion(question)) {
      return ensureVisualTargetContracts(buildRagPipelineFallbackSpec(question, rawAnswer));
    }
    if (isEcommerceFunnelQuestion(question)) {
      return ensureVisualTargetContracts(buildEcommerceFunnelFallbackSpec(question, rawAnswer));
    }
    return ensureVisualTargetContracts(buildTopicFallbackSpec(subject || title, subject, question, rawAnswer, relationType));
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

  function buildSqlNoSqlFallbackSpec(question, rawAnswer) {
    const source = String(rawAnswer || question || "");
    return {
      title: "SQL 与 NoSQL 对比",
      language: inferQuestionLanguage(question),
      visualMode: "infographic",
      summary: "两类数据库的取舍集中在数据模型、事务一致性、查询能力、扩展方式和适用场景。",
      relationType: "compare",
      visualComposition: {
        compositionType: "matrix",
        layoutVariant: "compare-matrix",
        visualFocus: "关系模型与非关系模型的工程取舍",
        primaryModules: ["module_1", "module_2"],
        secondaryModules: ["module_3", "module_4", "module_5"],
        densityStrategy: "用对比矩阵展示约束、性能、扩展和治理差异，避免背景现状式泛化。",
        moduleCountReason: "SQL/NoSQL 对比需要覆盖数据模型、事务一致性、查询能力、扩展方式和场景选择五个维度。"
      },
      modules: [
        {
          id: "module_1",
          title: "数据模型",
          imageText: "SQL 表关系清晰，NoSQL 模型更灵活",
          detail:
            "SQL 数据库以表、行、列和外键关系组织数据，适合实体关系稳定、需要强约束和规范化建模的业务。NoSQL 包括文档、键值、列族和图数据库，能更贴近聚合对象、日志事件或关系网络。选择时要看数据结构是否稳定、查询模式是否可预测，以及团队是否愿意用应用层承担更多约束。",
          sourceExcerpt: source.slice(0, 140),
          iconHint: "nodes",
          priority: 1
        },
        {
          id: "module_2",
          title: "事务一致性",
          imageText: "SQL 强事务，NoSQL 按场景取舍",
          detail:
            "SQL 通常强调 ACID 事务、约束和隔离级别，适合订单、支付、库存、账务这类不能轻易出错的核心链路。NoSQL 系统往往在一致性、可用性和分区容忍之间做取舍，有些支持单文档或有限事务，有些偏最终一致。关键不是谁更先进，而是业务是否能接受延迟一致、补偿逻辑和冲突处理。",
          sourceExcerpt: source.slice(140, 300),
          iconHint: "shield",
          priority: 2
        },
        {
          id: "module_3",
          title: "查询能力",
          imageText: "SQL 适合复杂查询，NoSQL 依赖访问模式",
          detail:
            "SQL 的 JOIN、聚合、窗口函数和优化器适合复杂报表、临时分析和多表关系查询。NoSQL 更强调按已知访问模式设计键、索引或文档结构，读写路径可以很快，但临时组合查询可能成本高。设计 NoSQL 时要先知道主要查询是什么，否则后期容易靠冗余字段、异步同步或额外索引补救。",
          sourceExcerpt: source.slice(300, 460),
          iconHint: "target",
          priority: 3
        },
        {
          id: "module_4",
          title: "扩展方式",
          imageText: "SQL 重治理，NoSQL 常面向水平扩展",
          detail:
            "传统 SQL 擅长垂直扩展、读写分离和强治理，现代分布式 SQL 也在补水平扩展能力。许多 NoSQL 从设计上就面向分片、分区和高吞吐写入，更适合海量日志、会话、缓存、消息状态或全球多地域访问。扩展方式会影响运维复杂度、查询限制、数据迁移和故障恢复策略。",
          sourceExcerpt: source.slice(460, 620),
          iconHint: "layout",
          priority: 4
        },
        {
          id: "module_5",
          title: "适用场景",
          imageText: "核心交易偏 SQL，弹性数据偏 NoSQL",
          detail:
            "如果系统需要清晰关系、强一致事务、成熟报表和严格约束，SQL 往往是默认选择。如果数据形态变化快、写入量巨大、访问模式简单且可以接受特定一致性取舍，NoSQL 更有优势。实际架构常混用：交易主数据放 SQL，搜索、缓存、日志、画像或图关系放到更适合的 NoSQL 引擎中。",
          sourceExcerpt: source.slice(620, 780),
          iconHint: "idea",
          priority: 5
        }
      ]
    };
  }

  function buildSmartwatchStructureFallbackSpec(question, rawAnswer) {
    const source = String(rawAnswer || question || "");
    return {
      title: "智能手表爆炸结构图",
      language: inferQuestionLanguage(question),
      visualMode: "scene",
      summary: "把智能手表拆成屏幕、电池、传感器、主板、表带和外壳六个可点击部件。",
      relationType: "hierarchy",
      visualComposition: {
        compositionType: "product-exploded-view",
        layoutVariant: "scene",
        visualFocus: "智能手表核心部件的层级拆解",
        primaryModules: ["module_1", "module_2", "module_3"],
        secondaryModules: ["module_4", "module_5", "module_6"],
        densityStrategy: "用爆炸视图展示真实部件轮廓和短标签，避免把产品拆解画成普通流程卡片。",
        moduleCountReason: "智能手表的可交互讲解需要覆盖显示、供电、感知、计算、佩戴和防护六类结构。"
      },
      auxiliaryModules: [],
      modules: [
        {
          id: "module_1",
          title: "屏幕组件",
          imageText: "触控显示与盖板",
          detail:
            "屏幕组件是用户最先接触的部件，由触控面板、显示层和保护盖板叠合而成，处于爆炸图最上层。它同时承担显示、触摸输入和日常防刮防水压力：亮度、刷新率、玻璃材质和贴合工艺会直接影响可读性、功耗和维修成本。它与外壳密封、电池续航和主板排线都紧密相关，所以不能只把它理解成一块显示屏。",
          sourceExcerpt: source.slice(0, 160),
          iconHint: "display",
          regionKind: "object",
          regionPrompt: "智能手表爆炸图最上层的屏幕、触控玻璃和显示面板组件",
          maskPolicy: "subject",
          visualEvidence: ["rectangular watch display", "touch glass layer", "short screen label"],
          locatorQueries: ["屏幕组件", "触控显示层", "watch display glass"]
        },
        {
          id: "module_2",
          title: "电池模块",
          imageText: "续航与充电安全",
          detail:
            "电池模块通常位于机身内部中后层，决定续航、厚度、重量和充电策略，是牵动整机设计的关键部件。容量越大越有利于续航，但会压缩传感器、马达、扬声器和主板的空间；无线充电线圈、保护电路和温控策略又会进一步影响安全和长期可靠性。它在爆炸图中通常处于主板和后盖之间的中间层，与两者通过排线和支架配合。",
          sourceExcerpt: source.slice(160, 320),
          iconHint: "battery",
          regionKind: "object",
          regionPrompt: "智能手表内部的电池块、电池标签、保护电路或充电相关结构",
          maskPolicy: "subject",
          visualEvidence: ["battery cell", "charging coil or protection board", "short battery label"],
          locatorQueries: ["电池模块", "battery cell", "充电线圈"]
        },
        {
          id: "module_3",
          title: "传感器阵列",
          imageText: "心率、血氧与运动感知",
          detail:
            "传感器阵列通常集中在后盖和主板附近，包括心率/血氧光学传感器、加速度计、陀螺仪、气压计或温度传感器。这些器件把佩戴状态、运动变化和身体信号转换成数据流；同时它们也有明显的限制：贴合度、肤色、汗液、运动抖动和算法校准都会影响读数。在爆炸图中，它们通常以独立的小器件或后盖窗口的形式呈现。",
          sourceExcerpt: source.slice(320, 480),
          iconHint: "sensor",
          regionKind: "object",
          regionPrompt: "智能手表后盖或主板附近的传感器阵列、光学窗口和小型传感器器件",
          maskPolicy: "subject",
          visualEvidence: ["sensor cluster", "optical window", "small chips or dots"],
          locatorQueries: ["传感器阵列", "心率血氧传感器", "sensor cluster"]
        },
        {
          id: "module_4",
          title: "主板芯片",
          imageText: "计算、连接与系统控制",
          detail:
            "主板芯片是整机的控制中心，负责处理系统运行、蓝牙/Wi-Fi/蜂窝连接、存储、电源管理和传感器数据汇聚。屏幕、电池、传感器和马达都通过排线或触点与主板协同工作。主板面积越紧凑，对散热、天线布局和维修难度的要求越高，因此爆炸图里通常能看到芯片本体、围绕它的排线和天线触点。",
          sourceExcerpt: source.slice(480, 640),
          iconHint: "chip",
          regionKind: "object",
          regionPrompt: "智能手表内部主板、芯片、排线、天线和连接触点",
          maskPolicy: "subject",
          visualEvidence: ["circuit board", "chips", "flex cable or antenna"],
          locatorQueries: ["主板芯片", "circuit board", "watch motherboard"]
        },
        {
          id: "module_5",
          title: "表带连接",
          imageText: "佩戴稳定与快拆结构",
          detail:
            "表带连接决定佩戴稳定性、舒适度和更换体验。点击后可以解释表耳、快拆针、磁吸或卡扣结构如何承受日常拉扯，同时又要兼顾轻便和易更换。它与外壳不是完全独立：连接位的曲率、宽度和材质会影响手表贴合手腕的姿态，也会影响传感器读数稳定性。图中应把表带和连接机构画成可点击的独立对象。",
          sourceExcerpt: source.slice(640, 800),
          iconHint: "strap",
          regionKind: "object",
          regionPrompt: "智能手表两侧表带、表耳、快拆针或连接卡扣结构",
          maskPolicy: "subject",
          visualEvidence: ["watch strap", "lug connector", "quick release pin"],
          locatorQueries: ["表带连接", "watch strap connector", "表耳快拆结构"]
        },
        {
          id: "module_6",
          title: "外壳防护",
          imageText: "结构强度与防水密封",
          detail:
            "外壳防护把内部部件包裹成可日常佩戴的产品，重点是结构强度、防水密封、按键开孔、后盖贴合和材料手感。除了外观，外壳还决定屏幕保护、电池空间、传感器窗口、天线性能和维修拆装路径。铝合金、不锈钢、陶瓷或塑料的选择会影响重量、耐刮性和成本，常见做法是上盖与后盖通过卡扣或螺丝形成完整包围结构，既要密封也要预留维修入口。",
          sourceExcerpt: source.slice(800, 960),
          iconHint: "shield",
          regionKind: "object",
          regionPrompt: "智能手表外壳、边框、后盖、防水密封圈和按键开孔",
          maskPolicy: "subject",
          visualEvidence: ["watch case", "back cover", "seal ring or button cutout"],
          locatorQueries: ["外壳防护", "watch case", "后盖密封结构"]
        }
      ]
    };
  }

  function buildMapFallbackSpec(question, rawAnswer) {
    const source = String(rawAnswer || question || "");
    const westLake = /西湖|west lake/i.test(String(question || ""));
    const subject = compactTitle(extractQuestionSubject(question));
    if (isHuangshanQuestion(question)) return buildHuangshanMapFallbackSpec(question, rawAnswer);
    if (westLake) return buildWestLakeMapFallbackSpec(question, rawAnswer);
    return {
      title: `${subject}手绘导览地图`,
      language: inferQuestionLanguage(question),
      visualMode: "map",
      summary: "以手绘地图方式呈现核心区域、游线、地标、自然景观、入口和补给点，点击后查看具体讲解。",
      relationType: "hierarchy",
      visualComposition: {
        compositionType: "hand-drawn-map",
        layoutVariant: "map",
        visualFocus: `${subject}的空间关系与可游览区域`,
        primaryModules: ["module_1", "module_2", "module_3"],
        secondaryModules: ["module_4", "module_5", "module_6"],
        densityStrategy: "用区域块、路线、地标图标、自然纹理、入口标记和补给符号组织画面，避免流程图卡片和编号模块。",
        moduleCountReason: "通用导览地图需要覆盖目的地核心区域、可行走路线、标志地标、自然氛围和实用服务点。"
      },
      auxiliaryModules: [],
      modules: [
        {
          id: "module_1",
          title: "核心区域",
          imageText: "主要空间与游览中心",
          detail:
            "核心区域是整张导览地图的视觉中心，应画出目的地最重要的空间、广场、湖面、建筑群或主题区域。点击这里时，详情要说明它在地图中的位置、和周边路线的关系、用户为什么会先到或先看这里，以及它如何决定整个游览节奏。这个区域不是空白背景，而是后续地标、路线、入口和服务点的组织中心。",
          sourceExcerpt: source.slice(0, 140),
          iconHint: "data",
          regionKind: "landmark",
          regionPrompt: `${subject}地图中的核心游览区域，包含中心空间、主要景观或主题场地`,
          priority: 1
        },
        {
          id: "module_2",
          title: "主游览路线",
          imageText: "步行路径与动线方向",
          detail:
            "主游览路线是地图上一条连续的步道、道路、桥廊或环线，把核心区域、地标、入口和休息点串成一条可走的线。沿线哪些路段适合慢行、哪些位置容易形成视线转折，是判断游览节奏的关键。对旅游或园区导览来说，这条路线承担着方向感和时间安排，决定先后顺序、是否回环、是否需要折返——通常它是规划行程时第一条要确认的线。",
          sourceExcerpt: source.slice(140, 280),
          iconHint: "route",
          regionKind: "route",
          regionPrompt: `${subject}地图中的主要步行路线或游览环线，包含道路、步道、桥廊和方向标记`,
          priority: 2
        },
        {
          id: "module_3",
          title: "标志地标",
          imageText: "建筑、雕塑或观景点",
          detail:
            "标志地标是地图上最容易识别的建筑、雕塑、塔、入口景观、观景台或主题装置。它能成为代表整个地点的符号，原因可能是方向锚点、拍照焦点、历史记忆，或者人流自然汇聚的位置。它和主路线、核心区域之间有明确的连接关系，决定了它对游览者来说是必须停留、路过观察，还是适合作为同伴集合的位置。",
          sourceExcerpt: source.slice(280, 420),
          iconHint: "target",
          regionKind: "building",
          regionPrompt: `${subject}地图中的标志性建筑、雕塑、观景点或主题装置`,
          priority: 3
        },
        {
          id: "module_4",
          title: "自然景观",
          imageText: "水面、林地、草坪或山景",
          detail:
            "自然景观区域让地图更像一个真实地点，而不只是建筑标注的集合。它可以是水面、林地、山体、草坪、花园、湿地或开阔视野，带给人遮荫、远眺、拍照、休息或亲水的体验，也带来明显的季节感。它解释了为什么某些路线适合慢走，为什么从某些视角能看到更完整的空间层次——因为人对环境的反应不只来自具体景点，更来自这些大片的自然背景。",
          sourceExcerpt: source.slice(420, 560),
          iconHint: "idea",
          regionKind: "mountain",
          regionPrompt: `${subject}地图中的自然景观区域，包含水面、林地、草坪、山景、花园或湿地纹理`,
          priority: 4
        },
        {
          id: "module_5",
          title: "入口交通",
          imageText: "入口、车站与到达点",
          detail:
            "入口交通是地图上的入口门、停车点、公交/地铁站、索道站、游客中心或换乘点，是把外部交通和内部游线连起来的节点。从哪里进入、怎么衔接主路线、哪些入口适合初次到访、人流密度对游览顺序的影响——这些都直接决定一份地图能不能转化成真实行程。对很多目的地来说，挑对入口比走对路线更关键。",
          sourceExcerpt: source.slice(560, 700),
          iconHint: "tool",
          regionKind: "legend",
          regionPrompt: `${subject}地图中的入口、游客中心、车站、停车点、换乘点或交通图例`,
          priority: 5
        },
        {
          id: "module_6",
          title: "休息补给",
          imageText: "餐饮、卫生间与停留点",
          detail:
            "休息补给点是地图上零散分布的服务节点——咖啡店、餐饮、卫生间、长椅或补水站。它们对游览体验有实际价值：什么时候适合中途休息、附近是否适合等同伴、能不能补给餐饮或处理临时需求，都依赖这些节点的位置。它们不一定是景观核心，但决定了一份地图是漂亮的图示还是可执行的行程。",
          sourceExcerpt: source.slice(700, 860),
          iconHint: "summary",
          regionKind: "object-with-label",
          regionPrompt: `${subject}地图中的休息补给点，包含餐饮、卫生间、长椅、服务台或补水图标和短标签`,
          priority: 6
        }
      ]
    };
  }

  function buildHuangshanMapFallbackSpec(question, rawAnswer) {
    const source = String(rawAnswer || question || "");
    return {
      title: "黄山手绘导览地图",
      language: inferQuestionLanguage(question),
      visualMode: "map",
      summary: "以黄山峰林、经典地标、索道入口、观景路线和住宿补给组织成可点击的游玩导览图。",
      relationType: "hierarchy",
      visualComposition: {
        compositionType: "hand-drawn-map",
        layoutVariant: "map",
        visualFocus: "黄山峰林、索道和经典观景点的空间关系",
        primaryModules: ["module_1", "module_2", "module_3"],
        secondaryModules: ["module_4", "module_5", "module_6"],
        densityStrategy: "用山体层次、登山步道、索道线、松石地标、云海和住宿图标组织画面，避免流程图卡片和产业分析模板。",
        moduleCountReason: "黄山旅游攻略需要覆盖入口交通、经典地标、核心峰顶、峡谷路线、云海观景和山上住宿补给六类可点击区域。"
      },
      auxiliaryModules: [],
      modules: [
        {
          id: "module_1",
          title: "云谷索道入口",
          imageText: "后山上行与换乘点",
          detail:
            "云谷索道是很多游客从后山进入黄山的主要方式，适合把它画在地图边缘或山脚入口处，用缆车线连接到山体上部。点击这里时应说明它如何衔接始信峰、北海或核心游线，也要提醒排队、运营时间、天气停运和返程选择。它不是普通图例，而是决定当天路线方向和体力分配的真实入口节点。",
          sourceExcerpt: source.slice(0, 150),
          iconHint: "tool",
          regionKind: "legend",
          regionPrompt: "黄山地图边缘或山脚的云谷索道入口，包含缆车、站点、换乘标记和短标签",
          maskPolicy: "legend",
          visualEvidence: ["缆车或索道线", "入口站点", "云谷索道短标签"],
          locatorQueries: ["云谷索道入口", "黄山云谷索道站", "cable car station"],
          priority: 1
        },
        {
          id: "module_2",
          title: "迎客松玉屏线",
          imageText: "迎客松、玉屏楼、前山经典点",
          detail:
            "迎客松和玉屏楼是黄山最容易被识别的经典地标，适合画成前山一侧的松树、石阶和楼阁组合。它的价值在于标志性强、拍照辨识度高，但人流也通常更集中。详情应讲清它和玉屏索道、莲花峰或天都峰之间的路线关系，以及如果时间紧张，为什么这里常被安排成重点停留点而不是匆匆路过。",
          sourceExcerpt: source.slice(150, 320),
          iconHint: "target",
          regionKind: "landmark",
          regionPrompt: "黄山迎客松与玉屏楼区域，包含松树、楼阁、石阶和短标签",
          maskPolicy: "subject-with-label",
          visualEvidence: ["迎客松形态", "玉屏楼或山石", "前山路线标签"],
          locatorQueries: ["迎客松玉屏楼区域", "黄山迎客松", "Welcome Pine"],
          priority: 2
        },
        {
          id: "module_3",
          title: "光明顶与云海",
          imageText: "高处观景与日出云海",
          detail:
            "光明顶位于黄山核心高处，适合画成山脊上的观景平台、云海和日出方向。它不是单个小图标，而是帮助游客理解高差、视线和日出日落安排的关键区域。点击后应解释为什么这里适合看云海和远山层次，也要提醒天气能见度、早晚温差、住宿距离和拍摄时间对体验影响很大。",
          sourceExcerpt: source.slice(320, 490),
          iconHint: "idea",
          regionKind: "mountain",
          regionPrompt: "黄山光明顶高处观景区域，包含山脊平台、云海、日出方向和短标签",
          maskPolicy: "full-region",
          visualEvidence: ["高处山脊", "云海或日出", "光明顶短标签"],
          locatorQueries: ["光明顶云海观景区", "Bright Summit Huangshan", "sunrise cloud sea"],
          spatialHint: "center",
          priority: 3
        },
        {
          id: "module_4",
          title: "西海大峡谷",
          imageText: "峡谷栈道与深切山体",
          detail:
            "西海大峡谷应作为一条独立的峡谷路线呈现，画出深切山谷、栈道、悬崖和观景点。它和普通峰顶地标不同，游玩强度更高、路线更长，对体力和时间要求明显。详情应说明它适合安排在天气稳定、体力充足时段，也要讲清是否需要小火车、是否会因为季节或天气限制开放，以及和核心峰区如何衔接。",
          sourceExcerpt: source.slice(490, 660),
          iconHint: "route",
          regionKind: "route",
          regionPrompt: "黄山西海大峡谷路线，包含峡谷、悬崖栈道、观景台和短标签",
          maskPolicy: "route",
          visualEvidence: ["峡谷线", "悬崖栈道", "观景点"],
          locatorQueries: ["西海大峡谷栈道路线", "West Sea Grand Canyon", "黄山峡谷步道"],
          priority: 4
        },
        {
          id: "module_5",
          title: "始信峰松石区",
          imageText: "奇松怪石与近距离观景",
          detail:
            "始信峰区域适合表现黄山奇松、怪石和较紧凑的山路层次，它常和后山入口路线联系在一起，是初入山体后很快能感受到黄山风貌的区域。点击后应解释这里为什么适合观察松石组合、山体纹理和近景构图，也要提示路段可能拥挤、拍照停留时间容易变长，需要给整体行程留余量。",
          sourceExcerpt: source.slice(660, 830),
          iconHint: "nodes",
          regionKind: "landmark",
          regionPrompt: "黄山始信峰松石区域，包含奇松、怪石、短步道和短标签",
          maskPolicy: "full-region",
          visualEvidence: ["奇松", "怪石", "山路或观景点"],
          locatorQueries: ["始信峰奇松怪石", "Shixin Peak", "黄山松石景观"],
          priority: 5
        },
        {
          id: "module_6",
          title: "山上住宿补给",
          imageText: "酒店、餐饮、休息点",
          detail:
            "山上住宿和补给决定黄山攻略能不能落地。地图上应以房屋、床位、餐饮或服务点图标标注它们，位置最好靠近主要观景区或索道衔接处。详情应说明山上住宿价格较高、旺季紧张、早晚温差明显，但它能帮助看日出、减少上下山往返。若不住山上，就需要特别注意末班索道和下山时间。",
          sourceExcerpt: source.slice(830, 1000),
          iconHint: "source",
          regionKind: "object-with-label",
          regionPrompt: "黄山山上住宿补给点，包含酒店、床位、餐饮或服务图标和短标签",
          maskPolicy: "subject-with-label",
          visualEvidence: ["房屋或床位图标", "住宿补给短标签", "靠近山体路线"],
          locatorQueries: ["黄山山上住宿补给", "山顶酒店", "hotel lodging marker"],
          componentHints: [
            { kind: "object", label: "酒店或床位图标" },
            { kind: "label", label: "住宿补给" }
          ],
          priority: 6
        }
      ]
    };
  }

  function buildWestLakeMapFallbackSpec(question, rawAnswer) {
    const source = String(rawAnswer || question || "");
    return {
      title: "西湖手绘导览地图",
      language: inferQuestionLanguage(question),
      visualMode: "map",
      summary: "以西湖水面为中心，把堤桥、湖心岛、南北岸山体和典型景点拆成可点击地理区域。",
      relationType: "hierarchy",
      visualComposition: {
        compositionType: "hand-drawn-map",
        layoutVariant: "map",
        visualFocus: "西湖水面与环湖十景地标",
        primaryModules: ["module_1", "module_2", "module_3", "module_4"],
        secondaryModules: ["module_5", "module_6", "module_7", "module_8", "module_9"],
        densityStrategy: "用湖面、堤桥、岛屿、山体、塔影、荷塘和南岸园景组织画面，避免流程图卡片和编号模块。",
        moduleCountReason: "西湖地图需要覆盖多个真实地理点位，9 个区域比固定 5 或 6 块更符合可交互导览。"
      },
      auxiliaryModules: [],
      modules: [
        {
          id: "module_1",
          title: "西湖水域",
          imageText: "湖面、游船、倒影",
          detail:
            "西湖水域是整张地图的空间中心，把白堤、苏堤、湖心岛、南岸塔影和北岸山体组织到同一个视野里。水面不是空白背景，而是游览节奏和方向感的核心：堤桥切分湖区，游船连接岛屿，远山倒影提供层次。从岸边、堤上和船上看西湖，会得到完全不同的空间感——湖面开阔处适合远眺，近岸水面则更适合观察柳影、荷叶和船行路线。",
          sourceExcerpt: source.slice(0, 140),
          iconHint: "data",
          regionKind: "water",
          regionPrompt: "西湖中央大面积湖水区域，包含湖面、游船、水波和倒影",
          maskPolicy: "full-region",
          visualEvidence: ["开阔湖面", "游船或水波", "周边堤岸形成边界"],
          locatorQueries: ["西湖中央湖面", "大面积水域和游船", "lake water area"]
        },
        {
          id: "module_2",
          title: "白堤断桥",
          imageText: "北岸长堤与桥",
          detail:
            "白堤和断桥位于西湖北岸，是一条由堤岸、桥、柳树和湖面边界连成的完整横向游线，也是进入湖区的诗意入口：一边靠近历史街区和孤山，一边打开湖面视线。这里更适合慢行观景，桥、堤、柳共同形成可识别的线性地理区域。从这里能看见孤山、宝石山轮廓与远处湖心的视线层次，不同季节的桥面与柳岸观感差异明显——春天柳色嫩绿，夏秋桥面人多喧闹，冬日断桥常残雪相伴。",
          sourceExcerpt: source.slice(140, 280),
          iconHint: "route",
          regionKind: "route",
          regionPrompt: "西湖北侧的白堤和断桥，长堤、桥、柳树、湖岸线组成的线性区域",
          maskPolicy: "route",
          spatialHint: "north",
          visualEvidence: ["北侧长堤", "断桥", "柳树和湖岸线"],
          locatorQueries: ["白堤断桥完整路线", "north causeway bridge", "西湖北岸长堤"]
        },
        {
          id: "module_3",
          title: "苏堤春晓",
          imageText: "纵贯湖面的堤路",
          detail:
            "苏堤应像一条纵向绿色脊线穿过湖面，两侧有水面、拱桥、垂柳和步行路线。点击此区域时，详情要讲清它如何把西湖南北两端串联起来，以及春日柳色、桥影和湖风怎样构成典型体验。它和白堤不同，更像一条穿湖而过的长轴，适合解释步行距离、桥洞节奏、两侧视野变化和清晨观景层次。详情还应说明它为什么常被当作贯穿湖区的主游线，以及从堤上回看两侧湖面的取景价值。",
          sourceExcerpt: source.slice(280, 420),
          iconHint: "timeline",
          regionKind: "route",
          regionPrompt: "纵贯西湖的苏堤，堤路、桥、柳树和两侧湖水形成的长条区域",
          maskPolicy: "route",
          spatialHint: "west",
          visualEvidence: ["纵向堤路", "多座桥或桥洞", "两侧湖水"],
          locatorQueries: ["苏堤春晓纵向堤路", "Su Causeway route", "穿过湖面的长堤"]
        },
        {
          id: "module_4",
          title: "三潭印月",
          imageText: "湖心岛与石塔",
          detail:
            "三潭印月应位于湖心附近，用小岛、水中石塔和环形游线表达。它面积不必最大，但必须清晰可辨，因为它承担地图中的精致焦点。点击后可以解释石塔、月影、水面和岛屿之间的关系，也说明它与岸边景点不同：体验依赖船行距离和湖面留白，石塔是识别锚点，周围水面负责呈现宁静和层次。详情可以补充乘船靠近时的观察角度，以及它为什么适合做局部放大讲解。",
          sourceExcerpt: source.slice(420, 560),
          iconHint: "target",
          regionKind: "landmark",
          regionPrompt: "西湖湖心附近的三潭印月，小岛、三座石塔和周围水面",
          maskPolicy: "subject",
          spatialHint: "center",
          visualEvidence: ["湖心小岛", "三座石塔", "环绕水面"],
          locatorQueries: ["三潭印月湖心岛和石塔", "three pools mirroring the moon", "西湖中央小岛"]
        },
        {
          id: "module_5",
          title: "雷峰塔",
          imageText: "南岸塔影与山色",
          detail:
            "雷峰塔位于西湖南岸偏高处，与山体、夕照和湖面倒影一起构成南岸的垂直视觉锚点。它不只是建筑标志，更是南岸天际线、历史传说和远眺视角的集中体现，也能帮助辨认湖面南北方向。从湖面看，雷峰塔在山体背景上特别突出；从南岸看湖，则能把水域、山体和城市边缘连成一片。游览时通常和南岸的园景安排在一起，黄昏前后光线最好。",
          sourceExcerpt: source.slice(560, 700),
          iconHint: "idea",
          regionKind: "building",
          regionPrompt: "西湖南岸的雷峰塔，塔身、山坡、夕照和湖面倒影组成的区域",
          maskPolicy: "subject",
          spatialHint: "south",
          visualEvidence: ["南岸塔身", "山坡或夕照", "湖面倒影"],
          locatorQueries: ["雷峰塔南岸塔影", "Leifeng Pagoda", "西湖南岸塔"]
        },
        {
          id: "module_6",
          title: "孤山",
          imageText: "北岸山岛与人文点",
          detail:
            "孤山位于西湖北侧、紧邻白堤，是一座小型山岛，山体不高但聚集了亭台、园林和文化建筑。它在西湖里承担北岸地形和人文气质的双重作用：一面延续白堤断桥的游线，另一面把湖面从单纯水域转成有山、有岸、有历史层次的空间。从孤山步行登高能眺望湖面，沿岸的园林又适合静坐停留——它本身是一片可以慢慢走的地理区域，而不只是地图上的一个小标记。",
          sourceExcerpt: source.slice(700, 840),
          iconHint: "nodes",
          regionKind: "landmark",
          regionPrompt: "西湖北侧孤山，山体、湖岸、亭台或文化建筑形成的岛状地标区域",
          maskPolicy: "full-region",
          spatialHint: "northwest",
          visualEvidence: ["北岸山岛", "湖岸边界", "亭台或文化建筑"],
          locatorQueries: ["孤山完整山岛区域", "Gushan hill island", "西湖北侧孤山"]
        },
        {
          id: "module_7",
          title: "宝石山",
          imageText: "北岸山脊与保俶塔",
          detail:
            "宝石山位于西湖北岸偏东北方向，山脊、林木和山顶的保俶塔共同构成北岸的高处地标。它与雷峰塔隔湖相望——一个偏北，一个偏南，共同给西湖提供纵深和方向感。宝石山不是孤立的一座塔，而是一段连续的山体背景，把平面的湖区扩展成有山、有岸、有城市边缘的环湖山水格局。从山上往下看，能把湖面、城市天际线和远处群山一并收入视野。",
          sourceExcerpt: source.slice(840, 980),
          iconHint: "summary",
          regionKind: "mountain",
          regionPrompt: "西湖北岸宝石山，山脊、保俶塔、林木和城市边缘组成的高处区域",
          maskPolicy: "full-region",
          spatialHint: "northeast",
          visualEvidence: ["北岸山脊", "保俶塔或高塔", "林木轮廓"],
          locatorQueries: ["宝石山和保俶塔", "Baoshi Hill ridge", "西湖北岸山脊"]
        },
        {
          id: "module_8",
          title: "曲院风荷",
          imageText: "荷塘、曲桥、夏景",
          detail:
            "曲院风荷位于西湖西北侧或近岸位置，是一片由荷塘、水面、曲桥和岸边植物组成的园林区域。它和普通湖岸最大的不同在于：重点不是开阔水面，而是夏季的荷景、近岸停留和园林路径——荷叶、桥线和岸边树影共同形成一个紧凑、可识别的小尺度环境。夏季和清晨最能体现风荷的层次，是从大湖面切换到细腻水生植物景观的过渡带。",
          sourceExcerpt: source.slice(980, 1120),
          iconHint: "risk",
          regionKind: "landmark",
          regionPrompt: "西湖北西侧曲院风荷，荷塘、曲桥、近岸植物和水面形成的景区区域",
          maskPolicy: "full-region",
          spatialHint: "northwest",
          visualEvidence: ["荷叶或荷花", "曲桥", "近岸园林"],
          locatorQueries: ["曲院风荷荷塘区域", "lotus pond and curved bridge", "西湖荷花景区"]
        },
        {
          id: "module_9",
          title: "柳浪闻莺",
          imageText: "南岸柳林与园景",
          detail:
            "柳浪闻莺位于西湖南岸或东南岸近水园林中，柳树、园路、湖岸和鸟鸣组成柔和的岸线区域。它与雷峰塔这类高耸地标完全不同——重点不是远眺，而是贴近湖岸的步行体验、春日柳色和园林声景。这片区域提醒人们南岸并不只有塔和远山，也有适合慢慢穿行、拍摄近景和感受季节变化的低矮景观带。柳树、岸线和游步道形成一个连续的环境，春夏之际尤其有声音和颜色的层次感。",
          sourceExcerpt: source.slice(1120, 1260),
          iconHint: "source",
          regionKind: "landmark",
          regionPrompt: "西湖南岸柳浪闻莺，柳树、园路、湖岸和鸟鸣意象组成的近岸景区",
          maskPolicy: "full-region",
          spatialHint: "southeast",
          visualEvidence: ["南岸柳树", "园路", "湖岸近景"],
          locatorQueries: ["柳浪闻莺南岸柳林", "willow waves and orioles", "西湖南岸园林"]
        }
      ]
    };
  }

  function buildSanqingMapFallbackSpec(question, rawAnswer) {
    const source = String(rawAnswer || question || "");
    return {
      title: "三清山手绘导览地图",
      language: inferQuestionLanguage(question),
      visualMode: "map",
      summary: "以三清山核心峰林、东西海岸栈道、索道入口和山上住宿点组织成可点击的手绘游玩地图。",
      relationType: "hierarchy",
      visualComposition: {
        compositionType: "hand-drawn-map",
        layoutVariant: "map",
        visualFocus: "三清山峰林与东西两侧栈道",
        primaryModules: ["module_1", "module_2", "module_3"],
        secondaryModules: ["module_4", "module_5"],
        densityStrategy: "用山体、两条栈道、索道入口、住宿房屋图标和短标签组织画面，避免流程图和大卡片。",
        moduleCountReason: "三清山游玩导览需要覆盖核心景区、两条主要栈道、交通入口和住宿补给五类可点击区域。"
      },
      auxiliaryModules: [],
      modules: [
        {
          id: "module_1",
          title: "南清园核心景区",
          imageText: "巨蟒出山与司春女神",
          detail:
            "南清园是三清山最集中的花岗岩峰林观赏区，巨蟒出山、司春女神等奇峰都集中在这一片，沿途多石阶和观景台，整段游览大约需要两到三小时。这里台阶多，体力消耗较大，适合安排在体力较好的时段；走的时候能看到山体节理、孤峰造型和观景台视角的变化。如果遇到雨雾，能见度会影响远景，但近处奇峰穿过云雾的层次反而更有氛围。",
          sourceExcerpt: source.slice(0, 160),
          iconHint: "target",
          regionKind: "landmark",
          regionPrompt: "地图中心的南清园核心景区，包含巨蟒出山、司春女神等花岗岩奇峰和短标签",
          priority: 1
        },
        {
          id: "module_2",
          title: "西海岸栈道",
          imageText: "西侧悬崖云海路线",
          detail:
            "西海岸栈道位于山体西侧，是一条贴着悬崖延展的线性路线，沿途可见云海、峭壁和观景台。它的视野横向打开很广——一侧是山壁和栈道，一侧是开阔云海，适合慢走拍照。傍晚的云海与晚霞最值得停下来看，但栈道在雨雾天气会变得湿滑，需要注意脚下防滑。如果时间有限，建议挑天气稳定、风不太大的时段走完整段。",
          sourceExcerpt: source.slice(160, 320),
          iconHint: "route",
          regionKind: "route",
          regionPrompt: "地图西侧或山体西侧的西海岸栈道，包含云海、悬崖栈道线、观景台和短标签",
          priority: 2
        },
        {
          id: "module_3",
          title: "阳光海岸栈道",
          imageText: "阳光海岸栈道·东侧日出山脊",
          detail:
            "阳光海岸栈道应作为独立于西海岸的东侧路线呈现，画出山脊、树林、阳光方向和连续步道。点击后说明它与西海岸的差异：更偏开阔山脊和植被层次，适合串联观景台，但仍需结合天气和体力安排。它可以承担地图中的东侧游线，帮助用户理解两条海岸栈道不是同一个区域；如果想看日照、山脊线和较明亮的林间层次，阳光海岸应单独规划停留时间。",
          sourceExcerpt: source.slice(320, 480),
          iconHint: "route",
          regionKind: "route",
          regionPrompt: "地图东侧或山体东侧的阳光海岸栈道，包含朝阳、树林、山脊栈道线、观景台和短标签",
          priority: 3
        },
        {
          id: "module_4",
          title: "交通索道入口",
          imageText: "外双溪与金沙索道",
          detail:
            "三清山上下山高度依赖索道，外双溪索道和金沙索道是两个主要入口，分别连接山的不同侧面，决定了你从哪一侧进山、如何衔接住宿和核心景区。索道运营受天气影响明显，遇到大风、雷雨可能临时停运；出发前最好确认当天开放时间，留出排队余量。如果索道停运，原行程会被显著影响，必要时要准备替代方案——比如改换另一条索道或调整核心景区顺序。",
          sourceExcerpt: source.slice(480, 640),
          iconHint: "tool",
          regionKind: "legend",
          regionPrompt: "地图底部或边缘的交通索道入口图例，包含外双溪索道、金沙索道、缆车或车站图标和短标签",
          priority: 4
        },
        {
          id: "module_5",
          title: "山上住宿点",
          imageText: "房屋床位与补给标记",
          detail:
            "山上住宿点指三清山山顶或山脊上的可入住资源，主要集中在索道站附近或服务区。山上床位有限，旺季和周末通常需要提前一周以上预订，价格也比山下高出不少；夜间气温较低，补给比山下少，洗澡热水有时不稳定。住在山上可以减少早晚往返，对赶日出日落行程很有用，但同时要承担天气变化和供应紧张的风险。如果不住山上，就需要更严格控制返程时间和最后一班索道节点。",
          sourceExcerpt: source.slice(640, 800),
          iconHint: "source",
          regionKind: "object-with-label",
          maskPolicy: "subject-with-label",
          regionPrompt: "地图上的山上住宿点实体标记，必须包含房屋、床位、宾馆或补给图标，并贴近‘住宿’或宾馆名称短标签",
          visualEvidence: ["房屋、床位或宾馆图标", "‘住宿’或宾馆名称短标签", "标记位于山体或索道站附近而不是普通图例里"],
          locatorQueries: ["山上住宿点", "女神宾馆", "日上山庄", "住宿房屋标记"],
          componentHints: [
            { kind: "object", label: "住宿房屋或床位图标" },
            { kind: "label", label: "住宿或宾馆名称短标签" }
          ],
          priority: 5
        }
      ]
    };
  }

  function buildSceneFallbackSpec(question, rawAnswer) {
    const source = String(rawAnswer || question || "");
    const subject = compactTitle(extractQuestionSubject(question)) || "插画场景";
    const hasGuideRobot = /导览|机器人|robot|guide/i.test(String(question || source));
    return {
      title: subject,
      language: inferQuestionLanguage(question),
      visualMode: "scene",
      summary: "以一个完整插画场景呈现可点击对象、人物和空间结构，点击后解释各元素的作用、风貌和体验价值。",
      relationType: "hierarchy",
      visualComposition: {
        compositionType: "illustrated-scene",
        layoutVariant: "scene",
        visualFocus: hasGuideRobot ? "导览机器人与沉浸式展品" : "场景中的核心对象与空间层次",
        primaryModules: ["module_1", "module_2"],
        secondaryModules: ["module_3", "module_4"],
        densityStrategy: "用真实对象、人物、空间纵深、短标签和局部光影组织画面，避免流程图、大卡片和编号模块。",
        moduleCountReason: "场景图需要覆盖主要对象、人物活动、空间结构和辅助信息，才能支持点击后继续讲解。"
      },
      auxiliaryModules: [],
      modules: [
        {
          id: "module_1",
          title: hasGuideRobot ? "导览机器人" : "核心对象",
          imageText: hasGuideRobot ? "AI个性化导览" : "场景焦点对象",
          detail: hasGuideRobot
            ? "导览机器人是这个场景里最适合主动交互的角色。它通常会通过观察、触屏或语音了解观众的兴趣和身份特征，再结合展厅当前的人流和展项排队情况，给出推荐路线和讲解节奏。和静态展板不同，它能在用户面前停下来回答问题、把复杂展项拆成几句通俗讲解，必要时还能用屏幕、投影或灯光把视线带到关键展品上。"
            : "这个对象是场景里最容易被注意到的视觉主体——它的位置、轮廓和体量决定了观众第一眼会落在哪里。它既影响周围其他元素如何排布，也决定了观众接下来去哪里、看什么、停多久。理解它的尺度和功能，能帮助看懂整个场景的节奏。",
          sourceExcerpt: source.slice(0, 160),
          iconHint: "idea",
          regionKind: hasGuideRobot ? "object-with-label" : "object",
          regionPrompt: hasGuideRobot ? "visible guide robot plus the attached AI personalized guide short label badge" : "main visible object in the illustrated scene",
          priority: 1,
          visualEvidence: hasGuideRobot ? ["visible robot body", "AI个性化导览 short label", "object and label close together"] : ["main object silhouette", "visible scene focus"],
          maskPolicy: hasGuideRobot ? "subject-with-label" : "subject",
          spatialHint: "foreground or center",
          locatorQueries: hasGuideRobot ? ["导览机器人", "AI个性化导览", "guide robot with attached label"] : ["main scene object", "core exhibit object"],
          componentHints: hasGuideRobot
            ? [
                { kind: "object", label: "guide robot body" },
                { kind: "label", label: "AI个性化导览" }
              ]
            : []
        },
        {
          id: "module_2",
          title: "核心展品",
          imageText: "沉浸式展项",
          detail:
            "核心展品承载着整个场景的主题——它通常是一个轮廓清晰、材质明确、配有特定光影的装置、展柜或沉浸式影像区域。展品展示什么内容、观众能从哪个角度观察、是否支持触摸或语音互动，决定了观众停留多久；它和导览机器人、空间动线之间的配合，又决定了观众接下来去哪里。这种展品不是背景装饰，而是场景的视觉锚点。",
          sourceExcerpt: source.slice(160, 320),
          iconHint: "target",
          regionKind: "object",
          regionPrompt: "central immersive exhibit installation or display object",
          priority: 2,
          visualEvidence: ["visible exhibit object", "display surface or installation", "clear boundary"],
          maskPolicy: "subject",
          spatialHint: "center",
          locatorQueries: ["核心展品", "immersive exhibit", "central display installation"],
          componentHints: []
        },
        {
          id: "module_3",
          title: "观众互动",
          imageText: "观看与参与",
          detail:
            "观众互动区域是场景里能看见真实使用情况的地方——人在停留、观看、讨论、触摸交互屏或跟随导览。这些人群的位置、动作和注意力方向告诉我们：这个场景是怎样让观众从被动观看变成主动探索的。人物的尺度通常不会喧宾夺主，但需要清晰可辨，否则就只剩下空荡荡的展厅。",
          sourceExcerpt: source.slice(320, 480),
          iconHint: "user",
          regionKind: "person",
          regionPrompt: "visible visitor group interacting with the exhibit or guide robot",
          priority: 3,
          visualEvidence: ["visitor group", "interaction gesture", "near exhibit"],
          maskPolicy: "subject",
          spatialHint: "foreground or side",
          locatorQueries: ["观众互动", "visitor group", "people interacting with exhibit"],
          componentHints: []
        },
        {
          id: "module_4",
          title: "空间结构",
          imageText: "动线与沉浸感",
          detail:
            "空间结构决定这是一张可以走进去的场景图，还是只是平铺的说明图。天花、墙面、展厅通道、光带、投影和分区边界共同形成空间的骨架——观众会顺着这些线索判断自己怎样移动。动线把入口、展品、导览机器人和停留点连起来；其中冷光带、深色顶面、悬浮投影这类线索会强化科技感与沉浸感。",
          sourceExcerpt: source.slice(480, 640),
          iconHint: "layout",
          regionKind: "background",
          regionPrompt: "museum interior structure including circulation path, walls, ceiling light bands, and projection zones",
          priority: 4,
          visualEvidence: ["interior architecture", "circulation path", "light bands or projection zones"],
          maskPolicy: "full-region",
          spatialHint: "background",
          locatorQueries: ["空间结构", "museum interior structure", "circulation path"],
          componentHints: []
        }
      ]
    };
  }

  function buildSemanticTargetFallbackSpec(question, rawAnswer, visualMode, explicitTargets) {
    const mode = normalizeVisualMode(visualMode);
    const source = String(rawAnswer || question || "");
    const targets = normalizeExplicitVisualTargets(explicitTargets && explicitTargets.length ? explicitTargets : extractExplicitVisualTargets(question, mode));
    const fallbackTargets = targets.length
      ? targets
      : mode === "poster"
        ? ["视觉主体", "问题证据", "行动人物", "解决方案"]
        : mode === "scene"
          ? ["核心对象", "关键设备", "人物互动", "环境结构"]
          : ["核心区域", "主路线", "标志地标", "服务信息"];
    const maxModules = getMaxMainModulesForVisualMode(mode);
    const modules = fallbackTargets.slice(0, Math.max(3, Math.min(maxModules, fallbackTargets.length))).map((target, index) =>
      buildSemanticTargetModule(target, index, mode, source)
    );
    const title = inferGenericVisualTitle(question, mode) || compactTitle(extractQuestionSubject(question));
    const compositionType = mode === "map" ? "hand-drawn-map" : mode === "poster" ? "editorial-poster" : "illustrated-scene";
    const summary =
      mode === "map"
        ? "用可点击地理区域、路线和服务点组织成一张完整导览图。"
        : mode === "poster"
          ? "用可点击主体、证据和行动元素组织成一张海报式视觉。"
          : "用可点击对象、人物、设备和空间区域组织成一个完整场景。";
    return {
      title,
      language: inferQuestionLanguage(question),
      visualMode: mode,
      summary,
      relationType: "hierarchy",
      visualComposition: {
        compositionType,
        layoutVariant: mode,
        visualFocus: modules.slice(0, 2).map((module) => module.title).join(" / ") || title,
        primaryModules: modules.slice(0, 2).map((module) => module.id),
        secondaryModules: modules.slice(2).map((module) => module.id),
        densityStrategy:
          mode === "map"
            ? "用有边界的地理块、路线笔触、短标签和图例组织信息，避免流程图和大卡片。"
            : mode === "poster"
              ? "用主体剪影、证据物件、行动人物和短标语形成海报层级，避免编号卡片。"
              : "用真实物体、人物动作、设备轮廓、短标签和空间层次组织画面，避免套用展厅模板。",
        moduleCountReason: `${mode} 模式按用户点名的 ${modules.length} 个可见目标生成热点，不强行固定为五段模板。`
      },
      auxiliaryModules: [],
      modules
    };
  }

  function buildSemanticTargetModule(target, index, visualMode, source) {
    const title = sanitizeExplicitTargetLabel(target) || `目标 ${index + 1}`;
    const regionKind = inferSemanticTargetRegionKind(title, visualMode);
    const maskPolicy = inferSemanticTargetMaskPolicy(regionKind, visualMode);
    const id = `module_${index + 1}`;
    return {
      id,
      title,
      imageText: title.length > 14 ? title.slice(0, 14) : title,
      detail: buildSemanticTargetDetail(title, visualMode),
      sourceExcerpt: source.slice(index * 140, index * 140 + 180) || source.slice(0, 180),
      iconHint: regionKind === "route" ? "route" : regionKind === "person" ? "user" : regionKind === "legend" || regionKind === "panel" ? "summary" : "target",
      regionKind,
      regionPrompt: buildSemanticTargetRegionPrompt(title, regionKind, visualMode),
      priority: index + 1,
      visualEvidence: buildSemanticTargetEvidence(title, regionKind, visualMode),
      maskPolicy,
      spatialHint: inferSemanticTargetSpatialHint(title, index),
      locatorQueries: buildSemanticTargetLocatorQueries(title, regionKind, visualMode),
      componentHints:
        maskPolicy === "subject-with-label"
          ? [
              { kind: "object", label: title },
              { kind: "label", label: `${title}短标签` }
            ]
          : []
    };
  }

    function buildSemanticTargetDetail(title, visualMode) {
      // The detail shown to end users when the LLM did not provide a per-module
      // explanation. These strings must read like a real, if generic, attempt
      // to describe the named target — NOT like a meta instruction telling
      // the system what should be displayed. (Earlier versions wrote things
      // like "点击后需要说明它在整体空间中的方位…" which leaks the
      // machine-facing template into the user-facing detail panel.)
      if (visualMode === "map") {
        return `${title}是地图中被单独标出的一处区域。它通常位于路径与地标之间的某个节点，附近会有可识别的入口、标志物或路线交汇；如果用户经过这里，可以借助它判断方向、设定停留时间，并在它和相邻区域之间安排顺序。具体的方位、设施和适合时段需要结合出行计划和当时天气，但作为地图上的一个明确节点，它能帮用户把整片区域拆成可执行的几段。`;
      }
      if (visualMode === "poster") {
        return `${title}是海报里的一处独立叙事元素，承担一段视觉论述：它可能代表问题的成因、变化的过程、群体的状态，或者一种期望中的结果。它和海报里其他元素之间形成对照或推进，让海报想表达的主张更具体。把它当作一个能单独成图的小故事去看，比把整张海报当成一句口号更接近设计者的意图。`;
      }
      return `${title}是场景里一个独立的对象或区域。它有自己的轮廓、用途和与人或其他物体之间的关系：用户进入这个场景时，会下意识把它当作一个可以走近、操作或观察的目标。它的位置和样貌决定了它在场景里的角色——是焦点、辅助、还是背景里的一处细节——也影响周围其他元素的安排。`;
    }

  function buildSemanticTargetRegionPrompt(title, regionKind, visualMode) {
    if (visualMode === "map") return `${title}的完整地理足迹，包含可见边界、路线或短标签，不只框文字`;
    if (regionKind === "person") return `${title}人物或人群的完整可见轮廓和贴近标签`;
    if (regionKind === "panel") return `${title}信息面板或标语块的完整可见边界`;
    return `${title}完整可见主体及其贴近短标签，不只框文字`;
  }

  function buildSemanticTargetEvidence(title, regionKind, visualMode) {
    if (visualMode === "map") return [title, "可见地理边界或路线", "贴近目标的短标签"];
    if (regionKind === "person") return [title, "人物轮廓或动作", "与主题相关的互动关系"];
    if (regionKind === "panel") return [title, "面板边界或标语块", "可读短标签"];
    return [title, "主体轮廓", "贴近主体的短标签或图标"];
  }

  function buildSemanticTargetLocatorQueries(title, regionKind, visualMode) {
    const base = [title, `${title}完整区域`, `${title}短标签`];
    if (visualMode === "map") base.push(`${title}地图区域`);
    if (regionKind === "route") base.push(`${title}路线`);
    if (regionKind === "person") base.push(`${title}人物`);
    return base.slice(0, 4);
  }

  function inferSemanticTargetMaskPolicy(regionKind, visualMode) {
    if (regionKind === "route") return "route";
    if (regionKind === "legend" || regionKind === "panel") return "legend";
    if (visualMode === "map" && ["building", "landmark", "object-with-label"].includes(regionKind)) return "subject-with-label";
    if (regionKind === "person" || regionKind === "object") return "subject";
    if (regionKind === "object-with-label") return "subject-with-label";
    return visualMode === "map" ? "full-region" : "subject";
  }

  function inferSemanticTargetRegionKind(title, visualMode) {
    const text = String(title || "").toLowerCase();
    if (visualMode === "map") {
      if (/(\u7eff\u9053|\u8def\u7ebf|\u6b65\u884c|\u6b65\u9053|\u8fde\u5eca|\u6e38\u7ebf|\u6808\u9053|\u6865|route|trail|path|walkway|corridor)/i.test(text)) return "route";
      if (/(\u5730\u94c1|\u516c\u4ea4|\u63a5\u9a73|\u5355\u8f66|\u8f66\u7ad9|\u5165\u53e3|\u4ea4\u901a|metro|bus|bike|station)/i.test(text)) return "legend";
      if (/(\u697c|\u697c\u7fa4|\u5efa\u7b51|\u56de\u6536\u7ad9|building|tower)/i.test(text)) return "building";
      if (/(\u6d77|\u6e56|\u6cb3|\u5cb8\u7ebf|water|lake|river|coast)/i.test(text)) return "water";
      return "landmark";
    }
    if (/(\u673a\u5668\u4eba|\u5bfc\u89c8|\u52a9\u624b|robot|guide|assistant)/i.test(text)) return "object-with-label";
    if (/(\u5bb6\u5ead\u6210\u5458|\u5fd7\u613f\u8005|\u89c2\u4f17|\u4eba\u7fa4|\u4eba\u7269|person|people|visitor|volunteer)/i.test(text)) return "person";
    if (/(\u5e94\u6025\u51fa\u53e3|\u51fa\u53e3|\u5165\u53e3|\u95e8\u724c|\u6307\u793a\u724c|\u6807\u724c|exit|entrance|signage|sign)/i.test(text)) return "object-with-label";
    if (/(\u6807\u8bed|\u9762\u677f|\u70ed\u529b\u56fe|\u805a\u5408\u533a|\u5c0f\u5361\u7247|\u5206\u7ec4|\u56de\u6536\u7ad9|panel|heatmap|card|zone|station|slogan)/i.test(text)) return "panel";
    if (/(\u6807\u7b7e|\u5fbd\u6807|label|badge)/i.test(text)) return "object-with-label";
    return "object";
  }

  function inferSemanticTargetSpatialHint(title, index) {
    const text = String(title || "");
    if (/(\u5165\u53e3|\u4ea4\u901a|\u5730\u94c1|\u516c\u4ea4|\u5355\u8f66)/.test(text)) return "edge or bottom";
    if (/(\u6807\u8bed|\u9762\u677f|\u56fe\u4f8b)/.test(text)) return "side or bottom";
    const hints = ["center", "left", "right", "top", "bottom", "foreground", "background", "side"];
    return hints[index % hints.length];
  }

  function extractExplicitVisualTargets(question, visualMode = inferVisualMode(question)) {
    const source = String(question || "");
    const segments = [];
    const patterns = [
      /(?:\u70b9\u51fb|\u70b9\u51fb\u4ea4\u4e92)\s*([^。！？.!?\n]+)/g,
      /(?:\u8bf7?\u5305\u542b|\u5305\u62ec|\u9700\u8981\u5c55\u793a|\u5c55\u793a|\u8981\u6709|\u5e94\u6709|\u91cc\u8981\u6709|\u753b\u51fa|\u753b\u4e0a|\u5448\u73b0)([^。！？.!?\n]+)/g,
      /[：:]\s*([^。！？.!?\n]+)/g
    ];
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(source))) segments.push(match[1]);
    }
    if (!segments.length && visualMode !== "infographic") segments.push(source);
    const targets = normalizeExplicitVisualTargets(segments.flatMap(splitExplicitTargetSegment));
    return removeBackdropSubjectTarget(targets, source);
  }

  function removeBackdropSubjectTarget(targets, question) {
    if (!Array.isArray(targets) || targets.length < 4) return targets;
    const backdrop = extractBackdropSubjectTarget(question);
    if (!backdrop) return targets;
    const backdropKey = normalizeTitleForCompare(backdrop);
    const filtered = targets.filter((target) => normalizeTitleForCompare(target) !== backdropKey);
    return filtered.length >= 3 ? filtered : targets;
  }

  function extractBackdropSubjectTarget(question) {
    const match = String(question || "").match(/(?:展示|呈现|画出|画上)\s*([^，,。！？!?\n：:]{2,32})\s*(?:[，,]\s*(?:点击|点击交互|用户可以点击|可点击)|[：:])/);
    return match ? sanitizeExplicitTargetLabel(stripLeadingVisualInstructionPrefix(match[1])) : "";
  }

  function splitExplicitTargetSegment(segment) {
    const cleaned = stripInstructionTail(segment)
      .replace(/[\uff1a:]\s*/g, "\u3001")
      .replace(/\u4ee5\u53ca|\u4ee5\u53ca|and|&/gi, "\u3001")
      .replace(/\s+\u548c\s+/g, "\u3001");
    return cleaned
      .split(/[\u3001\uff0c,;；]/)
      .map(sanitizeExplicitTargetLabel)
      .filter(Boolean);
  }

  function normalizeExplicitVisualTargets(targets) {
    const seen = new Set();
    const result = [];
    for (const target of targets || []) {
      const cleaned = sanitizeExplicitTargetLabel(target);
      if (!cleaned) continue;
      const key = normalizeTitleForCompare(cleaned);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      result.push(cleaned);
    }
    return result;
  }

  function sanitizeExplicitTargetLabel(value) {
    return stripInstructionTail(value)
      .replace(/^(?:\u8fd9\u4e9b|\u6bcf\u4e2a|\u5404\u4e2a|\u53ef\u89c6|\u660e\u663e|\u5177\u4f53|\u4e3b\u8981)\s*/g, "")
      .replace(/(?:\u90fd)?(?:\u8981)?(?:\u6210\u4e3a)?(?:\u53ef\u70b9\u51fb|\u70b9\u51fb|\u4e92\u52a8)(?:\u5143\u7d20|\u533a\u57df|\u7269\u4f53)?[\s\S]*$/g, "")
      .replace(/(?:\u8fd9\u4e9b)?(?:\u7269\u4f53|\u533a\u57df)?(?:\u90fd)?(?:\u80fd|\u53ef\u4ee5)\u70b9\u51fb[\s\S]*$/g, "")
      .replace(/(?:\u53ef\u4ee5|\u53ef)\s*(?:\u770b|\u67e5\u770b|\u5c55\u793a|\u5448\u73b0)[\s\S]*$/g, "")
      .replace(/(?:\u6765)?\u4e86\u89e3(?:\u7ec6\u8282|\u8be6\u60c5)?[\s\S]*$/g, "")
      .replace(/\u4e0d\u8981\u6d41\u7a0b\u56fe/g, "")
      .replace(/\u753b\u5728\u4e00\u5f20\u56fe\u4e0a/g, "")
      .replace(/(?:\u90fd)?(?:\u8981)?(?:\u6210\u4e3a)?\u53ef$/g, "")
      .replace(/(?:\u8fd9\u4e9b)?(?:\u7269\u4f53|\u533a\u57df)(?:\u6216\u533a\u57df)?(?:\u90fd)?(?:\u80fd|\u53ef\u4ee5)?$/g, "")
      .replace(/\s+/g, " ")
      .replace(/^[\s，,、；;：:]+|[\s，,、；;：:.。！!？?]+$/g, "")
      .trim()
      .slice(0, 24);
  }

  function stripInstructionTail(value) {
    return String(value || "")
      .replace(/(?:\u90fd)?(?:\u8981)?(?:\u6210\u4e3a)?(?:\u53ef\u70b9\u51fb|\u70b9\u51fb|\u4e92\u52a8)[\s\S]*$/g, "")
      .replace(/(?:\u8fd9\u4e9b)?(?:\u7269\u4f53|\u533a\u57df)(?:\u6216\u533a\u57df)?(?:\u90fd)?(?:\u80fd|\u53ef\u4ee5)[\s\S]*$/g, "")
      .replace(/(?:\u6bcf\u4e2a|\u7528\u6237|\u4e0d\u8981\u753b\u6210|\u4e0d\u8981\u6d41\u7a0b\u56fe)[\s\S]*$/g, "")
      .replace(/(?:click|interactive|do not draw|not a flowchart)[\s\S]*$/gi, "")
      .trim();
  }

  function inferGenericVisualTitleSafe(question, visualMode) {
    const subject = extractQuestionSubject(question);
    const beforeList = String(subject || "").split(/[\uff1a:]/)[0] || subject;
    const cleaned = stripLeadingVisualInstructionPrefix(String(beforeList || ""))
      .replace(/\u4e0d\u8981\u6d41\u7a0b\u56fe[\s\S]*$/g, "")
      .replace(/\u4e0d\u8981\u753b\u6210[\s\S]*$/g, "")
      .replace(/\u753b\u5728\u4e00\u5f20\u56fe\u4e0a[\s\S]*$/g, "")
      .replace(/(?:\u53a8\u623f\u91cc|\u56fe\u4e2d|\u753b\u9762\u91cc)?(?:\u9700\u8981\u5c55\u793a|\u8981\u6709|\u5e94\u6709|\u5305\u542b|\u753b\u51fa)[\s\S]*$/g, "")
      .replace(/(?:\u53ef\u4ee5|\u53ef)?\u70b9\u51fb[\s\S]*$/g, "")
      .replace(/^\u7528\u4e00\u5f20(?:\u6559\u5b66)?(?:\u63d2\u753b|\u56fe)\u89e3\u91ca\s*/i, "")
      .replace(/[\uff0c\u3001\uff1b;。.!?\uff1f]+\s*$/g, "")
      .trim();
    return cleaned ? smartShortTitle(polishVisualTitlePhrase(cleaned), visualMode === "map" ? 22 : 20) : "";
  }

  function inferGenericVisualTitle(question, visualMode) {
    const safeTitle = inferGenericVisualTitleSafe(question, visualMode);
    if (safeTitle) return safeTitle;
    const subject = cleanInstructionTitle(extractQuestionSubject(question));
    const beforeList = subject.split(/[：:]/)[0] || subject;
    const cleaned = beforeList
      .replace(/\u4e0d\u8981\u6d41\u7a0b\u56fe/g, "")
      .replace(/\u753b\u5728\u4e00\u5f20\u56fe\u4e0a/g, "")
      .replace(/(?:\u53a8\u623f\u91cc|\u56fe\u4e2d|\u753b\u9762\u91cc)?(?:\u9700\u8981\u5c55\u793a|\u8981\u6709|\u5e94\u6709|\u5305\u542b|\u753b\u51fa)[\s\S]*$/g, "")
      .replace(/(?:\u53ef\u4ee5|\u53ef)?\u70b9\u51fb[\s\S]*$/g, "")
      .replace(/[，,、；;。.!?？]+\s*$/g, "")
      .trim();
    if (cleaned) return smartShortTitle(polishVisualTitlePhrase(cleaned), visualMode === "map" ? 22 : 20);
    return "";
  }

  function isExplicitCompareQuestion(question) {
    const text = String(question || "");
    const relation = core.inferRelationType(question);
    const isCompare = relation === "compare" || /(?:\u5bf9\u6bd4|\u6bd4\u8f83|\bvs\.?\b)/i.test(text);
    if (!isCompare) return false;
    return extractCompareDimensions(question).length >= 3 || isContainerVmQuestion(question);
  }

  function isContainerVmQuestion(question) {
    const text = String(question || "");
    return /\u5bb9\u5668/.test(text) && /\u865a\u62df\u673a/.test(text);
  }

  function buildCompareDimensionFallbackSpec(question, rawAnswer) {
    const source = String(rawAnswer || question || "");
    const entities = extractCompareEntities(question);
    const dimensions = extractCompareDimensions(question);
    const finalDimensions = dimensions.length
      ? dimensions
      : isContainerVmQuestion(question)
        ? [
            "\u9694\u79bb\u6a21\u578b",
            "\u542f\u52a8\u901f\u5ea6",
            "\u8d44\u6e90\u5360\u7528",
            "\u955c\u50cf\u4e0e\u4ea4\u4ed8",
            "\u8fd0\u7ef4\u65b9\u5f0f",
            "\u9002\u7528\u573a\u666f"
          ]
        : ["\u6838\u5fc3\u5dee\u5f02", "\u6027\u80fd\u4e0e\u6210\u672c", "\u6cbb\u7406\u65b9\u5f0f", "\u9002\u7528\u573a\u666f"];
    const modules = finalDimensions.slice(0, 6).map((dimension, index) =>
      buildCompareDimensionModule(dimension, index, entities, source)
    );
    const title = inferCompareQuestionTitle(question) || compactTitle(extractQuestionSubject(question));
    const pair = entities.length >= 2 ? `${entities[0]} / ${entities[1]}` : title;
    return {
      title,
      language: inferQuestionLanguage(question),
      visualMode: "infographic",
      summary: `\u56f4\u7ed5 ${pair} \u7684 ${modules.length} \u4e2a\u5173\u952e\u7ef4\u5ea6\u505a\u53ef\u4ea4\u4e92\u5bf9\u6bd4\uff0c\u907f\u514d\u5957\u7528\u80cc\u666f\u3001\u73b0\u72b6\u3001\u8d8b\u52bf\u6a21\u677f\u3002`,
      relationType: "compare",
      visualComposition: {
        compositionType: "matrix",
        layoutVariant: "compare-matrix",
        visualFocus: `${pair} \u7684\u7ef4\u5ea6\u5bf9\u7167`,
        primaryModules: modules.slice(0, 2).map((module) => module.id),
        secondaryModules: modules.slice(2).map((module) => module.id),
        densityStrategy:
          "\u4f7f\u7528\u5bf9\u6bd4\u77e9\u9635\u6216\u5de6\u53f3\u5206\u680f\uff0c\u6bcf\u4e2a\u70ed\u70b9\u5bf9\u5e94\u4e00\u4e2a\u771f\u5b9e\u6bd4\u8f83\u7ef4\u5ea6\uff0c\u4e0d\u7528\u4e94\u6bb5\u901a\u7528\u6846\u67b6\u586b\u5145\u3002",
        moduleCountReason: `\u7528\u6237\u660e\u786e\u70b9\u51fa ${modules.length} \u4e2a\u6bd4\u8f83\u7ef4\u5ea6\uff0c\u56e0\u6b64\u6309\u7ef4\u5ea6\u751f\u6210\u70ed\u70b9\uff0c\u800c\u4e0d\u5f3a\u884c\u56fa\u5b9a\u4e94\u6bb5\u6a21\u677f\u3002`
      },
      auxiliaryModules: [],
      modules
    };
  }

  function buildCompareDimensionModule(dimension, index, entities, source) {
    const title = sanitizeCompareDimensionLabel(dimension) || `\u7ef4\u5ea6 ${index + 1}`;
    const left = entities[0] || "\u5bf9\u8c61 A";
    const right = entities[1] || "\u5bf9\u8c61 B";
    const id = `module_${index + 1}`;
    return {
      id,
      title,
      imageText: `${title}\uff1a${left} vs ${right}`.slice(0, 34),
      detail:
        `${title}\u662f\u8fd9\u5f20\u5bf9\u6bd4\u56fe\u7684\u72ec\u7acb\u5224\u65ad\u7ef4\u5ea6\u3002\u70b9\u51fb\u540e\u9700\u8981\u5206\u522b\u8bf4\u660e ${left} \u548c ${right} \u5728\u8fd9\u4e00\u70b9\u4e0a\u7684\u5de5\u4f5c\u673a\u5236\u3001\u5de5\u7a0b\u53d6\u820d\u548c\u9002\u7528\u8fb9\u754c\uff0c\u800c\u4e0d\u662f\u53ea\u7ed9\u51fa\u62bd\u8c61\u4f18\u52a3\u3002` +
        `\u56fe\u4e0a\u5e94\u8be5\u628a\u8fd9\u4e2a\u7ef4\u5ea6\u753b\u6210\u4e00\u4e2a\u5b8c\u6574\u7684\u5bf9\u7167\u533a\u57df\uff0c\u5305\u542b\u77ed\u6807\u7b7e\u3001\u4e24\u4fa7\u5dee\u5f02\u548c\u5fc5\u8981\u7684\u8f85\u52a9\u8bf4\u660e\uff0c\u4fbf\u4e8e\u70ed\u70b9\u5b9a\u4f4d\u548c\u540e\u7eed\u8ffd\u95ee\u3002`,
      sourceExcerpt: source.slice(index * 140, index * 140 + 180) || source.slice(0, 180),
      iconHint: "compare",
      priority: index + 1,
      regionKind: "panel",
      regionPrompt: `${title} \u5bf9\u6bd4\u7ef4\u5ea6\u7684\u5b8c\u6574\u77e9\u9635\u5361\u7247\uff0c\u5305\u542b ${left} \u548c ${right} \u4e24\u4fa7\u5bf9\u7167\uff0c\u4e0d\u53ea\u6846\u6807\u9898`,
      visualEvidence: [title, left, right, "\u5bf9\u6bd4\u5dee\u5f02"],
      maskPolicy: "full-region",
      spatialHint: index < 2 ? "top or center" : "middle or bottom",
      locatorQueries: [`${title} \u5bf9\u6bd4`, `${left} ${right} ${title}`, `${title} \u5b8c\u6574\u5361\u7247`]
    };
  }

  function inferCompareQuestionTitle(question) {
    const entities = extractCompareEntities(question);
    if (entities.length >= 2) return smartShortTitle(`${entities[0]} \u4e0e ${entities[1]} \u5bf9\u6bd4`, 24);
    const subject = cleanInstructionTitle(extractQuestionSubject(question))
      .replace(/(?:\u53ef\u4ea4\u4e92|\u6bd4\u8f83\u56fe|\u5bf9\u6bd4\u56fe)[\s\S]*$/g, "")
      .trim();
    return subject ? smartShortTitle(subject, 24) : "";
  }

  function extractCompareEntities(question) {
    const source = String(question || "");
    const match =
      source.match(/(?:\u5bf9\u6bd4|\u6bd4\u8f83)\s*([^,\uff0c\u3002\uff1f\uff01;；\n]{1,24}?)(?:\u548c|\u4e0e|\s+vs\.?\s+|\/)([^,\uff0c\u3002\uff1f\uff01;；\n]{1,24})/i) ||
      source.match(/([A-Za-z0-9 ._+-]{2,32})\s+vs\.?\s+([A-Za-z0-9 ._+-]{2,32})/i);
    if (!match) return [];
    return [sanitizeCompareEntity(match[1]), sanitizeCompareEntity(match[2])].filter(Boolean).slice(0, 2);
  }

  function sanitizeCompareEntity(value) {
    return String(value || "")
      .replace(/(?:\u751f\u6210|\u753b|\u8bbe\u8ba1|\u505a|\u5236\u4f5c|\u53ef\u4ea4\u4e92|\u6bd4\u8f83\u56fe|\u5bf9\u6bd4\u56fe)[\s\S]*$/g, "")
      .replace(/^[\s:：]+|[\s:：]+$/g, "")
      .trim()
      .slice(0, 18);
  }

  function extractCompareDimensions(question) {
    const source = String(question || "");
    const segments = [];
    const patterns = [
      /(?:\u91cd\u70b9\u662f|\u91cd\u70b9\u770b|\u5173\u6ce8|\u56f4\u7ed5|\u7ef4\u5ea6\u662f|\u7ef4\u5ea6\u5305\u62ec|\u5305\u542b|\u5305\u62ec)([^。\uff01\uff1f!\?\n]+)/g
    ];
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(source))) segments.push(match[1]);
    }
    return normalizeCompareDimensions(segments.flatMap(splitCompareDimensionSegment));
  }

  function splitCompareDimensionSegment(segment) {
    return String(segment || "")
      .replace(/\u4ee5\u53ca|\u5e76\u4e14|and|&/gi, "\u3001")
      .replace(/\u548c/g, "\u3001")
      .split(/[\u3001\uff0c,;；]/)
      .map(sanitizeCompareDimensionLabel)
      .filter(Boolean);
  }

  function normalizeCompareDimensions(dimensions) {
    const seen = new Set();
    const result = [];
    for (const item of dimensions || []) {
      const cleaned = sanitizeCompareDimensionLabel(item);
      const key = normalizeTitleForCompare(cleaned);
      if (!cleaned || !key || seen.has(key)) continue;
      seen.add(key);
      result.push(cleaned);
    }
    return result.slice(0, 8);
  }

  function sanitizeCompareDimensionLabel(value) {
    return String(value || "")
      .replace(/(?:\u7b49|\u7b49\u7b49|\u7b49\u65b9\u9762|\u7684\u5dee\u5f02|\u505a\u5bf9\u6bd4)[\s\S]*$/g, "")
      .replace(/(?:\u751f\u6210|\u753b|\u8bbe\u8ba1|\u53ef\u4ea4\u4e92)[\s\S]*$/g, "")
      .replace(/^[\s:：]+|[\s:：\u3002\uff01\uff1f!\?]+$/g, "")
      .trim()
      .slice(0, 18);
  }

  function buildOAuthFallbackSpec(question, rawAnswer) {
    const source = String(rawAnswer || question || "");
    return {
      title: "OAuth 2.0 授权码流程",
      language: inferQuestionLanguage(question),
      visualMode: "infographic",
      summary: "把授权码登录拆成角色、授权请求、授权码交换、Token 使用和安全边界，突出浏览器、业务服务和授权服务器之间的职责。",
      relationType: "flow",
      visualComposition: {
        compositionType: "swimlane-flow",
        layoutVariant: "swimlane-flow",
        visualFocus: "浏览器、客户端后端、授权服务器和资源服务器之间的凭据流转",
        primaryModules: ["module_1", "module_2", "module_3"],
        secondaryModules: ["module_4", "module_5"],
        densityStrategy: "用泳道和凭据标签表达登录跳转、回调、换 token、访问资源与刷新续期，不使用泛化五段模板。",
        moduleCountReason: "OAuth 授权码流程天然由角色边界、授权请求、回调换码、Token 使用和安全控制五个关键环节组成。"
      },
      modules: [
        {
          id: "module_1",
          title: "角色边界",
          imageText: "用户、客户端、授权服务器、资源服务器各司其职",
          detail:
            "授权码模式的关键不是“谁登录成功”这么简单，而是把不同职责拆开：用户在浏览器里授权，客户端应用只拿到临时授权码，授权服务器负责校验身份与签发 token，资源服务器只信任有效 access token。这样可以避免把用户密码交给第三方应用，也方便用 Scope、回调地址和客户端凭据控制权限边界。",
          sourceExcerpt: source.slice(0, 140),
          iconHint: "nodes",
          priority: 1
        },
        {
          id: "module_2",
          title: "授权请求",
          imageText: "浏览器跳转到授权端，携带 client_id、scope、redirect_uri",
          detail:
            "登录开始时，客户端把浏览器重定向到授权服务器，并带上 client_id、redirect_uri、scope、state 等参数。授权服务器会展示登录或授权页，确认用户身份和授权范围。state 用来防 CSRF，redirect_uri 必须严格匹配已登记地址，scope 决定应用能访问哪些资源，是后续权限解释和安全审计的入口。",
          sourceExcerpt: source.slice(140, 300),
          iconHint: "step",
          priority: 2
        },
        {
          id: "module_3",
          title: "授权码交换",
          imageText: "回调拿到 code，后端用 code 换 token",
          detail:
            "用户授权后，浏览器被带回 redirect_uri，并附带一次性的 authorization code。真正换 token 的动作应由客户端后端发起，连同 client_secret 或 PKCE verifier 一起提交给授权服务器。授权码生命周期短、只能使用一次，即使被截获也难以直接访问资源；PKCE 则能进一步保护移动端和前端应用。",
          sourceExcerpt: source.slice(300, 470),
          iconHint: "target",
          priority: 3
        },
        {
          id: "module_4",
          title: "Token 使用",
          imageText: "access token 调资源，refresh token 续期",
          detail:
            "拿到 access token 后，客户端用它访问资源服务器，例如读取用户资料或业务数据。access token 通常短期有效，便于降低泄露影响；refresh token 用于在用户不重新登录的情况下续期，但应放在更安全的位置并做旋转、吊销和异常检测。资源服务器不需要理解登录过程，只负责校验 token 签名、过期时间和权限范围。",
          sourceExcerpt: source.slice(470, 650),
          iconHint: "layout",
          priority: 4
        },
        {
          id: "module_5",
          title: "安全控制",
          imageText: "校验 state、PKCE、回调地址与最小权限",
          detail:
            "上线时最容易出问题的是边界校验：redirect_uri 不能模糊匹配，state 要和会话绑定，PKCE 应作为公开客户端的默认配置，Scope 要最小化，token 存储要避开可被脚本直接读取的位置。日志里还要能追踪授权、换码、刷新和吊销事件，这样出现异常授权或 token 泄露时才能快速定位。",
          sourceExcerpt: source.slice(650, 830),
          iconHint: "risk",
          priority: 5
        }
      ].map(addOAuthVisualAliases)
    };
  }

  function addOAuthVisualAliases(module) {
    const aliasesById = {
      module_1: ["\u7528\u6237", "\u5e94\u7528\u5ba2\u6237\u7aef", "\u8ba4\u8bc1\u670d\u52a1", "\u8d44\u6e90\u670d\u52a1"],
      module_2: ["\u767b\u5f55\u8bf7\u6c42", "\u8ba4\u8bc1\u7aef", "client_id", "scope", "redirect_uri"],
      module_3: ["\u56de\u8c03\u9875\u9762", "\u4e00\u6b21\u6027\u51ed\u8bc1", "code", "\u51ed\u8bc1\u4ea4\u6362"],
      module_4: ["\u8bbf\u95ee\u51ed\u8bc1", "\u7eed\u671f\u51ed\u8bc1", "\u8d44\u6e90\u670d\u52a1"],
      module_5: ["state", "PKCE", "\u56de\u8c03\u9875\u9762", "\u6700\u5c0f\u6743\u9650", "\u5b89\u5168\u63a7\u5236"]
    };
    const extra = aliasesById[module && module.id] || [];
    return {
      ...module,
      locatorQueries: Array.from(new Set([...(module.locatorQueries || []), ...extra])),
      visualEvidence: Array.from(new Set([...(module.visualEvidence || []), ...extra.slice(0, 3)]))
    };
  }

  function buildKubernetesFallbackSpec(question, rawAnswer) {
    const source = String(rawAnswer || question || "");
    return {
      title: "Kubernetes 部署架构",
      language: inferQuestionLanguage(question),
      visualMode: "infographic",
      summary: "围绕 Pod、Deployment、Service/Ingress、配置密钥和发布扩缩容，展示 Kubernetes 应用从运行到暴露服务的完整关系。",
      relationType: "architecture",
      visualComposition: {
        compositionType: "layered-architecture",
        layoutVariant: "asymmetric-focus-stack",
        visualFocus: "集群中工作负载、网络入口和配置治理的分层关系",
        primaryModules: ["module_1", "module_2", "module_3"],
        secondaryModules: ["module_4", "module_5"],
        densityStrategy: "用集群分层和连接关系表达组件职责，不把内容拆成背景/现状/趋势。",
        moduleCountReason: "Kubernetes 部署架构至少需要覆盖运行单元、编排控制、服务暴露、配置密钥和发布伸缩五类实体。"
      },
      modules: [
        {
          id: "module_1",
          title: "Pod 运行单元",
          imageText: "容器在 Pod 内共享网络和生命周期",
          detail:
            "Pod 是 Kubernetes 调度和运行的最小单位，里面可以放一个主容器，也可以带 sidecar。它们共享网络命名空间、存储卷和生命周期，因此应用日志、代理、采集器等常被画在同一个 Pod 边界内。理解 Pod 边界能帮助判断资源限制、健康检查、重启策略和容器协作关系，而不是只把 Kubernetes 看成一堆容器。",
          sourceExcerpt: source.slice(0, 150),
          iconHint: "nodes",
          priority: 1
        },
        {
          id: "module_2",
          title: "Deployment 编排",
          imageText: "声明副本数、滚动更新和回滚策略",
          detail:
            "Deployment 负责把期望状态落到集群中，例如需要几个副本、使用哪个镜像版本、如何滚动更新。它通过 ReplicaSet 管理 Pod 数量，并在节点故障或版本变更时维持目标状态。图中应把 Deployment 放在工作负载控制层，体现它不是流量入口，而是负责发布、扩容、回滚和自愈的控制对象。",
          sourceExcerpt: source.slice(150, 320),
          iconHint: "step",
          priority: 2
        },
        {
          id: "module_3",
          title: "服务入口",
          imageText: "Service 稳定寻址，Ingress 管理外部入口",
          detail:
            "Pod 会重建、漂移和扩缩容，IP 并不稳定，因此 Service 提供稳定访问名和负载均衡。Ingress 则把外部 HTTP/HTTPS 流量按域名、路径或规则转发到不同 Service。画架构时应明确区分二者：Service 解决集群内部服务发现，Ingress 或网关解决外部流量入口、证书、路由和边缘策略。",
          sourceExcerpt: source.slice(320, 500),
          iconHint: "layout",
          priority: 3
        },
        {
          id: "module_4",
          title: "配置密钥",
          imageText: "ConfigMap 放配置，Secret 放敏感值",
          detail:
            "应用配置不应硬编码进镜像。ConfigMap 适合放普通配置、开关、环境变量或配置文件片段；Secret 用来放密码、token、证书等敏感信息，并配合访问控制和外部密钥系统管理。图中这一区域要靠近 Pod，但和镜像仓库、流量入口分开，强调它影响运行时行为而不是发布对象本身。",
          sourceExcerpt: source.slice(500, 680),
          iconHint: "risk",
          priority: 4
        },
        {
          id: "module_5",
          title: "发布与扩缩容",
          imageText: "HPA、探针、滚动发布共同保证稳定性",
          detail:
            "生产部署还需要把运行质量画出来：readiness probe 决定 Pod 何时接流量，liveness probe 用于异常自愈，HPA 根据 CPU、内存或自定义指标扩缩容，滚动更新控制新旧版本切换节奏。它们共同决定用户是否会感知发布和故障，是架构图里比“未来趋势”更有用的运维信息。",
          sourceExcerpt: source.slice(680, 860),
          iconHint: "idea",
          priority: 5
        }
      ]
    };
  }

  function buildRagPipelineFallbackSpec(question, rawAnswer) {
    const source = String(rawAnswer || question || "");
    return {
      title: "RAG 检索增强流程",
      language: inferQuestionLanguage(question),
      visualMode: "infographic",
      summary: "按文档切分、向量化、召回、重排、上下文拼接和答案生成展示 RAG 系统的真实工作链路。",
      relationType: "flow",
      visualComposition: {
        compositionType: "swimlane-flow",
        layoutVariant: "swimlane-flow",
        visualFocus: "从知识入库到带引用回答的端到端检索增强链路",
        primaryModules: ["module_1", "module_2", "module_3", "module_4"],
        secondaryModules: ["module_5", "module_6"],
        densityStrategy: "用连续流程和少量质量门表达检索增强，不使用背景/现状/驱动/挑战/趋势模板。",
        moduleCountReason: "RAG 的关键节点是切分、向量化、召回、重排、上下文拼接和生成，六个模块能覆盖链路且不堆砌无关背景。"
      },
      auxiliaryModules: [
        {
          id: "aux_1",
          title: "质量控制信号",
          imageText: "命中率、引用、时效、权限",
          detail:
            "RAG 不是只把检索结果塞进提示词。上线时还要监控召回命中率、重排准确性、引用覆盖、知识时效、权限过滤和幻觉率。这个辅助区用来提醒用户：链路每一段都可能影响最终答案质量，尤其是召回不足、上下文过长或过期资料混入时，生成模型会给出看似流畅但依据不足的回答。",
          iconHint: "risk",
          regionKind: "panel",
          regionPrompt: "quality control panel with metrics and warning chips"
        },
        {
          id: "aux_2",
          title: "资源协作流程",
          imageText: "知识库 -> 检索器 -> 重排器 -> LLM",
          detail:
            "完整协作链路是：原始文档先清洗切分并写入向量库；用户提问后由检索器召回候选片段；重排器按相关性和可用性筛选；上下文组装器控制长度、去重并保留引用；最后 LLM 基于问题和证据生成答案。点击这个区域时应看到横向链路，而不是某个单独节点。",
          iconHint: "step",
          regionKind: "flow-strip",
          maskPolicy: "full-region",
          regionPrompt: "complete horizontal RAG workflow strip including knowledge base, retriever, reranker, context builder, and LLM answer"
        }
      ],
      modules: [
        {
          id: "module_1",
          title: "文档切分",
          imageText: "清洗、分块、保留元数据",
          detail:
            "RAG 的质量首先取决于知识如何入库。文档需要去除噪声、按语义或结构切分成合适粒度，并保留标题、来源、时间、权限、章节路径等元数据。切得太粗会让召回片段冗长且不聚焦，切得太碎又会丢失上下文。详情里应说明 chunk 大小、重叠窗口、表格/代码/图片说明如何处理，以及为什么这些入库策略会影响后续检索和引用质量。",
          sourceExcerpt: source.slice(0, 150),
          iconHint: "files",
          priority: 1
        },
        {
          id: "module_2",
          title: "向量化入库",
          imageText: "Embedding 把片段变成可检索表示",
          detail:
            "切分后的片段会通过 embedding 模型转成向量，并写入向量库或混合检索索引。这里要关注 embedding 模型是否适合业务语言、专业术语和长短文本混合场景，也要保存原文、摘要、标签和权限字段。若向量表示不稳定，后续召回会偏离用户问题；若索引缺少元数据过滤，可能把过期、无权限或错误来源的内容带入答案。",
          sourceExcerpt: source.slice(150, 320),
          iconHint: "nodes",
          priority: 2
        },
        {
          id: "module_3",
          title: "召回候选",
          imageText: "语义检索、关键词检索、过滤条件",
          detail:
            "用户问题进入系统后，检索器会根据语义相似度、关键词匹配、业务过滤条件和权限规则召回候选片段。真实系统常用混合检索，把向量召回和 BM25、标签过滤、时间过滤结合起来，避免只靠相似度导致漏召或误召。这个模块需要解释 topK、召回阈值、查询改写和多路召回，因为它们决定模型能不能看到足够相关的证据。",
          sourceExcerpt: source.slice(320, 500),
          iconHint: "search",
          priority: 3
        },
        {
          id: "module_4",
          title: "重排筛选",
          imageText: "Rerank 提升相关性并压缩噪声",
          detail:
            "召回结果通常数量多、质量参差不齐，因此需要重排模型或规则再次评估问题与片段的匹配程度。重排会把真正能回答问题的证据排到前面，并剔除重复、冲突、过旧或权限不符的内容。没有重排时，LLM 可能被高相似但低价值的片段干扰；重排过强又可能错删关键证据，所以要结合业务评测集观察准确率、覆盖率和响应时间。",
          sourceExcerpt: source.slice(500, 700),
          iconHint: "rank",
          priority: 4
        },
        {
          id: "module_5",
          title: "上下文拼接",
          imageText: "控制长度、去重、保留引用",
          detail:
            "进入 LLM 之前，系统要把候选证据组装成上下文。这里不仅是简单拼接，还包括去重、按主题排序、压缩长片段、补充来源标识、保留引用编号，并控制总 token 长度。上下文太少会缺证据，太多会稀释重点并提高成本。好的上下文拼接应让模型清楚知道哪些内容是事实依据、哪些是用户问题、哪些约束必须遵守。",
          sourceExcerpt: source.slice(700, 900),
          iconHint: "layout",
          priority: 5
        },
        {
          id: "module_6",
          title: "答案生成",
          imageText: "基于证据回答，必要时说明不确定",
          detail:
            "最后 LLM 根据用户问题、系统指令和检索证据生成答案。成熟的 RAG 不应只追求流畅表达，还要能引用来源、指出证据不足、拒绝越权内容，并在多条证据冲突时说明判断依据。这个模块要强调生成阶段的约束：答案必须贴合证据，不能把模型常识和检索内容混在一起；对高风险场景还需要后处理校验、引用检查和人工审核。",
          sourceExcerpt: source.slice(900, 1120),
          iconHint: "idea",
          priority: 6
        }
      ]
    };
  }

  function buildHttpRenderFlowFallbackSpec(question, rawAnswer) {
    const source = String(rawAnswer || question || "");
    return {
      title: "HTTP 页面渲染流程",
      language: inferQuestionLanguage(question),
      visualMode: "infographic",
      summary: "从输入地址到像素上屏，串起 DNS、连接加密、请求响应、解析构建和渲染合成。",
      relationType: "flow",
      visualComposition: {
        compositionType: "swimlane-flow",
        layoutVariant: "swimlane-flow",
        visualFocus: "浏览器网络栈到渲染引擎的端到端链路",
        primaryModules: ["module_1", "module_2", "module_3"],
        secondaryModules: ["module_4", "module_5"],
        densityStrategy: "用横向链路表现主流程，每段卡片保留关键协议、产物和常见瓶颈，避免背景现状式泛化。",
        moduleCountReason: "HTTP 页面渲染需要覆盖地址解析、连接建立、请求响应、DOM/CSSOM 构建和最终渲染五个阶段。"
      },
      auxiliaryModules: [
        {
          id: "aux_1",
          title: "缓存与重用",
          imageText: "DNS/HTTP 缓存、连接复用",
          detail:
            "缓存会改变整条链路的耗时：DNS 结果、TLS 会话、HTTP 缓存、Service Worker 和浏览器内存缓存都可能让请求提前结束或跳过部分网络步骤。诊断性能时要先区分冷启动和热启动，否则容易把真实瓶颈误判成服务器慢或渲染慢。",
          sourceExcerpt: source.slice(0, 120),
          iconHint: "step",
          priority: 10,
          regionKind: "panel",
          regionPrompt: "cache and reuse side panel with DNS cache, HTTP cache, connection reuse"
        }
      ],
      modules: [
        {
          id: "module_1",
          title: "地址与 DNS",
          imageText: "URL 解析后找到目标 IP",
          detail:
            "用户输入网址后，浏览器先规范化 URL，判断协议、主机、端口、路径和查询参数。随后它会查询浏览器缓存、系统缓存、hosts、递归 DNS 和权威 DNS，最终拿到目标 IP。这个阶段决定请求要去哪里，也会受到 DNS 缓存、CDN 调度、IPv4/IPv6 选择和预解析策略影响，是页面首包时间的重要前置环节。",
          sourceExcerpt: source.slice(0, 150),
          iconHint: "target",
          priority: 1
        },
        {
          id: "module_2",
          title: "TCP/TLS 连接",
          imageText: "建立可靠通道和加密会话",
          detail:
            "拿到 IP 后，浏览器会建立传输连接。HTTP/1.1 和 HTTP/2 通常基于 TCP，需要三次握手；HTTPS 还要进行 TLS 握手，协商证书、密钥和加密套件。HTTP/3 则基于 QUIC，把传输和加密握手合并得更紧。连接阶段的关键变量包括网络 RTT、证书链、连接复用、拥塞控制和丢包恢复。",
          sourceExcerpt: source.slice(150, 320),
          iconHint: "nodes",
          priority: 2
        },
        {
          id: "module_3",
          title: "请求与响应",
          imageText: "发送 Header/Body，接收状态和资源",
          detail:
            "连接可用后，浏览器发送 HTTP 请求，包含方法、路径、请求头、Cookie、缓存条件和可选 body。服务器或 CDN 返回状态码、响应头和资源内容，例如 HTML、JSON、图片或脚本。这里要关注重定向、缓存命中、压缩、分块传输、优先级、后端处理时间和首字节时间；这些因素会直接影响后续解析何时开始。",
          sourceExcerpt: source.slice(320, 500),
          iconHint: "step",
          priority: 3
        },
        {
          id: "module_4",
          title: "DOM 与 CSSOM",
          imageText: "HTML/CSS 解析成结构树",
          detail:
            "HTML 流式到达后，解析器逐步构建 DOM；遇到 CSS 会下载并解析成 CSSOM，遇到阻塞脚本可能暂停解析或等待样式计算。DOM 表示页面结构，CSSOM 表示样式规则，两者结合生成渲染树。这个阶段的瓶颈通常来自阻塞脚本、过大的 CSS、同步布局读取、字体加载和关键资源优先级设置不当。",
          sourceExcerpt: source.slice(500, 680),
          iconHint: "layout",
          priority: 4
        },
        {
          id: "module_5",
          title: "布局绘制合成",
          imageText: "计算位置、绘制图层并上屏",
          detail:
            "渲染树生成后，浏览器计算每个盒子的尺寸和位置，形成 layout；再把文字、颜色、边框、图片等绘制到 paint 记录或位图；最后通过合成线程把不同图层排序、变换并提交到 GPU 显示。交互卡顿常出现在频繁重排、昂贵绘制、大面积透明效果或图层过多时，因此性能优化要同时看网络、主线程和合成阶段。",
          sourceExcerpt: source.slice(680, 860),
          iconHint: "image",
          priority: 5
        }
      ]
    };
  }

  function buildEcommerceFunnelFallbackSpec(question, rawAnswer) {
    const source = String(rawAnswer || question || "");
    return {
      title: "电商转化漏斗分析",
      language: inferQuestionLanguage(question),
      visualMode: "infographic",
      summary: "把用户从流量进入到复购留存的关键节点画成漏斗，重点呈现每一层的行为、指标和可能流失原因。",
      relationType: "funnel",
      visualComposition: {
        compositionType: "funnel",
        layoutVariant: "asymmetric-focus-stack",
        visualFocus: "从曝光、浏览、加购、支付到复购的转化收缩",
        primaryModules: ["module_1", "module_2", "module_3"],
        secondaryModules: ["module_4", "module_5"],
        densityStrategy: "用漏斗层级、指标标签和流失提示表达业务判断，不直接复制用户问题当标题。",
        moduleCountReason: "电商转化分析需要覆盖获客、商品页、加购、支付和复购五个核心节点。"
      },
      modules: [
        {
          id: "module_1",
          title: "流量来源",
          imageText: "广告、搜索、推荐、私域带来首层访问",
          detail:
            "漏斗第一层关注用户从哪里来，以及这些流量是否足够精准。应区分付费广告、自然搜索、内容推荐、活动页和私域触达，因为不同来源的意图强度和成本完全不同。详情里要解释曝光、点击率、到站率、获客成本等指标，并提醒不要只看流量规模，低意图流量会在后面迅速流失。",
          sourceExcerpt: source.slice(0, 150),
          iconHint: "target",
          priority: 1
        },
        {
          id: "module_2",
          title: "商品详情页",
          imageText: "卖点、价格、评价和信任信息决定停留",
          detail:
            "商品详情页是用户从兴趣转向购买意图的核心环节。页面需要让用户快速理解商品价值、价格优势、库存、评价、物流和售后承诺。分析时要看详情页停留时长、跳出率、规格选择、评价点击和优惠领取行为；如果这里流失高，通常说明卖点不清、价格阻力大或信任信息不足。",
          sourceExcerpt: source.slice(150, 320),
          iconHint: "layout",
          priority: 2
        },
        {
          id: "module_3",
          title: "加购意图",
          imageText: "收藏、加购、领券体现购买准备度",
          detail:
            "加购并不等于成交，但它说明用户已经进入比较和决策阶段。这里要关注加购率、收藏率、领券率、规格选择失败、库存缺货和推荐搭配点击。若加购多但支付少，可能是优惠门槛、运费、库存、支付体验或竞品比较造成阻塞。图中应把这一层画成从浏览到结算的关键转折点。",
          sourceExcerpt: source.slice(320, 500),
          iconHint: "step",
          priority: 3
        },
        {
          id: "module_4",
          title: "结算支付",
          imageText: "地址、运费、优惠、支付成功率决定成交",
          detail:
            "结算层最接近收入，也最容易因为细节损失订单。需要监控提交订单率、支付成功率、优惠使用失败、地址填写错误、运费敏感、支付渠道失败和风控拦截。优化时要减少表单阻力、提前展示成本、保留异常订单恢复入口，并把失败原因和用户设备、渠道、商品类型关联分析。",
          sourceExcerpt: source.slice(500, 690),
          iconHint: "risk",
          priority: 4
        },
        {
          id: "module_5",
          title: "复购留存",
          imageText: "履约体验、会员权益和召回决定长期价值",
          detail:
            "成交后漏斗并没有结束。履约速度、商品满意度、售后体验、会员权益和二次召回会决定用户是否复购。详情区应解释复购率、退款率、评价率、会员转化、召回打开率和生命周期价值，并说明不同品类需要不同复购节奏。这样漏斗就不是一次性成交图，而是能支持长期增长决策的业务视图。",
          sourceExcerpt: source.slice(690, 880),
          iconHint: "idea",
          priority: 5
        }
      ]
    };
  }

  function buildTopicFallbackSpec(title, subject, question, rawAnswer, relationType) {
    const source = String(rawAnswer || question || "");
    // The generic 5-segment fallback runs when no specialised template
    // matched. `subject` is derived from the user's question and can be a long
    // imperative sentence; splicing it into the detail produces awkward text.
    // Only treat it as a topic noun when it's short enough.
    const trimmedSubject = String(subject || "").trim();
    const subjectIsConcise = trimmedSubject.length > 0 && trimmedSubject.length <= 12;
    const topic = subjectIsConcise ? trimmedSubject : "\u8be5\u4e3b\u9898";
    const development = subjectIsConcise && trimmedSubject.endsWith("\u53d1\u5c55") ? trimmedSubject : `${topic}\u7684\u53d1\u5c55`;
    const targetModuleCount = inferTargetModuleCount(question, relationType, rawAnswer);
    return {
      title,
      language: inferQuestionLanguage(question),
      visualMode: "infographic",
      summary: `${topic}\u53ef\u6309 ${targetModuleCount} \u4e2a\u6838\u5fc3\u89c6\u89d2\u7ec4\u7ec7\uff0c\u628a\u6982\u5ff5\u3001\u673a\u5236\u548c\u5224\u65ad\u8981\u70b9\u538b\u7f29\u6210\u53ef\u4e92\u52a8\u7684\u89c6\u89c9\u6a21\u5757\u3002`,
      relationType,
      visualComposition: {
        compositionType: relationType === "flow" ? "swimlane-flow" : "layered-cards",
        layoutVariant: inferDefaultLayoutVariant(relationType),
        visualFocus: `${topic}的核心逻辑`,
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
          detail: `${development}\u524d\u63d0\u662f\u5176\u6280\u672f\u539f\u7406\u3001\u5e02\u573a\u52a8\u56e0\u548c\u5e94\u7528\u573a\u666f\u3002\u8fd9\u4e00\u5c42\u8bf4\u660e\u95ee\u9898\u7684\u8d77\u6e90\u3001\u53d7\u54ea\u4e9b\u6761\u4ef6\u7ea6\u675f\uff0c\u4ee5\u53ca\u540e\u7eed\u5224\u65ad\u7684\u4e3b\u8981\u4f9d\u636e\u3002`,
          sourceExcerpt: source.slice(0, 90),
          iconHint: "target",
          priority: 1
        },
        {
          id: "module_2",
          title: "\u5f53\u524d\u73b0\u72b6",
          imageText: "\u4ea7\u4e1a\u6b63\u5728\u6269\u5c55",
          detail: `${topic}\u76ee\u524d\u5904\u4e8e\u4ece\u6280\u672f\u9a8c\u8bc1\u5230\u573a\u666f\u843d\u5730\u3001\u518d\u5230\u89c4\u6a21\u5316\u5e94\u7528\u7684\u8fc7\u7a0b\u4e2d\u3002\u8fd9\u91cc\u6982\u62ec\u5df2\u7ecf\u89e3\u51b3\u7684\u95ee\u9898\u3001\u4ecd\u7136\u5361\u4f4f\u7684\u73af\u8282\uff0c\u4ee5\u53ca\u8fd9\u4e9b\u72b6\u6001\u5bf9\u4e0b\u4e00\u6b65\u51b3\u7b56\u7684\u5f71\u54cd\uff0c\u5e76\u5217\u51fa\u4ee3\u8868\u6027\u73a9\u5bb6\u3001\u573a\u666f\u548c\u5df2\u9a8c\u8bc1\u7684\u9650\u5236\u3002`,
          sourceExcerpt: source.slice(90, 180),
          iconHint: "nodes",
          priority: 2
        },
        {
          id: "module_3",
          title: "\u6838\u5fc3\u9a71\u52a8",
          imageText: "\u6280\u672f\u4e0e\u9700\u6c42\u5171\u632f",
          detail: `${development}\u589e\u957f\u6765\u81ea\u6280\u672f\u6210\u719f\u3001\u6210\u672c\u4e0b\u964d\u3001\u6295\u5165\u589e\u52a0\u548c\u771f\u5b9e\u9700\u6c42\u5171\u540c\u63a8\u52a8\u3002\u8fd9\u91cc\u533a\u5206\u5355\u4e00\u56e0\u7d20\u4e0e\u591a\u56e0\u7d20\u5171\u632f\uff0c\u6307\u51fa\u54ea\u4e9b\u662f\u77ed\u671f\u52a0\u901f\u5668\u3001\u54ea\u4e9b\u662f\u957f\u671f\u57fa\u7840\u6761\u4ef6\u3002`,
          sourceExcerpt: source.slice(180, 270),
          iconHint: "idea",
          priority: 3
        },
        {
          id: "module_4",
          title: "\u4e3b\u8981\u6311\u6218",
          imageText: "\u843d\u5730\u4ecd\u6709\u95e8\u69db",
          detail: `${development}\u4ecd\u9762\u4e34\u6210\u672c\u3001\u53ef\u9760\u6027\u3001\u6570\u636e\u3001\u4f9b\u5e94\u94fe\u3001\u76d1\u7ba1\u6216\u5546\u4e1a\u6a21\u5f0f\u7b49\u6311\u6218\u3002\u8fd9\u91cc\u8bf4\u660e\u963b\u529b\u7684\u6765\u6e90\u3001\u5bfc\u81f4\u7684\u7ed3\u679c\uff0c\u5e76\u533a\u5206\u53ef\u901a\u8fc7\u6267\u884c\u6539\u5584\u7684\u95ee\u9898\u4e0e\u4f9d\u8d56\u5916\u90e8\u6761\u4ef6\u53d8\u5316\u7684\u95ee\u9898\u3002`,
          sourceExcerpt: source.slice(270, 360),
          iconHint: "risk",
          priority: 4
        },
        {
          id: "module_5",
          title: "\u672a\u6765\u8d8b\u52bf",
          imageText: "\u8d70\u5411\u89c4\u6a21\u5e94\u7528",
          detail: `${development}\u4e0b\u4e00\u9636\u6bb5\u53ef\u4ece\u6807\u6746\u573a\u666f\u3001\u5546\u4e1a\u5316\u8282\u594f\u3001\u751f\u6001\u534f\u540c\u548c\u957f\u671f\u7ade\u4e89\u683c\u5c40\u89c2\u5bdf\u3002\u8fd9\u91cc\u5217\u51fa\u54ea\u4e9b\u6307\u6807\u8868\u793a\u8d8b\u52bf\u5728\u52a0\u901f\u3001\u54ea\u4e9b\u53d8\u91cf\u53ef\u80fd\u6539\u53d8\u672a\u6765\u8d70\u5411\u3002`,
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
      "补充字段：visualMode 可为 infographic|map|poster|scene；visualComposition.compositionType 可使用 hand-drawn-map、editorial-poster、illustrated-scene；每个 module 可提供 regionKind 与 regionPrompt，用于描述完整可点击语义区域。地图类 regionKind 可用 water|route|landmark|building|mountain|axis|legend。",
      "约束：",
      "- visualMode 默认 infographic。用户要求手绘地图、旅游地图、地理区域、景区导览、路线图、可点击地理区域时使用 map；要求海报感时使用 poster；要求像一幅画、插画场景时使用 scene。",
      "- map/poster/scene 下，modules 表示可点击的语义区域、路线、地标、对象或人物，不一定是编号卡片；regionPrompt 必须描述完整视觉区域，不要只写标题文字。",
      "- map/poster/scene 下不要强行画成流程图、大卡片、箭头或编号 GUI 模块，除非用户明确要求信息图。",
      "- modules 数量必须自适应，允许 3 到 6 个主模块；不要固定 5 个。",
      "- 上一条的 3 到 6 只适用于 infographic；地图类可以使用 4 到 12 个可点击地理区域，海报/场景可以使用 4 到 8 个可点击对象或区域。",
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
      "Additional schema fields: visualSpec.visualMode is infographic|map|poster|scene. visualSpec.visualComposition.compositionType may also be hand-drawn-map, editorial-poster, or illustrated-scene. Each module may include regionKind and regionPrompt. Map regionKind may be water|route|landmark|building|mountain|axis|legend. Scene/poster regionKind may be object|object-with-label|person|foreground|background|panel.",
      "Interactive target contract: each module may include visualEvidence, maskPolicy, spatialHint, locatorQueries, and componentHints. visualEvidence lists what must be visible in the image for this target to count as present. maskPolicy is card|full-region|subject|subject-with-label|route|legend. spatialHint is a rough position such as west/east/center/bottom. locatorQueries are short alternate phrases for visual grounding. componentHints are text-only hints such as object/person/label parts; do not invent exact pixel coordinates.",
      "Constraints:",
      "- rawAnswer, visualSpec.title, summary, modules.title, imageText, detail, and sourceExcerpt must use the same language as the user's question.",
      "- If the user asks in Chinese, use Chinese in the image. If the user asks in English, use English in the image.",
      "- rawAnswer must be fact-focused, clear, and complete enough for follow-up questions. For explanatory or analytical questions, provide enough substance: definitions, mechanism, sequence, tradeoffs, examples, and caveats where relevant.",
      "- Unless the user explicitly asks about ChatImage itself, never mention ChatImage internals, image generation APIs, LayoutSpec, hotspots, transparent layers, prompt engineering, or follow-up branch mechanics in rawAnswer or visualSpec.",
      "- The answer must directly address the user's subject matter, not describe how this product processes answers.",
      "- visualSpec.visualMode defaults to infographic. Use map for hand-drawn maps, tourist maps, geography, scenic guides, route maps, and clickable geographic regions. Use poster for poster-like visual works and scene for painterly/illustrated scenes.",
      "- For map/poster/scene, modules should be semantic clickable regions or objects, not necessarily GUI cards. Provide regionKind and regionPrompt for every module so a vision locator can identify the full region.",
      "- For every map/poster/scene module, provide visualEvidence, maskPolicy, spatialHint, and 2-4 locatorQueries. These fields must describe the visible target, not internal UI mechanics.",
      "- For map modules, do not merge two distant routes or places into one clickable module unless the visual target is one continuous drawn route. If a title would be 'A and B' and A/B are spatially separate, split them into separate modules.",
      "- For map modules about lodging, transport, cableways, stations, entrances, supplies, or practical notes, the image must contain a visible matching icon/legend/label region, not only mention it in the detail text.",
      "- For scene/poster targets that combine a visible object/person with a nearby short label or badge, use regionKind=object-with-label and write regionPrompt as both components, for example: 'the guide robot plus the attached AI personalized guide label badge'.",
      "- For object-with-label targets, set maskPolicy=subject-with-label and componentHints to the visible object/person and attached label/badge. For route targets, set maskPolicy=route. For legends, set maskPolicy=legend.",
      "- For map/poster/scene, avoid flowchart/card-number language. The image can use short labels, but it must not draw the raw user question as the title.",
      "- visualSpec.modules must use an adaptive count. Infographics use 3 to 6 main modules; maps may use 4 to 12 visible clickable regions when the place has distinct landmarks/routes/areas; scenes and posters may use 4 to 8 visible objects or regions.",
      "- Module count guide: use 3 for simple definitions or single-focus explanations; 4 for standard concepts or compact processes; 5 for multi-dimensional comparisons, complex workflows, industry/strategy/system analysis; use 6 only for dense infographics that truly need more coverage. For maps, do not drop obvious named places just to fit 6 modules.",
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
      "- layoutVariant must be one of compare-matrix, compare-split, asymmetric-focus-stack, swimlane-flow, timeline, grid, map, scene, or poster.",
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
    const relationType = normalizeRelationType(value.relationType || fallback.relationType);
    const language = normalizeLanguage(value.language || fallback.language || inferQuestionLanguage(question));
    const inferredVisualMode = inferVisualMode(question);
    const modelVisualMode = value.visualMode ? normalizeVisualMode(value.visualMode) : "";
    const useFallbackForModeConflict = inferredVisualMode !== "infographic" && modelVisualMode && modelVisualMode !== inferredVisualMode;
    const visualMode = resolveVisualMode(value.visualMode, fallback.visualMode, question);
    const maxMainModules = getMaxMainModulesForVisualMode(visualMode);
    const modules = Array.isArray(value.modules) ? value.modules.slice(0, maxMainModules) : [];
    if (modules.length < 3) return fallback;
    if (containsInternalProductLeak(value, question)) return fallback;
    if (shouldUseDomainFallbackForModules(modules, question)) return fallback;
    const visualComposition = normalizeVisualCompositionForMode(
      normalizeVisualComposition(useFallbackForModeConflict ? fallback.visualComposition : value.visualComposition, fallback.visualComposition, relationType),
      visualMode
    );
    const auxiliaryModules = normalizeAuxiliaryModules(
      useFallbackForModeConflict ? fallback.auxiliaryModules : value.auxiliaryModules || value.auxModules || value.supportingModules,
      question,
      rawAnswer,
      relationType,
      language,
      visualMode
    );
    const sourceModules = completeQuestionSpecificMapModules(
      useFallbackForModeConflict ? fallback.modules : modules,
      question,
      rawAnswer,
      visualMode,
      maxMainModules
    );
    return {
      title: sanitizeVisualTitle(useFallbackForModeConflict ? fallback.title : value.title, question, fallback.title),
      language,
      visualMode,
      summary: sanitizeDetailForUser(String(useFallbackForModeConflict ? fallback.summary : value.summary || fallback.summary).slice(0, 80), String(value.title || fallback.title || "")),
      relationType,
      visualComposition,
      auxiliaryModules,
      modules: addTargetContractsToModules(
        repairMapModulesQuality(
          normalizeMapModuleTargets(
            sourceModules.map((module, index) => ({
              id: `module_${index + 1}`,
              title: sanitizeModuleTitle(module.title || `模块 ${index + 1}`, index, question, rawAnswer, visualMode),
              imageText: String(module.imageText || module.shortText || module.detail || "").slice(0, 32),
              detail: sanitizeDetailForUser(String(module.detail || "").slice(0, 1400), String(module.imageText || module.title || "")),
              sourceExcerpt: sanitizeDetailForUser(String(module.sourceExcerpt || "").slice(0, 160), String(module.imageText || module.title || "")),
              iconHint: String(module.iconHint || "idea"),
              regionKind: inferRegionKind(module, visualMode),
              regionPrompt: String(module.regionPrompt || module.visualPrompt || module.title || "").slice(0, 180),
              priority: Number(module.priority || index + 1),
              visualEvidence: module.visualEvidence,
              maskPolicy: module.maskPolicy,
              spatialHint: module.spatialHint,
              locatorQueries: module.locatorQueries,
              componentHints: module.componentHints
            })),
            visualMode
          ),
          visualMode,
          question,
          rawAnswer
        ),
        visualMode
      )
    };
  }

  function shouldUseDomainFallbackForModules(modules, question) {
    const visualMode = inferVisualMode(question);
    if (["map", "scene", "poster"].includes(visualMode)) {
      const targets = extractExplicitVisualTargets(question, visualMode);
      if (targets.length >= 3) {
        const joined = (modules || [])
          .flatMap((module) => [module && module.title, module && module.imageText, module && module.detail, module && module.regionPrompt])
          .map((value) => normalizeTitleForCompare(value))
          .join("\n");
        const hits = targets.filter((target) => joined.includes(normalizeTitleForCompare(target)));
        if (hits.length / targets.length < 0.4) return true;
      }
    }
    if (!hasQuestionSpecificFallback(question)) return false;
    return countGenericFrameworkModules(modules) >= 3;
  }

  function hasQuestionSpecificFallback(question) {
    return (
      isRestGraphqlQuestion(question) ||
      isSqlNoSqlQuestion(question) ||
      isExplicitCompareQuestion(question) ||
      isOAuthQuestion(question) ||
      isKubernetesQuestion(question) ||
      isHttpRenderFlowQuestion(question) ||
      isRagQuestion(question) ||
      isEcommerceFunnelQuestion(question) ||
      isSmartwatchStructureQuestion(question) ||
      isMapQuestion(question) ||
      inferVisualMode(question) === "scene" ||
      inferVisualMode(question) === "poster"
    );
  }

  function sanitizeModuleTitle(value, index, question, rawAnswer, visualMode) {
    const fallback = `模块 ${Number(index || 0) + 1}`;
    let source = String(value || fallback)
      .replace(/^\s*\d{1,2}[\s.、:-]+/, "")
      .replace(/\s+/g, " ")
      .trim();
    // Reject titles that ended up as nothing but punctuation / brackets after
    // sanitisation. LLM occasionally emits stray fragments like "）" or ":".
    // Keeping them would render as a blank-looking hotspot label.
    if (!hasMeaningfulTitleChar(source)) return fallback;
    source = repairKnownModuleTitle(source, question, rawAnswer, visualMode) || source;
    if (!source || !hasMeaningfulTitleChar(source)) return fallback;
    if (source.length <= 24) return source;
    const separated = source.match(/^([^:：|｜\-–—]+)[:：|｜\-–—]\s*(.+)$/);
    if (separated) {
      const head = separated[1].trim();
      const tail = separated[2].trim();
      if (head && head.length <= 18) {
        const compactTail = tail
          .replace(/^(用于|负责|提供|管理|声明|存储|自动|HTTP\/HTTPS|非机密|敏感)/, "")
          .replace(/[，。；,.;].*$/, "")
          .trim();
        const candidate = compactTail ? `${head} ${compactTail}` : head;
        if (candidate.length <= 24) return candidate;
        return head;
      }
    }
    const trimmed = source.slice(0, 24).replace(/[：:、，。；;,.!?！？\s]+$/, "");
    return hasMeaningfulTitleChar(trimmed) ? trimmed : fallback;
  }

  // True iff the string contains at least one CJK ideograph, kana, hangul, or
  // ASCII letter/digit; pure-punctuation strings ("）", ":-", "——") return false.
  function hasMeaningfulTitleChar(value) {
    return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}A-Za-z0-9]/u.test(String(value || ""));
  }

  function repairKnownModuleTitle(value, question, rawAnswer, visualMode) {
    const source = String(value || "").trim();
    const context = `${source}\n${question || ""}\n${rawAnswer || ""}`;
    if (/kubernetes|k8s/i.test(context)) {
      if (/^pod\b|^pod[：:]/i.test(source)) return "Pod 最小调度单元";
      if (/^deployment\b|^deployment[：:]/i.test(source)) return "Deployment 编排";
      if (/^service\b|^service[：:]/i.test(source)) return "Service 稳定访问";
      if (/^ingress\b|^ingress[：:]/i.test(source)) return "Ingress 外部入口";
      if (/^configmap\b|^configmap[：:]/i.test(source)) return "ConfigMap 配置";
      if (/^secret\b|^secret[：:]/i.test(source)) return "Secret 密钥";
      if (/^hpa\b|horizontal pod autoscaler/i.test(source)) return "HPA 自动扩缩容";
      if (/滚动发布|rollout|rolling/i.test(source)) return "滚动发布";
    }
    if (/oauth/i.test(context)) {
      if (/授权码|authorization code/i.test(source)) return "授权码交换";
      if (/token/i.test(source)) return "Token 使用";
      if (/pkce|安全|security/i.test(source)) return "安全控制";
    }
    if (String(visualMode || "").toLowerCase() === "infographic" && /^(.{2,18})[：:]\s*(.{1,12})/.test(source)) {
      return source.replace(/^(.{2,18})[：:]\s*(.{1,12}).*$/, "$1 $2").trim();
    }
    return source;
  }

  function resolveVisualMode(modelValue, fallbackValue, question) {
    const inferred = inferVisualMode(question);
    const modelMode = normalizeVisualMode(modelValue || "");
    if (inferred !== "infographic" && modelMode !== inferred) return inferred;
    return normalizeVisualMode(modelValue || fallbackValue || inferred);
  }

  function normalizeVisualCompositionForMode(composition, visualMode) {
    const source = composition || {};
    if (visualMode === "map") {
      return {
        ...source,
        compositionType: source.compositionType && String(source.compositionType).includes("map") ? source.compositionType : "hand-drawn-map",
        layoutVariant: "map"
      };
    }
    if (visualMode === "scene") {
      return {
        ...source,
        compositionType: "illustrated-scene",
        layoutVariant: source.layoutVariant && source.layoutVariant !== "map" && source.layoutVariant !== "grid" ? source.layoutVariant : "scene"
      };
    }
    if (visualMode === "poster") {
      return {
        ...source,
        compositionType: "editorial-poster",
        layoutVariant: source.layoutVariant && source.layoutVariant !== "map" && source.layoutVariant !== "grid" ? source.layoutVariant : "poster"
      };
    }
    return source;
  }

  function normalizeAuxiliaryModules(value, question, rawAnswer, relationType, language, visualMode = "infographic") {
    const explicit = Array.isArray(value) ? value.slice(0, 4) : [];
    const source = explicit.length ? explicit : buildDefaultAuxiliaryModules(question, rawAnswer, relationType, language);
    return source
      .map((module, index) => ({
        id: `aux_${index + 1}`,
        title: sanitizeAuxiliaryTitle(module.title || module.label || `辅助区域 ${index + 1}`, language),
        imageText: String(module.imageText || module.shortText || module.detail || "").slice(0, 36),
        detail: sanitizeDetailForUser(String(module.detail || "").slice(0, 1400), String(module.imageText || module.title || "")),
        sourceExcerpt: String(module.sourceExcerpt || "").slice(0, 160),
        iconHint: String(module.iconHint || "summary"),
        regionKind: inferAuxiliaryRegionKind(module, visualMode),
        regionPrompt: String(module.regionPrompt || module.visualPrompt || module.title || "").slice(0, 180),
        priority: Number(module.priority || 10 + index)
      }))
      .map((module) => addTargetContractToModule(module, visualMode))
      .filter((module) => module.title && module.imageText && module.detail);
  }

  function addTargetContractsToModules(modules, visualMode) {
    return (Array.isArray(modules) ? modules : []).map((module) => addTargetContractToModule(module, visualMode));
  }

  // Centralized user-facing-text sanitizer for a whole spec. Mock/fallback
  // generators (buildCompareDimensionModule, buildRagPipelineFallbackSpec, the
  // map/scene/K8s/e-commerce fallbacks, etc.) historically emitted detail /
  // summary / sourceExcerpt strings containing meta-instruction scaffolding
  // ("点击后需要分别说明…", "图上应该把…画成", "详情区应解释…") or visual-system
  // vocab ("短标签", "便于热点定位"). Those specs BYPASS the normalize path's
  // per-module sanitizeDetailForUser (they return early from normalizeVisualSpec
  // or come straight from buildMockSpec), so the contamination reached the panel
  // uncleaned. Running every spec through this function at the
  // ensureVisualTargetContracts bottleneck (and on the LLM normalize path for
  // summary/sourceExcerpt) closes that gap in one place instead of editing 14+
  // generator strings.
  function sanitizeSpecFields(spec) {
    if (!spec || typeof spec !== "object") return spec;
    const cleanModule = (module) => {
      if (!module || typeof module !== "object") return module;
      const fallback = String(module.imageText || module.title || "");
      return {
        ...module,
        detail: sanitizeDetailForUser(String(module.detail || ""), fallback),
        sourceExcerpt: sanitizeDetailForUser(String(module.sourceExcerpt || ""), fallback),
        imageText: sanitizeDetailForUser(String(module.imageText || ""), String(module.title || ""))
      };
    };
    return {
      ...spec,
      summary: sanitizeDetailForUser(String(spec.summary || ""), String(spec.title || "")),
      modules: Array.isArray(spec.modules) ? spec.modules.map(cleanModule) : spec.modules,
      auxiliaryModules: Array.isArray(spec.auxiliaryModules) ? spec.auxiliaryModules.map(cleanModule) : spec.auxiliaryModules
    };
  }

  function ensureVisualTargetContracts(spec) {
    if (!spec || typeof spec !== "object") return spec;
    const cleaned = sanitizeSpecFields(spec);
    const visualMode = normalizeVisualMode(cleaned.visualMode || "infographic");
    return {
      ...cleaned,
      visualMode,
      modules: addTargetContractsToModules(cleaned.modules, visualMode),
      auxiliaryModules: addTargetContractsToModules(cleaned.auxiliaryModules || [], visualMode)
    };
  }

  function addTargetContractToModule(module, visualMode) {
    const regionKind = module.regionKind || inferRegionKind(module, visualMode);
    const context = {
      ...module,
      regionKind,
      visualMode
    };
    const maskPolicy = resolveMaskPolicy(module.maskPolicy || module.mask, context);
    const spatialHint = String(module.spatialHint || module.positionHint || inferSpatialHint(context)).slice(0, 80);
    const visualEvidence = normalizeTextList(module.visualEvidence || module.evidence, 4, 120);
    const evidence = visualEvidence.length ? visualEvidence : inferVisualEvidence(context, maskPolicy);
    const locatorQueries = normalizeTextList(module.locatorQueries || module.locatorQuery || module.queries, 4, 160);
    const queries = locatorQueries.length ? locatorQueries : inferLocatorQueries(context, evidence, maskPolicy);
    return {
      ...module,
      regionKind,
      visualEvidence: evidence,
      maskPolicy,
      spatialHint,
      locatorQueries: queries,
      componentHints: normalizeComponentHints(module.componentHints || module.components || module.parts, context, maskPolicy)
    };
  }

  function normalizeTextList(value, maxItems, maxChars) {
    const source = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[;\n]/) : [];
    return Array.from(
      new Set(
        source
          .map((item) => String(item || "").trim())
          .filter(Boolean)
          .map((item) => item.slice(0, maxChars))
      )
    ).slice(0, maxItems);
  }

  function normalizeComponentHints(value, context, maskPolicy) {
    const explicit = Array.isArray(value)
      ? value
          .map((item) => {
            if (typeof item === "string") return { kind: "component", label: item.slice(0, 80) };
            if (!item || typeof item !== "object" || Array.isArray(item)) return null;
            return {
              kind: String(item.kind || item.type || "component").slice(0, 40),
              label: String(item.label || item.text || item.name || "").slice(0, 80)
            };
          })
          .filter((item) => item && item.label)
      : [];
    if (explicit.length) return explicit.slice(0, 4);
    if (maskPolicy === "subject-with-label") {
      return [
        { kind: "object", label: `${context.title} visible subject` },
        { kind: "label", label: `${context.title} attached short label or badge` }
      ];
    }
    return [];
  }

  function normalizeMaskPolicy(value) {
    const source = String(value || "").trim().toLowerCase();
    const allowed = ["card", "full-region", "subject", "subject-with-label", "route", "legend"];
    if (allowed.includes(source)) return source;
    return "full-region";
  }

  function resolveMaskPolicy(value, context) {
    const explicitSource = String(value || "").trim();
    const explicit = explicitSource ? normalizeMaskPolicy(explicitSource) : "";
    const inferred = inferMaskPolicy(context);
    const visualMode = normalizeVisualMode(context && context.visualMode);
    const kind = String((context && context.regionKind) || "").toLowerCase();
    if (kind === "flow-strip") return "full-region";
    if (visualMode === "map") {
      if (["route", "axis"].includes(kind)) return "route";
      if (["legend", "panel"].includes(kind)) return "legend";
      if (kind === "object-with-label") return "subject-with-label";
      if (explicit === "subject-with-label" && ["building", "landmark"].includes(kind)) return "subject-with-label";
      if (explicit === "subject-with-label" && !["object-with-label", "building", "landmark"].includes(kind)) return inferred;
      if (explicit === "legend" && !["legend", "panel"].includes(kind)) return inferred;
      if (explicit === "route" && !["route", "axis"].includes(kind)) return inferred;
    }
    return explicit || inferred;
  }

  function inferMaskPolicy(context) {
    const visualMode = normalizeVisualMode(context.visualMode);
    const kind = String(context.regionKind || "").toLowerCase();
    if (kind === "flow-strip") return "full-region";
    if (visualMode === "infographic" || kind === "card") return "card";
    if (kind === "object-with-label") return "subject-with-label";
    if (["object", "person", "building", "landmark"].includes(kind)) return "subject";
    if (["route", "axis"].includes(kind)) return "route";
    if (["legend", "panel"].includes(kind)) return "legend";
    return "full-region";
  }

  function inferSpatialHint(context) {
    const primaryText = [context.title, context.imageText, context.regionPrompt]
      .map((value) => String(value || ""))
      .join(" ")
      .toLowerCase();
    const allText = [primaryText, context.detail]
      .map((value) => String(value || ""))
      .join(" ")
      .toLowerCase();
    if (/\u4e1c|\u9633\u5149|east|right|sunshine/.test(primaryText)) return "east";
    if (/\u897f|west|left/.test(primaryText)) return "west";
    if (/\u5317|north|top/.test(primaryText)) return "north";
    if (/\u5357|south|bottom/.test(primaryText)) return "south";
    if (/\u4e1c|\u9633\u5149|east|right|sunshine/.test(allText)) return "east";
    if (/\u897f|west|left/.test(allText)) return "west";
    if (/\u5317|north|top/.test(allText)) return "north";
    if (/\u5357|south|bottom/.test(allText)) return "south";
    if (/\u4e2d\u5fc3|\u6838\u5fc3|center|central/.test(allText)) return "center";
    if (/\u5e95\u90e8|\u56fe\u4f8b|\u4ea4\u901a|\u4f4f\u5bbf|legend|transport|lodging|hotel/.test(allText)) return "edge or bottom";
    return "";
  }

  function inferVisualEvidence(context, maskPolicy) {
    const base = [];
    if (String((context && context.regionKind) || "").toLowerCase() === "flow-strip") {
      base.push(`complete horizontal workflow strip for ${context.title}`);
      base.push("all connected nodes, arrows, labels, and enclosing flow region");
    }
    if (context.regionPrompt) base.push(context.regionPrompt);
    if (context.imageText && context.imageText !== context.title) base.push(context.imageText);
    if (maskPolicy === "route") base.push("visible route/path stroke or corridor");
    if (maskPolicy === "legend") base.push("compact legend block with icon/label evidence");
    if (maskPolicy === "subject-with-label") base.push("visible subject plus attached short label or badge");
    if (maskPolicy === "subject") base.push("visible subject silhouette or landmark body");
    if (!base.length && context.title) base.push(context.title);
    return normalizeTextList(base, 4, 120);
  }

  function inferLocatorQueries(context, evidence, maskPolicy) {
    const queries = [context.title, context.regionPrompt, ...evidence];
    if (String((context && context.regionKind) || "").toLowerCase() === "flow-strip") {
      queries.unshift(`complete horizontal workflow strip including all connected nodes for ${context.title}`);
    }
    if (maskPolicy === "subject-with-label") queries.unshift(`complete object/person plus attached label for ${context.title}`);
    if (maskPolicy === "route") queries.unshift(`visible route corridor for ${context.title}`);
    if (maskPolicy === "legend") queries.unshift(`complete legend/info block for ${context.title}`);
    return normalizeTextList(queries, 4, 160);
  }

  function normalizeMapModuleTargets(modules, visualMode) {
    const mode = normalizeVisualMode(visualMode);
    const source = Array.isArray(modules) ? modules : [];
    if (mode !== "map") return source;
    const maxModules = getMaxMainModulesForVisualMode(mode);
    const expanded = [];
    for (const module of source) {
      const split = splitCombinedMapRouteModule(module, source.length + expanded.length, maxModules);
      if (split.length) expanded.push(...split);
      else expanded.push(module);
    }
    return expanded.slice(0, maxModules).map((module, index) => ({
      ...module,
      id: `module_${index + 1}`,
      priority: Number(module.priority || index + 1)
    }));
  }

  function repairMapModulesQuality(modules, visualMode, question, rawAnswer) {
    const repaired = (Array.isArray(modules) ? modules : []).map((module) => repairMapModuleQuality(module, visualMode, question, rawAnswer));
    if (normalizeVisualMode(visualMode) !== "map") return repaired;
    const byKey = new Map();
    for (const module of repaired) {
      const key = [module.title, module.regionKind || "", module.maskPolicy || ""].join("|");
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, module);
        continue;
      }
      const existingScore = String(existing.detail || "").length + String(existing.regionPrompt || "").length;
      const score = String(module.detail || "").length + String(module.regionPrompt || "").length;
      if (score > existingScore) byKey.set(key, module);
    }
    return Array.from(byKey.values()).map((module, index) => ({
      ...module,
      id: `module_${index + 1}`,
      priority: Number(module.priority || index + 1)
    }));
  }

  function repairMapModuleQuality(module, visualMode, question, rawAnswer) {
    if (normalizeVisualMode(visualMode) !== "map" || !module || typeof module !== "object") return module;
    const repaired = { ...module };
    repaired.title = repairMapModuleTitle(repaired);
    repaired.imageText = repairMapModuleImageText(repaired);
    repaired.regionPrompt = repairMapModuleRegionPrompt(repaired);
    repaired.regionKind = inferRegionKind(repaired, visualMode);
    if (repaired.title === "山上住宿点") {
      repaired.regionKind = "object-with-label";
      repaired.maskPolicy = "subject-with-label";
      repaired.regionPrompt = "地图上的山上住宿点实体标记，必须包含房屋、床位、宾馆或补给图标，并贴近‘住宿’或宾馆名称短标签";
      repaired.visualEvidence = [
        "房屋、床位或宾馆图标",
        "‘住宿’或宾馆名称短标签",
        "标记位于山体或索道站附近而不是普通图例里"
      ];
      repaired.locatorQueries = ["山上住宿点", "女神宾馆", "日上山庄", "住宿房屋标记"];
      repaired.componentHints = [
        { kind: "object", label: "住宿房屋或床位图标" },
        { kind: "label", label: "住宿或宾馆名称短标签" }
      ];
    }
    repaired.detail = repairThinMapDetail(repaired, question, rawAnswer);
    if (!String(repaired.sourceExcerpt || "").trim()) {
      // regionPrompt is image-search vocabulary; including it here feeds locator
      // instructions into the followup LLM, which can echo them back to the user.
      // Keep only human-facing title/imageText.
      repaired.sourceExcerpt = [repaired.title, repaired.imageText].filter(Boolean).join("；").slice(0, 160);
    }
    return repaired;
  }

  function repairMapModuleTitle(module) {
    const title = String((module && module.title) || "").trim();
    const nonTitleText = [
      module && module.imageText,
      module && module.regionPrompt,
      module && module.detail,
      ...(Array.isArray(module && module.locatorQueries) ? module.locatorQueries : [])
    ]
      .map((value) => String(value || ""))
      .join(" ");
    const text = [
      title,
      nonTitleText
    ]
      .map((value) => String(value || ""))
      .join(" ");
    const nonTitleHasLodging = /山上住宿|山顶住宿|住宿点|女神宾馆|日上山庄|西海岸宾馆|酒店|宾馆|山庄/.test(nonTitleText);
    const nonTitleHasTransport = /交通索道|索道入口|外双溪索道|金沙索道|缆车|索道站|索道线路|上山索道/.test(nonTitleText);
    const routeIdentityText = [title, module && module.imageText, module && module.regionPrompt]
      .map((value) => String(value || ""))
      .join(" ");
    const nonTitleHasNanqingCore =
      /南清园/.test(title) ||
      /巨蟒出山|司春女神|核心峰林|花岗岩峰林|象形山峰/.test(nonTitleText) ||
      (/南清园/.test(nonTitleText) && !/西海岸|阳光海岸|东侧栈道|西侧栈道|云海栈道/.test(routeIdentityText));
    if (nonTitleHasTransport && !nonTitleHasLodging) return "交通索道入口";
    if (nonTitleHasLodging) return "山上住宿点";
    if (nonTitleHasNanqingCore && !nonTitleHasTransport && !nonTitleHasLodging) return "南清园核心景区";
    if (/交通索道|索道入口|外双溪索道|金沙索道|缆车|索道站/.test(text)) return "交通索道入口";
    if (/山上住宿|山顶住宿|住宿点|女神宾馆|日上山庄|西海岸宾馆/.test(text)) return "山上住宿点";
    if (/阳光海岸|东侧栈道|日出栈道|东侧.*栈道/.test(text)) return "阳光海岸栈道";
    if (/西海岸|西海栈道|西侧.*栈道|云海栈道/.test(text)) return "西海岸栈道";
    if (title === "阳光海岸栈") return "阳光海岸栈道";
    if (title === "西海岸栈") return "西海岸栈道";
    return title;
  }

  function repairMapModuleImageText(module) {
    const title = String((module && module.title) || "").trim();
    const imageText = String((module && module.imageText) || "").trim();
    if (title === "阳光海岸栈道" && (!/阳光海岸/.test(imageText) || /西海岸/.test(imageText))) {
      return "阳光海岸栈道·东侧日出山脊";
    }
    if (title === "西海岸栈道" && (!/西海岸/.test(imageText) || /阳光海岸/.test(imageText))) {
      return "西海岸栈道·西侧悬崖云海";
    }
    if (title === "南清园核心景区" && (!/南清园|巨蟒|司春|峰林|花岗岩/.test(imageText) || /西海岸|阳光海岸|索道|住宿/.test(imageText))) {
      return "巨蟒出山与司春女神";
    }
    if (title === "交通索道入口" && (!/索道|缆车|外双溪|金沙|入口/.test(imageText) || /西海岸|阳光海岸|南清园|住宿/.test(imageText))) {
      return "外双溪与金沙索道入口";
    }
    if (title === "山上住宿点" && (!/住宿|宾馆|山庄|房屋|床位/.test(imageText) || /西海岸|阳光海岸|索道|南清园/.test(imageText))) {
      return "女神宾馆与日上山庄";
    }
    return imageText || title;
  }

  function repairMapModuleRegionPrompt(module) {
    const title = String((module && module.title) || "");
    const prompt = String((module && module.regionPrompt) || "").trim();
    if (title === "阳光海岸栈道" && (!/阳光海岸|东侧|日出/.test(prompt) || /西海岸/.test(prompt))) {
      return "地图东侧或山体东侧的阳光海岸栈道，包含朝阳、树林、山脊栈道线和‘阳光海岸栈道’短标签";
    }
    if (title === "西海岸栈道" && (!/西海岸|西侧|云海/.test(prompt) || /阳光海岸/.test(prompt))) {
      return "地图西侧或山体西侧的西海岸栈道，包含云海、悬崖栈道线和‘西海岸栈道’短标签";
    }
    if (title === "交通索道入口" && !/索道|缆车|外双溪|金沙/.test(prompt)) {
      return "地图底部或边缘的交通索道入口图例，包含外双溪索道、金沙索道、缆车或车站图标和短标签";
    }
    if (title === "山上住宿点" && !/住宿|宾馆|山庄|房屋|床位/.test(prompt)) {
      return "地图边缘或索道站附近的山上住宿点，包含房屋、床位、宾馆或补给图标和‘住宿’短标签";
    }
    return prompt;
  }

  function repairThinMapDetail(module, question, rawAnswer) {
    const detail = String((module && module.detail) || "").trim();
    if (detail.length >= 180) return detail;
    const title = String((module && module.title) || "").trim();
    const imageText = String((module && module.imageText) || "").trim();
    const evidence = normalizeTextList(module && module.visualEvidence, 4, 80);
    // NOTE: module.regionPrompt is the visual-locator prompt fed to LocateAnything/
    // SAM3 — image-search vocabulary that must NOT reach the user. module.locatorQueries
    // is also internal. Even module.visualEvidence can contain templated visual-system
    // vocabulary (e.g. "可见地理边界或路线", "贴近目标的短标签") generated by
    // buildSemanticTargetEvidence as a fallback when the LLM did not produce real
    // evidence. Filter those tokens out before quoting evidence in the user-facing
    // explanation; only LLM-supplied concrete evidence survives.
    const userFacingEvidence = evidence.filter((item) => !looksLikeUserFacingNoise(item));
    const context = userFacingEvidence.join("、");
    // base is echoed verbatim into the template sentences below, so it must not
    // carry locator vocabulary. sanitizeDetailForUser strips prompt-style
    // clauses; if nothing usable survives it falls back to the clean title.
    const base = sanitizeDetailForUser(detail || imageText, title);
    if (/阳光海岸栈道/.test(title)) {
      return [
        `${base}。`,
        "它位于三清山东侧山脊，沿途和日出、远山、树林与高空栈道视野相关。",
        "游玩时方向、天气能见度、体力消耗都会影响体验，和西海岸栈道相比走向偏东、晨光更好。",
        "把它放在视野开阔、光线较好的时段去走最划算，结束后还要预留返程到索道或住宿点的时间。"
      ].join("");
    }
    if (/西海岸栈道/.test(title)) {
      return [
        `${base}。`,
        "它沿西侧绝壁展开，核心体验是高空栈道、峡谷纵深、云海和傍晚光线。",
        "走的时候节奏不要太快——栈道窄而长，恐高的人需要做心理准备；雨雾天气会显著影响视野。",
        "和阳光海岸的东侧线路在方向与视野上完全不同：这边视野偏西、傍晚最佳；行程上适合作为慢走观景段，避免和核心峰林区赶路式串联。"
      ].join("");
    }
    if (/山上住宿点/.test(title)) {
      return [
        `${base}。`,
        "山上住宿与南清园、西海岸、索道上站之间通常步行十几分钟可达，所以住山上可以减少早晚往返。",
        "代价是床位有限、价格更高、天气波动也会影响补给和洗澡热水稳定性，行程上需要结合日出晚霞时间和第二天路线提前安排。",
        "如果时间紧不打算住山上，就要更严格控制最后一班索道前的下山时间——这两种方案的差别主要体现在早晚景观、行李压力和索道运营时间窗。"
      ].join("");
    }
    if (context) {
      return `${base}。${title}是这片地图里的一处独立区域，它在空间上和周边相邻区域形成连接关系，沿线的可见特征包括：${context}。具体的边界、合适观察的角度，以及游玩时需要注意的限制，都依赖当时的实际场景，但作为路径或地标本身，它已经是一个能独立交互的节点。`;
    }
    return `${base}。${title}是这片地图里的一处独立区域，它在空间上承接前后路线、和相邻区域共同构成完整的游线节奏。具体的边界、合适观察的角度，以及游玩时需要注意的限制，都依赖现场实际情况。`;
  }

  // Visual-system vocabulary used internally by SAM3/LocateAnything prompts and
  // by buildSemanticTargetEvidence's fallback list. Phrases on this list look
  // like instructions to a vision/locator system rather than information for a
  // human reader and must not surface in the click-detail panel.
  const VISUAL_SYSTEM_VOCAB = [
    "短标签",
    "贴近目标",
    "贴近主体",
    "可见地理边界或路线",
    "可见边界",
    "主体轮廓",
    "完整可见",
    "图例标记",
    "面板边界",
    "可读短标签",
    "应覆盖",
    "可点击范围",
    "subject silhouette",
    "complete legend",
    "image-search",
    // Phrases the structure LLM tends to echo from regionPrompt into detail.
    // "必须包含…" / "包含…图标" / "用途和风貌" are generation instructions,
    // not explanations; they surfaced verbatim in agent-eval failures.
    "必须包含",
    "包含图标",
    "包含房屋",
    "包含标签",
    "用途和风貌",
    "图例或标签",
    "实体标记",
    "locator query",
    "visual evidence"
  ];

  function looksLikeVisualSystemVocab(text) {
    const value = String(text || "");
    if (!value) return true;
    return VISUAL_SYSTEM_VOCAB.some((token) => value.includes(token));
  }

  // Meta-instruction vocabulary: phrases where the LLM addresses the DETAIL
  // PANEL itself or the reader/designer rather than describing the region's
  // content. Examples seen in production: "详情区应关注…", "建议同时列出…",
  // "该主题通常会经历…的过程", "它适合作为热点，因为…". These read like author
  // notes / design scaffolding, not explanations, and must not surface in the
  // panel. A clause containing any of these tokens is stripped by
  // sanitizeDetailForUser; a whole detail that is short and matches is dropped.
  const META_INSTRUCTION_VOCAB = [
    "详情区应关注",
    "详情区应",
    "建议同时列出",
    "建议列出",
    "建议同时",
    "适合作为热点",
    "适合覆盖",
    "未编号区域",
    "辅助区域",
    "该主题通常会",
    "通常会经历",
    "从技术验证到场景落地",
    "读者在动手之前",
    "以便读者",
    "避免把说明性内容",
    "避免把",
    "设计注脚",
    "this unnumbered region",
    "this supporting panel",
    "it is useful as a hotspot",
    "this region summarizes",
    "this region is used to",
    "the detail panel should",
    "readers can",
    "点击此区域",
    "点击这个区域",
    "点击后可以",
    "点击后需要",
    "点击后说明",
    "图中应把",
    "图中应",
    "图中这一区域",
    "图上应该把",
    "图上应该",
    "详情里应",
    "详情还应",
    "详情可以",
    "这个辅助区",
    "这个区域不是",
    "这个区域用于",
    "应画出",
    "画成可点击",
    "画成独立",
    "应像一条",
    "应作为独立",
    "用户点击不同",
    "应能看到",
    "避免把说明",
    "可点击的独立",
    "detail shown after hotspot",
    "unnumbered panel"
  ];

  // True if a clause/detail contains visual-system vocab OR meta-instruction
  // vocab — either kind of contamination disqualifies it from the user-facing
  // detail panel.
  function looksLikeUserFacingNoise(text) {
    const value = String(text || "");
    if (!value) return true;
    if (VISUAL_SYSTEM_VOCAB.some((token) => value.includes(token))) return true;
    return META_INSTRUCTION_VOCAB.some((token) => value.includes(token));
  }

  // Clean a module.detail value before it reaches the click-detail panel.
  // module.detail is produced by the structure LLM but can be contaminated with
  // image-search/locator vocabulary (e.g. "...必须包含房屋...短标签", "区域…用途和风貌")
  // when the model echoes the regionPrompt it was just asked to emit. Such
  // instruction-style fragments read like generation prompts, not explanations.
  // We (1) drop detail that is itself visual-system vocab, (2) strip out
  // clauses containing locator vocabulary, and (3) collapse the result. If
  // nothing usable survives, the caller falls back to imageText/title.
  function sanitizeDetailForUser(value, fallback = "") {
    const detail = String(value || "").trim();
    if (!detail) return String(fallback || "").trim();
    if (looksLikeUserFacingNoise(detail) && detail.length < 60) {
      // The whole detail is a short locator / meta-instruction fragment — discard it.
      return String(fallback || "").trim();
    }
    // Filter clause-by-clause but PRESERVE each clause's trailing punctuation
    // (。！？；). Replacing 。 with ； here would corrupt the sentence boundaries
    // that splitCombinedMapRouteModule / extractMapTargetSentence rely on.
    const clauses = detail.match(/[^。！？!?；;]*[。！？!?；;]?/g) || [];
    const kept = clauses
      .map((clause) => clause.trim())
      .filter((clause) => clause && !looksLikeUserFacingNoise(clause));
    const cleaned = kept.join("");
    if (cleaned.length >= 24) return cleaned;
    // Too little survived cleaning — prefer the fallback over a prompt fragment.
    return String(fallback || "").trim() || detail;
  }

  function completeQuestionSpecificMapModules(modules, question, rawAnswer, visualMode, maxModules = 12) {
    const mode = normalizeVisualMode(visualMode);
    const source = Array.isArray(modules) ? modules.filter(Boolean) : [];
    if (mode !== "map") return source;
    if (isSanqingQuestion(question)) {
      const templates = buildSanqingMapFallbackSpec(question, rawAnswer).modules || [];
      const completed = source.slice(0, maxModules);
      for (const template of templates) {
        if (completed.length >= maxModules) break;
        if (hasEquivalentSanqingMapModule(completed, template)) continue;
        completed.push({
          ...template,
          priority: Number(template.priority || completed.length + 1)
        });
      }
      return completed.slice(0, maxModules);
    }
    if (!isWestLakeQuestion(question)) return source.slice(0, maxModules);
    const templates = buildWestLakeMapFallbackSpec(question, rawAnswer).modules || [];
    const completed = source.slice(0, maxModules);
    for (const template of templates) {
      if (completed.length >= maxModules) break;
      if (hasEquivalentMapModule(completed, template)) continue;
      completed.push({
        ...template,
        priority: Number(template.priority || completed.length + 1)
      });
    }
    return completed.slice(0, maxModules);
  }

  function isWestLakeQuestion(question) {
    return /西湖|west lake/i.test(String(question || ""));
  }

  function isSanqingQuestion(question) {
    return /三清山|sanqing/i.test(String(question || ""));
  }

  function isHuangshanQuestion(question) {
    return /黄山|huangshan|徽州/i.test(String(question || ""));
  }

  function hasEquivalentSanqingMapModule(modules, template) {
    const title = String((template && template.title) || "");
    const prompt = String((template && template.regionPrompt) || "");
    const aliases = getSanqingRegionAliases(title);
    return modules.some((module) => {
      const componentLabels = Array.isArray(module.componentHints)
        ? module.componentHints.map((item) => (item && typeof item === "object" ? item.label : item))
        : [];
      const text = [
        module.title,
        module.imageText,
        module.regionPrompt,
        ...(Array.isArray(module.visualEvidence) ? module.visualEvidence : []),
        ...(Array.isArray(module.locatorQueries) ? module.locatorQueries : []),
        ...componentLabels
      ]
        .map((value) => String(value || ""))
        .join(" ");
      if (title && text.includes(title)) return true;
      if (prompt && String(module.regionPrompt || "") === prompt) return true;
      return aliases.some((alias) => alias && text.includes(alias));
    });
  }

  function getSanqingRegionAliases(title) {
    const map = {
      南清园核心景区: ["南清园", "巨蟒出山", "司春女神", "核心景区"],
      西海岸栈道: ["西海岸栈道", "西海岸", "西侧栈道", "云海栈道"],
      阳光海岸栈道: ["阳光海岸栈道", "阳光海岸", "东侧栈道", "日出栈道"],
      交通索道入口: ["交通索道", "索道入口", "外双溪索道", "金沙索道", "缆车"],
      山上住宿点: ["山上住宿", "山顶住宿", "住宿点", "女神宾馆", "日上山庄", "西海岸宾馆"]
    };
    return map[title] || [title];
  }

  function hasEquivalentMapModule(modules, template) {
    const title = String((template && template.title) || "");
    const prompt = String((template && template.regionPrompt) || "");
    const aliases = getWestLakeRegionAliases(title);
    return modules.some((module) => {
      const text = [module.title, module.imageText, module.regionPrompt, module.detail]
        .map((value) => String(value || ""))
        .join(" ");
      if (title && text.includes(title)) return true;
      if (prompt && String(module.regionPrompt || "") === prompt) return true;
      return aliases.some((alias) => alias && text.includes(alias));
    });
  }

  function getWestLakeRegionAliases(title) {
    const map = {
      西湖水域: ["湖面", "水域", "游船"],
      白堤断桥: ["白堤", "断桥"],
      苏堤春晓: ["苏堤", "春晓"],
      三潭印月: ["三潭", "湖心岛", "石塔"],
      雷峰塔: ["雷峰", "南岸塔"],
      孤山: ["孤山"],
      宝石山: ["宝石山", "保俶塔"],
      曲院风荷: ["曲院", "风荷", "荷塘", "荷花"],
      柳浪闻莺: ["柳浪", "闻莺", "柳林"]
    };
    return map[title] || [title];
  }

  function splitCombinedMapRouteModule(module, currentCount, maxModules = 12) {
    if (!module || module.regionKind !== "route" || currentCount >= maxModules) return [];
    const text = [module.title, module.imageText, module.regionPrompt, module.detail].join("\n");
    const knownPairs = [
      {
        left: "西海岸",
        right: "阳光海岸",
        leftTitle: "西海岸栈道",
        rightTitle: "阳光海岸栈道",
        leftPrompt: "地图西侧或山体西侧的西海岸栈道，包含云海、悬崖栈道线和短标签",
        rightPrompt: "地图东侧或山体东侧的阳光海岸栈道，包含朝阳、树林、山脊栈道线和短标签"
      },
      {
        left: "白堤",
        right: "苏堤",
        leftTitle: "白堤断桥",
        rightTitle: "苏堤春晓",
        leftPrompt: "西湖北侧白堤和断桥形成的线性游览区域",
        rightPrompt: "纵贯西湖的苏堤、桥、柳树和两侧湖水形成的长条区域"
      }
    ];
    for (const pair of knownPairs) {
      if (!text.includes(pair.left) || !text.includes(pair.right)) continue;
      const leftDetail = extractMapTargetSentence(module.detail, pair.left) || module.detail;
      const rightDetail = extractMapTargetSentence(module.detail, pair.right) || module.detail;
      return [
        {
          ...module,
          title: pair.leftTitle.slice(0, 12),
          imageText: `${pair.left}路线`.slice(0, 32),
          detail: leftDetail,
          regionPrompt: pair.leftPrompt,
          regionKind: "route"
        },
        {
          ...module,
          title: pair.rightTitle.slice(0, 12),
          imageText: `${pair.right}路线`.slice(0, 32),
          detail: rightDetail,
          regionPrompt: pair.rightPrompt,
          regionKind: "route",
          priority: Number(module.priority || 1) + 0.1
        }
      ];
    }
    return [];
  }

  function extractMapTargetSentence(detail, keyword) {
    const source = String(detail || "");
    const sentences = source.match(/[^。！？!?]+[。！？!?]?/g) || [];
    return sentences.filter((sentence) => sentence.includes(keyword)).join("").trim();
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
    // Pull a real excerpt from the answer for each panel so the fallback detail
    // is grounded in actual content, not a generic "this unnumbered region…"
    // meta-description. Keep excerpts short and non-overlapping.
    const excerpt = (start, len) => source.slice(start, start + len).trim().replace(/\s+/g, " ");
    if (language === "en") {
      return [
        {
          title: "Input context",
          imageText: "User intent, context, constraints",
          detail: [
            "Inputs the process starts from: the user's request, prior context, and any constraints.",
            excerpt(0, 120) ? `From the answer: ${excerpt(0, 120)}。` : "",
            "These inputs shape every later step — they decide what counts as a valid result and what trade-offs are acceptable."
          ].filter(Boolean).join(" "),
          sourceExcerpt: excerpt(0, 140),
          iconHint: "user",
          priority: 10
        },
        {
          title: "External tools",
          imageText: "Search, code, data, calculators",
          detail: [
            "Outside capabilities the process may call on — search, code execution, databases, calculators.",
            excerpt(140, 120) ? `Relevant excerpt: ${excerpt(140, 120)}。` : "",
            "When and how these tools are invoked, and how their results feed back into reasoning, affects the reliability and cost of the whole flow."
          ].filter(Boolean).join(" "),
          sourceExcerpt: excerpt(140, 160),
          iconHint: "tool",
          priority: 11
        },
        {
          title: "Legend",
          imageText: "Status, symbols, decision markers",
          detail: [
            "Reading rules for the diagram: what each status marker, color, icon, and connector means.",
            excerpt(300, 120) ? `Relevant excerpt: ${excerpt(300, 120)}。` : "",
            "Use this panel to decode the visual vocabulary without crowding it into the numbered cards."
          ].filter(Boolean).join(" "),
          sourceExcerpt: excerpt(300, 160),
          iconHint: "summary",
          priority: 12
        }
      ];
    }
    return [
      {
        title: "输入与环境",
        imageText: "用户意图、上下文、约束",
        detail: [
          "流程开始前读取的输入条件：用户意图、已有上下文、任务边界与环境状态。",
          excerpt(0, 120) ? `原文相关片段：${excerpt(0, 120)}。` : "",
          "这些前提决定了后续每一步的判定标准与可接受的取舍范围。"
        ].filter(Boolean).join(""),
        sourceExcerpt: excerpt(0, 140),
        iconHint: "user",
        priority: 10
      },
      {
        title: "外部工具",
        imageText: "搜索、代码、数据、计算器",
        detail: [
          "流程中可能调用的外部能力，如搜索、代码解释、数据库、计算器。",
          excerpt(140, 120) ? `原文相关片段：${excerpt(140, 120)}。` : "",
          "工具在哪个阶段被调用、返回什么样的中间结果、如何接续到后面的推理，决定了整个流程的可靠程度、成本与风险。"
        ].filter(Boolean).join(""),
        sourceExcerpt: excerpt(140, 160),
        iconHint: "tool",
        priority: 11
      },
      {
        title: "图例说明",
        imageText: "状态、符号、颜色含义",
        detail: [
          "信息图的阅读规则：状态点、颜色、图标、连接线和标签各自的含义。",
          excerpt(300, 120) ? `原文相关片段：${excerpt(300, 120)}。` : "",
          "点击此处理解整张图的状态变化与符号约定，不必把这些说明挤进主编号卡片。"
        ].filter(Boolean).join(""),
        sourceExcerpt: excerpt(300, 160),
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
    return value.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 12);
  }

  function getMaxMainModulesForVisualMode(visualMode) {
    const mode = normalizeVisualMode(visualMode);
    if (mode === "map") return 12;
    if (mode === "scene" || mode === "poster") return 8;
    return 6;
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
    const allowed = ["compare-matrix", "compare-split", "asymmetric-focus-stack", "swimlane-flow", "timeline", "grid", "map", "scene", "poster"];
    if (allowed.includes(source)) return source;
    return inferDefaultLayoutVariant(relationType, compositionType);
  }

  function inferDefaultLayoutVariant(relationType, compositionType) {
    const relation = String(relationType || "").toLowerCase();
    const composition = String(compositionType || "").toLowerCase();
    if (composition.includes("map")) return "map";
    if (composition.includes("scene") || composition.includes("illustration")) return "scene";
    if (composition.includes("poster")) return "poster";
    if (relation === "compare" || relation === "matrix" || composition.includes("matrix")) return "compare-matrix";
    if (relation === "flow" || composition.includes("flow")) return "swimlane-flow";
    if (relation === "timeline" || composition.includes("timeline")) return "timeline";
    if (composition.includes("cluster") || composition.includes("layer")) return "asymmetric-focus-stack";
    return "grid";
  }

  function sanitizeVisualTitle(value, question, fallback) {
    return sanitizeVisualTitleV2(value, question, fallback);
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

  function sanitizeVisualTitleV2(value, question, fallback) {
    const domainTitle = inferDomainTitle(question);
    if (domainTitle) return domainTitle;
    const inferredMode = inferVisualMode(question);
    const semanticTitle = ["map", "scene", "poster"].includes(inferredMode) ? inferGenericVisualTitle(question, inferredMode) : "";
    if (semanticTitle) return semanticTitle;
    const raw = String(value || "").trim();
    const fallbackTitle = String(fallback || "").trim();
    let title = raw || fallbackTitle || extractQuestionSubject(question);
    if (isGenericTemplateTitle(title) || looksLikeRawQuestionTitle(title, question)) {
      title = extractQuestionSubject(question);
    }
    title = cleanInstructionTitle(title);
    if (!title || isGenericTemplateTitle(title)) title = fallbackTitle || "ChatImage 结构图";
    return smartShortTitle(title, 24);
  }

  function inferDomainTitle(question) {
    if (isExplicitCompareQuestion(question) && !isRestGraphqlQuestion(question) && !isSqlNoSqlQuestion(question)) {
      return inferCompareQuestionTitle(question);
    }
    if (isRestGraphqlQuestion(question)) return inferQuestionLanguage(question) === "zh-CN" ? "REST 与 GraphQL 对比" : "REST vs GraphQL";
    if (isSqlNoSqlQuestion(question)) return inferQuestionLanguage(question) === "zh-CN" ? "SQL 与 NoSQL 对比" : "SQL vs NoSQL";
    if (isOAuthQuestion(question)) return "OAuth 2.0 授权码流程";
    if (isKubernetesQuestion(question)) return "Kubernetes 部署架构";
    if (isHttpRenderFlowQuestion(question)) return "HTTP 页面渲染流程";
    if (isRagQuestion(question)) return "RAG 检索增强流程";
    if (isEcommerceFunnelQuestion(question)) return "电商转化漏斗分析";
    return "";
  }

  function isGenericTemplateTitle(value) {
    const title = String(value || "");
    return /(\.\.\.|…|可以从.{0,8}个角度|背景.*现状.*驱动|current state.*drivers.*trends|background.*challenge.*trend)/i.test(title);
  }

  function looksLikeRawQuestionTitle(title, question) {
    const source = String(title || "").trim();
    const rawQuestion = String(question || "").trim();
    if (!source || !rawQuestion) return false;
    const compactSource = normalizeTitleForCompare(source);
    const compactQuestion = normalizeTitleForCompare(rawQuestion);
    if (compactQuestion && compactSource === compactQuestion) return true;
    if (compactQuestion && compactQuestion.length >= 8 && compactSource.includes(compactQuestion.slice(0, Math.min(16, compactQuestion.length)))) return true;
    return /^(请|帮我|给我|为|生成|画|画一张|设计|解释|说明|分析|对比|介绍|summarize|explain|generate|draw|design)/i.test(source);
  }

  function normalizeTitleForCompare(value) {
    return String(value || "")
      .replace(/\s+/g, "")
      .replace(/[，。！？、；：,.!?;:]/g, "")
      .toLowerCase();
  }

  function cleanInstructionTitle(value) {
    return stripLeadingVisualInstructionPrefix(value)
      .replace(/\.{3,}|…/g, "")
      .replace(/^(请|帮我|给我)\s*/i, "")
      .replace(/^(生成|画一张|画一个|画|设计|解释|说明|分析|对比|介绍)\s*/i, "")
      .replace(/^(draw|generate|create|make|design|explain|introduce|summarize|analyze)\s+/i, "")
      .replace(/[，。！？、；：,.!?;:]+$/g, "")
      .trim();
  }

  function stripLeadingVisualInstructionPrefix(value) {
    return String(value || "")
      .replace(/^(?:请|帮我|给我)?\s*用\s*(?!例|户|法|途)(?=.{1,36}(?:剖视图|横切面|图|视图|地图|海报|插画|场景|diagram|map|poster|scene))/i, "")
      .trim();
  }

  function polishVisualTitlePhrase(value) {
    const title = String(value || "").trim();
    // Reorder "<drawing-form>展示<subject>" → "<subject><drawing-form>" so the
    // title leads with the real topic noun, e.g. "横切面剖视图展示智能仓库" →
    // "智能仓库横切面剖视图". The subject portion may be long (it can include
    // an enumerated list); we keep it intact here and let smartShortTitle clamp.
    const drawingFirst = title.match(/^(.{2,18}?(?:剖视图|横切面|爆炸视图|结构示意图|结构图|示意图|流程图|对比图|对照图|时间线|环形图|漏斗图|分层架构图|架构图|全景图|等距(?:俯视)?插画|插画|海报|视图|地图|导览图|指引图|色轮图|平面图|布局图))\s*(?:展示|呈现|表现|描绘|标注|画出|绘制|画)\s*(.{2,60})$/);
    if (drawingFirst) {
      const form = drawingFirst[1].trim();
      let subject = drawingFirst[2].trim();
      // If the subject carries an enumerated detail list ("……：城墙、瞭望塔"),
      // keep only the head noun phrase before the colon for the title.
      const head = subject.split(/[：:]/)[0].trim();
      if (head && head.length >= 2) subject = head;
      return `${subject}${form}`.trim();
    }
    return title;
  }

  function smartShortTitle(value, maxLength) {
    const title = String(value || "").trim();
    const limit = Number(maxLength) || 24;
    if (title.length <= limit) return title;
    const breaks = [title.lastIndexOf(" ", limit), title.lastIndexOf("，", limit), title.lastIndexOf("、", limit)];
    const preferredBreak = Math.max(...breaks);
    if (preferredBreak >= Math.max(8, limit - 8)) return title.slice(0, preferredBreak).trim();
    return title.slice(0, limit).replace(/[与和及对比分析解析说明覆盖]$/, "").trim();
  }

  function assessAnswerStructureQuality(normalized, question) {
    const warnings = [];
    const rawAnswer = String((normalized && normalized.rawAnswer) || "");
    const spec = normalized && normalized.visualSpec ? normalized.visualSpec : normalized || {};
    const modules = Array.isArray(spec.modules) ? spec.modules : [];
    if (hasTopicMismatch(question, rawAnswer, spec)) warnings.push("topic_mismatch");
    if (rawAnswer.length && rawAnswer.length < 180) warnings.push("rawAnswer_too_short");
    if (looksLikeRawQuestionTitle(spec.title, question)) warnings.push("title_raw_question");
    if (countGenericFrameworkModules(modules) >= 3 && isConcreteQuestion(question)) warnings.push("generic_five_part_framework");
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
    if (isRagQuestion(question)) {
      const joined = [rawAnswer, spec.title, spec.summary, ...modules.flatMap((module) => [module.title, module.imageText, module.detail])]
        .join("\n")
        .toLowerCase();
      const requiredGroups = [
        ["RAG"],
        ["文档切分", "chunk", "split"],
        ["向量化", "embedding"],
        ["召回", "retrieve", "retrieval"],
        ["重排", "rerank"],
        ["上下文", "context"],
        ["答案生成", "generate"]
      ];
      for (const group of requiredGroups) {
        if (!group.some((keyword) => joined.includes(String(keyword).toLowerCase()))) warnings.push(`missing_${group[0]}_dimension`);
      }
    }
    for (const module of modules) {
      if (String(module.detail || "").length < 90) warnings.push(`thin_detail_${module.id || module.title || "module"}`);
      if (!String(module.sourceExcerpt || "").trim()) warnings.push(`missing_source_${module.id || module.title || "module"}`);
    }
    return Array.from(new Set(warnings));
  }

  function countGenericFrameworkModules(modules) {
    const genericTitles = new Set([
      "背景基础",
      "当前现状",
      "核心驱动",
      "主要挑战",
      "未来趋势",
      "鑳屾櫙鍩虹",
      "褰撳墠鐜扮姸",
      "鏍稿績椹卞姩",
      "涓昏鎸戞垬",
      "鏈潵瓒嬪娍"
    ]);
    return (modules || []).filter((module) => genericTitles.has(String(module && module.title ? module.title : "").trim())).length;
  }

  function isConcreteQuestion(question) {
    const text = String(question || "");
    if (isRestGraphqlQuestion(text) || isSqlNoSqlQuestion(text) || isOAuthQuestion(text) || isKubernetesQuestion(text) || isRagQuestion(text) || isEcommerceFunnelQuestion(text)) return true;
    if (isMapQuestion(text) || inferVisualMode(text) === "scene") return true;
    return /[A-Za-z0-9]{2,}|[\u4e00-\u9fff]{4,}/.test(text);
  }

  function hasTopicMismatch(question, rawAnswer, spec) {
    const keywords = extractTopicKeywords(question);
    if (!keywords.length) return false;
    const joined = [
      rawAnswer,
      spec && spec.title,
      spec && spec.summary,
      ...((spec && spec.modules) || []).flatMap((module) => [module.title, module.imageText, module.detail, module.regionPrompt])
    ]
      .map((value) => String(value || ""))
      .join("\n")
      .toLowerCase();
    if (!joined.trim()) return false;
    const hits = keywords.filter((keyword) => joined.includes(keyword.toLowerCase()));
    if (keywords[0] && !hits.includes(keywords[0])) return true;
    return hits.length / keywords.length < 0.35;
  }

  function extractTopicKeywords(question) {
    const source = String(question || "");
    const candidates = source.match(/[\u4e00-\u9fffA-Za-z0-9]+/g) || [];
    const stop = new Set([
      "生成",
      "请",
      "画成",
      "一张",
      "手绘",
      "导览",
      "地图",
      "导览地图",
      "地理",
      "风貌",
      "地理风貌图",
      "下周",
      "想去",
      "游玩",
      "不要",
      "流程图",
      "点击",
      "区域",
      "查看",
      "具体",
      "建议",
      "等",
      "可以",
      "呈现",
      "说明",
      "介绍",
      "解析"
      ,"explain",
      "compare",
      "describe",
      "generate",
      "create",
      "make",
      "show"
    ]);
    const keywords = [];
    for (const raw of candidates) {
      const value = raw.trim();
      const lowerValue = value.toLowerCase();
      if (value.length < 2 || stop.has(value) || stop.has(lowerValue)) continue;
      const actionKeywords = extractActionKeywords(value);
      if (actionKeywords.length) {
        keywords.push(...actionKeywords);
        continue;
      }
      const compact = value
        .replace(/地理风貌图|地理风貌|导览地图|手绘|生成|点击|区域|查看|具体|游玩建议|游玩|能否|是否|如何|怎么|什么|的/g, "")
        .trim();
      if (compact.length >= 2 && !stop.has(compact) && !stop.has(compact.toLowerCase())) keywords.push(compact);
    }
    return Array.from(new Set(keywords)).slice(0, 8);
  }

  function extractActionKeywords(value) {
    const source = String(value || "");
    const actions = ["保存", "恢复", "搜索", "删除", "重命名", "置顶", "追问", "上传", "下载"];
    return actions.filter((item) => source.includes(item));
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
      "- visualSpec.modules must use an adaptive count. Infographics use 3 to 6 modules; maps may use 4 to 12 visible clickable regions; scenes and posters may use 4 to 8 visible objects or regions. Choose the smallest count that preserves the answer structure; do not force exactly 5 modules.",
      "- visualComposition.moduleCountReason should briefly explain the chosen module count.",
      "- visualComposition.layoutVariant must be one of compare-matrix, compare-split, asymmetric-focus-stack, swimlane-flow, timeline, grid, map, scene, or poster.",
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
    // Order matters: poster and scene win over map; map wins over infographic.
    // We also rule out a few false friends explicitly (e.g. SaaS "发布路线图"
    // is a product-roadmap timeline, not a real geographic map).

    // 1. Scene: anatomical/cutaway/exploded illustrations of a single object,
    //    isometric/panoramic real-world scenes.
    if (/scene|illustration|\u63d2\u753b|\u4e00\u5e45\u753b|\u50cf\u4e00\u5e45\u753b|\u573a\u666f\u56fe|\u573a\u666f\u63d2\u753b|\u63d2\u753b\u573a\u666f|\u6c89\u6d78\u5f0f[\s\S]{0,8}\u573a\u666f|\u753b[\s\S]{0,18}\u573a\u666f/.test(text)) return "scene";
    if (/exploded[-\s]?view|cutaway|cross[-\s]?section|isometric|\u5269\u89c6\u56fe|\u5256\u89c6|\u5269\u89c6|\u6a2a\u5207\u9762\u5256\u89c6|\u6a2a\u5207\u9762|\u5269\u9762|\u7ed3\u6784\u5256\u89c6|\u7206\u70b8\u89c6\u56fe|\u7b49\u8ddd[\s\S]{0,4}\u63d2\u753b|\u7b49\u8ddd[\s\S]{0,4}\u4fef\u89c6|\u5168\u666f\u56fe|\u751f\u6001\u7cfb\u7edf\u5168\u666f/.test(text)) return "scene";

    // 2. Poster: visual narratives meant to be read at a glance.
    if (/poster|one[-\s]?sheet|\u6d77\u62a5|\u5c55\u677f|\u4e3b\u89c6\u89c9/.test(text)) return "poster";

    // 3. Map: geographic / floor-plan / venue-layout / wayfinding diagrams.
    //    Important: explicitly exclude product-roadmap / development-roadmap
    //    timelines that happen to contain the word "路线图".
    const isProductRoadmap = /\u4ea7\u54c1\u8def\u7ebf|\u53d1\u5e03\u8def\u7ebf|\u4ea7\u54c1\u53d1\u5e03|saas\s*\u4ea7\u54c1|roadmap|\u4ea7\u54c1\u89c4\u5212|\u8fed\u4ee3\u8def\u7ebf|\u6280\u672f\u8def\u7ebf|\u5b66\u4e60\u8def\u7ebf/.test(text);
    if (isProductRoadmap) return "infographic";
    const isTravelGuide =
      /(?:旅游|旅行|游玩|游览|景区|景点|行程|路线).{0,8}攻略|攻略.{0,8}(?:旅游|旅行|游玩|游览|景区|景点|行程|路线)/.test(text) ||
      /(?:黄山|泰山|庐山|九寨沟|张家界|故宫|长城|博物馆|古镇|公园|乐园|海岸|湖区).{0,12}(?:攻略|游玩|旅游|旅行|路线|景点|导览)/.test(text);
    if (isTravelGuide) return "map";
    const mapKeywords = [
      "\u5730\u56fe",         // 地图
      "\u624b\u7ed8\u5730\u56fe", // 手绘地图
      "\u5bfc\u89c8\u56fe",   // 导览图
      "\u6307\u5f15\u56fe",   // 指引图
      "\u5e73\u9762\u56fe",   // 平面图
      "\u5e03\u5c40\u56fe",   // 布局图
      "\u697c\u5c42\u56fe",   // 楼层图
      "\u573a\u5730\u56fe",   // 场地图
      "\u8857\u533a\u56fe",   // 街区图
      "\u56ed\u533a\u56fe",   // 园区图
      "\u5206\u533a\u56fe",   // 分区图
      "\u822a\u7ad9\u697c",   // 航站楼
      "\u8857\u533a",         // 街区
      "\u56ed\u533a",         // 园区
      "\u666f\u533a",         // 景区
      "\u65c5\u6e38\u653b\u7565", // 旅游攻略
      "\u6e38\u73a9\u653b\u7565", // 游玩攻略
      "\u65c5\u884c\u653b\u7565", // 旅行攻略
      "\u666f\u70b9",         // 景点
      "\u9ec4\u5c71",         // 黄山
      "\u897f\u6e56",         // 西湖
      "\u5730\u7406",         // 地理
      "\u8def\u7ebf",         // 路线
      "\u6e38\u89c8",         // 游览
      "\u5730\u6807",         // 地标
      "\u573a\u5730",         // 场地
      "\u5e02\u96c6"          // 市集
    ];
    if (/hand[-\s]?drawn map|tourist map|route map|atlas|geographic|floor[-\s]?plan|terminal map|venue map|wayfinding|(?:^|[^a-z])map(?:$|[^a-z])/.test(text)) return "map";
    if (mapKeywords.some((keyword) => text.includes(keyword))) return "map";
    if (text.includes("\u5bfc\u89c8") && /\u5730\u7406|\u5730\u56fe|\u666f\u533a|\u6e38\u89c8|\u8def\u7ebf|tourist|map|route/.test(text)) return "map";
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
      "axis",
      "legend",
      "object",
      "object-with-label",
      "person",
      "background",
      "foreground",
      "panel",
      "flow-strip"
    ];
    if (allowed.includes(source)) return source;
    return "area";
  }

  function inferAuxiliaryRegionKind(module, visualMode) {
    if (isFlowStripModuleText(module)) return "flow-strip";
    return inferRegionKind(module, visualMode);
  }

  function isFlowStripModuleText(module) {
    const text = [module && module.title, module && module.imageText, module && module.regionPrompt, module && module.detail]
      .filter(Boolean)
      .join("\n")
      .toLowerCase();
    return /(\u534f\u4f5c\u6d41\u7a0b|\u5b8c\u6574\u94fe\u8def|\u6574\u4f53\u6d41\u7a0b|\u6d41\u7a0b\u603b\u89c8|\u5de5\u4f5c\u6d41\u603b\u89c8|\u8d44\u6e90\u534f\u4f5c|\u7aef\u5230\u7aef|\u5168\u94fe\u8def|workflow overview|workflow strip|flow strip|end-to-end|pipeline overview|resource flow)/i.test(text);
  }

  function inferRegionKind(module, visualMode) {
    const explicit = normalizeRegionKind(module && (module.regionKind || module.kind));
    const mode = normalizeVisualMode(visualMode);
    const titleText = [module && module.title, module && module.imageText]
      .filter(Boolean)
      .join("\n")
      .toLowerCase();
    const primaryText = [module && module.title, module && module.regionPrompt, module && module.imageText]
      .filter(Boolean)
      .join("\n")
      .toLowerCase();
    const text = [module && module.title, module && module.imageText, module && module.regionPrompt, module && module.detail]
      .filter(Boolean)
      .join("\n")
      .toLowerCase();
    if (mode === "map") {
      const strongTitleKind = inferMapRegionKindStrong(titleText);
      if (strongTitleKind !== "area") return strongTitleKind;
      const strongPrimaryKind = inferMapRegionKindStrong(primaryText);
      if (strongPrimaryKind !== "area") return strongPrimaryKind;
      const titleKind = inferMapRegionKindFromTitle(titleText);
      if (titleKind !== "area") return titleKind;
      const primaryKind = inferMapRegionKindFromText(primaryText);
      if (primaryKind !== "area") return primaryKind;
      const explicitKind = explicit !== "area" ? explicit : "area";
      const strongDetailKind = inferMapRegionKindStrong(text);
      if (strongDetailKind !== "area") return strongDetailKind;
      const detailKind = inferMapRegionKindFromText(text);
      if (detailKind !== "area") return detailKind;
      return explicitKind;
    }
    if (explicit !== "area") return explicit;
    if (mode === "scene" || mode === "poster") {
      if (/(\u5e94\u6025\u51fa\u53e3|\u51fa\u53e3|\u5165\u53e3|\u95e8\u724c|\u6307\u793a\u724c|\u6807\u724c|exit|entrance|signage|sign)/i.test(text)) return "object-with-label";
      if (/机器人|导览|助手|标签|徽标|robot|guide|assistant|label|badge/.test(text)) return "object-with-label";
      if (/人|观众|居民|用户|person|people|visitor|resident/.test(text)) return "person";
      if (/背景|天空|远景|background/.test(text)) return "background";
      if (/前景|foreground/.test(text)) return "foreground";
      if (/建筑|设备|展品|物体|object|building|device|exhibit/.test(text)) return "object";
    }
    return "area";
  }

  function inferMapRegionKindStrong(text) {
    if (!text) return "area";
    const source = String(text).toLowerCase();
    if (/图例|说明|色块|标识说明|实用信息|准备|住宿|装备|天气|legend|key|guide panel|info panel/.test(source)) {
      return "legend";
    }
    if (/交通|接驳|高铁|巴士|公交|索道|缆车|车站|换乘|transit|transport|bus|rail|station|cableway|ropeway/.test(source)) {
      return "legend";
    }
    if (/栈道|海岸|步道|游线|线路|路线|环线|长廊|走廊|登山道|堤桥|长堤|堤|桥|trail|route|path|walkway|corridor|coast|coastal|causeway|bridge/.test(source)) {
      return "route";
    }
    if (/对景|轴线|相望|视线|关系线|空间关系|整体关系|格局|sightline|axis|relationship/.test(source)) return "axis";
    if (/湖面|水域|水面|湖区|河道|溪流|water|lake|river|pond/.test(source)) return "water";
    if (/塔|亭|宫|庙|寺|观|建筑|楼|building|tower|temple|pavilion/.test(source)) return "building";
    if (/地标|岛|峰林|石峰|石柱|景观区|景区|landmark|island|scenic/.test(source)) return "landmark";
    if (/山体|山峰|山脉|山岭|花岗岩|峰峦|mountain|hill|ridge|granite/.test(source)) return "mountain";
    return "area";
  }

  function inferMapRegionKindFromText(text) {
    if (!text) return "area";
    if (/图例|色块|legend|key/.test(text)) return "legend";
    if (/对景|轴线|相望|视线|关系|格局|sightline|axis|relationship/.test(text)) return "axis";
    if (/湖面|水域|水面|湖区|water surface|lake surface/.test(text)) return "water";
    if (/三潭|岛|洲|地标|landmark|island/.test(text)) return "landmark";
    if (/塔|楼|亭|馆|寺|建筑|building|tower|temple|pavilion/.test(text)) return "building";
    if (/山|峰|岭|荷|花|植物|林|岸|mountain|hill|lotus|plant|shore/.test(text)) return "mountain";
    if (/堤|桥|路|路线|步道|街|巷|trail|route|road|bridge|causeway/.test(text)) return "route";
    if (/湖|河|江|海|池|pond|lake|river|water/.test(text)) return "water";
    return "area";
  }

  function inferMapRegionKindFromTitle(text) {
    if (!text) return "area";
    if (/图例|色块|legend|key/.test(text)) return "legend";
    if (/对景|轴线|相望|视线|关系|格局|sightline|axis|relationship/.test(text)) return "axis";
    if (/湖面|水域|水面|湖区|water surface|lake surface/.test(text)) return "water";
    if (/三潭|岛|洲|地标|landmark|island/.test(text)) return "landmark";
    if (/塔|楼|亭|馆|寺|建筑|building|tower|temple|pavilion/.test(text)) return "building";
    if (/堤|桥|路|路线|步道|街|巷|trail|route|road|bridge|causeway/.test(text)) return "route";
    if (/山|峰|岭|荷|花|植物|林|岸|湿地|mountain|hill|lotus|plant|shore|wetland/.test(text)) return "mountain";
    if (/湖面|水域|水面|湖区|湖|河|江|海|池|pond|lake|river|water/.test(text)) return "water";
    return "area";
  }

  function isMapQuestion(question) {
    return inferVisualMode(question) === "map";
  }

  function isRestGraphqlQuestion(question) {
    const text = String(question || "");
    return /REST/i.test(text) && /GraphQL/i.test(text);
  }

  function isSqlNoSqlQuestion(question) {
    const text = String(question || "");
    return /\bSQL\b/i.test(text) && /NoSQL/i.test(text);
  }

  function isOAuthQuestion(question) {
    const text = String(question || "");
    return /\bOAuth\s*2(?:\.0)?\b/i.test(text) || /授权码|授权登录|oauth/i.test(text);
  }

  function isKubernetesQuestion(question) {
    const text = String(question || "");
    return /\bKubernetes\b|\bk8s\b/i.test(text) || /容器编排|集群部署|部署架构/.test(text);
  }

  function isHttpRenderFlowQuestion(question) {
    const text = String(question || "");
    return /\bHTTP\b/i.test(text) && /DNS|TCP|TLS|DOM|CSSOM|渲染|请求|响应|页面/i.test(text);
  }

  function isRagQuestion(question) {
    const text = String(question || "");
    return (
      /\bRAG\b/i.test(text) ||
      /\u68c0\u7d22\u589e\u5f3a|\u5411\u91cf\u5316|\u91cd\u6392|\u4e0a\u4e0b\u6587\u62fc\u63a5|\u6587\u6863\u5207\u5206/.test(text)
    ) && /\u68c0\u7d22|\u53ec\u56de|\u751f\u6210|retrieval|embedding|rerank/i.test(text);
  }

  function isEcommerceFunnelQuestion(question) {
    const text = String(question || "");
    return /电商|商城|商品|订单|支付|复购|转化漏斗|漏斗分析/.test(text) && /漏斗|转化|成交|支付|加购/.test(text);
  }

  function isSmartwatchStructureQuestion(question) {
    const text = String(question || "");
    return /智能手表|smart\s*watch|smartwatch/i.test(text) && /结构|内部|爆炸图|拆解|部件|组件|屏幕|电池|传感器|表带|外壳/i.test(text);
  }

  function extractQuestionSubject(question) {
    let cleaned = String(question || "")
      .replace(/[\u3002\uff0c\uff1f\uff01!?,]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!cleaned) return "\u4e3b\u9898";
    const prefixes = [
      /^\u8bf7?\s*(?:\u753b|\u753b\u4e00\u4e2a|\u753b\u4e00\u5f20|\u751f\u6210|\u521b\u5efa|\u5236\u4f5c|\u8bbe\u8ba1)\s*(?:\u4e00\u4e2a|\u4e00\u5f20|\u4e00\u4efd)?\s*/i,
      /^\u8bf7?\s*(?:\u4ecb\u7ecd|\u8bf4\u660e|\u89e3\u91ca|\u5206\u6790|\u68b3\u7406|\u8bb2\u8bb2|\u8c08\u8c08|\u6982\u8ff0|\u603b\u7ed3)\s*(?:\u4e00\u4e0b|\u4e0b|\u4e00\u6b21)?\s*(?:\u5173\u4e8e)?\s*/i,
      /^\u5e2e\u6211\s*(?:\u4ecb\u7ecd|\u8bf4\u660e|\u89e3\u91ca|\u5206\u6790|\u68b3\u7406)\s*(?:\u4e00\u4e0b|\u4e0b)?\s*(?:\u5173\u4e8e)?\s*/i,
      /^(?:draw|generate|create|make|design|what is|explain|introduce|summarize|analyze|describe)\s+/i
    ];
    for (const pattern of prefixes) {
      cleaned = cleaned.replace(pattern, "").trim();
    }
    cleaned = stripLeadingVisualInstructionPrefix(cleaned)
      .replace(/(?:\u7528\u6237|\u6e38\u5ba2)?\u53ef\u4ee5(?:\u70b9\u51fb|\u4e92\u52a8)[\s\S]*$/i, "")
      .replace(/\u70b9\u51fb(?:\u4e92\u52a8)?[\s\S]*$/i, "")
      .replace(/\u753b\u5728\u4e00\u5f20\u56fe\u4e0a[\s\S]*$/i, "")
      .replace(/\u6211(?:\u4e0b\u5468|\u660e\u5929|\u8fd9\u5468|\u5468\u672b)?\u60f3\u53bb[\s\S]*$/i, "")
      .replace(/(?:\u4e0b\u5468|\u660e\u5929|\u8fd9\u5468|\u5468\u672b)\u60f3\u53bb[\s\S]*$/i, "")
      .trim();
    cleaned = cleaned.replace(/^(?:\u5173\u4e8e|about)\s+/i, "").trim();
    cleaned = polishVisualTitlePhrase(cleaned);
    return cleaned || compactTitle(question);
  }

  function compactTitle(question) {
    const cleaned = String(question || "").replace(/[？?。.!！]/g, "").trim();
    if (!cleaned) return "ChatImage 结构图";
    return cleaned.length > 18 ? cleaned.slice(0, 18).trim() : cleaned;
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
    inferRegionKind,
    normalizeVisualMode,
    normalizeVisualComposition,
    normalizeVisualSpec,
    parseJsonFromText,
    repairThinMapDetail
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  global.ChatImageStructure = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
