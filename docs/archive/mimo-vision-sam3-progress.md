# MiMo 视觉定位与 SAM3 抠图进展

## 现在怎么分工

当前链路分成三层：

1. LocateAnything 先尝试框区域。
2. 如果 LocateAnything 只给出布局引导框，或者漏掉区域，就让 MiMo 视觉模型 `mimo-v2.5` 看图补 box。
3. SAM3 不负责找目标，只负责在最终 box 里面精细抠 mask。

也就是说：**MiMo/Locate 负责“框出来”，SAM3 负责“抠出来”。**

## 为什么要加 MiMo 视觉

之前西湖手绘地图里，LocateAnything 对中文地理区域理解比较弱。它经常返回整张图，或者只能依赖我们生成图前的 planned 区域。

这会导致一个问题：看起来热点都有，但严格来说不是模型真正看懂后定位出来的。

MiMo `mimo-v2.5` 支持视觉输入，而且和文本模型使用同一套 base URL/key，所以把它作为语义补框模型比较合适。

## 现在的配置方式

不要直接把主视觉模式改成纯 `mimo-vision`，否则会跳过 LocateAnything 和 SAM3。

推荐配置是：

```env
CHATIMAGE_VISION_MODE=locateanything
CHATIMAGE_VISION_FALLBACK_MODE=mimo-vision
CHATIMAGE_VISION_BASE_URL=https://api.xiaomimimo.com/v1
CHATIMAGE_VISION_MODEL=mimo-v2.5
```

如果没有单独设置 `CHATIMAGE_VISION_API_KEY`，MiMo 视觉会复用 `CHATIMAGE_TEXT_API_KEY`。

## 这次真实测试结果

用西湖手绘地图旧样例重新跑了一次：

- 链路：`LocateAnything -> MiMo vision -> SAM3`
- 8 个区域都有最终 box
- 8 个区域都有 SAM3 mask
- 7 个区域由 MiMo vision 补框
- 1 个区域由 LocateAnything 命中
- 没有 planned fallback

这说明 MiMo 视觉确实补上了 LocateAnything 在中文语义定位上的短板。

另外，完整 `npm.cmd test` 已经跑通。当前固定服务还是 `http://127.0.0.1:5178/`，视觉配置是：

- 主模式：`locateanything`
- 语义补框：`mimo-vision`
- 视觉模型：`mimo-v2.5`
- 精细抠图：SAM3

## 这次又修了什么

之前 SAM3 虽然已经抠出了 mask，但前端点击层还是矩形框，所以用户点到的范围并没有真正贴合物体。

现在改成：

- SAM3 worker 返回 mask 的轮廓点 `polygon`。
- 后端把 `polygon` 一路带到 hotspot。
- 历史记录保存 hotspot 时也保存 mask 和 polygon，刷新后不会丢。
- 前端有 polygon 时用 SVG 形状热点，真正可点击的是 SAM3 轮廓，不再只是矩形框。
- 正常模式下热点仍然完全透明；校准模式下才显示形状轮廓。
- 审计 overlay 优先画 SAM3 轮廓，不再只画 mask 外接矩形。

另外也收紧了 MiMo 视觉补框提示词：地图、海报、场景图里，文字牌和标签只作为线索，应该优先框真实画出来的地理区域、路线、桥、建筑、水域、山体或物体。

## 还没完全解决的事

现在的数字变好了，但还不能只看数字。

后续还要继续看 overlay 图和每个区域预览，判断：

- box 是否真的框住目标
- 目标描述是否清楚
- SAM3 mask 是否抠到主体
- 预览图是否看起来像用户点中的区域

严格测试仍然会保留，防止“有框但框错”的情况被误判成成功。

最新西湖审计里，所有 8 个区域都有 polygon mask，但仍有几个风险点：`module_2`、`module_3` 的 SAM 分数偏低，`module_4` 的 mask 相对 box 偏小。这类情况不能算完全解决，后面要继续靠 overlay 和预览图做人工/视觉审计。

## 这次继续修正

这次看到的 overlay 仍然不够合理，主要不是前端渲染问题，而是定位链路里还有“语义框对错对象”的问题：

