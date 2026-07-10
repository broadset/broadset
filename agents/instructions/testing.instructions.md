---
description: 'Use when writing or reviewing tests — unit tests (Vitest + React Testing Library) and component tests (Playwright CT). Covers test strategy for math utilities, Zustand store, hooks, canvas interactions, and renderer parity.'
applyTo: packages/*/src/**/*.test.*, ct/**
---

# Testing Strategy

## Unit Tests (Vitest + React Testing Library)

### Math Utilities

- Exhaustive tests for `pxToMm` and `mmToPx` in `packages/model/src/utilities.test.ts`.
- Test `calculateAnchors` in `packages/editor/src/transforms.test.ts` with multiple simulated canvas sizes and coordinates that cross the center-line.

### Zustand Store

- Test the vanilla editor store **independently of React** under `packages/editor/src/store-actions*.test.ts`.
- Prove `updateElementEphemeral` updates coordinates correctly.
- Prove `commitElementUpdate` commits ephemeral changes with transaction semantics intact.
- Prove `reorderElement` shifts array indexes without data loss.

### Custom Hooks

- Test `useEditorStore` selector logic with React Testing Library.

## Component Tests

### Canvas Interaction

- Simulate real pointer events: click a rendered element node on the canvas (the `data-element-id` DOM node produced by the renderer), drag 100px, release, assert DOM update and Zustand state commit.

### CT Derivation Rule — Cross-Region Verification

Every spec scenario where the user performs an action in one UI region and the expected outcome is visible in a **different** UI region MUST have a Playwright CT test. A "UI region" is any of: canvas, transform widget, properties panel, layers panel, toolbar, timeline, modal, bottom bar.

**How to identify cross-region scenarios:** Scan the GIVEN/WHEN/THEN blocks in every spec file. If the WHEN targets one region and the THEN asserts a change in another region, that scenario requires a CT test. If the THEN asserts changes in multiple regions, the CT test MUST verify all of them in a single test.

**Examples of cross-region flows (not exhaustive — derive from specs):**

| Action (WHEN)                    | Expected visible outcomes (THEN)                                                |
| -------------------------------- | ------------------------------------------------------------------------------- |
| Click element on canvas          | Transform widget appears AND properties panel populates                         |
| Click empty canvas               | Transform widget disappears AND properties panel clears                         |
| Drag element on canvas           | Position fields in properties panel update in real time                         |
| Edit width in properties panel   | Element size on canvas changes AND widget bounds update                         |
| Click element type in toolbar    | Placement mode activates; click canvas creates element with widget + properties |
| Press Delete key                 | Element removed from canvas AND layers panel AND properties panel clears        |
| Ctrl+Z undo                      | Canvas reverts AND properties panel reverts AND layers panel reverts            |
| Add keyframe in timeline         | Animation preview updates on canvas                                             |
| Drag keyframe in timeline        | Playhead position updates AND animation state reflects new timing               |
| Change color in properties panel | Element fill updates on canvas                                                  |
| Toggle grid in toolbar           | Grid overlay appears/disappears on canvas                                       |
| Switch page in page sorter       | Canvas renders new page elements AND properties panel clears selection          |
| Drag from ruler                  | Guide line appears on canvas AND persists in canvas settings                    |
| Double-click text element        | Contenteditable overlay appears on canvas at correct position                   |
| Select multiple via marquee      | Combined transform widget AND properties panel shows mixed values               |
| Reorder layers in layers panel   | Element z-order changes on canvas                                               |

**The table above is illustrative.** The agent MUST systematically scan all spec files in `project/spec/editor/`, `project/spec/ui/`, and `project/spec/demo/` and derive the full set of cross-region CT tests from the scenarios defined there. Any spec scenario that crosses regions and lacks a corresponding CT test is an incomplete implementation.

### CT Test Structure

Each CT test MUST:

1. Mount the full editor shell (canvas + sidebar + toolbar) with a minimal test document
2. Perform the user action using Playwright's real pointer/keyboard APIs
3. Assert the outcome in **every** affected UI region — not just one
4. Use `data-testid` attributes for reliable element targeting (no CSS class selectors)
5. Include a JSDoc `@description` referencing the spec scenario it validates

### CT Coverage Gate

Before a roadmap initiative can move to `shipped` in `program-state.json`:

- Every cross-region scenario from that group's specs MUST have a passing CT test
- `npm run ct:all` MUST pass with zero failures
- The initiative's `program-state.json` evidence link MUST map each scenario ID to its unit/CT evidence

## General Rules

- Code is not complete unless it is tested.
- Run `npm run test` for unit tests, the owning package's `ct` command for focused feedback, and `npm run ct:all` for the complete Playwright component suite.
- Run the full Playwright CT suite before concluding a major initiative or release slice.

## Coverage

- Run `npm run test:coverage` to emit a V8-backed unit-test coverage report under `coverage/` (HTML, JSON summary, and stdout summary). The report is git-ignored.
- Per-package and workspace baseline numbers live in `project/implementation/coverage-baseline.md`. Refresh that doc when a package coverage drops materially.
- Blanket percentage coverage is **not** a release gate until W0-QE-01/W0-PERF-01 ratify a risk-weighted policy. Coverage remains a release signal; CT-covered flows do not show up in V8 unit coverage, and `cross-region-ct-inventory.md` is the authoritative cross-region scenario surface.
- Before opening a PR that touches a path with low coverage, run `npm run test:coverage` and confirm the touched file's coverage is not regressed in `coverage/index.html`.
