# UI — Input Components Specification

## Purpose

Defines the behavioral contracts for reusable input components in the UI package: color picker, CSS length input, text stroke input, filter stack editor, and shadow editor. These components are used across property panels to edit element style values. They do NOT define panel layout or element data flow (→ [panels.md](panels.md)). See [conventions](../../README.md).

---

## Requirements

### Requirement: Color Input

The color input MUST provide a color picker with a saturation/brightness area and a hue slider, plus hex/rgba text input. It MUST accept and emit CSS color strings. Invalid color strings MUST NOT be submitted. The picker MUST also support alpha/opacity adjustment.

**Picker Structure (popover on swatch click):**

| Zone                  | Component               | Purpose                                                  |
| --------------------- | ----------------------- | -------------------------------------------------------- |
| Swatch button         | Clickable color preview | Opens popover; shows current color                       |
| Preset swatches       | ColorSwatchPicker grid  | Quick-pick from default palette + user-saved colors      |
| Color area            | HeroUI ColorArea (HSB)  | 2D saturation/brightness picker                          |
| Hue slider            | HeroUI ColorSlider      | Select hue (0–360°)                                      |
| Alpha slider          | HeroUI ColorSlider      | Select opacity / transparency (0–1)                      |
| Format toggle         | Segmented control       | Switch display between HEX / RGB / HSL                   |
| Text input            | Manual CSS color entry  | Accepts any valid CSS color string                       |
| Add to palette button | Action button           | Saves current color to user palette (persisted in store) |

The swatch button MUST show a checkerboard pattern behind the color to indicate transparency. The popover MUST close when clicking outside.

**User Palette:**

Users MUST be able to save colors to a persistent palette via the "Add to palette" button. Saved colors MUST appear in the preset swatch grid alongside the default palette colors. Individual saved colors MUST be removable.

**Format Toggle Persistence:**

The selected display format (HEX / RGB / HSL) MUST persist within the editing session. Switching format MUST convert the displayed text value to the new format. If conversion of a partial/draft input fails, the last valid value MUST be shown in the new format.

**Transparent Color Handling:**

The value `'rgba(0, 0, 0, 0)'` (fully transparent) MUST display a checkerboard pattern on the swatch button to indicate transparency. The alpha slider MUST be set to 0 when this value is active.

**Draft Value Management:**

During text input, the color picker MUST maintain a draft state to prevent losing partial input. The draft MUST be committed on blur or Enter. Invalid color strings on blur MUST revert to the last valid color — no error toast.

#### Scenario: Pick a color

- GIVEN a color input with current value `'#ff0000'`
- WHEN the user selects a new color from the picker
- THEN the input emits the new CSS color string

#### Scenario: Type hex value

- GIVEN a color input
- WHEN the user types `'#00ff00'` in the text field
- THEN the input emits `'#00ff00'`

#### Acceptance Criteria

- [ ] Given a color picker interaction, the new CSS color string is emitted
- [ ] Given valid hex text input, the color value is accepted and emitted
- [ ] Given the color picker, a saturation/brightness area and hue slider are available
- [ ] Given alpha adjustment, the emitted color includes opacity
- [ ] Given an invalid color string on blur, the input reverts to the last valid color
- [ ] Given format toggle, the displayed value converts to the selected format
- [ ] Given a fully transparent color, the swatch shows a checkerboard pattern
- [ ] Given saved palette colors, individual colors can be removed

> **Note:** Gradient editing (linear, radial) is handled by the fill type switcher in the appearance panel (see [panels.md](panels.md)). The color picker described here applies to solid color stops within a gradient as well as standalone solid colors.

---

### Requirement: NumField (Numeric Input)

NumField wraps HeroUI `NumberField` to provide a consistent numeric input used across all property panels. It MUST include decrement and increment buttons flanking the text input. Arrow Up/Down keys MUST increment/decrement the value by the configured `step`. The value MUST be formatted with a maximum of 2 decimal places for display.

**Commit Timing:**

Value changes MUST be committed to the store on **blur** or **Enter** key — not in real-time during typing. This prevents partial values (e.g. typing "12" mid-way to "120") from triggering store updates. During increment/decrement button clicks and arrow key presses, the value MUST be committed immediately on each step.

**Invalid Input Recovery:**

If the user enters non-numeric or invalid text and blurs the field, the input MUST revert to the last valid formatted value. No error toast or alert is needed — silent recovery.

