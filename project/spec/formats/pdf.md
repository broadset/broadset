# Formats — PDF Specification

## Purpose

Defines PDF export, import, and round-trip for Broadset. Covers round-trip within Broadset, external-source import (Illustrator, InDesign, Acrobat, Figma export, macOS Preview, Word, LaTeX), and external-target export with editable fidelity in Illustrator / Acrobat / InDesign. Implementation roadmap lives at [project/implementation/pdf-support-plan.md](../../implementation/pdf-support-plan.md).

This spec supersedes all prior PDF fidelity requirements. It organizes the contract as a **Feature Matrix** scoring Export / Import / Round-trip fidelity per feature, followed by acceptance-criteria requirements for the headline behaviours. It inherits the cross-format contracts in [spec.md](spec.md) — importer contract, importer security contract, and the Format Round-Trip Metadata pattern (XMP + per-element tag + content-hash fallback).

PDF/A-2b conformance is tracked separately in [project/implementation/pdf-pdfa-compliance-plan.md](../../implementation/pdf-pdfa-compliance-plan.md) and is a deliberate follow-up to the work described here.

---

## Sources of truth at export time

Every PDF Broadset writes carries two collaborating layers. This is the concrete instantiation of the cross-format Format Round-Trip Metadata requirement in [spec.md](spec.md) for PDF.

### Visual layer — what any PDF reader draws and edits

Native PDF primitives map every Broadset feature that has a PDF counterpart:

- **Text runs** — real `Tj` / `TJ` text showing operators with embedded / subsetted fonts; tracking, kerning, alignment, leading honour the font's true glyph metrics.
- **Vector paths** — Broadset `path`, `rectangle`, `ellipse`, and rounded-rectangle elements emit native PDF path operators (`m`, `l`, `c`, `h`, `B`, `f`, `re`) so they stay editable in Illustrator and Acrobat.
- **Images** — raster image XObjects with JPEG pass-through (no re-encode), PNG via SMask for alpha; embedded ICC profile when `ImageAsset.iccProfileAssetId` is present.
- **Groups** — Broadset `'group'` elements emit as PDF Form XObjects so transforms compose and selection survives in Illustrator.
- **Masks** — CSS / SVG clip-paths emit as PDF clipping paths; transparency groups carry group opacity and blend mode.
- **Gradients** — linear and radial gradients emit as PDF type 2 and type 3 shading patterns (real gradient fills, not first-stop fallback). Conic gradients emit an SVG-raster fallback and preserve the structured definition in marked-content for round-trip.
- **Color spaces** — the exporter emits the colour space declared by `document.outputIntent.colorSpace` (DeviceRGB, DeviceCMYK, CalRGB / Lab, DeviceN for spot). ICC profile embedded when declared.
- **Blend modes** — CSS `mix-blend-mode` maps to PDF blend modes via `ExtGState` where an equivalent exists; otherwise the element renders flattened with a warning.
- **Optional Content Groups** — each Broadset page maps to one OCG (IO-D-13) so PDF readers expose per-page visibility controls.
- **Page boxes** — canvas `bleed` / `trim` / `safeArea` map to PDF `MediaBox` / `CropBox` / `BleedBox` / `TrimBox` / `ArtBox`.

### Metadata layer — Broadset semantics PDF cannot express visually

- **Document XMP under the shared `broadset:` namespace** (IO-D-08) — project settings, canvas unit/dpi/bleed/trim/safeArea, asset registry, data schema, page definitions with their override maps, Dublin Core metadata from `document.metadata`, `document.outputIntent` referencing an `icc-profile` asset. Animation data is NOT serialized (see "Animated elements" below — PDF is a static carrier per IO-D-16). Attached to the document catalog's `/Metadata` stream.
- **Per-element marked-content tags** — every element's painting sequence is wrapped in a marked-content operator carrying a property dictionary keyed `/BSET`:

  ```
  /BSET << /ID (uuid) /Kind /Text /Dirty false /DataField (headline) >> BDC
    ... painting operators for this element ...
  EMC
  ```

  The `/BSET` property dictionary is registered in the page's `/Resources /Properties` dictionary and survives cleanly through Acrobat and typically through Illustrator unless the user flattens or restructures the content stream.

### Tag-stripping fallback

When both the XMP packet and the `/BSET` marked-content tags are stripped (aggressive flatten, "Save As", rasterize, Word / LaTeX / Preview regeneration), content-hash re-matching via `_shared/fingerprint/fingerprintElement()` recovers element identity against the preserved metadata. Elements that cannot be matched either way become new elements on re-import; see the `Reconciliation Reporting` requirement below for the user-facing report.

---

## Feature matrix

Scoring legend for each of the three columns (Export, Import, Round-trip):

- **native** — emitted via a native PDF primitive and re-read via the same primitive.
- **metadata-preserved** — round-tripped via XMP or marked-content properties; not visible in the PDF content stream but the user sees it in Broadset after re-import.
- **dropped** — the feature is not representable; deliberately omitted on export, flagged on import.

