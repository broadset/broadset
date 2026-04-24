# Formats — PPTX Specification

## Purpose

Defines PowerPoint (PPTX) export, import, and round-trip for Broadset. Covers round-trip within Broadset, external-source import (PowerPoint Windows/Mac/Office 365, Keynote, Google Slides, LibreOffice Impress, Canva), and external-target export that opens cleanly in PowerPoint with editable fidelity. Implementation roadmap lives at [project/implementation/pptx-support-plan.md](../../implementation/pptx-support-plan.md).

This spec supersedes all prior PPTX fidelity requirements. It organizes the contract as a **Feature Matrix** scoring Export / Import / Round-trip fidelity per feature, followed by acceptance-criteria requirements for the headline behaviours. It inherits the cross-format contracts in [spec.md](spec.md) — importer contract, importer security contract, and the Format Round-Trip Metadata pattern (XMP + per-element tag + content-hash fallback).

---

## Strategy — standards-only, no sidecars

PPTX is an OOXML (ECMA-376 / ISO/IEC 29500) ZIP package. Broadset's round-trip strategy uses **only** mechanisms the OOXML specification defines as "metadata readers preserve across save":

- **Visual layer** — native `<p:sp>`, `<p:grpSp>`, `<p:pic>`, `<a:prstGeom>`, `<a:custGeom>`, `<a:gradFill>`, `<a:blipFill>`, `<a:ln>`, `<a:r>`/`<a:p>` text runs, `<p:timing>` animations.
- **Per-element tag layer** — shape-name tags (`<p:cNvPr name="BSET:{uuid}:{kind}"/>`) plus OOXML extension lists (`<p:extLst><p:ext uri="{broadset-element-ext}">…`) on every Broadset element. Both are the canonical ECMA-376 mechanism for app-specific shape metadata and are preserved verbatim by PowerPoint, Keynote, and LibreOffice on save.
- **Document layer — custom XML parts** (`customXml/broadset-project.xml` and `customXml/broadset-interop.xml`) registered against `[Content_Types].xml` and `ppt/presentation.xml` via `_rels`. Same mechanism DOCX/XLSX use for app-specific state.
- **Document XMP** — `docProps/custom.xml` carries the `broadset:` XMP packet per IO-D-08.

No sidecar files. No app-private OOXML streams. No repurposed core fields.

---

## Sources of truth at export time

Every PPTX Broadset writes carries three collaborating layers. This is the concrete instantiation of the cross-format Format Round-Trip Metadata requirement in [spec.md](spec.md) for PPTX.

### Native layer — what any PPTX reader draws and edits

Native OOXML primitives map every Broadset feature that has a PPTX counterpart:

- **Text runs** via `<a:r>`/`<a:p>` with full `<a:rPr>` (font, size, bold, italic, underline, colour, language, hyperlink) and `<a:pPr>` (alignment, indent, margin, line spacing, bullets / numbering).
- **Preset geometries** via `<a:prstGeom prst="…">` when Broadset's element maps to one of PPTX's ~180 presets (rectangle, roundRect, ellipse, triangle, rightTriangle, diamond, pentagon, hexagon, star5, star6, arrow, callout, …).
- **Custom geometries** via `<a:custGeom>` with native PPTX path operators (`moveTo`, `lnTo`, `cubicBezTo`, `quadBezTo`, `arcTo`, `close`) for arbitrary `path` elements — editable in PowerPoint's Edit Points mode.
- **Fills** — `<a:solidFill>`, `<a:gradFill>` (linear, radial, path with full stop lists + `lumMod`/`lumOff`/`tint`/`shade` modifiers), `<a:blipFill>` (picture fill with `<a:stretch>` / `<a:tile>`; OOXML `srcRect` crop baked into the source image on import), `<a:pattFill>`, theme-color refs (`<a:schemeClr>`).
- **Strokes** via `<a:ln>` with width, dash, join, cap, head/tail arrow endings.
- **Images** via `<p:pic>` with proper relationships, preserving original compression (JPEG / PNG pass-through, no re-encode).
- **Groups** via native `<p:grpSp>` with proper child-relative coordinates and `a:chOff`/`a:chExt` cumulative transform — never flattened on export.
- **Opacity** via `<a:alpha>` inside fills; element-level opacity via transparency group on the shape.
- **Slide masters + layouts** generated from the project's style tokens so foreign editors see a theme-consistent deck.
- **Multi-slide support** — one Broadset page → one PPTX slide; page overrides materialized into per-slide shape deltas.
- **Speaker notes** via `ppt/notesSlides/notesSlideN.xml` with proper master and rels.
- **Animations** via `<p:timing>` for the subset that maps cleanly (fade, wipe, fly-in, zoom, rotate, path motion); unmappable animations export the element in its entered "IN" state and drop the animation data per IO-D-16.

