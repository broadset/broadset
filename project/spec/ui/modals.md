# UI — Modals Specification

## Purpose

Defines the behavioral requirements for all modal dialogs: About, Canvas Settings, Export, Media Library, New Document, and Shortcut Help.

---

## Requirements

### Requirement: About Modal

The system MUST NOT render when closed. When open, it MUST render about content. Clicking close MUST call the onClose callback.

#### Scenario: Open and close

- GIVEN the modal is open
- WHEN the close button is clicked
- THEN onClose is called and content is visible while open

#### Acceptance Criteria

- [ ] Given the modal is open, onClose is called and content is visible while open

---

### Requirement: Canvas Settings Modal

The system MUST NOT render when closed. When open, it MUST display heading, section labels, document name, rulers switch, all three view mode buttons, perspective slider, grid controls (show/snap), and a Done button. All controls MUST fire their corresponding callbacks.

#### Scenario: Document name editing

- GIVEN the modal is open with document name "My Doc"
- WHEN the name input changes
- THEN onDocumentNameChange is called

#### Scenario: View mode selection

- GIVEN all three view mode buttons visible
- WHEN a view mode button is pressed
- THEN onViewModeChange is called

#### Scenario: Grid controls

- GIVEN show grid and snap to grid switches
- WHEN toggled
- THEN onGridChange is called with updated values

#### Acceptance Criteria

- [ ] Given the modal is open with document name "My Doc", onDocumentNameChange is called
- [ ] Given all three view mode buttons visible, onViewModeChange is called
- [ ] Given show grid and snap to grid switches, onGridChange is called with updated values

---

### Requirement: Export Modal

The system MUST show only exporters enabled by feature flags. When submitted, it MUST pass the selected exporter, dynamic data, and snapshot document. User-selected exporter MUST be preserved when dynamic data props update.

#### Scenario: Feature-flagged exporters

- GIVEN certain export features enabled
- WHEN the modal renders
- THEN only enabled exporters are shown

#### Scenario: Submit with selection

- GIVEN a selected exporter
- WHEN submit is clicked
- THEN the callback receives exporter, dynamic data, and document snapshot

#### Acceptance Criteria

- [ ] Given certain export features enabled, only enabled exporters are shown
- [ ] Given a selected exporter, the callback receives exporter, dynamic data, and document snapshot

---

### Requirement: Media Library Modal

The system MUST show empty state when no media source is configured. It MUST render all assets, support search filtering and category tabs. Selecting an asset and confirming MUST update the element. The Select button MUST be disabled when nothing is selected. Upload button MUST be visible only when `onUploadRequest` is provided.

#### Scenario: Search filtering

- GIVEN assets in the library
- WHEN a search query is entered
- THEN assets are filtered by query

#### Scenario: Category tabs

- GIVEN categories provided
- WHEN a category tab is clicked
- THEN assets are filtered by category

#### Scenario: Select and confirm

- GIVEN an asset selected
- WHEN confirm is clicked
- THEN the element is updated with the selected asset

#### Acceptance Criteria

- [ ] Given assets in the library, assets are filtered by query
- [ ] Given categories provided, assets are filtered by category
- [ ] Given an asset selected, the element is updated with the selected asset

---

### Requirement: New Document Modal

The system MUST support category tabs for switching preset groups. Selecting a preset and clicking Create MUST create a document with the correct mode. Without a selection, Create MUST NOT fire. Custom presets MUST override built-in ones. Empty custom presets MUST fall back to built-in presets.

#### Scenario: Create from preset

- GIVEN a selected screen preset
- WHEN Create is clicked
- THEN onCreateDocument fires with correct document mode

#### Scenario: Custom presets

- GIVEN custom presets configured
- WHEN the modal renders
- THEN custom categories and presets are shown

#### Scenario: No selection blocks create

- GIVEN no preset selected
- WHEN Create is clicked
- THEN onCreateDocument is NOT called

#### Acceptance Criteria

- [ ] Given a selected screen preset, onCreateDocument fires with correct document mode
- [ ] Given custom presets configured, custom categories and presets are shown
- [ ] Given no preset selected, onCreateDocument is NOT called

---

### Requirement: Shortcut Help Modal

The system MUST NOT render when closed. When open, it MUST display the heading, all five shortcut groups, human-readable action descriptions, and keyboard labels in `<kbd>` elements. Close button MUST call onClose.

#### Scenario: All shortcut groups visible

- GIVEN the modal is open
- WHEN it renders
- THEN all five shortcut groups with descriptions and kbd elements are shown

#### Acceptance Criteria

- [ ] Given the modal is open, all five shortcut groups with descriptions and kbd elements are shown

---

### Requirement: WCAG AA Modal Accessibility

All modals MUST conform to WCAG 2.1 AA standards. Modal containers MUST use `role="dialog"` with `aria-modal="true"` and `aria-labelledby` referencing the modal title. When a modal is open, Tab key navigation MUST be trapped within the modal and MUST NOT escape to elements behind the overlay. Opening a modal MUST move focus to the first interactive element or the modal title. Closing a modal MUST return focus to the element that triggered it. All modals MUST close on Escape key press. Modal opening MUST be announced to screen readers.

#### Scenario: Focus trapped within open modal

- GIVEN a modal is open
- WHEN the user presses Tab past the last interactive element
- THEN focus wraps to the first interactive element in the modal

#### Scenario: Escape closes modal and restores focus

- GIVEN a modal is open
- WHEN the user presses Escape
- THEN the modal closes and focus returns to the trigger element

#### Scenario: Modal container has correct ARIA attributes

- GIVEN a modal container
- WHEN inspected
- THEN it has `role="dialog"`, `aria-modal="true"`, and `aria-labelledby` referencing the title

#### Acceptance Criteria

- [ ] Given an open modal, Tab navigation is trapped within the modal
- [ ] Given a modal close, focus returns to the trigger element
- [ ] Given Escape key press, the modal closes
- [ ] Given a modal container, it has role="dialog" and aria-modal="true"
- [ ] Given a modal with a title, aria-labelledby references the title element

---

## Spec Gaps

- [ ] **WCAG AA Modal Accessibility:** No automated tests verify focus trapping, focus restoration on close, Escape-to-close behavior, or ARIA attribute presence on modal containers — accessibility-focused component tests are needed for all modal dialogs.

---

## Non-Goals

- Property panels → see [panels.md](panels.md)
- Toolbar and context menu → see [toolbar-nav.md](toolbar-nav.md)
