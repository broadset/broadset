# PDF Support Plan

Status: historical companion plan. Current task status lives in
[plan-progress.md](./plan-progress.md), and release readiness lives in
[production-readiness-status.md](./production-readiness-status.md). This file
preserves the original PDF scope and acceptance detail; old "current state"
sections describe the pre-track baseline, not the present implementation.

This plan captures the full-fidelity PDF import/export strategy for Broadset, covering round-trip within Broadset, external-source import (Illustrator, InDesign, Acrobat, Figma, Word, LaTeX, macOS Preview), and external-target export with minimal-loss editability in Illustrator/Acrobat/InDesign.

**Depends on** [io-prereqs-plan.md](./io-prereqs-plan.md) — the cross-format foundations (text-run model, `BroadsetColor`/`BroadsetFill` unions, canvas bleed/trim/safe-area, document metadata, structured filter primitives, content-hash identity, font/image asset pipeline, renderer refactor, and the shared modules under `packages/formats/src/_shared/` for color, fonts, text-layout, xmp, fingerprint, reconcile, shape-classifier, sanitize). The per-format gating matrix in that plan calls out exactly which io-prereqs phase unblocks each PDF phase below. Cross-format libraries are added by io-prereqs Phase 2 and consumed via `_shared/*`. PDF-only libraries (`pdf-lib`, `pdfjs-dist`, `@pdf-lib/fontkit`) are added by this plan and imported directly per io-prereqs **IO-D-07**.

## Current state (what "absolutely broken" means)

**Broadset today — [packages/formats/src/pdf/](../../packages/formats/src/pdf/):**

- Export only. 660 lines in `core.ts`, `@libpdf/core` v0.3.4.
- All 11 element types render, but the export is a regression vs. the prior dom-compositor implementation:
  - Gradients use first-stop color fallback — not real PDF shading patterns.
  - No parent-child transform flattening.
  - No rotation composition across groups.
  - No clip-path / mask fidelity; SVG and path elements rasterize instead of emitting native PDF path operators.
  - Animated elements render at t=0 and animation data is discarded entirely.
  - Borders/radii are simplified; complex per-corner radii don't round-trip.
- No import. [import-document.ts](../../packages/formats/src/import-document.ts) registers `pptx`, `psd`, `svg` only. `pdfjs-dist` is listed in [architecture.md](./architecture.md) as a non-default optional dependency and is not installed.
- Spec [project/spec/formats/pdf.md](../spec/formats/pdf.md) covers export only.

**dom-compositor reference (~1,057 lines):** also export-only, but meaningfully richer — parent-child flatten, per-corner radii, clip-path masking via SVG-rasterize, rotation composition, background-PDF base, dynamic data. Still no importer. Neither codebase has ever round-tripped PDF.

## Goals

1. **Round-trip fidelity (Broadset ↔ PDF ↔ Broadset)** — lossless except for features PDF genuinely cannot express; those are explicitly enumerated in the spec.
2. **External-source import** — PDFs produced by Illustrator, InDesign, Acrobat, Figma export, Word, LaTeX, macOS Preview must land as a sensible Broadset document; best-effort mapping, never crash.
3. **External-target export** — output must open cleanly in Illustrator/Acrobat/InDesign with vectors editable and text selectable; PDF 1.7 compliant; PDF/A hook reserved for a later phase.
4. **Chain tolerance** — Broadset → PDF → edit in Illustrator → save → re-import: the user's Illustrator edits are preserved where possible, and Broadset semantics (animations, data bindings, pages-as-overrides) are preserved where Illustrator didn't touch them.

## Strategy: standards-only — XMP metadata + marked content

**No sidecar, no embedded-file attachments, no app-private streams.** Everything we need to round-trip must live in mechanisms that are part of the core ISO PDF specification and that the major editors (Illustrator, Acrobat, InDesign) already understand as "metadata I should preserve on save."

Two layers, both standard:

