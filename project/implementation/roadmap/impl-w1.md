# Wave W1 implementation plan

Status: draft — re-sliced at the W0 phase exit

Task stacks below are coarse drafts. Paths marked `(new)` do not exist yet; unmarked paths were verified against the repository at draft time. Slice tables for XL initiatives are draft-sliced and will be re-cut against the ratified W0 RFC outcomes at the phase exit.

## W1-TIME-01 tasks

### T1 — Ratified FrameRate/Timebase types and conversions

- Files: `packages/model/src/timebase.ts` (new), `packages/model/src/timebase.test.ts` (new), `packages/model/src/index.ts`
- Interfaces: `FrameRate`, `Timebase`, `frameToTick`, `tickToFrame`, `tickToTimecode`, `timecodeToTick`
- RED: boundary tests for integer and fractional rates (24, 25, 30, 50, 60, 29.97, 59.94) at zero, hour, and day boundaries → GREEN: rational-arithmetic conversions on the W0-TIME-01 ratified tick base, no floating-point accumulation
- Commit: `feat(model): add ratified FrameRate/Timebase conversions`

### T2 — Drop-frame rules and drift property tests

- Files: `packages/model/src/timebase-dropframe.ts` (new), `packages/model/src/timebase-dropframe.test.ts` (new), `packages/model/src/index.ts`
- Interfaces: `isDropFrameRate`, `tickToDropFrameTimecode`, `dropFrameTimecodeToTick`
- RED: property tests assert hour-long 29.97 and 59.94 fps sequences accumulate zero drift and drop-frame skips match SMPTE minute/tens-of-minutes rules → GREEN: implement drop-frame timecode math over the tick base
- Commit: `feat(model): add drop-frame timecode rules`

### T3 — Exact export sampling in playback and formats

- Files: `packages/playback/src/export-sampling.ts` (new), `packages/playback/src/export-sampling.test.ts` (new), `packages/playback/src/index.ts`, `packages/formats/src/_shared/export-sampling-consumers.test.ts` (new)
- Interfaces: `createExportSampler`, `ExportSampleIterator`
- RED: sampling N frames at 29.97/59.94 yields tick-exact times identical to sequential playback evaluation, including the final frame of an hour-long sequence → GREEN: tick-iterating sampler shared by every export consumer
- Commit: `feat(playback): tick-exact export sampling`

## W1-TIME-02 tasks

### T1 — Stable keyframe addressing

- Files: `packages/model/src/animation-address.ts` (new), `packages/model/src/animation-address.test.ts` (new), `packages/model/src/animation.ts`, `packages/model/src/index.ts`
- Interfaces: `KeyframeAddress`, `resolveKeyframeAddress`, `keyframeAddressesEqual`
- RED: addresses remain stable across keyframe insert, remove, and reorder per the RFC-02 addressing decision; identity tests over mutated documents → GREEN: implement the ratified addressing scheme on the animation model
- Commit: `feat(model): stable keyframe addressing`

### T2 — Compiled binary-search tracks and F-18 eased tuple fix

- Files: `packages/playback/src/compiled-track.ts` (new), `packages/playback/src/compiled-track.test.ts` (new), `packages/playback/src/interpolation/tuple-path.ts`, `packages/playback/src/index.ts`
- Interfaces: `CompiledTrack`, `compileTracks`, `sampleCompiledTrack`
- RED: fuzzed random seeks produce values identical to sequential evaluation on compiled tracks; F-18 eased tuple path regression test fails on current interpolation → GREEN: binary-search compiled tracks per RFC-03 plus the eased tuple path fix
- Commit: `feat(playback): compiled binary-search animation tracks`

## W1-SCENE-01 tasks

### T1 — ResolvedSceneSnapshot types and resolution kernel

