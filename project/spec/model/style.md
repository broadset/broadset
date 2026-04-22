# Model — Element Style Contract

## Purpose

Defines the shape and semantics of `BroadsetElementStyle` — the visual properties persisted on every element. These properties control typography, backgrounds, borders, effects, layout, SVG stroke/fill, **masking, clipping, and 3D transforms**. This spec ensures any consumer can reconstruct the full visual styling vocabulary. It does NOT cover how styles are rendered to DOM (→ `project/spec/renderer/`) or animated (→ `project/spec/playback/`). See [conventions](../../README.md).

**Key structural change:** Visual properties formerly on the `screen` object (`maskType`, `customClipPath`, `clipChildren`, `rotateX`, `rotateY`, `rotateZ`, `translateZ`) are now part of `ElementStyle`. The `screen` object no longer exists. Additionally, `fontWeight` is now a numeric type (100–900), `textAlignment` is a typed union, `borderStyle` is a typed union, `padding` is a 4-tuple of numbers, and `letterSpacing`/`wordSpacing` are numeric values.

---

## Requirements

### Requirement: Opacity (Required)

Every element MUST have `opacity`: a number in the range [0, 1] inclusive. This is the only required style property. Default: `1`. Values outside [0, 1] MUST be rejected by validation.

#### Acceptance Criteria

- [ ] Given an element with default style, opacity is 1
- [ ] Given opacity outside [0, 1], validation fails

---

### Requirement: Typography Properties

The system MUST support these typography properties on text elements:

| Property       | Type                                                        | Default    | Description                        |
| -------------- | ----------------------------------------------------------- | ---------- | ---------------------------------- |
| fontFamily     | string                                                      | (browser)  | CSS font-family value              |
| fontSize       | number                                                      | (browser)  | Font size in the document's unit   |
| fontColor      | string                                                      | (browser)  | CSS color string                   |
| fontWeight     | 100 \| 200 \| 300 \| 400 \| 500 \| 600 \| 700 \| 800 \| 900 | 400        | Numeric weight — no string aliases |
| fontStyle      | `'normal'` \| `'italic'` \| `'oblique'`                     | `'normal'` | Font style                         |
| textAlignment  | `'left'` \| `'center'` \| `'right'` \| `'justify'`          | `'left'`   | Text horizontal alignment          |
| textDecoration | string                                                      | (none)     | CSS text-decoration value          |
| textTransform  | string                                                      | (none)     | CSS text-transform value           |
| letterSpacing  | number                                                      | 0          | Letter spacing in document units   |
| lineHeight     | number \| string                                            | (browser)  | CSS line-height value              |
| wordSpacing    | number                                                      | 0          | Word spacing in document units     |

All typography properties are optional. `fontWeight` MUST be a numeric value (100–900 in steps of 100). String aliases like `'bold'` or `'normal'` are NOT accepted — use `700` and `400` respectively.

#### Acceptance Criteria

- [ ] Given a text element with typography properties set, all are applied to the rendered output
- [ ] Given fontWeight as a number (400, 700), validation succeeds
- [ ] Given fontWeight as a string ('bold'), validation fails
- [ ] Given textAlignment as 'center', validation succeeds
- [ ] Given textAlignment as an arbitrary string, validation fails

---

### Requirement: Text Effect Properties

The system MUST support `textStroke` (CSS text-stroke shorthand) and `textShadow` (CSS text-shadow value) on elements. Both are optional string values.

#### Acceptance Criteria

- [ ] Given an element with a textStroke value, the stroke is applied to rendered text
- [ ] Given an element with a textShadow value, the shadow is applied to rendered text

---

### Requirement: Background Properties

The system MUST support `backgroundColor` (CSS color string) and `backgroundGradient` (CSS gradient value or structured `BroadsetGradient` object) on elements. Both are optional. When both are set, gradient takes visual precedence.

#### Acceptance Criteria

- [ ] Given an element with a backgroundColor, the background is that color
- [ ] Given an element with both backgroundColor and backgroundGradient, the gradient is applied

---

### Requirement: Border Properties

The system MUST support:

- `borderWidth`: numeric, in px (optional)
- `borderColor`: CSS color string (optional)
- `borderRadius`: uniform number or 4-tuple `[topLeft, topRight, bottomRight, bottomLeft]` (optional)
- `borderStyle`: `'none'` | `'solid'` | `'dashed'` | `'dotted'` | `'double'` | `'groove'` | `'ridge'` | `'inset'` | `'outset'` (optional, typed union — no arbitrary strings)

