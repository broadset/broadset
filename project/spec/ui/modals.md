# UI — Modals Specification

## Purpose

Defines the behavioral requirements for all modal dialogs: About, Canvas Settings, Export, Media Library, New Document, and Shortcut Help.

---

## Requirements

### Requirement: About Modal

The system MUST NOT render when closed. When open, it MUST render about content. Clicking close MUST call the onClose callback.

**Content:**

| Zone        | Content                                                                                |
| ----------- | -------------------------------------------------------------------------------------- |
| Title       | Application name ("Broadset")                                                          |
| Description | One-paragraph summary of the application                                               |
| Stack info  | Definition list (`<dl>`) showing: Stack (React, Zustand, HeroUI v3), Renderer, Exports |
| Version     | Current application version number                                                     |

The modal MUST use HeroUI `Modal` (size `md`), with a close button (X icon) in the header.

#### Scenario: Open and close

- GIVEN the modal is open
- WHEN the close button is clicked
- THEN onClose is called and content is visible while open

#### Acceptance Criteria

- [ ] Given the modal is open, onClose is called and content is visible while open

---

### Requirement: Canvas Settings Modal

The system MUST NOT render when closed. When open, it MUST display heading, section labels, document name, rulers switch, all three view mode buttons, perspective slider, grid controls (show/snap), and a Done button. All controls MUST fire their corresponding callbacks.

**Field Layout:**

| Section        | Fields                                                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Document       | Document name (HeroUI `Input`)                                                                                                 |
| Canvas         | Show rulers (HeroUI `Switch`), Ruler units (HeroUI `Select`: px/mm/in), View mode (HeroUI `ButtonGroup`: none/broadcast/print) |
| 3D Perspective | Perspective (HeroUI `Slider`, range ~100–5000 px)                                                                              |
| Grid           | Show grid (HeroUI `Switch`), Grid size (NumField, in mm), Snap to grid (HeroUI `Switch`), Snap threshold (NumField, in px)     |

All changes MUST fire immediately via callbacks — there is no draft/submit pattern. A Done button MUST close the modal.

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

**Layout Structure:**

| Zone                    | Content                                                                                                                                       |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Exporter selector       | Grid of export format option buttons grouped by category                                                                                      |
| Format-specific options | Options panel that changes per selected exporter (e.g., PDF: base64 toggle; Video: FPS/resolution/bitrate; Raster: pixel ratio, JPEG quality) |
| Dynamic data fields     | Text inputs for data substitution values (for template exports)                                                                               |
| Preview                 | Embedded renderer preview showing current document with animations                                                                            |
| Progress indicator      | HeroUI `Spinner` shown during long-running export operations                                                                                  |

**Exporter Categories:**

| Category  | Formats        |
| --------- | -------------- |
| Web       | HTML, SVG      |
| Documents | PDF, PSD, PPTX |
| Images    | PNG, JPEG      |
| Video     | MP4, WebM      |
| Broadcast | OGraf          |

Only exporters that have their feature flag enabled MUST appear.

**Format-Specific Options:**

When an exporter is selected, the options panel MUST display controls specific to that format:

| Format   | Options                                                                                                                                                                           |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PDF      | Base64-embed assets toggle (HeroUI `Switch`)                                                                                                                                      |
| PSD      | (no extra options)                                                                                                                                                                |
| PPTX     | (no extra options)                                                                                                                                                                |
| PNG      | Pixel ratio (NumField, 1–4), Background color (ColorInput)                                                                                                                        |
| JPEG     | Pixel ratio (NumField, 1–4), Quality (HeroUI `Slider`, 0–1), Background color (ColorInput)                                                                                        |
| MP4/WebM | FPS (HeroUI `Select`: 24/25/30/50/60 or custom NumField), Resolution W×H (NumField pair), Bitrate (NumField, kbps), Timeline selector (HeroUI `Select` listing element timelines) |
| OGraf    | ID prefix (HeroUI `Input`)                                                                                                                                                        |
| HTML     | (no extra options)                                                                                                                                                                |
| SVG      | (no extra options)                                                                                                                                                                |

**Renderer Preview:**

The export modal MUST include an embedded renderer preview showing the current document. For animated formats (MP4, WebM, OGraf), the preview MUST play the selected timeline animation. The preview MUST update when dynamic data fields change.

**Export Progress:**

During export, a HeroUI `Progress` bar MUST replace the submit button area, showing progress as a percentage. The modal MUST NOT be closeable during active export.

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

**Layout Structure:**

| Zone             | Content                                                                                        |
| ---------------- | ---------------------------------------------------------------------------------------------- |
| Search bar       | HeroUI `Input` for filtering assets by name                                                    |
| Category tabs    | HeroUI `Tabs` for filtering by media category ("All" tab always first, then custom categories) |
| Asset grid       | 3-column scrollable grid of asset thumbnails (max-height 400px, `overflow-y: auto`)            |
| Selected preview | Highlighted border on the selected thumbnail                                                   |
| Upload button    | Conditionally visible; triggers hidden `<input type="file" accept="image/*">` via ref          |
| Upload progress  | HeroUI `Spinner` shown during upload, replacing the upload button                              |
| Confirm button   | "Select" button (HeroUI `Button`, primary) — disabled until an asset is selected               |

**Asset Thumbnails:**

Each asset MUST render as a clickable thumbnail button showing the image preview. Clicking MUST select the asset (highlighted border). Double-clicking MUST select and confirm in one action. The asset name MUST be displayed below or overlaid on the thumbnail.

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

**Layout Structure:**