- 有些区域框到了文字说明栏或附近小建筑，不是实际景观实体。
- “南北对景”这种抽象关系容易被模型误框成单个景点或大竖框。
- 苏堤、白堤这种线性长堤，SAM 直接按 box 抠图不稳定，容易出现低分或轮廓不贴合。
- 审计 overlay 里的候选 box 太醒目，容易误导成“点击区域还是矩形框”。

本轮改动：

- MiMo 先给候选 box 后，再用 MiMo 做一次视觉质检和纠偏；如果候选框到文字栏、无关区域或错误景点，会要求返回 correctedBounds。
- 定位请求会把模块的 detail/sourceExcerpt 也传给视觉定位，不再只给短标题。
- 地图类目标增加专门规则：route、landmark、water、abstract/axis 分粒度定位。
- route/堤/桥/对景轴线这类目标，如果 SAM 分数偏低，会退到一条更窄的 corridor polygon，而不是继续使用低质量 SAM mask 或大矩形。
- 审计 overlay 里候选 box 已弱化，最终 SAM/corridor polygon 才是主视觉。

最新西湖审计结果：

- 链路仍是 `LocateAnything -> MiMo vision -> SAM3`
- 8 个区域全部由 MiMo 语义定位
- 8 个区域都有 polygon
- 白堤和南北对景已使用 corridor fallback，避免低分 SAM 乱抠
- MiMo 视觉复审结论：整体基本可接受，但仍有重叠和局部模糊，后续还要继续优化

还需要确认的一点：像“南北对景”这种抽象关系，到底应该作为一个可点击热点存在，还是只在详情文本里解释。如果保留成热点，它更像一条视觉轴线，不会像塔、亭、桥那样有明确物体边界。

## 下一步

1. 用更多类型样例测试：地图、海报、场景图、设备结构图、流程图。
2. 继续优化生图 prompt，让图里的区域边界更清楚，方便 SAM3 抠。
3. 给审计报告增加更直观的 boxSource / maskSource 展示。
4. 必要时把人工校准结果写回，作为低置信区域的补救方案。

## 这次最终修复

这次又发现一个真正的 bug：SAM3 环境里有时走不到 OpenCV 轮廓提取，会落到备用的边界采样逻辑。旧备用逻辑是按扫描行取点，点的顺序不是轮廓顺序，所以 overlay 会把这些点横着连起来，看起来像一堆红色横纹。

现在已经改成：备用逻辑先取边界点，再算凸包，按轮廓顺序输出 polygon。这样即使没有 OpenCV，也不会把 mask 画成横纹。

同时又给 MiMo 视觉定位和二次质检补了更明确的规则：

- 标签、题签、说明牌只能当线索，不能替代真实地物。
- 景点、建筑、桥、堤、水域要优先框真实画出来的实体或区域。
- 抽象关系，比如南北对景、轴线、关系线，如果图里没有明确可见的线或区域，就不要硬框到附近景点。
- 允许部分重叠，但每个热点都要有自己的语义理由。

最新西湖样例审计：

- 链路：`LocateAnything -> MiMo vision -> SAM3`
- 8 个区域全部由 MiMo 语义定位
- 8 个区域全部有 polygon
- 没有 planned fallback
- 横纹 polygon 检测为 0
- `npm.cmd test` 全部通过

当前我认为它已经从“链路跑通但视觉不可信”，推进到“基础可用、仍需多样例继续打磨”的状态。尤其是地图、海报、场景图这类非流程图，后续重点不应只加兜底，而是继续提升两件事：生成图本身要把可交互区域画清楚，语义定位要更稳定地区分真实实体和文字标注。

## 对象级抠图预览

这次明确了一个产品目标：点击热点后，详情里的预览不应该只是“截一块矩形区域”，而应该像抠图一样，只展示用户点中的语义对象。比如导览机器人热点，预览里应该只有机器人本体和“AI个性化导览”文字徽标，不应该带着大厅、地面和旁边人物。

本轮已经做了三件事：