#### Acceptance Criteria

- [ ] Given a uniform borderRadius number, normalization expands it to a 4-tuple of equal values
- [ ] Given a per-corner borderRadius 4-tuple, each corner value is preserved
- [ ] Given borderStyle as a valid union value, validation succeeds
- [ ] Given borderStyle as an arbitrary string, validation fails

---

### Requirement: Visual Effect Properties

The system MUST support `boxShadow` (CSS box-shadow), `filter` (CSS filter function list), `backdropFilter` (CSS backdrop-filter), `mixBlendMode` (typed union of CSS blend modes: `'normal'` | `'multiply'` | `'screen'` | `'overlay'` | `'darken'` | `'lighten'` | `'color-dodge'` | `'color-burn'` | `'hard-light'` | `'soft-light'` | `'difference'` | `'exclusion'` | `'hue'` | `'saturation'` | `'color'` | `'luminosity'`), and `isolation` (`'auto'` | `'isolate'`). All are optional.

#### Acceptance Criteria

- [ ] Given an element with filter and backdropFilter values, both are applied to the rendered output
- [ ] Given mixBlendMode as a valid blend mode union value, validation succeeds
- [ ] Given mixBlendMode as an arbitrary string, validation fails

---

### Requirement: Layout Properties

The system MUST support:

- `padding`: 4-tuple `[top, right, bottom, left]` of non-negative numbers (in document units). NOT a CSS string. Default: `[0, 0, 0, 0]`
- `objectFit`: `'fill'` | `'contain'` | `'cover'` | `'none'` | `'scale-down'` — typed union, not arbitrary string

#### Acceptance Criteria

- [ ] Given padding as a 4-tuple of non-negative numbers, validation succeeds
- [ ] Given negative padding values, validation fails
- [ ] Given objectFit as a valid union value, validation succeeds
- [ ] Given objectFit as an arbitrary string, validation fails

---

### Requirement: SVG Stroke and Fill Properties

The system MUST support SVG-specific properties for path and SVG elements: `stroke` (color), `strokeWidth` (numeric), `strokeDasharray` (pattern string), `strokeDashoffset` (numeric), `strokeLinecap` (`'butt'` | `'round'` | `'square'`), `strokeLinejoin` (`'miter'` | `'round'` | `'bevel'`), `strokeMiterlimit` (numeric, `>= 1`), `strokeOpacity` (0–1), `fill` (color), `fillOpacity` (0–1), `fillRule` (`'nonzero'` | `'evenodd'`). All are optional and animatable. `strokeMiterlimit` MUST reject values below `1` to match the SVG specification minimum.

#### Acceptance Criteria

- [ ] Given a path element with stroke properties, all are applied to the SVG rendering
- [ ] Given an SVG element with a fillRule, the winding rule is applied
- [ ] Given strokeLinecap as an invalid string, validation fails
- [ ] Given strokeMiterlimit equal to or above 1, validation succeeds
- [ ] Given strokeMiterlimit below 1 (including 0 and negative values), validation fails

---

### Requirement: Stroke Arrow Endings

The system MUST support optional arrow endings on both ends of a stroked path or line via `strokeHeadEnd` and `strokeTailEnd`. Each ending is an `ArrowEnd` object containing a required `shape` (`'triangle'` | `'stealth'` | `'diamond'` | `'oval'` | `'none'`), an optional `width` (`'sm'` | `'md'` | `'lg'`), and an optional `length` (`'sm'` | `'md'` | `'lg'`). The discrete vocabulary is chosen to round-trip PPTX `<a:headEnd>` / `<a:tailEnd>`, PDF line-ending styles, SVG `marker-start` / `marker-end`, and PSD shape-layer arrowheads. Arbitrary strings MUST be rejected.

#### Scenario: Triangle arrow tail

- GIVEN a line element with `style: { strokeTailEnd: { shape: 'triangle', width: 'md', length: 'md' } }`
- WHEN the element is rendered
- THEN the line terminates in a medium triangle arrowhead

#### Scenario: Shape is required

- GIVEN an `ArrowEnd` object with `width` but no `shape`
- WHEN the style is validated
- THEN validation fails because `shape` is required

#### Acceptance Criteria

