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
- Open scenario count: 0 IDs.

## 6. Remaining CT Matrix (Open Scenarios)

All previously open scenarios in this document are now covered by passing CT tests.

### 6.1 Canvas, Selection, Transform, and Placement

None.

### 6.2 Toolbar, Context Menu, Element Library, Scene Sorting

None.

### 6.3 Sidebars, Layers, Properties, and Property Panels

None.

### 6.4 Demo Host State, Data, and Workflow Integration

None.

## 7. Component Coverage Checklist (Public UI Components)

Use this section to track unresolved component coverage only.

### 7.1 `packages/ui/src/toolbar-nav.tsx`

- None.

### 7.2 `packages/ui/src/panels.tsx` family

- None.

### 7.3 `packages/demo/src` host integration coverage

- None.

## 8. Recommended CT File Layout

Split CTs by feature area instead of keeping one monolithic file.

- No unresolved CT layout assignments remain.

## 9. Test Writing Rules

- Each test MUST include a JSDoc `@description` naming spec source and scenario intent.
- Use `data-testid` selectors as primary locators.
- Use real `page.mouse`, `page.keyboard`, and pointer interactions for drag/keyboard flows.
- Assert outcomes in every affected region for cross-region scenarios.
- Avoid fixed sleeps where possible; prefer explicit waits/assertions.

## 10. Traceability Template

Keep a traceability table in each CT file header or a central checklist.

| Case ID | CT file                             | Requirement                | Regions asserted                             | Status  |
| ------- | ----------------------------------- | -------------------------- | -------------------------------------------- | ------- |
| C-01    | `canvas-transform/selection.ct.tsx` | Element Selection by Click | canvas, transform widget, layers, properties | covered |

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