- Files: `packages/model/src/scene/resolved-scene.ts` (new), `packages/model/src/scene/resolved-scene.test.ts` (new), `packages/model/src/scene/types.ts` (new), `packages/model/src/index.ts`
- Interfaces: `ResolvedSceneSnapshot`, `ResolvedNode`, `SceneProvenance`, `resolveScene`
- RED: golden fixtures resolving element hierarchy, page overrides, and component/default data into a frozen snapshot with per-field provenance → GREEN: implement the RFC-01/RFC-07 resolution kernel in `model`
- Commit: `feat(model): resolved scene snapshot kernel`

### T2 — Coordinate spaces, round-trip properties, and F-09 regression

- Files: `packages/model/src/scene/coordinate-space.ts` (new), `packages/model/src/scene/coordinate-space.test.ts` (new), `packages/editor/src/scene-snapshot-adapter.test.ts` (new)
- Interfaces: `CoordinateSpace`, `toDocumentSpace`, `toLocalSpace`
- RED: property-based tests prove nested rotated local↔document coordinate round trips within QG-COR-01; F-09 nested-paste coordinate/ID regression test fails on current paste path → GREEN: matrix-stack coordinate resolution and the F-09 fix on the snapshot
- Commit: `feat(model): snapshot coordinate spaces with round-trip proofs`

### T3 — Migrate all coordinate consumers onto the snapshot

- Files: `packages/renderer/src/scene-tree.ts`, `packages/playback/src/playback-controller.ts`, `packages/editor/src/scene-snapshot-adapter.ts` (new), `packages/formats/src/_shared/geometry` (adapter file, new)
- Interfaces: none (consumers adopt existing snapshot API)
- RED: consumer contract tests assert renderer, playback, editor, and formats read coordinates only from `ResolvedSceneSnapshot` (no direct document traversal remains) → GREEN: migrate each consumer and delete legacy traversal paths
- Commit: `refactor: migrate coordinate consumers to scene snapshot`

| Slice          | Scope                                                             | Proof                                            | Rollback / evidence                             | Merge prerequisite |
| -------------- | ----------------------------------------------------------------- | ------------------------------------------------ | ----------------------------------------------- | ------------------ |
| W1-SCENE-01.S1 | Snapshot types + resolution kernel skeleton in `model`            | golden hierarchy fixtures green                  | revert single package dir; fixtures as evidence | none               |
| W1-SCENE-01.S2 | Page-override and component/default data resolution               | override precedence unit tests                   | kernel keeps working without overrides          | W1-SCENE-01.S1     |
| W1-SCENE-01.S3 | Coordinate spaces + nested rotated round-trip properties          | property tests meet QG-COR-01                    | property-test seed corpus retained              | W1-SCENE-01.S2     |
| W1-SCENE-01.S4 | Provenance fields + snapshot immutability guarantees              | provenance golden tests; freeze assertions       | provenance optional until consumers adopt       | W1-SCENE-01.S3     |
| W1-SCENE-01.S5 | Renderer migration onto the snapshot                              | renderer parity suite unchanged                  | renderer adapter flag reverts to legacy path    | W1-SCENE-01.S4     |
| W1-SCENE-01.S6 | Playback migration onto the snapshot                              | playback controller suites unchanged             | playback adapter isolated in one module         | W1-SCENE-01.S5     |
| W1-SCENE-01.S7 | Editor migration + F-09 nested-paste regression fix               | F-09 regression test green; editor suites green  | fix and adapter land together, revert as one    | W1-SCENE-01.S6     |
| W1-SCENE-01.S8 | Formats migration + legacy traversal deletion + consumer contract | contract test proves no direct traversal remains | deletion slice; prior slices keep both paths    | W1-SCENE-01.S7     |

## W1-TEXT-01 tasks

### T1 — HarfBuzz WASM shaping core

