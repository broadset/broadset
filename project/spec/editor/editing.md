# Editor — Editing Specification

## Purpose

Defines the interactive editing modes: path editing (modify existing SVG paths), path drawing (create new SVG paths point-by-point), clip-path editing (modify element clip masks visually), and element placement (draw-to-canvas new elements). These modes are mutually exclusive and auto-exit when the active selection changes.

---

## Requirements

### Requirement: Path Editing Mode

The system MUST track a `pathEditingElementId`. Starting path editing MUST select the target element and clear any active clip-path editing. Stopping MUST clear the ID. Changing the active selection to a different element or null MUST auto-exit path editing. Selecting the same element again MUST NOT exit path editing.

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

The system MUST track a `pathDrawingElementId`. Starting drawing MUST select the element and clear any active path editing or clip-path editing. Stopping MUST clear the drawing ID. Adding a path element MUST auto-enter drawing mode. Selection changes to a different element or null MUST auto-exit drawing. Path drawing MUST be completed by one of: (1) the user pressing Escape, which commits the current points and exits drawing mode, (2) the user pressing Enter, which closes the path (connects last point to first) and exits drawing mode, or (3) calling `stopPathDrawing()` programmatically.

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

### Requirement: Path Drawing Interaction

When path drawing mode is active, the canvas MUST respond to clicks to build the path point-by-point. The system MUST convert screen coordinates to element-local coordinates accounting for zoom and pan.

**Click-to-Place Behavior:**

1. Each primary-button click on the canvas appends a point to the path via `appendPathPoint(x, y)` where (x, y) are in document coordinates.
2. The first click produces an `M` (moveTo) command. Subsequent clicks produce `L` (lineTo) commands.
3. Clicks MUST be converted from screen pixels to document coordinates: `docX = (clientX − canvasRect.left) / zoom − panX / zoom`, accounting for element position.

**Completion:**

- **Escape key:** Commits the current points as-is and exits drawing mode via `stopPathDrawing()`.
- **Enter key:** Appends a `Z` (close path) command connecting the last point back to the first, then exits drawing mode.
- **Selection change** to a different element or null: Auto-exits drawing (see Path Drawing Mode state rules).

**Visual Feedback During Drawing:**

The live `<path>` element on the canvas MUST update immediately on each click, showing the path as it is being built. No additional overlay handles are shown during drawing — the path itself is the visual feedback.

#### Scenario: Click places first point

- GIVEN path drawing is active for an empty path element
- WHEN the user clicks at position (100, 50) on the canvas
- THEN the path content is updated with an `M` command at the element-local coordinate

#### Scenario: Subsequent click adds line segment

- GIVEN path drawing is active with one existing point
- WHEN the user clicks at position (200, 100)
- THEN an `L` command is appended to the path content

#### Scenario: Enter closes and exits

- GIVEN path drawing is active with 3+ points
- WHEN the user presses Enter
- THEN a `Z` command is appended and drawing mode exits

#### Scenario: Escape commits and exits

- GIVEN path drawing is active with points
- WHEN the user presses Escape
- THEN the current path is kept as-is and drawing mode exits

#### Acceptance Criteria

- [ ] Given path drawing mode, a canvas click appends a point to the path
- [ ] Given the first click, an M command is created; subsequent clicks create L commands
- [ ] Given Enter key, the path is closed with Z and drawing mode exits
- [ ] Given Escape key, the path is committed as-is and drawing mode exits
- [ ] Given clicks during drawing, screen coordinates are correctly converted to element-local coordinates accounting for zoom/pan

---

### Requirement: Path Editing Canvas Overlay

When path editing mode is active, the system MUST render an interactive SVG overlay on the canvas displaying draggable handles for all parsed path segments. This overlay enables direct manipulation of the path geometry.

**Overlay Structure:**

The overlay MUST be an SVG group element rendered on top of the path element. It MUST contain:

- **Anchor handles** (on-curve points) — one per segment endpoint (M, L, C endpoint, S endpoint, Q endpoint, A endpoint, H, V, T). Rendered as filled circles.
- **Control handles** (off-curve tangent points) — for Bézier curves (C, S, Q commands). Rendered as smaller unfilled circles.
- **Control lines** — thin lines connecting control handles to their corresponding anchor points, showing the tangent direction.

**Handle Visual Specification:**

| Handle type | Radius | Fill          | Stroke    | Stroke width | Cursor  |
| ----------- | ------ | ------------- | --------- | ------------ | ------- |
| Anchor      | `4px`  | `white`       | `#4285f4` | `1.5px`      | pointer |
| Control     | `3px`  | `transparent` | `#4285f4` | `1.5px`      | pointer |

Control lines MUST use `stroke: #4285f4`, `stroke-width: 1px`, `opacity: 0.5`.

**Handle Extraction:**

Handles MUST be extracted from the parsed path using `extractHandles()` (see path-geometry.md). Each handle carries:

- `type`: `'anchor'` or `'control'`
- `segment`: reference to the parent `PathSegment`
- `xIdx` / `yIdx`: coordinate indices within the segment's values array (`-1` if axis-constrained, e.g., H constrains Y, V constrains X)
- `x` / `y`: display position in element-local coordinates

**Drag Interaction:**

1. **Pointer down** on a handle MUST capture the pointer and begin drag tracking.
2. **Pointer move** MUST update the handle's coordinates in the segment values array, re-serialize the path, and update the element's `content` in real time (ephemeral/live updates). During drag, bounds MUST NOT be refitted (to prevent coordinate drift — see path-geometry.md → Tight SVG Bounding-Box Refit).
3. **Pointer up** MUST finalize the drag and commit the path change to the store. On session teardown (when editing stops), the element's bounding box MUST be refitted using the SVG `getBBox()` for tight curve bounds.

**Coordinate Conversion:**

Screen coordinates MUST be converted to element-local SVG coordinates using the SVG element's `getScreenCTM()` inverse transform. This ensures handles move correctly regardless of zoom, pan, or element rotation.

**Axis Constraints:**

- `H` (horizontal line) handles: only X movement allowed (Y locked)
- `V` (vertical line) handles: only Y movement allowed (X locked)
- All other handles: free X and Y movement

#### Scenario: Anchor handles visible in editing mode

- GIVEN path editing is active for a path with content `M10,10 L50,30 L80,10`
- WHEN the overlay renders
- THEN 3 anchor handles are rendered at the coordinates (10,10), (50,30), (80,10)

#### Scenario: Bézier control handles visible

- GIVEN path editing is active for a path with content `M10,25 C10,10 40,10 40,25`
- WHEN the overlay renders
- THEN 2 anchor handles and 2 control handles are rendered with connecting control lines

#### Scenario: Drag anchor updates path

- GIVEN path editing is active with an anchor handle at (50, 30)
- WHEN the user drags the anchor to (60, 40)
- THEN the path content is updated in real time with the new coordinate

#### Scenario: Drag control handle updates curve

- GIVEN path editing is active with a cubic Bézier control handle
- WHEN the user drags the control handle
- THEN the curve shape updates in real time

#### Scenario: Bounds refit on edit session end

- GIVEN the user has dragged path handles during editing
- WHEN path editing mode is stopped
- THEN the element's position, width, and height are refitted to tight SVG bounds

#### Scenario: H command constrains to horizontal

- GIVEN path editing is active with an `H` command handle
- WHEN the user drags the handle
- THEN only the X coordinate changes; Y remains locked

#### Acceptance Criteria

