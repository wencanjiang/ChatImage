"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { createConfig, createServer } = require("../server");
const {
  connectCdp,
  findChrome,
  getFreePort,
  rmWithRetry,
  saveScreenshot,
  stopProcess,
  waitForWebSocketUrl
} = require("../tests/browser.test");

const CASES = [
  {
    id: "west-lake-tour-map",
    category: "map",
    extraInstruction:
      "Do not draw numeric markers, numbered pins, circled callout numbers, a right-side scenic spot list, a legend column, a sidebar panel, or a ranked landscape arrangement. Keep the map as one coherent hand-drawn landscape artwork.",
    question:
      "手绘一张西湖游览导览图，画在一张完整旅游地图上，不要流程图，不要给每块区域画分割边框。图中自然呈现湖面、白堤断桥、苏堤春晓、三潭印月、雷峰塔、孤山、宝石山、曲院风荷、柳浪闻莺，点击不同地理区域后解释风貌和游览价值。"
  },
  {
    id: "campus-handdrawn-map",
    category: "map",
    question:
      "手绘一张大学校园导览地图，画在一张完整校园地图上，不要流程图，不要把每块区域预先分割出来。图中自然包含教学楼、图书馆、食堂、宿舍区、操场、校门和主路线，点击区域后解释用途、位置关系和校园风貌。"
  },
  {
    id: "future-museum-scene",
    category: "scene",
    question:
      "画一个未来博物馆的沉浸式插画场景，不要卡片式流程图，不要区域分割边框。用户可以点击核心展品、观众动线、导览机器人和沉浸式屏幕来了解细节；导览机器人旁边保留一个短标签“AI 个性化导览”。"
  },
  {
    id: "boutique-coffee-scene",
    category: "scene",
    question:
      "画一个精品咖啡店的温暖插画场景，不要流程图，不要预先分割区域。画面中自然呈现吧台、手冲区、烘豆机、点单顾客、靠窗座位和甜品展示柜，点击不同对象后解释它们在空间体验和运营中的作用。"
  },
  {
    id: "smart-home-living-room",
    category: "scene",
    question:
      "画一个智能家居客厅的插画场景，不要流程图，不要区域分割边框。画面中自然呈现智能音箱、灯光系统、窗帘、电视中控、安防摄像头和空气传感器，点击不同设备后解释功能和交互关系。"
  },
  {
    id: "oauth2-flow",
    category: "technical",
    question:
      "解释 OAuth 2.0 授权码登录流程，覆盖用户、客户端应用、授权服务器、资源服务器、授权码、Access Token、Refresh Token 和 scope。生成清晰的技术流程图，点击每个环节后解释它的职责和安全边界。"
  },
  {
    id: "ecommerce-funnel",
    category: "business",
    question:
      "为电商网站设计转化漏斗分析图，覆盖流量来源、商品详情页、加购、结算、支付成功和复购。生成清晰商业分析图，点击每个阶段后解释关键指标、流失原因和优化动作。"
  },
  {
    id: "household-budget-plan",
    category: "business",
    question:
      "Create a visual monthly household budget plan for a young family. Cover income, fixed bills, groceries, transport, emergency savings, discretionary spending, and month-end review. Each region should be clickable and explain the role, risk, and practical action for that budget category."
  },
  {
    id: "weekly-meal-prep-plan",
    category: "business",
    question:
      "Design a weekly meal prep planning visual for a busy office worker. Include shopping list, batch cooking, protein base, vegetable prep, storage containers, weekday lunch assembly, and weekend reset. Each clickable area should explain what to prepare, why it matters, and one practical tip."
  },
  {
    id: "electric-toothbrush-comparison",
    category: "business",
    question:
      "Compare three electric toothbrush options for a first-time buyer. Visualize cleaning performance, battery life, brush head cost, pressure sensor, app features, noise, and best-fit user. Make each comparison area clickable with a concise buying explanation."
  },
  {
    id: "ielts-study-roadmap",
    category: "technical",
    question:
      "Create a 12-week IELTS study roadmap for a student targeting band 7.0. Cover diagnostic test, listening practice, reading strategy, writing task 1, writing task 2, speaking drills, mock exams, and weekly review. Each clickable stage should explain goals, routines, and common mistakes."
  },
  {
    id: "react-performance-debug-flow",
    category: "technical",
    question:
      "Explain how to debug a slow React page. Create a clear technical flow covering reproduce, measure with profiler, identify unnecessary renders, inspect network waterfalls, split bundles, memoize expensive work, and verify improvements. Each step should be clickable with concrete diagnostics."
  },
  {
    id: "interview-prep-plan",
    category: "business",
    question:
      "Create an interview preparation plan for a product manager candidate. Include company research, role requirements, product sense stories, metrics cases, behavioral examples, mock interview, questions for interviewer, and follow-up email. Each clickable area should explain the purpose and preparation output."
  },
  {
    id: "weekend-hangzhou-itinerary",
    category: "map",
    extraInstruction:
      "Avoid numbered pins and right-side ranked attraction lists. The image should feel like one coherent travel itinerary map with route lines and local labels, not a segmentation diagram.",
    question:
      "Create a weekend Hangzhou itinerary map for a first-time visitor. Naturally show West Lake, Hefang Street, Lingyin Temple, tea village, canal night walk, hotel area, and main walking or transit routes. Each clickable region should explain timing, atmosphere, and route relationship."
  },
  {
    id: "home-moving-checklist",
    category: "business",
    question:
      "Design a practical moving-home checklist visual. Cover sorting belongings, packing boxes, address changes, utility transfer, moving-day bag, room-by-room unpacking, cleaning, and first-week setup. Each clickable section should explain the task, timing, and common mistake to avoid."
  },
  {
    id: "morning-routine-plan",
    category: "scene",
    question:
      "画一个高效早晨日常的插画场景，不要流程图，不要预先分割区域。画面中自然呈现起床闹钟、晨间拉伸、温水补水、营养早餐、通勤准备和当日清单，点击不同对象后解释每个环节的健康价值和时间安排。"
  },
  {
    id: "weekly-fitness-plan",
    category: "business",
    question:
      "Design a weekly home fitness plan for a beginner. Cover warm-up, mobility, strength training, cardio intervals, core, flexibility, and rest day. Each clickable section should explain the goal, recommended duration, and one beginner-friendly tip."
  },
  {
    id: "healthy-breakfast-options",
    category: "scene",
    question:
      "画一组健康早餐选择的插画场景，不要流程图，不要分割边框。自然呈现燕麦碗、希腊酸奶杯、全麦三明治、水煮蛋拼盘、新鲜水果和黑咖啡，点击不同食物后解释营养构成与适用场景。"
  },
  {
    id: "japanese-ramen-cooking",
    category: "technical",
    question:
      "讲解一碗日式叉烧拉面的家常做法。生成清晰技术步骤图，覆盖高汤熬制、酱料调配、面条选择、叉烧准备、煮蛋时间、装碗摆盘和点睛香油。点击每一步骤后解释关键火候、配比和常见误区。"
  },
  {
    id: "personal-finance-roadmap",
    category: "business",
    question:
      "为一名 25 岁职场新人设计个人理财路线图，覆盖紧急储备金、债务清零、自动储蓄、低费率指数定投、保险配置、税务优化和长期目标。每个可点击区域解释具体目标比例、常见误区和实操动作。"
  },
  {
    id: "career-transition-plan",
    category: "business",
    question:
      "Design a 6-month career transition plan from software engineer to product manager. Cover skills audit, transferable strengths, side project, networking, certification, mock case prep, internal move attempt, and external interviews. Each clickable area should explain the focus, expected output, and risk."
  },
  {
    id: "newborn-care-day",
    category: "scene",
    question:
      "画一个新生儿一天日常护理的插画场景，不要流程图，不要分割边框。自然呈现夜间喂奶、换尿布、洗澡时刻、白噪音哄睡、肚子时间锻炼、消毒奶瓶和外出准备包，点击不同对象后解释新手父母的注意要点。"
  },
  {
    id: "dog-training-routine",
    category: "business",
    question:
      "Design a 4-week puppy training routine for a first-time owner. Cover name response, leash walking, sit and stay, crate comfort, socialization, basic recall, bite inhibition, and reward system. Each clickable stage should explain the technique, common mistake, and progression marker."
  },
  {
    id: "cat-litter-box-setup",
    category: "scene",
    question:
      "画一个理想的家用猫砂盆角落布置插画，不要流程图，不要分割边框。自然呈现敞口砂盆、围栏砂盆、清洁铲、备用砂袋、除臭设备、隐私屏风和饮水点，点击不同对象后解释为什么这样布置能减少行为问题。"
  },
  {
    id: "online-shopping-decision",
    category: "business",
    question:
      "设计一张在线购物理性决策图，覆盖需求确认、预算上限、参数对比、用户评价、退换政策、价格历史、配送时效和最终下单复盘。每个可点击区域解释关键判断标准、常见冲动陷阱和买后评估方法。"
  },
  {
    id: "running-marathon-prep",
    category: "business",
    question:
      "Create a 16-week half-marathon training plan for an intermediate runner. Cover base mileage, tempo runs, interval workouts, long runs, strength, nutrition, taper, and race-day strategy. Each clickable block should explain the purpose, pace target, and recovery cue."
  },
  {
    id: "yoga-flexibility-routine",
    category: "scene",
    question:
      "画一组瑜伽柔韧训练插画场景，不要流程图，不要分割边框。自然呈现猫牛伸展、下犬式、鸽子式、半月式、坐姿前屈、桥式和大休息姿势，点击不同姿势后解释主要拉伸部位和呼吸节奏。"
  },
  {
    id: "language-learning-routine",
    category: "business",
    question:
      "Design a daily 60-minute language learning routine for a self-learner. Cover vocabulary review, listening practice, shadowing, grammar focus, writing journal, speaking with a partner, and weekend culture immersion. Each clickable item should explain method, time allocation, and progress check."
  },
  {
    id: "coffee-brewing-methods",
    category: "technical",
    question:
      "Explain four popular home coffee brewing methods: pour-over, French press, AeroPress, and moka pot. Create a clear visual comparison covering grind size, water temperature, brew ratio, steep time, mouthfeel, and best-fit drinker. Each clickable method should explain trade-offs and one beginner tip."
  },
  {
    id: "git-conflict-resolution",
    category: "technical",
    question:
      "Explain how to resolve a Git merge conflict step by step. Create a clear technical flow covering detect conflict, inspect markers, choose strategy, edit the file, stage resolved version, continue the merge, and verify history. Each clickable step should explain the command and common pitfall."
  },
  {
    id: "sleep-hygiene-checklist",
    category: "scene",
    question:
      "画一个改善睡眠的卧室插画场景，不要流程图，不要分割边框。自然呈现遮光窗帘、稳定室温、降噪白噪音、暖光床头灯、纸质书架、远离床头的手机充电区和泡脚或冥想角落，点击不同对象后解释它们如何促进睡眠。"
  },
  {
    id: "freelance-onboarding-flow",
    category: "business",
    question:
      "Design a freelance client onboarding flow for a solo designer. Cover initial inquiry triage, scoping call, written proposal, deposit invoice, kickoff brief, milestone schedule, asset delivery, and post-project review. Each clickable stage should explain the document, timing, and risk to manage."
  },
  {
    id: "garden-balcony-layout",
    category: "scene",
    question:
      "画一个阳台小花园的插画布局场景，不要流程图，不要分割边框。自然呈现香草盆、矮番茄、垂吊绿植、可坐花架、滴灌系统、堆肥桶和工具收纳箱，点击不同对象后解释养护要点和空间利用思路。"
  },
  {
    id: "compact-home-office-desk",
    category: "scene",
    extraInstruction:
      "Do not make a flowchart, process board, numbered layout, sidebar list, or pre-cut segmentation image. Keep it as one coherent lived-in desk scene with natural objects.",
    question:
      "Create an illustrated compact home office desk setup for a remote worker in a small apartment. Naturally show a laptop stand, external monitor, notebook zone, task lamp, cable tray, plant, water bottle, headphones, and small storage drawer. Each clickable object should explain its ergonomic role, productivity benefit, and one practical setup tip."
  },
  {
    id: "capsule-wardrobe-flatlay",
    category: "scene",
    extraInstruction:
      "Do not draw a flowchart, grid diagram, numbered labels, or separated product cards. Make it a polished wardrobe flatlay scene with items arranged naturally on a bed or clothing rack.",
    question:
      "Create a capsule wardrobe planning visual for a first office job. Show a navy blazer, white shirt, knit top, dark jeans, tailored trousers, comfortable shoes, tote bag, belt, and accent scarf as one natural flatlay. Each clickable item should explain when to use it, what it pairs with, and why it earns a place in a small wardrobe."
  },
  {
    id: "family-emergency-kit",
    category: "scene",
    extraInstruction:
      "Do not create a checklist table or infographic cards. Draw the items gathered on a kitchen table or open storage bin so LocateAnything/SAM can isolate real objects.",
    question:
      "Create a household emergency kit illustration for a family. Naturally show bottled water, shelf-stable food, flashlight, power bank, first-aid pouch, medication bag, copies of documents, radio, cash envelope, and pet supplies. Each clickable item should explain why it matters, quantity guidance, and a common oversight."
  },
  {
    id: "smartphone-photography-corner",
    category: "scene",
    extraInstruction:
      "Avoid flowcharts, numbered badges, and comparison tables. Make the image a real small photography corner with visible props and lighting equipment.",
    question:
      "Create a smartphone product photography setup for someone selling handmade crafts online. Show a window light source, white foam board reflector, phone tripod, neutral backdrop, sample product, prop tray, cleaning cloth, and editing checklist notebook. Each clickable area should explain what it controls in the photo and a beginner mistake to avoid."
  },
  {
    id: "fridge-meal-prep-shelf",
    category: "scene",
    extraInstruction:
      "Do not make a weekly schedule or process diagram. Draw the inside of a fridge with real containers and food zones, no numbered markers.",
    question:
      "Create an organized fridge meal-prep shelf scene for a busy weekday routine. Naturally show cooked grain containers, protein boxes, washed greens, chopped vegetables, sauce jars, breakfast jars, snack box, and leftover label area. Each clickable zone should explain freshness logic, assembly use, and food-safety tip."
  },
  {
    id: "bike-commuter-maintenance",
    category: "scene",
    extraInstruction:
      "Do not draw a repair flowchart. Make it a garage-floor bike maintenance scene with tools and bike parts visible as separate natural objects.",
    question:
      "Create a commuter bicycle maintenance setup for a rainy city rider. Show tire pump, chain lube, rag, multitool, brake pads, spare tube, lights, helmet, and weatherproof pannier around the bike. Each clickable object should explain the maintenance check, frequency, and sign of trouble."
  },
  {
    id: "skincare-shelf-routine",
    category: "scene",
    extraInstruction:
      "Do not make a morning/evening flowchart. Draw a bathroom shelf with bottles, towel, mirror, and organizer tray as one coherent scene.",
    question:
      "Create a simple skincare shelf routine for a beginner with sensitive skin. Naturally show cleanser, moisturizer, sunscreen, gentle exfoliant, patch-test note, towel, mirror, and small organizer tray. Each clickable item should explain when to use it, what to avoid, and how it fits a low-irritation routine."
  },
  {
    id: "farmers-market-shopping-map",
    category: "map",
    extraInstruction:
      "Avoid numbered pins, a ranked vendor list, or a right-side legend. Make it a cheerful hand-drawn market map where stalls and walking paths are visible as natural areas.",
    question:
      "Create a hand-drawn farmers market shopping map for a Saturday morning. Naturally show the produce stall, bakery table, flower stand, coffee cart, cheese stall, community notice board, seating corner, and exit path. Each clickable region should explain what to buy there, best timing, and how it relates to the walking route."
  },
  {
    id: "home-kitchen-cooking-zones",
    category: "scene",
    extraInstruction:
      "Do not draw a process flow or instruction board. Make one coherent kitchen scene with large visible zones and appliances, no numbered markers and no legend.",
    question:
      "Create an illustrated home kitchen cooking setup for a weeknight dinner. Naturally show the stove area, sink, prep island, cutting board, spice rack, refrigerator, pantry shelf, and dish drying rack. Each clickable region should explain what happens there, how it supports cooking flow, and one organization tip."
  },
  {
    id: "acoustic-guitar-anatomy",
    category: "scene",
    extraInstruction:
      "Do not make a flowchart or separate cards. Draw one large acoustic guitar close-up on a clean table, with parts clearly visible as physical regions and no numbered callouts.",
    question:
      "Create a large illustrated acoustic guitar anatomy view for a beginner. Naturally show the headstock, tuning pegs, nut, fretboard, frets, sound hole, bridge, saddle, strings, and body. Each clickable part should explain its role in sound, tuning, or playability."
  },
  {
    id: "mirrorless-camera-anatomy",
    category: "scene",
    extraInstruction:
      "Do not make a comparison chart or manual page. Draw one large mirrorless camera close-up with visible physical controls and no numbered labels.",
    question:
      "Create a large illustrated mirrorless camera anatomy view for a beginner photographer. Naturally show the lens, focus ring, shutter button, mode dial, viewfinder, rear screen, grip, hot shoe, memory card door, and battery compartment. Each clickable part should explain what it controls and one beginner mistake to avoid."
  },
  {
    id: "neighborhood-library-map",
    category: "map",
    extraInstruction:
      "Avoid numbered pins, right-side legends, and split panels. Make it a warm hand-drawn floor map with rooms and paths as large visible regions.",
    question:
      "Create a hand-drawn neighborhood library floor map for a first-time visitor. Naturally show the entrance desk, children's corner, quiet reading room, computer area, magazine shelves, study tables, event room, and cafe nook. Each clickable region should explain what users do there, noise level, and how to navigate from the entrance."
  },
  {
    id: "sunny-reading-nook",
    category: "scene",
    extraInstruction:
      "Use only five clickable targets. Do not add overview, legend, notes, context panels, or numbered labels.",
    question:
      "Create a cozy illustrated reading nook scene in a small apartment. Naturally show five large visible targets: armchair, bookshelf, floor lamp, window, and side table with tea. Each clickable target should explain its comfort role, placement logic, and one setup tip."
  },
  {
    id: "record-store-corner",
    category: "scene",
    extraInstruction:
      "Use only five clickable targets. Keep the scene as one coherent record store corner, not a flowchart or product grid.",
    question:
      "Create an illustrated independent record store corner. Naturally show five large visible targets: listening station, vinyl bins, staff counter, new arrivals wall, and poster display. Each clickable target should explain how shoppers use it and how it shapes the store experience."
  },
  {
    id: "plant-care-corner",
    category: "scene",
    extraInstruction:
      "Use only five clickable targets. Avoid small flat-lay tools and do not add a legend or notes panel.",
    question:
      "Create an illustrated indoor plant care corner for a beginner. Naturally show five large visible targets: monstera plant, watering can, grow light, potting bench, and humidity tray. Each clickable target should explain its care role, placement, and common mistake."
  }
];