- Files: `packages/model/src/text/shaper.ts` (new), `packages/model/src/text/shaper.test.ts` (new), `packages/model/src/text/wasm-loader.ts` (new), `packages/model/src/index.ts`
- Interfaces: `TextShaper`, `ShapedRun`, `shapeText`, `loadShaperWasm`
- RED: shaping golden tests for Latin, Arabic (joining), and Devanagari (reordering) produce exact glyph/cluster sequences → GREEN: HarfBuzz WASM shaping wrapped behind the shared engine API on the W0-PLAT-01 loading contract
- Commit: `feat(model): HarfBuzz WASM shaping core`

### T2 — BiDi, graphemes, line breaking, fallback, axes, vertical

- Files: `packages/model/src/text/bidi.ts` (new), `packages/model/src/text/line-break.ts` (new), `packages/model/src/text/font-fallback.ts` (new), `packages/model/src/text/layout.ts` (new), tests alongside (new)
- Interfaces: `layoutText`, `TextLayoutResult`, `FontFallbackChain`, `VariableAxisSettings`
- RED: UAX #9/#14/#29 conformance subsets, fallback-chain selection tests, variable-axis and vertical-writing golden metrics → GREEN: full layout pipeline over the shaping core
- Commit: `feat(model): unicode text layout pipeline`

### T3 — Adopt the shared engine in renderer and export consumers

- Files: `packages/renderer/src/elements` (text element adapter file, new), `packages/formats/src/_shared/text-layout/text-layout.ts`, `packages/formats/src/_shared/text-layout/text-unicode.ts`, cross-consumer parity test (new)
- Interfaces: none (consumers adopt `layoutText`)
- RED: multilingual golden layout metrics identical across renderer and export consumers; text content and run identity exact per QG-COR-03 → GREEN: replace per-consumer layout with the shared engine
- Commit: `refactor: unify renderer and export text layout on shared engine`

| Slice         | Scope                                                     | Proof                                         | Rollback / evidence                            | Merge prerequisite |
| ------------- | --------------------------------------------------------- | --------------------------------------------- | ---------------------------------------------- | ------------------ |
| W1-TEXT-01.S1 | WASM loader + shaping API with Latin/Arabic/Indic goldens | shaping golden suite green                    | engine unused by consumers; revert package dir | none               |
| W1-TEXT-01.S2 | Grapheme segmentation + BiDi resolution                   | UAX #9/#29 conformance subset green           | segmentation isolated module                   | W1-TEXT-01.S1      |
| W1-TEXT-01.S3 | Line breaking + justification metrics                     | UAX #14 subset + wrap goldens green           | line breaker behind engine API                 | W1-TEXT-01.S2      |
| W1-TEXT-01.S4 | Font fallback chain resolution                            | fallback selection tests green                | fallback defaults to primary font              | W1-TEXT-01.S3      |
| W1-TEXT-01.S5 | Variable axes + vertical writing directions               | axis/vertical golden metrics green            | features flagged off until consumers adopt     | W1-TEXT-01.S4      |
| W1-TEXT-01.S6 | Multilingual golden corpus + run-identity harness         | corpus green; QG-COR-03 harness in CI         | corpus additive, no consumer change            | W1-TEXT-01.S5      |
| W1-TEXT-01.S7 | Renderer adoption of the shared engine                    | renderer text suites + visual baselines green | renderer adapter reverts to legacy layout      | W1-TEXT-01.S6      |
| W1-TEXT-01.S8 | Formats export adoption + cross-consumer parity gate      | metrics identical across consumers            | parity gate blocks silent divergence           | W1-TEXT-01.S7      |

## W1-COLOR-01 tasks

### T1 — Working-space types, float channels, profile transforms

- Files: `packages/model/src/color-pipeline/working-space.ts` (new), `packages/model/src/color-pipeline/working-space.test.ts` (new), `packages/model/src/broadset-color.ts`, `packages/model/src/index.ts`
- Interfaces: `WorkingSpace`, `FloatColor`, `toWorkingSpace`, `fromWorkingSpace`, `applyProfileTransform`
- RED: profile round-trip tests (sRGB↔working space↔Display P3) preserve values within QG-COR-02 → GREEN: implement the RFC-09 ratified working space with float channels and profile transforms
- Commit: `feat(model): working-space color pipeline`

