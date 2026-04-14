# CT Testing Guide (Spec-Driven)

Date: 2026-04-14 21:10
Scope: Playwright component tests for `@broadset/demo` covering all user-facing UI component behaviors from `@broadset/ui`.

## 1. Purpose

This document defines:

1. What must be tested with CT.
2. Why those scenarios must be tested in a browser (not only unit tests).
3. The expected outcome for each scenario according to specs.

Use this as the source of truth when expanding or refactoring CT coverage.

## 2. Why CT Is Mandatory

- `project/spec/ui/spec.md` requires browser-level CT for interaction flows that unit tests cannot validate completely.
- `.github/instructions/testing.instructions.md` requires cross-region verification: if a user action happens in one region and outcome is visible in another, CT must assert all affected regions in one test.
- `CONTRIBUTING.md` and spec gates require `npm run ct` for user-facing interaction changes.

## 3. Authoritative Sources

Derive CT coverage from these files:

- `project/spec/demo/layout.md`
- `project/spec/demo/state.md`
- `project/spec/demo/visual.md`
- `project/spec/demo/data-integration.md`
- `project/spec/demo/config.md`
- `project/spec/ui/toolbar-nav.md`
- `project/spec/ui/panels.md`
- `project/spec/ui/inputs.md`
- `project/spec/ui/modals.md`
- `project/spec/ui/timeline.md`
- `project/spec/editor/canvas.md`
- `project/spec/editor/editing.md`
- `project/spec/editor/keyboard.md`
- `project/spec/editor/timeline-playback.md`

## 4. CT Derivation Workflow

1. Read every `Requirement`, `Scenario`, and `Acceptance Criteria` block in the spec files above.
2. For each user action, list all UI regions affected:
   - canvas
   - transform widget
   - properties panel
   - layers panel
   - toolbar
   - timeline
   - modal
   - bottom panel
3. Create one CT case that performs the action with real pointer/keyboard APIs.
4. Assert all affected regions in that same test.
5. Add a JSDoc `@description` that references the exact spec file and requirement.
6. Prefer `data-testid` selectors; do not rely on CSS classes.

## 5. Coverage Baseline (Current)

- Current CT run passes with implemented scenarios already covered in `packages/demo/ct/`.
- This guide now tracks only remaining, unresolved scenarios.
- Open scenario count: 14 IDs.

## 6. Remaining CT Matrix (Open Scenarios)

### 6.1 Canvas, Selection, Transform, and Placement

| ID   | What must be tested                | Why CT                                                     | Expected outcome according spec                                                                    | Spec source                                                                                                                       |
| ---- | ---------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| C-01 | Click element on canvas            | Selection is a pointer/DOM interaction                     | Element becomes selected, transform widget appears, selected layer highlights, properties populate | `project/spec/editor/canvas.md` (Element Selection, Transform Widget), `project/spec/demo/layout.md` (Canvas Selection Indicator) |
| C-04 | Drag transform bounds to move      | Browser pointer capture and geometry updates               | Element moves in canvas, geometry fields update, committed value remains after pointer up          | `project/spec/editor/canvas.md` (Transform Widget), `project/spec/ui/panels.md` (Geometry Panel)                                  |
| C-06 | Drag rotation handle               | Rotation gesture not fully unit-testable end-to-end        | Rotation changes visibly on canvas and in properties                                               | `project/spec/editor/canvas.md` (Transform Widget), `project/spec/editor/transforms.md`                                           |
| C-09 | Escape while in placement mode     | Keyboard cancellation path                                 | Placement cancels, banner hides, tool deactivates                                                  | `project/spec/demo/layout.md` (Placement Mode Banner), `project/spec/editor/editing.md`                                           |
| C-10 | Zoom in/out and clamp              | Wheel and zoom behavior are device/browser specific        | Zoom changes by step, clamps at min/max, zoom display updates                                      | `project/spec/editor/canvas.md` (Zoom and Pan)                                                                                    |
| C-13 | Grid and rulers visibility toggles | Visual overlays and view toggles are integration behaviors | Grid/rulers show-hide according to settings and remain aligned after zoom/pan                      | `project/spec/editor/canvas.md` (Grid Overlay, Ruler System), `project/spec/ui/toolbar-nav.md` (View toggles)                     |

### 6.2 Toolbar, Context Menu, Element Library, Scene Sorting

