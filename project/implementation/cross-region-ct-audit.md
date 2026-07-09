# Cross-Region CT Audit Plan (Ralph-Compatible)

Date: 2026-04-20
Owner: Follow-up implementation agent
Status: inventory complete; CT gap closure pending as of 2026-04-28

Current-status note: use
[cross-region-ct-inventory.md](./cross-region-ct-inventory.md) for the live
coverage counts and CRA work queue. This file preserves the audit execution
plan and closeout criteria.

This plan closes the CT Derivation Rule gap left by `test-improvement-plan.md`. TI-3.2 exercised three flows (object-fit, typography, spacing) plus the modal/snapshot flows picked up ad hoc. This plan systematically audits every spec, classifies cross-region scenarios, and writes CT coverage for any that lack it.

## Why this is separate

The CT Derivation Rule in `agents/instructions/testing.instructions.md` says:

> Every spec scenario where the user performs an action in one UI region and the expected outcome is visible in a different UI region MUST have a Playwright CT test.

TI-3.2 sampled a handful of cross-region flows but never produced a complete inventory. That inventory is load-bearing: every CT gap it surfaces becomes a unit in Phase 2 below, so the scope of Phase 2 only crystallizes after Phase 1 lands.

## Ralph Loop Convention

Each unit below is implemented test-first.

- [ ] tests: red
- [ ] impl: green

A unit is complete only when both boxes are checked and the listed validation commands pass.

## Prerequisite

- `project/implementation/test-improvement-plan.md` is complete (✓ already true — all TI units checked).
- `npm run gate:full` is green on the current branch before starting.

## Global Constraints

1. Every cross-region scenario found in a spec MUST either have a CT or a documented waiver in `## Spec Gaps` on the owning spec file.
2. Each CT MUST assert all impacted regions in a single test, per the CT Derivation Rule.
3. Do not widen the mock surface in `packages/ui/src/testing/heroui-mock-common.tsx` to pass a CT — CT tests run against real HeroUI.
4. Keep unit-level tests unchanged unless a CT replaces a behavior the unit only faked (same rule as TI-3.3).
5. Prefer extending an existing CT file over creating a new one when the flow is closely related to an existing CT.
6. Max 5 new CTs per commit to keep review scope manageable.

## Source of Truth

- `agents/instructions/testing.instructions.md` — CT Derivation Rule + illustrative table
- `project/spec/editor/**`, `project/spec/ui/**`, `project/spec/demo/**` — source scenarios
- `packages/demo/ct/**`, `packages/ui/ct/**` — current CT coverage

## Unit vs CT Decision (repeated verbatim from testing.instructions.md)

A scenario MUST be a CT when:

- User action in one region produces a visible outcome in a **different** region (canvas, transform widget, properties panel, layers panel, toolbar, timeline, modal, bottom bar).
- Interaction depends on focus trap, keyboard navigation, popover portal, or ARIA state transition.
- Drag / resize / rotate / pointer choreography is involved.

Otherwise keep it as a unit test.

## Current Execution Order

Run in this order unless explicitly redirected:

1. CRA-1.1 Spec inventory (editor)
2. CRA-1.2 Spec inventory (ui)
3. CRA-1.3 Spec inventory (demo)
4. CRA-1.4 Consolidate into a single gap list
5. CRA-2.x Per-gap CT unit (scope materializes after CRA-1.4)
6. CRA-3.1 Final regression and gate

## Ralph Invocation Notes

Use Ralph with either no argument (first unchecked unit in this file) or an explicit unit id. CRA-1.4 materialized the CRA-2.x work queue in `cross-region-ct-inventory.md`; resume from the first unchecked CRA-2.x inventory unit.

## Units

### Unit CRA-1.1 Inventory cross-region scenarios in `project/spec/editor/**`

- [x] tests: red
- [x] impl: green

Scope:

- Read every spec file under `project/spec/editor/`
- For each `### Requirement:` → `#### Acceptance Criteria:` bullet containing a GIVEN/WHEN/THEN, classify:
  - **cross-region** if WHEN targets one UI region and THEN asserts a change in another
  - **single-region** if WHEN and THEN are both in one region
  - **non-UI** if it is pure data/model behavior (skip)
- Record findings in `project/implementation/cross-region-ct-inventory.md` as a table: `spec file | heading | WHEN region | THEN region(s) | classification | note`.

Acceptance criteria:

- every editor spec file is listed in the inventory, including ones with zero cross-region scenarios (documented explicitly)
- classification is per acceptance-criterion bullet, not per spec file
- `cross-region` rows include the specific regions and a one-line note about the intended behavior

Validation:

