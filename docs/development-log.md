# ChatImage 开发日志
## 2026-06-02：视觉端点鉴权模式配置

继续准备真实视觉端点接入时发现，当前 `/api/vision` 上游请求固定发送 `Authorization: Bearer <key>`。这适合 OpenAI/OpenRouter，但 Azure OpenAI 常见配置需要 `api-key: <key>`，私有 adapter 有时不需要外层鉴权。为了避免选定视觉供应商后再改代码，本次把视觉鉴权模式做成配置。

修复：
- `server/providers.js` 新增 `createVisionHeaders`，支持 `bearer`、`api-key`、`azure` 和 `none`。
- `server.js` 新增 `CHATIMAGE_VISION_AUTH_MODE`，默认 `bearer`。
- `/api/config` 暴露 `visionAuthMode`，便于前端和诊断确认当前模式。
- `tests/real-api-smoke.js`、`tests/real-browser-instance.js` 和 `tests/real-scripts.test.js` 同步读取/验证该配置。
- `.env.example`、README 和 `docs/vision-endpoint-contract.md` 同步新增配置说明。

验证：
```text
node --check server/providers.js; node --check server.js; node --check tests/api-adapter.test.js; node --check tests/real-scripts.test.js; node --check tests/docs.test.js
npm.cmd run test:adapter
npm.cmd run test:real-scripts
node tests/docs.test.js
npm.cmd test
npm.cmd run test:api
npm.cmd run test:real-instance
```

当前结果：本地全量测试通过。真实 API smoke 仍失败在文本接口，上游返回“请求失败，账户余额不足或没有权限”；真实实例预检仍提前失败并记录 `missing_vision_api` 与 `text_health_failed`。

## 2026-06-02：两遍法成功路径浏览器验收

继续推进“热点必须和真实图片布局配合”这条核心目标时确认，`browser-history.test.js` 虽然已经间接覆盖 fake API + 视觉对齐成功路径，但测试目标主要是历史恢复。为了避免将来两遍法退化为“只生成图片但热点仍用第一遍布局坐标”，本次补了一个专门的浏览器验收。

修复：
- 新增 `tests/browser-api-alignment.test.js`，用 fake 文本接口、fake 生图接口和 fake 视觉接口完整跑 `provider=api`。
- fake 生图返回一张带明确卡片区域的 SVG 图片，fake 视觉接口返回一组故意不同于初始布局的 normalized bounds。
- 测试断言透明热点的 inline 坐标来自视觉返回，而不是第一遍 LayoutSpec。
- 测试断言热点 DOM 矩形与 normalized bounds 的像素映射误差小于 1px。
- 测试断言热点层仍完全透明，debug 区显示 `vision-api-align`，点击视觉对齐后的 `module_2` 能打开对应详情。
- `package.json` 新增 `npm.cmd run test:browser-api-alignment`，`tests/run-all.js` 已纳入全量测试。

验证：
```text
node --check tests/browser-api-alignment.test.js
npm.cmd run test:browser-api-alignment
npm.cmd test
npm.cmd run test:api
npm.cmd run test:real-instance
```

当前结果：两遍法 fake API 成功路径浏览器测试通过，本地全量测试通过。真实 API smoke 仍失败在文本接口，上游返回“请求失败，账户余额不足或没有权限”；真实实例预检仍提前失败并记录 `missing_vision_api` 与 `text_health_failed`，没有进入真实生图阶段。

## 2026-06-02：真实实例脚本配置可测化

继续审计真实验收入口时发现，`tests/real-browser-instance.js` 的文本模型仍硬编码为 `gpt-5.5`，而 `tests/real-api-smoke.js` 已经支持 `CHATIMAGE_TEXT_MODEL`。如果后续切换文本模型，真实 smoke 和真实实例可能使用不同模型，导致排查结论不一致。同时，`npm.cmd test` 只运行本地 mock/代理/浏览器测试，没有语法检查真实 API smoke 和真实实例脚本。

修复：
- `tests/real-browser-instance.js` 的文本模型改为读取 `CHATIMAGE_TEXT_MODEL`，默认仍为 `gpt-5.5`。
- 抽出 `createRealInstanceServerConfig(apiKey, env)` 纯函数，并用 `require.main === module` 保持脚本直接运行行为不变。
- 新增 `tests/real-scripts.test.js`，验证真实实例脚本会读取文本模型、生图模型、视觉端点、视觉模型和图片轮询配置。
- `tests/run-all.js` 增加真实 API smoke、真实实例脚本、真实诊断工具和真实脚本测试的语法检查，并运行 `real-scripts.test.js`。
- `package.json` 新增 `npm.cmd run test:real-scripts`。

验证：
```text
node --check tests/real-browser-instance.js; node --check tests/real-scripts.test.js
npm.cmd run test:real-scripts
npm.cmd test
npm.cmd run test:api
npm.cmd run test:real-instance
```

当前结果：本地全量测试通过。真实 API smoke 仍失败在文本接口，上游返回“请求失败，账户余额不足或没有权限”；真实实例预检仍提前失败并记录 `missing_vision_api` 与 `text_health_failed`，没有进入浏览器或生图阶段。

## 2026-06-02：真实 API 诊断错误结构化

继续实例测试时发现，真实 API 失败虽然已经能提前暴露，但诊断文件里的错误一度是 `{"error":"..."}` 这种 JSON 字符串，后续人工排查还要再解析一层，自动判断也不方便。

修复：
- 新增 `tests/real-diagnostics.js`，统一从 HTTP 错误 payload 中提取可读 `message`，并保留原始 `payload`。
- `tests/real-api-smoke.js` 的失败诊断现在写入 `error.message`、`error.payload` 和 `error.stage`。
- `tests/real-browser-instance.js` 的 `textHealth` 和视觉健康失败诊断现在也保留结构化 payload。
- 新增 `tests/real-diagnostics.test.js`，并加入 `package.json` 与 `tests/run-all.js`。

验证：
```text
node --check tests/real-diagnostics.js; node --check tests/real-diagnostics.test.js; node --check tests/real-api-smoke.js; node --check tests/real-browser-instance.js
npm.cmd run test:real-diagnostics
npm.cmd test
npm.cmd run test:api
npm.cmd run test:real-instance
```

当前结果：本地全量测试通过。真实 API smoke 仍失败在文本接口，上游返回“请求失败，账户余额不足或没有权限”；真实实例预检仍提前失败并记录 `missing_vision_api` 与 `text_health_failed`。诊断文件现在能直接看到可读错误和原始 payload。


## 2026-06-02：真实实例预检增加文本 API readiness audit

继续推进真实闭环验收时发现，`test:real-instance` 此前只在生图前检查真实 API 配置和视觉端点。这样如果视觉端点修好但文本账号不可用，仍会到后续浏览器流程才暴露问题。现在把真实实例预检改成一次 readiness audit，先做轻量文本请求，再汇总视觉端点状态，避免逐个排雷。

修复：
- `server/routes/llm.js` 新增 `/api/llm/health`：`GET` 返回文本接口配置状态，`POST` 发送轻量文本健康检查请求并要求上游返回非空内容。
- `tests/real-browser-instance.js` 在进入浏览器和生图前调用 `/api/llm/health` 做 `real_instance_text_preflight`。
- `tmp/test-artifacts/real-instance-diagnostic.json` 新增 `textHealth` 和 `reasons`，可以同时记录 `missing_vision_api`、`text_health_failed` 等阻塞。
- 失败路径改为 `process.exitCode = 1` 并避免重复关闭 server，消除 Windows 下失败退出时的 Node async 断言噪音。
- `docs/vision-endpoint-contract.md` 和 README 同步说明 `/api/llm/health`，避免把“配置了 key”误判成“文本 API 可用”。
- `tests/docs.test.js` 增加 `Real Instance Readiness`、`/api/llm/health` 和 `textHealth` 文档断言。

验证：
```text
node --check server/routes/llm.js; node --check tests/real-browser-instance.js
npm.cmd run test:adapter
npm.cmd run test:proxy
npm.cmd run test:real-instance
node --check tests/docs.test.js; node tests/docs.test.js
npm.cmd run build
npm.cmd test
npm.cmd run test:api
```

当前结果：本地构建、文档测试、适配器测试、代理集成测试和全量测试通过。真实 API 烟测当前失败在文本接口，上游返回“请求失败，账户余额不足或没有权限”；真实实例预检正确提前失败并记录 `reasons: ["missing_vision_api", "text_health_failed"]`。完整两遍法实例验收仍需要先恢复文本 API 权限/余额，并配置 `CHATIMAGE_VISION_ENDPOINT`。

## 2026-06-02：真实 API 烟测改为强视觉健康检查，并修复失败退出噪音

继续收紧真实验收链路时发现，`tests/real-api-smoke.js` 的可选视觉分支此前只调用 `/api/vision` 并检查返回内容非空。这只能证明视觉代理返回了文本，不能证明视觉模型真的读取了图片。

修复：
- `tests/real-api-smoke.js` 的 `CHATIMAGE_TEST_VISION=1` 分支改为调用 `/api/vision/health`。
- 视觉 smoke 现在要求返回 `ok === true`、`parsed.ok === true` 和 `parsed.imageVisible === true`。
- 诊断文件会记录 `vision.parsed`，方便确认视觉模型是否明确看到了图片。
- 失败路径从 `process.exit(1)` 改为设置 `process.exitCode = 1`，修复 Windows 下真实 API 失败时可能出现的 Node async 断言噪音。
- `tests/docs.test.js` 增加 `/api/vision/health` 和 `imageVisible` 文档断言。

验证：
```text
node --check tests/real-api-smoke.js; node --check tests/docs.test.js
node tests/docs.test.js
npm.cmd test
npm.cmd run test:api
npm.cmd run test:real-instance
```

当前结果：本地全量测试通过。`test:api` 当前失败在真实文本 API 的外部账号状态，错误为“账户余额不足或没有权限”，诊断文件正确标记 `stage: "text"`；`test:real-instance` 仍因缺少 `CHATIMAGE_VISION_ENDPOINT` 在生图前失败。

## 2026-06-01：统一真实视觉预检与健康检查提示词

继续审查真实视觉接入路径时发现，`/api/vision/health` 路由已经提供稳定的默认英文健康检查提示词，但 `tests/real-browser-instance.js` 仍手动传入另一份健康检查 prompt。这样配置真实视觉端点后，健康检查和真实实例预检可能使用不同提示词，增加排查成本。

修复：
- `tests/real-browser-instance.js` 的真实实例预检不再传自定义 `content`，改为直接使用 `/api/vision/health` 默认 prompt。
- `tests/real-api-smoke.js` 的可选视觉 smoke prompt 改成稳定 ASCII，避免终端或文件编码影响视觉接口调试。

验证：
```text
node --check tests/real-browser-instance.js; node --check tests/real-api-smoke.js
npm.cmd run test:api
npm.cmd run test:real-instance
npm.cmd run test:browser
npm.cmd run build
npm.cmd test
```

当前结果：真实文本 API 烟测、浏览器测试、构建和全量测试通过；真实实例测试仍因缺少 `CHATIMAGE_VISION_ENDPOINT` 在生图前失败。

## 2026-06-01：浏览器测试增加热点像素映射断言

继续补强实例验收时发现，浏览器测试已经验证了热点层完全透明、图片舞台与图片元素无偏移，但还没有直接证明每个 hotspot DOM 矩形严格来自 normalized bounds。也就是说，如果未来 CSS 或舞台定位改动导致热点整体偏移，原测试可能只发现舞台没偏，却不能定位到 hotspot 映射问题。

修复：
- `tests/browser.test.js` 在 mock 浏览器主流程中计算每个 `.image-stage > [data-hotspot-id]` 的实际 DOM rect，并与 inline `left/top/width/height` 百分比映射到 stage client area 后的矩形比较。
- `tests/real-browser-instance.js` 同步加入同一断言；配置真实视觉端点后，真实实例测试会同时验证透明热点视觉状态和像素级坐标映射。
- 误差阈值设为 `< 1px`，用于捕获边框、容器或比例计算导致的热点漂移。

验证：
```text
node --check tests/browser.test.js; node --check tests/real-browser-instance.js
npm.cmd run test:browser
npm.cmd run test:browser-dist
npm.cmd run build
npm.cmd test
npm.cmd run test:api
npm.cmd run test:real-instance
```

当前结果：浏览器主流程、dist 浏览器测试、构建、全量测试和真实文本 API 烟测通过；真实实例测试仍因缺少 `CHATIMAGE_VISION_ENDPOINT` 在生图前失败，避免消耗真实生图任务但也无法完成两遍法真实热点验收。

## 2026-06-01：视觉对齐请求强制携带真实图片尺寸

继续收紧两遍法真实验收链路时发现，前端服务编排已经会把真实生图返回的 `imageWidth/imageHeight` 传给 `/api/vision`，但视觉代理路由没有独立校验这两个字段。若手工调用或后续客户端改动漏传尺寸，视觉模型仍会被调用，调试区也会留下缺少尺寸参照的对齐记录。

修复：
- `server/validation.js` 新增 `validateVisionImageDimensions`，要求 `/api/vision` 对齐请求包含 `imageWidth`、`imageHeight`，且都是 `>= 16` 的整数。
- `server/routes/vision.js` 在转发视觉对齐请求前校验真实图片尺寸；健康检查 `/api/vision/health` 不要求尺寸。
- `tests/api-adapter.test.js` 覆盖无效尺寸返回 400 且不触发上游视觉请求。
- `tests/proxy-integration.test.js` 和 `tests/real-api-smoke.js` 同步为 `/api/vision` 调用携带尺寸。
- `docs/vision-endpoint-contract.md` 补充本地视觉代理请求体和尺寸要求。