- **Visual layer (what any PDF reader draws).** Vectors as PDF path operators, text as real text runs with embedded/subsetted fonts, images as XObjects, groups as Form XObjects, masks as clip paths, opacity and blend via ExtGState, CMYK/spot when the user chooses, OCGs (Optional Content Groups) mapped to Broadset pages. Illustrator and Acrobat see a normal, fully-editable PDF.
- **Metadata layer (XMP + marked content).** Two standard mechanisms carry Broadset semantics that PDF's visual model cannot express on its own — animations, data bindings, page overrides, element identity, canvas unit/dpi, data schema:
  - **Document XMP (ISO 16684-1).** A custom `broadset:` namespace on the document catalog's `/Metadata` stream carries everything that lives above the page level: project settings, canvas declaration (unit/dpi), asset registry, data schema, animations array, page definitions and their override maps. This is the same mechanism Illustrator, Photoshop, and InDesign use to embed their own app-private state; editors routinely preserve XMP across save.
  - **Marked content properties.** Each element's painting sequence is wrapped in a marked-content operator carrying a property dictionary:

    ```
    /BSET << /ID (uuid) /Kind /Text /DataField (headline) >> BDC
      ... painting operators for this element ...
    EMC
    ```

    This is the PDF 1.2+ mechanism used by tagged PDF and structure trees — standards-blessed and well-supported. Marked content survives cleanly through Acrobat and usually through Illustrator unless the user flattens or restructures aggressively.

When tags are stripped by an aggressive external edit, content-hash re-matching (geometry + text + style fingerprint) recovers element identity as a fallback. Elements that cannot be matched either way become new elements on re-import; elements present in XMP but missing from the stream are flagged as deletions for the user to confirm.

## Library stack (locked in)

Most libraries are added in **io-prereqs Phase 2** and consumed via `packages/formats/src/_shared/` — the PDF plan does not add them. Only PDF-specific additions land in this plan:

### PDF-specific libraries

| Library                | Role                                   | Why this one                                                                                                                                                                                                                                                                                                                               |
| ---------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **`pdf-lib`**          | PDF emitter (replaces `@libpdf/core`)  | Mature, battle-tested, covers every primitive we need: raw operator injection (`page.pushOperators(...)`) for marked-content and shading patterns, native CMYK and custom color spaces, OCGs, custom-namespace XMP via `PDFHexString`/`PDFRawStream`, Form XObjects, ExtGState, EmbeddedFiles. Widely deployed, excellent browser support. |
| **`pdfjs-dist`**       | PDF parser for import                  | Mozilla's reference implementation. Exposes operator lists, text content with font refs, resources (images, XObjects, ExtGState, OCGs), XMP metadata, annotations. Ships as a WASM-accelerated worker we can sandbox.                                                                                                                      |
| **`@pdf-lib/fontkit`** | pdf-lib adapter for fontkit subsetting | Official adapter wiring the shared `_shared/fonts/` (fontkit-based) pipeline into pdf-lib. Required for any custom font in PDF output.                                                                                                                                                                                                     |

### Consumed from `packages/formats/src/_shared/` (added once in io-prereqs Phase 2)

| Shared module                   | Underlying library                          | Role in PDF pipeline                                                                                                                                                                                      |
| ------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`_shared/color/`**            | `culori` + lazy `lcms-wasm`                 | CSS Color Level 4 parsing, RGB/CMYK/OKLCH/P3/Lab, gamut mapping, ICC transforms. Consumed by `pdf/export/color.ts`. Replaces the hand-rolled 90-line [color.ts](../../packages/formats/src/pdf/color.ts). |
| **`_shared/fonts/`**            | `fontkit`                                   | Font subsetting, glyph metrics, ToUnicode CMap data, `OS/2` `fsType` embed-permission read. Consumed by `pdf/export/fonts.ts` and `pdf/import/fonts.ts`.                                                  |
| **`_shared/text-layout/`**      | `linebreak` + `bidi-js` + lazy `harfbuzzjs` | UAX #14 wrapping, UAX #9 BiDi, complex-script shaping. Consumed by `pdf/export/text.ts`.                                                                                                                  |
| **`_shared/xmp/`**              | `fast-xml-parser`                           | Read/write `broadset:` XMP packet. Consumed by `pdf/export/xmp.ts` and `pdf/import/parse.ts`.                                                                                                             |
| **`_shared/fingerprint/`**      | `xxhash-wasm`                               | Content-hash fingerprinting. Consumed by `pdf/import/reconcile-hash.ts`.                                                                                                                                  |
| **`_shared/reconcile/`**        | `microdiff`                                 | Structural diffs for reconciliation. Consumed by `pdf/roundtrip.ts`.                                                                                                                                      |
| **`_shared/shape-classifier/`** | (in-house)                                  | Rectangle / ellipse / path heuristics. Consumed by `pdf/import/shape-classifier.ts`.                                                                                                                      |
| **`_shared/sanitize/`**         | `dompurify`                                 | Not used by PDF; included for completeness.                                                                                                                                                               |

