# Model — Utilities Specification

## Purpose

Defines model utility behavior for canonical document cloning, derived capability profiles, boundary length parsing, surface-unit conversion, typed clip conversion, and runtime anchor inference.

---

## Requirements

### Requirement: Document Clone Fidelity

The system MUST return a deep-equal document clone that is structurally independent from the source document.

#### Scenario: Clone preserves all document data

- GIVEN a valid document with metadata, elements, and nested element fields
- WHEN the document is cloned
- THEN the cloned document equals the source document by value

#### Scenario: Clone is structurally independent

- GIVEN a document with nested element fields and element arrays
- WHEN the document is cloned
- THEN nested objects and arrays in the clone are distinct references from the source

#### Acceptance Criteria

- [ ] Given a valid document with metadata, elements, and nested element fields, the cloned document equals the source document by value
- [ ] Given a document with nested element fields and element arrays, nested objects and arrays in the clone are distinct references from the source

---

### Requirement: Built-In Capability Profiles

The system MUST expose deterministic capability profiles for every canonical core element kind and vector payload subtype. Unregistered plugin elements resolve to fully disabled defaults; unknown core discriminants fail structural validation.

#### Scenario: Built-in kinds have defined capability profiles

- GIVEN the built-in element kinds and vector geometry subtypes
- WHEN their capability profiles are requested
- THEN each built-in kind has a defined profile

#### Scenario: Unknown kind uses disabled defaults

- GIVEN an unregistered plugin element
- WHEN its capability profile is requested
- THEN all capability flags are disabled

#### Scenario: Capability profile shape is stable

- GIVEN a capability profile for a built-in kind
- WHEN the profile keys are inspected
- THEN every expected capability key is present and boolean-valued

#### Acceptance Criteria

- [ ] Given the built-in element kinds and vector subtypes, each has a defined profile
- [ ] Given an unregistered plugin element, all capability flags are disabled
- [ ] Given an unknown core discriminant, structural validation fails
- [ ] Given a capability profile for a built-in kind, every expected capability key is present and boolean-valued

---

### Requirement: Boundary CSS Clip Conversion

Import/UI boundary utilities MAY parse CSS `path(...)` values consistently, but MUST convert accepted geometry into a typed vector clip source with stable point/segment IDs before project mutation. Serialization back to CSS is an output-boundary operation derived from typed geometry. Non-path CSS values remain unparsed and may be preserved through interop; no CSS clip string enters canonical appearance.

#### Scenario: Path clip values parse from quoted and unquoted forms

- GIVEN `path("...")`, `path('...')`, and `path(...)` inputs
- WHEN parsed
- THEN raw transport path data is returned to the boundary converter and converted to structured geometry before commit

#### Scenario: Non-path clip values are not parsed as path data

- GIVEN a non-path clip value
- WHEN parsed
- THEN the result is null

#### Scenario: Path serialization and zoom scaling are deterministic

- GIVEN raw path data and a zoom factor
- WHEN converted to structured geometry, scaled, and serialized for output
- THEN typed coordinates scale deterministically and output escaping is valid

#### Scenario: Default clip path has non-zero dimensions

- GIVEN zero or positive width/height values
- WHEN a default typed clip source is generated
- THEN it uses vector rectangle geometry with minimum non-zero bounds and a fresh stable ID

#### Acceptance Criteria

- [ ] Given `path("...")`, `path('...')`, and `path(...)` inputs, boundary parsing succeeds and canonical commit uses structured vector geometry
- [ ] Given a non-path clip value, the result is null
- [ ] Given raw path data and a zoom factor, typed scaling is deterministic and output serialization is valid
- [ ] Given zero or positive requested width/height values, the generated vector clip source uses minimum non-zero bounds
- [ ] Given any accepted CSS clip input, no CSS string is persisted in canonical project data

---

### Requirement: Pixel–Millimetre Unit Conversion

The system MUST convert between pixels and millimetres using the active document's positive `surface.dpi`. Pixel-to-millimetre conversion MUST use `px × (25.4 / dpi)` and millimetre-to-pixel conversion MUST use `mm × (dpi / 25.4)`.

#### Scenario: px to mm at 96 DPI

- GIVEN a pixel value of 96 and `surface.dpi: 96`
- WHEN converted to millimetres
- THEN the result is 25.4

#### Scenario: mm to px at 96 DPI

- GIVEN a millimetre value of 25.4 and `surface.dpi: 96`
- WHEN converted to pixels
- THEN the result is 96

#### Scenario: px to mm at 300 DPI

- GIVEN a pixel value of 300 and `surface.dpi: 300`
- WHEN converted to millimetres
- THEN the result is 25.4

#### Acceptance Criteria

- [ ] Given 96 pixels at 96 DPI, the millimetre result is 25.4
- [ ] Given 25.4 millimetres at 96 DPI, the pixel result is 96
- [ ] Given 0 pixels, the millimetre result is 0
- [ ] Given 300 pixels at 300 DPI, the millimetre result is 25.4

---

### Requirement: Cross-Unit Length Conversion

The system MUST convert between pixels and PostScript points using `surface.dpi` via `px × (72 / dpi)` and `pt × (dpi / 72)`. Inches and millimetres use `1 in = 25.4 mm` without DPI. `em` values convert against a caller-supplied base font size through `em × fontSizePx`. Each helper preserves sign and returns 0 for zero input.

