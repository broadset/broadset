# Wave W0 implementation plan

Status: active — file paths verified against the repository on 2026-07-10

Every unmarked `Files:` path below exists in the repository today; paths marked `(new)` are to be created. Task stacks are the executor skeleton — just-in-time execution detail lives in child plans under `project/implementation/plans/<initiative-id>.md` (W0-DEF-01, W0-GOV-02, and W0-RFC-01 child plans already exist).

## W0-GOV-01 tasks

### T1 — Scenario ID grammar and spec annotation sweep

- Files: `project/spec/README.md`, `project/spec/editor/spec.md`, `project/spec/ui/spec.md`, `project/spec/demo/spec.md`, plus every scenario-bearing file under `project/spec/**` in the sweep
- Interfaces: scenario ID grammar `SC-<domain>-<NNN>` (documentation contract; no code API)
- RED: new `node --test` case in `scripts/check-documentation.test.mjs` fails when a GIVEN/WHEN/THEN scenario block carries no stable ID → GREEN: define the grammar in `project/spec/README.md` and annotate every scenario block across `project/spec/**`
- Commit: `docs(spec): add stable scenario IDs across specs`

### T2 — Scenario link checker lane

- Files: `scripts/check-scenarios.mjs` (new), `scripts/check-documentation.mjs`, `scripts/check-documentation.test.mjs`
- Interfaces: scenario audit lane with finding codes (unknown-id, missing-id, orphan-reference, duplicate-id)
- RED: test fixtures with an unknown scenario reference and a test JSDoc pointing at a deleted ID must fail the lane → GREEN: bidirectional index across spec IDs, test JSDoc `@description` references, and the CT inventory
- Commit: `ci(docs): scenario ID link checker`

### T3 — Test JSDoc traceability and deterministic CT inventory regeneration

- Files: `scripts/generate-ct-inventory.mjs` (new), `project/implementation/cross-region-ct-inventory.md`, `packages/demo/ct/state/interleaved-mutations-cross-region.ct.tsx` (exemplar; annotation sweep covers all CT files), `agents/instructions/testing.instructions.md`
- Interfaces: managed generated-block markers inside `cross-region-ct-inventory.md`
- RED: regenerating the inventory twice produces a diff, or an annotated CT file is missing from the output → GREEN: deterministic generator sourced from spec scenario IDs and CT JSDoc annotations
- Commit: `ci(docs): deterministic CT inventory generation`

### T4 — CI enforcement of scenario traceability

- Files: `.github/workflows/ci.yml`, `package.json`, `project/implementation/plan-progress.md`
- Interfaces: none
- RED: a branch introducing an unknown scenario link passes the documentation gate (gap) → GREEN: scenario lane wired into `docs:check` and CI so unknown or missing links reject the build
- Commit: `ci: enforce scenario traceability in docs gate`

## W0-GOV-02 tasks

### T1 — Manifest-derived dependency and version baseline with drift gate

- Files: `scripts/check-documentation.mjs`, `scripts/check-documentation.test.mjs`, `project/implementation/architecture.md`
- Interfaces: extends the existing `--write-architecture` lane to cover external dependency versions and the boundary matrix
- RED: `node --test` fixture where a package manifest and the architecture table disagree still passes `docs:check` (gap) → GREEN: generated block comparison fails `docs:check` on any manifest drift
- Commit: `ci(docs): manifest-derived architecture drift gate`

### T2 — F-19 drift fix and stale experimental/docs claims

- Files: `project/implementation/architecture.md`, `project/implementation/experimental-gated.md`, `project/implementation/plans/W0-GOV-02.md`
- Interfaces: none
- RED: `npm run docs:check` fails against the regenerated baseline → GREEN: regenerate via `npm run docs:architecture`, correct stale experimental/docs claims, record evidence in the child plan
- Commit: `docs: fix F-19 architecture dependency drift`

## W0-DEF-01 tasks

### T1 — Re-audit protocol and evidence schema

- Files: `project/implementation/plans/W0-DEF-01.md`, `project/implementation/roadmap/current-state.md`
- Interfaces: per-row evidence record `(id, verdict, commit, destination)`
- RED: audit sweep shows ledger rows without current commit evidence or a recorded destination → GREEN: protocol and evidence schema committed in the child plan and applied to the findings ledger structure
- Commit: `docs(plan): defect ledger re-audit protocol`

### T2 — F/B row re-audit with reproduction evidence

- Files: `project/implementation/bugs.md`, `project/implementation/roadmap/current-state.md`, `project/implementation/plan-progress.md`
- Interfaces: none
- RED: each F-01..F-21 and B-row claim is reproduced (or refuted) against HEAD; any row that no longer reproduces is flagged stale → GREEN: every audited row carries current commit evidence and its destination initiative (`W0-IO-*`, `W0-SEC-*`, `W0-MODEL-*`, W1)
- Commit: `docs: re-audit F/B findings with commit evidence`

### T3 — Unverified U/X rows and production-readiness sweep

- Files: `project/implementation/production-readiness-status.md`, `project/implementation/roadmap/current-state.md`, `project/implementation/dev-audit-remediation.md`
- Interfaces: none
- RED: the verification queue (U-01..U-10, X-01) still contains unclassified rows → GREEN: each row verified with evidence or reclassified with a destination (W0-SEC-01, W0-QE-01, …); spec-gap sections cross-checked against the ledger
- Commit: `docs: classify the unverified findings queue`

