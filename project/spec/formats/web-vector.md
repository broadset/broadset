# Formats — Web & Vector Specification

## Purpose

Defines SVG export/import and standalone HTML export with embedded animation runtime. SVG export produces valid SVG markup from a document. SVG import parses SVG markup back into document elements. HTML export produces a self-contained HTML file with embedded playback runtime for browser playback.

---

## Requirements

### Requirement: SVG Path Export

The system MUST export path elements as SVG `<path>` nodes with `d` attribute, stroke, and fill attributes.

#### Scenario: Path with stroke

- GIVEN a path element with `d="M0,0 L40,20 Z"` and stroke `#ff0000`
- WHEN exported to SVG
- THEN the output contains `<path id="..." d="M0,0 L40,20 Z"` with `stroke="#ff0000"`

#### Acceptance Criteria

- [ ] Given a path element with `d="M0,0 L40,20 Z"` and stroke `#ff0000`, the output contains `<path id="..." d="M0,0 L40,20 Z"` with `stroke="#ff0000"`

---

### Requirement: SVG Clip-Path Export

The system MUST export custom clip-path masks as SVG `<clipPath>` definitions in `<defs>` and reference them via `clip-path="url(#...)"`.

#### Scenario: Image with custom clip

- GIVEN an image with a custom clip-path
- WHEN exported to SVG
- THEN `<clipPath>` is in defs and the image references it

#### Acceptance Criteria

- [ ] Given an image with a custom clip-path, `<clipPath>` is in defs and the image references it

---

### Requirement: SVG Text, Image, and Rotation Export

The system MUST export text as `<text>` elements, images with `href`, and rotation as `rotate()` transforms.

#### Scenario: Mixed text and rotated image

- GIVEN text and a rotated image element
- WHEN exported to SVG
- THEN output contains `<text>` with content and `<image>` with `rotate(...)` transform

#### Acceptance Criteria

- [ ] Given text and a rotated image element, output contains `<text>` with content and `<image>` with `rotate(...)` transform

---

### Requirement: SVG Inline Payload Embedding

The system MUST embed inline SVG payload content directly (including foreignObject) rather than converting to data URIs.

#### Scenario: foreignObject preserved

- GIVEN an SVG element with inline SVG content containing foreignObject
- WHEN exported
- THEN the output contains `<foreignObject>` and does NOT contain `href="data:image/svg+xml;utf8,"`

#### Acceptance Criteria

- [ ] Given an SVG element with inline SVG content containing foreignObject, the output contains `<foreignObject>` and does NOT contain `href="data:image/svg+xml;utf8,"`

---

### Requirement: SVG Import

The system MUST parse SVG markup into document elements. Rectangles MUST recover dimensions and transform translation/rotation. Paths MUST recover `d` data, stroke, and fill. Clip-path references MUST be resolved from `<defs>`. ViewBox dimensions MUST be used when width/height attributes are absent.

#### Scenario: Rectangle with transform

- GIVEN SVG with `<rect>` and `translate(10,20) rotate(45)`
- WHEN imported
- THEN element has type `rectangle`, translated position, and rotation 45

#### Scenario: Path with clip-path from defs

- GIVEN SVG with `<path>` referencing a `<clipPath>` in defs
- WHEN imported
- THEN element has type `path` with correct content and custom clip-path

#### Scenario: ViewBox fallback dimensions

- GIVEN SVG with only `viewBox` (no width/height)
- WHEN imported
- THEN document dimensions come from viewBox

#### Acceptance Criteria

- [ ] Given SVG with `<rect>` and `translate(10,20) rotate(45)`, element has type `rectangle`, translated position, and rotation 45
- [ ] Given SVG with `<path>` referencing a `<clipPath>` in defs, element has type `path` with correct content and custom clip-path
- [ ] Given SVG with only `viewBox` (no width/height), document dimensions come from viewBox

---

### Requirement: SVG Import Fallback Preservation

The system MUST convert native SVG primitives (rect, path) to native element types. Unsupported fragments (foreignObject, complex groups with transforms) MUST be preserved as SVG payload elements.

#### Scenario: Mixed native and unsupported

- GIVEN SVG with `<rect>` and `<foreignObject>`
- WHEN imported
- THEN rect becomes `rectangle` type and foreignObject becomes `svg` type with preserved markup

#### Scenario: Transformed groups preserved

- GIVEN SVG with `<g transform="matrix(...)">` containing children
- WHEN imported
- THEN the group becomes an `svg` type element with full markup preserved

#### Acceptance Criteria

- [ ] Given SVG with `<rect>` and `<foreignObject>`, rect becomes `rectangle` type and foreignObject becomes `svg` type with preserved markup
- [ ] Given SVG with `<g transform="matrix(...)">` containing children, the group becomes an `svg` type element with full markup preserved

