# Wave W6 implementation plan

Status: draft — re-sliced at the W5 phase exit

## W6-CRAFT-01 tasks

### T1 — Motion token system and interruptible chrome motion primitives

- Files: `packages/ui/src/tokens.ts`, `packages/ui/src/motion/motion-tokens.ts` (new), `packages/ui/src/motion/use-chrome-motion.ts` (new), `packages/ui/src/motion/motion-tokens.test.ts` (new)
- Interfaces: `MotionToken`, `useChromeMotion(options)` — interruptible enter/exit/emphasis transitions for editor chrome
- RED: unit test asserting every chrome transition is driven by a named motion token and can be interrupted mid-flight without visual snap → GREEN: implement token table plus an interruptible transition hook layered on HeroUI components
- Commit: `feat(ui): add signature motion token system`

### T2 — Reduced-motion alternatives verified by CT

- Files: `packages/ui/src/motion/reduced-motion.ts` (new), `packages/ui/ct/chrome-motion.ct.tsx` (new)
- Interfaces: `resolveMotionPreference()` — maps `prefers-reduced-motion` and the user preference to per-token alternatives
- RED: CT mounting the editor shell with reduced motion forced, asserting chrome swaps to non-motion alternatives and cold shell load stays within QG-PERF-01 → GREEN: implement reduced-motion token substitution and wire it through `useChromeMotion`
- Commit: `feat(ui): reduced-motion alternatives for chrome motion`

### T3 — Optional sound/haptics preference, off by default

- Files: `packages/ui/src/preferences/sound-haptics.ts` (new), `packages/ui/src/preferences/sound-haptics.test.ts` (new), `packages/demo/src/DemoApp.tsx`
- Interfaces: `SoundHapticsPreference` persisted preference; accessible HeroUI `Switch` in the preferences surface
- RED: test proving sound/haptics are off by default, persist across reload, and never fire when disabled → GREEN: implement preference store, gated audio/haptic cue dispatcher, and preferences UI
- Commit: `feat(ui): optional sound and haptics preference`

## W6-UX-01 tasks

### T1 — Workspace and panel-layout persistence model

- Files: `packages/editor/src/workspace/workspace-types.ts` (new), `packages/editor/src/workspace/workspace-store.ts` (new), `packages/editor/src/workspace/workspace-store.test.ts` (new)
- Interfaces: `WorkspaceLayout`, `saveWorkspace`, `applyWorkspace`, `restoreWorkspacesAfterCrash`
- RED: vanilla-store tests proving saved workspaces, panel layouts, and preferences round-trip exactly through serialize → reload and simulated crash restart → GREEN: implement Zod-validated workspace schema plus persistence and recovery actions
- Commit: `feat(editor): workspace persistence model`

### T2 — Workspace switcher, panel customization, and multi-document switcher UI

- Files: `packages/ui/src/workspace/workspace-switcher.tsx` (new), `packages/ui/src/workspace/panel-customizer.tsx` (new), `packages/ui/src/workspace/document-switcher.tsx` (new), `packages/ui/ct/workspace-customization.ct.tsx` (new)
- Interfaces: `WorkspaceSwitcher`, `PanelCustomizer`, `DocumentSwitcher` HeroUI-native components exported from `packages/ui/src/index.ts`
- RED: cross-region CT — save a workspace, rearrange panels, switch documents, and assert canvas, panels, and toolbar all reflect the applied layout with full keyboard operability (QG-A11Y-01) → GREEN: implement the three surfaces bound to the workspace store
- Commit: `feat(ui): workspace and document switcher surfaces`

### T3 — Command history, macros, and contextual learning on the command registry

- Files: `packages/editor/src/commands/command-history.ts` (new), `packages/editor/src/commands/macro-recorder.ts` (new), `packages/ui/src/commands/command-history-panel.tsx` (new), `packages/ui/src/learning/contextual-tips.tsx` (new), `packages/editor/src/commands/macro-recorder.test.ts` (new)
- Interfaces: `CommandHistoryEntry`, `recordMacro`, `replayMacro`, `ContextualTips`
- RED: test replaying a recorded macro against a fresh document and asserting the resulting document state equals the original session's committed state → GREEN: implement history capture and deterministic macro replay over the W2-CMD-01 registry, then surface history/macros/tips in the UI
- Commit: `feat(editor): command history and macro replay`

