# Vitest Coverage Reporting Plan (Ralph-Compatible)

Date: 2026-04-20
Owner: Follow-up implementation agent
Status: complete as of 2026-04-28

Add runtime coverage reporting to the Vitest test stack. Coverage is a signal, not a gate — we want visibility into untested branches without blocking PRs on threshold noise.

## Why

- `gate:full` already enforces `type-coverage ≥ 99.95%` (type coverage), but nothing reports which source lines/branches are actually exercised by tests.
- After the test-improvement-plan rewrites we have 1500+ behavior-asserting tests. Without a coverage report we can't tell which production code paths they actually hit.
- Coverage data is load-bearing for the future cross-region CT audit (`project/implementation/cross-region-ct-audit.md`) — gaps in branch coverage often map to untested cross-region flows.

## Scope boundary

- Unit-test coverage only (Vitest). CT coverage is out of scope — Playwright has its own coverage story and the ROI is lower for UI-shell CTs.
- Coverage is **non-gating**. The output is a machine-readable report plus a human-readable summary. No CI failure on dropping below a threshold in this plan; that is a follow-up after we have baseline numbers.
- No coverage for TypeScript-only files (types, interfaces) — v8 coverage naturally skips these.

## Ralph Loop Convention

Each unit below is implemented test-first.

- [x] tests: red
- [x] impl: green

A unit is complete only when both boxes are checked and the listed validation commands pass.

## Prerequisite

- Vitest migration complete (`project/implementation/vitest-switch.md` done ✓).
- `npm run gate:full` green on the current branch.

## Global Constraints

