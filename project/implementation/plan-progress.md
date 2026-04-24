# Master Roadmap Task Board

Status: active per-task tracker for [plan.md](./plan.md).

This file is the single per-task tracker for the unfinished implementation
roadmap.

Use it like this:

- `plan.md` owns sequencing and phase-level status
- this file owns task-by-task execution tracking
- companion plans own acceptance criteria, detailed scope, and risk notes
- when a task changes state, update this file and [plan.md](./plan.md) in the
  same change

As of 2026-04-23:

## Shared foundation

### Phase 0 — Shared decisions and spec lock

Source of truth: [plan.md](./plan.md), [io-prereqs-plan.md](./io-prereqs-plan.md)

- [x] P0.1 Ratify IO-D-01 through IO-D-18 in [decisions.md](./decisions.md)
- [ ] P0.2 Finish pre-emptive model spec updates for every remaining Phase 1 field shape
- [x] P0.3 Land the importer security contract baseline in [../spec/formats/spec.md](../spec/formats/spec.md)
- [x] P0.4 Land the importer contract baseline updates in [../spec/formats/spec.md](../spec/formats/spec.md)
- [ ] P0.5 Close remaining plan-level formats-spec updates (`no-sidecar`, `no-silent-drops`)

### Phase 1 — Shared model additions

Source of truth: [io-prereqs-plan.md](./io-prereqs-plan.md)

- [x] P1.1 Unit utilities plus `parseLength`
- [x] P1.2 Importer security contract spec update
- [x] P1.3 `BroadsetColor` discriminated union and migration path (3a types `c79baa1`, 3b migrator `20c2c6e`, 3c consumer migration `c4b942e`)
- [x] P1.4 Content-hash identity field
- [x] P1.5 Stroke enhancements
- [x] P1.6 Structured filter primitives (`FilterStack`) (6a types + resolver `aef2537`; 6b field flip + migrator + consumer cascade `20e15c9`)
- [x] P1.7 Gradient enhancements (7a `startAngle` `ac89992`; 7b stop-color flip via 3c `c4b942e`; 7b mods `f836609`)
- [x] P1.8 `BroadsetFill` discriminated union (8a types `4b29e4b`; 8b migrator `e06ba43`; 8c consumer cascade `a4dce68`)
- [x] P1.9 Text model (`string | TextBody`) (9a types `4dfd2d8`; 9b field flip + dual-path consumer cascade `e314388`; 9c end-to-end renderer integration test `4ae4160`)
- [x] P1.10 Text-on-path reference
- [x] P1.11 Text fidelity fields
- [x] P1.12 Model-level script rejection
- [x] P1.13 Extensions typing registry
- [x] P1.14 Per-format dirty flag and editor middleware
- [x] P1.15 Page, canvas, and document additions (`notes`, bleed/trim/safe-area, metadata, output intent)
- [x] P1.16 Importer contract spec closeout

### Phase 2 — Shared libraries and `_shared` modules

Source of truth: [plan.md](./plan.md), [io-prereqs-plan.md](./io-prereqs-plan.md)

- [x] P2.1 `_shared/color/` (culori-backed `toRgb` / `gamutMap` / `applyMods` `7bb8a84`; lcms-wasm / ICC / CMYK deferred to P4)
- [x] P2.2 `_shared/fonts/` (fontkit-backed `getFontMetrics` / `readEmbedPermission` / `getGlyphToUnicodeMap` `f59ee41`; `resolveFont` / `listAvailable` / `subsetFont` deferred to P4)
- [x] P2.3 `_shared/text-layout/` (linebreak + bidi-js: `breakLines` / `analyzeBidi` `e6ef4e2`; harfbuzzjs + `wrapRuns` / `shapeRuns` deferred until first non-Latin caller)
- [x] P2.4 `_shared/xmp/` (`readBroadsetXmp` / `writeBroadsetXmp` via fast-xml-parser `962bf21`)
- [x] P2.5 `_shared/fingerprint/` (`fingerprintElement` via xxhash-wasm `41894a9`)
- [x] P2.6 `_shared/reconcile/` (`reconcile` four-bucket result via microdiff `e44618f`)
- [x] P2.7 `_shared/shape-classifier/` (`classifyPath` no external deps `ac8bf9f`)
- [x] P2.8 `_shared/sanitize/` (`sanitizeSvg` via dompurify `68572b9`)
- [x] P2.9 Bundle-size assertion coverage for heavy lazy-loaded paths (static-import scanner for lcms-wasm / harfbuzzjs `0bb2435`)

