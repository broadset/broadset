# QA Analysis - Package-by-Package (Refreshed)

Date: 2026-04-14 10:30
Scope: model, playback, renderer, editor, formats, ui, demo
Method: targeted refresh of previous findings using current files under `project/spec/**` and `packages/**`.

## Verification Baseline (Refresh Scope)

- This refresh validates relevance and evidence paths after recent refactors.
- It does not re-run the full quality/build/CT chain; assertions below are based on source and test inspection.
- Demo Playwright CT is now split across seven files in `packages/demo/ct/`.

## Severity Legend

- HIGH: likely to block acceptance gates or create user-visible behavior gaps.
- MEDIUM: meaningful quality risk or significant maintainability/documentation drift.
- LOW: cleanup/naming/ergonomics issues with limited immediate impact.

## 1) `@broadset/model`

### Findings

1. MEDIUM - Runtime immutability guard for `documentMode` is still not explicit.

- Spec still requires runtime mutation rejection (`project/spec/model/spec.md`, requirement "Document Mode Immutability").
- Schema transform returns plain object shape with no explicit runtime freeze/guard in this path: `packages/model/src/document.ts:206`.
- Current tests still focus on valid/invalid values, not post-creation runtime mutation rejection: `packages/model/src/document.test.ts:27`.

### Strengths

- Model shape remains aligned with core spec structure.
- Validation and model-level test depth remain strong.
- Package boundary remains clean.

## 2) `@broadset/playback`

### Findings

1. LOW - Legacy "registry" terminology remains in playback API naming.

- `validateAnimationRegistry(...)` remains the validator naming: `packages/playback/src/playback-controller-utils.ts:136`.
- `setRegistry(...)` and related fields remain in controller API: `packages/playback/src/playback-controller.ts:53`.
- Behavior appears correct; this is clarity debt, not a functional bug.

### Strengths

- Boundary compliance remains correct (`model` only).
- Playback structure remains coherent and test-backed.

## 3) `@broadset/renderer`

### Findings

1. MEDIUM - Renderer spec gaps for several acceptance areas remain open.

- Current spec still records missing tests for incremental mutation counting, broken image fallback, sanitizer allowlist behavior, and performance mutation complexity: `project/spec/renderer/spec.md:674`.
- Existing renderer tests do cover group container/data-attribute behavior in part, but open items above are still listed as unresolved.

2. MEDIUM - Renderer complexity hotspot has moved to split module path.

- Large file is now `packages/renderer/src/screen-renderer/base-render.ts` (817 lines), while `packages/renderer/src/screen-renderer.ts` is now a barrel re-export.

### Strengths

- Group/container contract coverage exists in renderer tests.
- Scene/rendering core remains modularized compared to prior monolith path.

## 4) `@broadset/editor`

### Findings

1. MEDIUM - Editor CT portfolio is broader but still likely incomplete against full matrix.

- Prior single-file CT claim is obsolete; demo CT now spans dedicated files for canvas, toolbar, timeline, panels, inputs, modals, and demo shell state.
- Remaining likely gaps from required matrix still include explicit marquee selection and canvas pan workflows.

2. MEDIUM - Spec gap notes for store actions are still stale versus implemented tests.

- Spec still claims missing automation for required descendant promotion, snapshots, and clipboard integration: `project/spec/editor/store-actions.md:533`.
- Current tests cover those scenarios: `packages/editor/src/store-actions.test.ts:159`, `packages/editor/src/store-actions.test.ts:303`, `packages/editor/src/keyboard.test.ts:402`.

3. MEDIUM - Editor complexity risk persists in newly split core modules.

- Largest non-test editor module is now `packages/editor/src/store-actions/store.ts` (614 lines), above the soft 500-line target.

### Strengths

- Strong unit coverage remains across editing, keyboard, collaboration, and store actions.
- Refactor reduced old monolith paths (`store-actions.ts`, `editing.ts`, `path-geometry.ts`) into submodules.

## 5) `@broadset/formats`

### Findings

1. MEDIUM - Warning/reporting contract is still inconsistent across importers and demo bridge.

- SVG importer returns warnings via `SvgImportResult.warnings`: `packages/formats/src/web-vector/core.ts:185`.
- Demo bridge still does not surface SVG warnings in import UX: `packages/demo/src/formatBridge.ts:250`.
- PPTX/PSD import entry points still return only `BroadsetDocument`: `packages/formats/src/pptx/core.ts:1007`, `packages/formats/src/psd/core.ts:1264`.

2. MEDIUM - Formats spec gap entries remain stale for animated static export.

- Spec still says no tests for animated static export in PDF/PSD: `project/spec/formats/pdf.md:194`, `project/spec/formats/psd.md:227`.
- Tests exist: `packages/formats/src/pdf.test.ts:502`, `packages/formats/src/psd.test.ts:448`.

3. MEDIUM - Converter complexity hotspots remain and are now clearly concentrated in `core.ts` files.

