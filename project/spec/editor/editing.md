# Editor — Editing Specification

## Purpose

Defines mutually exclusive interactive editing modes for structured vector paths, typed clip sources, canonical element placement, motion paths, and structured inline text.

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

The system MUST track a `pathDrawingElementId`. Starting drawing selects a canonical vector path and clears other editing modes. Adding a vector path auto-enters drawing. Selection changes auto-exit. Escape commits current structured points and exits; Enter sets typed closure and exits; `stopPathDrawing()` exits programmatically.

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

- GIVEN path drawing is active for a vector path with no points
- WHEN the user clicks at position (100, 50) on the canvas
- THEN a stable typed move point is added at the element-local coordinate

#### Scenario: Subsequent click adds line segment

- GIVEN path drawing is active with one existing point
- WHEN the user clicks at position (200, 100)
- THEN a stable typed line segment is appended

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

The overlay MUST be a derived SVG group rendered over the vector path. It MUST contain:

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
2. **Pointer move** MUST update the addressed stable point/control in ephemeral structured geometry. During drag, bounds MUST NOT be refitted to prevent coordinate drift.
3. **Pointer up** MUST finalize the drag and commit the path change to the store. On session teardown (when editing stops), the element's bounding box MUST be refitted using the SVG `getBBox()` for tight curve bounds.

**Coordinate Conversion:**

Screen coordinates MUST be converted to element-local SVG coordinates using the SVG element's `getScreenCTM()` inverse transform. This ensures handles move correctly regardless of zoom, pan, or element rotation.

**Axis Constraints:**

- `H` (horizontal line) handles: only X movement allowed (Y locked)
- `V` (vertical line) handles: only Y movement allowed (X locked)
- All other handles: free X and Y movement

#### Scenario: Anchor handles visible in editing mode

- GIVEN path editing is active for structured move and line segments at those coordinates
- WHEN the overlay renders
- THEN 3 anchor handles are rendered at the coordinates (10,10), (50,30), (80,10)

#### Scenario: Bézier control handles visible

- GIVEN path editing is active for a structured cubic segment with those coordinates
- WHEN the overlay renders
- THEN 2 anchor handles and 2 control handles are rendered with connecting control lines

#### Scenario: Drag anchor updates path

- GIVEN path editing is active with an anchor handle at (50, 30)
- WHEN the user drags the anchor to (60, 40)
- THEN ephemeral structured geometry updates in real time

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
- [ ] Given a handle drag, structured geometry updates ephemerally in real time
- [ ] Given a drag completed (pointer up), the change is committed to the store
- [ ] Given path editing stops, the element bounding box is refitted using SVG getBBox()
- [ ] Given an H command handle, only X movement is allowed
- [ ] Given a V command handle, only Y movement is allowed
- [ ] Given zoom/pan changes, handles remain correctly positioned relative to the path

---

### Requirement: Path Point Appending

The system MUST append typed structured path entities during drawing. The first click creates a stable move point; subsequent clicks create stable line segments. Coordinates are element-local in the surface unit. Bounds are recalculated with half-stroke padding while local points and the exact matrix are rebased atomically to preserve world geometry. Display rounding to two decimals MUST NOT reduce canonical precision. Appending outside drawing mode is a no-op.

#### Scenario: First point creates M command

- GIVEN drawing is active for `path-1`
- WHEN `appendPathPoint(10, 20)` is called
- THEN structured geometry contains one move point and bounds include stroke padding

#### Scenario: Subsequent points create L commands

- GIVEN three points appended: (10,20), (30,40), (50,60)
- WHEN the element is inspected
- THEN structured geometry contains one move and two line segments with grown bounds

#### Scenario: Coordinates rounded

- GIVEN `appendPathPoint(10.12345, 20.6789)`
- WHEN the element is inspected
- THEN position values are rounded to 2 decimal places

#### Scenario: No-op when not drawing

- GIVEN drawing mode is not active
- WHEN `appendPathPoint(10, 20)` is called
- THEN structured geometry is unchanged

