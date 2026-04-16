# Vitest Switch Plan (Ralph-Compatible)

Date: 2026-04-15
Owner: Follow-up implementation agent
Status: ready for Ralph loop execution

This plan is intentionally formatted like the phase plans so Ralph can execute it unit-by-unit with red/green progression.

## Ralph Loop Convention

Each unit below is implemented test-first.

- [ ] tests: red
- [ ] impl: green

A unit is complete only when both boxes are checked and the listed validation commands pass.

## Global Constraints

1. Fix root causes. Never weaken quality gates.
2. Keep Playwright CT untouched. This plan covers unit and integration runner migration only.
3. Preserve existing behavioral coverage and test intent.
4. Keep package boundaries and HeroUI rules unchanged.
5. Prefer small batches, max 5 focused fixes per batch.

## Source of Truth

- project/implementation/plan.md
- .github/instructions/testing.instructions.md
- .github/instructions/typescript.instructions.md
- CONTRIBUTING.md
- AGENTS.md

## Current Execution Order

Run in this order unless explicitly redirected:

1. VS-1.1
2. VS-1.2
3. VS-1.3
4. VS-1.4
5. VS-2.1
6. VS-2.2
7. VS-2.3
8. VS-2.4
9. VS-3.1
10. VS-3.2
11. VS-4.1

## Ralph Invocation Notes

Use Ralph with either no argument (first unchecked unit in this file) or an explicit unit id.

Examples:

- Ralph loop
- implement next unit from vitest-switch
- continue VS-2.3
- run unit VS-3.1

When using an explicit argument, use the exact unit id and title prefix from this plan.

## Units

### Unit VS-1.1 Baseline and migration scaffolding

- [ ] tests: red
- [ ] impl: green

Scope:

- capture baseline command status before migration
- inventory current Jest configs and setup file expectations
- define Vitest base config shape for all packages

Primary files:

- package.json
- jest.base.cjs
- test/jest.setup.js
- packages/\*/jest.config.cjs

Acceptance criteria:

- baseline command output recorded in PR notes or commit message context
- clear Vitest config contract defined for node vs jsdom packages
- no production code changes

Validation:

- npm run quality:all
- npm run ct

### Unit VS-1.2 Shared Vitest base config and setup migration

- [ ] tests: red
- [ ] impl: green

Scope:

- add root Vitest base config
- migrate Jest setup behaviors to Vitest setup file
- preserve jest-dom matchers and required polyfills

Primary files:

- vitest.base.ts (new)
- test/vitest.setup.ts (new)
- test/jest.setup.js (remove after adoption)

Acceptance criteria:

- jsdom and node environments are both supported in config
- TextEncoder, TextDecoder, structuredClone setup preserved
- test discovery targets package src tests as before

Validation:

- npm run typecheck

### Unit VS-1.3 Package-level Vitest config adoption

- [ ] tests: red
- [ ] impl: green

Scope:

- create per-package Vitest config or shared extension as needed
- map renderer and formats special transform behavior to Vitest-native handling
- keep package-specific environment choices consistent

Primary files:

- packages/model/vitest.config.ts (new)
- packages/playback/vitest.config.ts (new)
- packages/renderer/vitest.config.ts (new)
- packages/editor/vitest.config.ts (new)
- packages/formats/vitest.config.ts (new)
- packages/ui/vitest.config.ts (new)
- packages/demo/vitest.config.ts (new)
- packages/\*/jest.config.cjs (remove when package is switched)

Acceptance criteria:

- each package test command can run on Vitest without Jest config
- node environment retained for model package
- jsdom environment retained where required

Validation:

- npm run test --workspaces --if-present

### Unit VS-1.4 Script wiring and quality gate compatibility

- [ ] tests: red
- [ ] impl: green

Scope:

- switch package test scripts from Jest to Vitest run mode
- update quality scripts that depend on old Jest flags
- keep root script workflow unchanged from user perspective

Primary files:

- package.json
- packages/model/package.json
- packages/playback/package.json
- packages/renderer/package.json
- packages/editor/package.json
- packages/formats/package.json
- packages/ui/package.json
- packages/demo/package.json

Acceptance criteria:

- npm run test at root runs Vitest across workspaces
- package quality commands still execute lint, typecheck, test in required order
- no CI-incompatible script regressions

Validation:

- npm run test
- npm run quality:all

### Unit VS-2.1 Mechanical Jest API codemod pass

- [ ] tests: red
- [ ] impl: green

Scope:

- replace imports from @jest/globals with vitest imports
- replace jest namespace calls with vi equivalents
- keep assertion semantics unchanged

Primary files:

- packages/_/src/\*\*/_.test.ts
- packages/_/src/\*\*/_.test.tsx

Acceptance criteria:

- no remaining @jest/globals imports
- no remaining active jest. API calls in test files
- codemod-only changes are isolated from functional refactors

Validation:

- rg -n "@jest/globals|\bjest\." packages/\*/src
- npm run test --workspaces --if-present

### Unit VS-2.2 Manual fixups for mocks, timers, and edge APIs

- [ ] tests: red
- [ ] impl: green

Scope:

- fix non-mechanical incompatibilities after codemod
- align fake timers and module mock behavior with Vitest semantics
- fix renderer and formats edge tests that depended on Jest-specific behavior

Primary files:

- packages/_/src/\*\*/_.test.ts
- packages/_/src/\*\*/_.test.tsx

Acceptance criteria:

- all package test suites pass under Vitest
- mock and timer tests are stable and deterministic
- no fallback to disabling failing assertions

Validation:

- npm run quality -w @broadset/model
- npm run quality -w @broadset/playback
- npm run quality -w @broadset/renderer
- npm run quality -w @broadset/editor
- npm run quality -w @broadset/formats
- npm run quality -w @broadset/ui
- npm run quality -w @broadset/demo

### Unit VS-2.3 Resolver and asset/style mock parity

- [ ] tests: red
- [ ] impl: green

Scope:

- replicate Jest moduleNameMapper behavior in Vitest resolve and alias settings
- ensure style and file mocks remain stable for component tests
- preserve ESM handling for HeroUI and related packages

Primary files:

- vitest.base.ts
- test/mocks/styleMock.js
- test/mocks/fileMock.js

Acceptance criteria:

- test imports for css, images, and HeroUI resolve without Jest mapping
- no package requires ad hoc local resolve hacks

Validation:

- npm run test --workspaces --if-present

### Unit VS-2.4 Remove Jest and Babel-Jest test stack

- [ ] tests: red
- [ ] impl: green

Scope:

- remove unused Jest dependencies and Jest config files
- remove Babel-only test transform config if no longer needed
- keep lint and typecheck clean after dependency pruning

Primary files:

- package.json
- babel.config.json
- jest.base.cjs
- packages/\*/jest.config.cjs

Acceptance criteria:

- Jest dependencies removed from workspace manifests
- no scripts reference Jest
- no dead config files remain

Validation:

- npm run lint
- npm run typecheck
- npm run test

### Unit VS-3.1 Documentation and workflow update

- [ ] tests: red
- [ ] impl: green

Scope:

- update implementation docs to state Vitest as unit test runner
- update workflow references that mention Jest commands
- ensure instructions remain consistent with actual scripts

Primary files:

- project/implementation/architecture.md
- CONTRIBUTING.md
- project/implementation/test-improvement-plan.md (only if references runner details)

Acceptance criteria:

- docs reference Vitest where runner-specific text exists
- no stale Jest command snippets remain in active docs

Validation:

- npm run quality:all

### Unit VS-3.2 Full regression validation including CT

- [ ] tests: red
- [ ] impl: green

Scope:

- run full repository validation after migration
- verify CT stability remains unchanged

Primary files:

- no code changes expected unless regression fixes are required

Acceptance criteria:

- root quality and build/test chain passes
- CT still passes
- migration branch is merge-ready

Validation:

- npm run quality:all
- npm run build
- npm run ct

### Unit VS-4.1 Post-switch stabilization and follow-up backlog

- [ ] tests: red
- [ ] impl: green

Scope:

- capture any known Vitest migration follow-ups that are non-blocking
- split follow-ups into small independent tasks

Primary files:

- project/implementation/vitest-switch.md
- project/implementation/carry-over-plan-progress.md (optional reference update)

Acceptance criteria:

- remaining work is documented as explicit backlog items
- no blocking test instability remains for merge

Validation:

- npm run quality:all

## Done Definition

The Vitest switch is complete when all units above are checked and these commands pass from repository root:

- npm run quality:all
- npm run build
- npm run ct
