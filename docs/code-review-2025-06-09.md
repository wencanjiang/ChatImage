# ChatImage 代码审查报告

> 审查日期：2025-06-09 | 审查范围：全项目源码 | 版本：v0.1.0

---

## 一、总体评价

项目整体架构方向正确，`LLM文本 → 结构化 → 布局规划 → 图片生成 → 热点对齐 → 交互` 的流水线设计清晰合理。代码在关键路径上有较好的防御性编程意识（参数校验、边界检查、JSON修复）。但存在**若干高危安全漏洞**、**多处代码质量滑坡**和**可维护性隐患**，需要在正式上线前解决。

**总体评级：C+（可用但需整改）**

---

## 二、关键缺陷（P0 - 必须立即修复）

### 2.1 🔴 API密钥泄露到URL查询参数

**文件**：`server/providers.js` 第 263、326 行

```js
// 第263行 - image API
url.searchParams.set("key", serverConfig.apiKey);

// 第326行 - image detail API
url.searchParams.set("key", serverConfig.apiKey);
```

**问题**：API密钥被放入URL查询参数中。这会导致密钥出现在：
- 服务端日志（Nginx/反向代理日志）
- Node.js 进程环境变量 dump
- 错误堆栈跟踪
- 任何中间件的请求日志

**修复**：将 API key 放入 HTTP Header（如 `Authorization`），而非 URL 参数。

```js
// 推荐做法
const response = await fetch(url, {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${serverConfig.apiKey}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({ prompt, size, model })
});
```

### 2.2 🔴 `.env` 加载顺序导致 `.env.local` 无法覆盖

**文件**：`server/http.js` 第 30 行

```js
// server.js 中的加载顺序
loadEnvFile(path.join(rootDir, ".env"));
loadEnvFile(path.join(rootDir, ".env.local"));

// http.js 中的逻辑
if (!process.env[key]) process.env[key] = value;  // 只设置空值！
```

**问题**：`.env` 先加载设置了变量，`.env.local` 后加载但因为 `!process.env[key]` 的判断永远无法覆盖。用户改 `.env.local` 完全无效。

**修复**：`.env.local` 后面加载时应覆盖已有值，或者使用优先级逻辑：

```js
function loadEnvFile(filePath, overwrite = false) {
  // ...
  if (overwrite || !process.env[key]) process.env[key] = value;
}

// server.js
loadEnvFile(path.join(rootDir, ".env"), false);
loadEnvFile(path.join(rootDir, ".env.local"), true); // .env.local 覆盖
```

### 2.3 🔴 全局错误处理缺少日志

**文件**：`server.js` 第 147-152 行

```js
} catch (error) {
  const status = error.statusCode || 500;
  return sendJson(res, status, {
    error: error.message || "Internal Server Error"
  });
}
```

**问题**：服务端所有异常被吞掉，无任何日志输出。生产环境排查问题完全抓瞎。而且 `http.createServer(async (req, res) => {})` 中的 async 错误如果发生在 `sendJson` 之后，会被静默丢弃。

**修复**：

```js
} catch (error) {
  const status = error.statusCode || 500;
  const message = error.message || "Internal Server Error";
  if (status >= 500) {
    console.error(`[${new Date().toISOString()}] ${req.method} ${req.url}:`, error);
  }
  return sendJson(res, status, { error: message });
}
```

### 2.4 🔴 SQLite 写入无事务保护

**文件**：`server/store.js` `saveThread` 方法（第 237-273 行）

```js
db.prepare("delete from hotspot_messages where thread_id = ?").run(thread.id);
// ...然后逐条 INSERT
for (const message of thread.messages || []) {
  insertMessage.run(...);
}
```

**问题**：DELETE + INSERT 不在同一个事务中。如果在遍历 messages 过程中出错，热点消息表会处于"已删除旧数据但未完全写入新数据"的不一致状态。

**修复**：包裹在事务中：

```js
const saveThread = db.transaction((chatImageId, hotspotId, thread) => {
  // 全部操作在一个事务中
});
```

---

## 三、高风险问题（P1 - 上线前必须解决）

### 3.1 🟠 缺少 CSRF / Origin 校验

**文件**：`server/routes/chatimages.js`

