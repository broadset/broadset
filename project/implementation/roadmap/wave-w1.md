# Wave W1 — Deterministic, recoverable, worker-safe engine

W1 makes time, scene resolution, text, color, assets, rendering, playback, and persistence deterministic shared foundations. Every later authoring, interoperability, and broadcast wave builds on the contracts this wave verifies. All W1 initiatives run under the RFC decisions ratified in W0; no W1 behavior may depend on an undecided contract.

**Wave gate:** foundation-verified release tier; exact frame snapshots; deterministic scene/text/color output; worker import path; crash-safe autosave; pattern/picture fills; player core; performance budgets green with zero known data-loss/injection path.

## W1-TIME-01 — Ratified timebase and exact export sampling (L)

- **Dependencies:** W0-TIME-01
- **Definition:** Implement the ratified `FrameRate`/`Timebase` contract: frame, tick, and timecode conversions, drop-frame rules, and exact export sampling across `model`, `playback`, and `formats`.
- **Acceptance criteria:**
  - [ ] Exhaustive boundary and property tests cover frame, tick, and timecode conversions and drop-frame rules
  - [ ] Hour-long 29.97 and 59.94 fps sequences show zero drift by contract

## W1-TIME-02 — Keyframe addressing and compiled tracks (M)

- **Dependencies:** RFC-02/RFC-03
- **Definition:** Stable keyframe addressing plus compiled binary-search animation tracks, including the F-18 eased tuple path fix.
- **Acceptance criteria:**
  - [ ] Random seek produces values identical to sequential evaluation on compiled tracks
  - [ ] Easing tests are green, including the F-18 eased tuple path regression
  - [ ] Track identity tests are green

## W1-SCENE-01 — Resolved scene snapshot kernel (XL)

- **Dependencies:** RFC-01/RFC-07/RFC-10
- **Definition:** `ResolvedSceneSnapshot` resolves element hierarchy, page overrides, component and default data, coordinate spaces, and provenance for every downstream consumer.
- **Acceptance criteria:**
  - [ ] Property-based tests prove nested rotated coordinate round trips (meets QG-COR-01)
  - [ ] F-09 nested-paste coordinate/ID defect is fixed with a regression test
  - [ ] All coordinate consumers are migrated onto the snapshot

## W1-TEXT-01 — Shared HarfBuzz Unicode text layout (XL)

- **Dependencies:** W0-PLAT-01/RFC-10
- **Definition:** Shared HarfBuzz/Unicode text layout engine covering shaping, BiDi, grapheme segmentation, line breaks, font fallback, variable axes, and vertical writing directions.
- **Acceptance criteria:**
  - [ ] Multilingual golden layout metrics are identical across renderer and export consumers
  - [ ] Text content and run identity stay exact across all layout consumers (meets QG-COR-03)

## W1-COLOR-01 — Working-space color pipeline (L)

- **Dependencies:** RFC-09/RFC-10
- **Definition:** Ratified working-space color pipeline with float channels, profile transforms, linear-light premultiplied compositing, and the SDR/HDR policy.
- **Acceptance criteria:**
  - [ ] Color-chart oracle tests pass (meets QG-COR-02)
  - [ ] Profile round-trip tests pass
  - [ ] Gamut and alpha compositing tests pass

## W1-SEC-01 — Shared safe-markup sanitizer policy (L)

- **Dependencies:** RFC-10/W0-SEC-01
- **Definition:** Shared context-specific safe-markup policy with iterative bounded AST processing and sanitizer symmetry across capture, render, and export.
- **Acceptance criteria:**
  - [ ] Sanitizer test suite meets its mutation score target
  - [ ] Depth/size hostile corpus passes with bounded processing (meets QG-SEC-01)
  - [ ] Trusted Types preparation is in place

## W1-ASSET-01 — Content-addressed asset store (L)

