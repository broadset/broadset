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

### Requirement: Import File Input Bridge

The demo shell MUST include a hidden native file input as the browser-backed bridge for import actions initiated from HeroUI menus and toolbar controls. This native `<input type="file">` is an allowed host-shell exception to HeroUI-only controls because browser file chooser access requires the native file input element.

#### Scenario: Menu-triggered file chooser

- GIVEN the user selects an import action from toolbar/menu UI
- WHEN the demo shell opens the file chooser
- THEN the hidden native file input handles accepted file types and dispatches the selection to the import orchestration flow

#### Acceptance Criteria

- [ ] Given an import action, a hidden native file input exists as the file chooser bridge
- [ ] Given accepted import formats, the file input accept list includes json, bsp, psd, pptx, and svg
- [ ] Given file selection, the input change event is routed to the import handler

---

### Requirement: Canvas Area

The center area MUST contain the EditorCanvas wrapped in a RulerSystem and an EditorErrorBoundary. The canvas area MUST fill all available space not occupied by toolbars or the sidebar. The RulerSystem MUST render rulers along the **top and left edges only** (horizontal ruler on top, vertical ruler on the left). There is no right ruler or bottom ruler. A small origin square MUST appear at the top-left corner where the two rulers meet.

#### Scenario: Canvas renders with rulers and error boundary

- GIVEN the demo app is loaded
- WHEN the canvas area renders
- THEN the EditorCanvas is visible inside rulers with error boundary protection

#### Acceptance Criteria

- [ ] Given the demo app is loaded, the canvas renders inside rulers and an error boundary
- [ ] Given the sidebar is closed, the canvas expands to fill the freed space

---

### Requirement: Floating Main Toolbar

A glass-morphism toolbar MUST float at the top-left of the canvas area (offset by ruler thickness + gap = 28px from top and left edges). It MUST use a menu-bar–style layout with dropdown menus (File, View, Scenes, Help), standalone Undo/Redo buttons, conditional alignment/distribute/group buttons, and a centre document info section.

See `project/spec/ui/toolbar-nav.md` → Toolbar Actions for the complete menu item definitions.

**Toolbar Visual:**

The toolbar MUST use a compact height (consistent with `sp-08` token). It MUST use glass-morphism styling: `rgba(28, 28, 28, 0.85)` background with `backdrop-filter: blur(8px)`, `border: 1px solid var(--border)`, and `box-shadow: 0 2px 8px rgba(0,0,0,0.4)`. All clickable toolbar controls — including dropdown triggers, Undo/Redo, and alignment actions — MUST be icon-only HeroUI buttons with tooltips on hover and accessible `aria-label`s. Text labels are reserved for dropdown menu items and the non-interactive document info only. All interactive controls MUST be `size="sm"`.

#### Scenario: Toolbar visible on load

- GIVEN the demo app is loaded
- WHEN the main toolbar renders
- THEN File, View, Scenes, Help dropdown menus and Undo/Redo buttons are available

#### Acceptance Criteria

- [ ] Given the demo app is loaded, the main toolbar floats at the top-left over the canvas
- [ ] Given the toolbar, File/View/Scenes/Help dropdown menus are available
- [ ] Given the toolbar, all clickable controls are icon-only and expose tooltips/aria-labels
- [ ] Given the toolbar, Undo/Redo buttons are available as icon-only buttons
- [ ] Given `onSave` is not configured, the Save item is hidden from the File menu

---

### Requirement: Element Toolbar

A vertical element toolbar MUST render below the main toolbar in a single column listing all built-in element types and registered custom plugins. Each button MUST be icon-only with a tooltip and MUST enter placement mode for its type. The active placement type MUST be visually highlighted.

**Visual:**

The element toolbar MUST be a vertical strip of icon buttons positioned directly below the floating main toolbar, aligned to the left edge of the canvas. It MUST share the same glass-morphism treatment as the main toolbar. Buttons MUST be icon-only with HeroUI `Tooltip` on hover. The active placement button MUST use a highlighted/primary color variant to indicate it is active.

#### Scenario: All element types listed

- GIVEN the demo app with a custom countdown plugin
- WHEN the element toolbar renders
- THEN buttons for text, rectangle, ellipse, image, svg, path, qrcode, group, video, clock, ticker, and countdown are visible

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

**Sidebar Vertical Positioning:**

The drawer MUST NOT extend to the full viewport height. It MUST be inset equally from the top and bottom of the viewport:

| Edge     | Inset value | Breakdown                                                    |
| -------- | ----------- | ------------------------------------------------------------ |
| `top`    | `72px`      | `RULER_SIZE (20px) + gap (8px) + toolbar (36px) + gap (8px)` |
| `bottom` | `72px`      | Same inset as top — symmetrical                              |

