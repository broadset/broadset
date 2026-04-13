# Code Split Plan

Date: 2026-04-13
Status: Proposed (planning only; no implementation in this document)
Scope: Reduce oversized source files below 500 lines, then reduce highest-overage test files

---

## 1. Goal

Primary objective:

- Bring all non-test `.ts` / `.tsx` / `.js` files currently over 500 lines to under 500 lines.

Secondary objective:

- Split the worst oversized test files (highest overage above 500) to improve maintainability and test isolation.

Definition of done for this plan:

- Every currently oversized non-test file is below 500 lines.
- All priority oversized tests listed in Section 3.2 are below 500 lines.
- Root verification passes: `npm run quality:all && npm run build && npm run ct`.

---

## 2. Constraints

This plan must comply with:

- `project/implementation/architecture.md` package boundaries.
- `AGENTS.md` and `CONTRIBUTING.md` quality and workflow gates.
- Existing package-root barrel export strategy (`src/index.ts`), with public APIs preserved.

Non-negotiables:

- No behavior change from split-only work.
- No lint/type suppression.
- No boundary violations between workspace packages.

---

## 3. Current Baseline (2026-04-13)

### 3.1 Oversized Non-Test Files (>500 lines)

1. 1440 - `packages/ui/src/timeline.tsx`
2. 1354 - `packages/formats/src/psd.ts`
3. 1304 - `packages/ui/src/inputs.tsx`
4. 1079 - `packages/formats/src/pptx.ts`
5. 982 - `packages/ui/src/modals.tsx`
6. 836 - `packages/editor/src/store-actions.ts`
7. 817 - `packages/renderer/src/screen-renderer.ts`
8. 768 - `packages/editor/src/editing.ts`
9. 760 - `packages/formats/src/pdf.ts`
10. 754 - `packages/demo/src/demo-components.tsx`
11. 735 - `packages/playback/src/playback-dom.ts`
12. 661 - `packages/formats/src/web-vector.ts`
13. 607 - `packages/editor/src/path-geometry.ts`
14. 582 - `packages/playback/src/interpolation.ts`
15. 579 - `packages/model/src/element.ts`
16. 575 - `packages/editor/src/collaboration.ts`

### 3.2 Priority Oversized Test Files (Worst Overage)

Priority set A (>=900 lines):

1. 3096 - `packages/ui/src/panels.test.tsx`
2. 1755 - `packages/demo/src/DemoApp.test.tsx`
3. 1308 - `packages/demo/ct/canvas-selection-transform.ct.tsx`
4. 1193 - `packages/ui/src/timeline.test.tsx`
5. 1065 - `packages/editor/src/editing.test.ts`
6. 1006 - `packages/ui/src/modals.test.tsx`
7. 955 - `packages/editor/src/keyboard.test.ts`

Priority set B (700-899 lines; tackle after set A if capacity allows):

1. 883 - `packages/ui/src/inputs.test.tsx`
2. 728 - `packages/renderer/src/renderer.test.ts`
3. 721 - `packages/model/src/animation.test.ts`
4. 706 - `packages/playback/src/playback-controller.test.ts`

---

## 4. Split Strategy

### 4.1 Principles

- Use concern-based extraction first: `types.ts`, `constants.ts`, `helpers.ts`, `hooks.ts`, `actions/*`, `panels/*`, `serializers/*`, `parsers/*`.
- Keep file movement mostly internal to each package.
- Preserve package root exports. Avoid introducing cross-package imports not allowed by architecture rules.
- Prefer small batches of 5 files per implementation cycle to limit merge risk.

### 4.2 Safe Split Pattern

For each oversized file:

1. Extract pure constants/types first (zero behavior impact).
2. Extract stateless helpers next.
3. Extract feature submodules/components.
4. Keep original file as orchestrator/facade until final shrink.
5. Run package tests + typecheck after each batch.

---

## 5. Work Plan (Batches of 5)

## Batch 1 - Highest-impact UI shell and demo composition

