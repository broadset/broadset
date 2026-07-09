# PDF/A-2b Compliance Plan (Followup)

Status: historical companion plan. Current task status lives in
[plan-progress.md](./plan-progress.md), and release readiness lives in
[production-readiness-status.md](./production-readiness-status.md). This file
preserves the original PDF/A-2b follow-up scope and acceptance detail; old
dependency wording describes the pre-track plan, not the present task-board
state.

PDF/A is the ISO 19005 archival subset of PDF. PDF/A-2b (ISO 19005-2, conformance level **b** — "basic visual reproduction") guarantees that a document will render identically decades from now by forbidding anything that depends on external resources or runtime behavior. It is a standard requirement in print, legal, archival, government, and broadcast-traffic contexts.

This plan is a **followup** to the main PDF support plan. It is intentionally deferred because meeting PDF/A-2b requires guarantees (colour profile embedding, font-embedding totality, metadata constraints) that would block the core import/export work if pulled forward. Once the main plan lands, PDF/A-2b becomes a targeted compliance pass on top of a working exporter.

## Shared prerequisites (consumed from io-prereqs)

PDF/A surfaced three capabilities that are genuinely cross-format and now live in [io-prereqs-plan.md](./io-prereqs-plan.md). This plan consumes them rather than re-inventing them:

- **`document.outputIntent` model field** (io-prereqs Phase 1). Declares the document's ICC profile + target color space. PDF/A requires a populated `OutputIntent`; if the user hasn't set one, fall back to the bundled default sRGB profile below.
- **`icc-profile` asset type + `_shared/color/defaultProfiles/` bundle** (io-prereqs Phase 2 + Phase 4). Ships `sRGB2014.icc`, `USWebCoatedSWOP.icc`, `GrayGamma22.icc` as license-compatible built-ins. PDF/A Phase C uses `getDefaultProfile('rgb')` when the user hasn't uploaded one.
- **`_shared/fonts/getGlyphToUnicodeMap(fontRef)`** (io-prereqs Phase 2). Exposes `fontkit`'s glyph-ID → Unicode codepoint mapping. PDF/A Phase B uses it to enforce total ToUnicode coverage and to reject export when a glyph has no mapping.
- **Output-intent picker in the editor** (io-prereqs Phase 5). User uploads or selects a default ICC profile from the canvas-settings panel. PDF/A mode simply enforces that `document.outputIntent` is populated; the picker is already wired.

Everything else in this plan is PDF-specific and stays here.

## Why PDF/A-2b specifically

- **-1 (based on PDF 1.4)** is too restrictive for modern content — no transparency, no OpenType.
- **-2 (based on PDF 1.7)** allows transparency, OpenType, JPEG2000 — matches what Broadset produces.
- **-2b (basic)** requires only reliable visual reproduction. **-2u (unicode)** additionally requires every text run to map to Unicode. **-2a (accessible)** additionally requires a full tagged structure tree.
- Start with -2b; the tagged-PDF work for -2a is a separate accessibility initiative.

## Hard requirements imposed by PDF/A-2b

- Every font used must be **fully embedded** (including standard 14). No external references.
- All embedded fonts must have a valid CIDSystemInfo and a ToUnicode CMap covering every glyph actually used.
- All colour must be device-independent: either an ICC profile is embedded and referenced as an OutputIntent, or every colour operator uses a calibrated colour space (CalRGB, CalGray, Lab, ICCBased).
- **No** encryption, **no** JavaScript, **no** external references of any kind (no URLs to fetch at render time, no remote fonts, no linked media).
- **No** transparency without a transparency group declaration (supported in -2, forbidden in -1).
- **No** `LZWDecode` filter. **No** multimedia, 3D, or AcroForm fields that execute.
- Document **XMP metadata required** and must declare PDF/A conformance (`pdfaid:part=2`, `pdfaid:conformance=B`).
- File trailer must include an `ID` array. Document catalog must include `/Metadata` pointing to the XMP stream.
- Every annotation must have an appearance stream; no reliance on viewer defaults.

## Scope

1. Gate the core exporter to optionally produce PDF/A-2b-compliant output via an `exportPdfBytes` option `{ pdfaConformance: '2b' }`.
2. Keep the default export as plain PDF 1.7 — PDF/A adds constraints (bigger file from embedded profiles, forbidden features) that not every user wants.
3. Validate output against a recognised PDF/A validator (veraPDF) in CI.

## Phase plan

### Phase A — Audit & spec

- Inventory every feature the main exporter produces. Flag each as: PDF/A-2b compatible, conditionally compatible (requires extra work), or forbidden.
- Add a PDF/A section to [project/spec/formats/pdf.md](../spec/formats/pdf.md) with the explicit requirement list and the enumerated Broadset features that degrade under PDF/A (e.g. linked web fonts → must be fetched and embedded at export time).

### Phase B — Font embedding totality