## W0-RFC-01 tasks

### T1 — Decision briefs grounded in current code

- Files: `project/implementation/plans/W0-RFC-01.md`, `project/implementation/roadmap/rfc-register.md`
- Interfaces: brief template (context, options, contract diff, migration cost, default-if-undecided)
- RED: register rows RFC-01..RFC-14 are `open` with no linked decision brief → GREEN: one brief per RFC citing the owning modules (e.g. `packages/model/src/animation.ts`, `packages/editor/src/collaboration/diff.ts`, `packages/playback/src/timeline.ts`)
- Commit: `docs(rfc): decision briefs for RFC-01..14`

### T2 — ADR authoring and extension

- Files: `project/implementation/decisions/ADR-003-006-time-duration.md`, `project/implementation/decisions/ADR-007-components.md`, `project/implementation/decisions/ADR-008-bsp-persistence.md`, `project/implementation/decisions/ADR-010-resolved-scene-pages.md`, `project/implementation/decisions/ADR-011-collaboration-changes.md`, new ADRs for RFC-01/02, RFC-05, RFC-09, RFC-12, RFC-13, RFC-14 (new)
- Interfaces: none
- RED: the ADR lane in `scripts/check-documentation.mjs` flags RFC rows lacking a ratified ADR link → GREEN: every RFC-01..RFC-14 row links an approved ADR under `project/implementation/decisions/`
- Commit: `docs(adr): ratify remaining contract ADRs`

### T3 — Spec backpropagation per ratified decision

- Files: `project/spec/model/animation.md`, `project/spec/model/changes.md`, `project/spec/model/format-reference.md`, `project/spec/model/style.md`, `project/spec/editor/collaboration.md`, `project/spec/playback/timeline.md` (additive updates per ADR)
- Interfaces: none
- RED: cross-spec consistency checks in `docs:check` flag contradictions between ratified ADRs and spec text → GREEN: additive spec updates land with each ADR, never after
- Commit: `docs(spec): backpropagate ratified RFC decisions`

### T4 — Register ratification and undecided-contract audit

- Files: `project/implementation/roadmap/rfc-register.md`, `project/implementation/roadmap/current-state.md`
- Interfaces: none
- RED: `node scripts/check-roadmap.mjs --frontier` lists W1 initiatives blocked on unresolved RFC dependencies → GREEN: register rows flip to `ratified`; frontier output shows no W1 behavior gated by an undecided contract
- Commit: `docs(rfc): mark register rows ratified`

| Slice         | Scope                                                     | Proof                                             | Rollback / evidence                             | Merge prerequisite |
| ------------- | --------------------------------------------------------- | ------------------------------------------------- | ----------------------------------------------- | ------------------ |
| W0-RFC-01.S1  | Brief template + register status wiring                   | docs:check ADR lane green                         | docs-only revert                                | none               |
| W0-RFC-01.S2  | RFC-01 grouping container decision (brief + ADR + spec)   | ADR approved; unblocks W0-IO-01                   | default-if-undecided stays in force             | W0-RFC-01.S1       |
| W0-RFC-01.S3  | RFC-02/03 easing model + stable keyframe IDs              | ADR approved; animation spec updated              | default-if-undecided stays in force             | W0-RFC-01.S2       |
| W0-RFC-01.S4  | RFC-04 sequence/master timeline                           | ADR approved                                      | default-if-undecided stays in force             | W0-RFC-01.S3       |
| W0-RFC-01.S5  | RFC-05 typed expression AST                               | ADR approved                                      | default-if-undecided stays in force             | W0-RFC-01.S4       |
| W0-RFC-01.S6  | RFC-06 rational timebase (extends ADR-003-006)            | ADR approved; unblocks W0-TIME-01                 | default-if-undecided stays in force             | W0-RFC-01.S5       |
| W0-RFC-01.S7  | RFC-07 component contract (extends ADR-007)               | ADR approved                                      | components stay experimental                    | W0-RFC-01.S6       |
| W0-RFC-01.S8  | RFC-08 persistence/host contract (extends ADR-008)        | ADR approved; feeds W0-PLAT-01 and W0-RECOVER-01  | `EditorConfig.onSave` behavior unchanged        | W0-RFC-01.S7       |
| W0-RFC-01.S9  | RFC-09 wide-gamut/HDR color model                         | ADR approved                                      | sRGB/SDR-only claim stays in force              | W0-RFC-01.S8       |
| W0-RFC-01.S10 | RFC-10 scene snapshot + kernel topology (extends ADR-010) | ADR approved; unblocks W0-SEC-01                  | current package graph stays in force            | W0-RFC-01.S9       |
| W0-RFC-01.S11 | RFC-11 collaboration substrate (extends ADR-011)          | ADR approved; unblocks W0-COLLAB-01               | no network maturity claim                       | W0-RFC-01.S10      |
| W0-RFC-01.S12 | RFC-12 OGraf/player lifecycle                             | ADR approved                                      | export-only experiments continue                | W0-RFC-01.S11      |
| W0-RFC-01.S13 | RFC-13 migration policy + RFC-14 audio contract           | ADRs approved                                     | spec-mandated helpers and cue-only audio remain | W0-RFC-01.S12      |
| W0-RFC-01.S14 | Ratification sweep + spec consistency + frontier audit    | register `ratified`; frontier shows no RFC blocks | register rows revert individually               | W0-RFC-01.S13      |

