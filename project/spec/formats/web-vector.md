# Formats — Web & Vector (HTML Standalone) Specification

## Purpose

Defines HTML standalone export with embedded playback runtime. HTML export produces a self-contained HTML file that embeds the playback runtime, canonical sequences/lifecycle/state machines, and element markup, so the exported document plays back in any modern browser without Broadset runtime on the page.

SVG export and import — including external-source import, external-target export, round-trip, sanitization, metadata, and element tagging — are defined in [svg.md](svg.md). HTML standalone exports consume the SVG exporter internally for any embedded vector surfaces, but the contract below concerns the HTML shell and runtime only.

---

## Requirements

### Requirement: HTML Standalone Export

The system MUST generate a self-contained HTML document that embeds the playback runtime, canonical sequences/lifecycle/state machines, and element markup. Elements MUST have `data-element-id` attributes for stable `PropertyTarget` resolution. The HTML shell MUST include a `#canvas` container positioned with `transform-origin: top left`, and the runtime MUST scale the canvas to fit the viewport on load and on window resize by computing `Math.min(viewportWidth / baseWidth, viewportHeight / baseHeight)` and applying it as a CSS scale transform. The document MUST use `overflow: hidden` on the body to prevent scrollbars.

#### Scenario: Animation runtime embedded

- GIVEN a document with canonical sequences
- WHEN exported to HTML
- THEN output contains `requestAnimationFrame`, typed interpolation functions, and serialized sequence/lifecycle/state-machine JSON

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

- [ ] Given a document with canonical sequences, output contains `requestAnimationFrame`, typed interpolation functions, and serialized sequence/lifecycle/state-machine JSON
- [ ] Given a document with elements, output contains `data-element-id=` attributes
- [ ] Given vector/authorized sanitized-vector content with typed clips, safe inline SVG output and equivalent clip definitions render
- [ ] Given rotated and 3D-transformed group elements, group hierarchy and transform styles are preserved
- [ ] Given the HTML output, a `#canvas` container is positioned with `transform-origin: top left`
- [ ] Given a viewport resize, the runtime scales the canvas to fit using min(viewportWidth/baseWidth, viewportHeight/baseHeight)
- [ ] Given the HTML body, overflow is hidden to prevent scrollbars

---

### Requirement: HTML Runtime Feature Parity

The embedded HTML runtime MUST include OKLab color interpolation, typed structured-path morphing with stable point/segment identity, typed lifecycle/state-machine event evaluation, cubic-bezier and step interpolation, outgoing-segment interpolation from each earlier typed keyframe, and serialized canonical sequences with exact integer ticks and base width. Runtime actions MUST resolve stable sequence/state-machine IDs; keyframes contain only the typed value for their property track and MUST NOT contain state or modifier action payloads. The playback evaluator MUST NOT parse or generate SVG `d`; after typed path resolution, the HTML renderer MAY serialize the resolved structured path to SVG markup at the output boundary.

#### Scenario: OKLab color pipeline

- GIVEN the generated runtime
- WHEN inspected
- THEN it contains srgbToLinear, linearToSrgb, rgbToOklab, oklabToRgb functions

#### Scenario: Structured-path morphing support

- GIVEN the generated runtime
- WHEN inspected
- THEN it contains a typed structured-path interpolator that preserves stable topology and no playback-time SVG `d` parser

#### Scenario: Easing support

- GIVEN the generated runtime
- WHEN inspected
- THEN it contains cubicBezierY Newton solver and easeStep function

#### Scenario: Lifecycle and state-machine support

- GIVEN generated output with lifecycle and state machines
- WHEN the embedded runtime evaluates typed events
- THEN it derives states and starts transition sequences by stable ID without reading keyframe action markers

#### Acceptance Criteria

- [ ] Given the generated runtime, it contains srgbToLinear, linearToSrgb, rgbToOklab, oklabToRgb functions
- [ ] Given the generated runtime, compatible typed structured paths interpolate with stable point/segment identity
- [ ] SVG `d` serialization occurs only after resolution at the renderer/output boundary
- [ ] Given the generated runtime, it contains cubicBezierY Newton solver and easeStep function
- [ ] Given lifecycle/state-machine data, the runtime resolves typed events and transition sequence actions by stable ID
- [ ] Generated keyframes contain one typed property-track value and no state/modifier action payloads

---

## Non-Goals

- SVG export and import (including metadata, sanitization, `data-bs-*` tagging, external-source import, chain round-trip) → see [svg.md](svg.md)
- PDF generation → see [pdf.md](pdf.md)
- PPTX format → see [pptx.md](pptx.md)
- PSD format → see [psd.md](psd.md)