### T2 — Linear-light premultiplied compositing and SDR/HDR policy

- Files: `packages/model/src/color-pipeline/compositing.ts` (new), `packages/model/src/color-pipeline/compositing.test.ts` (new), `packages/renderer/src/core/contracts.ts`
- Interfaces: `compositeLinearPremultiplied`, `SdrHdrPolicy`
- RED: gamut-mapping and alpha-compositing tests including translucent-over-wide-gamut edge cases → GREEN: linear-light premultiplied compositing and the ratified SDR/HDR policy
- Commit: `feat(model): linear-light premultiplied compositing`

### T3 — Color-chart oracle validation

- Files: `packages/model/src/color-pipeline/color-chart-oracle.test.ts` (new), oracle fixtures (new)
- Interfaces: none
- RED: color-chart oracle asserts ΔE00 ≤ 1.0 target / ≤ 2.0 ceiling across the reference chart per QG-COR-02 → GREEN: pipeline corrections until the oracle passes
- Commit: `test(model): color-chart oracle for QG-COR-02`

## W1-SEC-01 tasks

### T1 — Shared safe-markup policy kernel with bounded AST processing

- Files: `packages/model/src/safe-markup/policy.ts` (new), `packages/model/src/safe-markup/policy.test.ts` (new), `packages/model/src/safe-markup/hostile-corpus.test.ts` (new), `packages/model/src/index.ts`
- Interfaces: `SafeMarkupPolicy`, `MarkupContext`, `sanitizeMarkup`
- RED: depth/size hostile corpus (deep nesting, entity blowup, oversized attributes) completes within hard caps per QG-SEC-01 → GREEN: iterative work-queue AST processing with context-specific allowlists per RFC-10
- Commit: `feat(model): shared safe-markup policy kernel`

### T2 — Sanitizer symmetry across capture, render, and export

- Files: `packages/formats/src/_shared/sanitize/index.ts`, `packages/formats/src/_shared/sanitize/sanitize-svg.ts`, `packages/renderer/src/dom/safe-markup-adapter.ts` (new), symmetry tests (new)
- Interfaces: none (consumers adopt shared policy)
- RED: symmetry tests prove identical input sanitized at capture, render, and export yields identical safe output → GREEN: route all three surfaces through the shared kernel
- Commit: `refactor(formats): route sanitizers through shared policy`

### T3 — Mutation score gate and Trusted Types preparation

- Files: mutation-testing config (new), `packages/renderer/src/dom/trusted-types.ts` (new), `packages/renderer/src/dom/trusted-types.test.ts` (new)
- Interfaces: `createTrustedMarkupPolicy`
- RED: mutation run over the sanitizer suite meets its ratified score target; Trusted Types policy factory tests cover default and CSP-enforced environments → GREEN: close surviving mutants and land the Trusted Types shim
- Commit: `test: sanitizer mutation gate and Trusted Types prep`

## W1-ASSET-01 tasks

### T1 — Content-addressed store contract and integrity hashing

- Files: `packages/model/src/asset-store.ts` (new), `packages/model/src/asset-store.test.ts` (new), `packages/model/src/content-hash.ts`, `packages/model/src/asset.ts`, `packages/model/src/index.ts`
- Interfaces: `ContentAddressedAssetStore`, `AssetDigest`, `AssetProvenance`, `ingestAsset`, `resolveAsset`
- RED: ingest returns a stable digest; identical bytes dedupe to one entry; digest verification rejects tampered blobs → GREEN: RFC-08 content-addressed contract with integrity hashes and license/provenance fields
- Commit: `feat(model): content-addressed asset store contract`

### T2 — Metadata extraction for font, image, video, and ICC blobs

