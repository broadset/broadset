# Formats — PSD Specification

## Purpose

Defines Photoshop (PSD) export, import, and round-trip for Broadset. Covers round-trip within Broadset, external-source import (Photoshop macOS/Windows/Web/iPad, Affinity Photo, Photopea, GIMP, Krita, Figma export), and external-target export with editable fidelity in Photoshop. Implementation roadmap lives at [project/implementation/psd-support-plan.md](../../implementation/psd-support-plan.md).

This spec supersedes all prior PSD fidelity requirements. It organizes the contract as a **Feature Matrix** scoring Export / Import / Round-trip fidelity per feature, followed by acceptance-criteria requirements for the headline behaviours. It inherits the cross-format contracts in [spec.md](spec.md) — importer contract, importer security contract, and the Format Round-Trip Metadata pattern (XMP + per-element tag + content-hash fallback).

---

## Sources of truth at export time

Every PSD Broadset writes carries two collaborating layers. This is the concrete instantiation of the cross-format Format Round-Trip Metadata requirement in [spec.md](spec.md) for PSD.

### Native layer — what any PSD reader draws and edits

Native PSD primitives map every Broadset feature that has a PSD counterpart:

- **Text layers** with full run styling (family, weight, italic, size, tracking, leading, alignment, decoration, color) via PSD's text engine data.
- **Vector shape layers** with editable paths for rectangles, ellipses, and arbitrary `path` elements. Rounded rectangles use PSD's native rounded-rectangle primitive where possible and knot-composed cubic segments otherwise.
- **Bitmap layers** for `image` elements and for elements that PSD cannot represent natively (last-resort rasterization via `modern-screenshot`).
- **Smart objects** — embedded (data URI / ZIP-resolved) and linked (external path with GUID identity preserved).
- **Layer groups** for Broadset `'group'` elements via `parentId` tree; child transforms compose normally; group-level opacity, blend mode, and effects preserved.
- **Masks** — vector masks (SVG path → PSD vector path), bitmap layer masks (alpha channel), clipping masks (clip-to-layer-below).
- **Layer effects** — all ten (drop shadow, inner shadow, outer glow, inner glow, bevel, satin, color overlay, gradient overlay, pattern overlay, stroke) with bidirectional CSS `boxShadow` / `filter` / `FilterPrimitive[]` mapping.
- **Blend modes** — PSD blend mode bidirectional map covering every CSS `mix-blend-mode` plus PSD-only modes (vivid light, linear light, pin light, hard mix, etc.) preserved via the extension blob when CSS has no equivalent.
- **Artboards** for multi-page documents — each page becomes a PSD artboard.
- **Color mode and ICC profile** — RGB / CMYK / Lab / Grayscale per document; ICC profile embedded when `document.outputIntent.iccProfileAssetId` is set.

### Metadata layer — Broadset semantics PSD cannot express visually

- **Document XMP under the shared `broadset:` namespace** (IO-D-08) — project settings, canvas unit/dpi, asset registry, data schema, page definitions with their override maps, Dublin Core metadata from `document.metadata`, `document.outputIntent` referencing an `icc-profile` asset. Animation data is NOT serialized (see "Animated elements" below — PSD is a static carrier per IO-D-16).
- **Per-layer `additionalInfo` under the `BsPs` signature** — each exported layer carries the element's stable `id`, `extensions.psd.dirty` flag, data bindings (`dataField`, `visibleWhen`, `repeater`), and a preservation blob for any PSD feature the importer recognized but cannot represent natively (adjustment layer parameters, unknown effects, exotic layer types). Photoshop preserves unknown `additionalInfo` across save — the same mechanism Illustrator, Sketch, and Affinity use to round-trip their own app state through PSD. Animation references are NOT carried here — PSD is a static carrier per IO-D-16.

### Tag-stripping fallback

