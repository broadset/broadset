# Wave W4 implementation plan

Status: draft — re-sliced at the W3 phase exit

Draft task stacks for broadcast authoring and local operate mode. Only repository barrel files are named as existing paths; every other path is expected to be created by W2–W4 work and is marked `(new)`. Every XL/XXL initiative carries a draft PR-slice table; slices, not initiatives, are the PR unit.

## W4-STATE-01 tasks

### T1 — State-machine model with deterministic transition semantics

- Files: `packages/model/src/state-machine.ts` (new), `packages/model/src/state-machine.test.ts` (new), `packages/model/src/index.ts`
- Interfaces: `StateMachine`, `StateNode`, `Transition`, `TransitionCondition`, `TransitionTrigger`, `StateLayer`, `evaluateTransitionPriority`
- RED: property tests assert that any set of simultaneously eligible transitions resolves to exactly one deterministic winner (priority, then declaration order) across randomized machines → GREEN: implement the Zod-validated state-machine schema plus a pure priority evaluator with layers, conditions, and triggers
- Commit: `feat(model): add state-machine schema with deterministic transition priority`

### T2 — State runtime with trace capture and replay

- Files: `packages/playback/src/state-runtime.ts` (new), `packages/playback/src/state-trace.ts` (new), `packages/playback/src/state-runtime.test.ts` (new), `packages/playback/src/index.ts`
- Interfaces: `StateRuntime`, `StateTraceEvent`, `captureStateTrace`, `replayStateTrace`
- RED: replaying a captured trace of triggers/condition changes must reproduce the exact resulting state vector; test fails against a stub runtime → GREEN: implement the runtime that drives timeline/data-bound triggers and emits an append-only trace whose replay is bit-identical
- Commit: `feat(playback): add state runtime with deterministic trace replay`

### T3 — Visual state-graph authoring panel with trace/debug tooling

- Files: `packages/ui/src/panels/state-machine-panel.tsx` (new), `packages/editor/src/store-actions-state-machine.ts` (new), `packages/ui/ct/state-machine-authoring.ct.tsx` (new), `packages/ui/src/index.ts`
- Interfaces: `StateMachinePanel`, editor actions `addState`, `addTransition`, `setTransitionPriority`, `startStateDebugSession`
- RED: CT mounts the editor shell, creates two states and a triggered transition in the panel, fires the trigger, and asserts the canvas preview and trace inspector both update → GREEN: build the HeroUI-based graph panel, store actions, and trace inspector wired to the playback runtime
- Commit: `feat(ui): add visual state-machine authoring panel with trace debugger`

| Slice          | Scope                                                         | Proof                                                        | Rollback / evidence                                     | Merge prerequisite |
| -------------- | ------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------- | ------------------ |
| W4-STATE-01.S1 | State-machine schema (states, transitions, layers) in `model` | Zod parse/validation unit tests                              | Revert slice; schema unused by runtime yet              | none               |
| W4-STATE-01.S2 | Deterministic transition-priority evaluator                   | Property tests over randomized machines                      | Revert slice; evaluator behind pure function            | W4-STATE-01.S1     |
| W4-STATE-01.S3 | Conditions and triggers bound to data/timeline inputs         | Unit tests for condition/trigger evaluation                  | Revert slice; triggers inert without runtime            | W4-STATE-01.S2     |
| W4-STATE-01.S4 | Playback state runtime driving document animations            | Runtime integration tests in `playback`                      | Revert slice; playback falls back to timeline-only mode | W4-STATE-01.S3     |
| W4-STATE-01.S5 | Trace capture and deterministic replay                        | Replay-identity unit tests                                   | Revert slice; runtime keeps working without tracing     | W4-STATE-01.S4     |
| W4-STATE-01.S6 | State-graph authoring panel and editor store actions          | CT: author builds and triggers a machine                     | Revert slice; model/runtime unaffected                  | W4-STATE-01.S5     |
| W4-STATE-01.S7 | Trace/debug inspector UI plus demo-app wiring                 | Cross-region CT: trigger in panel updates canvas + inspector | Revert slice; panel ships without debugger              | W4-STATE-01.S6     |

## W4-RUNDOWN-01 tasks

### T1 — Rundown, cue, and playlist model with validation