| Slice       | Scope                                                | Proof                                                       | Rollback / evidence                              | Merge prerequisite |
| ----------- | ---------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------ | ------------------ |
| W6-UX-01.S1 | Workspace/layout schema + persistence store          | Store unit tests incl. crash-restart recovery               | Revert slice; no UI depends on it yet            | none               |
| W6-UX-01.S2 | Panel customization surface bound to the store       | CT: rearrange panels, reload, layout recovers exactly       | Feature-flag panel customizer off; store remains | W6-UX-01.S1        |
| W6-UX-01.S3 | Saved-workspace switcher UI                          | CT: save/switch workspaces across regions, keyboard-only    | Hide switcher; saved data preserved              | W6-UX-01.S2        |
| W6-UX-01.S4 | Multi-document switcher                              | CT: open/switch documents; canvas + panels follow           | Hide switcher; single-document flow unaffected   | W6-UX-01.S3        |
| W6-UX-01.S5 | Command history capture + history panel              | Unit + CT: executed commands appear and re-run from panel   | Hide panel; capture is additive                  | W6-UX-01.S4        |
| W6-UX-01.S6 | Macro record/replay                                  | Deterministic replay test equals original committed state   | Disable macro entry points; history unaffected   | W6-UX-01.S5        |
| W6-UX-01.S7 | Contextual learning tips                             | CT: tips render, dismiss, never steal focus (QG-A11Y-01)    | Remove tip triggers; no data migration           | W6-UX-01.S6        |
| W6-UX-01.S8 | Benchmark evidence vs W0-UX-01 baseline + a11y sweep | Recorded benchmark comparison + full keyboard CT lane green | Evidence-only slice; revert docs                 | W6-UX-01.S7        |

## W6-ONBOARD-01 tasks

### T1 — Commissioned sample documents and first-run loader

- Files: `packages/demo/src/onboarding/sample-catalog.ts` (new), `packages/demo/src/onboarding/samples/` (new), `packages/demo/src/onboarding/sample-catalog.test.ts` (new)
- Interfaces: `SampleCatalogEntry`, `loadSampleDocument(id)`
- RED: test validating every catalog entry parses as a valid `BroadsetProject` and loads into the editor without warnings → GREEN: land the commissioned `.bsp` samples plus a typed catalog and loader
- Commit: `feat(demo): commissioned sample catalog`

### T2 — Action-gated first-run learning and teaching empty states

- Files: `packages/ui/src/onboarding/first-run-flow.tsx` (new), `packages/ui/src/onboarding/teaching-empty-states.tsx` (new), `packages/demo/ct/onboarding-first-run.ct.tsx` (new)
- Interfaces: `FirstRunFlow`, `TeachingEmptyState` — progressive-disclosure steps advanced only by the user actually performing the taught action
- RED: CT proving each first-run step advances only on the real user action (not a "next" click), and empty panels teach their primary action → GREEN: implement gated step engine and HeroUI empty-state surfaces
- Commit: `feat(ui): action-gated first-run learning`

### T3 — Activation funnel instrumentation

- Files: `packages/demo/src/onboarding/activation-funnel.ts` (new), `packages/demo/src/onboarding/activation-funnel.test.ts` (new)
- Interfaces: `ActivationFunnelEvent`, `recordActivationMilestone` — local, deterministic time-to-first-animation and time-to-first-valid-export metrics
- RED: CT-driven flow that scripts a new-user session and asserts both activation metrics are reported deterministically against the recorded targets → GREEN: implement milestone instrumentation on existing editor/export events
- Commit: `feat(demo): activation funnel instrumentation`

## W6-I18N-01 tasks

### T1 — Message catalog and i18n runtime seam

- Files: `packages/ui/src/i18n/i18n-runtime.ts` (new), `packages/ui/src/i18n/catalog/en.ts` (new), `packages/ui/src/i18n/i18n-runtime.test.ts` (new), `scripts/check-i18n-catalog.mjs` (new)
- Interfaces: `t(key, params)`, `LocaleProvider`, typed message-key union generated from the catalog
- RED: catalog-completeness check failing on any hardcoded UI string or missing key → GREEN: implement runtime, extract all `packages/ui` and `packages/demo` strings into the catalog, and wire the check into the docs/quality lane
- Commit: `feat(ui): i18n runtime and message catalog`

