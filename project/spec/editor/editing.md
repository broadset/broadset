# Editor — Editing Specification

## Purpose

Defines the interactive editing modes: path editing (modify existing SVG paths), path drawing (create new SVG paths point-by-point), and element placement (click-to-place new elements on the canvas). These modes are mutually exclusive and auto-exit when the active selection changes.

---

## Requirements

### Requirement: Path Editing Mode

The system MUST track a `pathEditingElementId`. Starting path editing MUST select the target element. Stopping MUST clear the ID. Changing the active selection to a different element or null MUST auto-exit path editing. Selecting the same element again MUST NOT exit path editing.

#### Scenario: Start and stop

- GIVEN element `path-1` exists
- WHEN `startPathEditing("path-1")` is called then `stopPathEditing()`
- THEN `pathEditingElementId` goes from `"path-1"` to `null`

#### Scenario: Auto-exit on selection change

- GIVEN path editing is active for `path-1`
- WHEN `setActiveElement("rect-1")` is called
- THEN `pathEditingElementId` becomes `null`

#### Scenario: Same element reselection keeps editing

- GIVEN path editing is active for `path-1`
- WHEN `setActiveElement("path-1")` is called
- THEN `pathEditingElementId` remains `"path-1"`

#### Scenario: Multi-select including path keeps editing

- GIVEN path editing is active for `path-1`
- WHEN `setActiveElements(["path-1", "rect-1"])` is called
- THEN `pathEditingElementId` remains `"path-1"`

#### Scenario: Multi-select excluding path exits editing

- GIVEN path editing is active for `path-1`
- WHEN `setActiveElements(["rect-1"])` is called
- THEN `pathEditingElementId` becomes `null`

#### Acceptance Criteria

- [ ] Given element `path-1` exists, `pathEditingElementId` goes from `"path-1"` to `null`
- [ ] Given path editing is active for `path-1`, `pathEditingElementId` becomes `null`
- [ ] Given path editing is active for `path-1`, `pathEditingElementId` remains `"path-1"`
- [ ] Given path editing is active for `path-1`, `pathEditingElementId` remains `"path-1"`
- [ ] Given path editing is active for `path-1`, `pathEditingElementId` becomes `null`

---

### Requirement: Path Drawing Mode

The system MUST track a `pathDrawingElementId`. Starting drawing MUST select the element and clear any active path editing. Stopping MUST clear the drawing ID. Adding a path element MUST auto-enter drawing mode. Selection changes to a different element or null MUST auto-exit drawing. Path drawing MUST be completed by one of: (1) the user pressing Escape, which commits the current points and exits drawing mode, (2) the user pressing Enter, which closes the path (connects last point to first) and exits drawing mode, or (3) calling `stopPathDrawing()` programmatically.

#### Scenario: Start and stop

- GIVEN element `path-1` exists
- WHEN `startPathDrawing("path-1")` is called then `stopPathDrawing()`
- THEN `pathDrawingElementId` goes from `"path-1"` to `null`

#### Scenario: Drawing clears editing

- GIVEN path editing is active for `path-1`
- WHEN `startPathDrawing("path-1")` is called
- THEN `pathEditingElementId` becomes `null` and `pathDrawingElementId` is `"path-1"`

#### Scenario: addElement path auto-enters drawing

- GIVEN an empty document
- WHEN `addElement("path")` is called
- THEN `pathDrawingElementId` is the new element's ID

#### Acceptance Criteria

- [ ] Given element `path-1` exists, `pathDrawingElementId` goes from `"path-1"` to `null`
- [ ] Given path editing is active for `path-1`, `pathEditingElementId` becomes `null` and `pathDrawingElementId` is `"path-1"`
- [ ] Given an empty document, `pathDrawingElementId` is the new element's ID
- [ ] Given `addElement("path")` is called, the new element automatically enters path drawing mode

---

### Requirement: Path Point Appending

The system MUST append SVG path commands during drawing mode. The first point MUST create an `M` command. Subsequent points MUST create `L` commands. Coordinates MUST be relative to the element's bounding box. The bounding box MUST be recalculated to fit all points, padded by half the stroke width. Coordinates MUST be rounded to 2 decimal places. Appending when not in drawing mode MUST be a no-op.

#### Scenario: First point creates M command

- GIVEN drawing is active for `path-1`
- WHEN `appendPathPoint(10, 20)` is called
- THEN content is `"M1,1"` and bounding box is padded by stroke width