### Phase 3 — Renderer refactor

Source of truth: [plan.md](./plan.md), [renderer-refactor-plan.md](./renderer-refactor-plan.md)

- [x] P3.0 Contract cleanup
- [x] P3.1 Internal layer split
- [x] P3.2 Keyed reconciliation
- [x] P3.3 Semantic renderers and safe builders
- [x] P3.4 Runtime services
- [x] P3.5 Broadset adapter migration
- [x] P3.6 Spec closure and hardening

### Phase 4 — Shared asset pipeline

Source of truth: [plan.md](./plan.md), [io-prereqs-plan.md](./io-prereqs-plan.md)

- [x] P4.1 Font asset type (discriminated union on `kind`; `FontAsset` + `format`/`postScriptName`/`familyName`/`subsetRanges?` `d3f091e`)
- [x] P4.2 Image assets normalized to bytes plus metadata (required `width`/`height` on `ImageAsset`; source union unchanged as bytes transport `c5cd226`)
- [x] P4.3 ICC profile preservation on image assets (`ImageAsset.iccProfileAssetId?` matches `document.outputIntent.iccProfileAssetId`)
- [x] P4.4 `icc-profile` asset type (`IccProfileAsset` variant on `Asset` union; `colorSpace` ∈ `{rgb, cmyk, gray, lab}`; optional description/identifier)
- [x] P4.5 Shared font subsetting pipeline (`_shared/fonts/subset.ts` → `subsetFont(bytes, codepoints)` via fontkit; codicon TTF fixture)
- [x] P4.6 Font embed-permission surface (`_shared/fonts/embed-policy.ts` → `resolveEmbedDecision(permission)` — refuse restricted, warn preview-print)
- [x] P4.7 Content-hash asset deduplication on import (`_shared/asset-dedup/` `AssetDeduplicator` + `contentHashHex` via xxhash-wasm)

## Interleaved shared tasks

Source of truth: [plan.md](./plan.md), [io-prereqs-plan.md](./io-prereqs-plan.md), [io-prereqs-ui-features-plan.md](./io-prereqs-ui-features-plan.md)

- [x] I5.1 Land the PSD-required io-prereqs Phase 5 UI slice (`FormatExportOptionsModal` + `FormatImportWarningsModal` in `packages/ui/src/modals/`; shared across PDF/SVG/PPTX tracks)
- [x] I6.1 Land the PDF-required io-prereqs Phase 5 UI slice (shared `FormatExportOptionsModal` / `FormatImportWarningsModal` from I5.1; PDF-specific `supportedFields` covered in format-modals test)
- [x] I7.1 Land the SVG-required io-prereqs Phase 5 UI slice (shared modals; SVG label coverage in test)
- [x] I8.1 Land the PPTX-required io-prereqs Phase 5 UI slice (shared modals; PPTX label coverage in test)
- [x] I6.2 Introduce the shared io-prereqs Phase 6 testing infrastructure on first PSD need (`_shared/test-infrastructure/` ships `assertReImportableBy` + `runChainRoundTrip` + `assertPreservedBlobSurvives`; PSD chain test wires the harness)

## Format tracks

### Phase 5 — PSD track

Source of truth: [plan.md](./plan.md), [psd-support-plan.md](./psd-support-plan.md)

- [x] P5.0 PSD spec and scope lock (feature matrix + standards-only rule + `Format Round-Trip Metadata` cross-format requirement in `formats/spec.md`)
- [x] P5.1 PSD types and de-risking spike (`packages/formats/src/psd/types.ts` + registry wiring; `xmp-roundtrip-spike.test.ts` verifies `ag-psd` XMP round-trip in-process; decision logged)
- [x] P5.2 PSD export parity rebuild (groups via parentId tree, rotation composition, TextBody → styleRuns, `broadset:` XMP packet; deeper items in `project/spec/formats/psd.md` §Spec Gaps)
- [x] P5.3 PSD export beyond prior art — P5.3a native vector shape layers (rectangle/ellipse `vectorFill` + `vectorMask`); P5.3b inner shadow from `inset` box-shadow + stroke layer effect from border; P5.3c linked smart object GUID preservation via `extensions.psd.smartObject`. Remaining sub-items recorded in `project/spec/formats/psd.md` §Spec Gaps
- [x] P5.4a PSD import fast path (`XMP + additionalInfo`) — `readDocumentXmpPacket()` recovers document id + element ids from the `broadset:` packet; hydrates `extensions.psd.roundTrip` (`b4b4dfa`)
- [x] P5.4b PSD arbitrary third-party import — existing `importPsd` layer-walker handles third-party PSDs; deeper extraction (layer comps, adjustment layers) deferred to Spec Gaps
- [x] P5.5 PSD reconciliation (`reconcilePsd` wraps `_shared/reconcile`; `dirtyElementIds` for dirty-flag discipline)
- [x] P5.6 PSD tests and UI wiring (chain round-trip test via shared `runChainRoundTrip` + `assertReImportableBy`; UI modals landed via I5.1)

