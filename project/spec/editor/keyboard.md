# Editor — Keyboard & Clipboard Specification

## Purpose

Defines the behavioral contracts for keyboard shortcut dispatch, nudge operations, clipboard copy/paste/duplicate, delete, select-all, and group/ungroup shortcuts. These are the keyboard-driven editing operations. See [conventions](../../README.md).

---

## Requirements

### Requirement: Shortcut Binding Resolution

Each `ShortcutAction` MUST map to a key + modifier combination via the shortcut map. The host MAY override individual bindings via `EditorConfig.shortcuts`. Overrides MUST merge with defaults — only the overridden actions change. Shortcut matching MUST use exact modifier comparison: all specified modifiers (ctrl, shift, alt, meta) must be active, and no unspecified modifiers may be active. For example, a binding for Ctrl+Z MUST NOT trigger when Ctrl+Shift+Z is pressed.

#### Scenario: Default binding matches

- GIVEN the default shortcut map
- WHEN the Delete key is pressed
- THEN the `'delete'` action is dispatched

#### Scenario: Host override

- GIVEN a host config with `shortcuts: { delete: { key: 'x', label: 'Delete' } }`
- WHEN the 'x' key is pressed
- THEN the `'delete'` action is dispatched

#### Scenario: Non-overridden bindings kept

- GIVEN a host config overriding only the delete shortcut
- WHEN Ctrl+Z is pressed
- THEN the `'undo'` action is dispatched using the default binding

#### Acceptance Criteria

- [ ] Given the default shortcut map, the correct action is dispatched for each key binding
- [ ] Given a host override, the overridden action uses the new key
- [ ] Given a partial override, non-overridden actions keep their default bindings

---

### Requirement: Nudge Actions

Arrow keys MUST move selected elements by a small step of **1mm** in canvas units. Shift+Arrow MUST move by a large step of **10mm** in canvas units. Multi-element nudge MUST move all selected elements simultaneously.

#### Scenario: Small nudge

- GIVEN a selected element at position (100, 100)
- WHEN the right arrow key is pressed
- THEN the element moves right by 1mm in canvas units

#### Scenario: Large nudge

- GIVEN a selected element at position (100, 100)
- WHEN Shift+Right is pressed
- THEN the element moves right by 10mm in canvas units

#### Scenario: Multi-element nudge

- GIVEN elements A and B both selected
- WHEN the down arrow key is pressed
- THEN both elements move down by 1mm in canvas units

#### Acceptance Criteria

- [ ] Given an arrow key, the selected element moves by 1mm in canvas units
- [ ] Given Shift+Arrow, the selected element moves by 10mm in canvas units
- [ ] Given multiple selected elements, all move by the same step
- [ ] Given multiple selected elements, arrow nudge moves all by 1mm and Shift+Arrow moves all by 10mm

---

### Requirement: Clipboard Copy and Paste

Copy MUST capture the currently selected elements. Pasted elements MUST be placed at the same position as the originals (zero offset) — the user repositions duplicates manually. Duplicate MUST perform a combined copy+paste in one operation and likewise places the new elements at the originals' positions.

#### Scenario: Copy and paste

- GIVEN element A is selected at position (50, 80)
- WHEN copy then paste is invoked
- THEN a new element appears with the same properties as A at position (50, 80)

#### Scenario: Duplicate

- GIVEN element A is selected at position (50, 80)
- WHEN duplicate is invoked
- THEN a new element appears with the same properties as A at position (50, 80)

#### Acceptance Criteria

- [ ] Given copy then paste, a new element is created at the same position as the original (zero offset)
- [ ] Given duplicate, a new element is created at the same position as the original in one step
- [ ] Given copy on one page and paste invoked on another page, elements are pasted onto the active page
- [ ] Given a new copy operation, the previous clipboard content is fully replaced
- [ ] Given editor destroy, the clipboard is cleared

---

### Requirement: Delete Action

