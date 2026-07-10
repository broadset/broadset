# Wave W3 — Interoperability and delivery excellence

W3 makes Broadset a trustworthy bridge to real professional ecosystems and a deterministic delivery tool. Advertised imports become honest about editability while preserving appearance, exports validate in the canonical external tools, and the player, timed media, Lottie, and OGraf surfaces gain explicit conformance evidence backed by an auditable fixture corpus.

**Wave gate:** Professional Authoring 1.0. Advertised imports are honest about editability and preserve appearance; exports validate in canonical tools; player, timed media, Lottie, and OGraf have explicit conformance evidence. **External evidence gates:** Photoshop, PowerPoint on Windows, and canonical PDF viewer manual validation protocols (owner: maintainer).

## W3-CORPUS-01 — Interop fixture corpus manifest (L)

- **Dependencies:** W0-GOV-01
- **Definition:** Licensed, public, and generated fixture corpus with a manifest recording hashes, provenance, feature assertions, expected warnings, and an update policy.
- **Acceptance criteria:**
  - [ ] CI fails when any referenced golden or fixture is missing
  - [ ] Every corpus entry's license and fetch instructions are auditable from the manifest

## W3-RECON-01 — Import report and reconciliation actions (XL)

- **Dependencies:** W2-CANVAS-01/W3-CORPUS-01
- **Definition:** Import report separating appearance and editability scores, with per-element confidence, side-by-side diff, fallback visibility, and reconciliation actions.
- **Acceptance criteria:**
  - [ ] No import drops content silently; every element is mapped, preserved, or warned (QG-INT-02)
  - [ ] Every reconciliation decision is undoable
  - [ ] Import warnings are accessible and exportable
- **User-visible:** yes — authors see appearance and editability scores, per-element diffs, and actionable reconciliation choices after every import.

## W3-PSD-01 — Third-party PSD completeness (XL)

- **Dependencies:** W1-COLOR-01/W3-CORPUS-01
- **Definition:** Third-party PSD completeness: color modes and profiles, 16/32 bits per channel, effects, clipping and adjustment layers, smart-object and opaque preservation, and BsPs.
- **Acceptance criteria:**
  - [ ] All P5 and CFIO PSD gap rows are closed for the advertised support matrix (QG-INT-01)
  - [ ] Profile-managed color stays within ΔE00 budgets on corpus fixtures (QG-COR-02)
  - [ ] Photoshop manual validation protocol is documented; execution is owned by the maintainer external evidence gate

## W3-PDF-01 — Rich PDF import fidelity (XL)

- **Dependencies:** W1-TEXT-01/W1-WORKER-01/W3-CORPUS-01
- **Definition:** Rich PDF import covering page boxes, text and CMaps, images, paths, CTMs, clipping, resources, and per-page mapping, guarded by pre-parse caps.
- **Acceptance criteria:**
  - [ ] P6.4b, P6.G1, and P6.G3 are closed
  - [ ] Every import produces separate editability and appearance scores
  - [ ] Text content and run identity are exact on CMap corpus fixtures (QG-COR-03)
  - [ ] Pre-parse caps bound every input before full parsing (QG-SEC-01)

## W3-PDF-02 — PDF and PDF-A output conformance (L)

- **Dependencies:** W1-COLOR-01/W3-CORPUS-01
- **Definition:** PDF and PDF/A output with real profiles, an explicit CMYK/Lab/spot support policy, font totality, veraPDF validation, and a canonical viewer matrix.
- **Acceptance criteria:**
  - [ ] P6.G2 and P9.G1–G3 are resolved in the support matrix and validators
  - [ ] veraPDF passes for every advertised PDF/A row (QG-INT-01)

## W3-SVG-01 — Full SVG fidelity and reuse policy (L)

- **Dependencies:** W1-SEC-01/W1-WORKER-01/W3-CORPUS-01
- **Definition:** Full CSS, defs, reuse, and transform fidelity, a structural use/symbol policy, an animated-SVG strategy, and safe fallback.
- **Acceptance criteria:**
  - [ ] P7.G1–G3 are resolved
  - [ ] Raster parity holds against Chromium, WebKit, and Firefox references
  - [ ] Unsupported content falls back safely with a warning, never a silent drop (QG-INT-02)

## W3-PPTX-01 — PPTX inheritance and theme fidelity (XL)

- **Dependencies:** W1-TEXT-01/W3-CORPUS-01
- **Definition:** Layout and master inheritance, groups and placeholders, text and theme fidelity, tables and charts as native or labeled fallback, and a large-deck worker path.
- **Acceptance criteria:**
  - [ ] All P8 and CFIO PPTX gap rows are closed (QG-INT-01)
  - [ ] Exported decks validate against the OOXML XSD
  - [ ] LibreOffice round-trip evidence is recorded in CI
  - [ ] PowerPoint on Windows manual protocol is documented; execution is owned by the maintainer external evidence gate