`zod` (already in `@broadset/model`) continues to validate XMP-hydrated project JSON.

### Already in the repo, reused as-is

`svgpath` (normalize path data before emitting PDF path operators), `svg-path-bbox` (clip-path editor), `path-bool` (compound shapes), `qrcode-generator` (QR export), `modern-screenshot` (last-resort raster fallback for elements PDF genuinely cannot express, e.g. `backdrop-filter`).

### Explicitly rejected

- **`@libpdf/core`** — less feature-complete than pdf-lib; early version; capability ceiling unclear. Swapped out in Phase 1 as the first concrete task.
- **`opentype.js`** — simpler than fontkit but lacks CFF subsetting. fontkit is strictly more capable.
- **`jsPDF`** — generation-only, no operator-level control. Can't emit marked-content or shading patterns at the fidelity we need.
- **`pdfkit`** (Node-focused) — stream-based API awkward in a browser-first app.
- **`pdftron` / `Apryse` / `iText`** — commercial; conflicts with the repo's OSS posture.

### Deferred to later phases (out of the main PDF plan)

- **`veraPDF`** — PDF/A validation. Belongs to [pdf-pdfa-compliance-plan.md](./pdf-pdfa-compliance-plan.md).
- **`potrace`** — raster→vector. Not on the roadmap.

## Phase plan

### Phase 0 — Spec & scope lockdown (no code)

- Update [project/spec/formats/pdf.md](../spec/formats/pdf.md) to add sections: Import, Round-trip, External Interop, Color Model, XMP Metadata (document-level), Marked-content Tagging (element-level).
- Enumerate explicit non-goals: PDF forms (AcroForm/XFA), embedded JavaScript, encryption, 3D annotations, multimedia annotations, embedded file attachments.
- State the standards-only constraint explicitly: Broadset MUST NOT rely on app-private streams or embedded-file sidecars; everything that must round-trip lives in the visual layer, OCGs, XMP, or marked-content properties.
- Update [project/spec/formats/spec.md](../spec/formats/spec.md): add PDF to the importer list; formalize the XMP + marked-content pattern so other formats can reuse it later.
- Acceptance criteria covering every new cross-format requirement.

### Phase 1 — Types & dependency swap

- **Preconditions:** io-prereqs Phase 0 (decisions), Phase 1 (model additions incl. `BroadsetColor`/`BroadsetFill` unions, canvas bleed/trim, document metadata, structured filter primitives, content hash, unit utilities), and Phase 2 (libraries + `_shared/` modules) complete. io-prereqs Phase 3 (renderer refactor, per-corner radii, nested-group composition) must be in before Phase 2a of this plan lands, and Phase 4 (font/image asset pipeline) before Phase 2b.
- **Swap `@libpdf/core` → `pdf-lib`** as the first concrete task. Update every import in [packages/formats/src/pdf/](../../packages/formats/src/pdf/). Scope: mechanical rename plus adjustments for pdf-lib's async `PDFDocument.create()` / `doc.embedFont()` API. No behavioural changes in this commit; existing export tests must stay green. Record the decision in [decisions.md](./decisions.md).
- Update [architecture.md](./architecture.md) and [packages/formats/package.json](../../packages/formats/package.json): remove `@libpdf/core`; add `pdf-lib`, `@pdf-lib/fontkit`, `pdfjs-dist`. The shared libraries (`fontkit`, `culori`, `lcms-wasm`, `linebreak`, `bidi-js`, `harfbuzzjs`, `fast-xml-parser`, `xxhash-wasm`, `microdiff`, `dompurify`) land in io-prereqs Phase 2 — the PDF plan does not add them. Promote `pdfjs-dist` from the optional list to active.
- `packages/formats/src/pdf/types.ts` — `PdfImportOptions`, `PdfExportOptions`, `PdfRoundTripMetadata`, `MarkedContentTag`, `ColorSpaceChoice ('rgb'|'cmyk'|'spot')`, `BroadsetXmpPacket` (re-exported from `_shared/xmp/`).
- Public API in [packages/formats/src/pdf/index.ts](../../packages/formats/src/pdf/index.ts): `exportPdfBytes`, `importPdfDocument`, `canRoundTrip`.
- Register `importPdfDocument` in [import-document.ts](../../packages/formats/src/import-document.ts) and wire into the demo's import dispatcher. Import entry lazy-loads `pdfjs-dist`; export entry lazy-loads the CMYK/Lab path in `_shared/color/` and the complex-script shaping path in `_shared/text-layout/` so Latin+RGB documents pay nothing extra.