**Step Sizes:**

| Field context        | Step         | Notes                   |
| -------------------- | ------------ | ----------------------- |
| Position (x, y)      | 1            | In current unit         |
| Size (width, height) | 1            | In current unit         |
| Rotation             | 1            | Degrees                 |
| Border width         | 1            | px                      |
| Border radius        | 1            | px                      |
| Font size            | 1            | pt                      |
| Shadow offset        | 1            | px                      |
| Shadow blur/spread   | 1            | px                      |
| Opacity              | 0.01         | Slider, 0–1 range       |
| Filter values        | Per function | See filter editor table |

#### Scenario: Arrow key increments value

- GIVEN a NumField with value 50 and step 1
- WHEN the user presses Arrow Up
- THEN the value becomes 51 and is committed

#### Scenario: Blur commits value

- GIVEN a NumField with the user typing "75"
- WHEN the field loses focus
- THEN the value 75 is committed to the store

#### Scenario: Invalid input reverts

- GIVEN a NumField with current value 50
- WHEN the user types "abc" and blurs
- THEN the field reverts to 50

#### Acceptance Criteria

- [ ] Given Arrow Up/Down, the value increments/decrements by the configured step
- [ ] Given blur or Enter, the current value is committed to the store
- [ ] Given invalid text input on blur, the field reverts to the last valid value
- [ ] Given the displayed value, it has a maximum of 2 decimal places
- [ ] Given increment/decrement buttons, each click commits the new value immediately

---

### Requirement: CSS Length Input

The CSS length input MUST provide a numeric input with unit switching (px, mm, in, %, em, rem). It MUST convert between units when the unit is changed. The unit selector MUST be positioned to the right of the numeric input. When the unit is blank/unitless, the display label MUST show '—' (em dash).

#### Scenario: Switch units

- GIVEN a value of `96px`
- WHEN the unit is switched to mm
- THEN the displayed value converts to `25.4mm`

#### Scenario: Numeric input

- GIVEN a length input
- WHEN the user types `50`
- THEN the value is `50` in the current unit

#### Acceptance Criteria

- [ ] Given a unit switch, the numeric value is converted to the new unit
- [ ] Given numeric text input, the value is accepted in the current unit

---

### Requirement: Text Stroke Input

The text stroke input MUST provide width and color inputs for CSS text-stroke. It MUST emit a combined CSS text-stroke shorthand value.

#### Scenario: Set stroke width and color

- GIVEN a text stroke input
- WHEN width is set to `2` and color to `'#000000'`
- THEN the emitted value is a valid CSS text-stroke shorthand

#### Acceptance Criteria

- [ ] Given width and color inputs, a valid CSS text-stroke shorthand is emitted

---

### Requirement: Filter Editor

The filter editor MUST provide a stack editor for CSS filter functions. Supported functions: blur, brightness, contrast, grayscale, hue-rotate, invert, opacity, saturate, sepia. Filters MUST be ordered and individually configurable. Adding, removing, and reordering filters MUST be supported.

**Duplicate Prevention:**

Each filter function MUST appear at most once in the stack. The "Add filter" dropdown MUST exclude functions already present in the stack. When a filter is removed, its function becomes available in the dropdown again.

**Per-Filter Fields:**

| Filter function | Value range | Unit | Default |
| --------------- | ----------- | ---- | ------- |
| blur            | 0+          | px   | 0       |
| brightness      | 0+          | none | 1       |
| contrast        | 0+          | none | 1       |
| grayscale       | 0–1         | none | 0       |
| hue-rotate      | 0–360       | deg  | 0       |
| invert          | 0–1         | none | 0       |
| opacity         | 0–1         | none | 1       |
| saturate        | 0+          | none | 1       |
| sepia           | 0–1         | none | 0       |

**Stack Controls:**

| Action     | Behavior                                       |
| ---------- | ---------------------------------------------- |
| Add filter | HeroUI Select to choose function, then appends |
| Remove     | Remove button per filter row                   |
| Reorder    | Drag or up/down buttons to change filter order |

The emitted value MUST be a space-separated list of filter functions in stack display order.

#### Scenario: Add blur filter

- GIVEN an empty filter stack
- WHEN a blur filter with 5px is added
- THEN the emitted filter string is `'blur(5px)'`

#### Scenario: Multiple filters ordered

- GIVEN a stack with blur(5px) and brightness(1.2)
- WHEN the filter string is emitted
- THEN it is `'blur(5px) brightness(1.2)'` (in stack order)