| Domain | Feature | Export | Import | Round-trip |
| --- | --- | --- | --- | --- |
| Text | Single-run plain text | native | native | native |
| Text | Multi-run styled text (`TextBody` + `Paragraph` + `Run`) | native | native | native |
| Text | Paragraph style (alignment, leading, tracking) | native | native | native |
| Text | Font resolution + fallback | native | native | native |
| Text | Font embedding + subsetting | native | native | native |
| Text | Text decoration (underline, strike) | native | native | native |
| Text | Text-on-path | metadata-preserved | metadata-preserved | metadata-preserved |
| Text | Bullets + numbered lists | native | native | native |
| Vector | Rectangle / ellipse / path (as PDF path operators) | native | native | native |
| Vector | Rounded rectangle with per-corner radii | native | native | native |
| Vector | Stroke (cap / join / dasharray / miterlimit) | native | native | native |
| Vector | Stroke arrowheads | metadata-preserved | metadata-preserved | metadata-preserved |
| Vector | Fill — solid colour | native | native | native |
| Vector | Fill — linear / radial gradient (PDF shading patterns) | native | native | native |
| Vector | Fill — conic gradient | metadata-preserved + raster fallback | metadata-preserved | metadata-preserved |
| Vector | Fill — pattern | native | native | native |
| Vector | Fill — picture | native | native | native |
| Raster | Plain raster image | native | native | native |
| Raster | JPEG pass-through (no re-encode) | native | native | native |
| Raster | ICC profile on image asset | native | native | native |
| Raster | Last-resort rasterisation fallback | native | n/a | metadata-preserved |
| Groups | `'group'` element ↔ PDF Form XObject | native | native | native |
| Groups | Nested groups + composed transforms | native | native | native |
| Groups | Group-level opacity (transparency group) | native | native | native |
| Masks | Vector clip-path | native | native | native |
| Masks | Bitmap mask via SMask | native | native | native |
| Masks | Transparency groups for group opacity | native | native | native |
| Effects | CSS filter primitives with a PDF equivalent (blur, drop shadow) | native (blend / ExtGState / raster fallback) | metadata-preserved | metadata-preserved |
| Effects | Filter primitives without a PDF equivalent | metadata-preserved + raster fallback | metadata-preserved | metadata-preserved |
| Pages | Canvas → `MediaBox` | native | native | native |
| Pages | Bleed / trim / safe area → `BleedBox` / `TrimBox` / `ArtBox` / `CropBox` | native | native | native |
| Pages | Per-page `OCG` | native | native | native |
| Colour | sRGB 8-bit | native | native | native |
| Colour | CMYK with embedded ICC | native | native | native |
| Colour | Lab with embedded ICC | native | native | native |
| Colour | Gray with embedded ICC | native | native | native |
| Colour | Spot colours (DeviceN / Separation) | native | native | native |
| Colour | `BroadsetColor.originalColor` preservation | n/a | native | native |
| Blend | CSS-equivalent blend modes via ExtGState | native | native | native |
| Blend | Blend modes without a PDF equivalent | metadata-preserved | metadata-preserved | metadata-preserved |
| Metadata | Document XMP `broadset:` namespace | native | native | native |
| Metadata | Per-element `/BSET` marked-content tag | native | native | native |
| Metadata | Content-hash fallback when tags stripped | n/a | native | native |
| Metadata | `document.metadata` (Dublin Core) | native (XMP) | native (XMP) | native |
| Metadata | `document.outputIntent` ICC reference | native | native | native |
| Animation | Animations (`animations` array, keyframes) | dropped (exported IN state) | dropped | dropped — animations are not serialized to XMP per IO-D-16 |
| Data binding | `dataField`, `visibleWhen`, `repeater` | metadata-preserved | metadata-preserved | metadata-preserved |
| Interactive | AcroForm / XFA forms | dropped | metadata-preserved | n/a |
| Interactive | Embedded JavaScript | dropped on export | stripped on import | n/a |
| Interactive | File attachments / embedded-file streams | dropped on export | metadata-preserved | metadata-preserved |
| Security | Encrypted input (password-protected PDF) | n/a | rejected unless password provided | n/a |

---

## Requirements

### Requirement: Standards-Only Round-Trip

Every PDF Broadset writes MUST be a single `.pdf` file with no sidecar files and no app-private streams outside PDF's documented extension mechanisms. Round-trip metadata rides exclusively in (1) document XMP under the shared `broadset:` namespace and (2) per-element marked-content properties under the `/BSET` key. Content-hash matching provides the fallback when tags are stripped.

#### Scenario: Single-file output

- GIVEN a Broadset project exported to PDF
- WHEN the exporter writes output
- THEN the output is a single `.pdf` file with no companion files

#### Scenario: XMP + marked content both present

- GIVEN a Broadset-exported PDF opened by a PDF parser
- WHEN inspecting the file
- THEN a `broadset:` XMP packet is attached to the document catalog
- AND every element-carrying painting sequence is wrapped in a `/BSET` marked-content pair (`BDC` … `EMC`)

#### Acceptance Criteria

- [ ] Exported PDF is a single file; no sidecars emitted
- [ ] Document-level XMP carries the `broadset:` namespace and validates against `_shared/xmp/`'s Zod schema
- [ ] Every element-carrying painting sequence emits a `/BSET` marked-content pair with `/ID`, `/Kind`, and `/Dirty` properties
- [ ] Importer hydrates from XMP when present, falling back to operator-level extraction when absent
- [ ] Importer falls back to `fingerprintElement()` when both XMP and marked-content tags are stripped
- [ ] Exporter MUST NOT emit embedded-file streams, app-private dictionaries, or any other data carrier for round-trip metadata

---

### Requirement: Group-Preserving Import and Export

The `'group'` element type and `parentId` tree (see [model/element.md](../model/element.md)) MUST round-trip through PDF Form XObjects. Flattening groups on import or export is a regression.

#### Scenario: Nested group export

- GIVEN a Broadset document with a group containing three children, one of which is itself a group
- WHEN exported to PDF
- THEN the PDF content stream contains a Form XObject reference for the outer group whose XObject stream contains three painting sequences, the middle one a nested Form XObject

#### Scenario: Nested group import

- GIVEN a PDF with nested Form XObjects (three levels deep) or equivalent nested marked-content groups
- WHEN imported
- THEN the resulting Broadset elements form a `parentId` tree of three levels, with no flattening

#### Acceptance Criteria

- [ ] A nested group structure round-trips without flattening
- [ ] Parent-child transforms flatten into PDF's current transformation matrix so each child renders at the correct absolute position while the group boundary survives in marked-content
- [ ] Rotation composes into the exported geometry (previously broken in the `@libpdf/core` path)
- [ ] Group-level opacity round-trips via a transparency group

---

### Requirement: Text Run Fidelity

Text content MUST round-trip as structured `TextBody` / `Paragraph` / `Run` data (IO-D-01). Mixed-run styling (different families, weights, italics, colours, tracking within one element) MUST NOT flatten to single-run.

#### Scenario: Multi-run text export

- GIVEN a text element with two runs — one bold red and one italic blue
- WHEN exported to PDF
- THEN the PDF painting sequence contains two `Tj` / `TJ` runs with the font / colour operators (`Tf`, `rg`, `k`) reflecting each run's style

#### Scenario: Multi-run text import

- GIVEN a PDF with a text element whose painting sequence contains three `Tj` runs at different sizes
- WHEN imported
- THEN the resulting text element's `content` is a `TextBody` with three `Run` entries, each matching the source size

#### Acceptance Criteria

- [ ] Broadset `Run` entries map one-to-one to PDF text-showing runs on export
- [ ] PDF text-showing runs map one-to-one to Broadset `Run` entries on import
- [ ] Paragraph-level style (alignment, leading, tracking) round-trips via PDF text-state operators (`Tc`, `Tw`, `TL`)
- [ ] Text decoration (underline, strike) round-trips via additional stroke operators
- [ ] A single-run plain string flattens back to `string` content on re-import (greenfield model allows both `string` and `TextBody` per [model/element.md](../model/element.md))

---

### Requirement: Native Vector Export

Rectangle, ellipse, and path elements MUST export as native PDF path operators — not rasterised pixels. Vectors stay editable in Illustrator and Acrobat Pro.

#### Scenario: Path stays vector

- GIVEN a Broadset `path` element with SVG path data `M 0 0 L 100 0 L 100 100 Z`
- WHEN exported to PDF and re-opened in Illustrator
- THEN the element appears as an editable vector path — not a rasterised image

#### Acceptance Criteria