- **Dependencies:** RFC-08/W0-PLAT-01
- **Definition:** Content-addressed storage for font, image, video, and ICC blobs with metadata extraction, deduplication, integrity hashes, and license/provenance fields.
- **Acceptance criteria:**
  - [ ] Corrupt, missing, and duplicate asset tests pass (meets QG-SEC-01)
  - [ ] Asset resolution is deterministic

## W1-PERSIST-01 — Crash-safe local persistence runtime (XL)

- **Dependencies:** RFC-08/W1-ASSET-01
- **Definition:** IndexedDB journal/head persistence with an OPFS/blob adapter, checksummed snapshots, compaction, quota/eviction handling, and Web Locks/BroadcastChannel multi-tab coordination.
- **Acceptance criteria:**
  - [ ] Crash injection at every write boundary loses no committed data
  - [ ] RPO/RTO budgets are met and asserted in tests
  - [ ] Multi-tab model tests prove correct Web Locks/BroadcastChannel coordination

## W1-WORKER-01 — Worker import and RPC contract (XL)

- **Dependencies:** W0-PLAT-01/W1-SEC-01
- **Definition:** Worker RPC contract with progress, cancellation, and error semantics; moves the first heavy SVG/PPTX/PSD parse paths and WASM/trie loading off the main thread.
- **Acceptance criteria:**
  - [ ] No import produces a main-thread task longer than 50 ms
  - [ ] Cancellation releases all worker resources

## W1-PLAYBACK-01 — Unified playback clock interface (L)

- **Dependencies:** W1-TIME-01/W1-SCENE-01
- **Definition:** Interactive, offline, and playout clocks unified behind one playback interface, with precompiled animation appliers and indexed node access.
- **Acceptance criteria:**
  - [ ] Zero querySelector or JSON-parse calls in playback hot loops
  - [ ] Offline rendering produces deterministic frame hashes (meets QG-REL-01)

## W1-RENDER-01 — Incremental RenderPlan rendering (L)

- **Dependencies:** W1-SCENE-01/W1-PLAYBACK-01
- **Definition:** Incremental RenderPlan with dirty-ID updates, a parent index, React region selectors, and a transient scrub/drag fast path.
- **Acceptance criteria:**
  - [ ] Render-count assertions pass at 200, 500, and 1000 elements
  - [ ] Frame budgets are met at 200, 500, and 1000 elements

## W1-RENDER-02 — Pattern fills and semantic mirror (L)

- **Dependencies:** W1-COLOR-01/W1-ASSET-01
- **Definition:** Pattern and picture fills, filter/mask groundwork, an accessible semantic mirror, and DOM contract stewardship in the renderer.
- **Acceptance criteria:**
  - [ ] P3.G1 pattern/picture fill parity gap is closed
  - [ ] Visual baselines are reviewed and approved
  - [ ] Accessibility baselines are reviewed and approved
- **User-visible:** yes — pattern and picture fills render on the authoring canvas and in output.

## W1-PLAYER-01 — Tree-shakeable player skeleton (L)

- **Dependencies:** W1-PLAYBACK-01/W1-RENDER-01/RFC-12
- **Definition:** Tree-shakeable `@broadset/player` package skeleton consuming RenderPlan output with the exact lifecycle and timebase contract.
- **Acceptance criteria:**
  - [ ] Player core stays within the ≤150 kB gzip ceiling (meets QG-PERF-04)
  - [ ] Seek is deterministic across repeated runs
  - [ ] A CSP-safe sample embed works

## W1-HISTORY-01 — Named versions and recovery history (M)

- **Dependencies:** W1-PERSIST-01
- **Definition:** Named local document versions and a visual recovery history built over persistence snapshots.
- **Acceptance criteria:**
  - [ ] CT covers create, rename, restore, delete, and version-diff flows
  - [ ] Restore never overwrites current work without explicit confirmation
- **User-visible:** yes — authors create, browse, and restore named versions from a visual recovery history.
