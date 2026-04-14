# UI — Toolbar & Navigation Specification

## Purpose

Defines the behavioral requirements for the toolbar, context menu, element library, and scene sorter — the primary navigation and command controls in the editor UI.

---

## Requirements

### Requirement: Toolbar Actions

The main toolbar MUST organize its controls into a compact icon-driven layout with dropdown menus, standalone buttons, and conditional action groups. The toolbar MUST avoid text buttons in the chrome itself; every toolbar control is represented by an icon and explained via tooltip.

**Toolbar Zone Layout:**

The toolbar MUST arrange controls left-to-right in these zones:

| Zone                        | Controls                                                                     |
| --------------------------- | ---------------------------------------------------------------------------- |
| **Menus**                   | File dropdown, View dropdown, Scenes dropdown, Help dropdown (icon triggers) |
| **Undo / Redo**             | Undo button, Redo button (always visible, disabled when unavailable)         |
| **Alignment** (conditional) | Visible only when 2+ elements selected — see Alignment zone below            |
| **Centre**                  | Document name label, Resolution display (e.g., "1920×1080 — 16:9")           |
| **Right**                   | Zoom level display (e.g., "100%")                                            |

All interactive controls MUST be `size="sm"`. All toolbar buttons and dropdown triggers MUST be HeroUI `Button` components with `isIconOnly`, an `aria-label`, and a HeroUI `Tooltip` that shows the action name on hover. Text labels are allowed inside dropdown menu items and in the non-interactive centre document info, but MUST NOT appear as clickable toolbar button text. Each dropdown MUST use HeroUI `Dropdown` + `Dropdown.Menu`.

**Alignment Zone (conditional):**

Visible only when 2+ elements are selected. Contains:

- Align left / center-x / right (each as HeroUI `ButtonGroup`)
- Align top / center-y / bottom (each as HeroUI `ButtonGroup`)
- Distribute horizontal / vertical (disabled if < 3 elements)
- Group / Ungroup (disabled if < 2 elements)

**File Menu:**

| Item              | Icon         | Shortcut   | Action                                                 | Notes                             |
| ----------------- | ------------ | ---------- | ------------------------------------------------------ | --------------------------------- |
| New Document      | `FilePlus`   | —          | Opens NewDocumentModal                                 |                                   |
| Open              | `FolderOpen` | Ctrl/Cmd+O | Triggers hidden file input dialog                      |                                   |
| _(separator)_     |              |            |                                                        |                                   |
| Save              | `Save`       | Ctrl/Cmd+S | Calls `EditorConfig.onSave`                            | Hidden if `onSave` not configured |
| Save as JSON      | `Download`   | —          | Downloads document as JSON file                        |                                   |
| Import            | `Upload`     | —          | Triggers file import (JSON + formats)                  |                                   |
| Export            | `FileOutput` | —          | Opens ExportModal                                      | Hidden if no export flags         |
| _(separator)_     |              |            |                                                        |                                   |
| Document Settings | `Settings`   | —          | Opens CanvasSettingsModal (document name, perspective) |                                   |
| Debug Snapshot    | `Bug`        | —          | Downloads editor state as JSON                         |                                   |

**View Menu:**

| Item           | Icon       | Action                                                             | Type    | Notes                    |
| -------------- | ---------- | ------------------------------------------------------------------ | ------- | ------------------------ |
| Show Rulers    | `Ruler`    | Toggles `canvasSettings.showRulers`                                | Toggle  | Checkmark when active    |
| Show Grid      | `Grid3X3`  | Toggles `canvasSettings.grid.showGrid`                             | Toggle  | Checkmark when active    |
| Snap to Grid   | `Magnet`   | Toggles `canvasSettings.grid.snapToGrid`                           | Toggle  | Checkmark when active    |
| _(separator)_  |            |                                                                    |         |                          |
| Units          | —          | Submenu: px, mm, in                                                | Submenu | Checkmark on active unit |
| View Mode      | —          | Submenu: None, Broadcast, Print                                    | Submenu | Checkmark on active mode |
| _(separator)_  |            |                                                                    |         |                          |
| Grid Size      | `Hash`     | Opens inline input or Grid Settings section of CanvasSettingsModal | Action  |                          |
| Snap Threshold | —          | Opens inline input or Grid Settings section of CanvasSettingsModal | Action  |                          |
| _(separator)_  |            |                                                                    |         |                          |
| Zoom to Fit    | `Maximize` | Zoom-to-fit action                                                 | Action  |                          |
| Reset Zoom     | —          | Sets zoom to 100%, resets pan                                      | Action  |                          |