- [ ] Rectangle / ellipse / path elements emit native PDF path operators (`m`, `l`, `c`, `h`, `re`, `B`, `f`)
- [ ] Per-corner `borderRadius` (tuple `[tl, tr, br, bl]`) round-trips via knot-composed cubic Bézier segments per corner
- [ ] Stroke styling (cap, join, dasharray, miterlimit) round-trips via PDF graphics-state operators (`w`, `J`, `j`, `M`, `d`)
- [ ] Rotation composes into the exported geometry

---

### Requirement: Real Gradients via Shading Patterns

Linear and radial gradients MUST export as native PDF shading patterns (type 2 for linear, type 3 for radial). The prior "first-stop colour fallback" behaviour is a bug, not the intended behaviour. Conic gradients emit a raster fallback plus metadata preservation.

#### Scenario: Linear gradient export

- GIVEN a rectangle with a 45° linear-gradient fill from red to blue
- WHEN exported to PDF
- THEN the rectangle's fill is a type-2 shading pattern with a 2-stop function spanning the correct bounding box

#### Scenario: Radial gradient export

- GIVEN a circle with a radial-gradient fill
- WHEN exported to PDF
- THEN the circle's fill is a type-3 shading pattern with the correct centre, radius, and colour stops

#### Acceptance Criteria

- [ ] Linear gradients emit as PDF type-2 shading patterns
- [ ] Radial gradients emit as PDF type-3 shading patterns
- [ ] Gradient colour stops preserve alpha via a paired SMask shading when any stop has alpha < 1
- [ ] Conic gradients emit a raster fallback AND preserve the structured gradient definition in marked-content so re-import round-trips

---

### Requirement: Clip-Path and Mask Fidelity

CSS / SVG clip-paths MUST emit as native PDF clipping paths. Group-level opacity MUST emit as a transparency group. Alpha masks MUST emit via the PDF SMask mechanism. Rasterising clipped content is a regression.

#### Acceptance Criteria

- [ ] SVG / CSS clip-path emits as native PDF clipping path operators (`W`, `W*`)
- [ ] Group-level opacity emits as a transparency group on a Form XObject
- [ ] Alpha masks on images emit via SMask
- [ ] Clipped paths and nested clipped groups round-trip without rasterisation

---

### Requirement: Colour Space and ICC Profile Round-Trip

sRGB, CMYK, Lab, and Grayscale documents MUST round-trip. The exporter emits the colour space declared by `document.outputIntent.colorSpace` (IO-D-13). The importer hydrates `BroadsetColor.originalColor` (IO-D-05) so re-export never silently downgrades a CMYK or Lab colour to sRGB.

#### Scenario: CMYK round-trip

- GIVEN a CMYK PDF with an embedded U.S. Web Coated SWOP ICC profile
- WHEN imported and re-exported without edits
- THEN the re-exported PDF is CMYK with the same embedded ICC profile
- AND the Broadset document has an `icc-profile` asset referenced by `document.outputIntent.iccProfileAssetId`

#### Acceptance Criteria

- [ ] sRGB / CMYK / Lab / Gray round-trip with the declared colour space preserved end-to-end
- [ ] Embedded ICC profile survives as an `icc-profile` asset on import and re-embeds on export
- [ ] `BroadsetColor.originalColor` preserves the original colour spec so re-export is lossless
- [ ] Spot colours emit as DeviceN / Separation and round-trip via the swatches registry
- [ ] Out-of-gamut colours gamut-map into the destination space via `_shared/color/gamutMap()` and surface a preflight warning

---

### Requirement: Font Embedding and Subsetting

Every PDF Broadset writes MUST embed every non-Standard-14 font used by the document, subsetted to the glyphs referenced in the content (IO-D-09). Broadset-owned exports default to subsetting-on; the export options modal MAY surface an opt-out. Fonts with `restricted` embed permission MUST NOT be embedded; fonts with `preview-print` permission MUST emit a preflight warning.

#### Acceptance Criteria

- [ ] Non-Standard-14 fonts embed with a subset containing only the referenced glyphs, via `_shared/fonts/subsetFont()`
- [ ] Every embedded font carries a ToUnicode CMap so copy-paste and accessibility work downstream
- [ ] Fonts with `fsType` `restricted` are refused via `_shared/fonts/resolveEmbedDecision()`; affected elements emit a preflight warning
- [ ] Fonts with `fsType` `preview-print` emit a preflight warning; export proceeds with embedding per user opt-in
- [ ] Missing fonts surface a preflight warning and a Standard-14 fallback is used per the current Helvetica fallback

---

### Requirement: Optional Content Groups Per Page

Each Broadset page MUST emit as one PDF Optional Content Group (OCG) so PDF readers expose per-page visibility toggles. The OCG name mirrors the page name; OCG visibility mirrors the page's current `visible` state.

#### Acceptance Criteria

- [ ] Each page emits one OCG registered in the document's `/OCProperties` dictionary
- [ ] OCG visibility defaults match the page's `visible` flag
- [ ] Importer maps OCGs back to pages when XMP metadata is present, and to a single synthesised page when absent

---

### Requirement: Page Boxes for Bleed / Trim / Safe Area

Canvas `bleed` / `trim` / `safeArea` from the document model MUST emit as PDF page boxes: `MediaBox` for full extent including bleed, `BleedBox` = `MediaBox`, `TrimBox` = canvas minus bleed, `ArtBox` = trim minus safe-area margin, `CropBox` defaults to `BleedBox`. Importer hydrates all four page boxes back into the canvas model.

#### Acceptance Criteria

- [ ] `MediaBox` equals canvas width × height including bleed
- [ ] `TrimBox` equals canvas width × height without bleed
- [ ] `ArtBox` equals trim minus safe-area margin (when `canvas.safeArea` is defined)
- [ ] `BleedBox` equals `MediaBox`
- [ ] Importer hydrates each page box back into the canvas fields, preserving millimetre values via the unit-utilities pipeline

---

### Requirement: Marked-Content Element Tags

Every painted Broadset element MUST be wrapped in a `/BSET` marked-content pair (`BDC` ... `EMC`). The property dictionary registered on the page's `/Resources /Properties` MUST include:

- `/ID` — the element's stable `id` as a PDF string
- `/Kind` — the element `type` as a PDF name (`/Text`, `/Image`, `/Path`, `/Rectangle`, `/Ellipse`, `/Svg`, `/Group`, `/Qrcode`, `/Video`, `/Clock`, `/Ticker`)
- `/Dirty` — the `extensions.pdf.dirty` flag as a PDF boolean
- `/DataField` — the element's `dataField` when present
- `/Blob` — base-64 preservation blob when the importer recognised a feature it cannot emit natively (e.g. unmapped annotation types)

#### Scenario: Tags round-trip

