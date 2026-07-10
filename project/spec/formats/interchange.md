# Formats — Interchange Specification

## Purpose

Defines JSON document export, OGraf broadcast package generation, video export, QR code SVG fragment generation, filename sanitization, and cross-format conformance/stress testing.

---

## Requirements

### Requirement: JSON Document Export

The system MUST export a valid JSON representation of a `BroadsetProject` preserving schema, animation config, multi-document structure, and all supported element types. Round-trips (export→parse→validate) MUST preserve data without loss for any valid project, including empty documents and large documents.

#### Scenario: Schema and animation preserved

- GIVEN a document with animations
- WHEN exported and re-parsed
- THEN the JSON is valid and animation config is intact

#### Scenario: Multi-page export

- GIVEN a multi-page document
- WHEN exported
- THEN all pages are present in the JSON

#### Scenario: All element types round-trip

- GIVEN a document with text, image, rectangle, path, ellipse, svg, qrcode, group, video, clock, and ticker elements
- WHEN round-tripped through JSON
- THEN all types are preserved

#### Scenario: Empty document round-trip

- GIVEN an empty document
- WHEN round-tripped
- THEN structure is preserved

#### Scenario: 100-element stress round-trip

- GIVEN a document with 100 elements
- WHEN round-tripped
- THEN no data loss occurs

#### Scenario: Download utility

- GIVEN a project
- WHEN exported via download utility
- THEN the payload is valid BroadsetProject JSON

#### Acceptance Criteria

- [ ] Given a document with animations, the JSON is valid and animation config is intact
- [ ] Given a multi-page document, all pages are present in the JSON
- [ ] Given a document with text, image, rectangle, path, ellipse, svg, qrcode, group, video, clock, and ticker elements, all types are preserved
- [ ] Given an empty document, structure is preserved
- [ ] Given a document with 100 elements, no data loss occurs
- [ ] Given canonical export, the payload is a strict `BroadsetProjectV1` projection with exact v1 identity; raw canonical JSON uses `.broadset.json`, not `.bsp`

---

### Requirement: OGraf Package Generation

The system MUST create one OGraf broadcast package per top-level element. Each package MUST include a non-real-time capable manifest with runtime methods. Text element content MUST be exposed as default values in the schema. Image elements MUST NOT be exposed as text data inputs. QR elements MUST be pre-rendered to inline SVG. Inline SVG payload fragments MUST be preserved.

#### Scenario: One package per element

- GIVEN a document with 3 top-level elements
- WHEN OGraf packages are generated
- THEN 3 packages are produced

#### Scenario: Text content as schema defaults

- GIVEN text elements with content
- WHEN exported
- THEN schema default values contain the text content

#### Scenario: Image excluded from text inputs

- GIVEN an image element
- WHEN exported
- THEN it is not exposed as a text data input

#### Scenario: QR pre-rendered

- GIVEN a QR code element
- WHEN exported
- THEN the runtime contains pre-rendered inline SVG

#### Acceptance Criteria

- [ ] Given a document with 3 top-level elements, 3 packages are produced
- [ ] Given text elements with content, schema default values contain the text content
- [ ] Given an image element, it is not exposed as a text data input
- [ ] Given a QR code element, the runtime contains pre-rendered inline SVG

---

### Requirement: Video Export Support Detection

The system MUST report video export as unsupported when `VideoEncoder` is not available. It MUST report supported when `VideoEncoder` is defined. Export MUST reject with an error when unsupported.

#### Scenario: Unsupported environment

- GIVEN JSDOM (no VideoEncoder)
- WHEN `isVideoExportSupported` is called
- THEN it returns `false`

#### Scenario: Supported environment

- GIVEN VideoEncoder is defined
- WHEN `isVideoExportSupported` is called
- THEN it returns `true`

#### Scenario: Export rejects when unsupported

- GIVEN no VideoEncoder
- WHEN `exportVideoBlob` is called
- THEN it rejects with an error

#### Acceptance Criteria

- [ ] Given JSDOM (no VideoEncoder), it returns `false`
- [ ] Given VideoEncoder is defined, it returns `true`
- [ ] Given no VideoEncoder, it rejects with an error

---

### Requirement: QR SVG Fragment Generation

The system MUST generate SVG fragments with a white background rectangle and dark QR modules. Empty content MUST return null.

#### Scenario: Empty content returns null

- GIVEN empty content
- WHEN QR SVG fragment is generated
- THEN the result is null

#### Scenario: Valid content generates fragment

- GIVEN `https://example.com`
- WHEN generated
- THEN the result contains `<g fill="#000000">` and a white background rect

#### Acceptance Criteria