When both the XMP packet and the `BsPs` `additionalInfo` are stripped (aggressive flatten, rasterize, "Export As" rebuild), content-hash re-matching via `_shared/fingerprint/fingerprintElement()` recovers element identity against the preserved metadata. Elements that cannot be matched either way become new elements on re-import; see the `Reconciliation Reporting` requirement below for the user-facing report.

---

## Feature matrix

Scoring legend for each of the three columns (Export, Import, Round-trip):

- **native** — emitted via a native PSD primitive and re-read via the same primitive.
- **metadata-preserved** — round-tripped via XMP or `additionalInfo`; not visible in the PSD layer but the user sees it in Broadset after re-import.
- **dropped** — the feature is not representable; deliberately omitted on export, flagged on import.

| Domain            | Feature                                                           | Export                          | Import                      | Round-trip                                                                     |
| ----------------- | ----------------------------------------------------------------- | ------------------------------- | --------------------------- | ------------------------------------------------------------------------------ |
| Text              | Single-run plain text                                             | native                          | native                      | native                                                                         |
| Text              | Multi-run styled text (`TextBody` + `Paragraph` + `Run`)          | native                          | native                      | native                                                                         |
| Text              | Paragraph style (alignment, leading, tracking, first-line indent) | native                          | native                      | native                                                                         |
| Text              | Font resolution + fallback                                        | native                          | native                      | native                                                                         |
| Text              | Text decoration (underline, strike)                               | native                          | native                      | native                                                                         |
| Text              | Text-on-path                                                      | dropped                         | metadata-preserved          | metadata-preserved                                                             |
| Text              | Bullets + numbered lists                                          | native                          | native                      | native                                                                         |
| Vector            | Rectangle / ellipse / path                                        | native                          | native                      | native                                                                         |
| Vector            | Rounded rectangle (`borderRadius`)                                | native                          | native                      | native                                                                         |
| Vector            | Stroke (cap / join / dasharray / miterlimit / arrowheads)         | native                          | native                      | native                                                                         |
| Vector            | Fill — solid colour                                               | native                          | native                      | native                                                                         |
| Vector            | Fill — gradient (linear / radial / conic)                         | native                          | native                      | native                                                                         |
| Vector            | Fill — pattern                                                    | native                          | native                      | native                                                                         |
| Vector            | Fill — picture                                                    | native                          | native                      | native                                                                         |
| Raster            | Plain bitmap layer (8-bit)                                        | native                          | native                      | native                                                                         |
| Raster            | 16-bit / 32-bit channels                                          | native                          | native                      | native                                                                         |
| Raster            | ICC profile on image asset                                        | native                          | native                      | native                                                                         |
| Raster            | Last-resort rasterisation fallback                                | native                          | n/a                         | metadata-preserved                                                             |
| Groups            | `'group'` element ↔ PSD layer group                               | native                          | native                      | native                                                                         |
| Groups            | Nested groups + composed transforms                               | native                          | native                      | native                                                                         |
| Groups            | Group-level opacity / blend mode / effects                        | native                          | native                      | native                                                                         |
| Masks             | Vector mask                                                       | native                          | native                      | native                                                                         |
| Masks             | Bitmap layer mask (alpha channel)                                 | native                          | native                      | native                                                                         |
| Masks             | Clipping mask (clip-to-layer-below)                               | native                          | native                      | native                                                                         |
| Masks             | Boolean mask ops (add / subtract / intersect / exclude)           | native                          | native                      | native                                                                         |
| Effects           | Drop shadow                                                       | native                          | native                      | native                                                                         |
| Effects           | Inner shadow                                                      | native                          | native                      | native                                                                         |
| Effects           | Outer glow / inner glow                                           | native                          | native                      | native                                                                         |
| Effects           | Bevel / emboss                                                    | metadata-preserved              | metadata-preserved          | metadata-preserved                                                             |
| Effects           | Satin                                                             | metadata-preserved              | metadata-preserved          | metadata-preserved                                                             |
| Effects           | Colour overlay / gradient overlay                                 | native                          | native                      | native                                                                         |
| Effects           | Pattern overlay                                                   | metadata-preserved              | metadata-preserved          | metadata-preserved                                                             |
| Effects           | Stroke (layer effect)                                             | native                          | native                      | native                                                                         |
| Smart objects     | Embedded smart object                                             | native                          | native                      | native                                                                         |
| Smart objects     | Linked smart object (external file + GUID)                        | native                          | native                      | native                                                                         |
| Colour            | RGB 8-bit                                                         | native                          | native                      | native                                                                         |
| Colour            | CMYK (8- or 16-bit) with embedded ICC                             | native                          | native                      | native                                                                         |
| Colour            | Lab with embedded ICC                                             | native                          | native                      | native                                                                         |
| Colour            | Grayscale with embedded ICC                                       | native                          | native                      | native                                                                         |
| Colour            | Spot colours                                                      | native                          | native                      | native                                                                         |
| Colour            | `BroadsetColor.originalColor` preservation                        | n/a                             | native                      | native                                                                         |
| Blend             | CSS-equivalent blend modes                                        | native                          | native                      | native                                                                         |
| Blend             | PSD-only blend modes                                              | native (CSS fallback on render) | metadata-preserved + native | native                                                                         |
| Metadata          | Document XMP `broadset:` namespace                                | native                          | native                      | native                                                                         |
| Metadata          | Per-layer `BsPs` `additionalInfo` signature                       | native                          | native                      | native                                                                         |
| Metadata          | Content-hash fallback when tags stripped                          | n/a                             | native                      | native                                                                         |
| Metadata          | `document.metadata` (Dublin Core)                                 | native (XMP)                    | native (XMP)                | native                                                                         |
| Metadata          | `document.outputIntent` ICC reference                             | native                          | native                      | native                                                                         |
| Animation         | Animations (`animations` array, keyframes)                        | dropped (exported IN state)     | dropped                     | dropped — animations are not serialized to XMP or `additionalInfo` per IO-D-16 |
| Data binding      | `dataField`, `visibleWhen`, `repeater`                            | metadata-preserved              | metadata-preserved          | metadata-preserved                                                             |
| Adjustment layers | Curves / levels / hue-sat / color-balance on import               | n/a                             | metadata-preserved          | metadata-preserved                                                             |