## W3-MOTION-01 — Reusable motion sequences and behaviors (XL)

- **Dependencies:** W2-TIMELINE-01/W2-AUDIO-01/RFC-04
- **Definition:** Reusable sequences and presets, text animators, behaviors, repeaters and stagger, onion skin, motion blur, and time remap, delivered under approved contracts.
- **Acceptance criteria:**
  - [ ] Procedural motion uses deterministic seeds and replays identically
  - [ ] Bake-to-keyframes reproduces live behavior exactly
  - [ ] Exported output matches live playback (export parity)
  - [ ] Authoring and playback performance budgets hold
- **User-visible:** yes — authors gain motion presets, text animators, onion skin, and motion blur directly in the timeline.

## W3-MOTION-02 — Typed expression authoring (XL)

- **Dependencies:** RFC-05/W2-DATA-01/W3-MOTION-01
- **Definition:** Typed expression and procedural authoring UI with cycle diagnostics, a dependency graph, sandboxed evaluation, and value tracing.
- **Acceptance criteria:**
  - [ ] Evaluation is total and cycle-safe; no expression can hang or crash the editor
  - [ ] Expression replay is deterministic
  - [ ] Editor diagnostics are fully keyboard-operable (QG-A11Y-01)

## W3-VIDEO-01 — Deterministic video and sequence export (XL)

- **Dependencies:** W1-TIME-01/W1-PLAYER-01/W2-AUDIO-01
- **Definition:** Deterministic MP4, WebM, GIF, PNG, and EXR sequence export with capability detection, exact timestamps, audio mux policy, alpha policy, and a progress/cancel/resume queue.
- **Acceptance criteria:**
  - [ ] Published codec matrix is verified by media inspection of produced files
  - [ ] A/V duration, frame, and frame-hash tests pass with deterministic offline renders (QG-REL-01)
  - [ ] Wall-clock and media-duration budgets hold
- **User-visible:** yes — authors export video and image sequences with visible progress, cancel, and resume.

## W3-LOTTIE-01 — Lottie import and export (XL)

- **Dependencies:** W1-SCENE-01/W3-CORPUS-01
- **Definition:** Lottie and dotLottie import and export with an explicit supported-feature matrix, theming, fallback, and a validator.
- **Acceptance criteria:**
  - [ ] Perceptual diff is ≤1% at the approved threshold on the supported corpus
  - [ ] Unsupported features produce warnings, never silent drops (QG-INT-02)

## W3-FIGMA-01 — Figma import and update reconciliation (XL)

- **Dependencies:** W2-COMP-01/W2-VAR-01/W3-RECON-01
- **Definition:** Figma import and update reconciliation mapped to components, variables, text, and assets, honoring auto-layout and constraints where representable.
- **Acceptance criteria:**
  - [ ] Updates preserve local edits according to the documented policy
  - [ ] Corpus coverage for mapped features passes in CI
  - [ ] Conflict UI presents every non-mergeable change

## W3-OGRAF-01 — OGraf package interchange (XL)

- **Dependencies:** W1-PLAYER-01/W2-DATA-01/RFC-12
- **Definition:** OGraf package export and import covering manifest and GDD, lifecycle, steps, assets and fonts, thumbnails, and a validator.
- **Acceptance criteria:**
  - [ ] Official OGraf schema validation is green (QG-BCAST-01)
  - [ ] Two independent renderer/controller validations are recorded

## W3-PLAYER-01 — Versioned player runtime (XL)

- **Dependencies:** W3-OGRAF-01/W3-VIDEO-01
- **Definition:** Versioned player API with lazy feature modules, exact seek, state, and data lifecycle, sandbox and CSP hardening, and diagnostics.
- **Acceptance criteria:**
  - [ ] Size tiers are enforced; the optional player core stays within its gzip budget (QG-PERF-04)
  - [ ] Deterministic conformance suite passes
  - [ ] Showcase embed runs the shipped player

## W3-QE-01 — Two-tier visual CI and producer matrix (XXL)

- **Dependencies:** W3-PSD-01/W3-PDF-01/W3-PDF-02/W3-SVG-01/W3-PPTX-01/W3-LOTTIE-01/W3-FIGMA-01/W3-PLAYER-01
- **Definition:** Two-tier visual CI over renderer rasters and canonical-tool export rasters, plus the producer matrix and manual validation protocols.
- **Acceptance criteria:**
  - [ ] 100% of advertised producer/tool rows pass (QG-INT-01)
  - [ ] p95 and worst-case visual gates are enforced in CI
  - [ ] Baseline updates are per-fixture and reviewed; no wholesale baseline update is possible