#### Scenario: Subsequent points create L commands

- GIVEN three points appended: (10,20), (30,40), (50,60)
- WHEN the element is inspected
- THEN content is `"M1,1 L21,21 L41,41"` with grown bounding box

#### Scenario: Coordinates rounded

- GIVEN `appendPathPoint(10.12345, 20.6789)`
- WHEN the element is inspected
- THEN position values are rounded to 2 decimal places

#### Scenario: No-op when not drawing

- GIVEN drawing mode is not active
- WHEN `appendPathPoint(10, 20)` is called
- THEN element content is unchanged

#### Acceptance Criteria

- [ ] Given drawing is active for `path-1`, content is `"M1,1"` and bounding box is padded by stroke width
- [ ] Given three points appended: (10,20), (30,40), (50,60), content is `"M1,1 L21,21 L41,41"` with grown bounding box
- [ ] Given `appendPathPoint(10.12345, 20.6789)`, position values are rounded to 2 decimal places
- [ ] Given drawing mode is not active, element content is unchanged

---

### Requirement: Element Placement Mode

The system MUST track a `pendingPlacementType`. Starting placement MUST clear any active path editing or drawing. Cancelling MUST clear the pending type. Placing MUST create the element centered at the click position, select it, and clear the pending type. Placing with no pending type MUST be a no-op.

#### Scenario: Start and cancel

- GIVEN no pending placement
- WHEN `startPlacement("text")` then `cancelPlacement()` is called
- THEN `pendingPlacementType` goes from `"text"` to `null`

#### Scenario: Placement clears editing modes

- GIVEN path editing is active
- WHEN `startPlacement("rectangle")` is called
- THEN both `pathEditingElementId` and `pathDrawingElementId` are `null`

#### Scenario: Place element at position

- GIVEN `pendingPlacementType` is `"text"`
- WHEN `placeElement(100, 50)` is called
- THEN a text element is created centered at (100, 50) and selected

#### Scenario: Place with custom dimensions

- GIVEN `pendingPlacementType` is `"rectangle"`
- WHEN `placeElement(100, 80, 60, 40)` is called
- THEN the element has width 60 and height 40

#### Scenario: Place path enters drawing mode

- GIVEN `pendingPlacementType` is `"path"`
- WHEN `placeElement(100, 50)` is called
- THEN the path element is created and `pathDrawingElementId` is set

#### Scenario: No-op without pending placement

- GIVEN `pendingPlacementType` is `null`
- WHEN `placeElement(100, 50)` is called
- THEN no element is created

#### Acceptance Criteria

- [ ] Given no pending placement, `pendingPlacementType` goes from `"text"` to `null`
- [ ] Given path editing is active, both `pathEditingElementId` and `pathDrawingElementId` are `null`
- [ ] Given `pendingPlacementType` is `"text"`, a text element is created centered at (100, 50) and selected
- [ ] Given `pendingPlacementType` is `"rectangle"`, the element has width 60 and height 40
- [ ] Given `pendingPlacementType` is `"path"`, the path element is created and `pathDrawingElementId` is set
- [ ] Given `pendingPlacementType` is `null`, no element is created

---

### Requirement: Path Element Factory Defaults

The system MUST create path elements with default dimensions (80×50), empty content, and SVG stroke/fill style defaults. The element MUST be centered on the canvas.

#### Scenario: Path factory defaults

- GIVEN a canvas of 200×100
- WHEN a path element is created
- THEN width=80, height=50, position centers it, and SVG styles are set

#### Acceptance Criteria

- [ ] Given a canvas of 200×100, width=80, height=50, position centers it, and SVG styles are set

---

### Requirement: Element Factory Defaults

Creating an element by type MUST use predefined default dimensions and content per type. The system MUST support: text (80×20, `'New Text'`), image (60×60, empty), svg (60×60, empty), path (80×50, empty), rectangle (80×50, empty), ellipse (50×50, empty), qrcode (40×40, `'https://example.com'`), group (120×80, empty). Custom types MUST fall back to plugin-provided defaults or system fallbacks (80×50, empty).

#### Scenario: Text factory defaults

- GIVEN element type `'text'`
- WHEN an element is created via the factory
- THEN width is 80, height is 20, content is `'New Text'`

#### Scenario: Custom type with plugin defaults

