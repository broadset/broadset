# Formats — PSD Specification

## Purpose

Defines Photoshop (PSD) export and import, including layer structure, vector masks, clip-path masks, layer effects, blend modes, smart object embedding, artboard pages, text layers, and SVG path-to-vector-mask conversion.

---

## Requirements

### Requirement: PSD Path Layer Export

The system MUST export open SVG paths as open, stroke-only PSD layers. Closed paths MUST be exported as filled layers.

#### Scenario: Open path exported stroke-only

- GIVEN a path element with an open SVG path
- WHEN exported to PSD
- THEN the layer is marked open and stroke-only

#### Acceptance Criteria

- [ ] Given a path element with an open SVG path, the layer is marked open and stroke-only

---

### Requirement: PSD Clip-Path Mask Export

The system MUST write clip-path masks as boolean intersect vector masks for rectangle and ellipse layers. Raster layers with clip-paths MUST use vector masks. Custom clip-path polygons MUST use absolute PSD coordinates.

#### Scenario: Rectangle/ellipse clip-path mask

- GIVEN rectangle and ellipse elements with clip-paths
- WHEN exported to PSD
- THEN boolean intersect masks are written

#### Scenario: Raster layer vector mask

- GIVEN an image element with a clip-path
- WHEN exported to PSD
- THEN a vector mask is applied to the raster layer

#### Acceptance Criteria

- [ ] Given rectangle and ellipse elements with clip-paths, boolean intersect masks are written
- [ ] Given an image element with a clip-path, a vector mask is applied to the raster layer

---

### Requirement: PSD Border Radius Export

The system MUST export `borderRadius` as rounded rectangle vector masks while preserving clip intersection masks.

#### Scenario: Rounded rectangle with clip

- GIVEN a rectangle with borderRadius and a clip-path
- WHEN exported to PSD
- THEN both the rounded mask and clip intersection are present

#### Acceptance Criteria

- [ ] Given a rectangle with borderRadius and a clip-path, both the rounded mask and clip intersection are present

---

### Requirement: PSD Layer Effects Export

The system MUST export CSS shadows, strokes, and filter glows as PSD layer effects. CSS `mixBlendMode` MUST map to PSD blend modes.

#### Scenario: Shadow and glow effects

- GIVEN elements with boxShadow and filter glow
- WHEN exported to PSD
- THEN layer effects contain shadows and glows

#### Scenario: Blend mode mapping

- GIVEN elements with various CSS mixBlendMode values
- WHEN exported to PSD
- THEN PSD blendMode matches the CSS value

#### Acceptance Criteria

- [ ] Given elements with boxShadow and filter glow, layer effects contain shadows and glows
- [ ] Given elements with various CSS mixBlendMode values, PSD blendMode matches the CSS value

---

### Requirement: PSD Smart Object Export

The system MUST export image content (data URIs and URLs) as embedded smart object linked files.

#### Scenario: Data URI image as smart object

- GIVEN an image element with data URI content
- WHEN exported to PSD
- THEN a smart object linked file is embedded

#### Scenario: URL image fetched and embedded

- GIVEN an image element with a URL and fetch available
- WHEN exported to PSD
- THEN the image is fetched and embedded as a smart object

#### Acceptance Criteria

- [ ] Given an image element with data URI content, a smart object linked file is embedded
- [ ] Given an image element with a URL and fetch available, the image is fetched and embedded as a smart object

---

### Requirement: PSD Artboard and Text Export

The system MUST export multiple pages as PSD artboards. Text elements MUST be exported as PSD text layers.

#### Scenario: Multi-page artboards

- GIVEN a document with multiple pages
- WHEN exported to PSD
- THEN each page becomes a PSD artboard

#### Scenario: Text layer export

- GIVEN a text element
- WHEN exported to PSD
- THEN the PSD contains a text layer with the correct content

#### Acceptance Criteria

- [ ] Given a document with multiple pages, each page becomes a PSD artboard
- [ ] Given a text element, the PSD contains a text layer with the correct content

---

### Requirement: PSD Import

The system MUST import PSD layer effects to CSS shadows/stroke/filters, blend modes to `mixBlendMode`, smart objects to data URI images, shape fill alpha to backgroundColor opacity, rounded rectangle masks to `borderRadius`, raster vector masks to custom clip-paths, stroked open shapes to path elements, and artboards to pages.

#### Scenario: Layer effects to CSS

- GIVEN a PSD with shadow and glow layer effects
- WHEN imported
- THEN elements have corresponding CSS shadow and filter properties

#### Scenario: Smart object import

- GIVEN a PSD with embedded smart object bytes
- WHEN imported
- THEN the element has a data URI image content

#### Scenario: Rounded rectangle mask import

- GIVEN a PSD with rounded rectangle vector masks
- WHEN imported
- THEN `style.borderRadius` is set with rescaled values

#### Scenario: Artboard to page mapping

- GIVEN a PSD with multiple artboards
- WHEN imported
- THEN each artboard becomes a document page

#### Scenario: Opacity/radius round-trip fidelity

- GIVEN exported PSD with opacity and border radius
- WHEN round-tripped
- THEN values are preserved

#### Acceptance Criteria

- [ ] Given a PSD with shadow and glow layer effects, elements have corresponding CSS shadow and filter properties
- [ ] Given a PSD with embedded smart object bytes, the element has a data URI image content
- [ ] Given a PSD with rounded rectangle vector masks, `style.borderRadius` is set with rescaled values
- [ ] Given a PSD with multiple artboards, each artboard becomes a document page
- [ ] Given exported PSD with opacity and border radius, values are preserved

---

### Requirement: PSD Path Vector Conversion

The system MUST build closed PSD vector masks from line path data and cubic segments from bezier commands. Unsupported or invalid path data MUST return null. Coordinate scale factors MUST be applied before offsets.

#### Scenario: Closed line path mask

- GIVEN line path SVG data
- WHEN converted to PSD vector mask
- THEN a closed vector mask with correct knots is produced

#### Scenario: Bezier cubic segments

- GIVEN bezier SVG command data
- WHEN converted
- THEN cubic segments with control points are produced

#### Scenario: Invalid path returns null

- GIVEN unsupported or invalid SVG path data
- WHEN conversion is attempted
- THEN the result is null

#### Acceptance Criteria

- [ ] Given line path SVG data, a closed vector mask with correct knots is produced
- [ ] Given bezier SVG command data, cubic segments with control points are produced
- [ ] Given unsupported or invalid SVG path data, the result is null

---

### Requirement: Animated Element Static Export

When exporting to PSD, animated elements MUST be exported at their default/rest state (t=0, no active states, no modifiers applied). Animation data is not representable in PSD format and MUST be discarded.

#### Scenario: Animation timelines discarded at export

- GIVEN an element with animation timelines
- WHEN PSD export runs
- THEN the element is rendered with its base properties at t=0

#### Acceptance Criteria

- [ ] Given an animated element, PSD export renders it at default/rest state (t=0)

---

## Spec Gaps

- [x] **Animated Element Static Export:** Automated tests verify animated elements export at t=0 rest state and that timeline animation data is not represented in PSD output (`packages/formats/src/psd/import-vector-animated-url.test.ts`).

---

## Non-Goals

- PDF generation → see [pdf.md](pdf.md)
- PPTX format → see [pptx.md](pptx.md)