#### Acceptance Criteria

- [ ] Given drawing is active for `path-1`, one stable move point exists and bounds include stroke padding
- [ ] Given three points appended, structured geometry has one move and two stable line segments with grown bounds
- [ ] Given `appendPathPoint(10.12345, 20.6789)`, position values are rounded to 2 decimal places
- [ ] Given drawing mode is not active, structured geometry is unchanged

---

### Requirement: Element Placement Mode

The system MUST track a `placement` state — a discriminated union that captures which sub-phase of placement the user is in (anchor, extent, ellipse-radius, ellipse-rotation) or `null` when inactive. The system MUST also track a `placementPreview` pointer coordinate (ephemeral, never part of history). Starting placement MUST clear any active path editing, path drawing, inline-text, clip-path, or motion-path editing. Cancelling MUST set `placement` back to `null`.

**Two-click (and three-click) placement model:** Every built-in placement is driven by explicit user clicks. The user's clicks always determine the element's size — built-ins MUST NOT fall back to factory-default dimensions. If the extent click equals the anchor click, it MUST be ignored and the system MUST remain in the sizing sub-state.

**Anchor semantics per authoring tool:**

| Element                                                     | Mode                              | Click 1                                                   | Click 2                                  | Click 3                                       |
| ----------------------------------------------------------- | --------------------------------- | --------------------------------------------------------- | ---------------------------------------- | --------------------------------------------- |
| rectangle, image, video, qrcode, clock, ticker, group, text | two-click (corner)                | top-left corner                                           | bottom-right corner                      | —                                             |
| ellipse                                                     | three-click (center+radius+theta) | center                                                    | `rx = \|Δx\|`, `ry = \|Δy\|` from center | `rotation = atan2(Δy, Δx)` in degrees         |
| path                                                        | multi-click                       | first vertex (M)                                          | second vertex (L)                        | further clicks keep adding; Enter/Esc commits |
| SVG import                                                  | import action                     | maps to native vectors or safe foreign fallback           | —                                        | —                                             |
| registered plugin tools                                     | single-click                      | place a canonical plugin element at declared default size | —                                        | —                                             |

For corner types the element is placed with its top-left at `(min(anchorX, extentX), min(anchorY, extentY))` and its `width`/`height` at `|Δx|`/`|Δy|`. Negative drags (down-left, up-right, etc.) are normalised.

For ellipse, the anchor is the visual centre; component-wise deltas derive vector ellipse bounds. Phase 3 derives rotation through `atan2` and composes it into the exact canonical matrix.

For path, the first click creates a vector path with a stable move point and enters drawing; subsequent clicks append structured points/segments. Enter closes; Escape commits open geometry.

External plugins use single-click placement at the plugin's declared default size. They are the only path allowed to create an element at a factory-declared default size.

**Cursor/affordance:** Placement is communicated by the crosshair cursor and the active toolbar button highlight. There MUST NOT be a floating placement-mode banner.

**API surface:**

- `beginPlacement(store, elementType)` — enters `{ type: 'placement-anchor', elementType }`, clears all other editing modes
- `cancelPlacement(store)` — resets `placement` and `placementPreview` to `null`, returns `editingMode` to `{ type: 'none' }`
- `setPlacementAnchor(store, x, y)` — transitions to the next sub-state; for path creates a vector path with a stable move point; for registered plugins creates `kind: 'plugin'` at typed defaults
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
- THEN a vector ellipse is created with 60×40 bounds and an exact matrix composed from the center and derived rotation

#### Scenario: Path enters drawing on first click

- GIVEN `placement` is `{ type: 'placement-anchor', elementType: 'path' }`
- WHEN `setPlacementAnchor(store, 120, 80)` is called
- THEN a vector path with one stable move point is created at `(120, 80)`, placement clears, and drawing targets its ID

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
- [ ] Three-click ellipse creates a vector ellipse with 60×40 bounds and exact matrix derived from center and angle
- [ ] Path first click creates a vector path with one stable move point, selects it, enters drawing, and clears placement
- [ ] External plugin single-click placement creates the element at the plugin's declared default size
- [ ] Built-in placements MUST NOT fall back to factory default dimensions when the user's extent click lands on the anchor
- [ ] The floating placement-mode banner MUST NOT be rendered while placement is active

