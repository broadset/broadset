# Editor — Canvas Specification

## Purpose

Defines the behavioral contracts for the editor canvas — the primary visual workspace where elements are rendered, selected, and manipulated. This covers element rendering within the viewport, click and marquee selection, zoom and pan, grid overlay, ruler system, safety boundaries, and stability under stress. It does NOT cover transform handle interactions (→ [transforms.md](transforms.md)), keyboard shortcuts (→ [keyboard.md](keyboard.md)), or element rendering details (→ `project/spec/renderer/spec.md`). See [conventions](../../README.md).

---

## Requirements

### Requirement: Canvas Element Rendering

The editor canvas MUST render all elements from the active page as positioned, styled DOM nodes inside a viewport scaled by the current zoom level.

#### Scenario: Elements appear on canvas

- GIVEN a page with three elements at different positions
- WHEN the canvas is rendered
- THEN all three elements appear at their respective positions within the viewport

#### Scenario: Only active page elements are visible

- GIVEN a document with two pages
- WHEN page 0 is active
- THEN only page 0's elements are rendered on the canvas

#### Acceptance Criteria

- [ ] Given a page with elements, all are rendered at their positions in the canvas viewport
- [ ] Given a multi-page document, only the active page's elements are visible

---

### Requirement: Element Selection by Click

Clicking an element on the canvas MUST select it in the store. Clicking empty canvas space MUST deselect all elements.

#### Scenario: Click selects element

- GIVEN a canvas with element A
- WHEN element A is clicked
- THEN element A is selected in the store

#### Scenario: Click void deselects

- GIVEN element A is selected
- WHEN empty canvas space is clicked
- THEN no elements are selected

#### Acceptance Criteria

- [ ] Given a click on an element, it becomes selected
- [ ] Given a click on empty canvas, all elements are deselected

---

### Requirement: Transform Widget

When one or more elements are selected, the canvas MUST display a transform widget around the selection bounds. The widget MUST provide visual handles for resize, rotate, and border-radius adjustment as defined in [transforms.md](transforms.md). Pointer interactions on these handles MUST initiate the corresponding transform operation, updating element geometry via ephemeral updates during drag and committing the final state on drop.

#### Scenario: Widget appears on selection

- GIVEN an element is selected on the canvas
- WHEN the selection is displayed
- THEN a transform widget with resize handles, a rotation handle, and (for rectangles) border-radius handles is rendered around the element bounds

#### Scenario: Pointer interaction initiates transform

- GIVEN a selected element with a visible transform widget
- WHEN the user drags a resize handle, the rotation handle, or the element body
- THEN the corresponding transform operation (resize, rotate, or translate) is applied to the element in real time

#### Acceptance Criteria

- [ ] Given a selected element, a transform widget with handles is displayed around the element bounds
- [ ] Given a pointer drag on a widget handle, the corresponding transform operation from [transforms.md](transforms.md) is applied
- [ ] Given a pointer drag on the element body, the element is translated following the drag

---

### Requirement: Marquee Selection

Dragging on the canvas background MUST create a selection rectangle. All elements whose bounds intersect the rectangle MUST be selected.

#### Scenario: Marquee selects intersecting elements

- GIVEN three elements on the canvas
- WHEN a marquee rectangle is drawn encompassing two of them
- THEN those two elements are selected

#### Acceptance Criteria

- [ ] Given a marquee drag, all elements intersecting the rectangle are selected

---

### Requirement: Zoom and Pan

The canvas MUST support zoom (via scroll wheel or pinch gesture) and pan (via background drag or modifier key). Zoom and pan values MUST be reflected in CanvasSettings.

#### Scenario: Zoom changes viewport scale

- GIVEN zoom at 1.0
- WHEN the user zooms in to 2.0
- THEN canvasSettings.zoom is 2.0 and elements appear at double size

#### Scenario: Pan offsets the viewport

- GIVEN panX and panY at 0
- WHEN the user pans right by 100px
- THEN canvasSettings.panX is 100

#### Acceptance Criteria

- [ ] Given a zoom operation, canvasSettings.zoom is updated and the viewport scales
- [ ] Given a pan operation, canvasSettings.panX/panY are updated

---

### Requirement: Grid Overlay

The grid overlay MUST render grid lines at intervals determined by the grid settings and current zoom level. The grid is only visible when `showGrid` is true.

#### Scenario: Grid visible when enabled

- GIVEN `canvasSettings.grid.showGrid: true` with `gridSize: 10`
- WHEN the canvas is rendered
- THEN grid lines appear at 10mm intervals

#### Scenario: Grid hidden when disabled

- GIVEN `canvasSettings.grid.showGrid: false`
- WHEN the canvas is rendered
- THEN no grid lines are visible

#### Acceptance Criteria

- [ ] Given showGrid true, grid lines are visible at the configured interval
- [ ] Given showGrid false, no grid lines are rendered

---

### Requirement: Ruler System

Rulers MUST render along the top and left edges of the canvas with tick marks in the current unit system (px, mm, or in). Guides MUST be draggable from the rulers onto the canvas.

#### Scenario: Rulers display with current units

