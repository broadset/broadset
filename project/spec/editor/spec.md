# Editor Specification

## Purpose

Defines the editor engine for broadset. The editor manages document state with undo/redo history, provides a real-time change stream for collaboration, applies remote document changes, supports path editing/drawing and element placement modes, and defines the direct-manipulation canvas contract: the editor canvas MUST be zoomable and pannable, and selecting an element on the canvas MUST surface a 2D transform widget for translate, rotate, and scale. It does NOT render DOM, compute animations, or export documents. See [conventions](../../README.md).

---

## Sub-Specs

| Sub-Spec                                               | Scope                                                                                               |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| [store-actions.md](store-actions.md)                   | Core store actions — document lifecycle, element CRUD, selection, undo/redo, grouping               |
| [store-ui-actions.md](store-ui-actions.md)             | Workspace actions — pages, canvas settings, guides, palette, fonts, media                           |
| [data-store.md](data-store.md)                         | Runtime data injection store (BroadsetDataStore) — CRUD, bulk ops, selector isolation               |
| [collaboration.md](collaboration.md)                   | Document diffing, animation diffing, change stream, remote change application                       |
| [editing.md](editing.md)                               | Path editing, path drawing, clip-path editing, element placement, factory, validation, capabilities |
| [animation-state.md](animation-state.md)               | Animation config timeline/state/modifier mutations and runtime animation state updates              |
| [timeline-playback.md](timeline-playback.md)           | Editor timeline playback orchestration with snapshot restore                                        |
| [react-data-integration.md](react-data-integration.md) | Provider context, error boundary, playback controller, data subscriptions                           |
| [path-geometry.md](path-geometry.md)                   | Path parsing/serialization, handle extraction, and geometry refit behavior                          |
| [canvas.md](canvas.md)                                 | Canvas rendering, selection, zoom/pan, grid, rulers, safety boundaries                              |
| [transforms.md](transforms.md)                         | Drag, resize, rotate, snapping, anchor auto-assignment, 3D persistence                              |
| [keyboard.md](keyboard.md)                             | Shortcut resolution, nudge, clipboard, delete, select-all, group/ungroup                            |

---

## Non-Goals

- Document model types and validation → see `project/spec/model/spec.md`
- Animation engine → see `project/spec/playback/spec.md`
- DOM rendering → see `project/spec/renderer/spec.md`
- Export/import formats → see `project/spec/formats/spec.md`

## Cross-References

- **Custom Component Plugin Lifecycle:** Registration in EditorConfig (→ `project/spec/model/config.md`), factory defaults (→ `editing.md`), canvas rendering (→ `project/spec/renderer/spec.md`), property panel (→ `project/spec/ui/panels.md`), capability gating (→ `project/spec/renderer/spec.md`), export (→ `project/spec/formats/`)

---

## Functional Test Requirements (Playwright CT)

Unit tests verify pure logic in isolation. The following editor interactions involve DOM rendering, pointer events, and cross-layer integration that **cannot** be fully verified by unit tests alone. Each MUST have at least one Playwright Component Test (CT) that exercises the real behavior end-to-end in a browser.

### Canvas interactions

- [ ] **Click-to-select:** Clicking an element on the rendered canvas MUST select it in the store; clicking empty space MUST deselect.
- [ ] **Marquee selection:** Dragging on the canvas background MUST draw a selection rectangle and select all intersecting elements.
- [ ] **Zoom and pan:** The editor canvas MUST be zoomable and pannable; scroll-wheel/pinch zoom MUST update the viewport scale, and drag-pan MUST translate the viewport origin.

### Transform widget

- [ ] **Widget visibility:** Selecting an element on the canvas MUST display a 2D transform widget for translate, rotate, and scale around the selection bounds.
- [ ] **Drag translation:** Dragging a selected element MUST move it; the final position MUST be committed to the store on pointer-up.
- [ ] **Resize via handles:** Dragging a resize handle MUST change the element's dimensions; corner handles MUST resize both axes, edge handles one axis.
- [ ] **Rotation via handle:** Dragging the rotation handle MUST update the element's rotation.
- [ ] **Snap guides:** During drag, visual snap guide lines MUST appear when the element aligns with other elements' edges or centers.