---

## Requirements

### Requirement: Standards-Only Round-Trip

Every PSD Broadset writes MUST be a single `.psd` file with no sidecar files and no app-private streams outside PSD's documented extension mechanisms. Round-trip metadata rides exclusively in (1) document XMP under the shared `broadset:` namespace and (2) per-layer `additionalInfo` under the `BsPs` 4-byte signature. Content-hash matching provides the fallback when tags are stripped.

#### Scenario: Single-file output

- GIVEN a Broadset project exported to PSD
- WHEN the exporter writes output
- THEN the output is a single `.psd` file with no companion files

#### Scenario: XMP + additionalInfo both present

- GIVEN a Broadset-exported PSD opened by `ag-psd`'s reader
- WHEN inspecting the file
- THEN a `broadset:` XMP packet is present on the document
- AND every element-carrying layer has an `additionalInfo` entry under the `BsPs` signature

#### Acceptance Criteria

- [ ] Exported PSD is a single file; no sidecars emitted
- [ ] Document-level XMP carries the `broadset:` namespace
- [ ] Every element-carrying layer carries a `BsPs` `additionalInfo` entry
- [ ] Importer hydrates from XMP when present, falling back to layer-tree geometry when absent
- [ ] Importer falls back to `fingerprintElement()` when both XMP and `BsPs` entries are stripped

---

### Requirement: Group-Preserving Import and Export

The `'group'` element type and `parentId` tree (see [model/element.md](../model/element.md)) MUST round-trip through PSD layer groups. Flattening on import or export is a regression.

#### Scenario: Nested group export