- GIVEN a Broadset document with three elements exported to PDF
- WHEN the PDF is re-opened and parsed
- THEN each element's painting sequence sits between a matching `BDC` with `/BSET` tag and the `EMC` operator
- AND the tag's `/ID` recovers the Broadset element `id`

#### Acceptance Criteria

- [ ] Every painted element emits one `BDC` / `EMC` pair
- [ ] The `/BSET` property dictionary carries `/ID` and `/Kind` minimally, and `/Dirty` by default
- [ ] The property dictionary is registered in the page `/Resources /Properties`
- [ ] The importer reads the property dictionary and maps each `/BSET` pair to a Broadset element
- [ ] Nested marked-content pairs (for groups) round-trip as `parentId` relationships

---

### Requirement: Animated Element Static Export

Broadset animations (`animations` array, keyframes) MUST be discarded on PDF export per IO-D-16. Animated elements are exported at their fully-entered "IN" state (all `in` keyframes resolved to their end positions). Animation data is not serialized to XMP — PDF is a static carrier.

If the same PDF is re-imported into Broadset, animations are NOT recovered; the user must re-author them. This is a documented known-lossy behaviour.

#### Scenario: Animation discarded at export

- GIVEN an element with an animation timeline that translates it from left to right
- WHEN PDF export runs
- THEN the element is rendered at the end of the `in` keyframe sequence (the "IN" state)
- AND no animation data appears in the exported PDF

#### Acceptance Criteria

- [ ] Animations are discarded on export (not serialized to XMP or marked content)
- [ ] Animated elements render at the fully-entered IN state
- [ ] Active state modifiers are not applied on export (rest state)
- [ ] Re-importing a Broadset-exported PDF surfaces an import warning that animations were lost

---

### Requirement: Dirty-Flag Discipline

Every imported PDF element MUST land with `extensions.pdf.dirty === false`. On re-export:

- Untouched elements (`dirty === false`) re-emit the preserved original operator sequence byte-for-byte.
- Edited elements (`dirty === true`) re-emit from current Broadset state; the preservation blob is discarded.

The dirty flag flips to `true` automatically when the user edits the element in Broadset via the editor middleware (IO-D-11).

#### Acceptance Criteria

- [ ] Every imported element carries `extensions.pdf.dirty === false`
- [ ] Editing an element in the editor flips the flag to `true` via the dirty-flag middleware
- [ ] Re-exporting an untouched document produces byte-identical painting-sequence output for every preserved element
- [ ] Editing one element and re-exporting rewrites that element only; every other element is byte-identical

---

### Requirement: Chain-Round-Trip Tolerance

Broadset → PDF → edit in Illustrator / Acrobat → save → re-import MUST preserve:

- **External-tool edits** — text changes, position moves, colour changes, path edits made in Illustrator appear in Broadset after re-import.
- **Broadset semantics not touched by the external tool** — data bindings, page override maps, repeater configs, `visibleWhen` expressions (via XMP).
- **Untouched elements** — byte-identical painting sequences via the `dirty: false` preservation blob.

#### Acceptance Criteria

- [ ] A Broadset-edited-then-Illustrator-saved PDF re-imports cleanly
- [ ] Fields Illustrator edited appear in Broadset with the new values and `dirty: true`
- [ ] Fields Illustrator did not touch keep their Broadset-native state (bindings, overrides)
- [ ] Elements with stripped `/BSET` tags recover identity via `fingerprintElement()` matching

---

### Requirement: Reconciliation Reporting

When a re-imported PDF has added, removed, or ambiguously-edited elements relative to the preserved metadata, the importer MUST produce a reconciliation report per the `_shared/reconcile/` contract in [spec.md](spec.md):

- **Additions** — elements in the PDF content stream with no matching tag or fingerprint.
- **Deletions** — elements in the preserved metadata missing from the PDF content stream.
- **Hash-recovered** — pairs where the `/BSET` tag was stripped but the fingerprint matched.

Deletions require user confirmation before being dropped from the Broadset document.

#### Acceptance Criteria

- [ ] Re-import produces a reconciliation report listing additions, deletions, and hash-recovered matches
- [ ] Additions land on an "Imported from PDF" staging page
- [ ] Deletions surface as an import warning requiring user confirmation

---

### Requirement: External-Source Import

The importer MUST handle PDFs produced by any tool that writes the format — not just Broadset-exported files. Best-effort mapping applies per the cross-format `Import scope: arbitrary external files` principle in [spec.md](spec.md). Tool-specific deviations are documented, not silently accepted.

Covered sources (see Phase 5 of [pdf-support-plan.md](../../implementation/pdf-support-plan.md) for the fixture list):

- Illustrator (Save As, Export as PDF)
- Acrobat (Print to PDF, Optimize PDF)
- InDesign (Export)
- Figma export
- macOS Preview (Export)
- Microsoft Word
- LaTeX (pdflatex, xelatex)

#### Acceptance Criteria

- [ ] Import never throws on valid PDFs from any supported source tool
- [ ] Unknown operators, annotations, and form fields are preserved in `extensions.pdf.*` with an import warning describing what was not natively mapped
- [ ] Illustrator's private `AIPrivateData` stream is ignored without error; nothing Broadset reads or writes depends on it
- [ ] Non-RGB documents from any source import without silent colour conversion

---

### Requirement: Security — Encrypted Input and Active Content

Encrypted PDFs MUST be rejected unless the user explicitly supplies the password via the import-options dialog. Embedded JavaScript actions (document-open JS, annotation actions, named actions) MUST be stripped before the content reaches the renderer. Embedded-file streams MUST be preserved as opaque preservation blobs and MUST NOT be executed, resolved, or followed.

These rules are additive to the cross-format importer security contract in [spec.md](spec.md); nothing here weakens that floor.

#### Acceptance Criteria

- [ ] Encrypted PDFs without a supplied password surface an import warning and abort parsing before allocation
- [ ] Embedded JavaScript actions are stripped and surfaced as an import warning
- [ ] Embedded-file streams are preserved as base-64 blobs under `extensions.pdf.embeddedFiles[]` with an import warning; they are not fetched, executed, or resolved
- [ ] The `pdfjs-dist` parser runs in a dedicated worker per the cross-format security contract

---

### Requirement: Preflight and Warnings

Export preflight and import warnings MUST follow IO-D-14 ("preflight warns and proceeds — never blocks export") and IO-D-18 ("no silent drops"):

- **Export preflight** surfaces: missing fonts (when `_shared/fonts/resolveFont` returns no match), missing ICC profile when the document is CMYK / Lab / Grayscale, fonts with `preview-print` or `restricted` embed permission, elements whose fallback is last-resort rasterisation, out-of-gamut colours.
- **Import warnings** surface: dropped feature types (annotations mapped to preservation blobs, JavaScript stripped, encrypted content rejected, oversize files clipped to the importer security caps), non-`BroadsetColor.originalColor`-preserving colour conversions.

