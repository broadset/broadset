# UI — Panels Specification

## Purpose

Defines the behavioral requirements for editor property panels and sidebars: the properties sidebar, box effects panel, clip-path panel, preflight panel, animation sidebar, animation builder, property field, and layers sidebar.

---

## Requirements

### Requirement: Properties Sidebar Rendering

The system MUST render the selected element from the native document. In screen mode, gradient fill switcher MUST be visible for rectangle elements. In print mode, gradient fill and 3D transform controls MUST be hidden. When a component registry provides a custom property panel for an element type, it MUST be rendered. When `showAnimations` is false, the animation builder MUST be hidden.

**Panel Ordering:**

The Properties sidebar MUST present accordion sections in this order. Each section MUST use a HeroUI `Accordion` panel with an icon next to the section title. Sections MUST only appear when relevant to the selected element type and document mode:

| #   | Section           | Shown for                          | Hidden in print mode |
| --- | ----------------- | ---------------------------------- | -------------------- |
| 1   | Geometry          | All elements                       | 3D fields only       |
| 2   | Appearance        | All elements                       | Gradient fill        |
| 3   | Typography        | Text elements                      | No                   |
| 4   | Text Effects      | Text elements                      | No                   |
| 5   | Spacing           | Text and group elements            | No                   |
| 6   | Box Effects       | All elements                       | Partially            |
| 7   | Clip Path         | All elements                       | No                   |
| 8   | Path Properties   | Path and SVG elements              | No                   |
| 9   | Image             | Image elements                     | No                   |
| 10  | Object Fit        | Elements with objectFit capability | No                   |
| 11  | QR Code           | QR code elements                   | No                   |
| 12  | Group             | Group elements                     | No                   |
| 13  | Animation Builder | All elements (if enabled)          | No                   |
| 14  | Custom Panel      | Custom plugin types                | No                   |

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

The system MUST show a start button for custom mask editing when not in editing mode. When editing starts, a default path MUST be seeded if the clip-path is empty. A stop button MUST be shown while editing.

**Preset Clip Shapes:**

The panel MUST provide a selector with built-in clip-path presets:

| Preset   | Generated clip-path           |
| -------- | ----------------------------- |
| None     | removes clip-path             |
| Circle   | `circle(50%)`                 |
| Squircle | smooth rounded-rectangle path |
| Triangle | 3-point polygon               |
| Star     | 5-point star polygon          |
| Custom   | opens inline SVG path editor  |

Selecting a preset MUST immediately apply the clip-path and update the element's style. Custom mode MUST allow editing the raw SVG path coordinate string inline.

#### Scenario: Start editing seeds default path

- GIVEN an element with an empty clip-path
- WHEN clip-path editing starts
- THEN a default path is seeded

#### Acceptance Criteria

- [ ] Given an element with an empty clip-path, a default path is seeded

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

| Zone            | Content                                                                                                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Left icon       | Element type icon (distinct per type: text → Type, image → Image, rectangle → Square, ellipse → Circle, path → PenTool, svg → FileCode2, qrcode → QrCode, group → Folder) |
| Name            | Element name (double-click to rename inline)                                                                                                                              |
| Visibility      | Eye icon toggle (show/hide element)                                                                                                                                       |
| Lock            | Lock icon toggle (prevent editing)                                                                                                                                        |
| Expand/Collapse | Chevron icon for groups with children                                                                                                                                     |
| Delete          | Trash icon (visible on hover only)                                                                                                                                        |

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

PathPropertiesPanel MUST display and edit SVG stroke, fill, stroke-width, dasharray, linecap, linejoin, and fill-rule for path and SVG elements.

**Fields:**

| Field            | Input type          | Notes                           |
| ---------------- | ------------------- | ------------------------------- |
| Stroke color     | ColorInput          | SVG stroke color                |
| Stroke width     | NumField (px)       | SVG stroke-width                |
| Stroke opacity   | HeroUI Slider (0–1) | Transparency of stroke          |
| Fill color       | ColorInput          | SVG fill color                  |
| Fill opacity     | HeroUI Slider (0–1) | Transparency of fill            |
| Stroke dasharray | text input          | CSS dasharray pattern           |
| Stroke linecap   | HeroUI Select       | butt / round / square           |
| Stroke linejoin  | HeroUI Select       | miter / round / bevel           |
| Fill rule        | HeroUI Select       | nonzero / evenodd               |
| Edit path        | toggle button       | Activates point-editing mode    |
| Draw path        | toggle button       | Activates freehand drawing mode |

#### Scenario: Change stroke width

- GIVEN a path element selected
- WHEN stroke-width is changed to 3
- THEN the element's stroke-width style is updated

#### Acceptance Criteria

- [ ] Given a path element, SVG stroke and fill properties are editable
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

## Spec Gaps

- [ ] **Multi-Element Property Display:** No automated tests cover common-value display, "Mixed" placeholder, or multi-select edit propagation — component tests needed for the properties panel in multi-selection mode.
- [ ] **Element Rename in Layers Panel:** No automated tests cover inline rename activation, commit on Enter, cancel on Escape, or empty-name rejection — component tests needed for the layers sidebar rename flow.
- [ ] **WCAG AA Panel Accessibility:** No automated tests verify ARIA roles, aria-expanded state, tab order, focus rings, or label associations — accessibility-focused component tests are needed for all panels.

---

## Non-Goals

- Modal dialogs → see [modals.md](modals.md)
- Toolbar and navigation → see [toolbar-nav.md](toolbar-nav.md)
- Timeline editing → see [timeline.md](timeline.md)
