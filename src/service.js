(function initService(global) {
  "use strict";

  function createMockLlmProvider({ sleep }) {
    return {
      async answer(question) {
        await sleep(420);
        return [
          `\u56f4\u7ed5\u201c${question}\u201d\uff0c\u53ef\u4ee5\u4ece\u80cc\u666f\u57fa\u7840\u3001\u5f53\u524d\u73b0\u72b6\u3001\u6838\u5fc3\u9a71\u52a8\u3001\u4e3b\u8981\u6311\u6218\u548c\u672a\u6765\u8d8b\u52bf\u4e94\u4e2a\u65b9\u9762\u7406\u89e3\u3002`,
          "\u9996\u5148\uff0c\u80cc\u666f\u57fa\u7840\u51b3\u5b9a\u4e86\u8fd9\u4e2a\u9886\u57df\u4e3a\u4ec0\u4e48\u4f1a\u53d1\u5c55\u3002\u5176\u6b21\uff0c\u5f53\u524d\u73b0\u72b6\u53ef\u4ee5\u5e2e\u52a9\u5224\u65ad\u5b83\u5904\u5728\u65e9\u671f\u9a8c\u8bc1\u3001\u573a\u666f\u843d\u5730\u8fd8\u662f\u89c4\u6a21\u6269\u5f20\u9636\u6bb5\u3002\u7b2c\u4e09\uff0c\u6838\u5fc3\u9a71\u52a8\u901a\u5e38\u6765\u81ea\u6280\u672f\u8fdb\u6b65\u3001\u9700\u6c42\u589e\u957f\u3001\u8d44\u672c\u6295\u5165\u548c\u4ea7\u4e1a\u534f\u540c\u3002\u7b2c\u56db\uff0c\u843d\u5730\u8fc7\u7a0b\u4e2d\u4ecd\u7136\u4f1a\u9047\u5230\u6210\u672c\u3001\u53ef\u9760\u6027\u3001\u6807\u51c6\u3001\u4f9b\u5e94\u94fe\u548c\u5546\u4e1a\u6a21\u5f0f\u7b49\u95ee\u9898\u3002",
          "\u603b\u4f53\u6765\u770b\uff0c\u8fd9\u4e2a\u9886\u57df\u7684\u53d1\u5c55\u4e0d\u662f\u5355\u4e00\u6280\u672f\u7a81\u7834\uff0c\u800c\u662f\u6280\u672f\u3001\u4ea7\u54c1\u3001\u573a\u666f\u548c\u751f\u6001\u5171\u540c\u6f14\u8fdb\u7684\u7ed3\u679c\u3002"
        ].join("\n\n");
      }
    };
  }

  function createLlmProvider({ shouldUseApi, apiPost, providerConfig, mockLlmProvider }) {
    return {
      async answer(question) {
        if (!(await shouldUseApi())) return mockLlmProvider.answer(question);
        const data = await apiPost(providerConfig.endpoints.textGeneration, {
          purpose: "answer",
          content: `请直接回答用户问题，保持信息完整但结构清晰。\n\n用户问题：${question}`
        });
        return data.content;
      }
    };
  }

  function createStructureProvider({ shouldUseApi, apiPost, providerConfig, structureModel, sleep }) {
    return {
      async parse(question, rawAnswer) {
        if (await shouldUseApi()) {
          try {
            const data = await apiPost(providerConfig.endpoints.textGeneration, {
              purpose: "structure",
              responseFormat: "json",
              content: structureModel.buildStructurePrompt(question, rawAnswer)
            });
            return structureModel.normalizeVisualSpec(
              structureModel.parseJsonFromText(data.content),
              question,
              rawAnswer
            );
          } catch (error) {
            if (providerConfig.mode === "api") throw error;
          }
        }
        await sleep(360);
        return structureModel.buildMockSpec(question, rawAnswer);
      }
    };
  }

  function createAnswerStructureProvider({ shouldUseApi, apiPost, providerConfig, structureModel, mockLlmProvider, sleep }) {
    return {
      async create(question) {
        if (await shouldUseApi()) {
          try {
            const data = await apiPost(providerConfig.endpoints.textGeneration, {
              purpose: "answer_structure",
              responseFormat: "json",
              content: structureModel.buildAnswerStructurePrompt(question)
            });
            const textMeta = extractTextModelMeta(data);
            let parsedContent;
            try {
              parsedContent = structureModel.parseJsonFromText(data.content);
            } catch (parseError) {
              if (typeof structureModel.buildAnswerStructureParseRepairPrompt !== "function") throw parseError;
              const repairedParseData = await apiPost(providerConfig.endpoints.textGeneration, {
                purpose: "answer_structure_parse_repair",
                responseFormat: "json",
                content: structureModel.buildAnswerStructureParseRepairPrompt(
                  question,
                  data.content,
                  parseError.message || String(parseError)
                )
              });
              mergeTextModelMeta(textMeta, repairedParseData);
              parsedContent = structureModel.parseJsonFromText(repairedParseData.content);
            }
            const normalized = structureModel.normalizeAnswerStructure(
              parsedContent,
              question
            );
            const warnings =
              typeof structureModel.assessAnswerStructureQuality === "function"
                ? structureModel.assessAnswerStructureQuality(normalized, question)
                : [];
            if (warnings.length && typeof structureModel.buildAnswerStructureRepairPrompt === "function") {
              try {
                const repairedData = await apiPost(providerConfig.endpoints.textGeneration, {
                  purpose: "answer_structure_repair",
                  responseFormat: "json",
                  content: structureModel.buildAnswerStructureRepairPrompt(question, normalized, warnings)
                });
                mergeTextModelMeta(textMeta, repairedData);
                const repaired = structureModel.normalizeAnswerStructure(
                  structureModel.parseJsonFromText(repairedData.content),
                  question
                );
                const repairedWarnings =
                  typeof structureModel.assessAnswerStructureQuality === "function"
                    ? structureModel.assessAnswerStructureQuality(repaired, question)
                    : [];
                if (hasSevereTopicMismatch(repairedWarnings)) {
                  return attachTextModelMeta(
                    buildFallbackAnswerStructure(structureModel, question, warnings.concat(repairedWarnings)),
                    textMeta
                  );
                }
                return attachTextModelMeta(structureModel.attachQualityWarnings
                  ? structureModel.attachQualityWarnings(repaired, repairedWarnings)
                  : repaired, textMeta);
              } catch (repairError) {
                if (hasSevereTopicMismatch(warnings)) {
                  return attachTextModelMeta(
                    buildFallbackAnswerStructure(
                      structureModel,
                      question,
                      warnings.concat(`repair_failed:${repairError.message || repairError}`)
                    ),
                    textMeta
                  );
                }
                return attachTextModelMeta(structureModel.attachQualityWarnings
                  ? structureModel.attachQualityWarnings(normalized, warnings.concat(`repair_failed:${repairError.message || repairError}`))
                  : normalized, textMeta);
              }
            }
            if (hasSevereTopicMismatch(warnings)) {
              return attachTextModelMeta(buildFallbackAnswerStructure(structureModel, question, warnings), textMeta);
            }
            return attachTextModelMeta(structureModel.attachQualityWarnings
              ? structureModel.attachQualityWarnings(normalized, warnings)
              : normalized, textMeta);
          } catch (error) {
            if (providerConfig.mode === "api") throw error;
          }
        }
        const rawAnswer = await mockLlmProvider.answer(question);
        await sleep(120);
        const normalized = {
          rawAnswer,
          visualSpec: structureModel.buildMockSpec(question, rawAnswer)
        };
        const warnings =
          typeof structureModel.assessAnswerStructureQuality === "function"
            ? structureModel.assessAnswerStructureQuality(normalized, question)
            : [];
        return structureModel.attachQualityWarnings
          ? structureModel.attachQualityWarnings(normalized, warnings)
          : normalized;
      }
    };
  }

  function hasSevereTopicMismatch(warnings) {
    return (
      Array.isArray(warnings) &&
      warnings.some((warning) =>
        ["topic_mismatch", "generic_five_part_framework", "title_raw_question", "title_looks_like_raw_question_or_template"].includes(
          String(warning)
        )
      )
    );
  }

  function extractTextModelMeta(data) {
    return {
      textModelUsed: data && data.textModelUsed ? String(data.textModelUsed) : "",
      textModelFallbackReason: data && data.textModelFallbackReason ? String(data.textModelFallbackReason) : ""
    };
  }

  function mergeTextModelMeta(meta, data) {
    if (!meta || !data) return meta;
    if (data.textModelUsed) meta.textModelUsed = String(data.textModelUsed);
    if (data.textModelFallbackReason) meta.textModelFallbackReason = String(data.textModelFallbackReason);
    return meta;
  }

  function attachTextModelMeta(answerStructure, meta) {
    if (!answerStructure || !meta) return answerStructure;
    return {
      ...answerStructure,
      textModelUsed: meta.textModelUsed || answerStructure.textModelUsed || "",
      textModelFallbackReason: meta.textModelFallbackReason || answerStructure.textModelFallbackReason || ""
    };
  }

  function buildFallbackAnswerStructure(structureModel, question, warnings) {
    const rawAnswer = buildFallbackRawAnswer(question);
    const visualSpec = structureModel.buildMockSpec(question, rawAnswer);
    const normalized = { rawAnswer, visualSpec };
    return structureModel.attachQualityWarnings
      ? structureModel.attachQualityWarnings(normalized, Array.from(new Set(warnings || [])))
      : normalized;
  }

  function buildFallbackRawAnswer(question) {
    const source = String(question || "").trim();
    if (/地图|地理|景区|导览|路线|游玩|山|湖|海岸|栈道/.test(source)) {
      const subject = source
        .replace(/生成|请|画成|一张|手绘|导览地图|地理风貌图|地理风貌|不要流程图|点击.*$/g, "")
        .replace(/[，。！？,.!?]/g, "")
        .trim() || "目标景区";
      return `${subject}适合做成一张手绘导览地图：画面应把核心景区、主要游览路线、交通入口、住宿或补给点、自然地貌和观景关系放在同一张图中。用户点击不同地理区域时，应能看到该区域的位置、典型风貌、游玩价值、时间安排和注意事项。地图不应做成流程图，而应通过路线、地标、图例、房屋或索道图标等可见元素来表达可交互区域。`;
    }
    return `围绕“${source}”，需要先给出直接回答，再拆成若干可视化模块。每个模块应对应一个真实概念、对象、步骤或区域，并在详情中说明机制、影响、例子和注意事项。`;
  }

  function auditHotspotHitTest(hotspots) {
    const results = (hotspots || []).map((hotspot) => {
      const center = {
        x: Number(hotspot.x) + Number(hotspot.width) / 2,
        y: Number(hotspot.y) + Number(hotspot.height) / 2
      };
      const samples = buildHotspotSamplePoints(hotspot);
      const clickable = samples
        .map((point) => ({ point, top: getTopHotspotAtPoint(point, hotspots) }))
        .find((item) => item.top && item.top.id === hotspot.id);
      const centerTop = getTopHotspotAtPoint(center, hotspots);
      return {
        moduleId: hotspot.id,
        ok: Boolean(clickable),
        topModuleId: clickable && clickable.top ? clickable.top.id : centerTop ? centerTop.id : "",
        center,
        clickablePoint: clickable ? clickable.point : null
      };
    });
    return {
      ok: results.every((item) => item.ok),
      modules: results
    };
  }

  function repairHotspotHitTargets(hotspots) {
    const list = Array.isArray(hotspots) ? hotspots : [];
    const adjustments = [];
    let hitTest = auditHotspotHitTest(list);
    const maxPasses = Math.max(1, list.length * 2);
    for (let pass = 0; pass < maxPasses && !hitTest.ok; pass += 1) {
      let changed = false;
      const byId = new Map(list.map((hotspot) => [hotspot.id, hotspot]));
      for (const item of hitTest.modules || []) {
        if (item.ok || !item.topModuleId || item.topModuleId === item.moduleId) continue;
        const target = byId.get(item.moduleId);
        const blocker = byId.get(item.topModuleId);
        if (!target || !blocker) continue;
        const targetArea = hotspotArea(target);
        const blockerArea = hotspotArea(blocker);
        if (!targetArea || !blockerArea || targetArea > blockerArea * 0.92) continue;
        const oldZ = Number(target.zIndex || 0);
        const nextZ = Math.max(oldZ + 1, Number(blocker.zIndex || 0) + 1);
        target.zIndex = nextZ;
        target.clickDiagnostics = [
          ...(Array.isArray(target.clickDiagnostics) ? target.clickDiagnostics : []),
          `raised above ${blocker.id} after hit-test overlap`
        ];
        adjustments.push({
          moduleId: target.id,
          from: oldZ,
          to: nextZ,
          blockerId: blocker.id,
          reason: "smaller hotspot covered by larger hotspot"
        });
        changed = true;
      }
      if (!changed) break;
      hitTest = auditHotspotHitTest(list);
    }
    return { hitTest, adjustments };
  }

  function hotspotArea(hotspot) {
    return Math.max(0, Number(hotspot && hotspot.width) || 0) * Math.max(0, Number(hotspot && hotspot.height) || 0);
  }

  function buildHotspotSamplePoints(hotspot) {
    const x = Number(hotspot.x);
    const y = Number(hotspot.y);
    const width = Number(hotspot.width);
    const height = Number(hotspot.height);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height)) return [];
    const ratios = [
      [0.5, 0.5],
      [0.18, 0.18],
      [0.82, 0.18],
      [0.18, 0.82],
      [0.82, 0.82],
      [0.5, 0.18],
      [0.5, 0.82],
      [0.18, 0.5],
      [0.82, 0.5]
    ];
    return ratios.map(([rx, ry]) => ({
      x: x + width * rx,
      y: y + height * ry
    }));
  }

  function getTopHotspotAtPoint(point, hotspots) {
    const covering = (hotspots || [])
      .map((candidate, index) => ({ candidate, index }))
      .filter((item) => pointInHotspotBounds(point, item.candidate))
      .sort((a, b) => {
        const zDiff = Number(b.candidate.zIndex || 0) - Number(a.candidate.zIndex || 0);
        return zDiff || b.index - a.index;
      });
    return covering[0] ? covering[0].candidate : null;
  }

  function pointInHotspotBounds(point, hotspot) {
    return (
      point.x >= Number(hotspot.x) &&
      point.x <= Number(hotspot.x) + Number(hotspot.width) &&
      point.y >= Number(hotspot.y) &&
      point.y <= Number(hotspot.y) + Number(hotspot.height)
    );
  }

  function syncLayoutBoundsToHotspots(layout, hotspots) {
    if (!layout || !Array.isArray(layout.regions) || !Array.isArray(hotspots)) return layout;
    const byId = new Map(hotspots.map((hotspot) => [hotspot.id, hotspot]));
    return {
      ...layout,
      clickBoundsSource: "hotspot-derived",
      regions: layout.regions.map((region) => {
        if (!region || !region.hotspotId || !byId.has(region.hotspotId)) return region;
        const hotspot = byId.get(region.hotspotId);
        return {
          ...region,
          bounds: {
            x: Number(hotspot.x),
            y: Number(hotspot.y),
            width: Number(hotspot.width),
            height: Number(hotspot.height)
          },
          clickBoundsSource: "hotspot-derived"
        };
      })
    };
  }

  function buildLimitedVisualQualityAudit({ question, visualSpec, hotspots, hitTest }) {
    const warnings = [];
    const title = String((visualSpec && visualSpec.title) || "");
    const rawQuestion = String(question || "");
    if (looksLikeQuestionLeak(title, rawQuestion)) warnings.push("title_may_be_raw_question");
    const modules = Array.isArray(visualSpec && visualSpec.modules) ? visualSpec.modules : [];
    const auxiliaryModules = Array.isArray(visualSpec && visualSpec.auxiliaryModules) ? visualSpec.auxiliaryModules : [];
    const expectedHotspots = modules.length + auxiliaryModules.length;
    if ((hotspots || []).length < expectedHotspots) warnings.push("hotspot_count_below_module_count");
    if (hitTest && hitTest.ok === false) warnings.push("hotspot_center_hit_test_failed");
    const visualMode = String((visualSpec && visualSpec.visualMode) || "").toLowerCase();
    const semanticVisual = ["map", "scene", "poster"].includes(visualMode);
    const maskCoverage =
      (hotspots || []).filter((hotspot) => hotspot.mask && Array.isArray(hotspot.mask.polygon) && hotspot.mask.polygon.length >= 3)
        .length / Math.max(1, (hotspots || []).length);
    if (semanticVisual && maskCoverage < 0.5) warnings.push("semantic_mask_coverage_low");
    return {
      provider: "limited-local",
      ok: warnings.length === 0,
      title,
      moduleCount: expectedHotspots,
      hotspotCount: (hotspots || []).length,
      maskCoverage: Number(maskCoverage.toFixed(3)),
      hitTestOk: Boolean(hitTest && hitTest.ok),
      warnings
    };
  }

  function looksLikeQuestionLeak(title, question) {
    const source = String(title || "").trim();
    const raw = String(question || "").trim();
    if (!source || !raw) return false;
    if (/^(请|帮我|给我|为|生成|画|画一张|设计|解释|说明|分析|对比|介绍|draw|generate|create|make|design|explain)/i.test(source)) {
      return true;
    }
    const compactTitle = source.replace(/\s+/g, "").replace(/[，。！？、；：,.!?;:]/g, "").toLowerCase();
    const compactQuestion = raw.replace(/\s+/g, "").replace(/[，。！？、；：,.!?;:]/g, "").toLowerCase();
    return compactQuestion.length >= 8 && compactTitle.includes(compactQuestion.slice(0, Math.min(16, compactQuestion.length)));
  }

  function createLayoutPlanner({ layoutModel, uid }) {
    return {
      create(spec) {
        return layoutModel.createLayout(spec, { uid });
      }
    };
  }

  function createImageProvider({ shouldUseApi, apiPost, getRuntimeConfig, providerConfig, layoutModel, mockSvg, sleep }) {
    return {
      async generate(spec, layout) {
        if (await shouldUseApi()) {
          const runtimeConfig = getRuntimeConfig ? await getRuntimeConfig() : null;
          const prompt =
            typeof layoutModel.buildApiImagePrompt === "function"
              ? layoutModel.buildApiImagePrompt(spec, layout)
              : layoutModel.buildStyleImagePrompt(spec, layout);
          const apiSize = (runtimeConfig && runtimeConfig.imageApiSize) || `${layout.canvas.width}x${layout.canvas.height}`;
          try {
            const image = await apiPost(providerConfig.endpoints.imageGeneration, {
              prompt,
              size: apiSize,
              model: null
            });
            return { ...image, prompt, usedApi: true };
          } catch (error) {
            if (providerConfig.mode === "api") throw error;
          }
        }
        await sleep(520);
        const svg = mockSvg.renderSvg(spec, layout);
        const prompt = layoutModel.buildImagePrompt(spec, layout);
        return {
          imageUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
          width: layout.canvas.width,
          height: layout.canvas.height,
          providerRaw: { provider: "mock-svg", replaceWith: providerConfig.endpoints.imageGeneration },
          prompt,
          usedApi: false
        };
      }
    };
  }

  function createAlignmentProvider({ shouldUseApi, apiPost, getRuntimeConfig, providerConfig, alignmentModel, sleep }) {
    return {
      async requireReadyForApiImage() {
        if (!(await shouldUseApi())) return;
        if (!getRuntimeConfig) return;
        const runtimeConfig = await getRuntimeConfig();
        if (runtimeConfig && runtimeConfig.visionApiAvailable === false) {
          throw new Error("真实生图热点对齐需要配置 CHATIMAGE_VISION_ENDPOINT；当前普通文本接口不能读取图片。");
        }
      },

      async align({ image, spec, layout }) {
        if (!(await shouldUseApi()) || !image.usedApi) {
          await sleep(0);
          return {
            layout,
            alignmentRaw: {
              provider: "mock-alignment",
              skipped: true,
              reason: image.usedApi ? "api-disabled" : "mock-image"
            }
          };
        }
        const imageDimensions = alignmentModel.assertImageDimensions(image.width, image.height);
        const prompt = alignmentModel.buildAlignmentPrompt({
          imageUrl: image.imageUrl,
          imageWidth: imageDimensions.width,
          imageHeight: imageDimensions.height,
          spec,
          layout
        });
        const data = await apiPost(providerConfig.endpoints.visionAlignment, {
          purpose: "vision_align",
          responseFormat: "json",
          imageUrl: image.imageUrl,
          imageWidth: imageDimensions.width,
          imageHeight: imageDimensions.height,
          visualMode: spec.visualMode || "infographic",
          modules: getAlignableModules(spec, alignmentModel).map((module, index) => ({
            moduleId: module.id,
            label: module.title,
            order: index + 1,
            visualMode: spec.visualMode || "infographic",
            text: module.imageText,
            regionKind: module.regionKind || "card",
            regionPrompt: module.regionPrompt || module.title,
            visualEvidence: module.visualEvidence || [],
            maskPolicy: module.maskPolicy || "",
            spatialHint: module.spatialHint || "",
            locatorQueries: module.locatorQueries || [],
            componentHints: module.componentHints || [],
            components: module.components || [],
            detail: module.detail || "",
            sourceExcerpt: module.sourceExcerpt || ""
          })),
          content: prompt
        });
        let parsed;
        try {
          parsed = alignmentModel.parseAlignmentResponse(data.content, getAlignableModules(spec, alignmentModel));
        } catch (error) {
          error.alignmentRaw = {
            provider: "vision-api-align",
            imageUrl: image.imageUrl,
            imageWidth: imageDimensions.width,
            imageHeight: imageDimensions.height,
            moduleCount: getAlignableModules(spec, alignmentModel).length,
            prompt,
            response: data.content,
            error: error.message || String(error)
          };
          throw error;
        }
        let alignedLayout;
        try {
          alignedLayout = alignmentModel.applyAlignmentsToLayout(layout, parsed.alignments);
        } catch (error) {
          error.alignmentRaw = {
            provider: "vision-api-align",
            imageUrl: image.imageUrl,
            imageWidth: imageDimensions.width,
            imageHeight: imageDimensions.height,
            moduleCount: getAlignableModules(spec, alignmentModel).length,
            prompt,
            response: data.content,
            alignments: parsed.alignments,
            layoutError: error.message || String(error),
            layoutAlignment: error.alignment || null
          };
          throw error;
        }
        return {
          layout: alignedLayout,
          alignmentRaw: {
            provider: "vision-api-align",
            imageUrl: image.imageUrl,
            imageWidth: imageDimensions.width,
            imageHeight: imageDimensions.height,
            moduleCount: getAlignableModules(spec, alignmentModel).length,
            prompt,
            response: data.content,
            alignments: parsed.alignments,
            layoutProvider: alignedLayout.alignment && alignedLayout.alignment.provider,
            acceptedModules: (alignedLayout.alignment && alignedLayout.alignment.acceptedModules) || [],
            rejectedModules: (alignedLayout.alignment && alignedLayout.alignment.rejectedModules) || [],
            originalValidationErrors: (alignedLayout.alignment && alignedLayout.alignment.originalValidationErrors) || []
          }
        };
      }
    };
  }

  function createAlignmentProviderV2({ shouldUseApi, apiPost, getRuntimeConfig, providerConfig, alignmentModel, sleep }) {
    return {
      async requireReadyForApiImage() {
        if (!(await shouldUseApi())) return;
        if (!getRuntimeConfig) return;
        const runtimeConfig = await getRuntimeConfig();
        if (runtimeConfig && runtimeConfig.visionApiAvailable === false) {
          if (runtimeConfig.visionMode === "locateanything") {
            throw new Error("LocateAnything 热点定位需要配置 CHATIMAGE_LOCATEANYTHING_LICENSE_ACK=research-evaluation，并确保 conda 环境 chatimage 中 CUDA 可用。");
          }
          throw new Error("真实生图热点对齐需要配置可用的视觉定位 provider；当前普通文本接口不能读取图片。");
        }
      },

      async align({ image, spec, layout }) {
        if (!(await shouldUseApi()) || !image.usedApi) {
          await sleep(0);
          return {
            layout,
            alignmentRaw: {
              provider: "mock-alignment",
              skipped: true,
              reason: image.usedApi ? "api-disabled" : "mock-image"
            }
          };
        }
        const imageDimensions = alignmentModel.assertImageDimensions(image.width, image.height);
        const prompt = alignmentModel.buildAlignmentPrompt({
          imageUrl: image.imageUrl,
          imageWidth: imageDimensions.width,
          imageHeight: imageDimensions.height,
          spec,
          layout
        });
        const data = await apiPost(providerConfig.endpoints.visionAlignment, {
          purpose: "vision_align",
          responseFormat: "json",
          imageUrl: image.imageUrl,
          imageWidth: imageDimensions.width,
          imageHeight: imageDimensions.height,
          visualMode: spec.visualMode || "infographic",
          modules: getAlignableModules(spec, alignmentModel).map((module, index) => ({
            moduleId: module.id,
            label: module.title,
            order: index + 1,
            visualMode: spec.visualMode || "infographic",
            text: module.imageText,
            regionKind: module.regionKind || "card",
            regionPrompt: module.regionPrompt || module.title,
            visualEvidence: module.visualEvidence || [],
            maskPolicy: module.maskPolicy || "",
            spatialHint: module.spatialHint || "",
            locatorQueries: module.locatorQueries || [],
            componentHints: module.componentHints || [],
            components: module.components || [],
            detail: module.detail || "",
            sourceExcerpt: module.sourceExcerpt || "",
            plannedBounds: findPlannedBounds(layout, module.id)
          })),
          content: prompt
        });
        let parsed;
        let rawParsed = null;
        try {
          parsed = alignmentModel.parseAlignmentResponse(data.content, getAlignableModules(spec, alignmentModel));
          rawParsed = alignmentModel.parseJsonFromText(data.content);
        } catch (error) {
          error.alignmentRaw = {
            provider: "vision-api-align",
            imageUrl: image.imageUrl,
            imageWidth: imageDimensions.width,
            imageHeight: imageDimensions.height,
            moduleCount: getAlignableModules(spec, alignmentModel).length,
            prompt,
            response: data.content,
            error: error.message || String(error)
          };
          throw error;
        }
        let alignedLayout;
        try {
          alignedLayout = alignmentModel.applyAlignmentsToLayout(layout, parsed.alignments);
        } catch (error) {
          error.alignmentRaw = {
            provider: (rawParsed && rawParsed.provider) || "vision-api-align",
            imageUrl: image.imageUrl,
            imageWidth: imageDimensions.width,
            imageHeight: imageDimensions.height,
            moduleCount: getAlignableModules(spec, alignmentModel).length,
            prompt,
            response: data.content,
            alignments: parsed.alignments,
            providerChain: (rawParsed && rawParsed.providerChain) || [],
            effectiveProvider: (rawParsed && rawParsed.effectiveProvider) || "",
            sourceCounts: (rawParsed && rawParsed.sourceCounts) || {},
            locateAnythingRaw: rawParsed && rawParsed.locateAnythingRaw ? rawParsed.locateAnythingRaw : null,
            sam3Raw: rawParsed && rawParsed.sam3Raw ? rawParsed.sam3Raw : null,
            fallbackModules: (rawParsed && rawParsed.fallbackModules) || [],
            acceptedLocateAnythingModules: (rawParsed && rawParsed.acceptedLocateAnythingModules) || [],
            acceptedLocalOcrModules: (rawParsed && rawParsed.acceptedLocalOcrModules) || [],
            acceptedSam3Modules: (rawParsed && rawParsed.acceptedSam3Modules) || [],
            rejectedSam3Modules: (rawParsed && rawParsed.rejectedSam3Modules) || [],
            warnings: (rawParsed && rawParsed.warnings) || [],
            layoutError: error.message || String(error),
            layoutAlignment: error.alignment || null
          };
          throw error;
        }
        return {
          layout: alignedLayout,
          alignmentRaw: {
            provider: (rawParsed && rawParsed.provider) || "vision-api-align",
            imageUrl: image.imageUrl,
            imageWidth: imageDimensions.width,
            imageHeight: imageDimensions.height,
            moduleCount: getAlignableModules(spec, alignmentModel).length,
            prompt,
            response: data.content,
            alignments: parsed.alignments,
            providerChain: (rawParsed && rawParsed.providerChain) || [],
            effectiveProvider: (rawParsed && rawParsed.effectiveProvider) || "",
            sourceCounts: (rawParsed && rawParsed.sourceCounts) || {},
            locateAnythingRaw: rawParsed && rawParsed.locateAnythingRaw ? rawParsed.locateAnythingRaw : null,
            sam3Raw: rawParsed && rawParsed.sam3Raw ? rawParsed.sam3Raw : null,
            fallbackModules: (rawParsed && rawParsed.fallbackModules) || [],
            acceptedLocateAnythingModules: (rawParsed && rawParsed.acceptedLocateAnythingModules) || [],
            acceptedLocalOcrModules: (rawParsed && rawParsed.acceptedLocalOcrModules) || [],
            acceptedSam3Modules: (rawParsed && rawParsed.acceptedSam3Modules) || [],
            rejectedSam3Modules: (rawParsed && rawParsed.rejectedSam3Modules) || [],
            warnings: (rawParsed && rawParsed.warnings) || [],
            layoutProvider: alignedLayout.alignment && alignedLayout.alignment.provider,
            acceptedModules: (alignedLayout.alignment && alignedLayout.alignment.acceptedModules) || [],
            rejectedModules: (alignedLayout.alignment && alignedLayout.alignment.rejectedModules) || [],
            originalValidationErrors: (alignedLayout.alignment && alignedLayout.alignment.originalValidationErrors) || [],
            displayDiagnostics: buildDisplayDiagnostics(image, alignedLayout)
          }
        };
      }
    };
  }

  function findPlannedBounds(layout, hotspotId) {
    const region = layout && Array.isArray(layout.regions)
      ? layout.regions.find((item) => item.hotspotId === hotspotId)
      : null;
    return region && region.bounds ? region.bounds : null;
  }

  function getAlignableModules(spec, alignmentModel) {
    if (alignmentModel && typeof alignmentModel.getAlignableModules === "function") {
      return alignmentModel.getAlignableModules(spec);
    }
    if (alignmentModel && typeof alignmentModel.getInteractiveModules === "function") {
      return alignmentModel.getInteractiveModules(spec);
    }
    return (spec && spec.modules) || [];
  }

  function buildDisplayDiagnostics(image, layout) {
    return {
      imageWidth: image.width,
      imageHeight: image.height,
      moduleRegions: (layout.regions || [])
        .filter((region) => region.hotspotId)
        .map((region) => ({
          hotspotId: region.hotspotId,
          alignedBy: region.alignedBy || "planned",
          bounds: region.bounds,
          mask: summarizeMask(region.mask)
        }))
    };
  }

  function summarizeMask(mask) {
    if (!mask || typeof mask !== "object") return null;
    return {
      provider: mask.provider || "",
      score: mask.score,
      bounds: mask.bounds || null,
      inputBounds: mask.inputBounds || null,
      maskPixels: mask.maskPixels,
      polygon: Array.isArray(mask.polygon) ? mask.polygon : [],
      strategy: mask.strategy || "",
      hasImage: Boolean(mask.image),
      hasCutoutImage: Boolean(mask.cutoutImage)
    };
  }

  function stripLargeDataUrls(value) {
    if (typeof value === "string") {
      if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(value) && value.length > 160) {
        return `[data-url omitted:${value.length}]`;
      }
      return value;
    }
    if (Array.isArray(value)) return value.map(stripLargeDataUrls);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, stripLargeDataUrls(item)]));
  }

  function createFollowupProvider({ shouldUseApi, apiPost, providerConfig, sleep }) {
    return {
      async ask(context) {
        if (await shouldUseApi()) {
          const data = await apiPost(providerConfig.endpoints.textGeneration, {
            purpose: "hotspot_followup",
            content: buildFollowupPrompt(context)
          });
          return data.content;
        }
        await sleep(360);
        const focus = context.currentHotspot.label;
        const previousCount = context.threadMessages.length;
        return `针对“${focus}”这个区域，可以这样理解：${context.currentHotspot.detail} 你的追问是“${context.userQuestion}”。在真实 API 接入后，这里会把原始问题、原始回答、当前热点详情和该分支的 ${previousCount} 条历史消息一起传给 LLM。`;
      }
    };
  }

  function buildFollowupPrompt(context) {
    const siblingSummary = context.siblingHotspots
      .map((item) => `- ${item.label}: ${item.shortText}`)
      .join("\n");
    const history = buildCompactThreadHistory(context.threadMessages);
    return [
      "你是 ChatImage 的区域追问助手。回答必须优先围绕当前热点区域，不要混入其他热点的历史。",
      `原始问题：${context.originalQuestion}`,
      `原始回答：${clipContextText(context.rawAnswer, 2200)}`,
      `图片标题：${context.chatImageTitle}`,
      `图片摘要：${context.chatImageSummary}`,
      `当前热点：${context.currentHotspot.label}`,
      `当前热点短文本：${context.currentHotspot.shortText}`,
      `当前热点详情：${context.currentHotspot.detail}`,
      context.currentHotspot.sourceExcerpt ? `原文片段：${context.currentHotspot.sourceExcerpt}` : "",
      siblingSummary ? `其他热点概览：\n${siblingSummary}` : "",
      history ? `当前热点对话历史：\n${history}` : "",
      `用户追问：${context.userQuestion}`
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  function buildCompactThreadHistory(messages, options) {
    const config = Object.assign(
      {
        recentLimit: 8,
        perMessageMaxChars: 420,
        totalMaxChars: 2400
      },
      options || {}
    );
    const list = Array.isArray(messages) ? messages : [];
    const recentLimit = Math.max(1, config.recentLimit);
    const omittedCount = Math.max(0, list.length - recentLimit);
    const recentMessages = list.slice(-recentLimit);
    const historyBody = recentMessages
      .map((message) => {
        const role = message && message.role ? message.role : "message";
        const content = clipContextText(summarizeThreadMessageContent(message && message.content), config.perMessageMaxChars);
        return `${role}: ${content}`;
      })
      .join("\n");

    if (!historyBody) return "";
    if (!omittedCount) return clipContextTail(historyBody, config.totalMaxChars);

    const omittedLine = `[已省略 ${omittedCount} 条更早消息]`;
    const bodyBudget = Math.max(80, config.totalMaxChars - omittedLine.length - 1);
    return `${omittedLine}\n${clipContextTail(historyBody, bodyBudget)}`;
  }

  function clipContextText(value, maxChars) {
    const source = String(value || "").trim();
    if (source.length <= maxChars) return source;
    return `${source.slice(0, maxChars - 12)}\n...[已截断]`;
  }

  function clipContextTail(value, maxChars) {
    const source = String(value || "").trim();
    if (source.length <= maxChars) return source;
    const marker = "[已截断早期历史]\n";
    const bodyBudget = Math.max(0, maxChars - marker.length);
    return `${marker}${source.slice(source.length - bodyBudget)}`;
  }

  function summarizeThreadMessageContent(content) {
    const artifact = parseSerializedFollowupArtifact(content);
    if (!artifact) return content;
    return [
      `[followup image: ${artifact.title || ""}]`,
      artifact.question ? `question: ${artifact.question}` : "",
      artifact.rawAnswer ? `answer: ${artifact.rawAnswer}` : ""
    ]
      .filter(Boolean)
      .join("\n");
  }

  function parseSerializedFollowupArtifact(content) {
    if (typeof content !== "string" || content.charCodeAt(0) !== 123) return null;
    try {
      const parsed = JSON.parse(content);
      if (!parsed || parsed.type !== "chatimage.followup.image" || parsed.version !== 1) return null;
      return parsed.artifact && typeof parsed.artifact === "object" ? parsed.artifact : null;
    } catch {
      return null;
    }
  }

  async function createStaticFollowupArtifact({
    uid,
    answer,
    context,
    message,
    structureProvider,
    layoutPlanner,
    layoutModel,
    imageProvider,
    onStatus
  }) {
    const status = typeof onStatus === "function" ? onStatus : () => {};
    status("structuring");
    const visualQuestion = buildFollowupVisualQuestion(context, message);
    const spec =
      structureProvider && typeof structureProvider.parse === "function"
        ? await structureProvider.parse(visualQuestion, answer)
        : buildStaticFollowupSpec(context, message, answer);

    status("layout");
    const layout = layoutPlanner.create(spec);
    const visualSpec = layoutModel.applyTextBudgets(spec, layout);

    status("image");
    const image = await imageProvider.generate(visualSpec, layout);
    const imagePrompt = image.prompt || layoutModel.buildImagePrompt(visualSpec, layout);

    return {
      id: uid("followup_image"),
      interactive: false,
      question: message,
      rawAnswer: answer,
      title: visualSpec.title,
      summary: visualSpec.summary,
      structuredSpec: visualSpec,
      layout,
      hotspots: [],
      imageUrl: image.imageUrl,
      imageWidth: image.width,
      imageHeight: image.height,
      imagePrompt,
      providerRaw: image.providerRaw,
      createdAt: new Date().toISOString(),
      process: [
        { label: "限定上下文", detail: `围绕“${context.currentHotspot.label}”回答，不继承新的可点击分支。` },
        { label: "生成文本回答", detail: "先生成区域追问的完整文本答案，作为图片的信息源。" },
        { label: "结构化为视觉稿", detail: "将答案拆成标题、摘要、模块、层级和构图说明。" },
        { label: "生成静态图片", detail: "输出图片结果，但不添加 hotspot、不做区域对齐。" }
      ]
    };
  }

  function buildFollowupVisualQuestion(context, message) {
    return [
      `原始问题：${context.originalQuestion}`,
      `当前图片：${context.chatImageTitle}`,
      `当前区域：${context.currentHotspot.label}`,
      `区域说明：${context.currentHotspot.detail}`,
      `用户追问：${message}`,
      "请把回答组织成一张静态信息图，聚焦当前区域，不生成新的可点击分支。"
    ].join("\n");
  }

  function buildStaticFollowupSpec(context, message, answer) {
    return {
      title: context.currentHotspot.label || message.slice(0, 18) || "追问结果",
      summary: message,
      relationType: "flow",
      visualComposition: {
        compositionType: "annotated-clusters",
        visualFocus: context.currentHotspot.label,
        primaryModules: ["module_1"],
        secondaryModules: ["module_2", "module_3"],
        densityStrategy: "用多层级短文本承载追问答案，避免继续产生交互分支。"
      },
      modules: splitAnswerIntoModules(answer).map((text, index) => ({
        id: `module_${index + 1}`,
        title: index === 0 ? "核心判断" : index === 1 ? "关键依据" : index === 2 ? "执行建议" : `要点 ${index + 1}`,
        imageText: text.slice(0, 28),
        detail: text,
        sourceExcerpt: text.slice(0, 80),
        iconHint: index === 0 ? "target" : index === 1 ? "nodes" : "step",
        priority: index + 1
      }))
    };
  }

  function splitAnswerIntoModules(answer) {
    const source = String(answer || "").trim();
    const sentences = source.match(/[^。！？!?]+[。！？!?]?/g) || [source || "追问回答"];
    const chunks = [];
    let buffer = "";
    for (const sentence of sentences.map((item) => item.trim()).filter(Boolean)) {
      if (buffer && `${buffer}${sentence}`.length > 110) {
        chunks.push(buffer);
        buffer = sentence;
      } else {
        buffer += sentence;
      }
    }
    if (buffer) chunks.push(buffer);
    while (chunks.length < 3) chunks.push(source || "追问回答");
    return chunks.slice(0, 5);
  }

  function createPersistence({ shouldUseApi, apiPost, apiGet, apiPatch, apiDelete, providerConfig }) {
    return {
      async saveResult(result) {
        if (!(await shouldUseApi())) return;
        await apiPost(providerConfig.endpoints.chatImages, result);
      },

      async saveThread(chatImageId, hotspotId, thread) {
        if (!(await shouldUseApi())) return;
        await apiPost(
          `${providerConfig.endpoints.chatImages}/${encodeURIComponent(chatImageId)}/hotspots/${encodeURIComponent(
            hotspotId
          )}/messages`,
          { thread }
        );
      },

      async loadHistory() {
        if (!(await shouldUseApi())) return [];
        const data = await apiGet(providerConfig.endpoints.chatImages);
        return data.items || [];
      },

      async loadResult(chatImageId) {
        if (!(await shouldUseApi())) return null;
        const data = await apiGet(`${providerConfig.endpoints.chatImages}/${encodeURIComponent(chatImageId)}`);
        return data.result || null;
      },

      async updateHistoryItem(chatImageId, patch) {
        if (!(await shouldUseApi()) || !apiPatch) return null;
        const data = await apiPatch(`${providerConfig.endpoints.chatImages}/${encodeURIComponent(chatImageId)}`, patch);
        return data.item || null;
      },

      async deleteHistoryItem(chatImageId) {
        if (!(await shouldUseApi()) || !apiDelete) return false;
        const data = await apiDelete(`${providerConfig.endpoints.chatImages}/${encodeURIComponent(chatImageId)}`);
        return Boolean(data.deleted);
      }
    };
  }

  function createChatImageService({
    uid,
    sleep,
    state,
    stateModel,
    threadModel,
    layoutModel,
    persistence,
    answerStructureProvider,
    llmProvider,
    structureProvider,
    layoutPlanner,
    imageProvider,
    alignmentProvider,
    followupProvider
  }) {
    return {
      async create(question, onStatus, options = {}) {
        const displayQuestion = options.displayQuestion || question;
        onStatus("answering");
        let rawAnswer;
        let spec;

        if (answerStructureProvider) {
          const combined = await answerStructureProvider.create(question);
          rawAnswer = combined.rawAnswer;
          spec = combined.visualSpec;
          spec.textModelUsed = combined.textModelUsed || spec.textModelUsed || "";
          spec.textModelFallbackReason = combined.textModelFallbackReason || spec.textModelFallbackReason || "";
        } else {
          rawAnswer = await llmProvider.answer(question);
          onStatus("structuring");
          spec = await structureProvider.parse(question, rawAnswer);
        }

        if (answerStructureProvider) {
          onStatus("structuring");
        }

        onStatus("layout");
        await sleep(220);
        const layout = layoutPlanner.create(spec);
        const visualSpec = layoutModel.applyTextBudgets(spec, layout);

        if (alignmentProvider.requireReadyForApiImage) {
          await alignmentProvider.requireReadyForApiImage();
        }

        onStatus("image");
        const image = await imageProvider.generate(visualSpec, layout);
        const imagePrompt = image.prompt || layoutModel.buildImagePrompt(visualSpec, layout);

        onStatus("align");
        let alignment;
        try {
          alignment = await alignmentProvider.align({ image, spec: visualSpec, layout });
        } catch (error) {
          alignment = {
            layout,
            alignmentRaw: {
              provider: "alignment-fallback",
              fallback: "planned-layout",
              error: error.message || String(error),
              previous: error.alignmentRaw || null
            }
          };
        }
        const finalLayout = alignment.layout;
        const hotspots = layoutModel.deriveHotspots(
          typeof layoutModel.getInteractiveModules === "function"
            ? layoutModel.getInteractiveModules(visualSpec)
            : visualSpec.modules,
          finalLayout
        );
        const hitRepair = repairHotspotHitTargets(hotspots);
        const clickLayout = syncLayoutBoundsToHotspots(finalLayout, hotspots);
        const hitTest = hitRepair.hitTest;
        const visualQualityRaw = buildLimitedVisualQualityAudit({
          question,
          visualSpec,
          hotspots,
          hitTest
        });
        const visualQualityWarnings = visualQualityRaw.warnings || [];
        const qualityWarnings = Array.isArray(visualSpec.qualityWarnings) ? visualSpec.qualityWarnings : [];
        const alignmentRaw = stripLargeDataUrls({
          ...(alignment.alignmentRaw || {}),
          hitTest,
          visualQa: visualQualityRaw,
          zIndexAdjustments: hotspots
            .filter((hotspot) => Array.isArray(hotspot.clickDiagnostics) && hotspot.clickDiagnostics.length)
            .map((hotspot) => ({ moduleId: hotspot.id, diagnostics: hotspot.clickDiagnostics, zIndex: hotspot.zIndex })),
          zIndexRepair: hitRepair.adjustments,
          qualityWarnings
        });

        const result = {
          id: uid("ci"),
          question: displayQuestion,
          sourcePrompt: question,
          rawAnswer,
          structuredSpec: visualSpec,
          title: visualSpec.title,
          summary: visualSpec.summary,
          layout: clickLayout,
          hotspots,
          threads: [],
          imageUrl: image.imageUrl,
          imageWidth: image.width,
          imageHeight: image.height,
          createdAt: new Date().toISOString(),
          providerRaw: image.providerRaw,
          alignmentRaw,
          visualQualityRaw,
          visualQualityWarnings,
          imagePrompt
        };
        if (visualSpec.textModelUsed) result.textModelUsed = visualSpec.textModelUsed;
        if (visualSpec.textModelFallbackReason) result.textModelFallbackReason = visualSpec.textModelFallbackReason;
        await persistence.saveResult(result);
        return result;
      },

      async followup(result, hotspotId, message, onStatus) {
        const hotspot = result.hotspots.find((item) => item.id === hotspotId);
        if (!hotspot) {
          throw new Error("hotspot 不存在");
        }

        const currentThread = threadModel.createThread({
          uid,
          result,
          hotspotId,
          existingThread: stateModel.getThread(state, hotspotId)
        });
        const context = threadModel.createFollowupContext({
          result,
          hotspot,
          currentThread,
          userQuestion: message
        });

        const answer = await followupProvider.ask(context);
        const artifact = await createStaticFollowupArtifact({
          uid,
          answer,
          context,
          message,
          structureProvider,
          layoutPlanner,
          layoutModel,
          imageProvider,
          onStatus
        });
        const updatedThread = threadModel.appendFollowupArtifactMessages({
          uid,
          currentThread,
          userQuestion: message,
          artifact
        });
        stateModel.setThread(state, hotspotId, updatedThread);
        if (stateModel.setResultThread) {
          stateModel.setResultThread(state, updatedThread);
        }
        await persistence.saveThread(result.id, hotspotId, updatedThread);
        return updatedThread;
      }
    };
  }

  function createDefaultServices(deps) {
    const mockLlmProvider = createMockLlmProvider({ sleep: deps.sleep });
    const llmProvider = createLlmProvider({
      shouldUseApi: deps.shouldUseApi,
      apiPost: deps.apiPost,
      providerConfig: deps.providerConfig,
      mockLlmProvider
    });
    const structureProvider = createStructureProvider({
      shouldUseApi: deps.shouldUseApi,
      apiPost: deps.apiPost,
      providerConfig: deps.providerConfig,
      structureModel: deps.structureModel,
      sleep: deps.sleep
    });
    const answerStructureProvider = createAnswerStructureProvider({
      shouldUseApi: deps.shouldUseApi,
      apiPost: deps.apiPost,
      providerConfig: deps.providerConfig,
      structureModel: deps.structureModel,
      mockLlmProvider,
      sleep: deps.sleep
    });
    const layoutPlanner = createLayoutPlanner({
      layoutModel: deps.layoutModel,
      uid: deps.uid
    });
    const imageProvider = createImageProvider({
      shouldUseApi: deps.shouldUseApi,
      apiPost: deps.apiPost,
      getRuntimeConfig: deps.getRuntimeConfig,
      providerConfig: deps.providerConfig,
      layoutModel: deps.layoutModel,
      mockSvg: deps.mockSvg,
      sleep: deps.sleep
    });
    const alignmentProvider = createAlignmentProviderV2({
      shouldUseApi: deps.shouldUseApi,
      apiPost: deps.apiPost,
      providerConfig: deps.providerConfig,
      alignmentModel: deps.alignmentModel,
      getRuntimeConfig: deps.getRuntimeConfig,
      sleep: deps.sleep
    });
    const followupProvider = createFollowupProvider({
      shouldUseApi: deps.shouldUseApi,
      apiPost: deps.apiPost,
      providerConfig: deps.providerConfig,
      sleep: deps.sleep
    });
    const persistence = createPersistence({
      shouldUseApi: deps.shouldUseApi,
      apiPost: deps.apiPost,
      apiGet: deps.apiGet,
      apiPatch: deps.apiPatch,
      apiDelete: deps.apiDelete,
      providerConfig: deps.providerConfig
    });
    return {
      chatImageService: createChatImageService({
        uid: deps.uid,
        sleep: deps.sleep,
        state: deps.state,
        stateModel: deps.stateModel,
        threadModel: deps.threadModel,
        layoutModel: deps.layoutModel,
        persistence,
        answerStructureProvider,
        llmProvider,
        structureProvider,
        layoutPlanner,
        imageProvider,
        alignmentProvider,
        followupProvider
      }),
      alignmentProvider,
      answerStructureProvider,
      followupProvider,
      imageProvider,
      layoutPlanner,
      llmProvider,
      mockLlmProvider,
      persistence,
      structureProvider
    };
  }

  const api = {
    buildCompactThreadHistory,
    buildFollowupPrompt,
    buildFollowupVisualQuestion,
    buildStaticFollowupSpec,
    clipContextText,
    clipContextTail,
    createStaticFollowupArtifact,
    createChatImageService,
    createDefaultServices,
    createAlignmentProvider,
    createAnswerStructureProvider,
    createFollowupProvider,
    createImageProvider,
    createLayoutPlanner,
    createLlmProvider,
    createMockLlmProvider,
    createPersistence,
    createStructureProvider
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  global.ChatImageService = api;
})(typeof globalThis !== "undefined" ? globalThis : window);