### Phase 2 — Export, rebuilt (matches, then exceeds dom-compositor)

Small focused files, each soft-capped at ~300 lines (hard cap 500). All io-prereqs library wrappers are consumed via `_shared/` — the files below are thin PDF-specific adapters:

- `pdf/export/geometry.ts` — unit conversion (via `@broadset/model/units`), Y-flip, rotation/transform matrix composition, parent-child flatten.
- `pdf/export/color.ts` — thin wrapper over `_shared/color/`. CMYK and spot-color color spaces, real gradients via PDF shading patterns (types 2 linear and 3 radial), gamut mapping when source color is out of destination gamut.
- `pdf/export/fonts.ts` — `@pdf-lib/fontkit` adapter around `_shared/fonts/subsetFont()`, Unicode CMap generation, `fsType` embed-permission read via `_shared/fonts/readEmbedPermission()`.
- `pdf/export/text.ts` — text runs (`Tj`/`TJ`) laid out via `_shared/text-layout/wrapRuns()`. Tracking, kerning, alignment math all backed by real font-table metrics from `_shared/fonts/`.
- `pdf/export/path.ts` — emit element paths as native PDF path operators (`m`, `l`, `c`, `h`, `B`, `f`); vectors stay vectors.
- `pdf/export/image.ts` — JPEG pass-through (avoid re-encode), PNG with SMask for alpha, ICC profile preservation via the `iccProfile` field on image assets (io-prereqs Phase 4).
- `pdf/export/mask.ts` — CSS/SVG clip-path → PDF clipping path; transparency groups for group opacity.
- `pdf/export/filter.ts` — structured filter primitives (io-prereqs Phase 1) → PDF blend-mode/ExtGState where possible; raster fallback via `modern-screenshot` for primitives PDF cannot express.
- `pdf/export/ocg.ts` — Broadset pages → PDF OCGs, one OCG per page; OCG visibility maps to Broadset page visibility.
- `pdf/export/pageboxes.ts` — `canvas.bleed` / `canvas.trim` / `canvas.safeArea` (io-prereqs Phase 1) → PDF `MediaBox` / `CropBox` / `BleedBox` / `TrimBox`.
- `pdf/export/marked-content.ts` — emit `/BSET << /ID … /Kind … /DataField … >> BDC … EMC` around each element's painting sequence; register properties in the page's `/Resources /Properties` dictionary.
- `pdf/export/xmp.ts` — builds the Broadset packet via `_shared/xmp/writeBroadsetXmp()` + `document.metadata` (io-prereqs Phase 1) and attaches to the document catalog's `/Metadata`. Packet carries: project settings, canvas unit/dpi/bleed/trim, asset registry, data schema, page definitions with their override maps, Dublin Core metadata. **No animations** — PDF is a static format per io-prereqs decision **IO-D-16**.
- `pdf/export/animations.ts` — computes the fully-entered "IN" state (all entry keyframes complete, before any exit keyframe) for each animated element and hands the resolved geometry/style to the downstream emitters. Animation data itself is discarded per io-prereqs **IO-D-16**. Documented as known-lossy in the spec.
- `pdf/export/core.ts` — orchestration only, ≤ 250 lines.

Sequencing inside Phase 2:

- **2a** parity rebuild with dom-compositor (parent-child flatten, rotation composition, per-corner radii, clip-path masking).
- **2b** surpasses prior art (real gradients, CMYK/spot, OCGs, marked-content). Animations are discarded per **IO-D-16**; IN-state resolution runs per element.

### Phase 3 — Import

Gated on io-prereqs **Phase 1** (content hash, `BroadsetColor` union with `originalColor` preservation, text runs) and **Phase 2** (`_shared/xmp/`, `_shared/fingerprint/`, `_shared/reconcile/`, `_shared/shape-classifier/`, `_shared/color/`, `_shared/fonts/`).