- GIVEN `canvasSettings.units: 'mm'` and `showRulers: true`
- WHEN the canvas is rendered
- THEN horizontal and vertical rulers display with millimeter markings

#### Scenario: Drag guide from ruler

- GIVEN the ruler system is visible
- WHEN the user drags from the horizontal ruler onto the canvas
- THEN a new horizontal guide is created at the drop position

#### Acceptance Criteria

- [ ] Given showRulers true, rulers display with the current unit markings
- [ ] Given a drag from the ruler, a new guide is created

---

### Requirement: Safety Boundaries

Safety boundaries MUST render overlays based on the current ViewMode and canvas padding. Broadcast mode shows broadcast-safe zones. Print mode shows print-margin zones. None mode shows no overlays.

#### Scenario: Broadcast safety overlay

- GIVEN `canvasSettings.viewMode: 'broadcast'` and canvas padding `[10, 10, 10, 10]`
- WHEN the canvas is rendered
- THEN broadcast-safe boundary overlays are visible

#### Scenario: No overlay in none mode

- GIVEN `canvasSettings.viewMode: 'none'`
- WHEN the canvas is rendered
- THEN no safety boundary overlays are visible

#### Acceptance Criteria

- [ ] Given broadcast viewMode with padding, safety overlays are rendered
- [ ] Given none viewMode, no overlays are rendered

---

### Requirement: Rapid Undo/Redo Stability

Rapid undo/redo sequences MUST NOT corrupt the store state.

#### Scenario: Rapid undo/redo

- GIVEN a series of committed element changes
- WHEN undo and redo are invoked rapidly in alternation
- THEN the store state remains consistent and valid after each operation

#### Acceptance Criteria

- [ ] Given rapid alternating undo/redo, the store state remains consistent

---

### Requirement: Interleaved Mutation Stability

Interleaved add/remove/undo operations MUST maintain store invariants (valid pages, consistent selection, no orphaned animation entries).

#### Scenario: Add, remove, undo interleaving

- GIVEN an element added, then removed, then undo invoked
- WHEN the store state is inspected
- THEN all invariants hold (element is restored, page structure is valid)

#### Acceptance Criteria

- [ ] Given interleaved add/remove/undo, all store invariants are maintained

---

### Requirement: Selection Cycling Stability

Rapidly cycling selection across multiple elements MUST NOT produce stale or inconsistent state.

#### Scenario: Fast selection cycling

- GIVEN ten elements on the canvas
- WHEN selection cycles through all ten rapidly
- THEN activeElementIds always reflects the last selection action

#### Acceptance Criteria

- [ ] Given rapid selection cycling, activeElementIds is always consistent with the last action

---

### Requirement: Canvas Inline Text Editing Mode

The canvas MUST support an inline text editing mode that activates on double-click of a text element. During this mode the canvas MUST render a `contenteditable` overlay positioned and sized to match the text element's bounding box, adjusted for the current zoom level. The overlay MUST be zoom-compensated: text size and position MUST visually match the element's rendered appearance at the current zoom level. Canvas pan/zoom interactions MUST be suppressed while inline editing is active. The canvas MUST exit inline editing mode on Escape, Enter (for commit), or click-outside events.

#### Scenario: Double-click at non-default zoom

- GIVEN a text element at zoom 200%
- WHEN the user double-clicks the element
- THEN a `contenteditable` overlay appears at the correct scaled position and size

#### Scenario: Pan suppressed during inline editing

- GIVEN inline editing is active
- WHEN the user attempts to pan the canvas
- THEN panning is suppressed

#### Acceptance Criteria

- [ ] Given a double-click on a text element, a `contenteditable` overlay appears at the element's position
- [ ] Given inline editing at a non-100% zoom level, the overlay position and size are zoom-compensated
- [ ] Given inline editing mode, canvas pan and zoom are suppressed

---

## Spec Gaps

- [ ] **Canvas Element Rendering:** No automated tests verify DOM element positioning within the viewport (requires CT).
- [ ] **Element Selection by Click:** Click-to-select and click-to-deselect interactions are not unit-testable (requires CT with pointer events).
- [ ] **Zoom and Pan Interaction:** Wheel/pinch zoom and drag pan interactions are not unit-testable (requires CT).
- [ ] **Grid Visibility Toggle:** Showing/hiding grid based on `showGrid` flag is a rendering concern (requires CT).
- [ ] **Ruler Drag to Guide:** Dragging from ruler to create a guide requires pointer interaction (requires CT).
- [ ] **Canvas Inline Text Editing Mode:** Overlay appearance, zoom compensation rendering, and pan/zoom suppression during inline editing are not unit-testable (requires CT). The zoom math is covered by `computeInlineEditOverlay` unit tests.
- [ ] **Transform Widget:** Displaying the widget, rendering handles, and routing pointer events to transform operations are not unit-testable (requires CT). The transform computations are covered by unit tests in `transforms.test.ts`.

---

## Non-Goals

- Transform computation logic (zoom compensation, snap algorithms, anchor assignment) → see [transforms.md](transforms.md)
- Keyboard shortcut handling → see [keyboard.md](keyboard.md)
- Element rendering internals → see `project/spec/renderer/spec.md`