This ensures the sidebar aligns vertically with the canvas area, sitting below the ruler + toolbar zone and above the bottom ruler + timeline zone.

**Resize Handle:**

The left edge of the drawer MUST contain a resize handle that:

- Sets the cursor to `col-resize` on hover
- Shows a thin vertical line with grip dots on hover (subtle visual affordance)
- Supports click-and-drag to resize the drawer width
- Constrains width within the 256–800px range
- Provides feedback during drag (the line becomes more visible)

The sidebar MUST use a `var(--surface)` opaque background with `border-radius` on the left corners only (the right side is flush with the viewport edge). The sidebar MUST NOT use glass-morphism — it is an opaque surface panel. The sidebar body MUST scroll internally when content overflows.

#### Scenario: Sidebar visible and correctly inset

- GIVEN the demo app with the sidebar open
- WHEN the sidebar renders
- THEN it is inset 72px from the top and 72px from the bottom of the viewport

#### Scenario: Sidebar resize

- GIVEN the sidebar is open
- WHEN the left edge is dragged to change width
- THEN the sidebar width changes within 256–800px bounds

#### Acceptance Criteria

- [ ] Given the sidebar is open, it is inset 72px from the top and 72px from the bottom
- [ ] Given a resize drag, the sidebar width stays within 256–800px bounds
- [ ] Given a width change, the new width persists across page reloads

---

### Requirement: Sidebar Toolbar

The sidebar MUST be controlled by a **separate floating toolbar** positioned at the top-right of the canvas area (inset by `RULER_SIZE + 8px = 28px` from the right and top edges). This toolbar MUST use the same glass-morphism styling as the main toolbar (`rgba(28, 28, 28, 0.85)` + `backdrop-filter: blur(8px)`).

**Toolbar Structure:**

The toolbar MUST be a horizontal row of icon-only HeroUI `Button` components (`size="sm"`, `isIconOnly`) with `Tooltip` on hover. It MUST contain:

1. **Close button** (first position) — visible **only** when the sidebar is open. Uses the `X` (lucide-react) icon. Pressing it closes the sidebar. After the close button, a vertical divider line (`1px width, 18px height, var(--border) color`) MUST separate it from the tab buttons.

2. **Tab buttons** (4 buttons):

| Tab        | Icon (lucide-react) | Tooltip text | Disabled when       |
| ---------- | ------------------- | ------------ | ------------------- |
| Layers     | `Layers`            | Layers       | Never               |
| Properties | `Sliders`           | Properties   | No element selected |
| Animation  | `Workflow`          | Animation    | No element selected |
| Preflight  | `ShieldCheck`       | Pre-flight   | Never               |

**Active State:** The active tab button MUST use HeroUI `variant="primary"`. Inactive tab buttons MUST use `variant="ghost"`.

**Tab Toggle Behavior:** Clicking an inactive tab opens the sidebar to that tab. Clicking the already-active tab closes the sidebar (same as clicking the close button). See "Sidebar Tab Switching" requirement for full behavior.

#### Scenario: Sidebar toolbar renders at top-right

- GIVEN the demo app is loaded
- WHEN the sidebar toolbar renders
- THEN it floats at the top-right of the canvas (inset by 28px from right and top edges)

#### Scenario: Close button visibility

- GIVEN the sidebar is closed
- WHEN the sidebar toolbar renders
- THEN only the 4 tab buttons are visible (no close button)

#### Scenario: Close button appears when open

- GIVEN the sidebar is open
- WHEN the sidebar toolbar renders
- THEN the close button (X icon) appears as the first button, followed by a divider, then the tab buttons

#### Acceptance Criteria

- [ ] Given the demo app, the sidebar toolbar floats at the top-right with glass-morphism styling
- [ ] Given the sidebar is closed, the close button is not visible
- [ ] Given the sidebar is open, the close button is visible as the first toolbar button
- [ ] Given tab buttons, each is icon-only with a tooltip on hover
- [ ] Given the active tab, its button uses variant="primary"; others use variant="ghost"
- [ ] Given no element selected, Properties and Animation tab buttons are disabled

---

### Requirement: Sidebar Tab Switching

Clicking the active tab button in the sidebar toolbar MUST close the sidebar. Clicking an inactive tab button MUST open or switch to it. When no element is selected and the active tab is Properties or Animation, the sidebar MUST auto-switch to Layers.

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

A right-click context menu MUST be available on the canvas area, providing element-contextual actions. The browser's default context menu MUST be suppressed on the canvas area.

**When right-clicking an element:**

