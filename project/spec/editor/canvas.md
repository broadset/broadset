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

When one or more elements are selected, the canvas MUST display a 2D transform widget around the selection bounds. This widget is the primary direct-manipulation affordance for 2D transforms on the canvas: dragging the element body MUST translate it, dragging resize handles MUST scale it on one or both axes, and dragging the rotation handle MUST rotate it. The widget MUST also provide border-radius adjustment handles where applicable, as defined in [transforms.md](transforms.md). Pointer interactions on these handles MUST initiate the corresponding transform operation, updating element geometry via ephemeral updates during drag and committing the final state on drop.

#### Scenario: Widget appears on selection

- GIVEN an element is selected on the canvas
- WHEN the selection is displayed
- THEN a transform widget with resize handles, a rotation handle, and (for rectangles) border-radius handles is rendered around the element bounds

#### Scenario: Pointer interaction initiates transform

- GIVEN a selected element with a visible transform widget
- WHEN the user drags a resize handle, the rotation handle, or the element body
- THEN the corresponding transform operation (resize, rotate, or translate) is applied to the element in real time

#### Scenario: Widget stays pixel-aligned with the selected element

- GIVEN a selected element rendered at any combination of canvas pan, canvas zoom, letterboxed aspect ratio, `rotation`, `style.rotateX`, `style.rotateY`, `style.rotateZ`, and `style.translateZ`
- WHEN the widget is displayed
- THEN the widget outline and handles MUST coincide with the element's rendered bounding box within ±1 px
- AND the widget MUST apply the same CSS transform chain (2D rotation and any 3D rotation / depth translation) as the element
- AND resize / rotation handle chips MUST retain a constant on-screen pixel size regardless of the active zoom or letterbox scale so they remain ergonomic
- AND the active CanvasSettings.perspective MUST be applied to the canvas coordinate layer so 3D rotations render with real depth

#### Acceptance Criteria

- [ ] Given a selected element, a 2D transform widget for translate, rotate, and scale is displayed around the element bounds
- [ ] Given a pointer drag on a widget handle, the corresponding transform operation from [transforms.md](transforms.md) is applied
- [ ] Given a pointer drag on the element body, the element is translated following the drag
- [ ] Given any pan / zoom / letterbox combination, the widget's bounding box coincides with the element's bounding box within ±1 px
- [ ] Given an element with non-zero `style.rotateX`, `rotateY`, `rotateZ`, or `translateZ`, the widget applies the identical CSS transform chain as the element
- [ ] Given any effective screen scale, resize and rotation handle chips render at a constant on-screen pixel size
- [ ] Given a document rendered on a canvas with `CanvasSettings.perspective`, the canvas coordinate layer exposes that perspective value as a CSS `perspective` so 3D rotations project correctly

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

The canvas MUST be zoomable and pannable as a first-class navigation surface. It MUST support zoom (via scroll wheel or pinch gesture) and pan (via background drag or modifier key). Zoom and pan values MUST be reflected in CanvasSettings.

Zoom MUST be clamped to a range of **0.1** (10%) to **4.0** (400%). Each scroll-wheel tick MUST change the zoom by **0.1** (10 percentage points). The editor MUST provide a **zoom-to-fit** action that scales and pans the viewport so the full document fits within the visible canvas area with a small margin.

The current zoom level MUST be displayed in the toolbar as a percentage (e.g. "100%").

**Cursor-Locked Zoom:**

Zoom MUST be centered on the pointer position (not the screen center). The world-coordinate point under the cursor MUST remain stationary after zoom. This means the pan offset MUST be recalculated on each zoom step:

1. Compute cursor position relative to the canvas container (`cursorX = event.clientX − rect.left`, `cursorY = event.clientY − rect.top`)
2. Compute the world point under the cursor: `worldX = (cursorX − panX) / oldZoom`, `worldY = (cursorY − panY) / oldZoom`
3. After applying the new zoom, set: `panX = cursorX − worldX × newZoom`, `panY = cursorY − worldY × newZoom`

**Wheel and Trackpad Gesture Intent Resolution:**

The canvas MUST distinguish between different input devices and modifier keys to resolve the user's intended action from `wheel` events. The wheel event listener MUST use `{ passive: false }` to allow `preventDefault()`.

