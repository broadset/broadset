# Editor — Store Actions Specification

## Purpose

Defines the behavioral contracts for core editor store actions: document lifecycle, element CRUD, selection, undo/redo, grouping, and locking. For page/canvas/guide/palette/font/media actions see [store-ui-actions.md](store-ui-actions.md). For path editing/drawing see [editing.md](editing.md). For animation state mutations see [animation-state.md](animation-state.md). For collaboration see [collaboration.md](collaboration.md). See [conventions](../../README.md).

---

## Requirements

### Requirement: Document Initialization

The system MUST replace the entire document and reset undo history when a template is loaded. Document mode and feature config MUST be derived from the loaded document.

#### Scenario: Load a new template

- GIVEN a stored template document with `documentMode: 'print'`
- WHEN the template is loaded into the editor
- THEN the editor state contains the template's document, documentMode is `'print'`, feature config reflects print defaults, and undo history is empty

#### Acceptance Criteria

- [ ] Given a template load, the editor state contains the template document with correct mode and empty undo history

---

### Requirement: Document Read and Write

The system MUST allow replacing the current document state and reading the current document as a snapshot.

#### Scenario: Set document replaces state

- GIVEN an editor with document A loaded
- WHEN document B is set
- THEN the editor state contains document B

#### Scenario: Get document returns current state

- GIVEN an editor with modifications applied
- WHEN the document is read
- THEN the returned document reflects all committed changes

#### Acceptance Criteria

- [ ] Given a setDocument call, the editor state is replaced with the new document
- [ ] Given a getDocument call, the returned document reflects all committed changes

---

### Requirement: Feature Config Override

The system MUST merge partial feature flag overrides into the current config. Unspecified flags MUST retain their current values.

#### Scenario: Override single flag

- GIVEN a feature config with `animations: true`
- WHEN `updateFeatureConfig({ animations: false })` is called
- THEN `animations` is `false` and all other flags are unchanged

#### Acceptance Criteria

- [ ] Given a partial feature config override, only the specified flags change

---

### Requirement: Element Selection

The system MUST support single selection, multi-selection, toggle selection, and clearing selection. Selection changes MUST NOT be tracked by undo/redo. Selecting a different element MUST exit path editing/drawing mode.

#### Scenario: Single selection

- GIVEN a canvas with elements A and B
- WHEN element A is selected
- THEN activeElementIds contains only `['A']`

#### Scenario: Clear selection

- GIVEN element A is selected
- WHEN selection is cleared (null)
- THEN activeElementIds is empty

#### Scenario: Toggle adds to selection

- GIVEN element A is selected
- WHEN element B is toggled
- THEN activeElementIds contains `['A', 'B']`

#### Scenario: Toggle removes from selection

- GIVEN elements A and B are selected
- WHEN element A is toggled
- THEN activeElementIds contains only `['B']`

#### Scenario: Selection exits path editing

- GIVEN element A is in path editing mode
- WHEN element B is selected
- THEN path editing mode is exited

#### Acceptance Criteria

- [ ] Given a single selection, activeElementIds contains only the selected element
- [ ] Given selection cleared with null, activeElementIds is empty
- [ ] Given toggle on an unselected element, it is added to the selection
- [ ] Given toggle on a selected element, it is removed from the selection
- [ ] Given selection of a different element during path editing, path editing exits

---

### Requirement: Ephemeral vs Committed Updates

Ephemeral updates MUST NOT be tracked by undo/redo (used during drag at 60fps). Committed updates MUST be tracked. Both update element geometry (position, width, height, rotation, content, style).

#### Scenario: Ephemeral update during drag

- GIVEN an element being dragged
- WHEN position updates at 60fps via ephemeral update
- THEN the element position changes but undo history is not modified

#### Scenario: Committed update on drop

- GIVEN a drag operation completing
- WHEN the final position is committed
- THEN the position change appears in undo history

#### Acceptance Criteria

- [ ] Given an ephemeral update, the element changes but undo history is unchanged
- [ ] Given a committed update, the change is recorded in undo history

---

### Requirement: Group Move

The system MUST batch position updates for multiple elements into a single undo snapshot.

#### Scenario: Move three elements together

- GIVEN three selected elements moved simultaneously
- WHEN the group move is committed
- THEN all three positions update and a single undo restores all three

#### Acceptance Criteria

- [ ] Given a group move of multiple elements, a single undo restores all positions

---

### Requirement: Style Update

Style updates MUST be tracked by undo/redo.

#### Scenario: Update font size

- GIVEN a text element with fontSize 14
- WHEN fontSize is updated to 24
- THEN the element's fontSize is 24 and the change is undoable

#### Acceptance Criteria

- [ ] Given a style update, the change is reflected and tracked in undo history

---

### Requirement: Layer Reordering