所有 POST/PATCH/DELETE 路由没有任何跨域/来源校验。虽然是 localhost 服务器，但如果浏览器被恶意网页通过 `fetch('http://127.0.0.1:5178/api/chatimages/xxx', {method:'DELETE'})` 调用，可以删除用户数据。

**修复**：检查 `Origin` / `Referer` header 或要求自定义 header。

### 3.2 🟠 静态资源缓存策略错误

**文件**：`server/http.js` 第 87 行

```js
"Cache-Control": "no-store"  // 对所有静态资源！
```

**问题**：CSS、JS、字体文件不缓存，每次刷新都重新下载。`dist/` 目录已经有了 hash 命名的文件（如 `app.a1b2c3d4.js`），正是为了可以长期缓存。

**修复**：根据文件扩展名设置不同缓存策略：

```js
const cacheControl = ext === '.html' 
  ? 'no-store' 
  : 'public, max-age=31536000, immutable';
```

### 3.3 🟠 `uid()` 函数存在ID碰撞风险

**文件**：`src/app.js` 第 107-108 行

```js
const uid = (prefix) =>
  `${prefix}_${Math.random().toString(36).slice(2, 8)}_${Date.now().toString(36)}`;
```

**问题**：`Math.random()` 仅 6 位 36 进制（约 21 亿种可能），加上毫秒级时间戳，在同一毫秒内并发调用仍有碰撞可能。

**修复**：使用 `crypto.randomUUID()` 或至少使用 `crypto.getRandomValues()`：

```js
const uid = (prefix) => {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  const rand = Array.from(bytes, b => b.toString(36).padStart(2,'0')).join('');
  return `${prefix}_${rand}_${Date.now().toString(36)}`;
};
```

### 3.4 🟠 服务没有优雅关闭

**文件**：`server.js` 第 156-163 行

```js
server.listen(config.port, "127.0.0.1", () => { ... });
// 没有 SIGTERM/SIGINT 处理
```

**修复**：

```js
function shutdown(signal) {
  console.log(`\n${signal} received, shutting down...`);
  server.close(() => {
    store.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
```

---

## 四、代码质量与可维护性（P2 - 持续改进）

### 4.1 🟡 `service.js` 过大（937行），职责不单一

一个文件包含了：Mock LLM Provider、Real LLM Provider、Structure Provider、Answer+Structure Provider、Layout Planner、Image Provider、Alignment Provider V1 & V2、Followup Provider、Persistence Provider、ChatImage Service 工厂——共 **11个工厂函数**。

**建议**：拆分为独立文件：
```
src/service/
  llm.js
  structure.js
  layout.js
  image.js
  alignment.js
  followup.js
  persistence.js
  orchestrator.js
```

### 4.2 🟡 硬编码的魔法数字

全局散布着 `sleep(420)`, `sleep(360)`, `sleep(520)`, `sleep(220)` 等无说明的延迟值。无人知道为什么是420ms而不是500ms。

**建议**：定义常量或从配置读取：

```js
const DELAYS = {
  MOCK_LLM_ANSWER: 420,
  MOCK_STRUCTURE: 360,
  MOCK_IMAGE: 520,
  LAYOUT_TRANSITION: 220,
};
```

### 4.3 🟡 前端全局命名空间污染

所有模块挂载到 `window` 对象（`window.ChatImageCore`, `window.ChatImageStructure` 等），15个脚本文件各自占用一个全局变量。

**建议**：考虑使用 ES Module 打包（保持 npm 零依赖但在构建时做模块化）。

### 4.4 🟡 重复代码：`createAlignmentProvider` vs `createAlignmentProviderV2`

`service.js` 中两个版本共存，V1（第176行）已不被使用但保留在代码中。V2 复制了大量 V1 的代码。

**建议**：删除 V1，V2 通过参数控制差异行为。

### 4.5 🟡 布局溢出模块全部重叠

**文件**：`src/layout.js` `createPositionedRegions` 函数

```js
const position = positions[index] || positions[positions.length - 1];
```

当模块数量超过预定义位置数量时，所有溢出模块都会堆叠在最后一个位置上。

**建议**：溢出时自动降级到 grid 布局，或至少抛出明确错误。

### 4.6 🟡 `render.js` 大量 HTML 模板字符串内联

`renderResult`, `renderImageFrame`, `renderDetail` 等都是将大量 HTML 作为模板字符串返回。没有语法高亮、没有 IDE 支持、容易产生 XSS。