## W0-UX-01 tasks

### T1 — Research protocol and benchmark task set

- Files: `project/implementation/plans/W0-UX-01.md` (new), `project/implementation/research/workflow-research-protocol.md` (new)
- Interfaces: benchmark task definitions (time-to-first-graphic, re-brand pass, data-bind task) with measurable pass criteria
- RED: no written protocol or task set exists → GREEN: protocol with recruitment screener for 5–10 professional motion/broadcast designers, session script, consent and recording plan
- Commit: `docs(research): professional workflow research protocol`

### T2 — Research sessions and findings synthesis (external evidence gate)

- Files: `project/implementation/research/workflow-research-findings.md` (new)
- Interfaces: none
- RED: external evidence gate unmet (0 sessions recorded) → GREEN: 5–10 sessions completed (owner: maintainer); findings coded into themes with per-participant evidence links
- Commit: `docs(research): workflow research findings`

### T3 — Benchmark task baseline measurement

- Files: `project/implementation/research/benchmark-baseline.md` (new)
- Interfaces: none
- RED: no measurable baseline exists → GREEN: recorded completion times and error rates for every benchmark task on the current demo build, pinned to a git SHA
- Commit: `docs(research): benchmark task baseline`

### T4 — Design direction: voice, density, typography, interaction principles

- Files: `project/spec/ui/design-direction.md` (new), `project/spec/ui/spec.md` (index link), `packages/ui/src/tokens.ts` (token implications recorded; no behavioral change in W0)
- Interfaces: none
- RED: no approved signature design direction → GREEN: direction approved (maintainer) covering product voice, density scale, type ramp, and motion/interaction principles mapped to HeroUI design tokens
- Commit: `docs(spec): ratified design direction`

Agent-executable PR slices (the research sessions themselves are NOT slices — they are external evidence gates,
owner: maintainer; the agent prepares instruments, appends a `request:` entry to directives.md, and continues other
frontier work while sessions are pending):

| Slice       | Scope                                                                       | Proof                                                | Rollback / evidence                     | Merge prerequisite                                   |
| ----------- | --------------------------------------------------------------------------- | ---------------------------------------------------- | --------------------------------------- | ---------------------------------------------------- |
| W0-UX-01.S1 | Protocol + screener + benchmark task set + session instruments              | protocol doc merged                                  | docs-only revert                        | none                                                 |
| W0-UX-01.S2 | Benchmark harness: task scripts + timing/error capture on the demo build    | harness runs against a pinned SHA                    | docs/tooling-only revert                | W0-UX-01.S1                                          |
| W0-UX-01.S3 | Findings synthesis from maintainer-run sessions                             | themed findings doc merged with per-session evidence | docs-only revert                        | external gate: sessions completed (owner: maintainer) |
| W0-UX-01.S4 | Benchmark baseline write-up                                                 | baseline doc with pinned SHA merged                  | docs-only revert                        | W0-UX-01.S2                                          |
| W0-UX-01.S5 | Design direction draft + spec integration for maintainer ratification       | direction doc merged as proposal                     | direction doc reverts; tokens untouched | W0-UX-01.S3                                          |

External evidence gates (owner: maintainer, requested via directives.md; participant recruitment/spending needs a
directive): pilot session, research sessions 1–10 with saturation check, human benchmark baseline timings, and
design-direction ratification. W0-UX-01 sits in `measuring` while gates are pending and does not consume a WIP slot.

## W0-PLAT-01 tasks

### T1 — Host topology decision and support matrix

- Files: `project/implementation/architecture.md`, `project/implementation/decisions/ADR-015-host-topology.md` (new), `project/implementation/plans/W0-PLAT-01.md` (new)
- Interfaces: host topology matrix (browser, PWA, desktop shell, workers, player embed, headless service) with per-host capability tiers
- RED: `architecture.md` carries no normative host/support matrix → GREEN: matrix and ADR approved, consistent with ratified RFC-10 and RFC-12
- Commit: `docs(architecture): host topology and support matrix`

### T2 — Capability adapters and codec/filesystem fallbacks

- Files: `project/implementation/architecture.md`
- Interfaces: capability adapter seams reserved by name (filesystem, codec, storage quota, fonts); no code lands in W0
- RED: no approved fallback story for hosts missing OPFS, File System Access, or codec support → GREEN: per-capability adapter and fallback table approved
- Commit: `docs(architecture): capability adapter and fallback matrix`

### T3 — Package strategy and dependency graph approval

- Files: `project/implementation/architecture.md`, `scripts/check-documentation.mjs` (boundary manifest check follows the approved graph)
- Interfaces: none
- RED: planned W1 package seams (player, shared kernel split) are absent from the boundary graph → GREEN: approved dependency graph including future package seams; manifest drift check updated to match
- Commit: `docs(architecture): approved package dependency graph`

## W0-PERF-01 tasks

### T1 — Canonical performance spec

