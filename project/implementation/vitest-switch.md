# Vitest Switch Plan (Ralph-Compatible)

Date: 2026-04-15
Reviewed: 2026-04-20
Owner: Follow-up implementation agent
Status: ready for Ralph loop execution

This plan is intentionally formatted like the phase plans so Ralph can execute it unit-by-unit with red/green progression.

## Current Repository State (2026-04-20 snapshot)

Captured here so Ralph does not have to rediscover it. Verify before each unit in case the tree has moved.

- Jest stack files: `jest.base.cjs`, `jest.config.cjs` (projects aggregator), `jest.heroui-mapper.cjs`, `test/jest.setup.js`, `test/mocks/{styleMock,fileMock}.js`, and one `packages/<pkg>/jest.config.cjs` for each of the 7 packages (`model`, `playback`, `renderer`, `editor`, `formats`, `ui`, `demo`).
- Babel stack (test-only): `babel.config.json` (`env.test` preset only); root devDeps `@babel/core`, `@babel/preset-env`, `@babel/preset-typescript`, `@babel/plugin-transform-react-jsx`, `babel-jest`.
- Jest-specific root devDeps: `jest-environment-jsdom`, `@types/jest`. Per-package: `jest`, and `@jest/globals` in every package except `renderer`.
- Package-level scripts: `"test": "jest --config jest.config.cjs --passWithNoTests"` in every package except `renderer`, which prefixes `NODE_OPTIONS=--experimental-vm-modules`. Every package's `quality` / `quality:strict` ends with `npm run test -- --runInBand` (flag is Jest-only).
- Docblock pragmas: ~65 test files start with `/** @jest-environment jsdom */` (2 use `node`). These must become `@vitest-environment`.
- Jest API surface: `@jest/globals` imported in ~20 test files; `jest.*` calls (fn, mock, spyOn, useFakeTimers, advanceTimersByTime, requireActual, mocked, setTimeout, Mock, MockedFunction) appear 421 times across 62 files.
- Existing snapshots: `packages/ui/src/__snapshots__/panels.sidebar.test.tsx.snap` (1 file). Vitest's snapshot format is compatible but behavior should be verified.
- Jest-leaning filename: `packages/ui/src/jest-dom.d.ts` (only imports `@testing-library/jest-dom`) — rename to match new runner.
- Knip entries reference Jest paths: `knip.json` workspace `"."` has `"entry": ["jest.config.cjs", "test/jest.setup.js"]`. These must be updated or `lint:dead` in `gate:full` will fail.
- Instruction docs referring to Jest by name:
  - `project/implementation/architecture.md` lines 32 and 149 (runtime matrix + dependency table)
  - `project/implementation/test-improvement-plan.md` lines 47 and 98
  - `agents/instructions/testing.instructions.md` lines 2 and 8
  - `agents/instructions/workflow.instructions.md` line 63
  - `agents/instructions/ways-of-working.instructions.md` line 44
  - `agents/instructions/definition-of-done.instructions.md` line 18
  - `agents/ralph.agent.md` line 232 (executable command: `npx jest --testPathPattern=<unit> --no-coverage`)
  - `CONTRIBUTING.md` — no direct Jest mention but documents the `quality:strict` chain
- CT stack (untouched by this plan): `packages/ui/playwright-ct.config.ts`, `packages/demo/playwright-ct.config.ts`, each with a `ct` script.

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
- agents/instructions/testing.instructions.md
- agents/instructions/typescript.instructions.md
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

- capture baseline command status before migration (`npm run quality:all`, `npm run ct`, `npm run lint:dead`, `npm run lint:typecoverage`, `npm run build`)
- re-verify the "Current Repository State" snapshot above still matches the tree; note any drift
- inventory current Jest configs, setup file behaviors, docblock pragmas, `@jest/globals` imports, `jest.*` callsites, knip entries, and doc/instruction references
- define Vitest base config contract covering: environment selection (node vs jsdom), setup file behaviors to preserve (jest-dom matchers, TextEncoder/Decoder, structuredClone, SVGElement geometry polyfill), globals policy (explicit imports from `vitest`, keep `globals: false`), and asset/style mocks