const REAL_DEMO_UNIVERSAL_INSTRUCTION = [
  "For this real demo run, create clickable modules only for concrete visual objects or regions explicitly requested by the user.",
  "Do not add extra clickable modules such as input context, external tools, legend, overview, instruction panel, notes, source prompt, or meta explanation.",
  "Do not place numeric markers, numbered pins, visible segmentation borders, or side legends into the generated image unless the user explicitly asks for them.",
  "Keep every detail panel focused only on the clicked object or region, not on the full prompt."
].join(" ");

async function main() {
  const chromePath = findChrome();
  if (!chromePath) throw new Error("Chrome or Edge was not found");

  const outputDir = process.env.CHATIMAGE_REAL_DEMO_RUN_DIR || path.join(process.cwd(), "tmp", "real-demo-run");
  fs.mkdirSync(outputDir, { recursive: true });

  const serverConfig = createConfig({
    port: 0,
    apiRequestTimeoutMs: Number(process.env.CHATIMAGE_API_REQUEST_TIMEOUT_MS || 180000),
    imagePollAttempts: Number(process.env.CHATIMAGE_IMAGE_POLL_ATTEMPTS || 240),
    imagePollInitialDelayMs: Number(process.env.CHATIMAGE_IMAGE_POLL_INITIAL_DELAY_MS || 1200),
    imagePollDelayMs: Number(process.env.CHATIMAGE_IMAGE_POLL_DELAY_MS || 2000)
  });
  const server = createServer(serverConfig);
  await listen(server);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const browser = await launchBrowser(chromePath);
  const report = {
    createdAt: new Date().toISOString(),
    baseUrl,
    outputDir,
    config: {
      visionMode: serverConfig.visionMode,
      visionFallbackMode: serverConfig.visionFallbackMode,
      sam3Enabled: serverConfig.sam3Enabled,
      imageModel: serverConfig.imageModel,
      textModel: serverConfig.textModel
    },
    cases: []
  };

  try {
    const cdp = await connectBrowser(browser);
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 1440,
      height: 980,
      deviceScaleFactor: 1,
      mobile: false
    });

    for (const testCase of selectCases()) {
      let caseReport;
      try {
        caseReport = await runCase(cdp, baseUrl, outputDir, testCase);
      } catch (error) {
        const caseDir = path.join(outputDir, testCase.id);
        fs.mkdirSync(caseDir, { recursive: true });
        const failureScreenshot = path.join(caseDir, "failure.png");
        await saveScreenshot(cdp, failureScreenshot).catch(() => {});
        const diagnostics = await collectDiagnostics(cdp).catch(() => null);
        if (diagnostics) {
          fs.writeFileSync(path.join(caseDir, "diagnostics.json"), JSON.stringify(diagnostics, null, 2), "utf8");
        }
        caseReport = {
          id: testCase.id,
          category: testCase.category,
          question: testCase.question,
          status: "failed",
          error: formatCaseError(error, diagnostics),
          screenshot: failureScreenshot
        };
      }
      report.cases.push(caseReport);
      fs.writeFileSync(path.join(outputDir, "real-demo-run-report.json"), JSON.stringify(report, null, 2), "utf8");
      console.log(`${testCase.id}: ${caseReport.status} ${caseReport.title} ${caseReport.chatImageId}`);
    }

    await cdp.close();
  } finally {
    await stopProcess(browser.process);
    await rmWithRetry(browser.profileDir);
    await close(server);
  }

  report.summary = summarize(report.cases);
  fs.writeFileSync(path.join(outputDir, "real-demo-run-report.json"), JSON.stringify(report, null, 2), "utf8");
  console.log(`Wrote ${path.relative(process.cwd(), path.join(outputDir, "real-demo-run-report.json"))}`);
}

