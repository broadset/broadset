# Model — Element Style Contract

## Purpose

Defines the shape and semantics of `BroadsetElementStyle` — the visual properties persisted on every element. These properties control typography, backgrounds, borders, effects, layout, SVG stroke/fill, **masking, clipping, and 3D transforms**. This spec ensures any consumer can reconstruct the full visual styling vocabulary. It does NOT cover how styles are rendered to DOM (→ `project/spec/renderer/`) or animated (→ `project/spec/playback/`). See [conventions](../../README.md).

**Key structural change:** Visual properties formerly on the `screen` object (`maskType`, `customClipPath`, `clipChildren`, `rotateX`, `rotateY`, `rotateZ`, `translateZ`) are now part of `ElementStyle`. The `screen` object no longer exists. Additionally, `fontWeight` is now a numeric type (100–900), `textAlignment` is a typed union, `borderStyle` is a typed union, `padding` is a 4-tuple of numbers, and `letterSpacing`/`wordSpacing` are numeric values.

---

## Requirements

### Requirement: Color values use `BroadsetColor`

Every color-valued style field on an element style or settings palette is a `BroadsetColor` — a discriminated union owned by [`packages/model/src/broadset-color.ts`](../../../packages/model/src/broadset-color.ts):

```ts
type BroadsetColor =
  | { kind: 'rgb'; hex: `#${string}`; space?: BroadsetColorSpace; originalColor?: string }
  | { kind: 'theme'; slot: ThemeSlot; mods?: ColorMods };

type BroadsetColorSpace = 'srgb' | 'display-p3' | 'oklch' | 'oklab';
type ThemeSlot =
  | 'accent1' | 'accent2' | 'accent3' | 'accent4' | 'accent5' | 'accent6'
  | 'lt1' | 'lt2' | 'dk1' | 'dk2' | 'hlink' | 'folHlink';