### T2 — Locale-aware formatting and RTL layout

- Files: `packages/ui/src/i18n/locale-format.ts` (new), `packages/ui/src/i18n/rtl.ts` (new), `packages/ui/src/i18n/locale-format.test.ts` (new), `packages/ui/ct/rtl-layout.ct.tsx` (new)
- Interfaces: `formatNumber`, `formatDate`, `formatUnit`, `useDirection()`
- RED: CT mounting the editor shell in an RTL locale asserting mirrored chrome layout, correct logical properties, and locale-formatted numeric fields → GREEN: implement `Intl`-backed formatters and direction-aware layout across panels, toolbar, and modals
- Commit: `feat(ui): locale formatting and RTL layout`

### T3 — Pseudo-locale, IME, and copy-expansion verification matrix

- Files: `packages/ui/src/i18n/pseudo-locale.ts` (new), `packages/ui/ct/pseudo-locale-expansion.ct.tsx` (new), `packages/ui/ct/ime-entry.ct.tsx` (new)
- Interfaces: `buildPseudoLocale(catalog)` — accented, expanded pseudo-translation generator
- RED: CT sweep under the pseudo-locale asserting zero clipped or overflowing strings across the shipped UI, plus IME composition entry in text fields → GREEN: implement pseudo-locale generation, fix every clipping surface, and land the locale/keyboard matrix lane
- Commit: `test(ui): pseudo-locale and IME verification matrix`

| Slice         | Scope                                              | Proof                                                   | Rollback / evidence                               | Merge prerequisite |
| ------------- | -------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------- | ------------------ |
| W6-I18N-01.S1 | i18n runtime, `LocaleProvider`, typed catalog seam | Runtime unit tests; en catalog compiles                 | Revert slice; strings still render via en default | none               |
| W6-I18N-01.S2 | Extract `packages/ui` strings into the catalog     | Catalog-completeness check green for `ui`               | Revert extraction commits per surface             | W6-I18N-01.S1      |
| W6-I18N-01.S3 | Extract `packages/demo` strings into the catalog   | Catalog-completeness check green for `demo`             | Revert extraction commits per surface             | W6-I18N-01.S2      |
| W6-I18N-01.S4 | Locale-aware number/date/unit formatting           | Formatter unit tests across locales                     | Fall back to en-US formatting                     | W6-I18N-01.S1      |
| W6-I18N-01.S5 | RTL layout across chrome                           | RTL CT: mirrored layout, keyboard operable (QG-A11Y-01) | Direction forced LTR behind provider              | W6-I18N-01.S2      |
| W6-I18N-01.S6 | Pseudo-locale lane + zero-clip fixes               | Pseudo-locale CT sweep: zero clipped strings            | Lane is additive; fixes are individually rev.     | W6-I18N-01.S5      |
| W6-I18N-01.S7 | IME entry flows in text editing surfaces           | IME CT: composition events commit correct text          | Revert slice; plain entry unaffected              | W6-I18N-01.S3      |
| W6-I18N-01.S8 | Locale/keyboard matrix + a11y evidence roll-up     | Matrix lane green; QG-A11Y-01 evidence recorded         | Evidence-only slice; revert docs                  | W6-I18N-01.S7      |

## W6-QE-01 tasks

### T1 — Coverage-guided fuzzing lane for hostile-input surfaces

- Files: `scripts/fuzz/run-fuzz.mjs` (new), `packages/formats/src/fuzz/import-fuzz-targets.ts` (new), `.github/workflows/nightly-qe.yml` (new)
- Interfaces: `FuzzTarget` — registered corpus-driven targets for every importer/parser entry point
- RED: fuzz lane seeded with known-bad corpora must reproduce previously fixed crashes when their fixes are reverted → GREEN: implement coverage-guided harness over importers, parsers, and path/CSS tokenizers with size caps per QG-SEC-01
- Commit: `test(formats): coverage-guided import fuzzing lane`

### T2 — Mutation spot checks and fault injection

- Files: `stryker.conf.json` (new), `scripts/fault-injection/inject-io-faults.mjs` (new), `packages/formats/src/fuzz/fault-injection.test.ts` (new)
- Interfaces: none
- RED: mutation run on security/validation kernels failing until ≥80% mutants are killed; fault-injection tests failing on unhandled storage/decoder faults → GREEN: add missing kernel tests and fault-path handling until thresholds hold
- Commit: `test: mutation and fault-injection lanes`