- Files: `project/spec/perf/spec.md` (new), `project/implementation/roadmap/program.md` (QG-PERF prose alignment)
- Interfaces: metric definitions (LCP, broadset-document-interactive, eager JS budget, interaction budgets) with a fixed-runner measurement procedure
- RED: no canonical performance spec; obsolete TTI metric still referenced in program docs → GREEN: spec defines the measurement procedure for QG-PERF-01, QG-PERF-02, QG-PERF-03, and QG-PERF-04; TTI absent
- Commit: `docs(spec): canonical performance spec`

### T2 — Instrumentation and dev HUD

- Files: `packages/demo/src/demo-app/use-performance-marks.ts` (new), `packages/demo/src/demo-app/perf-hud.tsx` (new), `packages/demo/src/demo-app/app.tsx`
- Interfaces: `usePerformanceMarks`, `PerfHud` (HeroUI chrome, toggleable, zero layout shift)
- RED: unit test asserts a broadset-document-interactive mark is emitted exactly once per load; HUD CT asserts marks render in the HUD region → GREEN: `performance.mark`-based instrumentation plus the toggleable dev HUD
- Commit: `feat(demo): performance marks and dev HUD`

### T3 — Fixed-runner Lighthouse, Playwright, and bundle-size lanes

- Files: `.github/workflows/ci.yml`, `scripts/check-bundle-size.mjs` (new), `scripts/check-bundle-size.test.mjs` (new), `packages/demo/vite.config.ts`
- Interfaces: `perf:gate` npm script
- RED: a build exceeding the QG-PERF-03 gzip ceiling passes CI (gap) → GREEN: Lighthouse LCP lane (QG-PERF-01), document-interactive Playwright lane (QG-PERF-02), and gzip budget gate (QG-PERF-03) run on a fixed runner profile
- Commit: `ci(perf): lighthouse, interaction, and bundle-size gates`

### T4 — Baseline-plus-margin ratchet and trace retention

- Files: `project/implementation/perf-baselines.json` (new), `.github/workflows/ci.yml`
- Interfaces: baseline record schema (metric, baseline, margin, runner profile)
- RED: a perf gate failure leaves no diagnosable artifact → GREEN: baselines recorded with margins; Lighthouse and Playwright traces uploaded as CI artifacts on every gate failure
- Commit: `ci(perf): baseline ratchet with trace retention`

| Slice         | Scope                                             | Proof                                        | Rollback / evidence                        | Merge prerequisite |
| ------------- | ------------------------------------------------- | -------------------------------------------- | ------------------------------------------ | ------------------ |
| W0-PERF-01.S1 | Canonical perf spec with QG-PERF definitions      | spec merged; docs:check green                | docs-only revert                           | none               |
| W0-PERF-01.S2 | Obsolete TTI metric removal from program docs     | no TTI reference remains in roadmap docs     | docs-only revert                           | W0-PERF-01.S1      |
| W0-PERF-01.S3 | Performance marks instrumentation                 | mark-emission unit tests green               | marks are observe-only                     | W0-PERF-01.S2      |
| W0-PERF-01.S4 | Dev HUD surface in the demo                       | HUD CT green; zero layout shift              | HUD behind a toggle, default off           | W0-PERF-01.S3      |
| W0-PERF-01.S5 | Bundle-size gate (QG-PERF-03)                     | size fixture test green; gate wired in CI    | gate starts observe-only, then enforcing   | W0-PERF-01.S4      |
| W0-PERF-01.S6 | Fixed-runner Lighthouse lane (QG-PERF-01)         | LCP lane green on reference build            | lane starts observe-only, then enforcing   | W0-PERF-01.S5      |
| W0-PERF-01.S7 | Document-interactive Playwright lane (QG-PERF-02) | interaction lane green on reference document | lane starts observe-only, then enforcing   | W0-PERF-01.S6      |
| W0-PERF-01.S8 | Baseline ratchet + trace retention on failure     | failed-run artifact contains traces          | ratchet margins widen only via reviewed PR | W0-PERF-01.S7      |

## W0-QE-01 tasks

### T1 — F-21: prettier and quality-gate uniformity across workspaces

- Files: `package.json`, `packages/formats/package.json`, `packages/demo/package.json` (and the remaining workspace manifests), `agents/hooks/quality-gate.sh`
- Interfaces: none
- RED: an intentionally unformatted file in a workspace outside the current prettier scope passes `npm run quality:strict` → GREEN: every workspace exposes `format`/`prettier:check` and the gate covers all packages
- Commit: `ci: enforce prettier across all workspaces`

### T2 — U-05 discovered test matrix and fresh-clone CI job

- Files: `.github/workflows/ci.yml`, `packages/formats/package.json`
- Interfaces: none
- RED: a new `packages/formats/src/**/*.test.ts` file omitted from the maintained CI list still passes CI (gap) → GREEN: glob-discovered test matrix replaces the maintained list; a fresh-clone `npm ci && npm run gate:full` job lands (also closes the U-10 evidence gap)
- Commit: `ci: discovered test matrix and fresh-clone job`

### T3 — Flake telemetry, repeat-each lane, and quarantine policy

