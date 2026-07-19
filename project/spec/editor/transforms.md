# Editor — Transform Interactions Specification

## Purpose

Defines the behavioral contracts for element transform interactions: drag translation, resize via handles, rotation, anchor auto-assignment, zoom compensation, 3D transform persistence, border-radius handles, smart guide snapping, grid snapping, and transform sequence stability. These are the canvas-level interactions that modify element geometry and are exposed through the transform widget that appears whenever a canvas element is selected. See [conventions](../../README.md).

---

## Requirements

### Requirement: Drag Translation

Dragging a selected element MUST update its position. During drag, updates are ephemeral (not tracked by undo). On drop, the final position is committed.

#### Scenario: Drag moves element

- GIVEN a selected element at position (10, 20)
- WHEN the element is dragged to (50, 60)
- THEN the element position is (50, 60) after drop

#### Scenario: Drag is ephemeral, drop commits

- GIVEN a drag operation in progress
- WHEN position updates continuously during drag
- THEN undo history is not modified until drop commits the final position

#### Acceptance Criteria

- [ ] Given a drag operation, the element moves to the new position on drop
- [ ] Given a drag, intermediate positions are ephemeral and only the final position is committed

---

### Requirement: Resize via Handles

The transform widget MUST provide 8 resize handles (nw, n, ne, e, se, s, sw, w). Dragging a handle MUST change the element's width and/or height. Corner handles resize both axes; edge handles resize one axis.

Each handle MUST display an appropriate resize cursor based on its position:

| Handle | Cursor      |
| ------ | ----------- |
| nw     | `nw-resize` |
| n      | `n-resize`  |
| ne     | `ne-resize` |
| e      | `e-resize`  |
| se     | `se-resize` |
| s      | `s-resize`  |
| sw     | `sw-resize` |
| w      | `w-resize`  |

Handles MUST be rendered as small squares (sized in screen pixels, not canvas units, so they remain a consistent size regardless of zoom). Handle fill MUST use `--accent` color. Handle border MUST be white for contrast.

#### Scenario: Corner resize

- GIVEN a selected element with width 80, height 50
- WHEN the SE handle is dragged to expand by (20, 10)
- THEN width becomes 100 and height becomes 60

#### Scenario: Edge resize

- GIVEN a selected element
- WHEN the E handle is dragged right by 30
- THEN width increases by 30 and height is unchanged

#### Acceptance Criteria

- [ ] Given a corner handle drag, both width and height change
- [ ] Given an edge handle drag, only the corresponding axis changes
- [ ] Given each handle position, the appropriate directional resize cursor is shown
- [ ] Given any zoom level, handles remain a constant screen-pixel size
- [ ] Given handles, they are rendered as `--accent` filled squares with white borders

---

### Requirement: Rotation

A rotation handle MUST allow rotating the element. Rotation is stored in degrees. The rotation handle MUST be positioned above the top-center of the selection bounds, offset vertically from the bounding box. It MUST display a `grab` cursor on hover and a `grabbing` cursor during drag. A thin line MUST connect the rotation handle to the top-center of the bounding box.

#### Scenario: Rotate element

- GIVEN a selected element with rotation 0
- WHEN the rotation handle is dragged to 45 degrees
- THEN the element's rotation is 45

#### Acceptance Criteria

- [ ] Given a rotation handle drag, the element's rotation updates in degrees
- [ ] Given the rotation handle, it is positioned above top-center of the bounding box
- [ ] Given hover on the rotation handle, the cursor is `grab`; during drag it is `grabbing`
- [ ] Given the rotation handle, a thin line connects it to the bounding box top-center

---

### Requirement: Anchor Auto-Assignment

After translation, `anchorX` and `anchorY` MUST be recalculated based on which canvas quadrant the element center occupies. Center-left of canvas → anchorX `'left'`. Center-right → anchorX `'right'`. Same logic vertically.

#### Scenario: Element in top-left quadrant

- GIVEN a canvas of 508mm × 285.75mm
- WHEN an element is positioned with its center in the top-left quadrant
- THEN anchorX is `'left'` and anchorY is `'top'`

#### Scenario: Element in bottom-right quadrant

- GIVEN a canvas of 508mm × 285.75mm
- WHEN an element is positioned with its center in the bottom-right quadrant
- THEN anchorX is `'right'` and anchorY is `'bottom'`

#### Acceptance Criteria

- [ ] Given an element centered in the top-left quadrant, anchors are left/top
- [ ] Given an element centered in the bottom-right quadrant, anchors are right/bottom

---

### Requirement: Zoom-Compensated Transforms

Drag, resize, and rotate deltas MUST be divided by the current zoom level so canvas-space movement is 1:1 with screen-space pointer movement.

#### Scenario: Drag at zoom 2x

- GIVEN zoom at 2.0
- WHEN the user drags 100 screen pixels to the right
- THEN the element moves 50mm in canvas space (100 / 2)

#### Scenario: Resize at zoom 0.5x

- GIVEN zoom at 0.5
- WHEN the user drags a handle 50 screen pixels
- THEN the element dimension changes by 100mm equivalent (50 / 0.5)