#### Scenario: px to pt at 96 DPI

- GIVEN a pixel value of 96 and `surface.dpi: 96`
- WHEN converted to points
- THEN the result is 72

#### Scenario: pt to px at 300 DPI

- GIVEN a point value of 72 and `surface.dpi: 300`
- WHEN converted to pixels
- THEN the result is 300

#### Scenario: inch to mm round-trip

- GIVEN a value of 1 inch
- WHEN converted to millimetres and back to inches
- THEN the intermediate value is 25.4 and the round-trip result is 1

#### Scenario: em to px against a base font size

- GIVEN an em value of 1.5 and a base font size of 16 pixels
- WHEN converted to pixels
- THEN the result is 24

#### Acceptance Criteria

- [ ] Given 96 pixels at 96 DPI, the point result is 72
- [ ] Given 72 points at 300 DPI, the pixel result is 300
- [ ] Given 1 inch, the millimetre result is 25.4
- [ ] Given 25.4 millimetres, the inch result is 1
- [ ] Given 1.5 em at base font size 16 px, the pixel result is 24
- [ ] Given a negative em value, the pixel result preserves the sign

---

### Requirement: Unit-Aware Length Parsing

The system MUST parse user-typed length strings of the form `<number><unit>` into a structured `{ value, unit }` pair, where `unit` is one of `px | mm | in | pt | em`. Leading and trailing whitespace, a single optional whitespace between the number and the unit, and uppercase unit suffixes MUST be tolerated. Signed decimals (e.g. `-12px`, `+0.5mm`), fractional values (e.g. `0.5in`), and leading-dot fractions (e.g. `.25pt`) MUST parse. Inputs that do not match the supported grammar — empty strings, unit-less numbers, unknown units (including `cm`), or malformed decimals — MUST return `null`; the parser MUST NOT silently coerce invalid input to a default unit.

#### Scenario: integer with unit

- GIVEN the input `"24px"`
- WHEN parsed
- THEN the result is `{ value: 24, unit: 'px' }`

#### Scenario: decimal with unit

- GIVEN the input `"0.5in"`
- WHEN parsed
- THEN the result is `{ value: 0.5, unit: 'in' }`

#### Scenario: signed decimal

- GIVEN the input `"-12px"`
- WHEN parsed
- THEN the result is `{ value: -12, unit: 'px' }`

#### Scenario: whitespace and uppercase

- GIVEN the input `"  24 PX  "`
- WHEN parsed
- THEN the result is `{ value: 24, unit: 'px' }`

#### Scenario: invalid input

- GIVEN an input without a recognised unit suffix (e.g. `"24"`, `"24cm"`, `""`)
- WHEN parsed
- THEN the result is `null`

#### Acceptance Criteria

- [ ] Given `"24px"`, the result is `{ value: 24, unit: 'px' }`
- [ ] Given `"0.5in"`, the result is `{ value: 0.5, unit: 'in' }`
- [ ] Given `".25pt"`, the result is `{ value: 0.25, unit: 'pt' }`
- [ ] Given `"-12px"`, the result is `{ value: -12, unit: 'px' }`
- [ ] Given `"+0.5mm"`, the result is `{ value: 0.5, unit: 'mm' }`
- [ ] Given `"  24 PX  "`, the result is `{ value: 24, unit: 'px' }`
- [ ] Given `"24"` (missing unit), the result is `null`
- [ ] Given `"24cm"` (unsupported unit), the result is `null`
- [ ] Given `""` or `"abc"`, the result is `null`

---

### Requirement: Edge Anchor Inference

The system MUST compute anchorX (`left` or `right`) and anchorY (`top` or `bottom`) by comparing the element's center-point to the canvas center-point. This is a **runtime-only** helper used by the editor for responsive positioning — anchor values are NOT serialized in the document model (the `screen` object no longer exists). If the element center is left of the canvas center, anchorX MUST be `left`; otherwise `right`. If the element center is above the canvas center, anchorY MUST be `top`; otherwise `bottom`.

#### Scenario: Element in top-left quadrant

- GIVEN an element at (0, 0) with size 50×50 on a 200×200 canvas
- WHEN edge anchors are computed
- THEN anchorX is `left` and anchorY is `top`

#### Scenario: Element in bottom-right quadrant

- GIVEN an element at (150, 150) with size 50×50 on a 200×200 canvas
- WHEN edge anchors are computed
- THEN anchorX is `right` and anchorY is `bottom`

#### Scenario: Element centered on canvas

- GIVEN an element whose center coincides with the canvas center
- WHEN edge anchors are computed
- THEN anchorX is `right` and anchorY is `bottom` (ties go to right/bottom)

#### Acceptance Criteria

- [ ] Given an element in the top-left quadrant, anchorX is left and anchorY is top
- [ ] Given an element in the bottom-right quadrant, anchorX is right and anchorY is bottom
- [ ] Given an element centered on the canvas, anchorX is right and anchorY is bottom

---

## Spec Gaps

_None — all requirements have acceptance criteria._

---

## Non-Goals

- Document schema validation and invariants → see [spec.md](spec.md)
- Editor-side path drawing/editing workflows → see `project/spec/editor/editing.md`
- Renderer clip-path rendering behavior → see `project/spec/renderer/spec.md`
