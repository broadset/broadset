# UI Specification

## Purpose

Defines the React-based editor UI for broadset. The ui package provides property panels, modals, sidebars, toolbar, context menu, timeline editor, and utility hooks/parsers that drive the editor store. It does NOT own document state (that's the editor domain), render the canvas (renderer domain), or compute animations (playback domain). See [conventions](../../README.md).

---

## Sub-Specs

| Sub-Spec                         | Scope                                                                           |
| -------------------------------- | ------------------------------------------------------------------------------- |
| [panels.md](panels.md)           | Property sidebars, box effects, clip-path, preflight, animation sidebar, layers |
| [modals.md](modals.md)           | About, canvas settings, export, media library, new document, shortcut help      |
| [toolbar-nav.md](toolbar-nav.md) | Toolbar, context menu, element library, scene sorter                            |
| [timeline.md](timeline.md)       | Timeline editor, bottom panel, editing context                                  |
| [inputs.md](inputs.md)           | Color picker, CSS length, text stroke, filter editor, shadow editor inputs      |
| [utilities.md](utilities.md)     | CSS value parsers, animation binding helpers, keyframe value hooks, wheel input |

---

## Design Token System

The UI package MUST expose a design token set that all components consume for consistent spacing, color, and typography. Host applications MAY override token values via CSS custom properties.

### Spacing Scale

An 8px-base spacing scale MUST be used for all padding, margin, and gap values. Token names use a two-digit suffix corresponding to the multiplier:

| Token   | Value    | Typical use                    |
| ------- | -------- | ------------------------------ |
| `sp-01` | 0.125rem | Micro gaps (e.g., icon–text)   |
| `sp-02` | 0.25rem  | Tight inline spacing           |
| `sp-03` | 0.5rem   | Default component padding      |
| `sp-04` | 0.75rem  | Section padding                |
| `sp-05` | 1rem     | Panel section gaps             |
| `sp-06` | 1.5rem   | Major section dividers         |
| `sp-07` | 2rem     | Large panel padding            |
| `sp-08` | 2.5rem   | Toolbar height reference       |
| `sp-09` | 3rem     | Reserved for oversized spacing |

### Color Tokens

All colors MUST reference CSS custom properties so the host can override them. The following semantic tokens MUST be defined:

| Token                 | Default (dark)           | Purpose                          |
| --------------------- | ------------------------ | -------------------------------- |
| `--foreground`        | light text               | Primary text color               |
| `--muted`             | dimmed text              | Secondary / helper text          |
| `--surface`           | dark panel background    | Opaque panel backgrounds         |
| `--surface-secondary` | slightly lighter surface | Nested containers, tab bars      |
| `--surface-tertiary`  | lighter again            | Active tabs, layer highlights    |
| `--border`            | subtle divider           | Panel borders, separators        |
| `--accent`            | brand blue               | Focus rings, interactive borders |
| `--danger`            | red                      | Error text, destructive actions  |
| `--success`           | green                    | Success alerts, preflight pass   |
| `--field-background`  | input field bg           | Form field backgrounds           |
| `--focus`             | brand blue               | Focus ring color                 |

Disabled text MUST use `--muted` at reduced opacity. Selected layer rows MUST use `--surface-secondary`. Active tab backgrounds MUST use `--surface-tertiary`.

### Typography Scale

| Token          | Size     | Use                           |
| -------------- | -------- | ----------------------------- |
| `label`        | 0.75rem  | Compact field labels          |
| `body-compact` | 0.875rem | Panel text, accordion headers |
| `heading-sm`   | 0.875rem | Section headings (bold)       |
| `heading-md`   | 1rem     | Panel titles, modal headings  |

### Glass-Morphism Tokens

Floating panels (toolbar, sidebar, modals) MUST apply glass-morphism using these tokens:

| Token              | Default                         | Purpose                |
| ------------------ | ------------------------------- | ---------------------- |
| `--glass-bg`       | dark background at ~85% opacity | Semi-transparent fill  |
| `--glass-blur`     | medium blur radius              | Backdrop blur amount   |
| `--overlay-shadow` | subtle dark drop shadow         | Panel elevation shadow |

Exact values are implementation details, but the visual effect MUST be: content behind floating panels is visible but blurred, with a subtle shadow separating the panel from the canvas.

### Transition Tokens

UI transitions MUST use consistent durations:

| Token                 | Duration | Easing | Use                               |
| --------------------- | -------- | ------ | --------------------------------- |
| `--transition-fast`   | short    | ease   | Tab selection, hover states       |
| `--transition-panel`  | moderate | ease   | Sidebar slide, bottom panel slide |
| `--transition-resize` | short    | ease   | Resize handle hover feedback      |

---

## Non-Goals

- Document model types → see `project/spec/model/spec.md`
- Animation engine → see `project/spec/playback/spec.md`
- DOM rendering → see `project/spec/renderer/spec.md`
- Editor state management → see `project/spec/editor/spec.md`
- Export format logic → see `project/spec/formats/spec.md`

---

## Functional Test Requirements (Playwright CT)

Unit tests verify rendering output and callback wiring in isolation. The following UI interactions involve user input flows, focus management, and cross-component state that **cannot** be fully verified by unit tests alone. Each MUST have at least one Playwright Component Test (CT) that exercises the real behavior in a browser.

Every spec scenario where a user action in one UI region produces a visible outcome in a **different** region MUST also have a CT test that verifies all affected regions. See `agents/instructions/testing.instructions.md` → "CT Derivation Rule" for the systematic method and the full derivation procedure. The lists below are representative — the full set MUST be derived by scanning all GIVEN/WHEN/THEN blocks in the UI sub-specs.

### Toolbar and navigation

- [ ] **Undo/redo button states:** Undo MUST be disabled when history is empty; redo MUST be disabled when there is nothing to redo.
- [ ] **Element placement flow:** Clicking an element type in the toolbar MUST enter placement mode; clicking the canvas MUST create the element.
- [ ] **Scene sorter interaction:** Clicking a scene tab MUST switch the active scene; reordering tabs MUST update scene order.

### Property panels

- [ ] **Multi-element editing:** Selecting multiple elements MUST show common property values; differing values MUST show a "Mixed" indicator; editing a field MUST apply to all selected elements.
- [ ] **Layer rename:** Double-clicking a layer name MUST activate inline editing; Enter MUST commit; Escape MUST cancel; empty names MUST be rejected.

### Timeline

- [ ] **Keyframe drag:** Dragging a keyframe marker MUST reposition it to a new time offset with visual feedback during drag.
- [ ] **Keyframe deletion:** Pressing Delete on a selected keyframe MUST remove it by stable ID; deleting the last keyframe MUST remove the now-empty property track without changing unrelated tracks or the owning sequence.

### Modals

- [ ] **Focus trapping:** Opening a modal MUST trap focus within it; closing MUST restore focus to the trigger element.
- [ ] **Escape to close:** Pressing Escape inside any modal MUST close it.

### Accessibility (WCAG AA)

- [ ] **Toolbar keyboard navigation:** The toolbar MUST have `role="toolbar"`; arrow keys MUST move focus between buttons; icon-only buttons MUST have `aria-label`.
- [ ] **Input ARIA attributes:** All custom inputs MUST have `aria-label` or associated labels; error states MUST set `aria-invalid`.
- [ ] **Panel accordion state:** Collapsible panels MUST set `aria-expanded` correctly and be operable via keyboard.

These are acceptance gates — a feature is not shippable until its corresponding CT test passes. Spec gap entries in individual sub-specs that say "requires CT" or "component tests needed" reference this list.
