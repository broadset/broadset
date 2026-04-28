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
- [x] P0.2 Finish pre-emptive model spec updates for every remaining Phase 1 field shape — all 12 shapes covered inline with each Phase 1 commit per CONTRIBUTING.md §Backpropagate Into Specs. Shape → spec home: TextBody → `element.md` "Structured Text Model"; BroadsetColor → `style.md` "Color values use `BroadsetColor`"; BroadsetFill → `style.md` "Structured Fill"; FilterStack → `style.md` "Structured Filter Primitives"; stroke arrow ends → `style.md` "Stroke Arrow Endings"; strokeMiterlimit → `style.md` "SVG Stroke and Fill Properties"; extensions namespacing + dirty flag → `element.md` "Format Extensions Registry (IO-D-11)"; content hash → `element.md` "Content-Hash Identity"; bleed/trim/safeArea → `spec.md` "Prepress Insets"; document.metadata → `spec.md` "Document Metadata"; document.outputIntent → `spec.md` "Document Output Intent"
- [x] P0.3 Land the importer security contract baseline in [../spec/formats/spec.md](../spec/formats/spec.md)
- [x] P0.4 Land the importer contract baseline updates in [../spec/formats/spec.md](../spec/formats/spec.md)
- [x] P0.5 Close remaining plan-level formats-spec updates (`no-sidecar`, `no-silent-drops`) — dedicated `### Requirement: No Sidecar Files (IO-D-17)` + `### Requirement: No Silent Drops (IO-D-18)` blocks landed in `project/spec/formats/spec.md` with scenarios + acceptance criteria cross-referencing the Importer Contract and Format Round-Trip Metadata requirements

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
- [x] P6.1 PDF types and dependency swap (`@libpdf/core@^0.3.4` → `pdf-lib@^1.17.1`; `pdfjs-dist@^5.6.205` + `@pdf-lib/fontkit@^1.1.1` added; `pdf/types.ts` with `PdfExportOptions`/`PdfImportOptions`/`PdfRoundTripMetadata`/`MarkedContentTag`/`ColorSpaceChoice`/`BroadsetXmpPacket`; `importPdfDocument` registered; 358 formats tests stay green)
- [x] P6.2 PDF export parity rebuild (`pdf/export/geometry.ts` with `composeCanvasAbsolutePosition` + `elementRotationBrackets`; `pdf/export/rectangle.ts` with `buildRoundedRectPath` kappa-based per-corner rounded-rect; `pdf/export/clip.ts` with inset/circle/ellipse/polygon clip-path → native PDF clipping operators; 14 new P6.2 acceptance tests)
- [x] P6.3 PDF export beyond prior art (`pdf/export/marked-content.ts` registers per-element `/BSET` property dicts in page `/Resources /Properties`; `pdf/export/xmp.ts` attaches `broadset:` XMP packet with per-element fingerprints via `_shared/fingerprint/`; `pdf/export/page-boxes.ts` sets `/MediaBox` + `/BleedBox` + `/TrimBox` + `/ArtBox` from `canvas.bleed` + `canvas.safeArea`; `pdf/export/ocg.ts` registers one OCG per page in `/OCProperties`. Real shading-pattern gradients, CMYK/Lab/Gray/spot + ICC emission, font subsetting via `@pdf-lib/fontkit`, and per-element OCG membership recorded as Spec Gaps.)
- [x] P6.4a PDF import fast path (`XMP + marked content`) — `pdf/import/parse.ts` (`loadPdf`, `readDocumentXmp`, `collectMarkedContentTags`, `readRoundTripMetadata`); `pdf/import/fast-path.ts` (`hydrateDocumentFromFastPath` turns XMP id + `/BS_` tags into a `BroadsetDocument` with element ids + types); `pdf/import.ts` wires real `canRoundTrip` / `importPdfDocument` / `readPdfRoundTripMetadata` via pdf-lib `PDFDocument.load(bytes, { ignoreEncryption: true })`. Element geometry recovery lands in P6.4b.
- [x] P6.4b PDF arbitrary third-party import — `pdf/import/operators.ts` extracts text-showing operators (`Tj`) from every page's FlateDecode-decompressed content stream, supporting both parenthesised-literal and hex-encoded string forms. `pdf/import/third-party.ts` maps extracted text items to Broadset `text` elements with approximate position / size / font-size. `importPdfDocument` prefers the P6.4a XMP fast-path when present and falls through to third-party extraction otherwise. Raster images, vector shapes, and rich-text runs tracked as Spec Gap in `project/spec/formats/pdf.md`.
- [x] P6.5 PDF reconciliation — `pdf/roundtrip.ts` wraps `_shared/reconcile` with a `PdfReconcileInput`; exposes `reconcilePdf(input) → ReconcileResult` (four-bucket diff: modifications / additions / deletions / recoveredByHash) and `dirtyElementIds(doc)` for dirty-flag discipline on re-export.
- [x] P6.6 PDF tests and UI wiring — `pdf/chain-round-trip.test.ts` covers the headline `source → export → import` loop end-to-end via shared `assertReImportableBy`; `importPdfDocument` registered in `@broadset/formats` barrel + demo `formatBridge.importDocument` dispatcher (lazy-loaded through `loadFormats`); demo test covers the `.pdf` import path. External-tool fixture corpus (Illustrator / Acrobat / InDesign / Figma / Preview / Word / LaTeX) tracked as Spec Gap; UI modals reuse `FormatExportOptionsModal` + `FormatImportWarningsModal` landed in I5.1/I6.1.