验证：
```text
npm.cmd run test:validation
npm.cmd run test:adapter
npm.cmd run test:proxy
node tests/docs.test.js
npm.cmd run build
npm.cmd test
```

## 2026-06-01：真实 API 烟测失败时写入最新诊断

本轮真实生图烟测第一次失败在 `Image task timed out`，但诊断文件仍保留上一轮成功结果，容易误判当前外部状态。随后修复烟测脚本，让失败路径也记录当前轮询配置、已完成阶段和错误阶段。

修复：
- `tests/real-api-smoke.js` 的诊断文件新增 `pollConfig` 和 `error`。
- 文本、生图、视觉任一阶段失败时都会写入 `tmp/test-artifacts/real-api-smoke-diagnostic.json`，并标记失败阶段。
- 用更长轮询窗口复跑真实生图后通过，说明之前是单次上游任务慢或队列超时；最新图片 artifact 已保存并完成肉眼检查。

验证：
```text
npm.cmd run test:api
$env:CHATIMAGE_TEST_IMAGE='1'; $env:CHATIMAGE_IMAGE_POLL_ATTEMPTS='180'; npm.cmd run test:api
npm.cmd run test:real-instance
```

当前结果：真实文本 API 和真实生图 API 通过；`test:real-instance` 仍按预期停在缺少 `CHATIMAGE_VISION_ENDPOINT`，完整真实热点对齐仍需配置视觉端点。

## 2026-06-01：修复视觉健康检查默认提示词编码损坏

继续做实例验收前的接入审计时发现，`/api/vision/health` 的默认提示词里存在编码损坏的中文字符。健康检查本身用于判断视觉模型是否能读取图片，如果提示词不稳定，后续真实视觉端点接入时可能出现误判。

修复：
- `server/routes/vision.js` 将默认健康检查提示词改为稳定的 ASCII 英文提示，明确要求只返回 JSON、确认 `imageVisible=true`。
- 新增 `createVisionHealthPrompt()`，让默认提示词可以被独立测试。
- `tests/api-adapter.test.js` 增加提示词稳定性检查，防止再次出现损坏字符。

验证：
```text
node --check server/routes/vision.js; node --check tests/api-adapter.test.js
npm.cmd run test:adapter
npm.cmd run test:proxy
npm.cmd run build
npm.cmd test
$env:CHATIMAGE_TEST_IMAGE='1'; npm.cmd run test:api
npm.cmd run test:real-instance
```

当前结果：构建、全量测试、代理测试、真实文本 API 和真实生图 API 均通过；真实图片 artifact 已保存到 `tmp/test-artifacts/real-api-smoke-image.png` 并完成肉眼检查。`test:real-instance` 仍按预期停在缺少 `CHATIMAGE_VISION_ENDPOINT`，完整两遍法热点对齐仍需要配置真实视觉模型端点后验证。

## 2026-06-01：收窄视觉代理私网地址判断，避免误伤公网页面

继续复查视觉代理的外部图片 URL 校验时发现，上一轮对 IPv6 私网地址的判断把所有 `fc*`、`fd*` 开头的 hostname 都拒绝了。这样虽然能挡住 `fc00::/7`，但也会误伤类似 `fc-image.example.com`、`fdn.example.com` 的合法公网域名。

修复：
- `server/validation.js` 将 IPv6 私网段判断限制在包含冒号的 IPv6 literal 上，不再按普通域名前缀判断。
- `tests/validation.test.js` 增加 `fc-image.example.com`、`fdn.example.com` 可通过的用例。
- 同时补充 `fc00::1`、`fd12::1`、`fe80::1` 继续被拒绝的回归用例。

验证：
```text
node --check server/validation.js; node --check server/routes/vision.js
npm.cmd run test:validation
npm.cmd run test:adapter
npm.cmd run test:proxy
npm.cmd run test:security
npm.cmd run build
npm.cmd test
npm.cmd run test:api
npm.cmd run test:real-instance
```

当前结果：除 `test:real-instance` 仍因缺少 `CHATIMAGE_VISION_ENDPOINT` 按预期快速失败外，其余测试通过。真实文本 API 连通；真实图片 API 在普通 `test:api` 中默认跳过图片生成，完整图片烟测仍需显式设置 `CHATIMAGE_TEST_IMAGE=1`。

## 2026-06-01：视觉代理拒绝本地和私网图片地址

继续加固视觉代理边界时发现，上一轮已经拒绝了非法协议，但 `http://localhost`、`127.0.0.1`、`10.x`、`172.16~31.x`、`192.168.x` 等地址仍会被转发给第三方视觉接口。真实产品中，视觉上游只应读取公开图片 URL 或受控 `data:image`。

修复：
- `server/validation.js` 新增 `validateExternalImageUrl`，在通用 `validateImageUrl` 基础上拒绝 localhost 和常见私网 IP。
- `/api/vision` 和 `/api/vision/health` 改用 `validateExternalImageUrl`。
- 持久化 payload 仍使用通用 `validateImageUrl`，不影响本地测试历史记录保存。
- `tests/validation.test.js` 覆盖公网 URL、`data:image`、localhost、IPv4 私网和 IPv6 loopback。
- `tests/api-adapter.test.js` 覆盖视觉代理收到私网图片地址时返回 400 且不触发上游。
- 视觉接口契约文档补充公网图片 URL 要求。

验证：
```text
npm.cmd run test:validation
npm.cmd run test:adapter
```

## 2026-06-01：视觉代理增加 imageUrl 校验

继续审查服务端代理边界时发现，`validateImageUrl` 已经用于 ChatImage 持久化 payload，但 `/api/vision` 和 `/api/vision/health` 在转发前没有复用这层校验。非法图片地址应在本地直接拒绝，不能传给视觉上游。

修复：
- `server/routes/vision.js` 在 `/api/vision` 和 `/api/vision/health` 转发前调用 `validateImageUrl`。
- 非 `http(s)` 或 `data:image` 的图片地址返回 400，不触发上游视觉请求。
- `tests/api-adapter.test.js` 覆盖视觉对齐和健康检查中的非法 `imageUrl`。

验证：
```text
npm.cmd run test:adapter
```

## 2026-06-01：图片尺寸探测格式与错误信息对齐

继续检查真实图片尺寸链路时发现，服务端尺寸探测请求的 `Accept` 包含 `image/webp`，但当前头部解析器只支持 PNG/JPEG/SVG。如果上游返回 WebP 且响应 JSON 没有尺寸，系统会失败，但错误信息和请求声明不够一致。

修复：
- `server/providers.js` 的尺寸探测请求只声明 `image/png,image/jpeg,image/svg+xml`。
- 无法解析图片头部尺寸时，错误信息明确说明当前需要 PNG/JPEG/SVG，或由上游 JSON 显式提供尺寸。
- `tests/api-adapter.test.js` 更新尺寸探测请求头断言。
- `tests/error-paths.test.js` 增加 WebP 无尺寸时失败的错误路径测试。
- README 和技术方案补充：WebP 等格式如果无法解析头部尺寸，必须在响应 JSON 中提供尺寸字段。

验证：
```text
npm.cmd run test:adapter
npm.cmd run test:errors
```

## 2026-06-01：视觉健康检查要求确认图片可见

继续收紧真实视觉接入验收时发现，`/api/vision/health` 此前只要能解析 JSON 就会通过。如果视觉上游返回 `{"ok":false}` 或 `{"imageVisible":false}`，系统仍可能把接口当成健康，直到真实对齐阶段才暴露问题。

修复：
- `server/routes/vision.js` 新增视觉健康结果校验，要求返回 JSON 对象且 `ok === true`、`imageVisible === true`。
- `tests/api-adapter.test.js` 增加 `imageVisible:false` 时返回 502 的测试。
- `tests/proxy-integration.test.js` 的 fake vision health 响应改为明确返回 `imageVisible:true`。
- README、技术方案和视觉接口契约文档同步更新健康检查要求。

验证：
```text
npm.cmd run test:adapter
npm.cmd run test:proxy
```

## 2026-06-01：大图 Modal 增加焦点管理

继续检查键盘可访问性时确认，详情抽屉已经有 focus trap 和浏览器测试覆盖，但大图 modal 只支持 `Escape` 关闭。键盘用户打开大图后，焦点可能回到页面后面的控件，影响查看大图和点击大图热点的体验。

修复：
- `src/app.js` 打开大图 modal 时记录原焦点，并把焦点移动到 modal 关闭按钮。
- modal 打开期间 `Tab` 和 `Shift+Tab` 只在 modal 内部循环。
- 关闭 modal 后，焦点回到打开前的控件，通常是“放大”按钮。
- 复用同一套 focus trap 逻辑处理详情抽屉和大图 modal。
- `tests/browser.test.js` 覆盖 modal 初始焦点、Tab 从最后一个热点回到关闭按钮、Shift+Tab 从关闭按钮回到最后一个热点。

验证：
```text
npm.cmd run test:browser
npm.cmd run test:browser-dist
npm.cmd run build
npm.cmd test
```

## 2026-06-01：固化视觉接口接入契约

继续推进真实闭环时确认，当前代码已经能明确指出缺少 `CHATIMAGE_VISION_ENDPOINT`，但接入下一步仍需要一份可执行的视觉上游契约，说明请求体、返回 JSON、健康检查和真实实例验收命令。

修复：
- 新增 `docs/vision-endpoint-contract.md`，记录 OpenAI-compatible `text + image_url` 请求格式、`modules/bounds/confidence` 返回格式和验收命令。
- `.env.example` 补齐视觉接口、图片轮询和上游并发配置项。
- README 链接到视觉接口契约文档。
- `tests/docs.test.js` 覆盖 `.env.example` 必要变量和视觉契约关键字段，并加入 `npm.cmd test`。
- `tests/real-browser-instance.js` 在缺少视觉接口时把契约文档路径和下一步命令写入 `tmp/test-artifacts/real-instance-diagnostic.json`。

验证：
```text
node tests/docs.test.js
npm.cmd run test:adapter
npm.cmd run test:real-instance
```

当前结果：文档和适配器测试通过；真实实例仍快速失败，原因是缺少 `CHATIMAGE_VISION_ENDPOINT`，诊断文件会指向视觉契约文档。

## 2026-06-01：视觉对齐强制携带真实图片尺寸

继续审查两遍法链路时发现，虽然服务端已经能解析真实图片尺寸，但视觉对齐阶段没有单独强校验 `imageWidth/imageHeight`。如果后续 provider 变更或异常结果漏掉尺寸，视觉模型会收到不完整上下文，调试区也无法证明某次对齐到底使用了哪组图片尺寸。

修复：
- `src/alignment.js` 新增 `assertImageDimensions`，要求真实视觉对齐必须有像素级整数尺寸。
- `src/service.js` 在调用 `/api/vision` 前先校验真实图片尺寸；缺失时不会继续请求视觉接口。
- `alignmentRaw` 现在记录 `imageUrl`、`imageWidth`、`imageHeight` 和 `moduleCount`，方便调试区追踪对齐上下文。
- `tests/alignment.test.js` 覆盖缺失尺寸、normalized bounds 被误当尺寸等失败场景。
- `tests/service.test.js` 覆盖尺寸写入视觉请求与 `alignmentRaw`，以及缺失尺寸时不调用视觉接口。

验证：
```text
npm.cmd run test:alignment
npm.cmd run test:service
npm.cmd run test:browser-vision-preflight
npm.cmd run test:browser-history
npm.cmd run test:render
```

## 2026-06-01：真实图片尺寸改为解析图片头

继续做真实生图 smoke 时发现，上游返回的真实 PNG 尺寸不一定等于请求 `size`。例如请求 `1600x900` 后，样本实际返回过 `1358x1159`、`1402x1122` 和 `1536x1024`。如果服务端在上游未返回尺寸时继续回退到请求尺寸，前端图片舞台比例会错误，透明热点层坐标系也会随之偏移。

修复：
- `server/providers.js` 在上游响应缺少尺寸时，会下载生成图片并解析 PNG/JPEG/SVG 头部真实宽高。
- 真实 API 模式下如果既没有响应尺寸，也无法从图片资源解析尺寸，则生成失败，不再用猜测尺寸继续渲染。
- `tests/real-api-smoke.js` 下载真实生图 artifact，并断言 `/api/image` 返回的 `width/height` 与图片头部检测结果一致。
- `tests/api-adapter.test.js` 增加图片尺寸探测用例，覆盖上游只返回图片 URL、不返回尺寸的情况。
- `tests/server-modules.test.js` 增加 PNG 头部尺寸解析纯函数测试。

验证：
```text
CHATIMAGE_TEST_IMAGE=1 npm.cmd run test:api
npm.cmd run build
npm.cmd test
npm.cmd run test:real-instance
```

当前结果：真实文本 API 和真实生图 API 均通过；真实生图 artifact 已保存到 `tmp/test-artifacts/real-api-smoke-image.png`，诊断文件显示 `/api/image` 返回尺寸与 PNG 头部一致。`test:real-instance` 仍快速失败，原因是缺少 `CHATIMAGE_VISION_ENDPOINT`。

## 2026-06-01：真实实例测试增加视觉预检

继续跑真实实例时确认，当前环境缺少 `CHATIMAGE_VISION_ENDPOINT`。旧脚本会先启动浏览器、进入页面并等待生成失败，诊断链路偏长，也可能在视觉接口缺失时浪费前置步骤。

修复：
- `tests/real-browser-instance.js` 在启动浏览器和真实生图前先检查 `/api/config`。
- 视觉接口已配置时，脚本会先调用 `/api/vision/health`，确认上游能读取图片并返回 JSON。
- 缺少视觉接口或健康检查失败时，脚本写入 `tmp/test-artifacts/real-instance-diagnostic.json`，记录模型配置、能力开关和失败原因。
- 真实实例测试默认生图模型修正为 `GPT-Image-2`，与产品配置保持一致。
- `/api/config` 新增 `imageApiAvailable`，让真实验收诊断能区分文本、生图和视觉能力。

