# QA Analysis - Package-by-Package

Date: 2026-04-13 02:00
Scope: model, playback, renderer, editor, formats, ui, demo
Method: spec-to-implementation review using files under `project/spec/**` and `packages/**`, plus full repo verification run (`npm run quality:all && npm run build && npm run ct`).

## Verification Baseline

- Quality/build/CT chain passes end-to-end.
- Current CT run executes 23 Playwright tests, all in one file: `packages/demo/ct/demo-shell.ct.tsx`.
- Quality run logs repeated React unknown-prop warnings in UI test mocks (noise risk in test output).

## Severity Legend

- HIGH: likely to block acceptance gates or create user-visible behavior gaps.
- MEDIUM: meaningful quality risk or significant maintainability/documentation drift.
- LOW: cleanup/naming/ergonomics issues with limited immediate impact.

## 1) `@broadset/model`

### Findings

1. MEDIUM - Runtime immutability guard for `documentMode` is not enforced.

- Spec requires post-creation mutation rejection (`project/spec/model/spec.md`, requirement "Document Mode Immutability").
- Current implementation relies on readonly typing, but schema output is a normal object transform with no freeze/guard: `packages/model/src/document.ts:206`.
- Current tests cover valid/invalid values but not runtime mutation rejection: `packages/model/src/document.test.ts:27`.

### Strengths

- Model shape aligns with core spec structure (document-level elements, pages as overrides, animations array).
- Zod validation is extensive and unit coverage is strong across model modules.
- Boundary compliance is clean (no workspace package imports from model).

## 2) `@broadset/playback`

### Findings

1. LOW - Legacy naming still uses "registry" terminology after model moved to `animations` array naming.

- Function: `validateAnimationRegistry(...)` in `packages/playback/src/playback-controller-utils.ts:136`.
- Used by playback controller and tests: `packages/playback/src/playback-controller.ts:76`.
- Behavior appears correct; this is clarity/maintenance debt, not a functional defect.

### Strengths

- Package boundary is correct (`model` only).
- Playback module structure matches spec domains (interpolation/timeline/controller split).
- Spec gap section for playback indicates previously missing coverage is now closed (`project/spec/playback/playback.md:519`).

## 3) `@broadset/renderer`

### Findings

1. MEDIUM - Several renderer acceptance areas remain under-tested at automated level.

- Renderer spec explicitly calls out gaps for:
  - exact animation target attribute contract,
  - incremental mutation behavior,
  - broken image fallback,
  - sanitizer allowlist checks,
  - group container contract,
  - performance mutation-count expectations.
- Evidence: `project/spec/renderer/spec.md:674`.

2. MEDIUM - File-size complexity hotspot in core renderer path.

- `packages/renderer/src/screen-renderer.ts` exceeds soft modularity threshold (657 non-empty lines).

### Strengths

- Data attribute contract is implemented and exercised in tests.
- Scene tree and capability resolution behaviors are covered and aligned with renderer spec goals.
- Boundary compliance (`model` only) is clean.

## 4) `@broadset/editor`

### Findings

1. HIGH - Editor CT acceptance gates are only partially covered.

- Spec mandates CT for canvas click-select/deselect, marquee, zoom/pan, transform operations (including rotation/snap guides), overlays, path/clip-path editing, and cross-region flows: `project/spec/editor/spec.md` (Functional Test Requirements section).
- Existing CT file has strong coverage for some flows (transform move/resize, delete/undo, layers-to-canvas selection), but many mandatory items are still absent (notably marquee, zoom/pan, rotation-handle drag, snap guide visibility, clip/path editing flows).
- Current CT suite location: `packages/demo/ct/demo-shell.ct.tsx`.

2. MEDIUM - Spec gap notes for editor store actions are stale versus current tests.

- Spec claims no tests for required descendant promotion, snapshots, clipboard integration: `project/spec/editor/store-actions.md:533`.
- Current tests do cover these areas:
  - required descendant promotion: `packages/editor/src/store-actions.test.ts:158`
  - named snapshots lifecycle and serialization: `packages/editor/src/store-actions.test.ts:303`
  - cross-page clipboard flow: `packages/editor/src/keyboard.test.ts:402`
- This is spec-document drift that can mislead implementation planning.

3. MEDIUM - Large core files increase maintenance risk.

- `packages/editor/src/store-actions.ts` (747 non-empty lines)
- `packages/editor/src/editing.ts` (649)
- `packages/editor/src/path-geometry.ts` (518)

### Strengths

- Strong unit-test depth across state/actions/editing/collaboration/keyboard.
- Package boundaries respect architecture rules.
- Public API barrel is present and actively used.

## 5) `@broadset/formats`

### Findings

1. MEDIUM - Import warning reporting is inconsistent across importers and demo integration.

- Formats cross-cutting principle requires no silent data loss and warning reporting for skipped content (`project/spec/formats/spec.md`, Cross-Cutting Principles).
- SVG importer returns warnings (`SvgImportResult.warnings`): `packages/formats/src/web-vector.ts:189`.
- Demo import bridge currently discards SVG warnings and does not surface them to users: `packages/demo/src/formatBridge.ts:224`.
- PPTX/PSD importer signatures return only `BroadsetDocument` (no warnings channel): `packages/formats/src/pptx.ts:1007`, `packages/formats/src/psd.ts:1264`.

2. MEDIUM - Spec gap notes are stale in parts of formats docs.

- PDF spec says no tests for animated static export: `project/spec/formats/pdf.md:194`.
- PSD spec says no tests for animated static export: `project/spec/formats/psd.md:227`.
- Current tests exist:
  - PDF animated rest-state export: `packages/formats/src/pdf.test.ts:497`
  - PSD animated rest-state export: `packages/formats/src/psd.test.ts:442`