### Canvas overlays

- [ ] **Grid overlay:** Toggling grid visibility MUST show or hide the grid on the canvas.
- [ ] **Ruler and guides:** Dragging from a ruler MUST create a guide line on the canvas.
- [ ] **Safety boundary:** Enabling broadcast mode MUST display the safety-area overlay.

### Inline text editing

- [ ] **Text editing mode:** Double-clicking a text element MUST activate a contenteditable overlay at the element's position, zoom-compensated.

### Clip-path editing

- [ ] **Enter clip-path editing:** Clicking "Edit Clip Path" in the Clip Path panel MUST render an SVG overlay on the canvas with anchor handles at each clip-path control point.
- [ ] **Handle drag:** Dragging a clip-path anchor handle MUST update the clip-path shape in real time on the canvas and commit on pointer-up.
- [ ] **Point insertion:** Clicking a midpoint handle MUST insert a new control point and begin dragging it.
- [ ] **Point deletion:** Double-clicking a handle with > 3 points MUST remove that point; with exactly 3 points MUST be a no-op.
- [ ] **Exit editing:** Pressing Escape or clicking outside the element MUST exit clip-path editing mode and commit changes.

### Path editing

- [ ] **Enter path editing:** Clicking "Edit Path Points" in the Path Properties panel MUST render an SVG overlay with anchor and control handles on the path.
- [ ] **Handle drag:** Dragging an anchor or control handle MUST update the path `d` attribute in real time and commit on pointer-up.
- [ ] **Axis constraints:** H-command handles MUST constrain to horizontal movement only; V-command handles to vertical only.
- [ ] **Bounds refit:** When path editing mode is exited, the element's bounding box MUST be refitted via SVG getBBox().
- [ ] **Exit editing:** Pressing Escape, clicking outside the element, or clicking "Done Editing Points" MUST exit path editing mode.

### Path drawing

- [ ] **Enter drawing:** Creating a new path element MUST auto-enter drawing mode; clicking "Draw Path" on an existing path also enters drawing mode.
- [ ] **Click-to-place:** Each click on the canvas MUST append a point (M for first, L for subsequent). The path MUST visually update immediately.
- [ ] **Close path:** Pressing Enter MUST append a Z command and exit drawing mode.
- [ ] **Commit path:** Pressing Escape MUST commit the current path as-is and exit drawing mode.
- [ ] **Coordinate conversion:** Clicks MUST be correctly converted from screen coordinates to element-local coordinates accounting for zoom and pan.

### Keyboard integration

- [ ] **Nudge:** Arrow keys MUST move the selected element by the nudge increment; Shift+arrow MUST move by the large increment.
- [ ] **Undo/redo:** Ctrl+Z / Ctrl+Y MUST undo and redo the last committed operation.
- [ ] **Delete:** Delete/Backspace MUST remove the selected element from the document.

### Cross-layer integration flows

In addition to the single-region tests above, every spec scenario where a user action in one UI region produces a visible outcome in a different region MUST have a CT test that verifies **all** affected regions. See `.github/instructions/testing.instructions.md` → "CT Derivation Rule" for the systematic method.

The following are representative examples from this spec domain — the full set MUST be derived by scanning all GIVEN/WHEN/THEN blocks in the editor sub-specs:

- [ ] **Select → widget + properties:** Clicking an element on the canvas MUST display the transform widget around it AND populate the properties panel with that element's position, size, rotation, and style fields.
- [ ] **Select → deselect → panels clear:** Clicking empty canvas MUST hide the transform widget AND clear the properties panel (no stale values displayed).
- [ ] **Transform → properties update:** Dragging a selected element to a new position MUST update the position fields in the properties panel in real time.
- [ ] **Properties edit → canvas update:** Changing a value in the properties panel (e.g. width) MUST immediately update the element's rendered size on the canvas and the transform widget bounds.
- [ ] **Multi-select → combined widget + mixed properties:** Selecting multiple elements via marquee MUST show a single transform widget around the combined bounds AND show common property values with "Mixed" indicators for differing values.

These are acceptance gates — a feature is not shippable until its corresponding CT test passes. Spec gap entries in individual sub-specs that say "requires CT" reference this list.