- Files: `packages/formats/src/_shared/asset-dedup/asset-dedup.ts`, `packages/formats/src/_shared/asset-metadata` (new), extractor tests (new)
- Interfaces: `extractAssetMetadata`, `AssetMetadata`
- RED: extractors report dimensions, codecs, font names/axes, and ICC descriptions from fixture blobs; malformed blobs yield typed errors, never throws → GREEN: bounded metadata extraction wired to ingest
- Commit: `feat(formats): asset metadata extraction on ingest`

### T3 — Corrupt/missing/duplicate handling and deterministic resolution

- Files: `packages/model/src/asset-store.failures.test.ts` (new), fixture corpus (new)
- Interfaces: none
- RED: corrupt blobs fail integrity with typed errors, missing assets resolve to the declared fallback deterministically, duplicate ingest is idempotent — meets QG-SEC-01 → GREEN: failure-path hardening until the corpus passes twice with identical resolution order
- Commit: `test(model): asset store failure corpus and determinism`

## W1-PERSIST-01 tasks

### T1 — IndexedDB journal/head with checksummed snapshots

- Files: `packages/editor/src/persistence/journal.ts` (new), `packages/editor/src/persistence/head.ts` (new), `packages/editor/src/persistence/journal.test.ts` (new), `packages/editor/src/index.ts`
- Interfaces: `PersistenceRuntime`, `Journal`, `HeadSnapshot`, `openPersistence`
- RED: append/replay round trip restores the exact document; checksum mismatch is detected and quarantined → GREEN: RFC-08 journal/head runtime over IndexedDB with checksummed snapshots
- Commit: `feat(editor): IndexedDB journal/head persistence`

### T2 — OPFS/blob adapter, compaction, quota and eviction

- Files: `packages/editor/src/persistence/opfs-adapter.ts` (new), `packages/editor/src/persistence/compaction.ts` (new), tests alongside (new)
- Interfaces: `BlobStoreAdapter`, `compactJournal`, `QuotaPolicy`
- RED: compaction preserves replay equivalence; quota-exceeded and eviction scenarios degrade without data loss → GREEN: OPFS/blob adapter with compaction and quota/eviction policy
- Commit: `feat(editor): OPFS adapter, compaction, quota handling`

### T3 — Crash injection and multi-tab coordination

- Files: `packages/editor/src/persistence/crash-injection.test.ts` (new), `packages/editor/src/persistence/multi-tab.ts` (new), `packages/editor/src/persistence/multi-tab.model.test.ts` (new)
- Interfaces: `TabCoordinator`
- RED: crash injection at every write boundary loses no committed data and meets the RPO/RTO budgets; multi-tab model tests prove Web Locks/BroadcastChannel ownership transfer → GREEN: write-boundary hardening and tab coordination
- Commit: `feat(editor): crash-safe writes and multi-tab coordination`

| Slice            | Scope                                              | Proof                                            | Rollback / evidence                               | Merge prerequisite |
| ---------------- | -------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------- | ------------------ |
| W1-PERSIST-01.S1 | Journal schema + append/replay in IndexedDB        | replay round-trip tests green                    | runtime unused by app; revert persistence dir     | none               |
| W1-PERSIST-01.S2 | Checksummed head snapshots + corruption quarantine | checksum detection tests green                   | head optional; journal replay still authoritative | W1-PERSIST-01.S1   |
| W1-PERSIST-01.S3 | Crash-injection harness at every write boundary    | zero committed-data loss under injection         | harness is test-only code                         | W1-PERSIST-01.S2   |
| W1-PERSIST-01.S4 | OPFS/blob adapter for large payloads               | adapter conformance suite green                  | adapter behind `BlobStoreAdapter` seam            | W1-PERSIST-01.S3   |
| W1-PERSIST-01.S5 | Compaction with replay equivalence                 | compaction equivalence property green            | compaction can be disabled by policy              | W1-PERSIST-01.S4   |
| W1-PERSIST-01.S6 | Quota/eviction policy and degraded modes           | quota scenario tests green                       | policy defaults to warn-only                      | W1-PERSIST-01.S5   |
| W1-PERSIST-01.S7 | Web Locks/BroadcastChannel multi-tab coordination  | multi-tab model tests green                      | single-tab mode remains the fallback              | W1-PERSIST-01.S6   |
| W1-PERSIST-01.S8 | RPO/RTO budget assertions + demo autosave wiring   | budgets asserted in tests; demo autosave visible | demo wiring isolated in demo package              | W1-PERSIST-01.S7   |