验证：
```text
npm.cmd run test:server
npm.cmd run test:real-instance
```

当前结果：`test:server` 通过；`test:real-instance` 快速失败，原因是缺少 `CHATIMAGE_VISION_ENDPOINT`，诊断文件已生成。

## 2026-06-01：新增热点校准误差评估

继续推进真实生图热点对齐验收时，发现人工校准能修正当前图片，但还缺少量化指标判断“视觉对齐返回到底偏了多少”。如果只靠肉眼判断，很难比较不同视觉接口或不同提示词策略的稳定性。

修复：
- `src/calibration.js` 新增 `buildCalibrationComparison`，对比手动校准 bounds 与上一轮视觉对齐 bounds。
- 误差报告输出模块级中心点偏差、尺寸偏差、IoU、坐标 delta 和状态，并汇总整体状态。
- `src/render.js` 的开发调试区新增“校准误差评估”，应用手动校准后可直接查看视觉对齐与人工校准之间的差距。
- 保留 `buildCalibrationDriftReport` 作为兼容别名，避免已有调用中断。
- `tests/calibration.test.js` 和 `tests/render.test.js` 覆盖误差报告和调试区展示。

验证：
```text
npm.cmd run test:calibration
npm.cmd run test:render
```

## 2026-06-01：开发调试区增加热点校准工具

继续处理真实生图热点对齐的验收问题时确认，即使视觉接口尚未接入，开发阶段也需要能快速核对“透明热点层”与图片模块区域是否一致。此前 debug 区能看到 LayoutSpec 和 alignmentRaw，但人工检查时需要自己换算热点坐标，不够直接。

修复：
- 新增 `src/calibration.js`，把手动校准 JSON 解析、bounds 校验和 result 更新抽成纯函数，避免继续堆在 `app.js`。
- `src/render.js` 的开发调试区新增“热点校准”工具和“热点校准数据”。
- `src/app.js` 绑定 `data-toggle-hotspot-calibration`，点击后只在当前图片舞台临时显示热点边界和标签。
- 校准 JSON 现在可以直接编辑并应用。应用时会校验 JSON、同步 `hotspots` 与 `LayoutSpec.regions`，并把 `alignmentRaw.provider` 标记为 `manual-calibration`；真实 API 模式下复用现有持久化保存结果。
- `styles.css` 新增 `.image-stage.show-calibration` 样式；默认 `.hotspot` 仍保持 `border: 0`、`background: transparent`。
- `tests/calibration.test.js` 覆盖校准解析、成功应用、缺失模块、越界、重复 ID 和布局校验失败。
- `tests/render.test.js` 覆盖校准工具 HTML、校准数据和转义。
- `tests/browser.test.js` 覆盖默认透明状态、打开校准后的可见边界、关闭后恢复透明，以及编辑 JSON 后应用校准并更新热点样式。
- `tests/browser-history.test.js` 覆盖真实 API 模式下应用手动校准后写入 SQLite，刷新并从历史恢复后仍保留校准坐标和 `manual-calibration` 标记。

验证：
```text
npm.cmd run test:calibration
calibration.test.js passed

npm.cmd run test:render
render.test.js passed

npm.cmd run test:browser
browser.test.js passed
```

## 2026-06-01：新增视觉接口健康检查

继续推进真实热点对齐闭环时，发现仅靠完整实例测试定位视觉接口问题成本偏高：如果视觉接口配置错误，可能要先走文本和结构化链路才暴露；如果视觉接口返回非 JSON，也需要更直接的诊断入口。

修复：
- `/api/vision/health` 新增 `GET` 和 `POST`。
- `GET /api/vision/health` 返回视觉端点、key 和模型配置状态，不调用上游。
- `POST /api/vision/health` 会调用视觉上游，发送测试图片和 JSON-only prompt，并要求返回内容能解析为 JSON；解析失败返回 502。
- `tests/api-adapter.test.js` 覆盖视觉健康检查配置状态和真实 probe 请求体。
- `tests/proxy-integration.test.js` 覆盖 `/api/vision/health` 经过本地代理打到 fake vision upstream 的链路。

验证：
```text
npm.cmd run test:adapter
api-adapter.test.js passed

npm.cmd run test:proxy
proxy-integration.test.js passed
```

## 2026-06-01：视觉对齐改为独立接口并增加生图前置校验

真实实例测试确认：当前文本接口可以完成普通文本回答，但不能读取图片 URL；把 `vision_align` 继续发到 `/api/llm` 会把图片链接当普通文本解释，或者返回“账户余额不足或没有权限”。这说明两遍法需要独立视觉模型接口，不能复用普通文本接口。

修复：
- 新增 `server/routes/vision.js`，提供 `/api/vision` 视觉对齐代理。
- `server/providers.js` 新增 `callVisionApi`，按 OpenAI-compatible chat completions 形态发送 `text + image_url`，要求上游返回 JSON。
- `server.js` 新增 `CHATIMAGE_VISION_ENDPOINT`、`CHATIMAGE_VISION_API_KEY`、`CHATIMAGE_VISION_MODEL` 配置，并在 `/api/config` 暴露 `visionApiAvailable`。
- `src/api-client.js` 新增 `visionAlignment: "/api/vision"`，`src/service.js` 的 `createAlignmentProvider` 改为调用独立视觉端点。
- 真实 API 模式下，如果没有配置视觉接口，会在生图前失败，避免先消耗生图任务再得到无法准确绑定热点的图片。
- fake upstream 浏览器测试改为通过 `/vision` 返回视觉 bounds，继续断言 DOM 热点使用视觉定位后的坐标。
- 新增 `tests/browser-vision-preflight.test.js`，在浏览器级真实 API 模式下验证缺少视觉接口时页面直接显示 `CHATIMAGE_VISION_ENDPOINT` 错误，并断言 fake `/image` 上游没有收到请求。

验证：
```text
npm.cmd run test:adapter
api-adapter.test.js passed

npm.cmd run test:service
service.test.js passed

npm.cmd run test:proxy
proxy-integration.test.js passed

npm.cmd run test:browser-history
browser-history.test.js passed

npm.cmd run test:browser-vision-preflight
browser-vision-preflight.test.js passed
```

## 2026-06-01：修复旧 SQLite 迁移并延长生图轮询

真实实例测试 `npm.cmd run test:real-instance` 先发现保存结果时报 `no such table: main.hotspots_legacy`。原因是旧版 `hotspot_threads.hotspot_id` 曾经外键指向 `hotspots(id)`，在 `hotspots` 迁移为 `hotspots_legacy` 时 SQLite 自动改写了外键引用，drop legacy 表后留下悬空引用。

修复：`server/store.js` 新增 `ensureHotspotThreadsSchema`，检测旧线程表是否引用 `hotspots_legacy` 或直接把 `hotspot_id` 做外键；命中时重建 `hotspot_threads` 和 `hotspot_messages`，保留既有 thread/message 数据，并移除错误外键。

继续实例测试后发现真实生图任务超过原 30 次轮询窗口，报 `Image task timed out`。修复：`server.js` 新增 `CHATIMAGE_IMAGE_POLL_ATTEMPTS`、`CHATIMAGE_IMAGE_POLL_INITIAL_DELAY_MS`、`CHATIMAGE_IMAGE_POLL_DELAY_MS` 配置，默认轮询窗口从约 60 秒提高到约 180 秒；真实实例测试同步使用该配置并保存失败截图与页面文本。

验证：
```text
npm.cmd run test:server-modules
server-modules.test.js passed

npm.cmd run test:server
server.test.js passed
```

## 2026-06-01：真实生图改为两遍法视觉对齐热点

继续处理真实生图热点偏移问题时确认，核心矛盾是生图模型不会可靠遵循像素级坐标。旧链路把 `LayoutSpec` 坐标同时用于生图 prompt 和透明热点层；如果真实图片里的卡片实际位置偏移，热点就会错位。

修复：
- 新增 `src/alignment.js`，封装视觉对齐 prompt、JSON 解析、模块匹配、置信度校验、bounds 校验和 aligned layout 生成。
- `src/layout.js` 新增 `buildStyleImagePrompt`。真实 API 生图 prompt 不再强塞 exact bounds，而是强调现代信息图风格、独立卡片、中文清晰和卡片边界可辨识。
- `src/service.js` 将真实 API 链路调整为 `structure -> approximate layout -> style image -> vision align -> hotspots`。mock SVG 或 API 自动回退到 mock 时继续使用确定性布局坐标。
- 对齐失败会让生成失败并复用现有重试入口，不回退旧坐标，避免输出看似可交互但实际错位的结果。
- 结果新增 `alignmentRaw`，并在 `server/store.js` 持久化到 `alignment_raw_json`；开发调试区新增“视觉对齐返回”。
- `index.html` 和构建测试加入 `src/alignment.js`，生成进度新增“视觉对齐热点”。
- fake upstream 浏览器测试新增 `vision_align` 响应，并断言真实 API 模式 DOM 热点使用视觉 bounds，而不是初始 LayoutSpec bounds。

验证：
```text
npm.cmd run test:alignment
alignment.test.js passed

npm.cmd run test:layout
layout.test.js passed

npm.cmd run test:service
service.test.js passed

npm.cmd run test:browser-history
browser-history.test.js passed
```

## 2026-05-31：实例测试与剩余问题审计

本轮暂停新增兜底机制，转为按实例测试找问题。测试范围包括真实 API smoke、本地浏览器实例、构建产物浏览器实例、历史恢复实例、fake upstream 代理实例、100 道测试问题服务层批量生成，以及全量自动化回归。

结果：
- `npm.cmd run test:api` 在当前沙箱网络环境下失败，错误为 `fetch failed`。失败后 Node 在 Windows 上额外输出 `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), file src\win\async.c, line 76`。API key 已配置，但当前环境不能证明真实上游连通。
- 真实 API 网络放行请求未获批准，因此本轮没有重新生成真实生图样例。
- `npm.cmd run test:browser`、`test:browser-history`、`test:browser-dist` 和 `test:proxy` 均通过。
- 使用 `docs/test-questions.md` 的 100 道问题做服务层批量实例测试，100/100 生成成功，质量报告均通过，布局族分布为 hub 52、flow 28、compare 10、timeline 6、matrix 4。
- 查看本地 mock 桌面/移动截图后，当前 mock UI 没发现明显热点错位或文字溢出。
- 查看旧真实截图 `tmp/test-artifacts/real-zju-president.png` 后，真实生图仍可见文字重复、局部重叠和半透明残影。该截图来自此前真实 API 运行，因本轮真实上游不可达，无法确认最近 textBudget 和 prompt 改动是否已完全修复。

剩余问题：
- 高优先级：需要在可访问真实 API 的环境重新跑 `npm.cmd run test:real-instance`，并人工检查真实图片中文字质量、模块重叠、热点对齐和详情内容是否一致。
- 中优先级：`real-api-smoke` 在网络失败后出现 Node Windows async assertion，可能是测试进程清理与未完成 fetch 的边界问题，需要在可复现环境单独排查。
- 中优先级：当前 100 题批量实例主要验证 mock 服务链路和布局质量，不能替代真实生图 OCR/视觉质量评估。

验证：
```text
npm.cmd run test:browser
browser.test.js passed

npm.cmd run test:browser-history
browser-history.test.js passed

npm.cmd run test:browser-dist
browser-dist.test.js passed

npm.cmd run test:proxy
proxy-integration.test.js passed

100-question service batch
passed: 100
failed: 0

npm.cmd test
All tests passed.
```

## 2026-05-31：上游 API 代理增加并发上限

继续处理真实 API 稳定性时确认，`AbortController` 只能中止本地等待和请求信号，不能保证上游任务或已经建立的 TCP 资源马上释放。如果上游长期慢响应，仅靠单请求超时仍可能让本地进程同时挂住大量代理请求。

修复：
- 新增 `server/concurrency.js`，提供轻量 `createConcurrencyGate`。
- `server.js` 为 `/api/llm` 和 `/api/image` 的真实上游调用接入进程内并发上限，默认 `CHATIMAGE_MAX_UPSTREAM_REQUESTS=4`。
- 当并发达到上限时，代理立即返回 429，避免继续向上游发起新请求。
- `tests/server-modules.test.js` 覆盖 concurrency gate 的占用、拒绝和释放。
- `tests/proxy-integration.test.js` 增加慢上游场景：第一个请求占用上游槽位时，第二个 `/api/llm` 请求返回 429，且不会打到 fake upstream。
- README 和技术方案同步说明超时与并发限制的边界。

验证：
```text
npm.cmd run test:server-modules
server-modules.test.js passed

npm.cmd run test:proxy
proxy-integration.test.js passed
```

## 2026-05-31：调试信息、焦点闭环与构建 HTML 压缩

继续按产品目标和最新问题清单做审计时发现几处中等风险：开发调试区的“结构化解析成果”来自 hotspot 反推，不是真实结构化阶段产物；详情面板打开后 `Tab` 可以离开面板；构建后的 `dist/index.html` 仍保留原始空白；上游请求超时文档容易把 `AbortController` 误写成完全释放 TCP/上游任务。

修复：
- `src/service.js` 在生成结果中保存 `structuredSpec`，使用经过 `textBudget` 处理后的真实视觉结构。
- `server/store.js` 新增 `structured_spec_json` 持久化字段和迁移函数，历史恢复后调试区不会丢失结构化解析成果。
- `src/render.js` 的开发调试区改为展示真实 `structuredSpec`，并新增“上游生图返回”区域展示 `providerRaw`。
- `src/app.js` 为详情面板增加 `Tab`/`Shift+Tab` focus trap，键盘焦点会保持在区域详情和追问控件内，`Escape` 仍可关闭。
- `scripts/build.js` 新增 HTML 压缩，`dist/index.html` 只保留压缩后的 hash CSS/JS 引用。
- 技术方案明确 `AbortController` 只能中止本地等待/请求信号，不能保证上游任务或所有已建立 TCP 资源立即释放；生产环境仍需要上游取消、连接池和并发限流。