- Files: `packages/model/src/rundown.ts` (new), `packages/model/src/rundown.test.ts` (new), `packages/model/src/index.ts`
- Interfaces: `Rundown`, `RundownItem`, `Cue`, `CuePolicy` (skip/hold/take-back), `validateRundown`
- RED: validation tests reject cue graphs with unreachable items, duplicate ids, and illegal skip/hold/take-back combinations → GREEN: implement the Zod-validated rundown/cue schema and policy validator
- Commit: `feat(model): add rundown, cue, and cue-policy schema with validation`

### T2 — Immutable event log with restart and replay recovery

- Files: `packages/playback/src/event-log.ts` (new), `packages/playback/src/event-log.test.ts` (new), `packages/playback/src/rundown-session.ts` (new), `packages/playback/src/index.ts`
- Interfaces: `EventLog`, `EventLogEntry`, `RundownSession`, `restoreSessionFromLog`
- RED: kill-and-restart test asserts the restored session holds the identical active item and state; replaying the full log from empty reproduces the same result → GREEN: implement the append-only event log, session reducer, and rehearsal-mode flag that never writes to the live log
- Commit: `feat(playback): add immutable event log with restart and replay recovery`

## W4-OP-01 tasks

### T1 — Operate-mode shell with preview/program and TAKE

- Files: `packages/ui/src/operate/operate-shell.tsx` (new), `packages/ui/src/operate/preview-program.tsx` (new), `packages/ui/src/operate/operate-store.ts` (new), `packages/ui/src/index.ts`
- Interfaces: `OperateShell`, `PreviewProgramSurface`, `useOperateStore`, `takeToProgram`
- RED: CT mounts the operate shell with a rundown fixture, presses TAKE, and asserts the preview item moves to program while the next cue loads into preview → GREEN: build the HeroUI operate layout (preview/program panes, TAKE button, status strip) over the rundown session
- Commit: `feat(ui): add operate-mode shell with preview/program and TAKE`

### T2 — Hotkeys, touch/tablet layout, and role-separated destructive controls

- Files: `packages/ui/src/operate/operate-hotkeys.ts` (new), `packages/ui/src/operate/operate-roles.ts` (new), `packages/ui/src/operate/operate-touch-layout.tsx` (new), `packages/ui/ct/operate-roles.ct.tsx` (new)
- Interfaces: `OperateHotkeyMap`, `OperatorRole`, `canPerformDestructiveAction`
- RED: CT asserts an `observer` role sees clear/take-back disabled and cannot fire them via hotkeys, while `operator` can; touch layout CT asserts hit targets at tablet viewport → GREEN: implement the hotkey registry, role guard, and responsive touch layout
- Commit: `feat(ui): add operate hotkeys, touch layout, and role-guarded controls`

### T3 — Keyboard/AT accessibility flows and demo integration

- Files: `packages/ui/ct/operate-a11y.ct.tsx` (new), `packages/demo/src/demo-app/operate-mode.tsx` (new), `packages/demo/ct/operate-mode-flow.ct.tsx` (new)
- Interfaces: none
- RED: CT runs rehearse, TAKE, and failure-recovery flows keyboard-only and asserts visible focus plus live-region announcements at every step (meets QG-A11Y-01) → GREEN: wire operate mode into the demo app, add focus management and aria live regions, and link operator-benchmark/AT-session evidence in the initiative record
- Commit: `feat(demo): integrate operate mode with keyboard and AT flows`

