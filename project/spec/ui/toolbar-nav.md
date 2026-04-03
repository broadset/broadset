# UI — Toolbar & Navigation Specification

## Purpose

Defines the behavioral requirements for the toolbar, context menu, element library, and page sorter — the primary navigation and command controls in the editor UI.

---

## Requirements

### Requirement: Toolbar Actions

The system MUST support JSON export from the document menu. The Export action MUST be visible only when export feature flags are enabled. Undo and Redo MUST call the temporal store. Alignment buttons MUST appear only for multi-selection (2+ elements). Distribute buttons MUST appear only for 3+ elements.

#### Scenario: JSON export

- GIVEN the document menu
- WHEN export JSON is clicked
- THEN native document JSON is exported

#### Scenario: Export visibility by feature flag

- GIVEN no export feature flags enabled
- WHEN the toolbar renders
- THEN the Export action is hidden

#### Scenario: Undo/Redo

- GIVEN undo/redo buttons
- WHEN clicked
- THEN temporal store undo/redo is called

#### Scenario: Alignment for multi-selection

- GIVEN 2+ elements selected
- WHEN the toolbar renders
- THEN alignment buttons are visible and fire alignElements

#### Scenario: Distribute for 3+ elements

- GIVEN 3+ elements selected
- WHEN the toolbar renders
- THEN distribute buttons are visible and fire distributeElements

#### Acceptance Criteria

- [ ] Given the document menu, native document JSON is exported
- [ ] Given no export feature flags enabled, the Export action is hidden
- [ ] Given undo/redo buttons, temporal store undo/redo is called
- [ ] Given 2+ elements selected, alignment buttons are visible and fire alignElements
- [ ] Given 3+ elements selected, distribute buttons are visible and fire distributeElements

---

### Requirement: Context Menu

The system MUST NOT render before a right-click. After `contextmenu` event, the menu MUST appear at click coordinates with all standard items. Items MUST be disabled when no element is selected. Copy/Paste/Duplicate/Delete/Lock MUST call their respective store actions. Group/Ungroup MUST appear only for multi-selection. The menu MUST close after any action.

#### Scenario: Right-click opens at coordinates

- GIVEN no menu visible
- WHEN a contextmenu event fires at (200, 150)
- THEN the menu appears positioned at those coordinates

#### Scenario: Disabled items without selection

- GIVEN no active element
- WHEN the menu opens
- THEN editing items are disabled

#### Scenario: Copy then Paste workflow

- GIVEN elements are copied
- WHEN Paste is clicked
- THEN pasteElements is called

#### Scenario: Delete removes all selected

- GIVEN multiple elements selected
- WHEN Delete is clicked
- THEN removeElement is called for each

#### Scenario: Group/Ungroup for multi-select

- GIVEN 2+ elements selected
- WHEN the menu opens
- THEN Group and Ungroup items are visible

#### Scenario: Layer reorder actions

- GIVEN an element selected
- WHEN Bring Forward/Send Backward/Bring to Front/Send to Back is clicked
- THEN reorderElement is called with the correct direction

#### Acceptance Criteria

- [ ] Given no menu visible, the menu appears positioned at those coordinates
- [ ] Given no active element, editing items are disabled
- [ ] Given elements are copied, pasteElements is called
- [ ] Given multiple elements selected, removeElement is called for each
- [ ] Given 2+ elements selected, Group and Ungroup items are visible
- [ ] Given an element selected, reorderElement is called with the correct direction

---

### Requirement: Element Library

The system MUST render tiles for all 7 built-in element types with labels. Clicking a tile MUST call startPlacement with the type. Custom types from the registry MUST be included with their icons. Grid layout MUST use 2 columns.

#### Scenario: Built-in types visible

- GIVEN a default component registry
- WHEN the library renders
- THEN 7 built-in element tiles with labels are shown

#### Scenario: Custom type tile

- GIVEN a registry with a custom `countdown` type
- WHEN the library renders
- THEN a countdown tile is shown and clicking it calls startPlacement

#### Acceptance Criteria

- [ ] Given a default component registry, 7 built-in element tiles with labels are shown
- [ ] Given a registry with a custom `countdown` type, a countdown tile is shown and clicking it calls startPlacement

---

### Requirement: Page Sorter

The system MUST render page tabs matching the number of pages. Clicking a tab MUST switch pages. Add and remove actions MUST work. The remove button MUST be hidden when only one page exists.

#### Scenario: Page switching and management

- GIVEN a 3-page document
- WHEN tabs are clicked and pages added/removed
- THEN page switching and add/remove work correctly

#### Scenario: Single page hides remove

- GIVEN a 1-page document
- WHEN the sorter renders
- THEN the remove button is hidden

#### Acceptance Criteria

- [ ] Given a 3-page document, page switching and add/remove work correctly
- [ ] Given a 1-page document, the remove button is hidden

---

### Requirement: Undo/Redo Button States

The undo button MUST be disabled (`aria-disabled="true"`, visually dimmed) when there are no actions to undo (history is empty or at the oldest state). The redo button MUST be disabled when there are no actions to redo (at the newest state). Both buttons MUST update their disabled state immediately after any store action.

#### Scenario: Fresh document — both buttons disabled

- GIVEN a fresh document with no edits
- WHEN the toolbar renders
- THEN both undo and redo buttons are disabled

#### Scenario: After one edit — undo enabled, redo disabled

- GIVEN one edit has been made
- WHEN the toolbar renders
- THEN undo is enabled and redo is disabled

#### Scenario: After one undo — undo disabled, redo enabled

- GIVEN one edit was undone
- WHEN the toolbar renders
- THEN undo is disabled and redo is enabled

#### Acceptance Criteria

- [ ] Given no undo history, the undo button is disabled
- [ ] Given no redo history, the redo button is disabled
- [ ] Given available undo history, the undo button is enabled
- [ ] Given available redo history, the redo button is enabled

---

### Requirement: WCAG AA Toolbar Accessibility

The toolbar and navigation elements MUST conform to WCAG 2.1 AA standards. The main toolbar MUST use `role="toolbar"` with `aria-label`. Within the toolbar, arrow keys MUST move focus between buttons (Left/Right). Tab MUST move focus out of the toolbar to the next landmark. All icon-only buttons MUST have `aria-label` describing their action. Toggle buttons (e.g., grid, guides) MUST use `aria-pressed` to indicate their state.

#### Scenario: Arrow key moves focus between toolbar buttons

- GIVEN the toolbar is focused on a button
- WHEN the user presses the Right arrow key
- THEN focus moves to the next toolbar button

#### Scenario: Icon-only buttons have aria-label

- GIVEN an icon-only button in the toolbar
- WHEN inspected
- THEN it has a descriptive `aria-label`

#### Acceptance Criteria

- [ ] Given the toolbar, it has role="toolbar" with aria-label
- [ ] Given arrow key press in toolbar, focus moves between buttons
- [ ] Given icon-only buttons, each has a descriptive aria-label
- [ ] Given toggle buttons, aria-pressed reflects the current state

---

## Spec Gaps

- [ ] **Undo/Redo Button States:** No automated tests verify disabled state of undo/redo buttons based on history depth — component tests needed for the toolbar undo/redo state.
- [ ] **WCAG AA Toolbar Accessibility:** No automated tests verify role="toolbar", arrow-key focus movement, aria-label on icon-only buttons, or aria-pressed on toggle buttons — accessibility-focused component tests are needed.

---

## Non-Goals

- Property panels → see [panels.md](panels.md)
- Modal dialogs → see [modals.md](modals.md)
- Timeline editing → see [timeline.md](timeline.md)