- GIVEN a plugin with `defaults: { width: 100, height: 100, content: 'Timer' }`
- WHEN an element of the plugin type is created
- THEN width is 100, height is 100, content is `'Timer'`

#### Scenario: Custom type without plugin defaults

- GIVEN a plugin with no defaults specified
- WHEN an element of the plugin type is created
- THEN width is 80, height is 50, content is empty

#### Acceptance Criteria

- [ ] Given element type text, factory produces width 80, height 20, content 'New Text'
- [ ] Given a plugin with defaults, factory uses the plugin's default dimensions and content
- [ ] Given a plugin without defaults, factory uses system fallback dimensions
- [ ] Given each built-in element type (image, svg, rectangle, ellipse, qrcode, group), the factory produces the type-specific default dimensions and content

---

### Requirement: Editor Configuration Validation

EditorConfig MUST be validated at initialization. Invalid font definitions, document size presets, or required elements MUST be rejected with descriptive errors.

#### Scenario: Valid config accepted

- GIVEN an EditorConfig with valid allowedFonts and allowedDocumentSizes
- WHEN the editor initializes
- THEN initialization succeeds

#### Scenario: Invalid font definition rejected

- GIVEN an EditorConfig with a font definition missing the `family` field
- WHEN the config is validated
- THEN validation fails with a descriptive error

#### Acceptance Criteria

- [ ] Given a valid EditorConfig, initialization succeeds
- [ ] Given an invalid font definition, validation fails with a descriptive error

---

### Requirement: Property Capability Mapping

Each element type + document mode combination MUST have a deterministic set of editable style and screen properties. Properties outside the capability set MUST be hidden from the UI. Custom plugins MAY override capabilities.

#### Scenario: Text element capabilities

- GIVEN a text element in screen mode
- WHEN its capability profile is queried
- THEN typography properties (fontFamily, fontSize, etc.) are editable

#### Scenario: Rectangle lacks typography

- GIVEN a rectangle element
- WHEN its capability profile is queried
- THEN typography properties are not editable

#### Scenario: Plugin capability override

- GIVEN a plugin with `capabilities: { hasBorderRadius: false }`
- WHEN an element of that plugin type is selected
- THEN border-radius editing is disabled

#### Acceptance Criteria

- [ ] Given a text element, typography properties are in the editable capability set
- [ ] Given a rectangle element, typography properties are not in the capability set
- [ ] Given a plugin with capability overrides, the overrides are applied

---

### Requirement: Preflight Diagnostics

The system MUST provide a preflight checker that inspects the current editor state or a standalone document for issues. Issues MUST have severity (error, warning, info), element name, message, and rule identifier. The following named rules MUST be evaluated:

- **title-safe:** Text, image, and SVG elements extending beyond the 90% title-safe inset MUST produce a `warning`.
- **dpi-resolution:** Image elements whose rendered pixel dimensions exceed 500px MUST produce an `info` recommending a minimum source resolution of 1.5× the rendered size.
- **bleed:** In print mode, elements extending beyond canvas bounds plus the bleed margin (default 3mm) MUST produce a `warning`.
- **small-text:** In print mode, text elements with font size below 6pt MUST produce a `warning`.
- **color-mode:** In print mode, elements using fluorescent or out-of-gamut colors MUST produce an `info`.
- **unsupported-property:** Elements using style or screen properties unavailable in the current document mode MUST produce a `warning` per unsupported property.

Diagnostics MUST have stable severity classification and deterministic ordering.

#### Scenario: Title-safe violation

- GIVEN a text element positioned outside the 90% title-safe inset
- WHEN preflight diagnostics run
- THEN a `warning` is emitted with rule `title-safe`

#### Scenario: Clean document passes preflight

- GIVEN a valid document with all fonts available
- WHEN preflight is run
- THEN no issues are reported

#### Scenario: Unsupported property in print mode

- GIVEN a print-mode document with an element using a screen-only property
- WHEN preflight diagnostics run
- THEN a `warning` is emitted per unsupported property

#### Acceptance Criteria

- [ ] Given a text element outside title-safe inset, a warning with rule title-safe is emitted
- [ ] Given a large image, an info with rule dpi-resolution is emitted
- [ ] Given a print document with elements beyond bleed, a warning with rule bleed is emitted
- [ ] Given print mode with text below 6pt, a warning with rule small-text is emitted
- [ ] Given print mode with fluorescent colors, an info with rule color-mode is emitted
- [ ] Given a screen-only property in print mode, a warning with rule unsupported-property is emitted
- [ ] Given multiple issues, diagnostics have deterministic ordering
- [ ] Given a clean document, preflight reports no issues