验证：
```text
npm.cmd run test:service
service.test.js passed

npm.cmd run test:render
render.test.js passed

npm.cmd run test:server-modules
server-modules.test.js passed

npm.cmd run test:server
server.test.js passed

npm.cmd run test:build
build.test.js passed

npm.cmd run test:browser
browser.test.js passed
```

## 2026-05-31：历史恢复失败增加可见重试入口

继续检查错误恢复路径时发现，点击“最近记录”恢复失败时，前端只把状态标记改成“恢复失败”，没有展示具体错误，也没有提供重试入口。和生成失败、图片加载失败、热点追问失败相比，这条链路缺少可操作反馈。

修复：
- `src/render.js` 新增 `renderHistoryRestoreError`，在最近记录区渲染恢复失败原因和重试按钮。
- `src/app.js` 的 `restoreHistoryItem` 捕获异常后调用错误渲染，并把重试按钮重新绑定到同一条历史记录。
- `styles.css` 增加历史恢复错误条样式，保持在历史区域内展示，不覆盖主图和透明热点层。
- `tests/render.test.js` 覆盖错误消息与 history id 的 HTML 转义、错误条和重试按钮输出。
- README 同步历史恢复错误恢复能力。

验证：
```text
npm.cmd run test:render
render.test.js passed

npm.cmd run test:build
build.test.js passed
```

## 2026-05-31：追问成功后同步当前结果快照

继续检查热点追问链路时发现，`followup` 成功后只更新了前端 `threadsByHotspotId` 和后端持久化记录，当前页面内的 `result.threads` 仍然停留在生成时的空数组。普通详情面板短期不受影响，但开发调试、导出或后续依赖 `result` 快照的能力会读到旧数据。

修复：
- `src/state.js` 新增 `setResultThread`，按 `hotspotId` upsert 当前 `result.threads`。
- `src/service.js` 在追问成功后同时更新 thread cache 与当前 result 快照，再保存到持久化层。
- `tests/state.test.js` 覆盖新增 thread、替换同 hotspot thread、追加其他 hotspot thread。
- `tests/service.test.js` 断言追问成功后 `state.result.threads` 与返回 thread 保持一致。
- 技术方案补充前端状态一致性要求，README 同步测试覆盖范围。

验证：
```text
npm.cmd run test:state
state.test.js passed

npm.cmd run test:service
service.test.js passed
```

## 2026-05-31：区域追问历史加入提示词预算

继续审查“点击图片区域后多轮追问”的真实 API 契约时发现，原始回答已经会进入区域追问 prompt，但当前 hotspot 的历史消息仍然是全量拼接。用户在同一区域追问多轮后，prompt 会越来越长，轻则增加接口成本和等待时间，重则挤掉当前热点详情或导致上游拒绝请求。

修复：
- `src/service.js` 新增 `buildCompactThreadHistory`，区域追问只携带最近若干条历史消息。
- 单条历史消息先用 `clipContextText` 裁剪，整体历史再用 `clipContextTail` 做总长度预算，尽量保留最新上下文。
- 当早期消息被省略时，prompt 会显式写入“已省略 N 条更早消息”，让 LLM 知道上下文被压缩过。
- `tests/service.test.js` 增加最近消息保留、早期消息省略、单条裁剪和总长度裁剪断言。
- 技术方案补充追问上下文必须有长度预算，README 同步测试覆盖范围。

验证：
```text
npm.cmd run test:service
service.test.js passed
```

## 2026-05-31：区域追问补齐原始回答上下文

继续审查“点击热点后继续追问”的上下文契约时发现，`createFollowupContext` 已经携带 `rawAnswer`，但 `buildFollowupPrompt` 没把原始回答写入真实 LLM prompt。这样真实 API 模式下，区域追问实际只有原始问题、当前热点和 thread 历史，缺少用户最初收到的完整文本回答。

修复：
- `src/service.js` 的 `buildFollowupPrompt` 增加 `原始回答` 段落。
- 新增 `clipContextText`，对原始回答做字符数裁剪，避免长回答挤占当前 hotspot 详情和历史追问。
- `tests/thread.test.js` 明确断言 followup context 保留 `rawAnswer`。
- `tests/service.test.js` 断言 prompt 包含原始回答，并覆盖长文本裁剪。
- 技术方案同步说明原始回答会进入区域追问 prompt，但会做长度控制。

验证：
```text
npm.cmd run test:thread
thread.test.js passed

npm.cmd run test:service
service.test.js passed
```

## 2026-05-31：服务端布局质量硬校验

继续检查“热点要和图片布局配合”的服务端边界时发现，前端布局器和质量报告已经会检查安全边距、最小点击面积和重叠，但持久化接口此前只校验 normalized bounds 与 hotspot/region 绑定一致。外部导入或异常结果仍可能把过小、贴边或重叠的热点写入数据库。

修复：
- `server/validation.js` 复用共享 `src/core.js` 的 `validateLayoutRegions`。
- `POST /api/chatimages` 在写入 SQLite 前会拒绝安全边距不足、点击面积过小或 module region 明显重叠的结果。
- `tests/validation.test.js` 增加安全边距、最小点击面积和重叠检测的纯函数级断言。
- `tests/security.test.js` 增加 HTTP 级最小点击面积拒绝断言。
- README 和技术方案同步说明服务端布局质量硬校验。

验证：
```text
npm.cmd run test:validation
validation.test.js passed

npm.cmd run test:security
security.test.js passed

npm.cmd run test:server
server.test.js passed

npm.cmd run test:server-modules
server-modules.test.js passed
```

## 2026-05-31：服务端拒绝超过文字预算的热点文本

继续收紧质量边界时发现，前端质量报告已经能发现 `label` 或 `shortText` 超过 `textBudget`，但持久化接口仍会接受这类结果。这样外部导入或异常生成结果可能被写进历史记录，恢复后才显示质量失败。

修复：
- `server/validation.js` 在校验可选 `hotspot.textBudget` 后，继续检查 `label.length <= titleMaxChars` 和 `shortText.length <= imageTextMaxChars`。
- 超过预算时，`POST /api/chatimages` 返回 400，不写入 SQLite。
- `tests/validation.test.js` 增加纯函数级预算超限断言。
- `tests/security.test.js` 增加 HTTP 级预算超限持久化拒绝断言。
- README 和技术方案同步说明服务端会校验文字预算长度。

验证：
```text
npm.cmd run test:validation
validation.test.js passed

npm.cmd run test:security
security.test.js passed

npm.cmd run test:server
server.test.js passed

npm.cmd run test:server-modules
server-modules.test.js passed
```

## 2026-05-31：质量检查修复入口与 textBudget 持久化

继续检查质量报告闭环时发现两个问题：第一，报告只能提示质量风险，不能直接引导用户修复；第二，`textBudget` 虽然已经参与质量检查，但服务端持久化热点时只保存了 bounds，刷新恢复后会丢失预算并被误判为旧记录。

修复：
- `src/quality.js` 的质量报告新增 `canRegenerate` 和摘要文案。
- `src/render.js` 在质量报告为注意或失败时显示“按当前问题重新生成”按钮。
- `src/app.js` 绑定 `data-retry-quality`，复用当前 ChatImage 的原始问题重新生成。
- `server/store.js` 在 `bounds_json` 中持久化 `textBudget`，历史恢复后热点预算不会丢失。
- `server/validation.js` 对可选 `hotspot.textBudget` 做正数校验，避免非法预算进入数据库。
- `tests/quality.test.js`、`tests/render.test.js`、`tests/server.test.js`、`tests/server-modules.test.js` 和 `tests/validation.test.js` 覆盖质量摘要、重试入口、预算持久化和预算校验。
- `tests/browser-history.test.js` 验证真实 API 模式下保存、刷新、恢复后质量报告仍显示 5 项通过，且不会误显示质量重试按钮。

验证：
```text
npm.cmd run test:validation
validation.test.js passed

npm.cmd run test:server
server.test.js passed

npm.cmd run test:server-modules
server-modules.test.js passed

npm.cmd run test:quality
quality.test.js passed

npm.cmd run test:render
render.test.js passed

npm.cmd run test:browser-history
browser-history.test.js passed
```

## 2026-05-31：生成结果质量检查报告

继续推进“开发阶段可核查”的要求时发现，debug 面板虽然展示了原始回答、结构化结果、LayoutSpec 和生图 prompt，但没有把这些信息转成可读的质量结论。开发者仍需要手动检查热点和布局是否一致、prompt 是否带关键约束、文字预算是否生效。

修复：
- 新增 `src/quality.js`，输出质量报告，检查图片尺寸、布局校验、hotspot 与 module region 绑定、文字预算和生图 prompt 关键约束。
- `src/layout.js` 派生 hotspot 时保留 `textBudget`，让质量检查能验证标题和短文本是否仍在预算内。
- `src/render.js` 在开发调试区顶部渲染质量检查报告，显示通过/注意/失败和分数。
- `styles.css` 增加质量报告样式，保持在调试区内展示，不覆盖图片和透明热点层。
- `index.html` 和构建测试接入 `src/quality.js`。
- 新增 `tests/quality.test.js` 覆盖正常结果、热点错位、旧历史缺少预算、prompt 约束缺失和布局失败。
- `tests/browser.test.js` 增加质量检查报告的真实浏览器断言。

验证：
```text
npm.cmd run test:quality
quality.test.js passed

npm.cmd run test:render
render.test.js passed

npm.cmd run test:build
build.test.js passed

npm.cmd run test:browser
browser.test.js passed

npm.cmd run test:browser-dist
browser-dist.test.js passed
```

## 2026-05-31：图片文字预算与溢出控制

继续处理真实生图质量问题时，发现此前虽然结构化阶段要求 `imageText` 尽量短，但没有把“每个模块区域最多能容纳多少字”传给生图模型。真实图片一旦把较长标题或正文塞进较窄卡片，就容易出现文字越界，进一步影响用户对热点区域的理解。

修复：
- `src/layout.js` 新增 `estimateRegionTextBudget`，根据 `LayoutRegion.bounds` 和画布尺寸计算标题/正文的每行字符数和最大行数。
- `src/layout.js` 新增 `applyTextBudgets`，在布局完成后压缩主标题、摘要、模块标题和模块短文本；长解释继续保留在 hotspot detail 中。
- `buildImagePrompt` 现在把每个模块的 `textBudget` 写入 prompt，并明确要求模型换行、缩小字号且不得越过卡片边界。
- `src/service.js` 在生成热点、图片和 debug prompt 前统一使用预算后的 `visualSpec`。
- `src/mock-svg.js` 改为复用同一套预算，避免 mock 样例和真实 prompt 的文字约束不一致。
- `tests/layout.test.js` 覆盖预算计算、截断和 prompt 中的 `textBudget`。
- `tests/mock-svg.test.js` 使用窄卡片验证长文本会被截断。
- `tests/service.test.js` 验证服务编排传给生图 provider 的 spec 已带有 `textBudget`。

验证：
```text
npm.cmd run test:layout
layout.test.js passed

npm.cmd run test:mock-svg
mock-svg.test.js passed

npm.cmd run test:service
service.test.js passed
```

## 2026-05-28：需求澄清与方案定稿

最初需求是把 LLM 的长文本回答转换成可交互图片。第一版方案里，图片只是信息承载层，真正的交互通过前端透明热点层完成。这样可以避免依赖 PNG/JPG 本身携带交互逻辑。

关键产品边界：

- 用户先输入问题。
- 系统生成原始文本回答。
- ChatImage 将回答结构化，提取标题、摘要、模块、详情和关系类型。
- 系统生成图片，并用同一份布局数据叠加透明热点。
- 用户点击热点查看详情。
- 用户可以围绕某个热点继续追问，形成独立对话分支。

产出文档：

- `docs/requirements.md`
- `docs/technical-design.md`

## 2026-05-28：布局方案调整

早期技术方案使用 `grid-2x2 / grid-2x3 / flow-5 / compare-2` 四种固定模板。这个方案对热点准确性有帮助，但过于死板，无法很好表达中心辐射、时间线、矩阵等结构。

调整后的方案是 `LayoutSpec`：

- 布局可以根据内容选择 `grid`、`flow`、`compare`、`hub`、`timeline`、`matrix` 等 family。
- 每个可点击模块都有明确 `bounds`。
- 前端热点层直接来自 `LayoutSpec.regions`，不在图片生成后猜测坐标。
- 生图 prompt 和热点层共用同一份布局数据。

这样同时保留了视觉灵活性和热点可控性。

## 2026-05-28：第一版框架实现

项目初始只有文档，没有应用代码。先实现了一个无依赖静态网页应用：

- `index.html`
- `styles.css`
- `src/app.js`
- `README.md`

第一版使用 mock provider 跑通完整链路：

- mock LLM 回答。
- mock 结构化解析。
- `LayoutSpec` 规划。
- mock SVG 生图。
- 透明热点层。
- 右侧详情面板。
- 每个 hotspot 独立 thread。
- 放大查看。
- 保存图片。

这样即使没有真实 API，也可以先验证产品交互和技术边界。

## 2026-05-30：真实 API 代理接入

用户提供了速创 API 信息：

- 文本接口：`https://api.wuyinkeji.com/api/chat/index`
- 生图接口：`https://api.wuyinkeji.com/api/async/image_gpt`
- 生图模型期望：`GPT-Image-2`

为了避免 API key 暴露到浏览器，新增了本地后端代理：

- `server.js`
- `.env.example`
- `.gitignore`

