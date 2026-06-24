# Task Plan: ChatImage Multi-Instance QA and Demo Refresh

## Objective

Verify the latest hotspot/detail/preview fixes against multiple interactive instances, preserve each instance state for reuse, then update the public showcase page with several good clickable demos.

## Phases

1. Confirm regression tests cover the reported issues. `completed`
2. Run 5-10 diverse interactive cases and save full state/artifacts. `completed`
3. Analyze results and select the best showcase demos. `completed`
4. Update `docs/index.html` and demo assets/data so the showcase uses good interactive cases. `completed`
5. Run build/tests and summarize reusable artifact locations. `completed`

## Quality Gates

- No raw SAM CSS mask/cutout-only semantic preview should appear for map/scene/poster regions.
- Hotspot detail title must match the clicked region.
- Clickable hotspots must open detail panels.
- Demo page entries must be interactable, not just static screenshots.

## Artifact Target

- Multi-case run artifacts: `tmp/latest-multi-instance-analysis-*`
- Demo assets: `docs/assets/demos/`

## Latest Result

- Final selected artifact: `tmp/latest-multi-instance-analysis-20260623-212957-selected`
- Selected cases: agent workflow, REST/GraphQL, RAG pipeline, OAuth2 login flow, ecommerce funnel, smartwatch exploded view, West Lake map, future museum scene, campus guide map.
- Result: 9/9 OK, average score 100, full state split under `cases/<case-id>/state.json`.
