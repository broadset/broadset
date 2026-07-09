# Editor — Store UI Actions Specification

## Purpose

Defines the behavioral contracts for editor store actions that manage pages, canvas settings, guides, color palette, fonts, and media source. These are the "workspace" actions that configure the editing environment rather than mutating document content. See [conventions](../../README.md).

---

## Requirements

### Requirement: Page Navigation

Switching pages MUST update the active page index and clear the current selection. Out-of-range indices MUST be ignored.

#### Scenario: Switch to valid page

- GIVEN a document with 3 pages and page 0 active
- WHEN page 2 is selected
- THEN activePageIndex is 2 and selection is cleared

#### Scenario: Invalid page index ignored

- GIVEN a document with 3 pages
- WHEN page 5 is selected
- THEN activePageIndex is unchanged

#### Acceptance Criteria

- [ ] Given a valid page switch, activePageIndex updates and selection clears
- [ ] Given an invalid page index, the switch is ignored

---

### Requirement: Page Add and Remove

Adding a page MUST append an empty page. Removing a page MUST maintain at least one page. Removing the active page MUST adjust the active index.

#### Scenario: Add page

- GIVEN a document with 1 page
- WHEN a page is added
- THEN the document has 2 pages and the new page has no elements

#### Scenario: Remove page adjusts active index

- GIVEN a document with 3 pages and page 2 active
- WHEN page 2 is removed
- THEN the document has 2 pages and activePageIndex is 1

#### Scenario: Last page cannot be removed

- GIVEN a document with 1 page
- WHEN removal is attempted
- THEN the page remains

#### Acceptance Criteria

- [ ] Given page add, an empty page is appended
- [ ] Given removal of the active page, activePageIndex adjusts to stay valid
- [ ] Given a single-page document, page removal is blocked

---

### Requirement: Canvas Settings Update

The system MUST merge partial canvas settings. Zoom, pan, and grid updates MUST be applied. Canvas setting changes MUST NOT be tracked by undo/redo.

#### Scenario: Update zoom

- GIVEN current zoom at 1.0
- WHEN zoom is updated to 2.0
- THEN canvasSettings.zoom is 2.0

#### Acceptance Criteria

- [ ] Given a partial canvas settings update, only the specified fields change
- [ ] Given a canvas settings update, the change is not tracked by undo

---

### Requirement: Guide Management

The system MUST support adding, removing, and updating guide lines. Each guide has id, type (horizontal or vertical), position in mm, and locked flag.

#### Scenario: Add a horizontal guide

- GIVEN no existing guides
- WHEN a horizontal guide at position 100mm is added
- THEN canvasSettings.guides contains one guide with type `'h'` and pos 100

#### Scenario: Remove guide by ID

- GIVEN a guide with id `'g1'`
- WHEN the guide is removed
- THEN canvasSettings.guides no longer contains `'g1'`

#### Scenario: Update guide position

- GIVEN a guide at position 100mm
- WHEN the guide position is updated to 200mm
- THEN the guide's pos is 200

#### Acceptance Criteria

- [ ] Given guide add, the guide appears in canvasSettings.guides
- [ ] Given guide remove by ID, the guide is removed
- [ ] Given guide update, the specified properties change

---

### Requirement: Origin Reset

The system MUST reset the ruler origin to `(0, 0)`.

#### Scenario: Reset after panning

- GIVEN originX at 50 and originY at 30
- WHEN origin is reset
- THEN originX is 0 and originY is 0

#### Acceptance Criteria

- [ ] Given origin reset, both originX and originY return to 0

---

### Requirement: Color Palette

The system MUST support adding and removing palette colors. Duplicate colors MUST NOT be added. The palette MUST persist to local storage.

#### Scenario: Add a new color

- GIVEN an empty palette
- WHEN `'#ff0000'` is added
- THEN the palette contains `'#ff0000'`

#### Scenario: Duplicate color rejected

- GIVEN a palette containing `'#ff0000'`
- WHEN `'#ff0000'` is added again
- THEN the palette still has only one entry

#### Scenario: Remove by index

- GIVEN a palette with `['#ff0000', '#00ff00']`
- WHEN color at index 0 is removed
- THEN the palette contains only `'#00ff00'`

#### Acceptance Criteria

- [ ] Given a new color, it is added to the palette and persisted
- [ ] Given a duplicate color, the add is a no-op
- [ ] Given removal by index, the color is removed and persistence is updated

---

### Requirement: Default Canvas Settings

The store MUST initialize with deterministic defaults: grid with gridSize in mm, showGrid false, snapToGrid false, showRulers true, zoom 1, panX/panY 0, perspective 1000, empty guides, origin at (0, 0).

#### Scenario: Fresh editor defaults

- GIVEN a newly created editor store with no config overrides
- WHEN canvas settings are inspected
- THEN all fields match documented defaults

#### Scenario: Grid defaults from config

- GIVEN an EditorConfig with `gridDefaults: { gridSize: 5, snapToGrid: true }`
- WHEN the store is created
- THEN grid settings merge the overrides with system defaults

#### Acceptance Criteria

- [ ] Given a fresh editor, canvas settings match documented defaults
- [ ] Given gridDefaults in EditorConfig, overrides are merged with system defaults

---

### Requirement: Palette Persistence

The saved palette MUST be loaded from local storage on initialization and persisted after every add/remove operation.

#### Scenario: Load on init

- GIVEN palette data in local storage
- WHEN the editor store initializes
- THEN savedPalette reflects the stored data

#### Acceptance Criteria

- [ ] Given palette data in local storage, it is loaded on editor initialization
- [ ] Given a palette modification, the updated palette is persisted to local storage

---

### Requirement: Font Configuration

The system MUST allow replacing the available font list. Fonts are host-provided.

#### Scenario: Set available fonts

- GIVEN the default system fonts
- WHEN a new font list is provided
- THEN availableFonts reflects the new list

#### Acceptance Criteria

- [ ] Given setAvailableFonts, the font list is replaced

---

### Requirement: Media Source Configuration

The system MUST allow replacing or clearing the media source configuration.

#### Scenario: Set media source

- GIVEN no media source configured
- WHEN a media source with assets is provided
- THEN mediaSource reflects the new configuration

#### Scenario: Clear media source

- GIVEN a configured media source
- WHEN null is provided
- THEN mediaSource is null

#### Acceptance Criteria

- [ ] Given a media source config, mediaSource is updated
- [ ] Given null, mediaSource is cleared

---

### Requirement: Guide Editing Modal

The system MUST track which guide is being edited for precise positioning via a modal. Setting null closes the modal.

#### Scenario: Open guide editing

- GIVEN no guide being edited
- WHEN a guide ID is set for editing
- THEN editingGuideId reflects the guide ID

#### Scenario: Close guide editing

- GIVEN a guide being edited
- WHEN null is set
- THEN editingGuideId is null

#### Acceptance Criteria

- [ ] Given a guide ID, the editing modal state tracks it
- [ ] Given null, the editing modal state is cleared

---

## Spec Gaps

_None — all requirements have acceptance criteria._

---

## Non-Goals

- Core element operations (CRUD, selection, undo) → see [store-actions.md](store-actions.md)
- Canvas rendering and grid overlay → see `project/spec/editor/canvas.md`
- Guide rendering in rulers → see `project/spec/editor/canvas.md`
