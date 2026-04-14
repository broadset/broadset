# QA Analysis - Package-by-Package (Refreshed)

Date: 2026-04-14 19:45
Scope: model, playback, renderer, editor, formats, ui, demo
Method: targeted refresh of previous findings using current files under `project/spec/**` and `packages/**`.

## Verification Baseline (Refresh Scope)

- This refresh validates relevance and evidence paths after recent refactors.
- It does not re-run the full quality/build/CT chain; assertions below are based on source and test inspection.
- Demo Playwright CT is now split across ten files in folder-based domains under `packages/demo/ct/`.

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

- Prior single-file CT claim is obsolete; demo CT now spans 10 files in `accessibility/`, `canvas-transform/`, `layout/`, `state/`, and `timeline/` folders.
- Current matrix tracking in `project/implementation/component-testing.md` shows 42/57 IDs covered (74%): largest gaps remain in canvas interactions (C-_) and demo state/data workflows (D-_).

2. MEDIUM - Spec gap notes for store actions are still stale versus implemented tests.

- Spec still claims missing automation for required descendant promotion, snapshots, and clipboard integration: `project/spec/editor/store-actions.md:533`.
- Current tests cover those scenarios: `packages/editor/src/store-actions.core.test.ts:118`, `packages/editor/src/store-actions.snapshots.test.ts:44`, `packages/editor/src/keyboard.clipboard-grouping.test.ts:68`.

3. LOW - Editor complexity risk is reduced after split, with one near-threshold module.

- Largest non-test editor module is now `packages/editor/src/keyboard.ts` (481 lines), which is below but close to the soft 500-line target.

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
- Tests exist: `packages/formats/src/pdf/fonts-wrap-qr-animation.test.ts:192`, `packages/formats/src/psd/import-vector-animated-url.test.ts:101`.

3. LOW - Previous converter hotspot paths are obsolete after formats module split.

- Current larger non-test modules are:
  - `packages/formats/src/pdf/core.ts` (425 lines)
  - `packages/formats/src/pptx/slide-shapes.ts` (358)
  - `packages/formats/src/psd/import.ts` (310)
  - `packages/formats/src/psd/export-layer.ts` (278)

### Strengths

- Formats remain boundary-compliant (`model` + `playback`).
- Import/export test coverage remains broad across major format surfaces.

## 6) `@broadset/ui`

### Findings

1. HIGH - No dedicated Playwright CT suite exists in `packages/ui`.

- UI still relies on Jest/RTL tests; there are no `*.ct.tsx` files under `packages/ui`.
- This leaves package-local browser-level acceptance coverage dependent on demo CT rather than package-owned CT.

2. MEDIUM - UI spec gap entries remain stale versus existing tests.

- Example: toolbar spec marks undo/redo disabled-state automation as covered but points to stale file path `packages/ui/src/toolbar-nav.test.tsx`: `project/spec/ui/toolbar-nav.md:457`.
- Existing test coverage is in split test files: `packages/ui/src/toolbar-nav.editor-pages.test.tsx:11`.

3. LOW - UI complexity risk remains moderate with near-threshold panel modules.

- Current larger non-test modules include:
  - `packages/ui/src/property-panels/layout-panels.tsx` (464)
  - `packages/ui/src/animation-sidebar.tsx` (464)
  - `packages/ui/src/modals/core-modals.tsx` (282)

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

- CT is now split across ten files:
  - `packages/demo/ct/accessibility/inputs-a11y.ct.tsx`
  - `packages/demo/ct/accessibility/modals-a11y.ct.tsx`
  - `packages/demo/ct/canvas-transform/compound.ct.tsx`
  - `packages/demo/ct/canvas-transform/handles.ct.tsx`
  - `packages/demo/ct/canvas-transform/resize-rotation.ct.tsx`
  - `packages/demo/ct/canvas-transform/selection.ct.tsx`
  - `packages/demo/ct/layout/sidebar-properties-layers.ct.tsx`
  - `packages/demo/ct/layout/toolbar-navigation.ct.tsx`
  - `packages/demo/ct/state/demo-state-data.ct.tsx`
  - `packages/demo/ct/timeline/timeline-animation.ct.tsx`
- Matrix completion risk remains: see `project/implementation/component-testing.md` for missing IDs (notably C-_, D-_, and L-05/L-07/L-10).

3. MEDIUM - Hidden raw file input exception still exists and should be documented explicitly.

- Raw native file input is now in layout split module: `packages/demo/src/demo-app/layout.tsx:46`.

4. MEDIUM - Demo complexity hotspot has shifted.

- `packages/demo/src/DemoApp.tsx` is no longer a large shell; complexity now centers in:
  - `packages/demo/src/demo-app/app.tsx` (497)
  - `packages/demo/src/demo-app/layout-main-toolbar.tsx` (447)
  - `packages/demo/src/demo-components/screen-preview.tsx` (326)

### Strengths

- Demo CT now has significantly broader functional coverage than the prior single-file state.
- Refactor improved shell modularity and moved major concerns into dedicated files.

## Cross-Package Systemic Findings

1. HIGH - Timeline/binding integration remains the most visible user-facing functional gap.

- Placeholder handlers still block true end-to-end timeline editing in demo shell.

2. MEDIUM - Spec-document drift remains a concrete quality issue.

- Multiple `Spec Gaps` sections still claim absent tests where automation now exists.

3. MEDIUM - Maintainability risk remains present but shifted to new split-module hotspots.

- Old hotspot filenames in prior report are partially obsolete and should not be reused for planning; current hotspots are mostly below the 500-line soft limit.

## Recommended Remediation Sequence

1. Wire timeline editor and animation-sidebar callbacks in demo split modules (`layout-timeline-panel.tsx`, `sidebar.tsx`) to real editor/timeline actions.
2. Run a spec hygiene pass to update stale `Spec Gaps` across editor/formats/ui/renderer so docs match current automation.
3. Expand CT matrix for explicit remaining interaction gaps (notably C-_ canvas flows, D-_ state/data flows, and L-05/L-07/L-10 timeline items) and tie each to scenario IDs in `project/implementation/component-testing.md`.
4. Continue phased splitting of current largest non-test modules where justified (`packages/demo/src/demo-app/app.tsx`, `packages/editor/src/keyboard.ts`, and near-threshold UI panel modules).
5. Define a unified importer warning contract and surface warnings in demo import UX (starting with SVG parity, then PPTX/PSD).

## Appendix: Evidence Commands Executed (Refresh)

- Targeted `rg` searches and file reads across `project/spec/**`, `packages/**`, and CT paths.
- Module line-count scans for non-test `*.ts`/`*.tsx` files to refresh complexity hotspots.
