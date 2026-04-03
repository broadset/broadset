# Model — Utilities Specification

## Purpose

Defines model utility behavior for document cloning, built-in element capability profiles, and clip-path path-string normalization. This domain provides contract-level helpers for safe document duplication and consistent capability/clip-path interpretation. It does NOT define document schema invariants or animation playback behavior. See [conventions](../../README.md).

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

The system MUST expose deterministic capability profiles for built-in element kinds, and unknown kinds MUST resolve to a fully disabled capability profile.

#### Scenario: Built-in kinds have defined capability profiles

- GIVEN the built-in element kinds
- WHEN their capability profiles are requested
- THEN each built-in kind has a defined profile

#### Scenario: Unknown kind uses disabled defaults

- GIVEN an unknown or empty element kind
- WHEN its capability profile is requested
- THEN all capability flags are disabled

#### Scenario: Capability profile shape is stable

- GIVEN a capability profile for a built-in kind
- WHEN the profile keys are inspected
- THEN every expected capability key is present and boolean-valued

#### Acceptance Criteria

- [ ] Given the built-in element kinds, each built-in kind has a defined profile
- [ ] Given an unknown or empty element kind, all capability flags are disabled
- [ ] Given a capability profile for a built-in kind, every expected capability key is present and boolean-valued

---

### Requirement: Clip-Path Path Value Normalization

The system MUST parse and serialize CSS `path(...)` clip values consistently, and MUST preserve non-path clip values when path-scaling is requested.

#### Scenario: Path clip values parse from quoted and unquoted forms

- GIVEN `path("...")`, `path('...')`, and `path(...)` inputs
- WHEN parsed
- THEN raw path data is returned

#### Scenario: Non-path clip values are not parsed as path data

- GIVEN a non-path clip value
- WHEN parsed
- THEN the result is null

#### Scenario: Path serialization and zoom scaling are deterministic

- GIVEN raw path data and a zoom factor
- WHEN serialized and scaled
- THEN escaped serialization is valid and scaled coordinates are rounded consistently

#### Scenario: Default clip path has non-zero dimensions

- GIVEN zero or positive width/height values
- WHEN a default clip path is generated
- THEN the generated path uses rectangle geometry with minimum non-zero dimensions

#### Acceptance Criteria

- [ ] Given `path("...")`, `path('...')`, and `path(...)` inputs, raw path data is returned
- [ ] Given a non-path clip value, the result is null
- [ ] Given raw path data and a zoom factor, escaped serialization is valid and scaled coordinates are rounded consistently
- [ ] Given zero or positive width/height values, the generated path uses rectangle geometry with minimum non-zero dimensions

---

### Requirement: Pixel–Millimetre Unit Conversion

The system MUST convert between pixels and millimetres using 96 DPI as the standard web resolution. Pixel-to-millimetre conversion MUST use the formula `px × (25.4 / 96)`. Millimetre-to-pixel conversion MUST use the formula `mm × (96 / 25.4)`.

#### Scenario: px to mm

- GIVEN a pixel value of 96
- WHEN converted to millimetres
- THEN the result is 25.4

#### Scenario: mm to px

- GIVEN a millimetre value of 25.4
- WHEN converted to pixels
- THEN the result is 96

#### Acceptance Criteria

- [ ] Given 96 pixels, the millimetre result is 25.4
- [ ] Given 25.4 millimetres, the pixel result is 96
- [ ] Given 0 pixels, the millimetre result is 0

---

### Requirement: Edge Anchor Inference

The system MUST compute anchorX (`left` or `right`) and anchorY (`top` or `bottom`) by comparing the element's center-point to the canvas center-point. If the element center is left of the canvas center, anchorX MUST be `left`; otherwise `right`. If the element center is above the canvas center, anchorY MUST be `top`; otherwise `bottom`.

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