| Slice       | Scope                                                 | Proof                                              | Rollback / evidence                                 | Merge prerequisite |
| ----------- | ----------------------------------------------------- | -------------------------------------------------- | --------------------------------------------------- | ------------------ |
| W4-OP-01.S1 | Operate store bridging rundown session to UI state    | Store unit tests (vanilla, no React)               | Revert slice; no UI mounted yet                     | none               |
| W4-OP-01.S2 | Preview/program surface rendering rundown items       | CT: preview and program panes render fixtures      | Revert slice; operate mode hidden behind entry flag | W4-OP-01.S1        |
| W4-OP-01.S3 | TAKE action with confidence/status indicators         | Cross-region CT: TAKE updates both panes + status  | Revert slice; surface stays read-only               | W4-OP-01.S2        |
| W4-OP-01.S4 | Hotkey registry for rehearse/TAKE/skip/hold/take-back | CT: hotkeys drive session; conflicts rejected      | Revert slice; pointer controls remain               | W4-OP-01.S3        |
| W4-OP-01.S5 | Role separation guarding destructive controls         | CT: unauthorized role blocked in UI and hotkeys    | Revert slice; defaults to most-restrictive role     | W4-OP-01.S4        |
| W4-OP-01.S6 | Touch/tablet layout                                   | CT at tablet viewport: hit targets and layout hold | Revert slice; desktop layout unaffected             | W4-OP-01.S5        |
| W4-OP-01.S7 | Keyboard/AT flows, focus management, demo integration | a11y CT suite green (QG-A11Y-01); demo CT flow     | Revert slice; evidence links removed from record    | W4-OP-01.S6        |

## W4-CONTROL-01 tasks

### T1 — Exposed-property schema with validation, grouping, permissions, presets

- Files: `packages/model/src/exposed-properties.ts` (new), `packages/model/src/exposed-properties.test.ts` (new), `packages/model/src/index.ts`
- Interfaces: `ExposedProperty`, `ExposedPropertyGroup`, `PropertyPermission`, `PropertyPreset`, `validateExposedProperties`
- RED: unit tests reject exposed properties that reference missing element fields, overlapping groups, or presets violating their validators → GREEN: implement the Zod-validated exposed-property schema bound to component/document fields from W2-COMP-01
- Commit: `feat(model): add exposed-property schema with groups, permissions, presets`

### T2 — OGraf round-trip contract for exposed properties

- Files: `packages/formats/src/ograf/exposed-property-map.ts` (new), `packages/formats/src/ograf/exposed-property-roundtrip.test.ts` (new), `packages/formats/src/index.ts`
- Interfaces: `exportExposedPropertiesToOgraf`, `importOgrafControlSchema`
- RED: round-trip contract test exports author-defined exposed properties to the OGraf schema and re-imports them, asserting validation, grouping, permission, and preset metadata survive without loss → GREEN: implement the bidirectional mapping onto the W3-OGRAF-01 exporter, warning on any non-representable field instead of dropping it
- Commit: `feat(formats): round-trip exposed properties through OGraf control schema`

### T3 — Builder UI and generated operator controls

- Files: `packages/ui/src/panels/exposed-property-builder.tsx` (new), `packages/ui/src/operate/generated-controls.tsx` (new), `packages/ui/ct/exposed-property-controls.ct.tsx` (new), `packages/ui/src/index.ts`
- Interfaces: `ExposedPropertyBuilder`, `GeneratedControlPanel`
- RED: CT: author exposes a text and a color property with validation ranges in the builder, then the operate surface renders generated HeroUI controls that enforce those validators and presets → GREEN: implement the builder panel and the schema-driven control generator shared with operate mode
- Commit: `feat(ui): add exposed-property builder and generated operator controls`

| Slice            | Scope                                                     | Proof                                                 | Rollback / evidence                               | Merge prerequisite |
| ---------------- | --------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------- | ------------------ |
| W4-CONTROL-01.S1 | Exposed-property schema and validators in `model`         | Unit tests over valid/invalid definitions             | Revert slice; schema unused                       | none               |
| W4-CONTROL-01.S2 | Grouping, permissions, and preset metadata                | Unit tests for group/permission/preset invariants     | Revert slice; base schema keeps working           | W4-CONTROL-01.S1   |
| W4-CONTROL-01.S3 | OGraf export mapping for exposed properties               | Export contract tests against OGraf schema fixtures   | Revert slice; OGraf export ships without controls | W4-CONTROL-01.S2   |
| W4-CONTROL-01.S4 | OGraf import and lossless round-trip                      | Round-trip identity tests (no metadata loss)          | Revert slice; export-only mapping remains         | W4-CONTROL-01.S3   |
| W4-CONTROL-01.S5 | Builder panel UI with validation feedback                 | CT: author curates properties with inline errors      | Revert slice; model/formats unaffected            | W4-CONTROL-01.S4   |
| W4-CONTROL-01.S6 | Schema-driven generated operator controls                 | CT: generated controls enforce validators and presets | Revert slice; operate mode hides control panel    | W4-CONTROL-01.S5   |
| W4-CONTROL-01.S7 | Author→OGraf→operator end-to-end contract and demo wiring | E2E CT proving the full round trip in the demo app    | Revert slice; per-stage contracts stay green      | W4-CONTROL-01.S6   |