function selectCases() {
  const selected = String(process.env.CHATIMAGE_REAL_DEMO_CASES || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (!selected.length) return CASES;
  const selectedSet = new Set(selected);
  return CASES.filter((testCase) => selectedSet.has(testCase.id));
}

async function runCase(cdp, baseUrl, outputDir, testCase) {
  const caseDir = path.join(outputDir, testCase.id);
  fs.mkdirSync(caseDir, { recursive: true });
  const startedAt = Date.now();
  const question = [testCase.question, testCase.extraInstruction, REAL_DEMO_UNIVERSAL_INSTRUCTION].filter(Boolean).join("\n\n");
  await cdp.send("Page.navigate", { url: `${baseUrl}/?provider=api&realDemoCase=${encodeURIComponent(testCase.id)}` });
  await cdp.waitFor("Page.loadEventFired", 10000);
  await installDiagnostics(cdp);
  await cdp.evaluate(`
    (() => {
      const input = document.querySelector("#questionInput");
      input.value = ${JSON.stringify(question)};
      input.dispatchEvent(new Event("input", { bubbles: true }));
      document.querySelector("#questionForm").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    })()
  `);
  await waitForResult(cdp, testCase.id);
  await cdp.waitForFunction(`document.querySelector(".image-stage img") && document.querySelector(".image-stage img").complete`, 30000);
  await saveScreenshot(cdp, path.join(caseDir, "page.png"));
  const state = await collectState(cdp);
  if (!state.chatImageId) {
    state.chatImageId = await findSavedResultId(baseUrl, question, startedAt);
  }
  fs.writeFileSync(path.join(caseDir, "page-state.json"), JSON.stringify(state, null, 2), "utf8");
  const result = await loadSavedResult(baseUrl, state.chatImageId);
  fs.writeFileSync(path.join(caseDir, "result.json"), JSON.stringify(result, null, 2), "utf8");

  return {
    id: testCase.id,
    category: testCase.category,
    question,
    status: state.failure ? "failed" : "generated",
    chatImageId: state.chatImageId,
    title: state.title,
    imageUrl: state.imageUrl,
    imageWidth: state.imageNaturalWidth,
    imageHeight: state.imageNaturalHeight,
    hotspotCount: state.hotspots.length,
    alignmentProvider: state.alignmentRaw.provider || "",
    sourceCounts: state.alignmentRaw.sourceCounts || {},
    screenshot: path.join(caseDir, "page.png"),
    resultPath: path.join(caseDir, "result.json")
  };
}

async function installDiagnostics(cdp) {
  await cdp.evaluate(`
    (() => {
      const logs = [];
      const push = (type, payload) => {
        logs.push({
          type,
          at: new Date().toISOString(),
          payload: String(payload || "").slice(0, 1200)
        });
        if (logs.length > 80) logs.shift();
      };
      window.__chatimageRealDemoDiagnostics = logs;
      window.addEventListener("error", (event) => push("error", event.message || event.error));
      window.addEventListener("unhandledrejection", (event) => push("unhandledrejection", event.reason && (event.reason.stack || event.reason.message || event.reason)));
      const originalFetch = window.fetch;
      window.fetch = async (...args) => {
        const response = await originalFetch(...args);
        if (!response.ok) {
          let body = "";
          try { body = await response.clone().text(); } catch {}
          push("fetch", response.status + " " + response.statusText + " " + String(args[0]) + " " + body.slice(0, 600));
        }
        return response;
      };
    })()
  `);
}

async function waitForResult(cdp, caseId) {
  await cdp.waitForFunction(
    `(() => {
      const image = document.querySelector(".image-stage img");
      const hotspots = document.querySelectorAll(".image-stage > [data-hotspot-id]");
      const failed = document.querySelector("#retryButton") || document.querySelector(".image-load-error");
      return Boolean(failed || (image && image.complete && image.naturalWidth > 0 && hotspots.length >= 3));
    })()`,
    Number(process.env.CHATIMAGE_REAL_DEMO_WAIT_MS || 480000)
  );
  const failure = await cdp.evaluate(`
    (() => {
      const failed = document.querySelector("#retryButton") || document.querySelector(".image-load-error");
      return failed ? document.body.innerText.slice(0, 3000) : "";
    })()
  `);
  if (failure) throw new Error(`${caseId} generation failed:\n${failure}`);
}

async function collectDiagnostics(cdp) {
  return cdp.evaluate(`
    (() => {
      const status = Array.from(document.querySelectorAll(".status-step")).map((node) => ({
        text: node.textContent || "",
        className: node.className || ""
      }));
      return {
        title: document.querySelector(".result-header h2")?.textContent || "",
        failedText: (document.querySelector(".image-load-error") || document.querySelector("#retryButton"))?.textContent || "",
        status,
        logs: window.__chatimageRealDemoDiagnostics || []
      };
    })()
  `);
}

function formatCaseError(error, diagnostics) {
  const parts = [error && error.message ? error.message : String(error)];
  const logs = diagnostics && Array.isArray(diagnostics.logs) ? diagnostics.logs : [];
  const fetchErrors = logs.filter((item) => item.type === "fetch").slice(-5);
  if (fetchErrors.length) {
    parts.push("Fetch diagnostics:");
    for (const item of fetchErrors) parts.push(`- ${item.payload}`);
  }
  const runtimeErrors = logs.filter((item) => item.type !== "fetch").slice(-5);
  if (runtimeErrors.length) {
    parts.push("Runtime diagnostics:");
    for (const item of runtimeErrors) parts.push(`- ${item.type}: ${item.payload}`);
  }
  if (diagnostics && diagnostics.failedText) parts.push(`Failure UI: ${diagnostics.failedText}`);
  return parts.join("\n");
}

async function collectState(cdp) {
  return cdp.evaluate(`
    (() => {
      const pres = Array.from(document.querySelectorAll(".debug-grid pre")).map((node) => node.textContent || "");
      let layout = {};
      let alignmentRaw = {};
      try { layout = JSON.parse(pres[2] || "{}"); } catch {}
      try { alignmentRaw = JSON.parse(pres[5] || "{}"); } catch {}
      const imageNode = document.querySelector(".image-stage img");
      const hotspots = Array.from(document.querySelectorAll(".image-stage > [data-hotspot-id]")).map((node) => {
        const rect = node.getBoundingClientRect();
        return {
          id: node.getAttribute("data-hotspot-id") || "",
          label: node.getAttribute("aria-label") || "",
          style: node.getAttribute("style") || "",
          rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
        };
      });
      return {
        chatImageId: "",
        title: document.querySelector(".result-header h2")?.textContent || "",
        summary: document.querySelector(".result-header p")?.textContent || "",
        imageUrl: imageNode ? imageNode.src : "",
        imageNaturalWidth: imageNode ? imageNode.naturalWidth : 0,
        imageNaturalHeight: imageNode ? imageNode.naturalHeight : 0,
        layout,
        alignmentRaw,
        hotspots,
        failure: Boolean(document.querySelector("#retryButton") || document.querySelector(".image-load-error"))
      };
    })()
  `);
}

async function loadSavedResult(baseUrl, chatImageId) {
  if (!chatImageId) return null;
  const response = await fetch(`${baseUrl}/api/chatimages/${encodeURIComponent(chatImageId)}`);
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error || `failed to load ${chatImageId}`);
  return json.result;
}