---

### Requirement: Clip-Path Editing Mode

The system MUST track a `clipPathEditingElementId`. Clip editing is available when derived capability permits typed `appearance.clip` (including vector rectangle/ellipse, image, sanitized-vector foreign, and group). Starting selects the target and clears other modes; selection change auto-exits. The editing ID is runtime state only.

**State management:**

- `startClipPathEditing(elementId)` — enters clip editing. If absent, one atomic batch creates a vector rectangle clip source with fresh stable ID and assigns its typed reference. It is a no-op when capability is absent.
- `stopClipPathEditing()` — exits clip-path editing mode, clears `clipPathEditingElementId`.
- `updateClipPathPoint(pointId, x, y)` — updates a stable structured point in clip-source local coordinates; no-op outside editing.
- `insertClipPathPoint(afterPointId, x, y)` — inserts fresh stable point/segment identity; no-op outside editing.
- `deleteClipPathPoint(pointId)` — removes by stable ID and rejects geometry with fewer than three required points.

All mutations update structured vector clip-source geometry and are tracked atomically by undo/redo. Raw CSS and arbitrary SVG never enter canonical state.

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

- GIVEN `rect-1` has no typed clip reference
- WHEN `startClipPathEditing("rect-1")` is called
- THEN a vector rectangle source is created and `rect-1.appearance.clip` references it

#### Scenario: Update control point

- GIVEN clip-path editing is active with a 4-point polygon
- WHEN `updateClipPathPoint(pointId, 80, 0)` is called
- THEN that structured point moves in source-local coordinates

#### Scenario: Insert point

- GIVEN clip-path editing is active with a 3-point polygon
- WHEN `insertClipPathPoint(firstPointId, 50, 0)` is called
- THEN a new point is inserted after index 0, creating a 4-point polygon

#### Scenario: Delete point minimum enforced

- GIVEN clip-path editing is active with exactly 3 points
- WHEN `deleteClipPathPoint(pointId)` is called
- THEN the deletion is rejected and the polygon remains 3 points

#### Scenario: Delete point with sufficient points

- GIVEN clip-path editing is active with 5 points
- WHEN `deleteClipPathPoint(pointId)` is called
- THEN the point is removed, creating a 4-point polygon

#### Acceptance Criteria

- [ ] Given an element with `clipPath` capability, `clipPathEditingElementId` goes from the element ID to `null` on stop
- [ ] Given clip-path editing starts, other editing modes (path editing, path drawing, placement) are cleared
- [ ] Given selection changes to a different element, clip-path editing auto-exits
- [ ] Given an element without `clipPath` capability, `startClipPathEditing` is a no-op
- [ ] Given an element without a clip, a vector rectangle source and typed reference are created atomically
- [ ] Given `updateClipPathPoint`, the addressed structured point updates by stable ID
- [ ] Given `insertClipPathPoint`, a new point is added to the polygon
- [ ] Given `deleteClipPathPoint` with > 3 points, the point is removed
- [ ] Given `deleteClipPathPoint` with exactly 3 points, deletion is rejected
- [ ] Given clip-path mutations, changes are tracked by undo/redo

---

### Requirement: Vector Path Factory Defaults

The system MUST create vector paths with default 80×50 positive bounds, empty structured path geometry, a default black typed stroke layer, and none fill paint. The exact matrix centers the element on the surface.

#### Scenario: Path factory defaults

- GIVEN a canvas of 200×100
- WHEN a vector path is created
- THEN bounds are 80×50, its matrix centers it, and typed appearance defaults are set

#### Acceptance Criteria