- `packages/formats/src/psd/core.ts` (1354 lines)
- `packages/formats/src/pptx/core.ts` (1079)
- `packages/formats/src/pdf/core.ts` (760)
- `packages/formats/src/web-vector/core.ts` (661)

### Strengths

- Formats remain boundary-compliant (`model` + `playback`).
- Import/export test coverage remains broad across major format surfaces.

## 6) `@broadset/ui`

### Findings

1. HIGH - No dedicated Playwright CT suite exists in `packages/ui`.

- UI still relies on Jest/RTL tests; there are no `*.ct.tsx` files under `packages/ui`.
- This leaves package-local browser-level acceptance coverage dependent on demo CT rather than package-owned CT.

2. MEDIUM - UI spec gap entries remain stale versus existing tests.

- Example: toolbar spec still claims no undo/redo disabled-state automation: `project/spec/ui/toolbar-nav.md:457`.
- Existing test coverage includes this behavior: `packages/ui/src/toolbar-nav.test.tsx:226`.

3. MEDIUM - UI complexity risk remains but file hotspots moved after split.

- Old monolith file names are obsolete; current large non-test modules include:
  - `packages/ui/src/modals/core-modals.tsx` (502)
  - `packages/ui/src/property-panels/layout-panels.tsx` (464)
  - `packages/ui/src/animation-sidebar.tsx` (464)

### Strengths

- HeroUI-first implementation is maintained.
- Unit coverage remains strong in core UI modules.

## 7) `@broadset/demo`

### Findings

1. HIGH - Timeline and animation-sidebar actions are still not wired end-to-end.

- Placeholder toasts remain for timeline editor actions in split layout module: `packages/demo/src/demo-app/layout-timeline-panel.tsx:24`.
- Placeholder toasts remain for animation sidebar actions: `packages/demo/src/demo-app/sidebar.tsx:132`.
- Finding is still valid; evidence moved from old `DemoApp.tsx` line references to split files.

2. MEDIUM - Previous single-file CT concentration finding is obsolete, but CT matrix completion risk remains.

- CT is now split across seven files:
  - `packages/demo/ct/canvas-selection-transform.ct.tsx`
  - `packages/demo/ct/demo-state-data.ct.tsx`
  - `packages/demo/ct/inputs-a11y.ct.tsx`
  - `packages/demo/ct/modals-a11y.ct.tsx`
  - `packages/demo/ct/sidebar-properties-layers.ct.tsx`
  - `packages/demo/ct/timeline-animation.ct.tsx`
  - `packages/demo/ct/toolbar-navigation.ct.tsx`
- Still advisable to close remaining mandatory scenarios not yet explicit in CT (for example marquee and pan).

3. MEDIUM - Hidden raw file input exception still exists and should be documented explicitly.

- Raw native file input is now in layout split module: `packages/demo/src/demo-app/layout.tsx:46`.

4. MEDIUM - Demo complexity hotspot has shifted.

- `packages/demo/src/DemoApp.tsx` is no longer a large shell; complexity now centers in:
  - `packages/demo/src/sampleDocument.ts` (1443)
  - `packages/demo/src/demo-app/app.tsx` (497)

### Strengths

- Demo CT now has significantly broader functional coverage than the prior single-file state.
- Refactor improved shell modularity and moved major concerns into dedicated files.

## Cross-Package Systemic Findings

1. HIGH - Timeline/binding integration remains the most visible user-facing functional gap.

- Placeholder handlers still block true end-to-end timeline editing in demo shell.

2. MEDIUM - Spec-document drift remains a concrete quality issue.

- Multiple `Spec Gaps` sections still claim absent tests where automation now exists.

3. MEDIUM - Maintainability risk remains present but shifted to new split-module hotspots.

- Old hotspot filenames in prior report are partially obsolete and should not be reused for planning.

## Recommended Remediation Sequence

1. Wire timeline editor and animation-sidebar callbacks in demo split modules (`layout-timeline-panel.tsx`, `sidebar.tsx`) to real editor/timeline actions.
2. Run a spec hygiene pass to update stale `Spec Gaps` across editor/formats/ui/renderer so docs match current automation.
3. Expand CT matrix for explicit remaining interaction gaps (notably marquee and pan) and tie each to scenario IDs in `project/implementation/ct-testing.md`.
4. Continue phased splitting of current largest non-test modules (`formats/*/core.ts`, `renderer/base-render.ts`, `editor/store-actions/store.ts`, key UI panels/modals).
5. Define a unified importer warning contract and surface warnings in demo import UX (starting with SVG parity, then PPTX/PSD).

## Appendix: Evidence Commands Executed (Refresh)

- Targeted `rg` searches and file reads across `project/spec/**`, `packages/**`, and CT paths.
- Module line-count scans for non-test `*.ts`/`*.tsx` files to refresh complexity hotspots.