- `pdf/import/parse.ts` — `pdfjs-dist.getDocument` → document catalog metadata + per-page `OperatorList` + `getTextContent` + annotations. Read the document XMP first via `_shared/xmp/readBroadsetXmp()` (validated via `zod`); if the `broadset:` namespace is present, hydrate project-level state (canvas, assets, data schema, page definitions, `document.metadata`) from XMP and use the operator list only to recover element geometry/style and to detect post-export edits (size/position/color diffs) that should override XMP defaults on tagged elements matched by marked-content ID. Animations are not in XMP (**IO-D-16**); re-imported PDFs arrive as static documents.
- `pdf/import/operators.ts` — walk PDF content stream: group path operators into rectangles/ellipses/generic paths, group `Tj/TJ` runs into text elements, XObject images → image elements, Form XObjects → group elements, OCGs → pages.
- `pdf/import/text.ts` — reconstruct style from PDF font ref + `Tf` size + `rg/RG/k/K` color + current transformation matrix. Populates `TextRun[]` (io-prereqs Phase 1).
- `pdf/import/shape-classifier.ts` — thin wrapper calling `_shared/shape-classifier/classifyPath()`. Shared with SVG.
- `pdf/import/color.ts` — CMYK→RGB (and spot→RGB) via `_shared/color/` using the document's ICC output intent when present; spot color lookup; `BroadsetColor.originalColor` preserves the original color spec so re-export is lossless (io-prereqs Phase 1).
- `pdf/import/fonts.ts` — read font resource via `_shared/fonts/resolveFont()`, preserve PostScript name, map to the closest available web font family.
- `pdf/import/reconcile-hash.ts` — thin wrapper over `_shared/fingerprint/fingerprintElement()` so element identity survives when marked-content tags are stripped by external editors.

Sequencing inside Phase 3:

- **3a** XMP + marked-content fast-path — import any PDF Broadset itself exported with perfect fidelity.
- **3b** operator-level extraction — import arbitrary third-party PDFs as Broadset documents.

### Phase 4 — Round-trip reconciliation

Gated on io-prereqs **Phase 2** (`_shared/reconcile/`) and io-prereqs **Phase 5** (reconciliation diff view, deletion-confirmation modal).

- `pdf/roundtrip.ts` — thin wrapper over `_shared/reconcile/reconcile(...)`. Given the document XMP + current operator-level visual:
  - XMP values are defaults.
  - Current visual overrides them field-by-field when an external edit is detected (size, position, color, text content, path geometry).
  - New objects in the stream with no `/BSET` tag become new Broadset elements on an "Imported from PDF" page.
  - Tagged elements present in XMP but missing from the stream are flagged as deletions; user confirms in the demo UI.
  - When marked-content tags have been stripped (aggressive external edit), fall back to content-hash matching via `_shared/fingerprint/` to recover identity before giving up and treating as new.

### Phase 5 — Tests (spec-first, per [testing.instructions.md](../../agents/instructions/testing.instructions.md))

Gated on io-prereqs **Phase 6** (external-tool fixture convention, `assertReImportableBy`, chain CT harness, preserved-blob stress test).

- **Unit** — parse/emit for every operator family, every color space, every shape-classifier case, XMP attach/extract, marked-content attach/extract, animation IN-state resolution.
- **Round-trip golden tests** — canonical BroadsetProject with every element type + animations + data bindings + multi-page overrides → export → re-import → deep-equal (except explicitly-lossy fields documented in the spec).
- **External-tool fixtures.** Commit PDFs produced by:
  - Illustrator — Save As
  - Illustrator — Export as PDF
  - Acrobat — Print to PDF
  - InDesign — Export
  - Figma — Export as PDF
  - macOS Preview — Export
  - Microsoft Word
  - LaTeX (pdflatex)

  Smoke-test: import, count elements, assert no exceptions, snapshot structure so regressions surface immediately.

- **Chain CT (Playwright).** User imports a PDF in the demo, edits one element in a given region, exports, re-imports, and asserts the edit survived across all affected regions — conforms to the cross-region CT rule in [testing.instructions.md](../../agents/instructions/testing.instructions.md).

### Phase 6 — UI

Gated on io-prereqs **Phase 5** (editor UI surface: color mode selector, swatches, gradient editor, preflight panel, export options modal, canvas bleed/trim editor, document metadata editor, multi-page sorter, custom font upload, reconciliation diff view).

- Demo import dispatcher accepts `.pdf` / `application/pdf` with the shared progress indicator (io-prereqs Phase 5).
- Export menu adds PDF to the shared export options modal with options: color space (per document, io-prereqs decision **IO-D-13**), OCG layers on/off, font subsetting on/off. No sidecar option — standards-only.
- Preflight panel warns and proceeds (io-prereqs decision **IO-D-14**) on missing fonts, out-of-gamut colors, overflow-bleed, and embed-permission issues.
- All chrome is `@heroui/react` per [heroui.instructions.md](../../agents/instructions/heroui.instructions.md).

## Risk register