## W4-DATA-01 tasks

### T1 — Connector configuration schema and credentials boundary

- Files: `packages/model/src/live-data-connector.ts` (new), `packages/model/src/live-data-connector.test.ts` (new), `packages/model/src/index.ts`
- Interfaces: `LiveDataConnectorConfig`, `RateTier`, `CredentialRef`, `validateConnectorConfig`
- RED: unit tests assert documents may only persist opaque `CredentialRef` handles — any literal secret material in a connector config fails validation — and that rate tiers are size- and frequency-capped → GREEN: implement the Zod-validated connector schema with a host-side credentials boundary type
- Commit: `feat(model): add live-data connector schema with credentials boundary`

### T2 — Live-data runtime: backpressure, frame-coalescing, stale/fallback/test modes

- Files: `packages/playback/src/live-data/live-data-runtime.ts` (new), `packages/playback/src/live-data/frame-coalescer.ts` (new), `packages/playback/src/live-data/live-data-runtime.test.ts` (new), `packages/playback/src/index.ts`
- Interfaces: `LiveDataRuntime`, `FrameCoalescer`, `LiveDataStatus` (`live`/`stale`/`fallback`/`test`)
- RED: simulated 10 Hz feed test asserts render callbacks stay at a stable 60 fps with coalesced values; partition/reconnect test asserts stale then fallback engage deterministically → GREEN: implement the runtime with rate tiers, backpressure, per-frame coalescing, and stale/fallback/test state transitions
- Commit: `feat(playback): add live-data runtime with coalescing and fallback modes`

### T3 — Connector transforms, binding UI, and hostile-input hardening

- Files: `packages/ui/src/panels/live-data-panel.tsx` (new), `packages/demo/src/demo-app/live-data-host.ts` (new), `packages/playback/src/live-data/flood.test.ts` (new), `packages/ui/ct/live-data-binding.ct.tsx` (new)
- Interfaces: `LiveDataPanel`, host adapter `createDemoConnectorHost`
- RED: flood tests fire oversized, malformed, and high-frequency payloads and assert every input is rate-limited, size-capped, and Zod-validated before use (meets QG-SEC-01); CT asserts stale/fallback/test badges render in the binding panel → GREEN: implement transforms, the HeroUI binding panel with status states, and the demo host adapter behind the credentials boundary
- Commit: `feat(ui): add live-data binding panel with stale/fallback/test states`

| Slice         | Scope                                                       | Proof                                                     | Rollback / evidence                                | Merge prerequisite |
| ------------- | ----------------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------- | ------------------ |
| W4-DATA-01.S1 | Connector config schema and credentials boundary in `model` | Validation unit tests incl. secret-material rejection     | Revert slice; schema unused                        | none               |
| W4-DATA-01.S2 | Live-data runtime core with rate tiers and backpressure     | Runtime unit tests under burst load                       | Revert slice; W2 static data binding unaffected    | W4-DATA-01.S1      |
| W4-DATA-01.S3 | Frame-coalescer driving stable render cadence               | 10 Hz→60 fps stability test                               | Revert slice; runtime delivers uncoalesced updates | W4-DATA-01.S2      |
| W4-DATA-01.S4 | Stale/fallback/test mode state machine                      | Partition/reconnect determinism tests                     | Revert slice; runtime reports live/offline only    | W4-DATA-01.S3      |
| W4-DATA-01.S5 | Transforms and hostile-input hardening                      | Flood tests green (QG-SEC-01)                             | Revert slice; connectors gated off by default      | W4-DATA-01.S4      |
| W4-DATA-01.S6 | Binding panel UI with status badges                         | Cross-region CT: feed state changes update panel + canvas | Revert slice; runtime headless-only                | W4-DATA-01.S5      |
| W4-DATA-01.S7 | Demo host adapter and end-to-end live feed demo             | Demo CT: bound live feed drives rendered element          | Revert slice; UI works against fixture feed        | W4-DATA-01.S6      |

## W4-VARIANT-01 tasks