The system MUST reorder elements in the page's element array by direction: `forward` (+1), `backward` (−1), `front` (last), `back` (first).

#### Scenario: Move element forward

- GIVEN elements [A, B, C] and B is selected
- WHEN B is reordered `forward`
- THEN the order is [A, C, B]

#### Scenario: Move element to front

- GIVEN elements [A, B, C] and A is selected
- WHEN A is reordered to `front`
- THEN the order is [B, C, A]

#### Acceptance Criteria

- [ ] Given forward reorder, the element moves up one position
- [ ] Given front reorder, the element moves to the end of the array

---

### Requirement: Element Add and Remove

Adding an element by type MUST use factory defaults for dimensions and content. Adding by full element data MUST use the provided data. Removing an element MUST also deselect it. Required elements (from EditorConfig) MUST NOT be deletable.

#### Scenario: Add by type uses factory defaults

- GIVEN element type `'text'`
- WHEN the element is added
- THEN a text element is created with default width, height, and content `'New Text'`

#### Scenario: Add path element enters drawing mode

- GIVEN element type `'path'` added with empty content
- WHEN the element is added
- THEN the element is selected and path drawing mode is activated

#### Scenario: Remove deselects

- GIVEN a selected element
- WHEN the element is removed
- THEN it is removed from the page and deselected

#### Scenario: Required element cannot be deleted

- GIVEN a required element configured in EditorConfig
- WHEN deletion is attempted
- THEN the element remains in the document

#### Acceptance Criteria

- [ ] Given add by type, factory defaults are used for dimensions and content
- [ ] Given add path with empty content, path drawing mode activates automatically
- [ ] Given element removal, the element is also deselected
- [ ] Given a required element, deletion is blocked

---

### Requirement: Undo and Redo

The system MUST track committed changes and support undo/redo. Temporal state MUST cover document, documentMode, featureConfig, and animationRegistry. Ephemeral updates and selection changes MUST be excluded from history. History size MUST be bounded by `maxUndoSteps` (default 50).

#### Scenario: Undo reverts last committed change

- GIVEN a committed element position change
- WHEN undo is invoked
- THEN the element returns to its previous position

#### Scenario: Redo restores undone change

- GIVEN an undone position change
- WHEN redo is invoked
- THEN the element returns to the committed position

#### Scenario: History limit

- GIVEN maxUndoSteps is 50
- WHEN 60 committed changes are made
- THEN only the last 50 are undoable

#### Acceptance Criteria

- [ ] Given a committed change, undo reverts it
- [ ] Given an undone change, redo restores it
- [ ] Given history exceeding maxUndoSteps, the oldest entries are discarded

---

### Requirement: Element Grouping

Grouping MUST assign a shared groupId to all currently selected elements. Ungrouping MUST clear groupId. Grouping MUST require at least 2 selected elements.

#### Scenario: Group multi-selection

- GIVEN elements A and B are selected
- WHEN grouping is invoked
- THEN both elements share the same non-null groupId

#### Scenario: Single selection cannot group

- GIVEN only element A is selected
- WHEN grouping is invoked
- THEN nothing changes

#### Scenario: Ungroup clears groupId

- GIVEN grouped elements A and B
- WHEN ungrouping is invoked
- THEN both elements have `groupId: null`

#### Acceptance Criteria

- [ ] Given multi-selection, grouping assigns a shared groupId
- [ ] Given single selection, grouping is a no-op
- [ ] Given ungrouping, groupId is cleared for all selected elements

---

### Requirement: Element Locking

Toggling lock MUST flip the element's `locked` flag.

#### Scenario: Lock an unlocked element

- GIVEN an element with `locked: false`
- WHEN lock is toggled
- THEN `locked` is `true`

#### Acceptance Criteria

- [ ] Given toggle lock, the locked flag is inverted

---

### Requirement: Element Alignment

The system MUST align selected elements along a specified axis. Supported alignments: left, center-x, right, top, center-y, bottom. Alignment MUST use the bounding box of all selected elements as reference. At least 2 elements MUST be selected.

#### Scenario: Align left

- GIVEN 3 elements selected at different x positions
- WHEN alignElements('left') is called
- THEN all selected elements have their left edge at the leftmost element's left edge

#### Acceptance Criteria

- [ ] Given 2+ selected elements, alignment repositions them along the specified axis
- [ ] Given fewer than 2 elements, alignment is a no-op

---

### Requirement: Element Distribution

The system MUST distribute selected elements evenly along a specified axis. Supported distributions: horizontal, vertical. Distribution MUST space elements equally within the bounding box of all selected elements. At least 3 elements MUST be selected.

#### Scenario: Distribute horizontal

- GIVEN 3 elements selected with uneven horizontal spacing
- WHEN distributeElements('horizontal') is called
- THEN elements are spaced evenly between the leftmost and rightmost elements

#### Acceptance Criteria

