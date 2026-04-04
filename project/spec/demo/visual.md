# Demo — Visual Design and Theming Specification

## Purpose

Defines the visual design contracts for the demo application: dark theme with glass-morphism, consistent iconography, and responsive canvas layout. These are the visual presentation requirements that make the demo a polished, usable product. See [conventions](../../README.md).

---

## Requirements

### Requirement: Dark Theme

The demo MUST use a dark color scheme. Floating panels (toolbar, sidebar, modals) MUST use glass-morphism styling with semi-transparent backgrounds and backdrop blur.

**Glass-Morphism Application:**

The following components MUST apply glass-morphism:

| Component        | Treatment                                                                     |
| ---------------- | ----------------------------------------------------------------------------- |
| Floating toolbar | Semi-transparent dark bg, backdrop blur, bottom border                        |
| Element toolbar  | Same as floating toolbar                                                      |
| Sidebar drawer   | Semi-transparent dark bg, backdrop blur, left border-radius, elevation shadow |
| Page sorter      | Semi-transparent dark bg, backdrop blur                                       |
| Bottom panel     | Semi-transparent dark bg, backdrop blur, top border-radius                    |
| Modal overlays   | Semi-transparent dark bg, backdrop blur                                       |

Non-floating surfaces (e.g., accordion panels within the sidebar, property fields) MUST use opaque `--surface` backgrounds — glass-morphism applies only to top-level floating containers.

**Color Scheme:**

The demo MUST apply HeroUI's built-in dark theme via the `dark` class on the root HTML element. All UI components MUST inherit dark theme colors automatically. The canvas background MUST be visually distinct from the surrounding dark UI chrome — slightly lighter or a different hue to clearly delineate the editing area.

**Touch and Gesture Prevention:**

The demo MUST block multi-touch gestures and pinch-to-zoom on the document level to prevent browser zoom interfering with canvas zoom/pan (see `state.md` for implementation details).

#### Scenario: Glass-morphism panels

- GIVEN the demo application renders
- WHEN floating panels (toolbar, sidebar) are visible
- THEN panels have semi-transparent backgrounds with backdrop blur effects

#### Scenario: Dark background

- GIVEN the demo application renders
- WHEN the viewport background is displayed
- THEN the background uses a dark color scheme distinguishable from the canvas area

#### Scenario: Contrast with canvas

- GIVEN the dark theme is active
- WHEN the canvas area renders
- THEN the canvas background is visually distinct from the surrounding dark UI

#### Acceptance Criteria

- [ ] Given floating panels, they display with semi-transparent backgrounds and backdrop blur
- [ ] Given the viewport, the background uses a dark color scheme
- [ ] Given the canvas area, it is visually distinct from the surrounding dark UI chrome

---

### Requirement: Icon System

Element types, sidebar tabs, and toolbar actions MUST use consistent iconography from `lucide-react`. Each built-in element type MUST have a distinct icon. Toolbar action buttons (save, export, import, new, settings, debug) MUST have icons. Custom component plugins MAY provide their own icon via the plugin configuration. All toolbar and element toolbar buttons MUST be icon-only (`isIconOnly`) with an `aria-label` describing the action. The button label text MUST be shown as an auto-positioned tooltip (via HeroUI `Tooltip`).

**Element Type Icon Mapping:**

| Type      | lucide-react icon | Notes                      |
| --------- | ----------------- | -------------------------- |
| text      | `Type`            |                            |
| image     | `Image`           |                            |
| rectangle | `Square`          |                            |
| ellipse   | `Circle`          |                            |
| path      | `PenTool`         |                            |
| svg       | `FileCode2`       |                            |
| qrcode    | `QrCode`          |                            |
| group     | `Folder`          |                            |
| (custom)  | Plugin-provided   | Falls back to default icon |

**Toolbar Action Icon Mapping:**

Toolbar action buttons MUST each have a distinct icon from `lucide-react`. The specific icon per action is an implementation choice, but each action MUST be visually distinguishable from others.

#### Scenario: Element type icons

- GIVEN the element toolbar renders
- WHEN all built-in element types are listed
- THEN each type (text, image, svg, path, rectangle, ellipse, qrcode, group) has a distinct icon

#### Scenario: Toolbar action icons

- GIVEN the floating toolbar renders
- WHEN action buttons are displayed
- THEN each action (save, export, import, new, settings, debug) has a corresponding icon