- [ ] Given path editing mode, anchor handles are rendered as white filled circles at each on-curve point
- [ ] Given path editing mode with Bézier segments, control handles are rendered as unfilled circles with connecting lines to their anchors
- [ ] Given a handle drag, the path content updates in real time (ephemeral)
- [ ] Given a drag completed (pointer up), the change is committed to the store
- [ ] Given path editing stops, the element bounding box is refitted using SVG getBBox()
- [ ] Given an H command handle, only X movement is allowed
- [ ] Given a V command handle, only Y movement is allowed
- [ ] Given zoom/pan changes, handles remain correctly positioned relative to the path

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

The system MUST track a `placement` state — a discriminated union that captures which sub-phase of placement the user is in (anchor, extent, ellipse-radius, ellipse-rotation) or `null` when inactive. The system MUST also track a `placementPreview` pointer coordinate (ephemeral, never part of history). Starting placement MUST clear any active path editing, path drawing, inline-text, clip-path, or motion-path editing. Cancelling MUST set `placement` back to `null`.

**Two-click (and three-click) placement model:** Every built-in placement is driven by explicit user clicks. The user's clicks always determine the element's size — built-ins MUST NOT fall back to factory-default dimensions. If the extent click equals the anchor click, it MUST be ignored and the system MUST remain in the sizing sub-state.

**Anchor semantics per element type:**

| Element | Mode | Click 1 | Click 2 | Click 3 |
|---|---|---|---|---|
| rectangle, image, svg, video, qrcode, clock, ticker, group, text | two-click (corner) | top-left corner | bottom-right corner | — |
| ellipse | three-click (center+radius+theta) | center | `rx = \|Δx\|`, `ry = \|Δy\|` from center | `rotation = atan2(Δy, Δx)` in degrees |
| path | multi-click | first vertex (M) | second vertex (L) | further clicks keep adding; Enter/Esc commits |
| external plugin element types | single-click | place at plugin's declared default size at click point | — | — |

For corner types the element is placed with its top-left at `(min(anchorX, extentX), min(anchorY, extentY))` and its `width`/`height` at `|Δx|`/`|Δy|`. Negative drags (down-left, up-right, etc.) are normalised.

For ellipse the anchor is the visual centre; `rx`/`ry` come from the component-wise deltas so a diagonal phase-2 click produces an oval and a near-horizontal one a flat oval. The element's top-left is `(anchor.x − rx, anchor.y − ry)` with `width = 2·rx`, `height = 2·ry`. Phase 3 stamps `rotation` (degrees) using `atan2(Δy, Δx)` of the pointer vs. the centre.

For path the first click creates the path element with a single `M0,0` point at the click and enters `path-drawing`; subsequent clicks dispatch to `appendPathPoint`. Enter commits, Escape cancels.

External plugins use single-click placement at the plugin's declared default size. They are the only path allowed to create an element at a factory-declared default size.

**Cursor/affordance:** Placement is communicated by the crosshair cursor and the active toolbar button highlight. There MUST NOT be a floating placement-mode banner.

**API surface:**

- `beginPlacement(store, elementType)` — enters `{ type: 'placement-anchor', elementType }`, clears all other editing modes
- `cancelPlacement(store)` — resets `placement` and `placementPreview` to `null`, returns `editingMode` to `{ type: 'none' }`
- `setPlacementAnchor(store, x, y)` — transitions from `placement-anchor` to the correct next sub-state (`placement-extent`, `placement-ellipse-radius`), or — for path — creates the path element with a single `M0,0` point and enters `path-drawing`, or — for external plugins — creates the element at the plugin default size and clears placement
- `updatePlacementPreview(store, x, y)` — ephemeral preview pointer update (no history)
- `commitPlacementExtent(store, x, y)` — corner types only: creates the element from the anchor/extent bounds, selects it, and clears placement. No-op if `(x, y)` equals the anchor
- `setEllipseRadius(store, x, y)` — ellipse only: transitions `placement-ellipse-radius` → `placement-ellipse-rotation`. No-op if `(x, y)` equals the anchor
- `commitEllipseRotation(store, x, y)` — ellipse only: creates the ellipse with the accumulated radius and the rotation derived from `atan2`, selects it, and clears placement