- [ ] Given 3+ selected elements, distribution spaces them evenly along the axis
- [ ] Given fewer than 3 elements, distribution is a no-op

---

### Requirement: Element Reordering (Z-Order)

The system MUST support reordering a single element within the page's element array. Supported directions: `forward` (one position toward the end), `backward` (one position toward the start), `front` (move to end of array), `back` (move to start of array). Reordering MUST be undoable. Elements at the boundary (already at front/back) MUST remain in place.

#### Scenario: Send forward

- GIVEN element B at index 1 in `[A, B, C]`
- WHEN reorderElement(B, 'forward') is called
- THEN the array becomes `[A, C, B]`

#### Scenario: Send to back

- GIVEN element C at index 2 in `[A, B, C]`
- WHEN reorderElement(C, 'back') is called
- THEN the array becomes `[C, A, B]`

#### Acceptance Criteria

- [ ] Given an element and direction 'forward', it moves one position toward the end
- [ ] Given an element and direction 'front', it moves to the end of the array
- [ ] Given an element already at the front, 'forward' is a no-op
- [ ] Given a reorder action, it is recorded in undo history

---

### Requirement: Coordinate Precision

When creating elements, position coordinates MUST be rounded to 0.01 precision (2 decimal places). This ensures deterministic placement at sub-millimeter accuracy without floating-point noise. During interactive transforms (drag, resize, rotate), coordinates MUST NOT be rounded — raw float values are preserved for smooth 60fps movement. Export functions MAY apply their own format-specific precision.

#### Scenario: Element creation rounds coordinates

- GIVEN a canvas where centering produces x=127.33456
- WHEN an element is created
- THEN x is rounded to 127.33

#### Scenario: Drag preserves raw floats

- GIVEN an element being dragged to x=127.33456
- WHEN the position is updated during drag
- THEN x is stored as 127.33456 (no rounding)

#### Acceptance Criteria

- [ ] Given element creation, position coordinates are rounded to 2 decimal places
- [ ] Given interactive drag, position coordinates preserve raw float values

---

### Requirement: Required Element Promotion on Parent Deletion

When a parent element is deleted and one or more of its descendants are marked as required (present in `EditorConfig.requiredElements`), the required descendants MUST be promoted to root level (their `parentId` MUST be cleared to `undefined`). Non-required descendants MUST be deleted as normal. The promotion MUST preserve the required element's absolute position on the canvas.

#### Scenario: Group deleted with required child

- GIVEN a group element with child A (required) and child B (not required)
- WHEN the group is deleted
- THEN child A is promoted to root level with `parentId` cleared, and child B is deleted

#### Scenario: Grandparent deleted with required grandchild

- GIVEN a nested hierarchy where grandchild C is required
- WHEN its grandparent is deleted
- THEN C is promoted to root level with `parentId` cleared

#### Acceptance Criteria

- [ ] Given a parent deletion with a required descendant, the required descendant's `parentId` is cleared
- [ ] Given a parent deletion with a required descendant, the required descendant is preserved in the document
- [ ] Given a parent deletion with a non-required descendant, the non-required descendant is deleted
- [ ] Given a promoted required element, its absolute canvas position is preserved

---

### Requirement: Cross-Page Undo Visibility

Undo and redo operations apply to the full document regardless of the currently active page. If the user is viewing page 1 and undoes an element addition that occurred on page 0, the undo succeeds and the element is removed from page 0. The editor MUST NOT automatically switch the active page on undo/redo — the user remains on their current page.

#### Scenario: Undo on non-active page

- GIVEN the user adds an element on page 0, then navigates to page 1
- WHEN the user triggers undo
- THEN the element is removed from page 0 and the user remains on page 1

#### Scenario: Redo on non-active page

- GIVEN a redo operation that targets page 2 while the user is viewing page 0
- WHEN redo is triggered
- THEN the change applies to page 2 and the view stays on page 0

#### Acceptance Criteria

- [ ] Given an undo that affects a different page, the change applies without switching the active page
- [ ] Given a redo that affects a different page, the change applies without switching the active page

---

## Spec Gaps

- [ ] **Required Element Promotion on Parent Deletion:** No automated tests verify promotion of required descendants on parent deletion or absolute position preservation.
- [ ] **Cross-Page Undo Visibility:** No automated tests verify that undo/redo does not change the active page.

---

## Non-Goals

- Page, canvas, guide, palette, font, media actions → see [store-ui-actions.md](store-ui-actions.md)
- Path editing, path drawing, element placement modes → see [editing.md](editing.md)
- Animation config mutations (timelines, state/modifier bindings) → see [animation-state.md](animation-state.md)
- Change stream emission and remote change application → see [collaboration.md](collaboration.md)
- Data store (BroadsetDataStore) for runtime data injection → see [data-store.md](data-store.md)