- [ ] Given `strokeHeadEnd` or `strokeTailEnd` with any supported shape keyword, validation succeeds
- [ ] Given `ArrowEnd` with supported `width` and `length` size keywords, validation succeeds
- [ ] Given `ArrowEnd` without a `shape` field, validation fails
- [ ] Given an unknown `shape` keyword, validation fails
- [ ] Given an unknown size keyword for `width` or `length`, validation fails
- [ ] Both endings are independently optional and may be set on the same element

---

### Requirement: Masking and Clipping (from former screen properties)

The style MUST support masking and clipping properties that were previously on the `screen` object:

- `maskType`: `'none'` | `'alpha'` | `'luminance'` | `'custom'` — mask mode. Default: `'none'`
- `customClipPath`: SVG path `d` string or CSS clip-path function (`polygon()`, `circle()`, `ellipse()`, `inset()`, `path()`) for custom clipping shape. Must start with M/m (SVG path) or be a recognized CSS clip-path function if non-empty. Default: `''`
- `clipChildren`: boolean — when true on a group element, child elements are clipped to the group's bounds. Default: `false`

#### Scenario: Custom clip path applied

- GIVEN an element with `style: { maskType: 'custom', customClipPath: 'M 0 0 L 100 0 L 100 100 Z' }`
- WHEN the element is rendered
- THEN the element is clipped to the triangular path

#### Acceptance Criteria

- [ ] Given maskType as a valid union value, validation succeeds
- [ ] Given customClipPath with valid SVG path data, validation succeeds
- [ ] Given customClipPath with valid CSS clip-path function (polygon, circle, etc.), validation succeeds
- [ ] Given clipChildren true on a group, child elements are clipped
- [ ] Given customClipPath with invalid path data, validation fails

---

### Requirement: 3D Transform Properties (from former screen properties)

The style MUST support 3D transform properties that were previously on the `screen` object:

- `rotateX`: numeric, degrees. Default: `0`
- `rotateY`: numeric, degrees. Default: `0`
- `rotateZ`: numeric, degrees. Default: `0`
- `translateZ`: numeric, in document units. Default: `0`

All must be finite numbers. These are separate from the element-level `rotation` (which is the 2D rotation for positioning). These 3D transforms are applied as CSS `transform` functions during rendering.

#### Acceptance Criteria

- [ ] Given rotateX/Y/Z as finite numbers, validation succeeds
- [ ] Given translateZ as a finite number, validation succeeds
- [ ] Given NaN or Infinity for any 3D transform, validation fails
- [ ] Given default values (all 0), no 3D transform is rendered

---

### Requirement: Structured Gradient Model

Background gradients MUST support a structured `BroadsetGradient` object format in addition to CSS gradient strings. A `BroadsetGradient` MUST contain `type` (`'linear'` | `'radial'` | `'conic'`), `stops` (array of `{ color: string, position: number }` with at least 2 entries, positions in ascending order 0–100), and type-specific geometry: `angle` (0–360 degrees) for linear gradients, `center` (`[x%, y%]`) for radial and conic gradients.

#### Acceptance Criteria

- [ ] Given a structured linear gradient, the renderer produces a correct CSS `linear-gradient` string
- [ ] Given a structured radial gradient with center, the renderer produces a correct CSS `radial-gradient` string
- [ ] Given a plain CSS gradient string, it is used directly
- [ ] Given fewer than 2 stops, validation fails

---

### Requirement: Variable Font Variation Settings

The element style MUST support an optional `fontVariationSettings` field containing a CSS `font-variation-settings` value (e.g., `"'wght' 450, 'wdth' 80"`). This property is gated by the `typography` capability flag.

#### Acceptance Criteria

- [ ] Given `fontVariationSettings` with valid axis tags and numeric values, the CSS property is applied
- [ ] Given no `fontVariationSettings` field, the CSS property is omitted

---

### Requirement: Text Writing Mode

The element style MUST support an optional `writingMode` field with values `'horizontal-tb'` (default), `'vertical-rl'`, or `'vertical-lr'`. This property is gated by the `typography` capability flag.

#### Acceptance Criteria

- [ ] Given `writingMode: 'vertical-rl'`, the CSS `writing-mode` property is set
- [ ] Given no `writingMode` field, browser default applies
- [ ] Given `writingMode` on a non-text element, the property is not editable via capability gating

---

### Requirement: Vertical Text Alignment