Delete or Backspace MUST remove the selected element(s) from the page and deselect them.

#### Scenario: Delete removes element

- GIVEN element A is selected
- WHEN Delete key is pressed
- THEN element A is removed from the page and deselected

#### Scenario: Backspace also deletes

- GIVEN element A is selected
- WHEN Backspace key is pressed
- THEN element A is removed from the page

#### Acceptance Criteria

- [ ] Given Delete key with a selected element, the element is removed
- [ ] Given Backspace key with a selected element, the element is removed

---

### Requirement: Select All

Select-all MUST select every element ID on the active page.

#### Scenario: Select all elements

- GIVEN a page with elements A, B, and C
- WHEN select-all is invoked
- THEN activeElementIds contains A, B, and C

#### Acceptance Criteria

- [ ] Given select-all, every element on the active page is selected

---

### Requirement: Group and Ungroup Shortcuts

Ctrl+G MUST group all multi-selected elements (assign shared groupId). Ctrl+Shift+G MUST ungroup (clear groupId). Grouping with single selection MUST be a no-op.

#### Scenario: Group multi-selection

- GIVEN elements A and B are selected
- WHEN Ctrl+G is pressed
- THEN both elements share a new groupId

#### Scenario: Single selection no-op

- GIVEN only element A is selected
- WHEN Ctrl+G is pressed
- THEN nothing changes

#### Scenario: Ungroup

- GIVEN grouped elements A and B are selected
- WHEN Ctrl+Shift+G is pressed
- THEN both elements have `groupId: null`

#### Acceptance Criteria

- [ ] Given multi-selection and Ctrl+G, elements are grouped
- [ ] Given single selection and Ctrl+G, no change occurs
- [ ] Given grouped selection and Ctrl+Shift+G, elements are ungrouped

---

### Requirement: Clipboard Scope

Copy and paste operations use an internal clipboard scoped to the editor instance. The clipboard does NOT interact with the system clipboard. Copied elements are stored in memory and persist until the editor is destroyed or new elements are copied. Paste is valid across pages within the same editor instance.

#### Scenario: Paste on a different page

- GIVEN elements are copied on page 0
- WHEN the user navigates to page 1 and pastes
- THEN the copied elements are pasted on page 1 at their original positions

#### Scenario: Second copy replaces clipboard

- GIVEN elements are copied
- WHEN the user copies different elements
- THEN the clipboard is replaced with the new selection

#### Acceptance Criteria

- [ ] Given elements copied on one page, pasting on a different page succeeds
- [ ] Given a second copy operation, the clipboard contains only the latest copied elements
- [ ] Given editor destruction, the clipboard data is discarded

---

### Requirement: Undo and Redo Shortcuts

Ctrl+Z MUST invoke undo. Ctrl+Y (or Ctrl+Shift+Z) MUST invoke redo. Both MUST operate on the undo/redo history stack, reverting or re-applying the most recent committed operation.

#### Scenario: Undo last change

- GIVEN an element was moved from (10, 10) to (50, 50)
- WHEN Ctrl+Z is pressed
- THEN the element returns to (10, 10)

#### Scenario: Redo after undo

- GIVEN undo was just performed
- WHEN Ctrl+Y is pressed
- THEN the change is re-applied

#### Acceptance Criteria

- [ ] Given Ctrl+Z, the last committed operation is undone
- [ ] Given Ctrl+Y or Ctrl+Shift+Z, the last undone operation is redone
- [ ] Given no undo history, Ctrl+Z is a no-op
- [ ] Given no redo history, Ctrl+Y is a no-op

---

### Requirement: Save Shortcut

Ctrl+S MUST invoke the save action, which delegates to `EditorConfig.onSave`. If `onSave` is not configured, the shortcut MUST be a no-op.

#### Scenario: Save with configured callback

- GIVEN `onSave` is configured
- WHEN Ctrl+S is pressed
- THEN the `onSave` callback is invoked with the current document

#### Scenario: Save without callback