---

### Requirement: Debug Snapshot

The system MUST serialize the full editor state to a deterministic JSON string for diagnostic reporting. The snapshot MUST be downloadable.

#### Scenario: Create snapshot

- GIVEN an editor with a loaded document and selected elements
- WHEN a debug snapshot is created
- THEN it produces a JSON string containing the full editor state

#### Acceptance Criteria

- [ ] Given an editor state, a debug snapshot produces a deterministic JSON string

---

### Requirement: In-Place Text Editing

Double-clicking a text element MUST enter inline text editing mode. In this mode the text element's content becomes editable via a `contenteditable` region overlaid on the canvas at the element's position and dimensions. The editor MUST suppress element drag/resize interactions while inline editing is active. Pressing Escape or clicking outside the element MUST exit inline editing mode and commit the text changes to the store. Pressing Enter MUST insert a line break (not exit editing). The inline editor MUST respect the element's font, size, color, and alignment settings. Only basic text editing is supported inline; advanced properties (font family, font size, alignment) are edited via the properties sidebar.

#### Scenario: Double-click activates inline editing

- GIVEN a text element is selected
- WHEN the user double-clicks it
- THEN the element enters inline editing mode with a `contenteditable` overlay

#### Scenario: Escape commits and exits

- GIVEN inline editing is active
- WHEN the user presses Escape
- THEN editing mode exits and text changes are committed to the store

#### Scenario: Click-outside commits and exits

- GIVEN inline editing is active
- WHEN the user clicks outside the element
- THEN editing mode exits and text changes are committed to the store

#### Scenario: Typing updates content in real-time

- GIVEN inline editing is active
- WHEN the user types text
- THEN the element content updates in real-time on the canvas

#### Scenario: Drag suppressed during inline editing

- GIVEN inline editing is active
- WHEN the user attempts to drag the element
- THEN the drag is suppressed and text selection occurs instead

#### Acceptance Criteria

- [ ] Given a double-click on a text element, inline editing mode activates
- [ ] Given inline editing mode, pressing Escape commits changes and exits
- [ ] Given inline editing mode, clicking outside commits changes and exits
- [ ] Given inline editing mode, drag interactions are suppressed
- [ ] Given inline editing mode, the `contenteditable` region matches the element's visual styling
- [ ] Given inline editing mode, pressing Enter inserts a line break

---

### Requirement: Missing Font Preflight Rule

The preflight system MUST include a `missing-font` diagnostic rule. This rule checks whether each text element's font family is present in the `EditorConfig.allowedFonts` list or the fallback system fonts. If a text element uses a font not available in the configuration, a warning-severity diagnostic MUST be emitted.

#### Scenario: Font not in allowedFonts

- GIVEN a text element using font "CustomFont" and `allowedFonts` does not include "CustomFont"
- WHEN preflight runs
- THEN a `warning` diagnostic with rule `missing-font` is emitted for the element

#### Scenario: Font in allowedFonts

- GIVEN a text element using a font present in `allowedFonts`
- WHEN preflight runs
- THEN no `missing-font` diagnostic is emitted

#### Scenario: Fallback system font

- GIVEN a text element using a fallback system font
- WHEN preflight runs
- THEN no `missing-font` diagnostic is emitted

#### Acceptance Criteria

- [ ] Given a text element with a font not in `allowedFonts` or fallback fonts, a warning diagnostic with rule `missing-font` is emitted
- [ ] Given a text element with a font in `allowedFonts`, no `missing-font` diagnostic is emitted
- [ ] Given a text element with a fallback system font, no `missing-font` diagnostic is emitted

---

## Spec Gaps

- [ ] **In-Place Text Editing:** No automated tests verify inline editing activation, commit-on-Escape, commit-on-click-outside, drag suppression, or Enter line-break insertion.
- [ ] **Missing Font Preflight Rule:** No automated tests verify the `missing-font` preflight rule or its interaction with `allowedFonts` and system font fallbacks.

---

## Non-Goals

- Runtime data injection → see [data-store.md](data-store.md)
- Change stream and collaboration → see [collaboration.md](collaboration.md)
- Element type contracts and style shape → see `project/spec/model/element.md` and `project/spec/model/style.md`