3. MEDIUM - File-size complexity hotspots in key converters.

- `packages/formats/src/psd.ts` (1115 non-empty lines)
- `packages/formats/src/pptx.ts` (901)
- `packages/formats/src/pdf.ts` (634)
- `packages/formats/src/web-vector.ts` (531)

### Strengths

- Broad exporter/importer coverage exists across required formats.
- Runtime support/error handling for key APIs (e.g., video support detection) is present.
- Boundary rules are respected (`model` + `playback` only).

## 6) `@broadset/ui`

### Findings

1. HIGH - UI CT acceptance gates are mostly unfulfilled at browser level.

- UI spec requires CT for toolbar/nav flows, panel interactions, timeline keyframe operations, modal focus behavior, and accessibility interactions (`project/spec/ui/spec.md`, Functional Test Requirements).
- Current UI package has strong Jest component tests but no dedicated Playwright CT suite in `packages/ui`.

2. MEDIUM - Spec gap entries are partially stale versus existing unit coverage.

- Example: toolbar undo/redo disabled-state test exists: `packages/ui/src/toolbar-nav.test.tsx:226`, while spec gap still says no automated tests: `project/spec/ui/toolbar-nav.md:455`.
- Similar pattern appears in timeline and panels specs where tests exist for several listed behaviors.

3. MEDIUM - Large UI modules increase coupling and review cost.

- `packages/ui/src/property-panels.tsx` (1458 non-empty lines)
- `packages/ui/src/timeline.tsx` (1267)
- `packages/ui/src/inputs.tsx` (1111)
- `packages/ui/src/modals.tsx` (868)

### Strengths

- HeroUI-first architecture is broadly followed in package UI components.
- Tokenized styling utilities are in place.
- Unit tests cover many logic/rendering branches in panels/inputs/timeline/modals.

## 7) `@broadset/demo`

### Findings

1. HIGH - Timeline and animation sidebar actions are visibly not wired.

- Multiple handlers intentionally emit "not yet wired" toasts instead of mutating timelines/bindings:
  - `packages/demo/src/DemoApp.tsx:1268`
  - `packages/demo/src/DemoApp.tsx:1274`
  - `packages/demo/src/DemoApp.tsx:1285`
  - `packages/demo/src/DemoApp.tsx:1294`
  - `packages/demo/src/DemoApp.tsx:2596`
  - `packages/demo/src/DemoApp.tsx:2605`
- This conflicts with end-to-end demo integration intent for animation editing in `project/spec/ui/timeline.md` and `project/spec/demo/spec.md` integration role.

2. HIGH - CT coverage breadth is constrained by single-file concentration.

- All current CT scenarios live in `packages/demo/ct/demo-shell.ct.tsx`.
- Good existing coverage is present for several flows, but many editor/UI mandatory CT gates are still missing (canvas marquee, zoom/pan, rotation-handle drag, snap guide rendering, path/clip-path editing, modal focus-trap behavior, etc.).

3. MEDIUM - Hidden raw file input in host shell should be explicitly documented as a HeroUI-rule exception.

- Raw `<input type="file">` exists at `packages/demo/src/DemoApp.tsx:1332`.
- If this is intentional (native file picker handling), it should be codified as an allowed exception in HeroUI-host guidance to avoid policy ambiguity.

4. MEDIUM - Demo shell complexity is concentrated in a very large top-level component.

- `packages/demo/src/DemoApp.tsx` (2401 non-empty lines)
- `packages/demo/src/sampleDocument.ts` (1432)

### Strengths

- Demo remains the strongest integration surface with passing end-to-end CT scenarios for many critical paths (selection, transform move/resize, deletion/undo, persistence, export/import shell actions, playback controls).
- Root quality/build/CT commands pass, proving stable baseline.

## Cross-Package Systemic Findings

1. HIGH - CT portfolio is strong in depth for current scenarios but incomplete against spec-mandated interaction matrix.

- Immediate risk is regression in high-value editor interactions not yet represented in browser-level tests.

2. MEDIUM - Spec-document drift is now a measurable quality issue.

- Multiple spec "Spec Gaps" sections claim missing automation where tests already exist.
- This degrades trust in spec status and can misprioritize work.

3. MEDIUM - Maintainability risk from oversized modules.

- Core runtime and UI host files repeatedly exceed the documented 500 non-empty-line soft limit.

4. LOW - Test signal-to-noise degradation from repeated React unknown-prop warnings.

- Observed during quality run; mostly tied to HeroUI test mocks forwarding non-DOM props.

## Recommended Remediation Sequence

1. Close HIGH demo/editor integration gaps by wiring timeline and animation sidebar callbacks in `DemoApp` to real editor/timeline actions (remove "not yet wired" placeholders).
2. Expand Playwright CT coverage to match required editor and UI acceptance gates, prioritizing: canvas click/deselect, marquee, zoom/pan, rotation/snap guides, path/clip-path edit, and keyframe deletion flows.
3. Run a spec hygiene pass to update stale "Spec Gaps" sections where tests already exist (editor store-actions, formats PDF/PSD, UI toolbar/timeline/panels where applicable).
4. Introduce phased file-splitting for largest runtime modules (`DemoApp`, `property-panels`, `timeline`, `psd/pptx/pdf` converters, `screen-renderer`).
5. Propagate importer warning channels into demo import UX (at minimum SVG warnings), and define a unified warning/reporting contract for PPTX/PSD imports.

## Appendix: Evidence Commands Executed

- `npm run quality:all && npm run build && npm run ct`
- Targeted `rg`/file reads across `project/spec/**` and `packages/**` for boundary checks, test coverage mapping, placeholder callbacks, and file-size hotspots.