- Files: `scripts/flake-telemetry.mjs` (new), `.github/workflows/ci.yml`, `project/implementation/component-testing.md`
- Interfaces: flake telemetry record (test id, seed, failure signature, occurrence count)
- RED: a `--repeat-each` run over `packages/demo/ct` produces intermittent failures that vanish untracked → GREEN: scheduled repeat-each lane writes telemetry; quarantine entries require an expiry date and an owning initiative
- Commit: `ci(test): flake telemetry and repeat-each lane`

### T4 — X-01 and U-06: regenerate CT inventory and fix stale instruction references

- Files: `project/implementation/cross-region-ct-inventory.md`, `agents/instructions/testing.instructions.md`, `scripts/check-documentation.mjs`
- Interfaces: none
- RED: instruction documents reference nonexistent files (U-06) and the CT inventory carries stale counts (X-01) without failing `docs:check` → GREEN: inventory regenerated via the W0-GOV-01 generator; instruction-reference lane added to the docs gate
- Commit: `docs: refresh CT inventory and instruction references`

## W0-SEC-01 tasks

### T1 — F-08: sanitize preserved bytes on SVG export

- Files: `packages/formats/src/svg/export.ts`, `packages/formats/src/svg/export-defs.ts`, `packages/formats/src/svg/security-audit.test.ts`, `packages/formats/src/_shared/sanitize/sanitize-svg.ts`
- Interfaces: none
- RED: hostile preserved-content fixture (script, foreignObject, event attributes captured at import) re-emits active bytes on export → GREEN: preserved payloads pass through `sanitize-svg` on the export path while `packages/formats/src/svg/preservation-roundtrip.test.ts` stays green
- Commit: `fix(formats): sanitize preserved SVG bytes on export`

### T2 — Verify U-01, U-02, U-04, and U-09

- Files: `packages/formats/src/_shared/sanitize/sanitize-svg.test.ts`, `packages/formats/src/_shared/network/safe-fetch.test.ts`, `packages/formats/src/import-document-types.ts`, `eslint.config.cjs`
- Interfaces: none
- RED: depth/recursion bomb corpora against the sanitizer (U-01); redirect, private-network, and decompression-bomb cases against `safe-fetch` (U-02); re-enable `sonarjs/slow-regex` and surface flagged patterns (U-04); schema-own preserved snapshot JSON via Zod (U-09) → GREEN: each row verified with regression tests or fixed at the root cause
- Commit: `test(formats): verify sanitizer, fetch, and parser hardening`

### T3 — Sanitizer, fetch, and parser policy spec with hostile corpus gate

- Files: `project/spec/formats/spec.md` (additive external-input policy section), `packages/formats/src/svg/import-security.ts`, hostile corpus additions under `packages/formats/test-fixtures/` (new additions)
- Interfaces: normative input policy (size caps, depth caps, allowlist tables) cited by QG-SEC-01
- RED: corpus replay finds an input that exceeds a declared cap yet still parses, or preserved content that renders active → GREEN: hostile-input corpus green, meeting QG-SEC-01
- Commit: `docs(spec): external input policy with hostile corpus gate`

### T4 — CSP report-only telemetry in the demo

- Files: `packages/demo/index.html`, `packages/demo/vite.config.ts`
- Interfaces: none
- RED: the demo serves without a Content-Security-Policy-Report-Only header → GREEN: report-only policy wired; CT and dev runs show zero violation reports
- Commit: `feat(demo): CSP report-only telemetry`

## W0-SEC-02 tasks

### T1 — Typed atomic batch validation contract

- Files: `packages/model/src/changes.ts`, `packages/model/src/changes.test.ts`, `packages/model/src/index.ts`
- Interfaces: `BatchValidationResult`, `validateChangeBatch` (all-or-nothing semantics with typed diagnostics)
- RED: a malformed change inside a batch currently lets the preceding items apply (partial mutation) → GREEN: validate-all-then-apply kernel in `model`
- Commit: `feat(model): atomic change batch validation`

### T2 — F-17: remote element payloads through Zod at the boundary

- Files: `packages/editor/src/collaboration/apply.ts`, `packages/editor/src/collaboration/patch-normalize.ts`, `packages/editor/src/collaboration/apply.test.ts` (new)
- Interfaces: none
- RED: a crafted remote element-add with an invalid element shape mutates the store → GREEN: boundary parse with typed rejection and zero mutation on failure
- Commit: `fix(editor): validate remote element payloads`

### T3 — Reconciliation, paste, and drop boundaries

- Files: `packages/formats/src/apply-reconciliation-choices.ts`, `packages/editor/src/element-operations.ts`, `packages/demo/src/demo-app/use-demo-file-handlers.ts`
- Interfaces: none
- RED: a malformed reconciliation batch, hostile clipboard payload, or dropped-file batch performs partial mutation → GREEN: all three boundaries route through `validateChangeBatch` with typed diagnostics, meeting QG-SEC-01
- Commit: `fix: atomic validation at paste, drop, and reconcile boundaries`

## W0-COLLAB-01 tasks

### T1 — Page-override change semantics (B-20)

- Files: `packages/model/src/changes.ts`, `packages/model/src/changes.test.ts`, `packages/editor/src/collaboration/diff.ts`, `project/spec/model/changes.md`
- Interfaces: page-override change operations (set/clear override; final names per ratified ADR-011)
- RED: two documents differing only in a page `content`/`style`/`visible` override diff to an empty change set → GREEN: override-aware diff/apply with convergence tests in both application orders
- Commit: `feat(model): page-override change semantics`