| Zone            | Content                                                                                                |
| --------------- | ------------------------------------------------------------------------------------------------------ |
| Category tabs   | HeroUI `Tabs` — one tab per preset category (Broadcast, Print, Social Media, Commercial, Large Format) |
| Preset table    | HeroUI `Table` with columns: Name, Dimensions (formatted as `W × H unit`), Mode                        |
| Selected preset | Highlighted table row for the selected preset                                                          |
| Footer buttons  | Cancel (ghost) and Create Document (primary) — Create disabled until a preset is selected              |

**Preset Table:**

Presets MUST be displayed in a HeroUI `Table` (not a card grid) for scannable comparison. Each row MUST show the preset name, formatted dimensions (e.g. `1920 × 1080 px`, `210 × 297 mm`), and document mode. Clicking a row MUST select that preset. The selected row MUST be visually highlighted.

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

**Shortcut Groups (two-column layout):**

| Column | Groups                                       |
| ------ | -------------------------------------------- |
| Left   | Clipboard & Selection, Nudge                 |
| Right  | Layer Order, Grouping & Lock, Zoom & History |

Each row MUST show the action description and the key binding rendered using HeroUI `Kbd` components. The modal MUST accept a `shortcuts` prop to allow the host to override default key bindings.

#### Scenario: All shortcut groups visible

- GIVEN the modal is open
- WHEN it renders
- THEN all five shortcut groups with descriptions and kbd elements are shown

#### Acceptance Criteria

- [ ] Given the modal is open, all five shortcut groups with descriptions and kbd elements are shown

---

### Requirement: Guide Position Modal

The system MUST display a small modal when the user double-clicks a ruler guide. The modal MUST allow editing the exact position of the guide and deleting it.

**Layout Structure:**

| Zone           | Content                                                                  |
| -------------- | ------------------------------------------------------------------------ |
| Position input | NumField showing the guide position in the current ruler unit (mm/px/in) |
| Delete button  | HeroUI `Button` (danger variant) — removes the guide                     |
| Apply button   | HeroUI `Button` (primary variant) — commits the new position             |

The modal MUST use HeroUI `Modal` (size `sm`). Pressing Enter MUST apply the new position. Pressing Escape MUST close without changes.

#### Scenario: Edit guide position

- GIVEN a guide at 50mm
- WHEN the user changes the position to 75mm and clicks Apply
- THEN the guide is repositioned to 75mm

#### Scenario: Delete guide

- GIVEN a guide at 50mm
- WHEN the user clicks Delete
- THEN the guide is removed

#### Acceptance Criteria

- [ ] Given a guide position change and Apply, the guide is repositioned
- [ ] Given Delete clicked, the guide is removed
- [ ] Given Enter key, the position is applied
- [ ] Given Escape key, the modal closes without changes

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

### Requirement: Template Browser Modal

When content templates are configured (via `EditorConfig.templates`), the New Document flow MUST include a template browser section. The template browser MUST display templates grouped by `category` with alphabetically sorted category headers. Each template MUST show a `thumbnail` image and `name` label. Selecting a template MUST highlight it with a visible selection ring. Confirming the selection (double-click or "Create" button) MUST load the template's stored `BroadsetDocument` as a new document, replacing the current document (with confirmation if the current document has unsaved changes). The browser MUST include a search input that filters templates by name (case-insensitive substring match). When no templates match the search, a "No templates found" message MUST appear. When `EditorConfig.templates` is empty or absent, the template browser section MUST NOT appear in the New Document modal — only blank document size presets are shown. The template browser MUST use a responsive grid layout (minimum 3 columns, maximum 5) with thumbnail cards.

#### Scenario: Browse templates by category

- GIVEN templates in categories "Lower Thirds" and "Full Screen"
- WHEN the template browser renders
- THEN templates are grouped under "Full Screen" and "Lower Thirds" headers (alphabetical)

#### Scenario: Search filters templates

- GIVEN 10 templates and a search input with "news"
- WHEN the user types "news"
- THEN only templates whose name contains "news" (case-insensitive) are shown

#### Scenario: Select and create from template

- GIVEN a template "Sports Score" is selected
- WHEN the user clicks "Create"
- THEN the template's stored document is loaded as a new document

#### Scenario: No templates configured

- GIVEN `EditorConfig.templates` is empty
- WHEN the New Document modal opens
- THEN no template browser section is shown

#### Scenario: Unsaved changes confirmation

- GIVEN the current document has unsaved changes
- WHEN the user selects a template and clicks "Create"
- THEN a confirmation dialog asks whether to discard unsaved changes before proceeding

#### Acceptance Criteria

- [ ] Given templates, they are displayed grouped by category with alphabetical category sorting
- [ ] Given a search query, templates are filtered by name substring match
- [ ] Given a template selection and confirmation, the template document is loaded as a new document
- [ ] Given no templates configured, the template browser section is not shown
- [ ] Given unsaved changes, a confirmation dialog appears before replacing the document
- [ ] Given the template browser, a responsive grid with 3–5 columns is used

---

## Spec Gaps

- [ ] **WCAG AA Modal Accessibility:** No automated tests verify focus trapping, focus restoration on close, Escape-to-close behavior, or ARIA attribute presence on modal containers — accessibility-focused component tests are needed for all modal dialogs.
- [ ] **Template Browser Modal:** No automated tests cover category grouping, search filtering, template loading, or unsaved changes confirmation — requires CT.

---

## Non-Goals

- Property panels → see [panels.md](panels.md)
- Toolbar and context menu → see [toolbar-nav.md](toolbar-nav.md)