type ColorMods = { lumMod?: number; lumOff?: number; tint?: number; shade?: number; alpha?: number };
```

`originalColor` preserves the source CSS string verbatim so non-sRGB inputs (`oklch(...)`, `color(display-p3 ...)`) round-trip without flattening; the `hex` field is always a canonical sRGB approximation. Theme references resolve through a `ThemePalette` at render or export time, with `mods` applied by `_shared/color/applyMods` (Phase 2).

Per IO-D-05 in [decisions.md](../../implementation/decisions.md), Broadset MUST NOT silently downgrade color spaces or modifiers — preflight surfaces unsupported targets to the user.

#### Acceptance Criteria

- [ ] `BroadsetColor` is a discriminated union with `kind: 'rgb'` and `kind: 'theme'` branches
- [ ] An RGB color preserves its source CSS string in `originalColor` when `space` is non-sRGB
- [ ] A theme color references one of the 12 OOXML theme slots and is rejected for any other slot value
- [ ] `ColorMods` values outside `[0, 1]` are rejected by validation
- [ ] `colorToCss(themeColor, ctx)` throws when the resolution context lacks a `ThemePalette` (no silent downgrade)
- [ ] `colorToCss(themeColorWithMods, ctx)` throws when `ctx.applyMods` is not provided (mods application is Phase 2 owned)
- [ ] `parseColor(cssString)` returns a `BroadsetColor` for any sRGB / Color Level 4 CSS color literal accepted by `normalizeColor`

#### Spec Gaps

- Color-valued fields on `BroadsetElementStyle` (`fontColor`, `backgroundColor`, `borderColor`, `stroke`, `fill`, gradient stop colors) are still typed as `string` in the persisted model. The conversion helper that flips those fields (`migrateLegacyColor`, see below) lands in the second commit of Phase 1 unit #3; the field-type migration itself lands in the third commit — the type tables below describe the in-flight target shape.

---

### Requirement: Legacy color migration helper

The model MUST expose a one-site `migrateLegacyColor(input: string | null | undefined) → BroadsetColor | undefined` helper under `packages/model/src/migrations/` so the eventual field-type migration can be performed at a single place (the document loader's initial validation pass) rather than sprinkled across consumers.

Contract:

- Absent inputs (`undefined`, `null`, empty strings, whitespace-only strings) MUST map to `undefined` — legacy fixtures treat `''` as "unset" and that semantics MUST survive migration.
- Any CSS color literal accepted by `parseColor` (hex, `rgb()`, `rgba()`, `hsl()`, `hsla()`, CSS named colors, Color Level 4 literals) MUST become an `RgbBroadsetColor`. Non-sRGB inputs (`oklch(...)`, `oklab(...)`, `color(display-p3 ...)`) MUST additionally set `space` and preserve the source syntax in `originalColor` per IO-D-05.
- Legacy strings MUST NEVER produce `kind: 'theme'` output. Theme references only enter the model through importers that know the source theme palette.
- Unparseable strings MUST throw. Per IO-D-18 ("no silent drops") the document loader is responsible for surfacing the failure as an import warning; the migrator MUST NOT substitute a neutral fallback hex.

#### Acceptance Criteria

- [ ] Given `undefined` or `null`, the migrator returns `undefined`
- [ ] Given an empty or whitespace-only string, the migrator returns `undefined`
- [ ] Given a `#RRGGBB` or `#RRGGBBAA` hex, the migrator returns `{ kind: 'rgb', hex }` with the lowercase hex value
- [ ] Given a 3- or 4-digit hex shorthand, the migrator expands the hex to canonical 6/8-digit form
- [ ] Given an `rgb()` / `rgba()` / `hsl()` / `hsla()` literal, the migrator returns an sRGB `BroadsetColor` with a valid hex
- [ ] Given a CSS named color (including `transparent`), the migrator returns its canonical hex form
- [ ] Given whitespace or mixed-case input, the migrator normalizes the result
- [ ] Given a non-sRGB Color Level 4 literal, the migrator tags `space` and preserves the source in `originalColor`
- [ ] Given an unparseable string, the migrator throws (no silent fallback)
- [ ] Every successful output passes `broadsetColorSchema`
- [ ] The migrator never emits `kind: 'theme'` output for any string input

---

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

### Requirement: Structured Fill (`BroadsetFill`)

Per IO-D-04 and Phase 1 unit #8, the canonical fill model is a `BroadsetFill` discriminated union. The flat `fill`, `backgroundColor`, and `backgroundGradient` fields on `BroadsetElementStyle` have been replaced by a single `fill: BroadsetFill` field — the unified paint serves both SVG-paint (paths, svg-type elements) and CSS-container-background (rectangles, ellipses, groups) consumers.

```ts
type BroadsetFill =
  | { kind: 'none' }
  | { kind: 'solid'; color: BroadsetColor }
  | { kind: 'gradient'; gradient: BroadsetGradient }
  | { kind: 'pattern'; assetId: string; repeat?: PatternRepeat; transform?: AffineMatrix }
  | {
      kind: 'picture';
      assetId: string;
      mode: 'stretch' | 'tile';
      preserveAspectRatio?: 'none' | 'meet' | 'slice';
      tile?: TileInfo;
    };

type PatternRepeat = 'repeat' | 'repeat-x' | 'repeat-y' | 'no-repeat';
type AffineMatrix = readonly [number, number, number, number, number, number]; // 2x3
type TileInfo = { scaleX?: number; scaleY?: number; offsetX?: number; offsetY?: number };
```

Contract:

- The discriminator is closed. Unknown `kind` values MUST be rejected.
- `solid.color` MUST be a full `BroadsetColor` — not a bare string — so theme references and non-sRGB literals survive the round-trip per IO-D-05.
- `pattern.repeat` is restricted to the four CSS / SVG keywords above; arbitrary strings are rejected so the renderer never receives a repeat value it cannot implement.
- `picture.mode` is closed to `stretch` or `tile`. Importers MUST bake any crop rectangle into the source image asset at import time — the persisted model does not carry crop geometry.
- `pattern.assetId` and `picture.assetId` reference an entry in the shared asset registry. Both fields are required non-empty strings; missing them is a schema error.

