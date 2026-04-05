# UI — Panels Specification

## Purpose

Defines the behavioral requirements for editor property panels and sidebars: the properties sidebar, box effects panel, clip-path panel, preflight panel, animation sidebar, animation builder, property field, and layers sidebar.

---

## Requirements

### Requirement: Properties Sidebar Rendering

The system MUST render the selected element from the native document. In screen mode, gradient fill switcher MUST be visible for rectangle elements. In print mode, gradient fill and 3D transform controls MUST be hidden. When a component registry provides a custom property panel for an element type, it MUST be rendered. When `showAnimations` is false, the animation builder MUST be hidden.

**Panel Ordering:**

The Properties sidebar MUST present accordion sections in this order. Each section MUST use a HeroUI `Accordion` panel with an icon next to the section title. Sections MUST only appear when relevant to the selected element type and document mode:

| #   | Section           | Shown for                           | Hidden in print mode |
| --- | ----------------- | ----------------------------------- | -------------------- |
| 1   | Geometry          | All elements                        | 3D fields only       |
| 2   | Appearance        | All elements                        | Gradient fill        |
| 3   | Typography        | Text elements                       | No                   |
| 4   | Text Effects      | Text elements                       | No                   |
| 5   | Spacing           | Text and group elements             | No                   |
| 6   | Box Effects       | All elements                        | Partially            |
| 7   | Clip Path         | Elements with `clipPath` capability | No                   |
| 8   | Path Properties   | Path and SVG elements               | No                   |
| 9   | Image             | Image elements                      | No                   |
| 10  | Object Fit        | Elements with objectFit capability  | No                   |
| 11  | QR Code           | QR code elements                    | No                   |
| 12  | Group             | Group elements                      | No                   |
| 13  | Animation Builder | All elements (if enabled)           | No                   |
| 14  | Custom Panel      | Custom plugin types                 | No                   |

**Empty State:**

When no element is selected, the Properties sidebar MUST show a "Select an element to edit its properties" message centered in the panel area.

#### Scenario: Gradient fill in screen mode

- GIVEN a rectangle element selected in screen mode
- WHEN the properties sidebar renders
- THEN the gradient fill switcher is visible

#### Scenario: Print mode hides advanced controls

- GIVEN print document mode
- WHEN the properties sidebar renders
- THEN gradient fill, 3D transforms, and clip children controls are hidden

#### Scenario: Custom property panel rendered

- GIVEN a registry with a property panel for type `countdown`
- WHEN an element of that type is selected
- THEN the custom property panel is rendered

#### Acceptance Criteria

- [ ] Given a rectangle element selected in screen mode, the gradient fill switcher is visible
- [ ] Given print document mode, gradient fill, 3D transforms, and clip children controls are hidden
- [ ] Given a registry with a property panel for type `countdown`, the custom property panel is rendered

---

### Requirement: Animation Mode Properties

When a keyframe is selected, the system MUST render an AnimationModePropertiesPanel wrapped in a PropertyEditingProvider. Geometry and Typography panels MUST be rendered for text elements. Animation Builder and Group Settings MUST NOT render in animation mode.

The PropertyEditingProvider MUST expose a keyframe property adapter that routes property edits to keyframe values instead of element values. The adapter contract:

- `isIncluded(key)` — returns whether the property is part of this keyframe.
- `getValue(key)` — returns the current keyframe value for the property.
- `toggleProperty(key, included, defaultValue)` — adds or removes a property from the keyframe.
- `updateValue(key, value)` — sets the keyframe value for the property.

When the adapter is active (keyframe selected):