## W1-WORKER-01 tasks

### T1 — Worker RPC contract with progress, cancellation, and errors

- Files: `packages/formats/src/worker/rpc.ts` (new), `packages/formats/src/worker/rpc.test.ts` (new), `packages/formats/src/worker/types.ts` (new), `packages/formats/src/index.ts`
- Interfaces: `WorkerRpcClient`, `WorkerTask`, `TaskProgress`, `CancellationToken`, `WorkerErrorEnvelope`
- RED: RPC round trip carries progress events in order, cancellation resolves to a typed cancelled state, and worker errors surface as typed envelopes (never unhandled rejections) → GREEN: transferable-aware RPC layer on the W0-PLAT-01 worker platform
- Commit: `feat(formats): worker RPC contract`

### T2 — Move SVG/PPTX/PSD parse paths and WASM/trie loading off main thread

- Files: `packages/formats/src/worker/import-host.ts` (new), `packages/formats/src/svg` (worker entry, new), `packages/formats/src/pptx` (worker entry, new), `packages/formats/src/psd` (worker entry, new), tests (new)
- Interfaces: `importInWorker`
- RED: worker-hosted imports produce byte-identical documents to in-thread imports across the fixture corpus, with sanitizer symmetry per W1-SEC-01 → GREEN: host the first heavy parse paths and WASM/trie loading in the worker
- Commit: `feat(formats): worker-hosted SVG/PPTX/PSD import`

### T3 — Main-thread budget instrumentation and resource-release proof

- Files: `packages/formats/src/worker/budget.test.ts` (new), `packages/demo/src/demo-app/use-demo-file-handlers.ts`, long-task instrumentation (new)
- Interfaces: none
- RED: no import produces a main-thread task longer than 50 ms on the reference corpus; cancellation releases all worker resources (verified via post-cancel resource probes) → GREEN: chunked transfer, instrumentation, and cancellation cleanup
- Commit: `perf(formats): enforce 50 ms main-thread import budget`

| Slice           | Scope                                           | Proof                                       | Rollback / evidence                         | Merge prerequisite |
| --------------- | ----------------------------------------------- | ------------------------------------------- | ------------------------------------------- | ------------------ |
| W1-WORKER-01.S1 | RPC envelope + transferable codec               | round-trip codec tests green                | RPC unused by imports; revert worker dir    | none               |
| W1-WORKER-01.S2 | Progress/cancellation/error semantics + fuzzing | semantics suite + fuzz corpus green         | semantics additive to envelope              | W1-WORKER-01.S1    |
| W1-WORKER-01.S3 | Worker host + WASM/trie loading off main thread | host boot and loader tests green            | loaders keep in-thread fallback             | W1-WORKER-01.S2    |
| W1-WORKER-01.S4 | SVG parse path in worker                        | SVG fixture parity vs in-thread import      | per-format flag reverts to in-thread        | W1-WORKER-01.S3    |
| W1-WORKER-01.S5 | PPTX parse path in worker                       | PPTX fixture parity vs in-thread import     | per-format flag reverts to in-thread        | W1-WORKER-01.S4    |
| W1-WORKER-01.S6 | PSD parse path in worker                        | PSD fixture parity vs in-thread import      | per-format flag reverts to in-thread        | W1-WORKER-01.S5    |
| W1-WORKER-01.S7 | 50 ms budget instrumentation + demo wiring      | budget assertions green on reference corpus | instrumentation is observe-only until green | W1-WORKER-01.S6    |