Primary files:

- package.json (root + every package)
- jest.base.cjs
- jest.config.cjs
- jest.heroui-mapper.cjs
- test/jest.setup.js
- test/mocks/styleMock.js
- test/mocks/fileMock.js
- packages/\*/jest.config.cjs
- babel.config.json
- knip.json

Acceptance criteria:

- baseline command output recorded in PR notes or commit message context
- clear Vitest config contract defined for node vs jsdom packages, including the explicit-imports globals policy
- inventory list committed to this plan (or PR description) including: doc-pragma file count, `@jest/globals` import file list, `jest.*` callsite count, knip entries needing change, and docs/instructions needing update
- no production code changes

Validation:

- npm run quality:all
- npm run ct

### Unit VS-1.2 Install Vitest deps, shared base config, and setup migration

- [ ] tests: red
- [ ] impl: green

Scope:

- install Vitest toolchain in the root devDependencies
- add root Vitest base config that packages extend
- migrate Jest setup behaviors (jest-dom matchers, polyfills) to a Vitest setup file
- keep `test/jest.setup.js` in place until every package has switched (removed in VS-2.4)

Dependencies to add (root devDependencies):

- `vitest` (peer-compatible with the repo's Vite ^8; pin to the latest Vitest line that supports Vite 8)
- `jsdom` (replacement for `jest-environment-jsdom`; Vitest uses the `jsdom` package directly)
- `@vitest/coverage-v8` (only if coverage is required; otherwise omit)
- keep `@testing-library/jest-dom` — Vitest-compatible matchers via the `@testing-library/jest-dom/vitest` entry point
- `@vitejs/plugin-react` is already a root/demo devDep — reuse for jsdom packages that render React

Primary files:

- vitest.base.ts (new — shared defineConfig factory)
- test/vitest.setup.ts (new)
- test/jest.setup.js (kept until VS-2.4)
- package.json (root — new devDeps)

Acceptance criteria:

- `npm install` succeeds with new Vitest deps added
- `vitest.base.ts` exports a shared config factory that a package passes `{ environment: 'node' | 'jsdom' }`, with `globals: false`, `include` patterns matching `src/**/*.test.{ts,tsx}`, asset/style resolve aliases pointing at `test/mocks/{styleMock,fileMock}.js`, and `setupFiles` = `['<rootDir>/test/vitest.setup.ts']` for jsdom environments
- `test/vitest.setup.ts` imports `@testing-library/jest-dom/vitest`, preserves the TextEncoder/TextDecoder, structuredClone, and SVGElement `getTotalLength`/`getPointAtLength` polyfills currently in `test/jest.setup.js`
- globals policy documented: tests import `describe`, `it`, `expect`, `vi` from `vitest` explicitly (no implicit globals), matching the repo's "no implicit" stance
- test discovery targets package src tests as before

Validation:

- npm run typecheck

### Unit VS-1.3 Package-level Vitest config adoption

- [ ] tests: red
- [ ] impl: green

Scope:

- create per-package `vitest.config.ts` files (or a single root `vitest.workspace.ts` listing each package) that extend `vitest.base.ts`
- retire Jest ESM workarounds that are no longer needed under Vitest
- keep package-specific environment choices consistent
- keep old `packages/*/jest.config.cjs` files in place until VS-2.4 (so the Jest runner still works during transition); they are deleted in VS-2.4

Environment matrix:

- `model`: `node`
- `playback`, `renderer`, `editor`, `formats`, `ui`, `demo`: `jsdom`

Jest workarounds that become unnecessary and MUST be dropped, not ported:

- `packages/renderer/package.json` test script: `NODE_OPTIONS=--experimental-vm-modules` prefix — drop.
- `packages/renderer/jest.config.cjs` and `packages/formats/jest.config.cjs`: `transformIgnorePatterns` for ESM packages (`@heroui`, `@react-aria`, `@react-stately`, `react-aria-components`, `tailwind-merge`, `tailwind-variants`, `@radix-ui`, `@internationalized`, `@libpdf`, `@noble`, `@scure`, `asn1js`, `pkijs`, `pvtsutils`, `pvutils`, `mediabunny`, `path-bool`) — Vite resolves ESM natively, so no transform workaround is needed.
- `packages/renderer/jest.config.cjs` Babel preset-env override — drop; Vitest uses esbuild for TS/JSX.

Primary files:

- vitest.workspace.ts (new — preferred single entry, optional if per-package configs are chosen)
- packages/model/vitest.config.ts (new)
- packages/playback/vitest.config.ts (new)
- packages/renderer/vitest.config.ts (new)
- packages/editor/vitest.config.ts (new)
- packages/formats/vitest.config.ts (new)
- packages/ui/vitest.config.ts (new)
- packages/demo/vitest.config.ts (new — can reuse `packages/demo/vite.config.ts` via `mergeConfig`)
- packages/\*/jest.config.cjs (removed in VS-2.4)

Acceptance criteria:

- each package test command can run on Vitest without any Jest config
- node environment retained for `model`, jsdom for all others
- renderer and formats run without `NODE_OPTIONS=--experimental-vm-modules` or `transformIgnorePatterns`
- demo Vitest config reuses `@vitejs/plugin-react` and the existing `define: { 'process.env.PATH_BOOL_DEV_ASSERTS': '"0"' }` from `packages/demo/vite.config.ts`

Validation:

- npm run test --workspaces --if-present

### Unit VS-1.4 Script wiring and quality gate compatibility

- [ ] tests: red
- [ ] impl: green

Scope:

- switch every package's `test` script from `jest --config jest.config.cjs --passWithNoTests` to `vitest run --passWithNoTests` (drop `NODE_OPTIONS=--experimental-vm-modules` on renderer)
- remove the `--runInBand` flag from every package's `quality` and `quality:strict` scripts — it is a Jest-only flag. Vitest's `run` mode is non-watch by default; parallelism can be constrained with `--pool=forks --poolOptions.forks.singleFork=true` if a regression surfaces, but the default should be preferred
- keep root script workflow (`npm run test`, `npm run quality:all`, `npm run gate:full`) unchanged from the user's perspective
- keep the Husky hooks (`.husky/pre-commit`, `.husky/pre-push`) unchanged — they call the same npm scripts

Per-package script changes (every occurrence):

- `"test": "jest --config jest.config.cjs --passWithNoTests"` → `"test": "vitest run --passWithNoTests"`
- `"test": "NODE_OPTIONS=--experimental-vm-modules jest --config jest.config.cjs --passWithNoTests"` (renderer) → `"test": "vitest run --passWithNoTests"`
- `"quality": "npm run lint && npm run typecheck && npm run test -- --runInBand"` → `"quality": "npm run lint && npm run typecheck && npm run test"`
- same `--runInBand` removal for `quality:strict`
- the demo package's `quality`/`quality:strict` also include `prettier:check`; preserve that ordering, only drop `--runInBand`

Primary files:

- package.json (root — only if knip/script wiring needs touching; most changes live in packages)
- packages/model/package.json
- packages/playback/package.json
- packages/renderer/package.json
- packages/editor/package.json
- packages/formats/package.json
- packages/ui/package.json
- packages/demo/package.json

Acceptance criteria:

- `npm run test` at root runs Vitest across all workspaces
- no `--runInBand` occurrences remain (`rg -n "runInBand" packages package.json` returns zero)
- no `NODE_OPTIONS=--experimental-vm-modules` occurrences remain
- package `quality` / `quality:strict` commands still execute lint, (prettier:check where applicable), typecheck, test in the same order
- Husky `pre-commit` and `pre-push` hooks still green via the same entry scripts
- no CI-incompatible script regressions

Validation:

- npm run test
- npm run quality:all

### Unit VS-2.1 Mechanical Jest API codemod pass

- [ ] tests: red
- [ ] impl: green

Scope:

- replace imports from `@jest/globals` with imports from `vitest`
- replace every `jest.*` callsite with its `vi.*` equivalent
- migrate `@jest-environment` docblock pragmas to `@vitest-environment` on all ~65 affected files
- rename `packages/ui/src/jest-dom.d.ts` → `packages/ui/src/testing-library.d.ts` (still re-exports `@testing-library/jest-dom/vitest` types)
- keep assertion semantics unchanged — no test-behavior refactors in this pass

Required API translation table (mechanical):

| Jest                              | Vitest                                                     |
| --------------------------------- | ---------------------------------------------------------- |
| `/** @jest-environment jsdom */`  | `/** @vitest-environment jsdom */`                         |
| `/** @jest-environment node */`   | `/** @vitest-environment node */`                          |
| `import {...} from '@jest/globals'` | `import {...} from 'vitest'`                             |
| `jest.fn`                         | `vi.fn`                                                    |
| `jest.mock`                       | `vi.mock`                                                  |
| `jest.spyOn`                      | `vi.spyOn`                                                 |
| `jest.useFakeTimers()`            | `vi.useFakeTimers()`                                       |
| `jest.useRealTimers()`            | `vi.useRealTimers()`                                       |
| `jest.advanceTimersByTime`        | `vi.advanceTimersByTime`                                   |
| `jest.runAllTimers`               | `vi.runAllTimers`                                          |
| `jest.requireActual(...)`         | `await vi.importActual(...)` (note: async)                 |
| `jest.mocked`                     | `vi.mocked`                                                |
| `jest.setTimeout(N)`              | `vi.setConfig({ testTimeout: N })` or test-level `{ timeout: N }` |
| `jest.Mock` / `jest.MockedFunction` | `Mock` / `MockedFunction` imported from `vitest`         |
| `jest.clearAllMocks` / `resetAllMocks` / `restoreAllMocks` | `vi.clearAllMocks` / `vi.resetAllMocks` / `vi.restoreAllMocks` |

Note: `vi.mock()` hoists similarly to `jest.mock()`, but the factory's captured variables are stricter. Any test that relies on closure variables inside a `jest.mock` factory will surface in VS-2.2 — leave those for manual fixup rather than a mechanical rewrite.

Primary files:

- packages/\*/src/\*\*/\*.test.ts
- packages/\*/src/\*\*/\*.test.tsx
- packages/\*/src/\*\*/test-helpers\* (helper files also contain `jest.*` calls and pragmas)
- packages/ui/src/jest-dom.d.ts → packages/ui/src/testing-library.d.ts (rename)

Acceptance criteria:

- no remaining `@jest/globals` imports
- no remaining active `jest.*` API calls in test or helper files
- no remaining `/** @jest-environment */` pragmas
- `packages/ui/src/jest-dom.d.ts` renamed (or removed and re-added with a runner-neutral name)
- codemod-only changes are isolated from functional refactors — no test behavior changed in this pass

Validation:

- `rg -n "@jest-environment" packages/*/src` — expect zero
- `rg -n "@jest/globals" packages/*/src` — expect zero
- `rg -n "(?<![A-Za-z0-9_])jest\." packages/*/src` — expect zero (negative-lookbehind avoids matching words like `jest-dom`, though note the file rename above eliminates any remaining ambiguity)
- npm run test --workspaces --if-present

### Unit VS-2.2 Manual fixups for mocks, timers, snapshots, and edge APIs

- [ ] tests: red
- [ ] impl: green

Scope:

- fix non-mechanical incompatibilities surfaced after the VS-2.1 codemod
- align fake timers and module mock behavior with Vitest semantics (hoisting rules, factory closure, default-export handling)
- convert any `jest.requireActual` → `await vi.importActual` callsites to async-aware `vi.mock(..., async () => { const actual = await vi.importActual(...); ... })` form
- verify the one existing snapshot (`packages/ui/src/__snapshots__/panels.sidebar.test.tsx.snap`) still matches under Vitest's serializer; regenerate only if the delta is serializer-formatting and review the diff carefully
- fix renderer and formats edge tests that depended on Jest-specific behavior (ESM interop, `__esModule` flags, module cache resets)

Primary files:

- packages/\*/src/\*\*/\*.test.ts
- packages/\*/src/\*\*/\*.test.tsx
- packages/ui/src/\_\_snapshots\_\_/\*.snap

Acceptance criteria:

- all package test suites pass under Vitest
- mock and timer tests are stable and deterministic (no flakes across 3 consecutive runs)
- snapshot file either matches byte-for-byte or its regeneration was an intentional, reviewed serializer-formatting change
- no fallback to disabling failing assertions (`.skip`, `.todo`) to make the suite go green
- no `eslint-disable` / `@ts-ignore` introduced

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

- replicate the Jest `moduleNameMapper` behavior in Vitest's `resolve.alias` settings (css/less/scss → `test/mocks/styleMock.js`, image assets → `test/mocks/fileMock.js`)
- investigate whether `jest.heroui-mapper.cjs` (which forces `@heroui/react` to its ESM entry) is still required. Vitest runs through Vite's resolver and handles ESM `exports` natively, so this mapper is **expected to be unnecessary**; remove it unless a concrete test failure proves otherwise
- preserve ESM handling for HeroUI, `react-aria-components`, `mediabunny`, `path-bool`, and similar ESM-only packages without any `transformIgnorePatterns` equivalent

Primary files:

- vitest.base.ts
- test/mocks/styleMock.js (kept, re-exported via alias)
- test/mocks/fileMock.js (kept, re-exported via alias)
- jest.heroui-mapper.cjs (remove in this unit if investigation confirms it is unneeded; otherwise port in VS-2.3 and remove in VS-2.4)

Acceptance criteria:

- test imports for css, images, and HeroUI resolve without any Jest mapping
- `jest.heroui-mapper.cjs` is either deleted (preferred) or its removal is explicitly blocked with a documented reason carried into VS-4.1 backlog
- no package requires ad hoc local resolve hacks

Validation:

- npm run test --workspaces --if-present

### Unit VS-2.4 Remove Jest and Babel-Jest test stack

- [ ] tests: red
- [ ] impl: green

Scope:

- delete all Jest config files
- delete the Babel test-only config (no non-test Babel usage exists in this repo — confirm before deleting by grepping for `babel.config` references outside of test scope)
- remove all Jest-specific dependencies from every workspace's `package.json`
- update `knip.json` to point at the new Vitest entry files
- keep lint and typecheck clean after dependency pruning

Files to delete:

- jest.base.cjs
- jest.config.cjs
- jest.heroui-mapper.cjs (if not already removed in VS-2.3)
- test/jest.setup.js (replaced by test/vitest.setup.ts in VS-1.2)
- packages/model/jest.config.cjs
- packages/playback/jest.config.cjs
- packages/renderer/jest.config.cjs
- packages/editor/jest.config.cjs
- packages/formats/jest.config.cjs
- packages/ui/jest.config.cjs
- packages/demo/jest.config.cjs
- babel.config.json (only if grep confirms no runtime usage)

Root `package.json` devDependencies to remove:

- `jest-environment-jsdom`
- `@types/jest`
- `babel-jest`
- `@babel/core`
- `@babel/preset-env`
- `@babel/preset-typescript`
- `@babel/plugin-transform-react-jsx`

Per-package `package.json` devDependencies to remove:

- `jest` (every package)
- `@jest/globals` (every package that currently has it: `model`, `playback`, `editor`, `formats`, `ui`, `demo`)

Knip updates:

- `knip.json` workspace `"."` entry: replace `["jest.config.cjs", "test/jest.setup.js"]` with the new Vitest equivalents (`["vitest.workspace.ts", "vitest.base.ts", "test/vitest.setup.ts"]` or the per-package config paths chosen in VS-1.3)
- confirm `npm run lint:dead` passes with no stale config references

Primary files:

- package.json (root + all packages)
- knip.json
- (deletion list above)

Acceptance criteria:

- Jest and Babel-Jest dependencies removed from every manifest
- no scripts reference Jest
- no dead Jest/Babel config files remain
- `knip.json` entry paths are live and `npm run lint:dead` passes
- `rg -n "jest" packages package.json knip.json` returns only incidental matches (e.g. `@testing-library/jest-dom` package name) with no runner references

Validation:

- npm run lint
- npm run typecheck
- npm run test
- npm run lint:dead

### Unit VS-3.1 Documentation and workflow update

- [ ] tests: red
- [ ] impl: green

Scope:

- update implementation docs to state Vitest as the unit test runner
- update every workflow/instructions file that mentions Jest by name or by command
- update the executable Ralph command snippet to the Vitest equivalent
- ensure instructions remain consistent with actual package scripts

Primary files and expected edits (all confirmed to reference Jest today):

- `project/implementation/architecture.md` — line 32 ("Jest | ^30.3.0 | root + package scripts") and line 149 ("Unit testing | jest, babel-jest | …"). Replace with Vitest + jsdom + @testing-library/jest-dom entries.
- `project/implementation/test-improvement-plan.md` — lines 47 ("HeroUI interaction semantics hidden by jest mocks") and 98 ("keep only minimal unit smoke in jest if needed"). Reword to runner-neutral or Vitest-specific language.
- `agents/instructions/testing.instructions.md` — front-matter description (line 2) and heading "Unit Tests (Jest + React Testing Library)" (line 8). Rename to Vitest.
- `agents/instructions/workflow.instructions.md` — line 63 (`lint:strict + prettier:check + typecheck + jest`). Update to `vitest`.
- `agents/instructions/ways-of-working.instructions.md` — line 44 ("Unit Testing (Vitest / Jest + React Testing Library)"). Simplify to Vitest-only.
- `agents/instructions/definition-of-done.instructions.md` — line 18 (`lint:strict + prettier:check + typecheck + jest`). Update to `vitest`.
- `agents/ralph.agent.md` — line 232 executable command `cd packages/<pkg> && npx jest --testPathPattern=<unit> --no-coverage` → `cd packages/<pkg> && npx vitest run <unit> --no-coverage` (adjust test-selection syntax per Vitest semantics).
- `CONTRIBUTING.md` — verify no runner-specific command snippets became stale after VS-1.4 script changes; update if any slipped in.

Acceptance criteria:

- all listed files updated; `rg -n -i "\bjest\b" project agents CONTRIBUTING.md` returns only historical mentions (e.g., `@testing-library/jest-dom` package references) or none
- Ralph's Step 4 command in `agents/ralph.agent.md` executes successfully against the new runner
- no stale Jest command snippets remain in active docs

Validation:

- npm run quality:all

### Unit VS-3.2 Full regression validation including CT and gate:full

- [ ] tests: red
- [ ] impl: green

Scope:

- run the complete pre-push gate after migration
- verify CT stability is unchanged (Playwright CT was intentionally untouched)
- verify knip and type-coverage still pass after config-path changes

Primary files:

- no code changes expected unless regression fixes are required

Acceptance criteria:

- `npm run gate:full` passes from a clean checkout (quality:strict + lint:dead + lint:typecoverage + ct:all + build)
- `npm run ct:all` (both `packages/ui` and `packages/demo`) passes
- migration branch is merge-ready

Validation:

- npm run quality:all
- npm run lint:dead
- npm run lint:typecoverage
- npm run build
- npm run ct:all
- npm run gate:full

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
- npm run ct:all
- npm run gate:full

Additional exit checks:

- `rg -n -i "\bjest\b" packages package.json knip.json agents project CONTRIBUTING.md AGENTS.md CLAUDE.md` returns only `@testing-library/jest-dom` package-name occurrences (no runner references, no `jest.*` API calls, no `@jest-environment` pragmas, no Jest config files)
- no `--runInBand` or `NODE_OPTIONS=--experimental-vm-modules` remains in any script