Dispatching any of these actions while `placement` is in the wrong sub-state MUST be a no-op.

#### Scenario: Start and cancel

- GIVEN no active placement
- WHEN `beginPlacement(store, "text")` then `cancelPlacement(store)` is called
- THEN `placement` goes from `{ type: 'placement-anchor', elementType: 'text' }` to `null`

#### Scenario: Placement clears editing modes

- GIVEN path editing is active
- WHEN `beginPlacement(store, "rectangle")` is called
- THEN `pathEditingElementId`, `pathDrawingElementId`, `inlineTextEditingElementId`, `clipPathEditingElementId`, `motionPathEditingElementId` are all `null`

#### Scenario: Two-click rectangle

- GIVEN `placement` is `{ type: 'placement-anchor', elementType: 'rectangle' }`
- WHEN `setPlacementAnchor(store, 50, 30)` then `commitPlacementExtent(store, 110, 70)` is called
- THEN a 60×40 rectangle is created at position (50, 30) and `placement` is `null`

#### Scenario: Extent click equal to anchor is ignored

- GIVEN `placement` is `{ type: 'placement-extent', elementType: 'rectangle', anchor: { x: 100, y: 50 } }`
- WHEN `commitPlacementExtent(store, 100, 50)` is called
- THEN no element is created and `placement` is unchanged

#### Scenario: Three-click ellipse

- GIVEN `placement` is `{ type: 'placement-anchor', elementType: 'ellipse' }`
- WHEN `setPlacementAnchor(store, 100, 100)`, then `setEllipseRadius(store, 130, 120)`, then `commitEllipseRotation(store, 150, 100)` is called
- THEN an ellipse is created with `rx = 30`, `ry = 20`, position `(70, 80)`, `width = 60`, `height = 40`, and `rotation` in degrees from `atan2(0, 50)`

#### Scenario: Path enters drawing on first click

- GIVEN `placement` is `{ type: 'placement-anchor', elementType: 'path' }`
- WHEN `setPlacementAnchor(store, 120, 80)` is called
- THEN a path element is created at `(120, 80)` with content `"M0,0"`, `placement` is `null`, and `pathDrawingElementId` is set to the new element

#### Scenario: Plugin single-click creates at default size

- GIVEN `placement` is `{ type: 'placement-anchor', elementType: 'countdown' }` and the plugin declares width 144, height 96
- WHEN `setPlacementAnchor(store, 200, 100)` is called
- THEN a countdown element is created at `(200, 100)` sized 144×96 and `placement` is `null`

#### Scenario: Escape cancels from any sub-state

- GIVEN `placement` is in any of `placement-anchor`, `placement-extent`, `placement-ellipse-radius`, `placement-ellipse-rotation`
- WHEN `cancelPlacement(store)` is called
- THEN `placement` and `placementPreview` are `null`, `editingMode` is `{ type: 'none' }`, and no element is created by the cancellation

#### Acceptance Criteria

- [ ] `beginPlacement("text")` followed by `cancelPlacement()` transitions `placement` from the anchor sub-state to `null`
- [ ] `beginPlacement("rectangle")` while any other editing mode is active clears that mode and enters `placement-anchor`
- [ ] Two-click rectangle placement from (50,30) to (110,70) creates a 60×40 element at (50,30)
- [ ] `commitPlacementExtent(anchor, anchor)` is a no-op and leaves `placement` unchanged
- [ ] Three-click ellipse with anchor (100,100), radius click (130,120) and rotation click (150,100) creates an ellipse with `rx=30`, `ry=20`, top-left (70,80), and rotation derived from `atan2(Δy, Δx)` in degrees
- [ ] Path first click creates a path element with `"M0,0"` content, selects it, enters `path-drawing`, and clears `placement`
- [ ] External plugin single-click placement creates the element at the plugin's declared default size
- [ ] Built-in placements MUST NOT fall back to factory default dimensions when the user's extent click lands on the anchor
- [ ] The floating placement-mode banner MUST NOT be rendered while placement is active

