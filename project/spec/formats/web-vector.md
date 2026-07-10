# Formats — Web & Vector (HTML Standalone) Specification

## Purpose

Defines HTML standalone export with embedded playback runtime. HTML export produces a self-contained HTML file that embeds the playback runtime, serialized animations, and element markup, so the exported document plays back in any modern browser without Broadset runtime on the page.

SVG export and import — including external-source import, external-target export, round-trip, sanitization, metadata, and element tagging — are defined in [svg.md](svg.md). HTML standalone exports consume the SVG exporter internally for any embedded vector surfaces, but the contract below concerns the HTML shell and runtime only.

---

## Requirements

### Requirement: HTML Standalone Export

The system MUST generate a self-contained HTML document that embeds the playback runtime, serialized animations, and element markup. Elements MUST have `data-element-id` attributes for animation targeting. The HTML shell MUST include a `#canvas` container positioned with `transform-origin: top left`, and the runtime MUST scale the canvas to fit the viewport on load and on window resize by computing `Math.min(viewportWidth / baseWidth, viewportHeight / baseHeight)` and applying it as a CSS scale transform. The document MUST use `overflow: hidden` on the body to prevent scrollbars.

#### Scenario: Animation runtime embedded

- GIVEN a document with animations
- WHEN exported to HTML
- THEN output contains `requestAnimationFrame`, easing functions, and serialized animations JSON

#### Scenario: Element IDs for targeting

- GIVEN a document with elements
- WHEN exported to HTML
- THEN output contains `data-element-id=` attributes

#### Scenario: Vector and sanitized foreign content rendered

- GIVEN vector elements and sanitized-vector foreign fallback with typed `appearance.clip`
- WHEN exported to HTML
- THEN inline SVG markup is rendered and clip-path styles are applied

#### Scenario: Group hierarchy with 3D transforms

- GIVEN rotated and 3D-transformed group elements
- WHEN exported to HTML
- THEN group hierarchy and transform styles are preserved

#### Acceptance Criteria

- [ ] Given a document with animations, output contains `requestAnimationFrame`, easing functions, and serialized animations JSON
- [ ] Given a document with elements, output contains `data-element-id=` attributes
- [ ] Given vector/authorized sanitized-vector content with typed clips, safe inline SVG output and equivalent clip definitions render
- [ ] Given rotated and 3D-transformed group elements, group hierarchy and transform styles are preserved
- [ ] Given the HTML output, a `#canvas` container is positioned with `transform-origin: top left`
- [ ] Given a viewport resize, the runtime scales the canvas to fit using min(viewportWidth/baseWidth, viewportHeight/baseHeight)
- [ ] Given the HTML body, overflow is hidden to prevent scrollbars

---

### Requirement: HTML Runtime Feature Parity

The embedded HTML runtime MUST include OKLab color interpolation, SVG path morphing with command coordinate lookup, action state support (setState, addModifier, removeModifier), cubic-bezier and step easing, from-keyframe interpolation direction, and serialized animations with base width.

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

## Non-Goals

- SVG export and import (including metadata, sanitization, `data-bs-*` tagging, external-source import, chain round-trip) → see [svg.md](svg.md)
- PDF generation → see [pdf.md](pdf.md)
- PPTX format → see [pptx.md](pptx.md)
- PSD format → see [psd.md](psd.md)
