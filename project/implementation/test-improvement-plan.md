# Test Improvement Plan (Ralph-Compatible)

Date: 2026-04-15
Reviewed: 2026-04-20
Owner: Follow-up implementation agent
Status: queued behind `project/implementation/vitest-switch.md`

This file is intentionally formatted like a phase plan so Ralph can execute it unit-by-unit using its normal red/green loop.

## Prerequisite

**Do not start any unit in this plan until `project/implementation/vitest-switch.md` is complete** (all VS-\* units checked, `gate:full` green). Every unit below rewrites, relocates, or authors test code; running them against the old Jest-based runner will produce churn that conflicts with the Vitest migration.

Before starting the first unit, verify the prerequisite:

- `rg -n "@jest-environment|@jest/globals|(?<![A-Za-z0-9_])jest\." packages/*/src` returns zero matches
- `rg -n "runInBand|NODE_OPTIONS=--experimental-vm-modules" packages package.json` returns zero matches
- every package's `package.json` `test` script is `vitest run --passWithNoTests`

If any of these fail, stop and resume the Vitest switch plan instead.

## Authoring Conventions (post-Vitest switch)

All new or rewritten unit tests produced by this plan MUST follow the repo's post-migration Vitest conventions. These are enforced by tests and by the Vitest config chosen in `vitest.base.ts`; Ralph should not reinvent them.

- Explicit imports from `vitest` — `import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';`. Globals are disabled.
- Environment pragma only when a file needs to override the package default: `/** @vitest-environment jsdom */` or `/** @vitest-environment node */` on line 1.
- Mocks use `vi.fn`, `vi.mock`, `vi.spyOn`. `await vi.importActual(...)` for partial-mock composition.
- Fake timers via `vi.useFakeTimers()` / `vi.advanceTimersByTime(...)` / `vi.useRealTimers()`. Per-test timeout via `it('…', { timeout: N }, …)` or `vi.setConfig({ testTimeout })` at suite scope; do not call the old `jest.setTimeout`.
- DOM matchers come from `@testing-library/jest-dom/vitest` — already wired up in `test/vitest.setup.ts`; no per-file import needed.
- Do not introduce `.skip`, `.todo`, `eslint-disable`, `@ts-ignore`, or mock-everything shortcuts to make a rewritten test green. If the assertion genuinely needs the browser, migrate the scenario to CT (split path in the decision matrix below).

## Ralph Loop Convention

Each unit below is implemented test-first.

- [ ] tests: red
- [ ] impl: green

A unit is complete only when both boxes are checked and the listed validation commands pass.

## Global Constraints

1. Fix root causes. Never weaken quality gates.
2. Do not replace browser-critical behavior with mocks.
3. Every cross-region flow must be asserted in CT across all impacted regions in one test.
4. Execute in small batches, max 5 targeted fixes per batch.
5. Do not use sampleDocument fixture content in tests. Use package test-fixtures with small focused data.
6. Keep package boundaries and HeroUI compliance rules intact.

## Source of Truth

- project/spec/\*\*
- agents/instructions/testing.instructions.md
- project/implementation/component-testing.md
- CONTRIBUTING.md
- AGENTS.md

## Unit vs CT Decision Matrix

### Keep as unit

- pure logic, math, transforms, parser/serializer mapping
- deterministic store/action contracts
- deterministic callback payload shaping without browser semantics

### Must be CT

- modal/focus/popover/listbox/select keyboard behavior
- drag/resize/rotation pointer choreography
- HeroUI interaction semantics hidden by `vi.mock` wrappers or `test-helpers` shims
- cross-region action and visible result flows
- browser a11y behavior requiring real DOM/focus order

### Split (unit + CT)

- one fast unit test for data mapping
- one CT for real interaction and user-visible outcome

## Current Execution Order

Run in this order unless explicitly redirected:

1. Unit TI-1.1
2. Unit TI-1.2
3. Unit TI-1.3
4. Unit TI-1.4
5. Unit TI-1.5
6. Unit TI-2.1
7. Unit TI-2.2
8. Unit TI-2.3
9. Unit TI-2.4
10. Unit TI-2.5
11. Unit TI-3.1
12. Unit TI-3.2
13. Unit TI-3.3
14. Unit TI-4.1

## Ralph Invocation Notes

Use Ralph with either no argument (to pick the first unchecked unit in this file) or with an explicit unit id from this plan.

Examples:

- "Ralph loop"
- "implement next unit from test-improvement-plan"
- "continue TI-1.3"
- "run unit TI-3.1"

When using an explicit argument, use the exact unit id and title prefix from this plan to avoid ambiguity.

## Units

### Unit TI-1.1 Snapshot save/restore semantics (migrate core flow to CT)

- [ ] tests: red
- [ ] impl: green

Scope:

- create CT that validates snapshot save plus restore rollback semantics end-to-end
- keep only minimal unit smoke in Vitest if needed (e.g. reducer/action shape for the store slice driving the flow)

Primary files:

- packages/demo/src/demo-app.snapshots.test.tsx
- packages/demo/ct/state/\*\* (new or updated CT file)

Acceptance criteria:

- snapshot entry appears after save
- document mutation after save is visible
- restore returns state to saved baseline
- assertions cover at least canvas plus one secondary region (properties or layers)

Validation:

- npm run quality -w @broadset/demo
- npm run ct -w @broadset/demo

### Unit TI-1.2 ObjectFit panel test rewrite (behavior, not presence)

- [ ] tests: red
- [ ] impl: green

Primary files:

- packages/ui/src/panels.object-fit.test.tsx

Acceptance criteria:

- test asserts available object-fit options
- selection interaction emits exact update payload
- no assertion is only region presence

Validation:

- npm run quality -w @broadset/ui

### Unit TI-1.3 Multi-edit routing rewrite

- [ ] tests: red
- [ ] impl: green

Primary files:

- packages/ui/src/panels.multi-edit.test.tsx

Acceptance criteria:

- test performs real edit interaction in multi-select mode
- test asserts update payload path for multi-selection
- mixed/common value behavior assertions are explicit

Validation:

- npm run quality -w @broadset/ui

### Unit TI-1.4 Spacing link/sync rewrite

- [ ] tests: red
- [ ] impl: green

Primary files:

- packages/ui/src/panels.spacing.test.tsx

Acceptance criteria:

- link mode toggle is exercised
- one side value is actually changed
- emitted payload confirms all four sides synchronize to the new value

Validation:

- npm run quality -w @broadset/ui

### Unit TI-1.5 Typography intent alignment rewrite

- [ ] tests: red
- [ ] impl: green

Primary files:

- packages/ui/src/panels.typography.test.tsx

Acceptance criteria:

- test title matches behavior actually exercised
- interaction targets intended control (font weight or font size)
- asserted payload key and value are exact

Validation:

- npm run quality -w @broadset/ui

### Unit TI-2.1 Appearance panel completeness rewrite

- [ ] tests: red
- [ ] impl: green

Primary files:

- packages/ui/src/panels.appearance.test.tsx

Acceptance criteria:

- complete border style options are asserted
- selected style update payload is asserted
- smoke-style presence-only assertions removed or replaced

Validation:

- npm run quality -w @broadset/ui

### Unit TI-2.2 Box effects panel behavior rewrite

- [ ] tests: red
- [ ] impl: green

Primary files:

- packages/ui/src/panels.box-effects.test.tsx

Acceptance criteria:

- at least one interaction assertion for each relevant control family
- asserted outcomes are behavior and payload, not only label presence

Validation:

- npm run quality -w @broadset/ui

### Unit TI-2.3 Animation mode panel behavior rewrite

- [ ] tests: red
- [ ] impl: green

Primary files:

- packages/ui/src/panels.animation-mode.test.tsx

Acceptance criteria:

- adapter include/remove semantics are interaction-tested
- assertions verify adapter method calls and relevant state path

Validation:

- npm run quality -w @broadset/ui

### Unit TI-2.4 Scene-help duplicate cleanup and stronger mapping assertion

- [ ] tests: red
- [ ] impl: green

Primary files:

- packages/demo/src/demo-app.scene-help.test.tsx

Acceptance criteria:

- duplicate tab-count test removed
- replacement test asserts tab-to-page mapping behavior, not only count

Validation:

- npm run quality -w @broadset/demo

### Unit TI-2.5 Modal integration assertions upgrade

- [ ] tests: red
- [ ] impl: green

Primary files:

- packages/demo/src/demo-app.modals.test.tsx

Acceptance criteria:

- modal flows assert at least one concrete outcome after action
- presence-only expectations are not the only validation

Validation:

- npm run quality -w @broadset/demo

### Unit TI-3.1 Modal keyboard/focus CT in real browser

- [ ] tests: red
- [ ] impl: green

Primary files:

- packages/demo/ct/accessibility/** or packages/ui/ct/**

Acceptance criteria:

- focus enters modal when opened
- tab cycle remains trapped as required
- Escape close behavior verified where spec requires
- primary action behavior verified with real keyboard interaction

Validation:

- npm run ct -w @broadset/demo
- npm run ct -w @broadset/ui

### Unit TI-3.2 Panel interaction parity CT

- [ ] tests: red
- [ ] impl: green

Primary files:

- packages/demo/ct/layout/** and or packages/ui/ct/**

Acceptance criteria:

- object-fit change flow asserted end-to-end
- spacing link sync flow asserted end-to-end
- typography update flow asserted end-to-end
- for cross-region flows, all impacted regions are asserted in the same CT

Validation:

- npm run ct -w @broadset/demo
- npm run ct -w @broadset/ui

### Unit TI-3.3 Reduce mock blind spots while preserving unit speed

- [ ] tests: red
- [ ] impl: green

Primary files:

- packages/ui/src/modals/test-helpers.tsx
- packages/ui/src/inputs/test-helpers.tsx
- packages/demo/src/demo-shell-test-utils.ts

Acceptance criteria:

- remove or narrow mocks that hide browser-critical behavior
- keep lightweight mocks only for deterministic unit-scope concerns
- migrated browser-critical behaviors have CT coverage before mock reduction is considered complete

Validation:

- npm run quality -w @broadset/ui
- npm run quality -w @broadset/demo
- npm run ct -w @broadset/ui
- npm run ct -w @broadset/demo

### Unit TI-4.1 Final repository gate and residual-risk closure

- [ ] tests: red
- [ ] impl: green

Acceptance criteria:

- no known critical flow remains verified only via mocked wrappers
- no known presence-only critical interaction tests remain in target files
- all previous units in this plan are checked complete
- full root gates pass (including `lint:dead` and `lint:typecoverage`, which moved into `gate:full` after the Vitest switch)

Validation:

- npm run quality:all
- npm run build
- npm run ct:all
- npm run gate:full

## Reporting Format for Ralph Runs

After each completed unit, report:

1. unit id
2. files changed
3. tests removed and reason
4. tests rewritten and new behavior asserted
5. tests migrated to CT and why
6. validation command outputs summary
7. residual risks and next unit

## Definition of Done

This plan is complete only when:

1. all unit checkboxes are marked done
2. browser-critical interactions are covered in CT
3. target low-value tests are removed or rewritten with behavior assertions
4. no gate suppression was introduced (no new `.skip`/`.todo`, `eslint-disable`, `@ts-ignore`, or mock widening that hides browser-critical behavior)
5. `npm run gate:full` passes from repository root
6. no reintroduction of Jest APIs, `@jest-environment` pragmas, or `@jest/globals` imports (verify with `rg -n "@jest-environment|@jest/globals|(?<![A-Za-z0-9_])jest\." packages/*/src` returning zero)