### Metadata layer — Broadset semantics PPTX cannot express visually

- **Document XMP under the shared `broadset:` namespace** (IO-D-08) — project settings, canvas unit / dpi, asset registry, data schema, page definitions with their override maps, Dublin Core metadata from `document.metadata`. Carried in `docProps/custom.xml`.
- **Custom XML parts** — `customXml/broadset-project.xml` (project-level state above the slide level — same payload as XMP but in native OOXML custom-XML form for tools that don't walk XMP) and `customXml/broadset-interop.xml` (the round-trip ledger: per-element content hashes, Broadset document version, export timestamp).
- **Shape-name tags + per-shape `<p:extLst>` extensions** — each Broadset element's `<p:cNvPr name="BSET:{uuid}:{kind}:{dataField?}"/>` plus an `<p:ext uri="{broadset-element-ext}"><bset:elementMeta>…</bset:elementMeta></p:ext>` under non-visual properties. The extension carries the structured per-element semantics that don't fit in a shape name: full `dataField` path, `visibleWhen` expression, repeater config, per-element animation ids, style-token references, and the original element kind for cases where Broadset's kind doesn't collapse to a single PPTX shape type (`ticker`, `clock`, `qrcode`). Animation references are NOT serialized per IO-D-16.

### Tag-stripping fallback

When both the custom XML parts and the per-shape tags / extensions are stripped (Google Slides round-trip, aggressive "Save As"), content-hash re-matching via `_shared/fingerprint/fingerprintElement()` recovers element identity against the preserved metadata. Elements that cannot be matched either way become new elements on re-import; elements present in the preserved metadata but missing from the slide tree surface as deletions for user confirmation.

---

## Feature matrix

Scoring legend for each column (Export, Import, Round-trip):

- **native** — emitted via an OOXML primitive and re-read via the same primitive.
- **metadata-preserved** — round-tripped via XMP, custom XML parts, or per-shape `<p:extLst>`; not visible in the slide as a standalone shape but the user sees it in Broadset after re-import.
- **dropped** — the feature is not representable in PPTX; deliberately omitted on export, flagged on import.
- **n/a** — direction does not apply.

| Domain | Feature | Export | Import | Round-trip |
| --- | --- | --- | --- | --- |
| Text | Single-run plain text | native | native | native |
| Text | Multi-run styled text (`TextBody` + `Paragraph` + `Run`) | native | native | native |
| Text | Paragraph style (alignment, indent, margin, line spacing) | native | native | native |
| Text | Run style (family, size, weight, italic, underline, colour, lang) | native | native | native |
| Text | Hyperlink run | native | native | native |
| Text | Bullets and numbered lists | native | native | native |
| Text | Text-on-path | dropped | metadata-preserved | metadata-preserved |
| Text | Autofit / shrink-to-fit | native | native | native |
| Text | RTL / mixed direction | native | native | native |
| Vector | Rectangle / ellipse | native (`prstGeom`) | native | native |
| Vector | Rounded rectangle (uniform) | native (`prstGeom="roundRect"`) | native | native |
| Vector | Rounded rectangle (per-corner) | native (`custGeom`) | native | native |
| Vector | Arbitrary `path` element | native (`custGeom`) | native | native |
| Vector | Preset shapes (triangle, star, arrow, callout, …) | native (`prstGeom`) | native | native |
| Vector | Stroke (cap / join / dasharray / miterlimit / arrowheads) | native (`<a:ln>`) | native | native |
| Vector | Fill — solid colour | native (`<a:solidFill>`) | native | native |
| Vector | Fill — gradient (linear / radial / path) | native (`<a:gradFill>`) | native | native |
| Vector | Fill — conic gradient | dropped (not in OOXML) | metadata-preserved | metadata-preserved |
| Vector | Fill — pattern | native (`<a:pattFill>`) | native | native |
| Vector | Fill — picture | native (`<a:blipFill>`) | native | native |
| Vector | Theme-colour references (`schemeClr` + mods) | native | native | native |
| Raster | Image element | native (`<p:pic>`) | native | native |
| Raster | ICC profile on image asset | metadata-preserved | metadata-preserved | metadata-preserved |
| Groups | `'group'` element ↔ `<p:grpSp>` | native | native | native |
| Groups | Nested groups + composed child transforms | native | native | native |
| Groups | Group-level opacity | native | native | native |
| QR code | `qrcode` element | native (grouped rects when small; picture otherwise) | metadata-preserved | metadata-preserved |
| Clock | `clock` element | native (rendered IN-state + `<p:extLst>` config) | metadata-preserved | metadata-preserved |
| Ticker | `ticker` element | native (rendered IN-state + `<p:extLst>` config) | metadata-preserved | metadata-preserved |
| Video | `video` element | native (first-frame picture + `<p:extLst>` source) | metadata-preserved | metadata-preserved |
| Animations | Fade / wipe / fly / zoom / rotate / path-motion | native (`<p:timing>`) | native | native |
| Animations | Unmappable animations | dropped | dropped | dropped |
| Transitions | Slide transitions | native (`<p:transition>`) | native | native |
| Notes | Speaker notes (`Page.notes`) | native | native | native |
| Slides | Multi-slide (page → slide) | native | native | native |
| Slides | Page overrides materialized per slide | native | n/a (round-trip via XMP page-override maps) | metadata-preserved |
| Theme | Generated theme / master / layout | native | native | native |
| Tables | Tables (`<a:tbl>`) | metadata-preserved (`extensions.pptx.table`) | metadata-preserved | metadata-preserved |
| Charts | Charts (`<c:chart>`) | metadata-preserved (`extensions.pptx.chart`) | metadata-preserved | metadata-preserved |
| Connectors | Connector shapes | metadata-preserved (`extensions.pptx.connector`) | metadata-preserved | metadata-preserved |
| Comments | Slide comments | metadata-preserved (`extensions.pptx.comments`) | metadata-preserved | metadata-preserved |
| Unknown | Unknown OOXML shape | metadata-preserved (`extensions.pptx.raw`) | metadata-preserved | metadata-preserved |
| Security | VBA macros (`vbaProject.bin`) | dropped | dropped (with warning) | dropped |
| Security | OLE embeddings | dropped | dropped (with warning) | dropped |
| Security | Ink / 3D / SmartArt / active content | dropped | metadata-preserved | metadata-preserved |
| Metadata | Document XMP (`broadset:` namespace) | native | native | native |
| Metadata | Custom XML parts (`customXml/broadset-*.xml`) | native | native | native |
| Metadata | Per-shape `<p:extLst>` + shape-name tag | native | native | native |
| Metadata | Content-hash ledger (`broadset-interop.xml`) | native | native | native |

---

## Requirements

### Requirement: PPTX Export — Native OOXML Primitives

The exporter MUST emit every Broadset element using its native OOXML primitive counterpart. Flattening groups, rasterizing paths PPTX can express natively, or substituting SVG pictures for text is prohibited.

#### Scenario: Text exports as real runs

- GIVEN a Broadset text element with a `TextBody` containing two runs (one bold, one italic)
- WHEN exported to PPTX
- THEN the slide XML contains two `<a:r>` elements with `<a:rPr b="1">` and `<a:rPr i="1">` respectively
- AND the runs share the same `<a:p>` paragraph parent

#### Scenario: Groups stay groups

- GIVEN a Broadset document with a group containing two children
- WHEN exported to PPTX
- THEN the slide XML contains a `<p:grpSp>` with two child shapes
- AND the group's `<p:grpSpPr>` emits `<a:chOff>` / `<a:chExt>` matching the Broadset group transform
- AND the children are NOT duplicated at the slide root

#### Scenario: Path element exports as editable custGeom

- GIVEN a Broadset path element with cubic segments
- WHEN exported to PPTX
- THEN the shape emits `<a:custGeom>` with `<a:pathLst>` containing `moveTo` and `cubicBezTo` path operators
- AND PowerPoint opens the shape in Edit Points mode without "repair" warnings

#### Scenario: Rounded rectangle with uniform radius uses preset

- GIVEN a rectangle with uniform `borderRadius: 12`
- WHEN exported
- THEN the shape uses `<a:prstGeom prst="roundRect">`

#### Scenario: Rounded rectangle with per-corner radii uses custGeom

- GIVEN a rectangle with per-corner `borderRadius`
- WHEN exported
- THEN the shape uses `<a:custGeom>` (not an SVG picture fallback)

#### Scenario: Gradient exports as gradFill with stops

- GIVEN a rectangle with a linear gradient (three stops)
- WHEN exported
- THEN the shape fill is `<a:gradFill>` with three `<a:gs>` stop entries
- AND the gradient angle is emitted in `<a:lin ang="…">` 60000ths-of-a-degree

#### Scenario: Rotation composes at export

- GIVEN a grouped rectangle whose parent group has `rotation: 30` and whose child has `rotation: 15`
- WHEN exported
- THEN the child's `<a:xfrm rot="…">` emits the child's local rotation (not the composed world rotation)
- AND the group's `<a:xfrm rot="…">` emits the group rotation

#### Scenario: QR code exports as grouped rect shapes

- GIVEN a Broadset `qrcode` element with a small module count
- WHEN exported
- THEN the shape emits a `<p:grpSp>` of filled rects (one per QR module)
- AND the grouped shape re-imports as a `qrcode` element via its `<p:extLst>` tag

#### Acceptance Criteria

- [ ] A text element with multiple runs emits multiple `<a:r>` siblings under one `<a:p>`, never a single flattened string
- [ ] A text element with bold, italic, underline, colour, and font family is fully re-readable from the emitted XML
- [ ] A `group` element emits `<p:grpSp>` with `<a:chOff>` / `<a:chExt>` and no duplicated children at the slide root
- [ ] A `path` element emits `<a:custGeom>` with `<a:pathLst>` using native path operators (no SVG picture fallback when PPTX can express the geometry)
- [ ] A uniform-radius rounded rectangle emits `<a:prstGeom prst="roundRect">`
- [ ] A per-corner rounded rectangle emits `<a:custGeom>`
- [ ] An element with a linear gradient emits `<a:gradFill>` with correct stop list and angle
- [ ] An element with a radial gradient emits `<a:gradFill>` with `<a:path path="circle">`
- [ ] An element with a solid colour + opacity emits `<a:solidFill>` with `<a:alpha val="…">`
- [ ] An element with a theme-slot colour emits `<a:schemeClr val="accent1" />` plus any `lumMod`/`lumOff`/`tint`/`shade` modifiers
- [ ] A rotated element emits `<a:xfrm rot="…">` in 60000ths-of-a-degree (not radians, not degrees)
- [ ] An image element emits `<p:pic>` with a `<a:blipFill>` relationship pointing to the image bytes in `ppt/media/`
- [ ] Original image bytes pass through unchanged — JPEG stays JPEG, PNG stays PNG, no re-encode
- [ ] A `qrcode` element emits a crisp, scannable QR (either grouped rects or a picture), not an empty rectangle
- [ ] A `clock` / `ticker` / `video` element emits its initial-state rendering plus a `<p:extLst>` entry carrying its Broadset configuration
- [ ] The exported ZIP passes PowerPoint's "Inspect Document" with zero warnings on a canonical fixture deck

---

### Requirement: PPTX Export — Multi-Slide, Theme, Master, Layout

The exporter MUST emit one PPTX slide per Broadset page, with page-override deltas materialized per slide. The exporter MUST generate a theme, slide master, and one-or-more slide layouts from the project's style tokens so foreign editors see a themed deck.

#### Scenario: One page per slide

- GIVEN a Broadset document with three pages
- WHEN exported
- THEN the package contains `ppt/slides/slide1.xml`, `slide2.xml`, `slide3.xml`
- AND `ppt/presentation.xml` declares all three in the slide-id list
- AND `ppt/_rels/presentation.xml.rels` relates each

#### Scenario: Page overrides materialize into slide deltas

- GIVEN page 2 overrides element `E` to `visible: false`
- WHEN exported
- THEN `slide2.xml` does NOT contain shape `E`
- AND `slide1.xml` DOES contain shape `E`

#### Scenario: Generated theme

- GIVEN a Broadset document
- WHEN exported
- THEN `ppt/theme/theme1.xml` contains a valid `<a:clrScheme>` with 12 theme slots
- AND a valid `<a:fontScheme>` with major and minor font families
- AND a valid `<a:fmtScheme>` with at least one fill, line, and effect style

#### Acceptance Criteria

- [ ] One `ppt/slides/slideN.xml` per Broadset page
- [ ] `ppt/presentation.xml` declares all slide ids and is valid per `p:presentation` schema
- [ ] `ppt/_rels/presentation.xml.rels` relates each slide
- [ ] Page-override maps materialize correctly per slide (visibility, content, style, assetId)
- [ ] A generated `theme1.xml` is emitted with a complete `<a:clrScheme>`, `<a:fontScheme>`, and `<a:fmtScheme>`
- [ ] A generated `slideMaster1.xml` is emitted and referenced by every slide layout
- [ ] A generated `slideLayout1.xml` is emitted and referenced by every slide
- [ ] Theme colours referenced by exported shapes use `<a:schemeClr>`, preserving "Reset to theme" affordance in PowerPoint

---

### Requirement: PPTX Export — Metadata Layers

The exporter MUST attach the three metadata layers required by the cross-format round-trip contract in [spec.md](spec.md).

#### Scenario: Document XMP packet is emitted

- GIVEN any exported PPTX
- WHEN the package is inspected
- THEN `docProps/custom.xml` contains a `broadset:` XMP packet under `https://broadset.io/ns/xmp/1.0/`
- AND the packet includes `documentId`, `version`, `exportedAt`, and per-element fingerprint entries

#### Scenario: Custom XML parts are registered

- GIVEN any exported PPTX
- WHEN the package is inspected
- THEN `customXml/broadset-project.xml` and `customXml/broadset-interop.xml` exist
- AND `[Content_Types].xml` declares their override types
- AND `ppt/_rels/presentation.xml.rels` relates both to the presentation

#### Scenario: Per-shape tag on every element

- GIVEN a Broadset element with id `el-abc`
- WHEN exported
- THEN the corresponding `<p:cNvPr>` has `name="BSET:el-abc:rectangle"` (or the element's kind)
- AND the shape's non-visual properties contain `<p:extLst><p:ext uri="{broadset-element-ext}">` carrying `id`, `kind`, `dataField`, `visibleWhen`, `repeater`, `dirty`

#### Acceptance Criteria

- [ ] Every exported PPTX contains a `broadset:` XMP packet in `docProps/custom.xml`
- [ ] Every exported PPTX contains `customXml/broadset-project.xml` and `customXml/broadset-interop.xml`
- [ ] `[Content_Types].xml` declares overrides for both custom XML parts
- [ ] `ppt/_rels/presentation.xml.rels` relates both custom XML parts to the presentation
- [ ] Every exported shape has a `<p:cNvPr name="BSET:{uuid}:{kind}">` tag
- [ ] Every exported shape has a `<p:extLst>` entry under non-visual properties carrying structured Broadset semantics
- [ ] The interop ledger records a content-hash per tagged element
- [ ] Animation data is NOT serialized in the custom XML parts (IO-D-16 — PPTX is lossy for unmappable animations)

---

### Requirement: PPTX Import — Namespace-Safe Parsing

The importer MUST parse PPTX XML using a namespace-aware parser (`fast-xml-parser` with DTD / external-entity processing disabled per the shared importer security contract). Regex parsing is prohibited.

#### Scenario: Non-default namespace prefix is accepted

- GIVEN a slide XML where the drawingML namespace is bound to prefix `x` instead of `a`
- WHEN imported
- THEN shapes, text, and fills import correctly

#### Scenario: XXE / billion-laughs fixture is safe

- GIVEN a PPTX containing an XML part with a billion-laughs-style DTD
- WHEN imported
- THEN the parser does not expand entities and does not fetch external resources
- AND an import warning surfaces describing the rejected content

#### Acceptance Criteria

- [ ] The importer does NOT use regex to extract XML attributes or element content
- [ ] The importer accepts non-default namespace prefixes
- [ ] The importer disables DTD processing and external-entity resolution on every XML part
- [ ] The importer enforces the shared size / depth / entry caps per the importer security contract
- [ ] `vbaProject.bin` and OLE embeddings are rejected with warnings

---

### Requirement: PPTX Import — Fast-Path via Custom XML + Shape Tags

The importer MUST detect when a PPTX was previously exported by Broadset and hydrate the Broadset document from the custom XML parts and per-shape tags, using the slide tree only to detect post-export edits.

#### Scenario: Broadset-exported PPTX round-trips losslessly (untouched)

- GIVEN a Broadset-exported PPTX that has NOT been edited externally
- WHEN imported
- THEN the resulting `BroadsetDocument` is deep-equal to the source document (excluding explicitly-lossy fields documented in the feature matrix)
- AND every element's `extensions.pptx.dirty` is `false`

#### Scenario: External edit flips dirty flag

- GIVEN a Broadset-exported PPTX where the user moved one shape 100 EMU to the right in PowerPoint
- WHEN imported
- THEN the moved element's `extensions.pptx.dirty` is `true`
- AND its new `x` reflects the PowerPoint edit
- AND the untouched elements remain `dirty: false`

#### Acceptance Criteria

- [ ] When the interop ledger is present, the importer hydrates from custom XML parts first
- [ ] When element hash matches the ledger, `dirty` stays `false` and XML-side defaults win
- [ ] When element hash diverges from the ledger, `dirty` flips to `true` and current slide state wins field-by-field
- [ ] Tagged elements missing from the slide tree surface as deletions
- [ ] Untagged elements in the slide tree surface as additions

---

### Requirement: PPTX Import — Operator-Level Extraction for Arbitrary Files

The importer MUST handle arbitrary third-party PPTX produced by any tool (PowerPoint, Keynote, Google Slides, LibreOffice, Canva) when no Broadset metadata is present, mapping every recognized OOXML construct to its closest Broadset equivalent.

#### Scenario: Third-party multi-slide deck imports

- GIVEN a PowerPoint-authored deck with 20 slides
- WHEN imported
- THEN the resulting document has 20 pages
- AND each page has elements matching the slide's shape tree
- AND no slide is dropped

#### Scenario: Theme inheritance resolves

- GIVEN a slide shape whose fill is `<a:schemeClr val="accent1" lumMod="75000" lumOff="0"/>`
- WHEN imported
- THEN the element's fill is a `BroadsetColor` with `{ kind: 'theme', slot: 'accent1', mods: { lumMod: 0.75, lumOff: 0 } }`
- AND the resolved sRGB hex matches what `_shared/color/applyMods` produces against the theme palette

#### Scenario: Placeholder inheritance resolves

- GIVEN a slide shape that inherits its font family from the layout's title placeholder
- WHEN imported
- THEN the resulting text element's `fontFamily` matches the layout's placeholder value

#### Scenario: Groups import as groups

- GIVEN a slide with a `<p:grpSp>` containing two `<p:sp>` children
- WHEN imported
- THEN a Broadset `group` element is created with `parentId` pointing to the group
- AND the two children have `groupId` set to the group's id
- AND the group's local transform is not baked into the children

#### Scenario: Multi-run paragraph reconstructs as TextBody

- GIVEN a slide text frame with a paragraph containing three `<a:r>` runs (one bold, one italic, one plain)
- WHEN imported
- THEN the element's `content` is a `TextBody` with one paragraph and three `Run` entries
- AND each run preserves its style

#### Scenario: Preset shape maps to Broadset element

- GIVEN a shape with `<a:prstGeom prst="roundRect">`
- WHEN imported
- THEN the element is a `rectangle` with `borderRadius` set

#### Scenario: Custom geometry maps to path element

- GIVEN a shape with `<a:custGeom>` containing `moveTo` / `lnTo` / `cubicBezTo` operators
- WHEN imported
- THEN the element is a `path` with a valid SVG `d` string reconstructed from the path operators

#### Scenario: Picture element imports with original bytes

- GIVEN a `<p:pic>` referencing `ppt/media/image1.jpeg`
- WHEN imported
- THEN the resulting `image` element has an `assetId` pointing to an asset with MIME `image/jpeg` and the original bytes

#### Scenario: Unknown shape preserves raw blob

- GIVEN a slide containing a shape type Broadset does not recognize natively (e.g. `<a:tbl>`, `<c:chart>`, an ink annotation)
- WHEN imported
- THEN the element preserves its original XML fragment under `extensions.pptx.{raw|table|chart|…}`
- AND `extensions.pptx.dirty` is `false` so re-export emits the original blob byte-for-byte

#### Scenario: Speaker notes round-trip

- GIVEN a slide with a `notesSlideN.xml` containing text
- WHEN imported
- THEN the page's `notes` field is populated

#### Scenario: Native animation imports

- GIVEN a slide timing tree containing a fade-in effect on one shape
- WHEN imported
- THEN the document's `animations` array contains a matching keyframe set referencing the element's id

#### Acceptance Criteria

- [ ] Multi-slide decks import as multi-page documents; no slides dropped
- [ ] Slide masters + layouts + themes are resolved; placeholder inheritance cascades (slide → layout → master → theme)
- [ ] Theme-slot references (`<a:schemeClr val="accentN"/>`) import as `BroadsetColor` with `{ kind: 'theme', slot, mods }`
- [ ] `lumMod` / `lumOff` / `tint` / `shade` / `alpha` modifiers round-trip via `_shared/color/applyMods`
- [ ] Multi-run paragraphs import as `TextBody` with per-run styling
- [ ] `<a:prstGeom>` presets map to Broadset native kinds where possible (rect, roundRect, ellipse, triangle, star, arrow, callout …); unknown presets fall back to `svg` with picture
- [ ] `<a:custGeom>` imports as a Broadset `path` with an SVG `d` string reconstructed from path operators
- [ ] `<p:grpSp>` imports as Broadset `group` without flattening; `parentId`/`groupId` tree preserved
- [ ] `<p:pic>` imports with original bytes + MIME preserved; no re-encode
- [ ] `<a:blipFill>` with `srcRect` crop bakes the crop into the source image on import per io-prereqs picture-fill rule
- [ ] `<a:gradFill>` imports as `BroadsetFill` gradient variant with stops + mods
- [ ] `<a:ln>` with head/tail arrow endings imports into `strokeHeadEnd` / `strokeTailEnd`
- [ ] Unknown / unmappable content preserved under `extensions.pptx.*` with `dirty: false`
- [ ] Speaker notes round-trip via `Page.notes`
- [ ] Native `<p:timing>` animations import as Broadset animations where the mapping is clean
- [ ] Unmappable `<p:timing>` entries emit import warnings (IO-D-16 — no round-trip via custom XML)
- [ ] Every hydrated element has `extensions.pptx.dirty` initialized
- [ ] `vbaProject.bin` and OLE embeddings emit warnings and are rejected without crashing the import
- [ ] Every dropped / skipped construct surfaces as an import warning

---

### Requirement: PPTX Round-Trip Fidelity

The system MUST preserve element count, geometry (within EMU / mm tolerance), text content, styling, groups, and metadata across export → re-import round-trips on a canonical Broadset document containing every element type.

#### Scenario: Canonical round-trip

- GIVEN a canonical `BroadsetProject` with at least one element of each kind (text, image, svg, path, rectangle, ellipse, qrcode, group, video, clock, ticker), multi-page with overrides, and at least one mappable animation
- WHEN exported to PPTX and re-imported
- THEN the resulting document is deep-equal to the source, excluding fields marked `dropped` in the feature matrix

#### Scenario: Chain with external edit

- GIVEN a Broadset-exported PPTX that is opened in PowerPoint, edited (one shape moved), saved, and re-imported
- WHEN reconciliation runs
- THEN the moved element's new position wins; `dirty = true`
- AND every other element remains `dirty = false` and equals the source values

#### Acceptance Criteria

- [ ] Element count is preserved (mod explicitly-dropped kinds noted in feature matrix)
- [ ] Rectangle and path geometry preserved within EMU rounding tolerance (≤ 1 EMU = ~0.00882 mm)
- [ ] Text content (flat and structured `TextBody`) preserved byte-identical
- [ ] Group hierarchy preserved (`parentId` / `groupId` tree)
- [ ] Theme colour references preserved (not resolved to sRGB at export and re-imported flat)
- [ ] Page-override maps preserved via the document custom XML
- [ ] Mappable animations preserved via `<p:timing>`
- [ ] Untouched elements re-export byte-identical to the preserved blob when `dirty === false`
- [ ] Reconciliation reports additions / deletions / modifications / hash-recovered matches per `_shared/reconcile/` contract

---

### Requirement: PPTX Export — Open Cleanly in PowerPoint

Every exported PPTX MUST pass PowerPoint's "File → Info → Check for Issues → Inspect Document" with zero repair warnings on a canonical fixture deck. The exported ZIP MUST be ECMA-376 / ISO/IEC 29500 compliant.

#### Scenario: PowerPoint open test

- GIVEN a canonical Broadset document exported to PPTX
- WHEN the file is opened in PowerPoint (or `libreoffice --headless --convert-to pptx` stand-in)
- THEN no "repair" or "unreadable content" dialog appears
- AND all shapes, text, groups, and relationships render correctly

#### Acceptance Criteria

- [ ] The exported `[Content_Types].xml` declares every part's content type and is schema-valid
- [ ] Every `_rels` file is schema-valid
- [ ] Every slide's XML validates against `p:sld` schema
- [ ] The generated theme validates against `a:theme` schema
- [ ] The generated master validates against `p:sldMaster` schema
- [ ] Every layout validates against `p:sldLayout` schema
- [ ] PowerPoint "Inspect Document" produces zero warnings on a canonical fixture

---

### Requirement: Reconciliation Reporting

When re-importing a Broadset-exported PPTX that has been edited externally, the importer MUST produce a reconciliation report with per-element additions, deletions, modifications, and hash-recovered matches — surfaced in the demo UI per the shared HeroUI import-warnings modal (io-prereqs Phase 5 slice).

#### Acceptance Criteria

- [ ] Reconciliation output matches the `_shared/reconcile/` contract (`modifications`, `additions`, `deletions`, `recoveredByHash` buckets)
- [ ] When a tag is stripped but fingerprint matches, `recoveredByHash` carries the pair and no spurious delete + add appears
- [ ] When a tagged element is missing, it appears in `deletions` and surfaces a user-confirmation modal before being dropped
- [ ] The report is consumable by `packages/ui/src/modals/FormatImportWarningsModal`

---

## Spec Gaps

- **First-class Broadset table element.** `<a:tbl>` currently imports as `extensions.pptx.table` preservation blob plus a grouped-text-box visual representation. Upgrading to a native Broadset table element is tracked as a future spec change, not a Phase 8 deliverable.
- **First-class Broadset chart element.** `<c:chart>` currently imports as `extensions.pptx.chart` preservation blob plus a static picture. Native chart authoring is out of scope.
- **Ink / 3D / SmartArt / connectors / comments.** Preserved under `extensions.pptx.*` but not first-class; upgrade path deferred.
- **Font embedding under `ppt/fonts/`.** Subsetted embedded fonts use the `_shared/fonts/` subsetter landed in Phase 4. Full font-embedding acceptance tests (byte-level OS/2 / name-table assertions) land when a license-clear font fixture is available.
- **`<p:timing>` animations beyond fade-entry.** Fade-entry animations round-trip natively via `<p:timing>` (see `pptx/export/animation.ts`, `pptx/import/animation.ts`). Wipe, fly-in, zoom, rotate, and path-motion entrance effects plus any exit / emphasis effects drop on export per IO-D-16 and emit an import warning when encountered. Broadening the mappable preset set is tracked as a future unit.
- **Full OOXML XSD validation.** `validatePptxPackage` performs structural ECMA-376 conformance checks (root rels, slide rel targets, content-type overrides, XML parsability, macro rejection). Full schema validation against the ISO/IEC 29500 XSDs is deferred to a future external-tool CI gate that runs `libreoffice --headless --convert-to pptx` or PowerPoint on Windows.
- **Real-world external-tool golden files.** Synthesized fixtures in `pptx/fixtures/external-tools.ts` cover each tool's characteristic quirks. Licensed corporate `.pptx` files from PowerPoint / Keynote / Google Slides / LibreOffice / Canva would add fidelity confidence but require legal review before landing in the repo.
- **Keynote-specific round-trip.** Keynote-authored PPTX sometimes strips `<p:extLst>` extensions on re-save. Treated as a lossy endpoint in the chain; documented in the plan risk register. Content-hash fallback still recovers identity for visually-unchanged elements.

---

## Non-Goals

- PDF generation → see [pdf.md](pdf.md)
- PSD format → see [psd.md](psd.md)
- Raster export → see [raster.md](raster.md)
- SVG / HTML / JSON export → see [web-vector.md](web-vector.md) and [interchange.md](interchange.md)
- SmartArt authoring (import-only, preserved as blob)
- Chart authoring (import-only, preserved as blob)
- Ink annotations, 3D models, OLE embeddings, VBA / macros, password protection / DRM, co-authoring metadata — all dropped or preserved as opaque blobs; none are first-class Broadset features