#### Scenario: Plugin icon fallback

- GIVEN a custom component plugin without an icon configured
- WHEN the plugin button renders in the element toolbar
- THEN a default fallback icon is used

#### Acceptance Criteria

- [ ] Given built-in element types, each type has a distinct icon in the element toolbar
- [ ] Given toolbar actions, each action button has a corresponding icon
- [ ] Given a plugin without an icon, a default fallback icon is used
- [ ] Given any toolbar or element toolbar button, it is icon-only with an aria-label
- [ ] Given hovering over an icon-only button, a tooltip with the action name appears

---

### Requirement: Responsive Canvas

The canvas MUST fill all available space between the toolbars and sidebar. The canvas MUST respond to window resize events, recalculating available space. The canvas area MUST NOT cause page-level scrollbars.

#### Scenario: Canvas fills available space

- GIVEN the app shell renders with toolbar and sidebar
- WHEN the canvas area is measured
- THEN it occupies all remaining horizontal and vertical space

#### Scenario: Window resize

- GIVEN the application is displayed
- WHEN the browser window is resized
- THEN the canvas area adjusts to fill the new available space

#### Scenario: No page scroll

- GIVEN the application renders at any viewport size
- WHEN the layout is inspected
- THEN no page-level scrollbars appear (canvas scrolling is handled internally via zoom/pan)

#### Acceptance Criteria

- [ ] Given the app shell, the canvas fills all space not occupied by toolbars and sidebar
- [ ] Given a window resize, the canvas area adjusts to the new available space
- [ ] Given any viewport size, no page-level scrollbars appear

---

## Spec Gaps

_None — all requirements have acceptance criteria._

---

### Requirement: UI Transitions and Animations

All panel open/close animations MUST use consistent transition timing from the design token system (see `project/spec/ui/spec.md` → Transition Tokens). Specifically:

| Transition                | Token                 | Easing |
| ------------------------- | --------------------- | ------ |
| Sidebar drawer open/close | `--transition-panel`  | ease   |
| Bottom panel slide        | `--transition-panel`  | ease   |
| Tab selection highlight   | `--transition-fast`   | ease   |
| Hover state changes       | `--transition-fast`   | ease   |
| Resize handle feedback    | `--transition-resize` | ease   |

Transitions MUST NOT play when restoring state from localStorage on initial load — panels should appear in their saved state immediately without animation.

#### Scenario: Sidebar slide animation

- GIVEN the sidebar is closed
- WHEN the user clicks a sidebar tab
- THEN the sidebar slides in from the right with an eased transition

#### Acceptance Criteria

- [ ] Given panel open/close, transitions use consistent token-based durations
- [ ] Given initial load with saved state, panels appear immediately without animation

---

### Requirement: State-Driven UI Visibility

UI elements MUST respond to application state changes with clear visual feedback:

| State                       | UI Effect                                                                               |
| --------------------------- | --------------------------------------------------------------------------------------- |
| No element selected         | Properties sidebar shows empty-state message; Animation sidebar shows empty state       |
| Animations feature disabled | Animation sidebar shows "Animations are disabled" message                               |
| Element locked              | Property fields rendered as disabled / non-interactive; animation builder dimmed        |
| No timeline open            | Bottom panel hidden (off-screen, pointer-events disabled)                               |
| Keyframe editing active     | Property fields show include/exclude toggle buttons; excluded fields at reduced opacity |
| Multi-select (2+)           | Alignment and Group/Ungroup buttons enabled in toolbar                                  |
| Multi-select (3+)           | Distribute buttons also enabled                                                         |
| Placement mode active       | Element library button highlighted; cursor set to crosshair on canvas; banner visible   |

#### Scenario: Locked element dims properties

- GIVEN a locked element is selected
- WHEN the properties sidebar renders
- THEN all property fields are visually disabled

#### Acceptance Criteria

- [ ] Given no element selected, the properties sidebar shows an empty-state message
- [ ] Given a locked element, property fields are visually disabled
- [ ] Given placement mode active, the corresponding element library button is highlighted

---

## Non-Goals

- Canvas zoom/pan behavior → see `project/spec/editor/canvas.md`
- Color palette and font configuration → see [config.md](config.md)
- Sidebar panel content and behavior → see `project/spec/ui/panels.md`