Factories `noneFill()`, `solidFill(color)`, `gradientFill(gradient)`, `patternFill(options)`, and `pictureFill(options)` produce canonical shapes. Type guards `isNoneFill` / `isSolidFill` / `isGradientFill` / `isPatternFill` / `isPictureFill` narrow the union for downstream consumers so `switch (fill.kind)` paths can drop the `default:` fallback.

#### Acceptance Criteria

- [ ] Given every valid fill kind (`none`, `solid`, `gradient`, `pattern`, `picture`), schema validation succeeds
- [ ] Given a fill with an unknown `kind`, schema validation fails
- [ ] Given `solid` without a structured `BroadsetColor` (missing, or a bare string), schema validation fails
- [ ] Given `pattern` without `assetId`, schema validation fails
- [ ] Given `picture` without `assetId` or without `mode`, schema validation fails
- [ ] Given `pattern.repeat` set to an unknown keyword, schema validation fails
- [ ] Given `picture.mode` set to anything other than `stretch` or `tile`, schema validation fails
- [ ] Each factory (`noneFill` / `solidFill` / `gradientFill` / `patternFill` / `pictureFill`) produces the canonical shape for its kind and preserves optional fields when provided
- [ ] Each type guard returns `true` for the matching kind and `false` for every other kind

---

### Requirement: Legacy fill migration helper

The model MUST expose a one-site `migrateLegacyFill(input) → BroadsetFill` helper under `packages/model/src/migrations/` so the eventual field-type migration — which replaces the flat `fill`, `backgroundColor`, and `backgroundGradient` fields on `BroadsetElementStyle` with a single `fill: BroadsetFill` — can be performed at the document loader's initial validation pass rather than sprinkled across renderer / editor / formats / ui / demo consumers.

```ts
interface LegacyFillInput {
  readonly fill?: BroadsetColor | undefined;
  readonly backgroundColor?: BroadsetColor | undefined;
  readonly backgroundGradient?: BroadsetGradient | string | undefined;
}

function migrateLegacyFill(input: LegacyFillInput): BroadsetFill;
```

Contract:

- Priority (highest to lowest): structured `backgroundGradient` → `fill` → `backgroundColor`. When none of the three is set, the migrator returns `noneFill()`.
- Structured `backgroundGradient` → `gradientFill(backgroundGradient)`. The input gradient MUST already be a `BroadsetGradient`; CSS-string gradients are rejected (see below).
- A `fill` `BroadsetColor` becomes `solidFill(fill)`. SVG-paint semantics win over CSS-container `backgroundColor` so path / svg-typed elements migrate to `solid`.
- A `backgroundColor` `BroadsetColor` with no higher-precedence paint becomes `solidFill(backgroundColor)`.
- Legacy CSS-string `backgroundGradient` values (e.g. `"linear-gradient(to right, red, blue)"`) MUST throw. Per IO-D-18 ("no silent drops") the caller / document loader surfaces the failure as an import warning; the migrator MUST NOT substitute `noneFill()` or a neutral gradient fallback. The 8c field-type flip removes the string form from the model entirely.
- The migrator MUST preserve `BroadsetColor` identity — including `kind: 'theme'` references and `originalColor` preservation for non-sRGB sources — so IO-D-05 round-trip guarantees survive migration.
- The migrator MUST NOT emit `pattern` or `picture` kinds. Those fills only enter the model through importers that know the asset registry; a legacy style has no way to encode them.
- Every successful output MUST pass `broadsetFillSchema`.

#### Acceptance Criteria