#### Acceptance Criteria

- [ ] Export preflight warnings surface missing fonts, missing ICC profile on non-RGB documents, restricted-font embeds, rasterisation fallbacks, and out-of-gamut colours
- [ ] Export preflight never blocks — every warning carries a "proceed" path per IO-D-14
- [ ] Import warnings surface unknown feature preservation, resource-limit clipping, encryption rejection, and colour-space downgrades
- [ ] Every surfaced warning names the element or page it applies to

---

### Requirement: PDF/A-2b Conformance Mode

When the caller opts into `pdfaConformance: '2b'` (Phase 9 extension), the exporter MUST produce ISO 19005-2 level B compliant output: every font fully embedded with a complete ToUnicode CMap, every colour referenced through an embedded ICC profile / OutputIntent, no encryption, no JavaScript, no external references, document-level XMP carrying the `pdfaid:part="2"` + `pdfaid:conformance="B"` identifier, and a populated trailer `ID` array. Default `exportPdfBytes` (no PDF/A flag) emits regular PDF 1.7 with no PDF/A constraints.

#### Scenario: PDF/A mode embeds an OutputIntent

- GIVEN a Broadset project with `document.outputIntent.iccProfileAssetId` populated and the referenced ICC asset present
- WHEN the exporter runs with `pdfaConformance: '2b'`
- THEN the exported PDF contains a single `/OutputIntent` array entry whose `/S` is `/GTS_PDFA1` and whose `/DestOutputProfile` references the embedded ICC byte stream

#### Scenario: PDF/A mode embeds the bundled default sRGB profile when none is declared

- GIVEN a Broadset project with no `document.outputIntent`
- WHEN the exporter runs with `pdfaConformance: '2b'`
- THEN the exporter embeds the bundled minimal-sRGB profile from `_shared/color/default-profiles` and references it as the document `/OutputIntent`

#### Scenario: PDF/A mode emits the pdfaid: XMP identifier

- GIVEN any document exported in PDF/A mode
- WHEN the resulting PDF's catalog `/Metadata` stream is read
- THEN the XMP packet contains a `pdfaid:part` element with text content `"2"` and a `pdfaid:conformance` element with text content `"B"`

#### Scenario: PDF/A mode preserves the trailer `ID` array

- GIVEN any document exported in PDF/A mode
- WHEN the resulting PDF's trailer is read
- THEN it contains a 2-element `/ID` array

#### Acceptance Criteria

- [ ] `exportPdfBytes(doc, { pdfaConformance: '2b' })` emits a `/OutputIntent` referencing an embedded ICC profile (declared asset or bundled sRGB fallback)
- [ ] PDF/A export emits XMP with `pdfaid:part="2"` and `pdfaid:conformance="B"` alongside the `broadset:` namespace
- [ ] PDF/A export emits a populated trailer `/ID` array
- [ ] PDF/A export refuses Standard 14 font fallback — every font referenced in text elements is embedded as a subset with a ToUnicode CMap
- [ ] PDF/A export has no `/Encrypt` entry, no `/JavaScript` actions, no `/URI` external references
- [ ] PDF/A export wraps every page that contains transparency in `/Group << /S /Transparency /CS /DeviceRGB >>`
- [ ] Re-importing a PDF/A export preserves `pdfaid:part` / `pdfaid:conformance` in `extensions.pdf.pdfa` so the next export can re-emit them when the user has not changed output settings
- [ ] An in-tree structural validator (`validatePdfA2b(bytes)`) confirms the above on every PDF/A-mode test fixture; veraPDF integration is a future Spec Gap

#### Spec Gaps

- **veraPDF integration in CI** — full ISO 19005-2 conformance is verified by veraPDF (Java / WASM). Today the in-tree `validatePdfA2b(bytes)` checks the structural floor (XMP namespace, OutputIntent presence, trailer ID, no JS / encryption). The veraPDF wiring lands when the WASM port stabilises or a Java CI image is approved.
- **Bundled real sRGB IEC61966-2.1 profile** — today `_shared/color/default-profiles` ships a minimal synthetic v2 profile (header + required tags only) that satisfies PDF/A structural validation. Production users provide a real ICC profile via `document.outputIntent.iccProfileAssetId`; the synthetic profile is the fallback so PDF/A export never refuses for "no profile available".
- **PDF/A-2u** (Unicode mapping for every text run) and **PDF/A-2a** (tagged structure tree) — natural extensions once -2b is stable; tracked separately.

---

### Requirement: PDF Page Dimensions (retained from prior spec)

The system MUST convert canvas dimensions to PDF points (1mm = 72/25.4pt, 1in = 72pt). Generated PDF page dimensions MUST match the document canvas declared via `canvas.width` / `canvas.height` in their declared `canvas.unit`.

#### Acceptance Criteria

- [ ] Given a canvas of 210×118 mm, the page width is approximately `(210 × 72) / 25.4` points
- [ ] Given a canvas of 8.5×11 in, the page width is 612 points
- [ ] Given a canvas of 800×600 px, the page dimensions honour the document's `canvas.dpi` to convert to points

---

## Spec Gaps

The P6.0 foundation lands the standards-only round-trip contract, feature matrix, and acceptance criteria. The P6.2 parity rebuild adds parent-child translation flattening, rotation composition, per-corner radii, and clip-path fidelity. The P6.3 export-beyond-prior-art pass adds `/BSET` marked-content tagging, `broadset:` XMP packet, page boxes (MediaBox / BleedBox / TrimBox / ArtBox), and one OCG per Broadset page.

The following items ship in subsequent P6 subphases and are tracked here:

> **Tracked closures:** scheduled under the
> [cross-format I/O improvement plan](../../implementation/cross-format-io-improvement-plan.md):
> real shading patterns + per-element OCG = Phase 4.2;
> CMYK / Lab / Gray / spot colour emission + ICC = Phase 4.1
> (shares `_shared/color/lcms-wasm` with PSD).

