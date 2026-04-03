# UI — Input Components Specification

## Purpose

Defines the behavioral contracts for reusable input components in the UI package: color picker, CSS length input, text stroke input, filter stack editor, and shadow editor. These components are used across property panels to edit element style values. They do NOT define panel layout or element data flow (→ [panels.md](panels.md)). See [conventions](../../README.md).

---

## Requirements

### Requirement: Color Input

The color input MUST provide a color picker with a saturation/brightness area and a hue slider, plus hex/rgba text input. It MUST accept and emit CSS color strings. Invalid color strings MUST NOT be submitted. The picker MUST also support alpha/opacity adjustment.

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

> **Note:** Gradient editing (linear, radial) is handled by the fill type switcher in the appearance panel (see [panels.md](panels.md)). The color picker described here applies to solid color stops within a gradient as well as standalone solid colors.

---

### Requirement: CSS Length Input

The CSS length input MUST provide a numeric input with unit switching (px, mm, in, %, em, rem). It MUST convert between units when the unit is changed.

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

---

### Requirement: Shadow Editor

The shadow editor MUST provide inputs for box-shadow or text-shadow properties: offsetX, offsetY, blur radius, spread (box-shadow only), and color. It MUST support multiple shadow layers.

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