- [ ] Given an empty input (no `fill`, `backgroundColor`, or `backgroundGradient`), the migrator returns `noneFill()`
- [ ] Given only `backgroundColor`, the migrator returns `solidFill(backgroundColor)`
- [ ] Given only `fill`, the migrator returns `solidFill(fill)`
- [ ] Given only a structured `backgroundGradient`, the migrator returns `gradientFill(backgroundGradient)`
- [ ] Given both `fill` and `backgroundColor`, the migrator chooses `fill` (SVG-paint precedence)
- [ ] Given both `backgroundColor` and a structured `backgroundGradient`, the migrator chooses the gradient
- [ ] Given all three set, the migrator chooses the structured gradient
- [ ] Given `backgroundGradient` as a non-empty CSS string, the migrator throws
- [ ] Given `backgroundGradient` as an empty-or-whitespace string, the migrator treats it as absent
- [ ] A theme-slot `BroadsetColor` survives migration unchanged (no conversion to `rgb`)
- [ ] A non-sRGB `BroadsetColor` (with `space` and `originalColor`) survives migration unchanged
- [ ] A gradient whose stops reference theme colors survives migration with the stops intact
- [ ] Every successful output passes `broadsetFillSchema`

---

### Requirement: Structured Filter Primitives (`FilterStack`)

Per IO-D-03 and Phase 1 unit #6, the canonical filter model is a structured `FilterStack` (discriminated-union array) — the opaque `filter` / `backdropFilter` CSS strings currently on `BroadsetElementStyle` are a derived view. PSD's ten layer effects, SVG `<filter>` primitives, and PDF ExtGState blend chains all map into this union symmetrically so importers can round-trip without flattening.

```ts
type FilterPrimitive =
  | { kind: 'drop-shadow'; offsetX: number; offsetY: number; blur: number; color: BroadsetColor }
  | { kind: 'blur'; stdDeviation: number }
  | { kind: 'color-matrix'; matrix: readonly number[] } // 4x5 or 5x5 (SVG feColorMatrix)
  | { kind: 'brightness' | 'contrast' | 'saturate' | 'hue-rotate' | 'grayscale' | 'sepia' | 'invert' | 'opacity'; amount: number }
  | { kind: 'custom-svg'; svg: string }; // escape hatch
type FilterStack = readonly FilterPrimitive[];
```

Contract:

- The primitive discriminator set (`SIMPLE_FILTER_KINDS` plus `'drop-shadow'`, `'blur'`, `'color-matrix'`, `'custom-svg'`) is closed. Unknown kinds MUST be rejected.
- `blur.stdDeviation` and `drop-shadow.blur` MUST be non-negative (SVG Gaussian radii cannot be negative).
- `drop-shadow.color` MUST be a full `BroadsetColor` — theme references and non-sRGB literals survive the round-trip per IO-D-05.
- `color-matrix.matrix` is preserved verbatim (SVG's feColorMatrix accepts either 4x5 or 5x5 layouts; the model does not second-guess the caller).
- `custom-svg.svg` is preserved verbatim and sanitized at the renderer boundary, not at the model boundary.

A companion `filterStackToCss(stack, ctx?)` resolver renders the primitives to a CSS filter string for the renderer. Primitives without a direct CSS function (`color-matrix`, `custom-svg`) are skipped by the resolver — the renderer routes those through an SVG `<filter>` reference. `drop-shadow` with a theme color requires a `ColorResolutionContext.palette`; absence throws per IO-D-05.

The field-type flip on `BroadsetElementStyle.filter` / `backdropFilter` (from `string` to `FilterStack`) lands in a later sub-commit once renderer / editor consumers are updated. This requirement defines the primitive surface that the flip will consume.

#### Acceptance Criteria

- [ ] Given every primitive kind (`drop-shadow`, `blur`, `color-matrix`, `custom-svg`, and all eight amount-based kinds), schema validation succeeds
- [ ] Given a primitive with an unknown `kind`, schema validation fails
- [ ] Given `blur` or `drop-shadow` with a negative `stdDeviation` / `blur`, schema validation fails
- [ ] Given a `drop-shadow` missing `color` (or any other required field), schema validation fails
- [ ] Given an empty stack, `filterStackToCss` returns the empty string
- [ ] Given a stack of amount-based primitives, `filterStackToCss` emits `fn(amount)` tokens in order; `hue-rotate` additionally appends the `deg` unit
- [ ] Given `blur(stdDeviation)`, `filterStackToCss` emits `blur(<stdDeviation>px)` with the CSS pixel unit
- [ ] Given `drop-shadow`, `filterStackToCss` emits `drop-shadow(<x>px <y>px <blur>px <resolved-color>)`
- [ ] Given primitives without a direct CSS equivalent (`color-matrix`, `custom-svg`), `filterStackToCss` skips them silently
- [ ] Given a `drop-shadow` with a theme color but no palette context, `filterStackToCss` throws
- [ ] `SIMPLE_FILTER_KINDS` enumerates exactly `brightness`, `contrast`, `saturate`, `hue-rotate`, `grayscale`, `sepia`, `invert`, `opacity`

---

### Requirement: Text Fidelity Fields (SVG text attributes)

The element style MUST support the remaining SVG text attributes that PDF, PPTX, and PSD importers need to round-trip through Broadset without information loss. `wordSpacing`, `textTransform`, and `lineHeight` are already defined under *Typography Properties*; this requirement adds the last three fields called for in Phase 1 unit #11:

- `textAnchor?: 'start' | 'middle' | 'end'` — mirrors SVG `text-anchor`. Drives horizontal alignment of the text baseline relative to the element's reference point. The three values are exhaustive; arbitrary strings MUST be rejected.
- `textLength?: number` — mirrors SVG `textLength`. A non-negative, finite number (in the canvas-declared unit) that pins the displayed advance to a specific length. Negative, `NaN`, or `Infinity` MUST be rejected.
- `lengthAdjust?: 'spacing' | 'spacingAndGlyphs'` — mirrors SVG `lengthAdjust`. Controls how `textLength` is distributed between glyph spacing (`'spacing'`, the SVG default) and glyph stretching (`'spacingAndGlyphs'`). Arbitrary strings MUST be rejected.

All three fields are optional. Absent values parse as `undefined` so exporters can distinguish "user did not set" from "user explicitly chose start / zero / spacing" — relevant for preflight and for deciding whether to emit the SVG attribute at all.

#### Acceptance Criteria

- [ ] Given `textAnchor` set to `start`, `middle`, or `end`, validation succeeds and the value round-trips verbatim
- [ ] Given `textAnchor` set to any other string (including `center` or the empty string), validation fails
- [ ] Given `textLength` set to a non-negative finite number (including zero), validation succeeds
- [ ] Given `textLength` set to a negative, NaN, or infinite number, validation fails
- [ ] Given `lengthAdjust` set to `spacing` or `spacingAndGlyphs`, validation succeeds and the value round-trips verbatim
- [ ] Given `lengthAdjust` set to any other string, validation fails
- [ ] Given a style with none of these fields provided, the parsed result exposes them as `undefined`

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

Background gradients MUST support a structured `BroadsetGradient` object format in addition to CSS gradient strings. A `BroadsetGradient` MUST contain `type` (`'linear'` | `'radial'` | `'conic'`), `stops` (array of `{ color: string, position: number }` with at least 2 entries, positions in ascending order 0–100), and type-specific geometry: `angle` (0–360 degrees) for linear gradients, `center` (`[x%, y%]`) for radial and conic gradients, and `startAngle` (0–360 degrees, conic-only) for CSS `conic-gradient(from <angle>, …)` support. `startAngle` is ignored on linear and radial gradients; out-of-range values MUST be rejected by validation.

#### Acceptance Criteria

- [ ] Given a structured linear gradient, the renderer produces a correct CSS `linear-gradient` string
- [ ] Given a structured radial gradient with center, the renderer produces a correct CSS `radial-gradient` string
- [ ] Given a plain CSS gradient string, it is used directly
- [ ] Given fewer than 2 stops, validation fails
- [ ] Given a conic gradient with `startAngle` in [0, 360], validation succeeds
- [ ] Given `startAngle` below 0 or above 360, validation fails

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