- **P6.3 — real shading-pattern gradients (type 2 linear, type 3 radial).** Current behaviour: linear / radial gradients use the first-stop colour as a solid fill. Target behaviour: native PDF shading patterns via `pdf.context` low-level API. The Feature Matrix shows these as `native` ≡ "target behaviour for P6.3b"; until the shading-pattern emitter lands, gradients fall back to the first-stop colour and a preflight warning surfaces.
- **P6.3 — CMYK / Lab / Gray / spot colour emission + ICC output intent.** Current behaviour: export is sRGB / DeviceRGB only. Target behaviour: the exporter emits the colour space declared by `document.outputIntent.colorSpace` (IO-D-13); embedded ICC profile rides via the asset pipeline. The Feature Matrix shows these as `native` ≡ "target behaviour"; colour-mode-specific emission lands with the `_shared/color/lcms-wasm` CMYK path (Phase 2 Spec Gap).
- **P6.3 — per-element OCG membership via `/OC` marked-content wrappers.** Current behaviour: one OCG is registered per Broadset page in `/OCProperties`, but elements are not associated with specific OCGs in the content stream (every element is visible in every OCG). Target behaviour: elements on a given page are wrapped in `/OC` marked-content tags pointing at that page's OCG.
- **P6.4a** — Fast-path import from XMP + marked content.
- **P6.4b** — Operator-level extraction of arbitrary third-party PDFs.
- **P6.5** — Reconciliation wrapper via `_shared/reconcile/` and `_shared/fingerprint/`.
- **P6.6** — External-tool fixture corpus, chain-round-trip tests via shared test infrastructure, UI wiring for import / export / preflight surfaces.
- **Importer caps unwired (audit 2026-04-29).** [`PdfImportOptions`](../../../packages/formats/src/pdf/types.ts) exposes `password?` and `fetch?` only; there are no `maxInputBytes` / `maxPages` / `maxObjectCount` / `maxDepth` caps. `pdf-lib`'s `PDFDocument.load(bytes)` allocates the entire xref table before yielding control. Target behaviour: add caps with defaults parity with PPTX (200 MiB byte cap, 100 depth cap) plus `maxPages` (~10 000) and `maxObjectCount` (~1 000 000), and pre-validate them against the trailer dict before `PDFDocument.load`. Surfaced by [project/implementation/sister-format-audit.md](../../implementation/sister-format-audit.md) PDF Lazy-boundary §1.
- **Content-stream regex scanners unbounded (audit 2026-04-29).** [`packages/formats/src/pdf/import/operators.ts:156-181`](../../../packages/formats/src/pdf/import/operators.ts) regex scanners run unbounded over every page's decompressed content stream; a Flate-bomb page that decompresses to multiple GiB drives the scanner into pathological time. Target behaviour: a `MAX_CONTENT_STREAM_BYTES` (default ~10 MiB per page) check on `streamBytes.byteLength` before invoking the regex scanners. Surfaced by sister-format-audit.md PDF Lazy-boundary §3.
- **Unsupported content-stream filter silent drop (audit 2026-04-29).** [`packages/formats/src/pdf/import/operators.ts:117-130`](../../../packages/formats/src/pdf/import/operators.ts) `tryDecodeStream` returns `undefined` for any filter pdf-lib does not implement (LZW, JBIG2, Crypt). The page contributes zero text items with no warning. Target behaviour: emit `pdf-import: page ${n} content stream uses unsupported filter (...); text extraction skipped` per IO-D-18. Surfaced by sister-format-audit.md PDF Silent drops §1.
- **Wrong-password vs malformed PDF conflation (audit 2026-04-29).** [`packages/formats/src/pdf/import/parse.ts:80-94`](../../../packages/formats/src/pdf/import/parse.ts) `probeLoadPdf` collapses "wrong password" into "encrypted" when a non-`EncryptedPDFError` is thrown with `options.password` set. Target behaviour: distinguish `kind: 'encrypted-decrypt-failed'` from `kind: 'malformed'` based on `EncryptedPDFError` instance check only. Surfaced by sister-format-audit.md PDF Silent drops §2.
- **Embedded-file bytes silently dropped (audit 2026-04-29).** [`packages/formats/src/pdf/import.ts:170-174`](../../../packages/formats/src/pdf/import.ts) preserves the embedded-file `name` list on `extensions.pdf.embeddedFiles` but discards the binary attachment bytes. Re-export will not include the attached files. Target behaviour: warn `pdf-import: ${count} embedded file attachment(s) — names preserved, bytes dropped (re-export will not include the attached files)` so users know the round-trip is lossy. Surfaced by sister-format-audit.md PDF Silent drops §3.
- **Google-Fonts fetch unbounded + scheme/host unverified (audit 2026-04-29).** [`packages/formats/src/pdf/export/fonts.ts:255-304`](../../../packages/formats/src/pdf/export/fonts.ts) `tryEmbedGoogleFont` fetches the Google Fonts CSS and the font binary with no timeout, no byte cap, no AbortSignal, and no scheme / host allowlist on the URL extracted from the CSS body. Target behaviour: add `fontFetchTimeoutMs` (default 10 s) and `fontMaxBytes` (default 5 MiB) to `PdfExportOptions` (parity with PPTX `fontFetchTimeoutMs`/`fontMaxBytes`); enforce `https://fonts.googleapis.com` and `https://fonts.gstatic.com` host allowlist before fetch; route timeout / over-cap failures through the existing `failures` collector with structured codes. Surfaced by sister-format-audit.md PDF Async resource resolvers §1–3.

_Closed in the production-grade pass:_

- **Visual rendering regression.** Every export in [`visual-regression.test.ts`](../../../packages/formats/src/pdf/visual-regression.test.ts) is rasterised via `pdfjs-dist` + `@napi-rs/canvas`, then pixel-diffed via `pixelmatch`. Catches the "exporter produces structurally-valid PDF that paints nothing" failure mode that grep-tests miss. Tests cover: empty-page detection, fill-colour presence (red/blue), determinism across two exports, ellipse curve-fill, rotation produces visibly different output.
- **UAX #14 line-break wrapping (CJK + non-whitespace scripts).** [`uax14-linebreak.ts`](../../../packages/formats/src/pdf/uax14-linebreak.ts) loads the `linebreak` module via dynamic import + runtime narrowing (so the static type chain doesn't leak `declare module 'linebreak'` ambient declarations across package boundaries) and exposes a sync `wrapTextWithLineBreaks(text, maxWidth, measure)`. The export pipeline awaits `prepareLineBreaker()` once at start so subsequent per-element wraps stay sync. Japanese / Chinese / Khmer text now wraps at correct ideographic boundaries instead of producing one long overflowing line. Verified by [`cjk-wrapping.test.ts`](../../../packages/formats/src/pdf/cjk-wrapping.test.ts).
- **UAX #9 bidi reordering.** [`text.ts:reorderForBidi`](../../../packages/formats/src/pdf/text.ts) reorders runs from logical to visual order before painting, so PDF readers display Arabic / Hebrew correctly (PDF readers do NOT apply UAX #9 to Tj / TJ text). Identity fast-path on pure-LTR strings via a regex precheck.
- **Hyperlink emission.** Any element with `extensions.pdf.link` set to a URL emits a `/Annot /Subtype /Link /A << /S /URI /URI <url> >>` overlay covering the element bounding box. Verified by [`hyperlinks.test.ts`](../../../packages/formats/src/pdf/hyperlinks.test.ts).
- **Stricter validator + importer fuzz harness.** [`importer-fuzz.test.ts`](../../../packages/formats/src/pdf/importer-fuzz.test.ts) feeds malformed inputs (empty, garbage, truncated, lying `/Length`, oversized object counts, very long `/Producer` strings, fake header + random) to the importer; every case must surface a warning + non-crashing empty document. The fuzz pass surfaced TWO real importer crashes (undefined `pdf.catalog`, undefined `/Pages` tree) that have been fixed with `try/catch` guards in [`import/parse.ts`](../../../packages/formats/src/pdf/import/parse.ts) and [`import/operators.ts`](../../../packages/formats/src/pdf/import/operators.ts).
- **Font-bytes cache.** [`export/fonts.ts:fontBytesCache`](../../../packages/formats/src/pdf/export/fonts.ts) memoises the (CSS resolution + WOFF2 decompression) result per Google Fonts family across export passes. Verified by [`font-bytes-cache.test.ts`](../../../packages/formats/src/pdf/font-bytes-cache.test.ts) which asserts zero network calls on the second export of the same family.
- **Comprehensive producer-feature coverage.** [`comprehensive-features.test.ts`](../../../packages/formats/src/pdf/comprehensive-features.test.ts) runs pdfkit through the kinds of PDFs Adobe / Microsoft / Apple producers emit: dashed strokes + line caps + mixed fills, named destinations + link annotations, very large content streams (1000 lines), realistic Adobe-style metadata, encryption with realistic password setup. Plus an opt-in fixture downloader [`_test-helpers/download-w3c-fixtures.ts`](../../../packages/formats/src/pdf/_test-helpers/download-w3c-fixtures.ts) for fetching W3C / PDF Association binary fixtures locally when network is available.