前端保持 `auto` provider 模式：

- 直接打开 `index.html` 时使用 mock。
- 通过 `node server.js` 启动并配置 key 后，调用本地代理。
- 代理再调用真实上游 API。

关键安全处理：

- 真实 key 不写入代码。
- `.env.local` 被 `.gitignore` 忽略。
- 测试中只通过环境变量临时使用 key。

## 2026-05-30：测试体系搭建

新增 `package.json` 和测试目录：

- `tests/run-all.js`
- `tests/server.test.js`
- `tests/browser.test.js`
- `tests/api-adapter.test.js`
- `tests/proxy-integration.test.js`
- `tests/error-paths.test.js`
- `tests/real-api-smoke.js`
- `tests/model-probe.js`

测试覆盖逐步扩展：

- 服务端静态资源。
- `/api/config`。
- 缺少 key 时的 503。
- 文本和图片返回字段提取。
- API adapter 请求格式。
- fake upstream 的完整代理链路。
- 异步生图任务轮询。
- 非 JSON、任务失败、任务超时等错误路径。
- 浏览器端完整 mock 主流程。
- 多热点 thread 隔离。
- 大图热点点击。
- 保存图片。
- 桌面双栏和移动端单栏。
- 移动端大图横向查看。
- 截图非空和尺寸校验。

当前本地回归命令：

```powershell
npm.cmd test
```

通过结果：

```text
api-adapter.test.js passed
error-paths.test.js passed
proxy-integration.test.js passed
server.test.js passed
browser.test.js passed
All tests passed.
```

## 2026-05-31：历史记录恢复闭环

此前 SQLite 持久化已经能保存 ChatImage 结果并展示最近记录，但最近记录只显示列表，用户刷新后不能点击恢复完整图片、热点和追问分支。本次补齐历史恢复闭环：

- `chat_images` 表新增 `image_prompt` 字段，并通过 `ensureImagePromptColumn` 兼容旧库自动迁移。
- `server/store.js` 新增 `getChatImage(chatImageId)`，返回原始问题、原始回答、layout、hotspots、imagePrompt、providerRaw 和完整 hotspot threads/messages。
- `server/routes/chatimages.js` 新增 `GET /api/chatimages/:id`。
- `src/service.js` 的 persistence 新增 `loadResult(chatImageId)`。
- `src/render.js` 将历史项改为可点击按钮，保留原有视觉样式。
- `src/app.js` 点击历史项后恢复 result，并把返回的 threads 写回 `threadsByHotspotId`，因此恢复后点击 hotspot 能看到之前的追问消息。
- 新增 `tests/browser-history.test.js`，用 fake upstream 跑真实 `provider=api` 流程：生成、保存、追问、刷新、点击历史恢复，再验证 hotspot thread 消息仍存在。

遇到的问题：

- 原 DB schema 没保存 `imagePrompt`，恢复后的 debug 面板会丢失生图提示词。
- 前端历史项原来是纯展示 `div`，不可点击也不利于键盘访问。

解决方法：

- 新增 `image_prompt` 列并在保存、读取、迁移路径中处理。
- 历史项改为 `button.history-item`，CSS 重置按钮默认样式，保持原视觉表现。

验证：

```text
npm.cmd run test:server
server.test.js passed

npm.cmd run test:server-modules
server-modules.test.js passed

npm.cmd run test:service
service.test.js passed

npm.cmd run test:browser-history
browser-history.test.js passed
```

## 2026-05-31：thread 持久化完整性修复

继续审计 SQLite 持久化细节时发现一个边界问题：`hotspot_threads` 通过 `unique(chat_image_id, hotspot_id)` 保证一个热点一个 active thread，但如果同一热点保存了一个新的 thread id，旧 thread id 对应的 `hotspot_messages` 可能残留为孤儿消息。虽然当前前端通常复用同一个 thread id，但后续如果支持重新开分支或导入历史，这会变成数据污染风险。

修复：

- `createStore` 初始化时启用 `pragma foreign_keys = on`。
- `saveThread` 在 upsert active thread 前，先查询该 `chatImageId + hotspotId` 是否已有 thread。
- 如果旧 thread id 和新 thread id 不同，先删除旧 thread 的 messages，再写入新 thread。
- 保持其他 hotspot 的 thread 不受影响。

验证：

- `tests/server-modules.test.js` 新增同一 hotspot 替换 thread id 后只保留新消息的断言。
- `tests/thread-concurrency.test.js` 新增 module_1 替换 thread id 后 module_2 thread 不受污染的断言。

```text
npm.cmd run test:server-modules
server-modules.test.js passed

npm.cmd run test:concurrency
thread-concurrency.test.js passed

npm.cmd run test:server
server.test.js passed
```

## 2026-05-31：后端单体继续拆分

继续处理 `server.js` 混合配置、HTTP helper、SQLite store、第三方 API adapter 和路由装配的问题。本次把后端低耦合职责拆成独立模块：

- 新增 `server/http.js`：封装 `.env` 加载、`readJson`、`requireApiKey`、`sendJson` 和 `serveStatic`。
- 新增 `server/providers.js`：封装 `callTextApi`、`callImageApi`、异步生图轮询、JSON 响应解析、文本/图片/task id 提取和上游错误格式化。
- 新增 `server/store.js`：封装 SQLite schema、旧 `hotspots` 表迁移、ChatImage 保存、历史列表、hotspot thread 读写。
- `server.js` 保留配置创建、路由装配和启动逻辑，并继续 re-export 原有测试和调用方依赖的函数，保持兼容。
- `server.js` 从 500 多行降到约 94 行。
- 新增 `tests/server-modules.test.js`，直接覆盖 HTTP helper、provider 提取工具和 SQLite store 模块。

遇到的问题：

- 现有测试和脚本通过 `require("../server")` 读取 `createStore`、`callImageApi`、`extractTextContent` 等函数，拆分时不能破坏这些入口。
- `serveStatic` 的路径穿越测试需要走编码路径，否则客户端或 URL 解析会先规范化路径。

解决方法：

- `server.js` 继续从新模块 re-export 旧 API，新增模块测试则直接 require `server/http`、`server/providers` 和 `server/store`。
- 复用已有 build 测试里的编码路径策略，并在 `server-modules.test.js` 里单测 forbidden/missing 静态资源分支。

验证：

```text
npm.cmd run test:server-modules
server-modules.test.js passed

npm.cmd run test:server
server.test.js passed

npm.cmd run test:adapter
api-adapter.test.js passed

npm.cmd run test:proxy
proxy-integration.test.js passed
```

## 2026-05-31：图片尺寸来源修正

继续检查热点偏移问题时发现，虽然前端已经根据 `imageWidth/imageHeight` 预留舞台比例，但服务端 provider adapter 的尺寸提取还不够严格：如果上游返回不同尺寸，或请求尺寸不是默认 `1600x900`，热点层仍可能沿用错误比例。

修复：
- `server/providers.js` 的 `extractImageDimensions` 优先读取上游响应里的 `width/height`、`w/h`、`image_width/image_height` 和 `imageWidth/imageHeight`。
- 上游没有返回尺寸时，解析请求 `size`，支持 `1600x900`、`1024 X 768` 和 `1024 × 768`。
- 无法解析时才回退到 `1600x900`。
- 尺寸必须是像素级整数且不小于 16，避免把 normalized bounds 的 `0.3/0.4` 误判为图片宽高。
- `tests/server-modules.test.js` 增加尺寸解析纯函数测试。
- `tests/api-adapter.test.js` 覆盖直接生图 URL、无尺寸 fallback 和异步轮询详情尺寸。
- `tests/proxy-integration.test.js` 验证 `/api/image` 会把 fake upstream 返回的真实尺寸透传给前端。

验证：
```text
npm.cmd run test:server-modules
server-modules.test.js passed

npm.cmd run test:adapter
api-adapter.test.js passed

npm.cmd run test:proxy
proxy-integration.test.js passed
```

## 2026-05-31：状态与追问线程模块拆分

继续处理“前端单文件维护成本上升”的问题。本次没有引入构建工具或框架迁移，而是优先把低耦合逻辑从 `app.js` 抽成可独立测试的浏览器全局模块：

- 新增 `src/state.js`，集中管理生成中状态、当前结果、选中 hotspot、详情抽屉、modal、各 hotspot thread 缓存和 pending 状态。
- 新增 `src/thread.js`，集中处理 hotspot thread 的懒创建、区域追问上下文构造、用户消息和助手消息追加。
- `index.html` 按 `core -> api-client -> mock-svg -> state -> thread -> app` 顺序加载脚本。
- `app.js` 的追问流程改为调用 `ChatImageThread`，保留 provider 调用、持久化和 DOM 渲染编排。
- 新增 `tests/state.test.js` 和 `tests/thread.test.js`，并把 `src/state.js`、`src/thread.js` 的语法检查和单测纳入 `tests/run-all.js`。

遇到的问题：

- 追问线程逻辑原本混在 `chatImageService.followup` 中，既创建 thread，又拼装 LLM 上下文，还追加消息，难以隔离测试。
- 页面仍是无构建脚本加载方式，新模块必须同时支持浏览器全局对象和 Node `require`，否则会影响现有测试体系。

解决方法：

- `src/thread.js` 使用和 `core/state` 一致的 UMD 风格导出：浏览器下挂到 `window.ChatImageThread`，Node 下走 `module.exports`。
- 单测使用确定性 `uid` 生成器，验证新 thread 创建、复用已有 thread、sibling hotspot 不包含当前 hotspot、追加消息不污染旧消息。
- 浏览器测试继续覆盖热点点击和追问主流程，避免模块拆分只通过单测但破坏真实页面交互。

验证：

```text
npm.cmd run test:thread
thread.test.js passed

npm.cmd run test:browser
browser.test.js passed

npm.cmd test
core.test.js passed
api-client.test.js passed
mock-svg.test.js passed
state.test.js passed
thread.test.js passed
api-adapter.test.js passed
error-paths.test.js passed
proxy-integration.test.js passed
server.test.js passed
security.test.js passed
thread-concurrency.test.js passed
browser.test.js passed
All tests passed.
```

## 2026-05-31：补上前端构建流水线

针对“无构建工具”这个高优先级架构缺口，本次先采用零依赖构建脚本，而不是立刻引入 Vite/TypeScript。原因是当前项目仍处于原型验证阶段，受限于本地网络和依赖安装不确定性，先让项目具备稳定的构建产物、hash 资源和 source map，更符合当前推进节奏。

落地内容：

- 新增 `scripts/build.js`，从 `index.html` 读取脚本加载顺序，按 `core -> api-client -> mock-svg -> state -> thread -> app` 合并前端 JS。
- 对 JS 做轻量压缩：移除空行和整行注释、收敛缩进，同时保持语法安全，不做字符串级激进压缩。
- 输出 `dist/assets/chatimage.<hash>.min.js` 和 `chatimage.<hash>.min.js.map`，source map 包含原始 `sourcesContent` 和行级映射。
- 输出 `dist/assets/chatimage.<hash>.min.css` 和 CSS source map。
- 输出 `dist/build-manifest.json`，记录构建入口和产物路径，便于测试和后续部署脚本读取。
- `server.js` 新增 `staticDir` / `CHATIMAGE_STATIC_DIR` 支持，可以继续服务源码目录，也可以切换到 `dist` 目录。
- 新增 `tests/build.test.js`，真实运行构建、校验 hash 资源、source map、manifest，并启动服务验证 `dist` 页面和资源可访问。

遇到的问题：

- 测试路径穿越时，普通 `/../server.js` 会被客户端 URL 规范化成 `/server.js`，无法真正触发服务端 forbidden 分支。
- 构建脚本不能依赖外部压缩器，否则会把本轮工作卡在依赖下载上。

解决方法：

- 在测试里使用 raw HTTP request 和编码路径 `/%2e%2e%2fserver.js`，确保服务端收到真实的穿越路径并返回 403。
- 构建脚本使用 Node 标准库实现 hash、文件复制、轻量压缩和 source map 输出，先满足 MVP 的可构建、可部署、可追踪源码需求。

验证：

```text
npm.cmd run test:build
build.test.js passed
```

## 2026-05-31：结构化与布局逻辑继续拆分

继续降低 `app.js` 单文件风险，把不依赖 DOM 的核心业务逻辑拆到独立模块：

- 新增 `src/structure.js`，负责 mock 结构化结果、结构化 prompt、JSON 代码块提取、结构化结果归一化、标题压缩和关系类型兜底。
- 新增 `src/layout.js`，负责 LayoutSpec 生成、各 family 的 region 规划、hotspot 派生和生图 prompt 生成。
- `index.html` 调整脚本顺序为 `core -> structure -> layout -> api-client -> mock-svg -> state -> thread -> app`。
- `app.js` 继续保留 provider 调用、页面编排和 DOM 渲染，但删除了结构化与布局细节实现，从约 949 行降到约 595 行。
- 新增 `tests/structure.test.js` 和 `tests/layout.test.js`，直接覆盖结构化归一化、fallback、prompt、LayoutSpec 校验、热点派生和 prompt 内容。
- 构建测试同步更新 manifest 期望，确保新增模块会被打进 `dist` bundle。

遇到的问题：

- 原来的浏览器测试通过 `window.ChatImageTestHooks` 访问 `parseJsonFromText`、`normalizeVisualSpec` 和 `layoutPlanner`，拆分后这些符号不再是 `app.js` 局部函数。
- 结构化测试里对中文标题截断长度的期望需要和现有实现保持一致，不能把测试写成另一个产品规则。

解决方法：

- `ChatImageTestHooks` 改为转发到 `ChatImageStructure`、`ChatImageLayout` 和 `ChatImageCore`，浏览器测试保持原有调用方式。
- 单测验证现有约束本身：标题截断、模块最多 6 个、少于 3 个模块时 fallback 到 mock spec、timeline 布局 6 模块时分成两行。