1. Coverage must not weaken `gate:full`. Adding coverage collection must not push runtime significantly (>30% added test-suite wall time is a blocker; optimize or shard).
2. Use `@vitest/coverage-v8` (Node's built-in V8 coverage via Vitest) — not istanbul. V8 is faster and avoids source-instrumentation surprises.
3. Report formats: `text-summary` (stdout, human readable), `json-summary` (machine readable for tooling), and `html` (browse locally, gitignored).
4. Do not commit the coverage report output (`coverage/` directory must be gitignored).
5. Exclude non-production files from coverage: test files, test helpers, fixtures, CT files, vitest configs, setup files, dist/.
6. Do not introduce coverage thresholds as a gate in this plan. Thresholds are a follow-up informed by the baseline numbers produced here.

## Source of Truth

- `vitest.base.ts` — shared config factory consumers extend
- `packages/*/vitest.config.ts` — per-package configs
- `package.json` — root scripts
- Vitest docs: https://vitest.dev/guide/coverage

## Current Execution Order

Run in this order unless explicitly redirected:

1. CR-1.1 Install `@vitest/coverage-v8` and wire up base config
2. CR-1.2 Exclusion rules and per-package coverage overrides
3. CR-1.3 Root `test:coverage` script + gitignore
4. CR-2.1 Baseline measurement and report into `project/implementation/coverage-baseline.md`
5. CR-2.2 Documentation update in architecture.md + testing.instructions.md
6. CR-3.1 Optional follow-up: propose threshold levels based on baseline

## Units

### Unit CR-1.1 Install `@vitest/coverage-v8` and wire coverage into `vitest.base.ts`

- [x] tests: red
- [x] impl: green

Scope:

- Add `@vitest/coverage-v8` to root `devDependencies` pinned to the exact Vitest version (`^4.1.4` to match `vitest`)
- Update `vitest.base.ts` to emit coverage reports under `test.coverage` when the `VITEST_COVERAGE` env var is set:
  ```ts
  test: {
    ...,
    coverage: {
      provider: 'v8',
      enabled: process.env['VITEST_COVERAGE'] === '1',
      reporter: ['text-summary', 'json-summary', 'html'],
      reportsDirectory: './coverage',
      // exclusions covered in CR-1.2
    },
  }
  ```
- `enabled` is gated on the env var so default `npm run test` runs stay fast; coverage only runs when the developer opts in.

Primary files:

- package.json (root — new dev dep)
- vitest.base.ts

Acceptance criteria:

- `npm install` succeeds with the new dep
- `VITEST_COVERAGE=1 npx vitest run packages/model` emits a text-summary report to stdout
- `npm run test` without the env var runs as before (no coverage overhead)
- coverage provider is v8, not istanbul

Validation:

- `VITEST_COVERAGE=1 npx vitest run packages/model` prints a coverage summary
- `time npm run test` baseline does not regress by more than 5%

### Unit CR-1.2 Exclusion rules and per-package coverage overrides

- [x] tests: red
- [x] impl: green

Scope:

- In `vitest.base.ts` add `coverage.exclude` with the standard exclusions:
  - `**/*.test.{ts,tsx}`
  - `**/*.d.ts`
  - `**/test-helpers*`
  - `**/*-test-utils*`
  - `**/testing/**`
  - `**/vitest.config.ts`
  - `vitest.base.ts`
  - `packages/*/dist/**`
  - `packages/*/ct/**` (Playwright CT is out of scope for unit coverage)
  - `packages/demo/playwright/**`
  - `packages/demo/src/main.tsx` (entrypoint, CT-covered)
  - `packages/demo/src/sampleDocument.{ts,json}` (fixture data)
- Leave per-package `vitest.config.ts` files untouched unless a package needs additional excludes (e.g., `packages/formats` may want to exclude PDF/PSD binary fixtures)

Acceptance criteria:

- `VITEST_COVERAGE=1 npx vitest run` top-level summary shows no test files, helper files, CT files, or dist files as "covered lines"
- spot-check: pick one `*.test.ts` and confirm it is absent from the coverage report

Validation:

- `VITEST_COVERAGE=1 npx vitest run` produces a coverage report where every listed file is in `packages/*/src/` and is production code

### Unit CR-1.3 Root `test:coverage` script + gitignore

- [x] tests: red
- [x] impl: green

Scope:

- Add to root `package.json`:
  ```json
  "test:coverage": "VITEST_COVERAGE=1 vitest run"
  ```
- Append to `.gitignore`:
  ```
  coverage/
  packages/*/coverage/
  ```
- Add to `knip.json` workspaces that need it: ensure the `coverage/` output isn't flagged as an unused file.

Acceptance criteria:

- `npm run test:coverage` runs Vitest with coverage enabled across all packages via the workspace projects config
- generated `coverage/` directories are untracked by git
- `npm run gate:full` still passes (coverage script is additive, not a gate)

Validation:

- `npm run test:coverage` exits 0 with summary printed
- `git status` after `test:coverage` shows no `coverage/` files staged

### Unit CR-2.1 Baseline measurement

- [x] tests: red
- [x] impl: green

Scope:

- Run `npm run test:coverage` on the current branch
- Record the top-level coverage percentages (lines, branches, functions, statements) per package in `project/implementation/coverage-baseline.md`
- For each package, include the 5 lowest-covered files and their coverage numbers
- Note any surprises (e.g., a file with 0% coverage that you expected tests to touch)

Primary files:

- project/implementation/coverage-baseline.md (new)

Acceptance criteria:

- baseline file lists all 7 packages with per-metric numbers
- each package's section calls out the 5 lowest-covered files
- at least one "surprise" observation is recorded, OR a statement that nothing surprising was found

Validation:

- baseline file committed; numbers match the most recent `npm run test:coverage` run

### Unit CR-2.2 Documentation update

- [x] tests: red
- [x] impl: green

Scope:

- Update `project/implementation/architecture.md` Dependencies table to list `@vitest/coverage-v8` under "Unit testing"
- Update `agents/instructions/testing.instructions.md` with a new section "Coverage" that:
  - links to `coverage-baseline.md`
  - tells developers to run `npm run test:coverage` before opening a PR that touches untested paths
  - explicitly notes that coverage is not gating

Acceptance criteria:

- both docs reference the new script and report location
- testing instructions explain how to read the report and what to do with a drop

Validation:

- `npm run quality:all` passes
- `rg -n "test:coverage" agents project` lists both docs

### Unit CR-3.1 (Optional) Propose threshold levels

- [x] tests: red
- [x] impl: green

Scope:

- Based on the baseline, propose a minimum coverage level per package that allows existing tests to pass but catches regressions
- Write the proposal to `project/implementation/coverage-thresholds-proposal.md` — **do not** wire thresholds into `gate:full` in this unit
- Concrete recommendation: set each package's threshold ~2 percentage points below its baseline so a meaningful drop fails CI but normal churn doesn't
- Include a "go / no-go" recommendation on whether to add coverage to `gate:full` at all

Acceptance criteria:

- proposal lists a threshold per package, per metric (lines, branches, functions, statements)
- each threshold is justified with baseline math
- explicit recommendation on gate inclusion with tradeoffs

Validation:

- proposal file committed; no `gate:full` changes

## Done Definition

- `npm run test:coverage` emits a coverage report locally
- baseline numbers committed to `coverage-baseline.md`
- docs updated so the next agent knows how to run coverage and what to do with it
- CR-3.1 delivered OR explicitly deferred with reason in this file
- `gate:full` still green and not materially slower