_The following items remain after the gap-closure pass:_

- **External PDF/A validator (e.g. veraPDF) integration — DONE.** Wired via Docker (`verapdf/cli:latest`) in [`.github/workflows/verapdf.yml`](../../../.github/workflows/verapdf.yml) (gates every PR / push to main) plus an opt-in local script [`packages/formats/scripts/validate-pdfa.mjs`](../../../packages/formats/scripts/validate-pdfa.mjs) (`npm run validate:pdfa --workspace @broadset/formats`). The runner exercises every committed `__fixtures__/verapdf/*.pdf` against veraPDF AND generates a fresh Broadset PDF/A-2b export via [`generate-pdfa-export-impl.ts`](../../../packages/formats/scripts/generate-pdfa-export-impl.ts) which veraPDF audits against the full ISO 19005-2 ruleset. Wiring the integration surfaced THREE real conformance bugs in our own exporter:
  - `OutputConditionIdentifier` and `Info` were emitted as PDF names (`/sRGB#20IEC61966-2.1`) instead of text strings (`(sRGB IEC61966-2.1)`) per ISO 32000 §14.11.5; pdf-lib's `obj({key: 'string'})` defaults to PDFName.
  - The OCG default-configuration dictionary was missing `/Name` and `/Creator` per ISO 19005-2 §6.9.
  - The custom `broadset:` XMP namespace was not declared via a PDF/A schema-extension descriptor per ISO 19005-1 Annex C; veraPDF flagged every property as outside the predefined-schemas set.

  All three fixed in this same pass. Fresh Broadset PDF/A-2b exports now pass veraPDF cleanly. The bundled `validatePdfA2b` JS validator is retained as a fast structural floor for unit tests where Docker is too heavy.