### T3 — Browser support matrix and formal/model checks for critical state machines

- Files: `playwright.matrix.config.ts` (new), `packages/editor/src/state-machines/critical-machines.model.test.ts` (new), `project/implementation/plans/critical-state-machines.md` (new)
- Interfaces: `CriticalStateMachineSpec` — enumerated designated machines (undo/redo transaction, autosave/recovery, playback scheduler, job lifecycle)
- RED: model-check suite exhaustively exploring each designated machine fails on any unreachable-recovery or double-commit state → GREEN: encode machine models, fix violations, and wire browser-matrix CT execution into the nightly lane
- Commit: `test(editor): model checks for critical state machines`

| Slice       | Scope                                               | Proof                                                    | Rollback / evidence                           | Merge prerequisite |
| ----------- | --------------------------------------------------- | -------------------------------------------------------- | --------------------------------------------- | ------------------ |
| W6-QE-01.S1 | Fuzz harness + first importer target + corpora      | Harness reproduces reverted-fix crash; lane runs locally | Lane additive; remove workflow step           | none               |
| W6-QE-01.S2 | Fuzz targets for remaining importers/parsers        | All hostile-input entry points registered; nightly green | Disable individual targets                    | W6-QE-01.S1        |
| W6-QE-01.S3 | Nightly QE workflow (fuzz schedule + triage doc)    | Nightly run green with artifact upload                   | Disable schedule trigger                      | W6-QE-01.S2        |
| W6-QE-01.S4 | Mutation spot checks on security/validation kernels | ≥80% mutants killed on designated kernels                | Lane additive; threshold recorded in evidence | W6-QE-01.S1        |
| W6-QE-01.S5 | Fault injection for storage/decoder/worker failures | Fault tests green; no unhandled rejection paths          | Revert injected-fault fixtures                | W6-QE-01.S4        |
| W6-QE-01.S6 | Browser support matrix CT lane                      | Matrix lane green on supported browser set               | Reduce matrix to default browser              | W6-QE-01.S3        |
| W6-QE-01.S7 | Critical state machine inventory + model checks     | Model suite explores each machine; violations fixed      | Inventory doc stands alone; revert fixes solo | W6-QE-01.S5        |
| W6-QE-01.S8 | Zero-unwaived-findings roll-up (QG-SEC-01 evidence) | All lanes green; waiver ledger empty or dispositioned    | Evidence-only slice; revert docs              | W6-QE-01.S7        |

## W6-ARCH-01 tasks

### T1 — Responsibility audit and split plan

- Files: `scripts/check-file-size.mjs` (new), `project/implementation/plans/w6-arch-split-plan.md` (new)
- Interfaces: none
- RED: file-size audit script failing while >5 files exceed 500 non-empty lines without a recorded justification → GREEN: land the audit script plus a per-file split plan naming target modules and owners
- Commit: `chore: file-size audit and split plan`

### T2 — Execute splits behind stable public facades

- Files: `packages/editor/src/index.ts`, `packages/formats/src/index.ts`, `packages/ui/src/index.ts`, `packages/renderer/src/index.ts`, split target modules named by the split plan (new)
- Interfaces: unchanged public barrels — every split preserves the exported API surface verbatim
- RED: public-API snapshot test failing on any barrel export change during a split → GREEN: split oversized files into responsibility-named modules package by package, keeping barrels byte-stable
- Commit: `refactor: split oversized modules behind stable facades`

### T3 — Dead-code, dependency, and boundary cleanup

- Files: `knip.json`, `project/implementation/architecture.md`
- Interfaces: none
- RED: `lint:dead` and package-boundary checks failing on residual dead exports, unused dependencies, or graph drift from `architecture.md` → GREEN: remove dead code, prune dependencies, and reconcile the manifest until every check passes across all packages
- Commit: `chore: dead-code and dependency cleanup`