| ID   | What must be tested                                 | Why CT                                 | Expected outcome according spec                                                | Spec source                                                                                               |
| ---- | --------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| T-01 | Toolbar icon-only controls with tooltips and labels | Accessibility + visual chrome behavior | All clickable toolbar controls are icon-only and have `aria-label` and tooltip | `project/spec/ui/toolbar-nav.md` (Toolbar Actions), `project/spec/demo/layout.md` (Floating Main Toolbar) |
| T-02 | Undo/redo disabled-state transitions                | State-driven UI behavior across edits  | Fresh doc: both disabled, after edit: undo enabled, after undo: redo enabled   | `project/spec/ui/toolbar-nav.md` (Undo/Redo Button States)                                                |

### 6.3 Sidebars, Layers, Properties, and Property Panels

| ID   | What must be tested              | Why CT                   | Expected outcome according spec                                 | Spec source                                                                   |
| ---- | -------------------------------- | ------------------------ | --------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| P-05 | Layers selection and canvas sync | Cross-region interaction | Clicking layer selects element and repositions transform widget | `project/spec/ui/panels.md` (Layers Sidebar), `project/spec/editor/canvas.md` |

### 6.4 Demo Host State, Data, and Workflow Integration

| ID   | What must be tested                 | Why CT                                     | Expected outcome according spec                                                          | Spec source                                                                         |
| ---- | ----------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| D-01 | Provider wiring in rendered app     | Integration-only context behavior          | Editor, timeline, and data providers are all available and functional from child UI      | `project/spec/demo/state.md` (Editor Provider Wiring)                               |
| D-02 | Sidebar preference persistence      | Browser storage behavior                   | Open/closed, tab, and width persist to localStorage and restore on remount/reload        | `project/spec/demo/state.md` (Sidebar Preferences Persistence)                      |
| D-03 | Save and restore document lifecycle | Browser storage and host callback behavior | Save writes document to localStorage, startup restores saved doc or falls back to sample | `project/spec/demo/state.md` (Save via Host Callback)                               |
| D-04 | Toast behavior and severity timing  | Visual timing and stacking behavior        | Success/info and error toasts appear with correct message and dismiss timing behavior    | `project/spec/demo/state.md` (Toast Notification System)                            |
| D-09 | Full-viewport and no-scroll layout  | Layout integration                         | App fills viewport, no page-level scrollbars, canvas and chrome are positioned per spec  | `project/spec/demo/layout.md` (Full-Viewport Layout), `project/spec/demo/visual.md` |

## 7. Component Coverage Checklist (Public UI Components)

Use this section to track unresolved component coverage only.

### 7.1 `packages/ui/src/toolbar-nav.tsx`

- `EditorToolbar`: T-01, T-02

### 7.2 `packages/ui/src/panels.tsx` family

- `LayersSidebar`: P-05

### 7.3 `packages/demo/src` host integration coverage

- Provider and persistence workflows: D-01, D-02, D-03
- Toast and layout workflows: D-04, D-09

## 8. Recommended CT File Layout

Split CTs by feature area instead of keeping one monolithic file.

- `packages/demo/ct/canvas-transform/selection.ct.tsx` + `packages/demo/ct/canvas-transform/handles.ct.tsx` + `packages/demo/ct/canvas-transform/compound.ct.tsx` + `packages/demo/ct/canvas-transform/resize-rotation.ct.tsx` -> C-01, C-04, C-06, C-09, C-10, C-13
- `packages/demo/ct/layout/toolbar-navigation.ct.tsx` -> T-01, T-02
- `packages/demo/ct/layout/sidebar-properties-layers.ct.tsx` -> P-05
- `packages/demo/ct/state/demo-state-data.ct.tsx` -> D-01, D-02, D-03, D-04, D-09

## 9. Test Writing Rules

- Each test MUST include a JSDoc `@description` naming spec source and scenario intent.
- Use `data-testid` selectors as primary locators.
- Use real `page.mouse`, `page.keyboard`, and pointer interactions for drag/keyboard flows.
- Assert outcomes in every affected region for cross-region scenarios.
- Avoid fixed sleeps where possible; prefer explicit waits/assertions.

## 10. Traceability Template

Keep a traceability table in each CT file header or a central checklist.

| Case ID | CT file                             | Requirement                | Regions asserted                             | Status |
| ------- | ----------------------------------- | -------------------------- | -------------------------------------------- | ------ |
| C-01    | `canvas-transform/selection.ct.tsx` | Element Selection by Click | canvas, transform widget, layers, properties | open   |

## 11. Definition Of Done For CT Coverage

All of the following must be true:

1. Every ID in Sections 6.1 to 6.4 has at least one passing CT case.
2. Each CT case references its spec requirement in `@description`.
3. Cross-region cases assert all impacted regions in one test.
4. `npm run ct` passes from repository root.
5. No acceptance criterion listed in this document remains untested without an explicit, documented exception.

## 12. Execution Commands

From repository root:

```bash
npm run ct
npm run quality:all && npm run build && npm run ct
```