- GIVEN a Broadset document with a group containing three children, one of which is itself a group
- WHEN exported to PSD
- THEN the PSD contains a top-level layer group with three children, the middle child being a nested layer group

#### Scenario: Nested group import

- GIVEN a PSD with nested layer groups (three levels deep)
- WHEN imported
- THEN the resulting Broadset elements form a `parentId` tree of three levels, with no flattening

#### Acceptance Criteria

- [ ] A nested group structure round-trips without flattening
- [ ] Child transforms compose correctly (rotation, translation, scale preserved on re-import)
- [ ] Group-level opacity, blend mode, and layer effects round-trip

---

### Requirement: Text Run Fidelity

Text content MUST round-trip as structured `TextBody` / `Paragraph` / `Run` data (IO-D-01). Mixed-run styling (different families, weights, italics, colours, tracking within one element) MUST NOT flatten to single-run.

#### Scenario: Multi-run text export

- GIVEN a text element with two runs — one bold red and one italic blue
- WHEN exported to PSD
- THEN the PSD text layer has two `styleRun` entries matching the run styling

#### Scenario: Multi-run text import

- GIVEN a PSD text layer with three `styleRun` entries of different sizes
- WHEN imported
- THEN the resulting text element's `content` is a `TextBody` with three `Run` entries, each matching the source size

#### Acceptance Criteria

- [ ] Broadset `Run` entries map one-to-one to PSD `styleRun` entries on export
- [ ] PSD `styleRun` entries map one-to-one to Broadset `Run` entries on import
- [ ] Paragraph-level style (alignment, leading, tracking, first-line indent) round-trips
- [ ] Text decoration (underline, strike) round-trips
- [ ] A single-run plain string flattens back to `string` content on re-import (greenfield model allows both `string` and `TextBody` per [model/element.md](../model/element.md))

---

### Requirement: Native Shape Layer Export

Rectangle, ellipse, and path elements MUST export PSD vector shape metadata (`vectorFill`, `vectorStroke`, and `vectorMask`) so Photoshop can preserve shape geometry. Rounded corners use the native rounded-rectangle primitive where possible. Exporters MAY include a minimal layer pixel body when a PSD writer requires `imageData`/canvas channels to preserve non-zero Photoshop layer bounds; that pixel body is compatibility scaffolding, not the source of shape geometry.

#### Scenario: Rounded rectangle preserves editability

- GIVEN a Broadset rectangle with `borderRadius: 12`
- WHEN exported to PSD and re-opened in Photoshop
- THEN the layer is a rounded-rectangle vector shape with the corner-radius editable in Photoshop's Properties panel

#### Acceptance Criteria

- [ ] Rectangle / ellipse / path elements emit PSD vector shape metadata; any emitted pixel body MUST preserve Photoshop-openable non-zero bounds and MUST NOT replace the vector geometry contract
- [ ] `borderRadius` round-trips via the native rounded-rectangle primitive when all four corners match; otherwise via knot-composed cubic segments
- [ ] Stroke styling (cap, join, dasharray, miterlimit) round-trips
- [x] Rotation composes into the exported layer geometry — image rotation flows through `placedLayer.transform`; non-image (rectangle / ellipse / path) rotation expands the layer AABB and re-normalises vector-mask path knots so Photoshop reads back a rotated shape

---

### Requirement: Layer Effects Round-Trip (All Ten)

All ten PSD layer effects MUST round-trip: drop shadow, inner shadow, outer glow, inner glow, bevel/emboss, satin, colour overlay, gradient overlay, pattern overlay, stroke. Effects with a CSS equivalent use native Broadset fields (`FilterPrimitive[]` for shadows/glows, `stroke*` for stroke). Effects without a CSS equivalent (bevel, satin, pattern overlay) ride in `extensions.psd.unmappedEffects` with `dirty: false` so untouched re-export is byte-identical.

#### Scenario: CSS-mappable effect

- GIVEN a PSD layer with a drop shadow (offset 10 px, blur 4 px, black at 60% opacity)
- WHEN imported
- THEN the Broadset element carries a `drop-shadow` entry in its `FilterPrimitive[]`