| Slice         | Scope                                             | Proof                                                                          | Rollback / evidence                 | Merge prerequisite |
| ------------- | ------------------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------- | ------------------ |
| W6-ARCH-01.S1 | File-size audit script + split plan doc           | Audit runs; plan lists every >500-line file                                    | Additive tooling; remove script     | none               |
| W6-ARCH-01.S2 | Public-API snapshot tests per package             | Snapshots recorded for all seven barrels                                       | Additive tests; delete snapshots    | W6-ARCH-01.S1      |
| W6-ARCH-01.S3 | Split `model` + `playback` + `renderer` files     | Snapshots unchanged; quality gate green                                        | Revert per-package split commits    | W6-ARCH-01.S2      |
| W6-ARCH-01.S4 | Split `editor` files                              | Snapshots unchanged; store tests green                                         | Revert slice                        | W6-ARCH-01.S3      |
| W6-ARCH-01.S5 | Split `formats` files                             | Snapshots unchanged; format round-trip tests green                             | Revert slice                        | W6-ARCH-01.S3      |
| W6-ARCH-01.S6 | Split `ui` + `demo` files                         | Snapshots unchanged; `ct:all` green                                            | Revert slice                        | W6-ARCH-01.S4      |
| W6-ARCH-01.S7 | Dead-code/dependency cleanup + manifest reconcile | `lint:dead` green; graph matches architecture.md; ≤5 justified oversized files | Revert cleanup commits individually | W6-ARCH-01.S6      |

## W6-GPU-01 tasks

### T1 — Renderer benchmark harness at 500/1000/2000 elements

- Files: `packages/renderer/bench/renderer-benchmark.ts` (new), `packages/renderer/bench/candidates/` (new), `packages/renderer/bench/renderer-benchmark.test.ts` (new)
- Interfaces: `RendererCandidate`, `BenchmarkScenario`, `BenchmarkResult` — DOM baseline plus Canvas/WebGL/WebGPU prototypes measured on identical documents
- RED: harness test asserting each candidate produces frame-time, memory, text-fidelity, and accessibility-tree measurements at 500, 1000, and 2000 elements → GREEN: implement scenario generator and per-candidate measurement runs recorded as artifacts
- Commit: `test(renderer): renderer technology benchmark harness`

### T2 — Benchmark ADR authoring and ratification

- Files: `project/implementation/decisions/adr-renderer-technology.md` (new), `project/implementation/decisions.md`
- Interfaces: none
- RED: docs check failing on an unratified ADR referenced by the roadmap → GREEN: record results for every candidate, compare against frame budgets and QG-COR-02/QG-A11Y-01, and ratify adoption or explicit retention of the DOM renderer
- Commit: `docs: ratify renderer technology ADR`

## W6-REL-01 tasks

### T1 — Changesets-driven versioning with canary and stable channels

- Files: `.changeset/config.json` (new), `.github/workflows/release.yml` (new), `scripts/release/verify-channels.mjs` (new)
- Interfaces: none
- RED: release workflow dry-run failing when a package publishes without a changeset or when canary/stable tags diverge from changelog state → GREEN: adopt changesets across workspaces with canary prereleases and gated stable promotion
- Commit: `build(release): changesets with canary and stable channels`

### T2 — Signed artifacts, SBOM, provenance, and release:verify

- Files: `scripts/release/release-verify.mjs` (new), `scripts/release/generate-sbom.mjs` (new), `.github/workflows/release.yml` (new)
- Interfaces: `release:verify` npm script — rebuilds every artifact from a clean checkout and compares digests
- RED: `release:verify` failing on any artifact that does not reproduce byte-identically from a clean checkout, or ships without signature/SBOM/provenance → GREEN: implement deterministic build verification, artifact signing, SBOM generation, and provenance attestation in the release pipeline
- Commit: `build(release): signed reproducible artifacts with SBOM`

### T3 — Rollback drill, user documentation, and API documentation

- Files: `project/implementation/release-runbook.md` (new), `docs/user/` (new), `docs/api/` (new), `scripts/release/check-docs-coverage.mjs` (new)
- Interfaces: none
- RED: docs-coverage check failing on any released public API or user-facing surface without current documentation; runbook drill checklist unexecuted → GREEN: publish generated API docs plus authored user docs, and record an executed canary-to-stable promotion and rollback drill
- Commit: `docs(release): runbook, user docs, and API docs`