### Phase 6 — PDF track

Source of truth: [plan.md](./plan.md), [pdf-support-plan.md](./pdf-support-plan.md)

- [x] P6.0 PDF spec and scope lock (feature matrix + standards-only round-trip + `broadset:` XMP + `/BSET` marked-content + CMYK/Lab/Gray + OCGs per page + page-boxes + dirty-flag + chain round-trip + reconciliation + security + preflight)
- [ ] P6.1 PDF types and dependency swap
- [ ] P6.2 PDF export parity rebuild
- [ ] P6.3 PDF export beyond prior art
- [ ] P6.4a PDF import fast path (`XMP + marked content`)
- [ ] P6.4b PDF arbitrary third-party import
- [ ] P6.5 PDF reconciliation
- [ ] P6.6 PDF tests and UI wiring

### Phase 7 — SVG track

Source of truth: [plan.md](./plan.md), [svg-support-plan.md](./svg-support-plan.md)

- [ ] P7.0 SVG spec and scope lock
- [ ] P7.1 SVG types and architecture
- [ ] P7.2 SVG export parity and critical bug fix
- [ ] P7.3 SVG export beyond prior art
- [ ] P7.4a SVG import fast path (`metadata + data-bs-*`)
- [ ] P7.4b SVG arbitrary third-party import
- [ ] P7.5 SVG reconciliation
- [ ] P7.6 SVG tests and UI wiring

### Phase 8 — PPTX track

Source of truth: [plan.md](./plan.md), [pptx-support-plan.md](./pptx-support-plan.md)

- [ ] P8.0 PPTX spec and scope lock
- [ ] P8.1 PPTX types, package architecture, and parser swap
- [ ] P8.2 PPTX export parity rebuild
- [ ] P8.3 PPTX export beyond prior art
- [ ] P8.4a PPTX import fast path (custom XML plus shape tags)
- [ ] P8.4b PPTX arbitrary third-party import
- [ ] P8.5 PPTX reconciliation
- [ ] P8.6 PPTX tests and UI wiring

### Phase 9 — PDF/A-2b followup

Source of truth: [plan.md](./plan.md), [pdf-pdfa-compliance-plan.md](./pdf-pdfa-compliance-plan.md)

- [ ] P9.0 PDF/A audit and spec update
- [ ] P9.1 Font embedding totality
- [ ] P9.2 Color-management and output-intent enforcement
- [ ] P9.3 Forbidden-feature gating
- [ ] P9.4 PDF/A metadata and trailer correctness
- [ ] P9.5 Validator integration and CI
- [ ] P9.6 Round-trip support for PDF/A exports

## Supporting tracks

### Parallel Track A — Coverage reporting

Source of truth: [plan.md](./plan.md), [coverage-reporting.md](./coverage-reporting.md)

- [ ] A.1 Wire `@vitest/coverage-v8` into shared Vitest config
- [ ] A.2 Add exclusion rules and per-package overrides
- [ ] A.3 Add root coverage scripts and ignore rules
- [ ] A.4 Capture and document the baseline report
- [ ] A.5 Update docs and testing guidance
- [ ] A.6 Evaluate a follow-up threshold proposal from baseline numbers

### Parallel Track B — Cross-region CT audit

Source of truth: [plan.md](./plan.md), [cross-region-ct-audit.md](./cross-region-ct-audit.md)

- [ ] B.1 Inventory cross-region scenarios in `project/spec/editor/**`
- [ ] B.2 Inventory cross-region scenarios in `project/spec/ui/**`
- [ ] B.3 Inventory cross-region scenarios in `project/spec/demo/**`
- [ ] B.4 Consolidate the gap list
- [ ] B.5 Land missing CT coverage in focused batches
- [ ] B.6 Run final regression and gate closeout

## Deferred structural track

### Deferred Track C — Package split

Source of truth: [plan.md](./plan.md), [package-split.md](./package-split.md)

- [ ] C.1 Prep and API freeze
- [ ] C.2 Formats split
- [ ] C.3 Editor split
- [ ] C.4 Optional UI tokens split
- [ ] C.5 Cleanup and hardening