- [ ] Given a 200×100 surface, bounds are 80×50, the matrix centers it, and typed appearance defaults are set

---

### Requirement: Canonical Element Factory Defaults

Creating through a tool MUST use predefined positive bounds and schema-valid typed payload. Defaults remain: text 80×20 with one paragraph/run containing `New Text`; image 60×60 with an explicitly missing placeholder asset; vector path 80×50 empty; vector rectangle 80×50; vector ellipse 50×50; qrcode 40×40 with typed example value; group 120×80; video 120×68 with missing placeholder asset; clock 160×50 with typed `HH:mm:ss` format; ticker 400×40 with one stable typed `Item 1`. SVG uses the importer. Registered plugins supply canonical inert payload defaults or the system plugin fallback 80×50.

#### Scenario: Text factory defaults

- GIVEN element type `'text'`
- WHEN an element is created via the factory
- THEN bounds are 80×20 and structured text contains `New Text`

#### Scenario: Custom type with plugin defaults

- GIVEN a plugin with typed defaults containing 100×100 bounds and inert payload `{ label: 'Timer' }`
- WHEN an element of the plugin type is created
- THEN a canonical plugin element uses those bounds and payload

#### Scenario: Custom type without plugin defaults

- GIVEN a plugin with no defaults specified
- WHEN an element of the plugin type is created
- THEN a canonical plugin element uses 80×50 bounds and empty object payload

#### Acceptance Criteria

- [ ] Given the text tool, factory produces 80×20 bounds and structured `New Text`
- [ ] Given a plugin with typed defaults, factory uses its bounds and inert payload
- [ ] Given a plugin without defaults, factory uses system fallback dimensions
- [ ] Given each canonical core tool and vector subtype tool, factory produces schema-valid typed defaults
- [ ] Given SVG import, mapped vectors or safe foreign fallbacks are created instead of an SVG core kind

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

Each canonical element kind/vector subtype plus document-kind combination MUST have deterministic editing capabilities. Properties outside the schema-approved capability set are hidden. Authorized plugin registrations MAY reduce or expose payload-specific controls but cannot bypass validation.

#### Scenario: Text element capabilities

- GIVEN a text element in a motion document
- WHEN its capability profile is queried
- THEN typography properties (fontFamily, fontSize, etc.) are editable

#### Scenario: Rectangle lacks typography

- GIVEN a vector rectangle
- WHEN its capability profile is queried
- THEN typography properties are not editable

#### Scenario: Plugin capability override

- GIVEN a plugin with `capabilities: { hasBorderRadius: false }`
- WHEN an element of that plugin type is selected
- THEN border-radius editing is disabled

#### Acceptance Criteria

- [ ] Given a text element, typography properties are in the editable capability set
- [ ] Given a vector rectangle, typography properties are not in the capability set
- [ ] Given a plugin with capability overrides, the overrides are applied

---

### Requirement: Preflight Diagnostics

The system MUST provide a preflight checker that inspects the current editor state or a standalone document for issues. Issues MUST have severity (error, warning, info), element name, message, and rule identifier. The following named rules MUST be evaluated:

- **title-safe:** Text, image, vector, and foreign-preview elements extending beyond the 90% title-safe inset MUST produce a `warning`.
- **dpi-resolution:** Image elements whose rendered pixel dimensions exceed 500px MUST produce an `info` recommending a minimum source resolution of 1.5× the rendered size.
- **bleed:** In print documents, elements extending beyond `surface` trim/bleed intent MUST produce a warning.
- **small-text:** In print documents, text runs below 6pt-equivalent MUST produce a warning.
- **color-mode:** In print documents, out-of-output-gamut colors MUST produce an info diagnostic.
- **unsupported-property:** Canonical properties not representable by a referenced output profile MUST produce a warning per property.

Diagnostics MUST have stable severity classification and deterministic ordering.

#### Scenario: Title-safe violation

- GIVEN a text element positioned outside the 90% title-safe inset
- WHEN preflight diagnostics run
- THEN a `warning` is emitted with rule `title-safe`