#### Scenario: PSD-only effect preserved

- GIVEN a PSD layer with a bevel/emboss effect
- WHEN imported into Broadset and re-exported
- THEN the re-exported PSD contains the same bevel/emboss parameters byte-for-byte
- AND the Broadset document has an `extensions.psd.unmappedEffects` entry with `dirty: false`

#### Acceptance Criteria

- [ ] Drop shadow, inner shadow, outer glow, inner glow export natively and import to `FilterPrimitive[]`
- [ ] Colour overlay and gradient overlay export natively and import to `BroadsetFill`
- [ ] Stroke layer effect round-trips via native stroke fields on the element
- [ ] Bevel / satin / pattern overlay ride in `extensions.psd.unmappedEffects` with `dirty: false`
- [ ] Untouched unmappedEffects re-export byte-identical

---

### Requirement: Mask Round-Trip

Vector masks, bitmap (alpha-channel) layer masks, and clipping masks (clip-to-layer-below) MUST all round-trip. Boolean operations on vector masks (add, subtract, intersect, exclude) MUST preserve the operator.

#### Acceptance Criteria

- [ ] Vector masks round-trip with path and boolean operator preserved
- [x] Bitmap layer masks round-trip — either as a Broadset mask element or via `extensions.psd.bitmapMask` preservation blob when the alpha cannot be represented as a Broadset mask
- [ ] Clipping masks (clip-to-layer-below) round-trip as parent-child clipping relationships in Broadset
- [ ] Rounded-rectangle vector masks import to `borderRadius` with rescaled values

---

### Requirement: Colour Space and ICC Profile Round-Trip

RGB (8-bit), CMYK, Lab, and Grayscale documents MUST round-trip. The exporter emits the colour mode declared by `document.outputIntent.colorSpace`. The importer hydrates `BroadsetColor.originalColor` (IO-D-05) so re-export never silently downgrades a CMYK or Lab colour to sRGB.

#### Scenario: CMYK round-trip

- GIVEN a CMYK PSD with an embedded U.S. Web Coated SWOP ICC profile
- WHEN imported and re-exported without edits
- THEN the re-exported PSD is CMYK with the same embedded ICC profile
- AND the Broadset document has an `icc-profile` asset referenced by `document.outputIntent.iccProfileAssetId`

#### Acceptance Criteria

- [ ] RGB / CMYK / Lab / Grayscale round-trip
- [ ] Embedded ICC profile survives as an `icc-profile` asset on import and re-embeds on export
- [ ] `BroadsetColor.originalColor` preserves the original colour spec so re-export is lossless
- [ ] Spot colours round-trip via the swatches registry
- [ ] 16-bit- and 32-bit-per-channel PSDs are imported (downsampled for rendering, original bit depth preserved for re-export) rather than silently flattened to 8-bit

---

### Requirement: Smart Object Round-Trip (Embedded + Linked)

Embedded smart objects (data URI or ZIP-resolved bytes) and linked smart objects (external file path with GUID identity) MUST round-trip.

#### Acceptance Criteria

- [ ] Embedded smart objects round-trip byte-for-byte (preserving MIME type)
- [ ] Linked smart objects preserve the external reference and GUID identity so Photoshop's "Update linked file" continues to work after re-export
- [ ] Image URLs export as embedded smart objects when fetch is available, with an import warning otherwise

---

### Requirement: Dirty-Flag Discipline

Every imported PSD element MUST land with `extensions.psd.dirty === false`. On re-export:

- Untouched elements (`dirty === false`) re-emit the preserved original layer blob byte-for-byte.
- Edited elements (`dirty === true`) re-emit from current Broadset state; the preservation blob is discarded.

The dirty flag flips to `true` automatically when the user edits the element in Broadset via the editor middleware (IO-D-11).

#### Acceptance Criteria