| Intent                   | Detection                                                                                   | Action                                    |
| ------------------------ | ------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Trackpad pan             | `deltaMode === 0` (pixel), no `ctrlKey`/`altKey`, `deltaX > 0` OR small/fractional `deltaY` | Pan canvas by `(deltaX, deltaY)`          |
| Trackpad pinch-to-zoom   | `deltaMode === 0` (pixel) AND `ctrlKey` (browsers synthesize `ctrlKey` for trackpad pinch)  | Zoom at cursor, delta `= −deltaY × 0.002` |
| Trackpad Alt+scroll zoom | `deltaMode === 0` (pixel) AND `altKey`                                                      | Zoom at cursor (alternate method)         |
| Mouse wheel zoom         | `deltaMode !== 0` (line/page steps, typically 120-unit increments), no modifiers            | Zoom at cursor                            |
| Mouse wheel + Ctrl pan   | `deltaMode !== 0` AND (`ctrlKey` OR `metaKey`)                                              | Horizontal pan                            |
| Mouse wheel + Alt pan    | `deltaMode !== 0` AND `altKey` AND NOT `ctrlKey`                                            | Vertical pan                              |

**Trackpad Detection Heuristic:**

To distinguish trackpad from mouse wheel: if `deltaMode === 0` AND (`deltaX > 0` OR `|deltaY| < 80` OR `deltaY` is fractional), the input is likely a trackpad. Mouse wheels typically produce `deltaMode === 1` (line) or large integer pixel deltas.

#### Scenario: Zoom changes viewport scale

- GIVEN zoom at 1.0
- WHEN the user zooms in to 2.0
- THEN canvasSettings.zoom is 2.0 and elements appear at double size

#### Scenario: Zoom centers on cursor

- GIVEN the cursor is at position (300, 200) on the canvas
- WHEN the user scrolls to zoom in
- THEN the world point under (300, 200) remains at the same screen position

#### Scenario: Trackpad two-finger pan

- GIVEN a trackpad generating smooth pixel-mode wheel events
- WHEN the user performs a two-finger drag (no modifier keys)
- THEN the canvas pans by the delta amounts

#### Scenario: Trackpad pinch-to-zoom

- GIVEN a trackpad generating ctrlKey + pixel-mode wheel events
- WHEN the user pinches on the trackpad
- THEN the canvas zooms centered on the cursor position

#### Scenario: Pan offsets the viewport

- GIVEN panX and panY at 0
- WHEN the user pans right by 100px
- THEN canvasSettings.panX is 100

#### Scenario: Zoom clamped at maximum

- GIVEN zoom at 4.0
- WHEN the user scrolls to zoom in further
- THEN zoom remains at 4.0

#### Scenario: Zoom clamped at minimum

- GIVEN zoom at 0.1
- WHEN the user scrolls to zoom out further
- THEN zoom remains at 0.1

#### Scenario: Zoom-to-fit

- GIVEN a 1920×1080 document with the viewport showing only a corner
- WHEN zoom-to-fit is invoked
- THEN the viewport scales and pans so the full document is visible with margin

#### Acceptance Criteria

- [ ] Given a zoom operation, canvasSettings.zoom is updated and the viewport scales
- [ ] Given a pan operation, canvasSettings.panX/panY are updated
- [ ] Given zoom at 4.0, further zoom-in is clamped
- [ ] Given zoom at 0.1, further zoom-out is clamped
- [ ] Given scroll-wheel zoom, the zoom changes by 0.1 per tick
- [ ] Given scroll-wheel zoom, the zoom centers on the pointer position (cursor-locked)
- [ ] Given trackpad two-finger drag, the canvas pans smoothly
- [ ] Given trackpad pinch gesture, the canvas zooms centered on the cursor
- [ ] Given trackpad Alt+scroll, the canvas zooms (alternate zoom method)
- [ ] Given zoom-to-fit, the viewport scales and pans to show the full document

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

Rulers MUST render along the **top and left edges only** of the canvas — a horizontal ruler on top and a vertical ruler on the left. There is no right ruler or bottom ruler. A small origin square MUST appear at the top-left corner where the two rulers meet. Tick marks MUST use the current unit system (px, mm, or in). Guides MUST be draggable from the rulers onto the canvas.

**Ruler Size:** Each ruler MUST be `20px` thick (`RULER_SIZE`).

**Ruler Layout within RulerSystem:**

The RulerSystem MUST be the outermost positioning container for the canvas area. The layout MUST be:

- **Origin square:** `20px × 20px` at top-left corner (position: absolute, top: 0, left: 0)
- **Horizontal ruler:** Full remaining width, `20px` height, positioned at top from `left: 20px` to `right: 0`
- **Vertical ruler:** `20px` width, full remaining height, positioned at `left: 0` from `top: 20px` to `bottom: 0`
- **Canvas content:** The actual canvas element MUST be inset by `20px` from the top and `20px` from the left, filling the remaining space

