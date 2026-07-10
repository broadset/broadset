# Editor — Store Actions Specification

## Purpose

Defines the behavioral contracts for core editor store actions: document lifecycle, element CRUD, selection, undo/redo, grouping, and locking. For page/canvas/guide/palette/font/media actions see [store-ui-actions.md](store-ui-actions.md). For path editing/drawing see [editing.md](editing.md). For animation state mutations see [animation-state.md](animation-state.md). For collaboration see [collaboration.md](collaboration.md). See [conventions](../../README.md).

---

## Requirements

### Requirement: Project Initialization

The system MUST validate and replace the entire project and reset undo history when a template is loaded. Active document selection is runtime state; feature policy derives from the selected document's canonical `kind` and capabilities.

#### Scenario: Load a new template

- GIVEN a stored canonical project whose selected document has `kind: 'print'`
- WHEN the template is loaded into the editor
- THEN editor state contains the complete project, derives print policy, and has empty undo history

#### Acceptance Criteria

- [ ] Given a template load, editor state contains the complete validated project, derives policy from document kind, and has empty undo history

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

Ephemeral updates MUST NOT be tracked by undo/redo (used during drag at 60fps). Committed updates MUST be tracked. Geometry updates write canonical bounds and exact transform matrices; decomposed position, size, and rotation remain derived editor views.

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

### Requirement: Appearance and Text-Property Update

Updates to typed appearance layers or structured text properties MUST be tracked by undo/redo.

#### Scenario: Update font size

- GIVEN a text run whose typed size is 14
- WHEN the run size is updated to 24
- THEN the run's typed size is 24 and the change is undoable

#### Acceptance Criteria

- [ ] Given an appearance or structured-text property update, the change is reflected and tracked in undo history

---

### Requirement: Layer Reordering

The system MUST reorder elements in the document's element array by direction: `forward` (+1), `backward` (− 1), `front` (last), `back` (first).

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

Adding an element through an authoring tool MUST use factory defaults for bounds and the matching closed payload. Adding full canonical element data MUST use the provided data after validation. Removing an element MUST also deselect it. Required elements (from EditorConfig) MUST NOT be deletable.

#### Scenario: Add by type uses factory defaults

- GIVEN the text authoring tool
- WHEN the element is added
- THEN a `kind: 'text'` element is created with default bounds and a `TextBody` containing one run with `"New Text"`

#### Scenario: Add vector path enters drawing mode

- GIVEN the path authoring tool creates `kind: 'vector'` with `geometryData.kind: 'path'` and an empty structured path
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

- [ ] Given an authoring tool, factory defaults produce a valid closed element payload and positive bounds
- [ ] Given an empty vector structured path created by the path tool, path drawing mode activates automatically
- [ ] Given element removal, the element is also deselected
- [ ] Given a required element, deletion is blocked

---

### Requirement: Undo and Redo

The system MUST track committed whole-project changes and support undo/redo. History covers canonical resources, documents, components, pages, bindings, and sequences through snapshots or invertible atomic batches. Derived policy, ephemeral updates, navigation, and selection are excluded. History size remains bounded by `maxUndoSteps` (default 50).

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

Grouping MUST atomically create a canonical group with fresh ID, reparent compatible selected sibling roots through `parentId`, preserve resolved world transforms, and maintain preorder. Ungrouping reparents children to the group's parent, preserves order/world transforms, and removes the empty group. At least two compatible selected roots are required.

#### Scenario: Group multi-selection

- GIVEN elements A and B are selected
- WHEN grouping is invoked
- THEN a new group owns both elements through their `parentId`

#### Scenario: Single selection cannot group

- GIVEN only element A is selected
- WHEN grouping is invoked
- THEN nothing changes

#### Scenario: Ungroup removes structural group

- GIVEN grouped elements A and B
- WHEN ungrouping is invoked
- THEN both elements inherit the former group parent and the group is removed

#### Acceptance Criteria

- [ ] Given compatible multi-selection, grouping creates one structural group and reparents selected roots
- [ ] Given single selection, grouping is a no-op
- [ ] Given ungrouping, child world geometry/order is preserved while the group is removed

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

The system MUST support reordering a single element within the document's element array. Supported directions: `forward` (one position toward the end), `backward` (one position toward the start), `front` (move to end of array), `back` (move to start of array). Reordering MUST be undoable. Elements at the boundary (already at front/back) MUST remain in place.

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