- [ ] Every imported element carries `extensions.psd.dirty === false`
- [ ] Editing an element in the editor flips the flag to `true` via the dirty-flag middleware
- [ ] Re-exporting an untouched document produces byte-identical output
- [ ] Editing one element and re-exporting rewrites that element only; every other element is byte-identical

---

### Requirement: Animated Element Static Export

Broadset animations (`animations` array, keyframes) MUST be discarded on PSD export per IO-D-16. Animated elements are exported at their fully-entered "IN" state (all `in` keyframes resolved to their end positions). Animation data is not serialized to XMP — PSD is a static carrier.

If the same PSD is re-imported into Broadset, the animations are NOT recovered; the user must re-author them. This is a documented known-lossy behaviour.

#### Scenario: Animation discarded at export

- GIVEN an element with an animation timeline that translates it from left to right
- WHEN PSD export runs
- THEN the element is rendered at the end of the `in` keyframe sequence (the "IN" state)
- AND no animation data appears in the exported PSD

#### Acceptance Criteria

- [ ] Animations are discarded on export (not serialized to XMP or `additionalInfo`)
- [ ] Animated elements render at the fully-entered IN state
- [ ] Re-importing a Broadset-exported PSD surfaces an import warning that animations were lost

---

### Requirement: Chain-Round-Trip Tolerance

Broadset → PSD → Photoshop → save → re-import MUST preserve:

- **Photoshop-edited fields** — text changes, position moves, colour changes, path edits made in Photoshop appear in Broadset after re-import.
- **Broadset semantics not touched by Photoshop** — animations (via XMP), data bindings, page override maps, repeater configs, `visibleWhen` expressions (via XMP + `additionalInfo`).
- **Untouched elements** — byte-identical via the `dirty: false` preservation blob.

#### Acceptance Criteria

- [ ] A Broadset-edited-then-Photoshop-saved PSD re-imports cleanly
- [ ] Fields Photoshop edited appear in Broadset with the new values and `dirty: true`
- [ ] Fields Photoshop did not touch keep their Broadset-native state (animations, bindings, overrides)
- [ ] Elements Photoshop stripped the `BsPs` signature from recover identity via `fingerprintElement()` matching

---

### Requirement: Reconciliation Reporting

When a re-imported PSD has added, removed, or ambiguously-edited elements relative to the preserved metadata, the importer MUST produce a reconciliation report per the `_shared/reconcile/` contract in [spec.md](spec.md):

- **Additions** — elements in the PSD layer tree with no matching tag or fingerprint.
- **Deletions** — elements in the preserved metadata missing from the PSD layer tree.
- **Hash-recovered** — pairs where the `BsPs` signature was stripped but the fingerprint matched.

Deletions require user confirmation before being dropped from the Broadset document.

#### Acceptance Criteria

- [ ] Re-import produces a reconciliation report listing additions, deletions, and hash-recovered matches
- [ ] Additions land on an "Imported from PSD" staging page
- [ ] Deletions surface as an import warning requiring user confirmation

---

### Requirement: External-Source Import

The importer MUST handle PSDs produced by any tool that writes the format — not just Broadset-exported files. Best-effort mapping applies per the cross-format `Import scope: arbitrary external files` principle in [spec.md](spec.md). Tool-specific deviations are documented, not silently accepted.

Covered sources (see Phase 5 of [psd-support-plan.md](../../implementation/psd-support-plan.md) for the fixture list):

- Photoshop macOS / Windows / Web / iPad
- Affinity Photo
- Photopea
- GIMP
- Krita
- Figma export

#### Acceptance Criteria

- [ ] Import never throws on valid PSDs from any supported source tool
- [ ] Unknown layer types, adjustment layers, layer comps, guides, and slices are preserved in `extensions.psd.*` with an import warning describing what was not natively mapped
- [ ] Non-RGB documents from any source import without silent colour conversion

---

### Requirement: Preflight and Warnings