---

### Requirement: Clip-Path Editing Mode

The system MUST track a `clipPathEditingElementId`. Clip-path editing is available for any element with the `clipPath` capability flag enabled (rectangle, ellipse, image, svg, group). Starting clip-path editing MUST select the target element and clear any active path editing, path drawing, or placement mode. Stopping MUST clear the ID. Changing the active selection to a different element or null MUST auto-exit clip-path editing. Clip-path editing is mutually exclusive with all other editing modes.

**State management:**

- `startClipPathEditing(elementId)` — enters clip-path editing mode for the given element. If the element's `customClipPath` is empty, a default rectangular clip path (`polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)`) MUST be seeded and `maskType` set to `'custom'`. MUST be a no-op if the element lacks the `clipPath` capability.
- `stopClipPathEditing()` — exits clip-path editing mode, clears `clipPathEditingElementId`.
- `updateClipPathPoint(index, x, y)` — updates a control point at the given index to coordinates `(x, y)` in element-relative percentages. MUST be a no-op when not in clip-path editing mode.
- `insertClipPathPoint(afterIndex, x, y)` — inserts a new point after the given index. MUST be a no-op when not in editing mode.
- `deleteClipPathPoint(index)` — removes the point at the given index. MUST be a no-op if the path has 3 or fewer points.

All point mutations MUST update the element's `customClipPath` screen property in the store and be tracked by undo/redo.

#### Scenario: Start and stop

- GIVEN element `rect-1` has `clipPath` capability
- WHEN `startClipPathEditing("rect-1")` is called then `stopClipPathEditing()`
- THEN `clipPathEditingElementId` goes from `"rect-1"` to `null`

#### Scenario: Clip-path editing clears other modes

- GIVEN path editing is active for `path-1`
- WHEN `startClipPathEditing("rect-1")` is called
- THEN `pathEditingElementId` is `null`, `pathDrawingElementId` is `null`, and `clipPathEditingElementId` is `"rect-1"`

#### Scenario: Auto-exit on selection change

- GIVEN clip-path editing is active for `rect-1`
- WHEN `setActiveElement("text-1")` is called
- THEN `clipPathEditingElementId` becomes `null`

#### Scenario: No-op for elements without clipPath capability

- GIVEN element `text-1` does NOT have `clipPath` capability
- WHEN `startClipPathEditing("text-1")` is called
- THEN `clipPathEditingElementId` remains `null`

#### Scenario: Empty clip-path seeds default

- GIVEN `rect-1` has empty `customClipPath`
- WHEN `startClipPathEditing("rect-1")` is called
- THEN `customClipPath` is set to `polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)` and `maskType` is `'custom'`

#### Scenario: Update control point

- GIVEN clip-path editing is active with a 4-point polygon
- WHEN `updateClipPathPoint(1, 80, 0)` is called
- THEN the second point moves to `80% 0%` and `customClipPath` is updated

#### Scenario: Insert point

- GIVEN clip-path editing is active with a 3-point polygon
- WHEN `insertClipPathPoint(0, 50, 0)` is called
- THEN a new point is inserted after index 0, creating a 4-point polygon

#### Scenario: Delete point minimum enforced

- GIVEN clip-path editing is active with exactly 3 points
- WHEN `deleteClipPathPoint(1)` is called
- THEN the deletion is rejected and the polygon remains 3 points

#### Scenario: Delete point with sufficient points

- GIVEN clip-path editing is active with 5 points
- WHEN `deleteClipPathPoint(2)` is called
- THEN the point is removed, creating a 4-point polygon

#### Acceptance Criteria

