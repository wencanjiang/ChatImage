# ChatImage Test Cases Catalog

This catalog lists all **33 real test cases** for daily-life conversation
patterns. Cases live in `scripts/generate-real-demo-cases.js`'s `CASES`
array. Run all of them or a subset via env var.

## Usage

```bash
# Run all 33 cases
node scripts/generate-real-demo-cases.js

# Run a specific subset (comma-separated case ids)
CHATIMAGE_REAL_DEMO_CASES=morning-routine-plan,git-conflict-resolution \
  node scripts/generate-real-demo-cases.js

# Increase wait time for slow upstream (PowerShell)
$env:CHATIMAGE_REAL_DEMO_WAIT_MS='720000'; node scripts/generate-real-demo-cases.js
```

Outputs land in `tmp/real-demo-run/<case-id>/`:
- `result.json` — full ChatImage state (modules, hotspots, alignment)
- `page-state.json` — rendered DOM snapshot
- `page.png` — full-page screenshot

## Category Distribution

| Category | Count | Use case |
|----------|-------|----------|
| **map** | 3 | Hand-drawn tour maps and itineraries |
| **scene** | 10 | Illustrated rooms, daily routines, immersive spaces |
| **technical** | 6 | Process flows and step-by-step explanations |
| **business** | 14 | Plans, checklists, comparisons, funnels |
| **Total** | **33** | |

## All 33 Cases

### Maps (3)
- `west-lake-tour-map` — 西湖手绘游览图
- `campus-handdrawn-map` — 大学校园导览地图
- `weekend-hangzhou-itinerary` — Weekend Hangzhou itinerary (EN)

### Scenes (10) — ⭐ = newly added
- `future-museum-scene` — 未来博物馆沉浸场景
- `boutique-coffee-scene` — 精品咖啡店温暖场景
- `smart-home-living-room` — 智能家居客厅
- `morning-routine-plan` ⭐ — 高效早晨日常
- `healthy-breakfast-options` ⭐ — 健康早餐选择
- `newborn-care-day` ⭐ — 新生儿一天护理
- `cat-litter-box-setup` ⭐ — 猫砂盆角落布置
- `yoga-flexibility-routine` ⭐ — 瑜伽柔韧训练
- `sleep-hygiene-checklist` ⭐ — 卧室睡眠优化
- `garden-balcony-layout` ⭐ — 阳台小花园布局

### Technical (6)
- `oauth2-flow` — OAuth 2.0 授权码流程
- `ielts-study-roadmap` — IELTS 12-week study plan (EN)
- `react-performance-debug-flow` — React performance debug (EN)
- `japanese-ramen-cooking` ⭐ — 日式叉烧拉面家常做法
- `coffee-brewing-methods` ⭐ — Four coffee brewing methods (EN)
- `git-conflict-resolution` ⭐ — Git merge conflict resolution (EN)

### Business / Planning (14)
- `ecommerce-funnel` — 电商转化漏斗
- `household-budget-plan` — Household budget (EN)
- `weekly-meal-prep-plan` — Weekly meal prep (EN)
- `electric-toothbrush-comparison` — Toothbrush comparison (EN)
- `interview-prep-plan` — PM interview prep (EN)
- `home-moving-checklist` — Moving-home checklist (EN)
- `weekly-fitness-plan` ⭐ — Weekly home fitness (EN)
- `personal-finance-roadmap` ⭐ — 25 岁理财路线图
- `career-transition-plan` ⭐ — SWE to PM transition (EN)
- `dog-training-routine` ⭐ — Puppy training (EN)
- `online-shopping-decision` ⭐ — 理性购物决策
- `running-marathon-prep` ⭐ — Half-marathon training (EN)
- `language-learning-routine` ⭐ — Daily language learning (EN)
- `freelance-onboarding-flow` ⭐ — Freelance client onboarding (EN)

## Coverage Rationale

The 18 newly added cases extend coverage across daily-life conversation
themes that the original 15 cases did not address:

- **Health & wellness** — fitness plan, marathon prep, yoga, sleep hygiene
- **Nutrition & cooking** — healthy breakfast, ramen recipe, coffee brewing
- **Personal finance** — finance roadmap, online-shopping decisions
- **Career** — career transition, freelance onboarding
- **Learning** — language learning routine
- **Parenting & pets** — newborn care, dog training, cat litter setup
- **Daily routines** — morning routine, garden balcony layout
- **Developer tools** — Git conflict resolution

The mix spans **map / scene / technical / business** categories with a
deliberate lean toward **scene** (illustrated daily-life snapshots) and
**business** (planning visuals), since those are the most common ChatGPT
use cases for visual answers.

## Adding a new case

Append an entry to `CASES` in `scripts/generate-real-demo-cases.js`:

```js
{
  id: "your-case-id",                          // kebab-case, used as folder name
  category: "map" | "scene" | "technical" | "business",
  question: "Your prompt sent to the LLM",
  extraInstruction: "Optional anti-pattern guard"  // e.g. for maps: avoid pins
}
```

Then run that single case to verify:

```bash
CHATIMAGE_REAL_DEMO_CASES=your-case-id node scripts/generate-real-demo-cases.js
```

If alignment fails, check `tmp/real-demo-run/your-case-id/diagnostics.json`
for upstream errors.