async function findSavedResultId(baseUrl, question, startedAt) {
  const response = await fetch(`${baseUrl}/api/chatimages`, { cache: "no-store" });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error || "failed to list saved chat images");
  const items = Array.isArray(json.items) ? json.items : [];
  const exact = items.find((item) => String(item.question || "").trim() === String(question || "").trim());
  if (exact && Date.parse(exact.updatedAt || exact.createdAt || "") >= startedAt - 5000) return exact.id;
  const recent = items.find((item) => Date.parse(item.updatedAt || item.createdAt || "") >= startedAt - 5000);
  if (recent) return recent.id;
  throw new Error("could not match generated ChatImage in history");
}

async function launchBrowser(chromePath) {
  const debugPort = await getFreePort();
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "chatimage-real-demo-"));
  const browserProcess = spawn(chromePath, [
    "--headless=new",
    "--disable-gpu",
    "--disable-software-rasterizer",
    "--disable-features=VizDisplayCompositor",
    "--disable-extensions",
    "--disable-dev-shm-usage",
    "--no-sandbox",
    "--no-first-run",
    "--no-default-browser-check",
    "--remote-debugging-address=127.0.0.1",
    `--user-data-dir=${profileDir}`,
    `--remote-debugging-port=${debugPort}`,
    "about:blank"
  ]);
  let stderr = "";
  browserProcess.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });
  return { process: browserProcess, profileDir, debugPort, getStderr: () => stderr };
}

async function connectBrowser(browser) {
  const wsUrl = await waitForWebSocketUrl(browser.debugPort, browser.getStderr);
  return connectCdp(wsUrl);
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    if (!server || !server.listening) return resolve();
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function summarize(cases) {
  return {
    count: cases.length,
    generated: cases.filter((item) => item.status === "generated").length,
    failed: cases.filter((item) => item.status !== "generated").length,
    hotspotTotal: cases.reduce((sum, item) => sum + Number(item.hotspotCount || 0), 0)
  };
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