#### Scenario: Clean document passes preflight

- GIVEN a valid document with all fonts available
- WHEN preflight is run
- THEN no issues are reported

#### Scenario: Unsupported property for print output

- GIVEN a print-mode document with an element using a screen-only property
- WHEN preflight diagnostics run
- THEN a `warning` is emitted per unsupported property

#### Acceptance Criteria

- [ ] Given a text element outside title-safe inset, a warning with rule title-safe is emitted
- [ ] Given a large image, an info with rule dpi-resolution is emitted
- [ ] Given a print document with elements beyond bleed, a warning with rule bleed is emitted
- [ ] Given print output with text below 6pt, a warning with rule small-text is emitted
- [ ] Given print output with out-of-gamut colors, an info with rule color-mode is emitted
- [ ] Given a property unsupported by a referenced print profile, a warning with rule unsupported-property is emitted
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

Double-clicking a text element MUST enter inline editing through a `contenteditable` transport overlay derived from structured paragraphs/runs. DOM HTML is never project state. The editor suppresses drag/resize while active. Escape or click-outside exits and commits typed text operations; Enter splits/inserts paragraph structure. Stable paragraph/run IDs survive where logical entities survive, and typed formatting is respected.

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

#### Scenario: Typing updates structured text in real-time

- GIVEN inline editing is active
- WHEN the user types text
- THEN ephemeral structured text updates in real time and commit preserves stable run identity

#### Scenario: Drag suppressed during inline editing

- GIVEN inline editing is active
- WHEN the user attempts to drag the element
- THEN the drag is suppressed and text selection occurs instead

#### Acceptance Criteria

- [ ] Given a double-click on a text element, inline editing mode activates
- [ ] Given inline editing mode, pressing Escape commits changes and exits
- [ ] Given inline editing mode, clicking outside commits changes and exits
- [ ] Given inline editing mode, drag interactions are suppressed
- [ ] Given inline editing mode, the transport overlay matches resolved structured-text formatting
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

Dragging control points MUST update the sequence track's typed spatial-path geometry with stable point IDs. The derived SVG overlay remains zoom-compensated. Double-click inserts a fresh stable point at the clicked arc position; Delete removes the selected point while enforcing at least start/end anchors. Escape or click-outside exits and commits. The overlay remains between scene elements and transform widget, mutually exclusive with other editing modes.

#### Scenario: Enter motion path editing

- GIVEN a stable transform track targeting the element uses typed spatial-path interpolation
- WHEN the user activates motion path editing from the timeline panel
- THEN the canvas renders the path curve, control points, and element ghost

#### Scenario: Drag control point updates path

- GIVEN motion path editing is active with a visible Bézier curve
- WHEN the user drags a control point
- THEN the path curve and that track's typed spatial-path geometry update in real time

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

- [ ] Given a targeted transform track with spatial-path interpolation, entering motion path editing renders the path curve, control points, and element ghost
- [ ] Given a control point drag, typed spatial-path geometry updates ephemerally and commits by stable point ID
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

Toggle buttons MUST reflect typed formatting across selected runs. When the selection is collapsed, the toolbar is hidden. Applying a format updates typed run properties and splits/merges runs with stable identity as needed; it MUST NOT author HTML. The toolbar remains zoom-compensated and its pointer handling preserves selection.

#### Scenario: Show toolbar on text selection

- GIVEN inline text editing is active on a text element
- WHEN the user selects a range of text
- THEN a floating formatting toolbar appears above the selection

#### Scenario: Apply bold to selection

- GIVEN the formatting toolbar is visible with text selected
- WHEN the user clicks Bold
- THEN selected runs receive typed bold/weight properties

#### Scenario: Apply color to selection

- GIVEN the formatting toolbar is visible with text selected
- WHEN the user picks a color from the color swatch
- THEN selected runs receive the chosen typed color

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
- [ ] Given a color selection, typed run color is updated without authored markup
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
