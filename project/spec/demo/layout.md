# Demo — Layout Specification

## Purpose

Defines the application shell layout for the demo editor: full-viewport canvas area, floating toolbars, resizable sidebar drawer, context menu, and timeline panel. This spec ensures the spatial arrangement and navigation can be reconstructed from contracts alone. It does NOT define component internals (→ `project/spec/ui/`) or canvas rendering (→ `project/spec/editor/canvas.md`). See [conventions](../../README.md).

---

## Requirements

### Requirement: Full-Viewport Layout

The app MUST occupy the full browser viewport (100vw × 100vh) with no page-level scrolling. All overflow MUST be hidden.

#### Scenario: App fills viewport

- GIVEN the demo app is loaded
- WHEN the page renders
- THEN the app container fills the entire viewport with no scrollbars

#### Acceptance Criteria

- [ ] Given the demo app is loaded, the container fills 100vw × 100vh with overflow hidden

---

### Requirement: Canvas Area

The center area MUST contain the EditorCanvas wrapped in a RulerSystem and an EditorErrorBoundary. The canvas area MUST fill all available space not occupied by toolbars or the sidebar.

#### Scenario: Canvas renders with rulers and error boundary

- GIVEN the demo app is loaded
- WHEN the canvas area renders
- THEN the EditorCanvas is visible inside rulers with error boundary protection

#### Acceptance Criteria

- [ ] Given the demo app is loaded, the canvas renders inside rulers and an error boundary
- [ ] Given the sidebar is closed, the canvas expands to fill the freed space

---

### Requirement: Floating Main Toolbar

A glass-morphism toolbar MUST float at the top-left of the canvas area (offset by ruler thickness). It MUST provide actions for: save, export, import, new document, canvas settings toggle, and debug snapshot download. The save toolbar button triggers the `EditorConfig.onSave` callback. If `onSave` is not configured, the save button MUST be hidden. In the demo app, `onSave` persists to localStorage (see state.md).

#### Scenario: Toolbar visible on load

- GIVEN the demo app is loaded
- WHEN the main toolbar renders
- THEN save, export, import, new document, settings, and debug snapshot actions are available

#### Acceptance Criteria

- [ ] Given the demo app is loaded, the main toolbar floats at the top-left over the canvas
- [ ] Given the toolbar, save/export/import/new/settings/debug actions are available
- [ ] Given `onSave` is not configured, the save button is hidden

---

### Requirement: Element Toolbar

A vertical element toolbar MUST render below the main toolbar listing all built-in element types and registered custom plugins. Each button MUST enter placement mode for its type. The active placement type MUST be visually highlighted.

#### Scenario: All element types listed

- GIVEN the demo app with a custom countdown plugin
- WHEN the element toolbar renders
- THEN buttons for text, rectangle, ellipse, image, svg, path, qrcode, group, and countdown are visible

#### Scenario: Placement mode activation

- GIVEN no active placement
- WHEN an element type button is pressed
- THEN placement mode is entered for that type and the button is highlighted

#### Acceptance Criteria

- [ ] Given the demo app, all built-in element types plus custom plugins appear in the element toolbar
- [ ] Given an element type button press, placement mode is entered for that type

---

### Requirement: Resizable Sidebar Drawer

A right-side drawer MUST contain tabbed panels: Layers, Properties, Animation, Preflight. The drawer MUST be resizable by dragging its left edge (min 256px, max 800px). The drawer width MUST persist across sessions.

#### Scenario: Sidebar tabs

- GIVEN the demo app with the sidebar open
- WHEN the sidebar renders
- THEN Layers, Properties, Animation, and Preflight tabs are available

#### Scenario: Sidebar resize

- GIVEN the sidebar is open
- WHEN the left edge is dragged to change width
- THEN the sidebar width changes within 256–800px bounds

#### Acceptance Criteria

- [ ] Given the sidebar, Layers/Properties/Animation/Preflight tabs are available
- [ ] Given a resize drag, the sidebar width stays within 256–800px bounds
- [ ] Given a width change, the new width persists across page reloads

---

### Requirement: Sidebar Tab Switching

Clicking the active tab MUST close the sidebar. Clicking an inactive tab MUST open or switch to it. When no element is selected and the active tab is Properties or Animation, the sidebar MUST auto-switch to Layers.

#### Scenario: Toggle active tab closes sidebar

- GIVEN the sidebar is open on Layers
- WHEN the Layers tab is clicked
- THEN the sidebar closes

#### Scenario: Auto-switch on deselection

- GIVEN the Properties tab is active with an element selected
- WHEN the selection is cleared
- THEN the sidebar switches to the Layers tab

#### Acceptance Criteria

- [ ] Given an active tab click, the sidebar closes
- [ ] Given an inactive tab click, the sidebar opens to that tab
- [ ] Given no selection with Properties or Animation active, the tab auto-switches to Layers

---

### Requirement: Context Menu

A right-click context menu MUST be available on the canvas area, providing element-contextual actions.

#### Scenario: Right-click opens context menu

- GIVEN an element selected on the canvas
- WHEN the user right-clicks
- THEN a context menu with element actions appears

#### Acceptance Criteria

- [ ] Given a right-click on the canvas area, the context menu appears

---

### Requirement: Timeline Panel

The TimelineBottomPanel MUST render at the bottom of the canvas area when a timeline is being edited. It MUST receive play, seek, and stop callbacks from the timeline playback hook.

#### Scenario: Timeline panel appears when editing

- GIVEN a timeline is opened for editing
- WHEN the panel renders
- THEN the TimelineBottomPanel is visible at the bottom with playback controls

#### Acceptance Criteria

- [ ] Given a timeline being edited, the TimelineBottomPanel is visible at the bottom
- [ ] Given no timeline being edited, the timeline panel is hidden

---

### Requirement: Placement Mode Banner

When placement mode is active, a banner MUST appear at the top-center of the canvas area showing the active placement type and a Cancel button. Pressing Escape MUST also cancel placement.

#### Scenario: Banner shows during placement

- GIVEN placement mode is active for type 'text'
- WHEN the banner renders
- THEN it shows "Placement mode: click on the canvas to place text" with a Cancel button

#### Acceptance Criteria

- [ ] Given active placement mode, a banner with the type name and Cancel button is visible
- [ ] Given Escape key during placement, placement is cancelled

---

## Spec Gaps

- [ ] **Floating Main Toolbar — save button visibility:** No automated test currently verifies that the save button is hidden when `onSave` is not configured. A test covering this acceptance criterion needs to be written.

---

## Non-Goals

- Canvas rendering internals → see `project/spec/editor/canvas.md`
- Toolbar component behavior → see `project/spec/ui/toolbar-nav.md`
- Sidebar panel component behavior → see `project/spec/ui/panels.md`
- Timeline editor component → see `project/spec/ui/timeline.md`
