# UI — Panels Specification

## Purpose

Defines the behavioral requirements for editor property panels and sidebars: the properties sidebar, box effects panel, clip-path panel, preflight panel, animation sidebar, animation builder, property field, and layers sidebar.

---

## Requirements

### Requirement: Properties Sidebar Rendering

The system MUST render the selected element from the native document. In screen mode, gradient fill switcher MUST be visible for rectangle elements. In print mode, gradient fill and 3D transform controls MUST be hidden. When a component registry provides a custom property panel for an element type, it MUST be rendered. When `showAnimations` is false, the animation builder MUST be hidden.

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

#### Scenario: Screen mode compositing controls

- GIVEN screen document mode
- WHEN box effects panel renders
- THEN compositing controls are visible

#### Acceptance Criteria

- [ ] Given screen document mode, compositing controls are visible

---

### Requirement: Clip-Path Panel

The system MUST show a start button for custom mask editing when not in editing mode. When editing starts, a default path MUST be seeded if the clip-path is empty. A stop button MUST be shown while editing.

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

#### Scenario: Layer click selects element

- GIVEN elements in the document
- WHEN a layer is clicked
- THEN setActiveElement is fired with the element ID

#### Scenario: Empty state

- GIVEN no elements in the document
- WHEN the sidebar renders
- THEN an empty message is shown

#### Acceptance Criteria

- [ ] Given elements in the document, setActiveElement is fired with the element ID
- [ ] Given no elements in the document, an empty message is shown

---

### Requirement: Geometry Panel

GeometryPanel MUST display and edit element position (x, y), size (width, height), and rotation. Changes MUST be committed to the store.

#### Scenario: Edit element position

- GIVEN a selected element at position (10, 20)
- WHEN the user changes x to 50
- THEN the element's x position is updated to 50

#### Acceptance Criteria

- [ ] Given a selected element, position, size, and rotation fields are editable
- [ ] Given a value change, the update is committed to the store

---

### Requirement: Appearance Panel

AppearancePanel MUST display and edit fill color, background gradient, border (width, color, style, radius), opacity, and blend mode for the selected element.

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