### T2 — Data-schema and document-level changes

- Files: `packages/editor/src/collaboration/diff.ts`, `packages/editor/src/collaboration/apply.ts`, `packages/model/src/changes.ts`, `project/spec/editor/collaboration.md`
- Interfaces: none
- RED: `dataSchema`, canvas, and document-settings edits are absent from diffs → GREEN: document-level operations converge under concurrent edits (property tests over both orders)
- Commit: `feat(editor): document-level change coverage`

### T3 — Remote changes excluded from local undo

- Files: `packages/editor/src/collaboration/stream.ts`, `packages/editor/src/store-actions/history.ts`, `packages/editor/src/collaboration/stream.test.ts` (new)
- Interfaces: none
- RED: applying a remote change and pressing undo reverts the remote edit → GREEN: the remote application path bypasses the local history stack
- Commit: `fix(editor): keep remote changes out of local undo`

## W0-COLLAB-02 tasks

### T1 — Project-level diff and apply (B-22)

- Files: `packages/editor/src/collaboration/diff.ts`, `packages/editor/src/collaboration/apply.ts`, `packages/model/src/changes.ts`, `packages/model/src/index.ts`
- Interfaces: `ProjectChange`, `diffProject`, `applyProjectChanges` (assets, project settings, document membership)
- RED: asset add/remove and project-settings edits produce no change operations → GREEN: project-scope diff/apply per ratified ADR-011
- Commit: `feat(editor): project-level diff and apply`

### T2 — Round-trip and randomized change-order convergence

- Files: `packages/editor/src/collaboration/project-convergence.test.ts` (new), `project/spec/model/changes.md`
- Interfaces: none
- RED: seeded random interleavings of project changes diverge between replicas → GREEN: round-trip and convergence property tests green across orderings
- Commit: `test(editor): project change convergence properties`

## W0-TIME-01 tasks

### T1 — Ratify duration interval and sampling semantics

- Files: `project/implementation/decisions/ADR-003-006-time-duration.md`, `project/spec/playback/timeline.md`, `project/spec/model/output-spec.md`
- Interfaces: normative semantics — duration interval (closed vs half-open), frame-count rounding, endpoint sampling, timestamp origin
- RED: specs are silent on B-23 frame-count rounding and B-37 endpoint sampling → GREEN: additive ratified semantics consistent with the RFC-06 decision
- Commit: `docs(spec): ratify duration and sampling semantics`

### T2 — Shared duration helper and cross-exporter contract tests

- Files: `packages/playback/src/timeline.ts`, `packages/playback/src/index.ts`, `packages/formats/src/interchange/index.ts`, `packages/formats/src/interchange/video-export.test.ts`
- Interfaces: `resolveDocumentDurationMs`, `resolveExportFrameCount`
- RED: contract test shows video export consumers disagree on frame count for the same duration/rate fixture → GREEN: one shared helper adopted by every export consumer, with cross-exporter contract tests pinning the semantics
- Commit: `feat(playback): shared duration and frame-count helper`

## W0-IO-01 tasks

### T1 — F-01: export grouped shape trees

- Files: `packages/formats/src/pptx/export/group.ts`, `packages/formats/src/pptx/export/shape-tree.ts`, `packages/formats/src/pptx/export/geometry.ts`
- Interfaces: none
- RED: a grouped document fixture exports a slide with zero shapes (blank slide) → GREEN: parent/group distinction produces populated `grpSp` trees per the ratified RFC-01 decision
- Commit: `fix(formats): export grouped PPTX shape trees`

### T2 — F-04: honor chOff/chExt child space on import

- Files: `packages/formats/src/pptx/import/group.ts`, `packages/formats/src/pptx/import/geometry.ts`
- Interfaces: none
- RED: nested and interleaved group fixtures import with wrong child geometry when `chOff`/`chExt` differ from `off`/`ext` → GREEN: child-space transform applied, geometry within QG-COR-01
- Commit: `fix(formats): honor PPTX chOff/chExt child space`

### T3 — Z-order-safe structure, re-import round trip, and rendering evidence

- Files: `packages/formats/src/pptx/chain-round-trip.test.ts`, `packages/formats/src/pptx/libreoffice-verify.test.ts`, interleaved z-order fixtures under `packages/formats/test-fixtures/pptx/` (new additions)
- Interfaces: none
- RED: an interleaved z-order fixture reorders siblings on round trip or silently drops shapes → GREEN: order-preserving structure with no silent drops (QG-INT-02); LibreOffice rendering evidence recorded; PowerPoint desktop signoff via the external evidence gate
- Commit: `test(formats): pptx z-order round-trip evidence`

## W0-IO-02 tasks

### T1 — F-02: radial gradient center parsing

- Files: `packages/formats/src/svg/import-defs.ts`, `packages/formats/src/svg/import-defs.test.ts`
- Interfaces: none
- RED: property test over percentage, fraction, and defaulted `cx`/`cy`/`r` values crashes import or emits an out-of-range center → GREEN: normalized parsing yields finite, in-range centers; malformed values degrade to the SVG defaults without crashing the document
- Commit: `fix(formats): radial gradient center parsing`

## W0-IO-03 tasks