## W1-PLAYBACK-01 tasks

### T1 — Unified PlaybackClock interface

- Files: `packages/playback/src/clock/playback-clock.ts` (new), `packages/playback/src/clock/playback-clock.test.ts` (new), `packages/playback/src/playback-controller.ts`, `packages/playback/src/index.ts`
- Interfaces: `PlaybackClock`, `createInteractiveClock`, `createOfflineClock`, `createPlayoutClock`
- RED: interactive, offline, and playout clocks satisfy one conformance suite (seek, rate change, pause semantics) on the W1-TIME-01 tick base → GREEN: unify the controller behind the single clock interface
- Commit: `feat(playback): unified playback clock interface`

### T2 — Precompiled appliers and indexed node access

- Files: `packages/playback/src/appliers.ts` (new), `packages/playback/src/node-index.ts` (new), tests alongside (new), `packages/playback/src/playback-dom.ts`
- Interfaces: `compileAppliers`, `NodeIndex`
- RED: hot-loop audit test proves zero `querySelector` and zero `JSON.parse` calls during playback ticks over the W1-SCENE-01 snapshot → GREEN: precompiled animation appliers with indexed node access
- Commit: `perf(playback): precompiled appliers and node index`

### T3 — Deterministic offline frame hashes

- Files: `packages/playback/src/offline-render.test.ts` (new), frame-hash harness (new)
- Interfaces: none
- RED: repeated offline renders of the reference document produce stable frame hashes per QG-REL-01 → GREEN: eliminate nondeterminism sources surfaced by the harness
- Commit: `test(playback): deterministic offline frame hashes`

## W1-RENDER-01 tasks

### T1 — Incremental RenderPlan with dirty-ID updates and parent index

- Files: `packages/renderer/src/core/render-plan.ts` (new), `packages/renderer/src/core/render-plan.test.ts` (new), `packages/renderer/src/core/dirty.ts`, `packages/renderer/src/index.ts`
- Interfaces: `RenderPlan`, `buildRenderPlan`, `applyDirtyIds`, `ParentIndex`
- RED: dirty-ID updates touch only affected plan nodes; parent index answers ancestor queries without traversal → GREEN: incremental RenderPlan over the W1-SCENE-01 snapshot
- Commit: `feat(renderer): incremental RenderPlan with dirty IDs`

### T2 — React region selectors and transient scrub/drag fast path

- Files: `packages/renderer/src/core/region-selectors.ts` (new), `packages/renderer/src/core/transient-path.ts` (new), tests alongside (new)
- Interfaces: `useRenderRegion`, `beginTransientUpdate`, `commitTransientUpdate`
- RED: scrub/drag updates bypass React reconciliation for untouched regions; commit reconciles exactly once → GREEN: region selectors plus the transient fast path
- Commit: `feat(renderer): region selectors and transient fast path`

### T3 — Render-count and frame-budget benchmarks

- Files: `packages/renderer/src/core/render-plan.bench.test.ts` (new), benchmark fixtures (new)
- Interfaces: none
- RED: render-count assertions and frame budgets fail at 200/500/1000 elements on the naive path → GREEN: incremental path meets both at all three sizes
- Commit: `test(renderer): render-count and frame budgets at scale`

## W1-RENDER-02 tasks

### T1 — Pattern and picture fills (close P3.G1)

- Files: `packages/model/src/broadset-fill.ts`, `packages/renderer/src/elements` (fill renderer file, new), fill tests (new)
- Interfaces: `PatternFill`, `PictureFill` (model fill union extension)
- RED: P3.G1 parity fixtures render pattern and picture fills identically across canvas and export paths, with assets resolved through W1-ASSET-01 and colors through W1-COLOR-01 → GREEN: implement both fill types in model and renderer
- Commit: `feat(renderer): pattern and picture fills`