#### Acceptance Criteria

- [ ] Given zoom at 2x, drag deltas are halved in canvas space
- [ ] Given zoom at 0.5x, resize deltas are doubled in canvas space

---

### Requirement: 3D Transform Persistence

3D properties (rotateX, rotateY, rotateZ, translateZ) MUST survive selection, deselection, and animation transitions without being reset.

#### Scenario: 3D values persist across selection

- GIVEN an element with rotateX: 30 and rotateY: 45
- WHEN the element is deselected then reselected
- THEN rotateX is still 30 and rotateY is still 45

#### Scenario: 3D values survive animation transitions

- GIVEN an element with 3D transform values and an animation playing
- WHEN the animation transitions the element between states
- THEN the 3D transform values from the element data are preserved

#### Acceptance Criteria

- [ ] Given deselection and reselection, 3D transform values persist
- [ ] Given animation transitions, 3D transform values are not reset

---

### Requirement: Border Radius Handle Interaction

Vector rectangle elements MUST show corner-radius handles when selected. Dragging a handle adjusts typed `geometryData.cornerRadii`. Handles MUST NOT appear for other vector subtypes or element kinds.

#### Scenario: Handles appear for rectangle

- GIVEN a selected vector rectangle
- WHEN the selection is inspected
- THEN corner-radius handles are visible

#### Scenario: Handles hidden for ellipse

- GIVEN a selected vector ellipse
- WHEN the selection is inspected
- THEN no corner-radius handles are visible

#### Scenario: Drag adjusts radius

- GIVEN a vector rectangle with `cornerRadii: [0, 0, 0, 0]`
- WHEN a corner-radius handle is dragged inward
- THEN the addressed corner-radius value increases

#### Acceptance Criteria

- [ ] Given a selected vector rectangle, corner-radius handles appear
- [ ] Given any other kind/subtype, corner-radius handles do not appear
- [ ] Given a corner-radius handle drag, typed `cornerRadii` are adjusted

---

### Requirement: Smart Guide Snapping

During drag, elements MUST snap to alignment guides generated from other elements' edges and centers when the dragged element's edge or center is within 5px of another element's corresponding edge or center. The default snap threshold is 5px and is not zoom-dependent. Snap guides also evaluate user-created guide lines at the same threshold. When multiple guides are equidistant to the dragged element, the precedence order MUST be: (1) page center guides, (2) page edge guides, (3) element center alignment guides, (4) element edge alignment guides. Within the same category, the guide closest to the element's center takes priority.

#### Scenario: Snap to left edge

- GIVEN two elements on the canvas
- WHEN element A is dragged so its left edge is within 5px of element B's left edge
- THEN element A snaps to align its left edge with element B's left edge and a snap guide line appears

#### Scenario: No snap beyond threshold

- GIVEN two elements on the canvas
- WHEN element A's edge is more than 5px from any other element's edge or center
- THEN no snapping occurs

#### Acceptance Criteria

- [ ] Given a drag within 5px of another element's edge, the dragged element snaps to alignment
- [ ] Given a drag more than 5px from any edge, no snapping occurs
- [ ] Given a snap, a visual guide line is displayed
- [ ] Given user-created guide lines, elements snap to them at the same 5px threshold
- [ ] Given equidistant competing guides, page center guides take precedence over page edge guides, which take precedence over element center guides, which take precedence over element edge guides

---

### Requirement: Grid Snapping

When `snapToGrid` is enabled, elements MUST snap to grid intersections during drag. The snap threshold determines how close the element must be to a grid line to trigger snapping.

#### Scenario: Snap to grid intersection

- GIVEN `canvasSettings.grid.snapToGrid: true` with `gridSize: 10` and `snapThreshold: 5`
- WHEN an element is dragged within 5px of a grid intersection
- THEN the element snaps to the grid intersection

#### Acceptance Criteria

- [ ] Given snapToGrid enabled, elements snap to grid intersections within the threshold

---

### Requirement: Transform Sequence Stability

Sequences of scale → rotate → move operations MUST produce correct final position and dimensions without floating-point accumulation errors.

#### Scenario: Scale then move

- GIVEN an element scaled to 1.5× then moved by (-50, +50)
- WHEN the final state is inspected
- THEN dimensions and position are correct within rounding tolerance

#### Scenario: Scale then rotate then move

- GIVEN an element scaled, then rotated 45°, then moved
- WHEN the final state is inspected
- THEN position and dimensions are correct

#### Acceptance Criteria

- [ ] Given a scale → move sequence, final values are correct
- [ ] Given a scale → rotate → move sequence, final values are correct without accumulation drift

---

## Spec Gaps

- [ ] **Smart Guide Snapping — Precedence Order:** No automated tests verify the deterministic four-tier precedence (page center → page edge → element center → element edge) when multiple equidistant guides compete.

---

## Non-Goals

- Canvas-level rendering, zoom/pan UI, rulers → see [canvas.md](canvas.md)
- Keyboard shortcuts for transforms → see [keyboard.md](keyboard.md)
- Resize handle geometry calculation internals → covered implicitly; external contract is handle behavior