- GIVEN `onSave` is not configured
- WHEN Ctrl+S is pressed
- THEN nothing happens

#### Acceptance Criteria

- [ ] Given Ctrl+S with `onSave` configured, the callback is invoked
- [ ] Given Ctrl+S without `onSave`, the shortcut is a no-op

---

### Requirement: Zoom Shortcuts

Ctrl+= (or Ctrl+Plus) MUST zoom in by one step. Ctrl+- (or Ctrl+Minus) MUST zoom out by one step. Ctrl+0 MUST reset zoom to 100% (1.0). Zoom step size and range limits are defined in [canvas.md](canvas.md).

#### Scenario: Zoom in via shortcut

- GIVEN zoom at 1.0
- WHEN Ctrl+= is pressed
- THEN zoom increases by one step

#### Scenario: Zoom out via shortcut

- GIVEN zoom at 1.0
- WHEN Ctrl+- is pressed
- THEN zoom decreases by one step

#### Scenario: Reset zoom via shortcut

- GIVEN zoom at 2.0
- WHEN Ctrl+0 is pressed
- THEN zoom resets to 1.0

#### Acceptance Criteria

- [ ] Given Ctrl+=, zoom increases by one step
- [ ] Given Ctrl+-, zoom decreases by one step
- [ ] Given Ctrl+0, zoom resets to 1.0
- [ ] Given zoom already at maximum, Ctrl+= is a no-op
- [ ] Given zoom already at minimum, Ctrl+- is a no-op

---

### Requirement: Layer Reorder Shortcuts

`]` MUST bring the selected element(s) forward one position (higher in z-order). `[` MUST send the selected element(s) backward one position. Ctrl+`]` MUST bring the selected element(s) to front (top of z-order). Ctrl+`[` MUST send the selected element(s) to back (bottom of z-order). All layer reorder shortcuts MUST be no-ops with no selection.

#### Scenario: Bring forward

- GIVEN element A is at position 1 of 3 in the layer stack
- WHEN `]` is pressed
- THEN element A moves to position 2

#### Scenario: Send to back

- GIVEN element A is at position 2 of 3
- WHEN Ctrl+`[` is pressed
- THEN element A moves to position 0 (bottom)

#### Scenario: No selection no-op

- GIVEN no elements are selected
- WHEN `]` is pressed
- THEN the layer order is unchanged

#### Acceptance Criteria

- [ ] Given `]`, the selected element moves forward one position
- [ ] Given `[`, the selected element moves backward one position
- [ ] Given Ctrl+`]`, the selected element moves to the front
- [ ] Given Ctrl+`[`, the selected element moves to the back
- [ ] Given no selection, layer reorder shortcuts are no-ops

---

### Requirement: Toggle Lock Shortcut

Ctrl+Shift+L MUST toggle the `locked` flag on the selected element(s). Locked elements cannot be moved, resized, or rotated via canvas interactions. The shortcut MUST be a no-op with no selection.

#### Scenario: Lock an element

- GIVEN an unlocked selected element
- WHEN Ctrl+Shift+L is pressed
- THEN the element is locked

#### Scenario: Unlock an element

- GIVEN a locked selected element
- WHEN Ctrl+Shift+L is pressed
- THEN the element is unlocked

#### Acceptance Criteria

- [ ] Given Ctrl+Shift+L on an unlocked element, it becomes locked
- [ ] Given Ctrl+Shift+L on a locked element, it becomes unlocked
- [ ] Given no selection, the shortcut is a no-op

---

## Spec Gaps

- [ ] **Clipboard Scope:** No automated tests verify cross-page paste, clipboard replacement, or clipboard destruction on editor teardown.

---

## Non-Goals

- Shortcut type definitions and binding shape → see `project/spec/model/config.md`
- Transform interactions (drag, resize, rotate) → see [transforms.md](transforms.md)
- Canvas click/marquee selection → see [canvas.md](canvas.md)