---

### Requirement: HTML Standalone Export

The system MUST generate a self-contained HTML document that embeds the playback runtime, serialized animation registry, and element markup. Elements MUST have `data-element-id` attributes for animation targeting. The HTML shell MUST include a `#canvas` container positioned with `transform-origin: top left`, and the runtime MUST scale the canvas to fit the viewport on load and on window resize by computing `Math.min(viewportWidth / baseWidth, viewportHeight / baseHeight)` and applying it as a CSS scale transform. The document MUST use `overflow: hidden` on the body to prevent scrollbars.

#### Scenario: Animation runtime embedded

- GIVEN a document with animation registry
- WHEN exported to HTML
- THEN output contains `requestAnimationFrame`, easing functions, and serialized registry JSON

#### Scenario: Element IDs for targeting

- GIVEN a document with elements
- WHEN exported to HTML
- THEN output contains `data-element-id=` attributes

#### Scenario: SVG and path elements rendered

- GIVEN SVG and path elements with clip-path styles
- WHEN exported to HTML
- THEN inline SVG markup is rendered and clip-path styles are applied

#### Scenario: Group hierarchy with 3D transforms

- GIVEN rotated and 3D-transformed group elements
- WHEN exported to HTML
- THEN group hierarchy and transform styles are preserved

#### Acceptance Criteria

- [ ] Given a document with animation registry, output contains `requestAnimationFrame`, easing functions, and serialized registry JSON
- [ ] Given a document with elements, output contains `data-element-id=` attributes
- [ ] Given SVG and path elements with clip-path styles, inline SVG markup is rendered and clip-path styles are applied
- [ ] Given rotated and 3D-transformed group elements, group hierarchy and transform styles are preserved
- [ ] Given the HTML output, a `#canvas` container is positioned with `transform-origin: top left`
- [ ] Given a viewport resize, the runtime scales the canvas to fit using min(viewportWidth/baseWidth, viewportHeight/baseHeight)
- [ ] Given the HTML body, overflow is hidden to prevent scrollbars

---

### Requirement: HTML Runtime Feature Parity

The embedded HTML runtime MUST include OKLab color interpolation, SVG path morphing with command coordinate lookup, action state support (setState, addModifier, removeModifier), cubic-bezier and step easing, from-keyframe interpolation direction, and serialized animation registry with base width.

#### Scenario: OKLab color pipeline

- GIVEN the generated runtime
- WHEN inspected
- THEN it contains srgbToLinear, linearToSrgb, rgbToOklab, oklabToRgb functions

#### Scenario: Path morphing support

- GIVEN the generated runtime
- WHEN inspected
- THEN it contains COMMAND_COORDS table and reassemblePath function

#### Scenario: Easing support

- GIVEN the generated runtime
- WHEN inspected
- THEN it contains cubicBezierY Newton solver and easeStep function

#### Acceptance Criteria

- [ ] Given the generated runtime, it contains srgbToLinear, linearToSrgb, rgbToOklab, oklabToRgb functions
- [ ] Given the generated runtime, it contains COMMAND_COORDS table and reassemblePath function
- [ ] Given the generated runtime, it contains cubicBezierY Newton solver and easeStep function

---

### Requirement: SVG Import Error Recovery

When importing SVG content that contains malformed or unsupported elements, the importer MUST skip invalid elements and continue processing the remainder of the document. The importer MUST return a list of warnings describing skipped elements. A completely unparseable SVG input (not valid XML) MUST result in an import failure with a descriptive error message.

#### Scenario: Partially invalid SVG skips bad elements

- GIVEN an SVG with 10 valid elements and 2 with unsupported attributes
- WHEN import runs
- THEN 10 elements are imported and 2 warnings are returned

#### Scenario: Completely invalid XML fails with error

- GIVEN an SVG string that is not valid XML
- WHEN import runs
- THEN the import fails with a descriptive error

#### Scenario: Unsupported element type skipped with warning

- GIVEN an SVG with an unsupported element type (e.g., `<foreignObject>` in a non-payload context)
- WHEN import runs
- THEN the element is skipped and a warning is returned

#### Acceptance Criteria

- [ ] Given partially invalid SVG input, valid elements are imported and invalid ones are skipped
- [ ] Given partially invalid SVG input, warnings are returned for skipped elements
- [ ] Given completely invalid XML input, import fails with a descriptive error

---

## Spec Gaps

- [ ] **SVG Import Error Recovery:** No automated tests verify that the importer returns a warnings list for skipped elements, or that completely invalid XML produces a descriptive import failure.

---

## Non-Goals

- PDF generation → see [pdf.md](pdf.md)
- PPTX format → see [pptx.md](pptx.md)
- PSD format → see [psd.md](psd.md)