验证：

```text
npm.cmd run test:structure
structure.test.js passed

npm.cmd run test:layout
layout.test.js passed

npm.cmd run test:build
build.test.js passed

npm.cmd run test:browser
browser.test.js passed
```

## 2026-05-31：构建产物浏览器验证

此前 `npm.cmd run build` 已能生成 `dist`，`tests/build.test.js` 也会检查 manifest、hash 文件和 source map，但它只验证资源可被服务读取，没有在真实浏览器里执行打包后的 JS。为了避免“源码入口正常、dist bundle 运行失败”的盲区，本次新增构建产物浏览器 smoke：

- `tests/browser.test.js` 改为在直接执行时运行主流程，同时导出 Chrome/CDP 辅助函数，供其他浏览器测试复用。
- 新增 `tests/browser-dist.test.js`：先运行 `scripts/build.js`，再用 `staticDir=dist` 启动服务。
- 测试断言页面只加载 `assets/chatimage.<hash>.min.js`，没有加载 `/src/` 源码脚本。
- 在真实浏览器里提交问题，等待打包后的前端生成 5 个透明 hotspot、debug 面板和 mock SVG 图片。
- 点击 hotspot 后验证详情抽屉能打开。
- 输出截图 `tmp/test-artifacts/desktop-dist.png`。

遇到的问题：

- 第一次断言 data URL 前缀时使用固定 slice 长度，和真实 `data:image/svg+xml;charset=utf-8,` 前缀长度不匹配。

解决方法：

- 改为 `startsWith("data:image/svg+xml;charset=utf-8,")`，验证语义而不是脆弱长度。

验证：

```text
npm.cmd run test:browser-dist
browser-dist.test.js passed

npm.cmd run test:browser
browser.test.js passed
```

## 2026-05-31：渲染层拆分

继续降低 `app.js` 单文件风险，把纯 HTML 输出拆到 `src/render.js`：

- 新增 `escapeHtml`，统一结果区、详情抽屉、历史记录和错误消息的 HTML 转义。
- 新增 `renderResult`、`renderImageFrame`、`renderDetail`、`renderDebugPanel`、`renderHistoryList`、`renderGeneratingState`、`renderErrorState`。
- `index.html` 脚本顺序增加 `src/render.js`，在 `service` 之后、`app` 之前加载。
- `app.js` 不再拼接大段 HTML，只负责把渲染结果挂载到 DOM、绑定热点/追问/保存/放大事件，以及推进页面状态。
- `app.js` 从约 405 行降到约 265 行。
- 新增 `tests/render.test.js`，覆盖 HTML 转义、透明热点按钮输出、debug 面板、详情消息、历史列表最多 6 条、生成中和失败状态。
- `tests/build.test.js` 同步更新，确保 `render.js` 进入构建 bundle。

遇到的问题：

- 历史列表测试最初用 `/history-item/g` 计数，会把 `history-item-title` 和 `history-item-meta` 也算进去。
- 渲染层必须继续保证热点完全透明，不引入任何 `.module-label` 或可见覆盖内容。

解决方法：

- 测试改为精确匹配 `class="history-item"`。
- `render.test.js` 明确断言结果 HTML 中不存在 `module-label`，浏览器测试继续检查热点常态背景和边框完全透明。

验证：

```text
npm.cmd run test:render
render.test.js passed

npm.cmd run test:build
build.test.js passed

npm.cmd run test:browser
browser.test.js passed
```

## 2026-05-31：服务编排层拆分

继续处理 `app.js` 中混合 provider、service、persistence 和 DOM 渲染的问题。本次新增 `src/service.js`，把和页面 DOM 无关的生成与追问编排抽出来：

- `createMockLlmProvider`、`createLlmProvider`：封装 mock/真实文本回答。
- `createStructureProvider`：封装结构化 API 调用、JSON 解析、fallback 到 mock spec。
- `createLayoutPlanner`：封装 LayoutSpec 创建。
- `createImageProvider`：封装真实生图 API 与 mock SVG 生图。
- `createFollowupProvider` 和 `buildFollowupPrompt`：封装 hotspot 追问 prompt 与 mock 回答。
- `createPersistence`：封装 ChatImage 结果、thread 和历史记录的前端持久化请求。
- `createChatImageService`：编排 `answer -> structure -> layout -> image -> save` 和 hotspot followup 流程。

调整后：

- `index.html` 脚本顺序增加 `src/service.js`，在 `thread` 之后、`app` 之前加载。
- `app.js` 只创建 service bundle，然后负责 DOM 渲染、用户事件、状态展示和 debug 面板。
- `app.js` 从约 595 行降到约 405 行。
- 新增 `tests/service.test.js`，覆盖生成状态顺序、结果保存、hotspot followup 上下文隔离、thread 写回、持久化 URL 编码和 followup prompt 内容。
- `tests/build.test.js` 同步更新，确保 `service.js` 进入构建 bundle。

遇到的问题：

- 原 `chatImageService.followup` 依赖页面内 state，需要拆分时避免 service 层变成隐式全局状态。
- persistence 既要在 mock 模式静默跳过，又要在真实 API 模式正确编码 `chatImageId` 和 `hotspotId`。

解决方法：

- service 层使用显式依赖注入：`state`、`stateModel`、`threadModel`、provider、persistence 都由调用方传入，测试中可以替换为 fake provider。
- 单测直接验证 `module/1` 会编码为 `module%2F1`，避免后续真实 hotspotId 含特殊字符时破坏路由。

验证：

```text
npm.cmd run test:service
service.test.js passed

npm.cmd run test:build
build.test.js passed

npm.cmd run test:browser
browser.test.js passed
```

## 2026-05-31：前端模块继续拆分

继续降低 `app.js` 单文件风险：

- 新增 `src/api-client.js`，封装运行配置、`provider=mock/api/auto` 判断、`GET/POST` 请求和错误处理。
- 新增 `src/mock-svg.js`，封装本地 SVG mock 信息图渲染，包含文字转义、卡片排版、连接线、标题区和图标渲染。
- `index.html` 按 `core -> api-client -> mock-svg -> app` 顺序加载脚本。
- `app.js` 从约 1230 行降到 915 行，仍保留页面状态、业务编排和 DOM 渲染，后续继续拆 `state/render/thread`。
- 新增 `tests/api-client.test.js` 和 `tests/mock-svg.test.js`，避免新模块只依赖浏览器 E2E 间接覆盖。
- `tests/run-all.js` 增加 `src/api-client.js`、`src/mock-svg.js` 的 `node --check`。

验证：

```text
npm.cmd test
core.test.js passed
api-client.test.js passed
mock-svg.test.js passed
api-adapter.test.js passed
error-paths.test.js passed
proxy-integration.test.js passed
server.test.js passed
security.test.js passed
thread-concurrency.test.js passed
browser.test.js passed
All tests passed.
```

截图证据输出：

- `tmp/test-artifacts/desktop-main.png`
- `tmp/test-artifacts/mobile-main.png`

## 2026-05-30：真实文本 API 问题

第一次真实文本 smoke test 使用用户描述的 `GPT5.5`，上游返回：

```text
The selected model is invalid.
```

随后新增 `tests/model-probe.js` 做模型名探测，发现：

- `GPT5.5` 无效。
- `GPT-5.5` 无效。
- `gpt-5.5` 有效。

同时发现真实成功响应结构是：

```text
data.choices[0].message.content
```

原先的 `extractTextContent` 没覆盖这个嵌套路径，导致把成功响应误判成“无内容”。

修复：

- 默认文本模型改为 `gpt-5.5`。
- `extractTextContent` 增加 `data.choices[0].message.content` 和 `data.choices[0].text`。
- README 和 `.env.example` 同步更新。

修复后真实文本 smoke test 通过：

```text
Text API ok: ChatImage API 文本接口连通。
```

## 2026-05-30：真实生图 API 问题

第一次真实生图 smoke test 传入 JSON：

```json
{
  "prompt": "...",
  "size": "1600x900",
  "model": "GPT-Image-2"
}
```

上游返回：

```text
转发请求失败: 存在未绑定的参数: model
```

说明该接口虽然产品上使用 GPT-Image-2，但当前 HTTP API 不接受 JSON 中的 `model` 字段。

修复：

- `callImageApi` 支持 `model: null`。
- 当 `model` 为 `null` 时，请求体只发送 `prompt` 和 `size`。
- 前端真实生图调用默认传 `model: null`。
- README 说明该接口由上游使用默认生图模型，不在 JSON 中传 `model`。

修复后真实生图 smoke test 通过：

```text
Text API ok: ChatImage API 文本接口连通。
Image API ok: https://openpt1.wuyinkeji.com/178faf5035244f72bebc161e0900fd92.png
```

## 当前状态

本地完整回归通过，真实文本和真实生图 smoke test 也已通过。

仍需注意：

- 真实 API 的返回格式可能后续变化，adapter 已尽量兼容，但若上游变更字段，需要根据返回 JSON 调整。
- 当前真实生图接口不接收 `model` 字段，因此配置里的 `CHATIMAGE_IMAGE_MODEL` 只作为记录用途，不应默认传给接口。
- 生图结果中的文字可控性仍取决于上游模型质量。当前系统用 `LayoutSpec` 保证热点层来自可控布局，但真实图片是否完全按布局生成，仍需要更多样本评估。

## 2026-05-30：真实实例测试与事实硬编码回滚

按用户给出的样例“介绍一下浙江大学校长”跑真实浏览器实例测试时，发现真实文本 API 的模型知识可能存在时效性偏差。曾尝试在服务端加入 `getVerifiedContext` 注入已核验人物信息，但该方案把具体时效事实硬编码进服务器代码，存在维护和误导风险。

最终处理：

- 完全移除 `getVerifiedContext` 和所有人物事实硬编码。
- `/api/llm` 只转发调用方提供的内容，不额外注入具体人物、机构或时效事实。
- 代理测试改为断言不会出现“已核验时效信息”注入。
- 后续若需要事实校验，应接入独立检索、RAG 或可信知识源，并保留来源和时间戳。

验证结果：

补充安全检查：

- 仓库文件中未发现用户提供的真实 API key。

## 2026-05-30：透明热点层修正

用户明确要求热点层必须完全透明，不能在图片上叠加额外文字、颜色或选中态覆盖。此前为了提升真实生图文字可读性加入的 `module-label` 可读层与该要求冲突，因此移除。

同时修复热点偏移问题：

- 移除 `.module-label` DOM 和相关 CSS。
- `.hotspot` 在默认、hover、focus、selected 状态下都保持 `border: 0`、`background: transparent`。
- 点击时使用短暂 pulse 动画反馈，动画结束后恢复透明，不常驻覆盖图片。
- `.image-stage` 不再固定 `aspect-ratio: 16 / 9`，图片使用 `width: 100%; height: auto` 决定容器高度。
- 热点继续按百分比定位，但现在百分比坐标系与真实显示图片内容区一致，避免 `object-fit: contain` 留白导致的偏移。
- 浏览器测试新增断言：不存在 `.module-label`；热点视觉状态完全透明；图片内容区与热点容器内容区尺寸、位置一致。

验证结果：

```text
npm.cmd test
api-adapter.test.js passed
error-paths.test.js passed
proxy-integration.test.js passed
server.test.js passed
browser.test.js passed
All tests passed.
```

## 2026-05-30：架构问题修正

根据用户 review，补齐四类架构缺口：

1. 持久化层：新增 SQLite store，默认数据库路径 `tmp/chatimage.sqlite`。保存 `chat_images`、`hotspots`、`hotspot_threads`、`hotspot_messages`，并提供 `/api/chatimages`、`/api/chatimages/:id/hotspots/:hotspotId/thread`、`/api/chatimages/:id/hotspots/:hotspotId/messages`。
2. 前端持久化接入：生成完成后保存 ChatImage；区域追问后保存对应 thread；页面加载时展示最近记录。
3. 图标映射：`iconGlyph` 从 5 种扩展到覆盖 `idea/risk/step/flow/compare/timeline/matrix/summary/data/source/user/action/result` 等常见 hint。
4. 布局校验：`layoutPlanner.create` 增加安全边距、最小点击面积、碰撞检测；校验失败时回退到自适应 grid，仍失败则报错。

同时修复真实生图接口约束：

- `CHATIMAGE_IMAGE_MODEL` 仅用于展示和记录。
- `/api/image` 默认不向上游发送 `model` 字段。
- 只有调用方显式传入非空字符串 `model` 时才转发。

## 2026-05-30：交互与可调试性修正

根据截图反馈继续调整体验：

1. 详情追问不再固定占据右侧区域，改为点击热点后弹出的右侧抽屉；移动端为底部抽屉。抽屉使用滑入动画，背景不透明，避免压在图片上造成阅读干扰。
2. 生成后不再默认选中第一个热点，用户必须主动点击图片区域才打开详情和追问面板。
3. 图片下方新增开发调试区，默认展开展示原始文本回答、结构化解析成果、`LayoutSpec` 和生图提示词，方便开发阶段核查链路。
4. SVG mock 渲染增强卡片内文字自适应，根据卡片宽度调整字号、换行字数和正文起点，降低文本溢出。
5. timeline 布局从单行窄卡片改为自适应两行三列，提升 5 到 6 个模块时的可读性。
6. 生图提示词增加约束：文字必须留在卡片内、避免空泛填充、优先使用具体日期/实体/模块短语，并增加连接线、标签、分隔等视觉层级。

验证：

```text
npm.cmd run test:browser
browser.test.js passed
```

## 2026-05-30：架构建议选择性落地

根据 review 中对架构和测试体系的建议，按项目目标做了取舍：

已落地：