The vertical ruler MUST render its full `20px` width — not be clipped or partially hidden. The container holding the vertical ruler MUST have `overflow: hidden` to clip the canvas drawing but the ruler container itself MUST be fully visible within the RulerSystem bounds.

**Zoom and Pan Awareness:**

Ruler tick marks and labels MUST account for the current zoom level and pan offset. The ruler origin (the position where "0" is displayed) MUST be calculated as:

- Horizontal ruler: `originX = unitToPx(documentOriginX, units) × zoom − panX`
- Vertical ruler: `originY = unitToPx(documentOriginY, units) × zoom − panY`

Tick spacing MUST adapt to the zoom level using a nice-step algorithm (e.g., choosing the nearest round interval from `[1, 2, 5, 10, 20, 50, 100, …]` that keeps ticks visually readable at the current zoom). At high zoom, smaller intervals appear; at low zoom, larger intervals are used.

**Ruler Visual:**

Rulers MUST use a glass-morphism background: `rgba(20, 20, 20, 0.72)` with `backdrop-filter: blur(6px)`. Tick strokes MUST use `rgba(255, 255, 255, 0.45)`. Labels MUST use `rgba(255, 255, 255, 0.65)` and font `9px IBM Plex Mono, monospace` (or equivalent monospace).

**Guides from Ruler Drag:**

When the user drags from a ruler onto the canvas, a guide line MUST be created at the drop position. The guide position MUST account for the current zoom and pan offsets — i.e., the guide is placed in document coordinates, not screen coordinates.

#### Scenario: Rulers display with current units

- GIVEN `canvasSettings.units: 'mm'` and `showRulers: true`
- WHEN the canvas is rendered
- THEN horizontal and vertical rulers display with millimeter markings

#### Scenario: Rulers account for zoom and pan

- GIVEN the canvas is zoomed to 200% and panned 100px right
- WHEN the rulers render
- THEN tick marks and labels shift to reflect the current document position under the viewport

#### Scenario: Drag guide from ruler

- GIVEN the ruler system is visible
- WHEN the user drags from the horizontal ruler onto the canvas
- THEN a new horizontal guide is created at the drop position in document coordinates

#### Acceptance Criteria

- [ ] Given showRulers true, rulers display with the current unit markings
- [ ] Given rulers, only top (horizontal) and left (vertical) rulers are rendered — no right or bottom ruler
- [ ] Given the vertical ruler, it renders at its full 20px width (not clipped or half-visible)
- [ ] Given zoom/pan changes, ruler tick marks and labels update to reflect the current viewport position
- [ ] Given a drag from the ruler, a new guide is created at the correct document coordinate
- [ ] Given the rulers, they use glass-morphism background with 9px monospace labels

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

The canvas MUST support an inline text editing mode that activates on double-click of a text element. During this mode the canvas MUST render a `contenteditable` overlay positioned and sized to match the text element's bounding box, adjusted for the current zoom level. The overlay MUST be zoom-compensated: text size and position MUST visually match the element's rendered appearance at the current zoom level. Canvas pan/zoom interactions MUST be suppressed while inline editing is active. The canvas MUST exit inline editing mode on Escape (cancel, discarding changes), click-outside (commit), or blur events. The overlay MUST have a visible border using the `--accent` color token so the user can see the editing boundary. The overlay MUST have a minimum size of 20×10px (screen pixels) to remain usable at small zoom levels.

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
- [ ] Given Escape during inline editing, changes are discarded and editing exits
- [ ] Given click-outside during inline editing, changes are committed and editing exits
- [ ] Given the overlay, it has a visible border using the `--accent` color token
- [ ] Given a very small element at low zoom, the overlay is at least 20×10px

---

### Requirement: Space-Bar Pan Mode

Holding the Space bar MUST temporarily switch the canvas cursor to a grab/pan cursor regardless of the current tool. While Space is held, clicking and dragging MUST pan the viewport. Releasing Space MUST restore the previous cursor and tool behavior. Space-bar pan MUST NOT activate while inline text editing is active.

#### Scenario: Space-bar panning

- GIVEN the pointer tool is active
- WHEN Space is held and the user drags on the canvas
- THEN the viewport pans and the cursor shows a grab icon

#### Scenario: Space released restores tool

- GIVEN Space is held (pan mode)
- WHEN Space is released
- THEN the cursor and tool behavior return to normal

#### Scenario: Space-bar suppressed during text editing

- GIVEN inline text editing is active
- WHEN Space is pressed
- THEN normal text input occurs (no pan mode)

#### Acceptance Criteria