- `rg -c "## Requirement" project/spec/editor` total is reflected in the inventory counts
- inventory file has no `TODO` / `TBD` entries

### Unit CRA-1.2 Inventory cross-region scenarios in `project/spec/ui/**`

- [x] tests: red
- [x] impl: green

Scope:

- Same procedure as CRA-1.1 against `project/spec/ui/`
- Append to the same `cross-region-ct-inventory.md`

Acceptance criteria:

- every ui spec file is listed
- cross-region entries follow the CRA-1.1 format
- panel-family groupings (appearance, geometry, typography, etc.) are surfaced as section headers in the inventory for quick scanning

Validation:

- inventory completeness as in CRA-1.1

### Unit CRA-1.3 Inventory cross-region scenarios in `project/spec/demo/**`

- [x] tests: red
- [x] impl: green

Scope:

- Same procedure against `project/spec/demo/`
- Append to `cross-region-ct-inventory.md`

Acceptance criteria:

- every demo spec file is listed
- cross-region entries follow the CRA-1.1 format

Validation:

- inventory completeness as in CRA-1.1 and CRA-1.2

### Unit CRA-1.4 Map inventory to existing CT coverage → gap list

- [x] tests: red
- [x] impl: green

Scope:

- For every `cross-region` row in `cross-region-ct-inventory.md`, grep `packages/demo/ct/**` and `packages/ui/ct/**` for a CT that covers it
- Mark each row **covered** (cite CT file + test title), **partial** (cite gap), or **missing**
- Output a "Gap List" section at the bottom of the inventory with every `missing` and `partial` row
- For each gap, draft a CRA-2.x unit stub (unit id, target spec, target CT file, a one-line scope) — these are the execution units for Phase 2

Acceptance criteria:

- every cross-region row has a coverage verdict
- Gap List is ordered by UI region affected (canvas first, then properties, layers, toolbar, timeline, modal, bottom bar) so related gaps batch together
- `cross-region-ct-inventory.md` gains a CRA-2.1 … CRA-2.N section matching the Gap List
- no phantom units: every CRA-2.x corresponds to a concrete inventory row

Validation:

- `rg "^### Unit CRA-2" project/implementation/cross-region-ct-inventory.md` count equals Gap List length
- spot-check: pick 3 gaps, verify the cited CT file truly lacks an assertion for the target flow

### Unit CRA-2.x Per-gap CT unit (materialized by CRA-1.4)

Each CRA-2.x unit will be generated by CRA-1.4 with this shape:

```
### Unit CRA-2.N <short title describing the cross-region flow>

- [ ] tests: red
- [ ] impl: green

Spec reference:

- `project/spec/<area>/<file>.md` → `### Requirement: <heading>` → `#### Acceptance Criteria:` bullet `<N>`

Scope:

- Add a CT that performs the WHEN action in its source region AND asserts the THEN outcome in every affected region in one test
- Extend an existing CT file if the flow sits alongside sibling CTs; otherwise create a new file under `packages/demo/ct/<area>/` or `packages/ui/ct/<area>/`

Acceptance criteria:

- the CT fails when the cross-region wiring is broken (verify by temporarily stubbing the wiring)
- the CT asserts every impacted region listed in the inventory row, not just one
- the CT runs against real HeroUI — no mocks added to `heroui-mock-common.tsx` to satisfy it

Validation:

- `npm run ct -w @broadset/demo` or `npm run ct -w @broadset/ui` (whichever owns the file)
```

CRA-2.x units run in the order CRA-1.4 emits. Max 5 per commit (see global constraints).

### Unit CRA-3.1 Final regression and inventory reconciliation

- [ ] tests: red
- [ ] impl: green

Scope:

- Verify every cross-region inventory row now resolves to **covered**
- Run `npm run gate:full` from repository root
- Update `cross-region-ct-inventory.md` to mark every former gap as covered and cite the new CT file + test title
- If any spec row remains genuinely infeasible to CT (e.g. print-mode rendering), record it in that spec file's `## Spec Gaps` section with justification

Acceptance criteria:

- Gap List in inventory is empty OR every remaining entry has a linked `## Spec Gaps` waiver
- `npm run gate:full` passes
- `npm run ct:all` passes with zero flakes across 3 consecutive runs (no retries consuming the `retries: process.env.CI ? 1 : 0` budget in the CT config)

Validation:

- `npm run gate:full`
- `for i in 1 2 3; do npm run ct:all || break; done`

## Done Definition

- All CRA-1.x inventory units are checked complete
- CRA-1.4 produced a Gap List that has been fully converted to CRA-2.x units
- Every CRA-2.x unit is checked complete
- CRA-3.1 confirms `gate:full` green and inventory has zero open gaps (or documented waivers)