- Properties included in the keyframe MUST be editable and route changes to `updateValue`.
- Properties NOT included MUST render as disabled (read-only, showing the element's base value).
- Each property MUST show an include/remove toggle button.

When no adapter is active (normal mode), all properties route to element updates.

#### Scenario: Keyframe selected enters animation mode

- GIVEN a selected keyframe
- WHEN the sidebar renders
- THEN AnimationModePropertiesPanel is shown with PropertyEditingProvider

#### Scenario: Included property routes to keyframe

- GIVEN a keyframe with `x` included at value `100`
- WHEN the user changes `x` to `200`
- THEN the adapter's `updateValue('x', '200')` is called (not the element update)

#### Scenario: Excluded property is disabled

- GIVEN a keyframe that does not include `opacity`
- WHEN the property panel renders
- THEN `opacity` shows the element's base value and is disabled

#### Acceptance Criteria

- [ ] Given a selected keyframe, AnimationModePropertiesPanel is shown with PropertyEditingProvider
- [ ] Given a keyframe with a property included, editing routes to the adapter's updateValue
- [ ] Given a keyframe without a property included, the property renders as disabled with the element's base value
- [ ] Given a property toggle to include, toggleProperty is called with included=true and the element's current value as default

---

### Requirement: Box Effects Panel

The system MUST render compositing helper text and controls (mixBlendMode, isolation) in screen mode. Print mode without relevant style properties MUST hide the panel.

**Fields:**

| Field           | Input type    | Notes                                                                     |
| --------------- | ------------- | ------------------------------------------------------------------------- |
| Box shadow      | ShadowEditor  | Offset X/Y, blur, spread, color, inset toggle; multi-layer                |
| Filter          | FilterEditor  | Stack of CSS filter functions (blur, brightness, etc.)                    |
| Backdrop filter | FilterEditor  | Same filter set, applied as CSS `backdrop-filter`                         |
| Mix blend mode  | HeroUI Select | All standard blend modes (see Appearance Panel blend list)                |
| Isolation       | HeroUI Select | auto / isolate                                                            |
| Border style    | HeroUI Select | solid / dashed / dotted / double / groove / ridge / inset / outset / none |

The panel MUST use HeroUI `Accordion` sections to group shadow, filter, backdrop-filter, and compositing controls.

#### Scenario: Screen mode compositing controls

- GIVEN screen document mode
- WHEN box effects panel renders
- THEN compositing controls are visible

#### Acceptance Criteria

- [ ] Given screen document mode, compositing controls are visible

---

### Requirement: Clip-Path Panel

The Clip Path accordion section MUST only appear when the selected element has the `clipPath` capability flag enabled (rectangle, ellipse, image, svg, group). It MUST NOT appear for text, path, or qrcode elements.

The panel MUST show the current mask type and provide controls for selecting and editing clip-path shapes.

**Preset Clip Shapes:**

The panel MUST provide a selector with built-in clip-path presets:

| Preset   | Generated clip-path           |
| -------- | ----------------------------- |
| None     | removes clip-path             |
| Circle   | `circle(50%)`                 |
| Squircle | smooth rounded-rectangle path |
| Triangle | 3-point polygon               |
| Star     | 5-point star polygon          |
| Custom   | opens visual clip-path editor |

Selecting a preset MUST immediately apply the clip-path to the element's `customClipPath` screen property, set `maskType` to `'custom'` (or `'none'` for the None preset), and update the canvas in real time.

**Custom Clip-Path Editor Widget:**

When the user selects the "Custom" preset or clicks "Edit Clip Path" on an element already using a custom clip-path, the system MUST enter clip-path editing mode. This mode MUST:

1. **Show a start/stop toggle** — a Button in the panel to enter and exit editing mode. When editing starts, if the clip-path is empty, a default rectangular path (matching the element bounds) MUST be seeded.
2. **Render an SVG overlay on the canvas** — an interactive clip-path outline drawn on top of the selected element, showing:
   - **Anchor handles** (filled circles) at each control point of the clip-path polygon/path
   - **Midpoint handles** (smaller, hollow circles) on each edge segment, for inserting new points
   - The clip-path outline itself as a semi-transparent stroke
3. **Support handle drag** — dragging an anchor handle MUST update the corresponding clip-path coordinate in real time (ephemeral updates). On mouseup, the change MUST be committed to the store.
4. **Support point insertion** — clicking a midpoint handle MUST insert a new anchor point at that position and enter drag mode for it immediately.
5. **Support point deletion** — double-clicking an anchor handle (or pressing Delete with a handle focused) MUST remove that point from the clip-path. A clip-path MUST retain at least 3 points.
6. **Raw CSS input** — the panel MUST also provide a text input field showing the raw `customClipPath` CSS value. Editing this field MUST validate the input and apply it live. Invalid values MUST show a validation error and not be committed.
7. **Coordinate system** — all handle coordinates MUST be in element-relative percentages (0%–100%), matching CSS clip-path conventions.
8. **Exit behavior** — clicking outside the element, selecting a different element, or pressing Escape MUST exit clip-path editing mode and commit any pending changes.

#### Scenario: Start editing seeds default path

- GIVEN an element with an empty clip-path
- WHEN clip-path editing starts
- THEN a default rectangular path is seeded matching the element bounds

#### Scenario: Preset applies immediately

- GIVEN a rectangle element selected
- WHEN the "Circle" preset is selected in the Clip Path panel
- THEN `maskType` is set to `'custom'` and `customClipPath` is set to `circle(50%)`

#### Scenario: Handle drag updates clip-path

- GIVEN clip-path editing mode is active with a polygon clip-path
- WHEN the user drags an anchor handle
- THEN the clip-path updates in real time on the canvas

#### Scenario: Point insertion via midpoint handle

- GIVEN clip-path editing mode is active with a triangle (3 points)
- WHEN the user clicks a midpoint handle
- THEN a new point is inserted at the midpoint, creating a 4-point polygon

#### Scenario: Point deletion minimum enforced

- GIVEN clip-path editing mode with exactly 3 points
- WHEN the user attempts to delete a point
- THEN the deletion is rejected (minimum 3 points)

#### Scenario: Raw CSS input validation

- GIVEN clip-path editing mode is active
- WHEN the user types `polygon(50% 0%, 100% 100%, 0% 100%)` in the raw input
- THEN the clip-path is applied and the canvas overlay updates

#### Scenario: Invalid raw input shows error

- GIVEN clip-path editing mode is active
- WHEN the user types `not-valid-css` in the raw input
- THEN a validation error is shown and the clip-path is not changed

#### Scenario: None preset removes clip-path

- GIVEN an element with a custom clip-path applied
- WHEN the "None" preset is selected
- THEN `maskType` is set to `'none'` and `customClipPath` is cleared

#### Acceptance Criteria

- [ ] Given an element with an empty clip-path, a default rectangular path is seeded matching element bounds
- [ ] Given a preset selection (Circle, Triangle, Star, Squircle), the clip-path is applied immediately to the element
- [ ] Given the None preset, maskType is set to 'none' and customClipPath is cleared
- [ ] Given clip-path editing mode, anchor handles are rendered on the canvas overlay at each control point
- [ ] Given a handle drag, the clip-path updates in real time
- [ ] Given a midpoint handle click, a new point is inserted into the clip-path
- [ ] Given a point deletion attempt with > 3 points, the point is removed
- [ ] Given a point deletion attempt with exactly 3 points, the deletion is rejected
- [ ] Given valid raw CSS input, the clip-path is applied and canvas overlay updates
- [ ] Given invalid raw CSS input, a validation error is shown
- [ ] Given exit actions (Escape, click-outside, selection change), editing mode exits and changes are committed

---

### Requirement: Preflight Panel

The system MUST render a success notification when there are no issues. When issues exist, they MUST be rendered in a structured list with severity types. Success notification MUST NOT appear when issues exist.

#### Scenario: No issues shows success

- GIVEN zero preflight issues
- WHEN the panel renders
- THEN a success notification is displayed

#### Scenario: Issues rendered with severity

- GIVEN multiple issues with different severities
- WHEN the panel renders
- THEN all issues are shown in the structured list

#### Acceptance Criteria

- [ ] Given zero preflight issues, a success notification is displayed
- [ ] Given multiple issues with different severities, all issues are shown in the structured list

---

### Requirement: Animation Sidebar

The system MUST render the animation builder when an element is selected and animations are enabled. Empty state MUST be shown when no element is selected. Disabled state MUST be shown when animation feature is off. Lock helper text MUST appear when the selected element is locked.

**Header:**

The sidebar MUST display the active element's name and a type chip (HeroUI `Chip`). If the element is locked, a lock icon and helper text MUST appear, and the animation controls below MUST be dimmed / non-interactive.

**Animation Builder Accordion Sections:**

The animation builder MUST be organized as a HeroUI `Accordion` with these sections:

| Section                    | Content                                                                                                                                                                                                                                                  |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Active States & Modifiers  | State selector dropdown (None, Enter, Exit, custom states); modifier checkboxes for each defined modifier (independent toggles)                                                                                                                          |
| Timelines                  | List of timelines for the element, each with: Edit button (opens TimelineEditor in bottom panel), Rename, Duplicate, Delete actions. "Add Timeline" button creates a new timeline. "Quick setup" button creates Enter/Exit animations with preset values |
| State Timeline Bindings    | Maps states to timelines. State selector + timeline selector per binding. "Add binding" button links a timeline to a state                                                                                                                               |
| Modifier Timeline Bindings | Maps modifiers to timelines. Modifier selector + in/out timeline pair. "Add/remove binding" buttons                                                                                                                                                      |

#### Scenario: Element selected with animations on

- GIVEN an element selected and animation feature enabled
- WHEN the sidebar renders
- THEN the animation builder is visible

#### Scenario: Locked element shows helper text

- GIVEN a locked element selected
- WHEN the sidebar renders
- THEN lock helper text is displayed

#### Acceptance Criteria

- [ ] Given an element selected and animation feature enabled, the animation builder is visible
- [ ] Given a locked element selected, lock helper text is displayed

---

### Requirement: Animation Builder Resilience

The system MUST NOT crash when animation config is partial or malformed.

#### Scenario: Partial config does not crash

- GIVEN a malformed animation config
- WHEN the builder renders
- THEN no error is thrown

#### Acceptance Criteria

- [ ] Given a malformed animation config, no error is thrown

---

### Requirement: Property Field Keyframe Integration

In normal mode, the system MUST render children directly. In keyframe mode, the system MUST show include/remove buttons. Including a property MUST call `toggleProperty(key, true, defaultValue)`. Removing MUST call `toggleProperty(key, false, defaultValue)`.

#### Scenario: Normal mode renders children

- GIVEN no keyframe mode
- WHEN PropertyField renders
- THEN children are rendered directly

#### Scenario: Keyframe include/remove

- GIVEN keyframe mode active
- WHEN include/remove buttons are clicked
- THEN toggleProperty is called with correct arguments

#### Acceptance Criteria

- [ ] Given no keyframe mode, children are rendered directly
- [ ] Given keyframe mode active, toggleProperty is called with correct arguments

---

### Requirement: Layers Sidebar

The system MUST render element names from the document. Empty state MUST be shown when no elements exist. Clicking a layer MUST fire setActiveElement. Lock button MUST toggle lock. Visibility toggle MUST update element classes. Delete button MUST remove the element.

**Layer Row Structure:**

Each layer row MUST display:

| Zone            | Content                                                                                                                                                                                                                      |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Left icon       | Element type icon (distinct per type: text → Type, image → Image, rectangle → Square, ellipse → Circle, path → PenTool, svg → FileCode2, qrcode → QrCode, group → Folder, video → Video, clock → Clock, ticker → LetterText) |
| Name            | Element name (double-click to rename inline)                                                                                                                                                                                 |
| Visibility      | Eye icon toggle (show/hide element)                                                                                                                                                                                          |
| Lock            | Lock icon toggle (prevent editing)                                                                                                                                                                                           |
| Expand/Collapse | Chevron icon for groups with children                                                                                                                                                                                        |
| Delete          | Trash icon (visible on hover only)                                                                                                                                                                                           |

**Visual States:**

| State     | Appearance                                            |
| --------- | ----------------------------------------------------- |
| Default   | Standard text on `--surface` background               |
| Selected  | Highlighted background using `--surface-secondary`    |
| Hovered   | Slightly lighter background                           |
| Drag over | Drop indicator line (above, inside, or below the row) |

**Hierarchy Indentation:**

Child elements MUST be indented relative to their parent. Each nesting level MUST add consistent indentation. The layer list MUST use `overflow-y: auto` for scrolling when the element count exceeds visible area.

**Drag and Drop Reorder:**

Layer rows MUST support drag-and-drop reordering. Dragging MUST only initiate from the grip icon zone (left side of the row) — dragging from the name or action buttons MUST NOT start a drag. A 1×1 transparent image MUST replace the browser's default drag ghost.

During drag, a visual drop indicator MUST show the insertion position with three modes: before (insert above), inside (nest into group), and after (insert below). The drop zone is determined by the vertical pointer position within the target row.

**Subtree validation:** An element MUST NOT be dropped into its own descendants. The system MUST check the full subtree of the dragged element and reject any drop target that is a descendant. Invalid drop targets MUST NOT show a drop indicator.

**New element insertion:** When a new element is added to the document, it MUST appear at the top of the layer list (highest z-order) so it renders on top of existing elements.

Dropping MUST update the element z-order in the document.

**Multi-Selection:**

- Click: select single element (clears previous selection)
- Shift+Click: select range from the last clicked element to the current element (inclusive, in visual order)
- Ctrl/Cmd+Click: toggle individual element in/out of selection without affecting others

**Visibility Toggle Semantics:**

The visibility toggle MUST set the element's `visibility` class property to `'onscreen'` (visible) or `'offscreen'` (hidden). This is a class-level property, not a style property — hidden elements remain in the DOM but are not rendered.

#### Scenario: Layer click selects element

- GIVEN elements in the document
- WHEN a layer is clicked
- THEN setActiveElement is fired with the element ID

#### Scenario: Empty state

- GIVEN no elements in the document
- WHEN the sidebar renders
- THEN an empty message is shown

#### Scenario: Drop into own descendant rejected

- GIVEN a group with a child element
- WHEN the group is dragged onto its own child
- THEN the drop is rejected and no reorder occurs

#### Scenario: New element appears at top

- GIVEN 3 elements in the layer list
- WHEN a new element is added
- THEN it appears at the top of the layer list (highest z-order)

#### Acceptance Criteria

- [ ] Given elements in the document, setActiveElement is fired with the element ID
- [ ] Given no elements in the document, an empty message is shown
- [ ] Given a drag operation, it only initiates from the grip icon zone
- [ ] Given a drop into own descendant, the drop is rejected
- [ ] Given a new element added, it appears at the top of the layer list
- [ ] Given a visibility toggle, the element's visibility class is set to 'onscreen' or 'offscreen'

---

### Requirement: Geometry Panel

GeometryPanel MUST display and edit element position (x, y), size (width, height), and rotation. Changes MUST be committed to the store.

**Fields:**

| Field        | Input type   | Keyframeable | Notes                                            |
| ------------ | ------------ | ------------ | ------------------------------------------------ |
| Element name | text         | No           | Editable inline at the top of the panel          |
| X            | numeric      | Yes          | Unit-switching (px / mm / in) via CssLengthInput |
| Y            | numeric      | Yes          | Same unit set as X                               |
| Width        | numeric      | Yes          | Same unit set                                    |
| Height       | numeric      | Yes          | Same unit set                                    |
| Rotation     | numeric (°)  | Yes          | Degrees                                          |
| Anchor X     | toggle group | No           | left / right (determines transform origin)       |
| Anchor Y     | toggle group | No           | top / bottom                                     |

**3D Transform Fields (screen mode only, hidden in print mode):**

| Field      | Input type   | Keyframeable | Notes                     |
| ---------- | ------------ | ------------ | ------------------------- |
| RotateX    | numeric (°)  | Yes          | 3D rotation around X axis |
| RotateY    | numeric (°)  | Yes          | 3D rotation around Y axis |
| RotateZ    | numeric (°)  | Yes          | 3D rotation around Z axis |
| TranslateZ | numeric (px) | Yes          | Z-axis displacement       |

Anchor toggles MUST use HeroUI `ButtonGroup`. Numeric fields MUST use `NumField` (HeroUI `NumberField` wrapper). Unit selection MUST be preserved within the editing session.

**Anchor-Relative Position Display:**

When `anchorX` is `'right'`, the X field MUST display the position relative to the right edge of the canvas (`canvasWidth - x - width`). When `anchorY` is `'bottom'`, the Y field MUST display the position relative to the bottom edge (`canvasHeight - y - height`). The field label MUST dynamically reflect the anchor direction (e.g. "X (Right mm)" vs "X (mm)"). Editing the value MUST convert back to the internal left/top-origin coordinate before committing.

**Width/Height Minimum:**

Displayed width and height values MUST be clamped to a minimum of 0.1 in the current unit to prevent zero-size elements.

#### Scenario: Edit element position

- GIVEN a selected element at position (10, 20)
- WHEN the user changes x to 50
- THEN the element's x position is updated to 50

#### Scenario: Right-anchored position display

- GIVEN an element at x=100, width=80 on a 1920-wide canvas with anchorX='right'
- WHEN the Geometry panel renders
- THEN the X field shows 1740 (1920 - 100 - 80) and the label reads "X (Right ...)"

#### Acceptance Criteria

- [ ] Given a selected element, position, size, and rotation fields are editable
- [ ] Given a value change, the update is committed to the store
- [ ] Given anchorX='right', the X field displays the right-edge-relative value
- [ ] Given anchorY='bottom', the Y field displays the bottom-edge-relative value
- [ ] Given anchor labels, they dynamically reflect the anchor direction
- [ ] Given width or height, the minimum displayed value is 0.1

---

### Requirement: Appearance Panel

AppearancePanel MUST display and edit fill color, background gradient, border (width, color, style, radius), opacity, and blend mode for the selected element.

**Fields:**

| Field               | Input type          | Keyframeable | Notes                                                                                                                                                          |
| ------------------- | ------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Background color    | ColorInput          | Yes          | Solid color picker                                                                                                                                             |
| Background gradient | Gradient editor     | Yes          | Linear gradient with add/remove/reposition stops (screen only)                                                                                                 |
| Opacity             | HeroUI Slider (0–1) | Yes          | Element-level transparency                                                                                                                                     |
| Border color        | ColorInput          | No           | Stroke color                                                                                                                                                   |
| Border width        | NumField (px)       | No           | Border thickness                                                                                                                                               |
| Border style        | HeroUI Select       | No           | solid / dashed / dotted / double / groove / ridge / inset / outset / none                                                                                      |
| Border radius       | 4× NumField + link  | Yes          | Individual corners; link toggle for uniform radius                                                                                                             |
| Blend mode          | HeroUI Select       | No           | normal, multiply, screen, overlay, darken, lighten, color-dodge, color-burn, hard-light, soft-light, difference, exclusion, hue, saturation, color, luminosity |

The gradient editor MUST allow adding, removing, and repositioning color stops along the gradient axis. A fill-type switcher MUST toggle between solid color and gradient modes (visible in screen mode only — hidden in print mode). The border-radius link toggle, when active, MUST synchronize all four corner values when any single corner is edited.

**Gradient Editor Interaction Details:**

- Stop positions MUST be draggable along the gradient bar using pointer capture. Position MUST be calculated as a percentage (0–100) of bar width, snapped to integer values.
- Clicking a stop MUST select it and display a color picker for that stop below the gradient bar.
- A minimum of 2 gradient stops MUST be enforced — the remove button MUST be disabled when only 2 stops remain.
- The gradient MUST update live (optimistic) during stop drag, with the final value emitted on pointer-up.
- A separate angle control (0–360°) MUST allow adjusting the gradient rotation.

#### Scenario: Change fill color

- GIVEN a rectangle element selected
- WHEN the fill color is changed to `'#00ff00'`
- THEN the element's background color is updated

#### Acceptance Criteria

- [ ] Given a selected element, fill, border, opacity, and blend mode are editable
- [ ] Given a style change, the update is committed to the store

---

### Requirement: Image Panel

ImagePanel MUST display and edit image source URL and object-fit for image-type elements. It MUST only appear for image elements.

#### Scenario: Change image source

- GIVEN an image element selected
- WHEN the source URL is changed
- THEN the element's content is updated with the new URL

#### Acceptance Criteria

- [ ] Given an image element, source URL and object-fit are editable
- [ ] Given a non-image element, the image panel does not appear

---

### Requirement: Path Properties Panel

PathPropertiesPanel MUST display and edit SVG stroke, fill, stroke-width, dasharray, dashoffset, linecap, linejoin, and fill-rule for path and SVG elements.

**Fields:**

| Field             | Input type                 | Notes                                                                                         |
| ----------------- | -------------------------- | --------------------------------------------------------------------------------------------- |
| Stroke color      | ColorInput                 | SVG stroke color                                                                              |
| Stroke width      | NumField (min 0, step 0.5) | SVG stroke-width                                                                              |
| Stroke opacity    | HeroUI Slider (0–1)        | Transparency of stroke                                                                        |
| Stroke dasharray  | text input                 | CSS dasharray pattern                                                                         |
| Stroke dashoffset | HeroUI Slider              | Dash offset (animatable)                                                                      |
| Stroke linecap    | HeroUI Select              | butt / round / square                                                                         |
| Stroke linejoin   | HeroUI Select              | miter / round / bevel                                                                         |
| Fill color        | ColorInput                 | SVG fill color (or "none")                                                                    |
| Fill opacity      | HeroUI Slider (0–1)        | Transparency of fill                                                                          |
| Fill rule         | HeroUI Select              | nonzero / evenodd                                                                             |
| Draw Path         | toggle button              | Activates click-to-place drawing mode                                                         |
| Edit Path Points  | toggle button              | Activates point-editing overlay. Only enabled when path has content (non-empty `d` attribute) |

**Factory Defaults for New Path Elements:**

New path elements MUST be created with these style defaults:

| Property         | Default value |
| ---------------- | ------------- |
| stroke           | `#000000`     |
| strokeWidth      | `2`           |
| fill             | `none`        |
| fillOpacity      | `1`           |
| strokeOpacity    | `1`           |
| strokeLinecap    | `round`       |
| strokeLinejoin   | `round`       |
| strokeDasharray  | (empty)       |
| strokeDashoffset | `0`           |
| fillRule         | `nonzero`     |

**Toggle Button Behavior:**

- **Draw Path:** Pressing toggles between `startPathDrawing(elementId)` and `stopPathDrawing()`. Button label MUST change to "Done Drawing" when active.
- **Edit Path Points:** Pressing toggles between `startPathEditing(elementId)` and `stopPathEditing()`. Button label MUST change to "Done Editing Points" when active. This button MUST be disabled when the path's content is empty (nothing to edit).
- Only one mode can be active at a time — entering one MUST exit the other (see editor/editing.md for state rules).

#### Scenario: Change stroke width

- GIVEN a path element selected
- WHEN stroke-width is changed to 3
- THEN the element's stroke-width style is updated

#### Scenario: Edit path toggle disabled for empty path

- GIVEN a path element with empty content
- WHEN the Path Properties panel renders
- THEN the "Edit Path Points" button is disabled

#### Acceptance Criteria

- [ ] Given a path element, SVG stroke and fill properties are editable
- [ ] Given a path element, draw path and edit path point toggle buttons are available
- [ ] Given a path element with empty content, the edit path points button is disabled
- [ ] Given a non-path/SVG element, path properties do not appear

---

### Requirement: QR Code Panel

QrCodePanel MUST display and edit QR code content string, error correction level, and foreground/background colors.

#### Scenario: Change QR content

- GIVEN a qrcode element selected
- WHEN the content string is changed
- THEN the element's content is updated

#### Acceptance Criteria

- [ ] Given a qrcode element, content, error correction, and colors are editable

---

### Requirement: Group Panel

GroupPanel MUST display group-specific settings: clipChildren toggle and group name.

#### Scenario: Toggle clip children

- GIVEN a group element selected
- WHEN clipChildren is toggled on
- THEN the group's clipChildren property is set to true

#### Acceptance Criteria

- [ ] Given a group element, clipChildren toggle and group name are editable

---

### Requirement: Text Effects Panel

TextEffectsPanel MUST display and edit letter-spacing, line-height, word-spacing, and text-transform for text elements.

**Fields:**

| Field           | Input type          | Notes                                          |
| --------------- | ------------------- | ---------------------------------------------- |
| Font family     | HeroUI Select       | List from EditorConfig allowed fonts           |
| Font size       | NumField            | Range approximately 6–200 pt                   |
| Font color      | ColorInput          | Text color with transparency                   |
| Text alignment  | ButtonGroup         | left / center / right / justify (segmented)    |
| Font weight     | toggle + NumField   | Bold toggle (700) or custom range (100–900)    |
| Font style      | toggle              | Italic on/off                                  |
| Text decoration | independent toggles | Underline and line-through (separate controls) |
| Text transform  | HeroUI Select       | none / uppercase / lowercase / capitalize      |
| Line height     | CssLengthInput      | px / em / rem / %                              |
| Letter spacing  | CssLengthInput      | px / em / rem / %                              |
| Word spacing    | CssLengthInput      | px / em / rem / %                              |
| Text stroke     | TextStrokeInput     | Width (px) + color                             |
| Text shadow     | ShadowEditor        | Composable multi-layer shadow stack            |

An "Advanced" toggle MUST reveal letter-spacing, word-spacing, text stroke, and text shadow fields — keeping the default view compact. All text-effect fields MUST only appear for text elements.

#### Scenario: Change letter spacing

- GIVEN a text element selected
- WHEN letter-spacing is set to 2
- THEN the element's letterSpacing style is updated

#### Acceptance Criteria

- [ ] Given a text element, letter-spacing, line-height, word-spacing, and text-transform are editable
- [ ] Given a non-text element, text effects panel does not appear

---

### Requirement: Spacing Panel

SpacingPanel MUST display and edit padding values for the selected element.

**Fields:**

| Field   | Input type         | Notes                                                      |
| ------- | ------------------ | ---------------------------------------------------------- |
| Padding | 4× NumField + link | top / right / bottom / left; link toggle for uniform value |
| Margin  | 4× NumField + link | top / right / bottom / left; link toggle for uniform value |
| Gap     | NumField           | For flex / grid containers only                            |

The link toggle, when active, MUST synchronize all four side values when any individual side is edited. Fields MUST be arranged in a 2×2 grid (top/bottom in one column, left/right in another) for spatial clarity.

#### Scenario: Change padding

- GIVEN a selected element
- WHEN padding is changed to 10
- THEN the element's padding style is updated

#### Acceptance Criteria

- [ ] Given a selected element, padding values are editable

---

### Requirement: Guide Position Modal

GuidePositionModal MUST allow entering a precise numeric position for a guide line. Submitting MUST update the guide position. Cancelling MUST close without changes.

#### Scenario: Enter guide position

- GIVEN a guide being edited
- WHEN a numeric position is entered and submitted
- THEN the guide's position is updated to the entered value

#### Acceptance Criteria

- [ ] Given a guide, a precise numeric position can be entered
- [ ] Given submission, the guide position is updated
- [ ] Given cancellation, the guide position is unchanged

---

### Requirement: Object Fit Panel

ObjectFitPanel MUST display and edit the `objectFit` property for any element type with the `objectFit` capability. It MUST render independently of the Image Panel, appearing wherever the capability is enabled. The panel MUST offer standard CSS object-fit values (fill, contain, cover, none, scale-down).

#### Scenario: Object fit for image element

- GIVEN a selected image element
- WHEN the properties sidebar renders
- THEN the ObjectFitPanel appears with the current object-fit value editable

#### Scenario: Object fit hidden for unsupported types

- GIVEN a selected text element (objectFit capability is false)
- WHEN the properties sidebar renders
- THEN no ObjectFitPanel appears

#### Acceptance Criteria

- [ ] Given an element with objectFit capability, the ObjectFitPanel appears and is editable
- [ ] Given an element without objectFit capability, the ObjectFitPanel does not appear
- [ ] Given the ObjectFitPanel, standard CSS object-fit values are available

---

### Requirement: Multi-Element Property Display

When multiple elements are selected, the properties panel MUST display the common property values across all selected elements. Properties with differing values across the selection MUST display a "mixed" indicator (e.g., empty field with placeholder text "Mixed"). Editing a property in multi-select mode MUST apply the new value to all selected elements.

#### Scenario: Common value shown for matching properties

- GIVEN two elements are selected with the same backgroundColor
- WHEN the properties panel renders
- THEN the shared backgroundColor value is displayed

#### Scenario: Mixed indicator for differing values

- GIVEN two elements are selected with different x positions
- WHEN the properties panel renders
- THEN the x field shows a "Mixed" placeholder

#### Scenario: Multi-select edit applies to all

- GIVEN three elements are selected
- WHEN the user changes opacity to 0.5 and commits
- THEN all three elements have opacity 0.5

#### Acceptance Criteria

- [ ] Given multiple selected elements with matching property values, the common value is displayed
- [ ] Given multiple selected elements with differing property values, a "Mixed" indicator is shown
- [ ] Given a property edit in multi-select mode, the new value is applied to all selected elements

---

### Requirement: Element Rename in Layers Panel

The layers panel MUST support renaming elements by double-clicking the element name. Double-clicking MUST activate an inline text input pre-filled with the current name. Pressing Enter or clicking outside MUST commit the rename. Pressing Escape MUST cancel the rename and restore the original name. Empty names MUST be rejected (the rename is cancelled).

#### Scenario: Double-click activates rename input

- GIVEN a layer row is displayed
- WHEN the user double-clicks the element name
- THEN an inline text input appears pre-filled with the current name

#### Scenario: Enter commits the rename

- GIVEN the rename input is active with new text
- WHEN the user presses Enter
- THEN the element name is updated in the store

#### Scenario: Escape cancels rename

- GIVEN the rename input is active
- WHEN the user presses Escape
- THEN the rename is cancelled and the original name is restored

#### Scenario: Empty name rejected

- GIVEN the rename input is active with empty text
- WHEN the user presses Enter
- THEN the rename is cancelled (empty names are rejected)

#### Acceptance Criteria

- [ ] Given a double-click on element name, an inline text input activates pre-filled with the current name
- [ ] Given Enter pressed with new name text, the element name is updated
- [ ] Given Escape pressed during rename, the original name is restored
- [ ] Given an empty name submitted, the rename is cancelled

---

### Requirement: WCAG AA Panel Accessibility

All panels (Properties, Layers, Animation, Preflight) MUST conform to WCAG 2.1 AA standards. Panels MUST use `role="region"` with `aria-label`. Collapsible sections MUST use `aria-expanded`. Tabs MUST use `role="tablist"`, `role="tab"`, and `role="tabpanel"`. All interactive elements MUST be reachable via Tab key in logical order. All focusable elements MUST have a visible focus ring meeting 3:1 contrast ratio. Property labels MUST be associated with their inputs via `aria-labelledby` or `<label>`. Value changes MUST announce via `aria-live="polite"` regions where appropriate.

#### Scenario: Tab key navigates panel controls

- GIVEN the properties panel is focused
- WHEN the user presses Tab
- THEN focus moves to the next interactive element in logical order

#### Scenario: Collapsible section reflects state

- GIVEN a collapsible panel section
- WHEN it is collapsed
- THEN `aria-expanded="false"` is set on the toggle control

#### Scenario: Focus ring on focusable elements

- GIVEN any focusable element within a panel
- WHEN it receives focus
- THEN a visible focus ring is displayed

#### Acceptance Criteria

- [ ] Given Tab key navigation, all interactive panel elements are reachable
- [ ] Given collapsible sections, aria-expanded reflects the current state
- [ ] Given sidebar tabs, correct tablist/tab/tabpanel ARIA roles are applied
- [ ] Given any focusable element, a visible focus ring is displayed on focus
- [ ] Given property inputs, labels are associated via aria-labelledby or label element

---

### Requirement: Variable Font Axis Controls

When the selected text element uses a variable font (indicated by `variableAxes` in the font's `EditorConfig.allowedFonts` entry), the Text Effects panel MUST display axis slider controls below the font family selector. Each variable axis MUST render as a labeled HeroUI Slider with the axis name (e.g., "Weight", "Width", "Italic"), the axis tag (e.g., `wght`, `wdth`), and the min/max range from the font metadata. Moving a slider MUST update the element's `fontVariationSettings` style value in real time. When multiple axes are available, all MUST be shown simultaneously. When the selected font is not a variable font (no `variableAxes`), the axis controls MUST be hidden. The standard Font Weight control (bold toggle or weight range) MUST remain available alongside the axis controls — the axis slider takes precedence when a `wght` axis exists.

#### Scenario: Show axis sliders for variable font

- GIVEN a text element using a variable font with `variableAxes: [{ tag: 'wght', name: 'Weight', min: 100, max: 900 }]`
- WHEN the Text Effects panel renders
- THEN a "Weight" slider is shown with range 100–900

#### Scenario: Slider updates fontVariationSettings

- GIVEN a Weight axis slider at value 450
- WHEN the user drags the slider to 600
- THEN `fontVariationSettings` updates to include `'wght' 600`

#### Scenario: Non-variable font hides axis controls

- GIVEN a text element using a font with no `variableAxes`
- WHEN the Text Effects panel renders
- THEN no axis slider controls are shown

#### Acceptance Criteria

- [ ] Given a variable font with axes, sliders are shown for each axis with correct ranges
- [ ] Given a slider drag, `fontVariationSettings` updates in real time
- [ ] Given a non-variable font, axis controls are hidden
- [ ] Given both `wght` axis and bold toggle, both remain accessible

---

### Requirement: Auto-Size Mode Controls

The Geometry panel MUST display an auto-size mode selector for text elements. The control MUST be a segmented button group (HeroUI ButtonGroup) with three options: **Fixed** (icon: lock), **Auto Height** (icon: vertical arrows), **Shrink to Fit** (icon: compress). The current `autoSize` value determines which segment is active. Clicking a segment MUST update the element's `autoSize` field. When `autoSize` is `'auto-height'`, the height field in the Geometry panel MUST be disabled (greyed out) since height is computed. When `autoSize` is `'shrink-to-fit'`, both width and height remain editable (they define the constraint box). For non-text elements, the auto-size control MUST be hidden.

#### Scenario: Show auto-size for text element

- GIVEN a text element selected
- WHEN the Geometry panel renders
- THEN the auto-size segmented control is visible with the current mode active

#### Scenario: Switch to auto-height disables height field

- GIVEN a text element with `autoSize: 'fixed'`
- WHEN the user clicks "Auto Height"
- THEN `autoSize` is set to `'auto-height'` and the height field becomes disabled

#### Scenario: Hidden for non-text elements

- GIVEN a rectangle element selected
- WHEN the Geometry panel renders
- THEN no auto-size control is shown

#### Acceptance Criteria

- [ ] Given a text element, the auto-size segmented control appears in the Geometry panel
- [ ] Given Auto Height selected, the height field is disabled
- [ ] Given Shrink to Fit selected, both width and height remain editable
- [ ] Given a non-text element, the auto-size control is hidden

---

### Requirement: Video Element Panel

VideoPanel MUST appear for video-type elements and display controls for `typeConfig` properties:

| Field      | Input type    | Notes                                                   |
| ---------- | ------------- | ------------------------------------------------------- |
| Source URL | Text input    | The video content URL (edits element `content`)         |
| Autoplay   | HeroUI Switch | Whether video autoplays on visibility                   |
| Loop       | HeroUI Switch | Whether video loops                                     |
| Muted      | HeroUI Switch | Whether audio is muted                                  |
| Start time | NumField (s)  | Playback start position in seconds (min 0)              |
| End time   | NumField (s)  | Playback end position in seconds (empty = end of video) |

A video preview thumbnail SHOULD be displayed when the source URL is valid. Changes to switch values MUST be committed immediately. Changes to numeric fields MUST be committed on blur or Enter.

#### Scenario: Edit video source

- GIVEN a video element selected
- WHEN the source URL is changed
- THEN the element's content is updated

#### Scenario: Toggle autoplay

- GIVEN a video element with `typeConfig.autoplay: true`
- WHEN the Autoplay switch is toggled off
- THEN `typeConfig.autoplay` is set to `false`

#### Acceptance Criteria

- [ ] Given a video element, the VideoPanel appears with source URL, autoplay, loop, muted, start/end time controls
- [ ] Given a non-video element, the VideoPanel does not appear
- [ ] Given a switch toggle, the corresponding typeConfig property is updated

---

### Requirement: Clock Element Panel

ClockPanel MUST appear for clock-type elements and display controls for the format pattern and `typeConfig` properties:

| Field        | Input type    | Notes                                                                                                                       |
| ------------ | ------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Format       | Text input    | Time format pattern (edits element `content`, e.g., `HH:mm:ss`)                                                             |
| Mode         | HeroUI Select | `realtime`, `countdown`, `countup`, `stopwatch`                                                                             |
| Start value  | Text input    | Start time for countdown/countup (shown only in those modes)                                                                |
| Target value | Text input    | Target time for countdown (shown only in countdown mode when `countdownTo` is empty)                                        |
| Countdown to | Text input    | ISO 8601 datetime for absolute countdown (shown only in countdown mode). When set, Start value and Target value are hidden. |

Mode-dependent fields MUST be shown/hidden dynamically: Start value appears for `countdown`, `countup`, and `stopwatch` modes. Target value appears only for `countdown` mode when `countdownTo` is empty. Countdown to appears only for `countdown` mode.

#### Scenario: Switch clock mode

- GIVEN a clock element with `typeConfig.mode: 'realtime'`
- WHEN the Mode select is changed to `countdown`
- THEN Start value, Target value, and Countdown to fields appear

#### Scenario: Set absolute countdown

- GIVEN a clock element with `typeConfig.mode: 'countdown'`
- WHEN the Countdown to field is set to `2026-04-05T15:00:00Z`
- THEN Start value and Target value fields are hidden

#### Scenario: Edit format pattern

- GIVEN a clock element
- WHEN the format is changed to `mm:ss`
- THEN the element's content is updated to `mm:ss`

#### Acceptance Criteria

- [ ] Given a clock element, the ClockPanel appears with format, mode, and mode-dependent fields
- [ ] Given mode change to countdown, start value, target value, and countdown to fields appear
- [ ] Given mode change to realtime, start value, target value, and countdown to fields are hidden
- [ ] Given countdown mode with `countdownTo` set, start value and target value fields are hidden
- [ ] Given a non-clock element, the ClockPanel does not appear

---

### Requirement: Ticker Element Panel

TickerPanel MUST appear for ticker-type elements and display controls for ticker items and `typeConfig` properties:

| Field     | Input type      | Notes                                                |
| --------- | --------------- | ---------------------------------------------------- |
| Items     | Editable list   | JSON array of text strings; add/remove/reorder items |
| Speed     | NumField (px/s) | Scroll speed in pixels per second (1–2000)           |
| Direction | HeroUI Select   | `left`, `right`, `up`, `down`                        |
| Gap       | NumField (px)   | Gap between items in pixels (≥ 0)                    |
| Paused    | HeroUI Switch   | Whether scrolling is paused                          |

The items list MUST support adding new text items, removing items (minimum 1 item), and drag-to-reorder. Each item is a text input. Adding an item appends to the end with placeholder text "New item".

#### Scenario: Add ticker item

- GIVEN a ticker element with 2 items
- WHEN the user clicks "Add Item"
- THEN a new item "New item" is appended to the items list

#### Scenario: Change scroll direction

- GIVEN a ticker element with `typeConfig.direction: 'left'`
- WHEN direction is changed to `up`
- THEN `typeConfig.direction` is updated to `up`

#### Acceptance Criteria

- [ ] Given a ticker element, the TickerPanel appears with items list, speed, direction, gap, and paused controls
- [ ] Given add item, a new item is appended
- [ ] Given remove item (not the last), the item is removed
- [ ] Given a non-ticker element, the TickerPanel does not appear

---

### Requirement: Scenes Terminology in Layers Panel

The Layers sidebar MUST use the label **"Scenes"** instead of "Pages" for all user-facing text related to page navigation and management. This includes the scene tab labels, the "Add Scene" button, and any tooltips or context menu items that reference pages. The underlying data model continues to use `pages` — only the UI presentation layer uses "Scenes" to align with broadcast industry terminology (matching Vizrt Viz Artist and similar broadcast graphics tools). This label MUST be consistent across the Layers sidebar, the bottom bar page indicator, and any modal or menu that references page navigation.

#### Scenario: Layers sidebar shows Scenes label

- GIVEN the layers sidebar is rendered
- WHEN the page navigation section is visible
- THEN tabs or headers read "Scene 1", "Scene 2", etc. (not "Page 1")

#### Scenario: Add scene button

- GIVEN the layers sidebar is rendered
- WHEN the user looks for a new page button
- THEN the button reads "Add Scene" (not "Add Page")

#### Acceptance Criteria

- [ ] Given the layers sidebar, page navigation uses "Scenes" / "Scene N" labels
- [ ] Given the add-page button, it reads "Add Scene"
- [ ] Given tooltips and context menus referencing pages, they use "Scene" terminology
- [ ] Given the data model, `pages` field remains unchanged (UI label only)

---

## Spec Gaps

- [ ] **Multi-Element Property Display:** No automated tests cover common-value display, "Mixed" placeholder, or multi-select edit propagation — component tests needed for the properties panel in multi-selection mode.
- [ ] **Element Rename in Layers Panel:** No automated tests cover inline rename activation, commit on Enter, cancel on Escape, or empty-name rejection — component tests needed for the layers sidebar rename flow.
- [ ] **WCAG AA Panel Accessibility:** No automated tests verify ARIA roles, aria-expanded state, tab order, focus rings, or label associations — accessibility-focused component tests are needed for all panels.
- [ ] **Variable Font Axis Controls:** No automated tests cover axis slider rendering, `fontVariationSettings` updates, or hiding for non-variable fonts — requires CT.
- [ ] **Auto-Size Mode Controls:** No automated tests cover segmented control rendering, height field disabling, or hiding for non-text elements — requires CT.
- [ ] **Video Element Panel:** No automated tests cover VideoPanel rendering or typeConfig property updates — requires CT.
- [ ] **Clock Element Panel:** No automated tests cover ClockPanel rendering, mode-dependent field visibility, or typeConfig updates — requires CT.
- [ ] **Ticker Element Panel:** No automated tests cover TickerPanel rendering, item list management, or typeConfig updates — requires CT.

---

## Non-Goals

- Modal dialogs → see [modals.md](modals.md)
- Toolbar and navigation → see [toolbar-nav.md](toolbar-nav.md)
- Timeline editing → see [timeline.md](timeline.md)