### T1 — F-03: page-box-aware coordinate conversion

- Files: `packages/formats/src/pdf/core.ts`, `packages/formats/src/pdf/import/parse.ts`, `packages/formats/src/pdf/geometry.ts`
- Interfaces: none
- RED: fixtures with an offset CropBox, a non-zero MediaBox origin, and `/Rotate` 90/180/270 place elements more than 0.5 pt off → GREEN: Y-flip and origin conversion derived from the effective page box, all fixtures within 0.5 pt
- Commit: `fix(formats): pdf page-box coordinate conversion`

## W0-IO-04 tasks

### T1 — F-05: placeholder geometry inheritance chain

- Files: `packages/formats/src/pptx/import/placeholders.ts`, `packages/formats/src/pptx/import/layout.ts`, `packages/formats/src/pptx/import/master.ts`, `packages/formats/src/pptx/import/shape.ts`
- Interfaces: none
- RED: a placeholder without a slide-level `xfrm` imports at the origin instead of inheriting layout/master geometry → GREEN: slide → layout → master resolution by placeholder type and index
- Commit: `fix(formats): placeholder geometry inheritance`

### T2 — Oracle fixtures within tolerance

- Files: `packages/formats/src/pptx/python-pptx-oracle.test.ts`, `packages/formats/scripts/generate-python-pptx-oracle.py`, oracle fixtures under `packages/formats/test-fixtures/pptx/oracle/` (new additions)
- Interfaces: none
- RED: title, body, and custom placeholder oracle deltas exceed 0.5 px → GREEN: all placeholder oracle fixtures within 0.5 px, meeting QG-COR-01
- Commit: `test(formats): placeholder oracle fixtures`

## W0-IO-05 tasks

### T1 — F-06: full style cascade resolution

- Files: `packages/formats/src/svg/import-css.ts`, `packages/formats/src/svg/import-style.ts`, `packages/formats/src/svg/import-walk.ts`
- Interfaces: none
- RED: an inline `style=""` declaration is silently dropped when a stylesheet rule also matches; a specificity fixture resolves the wrong declaration → GREEN: cascade resolution honoring origin, specificity, source order, and inheritance across inline, presentation, and stylesheet declarations
- Commit: `fix(formats): svg style cascade resolution`

### T2 — Browser-reference cascade fixtures

- Files: `packages/formats/src/svg/svg-baseline.test.ts`, `packages/formats/src/svg/visual-roundtrip.test.ts`, cascade fixture corpus under `packages/formats/test-fixtures/svg/corpus/` (new additions)
- Interfaces: none
- RED: imported results differ from the browser-reference rendering for specificity, inheritance, and inline-style fixtures → GREEN: all cascade fixtures match the browser reference
- Commit: `test(formats): svg cascade browser-reference fixtures`

## W0-IO-06 tasks

### T1 — F-10: CID/Identity-H decode via ToUnicode

- Files: `packages/formats/src/pdf/import/operators.ts`, `packages/formats/src/pdf/fonts.ts`, `packages/formats/src/pdf/import/parse.ts`
- Interfaces: none
- RED: Identity-H encoded strings decode as Latin-1 mojibake → GREEN: ToUnicode CMap-driven decoding with a CID-ordering fallback for fonts without a ToUnicode entry
- Commit: `fix(formats): pdf CID text decoding`

### T2 — Multilingual decode corpus

- Files: `packages/formats/src/pdf/woff2-and-tounicode.test.ts`, multilingual fixtures under `packages/formats/test-fixtures/pdf/corpus/` (new additions)
- Interfaces: none
- RED: CJK, Arabic, and Cyrillic fixtures decode inexactly → GREEN: ToUnicode and CMap multilingual fixtures decode exactly, meeting QG-COR-03
- Commit: `test(formats): multilingual CID decode corpus`

## W0-IO-07 tasks

### T1 — F-11: per-page element association

- Files: `packages/formats/src/pdf/import/parse.ts`, `packages/formats/src/pdf/import/index.ts`, `packages/formats/src/pdf/visual-regression.test.ts`
- Interfaces: none
- RED: a three-page fixture imports all text onto page 1 → GREEN: per-page content-stream association preserves page identity structurally and in the visual fixtures
- Commit: `fix(formats): multi-page pdf element association`

## W0-IO-08 tasks

### T1 — F-12: gradient angle convention conversion

- Files: `packages/formats/src/pptx/import/style.ts`, `packages/formats/src/pptx/export/primitives.ts`, `packages/formats/src/pptx/libreoffice-verify.test.ts`
- Interfaces: none
- RED: a canonical angle matrix (0/45/90/135/180/270°) mismatches the LibreOffice raster in either direction → GREEN: correct 60000ths-of-a-degree clockwise ↔ CSS angle conversion on import and export; PowerPoint raster match recorded via the external evidence gate
- Commit: `fix(formats): pptx gradient angle conversion`

## W0-IO-09 tasks

### T1 — F-13: resolve theme style-matrix references

- Files: `packages/formats/src/pptx/import/theme.ts`, `packages/formats/src/pptx/import/style.ts`, `packages/formats/src/pptx/import/shape.ts`
- Interfaces: none
- RED: a shape whose `fillRef`/`lnRef`/`effectRef` indexes into the theme format scheme imports with no paint or stroke → GREEN: style-matrix resolution including `phClr` placeholder-color substitution
- Commit: `fix(formats): resolve pptx theme style-matrix references`