- 修复 `UNIQUE constraint failed: hotspots.id`。原因是不同 ChatImage 都会生成 `module_1/module_2`，旧表把 `hotspots.id` 作为全局主键会冲突。现在使用 `storage_id = chatImageId:hotspotId` 作为数据库内部主键，业务 hotspotId 保持不变，并增加旧表自动迁移。
- 拆分后端路由：新增 `server/routes/config.js`、`server/routes/llm.js`、`server/routes/image.js`、`server/routes/chatimages.js`。`server.js` 保留装配、公共 helper 和静态资源兜底。
- 新增 `src/core.js`，把 `inferRelationType`、`chooseFamily`、`validateLayoutRegions`、`iconGlyph` 等纯函数从页面逻辑中抽出，前端和 Node 测试共用。
- 新增 `tests/core.test.js`，独立测试布局 family 选择、关系类型识别、热点校验和图标映射。
- 新增 `tests/thread-concurrency.test.js`，覆盖多个热点同时保存追问时 thread 不互相污染。
- 新增 `tests/security.test.js`，覆盖 SQL 注入型字符串不会破坏表结构、超大请求体会被拒绝。
- 生成失败时新增“重试”按钮，并在浏览器测试中覆盖缺少 API key 的失败路径。

暂缓：

- CI/CD 暂不接入，原因是当前 `browser.test.js` 依赖本机 Chrome/Edge，后续需要先准备 CI 浏览器环境或把浏览器测试拆成可跳过的 smoke。
- OCR 图片质量评估暂不做，先通过 prompt 约束、mock SVG 排版和人工验收提高质量。
- PostgreSQL 暂不迁移，单机 MVP 阶段 SQLite 更合适。

验证：

```text
npm.cmd test
core.test.js passed
api-adapter.test.js passed
error-paths.test.js passed
proxy-integration.test.js passed
server.test.js passed
security.test.js passed
thread-concurrency.test.js passed
browser.test.js passed
All tests passed.
```

## 2026-05-31：重存 ChatImage 时清理旧热点 thread

继续审计持久化一致性时发现另一个边界：同一个 ChatImage 重新保存时会先替换 hotspots。如果新结果不再包含某个旧 hotspot，旧 hotspot 的 thread 仍可能留在 `hotspot_threads` 和 `hotspot_messages` 中。恢复历史时就可能出现“图片里没有这个热点，但返回了它的 thread”的脏数据。

修复：

- `saveChatImage` 在重新写入当前 hotspots 后调用 `cleanupThreadsForCurrentHotspots`。
- `cleanupThreadsForCurrentHotspots` 会删除该 ChatImage 下所有不属于当前 hotspots 的旧 threads 和 messages。
- 保留仍存在 hotspot 的 thread，不影响正常历史恢复。

验证：

- `tests/server-modules.test.js` 新增重存同一 ChatImage、移除 `module_1` 后 threads 为空的断言。
- `tests/thread-concurrency.test.js` 新增移除 `module_1` 后只保留 `module_2` thread 的断言。
- `tests/browser-history.test.js` 继续通过，确认正常历史恢复不受影响。

```text
npm.cmd run test:server-modules
server-modules.test.js passed

npm.cmd run test:concurrency
thread-concurrency.test.js passed

npm.cmd run test:browser-history
browser-history.test.js passed
```

## 2026-05-31：持久化 API 输入校验

继续审计服务端持久化接口时发现，`POST /api/chatimages` 和 hotspot thread 保存接口此前主要依赖 SQLite 约束兜底。这样会带来两个问题：无效热点坐标可能被写入数据库，前端渲染时才暴露；thread 归属不一致、消息角色异常等问题会变成后续上下文污染风险。

修复：

- 新增 `server/validation.js`，集中校验 ChatImage payload、热点坐标、Layout region bounds、图片尺寸、重复 hotspot id、thread 归属和消息角色。
- `server/routes/chatimages.js` 在写入 store 前调用校验，非法 payload 直接返回 400。
- 保持 SQL 注入型字符串仍作为普通内容保存，校验关注结构和边界，不误伤合法文本。
- 新增 `tests/validation.test.js`，独立覆盖校验纯函数。
- `tests/security.test.js` 增加非法热点坐标、thread hotspotId 不匹配、非法消息角色的 HTTP 级断言。

遇到的问题：

- 不能把校验写得过窄，否则历史恢复测试和 mock/真实 provider 生成的合法结果会被错误拒绝。
- 安全测试里仍需要允许 `<script>`、SQL 片段等字符串作为普通文本进入数据库，用于验证转义和参数化查询，而不是把所有“看起来危险”的内容都拦截。

解决方法：

- 校验只约束数据结构、必填字段、normalized bounds、id 唯一性和 thread 所属关系。
- 文本内容的 XSS 防护继续放在前端 HTML escape 和参数化 SQL 路径上。

验证：

```text
npm.cmd run test:validation
validation.test.js passed

npm.cmd run test:security
security.test.js passed

npm.cmd run test:server-modules
server-modules.test.js passed
```

## 2026-05-31：浏览器测试启动器增强

继续处理 CI 相关测试风险时，发现浏览器测试虽然在没有 Chrome/Edge 时会跳过，但浏览器路径只覆盖 Windows 默认安装位置。后续如果放到 macOS/Linux CI，或者用户本机浏览器装在非默认路径，就需要改测试代码才能运行。

修复：

- `tests/browser.test.js` 新增 `getChromeCandidates`，集中生成浏览器候选路径。
- 支持 `CHATIMAGE_BROWSER_PATH` 显式指定浏览器可执行文件。
- 增加 Windows、macOS、Linux 常见 Chrome、Edge、Chromium 路径候选。
- 新增 `tests/browser-launcher.test.js`，单测候选路径顺序和跨平台路径覆盖。
- README 增加 `CHATIMAGE_BROWSER_PATH` 的使用说明。

验证：

```text
npm.cmd run test:browser-launcher
browser-launcher.test.js passed
```

## 2026-05-31：热点追问失败恢复

继续测试“可追问”主流程时，发现生成失败已有重试按钮，但热点追问失败时只会关闭 pending 状态，用户看不到失败原因，也无法一键重试。这会削弱 ChatImage 的核心交互，因为区域追问是点击图片之后的主要动作。

修复：

- `src/state.js` 新增 `followupErrorsByHotspotId`，按 hotspot 保存追问错误和可重试的原问题。
- `setResult` 现在会清理旧 thread、pending 和追问错误，避免恢复或切换结果时把旧的 `module_1` 状态带到新结果。
- `src/render.js` 在详情面板内渲染 `followup-error` 错误块和“重试”按钮。
- `src/app.js` 捕获热点追问异常，保留原问题到输入框；点击重试后继续提交同一个 hotspot 的追问。
- `styles.css` 增加追问错误块样式，保持在详情抽屉内展示，不覆盖图片热点层。
- 新增 `tests/browser-followup-error.test.js`，用 fake upstream 在真实 API 模式下让第一次 hotspot followup 返回 500，验证错误可见、原问题保留、重试后成功且错误消失。

验证：

```text
npm.cmd run test:state
state.test.js passed

npm.cmd run test:render
render.test.js passed

npm.cmd run test:browser-followup-error
browser-followup-error.test.js passed
```

## 2026-05-31：保存图片文件名修正

继续检查用户可见路径时发现，“保存”按钮此前固定把下载文件命名为 `.svg`。这在 mock SVG 阶段可以工作，但真实生图接口返回的通常是 `.png` URL，固定 `.svg` 会让下载文件扩展名和实际内容不一致。同时标题如果包含 `/ : * ?` 等字符，也可能生成不稳定文件名。

修复：

- 新增 `src/download.js`，封装 `imageUrl` 扩展名推导、文件名清理和下载名生成。
- 支持 `data:image/svg+xml`、`data:image/png`，以及 URL 中的 `.png/.jpg/.jpeg/.webp/.gif/.svg`。
- 未知格式默认保存为 `.png`，贴近真实生图 API 的常见输出。
- `src/app.js` 的保存按钮改为使用 `buildImageDownloadName(result)`。
- `index.html` 和构建测试同步加入 `src/download.js`。
- 新增 `tests/download.test.js`，并在浏览器主流程中断言真实 PNG URL 会生成 `.png` 下载名。

验证：

```text
npm.cmd run test:download
download.test.js passed

npm.cmd run test:build
build.test.js passed

npm.cmd run test:browser
browser.test.js passed
```

## 2026-05-31：图片加载失败恢复

继续检查真实生图结果展示路径时，发现如果生图接口返回了坏图片 URL，前端会认为生成成功，但用户只能看到破图。这个问题不会被普通 API 错误测试覆盖，因为 API 响应本身是 200，只是图片资源加载失败。

修复：

- `src/app.js` 在渲染图片后绑定 `img.error`，检测主图和大图 modal 中的图片加载失败。
- `src/render.js` 新增 `renderImageLoadError`，在图片容器内显示“图片加载失败”和“重试生成”。
- `styles.css` 增加失败态样式，只在图片无法加载时显示错误层；正常状态下仍保持透明热点层，不覆盖图片内容。
- 点击“重试生成”会基于当前 ChatImage 的原始问题重新走生成链路，避免用户手动复制问题。
- 新增 `tests/browser-image-error.test.js`，用 fake upstream 第一次返回 404 图片 URL、第二次返回有效 data URL，验证错误可见、热点仍存在、重试后图片恢复。

验证：

```text
npm.cmd run test:render
render.test.js passed

npm.cmd run test:browser-image-error
browser-image-error.test.js passed
```

## 2026-05-31：LayoutSpec 与 hotspot 绑定校验

继续检查“热点要和图片布局配合”这条核心契约时，发现服务端持久化校验虽然会检查热点坐标范围，但没有证明这些热点来自 `LayoutSpec.regions`。如果某个 payload 的 hotspot 和 region 坐标错位，前端仍会保存并渲染，后续就会出现透明热点和图中模块不一致的问题。

修复：

- `server/validation.js` 要求 `layout.regions` 为非空数组。
- 每个 hotspot 必须有一个 `role = "module"` 或带 `hotspotId` 的 layout region 绑定。
- 每个 module region 必须引用已存在 hotspot，且不能重复绑定同一个 hotspot。
- module region 的 `bounds` 必须与 hotspot 的 `x/y/width/height` 一致。
- 更新 `tests/validation.test.js`，覆盖缺失绑定、引用不存在 hotspot、bounds 错位和没有 module region 的错误。
- 更新 `tests/security.test.js`，在 HTTP 层验证错位 region 会返回 400。
- 更新原服务端测试 payload，让测试数据也遵守真实 LayoutSpec 契约。

验证：

```text
npm.cmd run test:validation
validation.test.js passed

npm.cmd run test:server
server.test.js passed

npm.cmd run test:security
security.test.js passed

npm.cmd run test:concurrency
thread-concurrency.test.js passed
```

## 2026-05-31：图片舞台比例预留

继续检查热点定位稳定性时发现，虽然服务端已经保证 `LayoutSpec.regions` 和 hotspots 一致，但前端图片在加载完成前仍可能让 `.image-stage` 高度短暂塌缩。热点层使用百分比定位，如果容器高度还没稳定，用户会看到热点点击区域短暂错位或抖动。

修复：

- `src/render.js` 在渲染图片舞台时根据 `imageWidth/imageHeight` 写入 `aspect-ratio`。
- `<img>` 同步写入 `width` 和 `height` 属性，让浏览器在图片加载前就能预留正确比例。
- 缺失或非法尺寸时回退到 1600x900。
- `tests/render.test.js` 增加 `getImageDimensions`、`aspect-ratio` 和 `<img width height>` 断言。
- 浏览器主流程继续校验图片内容区和热点容器尺寸、位置一致。

验证：

```text
npm.cmd run test:render
render.test.js passed

npm.cmd run test:build
build.test.js passed

npm.cmd run test:browser
browser.test.js passed
```

## 2026-05-31：详情抽屉键盘退出

继续检查点击热点后的详情抽屉交互时发现，抽屉虽然有关闭按钮，但键盘用户点击或回车打开 hotspot 后，焦点仍可能停留在图片热点上，`Escape` 也只能关闭大图 modal，不能关闭详情抽屉。

修复：

- `index.html` 给 `#detailPanel` 增加 `tabindex="-1"`，允许程序化聚焦。
- `src/app.js` 在点击热点并打开详情后，把焦点移动到详情抽屉。
- `Escape` 现在会优先关闭大图 modal；没有 modal 时关闭详情抽屉。
- `tests/browser.test.js` 覆盖热点点击后焦点进入详情抽屉、按 `Escape` 关闭详情，并继续重新点击热点完成后续追问流程。

验证：

```text
npm.cmd run test:browser
browser.test.js passed

npm.cmd run test:build
build.test.js passed
```

## 2026-05-31：图片 URL 协议校验

继续收紧持久化安全边界时发现，`imageUrl` 此前只校验为非空字符串。正常情况下它来自图片 provider，但如果持久化接口被直接调用，`javascript:`、`file:` 或 `data:text/html` 这类非图片地址可能进入历史恢复和保存按钮链路。

修复：

- `server/validation.js` 新增 `validateImageUrl`。
- 持久化 ChatImage 前只允许 `http://`、`https://` 或 `data:image/*`。
- 拒绝 `javascript:`、`file:`、`data:text/html` 和相对路径。
- `tests/validation.test.js` 覆盖合法 http(s)、合法 data:image 和非法协议。
- `tests/security.test.js` 在 HTTP 层验证恶意 `imageUrl` 返回 400。

验证：

```text
npm.cmd run test:validation
validation.test.js passed

npm.cmd run test:security
security.test.js passed

npm.cmd run test:browser-history
browser-history.test.js passed
```

## 2026-05-31：上游 API 请求超时