- 前端详情预览优先用 canvas 把原图和 SAM3 mask 合成透明 PNG，再自动按 alpha 边界裁紧。生成成功时显示“主体抠图预览”，失败时回退到旧的区域裁剪预览。
- 增加 `object-with-label` 语义类型。场景图、海报图里，如果一个热点由主体对象和短标签/徽标组成，结构化阶段会更倾向把它当成一个组合目标。
- MiMo 视觉定位可以返回 `components`，例如一个组件是 `object`，另一个组件是 `label`。SAM3 worker 会分别对组件 box 分割，再把 mask 合并成一个热点 mask。

这一步解决的是“展示效果”和“组合目标”问题。后续还要继续验证真实样例：如果 SAM3 对文字徽标分割不稳定，可能需要专门给 label/badge 走更简单的矩形或圆角矩形 mask，再和 object mask 合并。

## 多样例真实验收后的修复

这次继续跑真实样例时，发现问题不在单一模型，而在几段链路之间的配合：

- 结构化层有时会把标题修成“阳光海岸栈道”，但图内短文案还残留“西海岸路线”，生图会被这个短文案带偏。
- 路线类预览只跟着很细的 route mask 裁剪，容易把路线旁边的标签裁掉，看起来像点错了。
- 住宿点、索道入口这类地图图例目标，MiMo 视觉偶尔会框到中部大景区。几何上合法，但语义上不对。

这轮做了三个修复：

- 三清山地图结构化会同步修正 `title`、`imageText`、`regionPrompt` 和 `maskPolicy`，避免同一个模块里出现互相矛盾的“西海岸/阳光海岸”。
- 路线预览的裁剪源区域改成 `SAM mask + SAM inputBounds + layout plannedBounds` 的并集，保证路线旁的短标签和一点地形上下文能留下来。
- 对 map 里的 legend/panel 类紧凑目标增加 planned distance guard：如果视觉模型给的框离规划位置太远，就拒绝这个框并回退到 planned，不再把“山上住宿点”错框成南清园核心景区。

最终真实验收：

- `sanqing-map`: OK，score 100，住宿点、阳光海岸、西海岸都通过完整图和预览图视觉检查。
- `westlake-map`: OK，score 100，9 个西湖区域热点，5 个目标预览都通过视觉检查。
- `museum-scene`: OK，score 100，导览机器人使用主体 + 标签抠图预览。

本地验证也通过：

- `npm.cmd test`
- `npm.cmd run build`

当前固定服务仍然是 `http://127.0.0.1:5178/`，LocateAnything 和 SAM3 继续常驻，实际语义补框仍主要依靠 MiMo vision，SAM3 负责把已有框细分成 mask。

## 继续测试后的质量修复

这轮继续做了更严格的真实样例验证，发现了几个容易反复出现的小坑：

- 上一轮抽取 `preview-strategy` 时，`src/app.js` 里还保留了同名 `normalizeBounds` / `padNormalizedBounds`，导致前端语法直接失败。已清掉重复声明。
- 路线热点如果只按 SAM3 的紧 mask 裁剪，容易丢掉路线旁边的短标签。现在路线预览会合并 `SAM mask + SAM inputBounds + layout plannedBounds`，保留路线、标签和一点地形上下文。
- `阳光海岸栈道` 不能被生图写成“东侧日出山脊栈道”这种别名。结构化层和生图 prompt 都要求路线短标签保留 exact title。
- `山上住宿点` 不再按普通 legend 处理，而是按“地图上的房屋/床位对象 + 短标签”处理；如果 SAM3 分数偏低，会回退到语义框整体预览，避免把住宿点切成碎片。
- `曲院风荷` 这类景点详情里会出现“曲桥”，旧规则会误判为 route 并走 corridor fallback，导致预览变成长矩形。现在 route fallback 只允许真正的 `regionKind=route/axis` 或 `maskPolicy=route` 触发。

最新分开跑的真实验收：

- `sanqing-map`: OK，score 100。
- `westlake-map`: OK，score 100。
- `museum-scene`: OK，score 100。

补充说明：全量串行真实验收有一次卡在上游真实生成等待，没有落结果文件；相同三个 case 已改用单例方式完整跑完并通过。基础自动测试 `npm.cmd test` 和构建 `npm.cmd run build` 也已通过。