- [ ] Given an element with `clipPath` capability, `clipPathEditingElementId` goes from the element ID to `null` on stop
- [ ] Given clip-path editing starts, other editing modes (path editing, path drawing, placement) are cleared
- [ ] Given selection changes to a different element, clip-path editing auto-exits
- [ ] Given an element without `clipPath` capability, `startClipPathEditing` is a no-op
- [ ] Given an element with empty `customClipPath`, a default rectangular polygon is seeded and `maskType` set to `'custom'`
- [ ] Given `updateClipPathPoint`, the corresponding point's coordinates update in `customClipPath`
- [ ] Given `insertClipPathPoint`, a new point is added to the polygon
- [ ] Given `deleteClipPathPoint` with > 3 points, the point is removed
- [ ] Given `deleteClipPathPoint` with exactly 3 points, deletion is rejected
- [ ] Given clip-path mutations, changes are tracked by undo/redo

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

Creating an element by type MUST use predefined default dimensions and content per type. The system MUST support: text (80×20, `'New Text'`), image (60×60, empty), svg (60×60, empty), path (80×50, empty), rectangle (80×50, empty), ellipse (50×50, empty), qrcode (40×40, `'https://example.com'`), group (120×80, empty), video (120×68, empty), clock (160×50, `'HH:mm:ss'`), ticker (400×40, `'["Item 1"]'`). Custom types MUST fall back to plugin-provided defaults or system fallbacks (80×50, empty).

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
- [ ] Given each built-in element type (image, svg, rectangle, ellipse, qrcode, group, video, clock, ticker), the factory produces the type-specific default dimensions and content

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

### Requirement: Motion Path Editing Mode

The editor MUST provide a motion path editing mode for visually authoring the Bézier curve used in motion path animation. When activated (via the timeline or animation panel), the editor MUST render a non-printing overlay on the canvas showing:

1. **The motion path curve** as a dashed line from the element's start position to its end position, following the SVG path shape
2. **Control points** (Bézier handles) as draggable circles along the curve
3. **The element's preview position** as a semi-transparent ghost at the current scrub time, positioned on the path

Dragging control points MUST update the `motionPath` SVG `d` string in real time. The path overlay MUST be zoom-compensated (constant visual size regardless of canvas zoom). Double-clicking the path MUST insert a new control point at the clicked arc position. Selecting a control point and pressing Delete MUST remove it (minimum 2 anchor points: start and end). Escape or clicking outside the path MUST exit motion path editing mode and commit changes. The motion path overlay MUST render above all elements but below the transform widget. Entry and exit follow the same mutex rules as path editing and clip-path editing — only one overlay mode can be active at a time.

#### Scenario: Enter motion path editing

- GIVEN an element with a motion path animation configured
- WHEN the user activates motion path editing from the timeline panel
- THEN the canvas renders the path curve, control points, and element ghost

#### Scenario: Drag control point updates path

- GIVEN motion path editing is active with a visible Bézier curve
- WHEN the user drags a control point
- THEN the path curve and the `motionPath` value update in real time

#### Scenario: Add control point by double-click

- GIVEN motion path editing is active
- WHEN the user double-clicks on the path curve
- THEN a new control point is inserted at the clicked position on the arc

#### Scenario: Exit motion path editing

- GIVEN motion path editing is active
- WHEN the user presses Escape
- THEN motion path editing exits, the overlay is removed, and changes are committed

#### Scenario: Mutex with other overlay modes

- GIVEN path point editing is active on another element
- WHEN the user enters motion path editing
- THEN path point editing is exited before motion path editing activates

#### Acceptance Criteria

- [ ] Given an element with motion path animation, entering motion path editing renders the path curve, control points, and element ghost
- [ ] Given a control point drag, the motionPath SVG `d` string updates in real time
- [ ] Given a double-click on the path, a new control point is inserted
- [ ] Given Escape pressed, motion path editing exits and changes are committed
- [ ] Given another overlay mode active, entering motion path editing exits the previous mode first
- [ ] Given the canvas is zoomed, the path overlay is zoom-compensated