#### Scenario: Remove filter

- GIVEN a stack with two filters
- WHEN one filter is removed
- THEN the emitted string contains only the remaining filter

#### Acceptance Criteria

- [ ] Given a single filter, the correct CSS filter function string is emitted
- [ ] Given multiple filters, they are concatenated in stack order
- [ ] Given filter removal, the remaining filters form the emitted string
- [ ] Given a filter already in the stack, it is excluded from the Add dropdown

---

### Requirement: Shadow Editor

The shadow editor MUST provide inputs for box-shadow or text-shadow properties: offsetX, offsetY, blur radius, spread (box-shadow only), and color. It MUST support multiple shadow layers. Inset toggle MUST be available for box-shadow mode only.

**Enable/Disable Toggle:**

The shadow editor MUST include a top-level HeroUI `Switch` to enable or disable the entire shadow effect. When disabled, all layer controls MUST be dimmed and non-interactive, and the emitted shadow value MUST be `'none'` (or empty). This allows users to temporarily remove shadows without deleting configured layers.

**Layer Management:**

| Action       | Behavior                                               |
| ------------ | ------------------------------------------------------ |
| Add layer    | Appends a new shadow with default values               |
| Remove layer | Removes the selected shadow layer                      |
| Reorder      | Layers MUST be reorderable via drag or up/down buttons |

**Per-Layer Fields:**

| Field    | Input type    | Available for           |
| -------- | ------------- | ----------------------- |
| Offset X | NumField (px) | box-shadow, text-shadow |
| Offset Y | NumField (px) | box-shadow, text-shadow |
| Blur     | NumField (px) | box-shadow, text-shadow |
| Spread   | NumField (px) | box-shadow only         |
| Color    | ColorInput    | box-shadow, text-shadow |
| Inset    | HeroUI Switch | box-shadow only         |

Multiple shadow layers MUST be emitted as a comma-separated CSS shadow string.

#### Scenario: Single shadow

- GIVEN a shadow editor
- WHEN offsetX=2, offsetY=4, blur=6, color='#000000' are set
- THEN the emitted value is a valid CSS shadow string

#### Scenario: Multiple shadow layers

- GIVEN a shadow editor with two layers
- WHEN both are configured
- THEN the emitted value contains both shadows separated by comma

#### Acceptance Criteria

- [ ] Given shadow values, a valid CSS shadow string is emitted
- [ ] Given multiple shadow layers, they are comma-separated in the emitted value
- [ ] Given the shadow disabled via toggle, the emitted value is 'none'
- [ ] Given the shadow re-enabled, previously configured layers are restored

---

### Requirement: WCAG AA Input Accessibility

All custom input components (color picker, CSS length input, filter editor, shadow editor, text stroke input) MUST conform to WCAG 2.1 AA standards. Each input MUST have an associated label via `aria-label` or `aria-labelledby`. All inputs MUST be fully operable via keyboard: color picker sliders MUST respond to Arrow keys, and numeric inputs MUST support Arrow Up/Down for increment/decrement. All input text and borders MUST meet 4.5:1 contrast ratio against their background. Invalid input values MUST be communicated via `aria-invalid="true"` and an associated error message via `aria-describedby`.

#### Scenario: Arrow key adjusts color picker hue slider

- GIVEN a color picker hue slider
- WHEN the user presses the Right arrow key
- THEN the hue value increases

#### Scenario: Invalid input sets aria-invalid

- GIVEN a CSS length input with an invalid value
- WHEN the input is inspected
- THEN `aria-invalid="true"` is set on the input element

#### Acceptance Criteria

- [ ] Given custom inputs, each has an associated aria-label or aria-labelledby
- [ ] Given color picker sliders, arrow keys adjust the value
- [ ] Given invalid input values, aria-invalid="true" is set on the input
- [ ] Given input text and borders, contrast ratio meets 4.5:1

---

## Spec Gaps

- [ ] **WCAG AA Input Accessibility:** No automated tests verify aria-label presence, arrow-key operation on sliders, aria-invalid on error states, or contrast ratios — accessibility-focused component tests are needed for all custom input components.

---

## Non-Goals

- How filter/shadow values are persisted in element style → see `project/spec/model/style.md`
- CSS parsing utilities for shadows and filters → see [utilities.md](utilities.md)
- Property panel layout that uses these inputs → see [panels.md](panels.md)