### T1 — Variant, constraint, and safe-area model

- Files: `packages/model/src/aspect-variant.ts` (new), `packages/model/src/aspect-variant.test.ts` (new), `packages/model/src/index.ts`
- Interfaces: `AspectVariant`, `LayoutConstraint`, `SafeArea`, `ContentFitPolicy`, `resolveVariantOverrides`
- RED: unit tests assert variant overrides layer onto the base document like page overrides, constraints reject contradictory pins, and the corpus fixtures cover 16:9, 9:16, 1:1, and ultrawide → GREEN: implement the Zod-validated variant schema extending the W2-VAR-01 variant seam with constraints, safe areas, and content-fit policy
- Commit: `feat(model): add aspect-variant schema with constraints and safe areas`

### T2 — Constraint resolution and overflow preflight

- Files: `packages/renderer/src/variant-layout.ts` (new), `packages/renderer/src/variant-layout.test.ts` (new), `packages/model/src/variant-preflight.ts` (new), `packages/renderer/src/index.ts`
- Interfaces: `resolveVariantLayout`, `runVariantPreflight`, `VariantPreflightFinding`
- RED: preflight tests flag elements that escape safe areas or violate the content-fit policy at each corpus aspect ratio, with zero false negatives on the fixture set → GREEN: implement deterministic constraint resolution in the renderer and the preflight analyzer over resolved layouts
- Commit: `feat(renderer): resolve variant constraints with overflow preflight`

### T3 — Variant preview matrix UI

- Files: `packages/ui/src/panels/variant-matrix.tsx` (new), `packages/ui/ct/variant-matrix.ct.tsx` (new), `packages/ui/src/index.ts`
- Interfaces: `VariantMatrixPanel`
- RED: CT renders a document in the side-by-side matrix (16:9, 9:16, 1:1, ultrawide), edits a constraint in the properties panel, and asserts every matrix tile re-renders plus overflow warnings appear on the violating tile → GREEN: implement the HeroUI matrix panel with per-tile preflight badges wired to the renderer
- Commit: `feat(ui): add variant preview matrix with overflow warnings`

| Slice            | Scope                                                | Proof                                                     | Rollback / evidence                             | Merge prerequisite |
| ---------------- | ---------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------- | ------------------ |
| W4-VARIANT-01.S1 | Aspect-variant schema layered on the W2 variant seam | Schema/override unit tests                                | Revert slice; W2 variants unaffected            | none               |
| W4-VARIANT-01.S2 | Layout constraints and safe-area model               | Constraint validation tests incl. contradictions          | Revert slice; variants ship without constraints | W4-VARIANT-01.S1   |
| W4-VARIANT-01.S3 | Content-fit policy resolution in the renderer        | Deterministic layout tests across corpus ratios           | Revert slice; renderer ignores fit policy       | W4-VARIANT-01.S2   |
| W4-VARIANT-01.S4 | Overflow preflight analyzer                          | Preflight tests: zero false negatives on fixture corpus   | Revert slice; layout resolution stays green     | W4-VARIANT-01.S3   |
| W4-VARIANT-01.S5 | Variant matrix panel rendering all corpus ratios     | CT: side-by-side tiles render corpus document             | Revert slice; single-variant preview remains    | W4-VARIANT-01.S4   |
| W4-VARIANT-01.S6 | Per-tile overflow warnings and preflight badges      | Cross-region CT: constraint edit updates tiles + warnings | Revert slice; matrix renders without badges     | W4-VARIANT-01.S5   |
| W4-VARIANT-01.S7 | Demo integration and variant-corpus evidence         | Demo CT over 16:9/9:16/1:1/ultrawide corpus               | Revert slice; panel available in ui only        | W4-VARIANT-01.S6   |

## W4-PLAYOUT-01 tasks

### T1 — Engine adapter contracts, lifecycle protocol, and pinned engine policy