- [ ] Given empty content, the result is null
- [ ] Given `https://example.com`, the result contains `<g fill="#000000">` and a white background rect

---

### Requirement: Filename Sanitization

The system MUST replace spaces with hyphens, strip illegal filesystem characters, collapse consecutive hyphens, and trim leading/trailing hyphens. Empty/whitespace-only input MUST return empty string.

#### Scenario: Illegal characters stripped

- GIVEN `'file<>:"/\\|?*name'`
- WHEN sanitized
- THEN the result is `'file-name'`

#### Scenario: Whitespace-only returns empty

- GIVEN `'   '`
- WHEN sanitized
- THEN the result is `''`

#### Acceptance Criteria

- [ ] Given `'file<>:"/\\|?*name'`, the result is `'file-name'`
- [ ] Given `'   '`, the result is `''`

---

### Requirement: Cross-Format Export Parity

Canonical fixture documents MUST be renderable across SVG, HTML, and OGraf exporters. SVG import of exported mixed fixtures MUST produce valid elements. PPTX round-trips of canonical fixtures MUST produce non-empty results.

#### Scenario: SVG/HTML/OGraf all produce output

- GIVEN canonical fixture documents
- WHEN exported to SVG, HTML, and OGraf
- THEN all outputs are non-empty and valid

#### Scenario: PPTX round-trip non-empty

- GIVEN canonical fixtures
- WHEN round-tripped through PPTX
- THEN imported elements are non-empty

#### Acceptance Criteria

- [ ] Given canonical fixture documents, all outputs are non-empty and valid
- [ ] Given canonical fixtures, imported elements are non-empty

---

### Requirement: Import/Export Stress Resilience

The system MUST keep SVG export→import valid for seeded random documents. PPTX export→import MUST produce non-empty results for random documents. Mixed unsupported SVG payloads MUST NOT throw or drop all content.

#### Scenario: SVG stress round-trip

- GIVEN seeded random documents
- WHEN SVG export→import is performed
- THEN the result is valid

#### Scenario: Unsupported SVG fragments handled gracefully

- GIVEN mixed unsupported SVG payloads
- WHEN parsed
- THEN no errors are thrown and content is preserved

#### Acceptance Criteria

- [ ] Given seeded random documents, the result is valid
- [ ] Given mixed unsupported SVG payloads, no errors are thrown and content is preserved

---

### Requirement: Export Error Handling

All export functions MUST handle errors gracefully and report them to the caller. When an export fails (e.g., font fetch failure, image load failure, encoding error), the exporter MUST reject with a descriptive `Error` object. Partial exports MUST NOT be returned — either the full export succeeds or the operation fails entirely.

#### Scenario: Font fetch failure rejects with error

- GIVEN a PDF export where a font URL returns 404
- WHEN the export runs
- THEN the promise rejects with an error describing the missing font

#### Scenario: Rendering failure rejects with error

- GIVEN a raster export where canvas rendering fails
- WHEN the export runs
- THEN the promise rejects with a descriptive error

#### Acceptance Criteria

- [ ] Given an export failure, the returned promise rejects with a descriptive Error
- [ ] Given a partial failure, no partial output is returned

---

### Requirement: Export Progress Reporting

Export functions that perform multi-step or long-running operations (PDF, PSD, video, raster) MUST accept an optional `onProgress` callback. The callback MUST be invoked with a progress value between 0 and 1 representing completion fraction. The callback MAY also include a string `stage` descriptor (e.g., "Rendering elements", "Embedding fonts"). Exporters that complete synchronously or near-instantly (JSON, SVG, HTML) MAY omit progress reporting.

#### Scenario: Long-running export invokes progress callback

- GIVEN a PDF export with onProgress callback
- WHEN the export processes 5 of 10 elements
- THEN the callback is invoked with approximately 0.5

#### Scenario: Instant export without progress callback

- GIVEN a JSON export with onProgress callback
- WHEN the export runs
- THEN the callback MAY not be invoked (instant operation)

#### Acceptance Criteria

- [ ] Given a long-running export with onProgress, the callback is invoked with values between 0 and 1
- [ ] Given an export without onProgress, the export completes without error

---

## Spec Gaps

- [ ] **Export Error Handling:** No automated tests verify that export promises reject with a descriptive Error on font fetch failure, image load failure, or encoding error, and that no partial output is returned.
- [ ] **Export Progress Reporting:** No automated tests verify that long-running exporters invoke an onProgress callback with values in [0, 1], or that exports complete normally when no callback is provided.

---

## Non-Goals

- PDF generation → see [pdf.md](pdf.md)
- PPTX format → see [pptx.md](pptx.md)
- PSD format → see [psd.md](psd.md)
- SVG/HTML export → see [web-vector.md](web-vector.md)