Export preflight and import warnings MUST follow IO-D-14 ("preflight warns and proceeds — never blocks export") and IO-D-18 ("no silent drops"):

- **Export preflight** surfaces: missing fonts (when `_shared/fonts/resolveFont` returns no match), missing ICC profile when the document is CMYK / Lab / Grayscale, fonts with `preview-print` or `restricted` embed permission, elements whose fallback is last-resort rasterisation.
- **Import warnings** surface: dropped feature types (adjustment layers mapped to preservation blobs, animation-incompatible fields, oversize files clipped to the importer security caps).

#### Acceptance Criteria

- [ ] Export preflight warnings surface missing fonts, missing ICC profile on non-RGB documents, restricted-font embeds, and rasterisation fallbacks
- [ ] Export preflight never blocks — every warning carries a "proceed" path per IO-D-14
- [ ] Import warnings surface unknown feature preservation, resource-limit clipping, and colour-space downgrades
- [ ] Every surfaced warning names the element or layer it applies to

---

## Spec Gaps

The core P5.2a foundation and P5.3a/b/c coverage shipped, plus the parity-with-PDF infrastructure pass: robust importer surface (`importPsdDocument` with `{ document, warnings }`), import fuzz harness, export preflight (`exportPsdBytesAsyncWithPreflight`), cross-reader structural validator (`validatePsdBytes`), producer-quirks fixture corpus, visual regression pixel sampling, UAX #9 / UAX #14 detection on text content, modular `psd/export/` layout. The following deeper round-trip surface is tracked here and will land under later PSD-track iterations:

> **Tracked closures:** scheduled under the
> [cross-format I/O improvement plan](../../implementation/cross-format-io-improvement-plan.md) Phase 4:
> CMYK/Lab/Grayscale + ICC = Phase 4.1; effects parity = Phase 4.3;
> 16/32-bpc preservation = Phase 4.6;
> real third-party fixture corpus = Phase 5.3.