继续检查真实 API 代理可靠性时发现，文本接口、生图接口和异步任务详情轮询的单次 `fetch` 没有超时保护。如果上游连接一直挂起，前端会长时间停在“正在生成”状态，即使图片轮询本身有最大次数也无法覆盖单次请求卡住的情况。

修复：

- `server/providers.js` 新增 `fetchWithTimeout`，用 `AbortController` 给上游请求设置超时。
- `callTextApi`、`callImageApi` 和 `pollImageTask` 的详情请求都接入超时。
- `server.js` 新增 `apiRequestTimeoutMs` 配置，环境变量为 `CHATIMAGE_API_REQUEST_TIMEOUT_MS`，默认 45000ms。
- `.env.example` 和 README 同步新增该配置。
- `tests/error-paths.test.js` 增加文本请求超时和图片详情请求超时测试。

验证：

```text
npm.cmd run test:errors
error-paths.test.js passed

npm.cmd run test:adapter
api-adapter.test.js passed

npm.cmd run test:proxy
proxy-integration.test.js passed
```
## 2026-06-02: GPT5.5 同地址视觉适配与文本链路合并

继续落实“两遍法”真实闭环时，根据当前产品决策把视觉端点默认改为无垠 GPT5.5 文本接口同地址验证。实现中遇到的主要问题是：原 `/api/vision` 只支持 OpenAI-compatible `messages + image_url` JSON 形态，而无垠文本接口使用 `application/x-www-form-urlencoded`。如果只把环境变量指向同一个 URL，请求格式会不匹配。

处理：
- `server/providers.js` 新增 `wuyin-form` 视觉请求格式，沿用文本接口的表单提交方式，同时传入 `image_url`、`imageUrl` 和 `images` 字段；保留 `openai-chat` 格式用于后续独立视觉供应商。
- `server.js` 默认把 `CHATIMAGE_VISION_ENDPOINT` 指向无垠 GPT5.5 文本地址，`CHATIMAGE_VISION_MODEL` 默认为 `gpt-5.5`，`CHATIMAGE_VISION_REQUEST_FORMAT` 默认为 `wuyin-form`。
- `src/structure.js` 新增一次性 `rawAnswer + visualSpec` prompt 与解析归一化逻辑。
- `src/service.js` 默认使用 `answer_structure` 一次文本调用完成原始回答和结构化解析，减少一次文本 API 调用；旧的 answer/structure provider 保留给测试和兼容路径。
- 浏览器 fake upstream 测试同步支持 `purpose=answer_structure`，继续覆盖视觉对齐成功、视觉漏模块失败、图片错误、追问错误、历史恢复和视觉预检。
- `.env.example`、README 和视觉契约文档同步新增 `CHATIMAGE_VISION_REQUEST_FORMAT`。

验证：
```text
npm.cmd run test:structure
npm.cmd run test:service
npm.cmd run test:adapter
npm.cmd run test:proxy
npm.cmd run test:browser-api-alignment
npm.cmd run test:browser-vision-preflight
npm.cmd run test:browser-followup-error
npm.cmd run test:browser-image-error
npm.cmd run test:browser-history
npm.cmd test
```

结果：本地全量测试通过。真实视觉健康检查使用 `$env:CHATIMAGE_TEST_TEXT='0'; $env:CHATIMAGE_TEST_VISION='1'; npm.cmd run test:api`，配置确认为 `visionModel: gpt-5.5`、`visionRequestFormat: wuyin-form`，但上游返回“请求失败，账户余额不足或没有权限”，诊断阶段为 `vision`。随后普通文本 smoke 也返回同类账号/权限错误。当前代码已接好同地址视觉适配，但还不能证明该 GPT5.5 接口真实具备看图能力，需要恢复/确认上游账号权限后再次运行视觉健康检查。

## 2026-06-03: 本地 OCR 对齐重试与真实 smoke 通过

本轮继续推进“生图模型负责画图，本地 OCR 负责找真实热点”的路线，重点没有再增加新的兜底策略，而是把当前链路测通并暴露真实问题。

处理内容：
- 默认文本模型切到 `gemini-3.1-pro`，文本回答与结构化解析仍走一次合并调用。
- 默认视觉模式切到 `local-ocr`，`/api/vision/health` 不再只检查 worker 是否存在，而是跑完整链路：生成固定 fixture 图、data:image 解码、Python worker 启动、PaddleOCR 识别、JSON schema 校验、bounds 范围校验。
- 生图 prompt 要求每个模块卡片显示稳定编号 `01/02/03...`，作为 OCR 锚点；视觉对齐返回 `matchedText`、`ocrRaw`、`warnings`，方便调试。
- 如果图片已经生成但本地 OCR 对齐失败，后端不保存错误热点；前端错误态会保留生成图和 debug 数据，便于排查真实图片质量或 OCR 识别问题。
- 生图语言跟随用户提问语言，结构化阶段写入 `visualSpec.language`，prompt 中明确要求图片标题、卡片文字和标签使用相同语言。
- 新增 `scripts/create_ocr_health_fixture.py`，用 PIL 生成真实字体 PNG fixture，避免自绘 5x7 点阵字无法被 PaddleOCR 识别。

遇到的问题与解决：
- 最初健康检查 fixture 使用 JS 自绘 PPM 点阵字体，PaddleOCR 返回 `ocrRaw: []`。改为 PIL 渲染真实字体 PNG 后识别稳定。
- 当前安装的 PaddleOCR 不支持旧参数 `show_log`，worker 初始化失败。已改为优先使用新版 `use_textline_orientation`，再兼容旧版参数。
- PaddleOCR 新版返回 `rec_texts / rec_scores / rec_polys` 字典结构，旧解析器只支持列表结构，导致 `KeyError(0)`。已扩展解析器支持新版输出，并优先使用 `predict()`。

验证：
```text
python -m py_compile scripts/local_ocr_worker.py scripts/create_ocr_health_fixture.py
npm.cmd run test:local-ocr
npm.cmd test

$env:CHATIMAGE_TEST_TEXT='1'; $env:CHATIMAGE_TEST_IMAGE='1'; $env:CHATIMAGE_TEST_VISION='1'; npm.cmd run test:api
```

结果：
- 全量测试通过。
- 文本 API 通过，返回 `ChatImage API 文本接口连通。`
- 生图 API 通过，生成 PNG URL，并保存到 `tmp/test-artifacts/real-api-smoke-image.png`。
- 本地 OCR health 通过，返回 provider 为 `local-ocr`，并识别出 3 个 fixture 模块。

## 2026-06-03: Fix local OCR hotspot boxes on real ZJU president image

Failure reproduced from the page debug panel: text generation and image generation succeeded, but hotspot alignment failed with safe-margin, minimum-click-area and overlap errors. The generated image was kept in the debug panel, and no invalid hotspots were saved.

Root cause:
- The image model placed some numeric anchors (`01`, `04`) very close to the left image edge.
- PaddleOCR correctly detected the numeric anchors, but the worker sometimes used only the tiny OCR number box instead of the full visual card.
- The previous number matcher treated substrings like `2024` as a match for module `02`, which could bind a module to summary text instead of the card anchor.
- Row grouping used each anchor y-coordinate as a separate row, so `01/02/03` with tiny y-offsets were treated as different rows and card text was excluded from the grouping window.

Fix:
- `scripts/local_ocr_worker.py` now only treats real two-digit anchors as number matches.
- The worker clusters numeric anchors into visual rows.
- The worker infers a card-level bounds box by grouping OCR text inside the same row and column, then clips it to the column and safe area.
- Safe-area fitting now clips edge cards instead of shifting the whole box, avoiding new overlaps.
- A one-pixel inset prevents floating-point values from landing exactly on the safe-boundary limit.

Verification:
```text
python -m py_compile scripts/local_ocr_worker.py
npm.cmd run test:local-ocr
npm.cmd test
$env:CHATIMAGE_TEST_TEXT='0'; $env:CHATIMAGE_TEST_IMAGE='0'; $env:CHATIMAGE_TEST_VISION='1'; npm.cmd run test:api
```

Result:
- The exact failed image `https://openpt.wuyinkeji.com/6891a9cbe71343dabf6b7b18128db876.png` now produces 6 valid module bounds.
- `validateLayoutRegions` returns `valid: true`.
- Full local tests and local OCR health check pass.

## 2026-06-03: Prevent product-prompt leakage and fix hub OCR overlap

A real test case for "介绍一下具身智能产业的发展" generated an image about ChatImage internals instead of the user's subject. The visible modules included terms such as "结构化", "布局规划", "生图接口", and "区域追问". That was unacceptable because the user did not ask about ChatImage itself.

Root cause:
- The mock LLM and mock visual spec still contained hard-coded ChatImage workflow content.
- If the browser was in mock/fallback mode, or if a structured response was rejected and fell back, those internal workflow modules could be sent to the image model.
- The same generated hub-style image also exposed an OCR issue: the local OCR worker grouped center text into the left "05" card, causing `region_module_1 overlaps region_module_5`.

Fix:
- `src/service.js` mock answer now returns neutral topic-oriented content rather than ChatImage workflow text.
- `src/structure.js` mock spec now uses generic subject modules: background, current state, drivers, challenges, and trends.
- The answer-structure prompt now explicitly forbids mentioning ChatImage internals unless the user asks about ChatImage itself.
- `normalizeVisualSpec` detects internal product terms in non-ChatImage questions and falls back to the safe topic spec.
- `scripts/local_ocr_worker.py` now uses true two-dimensional anchor distance for grouping OCR text, so text left of another anchor is not incorrectly assigned to that anchor.
- Hub/freeform OCR grouping now passes both the ZJU president failed image and the embodied-intelligence failed image.

Verification:
```text
npm.cmd run test:structure
npm.cmd run test:service
npm.cmd run test:local-ocr
npm.cmd run test:browser-followup-error
npm.cmd test
$env:CHATIMAGE_TEST_TEXT='0'; $env:CHATIMAGE_TEST_IMAGE='0'; $env:CHATIMAGE_TEST_VISION='1'; npm.cmd run test:api
```

Result:
- Full test suite passes.

## 2026-06-03: Harden upload rejection paths

The upload flow now treats unsupported or unreadable files as attachment-level rejections rather than page-level errors.

Changes:
- Added content sniffing for text uploads. Files that look binary even with a `.txt` extension are rejected with a clear unsupported-content message.
- Empty text files are rejected before entering the model context.
- Browser `File.text()` read failures are caught and shown as attachment errors.
- The app-level file selection handler now catches unexpected attachment reader failures and renders them in the upload area.

Verification:
```text
node --check src/files.js
node --check src/app.js
node --check tests/files.test.js
npm.cmd run test:files
npm.cmd run test:browser
npm.cmd run test:build
npm.cmd test
```

Result:
- Full test suite passes.

## 2026-06-03: Expand file upload support for text-based source materials

This pass expanded the upload feature as a browser-side text attachment flow.

Supported files:
- Text and Markdown: `.txt`, `.md`, `.markdown`, `.rst`, `.adoc`
- Data files: `.csv`, `.tsv`, `.json`, `.jsonl`, `.ipynb`, `.yaml`, `.yml`, `.toml`
- Web and structured text: `.html`, `.htm`, `.xml`, `.svg`
- Logs and config: `.log`, `.ini`, `.conf`, `.config`, `.properties`, `.env`
- Common source files including JS/TS/CSS/Python/Java/Go/Rust/C/C++/C#/PHP/Ruby/Swift/Kotlin/Shell/SQL/GraphQL, plus files such as `Dockerfile` and `Makefile`

Limits:
- Up to 5 files.
- Each file must be no larger than 512 KB.
- Each file contributes up to 12,000 characters to the model context.
- PDF, Word, PPT, Excel, images, archives and other binary files are explicitly rejected for now.

Implementation:
- `src/files.js` now centralizes supported groups, accept-list generation, binary rejection messages, visible-question generation and prompt composition.
- The composer supports both the upload button and drag/drop.
- Uploaded files remain visible as chips and can be removed before generation.
- The model receives the full prompt with file context, while the UI/history keep the user-visible question clean.
- README and the technical design doc now document the current support boundary.

Verification:
```text
node --check src/files.js
node --check src/app.js
node --check src/service.js
npm.cmd run test:files
npm.cmd run test:browser
npm.cmd test
```

Result:
- Full test suite passes.
- Local OCR health passes.
- The exact failed image `https://openpt.wuyinkeji.com/a8c6ccc16b7542ce9f18f30c61ce9340.png` now returns valid, non-overlapping hotspot bounds.

## 2026-06-03: Center detail overlay, cleaner shell, and subject-only fallback copy

This pass focused on the user-facing interaction and the repeated-question wording seen in hotspot detail panels.

Changes:
- The fallback structure generator now extracts the subject from questions such as `介绍一下具身智能产业的发展`, so module details use `具身智能产业的发展` instead of repeating the full question phrase.
- The follow-up/detail panel is now a centered overlay sized around 60% of the viewport on desktop. It opens after a hotspot click and closes from the close button, Escape, or the backdrop.
- Recent records stay in the sidebar. If there are no recent records, the main workspace spans the full width so the image stage does not collapse into the sidebar column.
- The question composer is docked at the bottom with a simpler chat-style treatment.
- The visual style was simplified toward a Claude-like product shell: warm neutral background, ink text, restrained borders, low decoration, and a clay primary action color.

Issue found:
- In the dist browser test, the image stage collapsed to about 202px because the hidden history sidebar caused CSS Grid auto-placement to put the main panel in the first narrow column.

Fix:
- Added explicit grid placement for `.main-panel`.
- Added a sibling rule so `.history-panel[hidden] + .main-panel` spans all columns.

Verification:
```text
node --check src/structure.js
node --check src/app.js
npm.cmd run test:structure
npm.cmd run test:browser
npm.cmd run test:browser-dist
npm.cmd test
```

Result:
- Full test suite passes.