- **Adobe / Microsoft / Apple binary fixtures.** Importer coverage against actual proprietary producer binaries (Illustrator `.ai` PDFs, Word `.pdf` exports, macOS Preview saves, Acrobat-edited files) is NOT redistributable. The importer is exercised against four complementary fixture sources instead:
  - [`__fixtures__/verapdf/`](../../../packages/formats/src/pdf/__fixtures__/verapdf/) — nine vendored binary PDF fixtures (≈40 KB total) from the [veraPDF Consortium corpus](https://github.com/veraPDF/veraPDF-corpus) (CC BY 4.0): PDF/A-1b, 2b, 2u, 2a, 3b, 4 + PDF/UA-1 + ISO 32000-1 + a deliberately-failing 2b. Exercised by [`vendored-fixture-corpus.test.ts`](../../../packages/formats/src/pdf/vendored-fixture-corpus.test.ts) which asserts header validity + import-without-crashing + Broadset-import-export round-trip per fixture. The PDF/A-3b fixture surfaced ANOTHER real importer bug — `collectNameTreeLabels` looking up `/Names` and `/Kids` as PDFDict instead of PDFArray, crashing on every Adobe-style embedded-files name tree; fixed in [`import/parse.ts`](../../../packages/formats/src/pdf/import/parse.ts).
  - [`producer-quirks.test.ts`](../../../packages/formats/src/pdf/producer-quirks.test.ts) — pdf-lib synthesised fixtures emulating structural quirks (Acrobat multi-stream `/Contents`, Word missing trailer `/ID`, pdflatex non-Latin `/Producer`, Figma no-XMP, Illustrator FlateDecode-compressed streams, macOS Preview `useObjectStreams: true`).
  - [`real-producer-fixtures.test.ts`](../../../packages/formats/src/pdf/real-producer-fixtures.test.ts) — `pdfkit` (MIT) generated fixtures: PDF 1.3 with indirect-string `/Producer`, `/Names` on catalog, multi-page documents, outlines, encryption, custom page sizes, mixed vector + text content. Plus a chain round-trip (pdfkit → Broadset import → Broadset re-export → re-import).
  - [`cross-producer-features.test.ts`](../../../packages/formats/src/pdf/cross-producer-features.test.ts) — `jsPDF` (MIT) generated fixtures: distinct PDF byte format from pdfkit (no FlateDecode by default, unusual transformation matrices, decimal coordinates) plus pdfkit feature coverage. The cross-producer suite caught a real importer bug — `/OpenAction` as a destination array (jsPDF default) crashed `hasEmbeddedJavaScript`. Fixed.

  Developers may drop Adobe / Microsoft / Apple binary fixtures into `__fixtures__/local/` (gitignored) and the parameterised test picks them up automatically — a refresh pass for those binaries when redistribution is permitted remains a follow-up.
- **Run-edit UI, ICC picker, gradient editor, preflight panel, export options modal, import warnings modal, reconciliation diff view** — covered by the io-prereqs Phase 5 UI spec under [project/spec/ui/](../ui/) and interleaved during PDF Phase 6.6 per the plan.

_Closed during the gap-implementation pass:_

- **WOFF2 font embedding.** Google Fonts WOFF2 URLs are now decompressed via `wawoff2` before being handed to pdf-lib's fontkit. Verified by [`woff2-and-tounicode.test.ts`](../../../packages/formats/src/pdf/woff2-and-tounicode.test.ts) which compresses a real Liberation Sans TTF to WOFF2, returns it via mock fetch, and asserts the resulting PDF embeds the decompressed SFNT.
- **PDF/A-2u ToUnicode enforcement.** pdf-lib's `CustomFontEmbedder` emits `/ToUnicode` CMaps for every subsetted custom font; the validator now verifies the CMap is present on every embedded Type0 / TrueType / Type1 font dict (skipping CIDFont descendants and unembedded Standard 14 fonts).
- **PDF/A-2a tagged structure tree.** Opting into `pdfaConformance: '2a'` emits `/MarkInfo /Marked true`, `/Lang en-US`, and a flat `/StructTreeRoot` mapping each Broadset element to a logical structure type (`Span` for text, `Form` for groups, `Figure` for shapes / images / video / clock / ticker / qrcode / svg). Each structure element carries an `/Alt` text from the element's `name` field. Verified by [`pdfa-2a-structure.test.ts`](../../../packages/formats/src/pdf/pdfa-2a-structure.test.ts).

---

## Non-Goals

These items are deliberately out of scope. They are NOT bugs, NOT incomplete work, and NOT items in `## Spec Gaps`. They reflect explicit product decisions: Broadset is a browser-side design tool, not a print-production system, a forms tool, or an accessibility audit suite. Each entry documents the rationale so future contributors don't accidentally reopen a closed scope decision.

### Color management

- **Real ICC-driven CMYK colour conversion.** Production print workflows convert sRGB → CMYK via the document's embedded ICC profile (lcms2 or equivalent). Broadset's exporter uses a deterministic subtractive-inverse fallback (`srgbToDeviceCmyk`) and emits a CMYK output intent. Rationale: no published `lcms2-wasm` package exists; porting it is a multi-week effort that benefits print workflows we don't ship today. **Use case match**: design + screen + PDF/A archival. **Use case mismatch**: print production with strict spot-colour fidelity — for that, take the Broadset PDF into Acrobat / InDesign and convert via the press's profile.
- **Lab / DeviceN / Separation spot colours.** Same constraint as CMYK; the ICC pipeline isn't there.
- **Wide-gamut colour spaces (P3, Rec.2020) for print.** Not modelled. The renderer supports display-P3 for screen rendering; PDF export downgrades to sRGB.

### Text shaping

- **Complex-script glyph shaping** — Arabic ligatures, Devanagari conjuncts, Thai cluster handling, Indic shaping, Mongolian vertical layout. Broadset reorders bidi runs to visual order (UAX #9 via `bidi-reorder.ts`) and wraps at UAX #14 line-break opportunities (via `_shared/text-layout/breakLines`), but does not run a HarfBuzz shaping pass. Rationale: HarfBuzz-WASM ships at ~3 MB compressed which is too heavy for the browser editor's first-paint budget; the lazy-load path requires a separate user-action trigger that doesn't exist today. **Use case match**: Latin / Greek / Cyrillic / pre-shaped CJK. **Use case mismatch**: any document whose primary script is Arabic, Hebrew with cantillation, Devanagari, Bengali, Thai, Khmer, Burmese, or Tibetan.
- **OpenType feature controls** (`font-feature-settings` for stylistic alternates, contextual ligatures, fractions, small caps). The exporter passes through whatever pdf-lib's fontkit applies by default; per-element feature toggles are not modelled.

### Encryption + active content

- **Encryption / password protection on export.** Not applied. Rationale: real encrypted PDFs require AES-128/AES-256 + key-derivation matching the spec's revision number — implementing this correctly is a security-critical effort whose payoff is a feature serving a small fraction of design-tool users.
- **Encrypted PDF import.** Encrypted input is rejected with an explicit warning even when the user supplies a password — pdf-lib does not expose a public password-decryption API.
- **Embedded JavaScript actions.** Stripped on import (catalog `/JavaScript`, `/OpenAction` action dicts, page-level `/AA` additional actions); never emitted on export.
- **Public-key encryption / certificate-based security / digital signatures.** Out of scope.
- **3D annotations, multimedia annotations, embedded Flash.** Out of scope.

### Forms + interactive features

- **AcroForm / XFA fillable forms.** Form fields are not emitted on export; preserved as opaque metadata on import so the user sees they exist. Rationale: Broadset is a design tool, not a forms tool. Users who need fillable PDFs use Acrobat Pro / Adobe Sign / DocuSign on a Broadset-exported "shell" PDF.
- **Comment / sticky-note / highlight annotations.** Not emitted on export. The `/Annot /Subtype /Link` overlay (via `extensions.pdf.link`) is the only annotation kind we produce; everything else (comments, signatures, stamps, freehand markup) is out of scope.
- **PDF actions** (Launch, GoTo, GoToR, URI, Submit, Reset) other than the URI action used by hyperlinks. Out of scope.

### Image format breadth

- **JPEG2000, TIFF, HEIC, AVIF, JBIG2** image XObjects. The exporter handles PNG (with alpha via SMask) and JPEG (with pass-through, no re-encode). Other formats are out of scope on the export path; on import they're preserved structurally but not decoded into a Broadset-native form. Rationale: pure-JS decoders for JPEG2000 / HEIC / AVIF either don't exist in production-ready form or carry bundle-size budgets the browser editor can't afford. Use case mismatch: scanned-document workflows (typically JPEG2000 or JBIG2) and HEIC photo embedding.

### Vector / typography edge features

- **Boolean path operations** (union / subtract / intersect / exclude) on vector paths. The model has the `booleanOperation` field but the PDF emitter ignores it; paths render as unioned. Rationale: implementing path-boolean correctly requires a robust polygon clipping library (e.g. `polygon-clipping` ~150 KB or `paper.js` ~500 KB) — adding the dep when most users don't use the feature is a deferred decision.
- **Pattern fills** (textures, hatching, halftone) beyond the linear/radial gradient shading patterns we already emit.
- **Stroke gradient fills** (gradient + pattern strokes). Single-colour strokes only.

### Performance / scale

- **Streaming export.** pdf-lib builds the full PDF in memory before `pdf.save()` returns the bytes. Broadset wraps that with a `Blob`-based download helper so the browser's download UI takes over as soon as the bytes are ready. Documents with hundreds of pages + embedded fonts can approach the per-tab JS heap limit (~2-4 GB on Chrome desktop, ~512 MB on iOS Safari). Rationale: pdf-lib has no streaming-output API, and writing a custom PDF writer would re-implement years of pdf-lib's edge-case handling. Use case match: documents up to ~200 pages with light font usage. Use case mismatch: long-form publications, technical manuals, books — those should be authored in tools designed for them (InDesign, LaTeX, Pages).

### Out-of-track work referenced by other specs

- **PDF/A-2b conformance** — covered by `validate:pdfa` (Docker veraPDF) in this spec, with the `pdf-pdfa-compliance-plan.md` document retained for historical context.
- **PSD format** — see [psd.md](psd.md).
- **PPTX format** — see [pptx.md](pptx.md).
- **SVG / HTML export** — see [web-vector.md](web-vector.md).