- Files: `packages/formats/src/playout/engine-adapter.ts` (new), `packages/formats/src/playout/engine-matrix.ts` (new), `packages/formats/src/playout/engine-adapter.test.ts` (new), `project/spec/broadcast/playout-matrix.md` (new), `packages/formats/src/index.ts`
- Interfaces: `PlayoutEngineAdapter`, `EngineMatrixRow`, `PlayerLifecycleCommand` (`load`/`play`/`update`/`stop`/`clear`), `PinnedEnginePolicy`
- RED: contract tests assert every published matrix row declares engine, pinned version range, key/fill capability, and lifecycle conformance; an adapter missing any lifecycle command fails the contract suite → GREEN: implement the adapter interface over the W3-PLAYER-01 player runtime, the machine-readable engine matrix, and the pinned-version policy spec
- Commit: `feat(formats): add playout engine adapter contract and pinned matrix`

### T2 — Key/fill alpha output and font/asset readiness gating

- Files: `packages/renderer/src/key-fill-output.ts` (new), `packages/renderer/src/key-fill-output.test.ts` (new), `packages/playback/src/readiness-gate.ts` (new), `packages/playback/src/readiness-gate.test.ts` (new), `packages/renderer/src/index.ts`, `packages/playback/src/index.ts`
- Interfaces: `renderKeyFillFrame`, `ReadinessGate`, `awaitFontAndAssetReadiness`
- RED: frame-hash tests assert straight-alpha key/fill output matches golden hashes per QG-REL-01 determinism; readiness tests assert playout is refused until fonts and assets report ready and that late assets surface a warning instead of a partial frame → GREEN: implement alpha-correct key/fill rendering and the readiness gate consumed by every engine adapter
- Commit: `feat(renderer): add key/fill alpha output with asset readiness gating`

### T3 — Clean-machine integration harness and recorded-output evidence

- Files: `scripts/playout-matrix/run-matrix.mjs` (new), `scripts/playout-matrix/casparcg.setup.mjs` (new), `scripts/playout-matrix/obs.setup.mjs` (new), `scripts/playout-matrix/vmix.checklist.md` (new), `project/implementation/evidence/playout-matrix.md` (new)
- Interfaces: none
- RED: harness dry-run test asserts every advertised `EngineMatrixRow` maps to exactly one executable scenario (or the licensed vMix manual checklist) and fails when a row lacks coverage (meets QG-INT-01) → GREEN: implement clean-machine setup and run scripts for CasparCG and OBS, the vMix manual-signoff checklist, and the recorded-output evidence index (meets QG-BCAST-01)
- Commit: `feat(scripts): add clean-machine playout matrix harness and evidence index`

| Slice             | Scope                                                          | Proof                                                 | Rollback / evidence                              | Merge prerequisite |
| ----------------- | -------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------ | ------------------ |
| W4-PLAYOUT-01.S1  | Pinned engine policy and machine-readable matrix               | Matrix schema tests; policy spec review               | Revert slice; no adapter depends on it yet       | none               |
| W4-PLAYOUT-01.S2  | Engine adapter contract and lifecycle protocol                 | Lifecycle contract suite over a mock engine           | Revert slice; W3 player runtime unchanged        | W4-PLAYOUT-01.S1   |
| W4-PLAYOUT-01.S3  | Font/asset readiness gate in playback                          | Readiness refusal + late-asset warning tests          | Revert slice; adapters play without gating       | W4-PLAYOUT-01.S2   |
| W4-PLAYOUT-01.S4  | Key/fill alpha rendering path                                  | Golden frame-hash tests (QG-REL-01)                   | Revert slice; fill-only output remains           | W4-PLAYOUT-01.S3   |
| W4-PLAYOUT-01.S5  | CasparCG HTML-producer adapter                                 | Contract suite green against CasparCG scenario        | Revert slice; matrix row marked unsupported      | W4-PLAYOUT-01.S4   |
| W4-PLAYOUT-01.S6  | CasparCG key/fill scenario validation                          | Recorded key/fill output reviewed and linked          | Remove row from advertised matrix                | W4-PLAYOUT-01.S5   |
| W4-PLAYOUT-01.S7  | OBS browser-source adapter                                     | Contract suite green against OBS scenario             | Revert slice; matrix row marked unsupported      | W4-PLAYOUT-01.S6   |
| W4-PLAYOUT-01.S8  | vMix web-input adapter and manual-signoff checklist            | Checklist executed on licensed vMix; signoff recorded | Remove row from advertised matrix                | W4-PLAYOUT-01.S7   |
| W4-PLAYOUT-01.S9  | OGraf conformance rows in the matrix                           | OGraf conformance suite green per advertised row      | Revert slice; OGraf rows marked experimental     | W4-PLAYOUT-01.S8   |
| W4-PLAYOUT-01.S10 | Lifecycle fault handling (reload, GC, offline, engine restart) | Fault-injection tests per adapter                     | Revert slice; happy-path lifecycle stays green   | W4-PLAYOUT-01.S9   |
| W4-PLAYOUT-01.S11 | Clean-machine setup + run scripts (CasparCG/OBS)               | Scripted run passes on a clean machine (QG-INT-01)    | Revert slice; manual runbook remains             | W4-PLAYOUT-01.S10  |
| W4-PLAYOUT-01.S12 | Recorded-output capture and review pipeline                    | Recorded playout output linked per row (QG-BCAST-01)  | Revert slice; rows lack recorded evidence        | W4-PLAYOUT-01.S11  |
| W4-PLAYOUT-01.S13 | Evidence index and matrix release report                       | Evidence doc links 100% of advertised rows            | Revert slice; per-row evidence still retrievable | W4-PLAYOUT-01.S12  |