Target files:

1. `packages/demo/src/DemoApp.tsx`
2. `packages/demo/src/demo-components.tsx`
3. `packages/ui/src/property-panels.tsx`
4. `packages/ui/src/inputs.tsx`
5. `packages/ui/src/modals.tsx`

Planned extraction map:

- `DemoApp.tsx` -> `demo-app/layout.tsx`, `demo-app/sidebar.tsx`, `demo-app/timeline-bindings.ts`, `demo-app/command-handlers.ts`, `demo-app/notifications.tsx`.
- `demo-components.tsx` -> `demo-components/canvas-shell.tsx`, `demo-components/selection-overlay.tsx`, `demo-components/transform-handles.tsx`, `demo-components/harness.tsx`.
- `property-panels.tsx` -> `panels/property/text-panel.tsx`, `panels/property/image-panel.tsx`, `panels/property/shape-panel.tsx`, `panels/property/shared-fields.tsx`.
- `inputs.tsx` -> `inputs/number-inputs.tsx`, `inputs/color-inputs.tsx`, `inputs/asset-inputs.tsx`, `inputs/validation.ts`.
- `modals.tsx` -> `modals/asset-modal.tsx`, `modals/export-modal.tsx`, `modals/settings-modal.tsx`, `modals/shared.tsx`.

Exit criteria:

- All five target files below 500 lines.
- Existing UI behavior unchanged in demo.

## Batch 2 - Timeline and formats heavy modules

Target files:

1. `packages/ui/src/timeline.tsx`
2. `packages/formats/src/psd.ts`
3. `packages/formats/src/pptx.ts`
4. `packages/formats/src/pdf.ts`
5. `packages/formats/src/web-vector.ts`

Planned extraction map:

- `timeline.tsx` -> `timeline/model.ts`, `timeline/track-list.tsx`, `timeline/playhead.tsx`, `timeline/keyframe-editor.tsx`, `timeline/utils.ts`.
- `psd.ts` -> `formats/psd/import.ts`, `formats/psd/export.ts`, `formats/psd/layer-mapping.ts`, `formats/psd/image-io.ts`.
- `pptx.ts` -> `formats/pptx/import.ts`, `formats/pptx/export.ts`, `formats/pptx/ooxml.ts`, `formats/pptx/style-mapping.ts`.
- `pdf.ts` -> `formats/pdf/export.ts`, `formats/pdf/font-embedding.ts`, `formats/pdf/vector-rendering.ts`, `formats/pdf/image-rendering.ts`.
- `web-vector.ts` -> `formats/web-vector/svg-import.ts`, `formats/web-vector/svg-export.ts`, `formats/web-vector/html-export.ts`.

Exit criteria:

- All five target files below 500 lines.
- Format round-trip/unit tests remain green.

## Batch 3 - Editor and renderer core modules

Target files:

1. `packages/editor/src/store-actions.ts`
2. `packages/editor/src/editing.ts`
3. `packages/editor/src/collaboration.ts`
4. `packages/editor/src/path-geometry.ts`
5. `packages/renderer/src/screen-renderer.ts`

Planned extraction map:

- `store-actions.ts` -> `store-actions/selection.ts`, `store-actions/transform.ts`, `store-actions/history.ts`, `store-actions/animation.ts`.
- `editing.ts` -> `editing/commands.ts`, `editing/clipboard.ts`, `editing/text-editing.ts`, `editing/selection-ops.ts`.
- `collaboration.ts` -> `collaboration/diff.ts`, `collaboration/apply.ts`, `collaboration/patch-normalize.ts`.
- `path-geometry.ts` -> `path-geometry/booleans.ts`, `path-geometry/measure.ts`, `path-geometry/normalize.ts`, `path-geometry/intersections.ts`.
- `screen-renderer.ts` -> `screen-renderer/base-render.ts`, `screen-renderer/style-resolve.ts`, `screen-renderer/content-resolve.ts`, `screen-renderer/element-renderers/*`.

Exit criteria:

- All five target files below 500 lines.
- Editor interaction and renderer parity tests remain green.

## Batch 4 - Playback/model/demo data generation modules

Target files:

1. `packages/playback/src/playback-dom.ts`
2. `packages/playback/src/interpolation.ts`
3. `packages/model/src/element.ts`

Planned extraction map:

- `playback-dom.ts` -> `playback-dom/bindings.ts`, `playback-dom/style-apply.ts`, `playback-dom/visibility.ts`, `playback-dom/runtime-guards.ts`.
- `interpolation.ts` -> `interpolation/number.ts`, `interpolation/color.ts`, `interpolation/tuple.ts`, `interpolation/easing.ts`.
- `element.ts` -> `element/style-types.ts`, `element/content-types.ts`, `element/guards.ts`, `element/defaults.ts`.

Exit criteria:

- All three target files below 500 lines.
- Model and playback tests remain green.

---

## 6. Priority Test Split Plan

## Test Batch T1 - Priority set A phase 1

Target files:

1. `packages/ui/src/panels.test.tsx`
2. `packages/demo/src/DemoApp.test.tsx`
3. `packages/demo/ct/canvas-selection-transform.ct.tsx`
4. `packages/ui/src/timeline.test.tsx`
5. `packages/editor/src/editing.test.ts`

Split approach:

- Convert monolithic suites into scenario-focused files by region/feature.
- Keep shared test harnesses in local `test-helpers/` modules.
- For CT: split by scenario groups and keep scenario IDs aligned with `project/implementation/ct-testing.md`.

Suggested resulting files:

- `panels.*.test.tsx` (properties, layers, data, animation, validation)
- `DemoApp.*.test.tsx` (shell, commands, selection flow, import/export, timeline)
- `canvas-selection-transform.*.ct.tsx` (selection, drag, resize, rotate, constraints)
- `timeline.*.test.tsx` (playhead, keyframes, tracks, easing, edge-cases)
- `editing.*.test.ts` (selection ops, command ops, text ops, clipboard ops)

## Test Batch T2 - Priority set A phase 2

Target files:

1. `packages/ui/src/modals.test.tsx`
2. `packages/editor/src/keyboard.test.ts`

Then split set B:

1. `packages/ui/src/inputs.test.tsx`
2. `packages/renderer/src/renderer.test.ts`
3. `packages/model/src/animation.test.ts`
4. `packages/playback/src/playback-controller.test.ts`

Exit criteria:

- Priority set A tests all below 500 lines.
- No loss in scenario coverage.

---

## 7. Verification Gates Per Batch

For each batch:

1. Package-local quality checks for touched packages.
2. Root checks after each completed batch:
   - `npm run quality:all`
   - `npm run build`
   - `npm run ct`

Before closing the full plan:

- Re-run line-count audit and confirm no target file remains above 500.

Recommended audit command:

```bash
git ls-files '*.ts' '*.tsx' '*.js' \
  | while IFS= read -r f; do wc -l "$f"; done \
  | awk '$1 > 500 {print $1 "\t" $2}' \
  | sort -nr
```

---

## 8. Risks and Mitigations

1. Risk: Behavior regression during extraction.

- Mitigation: Split in small batches; keep orchestrator facade; run tests after each extraction group.

2. Risk: Export/API drift.

- Mitigation: Preserve existing public exports through package `src/index.ts` and verify demo integration imports.

3. Risk: Scope creep while refactoring.

- Mitigation: Split-only PRs; no feature additions in the same change set.

4. Risk: CT scenario fragmentation.

- Mitigation: Keep explicit scenario ID references in split CT files.

---

## 9. Completion Checklist

- [ ] All 19 oversized non-test files listed in Section 3.1 are below 500 lines.
- [ ] Priority set A oversized tests listed in Section 3.2 are below 500 lines.
- [ ] Priority set B test splits completed.
- [ ] Root verification chain passes.
- [ ] This plan and any follow-up implementation docs are updated with final status.
