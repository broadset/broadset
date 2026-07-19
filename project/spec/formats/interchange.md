# Formats — Interchange Specification

## Purpose

Defines canonical project JSON export, OGraf broadcast package generation, video export, QR-code SVG output, filename sanitization, and cross-format conformance/stress testing.

---

## Requirements

### Requirement: Canonical Project JSON Export

The system MUST export strict `BroadsetProjectV1` JSON with exact v1 identity and preserve resources, documents, template groups, interop, extensions, pages, components, sequences, lifecycle, state machines, bindings, and every closed element variant. Raw canonical JSON uses `.broadset.json`; `.bsp` remains the package format. Export→parse→validate MUST preserve semantic data without loss for any valid project, including documents with no elements and large projects.

#### Scenario: Schema and sequences preserved

- GIVEN a canonical project with document/component sequences, lifecycle, and state machines
- WHEN exported and re-parsed
- THEN exact identity validates and all stable animation identities/references are intact

#### Scenario: Multi-page export

- GIVEN a multi-page document
- WHEN exported
- THEN all pages are present in the JSON

#### Scenario: Closed element union round-trips

- GIVEN a document containing text, image, vector rectangle/ellipse/structured-path/boolean, group, component-instance, video, audio, clock, ticker, qrcode, foreign, and plugin elements
- WHEN round-tripped through JSON
- THEN every kind/subtype and typed payload is preserved

#### Scenario: Imported SVG mappings round-trip

- GIVEN an SVG import that mapped recognized shapes to vector subtypes and unsupported source to sanitized-vector/preview-only foreign elements plus interop records
- WHEN the resulting canonical project is exported and re-parsed
- THEN native mappings, inert blob/preview references, diagnostics, and interop source identity are preserved without a core `svg` kind

#### Scenario: Element-empty document round-trip

- GIVEN a valid document with at least one page and no elements
- WHEN round-tripped
- THEN structure is preserved

#### Scenario: 100-element stress round-trip

- GIVEN a document with 100 elements
- WHEN round-tripped
- THEN no data loss occurs

#### Scenario: Download utility

- GIVEN a project
- WHEN exported via download utility
- THEN the payload is valid `BroadsetProjectV1` JSON

#### Acceptance Criteria

- [ ] Given canonical sequences/lifecycle/state machines, exact identities and references survive round-trip
- [ ] Given a multi-page document, all pages are present in the JSON
- [ ] Given every closed kind and vector subtype, typed payloads survive round-trip
- [ ] Given recognized/unsupported SVG import results, native vector, foreign fallback, and interop data survive without a core `svg` kind
- [ ] Given a valid element-empty document, structure is preserved
- [ ] Given a document with 100 elements, no data loss occurs
- [ ] Given canonical export, the payload is strict `BroadsetProjectV1` with exact v1 identity; raw canonical JSON uses `.broadset.json`, not `.bsp`

---

### Requirement: OGraf Package Generation

The system MUST create one OGraf broadcast package per resolved top-level page-root instance. Each package MUST include a non-real-time capable manifest with runtime methods. Structured text run values selected by typed bindings MAY become schema defaults. Images MUST NOT become text inputs. QR-code values render to safe inline SVG output. Sanitized-vector foreign source remains inert and may be emitted only through the authorized sanitizer; preview-only foreign content uses its preview or a diagnostic.

#### Scenario: One package per resolved root instance

- GIVEN a page with 3 resolved top-level root instances
- WHEN OGraf packages are generated
- THEN 3 packages are produced

#### Scenario: Text content as schema defaults

- GIVEN structured text elements with selected run text targets
- WHEN exported
- THEN schema defaults contain the inert Unicode run values

#### Scenario: Image excluded from text inputs

- GIVEN an image element
- WHEN exported
- THEN it is not exposed as a text data input

#### Scenario: QR pre-rendered

- GIVEN a QR code element
- WHEN exported
- THEN the runtime contains pre-rendered inline SVG

#### Acceptance Criteria

- [ ] Given 3 resolved top-level root instances, 3 packages are produced
- [ ] Given selected structured-text run targets, schema defaults contain inert Unicode values
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

The system MUST generate SVG fragments with a white background rectangle and dark QR modules from the typed QR-code value. An empty typed value returns null.

#### Scenario: Empty QR value returns null

- GIVEN an empty typed QR-code value
- WHEN QR SVG fragment is generated
- THEN the result is null

#### Scenario: Valid content generates fragment

- GIVEN `https://example.com`
- WHEN generated
- THEN the result contains `<g fill="#000000">` and a white background rect

#### Acceptance Criteria

- [ ] Given an empty typed QR-code value, the result is null
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

The system MUST keep SVG export→import valid for seeded random canonical projects. PPTX export→import MUST produce valid non-empty mapped results for compatible random projects. Mixed unsupported external SVG constructs MUST map to canonical foreign/interop preservation with diagnostics and MUST NOT throw or silently drop all content.

#### Scenario: SVG stress round-trip

- GIVEN seeded random documents
- WHEN SVG export→import is performed
- THEN the result is valid

#### Scenario: Unsupported external SVG constructs handled gracefully

- GIVEN mixed unsupported constructs in an external SVG source
- WHEN parsed
- THEN no errors are thrown and source is preserved through safe foreign fallback or interop records with diagnostics

#### Acceptance Criteria

- [ ] Given seeded random documents, the result is valid
- [ ] Given mixed unsupported external SVG constructs, safe foreign/interop preservation prevents silent loss

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
