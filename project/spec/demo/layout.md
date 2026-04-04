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

**Toolbar Visual:**

The toolbar MUST use a compact height (consistent with `sp-08` token). It MUST use glass-morphism styling: semi-transparent background with backdrop blur, and a subtle border on the bottom edge. All buttons MUST be `size="sm"` and icon-only with HeroUI `Tooltip` on hover.

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

A vertical element toolbar MUST render below the main toolbar in a single column listing all built-in element types and registered custom plugins. Each button MUST be icon-only with a tooltip and MUST enter placement mode for its type. The active placement type MUST be visually highlighted.

**Visual:**

The element toolbar MUST be a vertical strip of icon buttons positioned directly below the floating main toolbar, aligned to the left edge of the canvas. It MUST share the same glass-morphism treatment as the main toolbar. Buttons MUST be icon-only with HeroUI `Tooltip` on hover. The active placement button MUST use a highlighted/primary color variant to indicate it is active.

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

**Sidebar Drawer Visual Structure:**

The drawer MUST be fixed-positioned on the right edge of the viewport. When closed, it MUST slide off-screen to the right (via CSS transform) with `pointer-events: none`. When open, it MUST slide to its natural position with full interactivity. The slide animation MUST use the `--transition-panel` token.

**Resize Handle:**

The left edge of the drawer MUST contain a resize handle that:

- Sets the cursor to `col-resize` on hover
- Shows a thin vertical line with grip dots on hover (subtle visual affordance)
- Supports click-and-drag to resize the drawer width
- Constrains width within the 256–800px range
- Provides feedback during drag (the line becomes more visible)

**Tab Bar:**

The tab bar MUST use HeroUI `Tabs` and be positioned at the top of the drawer. Tab items MUST use a pill/segment style: a shared background container with the active tab highlighted using `--surface-tertiary`. The four tabs MUST be:

| Tab        | Icon         | Content panel     |
| ---------- | ------------ | ----------------- |
| Layers     | Layers       | LayersSidebar     |
| Properties | Settings2    | PropertiesSidebar |
| Animation  | Clapperboard | AnimationSidebar  |
| Preflight  | CheckCircle  | PreflightPanel    |

The sidebar MUST use glass-morphism styling with border-radius on the left corners only (the right side is flush with the viewport edge).

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

The bottom area of the canvas MUST contain only the timeline. When no timeline is being edited, a single toggle button MUST be visible to open the timeline. When a timeline is opened, the TimelineBottomPanel MUST render at the bottom of the canvas area. It MUST receive play, seek, and stop callbacks from the timeline playback hook. No other controls (undo/redo, page sorter, grid toggle, zoom, playback) belong in the bottom bar — these MUST be located in the floating main toolbar or sidebar.

#### Scenario: Timeline toggle when closed

- GIVEN no timeline is being edited
- WHEN the bottom area renders
- THEN only a timeline toggle button is visible

#### Scenario: Timeline panel appears when editing

- GIVEN a timeline is opened for editing
- WHEN the panel renders
- THEN the TimelineBottomPanel is visible at the bottom with playback controls

#### Acceptance Criteria

- [ ] Given no timeline being edited, only a timeline toggle button is visible at the bottom
- [ ] Given a timeline being edited, the TimelineBottomPanel is visible at the bottom
- [ ] Given the bottom area, no undo/redo, page sorter, grid, zoom, or playback buttons are present

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

### Requirement: Page Sorter Position

The page sorter MUST float in the canvas area below the element toolbar, at the top-left. It MUST use glass-morphism styling consistent with the toolbars. It MUST NOT be placed in the bottom bar or the sidebar.

#### Scenario: Page sorter visible

- GIVEN a multi-page document
- WHEN the canvas area renders
- THEN the page sorter floats at the top-left below the element toolbar

#### Acceptance Criteria

- [ ] Given a multi-page document, the page sorter floats at the top-left of the canvas area

---

### Requirement: Canvas Selection Indicator

When one or more elements are selected on the canvas, a visible selection outline MUST appear around each selected element. The outline MUST match the element's position, size, and rotation. Clicking on an element MUST display the outline; clicking empty canvas space MUST clear it.

#### Scenario: Selection outline on click

- GIVEN the canvas is rendered with elements
- WHEN the user clicks on an element
- THEN a blue outline appears around the clicked element

#### Scenario: Deselect clears outline

- GIVEN an element is selected
- WHEN the user clicks on empty canvas space
- THEN no selection outline is visible

#### Acceptance Criteria

- [ ] Given an element click, a selection outline appears around that element
- [ ] Given a click on empty canvas space, no selection outline is visible
- [ ] Given a selected element, the layers sidebar highlights the selected layer

---

## Spec Gaps

- [ ] **Floating Main Toolbar — save button visibility:** No automated test currently verifies that the save button is hidden when `onSave` is not configured. A test covering this acceptance criterion needs to be written.

---

## Layout Diagram

For reference, the overall app layout MUST follow this spatial arrangement:

```
┌─────────────────────────────────────────────────────────┐
│  [Main Toolbar]  (glass, floating top-left)             │
│  [Element Toolbar] (vertical, below main toolbar)       │
│                                                         │
│  ┌──────┐                                   ┌─────────┐│
│  │ Page │   Canvas Area                     │ Sidebar ││
│  │Sorter│   (fills remaining space,         │ Drawer  ││
│  │(float│    rulers on top & left edges)     │ (right, ││
│  │ below│                                   │ resize- ││
│  │ elem │                                   │ able,   ││
│  │ tlbr)│                                   │ tabbed) ││
│  └──────┘                                   └─────────┘│
│                                                         │
│  [Placement Banner]  (top-center, conditional)          │
│                                                         │
│  ┌─────────────────────────────────────────────────────┐│
│  │ Timeline Bottom Panel  (slides up when editing)     ││
│  └─────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
```

---

## Non-Goals

- Canvas rendering internals → see `project/spec/editor/canvas.md`
- Toolbar component behavior → see `project/spec/ui/toolbar-nav.md`
- Sidebar panel component behavior → see `project/spec/ui/panels.md`
- Timeline editor component → see `project/spec/ui/timeline.md`