Toggle items MUST show a checkmark (✓) or check icon when the setting is active. Submenus MUST show the currently selected option with a checkmark.

**Scenes Menu:**

| Item          | Icon    | Action                       | Notes                           |
| ------------- | ------- | ---------------------------- | ------------------------------- |
| Scene 1       | —       | Switch to scene 1            | Checkmark on active scene       |
| Scene 2       | —       | Switch to scene 2            | Checkmark on active scene       |
| …             | —       | (one item per scene)         |                                 |
| _(separator)_ |         |                              |                                 |
| Add Scene     | `Plus`  | Creates new scene at the end |                                 |
| Remove Scene  | `Trash` | Removes current scene        | Disabled if only 1 scene exists |

**Help Menu:**

| Item               | Icon       | Action                  |
| ------------------ | ---------- | ----------------------- |
| Keyboard Shortcuts | `Keyboard` | Opens ShortcutHelpModal |
| About              | `Info`     | Opens AboutModal        |

**Import Behavior:**

The File → Import and File → Open items MUST trigger a hidden file input accepting JSON and supported format files. On successful import, a success toast MUST appear. On validation failure, an error toast MUST show the error message.

#### Scenario: File menu actions

- GIVEN the File dropdown is opened
- WHEN the user clicks New Document
- THEN the NewDocumentModal opens

#### Scenario: Save hidden without onSave

- GIVEN `onSave` is not configured
- WHEN the File menu renders
- THEN the Save item is hidden

#### Scenario: Export hidden without feature flags

- GIVEN no export feature flags enabled
- WHEN the File menu renders
- THEN the Export item is hidden

#### Scenario: View toggles reflect state

- GIVEN Show Rulers is active
- WHEN the View menu renders
- THEN the Show Rulers item has a checkmark

#### Scenario: Scenes menu lists all scenes

- GIVEN a 3-scene document on scene 2
- WHEN the Scenes menu renders
- THEN Scene 1, Scene 2 (checked), Scene 3, Add Scene, and Remove Scene items are visible

#### Scenario: Help menu opens modals

- GIVEN the Help dropdown is opened
- WHEN the user clicks Keyboard Shortcuts
- THEN the ShortcutHelpModal opens

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

- [ ] Given the File menu, New/Open/Save/Import/Export/Settings/Debug items are available
- [ ] Given `onSave` not configured, the Save item is hidden from File menu
- [ ] Given no export feature flags, the Export item is hidden from File menu
- [ ] Given the View menu, toggle items show checkmarks reflecting current state
- [ ] Given the View menu Units submenu, the active unit has a checkmark
- [ ] Given the Scenes menu, all scenes are listed with the active scene checked
- [ ] Given the Scenes menu, Add Scene creates a scene and Remove Scene is disabled for single-scene documents
- [ ] Given the Help menu, Keyboard Shortcuts opens ShortcutHelpModal and About opens AboutModal
- [ ] Given every toolbar control, the trigger is icon-only and exposes its action name via tooltip and aria-label
- [ ] Given undo/redo buttons, temporal store undo/redo is called
- [ ] Given 2+ elements selected, alignment buttons are visible and fire alignElements
- [ ] Given 3+ elements selected, distribute buttons are visible and fire distributeElements

---

### Requirement: Context Menu

The system MUST NOT render before a right-click. After `contextmenu` event, the menu MUST appear at click coordinates with all standard items. The menu MUST be clamped to remain fully visible within the canvas container — if it would overflow the right or bottom edge, it MUST reflow to stay within bounds.

**When right-clicking an element:**

Items MUST be disabled when no element is selected. The menu MUST close after any action, when clicking outside, or when pressing Escape.

**Menu Items:**

The context menu MUST use HeroUI `Dropdown.Menu` and include items in this order:

| Item             | Shortcut         | Enabled when                               | Style  |
| ---------------- | ---------------- | ------------------------------------------ | ------ |
| Cut              | Ctrl/Cmd+X       | Selection exists and not locked            |        |
| Copy             | Ctrl/Cmd+C       | Selection exists                           |        |
| Paste            | Ctrl/Cmd+V       | Clipboard has content                      |        |
| Duplicate        | Ctrl/Cmd+D       | Selection exists and not locked            |        |
| _(separator)_    |                  |                                            |        |
| Delete           | Del/Backspace    | Selection exists, not locked, not required | danger |
| _(separator)_    |                  |                                            |        |
| Bring to Front   | —                | Selection exists                           |        |
| Bring Forward    | ]                | Selection exists, not already at front     |        |
| Send Backward    | [                | Selection exists, not already at back      |        |
| Send to Back     | —                | Selection exists                           |        |
| _(separator)_    |                  |                                            |        |
| Group            | Ctrl/Cmd+G       | 2+ elements selected                       |        |
| Ungroup          | Ctrl/Cmd+Shift+G | Selected element(s) have a groupId         |        |
| _(separator)_    |                  |                                            |        |
| Lock / Unlock    | Ctrl/Cmd+L       | Selection exists                           |        |
| Edit Clip Path   | —                | Element has `clipPath` capability          |        |
| Edit Path Points | —                | Element type is `path`                     |        |

**Delete** MUST use the HeroUI `color="danger"` variant, rendering the item in the theme's danger color (red text).

**Lock / Unlock** MUST display a dynamic label: "Lock" when the element is currently unlocked, "Unlock" when the element is currently locked.

**Group / Ungroup** MUST only be rendered (not just disabled) when 2+ elements are selected. They MUST be completely absent from the menu for single-element selections.

**When right-clicking empty canvas:**

The context menu MUST display only:

| Item  | Shortcut   | Enabled when          |
| ----- | ---------- | --------------------- |
| Paste | Ctrl/Cmd+V | Clipboard has content |

Disabled items MUST be visually dimmed and non-interactive.

#### Scenario: Right-click opens at coordinates

- GIVEN no menu visible
- WHEN a contextmenu event fires at (200, 150)
- THEN the menu appears positioned at those coordinates

#### Scenario: Disabled items without selection

- GIVEN no active element
- WHEN the menu opens
- THEN editing items are disabled

#### Scenario: Right-click on empty canvas

- GIVEN no element under the pointer
- WHEN the user right-clicks on the canvas
- THEN a context menu with only the Paste action appears

#### Scenario: Cut removes and copies element

- GIVEN an element selected
- WHEN Cut is clicked
- THEN the element is removed from the page and placed in the clipboard

#### Scenario: Copy then Paste workflow

- GIVEN elements are copied
- WHEN Paste is clicked
- THEN pasteElements is called

#### Scenario: Delete removes all selected

- GIVEN multiple elements selected
- WHEN Delete is clicked
- THEN removeElement is called for each

#### Scenario: Locked element disables destructive actions

- GIVEN a locked element selected
- WHEN the menu opens
- THEN Cut, Duplicate, and Delete are disabled

#### Scenario: Group/Ungroup for multi-select

- GIVEN 2+ elements selected
- WHEN the menu opens
- THEN Group and Ungroup items are visible

#### Scenario: Single selection hides Group/Ungroup

- GIVEN 1 element selected
- WHEN the menu opens
- THEN Group and Ungroup items are not rendered

#### Scenario: Layer reorder actions

- GIVEN an element selected
- WHEN Bring Forward/Send Backward/Bring to Front/Send to Back is clicked
- THEN reorderElement is called with the correct direction

#### Scenario: Lock/Unlock toggles label

- GIVEN an unlocked element selected
- WHEN the menu opens
- THEN the item label shows "Lock"
- AND after clicking Lock, re-opening shows "Unlock"

#### Scenario: Edit Path Points on path element

- GIVEN a path element selected
- WHEN "Edit Path Points" is clicked
- THEN path editing mode is entered

#### Scenario: Bounds-checking near edge

- GIVEN the context menu would overflow the container's right edge
- WHEN the menu opens
- THEN it repositions to stay within the visible bounds

#### Acceptance Criteria

- [ ] Given no menu visible, the menu appears positioned at those coordinates
- [ ] Given no active element, editing items are disabled
- [ ] Given no element under the pointer, only Paste is shown
- [ ] Given elements are copied, pasteElements is called
- [ ] Given Cut is selected, the element is removed and placed in the clipboard
- [ ] Given multiple elements selected, removeElement is called for each
- [ ] Given a locked element, Cut, Duplicate, and Delete are disabled
- [ ] Given 2+ elements selected, Group and Ungroup items are visible
- [ ] Given 1 element selected, Group and Ungroup items are not rendered
- [ ] Given an element selected, reorderElement is called with the correct direction
- [ ] Given Lock/Unlock is clicked, the element's locked state toggles and the label updates
- [ ] Given Edit Clip Path on an element with clipPath capability, clip-path editing activates
- [ ] Given Edit Path Points on a path element, path editing mode activates
- [ ] Given Delete item, it renders with danger color (red text)
- [ ] Given the menu would overflow the container edge, it repositions within bounds

---

### Requirement: Element Library

The system MUST render tiles for all 11 built-in element types with labels. Clicking a tile MUST call startPlacement with the type. Custom types from the registry MUST be included with their icons. Grid layout MUST use 2 columns.

**Built-In Element Types and Icons:**

Each element type MUST have a distinct `lucide-react` icon:

| Type      | Icon name  | Label     |
| --------- | ---------- | --------- |
| text      | Type       | Text      |
| image     | Image      | Image     |
| rectangle | Square     | Rectangle |
| ellipse   | Circle     | Ellipse   |
| path      | PenTool    | Path      |
| svg       | FileCode2  | SVG       |
| qrcode    | QrCode     | QR Code   |
| video     | Video      | Video     |
| clock     | Clock      | Clock     |
| ticker    | LetterText | Ticker    |

Custom plugin types MUST appear after the built-in types. If a plugin provides an SVG icon, it MUST be rendered; otherwise a default fallback icon MUST be used.

**Visual States:**

| State              | Appearance                                                      |
| ------------------ | --------------------------------------------------------------- |
| Default            | Standard icon button                                            |
| Hover              | Tooltip with type label                                         |
| Active (placement) | Highlighted (primary variant) to indicate active placement mode |
| Disabled           | Dimmed, non-interactive                                         |

#### Scenario: Built-in types visible

- GIVEN a default component registry
- WHEN the library renders
- THEN 11 built-in element tiles with labels are shown

#### Scenario: Custom type tile

- GIVEN a registry with a custom `countdown` type
- WHEN the library renders
- THEN a countdown tile is shown and clicking it calls startPlacement

#### Acceptance Criteria

- [ ] Given a default component registry, 11 built-in element tiles with labels are shown
- [ ] Given a registry with a custom `countdown` type, a countdown tile is shown and clicking it calls startPlacement

---

### Requirement: Scene Sorter

The system MUST render scene tabs matching the number of scenes. Clicking a tab MUST switch scenes. Add and remove actions MUST work. The remove button MUST be hidden when only one scene exists.

**Layout:**

The scene sorter MUST render as a floating component positioned at the top-left of the canvas area (below the element toolbar). It MUST use glass-morphism styling consistent with the main toolbar. Tab labels MUST read "Scene 1", "Scene 2", etc. The orientation MUST be configurable as horizontal or vertical.

**Controls:**

| Control       | Appearance                                  | Action                       |
| ------------- | ------------------------------------------- | ---------------------------- |
| Scene tabs    | HeroUI `Tabs` with numbered labels          | Switch active scene on click |
| Add button    | Icon button (Plus icon)                     | Creates new scene at the end |
| Remove button | Icon button (Trash icon), hidden if 1 scene | Removes current scene        |

#### Scenario: Scene switching and management

- GIVEN a 3-scene document
- WHEN tabs are clicked and scenes added/removed
- THEN scene switching and add/remove work correctly

#### Scenario: Single scene hides remove

- GIVEN a 1-scene document
- WHEN the sorter renders
- THEN the remove button is hidden

#### Acceptance Criteria

- [ ] Given a 3-scene document, scene switching and add/remove work correctly
- [ ] Given a 1-scene document, the remove button is hidden

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

- [x] **Undo/Redo Button States:** Automated tests verify disabled state behavior for undo/redo controls in toolbar component tests (`packages/ui/src/toolbar-nav.editor-pages.test.tsx`).
- [ ] **WCAG AA Toolbar Accessibility:** No automated tests verify role="toolbar", arrow-key focus movement, aria-label on icon-only buttons, or aria-pressed on toggle buttons — accessibility-focused component tests are needed.

---

## Non-Goals

- Property panels → see [panels.md](panels.md)
- Modal dialogs → see [modals.md](modals.md)
- Timeline editing → see [timeline.md](timeline.md)
