# Demo — Data Integration Specification

## Purpose

Defines live data injection, export/import orchestration, lazy format loading, and the sample document for the demo editor. This spec ensures the demo's data flows and user workflows can be reconstructed. It does NOT define format conversion logic (→ `project/spec/formats/`) or data store internals (→ `project/spec/editor/data-store.md`). See [conventions](../../README.md).

---

## Requirements

### Requirement: Live Data Injection

The demo MUST create a BroadsetDataStore populated with initial placeholder values for live sports data (scores, clock, ticker). A mock live data hook MUST periodically update these values. Updated values MUST be pushed into the data store and reflected in element renderers.

#### Scenario: Initial data available

- GIVEN the demo app is mounted
- WHEN the data store is queried
- THEN score, clock, and ticker elements have initial placeholder values

#### Scenario: Live updates propagate

- GIVEN the mock live data hook updates the score
- WHEN the data store receives the update
- THEN the rendered score element displays the updated value

#### Acceptance Criteria

- [ ] Given app mount, the data store has initial values for scores, clock, and ticker
- [ ] Given a live data update, the data store and rendered elements reflect the new values

---

### Requirement: Dynamic Data for Export

Export operations MUST receive current live data values so exported documents reflect the latest dynamic content, not stale template tokens.

#### Scenario: Export includes live data

- GIVEN live data has updated the home score to 3
- WHEN an export is triggered
- THEN the export receives the current live data values

#### Acceptance Criteria

- [ ] Given live data updates, exports receive the current dynamic values

---

### Requirement: Lazy Format Loading

Format export functions MUST NOT be included in the initial bundle. They MUST be loaded on first use and cached for subsequent calls.

#### Scenario: Formats loaded on demand

- GIVEN the demo app is loaded
- WHEN no export has been triggered
- THEN the formats module is not loaded

#### Scenario: Cached after first load

- GIVEN the formats module was loaded for a PNG export
- WHEN a PDF export is triggered
- THEN the same cached module is reused

#### Acceptance Criteria

- [ ] Given initial page load, the formats module is not in the initial bundle
- [ ] Given the first export, the formats module is loaded dynamically
- [ ] Given subsequent exports, the cached module is reused

---

### Requirement: Export Orchestration

The demo MUST support all enabled export formats through the ExportModal: HTML, SVG, PDF, PSD, PPTX, PNG, JPEG, SVG-embedded, OGraf, MP4, WebM. Each export MUST display a success toast on completion and an error toast on failure. Raster exports (PNG, JPEG, SVG-embedded) MUST require a snapshot renderer element. Video exports (MP4, WebM) MUST require a playback controller and video settings.

#### Scenario: PDF export success

- GIVEN the user triggers a PDF export
- WHEN the export completes
- THEN a success toast is shown

#### Scenario: Raster export without renderer

- GIVEN no snapshot renderer is available
- WHEN a PNG export is attempted
- THEN an error toast is shown with a descriptive message

#### Scenario: Video export with settings

- GIVEN a playback controller and video settings
- WHEN an MP4 export is triggered
- THEN the video exports with the specified fps, dimensions, and bitrate

#### Acceptance Criteria

- [ ] Given each enabled format, the export produces a file download on success
- [ ] Given a successful export, a success toast is shown
- [ ] Given a failed export, an error toast with a descriptive message is shown
- [ ] Given a raster export without a snapshot renderer, an error is raised
- [ ] Given a video export, it uses the provided playback controller and video settings

---

### Requirement: Import Orchestration

The demo MUST support importing documents via the Toolbar. Import success MUST display a success toast. Import failure MUST display an error toast with the failure message.

#### Scenario: Successful import

- GIVEN a valid document file
- WHEN import completes
- THEN a success toast "Import complete." is shown

#### Scenario: Failed import

- GIVEN an invalid document file
- WHEN import fails
- THEN an error toast "Import failed: <message>" is shown

#### Acceptance Criteria

- [ ] Given a successful import, a success toast is shown
- [ ] Given a failed import, an error toast with the failure message is shown

---

### Requirement: New Document Creation

The NewDocumentModal MUST create a fresh document with the selected preset dimensions and update canvas settings (units, viewMode) to match the preset.

#### Scenario: Create from preset

- GIVEN the user selects "A4" preset (210×297mm, print)
- WHEN Create is confirmed
- THEN a new document is loaded with A4 dimensions and canvas viewMode is set to 'print'

#### Acceptance Criteria

- [ ] Given a preset selection and confirmation, a new document is created with preset dimensions
- [ ] Given a preset with viewMode, the canvas settings update to match

---

### Requirement: Sample Document

The demo MUST load a sample document on startup that exercises key features: multiple element types (text, rectangle, image, path at minimum), elements with animation bindings, and elements bound to live data keys.

#### Scenario: Sample document loaded

- GIVEN the demo app initializes
- WHEN the editor renders
- THEN a sample document with multiple element types is visible on the canvas

#### Acceptance Criteria

- [ ] Given app initialization, a sample document is loaded automatically
- [ ] Given the sample document, it includes at least text, rectangle, image, and path elements
- [ ] Given the sample document, it includes elements with animation bindings and live data keys
- [ ] Given the sample document, at least one element has `transform` keyframes (e.g. translateX)
- [ ] Given the sample document, at least one element has both IN and OUT state bindings

---

### Requirement: Debug Snapshot Download

The demo MUST provide a toolbar action that downloads a JSON debug snapshot of the full editor state.

#### Scenario: Download snapshot

- GIVEN the user clicks the debug snapshot button
- WHEN the snapshot is generated
- THEN a JSON file is downloaded

#### Acceptance Criteria

- [ ] Given the debug snapshot action, a JSON file of the editor state is downloaded

---

## Spec Gaps

_None — all requirements have acceptance criteria._

---

## Non-Goals

- Format conversion internals → see `project/spec/formats/spec.md`
- Data store CRUD behavior → see `project/spec/editor/data-store.md`
- Export modal UI behavior → see `project/spec/ui/modals.md`
- Toolbar import UI → see `project/spec/ui/toolbar-nav.md`