- **`pdf-lib` swap regressions.** Phase 1 swap from `@libpdf/core` to `pdf-lib` is mechanical but touches every file in [packages/formats/src/pdf/](../../packages/formats/src/pdf/). Mitigation: existing export tests are the regression net; no behavioural changes in the swap commit; commit stays green before any Phase 2 work begins.
- **XMP preservation across external edits.** Illustrator and Acrobat generally preserve document XMP on save, but this is not guaranteed across every tool in the chain. Word, LaTeX, and Preview may strip or regenerate XMP entirely. Mitigation: test every external-tool fixture for XMP round-trip in Phase 5; document which tools are lossy in the spec so users know what to expect.
- **Marked-content preservation.** Survives Acrobat cleanly; usually survives Illustrator unless the user restructures or flattens. When stripped, content-hash matching (`xxhash-wasm`) recovers identity; when that also fails, elements round-trip as "new." Documented as known-lossy for aggressive external edits.
- **Font licensing.** Subsetting requires font bytes. Google Fonts we fetch; user-uploaded fonts we use as-is; system fonts referenced in third-party imports can't be guaranteed to round-trip — documented as a known-lossy case. Embed-permission handling is centralized in `_shared/fonts/readEmbedPermission()` per io-prereqs Phase 4.
- **Bundle size budget.** `pdfjs-dist` (~2 MB) lazy-loads from the importer entry; `_shared/text-layout/harfbuzzjs` and `_shared/color/lcms-wasm` lazy-load per io-prereqs Phase 2. Export-only, Latin-only, RGB-only users download none of them. Enforced by the io-prereqs Phase 2 bundle-size assertion test.
- **Illustrator quirks.** AI PDFs embed a private `AIPrivateData` stream — the importer must not choke on it. Per io-prereqs **IO-D-17**, we never write app-private streams of our own; everything goes through XMP and marked content.
- **Security.** Covered by the io-prereqs **Importer security contract** (entity hardening, size/depth caps, sandboxed `pdfjs-dist` worker, no executable surface to renderer). PDF-specific additions: reject encrypted PDFs unless the user supplies the password explicitly; strip embedded JavaScript actions on import.

## Sequencing & commits

io-prereqs Phase 0 → 1 → 2 → 3 → 4 → PDF Phase 0 → 1 → 2a (~8 commits) → 2b (~6 commits) → io-prereqs Phase 5 (editor UI surface) → PDF Phase 3a (~4 commits) → 3b (~6 commits) → PDF Phase 4 (~3 commits) → io-prereqs Phase 6 (testing infra) → PDF Phase 5 (tests) → PDF Phase 6 (UI wiring).

Each phase ends on a green `npm run gate:full`. UI-visible phases also end on a green `npm run ct`.

## Decisions locked in

- **No sidecar, standards only.** All round-trip metadata rides in document XMP (ISO 16684-1) and PDF marked-content property dictionaries — both core PDF mechanisms. No embedded-file attachments, no app-private streams.
- **OCGs: one per page.** Pages map 1:1 to PDF Optional Content Groups. If the layer model inside pages ever needs to grow, revisit then.
- **PDF/A-2b: deferred.** Tracked separately in [pdf-pdfa-compliance-plan.md](./pdf-pdfa-compliance-plan.md) as a followup that depends on this plan completing.
- **PDF emitter: `pdf-lib`.** Swapped in as the first Phase 1 task, replacing `@libpdf/core`. Chosen for maximum feature completeness and robustness across marked-content, shading patterns, CMYK/spot, OCGs, and custom XMP.
- **PDF parser: `pdfjs-dist`.** Only serious choice for browser-first semantic extraction.
- **Shared library stack consumed via `_shared/`.** `fontkit`, `culori`/`lcms-wasm`, `linebreak`/`bidi-js`/`harfbuzzjs`, `fast-xml-parser`, `xxhash-wasm`, `microdiff` are all added by io-prereqs Phase 2 and wrapped by `_shared/*` modules. The PDF plan consumes them from there — never directly. Reconciliation, fingerprint, sanitize, shape-classifier, color, fonts, text-layout, and xmp are all one-module-four-callers per io-prereqs decision **IO-D-07**.
- **`broadset:` XMP namespace is shared across PDF, PSD, and SVG** per io-prereqs decision **IO-D-08**.
- **`@font-face`/font embedding is default-on** for Broadset-owned PDF exports per io-prereqs decision **IO-D-09**.

## Open questions

(None currently — will accumulate as Phase 0 spec work surfaces them.)