## W4-CLOCK-01 tasks

### T1 — Clock tier abstraction with drift detection and failover

- Files: `packages/playback/src/playout-clock.ts` (new), `packages/playback/src/playout-clock.test.ts` (new), `packages/playback/src/index.ts`
- Interfaces: `PlayoutClock`, `ClockTier` (`software`/`external-sync`), `ClockDiagnostics`, `DriftPolicy`
- RED: drift-injection tests feed a skewing reference clock and assert deterministic failover to the degraded tier at the documented threshold, with diagnostics recording offset, jitter, and failover cause → GREEN: implement the tiered clock over the W1-TIME-01 timebase with explicit software-timed vs externally-synchronized tiers and no genlock claim in the published capability record
- Commit: `feat(playback): add tiered playout clock with drift failover`

### T2 — Clock diagnostics UI and degraded-state surfacing

- Files: `packages/ui/src/operate/clock-status.tsx` (new), `packages/ui/ct/clock-status.ct.tsx` (new), `packages/ui/src/index.ts`, `project/spec/broadcast/clock-tiers.md` (new)
- Interfaces: `ClockStatusIndicator`
- RED: CT injects drift through the clock runtime and asserts the operate-mode status strip shows tier, drift magnitude, and a degraded-state warning; spec test asserts published claims separate the two tiers (meets QG-BCAST-01) → GREEN: implement the HeroUI clock status indicator wired into the operate shell and write the tier-claims spec
- Commit: `feat(ui): surface clock diagnostics and degraded-state warnings`

## W4-SOAK-01 tasks

### T1 — 24-hour soak harness with fault injection and budget tracking

- Files: `scripts/soak/run-soak.mjs` (new), `scripts/soak/fault-injector.mjs` (new), `scripts/soak/budget-trackers.mjs` (new), `packages/playback/src/soak-instrumentation.ts` (new), `packages/playback/src/index.ts`
- Interfaces: `SoakScenario`, `FaultInjectionPlan`, `SoakBudgetReport` (heap/DOM-node/GPU budgets)
- RED: a short-cycle harness self-test (compressed scenario) fails when an injected heap leak, DOM-node growth, or fatal error escapes the budget trackers → GREEN: implement the playlist+live-data+asset+video soak scenario runner with deterministic fault-injection schedules and heap/DOM/GPU sampling
- Commit: `feat(scripts): add 24h soak harness with fault injection and budgets`

### T2 — Diagnostics bundle with fault reproducibility

- Files: `scripts/soak/diagnostics-bundle.mjs` (new), `scripts/soak/diagnostics-bundle.test.mjs` (new), `project/implementation/evidence/soak-runs.md` (new)
- Interfaces: `DiagnosticsBundle` (event log, state traces, clock diagnostics, budget series)
- RED: reproducibility test replays a bundle captured from an injected-fault run and asserts the identical fault signature is reproduced from the bundle alone → GREEN: implement bundle capture (event log + state trace + clock + budget series), the replay verifier, and the soak-evidence index recording zero-fatal/zero-data-loss results
- Commit: `feat(scripts): add soak diagnostics bundle with fault replay verification`