The element style MUST support an optional `verticalAlignment` field with values `'top'` (default), `'middle'`, or `'bottom'`. This property controls the vertical positioning of text content within the element's bounding box. It is gated by the `typography` capability flag. Renderers MUST implement this using CSS flexbox or equivalent layout — `'top'` maps to `align-items: flex-start`, `'middle'` to `align-items: center`, `'bottom'` to `align-items: flex-end`.

#### Scenario: Text vertically centered

- GIVEN a text element with `style: { verticalAlignment: 'middle' }` and `height: 200`
- AND the rendered text content is shorter than 200px
- WHEN the element is rendered
- THEN the text is vertically centered within the bounding box

#### Scenario: Default alignment is top

- GIVEN a text element with no `verticalAlignment` set
- WHEN the element is rendered
- THEN the text is aligned to the top of the bounding box

#### Scenario: Bottom alignment

- GIVEN a text element with `style: { verticalAlignment: 'bottom' }`
- WHEN the element is rendered
- THEN the text is pushed to the bottom of the bounding box

#### Scenario: Non-text element ignores verticalAlignment

- GIVEN a rectangle element with `style: { verticalAlignment: 'middle' }`
- WHEN the element is rendered
- THEN the property has no effect (gated by typography capability)

#### Acceptance Criteria

- [ ] Given `verticalAlignment: 'top'` or absent, text aligns to the top of the bounding box
- [ ] Given `verticalAlignment: 'middle'`, text is vertically centered in the bounding box
- [ ] Given `verticalAlignment: 'bottom'`, text aligns to the bottom of the bounding box
- [ ] Given `verticalAlignment` as an invalid string, validation fails
- [ ] Given `verticalAlignment` on a non-text element, the property has no visual effect

---

### Requirement: Trim Path Properties

Path and SVG elements MUST support optional trim path properties for animated line-draw effects:

- `trimStart`: number in [0, 1] — the starting point of the visible stroke as a fraction of total path length. Default: `0`
- `trimEnd`: number in [0, 1] — the ending point of the visible stroke. Default: `1`
- `trimOffset`: number in [0, 1] — rotates the start/end points around the path. Default: `0`

The renderer MUST implement trim path by computing the total path length (via `getTotalLength()`) and setting `strokeDasharray` and `strokeDashoffset` CSS properties accordingly. When both `trimStart` and `trimEnd` are at defaults (0 and 1), no dasharray modification is applied. These properties are gated by the `svgStrokeFill` capability flag.

All three properties MUST be animatable as numeric keyframe values for line-draw reveal effects.

#### Scenario: Line-draw reveal

- GIVEN a path element with `style: { trimStart: 0, trimEnd: 0 }` animated to `trimEnd: 1` over 1000ms
- WHEN animation plays
- THEN the path stroke progressively draws from empty to fully visible

#### Scenario: Partial path visibility

- GIVEN a path element with `style: { trimStart: 0.25, trimEnd: 0.75 }`
- WHEN the element is rendered
- THEN only the middle 50% of the path stroke is visible

#### Scenario: Trim offset rotation

- GIVEN a path element with `style: { trimStart: 0, trimEnd: 0.5, trimOffset: 0.25 }`
- WHEN the element is rendered
- THEN the visible portion starts 25% along the path and extends 50% from there

#### Scenario: Non-path element ignores trim properties

- GIVEN a rectangle element with `style: { trimStart: 0.5, trimEnd: 1 }`
- WHEN the element is rendered
- THEN the trim properties have no effect (gated by svgStrokeFill capability)

#### Acceptance Criteria

- [ ] Given `trimStart: 0` and `trimEnd: 1` (defaults), the full path stroke is visible
- [ ] Given `trimStart: 0` and `trimEnd: 0`, no stroke is visible
- [ ] Given `trimEnd` animated from 0 to 1, the stroke progressively draws
- [ ] Given `trimStart: 0.25` and `trimEnd: 0.75`, only the middle 50% is visible
- [ ] Given `trimOffset: 0.25`, the visible portion is rotated 25% around the path
- [ ] Given trim values outside [0, 1], validation fails
- [ ] Given trim properties on a non-path element, they have no visual effect

---

## Spec Gaps

_None — all requirements have acceptance criteria._

---

## Non-Goals

- How styles are animated between keyframes → see `project/spec/playback/interpolation.md`
- How styles are rendered to DOM → see `project/spec/renderer/spec.md`
- Property capability gating per element type → see `project/spec/editor/editing.md`
