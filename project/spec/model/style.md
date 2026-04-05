# Model — Element Style Contract

## Purpose

Defines the shape and semantics of `BroadsetElementStyle` — the CSS-mapped visual properties persisted on every element. These properties control typography, backgrounds, borders, effects, layout, and SVG stroke/fill. This spec ensures any consumer can reconstruct the full visual styling vocabulary. It does NOT cover how styles are rendered to DOM (→ `project/spec/renderer/`) or animated (→ `project/spec/playback/`). See [conventions](../../README.md).

---

## Requirements

### Requirement: Typography Properties

The system MUST support these typography properties on elements: `fontFamily`, `fontSize` (numeric, in px), `fontColor` (CSS color string), `fontWeight`, `fontStyle`, `textAlignment`, `textDecoration`, `textTransform`, `letterSpacing` (CSS length), `lineHeight` (CSS length or number), `wordSpacing` (CSS length). All typography properties are optional; only `opacity` is required.

#### Scenario: Text element with full typography

- GIVEN a text element with fontFamily, fontSize, fontColor, fontWeight, textAlignment set
- WHEN the element is rendered
- THEN all typography properties are applied to the text display

#### Scenario: Missing typography properties use browser defaults

- GIVEN a text element with no typography properties set
- WHEN the element is rendered
- THEN the browser's default font rendering applies

#### Acceptance Criteria

- [ ] Given a text element with typography properties set, all are applied to the rendered output
- [ ] Given a text element with no typography properties, browser defaults apply

---

### Requirement: Text Effect Properties

The system MUST support `textStroke` (CSS text-stroke shorthand) and `textShadow` (CSS text-shadow value) on elements. Both are optional string values.

#### Scenario: Text stroke applied

- GIVEN an element with `textStroke: '1px black'`
- WHEN the element is rendered
- THEN a 1px black text stroke is visible

#### Acceptance Criteria

- [ ] Given an element with a textStroke value, the stroke is applied to rendered text
- [ ] Given an element with a textShadow value, the shadow is applied to rendered text

---

### Requirement: Background Properties

The system MUST support `backgroundColor` (CSS color string) and `backgroundGradient` (CSS gradient value) on elements. Both are optional. When both are set, gradient takes visual precedence.

#### Scenario: Solid background color

- GIVEN an element with `backgroundColor: '#ff0000'`
- WHEN the element is rendered
- THEN the background is solid red

#### Scenario: Gradient overrides solid color

- GIVEN an element with both backgroundColor and backgroundGradient set
- WHEN the element is rendered
- THEN the gradient is visually applied

#### Acceptance Criteria

- [ ] Given an element with a backgroundColor, the background is that color
- [ ] Given an element with both backgroundColor and backgroundGradient, the gradient is applied

---

### Requirement: Border Properties

The system MUST support `borderWidth` (numeric, in px), `borderColor` (CSS color), `borderRadius` (uniform number or 4-tuple `[topLeft, topRight, bottomRight, bottomLeft]` in CSS shorthand order), and `borderStyle` (CSS border-style). All are optional.

#### Scenario: Uniform border radius

- GIVEN an element with `borderRadius: 10`
- WHEN the border radius is normalized
- THEN all four corners are `10`

#### Scenario: Per-corner border radius

- GIVEN an element with `borderRadius: [10, 20, 30, 40]`
- WHEN the border radius is inspected
- THEN topLeft is `10`, topRight is `20`, bottomRight is `30`, bottomLeft is `40`

#### Scenario: Uniform detection

- GIVEN a border radius of `[10, 10, 10, 10]`
- WHEN checked for uniformity
- THEN the result is uniform (true)

#### Scenario: Non-uniform detection

- GIVEN a border radius of `[10, 20, 10, 10]`
- WHEN checked for uniformity
- THEN the result is non-uniform (false)

#### Acceptance Criteria