### T2 — Theme gallery retention fixtures

- Files: `packages/formats/src/pptx/theme-export.test.ts`, gallery decks under `packages/formats/test-fixtures/pptx/real/` (new additions)
- Interfaces: none
- RED: default and custom theme gallery decks lose paint or stroke on import → GREEN: both galleries retain paint and stroke, meeting QG-INT-02
- Commit: `test(formats): theme gallery retention fixtures`

## W0-IO-10 tasks

### T1 — F-14: byteOffset-aware PSD reads

- Files: `packages/formats/src/psd/validate-psd.ts`, `packages/formats/src/psd/import.ts`, `packages/formats/src/psd/import-document.ts`
- Interfaces: none
- RED: a sliced `Uint8Array` view (non-zero `byteOffset`) parses differently from the same bytes copied into a fresh array, for both valid and malformed files → GREEN: all reads honor `byteOffset`; sliced-view input equals copied bytes across the corpus
- Commit: `fix(formats): honor psd Uint8Array byteOffset`

## W0-IO-11 tasks

### T1 — F-15: stop-opacity round trip

- Files: `packages/formats/src/svg/import-defs.ts`, `packages/formats/src/svg/export-defs.ts`, `packages/model/src/broadset-gradient.ts`
- Interfaces: none
- RED: `stop-opacity` is ignored on import and export; transparent-stop structural and visual fixtures fail → GREEN: stop alpha carried through the gradient model in both directions
- Commit: `fix(formats): svg stop-opacity support`

## W0-MODEL-01 tasks

### T1 — F-07: linear single-pass path tokenizer

- Files: `packages/model/src/svg-path-tokenizer.ts` (new), `packages/model/src/svg-path-tokenizer.test.ts` (new), `packages/model/src/element/content-types.ts`, `packages/model/src/index.ts`
- Interfaces: `tokenizeSvgPath`, `SvgPathToken`
- RED: valid compact paths (`M0 0L1 1`, `.5.5`, implicit command repeats, `1e-5` exponents) are rejected by `isValidSvgPathData` → GREEN: single-pass linear tokenizer replaces the regex validation
- Commit: `feat(model): linear svg path tokenizer`

### T2 — Fuzz and worst-case linearity proof

- Files: `packages/model/src/svg-path-tokenizer.test.ts` (new), `packages/editor/src/path-geometry/parse.ts` (tokenizer adoption)
- Interfaces: none
- RED: fast-check fuzzing over minified path corpora fails, or adversarial worst-case inputs exceed the linear time bound assertion → GREEN: fuzz and linearity tests green, meeting QG-SEC-01; the editor path parser adopts the shared tokenizer
- Commit: `test(model): path tokenizer fuzz and linearity`

## W0-MODEL-02 tasks

### T1 — F-16: total safeParse for legacy gradient input

- Files: `packages/model/src/migrations/migrate-legacy-fill.ts`, `packages/model/src/migrations/migrate-legacy-color.ts`, `packages/model/src/broadset-gradient.ts`, `packages/model/src/document.ts`
- Interfaces: none
- RED: `safeParse` on a document containing a malformed legacy gradient throws instead of returning a typed failure → GREEN: legacy migration wrapped in total error handling; `safeParse` never throws and returns a typed failure for invalid legacy gradient input
- Commit: `fix(model): total safeParse for legacy gradients`

## W0-RECOVER-01 tasks

### T1 — Quarantine unparseable saved data

- Files: `packages/demo/src/demo-utils.ts`, `packages/demo/src/test-environment.local-storage.test.ts`, `project/spec/demo/state.md` (additive criteria)
- Interfaces: `LoadSavedDocumentResult` discriminated union (`ok` | `corrupt` with quarantined payload and last-valid snapshot)
- RED: corrupt localStorage JSON silently falls back to the sample document, destroying user data on the next save → GREEN: the corrupt payload is quarantined under a separate versioned key and the last valid snapshot is retained per the ratified RFC-08 persistence contract
- Commit: `feat(demo): quarantine corrupt saved documents`

### T2 — Recovery modal with raw download and last-valid restore

- Files: `packages/ui/src/modals/recovery.tsx` (new), `packages/ui/src/modals/index.ts`, `packages/ui/src/index.ts`, `packages/demo/src/demo-app/app.tsx`
- Interfaces: `RecoveryModal` (HeroUI `Modal`; raw download reuses the existing `downloadJsonFile` helper)
- RED: no recovery surface exists after a corrupt load → GREEN: modal offers quarantined raw download, restore-last-valid, and explicit discard; fully keyboard operable with visible focus
- Commit: `feat(ui): corrupt-save recovery modal`

### T3 — Corrupt-save CT across regions

- Files: `packages/demo/ct/state/corrupt-save-recovery.ct.tsx` (new)
- Interfaces: none
- RED: CT seeds a corrupt payload and asserts the recovery modal appears, the raw download is offered, and last-valid restore renders on the canvas — including a keyboard-only path → GREEN: no silent data loss and accessible recovery proven, meeting QG-A11Y-01
- Commit: `test(demo): corrupt-save recovery CT`