**建议**：考虑使用 `<template>` 元素或小型模板引擎（如 lit-html）。

### 4.7 🟡 SQLite Sync 阻塞事件循环

使用 `node:sqlite` 的 `DatabaseSync`，所有读写操作同步阻塞。在高并发场景下会严重拖慢服务。

**建议**：如果并发量不大（本地服务），当前可以接受。但应添加性能监控，必要时切换到异步 SQLite（如 `better-sqlite3` 的异步包装）。

---

## 五、潜在 Bug

### 5.1 🔶 除零风险

**文件**：`src/app.js` 第 369 行

```js
const aspectRatio = (expanded.width * dimensions.width) / Math.max(1, expanded.height * dimensions.height);
```

此处只用 `Math.max(1, ...)` 保护了分母，但如果 `expanded.height * dimensions.height` 恰好为 0（不太可能但未防范），结果会是 0。虽然不崩溃，但 CSS `aspect-ratio: 0` 可能产生异常渲染。

### 5.2 🔶 `Array.from(new Set(warnings))` 在性能关键路径

**文件**：`src/structure.js` 第 575、614 行

这个去重正确但没必要——warnings 数组通常很小（<10）。`Array.from(new Set(...))` 在这里可以接受，不是实际性能问题。

### 5.3 🔶 `async` 请求处理器中的异常传播

**文件**：`server.js` 第 139 行

```js
return http.createServer(async (req, res) => {
```

Node.js http 模块不完全支持异步请求处理器。如果 Promise 在 `sendJson` 调用后被 reject，错误不会被 `try/catch` 捕获（因为 `await` 已返回）。

**修复**：或使用 Express/Koa 等框架，或显式处理 `unhandledRejection`：

```js
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});
```

### 5.4 🔶 `buildStyleImagePrompt` 中文 prompt 硬编码

**文件**：`src/layout.js` 第 529 行

```js
"你是一名顶尖的信息图设计师。根据下列结构创作一张精美、专业、可发布的中文信息图..."
```

当用户使用英文提问时，prompt 仍然是中文。这可能导致生图模型混淆。

---

## 六、测试覆盖分析

项目中测试文件数量可观（46个测试文件），覆盖了核心逻辑、布局、对齐、服务端路由、浏览器测试、安全测试等。但存在以下问题：

1. **缺少集成测试**：各个模块有单元测试，但没有端到端的生成流水线测试。
2. **Mock 测试与真实 API 差异**：Mock 模式通过了但 API 模式可能失败。
3. **没有性能测试**：没有基准测试来跟踪加载时间、生成时间。
4. **没有视觉回归测试**：热点对齐是否准确完全依赖人工检查。

---

## 七、改进优先级排序

| 优先级 | 类别 | 数量 | 建议完成时间 |
|--------|------|------|-------------|
| P0 | 安全漏洞 + 数据一致性 | 4 | **本周内** |
| P1 | 稳定性 + 可靠性 | 4 | **上线前** |
| P2 | 代码质量 + 可维护性 | 7 | 迭代中持续改进 |
| P3 | 测试 + 性能 | 4 | 下个里程碑 |

---

## 八、正向亮点

在指出问题的同时，以下方面做得相当不错：

- ✅ **参数校验体系完善**：`server/validation.js`、路由层校验、`readJson` 体积极限检查
- ✅ **JSON 修复机制健壮**：`repairLooseJsonText`、`parseLeadingJsonValue` 处理了 LLM 输出的常见格式问题
- ✅ **内容防泄露**：`containsInternalProductLeak` 防止 LLM 将内部术语暴露给用户
- ✅ **渐进降级**：Mock → API 自动回退，对齐失败回退到 planned layout
- ✅ **热点边界裁剪计算**：`expandNormalizedBounds` 对边界情况处理细致
- ✅ **SQLite schema 迁移设计**：增量式列添加 + 表重建，考虑了向前兼容
- ✅ **调试面板完善**：Quality Report、Calibration Comparison、原始数据全量展示
- ✅ **无障碍性考虑**：`aria-label`、`aria-pressed`、`aria-expanded`、focus trap 实现

---

*报告完。建议从 P0 项开始立即修复，P1 项在上线前完成。如需针对某一项的详细修复方案，可以进一步讨论。*