- [ ] Given Space held, the cursor changes to a grab icon
- [ ] Given Space held and drag, the viewport pans
- [ ] Given Space released, the previous cursor and tool are restored
- [ ] Given inline text editing active, Space does not trigger pan mode

---

### Requirement: Marquee Selection Visual

The marquee selection rectangle MUST render with a semi-transparent fill using `--accent` at low opacity and a dashed border using `--accent` at full opacity. The dash pattern MUST be visible at all zoom levels.

#### Scenario: Marquee visual appearance

- GIVEN the user is dragging a selection marquee
- WHEN the rectangle is visible
- THEN it has a semi-transparent accent fill and a dashed accent border

#### Acceptance Criteria

- [ ] Given a marquee drag, the rectangle has a semi-transparent `--accent` fill
- [ ] Given a marquee drag, the rectangle has a dashed `--accent` border

---

### Requirement: Snap Guide Line Visual

Snap guide lines (generated during element drag/resize when edges or centers align) MUST render as thin solid lines using the `--accent` color. They MUST span the full visible canvas area along the axis of alignment (horizontal or vertical).

#### Scenario: Snap guide appears during drag

- GIVEN element A is being dragged near element B's left edge
- WHEN element A's left edge aligns within the snap threshold
- THEN a vertical `--accent` line appears spanning the full canvas height at that x-position

#### Acceptance Criteria

- [ ] Given a snap alignment, a guide line is rendered in `--accent` color
- [ ] Given a snap guide, it spans the full visible canvas along the alignment axis
- [ ] Given the drag ends, snap guide lines are removed

---

### Requirement: User Guide Line Visual

User-created guide lines (dragged from rulers) MUST render as thin solid lines using a distinct color from snap guides (e.g. `--danger` or a dedicated guide color token). Guides MUST have a hover hit area wider than the visible line to make them easy to grab. Locked guides MUST show a different opacity or dash pattern to indicate they cannot be moved. Dragging a guide back onto the ruler area MUST remove it.

#### Scenario: Guide line appearance

- GIVEN a horizontal guide at position 100mm
- WHEN the canvas is rendered
- THEN a thin horizontal line is visible at 100mm in the guide color

#### Scenario: Guide removal by dragging to ruler

- GIVEN an unlocked guide line
- WHEN the user drags it back to the ruler area
- THEN the guide is removed

#### Scenario: Locked guide visual

- GIVEN a locked guide line
- WHEN the canvas is rendered
- THEN the guide renders with reduced opacity or a dashed pattern

#### Acceptance Criteria

- [ ] Given a user guide, it renders as a solid line in the guide color
- [ ] Given a guide, the hover hit area is wider than the visible line
- [ ] Given a locked guide, it has a distinct visual (reduced opacity or dashed)
- [ ] Given a guide dragged to the ruler area, the guide is removed

---

## Spec Gaps

- [ ] **Canvas Element Rendering:** No automated tests verify DOM element positioning within the viewport (requires CT).
- [ ] **Element Selection by Click:** Click-to-select and click-to-deselect interactions are not unit-testable (requires CT with pointer events).
- [ ] **Zoom and Pan Interaction:** Wheel/pinch zoom and drag pan interactions are not unit-testable (requires CT).
- [ ] **Grid Visibility Toggle:** Showing/hiding grid based on `showGrid` flag is a rendering concern (requires CT).
- [ ] **Ruler Drag to Guide:** Dragging from ruler to create a guide requires pointer interaction (requires CT).
- [ ] **Canvas Inline Text Editing Mode:** Overlay appearance, zoom compensation rendering, and pan/zoom suppression during inline editing are not unit-testable (requires CT). The zoom math is covered by `computeInlineEditOverlay` unit tests.
- [ ] **Transform Widget:** Displaying the widget, rendering handles, and routing pointer events to transform operations are not unit-testable (requires CT). The transform computations are covered by unit tests in `transforms.test.ts`.
- [ ] **Transform Widget pointer math on strong 3D:** Pointer delta → canvas-space conversion for drag / resize assumes a 2D projection of the element's bounding box. When an element has large `style.rotateX` or `style.rotateY` (≥ ~30°), drag deltas become approximate because the visible geometry is perspective-foreshortened. Widget alignment still follows the full 3D transform; only interaction-to-delta conversion is approximate. Inverse-matrix pointer conversion for fully 3D-aware interaction is out of scope for this unit.

---

## Non-Goals

- Transform computation logic (zoom compensation, snap algorithms, anchor assignment) → see [transforms.md](transforms.md)
- Keyboard shortcut handling → see [keyboard.md](keyboard.md)
- Element rendering internals → see `project/spec/renderer/spec.md`