- **Inner glow / color overlay / gradient overlay / bevel / satin / pattern overlay.** Current behaviour: drop shadow, outer glow, inner shadow, stroke-effect emit natively. Target behaviour: CSS-mappable effects (inner glow, solid color overlay from explicit Broadset intent, gradient overlay) emit natively; PSD-only effects (bevel / emboss, satin, pattern overlay) ride in `extensions.psd.unmappedEffects` with `dirty: false` so untouched re-export is byte-identical.
- **CMYK / Lab / Grayscale + ICC profile round-trip.** Current behaviour: RGB 8-bit only on the current exporter path; preflight surfaces a warning when `document.outputIntent.colorSpace` is non-RGB. Target behaviour: colour mode follows `document.outputIntent.colorSpace`; embedded ICC profile rides via the asset pipeline (`IccProfileAsset` from P4.4 is ready).
- **16-bit / 32-bit-per-channel import preservation.** Current behaviour: bit depth is always 8. Target behaviour: import preserves original depth for re-export (downsampled for rendering).
- **Real third-party fixture corpus.** Current behaviour: programmatically-generated `producer-quirks.fixture.ts` exercises the importer + validator on seven synthetic shapes; the `__fixtures__/external/` directory is the local-extension contract for users who drop in real Photoshop / Affinity / GIMP / Krita / Figma exports. Target behaviour: a vendored corpus comparable to veraPDF's once an analogous open-source PSD test corpus exists.
- **`PsdExportOptions.linkSmartObjects: false` (linked → embedded).** Current behaviour: `exportPsdBytes` / `exportPsdBytesAsync` accept the option and `exportPsdBytesAsyncWithPreflight` surfaces a warning, but the writer always emits linked smart objects via `psd.linkedFiles` / `pushPendingLinkedFile`. Target behaviour: when `false`, embed the smart-object bytes directly into the placed-layer chunk so the PSD has no external linked-file dependency. The change is a >50-line ripple through `psd/export/state.ts` + `psd/export/image.ts`.
- **Importer caps unwired (audit 2026-04-29).** [`importPsdDocument(data: Uint8Array)`](../../../packages/formats/src/psd/import-document.ts) accepts no options; the typed `PsdImportOptions { maxDepth, maxBytes, warnOnPreservation }` exported from the barrel is never plumbed through. Target behaviour: thread `PsdImportOptions` into `importPsdDocument` and enforce a default 200 MiB byte cap and 100 depth cap (parity with PPTX). Surfaced by [project/implementation/sister-format-audit.md](../../implementation/sister-format-audit.md) PSD Lazy-boundary §1.
- **Unmapped-layer-type silent drop (audit 2026-04-29).** [`packages/formats/src/psd/import.ts:296-340`](../../../packages/formats/src/psd/import.ts) `layerToElement` falls through to an empty-rectangle emission for adjustment / smart-filter / 3D / video layer types with no warning, violating IO-D-18. Target behaviour: emit a `psd-import: layer "${layer.name}" mapped as placeholder rectangle (no native mapping)` warning honoring `PsdImportOptions.warnOnPreservation` once it is wired. Surfaced by sister-format-audit.md PSD Silent drops §1.
- **XMP packet ↔ layer reconciliation by index (audit 2026-04-29).** [`packages/formats/src/psd/import.ts:451-467`](../../../packages/formats/src/psd/import.ts) pairs XMP elements to imported elements by array index; size mismatches silently drop trailing entries. Target behaviour: warn `psd-import: XMP packet declares N elements, layer tree yielded M; trailing entries in the smaller list were ignored` and switch to id-based pairing where the layer carries a `BsPs` round-trip tag. Surfaced by sister-format-audit.md PSD Silent drops §2.
- **Import-side ag-psd error context dropped (audit 2026-04-29).** [`packages/formats/src/psd/import-document.ts:64-68`](../../../packages/formats/src/psd/import-document.ts) catches and discards the underlying parser error message. Target behaviour: surface `MALFORMED_PSD_WARNING` with the wrapped `err.message` so support can diagnose third-party PSDs that fail. Surfaced by sister-format-audit.md PSD Silent drops §3.
- **Async URL-image fetch unbounded (audit 2026-04-29).** [`packages/formats/src/psd/export.ts:90-107`](../../../packages/formats/src/psd/export.ts) `fetchImageAsBytes` calls `fetchFn(url)` with no timeout, no byte cap, no AbortSignal, no scheme allowlist. Target behaviour: add `imageFetchTimeoutMs` (default 10 s) and `maxImageBytes` (default 10 MiB) to `ExportPsdAsyncOptions` (parity with PPTX `fontFetchTimeoutMs`/`fontMaxBytes`); route timeout / over-cap failures through the warning collector with structured codes. Surfaced by sister-format-audit.md PSD Async resource resolvers §1.

_The following items are intentionally scoped out of the PSD track and tracked by other specs:_

- Run-edit UI, ICC picker, export options modal, import warnings modal, reconciliation diff view — covered by the io-prereqs Phase 5 UI spec under [project/spec/ui/](../ui/) and interleaved during PSD Phase 2b per the plan.
- External-tool fixture corpus and chain CT harness — covered by the io-prereqs Phase 6 testing infrastructure, landed during this track at first need.

---

## Non-Goals

- **Photoshop actions / history states** — not exported, not imported.
- **3D layers** — not supported (out of scope for Broadset's 2D canvas model).
- **Video layers inside PSD** — Broadset uses its own `video` element type; inline PSD video frames are not round-tripped.
- **Animation frames** — Broadset uses its own animation system (`animations` array); Photoshop timeline / frame animations are not mapped.
- **Scripting events / ExtendScript** — no executable content is emitted or interpreted.
- **Print output intents beyond ICC profile round-trip** — separation plates, trapping, and imposition are out of scope.
- **PDF generation** — see [pdf.md](pdf.md).
- **PPTX format** — see [pptx.md](pptx.md).
