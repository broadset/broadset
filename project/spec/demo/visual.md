# Demo — Visual Design and Theming Specification

## Purpose

Defines the visual design contracts for the demo application: dark theme with glass-morphism, consistent iconography, and responsive canvas layout. These are the visual presentation requirements that make the demo a polished, usable product. See [conventions](../../README.md).

---

## Requirements

### Requirement: Dark Theme

The demo MUST use a dark color scheme. Floating panels (toolbar, sidebar, modals) MUST use glass-morphism styling with semi-transparent backgrounds and backdrop blur.

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

Element types, sidebar tabs, and toolbar actions MUST use consistent iconography. Each built-in element type MUST have a distinct icon. Toolbar action buttons (save, export, import, new, settings, debug) MUST have icons. Custom component plugins MAY provide their own icon via the plugin configuration.

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

## Non-Goals

- Canvas zoom/pan behavior → see `project/spec/editor/canvas.md`
- Color palette and font configuration → see [config.md](config.md)
- Sidebar panel content and behavior → see `project/spec/ui/panels.md`