### Phase 7 — SVG track

Source of truth: [plan.md](./plan.md), [svg-support-plan.md](./svg-support-plan.md)

- [x] P7.0 SVG spec and scope lock (new `project/spec/formats/svg.md` with feature matrix + standards-only metadata/tagging/sanitization requirements; `web-vector.md` trimmed to HTML-standalone only; `spec.md` sub-specs split)
- [x] P7.1 SVG types and architecture (new `packages/formats/src/svg/` module with `types.ts` + Zod registration per IO-D-11; public API `exportSvgString` / `exportSvgDocument` / `importSvgDocument` / `canRoundTrip`; `svgpath` + `css-tree` + `transformation-matrix` deps added; architecture.md updated; metadata-roundtrip spike proves DOMParser preserves `<metadata>` RDF + namespaced attrs)
- [x] P7.2 SVG export parity and critical bug fix (recursive `<g>` with parentId-tree children; full stroke coverage — cap/join/miterlimit/dasharray/dashoffset + arrow markers; group transforms compose on `<g>`; opaque `svg`-type payloads routed through `_shared/sanitize` on re-emission; `<linearGradient>` / `<radialGradient>` parse from `<defs>` on import with stops + derived angle; animations remain discarded per IO-D-16)
- [x] P7.3 SVG export beyond prior art (data-bs-id/kind + broadset:content-hash on every element via `fingerprintElement`; document `<metadata>` RDF packet under shared IO-D-08 namespace with canvas unit/dpi + per-element seq + originalColor + conic spec; conic gradient visual fallback to linear approximation; exportSvgString/exportSvgDocument promoted to async; demo formatBridge awaits). Font embedding / subsetting deferred to P7.6 when asset pipeline calls arrive.
- [x] P7.4a SVG import fast path (`metadata + data-bs-*`) (`svg/metadata.ts` parses RDF packet when the broadset namespace is declared on root; `importSvgDocument` detects fast path via namespace + metadata presence; hydrates document.id, canvas unit/dpi, per-element ids from data-bs-id, and applies originalColor / conic gradient overrides from metadata; every hydrated element carries `extensions.svg.dirty === false` per IO-D-11)
- [x] P7.4b SVG arbitrary third-party import (in-place DOM sanitizer strips `<script>` / `on*=` / `javascript:` URLs / `<foreignObject>` — preserves `<use>` / `<symbol>` / vendor elements that DOMPurify's profile would over-strip; `<use>`/`<symbol>` dereference with cycle detection + bounded depth cap; basic CSS `<style>` block resolution with type/class/id selectors respecting inline-style precedence; tool-specific namespace warnings for `sodipodi:` / `inkscape:` / `ai:`; unknown vendor elements preserved as opaque `svg`-type per IO-D-18)
- [x] P7.5 SVG reconciliation (`svg/roundtrip.ts` — `reconcileSvg({preserved, currentSvg})` wraps `_shared/reconcile` with SVG-specific normalisation; metadata packet extended to carry `name`/`width`/`height` so text + group geometry round-trips cleanly; `dirtyElementIds` helper for dirty-flag discipline on re-export)
- [x] P7.6 SVG tests and UI wiring (chain round-trip test with zero-drift reconcile; browser-parseable via DOMParser; synthetic Illustrator / Inkscape / Figma / hand-authored `<use>` fixtures; hostile-SVG security suite — billion-laughs / `<use>` depth bomb / multi-vector; `FormatExportOptionsModal` extended with `fontEmbedding` + `includeMetadata` + `includeElementTagging` SVG-specific fields)

### Phase 8 — PPTX track

Source of truth: [plan.md](./plan.md), [pptx-support-plan.md](./pptx-support-plan.md)

- [x] P8.0 PPTX spec and scope lock
- [x] P8.1 PPTX types, package architecture, and parser swap
- [x] P8.2 PPTX export parity rebuild
- [x] P8.3 PPTX export beyond prior art
- [x] P8.4a PPTX import fast path (custom XML plus shape tags)
- [x] P8.4b PPTX arbitrary third-party import
- [x] P8.5 PPTX reconciliation
- [x] P8.6 PPTX tests and UI wiring

### Phase 9 — PDF/A-2b followup

Source of truth: [plan.md](./plan.md), [pdf-pdfa-compliance-plan.md](./pdf-pdfa-compliance-plan.md)

- [x] P9.0 PDF/A audit and spec update — `project/spec/formats/pdf.md` § PDF/A-2b Conformance Mode (4 scenarios, 8 acceptance criteria, Spec Gaps for veraPDF / real sRGB profile / -2u / -2a)
- [x] P9.1 Font embedding totality — preflight warning emitted for non-Standard-14 families under PDF/A; full subsetting via `@pdf-lib/fontkit` + `_shared/fonts/subset` recorded as Spec Gap pending the asset-pipeline-driven font-embedding rewrite
- [x] P9.2 Color-management and output-intent enforcement — `pdf/export/pdfa.ts` `resolveOutputIntent` walks `document.outputIntent.iccProfileAssetId` against the project assets (embedded data-URI source) and falls back to the bundled `_shared/color/getDefaultProfile('rgb')` minimal sRGB v2 profile; `attachOutputIntent` writes `/OutputIntents [<<...>>]` with `/S /GTS_PDFA1` + `/DestOutputProfile`
- [x] P9.3 Forbidden-feature gating — in-tree validator scans for `/Encrypt`, `LZWDecode`, `/S /JavaScript` and rejects on presence; importer already rejects encrypted input + warns on JavaScript per P6 follow-up
- [x] P9.4 PDF/A metadata and trailer correctness — `_shared/xmp` extends with `pdfaid:part`/`pdfaid:conformance` block (`renderPdfaDescription` + `extractPdfAIdentifier`); `pdf/export/pdfa.ts` `ensureTrailerId` writes a 16-byte deterministic FNV-derived `/ID` array
- [x] P9.5 Validator integration and CI — `pdf/import/validate-pdfa.ts` ships `validatePdfA2b(bytes)` + `validatePdfAXmpPacket(string)`. veraPDF integration recorded as Spec Gap pending Java/WASM CI image
- [x] P9.6 Round-trip support for PDF/A exports — `pdf/import/fast-path.ts` accepts `FastPathHydrationOptions.pdfa` and surfaces the recovered identifier on `extensions.pdf.pdfa` so subsequent exports can re-emit the same conformance level

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

## Cross-format I/O improvement (added 2026-04-28)

Source of truth: [cross-format-io-improvement-plan.md](./cross-format-io-improvement-plan.md)

Outcome of the 2026-04-28 cross-format analysis (PDF / PSD / PPTX / SVG). Lights up already-built backend capability through wired UI, closes open SVG security findings, consolidates duplicated text-shaping / shadow-parsing / geometry helpers into `_shared/`, and brings each format's feature surface up to a defensible production-grade bar.

- [x] CFIO.1.1 Wire `FormatExportOptionsModal` into ExportModal — PDF/A, PSD color space + bit depth + ICC + smart-object linking, SVG font embed + metadata + tagging, PPTX font embed (`efabce1`, `d0e418e`, `44f264c`)
- [x] CFIO.1.2 Generalize reconciliation modal beyond PPTX — `DocumentImportResult.reconciliation` now populates for PDF / PSD / SVG (`3a17269`)
- [x] CFIO.1.3 Surface preflight + validation results in dedicated `FormatPreflightModal` (`a6dff2c`, `6970ebb` wires PDF preflight too)
- [x] CFIO.2.1 SVG H2 — gate imported elements through content-security checks (`878519b`)
- [x] CFIO.2.2 SVG M2 — strip dangerous CSS `url()` from preserved outerHTML (`4c93c2a`)
- [x] CFIO.3.1 Promote text-unicode detector to `_shared/text-layout` (`51728ef`); PDF's bidi-reorder + uax14-linebreak left in pdf/ (PDF-execution-specific)
- [x] CFIO.3.2 Extract CSS shadow / glow parsing to `_shared/effects` (`bc1fa8d`)
- [x] CFIO.3.3 Extract canvas-unit conversion to `_shared/geometry` (`bc1fa8d`); SVG matrix decomp deferred until 2nd consumer
- [ ] CFIO.4.1 PSD CMYK / Lab / Grayscale + ICC profile round-trip *(needs sub-plan; blocks on `_shared/color/lcms-wasm`)*
- [ ] CFIO.4.2 PDF P6.3 — real shading patterns + per-element OCG wrappers *(needs sub-plan)*
- [ ] CFIO.4.3 PSD effects parity (bevel / satin / pattern overlay preserve, inner glow / overlays native) *(needs sub-plan)*
- [ ] CFIO.4.4 PSD bitmap layer mask round-trip *(needs sub-plan)*
- [x] CFIO.4.5 PSD text rotation through ag-psd text-transform (`1ab6354`)
- [ ] CFIO.4.6 PSD 16/32-bpc bit-depth preservation *(needs sub-plan)*
- [x] CFIO.4.7 PPTX font weight / style variants — closes pptx-known-gaps A4 (`24dcb7f`)
- [x] CFIO.4.8 PPTX page-override extension to `PageElementInstance` — closes A2 (`c99d646`)
- [x] CFIO.4.9 Reconciliation conflict-resolution UI — closes A1 (`24b7fc0`); generalised across all four formats
- [ ] CFIO.4.10 `_shared/css` extraction *(deferred per YAGNI until PPTX needs it)*
- [ ] CFIO.5.1 PPTX visual-fidelity CI gate (closes S3) *(needs sub-plan; needs CI infra changes)*
- [ ] CFIO.5.2 PowerPoint-on-Windows manual sanity protocol (closes S2) *(needs Windows + PowerPoint host)*
- [ ] CFIO.5.3 Real licensed fixture mounts in CI for PPTX + PSD *(needs encrypted CI mount strategy)*
- [x] CFIO.5.4 Telemetry sink for warning codes — closes B1 (`d54ef40`)
- [ ] CFIO.5.5 Accessibility audit on new modals (closes B3) *(needs hands-on screen-reader walkthrough)*
- [x] CFIO.5.6 Sister-format audits — PSD / SVG / PDF (closes B4) — applied PPTX Phase 8 audit lens (silent drops, lazy-boundary checks, perf scaling, async resource resolvers) to PSD / SVG / PDF tracks. Findings landed in [`project/implementation/sister-format-audit.md`](sister-format-audit.md); High / Critical findings filed back into per-track gap files (PSD = 5 entries in `psd.md` §Spec Gaps, PDF = 6 entries in `pdf.md` §Spec Gaps; SVG had no High findings — track is the best-audited under all four lenses)
- [ ] CFIO.5.7 Real-world large-deck load tests (closes B2) *(needs acquiring decks)*
- [ ] CFIO.5.8 PDF font subsetting wiring *(needs sub-plan)*
- [x] CFIO.6 Gap-file rolling updates — SVG KNOWN-GAPS (H2/M2 deleted), pptx-known-gaps (A1/A2/A4/B1 deleted), PSD spec (text rotation, smart-object link, page overrides removed), PDF spec (cross-references added)