---

### Requirement: Inline Text Formatting Toolbar

When inline text editing is active (double-click on text element) and the user selects a text range, the editor MUST display a floating formatting toolbar positioned above the selection (or below if insufficient space above). The toolbar MUST offer these formatting controls:

| Control    | Type          | Action                                            |
| ---------- | ------------- | ------------------------------------------------- |
| Bold       | Toggle button | Wraps/unwraps selection in `<strong>` tags        |
| Italic     | Toggle button | Wraps/unwraps selection in `<em>` tags            |
| Underline  | Toggle button | Wraps/unwraps selection in `<u>` tags             |
| Text color | Color swatch  | Wraps selection in `<span style="color:...">` tag |
| Font size  | NumField      | Wraps selection in `<span style="font-size:...">` |

Toggle buttons MUST reflect the current formatting state of the selection (pressed if all selected text has that format). When the selection is collapsed (cursor only, no range), the toolbar MUST be hidden. Applying a format MUST modify the element's `content` HTML using only the allowed rich text tags (b, i, u, br, span, strong, em). The toolbar MUST be zoom-compensated so it remains readable at any canvas zoom level. Clicking a toolbar control MUST NOT exit inline editing mode. The toolbar MUST use pointer-events to prevent accidental text deselection when clicking controls.

#### Scenario: Show toolbar on text selection

- GIVEN inline text editing is active on a text element
- WHEN the user selects a range of text
- THEN a floating formatting toolbar appears above the selection

#### Scenario: Apply bold to selection

- GIVEN the formatting toolbar is visible with text selected
- WHEN the user clicks Bold
- THEN the selected text is wrapped in `<strong>` tags in the element content

#### Scenario: Apply color to selection

- GIVEN the formatting toolbar is visible with text selected
- WHEN the user picks a color from the color swatch
- THEN the selected text is wrapped in `<span style="color:#chosen">` in the element content

#### Scenario: Toolbar hidden when selection collapses

- GIVEN the formatting toolbar is visible
- WHEN the user clicks to collapse the selection to a cursor
- THEN the formatting toolbar is hidden

#### Scenario: Toggle reflects current state

- GIVEN the selection contains only bold text
- WHEN the toolbar renders
- THEN the Bold toggle is in the pressed/active state

#### Acceptance Criteria

- [ ] Given a text selection during inline editing, the formatting toolbar appears
- [ ] Given Bold clicked, the selection is wrapped in `<strong>` tags
- [ ] Given Italic clicked, the selection is wrapped in `<em>` tags
- [ ] Given a color selection, the text is wrapped in `<span style="color:...">` tag
- [ ] Given the selection collapses, the toolbar is hidden
- [ ] Given the toolbar is clicked, inline editing mode is not exited
- [ ] Given selected text already formatted, the corresponding toggle is in pressed state

---

## Spec Gaps

- [ ] **In-Place Text Editing:** No automated tests verify inline editing activation, commit-on-Escape, commit-on-click-outside, drag suppression, or Enter line-break insertion.
- [ ] **Missing Font Preflight Rule:** No automated tests verify the `missing-font` preflight rule or its interaction with `allowedFonts` and system font fallbacks.
- [ ] **Motion Path Editing Mode:** No automated tests cover motion path overlay rendering, control point dragging, or overlay mutex behavior — requires CT.
- [ ] **Inline Text Formatting Toolbar:** No automated tests cover toolbar appearance, formatting application, or toolbar position — requires CT.

---

## Non-Goals

- Runtime data injection → see [data-store.md](data-store.md)
- Change stream and collaboration → see [collaboration.md](collaboration.md)
- Element type contracts and style shape → see `project/spec/model/element.md` and `project/spec/model/style.md`