| Slice        | Scope                                         | Proof                                                   | Rollback / evidence                      | Merge prerequisite |
| ------------ | --------------------------------------------- | ------------------------------------------------------- | ---------------------------------------- | ------------------ |
| W6-REL-01.S1 | Changesets adoption across workspaces         | Dry-run version PR generates correct bumps/changelogs   | Remove changesets config; tags untouched | none               |
| W6-REL-01.S2 | Canary channel publishing                     | Canary prerelease publishes from CI dry-run             | Disable canary job                       | W6-REL-01.S1       |
| W6-REL-01.S3 | Stable promotion gate                         | Promotion requires green gate:full + QE lanes           | Disable promotion job; canary unaffected | W6-REL-01.S2       |
| W6-REL-01.S4 | `release:verify` reproducible-build check     | Clean-checkout rebuild digests match released artifacts | Additive check; remove script            | W6-REL-01.S1       |
| W6-REL-01.S5 | Artifact signing + SBOM + provenance          | Release run attaches signature, SBOM, provenance        | Disable attestation steps                | W6-REL-01.S4       |
| W6-REL-01.S6 | Rollback procedure + executed drill           | Drill recorded in runbook with timings and outcomes     | Runbook doc revert                       | W6-REL-01.S3       |
| W6-REL-01.S7 | API documentation generation + coverage check | Docs-coverage check green for every public API          | Additive lane; remove check              | W6-REL-01.S5       |
| W6-REL-01.S8 | User documentation for every released surface | Docs published and linked; docs:check green             | Docs revert; release pipeline unaffected | W6-REL-01.S7       |

## W6-SHOW-01 tasks

### T1 — Showcase shell on the production Broadset player

- Files: `apps/showcase/` (new), `apps/showcase/src/showcase-app.tsx` (new), `apps/showcase/src/showcase-app.test.tsx` (new)
- Interfaces: `ShowcaseApp` — public site shell embedding the W3-PLAYER-01 player core
- RED: bundle test failing if the showcase player payload exceeds QG-PERF-04 or the shell exceeds QG-PERF-01 budgets → GREEN: implement the static showcase shell driven entirely by the production player package
- Commit: `feat(showcase): public showcase shell on the player`

### T2 — Real-work gallery with ≥8 commissioned samples

- Files: `apps/showcase/src/gallery/gallery.tsx` (new), `apps/showcase/content/samples/` (new), `apps/showcase/src/gallery/gallery.test.tsx` (new)
- Interfaces: `GalleryEntry` — typed metadata for each commissioned `.bsp` sample
- RED: gallery test failing unless ≥8 commissioned samples load, play, and render deterministically through the player → GREEN: land the commissioned sample set with gallery browsing and playback
- Commit: `feat(showcase): real-work gallery with commissioned samples`

### T3 — Playground plus dogfood performance and accessibility gates

- Files: `apps/showcase/src/playground/playground.tsx` (new), `apps/showcase/ct/showcase-a11y.ct.tsx` (new), `apps/showcase/ct/showcase-perf.ct.ts` (new)
- Interfaces: `Playground` — in-browser editing sandbox seeded from gallery samples
- RED: CT lane failing on any keyboard-inoperable showcase surface or budget regression against QG-PERF-01/QG-PERF-04 → GREEN: ship the playground and wire the perf/a11y dogfood lane into CI
- Commit: `feat(showcase): playground with perf and a11y gates`

## W6-RESEARCH-01 tasks

### T1 — Research instruments and evidence templates

- Files: `project/implementation/research/w6-research-protocol.md` (new), `project/implementation/research/instruments/` (new), `project/implementation/research/award-rubric.md` (new)
- Interfaces: none
- RED: docs check failing on missing protocol, cohort-study instrument, AT-session script, or award-rubric template referenced by the wave's external evidence gates → GREEN: author the standing-cohort protocol, moderated AT-session scripts, external-critique brief, and award-rubric audit template (sessions themselves are maintainer-owned external evidence)
- Commit: `docs(research): W6 research protocol and instruments`

### T2 — Findings ledger and disposition tracking

- Files: `project/implementation/research/findings-ledger.md` (new), `scripts/check-research-ledger.mjs` (new)
- Interfaces: none
- RED: ledger check failing on any recorded finding without a disposition, or an open critical usability blocker at panel close → GREEN: implement the findings ledger with per-finding disposition states and wire the check into `docs:check` so panel-score and blocker evidence is auditable
- Commit: `docs(research): findings ledger with disposition tracking`