### T2 — Filter/mask groundwork and DOM contract stewardship

- Files: `packages/renderer/src/core/contracts.ts`, `packages/renderer/src/dom/filter-mask.ts` (new), contract tests (new)
- Interfaces: `FilterMaskPrimitive`
- RED: DOM contract tests pin the rendered structure for filtered/masked nodes so later waves cannot drift silently → GREEN: groundwork primitives behind the pinned contract
- Commit: `feat(renderer): filter and mask groundwork`

### T3 — Accessible semantic mirror with reviewed baselines

- Files: `packages/renderer/src/dom/semantic-mirror.ts` (new), `packages/renderer/src/dom/semantic-mirror.test.ts` (new), visual/a11y baseline fixtures (new)
- Interfaces: `buildSemanticMirror`
- RED: semantic mirror exposes reading order, roles, and alternative text for every rendered element type; visual and accessibility baselines captured for review → GREEN: mirror implementation and reviewed, approved baselines
- Commit: `feat(renderer): accessible semantic mirror`

## W1-PLAYER-01 tasks

### T1 — Tree-shakeable @broadset/player package skeleton

- Files: `packages/player/package.json` (new), `packages/player/src/index.ts` (new), `packages/player/src/player.ts` (new), `packages/player/src/player.test.ts` (new)
- Interfaces: `createPlayer`, `PlayerHandle`, `PlayerLifecycle`
- RED: lifecycle conformance tests (load → ready → play → seek → dispose) against the RFC-12 contract on the W1-PLAYBACK-01 clock and W1-RENDER-01 RenderPlan → GREEN: package skeleton with side-effect-free module graph
- Commit: `feat(player): tree-shakeable player skeleton`

### T2 — Deterministic seek and CSP-safe sample embed

- Files: `packages/player/src/seek.test.ts` (new), `packages/player/examples/csp-embed` (new), embed smoke test (new)
- Interfaces: none
- RED: repeated seeks to identical ticks produce identical rendered states; the sample embed runs under a strict CSP with no inline script/style violations → GREEN: deterministic seek path and the CSP-safe embed
- Commit: `feat(player): deterministic seek and CSP-safe embed`

### T3 — Bundle-size gate for the player core

- Files: `packages/player/src/bundle-size.test.ts` (new), size-gate config (new)
- Interfaces: none
- RED: gzip size assertion fails above the ≤150 kB ceiling (target <100 kB) per QG-PERF-04 → GREEN: keep the core within budget via tree-shaking verification of every entry point
- Commit: `test(player): enforce QG-PERF-04 bundle ceiling`

## W1-HISTORY-01 tasks

### T1 — Named versions over persistence snapshots

- Files: `packages/editor/src/versioning/named-versions.ts` (new), `packages/editor/src/versioning/named-versions.test.ts` (new), `packages/editor/src/index.ts`
- Interfaces: `NamedVersion`, `createNamedVersion`, `renameVersion`, `restoreVersion`, `deleteVersion`, `diffVersions`
- RED: create/rename/restore/delete round trips over W1-PERSIST-01 snapshots; restore of an older version never destroys the current head without an explicit confirmation token → GREEN: versioning store actions over the persistence runtime
- Commit: `feat(editor): named versions over persistence snapshots`

### T2 — Visual recovery history UI with CT coverage

- Files: `packages/ui/src/modals/recovery-history.tsx` (new), `packages/ui/ct/recovery-history.ct.tsx` (new), `packages/ui/src/index.ts`, `packages/demo/src/demo-app` (menu wiring, new)
- Interfaces: `RecoveryHistoryModal`
- RED: Playwright CT covers create, rename, restore, delete, and version-diff flows across modal + canvas + layers regions; restore shows a HeroUI confirmation before overwriting current work → GREEN: HeroUI modal wired to the editor versioning actions and demoable from the demo app
- Commit: `feat(ui): recovery history modal with version flows`