- When `pdfaConformance: '2b'` is set, refuse to fall back to the standard 14 fonts. Every font, including Helvetica/Times/Courier, must be embedded as a subset via `_shared/fonts/subsetFont()`.
- Ensure every embedded font ships a ToUnicode CMap. Source the glyph-to-codepoint data from `_shared/fonts/getGlyphToUnicodeMap()` (io-prereqs Phase 2). Add test coverage for CJK, emoji, and private-use area glyphs.
- Reject export with a clear error if a glyph has no Unicode mapping and PDF/A is requested. Preflight surfaces this as a warning first per io-prereqs **IO-D-14**; hard-error only when the export actually runs in PDF/A mode.

### Phase C — Colour management

- Read `document.outputIntent` (io-prereqs Phase 1 model field). If set, embed its referenced `icc-profile` asset; if unset, fall back to `_shared/color/getDefaultProfile('rgb')` which returns the bundled `sRGB2014.icc`.
- Emit the embedded profile as the document `/OutputIntent` with `/S /GTS_PDFA1` + identifier from `document.outputIntent.identifier` (default `sRGB IEC61966-2.1` for the bundled profile).
- Convert all colour operators: `rg` / `RG` → ICCBased-sourced colour; `k` / `K` CMYK stays legal under -2 when an appropriate CMYK OutputIntent is present (defer CMYK PDF/A to a sub-phase — requires `document.outputIntent.colorSpace === 'cmyk'` and a CMYK `icc-profile` asset).
- For images: if the image asset's `iccProfile` field is populated (io-prereqs Phase 4), preserve it; if not, tag with the document output intent's profile at embed time.

### Phase D — Feature gating

- Strip or refuse features the core exporter may emit that PDF/A-2b forbids:
  - Any link to remote resources (Google Fonts URLs must already have been fetched and embedded at export; confirm no `/URI` or external `/F` references remain).
  - LZW-compressed streams (we should already use Flate; verify).
  - Encryption (we do not encrypt; verify).
- Transparency groups: emit `/Group << /S /Transparency /CS /DeviceRGB >>` on every page that uses transparency. Test coverage for the canonical transparent-element cases.

### Phase E — Metadata

- Extend `pdf/export/xmp.ts` (built on `_shared/xmp/writeBroadsetXmp()`) to emit a `pdfaid:` namespace block alongside the `broadset:` namespace when PDF/A mode is on: `pdfaid:part="2"` + `pdfaid:conformance="B"`. Document catalog `/Metadata` must reference this XMP stream.
- Ensure the file trailer contains an `ID` array (verify `pdf-lib` writes one by default; emit explicitly if not). No sidecar files per io-prereqs **IO-D-17** — the XMP stream and the trailer `ID` are both in-file.

### Phase F — Validation & CI

- Add `veraPDF` (Java-based, but has a CLI and a WASM port) to the CI pipeline. Every PDF/A fixture exported by the test suite runs through veraPDF; failures block the build.
- Add a Playwright CT that exports a canonical document in PDF/A mode and asserts the validator passes.

### Phase G — Round-trip

- Re-importing a PDF/A file should be transparent — the core importer reads XMP and marked content via `_shared/xmp/readBroadsetXmp()`. PDF/A conformance identifiers (`pdfaid:part`, `pdfaid:conformance`) are preserved in `extensions.pdf.pdfa` and re-emitted on export if the user hasn't changed output settings. Per io-prereqs **IO-D-18**, the originating output-intent ICC profile is preserved as an `icc-profile` asset referenced by `document.outputIntent` so re-export is byte-identical.

## Risks

- **Binary ICC profile size.** Embedding a full sRGB profile adds ~3 KB per document. Acceptable. Profile bytes live in the `icc-profile` asset so content-hash dedup (io-prereqs Phase 4) ensures the same profile isn't duplicated across an asset-heavy project.
- **Font file weight.** PDF/A forbids referencing standard 14; every document carries subsetted fonts for every face used. For heavy documents this can add hundreds of KB — documented trade-off, not a bug. Subsetting is via the shared `_shared/fonts/subsetFont()` so the cost is no worse than the main PDF plan.
- **veraPDF dependency.** Running Java in CI is heavy; prefer the WASM port if stable enough. Alternative: gate PDF/A validation to a nightly job rather than every PR.
- **Illustrator's "Save as PDF/A".** If a user runs a Broadset-exported PDF through Illustrator with PDF/A mode, Illustrator may rewrite our XMP in ways that strip Broadset metadata. Out of scope here — PDF/A compliance is about the output we produce, not chain-preservation guarantees. Content-hash recovery (io-prereqs `_shared/fingerprint/`) absorbs as much as possible when the user re-imports an Illustrator-processed PDF/A.

## Deferred sub-initiatives

- **PDF/A-2u** (Unicode mapping for all text) — natural next step once -2b is stable. Most of the work is already done by Phase B.
- **PDF/A-2a** (tagged structure tree for accessibility) — much larger effort; owned by a future accessibility plan.
- **PDF/X** (print production profiles) — different conformance family; not planned.
