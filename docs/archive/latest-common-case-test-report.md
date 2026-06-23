# ChatImage 常见案例测试入口

更新时间：2026-06-15

## 为什么前端看不到

`npm.cmd run test:agent-eval` 跑的是离线回归：它会启动临时 mock 服务和无头浏览器，提交问题、模拟点击热点、检查详情质量并截图。  
这些结果不会写入当前 `http://127.0.0.1:5178/` 的历史记录，所以你在前端“最近”里看不到。

## 到哪里看

- 总报告：`tmp/agent-evaluation-test/agent-evaluation-report.md`
- JSON 原始报告：`tmp/agent-evaluation-test/agent-evaluation-report.json`
- 截图目录：`tmp/agent-evaluation-test/`
- 用例定义：`tests/agent-evaluation-cases.js`
- 真实文本结构化用例：`tests/structured-text-cases.json`

## 当前离线回归覆盖的 13 个案例

| 案例 | 类型 | 截图 |
| --- | --- | --- |
| Agent 工作流 | 信息图流程 | `tmp/agent-evaluation-test/agent-workflow.png` |
| REST vs GraphQL | 对比图 | `tmp/agent-evaluation-test/rest-graphql.png` |
| HTTP 页面渲染流程 | 技术流程 | `tmp/agent-evaluation-test/http-render-flow.png` |
| 西湖手绘地图 | 地图 | `tmp/agent-evaluation-test/west-lake-map.png` |
| 三清山旅游地图 | 地图 | `tmp/agent-evaluation-test/sanqing-map.png` |
| 未来博物馆场景 | 插画场景 | `tmp/agent-evaluation-test/museum-scene.png` |
| 智能手表爆炸图 | 产品结构 | `tmp/agent-evaluation-test/product-exploded-view.png` |
| RAG 工作链路 | 技术流程 | `tmp/agent-evaluation-test/rag-pipeline.png` |
| OAuth 2.0 登录流程 | 技术流程 | `tmp/agent-evaluation-test/oauth2-login-flow.png` |
| SQL vs NoSQL | 对比图 | `tmp/agent-evaluation-test/sql-nosql-compare.png` |
| Kubernetes 部署架构 | 技术架构 | `tmp/agent-evaluation-test/kubernetes-deployment.png` |
| 电商转化漏斗 | 业务漏斗 | `tmp/agent-evaluation-test/ecommerce-funnel.png` |
| 大学校园导览地图 | 地图 | `tmp/agent-evaluation-test/campus-guide-map.png` |

## 怎么重跑

```powershell
npm.cmd run test:agent-eval
```

跑完后查看：

```powershell
notepad tmp\agent-evaluation-test\agent-evaluation-report.md
explorer tmp\agent-evaluation-test
```

## 真实文本结构化测试说明

真实文本结构化案例在 `tests/structured-text-cases.json`。  
本轮新增了：

- `oauth2_login_flow`
- `sql_nosql_compare`
- `kubernetes_deployment`
- `ecommerce_funnel`

其中 `oauth2_login_flow` 和 `sql_nosql_compare` 在真实文本 API 请求中发生上游超时；离线回归已覆盖并通过。