- [ ] Given a uniform borderRadius number, normalization expands it to a 4-tuple of equal values
- [ ] Given a per-corner borderRadius 4-tuple, each corner value is preserved
- [ ] Given a 4-tuple with all equal values, uniformity check returns true
- [ ] Given a 4-tuple with unequal values, uniformity check returns false

---

### Requirement: Visual Effect Properties

The system MUST support `boxShadow` (CSS box-shadow), `filter` (CSS filter function list), `backdropFilter` (CSS backdrop-filter), `mixBlendMode` (CSS mix-blend-mode), `isolation` (CSS isolation), and `opacity` (number 0–1 inclusive, required). Opacity values outside the [0, 1] range MUST be rejected by validation. All except opacity are optional strings.

#### Scenario: Opacity is required

- GIVEN an element with no explicit opacity
- WHEN defaults are applied
- THEN opacity is `1`

#### Scenario: Filter and backdrop filter

- GIVEN an element with `filter: 'blur(5px)'` and `backdropFilter: 'brightness(0.8)'`
- WHEN the element is rendered
- THEN both filter effects are applied

#### Acceptance Criteria

- [ ] Given an element with default style, opacity is 1
- [ ] Given an element with filter and backdropFilter values, both are applied to the rendered output

---

### Requirement: Layout Properties

The system MUST support `padding` (CSS padding shorthand) and `objectFit` (CSS object-fit value) on elements. Both are optional strings.

#### Scenario: Object-fit on image element

- GIVEN an image element with `objectFit: 'cover'`
- WHEN the image is rendered within its element bounds
- THEN the image fills the bounds using cover fitting

#### Acceptance Criteria

- [ ] Given an image element with an objectFit value, the image uses that fitting mode

---

### Requirement: SVG Stroke and Fill Properties

The system MUST support SVG-specific properties for path and SVG elements: `stroke` (color), `strokeWidth` (numeric, px), `strokeDasharray` (pattern string), `strokeDashoffset` (numeric), `strokeLinecap` (`'butt'` | `'round'` | `'square'`), `strokeLinejoin` (`'miter'` | `'round'` | `'bevel'`), `strokeOpacity` (0–1), `fill` (color), `fillOpacity` (0–1), `fillRule` (`'nonzero'` | `'evenodd'`). All are optional and animatable.

#### Scenario: Path element with stroke properties

- GIVEN a path element with stroke, strokeWidth, strokeDasharray set
- WHEN the element is rendered as SVG
- THEN stroke color, width, and dash pattern are applied

#### Scenario: Fill rule controls winding

- GIVEN an SVG element with `fillRule: 'evenodd'`
- WHEN the element is rendered
- THEN the even-odd winding rule determines filled regions

#### Acceptance Criteria

- [ ] Given a path element with stroke properties, all are applied to the SVG rendering
- [ ] Given an SVG element with a fillRule, the winding rule is applied

---

### Requirement: Padding Value Constraints

Element padding values MUST be non-negative finite numbers when specified as numeric values. CSS padding shorthand strings MUST contain only non-negative values. Negative padding values MUST be rejected by validation.

#### Scenario: Positive padding is valid

- GIVEN an element with padding `10`
- WHEN validation runs
- THEN validation succeeds

#### Scenario: Negative padding is rejected

- GIVEN an element with padding `-5`
- WHEN validation runs
- THEN validation fails

#### Scenario: CSS shorthand with non-negative values

- GIVEN an element with padding `10 20 10 20`
- WHEN validation runs
- THEN validation succeeds

#### Acceptance Criteria

- [ ] Given a positive numeric padding value, validation succeeds
- [ ] Given a negative numeric padding value, validation fails
- [ ] Given a zero padding value, validation succeeds
- [ ] Given a CSS shorthand with all non-negative values, validation succeeds

---

## Spec Gaps

_None — all requirements have acceptance criteria._

---

## Non-Goals

- How styles are animated between keyframes → see `project/spec/playback/interpolation.md`
- How styles are rendered to DOM → see `project/spec/renderer/spec.md`
- Property capability gating per element type → see `project/spec/editor/editing.md`