When a parent element is deleted and one or more of its descendants are marked as required (present in `EditorConfig.requiredElements`), the required descendants MUST be promoted to root level (their `parentId` MUST become `null`). Non-required descendants MUST be deleted as normal. The promotion MUST preserve the required element's resolved world transform.

#### Scenario: Group deleted with required child

- GIVEN a group element with child A (required) and child B (not required)
- WHEN the group is deleted
- THEN child A is promoted to root level with `parentId: null`, and child B is deleted

#### Scenario: Grandparent deleted with required grandchild

- GIVEN a nested hierarchy where grandchild C is required
- WHEN its grandparent is deleted
- THEN C is promoted to root level with `parentId: null`

#### Acceptance Criteria

- [ ] Given a parent deletion with a required descendant, the required descendant's `parentId` becomes `null`
- [ ] Given a parent deletion with a required descendant, the required descendant is preserved in the document
- [ ] Given a parent deletion with a non-required descendant, the non-required descendant is deleted
- [ ] Given a promoted required element, its resolved world transform is preserved

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

### Requirement: Named Snapshots

The editor MUST support saving named workspace snapshots of the complete canonical project state, independent of undo/redo history. A snapshot stores a deep clone of `BroadsetProjectV1`, a non-empty user-provided name, and an ISO 8601 creation timestamp. The system MUST support at most 20 snapshots per project; creating a 21st fails. Users can restore, rename, and delete snapshots. Restoring validates and replaces the whole project and pushes that replacement onto undo history. Snapshots are recovery artifacts stored outside canonical `project.json`; they MUST NOT add a `snapshots` field to the strict project or document vocabulary. Snapshot names MUST be unique within one workspace snapshot store.

#### Scenario: Create snapshot

- GIVEN a project with unsaved changes
- WHEN the user creates a snapshot named "Before animation"
- THEN a snapshot entry is stored with the current project state, name, and timestamp

#### Scenario: Restore snapshot

- GIVEN a snapshot "Before animation" and a subsequently modified project
- WHEN the user restores the snapshot
- THEN the project reverts to the snapshot's stored state and the restoration is pushed to the undo stack

#### Scenario: Undo snapshot restoration

- GIVEN a snapshot was just restored
- WHEN the user triggers undo
- THEN the project reverts to the state before restoration

#### Scenario: Delete snapshot

- GIVEN 3 snapshots exist
- WHEN the user deletes "Before animation"
- THEN the snapshot is removed and 2 remain

#### Scenario: Snapshot limit enforced

- GIVEN 20 snapshots exist
- WHEN the user attempts to create a 21st
- THEN the operation fails with an error

#### Scenario: Duplicate name rejected

- GIVEN a snapshot named "Checkpoint" exists
- WHEN the user creates another snapshot named "Checkpoint"
- THEN the operation fails — names must be unique

#### Acceptance Criteria

- [ ] Given a create snapshot action, a snapshot with name, timestamp, and full canonical project clone is stored outside `project.json`
- [ ] Given a restore snapshot action, the whole project is validated and replaced and restoration is undoable
- [ ] Given a delete snapshot action, the snapshot is removed
- [ ] Given 20 existing snapshots, creating a new one fails
- [ ] Given a duplicate name, creation fails
- [ ] Given canonical project serialization, no snapshot field appears in `project.json`

---

### Requirement: Derived Interop Cleanliness

Editor actions MUST NOT persist format dirty booleans. Each preserved mapping stores an `InteropRecord.baselineSemanticHash`; cleanliness derives by hashing the current defined semantic projection. Relevant edits change derived status, and undo restoring baseline semantics restores clean status. Unknown generic extension envelopes pass through unchanged.

#### Scenario: Relevant edit derives dirty

- GIVEN an interop record whose current projection matches its baseline
- WHEN a committed edit changes a projected property
- THEN the current semantic hash differs without adding a boolean field

#### Scenario: Undo restores clean

- GIVEN a relevant edit made the record derive dirty
- WHEN undo restores baseline semantics
- THEN the record derives clean again

#### Scenario: Runtime edit preserves clean

- GIVEN a clean interop record
- WHEN selection or viewport changes
- THEN projection and cleanliness are unchanged

#### Acceptance Criteria

