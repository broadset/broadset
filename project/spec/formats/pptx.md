# Formats — PPTX Specification

## Purpose

Defines PowerPoint (PPTX) export and import, including SVG picture fallback for styled shapes, native shape export, path recovery from fallback media, and round-trip fidelity.

---

## Requirements

### Requirement: PPTX Export with SVG Picture Fallback

The system MUST export styled rectangles (with gradients, box-shadow, or complex borders) as SVG picture fallback media and register the SVG media content type. Simple rectangles without complex styles MUST be exported as native PPTX shapes.

#### Scenario: Styled rectangle uses SVG fallback

- GIVEN a rectangle with gradient background
- WHEN exported to PPTX
- THEN the slide contains SVG picture media with correct content type

#### Scenario: Simple rectangle uses native shape

- GIVEN a rectangle with only solid background
- WHEN exported to PPTX
- THEN the slide contains a native shape without picture fallback

#### Scenario: Non-uniform corner radii use fallback

- GIVEN a rectangle with per-corner border radii
- WHEN exported to PPTX
- THEN SVG picture fallback is used

#### Acceptance Criteria

- [ ] Given a rectangle with gradient background, the slide contains SVG picture media with correct content type
- [ ] Given a rectangle with only solid background, the slide contains a native shape without picture fallback
- [ ] Given a rectangle with per-corner border radii, SVG picture fallback is used

---

### Requirement: PPTX Text, Image, and Group Export

The system MUST export text content, image relationships, and grouped children. Inline SVG payload fragments (including foreignObject) MUST be preserved in the exported media.

#### Scenario: Text and image export

- GIVEN a document with text, image, and grouped elements
- WHEN exported to PPTX
- THEN text content, image relationships, and group hierarchy are present

#### Scenario: Inline SVG with foreignObject preserved

- GIVEN an SVG element with foreignObject content
- WHEN exported to PPTX
- THEN the SVG media contains the foreignObject fragment

#### Acceptance Criteria

- [ ] Given a document with text, image, and grouped elements, text content, image relationships, and group hierarchy are present
- [ ] Given an SVG element with foreignObject content, the SVG media contains the foreignObject fragment

---

### Requirement: PPTX Import with Path Recovery

The system MUST import rectangle, text, and image shapes from PPTX slides. When SVG fallback media contains high-confidence path data (a single `<path>` element without complex fills, filters, or multiple shapes), the system MUST recover the original path intent — extracting the `d` attribute, computing tight bounds, and creating a native path-type element. Ambiguous SVG media (multiple shapes, foreign objects, complex structure) MUST be preserved as SVG payload elements.

#### Scenario: Basic shape import

- GIVEN an exported PPTX with rectangle, text, and image
- WHEN imported
- THEN all three element types are recovered

#### Scenario: High-confidence path recovery

- GIVEN SVG fallback media containing a simple path
- WHEN imported
- THEN the element is recovered as a native path type

#### Scenario: Ambiguous SVG preserved

- GIVEN SVG fallback media with complex/ambiguous content
- WHEN imported
- THEN the element is preserved as an SVG payload type

#### Acceptance Criteria

- [ ] Given an exported PPTX with rectangle, text, and image, all three element types are recovered
- [ ] Given SVG fallback media containing a single path element, the element is recovered as a native path type with extracted d attribute and computed bounds
- [ ] Given SVG fallback media with multiple shapes or complex structure, the element is preserved as an SVG payload type

---

### Requirement: PPTX Round-Trip Fidelity

The system MUST preserve element count, rectangle position/dimensions (within tolerance), and text content across export→import round-trips.

#### Scenario: Element count preserved

- GIVEN a document with multiple elements
- WHEN round-tripped through PPTX export→import
- THEN the element count matches

#### Scenario: Rectangle position within tolerance

- GIVEN a positioned rectangle
- WHEN round-tripped
- THEN position and dimensions are within PPTX tolerance

#### Scenario: Text content preserved

- GIVEN a text element with content
- WHEN round-tripped
- THEN the text content matches

#### Acceptance Criteria

- [ ] Given a document with multiple elements, the element count matches
- [ ] Given a positioned rectangle, position and dimensions are within PPTX tolerance
- [ ] Given a text element with content, the text content matches

---

## Spec Gaps

_None — all requirements have acceptance criteria._

---

## Non-Goals

- PDF generation → see [pdf.md](pdf.md)
- PSD format → see [psd.md](psd.md)