The context menu MUST display these actions in order. Actions MUST be enabled or disabled based on the current state:

| Action           | Shortcut label | Enabled when                               | Style  |
| ---------------- | -------------- | ------------------------------------------ | ------ |
| Cut              | Ctrl+X         | Element selected and not locked            |        |
| Copy             | Ctrl+C         | Element selected                           |        |
| Paste            | Ctrl+V         | Clipboard is non-empty                     |        |
| Duplicate        | Ctrl+D         | Element selected and not locked            |        |
| — separator —    |                |                                            |        |
| Delete           | Del            | Element selected, not locked, not required | danger |
| — separator —    |                |                                            |        |
| Bring to Front   |                | Element selected                           |        |
| Bring Forward    | ]              | Element selected and not already at front  |        |
| Send Backward    | [              | Element selected and not already at back   |        |
| Send to Back     |                | Element selected                           |        |
| — separator —    |                |                                            |        |
| Group            | Ctrl+G         | 2+ elements selected                       |        |
| Ungroup          | Ctrl+Shift+G   | Selected element(s) have a groupId         |        |
| — separator —    |                |                                            |        |
| Lock / Unlock    | Ctrl+L         | Element selected                           |        |
| Edit Clip Path   |                | Element has `clipPath` capability          |        |
| Edit Path Points |                | Element type is `path`                     |        |

**Delete** MUST use the HeroUI `color="danger"` variant, rendering the item in the theme's danger color (red text).

**Lock / Unlock** MUST display a dynamic label: "Lock" when the element is currently unlocked, "Unlock" when the element is currently locked.

**Group / Ungroup** MUST only be rendered (not just disabled) when 2+ elements are selected. They MUST be completely absent from the menu for single-element selections.

**When right-clicking empty canvas:**

The context menu MUST display only:

| Action | Shortcut label | Enabled when           |
| ------ | -------------- | ---------------------- |
| Paste  | Ctrl+V         | Clipboard is non-empty |

**Menu component:** The context menu MUST use a HeroUI `Dropdown` with `DropdownMenu` and `DropdownItem` components. Separator lines MUST use `DropdownSection` boundaries. Disabled items MUST use the `isDisabled` prop. Shortcut labels MUST be shown as `shortcut` prop on each item.

**Positioning:** The context menu MUST appear at the pointer coordinates, but MUST be clamped to remain fully visible within the canvas container. If the menu would overflow the right or bottom edge, it MUST reflow to stay within bounds.

**Dismiss behavior:** The context menu MUST close when an action is selected, when the user clicks outside the menu, or when the user presses Escape.

#### Scenario: Right-click on element opens context menu

- GIVEN an element selected on the canvas
- WHEN the user right-clicks the element
- THEN a context menu with element actions appears at the pointer position

#### Scenario: Right-click on empty canvas

- GIVEN no element under the pointer
- WHEN the user right-clicks on the canvas
- THEN a context menu with only the Paste action appears

#### Scenario: Cut removes and copies element

- GIVEN an element selected on the canvas
- WHEN the user selects "Cut" from the context menu
- THEN the element is removed from the page and placed in the clipboard

#### Scenario: Locked element disables destructive actions

- GIVEN a locked element selected on the canvas
- WHEN the user right-clicks
- THEN Cut, Duplicate, and Delete are disabled

#### Scenario: Layer reordering via context menu

- GIVEN elements [A, B, C] and B is selected
- WHEN the user selects "Bring to Front" from the context menu
- THEN the order becomes [A, C, B]

#### Scenario: Edit Clip Path opens clip-path editing

- GIVEN a rectangle element selected
- WHEN the user selects "Edit Clip Path" from the context menu
- THEN clip-path editing mode is entered for that element

#### Scenario: Edit Path Points opens path editing

- GIVEN a path element selected
- WHEN the user selects "Edit Path Points" from the context menu
- THEN path editing mode is entered for that element

#### Acceptance Criteria

- [ ] Given a right-click on a selected element, the context menu appears with all element actions
- [ ] Given a right-click on empty canvas, the context menu appears with only Paste
- [ ] Given a locked element, Cut, Duplicate, and Delete are disabled in the menu
- [ ] Given a required element, Delete is disabled in the menu
- [ ] Given Cut is selected, the element is removed and placed in the clipboard
- [ ] Given Copy is selected, the element is placed in the clipboard
- [ ] Given Paste is selected, the clipboard element is pasted onto the active page
- [ ] Given Duplicate is selected, a copy of the element is created
- [ ] Given a layer reorder action, the element z-order updates accordingly
- [ ] Given Group with 2+ elements selected, elements are grouped
- [ ] Given Ungroup with grouped elements, elements are ungrouped
- [ ] Given Lock/Unlock, the element's locked state toggles
- [ ] Given Edit Clip Path on an element with clipPath capability, clip-path editing activates
- [ ] Given Edit Path Points on a path element, path editing mode activates
- [ ] Given Delete item, it renders with danger color (red text)
- [ ] Given a locked element, Lock/Unlock label shows "Unlock"; given an unlocked element, it shows "Lock"
- [ ] Given a single element selected, Group and Ungroup are not rendered in the menu
- [ ] Given the menu would overflow the container edge, it repositions to stay within bounds
- [ ] Given clicking outside the menu or pressing Escape, the menu closes

---

### Requirement: Animation Bottom Toolbar

The bottom area of the canvas MUST host a single floating Animation toolbar that owns all animation controls. It MUST render as a HeroUI `Toolbar` centered horizontally near the bottom edge and MUST contain, in order: Play/Pause playback, Reset playback, and a timeline view toggle. Animation controls MUST NOT appear anywhere else in the shell — the primary (top) toolbar MUST NOT contain playback buttons, and the TimelineEditor panel MUST NOT render its own Play/Pause/Stop buttons.

**Toolbar Positioning:**

When the timeline panel is closed, the Animation toolbar MUST float at `bottom: FLOATING_OFFSET` (8px) from the viewport bottom. When the timeline panel is open, the toolbar MUST lift above the panel to `bottom: TIMELINE_BOTTOM_PANEL_HEIGHT_PX + FLOATING_OFFSET` so playback controls remain visible. The transition between the two positions MUST use the same `--transition-panel` token the panel itself uses so the two elements animate in sync. The toolbar MUST render above the panel's overlay z-layer (`zLayer('overlay') + 1`) so it is never occluded during the slide animation.

The Play/Pause and Reset buttons MUST operate on whichever playback context is currently active:

- When a timeline is open in the bottom panel, they MUST drive timeline playback (play the edited timeline, pause/stop it, reset to the start of that timeline).
- When no timeline is open, they MUST drive the document-level animation preview on the canvas.

The timeline view toggle MUST be disabled when no selected element has any timelines. When enabled and the panel is closed, activating it MUST open the first timeline of the selected element's animation config. When the panel is open, activating it MUST close the panel.

#### Scenario: Animation toolbar controls

- GIVEN the demo shell is loaded
- WHEN the canvas area renders
- THEN a floating toolbar is visible near the bottom-center with Play/Pause, Reset, and a timeline toggle button

#### Scenario: Timeline toggle enabled state

- GIVEN a selected element has at least one timeline
- WHEN the bottom toolbar renders
- THEN the timeline toggle is enabled; activating it opens the first timeline

#### Scenario: Playback controls defer to timeline context

- GIVEN a timeline is currently being edited
- WHEN the user presses Play in the bottom toolbar
- THEN timeline-scoped playback starts (not document-level animation preview)

#### Acceptance Criteria

- [ ] Given the demo shell loads, a floating Animation toolbar renders near the bottom-center with Play/Pause, Reset, and a timeline toggle
- [ ] Given no selected element with timelines, the timeline toggle is disabled
- [ ] Given a timeline is open, pressing Play calls the timeline playback handler (not document playback)
- [ ] Given a timeline is open, pressing Reset stops the timeline and resets its playhead to 0
- [ ] Given no timeline is open, pressing Play toggles document-level animation preview
- [ ] Given the primary toolbar, no Play/Pause or Reset playback buttons are present
- [ ] Given the TimelineEditor is open, no internal Play/Pause/Stop buttons are present inside it
- [ ] Given the timeline panel is open, the Animation toolbar lifts to sit above the panel so its buttons remain visible
- [ ] Given the Animation toolbar, its z-index is above the timeline panel's overlay layer

---

### Requirement: Timeline Panel

When a timeline is opened, the TimelineBottomPanel MUST render at the bottom of the viewport, flush with the bottom edge but inset on the left and right by `TIMELINE_BOTTOM_PANEL_SIDE_INSET_PX` (16px). This gives the panel visibly distinct breathing room on both sides so it reads as a contained floating panel rather than a full-width strip, even though its underlying chrome layer shares the same floating-toolbar origin.

**Timeline Panel Positioning:**

| Property        | Value                                       |
| --------------- | ------------------------------------------- |
| `position`      | `fixed`                                     |
| `bottom`        | `0`                                         |
| `left`          | `16px` (`TIMELINE_BOTTOM_PANEL_SIDE_INSET_PX`) |
| `right`         | `16px` (`TIMELINE_BOTTOM_PANEL_SIDE_INSET_PX`) |
| Default height  | `240px`                                     |
| `z-index`       | Above canvas overlays (e.g., `8000`)        |
| `background`    | `var(--surface)`                            |
| `border`        | `1px solid var(--border)`, no bottom border |
| `border-radius` | Top corners only (bottom flush with edge)   |
| `box-shadow`    | `var(--overlay-shadow)`                     |

When closed, the panel MUST be off-screen via `translateY(100%)` with `pointer-events: none`. When open, it MUST slide to `translateY(0)` using the `--transition-panel` token.

#### Scenario: Timeline panel appears when editing

- GIVEN a timeline is opened for editing
- WHEN the panel renders
- THEN the TimelineBottomPanel is visible at the bottom with 16px side insets

#### Scenario: Timeline panel side insets

- GIVEN a timeline is opened for editing
- WHEN the panel renders
- THEN it is fixed at the bottom with `left: 16px` and `right: 16px`

#### Acceptance Criteria

- [ ] Given a timeline being edited, the TimelineBottomPanel is visible at the bottom
- [ ] Given the timeline panel is open, it is fixed-positioned at `bottom: 0`, `left: 16px`, `right: 16px`
- [ ] Given the timeline panel, its default height is 240px
- [ ] Given the timeline panel is open, only its top corners are rounded

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

### Requirement: Scene Sorter Position

The scene sorter MUST float in the canvas area below the element toolbar, at the top-left. It MUST use glass-morphism styling consistent with the toolbars. It MUST NOT be placed in the bottom bar or the sidebar.

#### Scenario: Scene sorter visible

- GIVEN a multi-scene document
- WHEN the canvas area renders
- THEN the scene sorter floats at the top-left below the element toolbar

#### Acceptance Criteria

- [ ] Given a multi-scene document, the scene sorter floats at the top-left of the canvas area

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

- [x] **Floating Main Toolbar — save button visibility:** Automated demo shell tests verify the File menu omits `Save` when `onSave` is not configured (`packages/demo/src/demo-app.chrome-and-menu.test.tsx`).
- [x] **Native file input exception:** The layout spec now explicitly documents the hidden native file input bridge used for import flows (`packages/demo/src/demo-app/layout.tsx`).

---

## Layout Diagram

For reference, the overall app layout MUST follow this spatial arrangement:

```
┌──┬──────────────────────────────────────────────────────┐
│▪ │  [Horizontal Ruler — top edge, 20px]                 │
├──┤──────────────────────────────────────────────────────┤
│  │  [Main Toolbar]  (glass, floating   [Sidebar Toolbar]│
│V │      top-left)                      (glass, floating │
│e │  [Element Toolbar] (vertical,        top-right, icon │
│r │      below main toolbar)             buttons+close)  │
│t │                                                      │
│i │  ┌──────┐                                ┌──────────┐│
│c │  │ Page │   Canvas Area                  │ Sidebar  ││
│a │  │Sorter│   (fills remaining space)      │ Drawer   ││
│l │  │(float│                                │ (right,  ││
│  │  │ below│                                │ 72px top ││
│R │  │ elem │                                │ & bottom ││
│u │  │ tlbr)│                                │ inset,   ││
│l │  └──────┘                                │ opaque)  ││
│e │                                          └──────────┘│
│r │  [Placement Banner]  (top-center, conditional)       │
│  │                                                      │
│20│  ┌──────────────────────────────────────────────────┐│
│px│  │ Timeline Bottom Panel  (fixed bottom,            ││
│  │  │  left:28px, right:28px, slides up when editing)  ││
│  │  └──────────────────────────────────────────────────┘│
└──┴──────────────────────────────────────────────────────┘
      ← 28px →                                  ← 28px →
      (ruler+gap insets)
```

**Layout Constants:**

| Constant      | Value  | Usage                                                         |
| ------------- | ------ | ------------------------------------------------------------- |
| `RULER_SIZE`  | `20px` | Thickness of horizontal and vertical rulers                   |
| Ruler gap     | `8px`  | Space between ruler and adjacent floating panels              |
| Toolbar inset | `28px` | `RULER_SIZE + gap` — toolbar/timeline offset from edges       |
| Sidebar inset | `72px` | `RULER_SIZE + gap + toolbar + gap` — sidebar top/bottom inset |

```

---

## Non-Goals

- Canvas rendering internals → see `project/spec/editor/canvas.md`
- Toolbar component behavior → see `project/spec/ui/toolbar-nav.md`
- Sidebar panel component behavior → see `project/spec/ui/panels.md`
- Timeline editor component → see `project/spec/ui/timeline.md`
```