- [ ] Given a relevant canonical edit, cleanliness derives from current hash versus baseline
- [ ] Given undo restoring baseline semantics, cleanliness derives clean
- [ ] Given runtime-only changes, cleanliness is unchanged
- [ ] Given project save, no permanent format dirty boolean is serialized
- [ ] Given unknown generic extensions, editor mutations preserve payloads unchanged

---

### Requirement: System Clipboard Integration

Copy and paste operations MUST use the system clipboard (Clipboard API) when available, enabling cross-document and cross-tab element transfer. On copy or cut, the selected elements MUST be serialized as a JSON string and written to the system clipboard using a Broadset-specific MIME type (`application/x-broadset-elements`). On paste, the system MUST read the clipboard and detect whether it contains Broadset element JSON. If Broadset data is found, the elements are deserialized, assigned new unique IDs, and placed at the center of the current viewport. If the clipboard contains plain text (no Broadset JSON detected), it MUST be pasted as a new text element at the viewport center with default text element styling. If the clipboard contains an image data URL, it MUST be pasted as a new image element. When the Clipboard API is unavailable (e.g., denied permission, insecure context), the system MUST fall back to an internal in-memory clipboard that works within the current editor session. Cut MUST copy elements to clipboard and then delete them from the document (as an atomic undoable action).

#### Scenario: Copy elements to system clipboard

- GIVEN 2 elements are selected
- WHEN the user triggers copy (Cmd+C / Ctrl+C)
- THEN the elements are serialized as JSON and written to the system clipboard

#### Scenario: Paste elements from another tab

- GIVEN elements were copied in another Broadset tab
- WHEN the user triggers paste (Cmd+V / Ctrl+V) in this tab
- THEN the elements are deserialized with new IDs and placed at the viewport center

#### Scenario: Paste plain text as text element

- GIVEN the system clipboard contains plain text "Hello World"
- WHEN the user triggers paste
- THEN a new text element whose `TextBody` contains "Hello World" is created at the viewport center

#### Scenario: Clipboard API unavailable fallback

- GIVEN the Clipboard API is not available
- WHEN the user copies and pastes
- THEN the internal in-memory clipboard is used (works within current tab only)

#### Scenario: Cut removes originals

- GIVEN 2 elements are selected
- WHEN the user triggers cut (Cmd+X / Ctrl+X)
- THEN elements are written to clipboard and deleted from the document as one undoable action

#### Scenario: Pasted elements get new IDs

- GIVEN elements are pasted from clipboard
- WHEN they are inserted into the document
- THEN each pasted element receives a new unique ID (no ID collision with existing elements)

#### Acceptance Criteria

- [ ] Given selected elements and Clipboard API available, copy writes serialized JSON to system clipboard
- [ ] Given Broadset JSON in the clipboard, paste deserializes elements with new unique IDs
- [ ] Given plain text in the clipboard, paste creates a new text element
- [ ] Given Clipboard API unavailable, copy/paste falls back to internal in-memory clipboard
- [ ] Given cut, elements are copied to clipboard and deleted as an atomic undoable action
- [ ] Given pasted elements, all receive new unique IDs to prevent collisions

---

## Spec Gaps

- [x] **Required Element Promotion on Parent Deletion:** Automated tests verify promotion of required descendants on parent deletion and absolute position preservation (`packages/editor/src/store-actions.core.test.ts`).
- [ ] **Cross-Page Undo Visibility:** No automated tests verify that undo/redo does not change the active page.
- [x] **Named Snapshots:** Automated tests cover snapshot creation, restoration with undo integration, deletion, limit enforcement, and serialization round-trip (`packages/editor/src/store-actions.snapshots.test.ts`).
- [x] **System Clipboard Integration:** Automated keyboard-store tests cover copy/paste replacement, cut, page-switch paste behavior, and internal clipboard flow (`packages/editor/src/keyboard.clipboard-grouping.test.ts`).

---

## Non-Goals

- Page, canvas, guide, palette, font, media actions → see [store-ui-actions.md](store-ui-actions.md)
- Path editing, path drawing, element placement modes → see [editing.md](editing.md)
- Sequence, property-track/keyframe, lifecycle, and state-machine mutations → see [animation-state.md](animation-state.md)
- Change stream emission and remote change application → see [collaboration.md](collaboration.md)
- Data store (BroadsetDataStore) for runtime data injection → see [data-store.md](data-store.md)
