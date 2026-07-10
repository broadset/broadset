# Interpolation Specification

## Purpose

Defines how the system applies easing curves to progress values and interpolates between keyframe property values of various types (numbers, colors, paths, strings, booleans).

---

## Requirements

### Requirement: Easing Presets

The system MUST support the named easing presets `linear`, `ease`, `ease-in`, `ease-out`, `ease-in-out`, and `step`. The `ease` preset is equivalent to `cubic-bezier(0.25, 0.1, 0.25, 1.0)`. All presets MUST return `0` at `t=0` and `1` at `t=1`. The `step` preset MUST hold `0` until exactly `t=1`, then snap to `1`. At exactly `t=1.0`, the step function MUST return the target value (1). For all `t < 1.0`, the step function MUST return the source value (0).

#### Scenario: Linear easing identity

- GIVEN an easing mode of `linear`
- WHEN progress `t=0.5` is applied
- THEN the result is `0.5`

#### Scenario: Step easing holds until end

- GIVEN an easing mode of `step`
- WHEN progress `t=0.99` is applied
- THEN the result is `0`
- AND at `t=1` the result is `1`

#### Acceptance Criteria

- [ ] Given an easing mode of `linear`, the result is `0.5`
- [ ] Given an easing mode of `step`, the result is `0` and at `t=1` the result is `1`

---

### Requirement: Cubic-Bezier Easing

The system MUST parse `cubic-bezier(x1,y1,x2,y2)` strings and SHOULD use an efficient curve solver (e.g., Newton's method) to evaluate the bezier curve. The implementation MAY use any algorithm that produces correct results within a tolerance of 1e-6. Malformed cubic-bezier strings MUST fall back to linear.

#### Scenario: Valid cubic-bezier curve

- GIVEN an easing mode of `cubic-bezier(0.42,0,1,1)` (ease-in-like)
- WHEN progress `t=0.5` is applied
- THEN the result is less than `0.5`

#### Scenario: Malformed string falls back to linear

- GIVEN an unknown easing string
- WHEN progress `t=0.5` is applied
- THEN the result is `0.5`

#### Acceptance Criteria

- [ ] Given an easing mode of `cubic-bezier(0.42,0,1,1)` (ease-in-like), the result is less than `0.5`
- [ ] Given an unknown easing string, the result is `0.5`

---

### Requirement: Input Clamping

The system MUST clamp easing input `t` to `[0, 1]`. Values below zero MUST produce `0`; values above one MUST produce `1`.

#### Scenario: Negative t clamped

- GIVEN any easing mode
- WHEN `t=-0.5` is applied
- THEN the result is `0`

#### Acceptance Criteria

- [ ] Given any easing mode, the result is `0`

---

### Requirement: Value Interpolation Type Dispatch

The system MUST interpolate values based on their type: numbers via linear lerp, hex color strings via OKLab perceptual color space, numeric strings as numbers returning strings, number arrays element-wise, and all other types via step (hold from-value until `t=1`).

#### Scenario: Number lerp

- GIVEN from=`0` and to=`100`
- WHEN interpolated at `t=0.5`
- THEN the result is `50`

#### Scenario: Boolean step

- GIVEN from=`true` and to=`false`
- WHEN interpolated at `t=0.5`
- THEN the result is `true`
- AND at `t=1` the result is `false`

#### Scenario: Numeric string lerp

- GIVEN from=`'1'` and to=`'0'`
- WHEN interpolated at `t=0.5`
- THEN the result is the string `'0.5'`

#### Acceptance Criteria

- [ ] Given from=`0` and to=`100`, the result is `50`
- [ ] Given from=`true` and to=`false`, the result is `true` and at `t=1` the result is `false`
- [ ] Given from=`'1'` and to=`'0'`, the result is the string `'0.5'`

---

### Requirement: OKLab Color Interpolation

The system MUST interpolate hex colors in the OKLab perceptual color space. It MUST support 3, 4, 6, and 8-digit hex formats. Alpha channels MUST be interpolated linearly. After OKLab→RGB conversion, output RGB channel values MUST be clamped to the [0, 255] integer range to prevent NaN or out-of-gamut hex digits in output.

#### Scenario: Identical colors round-trip

- GIVEN from=`#ff0000` and to=`#ff0000`
- WHEN interpolated at any `t`
- THEN the result is `#ff0000`

#### Scenario: Alpha interpolation

- GIVEN from=`#ff000000` and to=`#ff0000ff`
- WHEN interpolated at `t=0.5`
- THEN the result has a partial alpha value

#### Scenario: Gamut boundary clamping

- GIVEN saturated color pairs (e.g. red→blue)
- WHEN interpolated at `t=0.5`
- THEN the result is a valid hex string with no `NaN` digits

#### Acceptance Criteria

- [ ] Given from=`#ff0000` and to=`#ff0000`, the result is `#ff0000`
- [ ] Given from=`#ff000000` and to=`#ff0000ff`, the result has a partial alpha value
- [ ] Given saturated color pairs (e.g. red→blue), the result is a valid hex string with no `NaN` digits

---

### Requirement: Path Morphing

The system MUST interpolate SVG path coordinates element-wise and reassemble a valid `d` attribute string from an SVG command template. Coordinate arrays of different lengths MUST be rejected with an error. Coordinates MUST be rounded to 2 decimal places.

#### Scenario: Triangle path at midpoint

- GIVEN a command template `['M', 'L', 'Z']` with from and to coordinates
- WHEN interpolated at `t=0.5`
- THEN coordinates are element-wise midpoints and output is a valid `d` string

#### Scenario: Mismatched coordinate lengths rejected

- GIVEN coordinate arrays of different lengths
- WHEN interpolation is attempted
- THEN an error is thrown

#### Acceptance Criteria

- [ ] Given a command template `['M', 'L', 'Z']` with from and to coordinates, coordinates are element-wise midpoints and output is a valid `d` string
- [ ] Given coordinate arrays of different lengths, an error is thrown

---

### Requirement: Property Interpolation

The system MUST interpolate all properties between two keyframes, applying per-property easing from the from-keyframe's interpolation mode. Properties present only in the from-keyframe MUST be held at their from-value. Path morphing MUST be used when `pathCommands` are present.

#### Scenario: Multi-property interpolation with mixed easing

- GIVEN from-keyframe with `opacity` (linear) and `translateX` (ease-in)
- WHEN interpolated at `t=0.5`
- THEN `opacity` is `0.5` and `translateX` reflects the ease-in curve

#### Scenario: Path morphing via pathCommands

- GIVEN keyframes with `pathCommands` and coordinate arrays
- WHEN interpolated at `t=0.5`
- THEN the result is typed structured spatial-path geometry with midpoint coordinates and stable topology

#### Acceptance Criteria

- [ ] Given from-keyframe with `opacity` (linear) and `translateX` (ease-in), `opacity` is `0.5` and `translateX` reflects the ease-in curve
- [ ] Given compatible structured spatial-path keyframes, interpolation returns typed midpoint geometry with stable point/segment identity

---

### Requirement: Hex-Only Color Input Guarantee

Color interpolation functions MUST accept only hexadecimal color strings (`#RGB`, `#RGBA`, `#RRGGBB`, `#RRGGBBAA`). All other color formats (named colors, `rgb()`, `hsl()`, etc.) are normalized to hex at the model boundary before reaching the playback engine. If a non-hex color string is received, the interpolation function MUST return the `from` value unchanged.

#### Scenario: Valid hex colors produce a hex result

- GIVEN two hex colors `#ff0000` and `#0000ff`
- WHEN interpolation runs at `t=0.5`
- THEN the result is a valid hex color string representing the OKLab midpoint

#### Scenario: Non-hex input returns from value unchanged

- GIVEN a `from` color of `rgb(255,0,0)` (non-hex format)
- WHEN interpolation runs at any `t`
- THEN the `from` value is returned unchanged

#### Acceptance Criteria

- [ ] Given two valid hex colors, interpolation produces a valid hex result
- [ ] Given a non-hex color format as input, the from value is returned unchanged

---

### Requirement: Spring Easing Function

The interpolation system MUST evaluate spring-based easing curves for the `'spring(stiffness, damping, mass)'` interpolation mode and the named spring presets (`'spring-gentle'`, `'spring-bouncy'`, `'spring-stiff'`). The spring function MUST produce a normalized progress value (0 to ~1, with possible overshoot) for a given time fraction `t` (0–1). The spring simulation models a critically/under-damped harmonic oscillator: `x(t) = 1 - e^(-damping*t/2mass) * cos(ωt)` where `ω = sqrt(stiffness/mass - (damping/2mass)^2)`. The function MUST settle to the target value (within 0.001 tolerance) by `t=1`. Named presets resolve to fixed parameter values:

| Preset          | Stiffness | Damping | Mass |
| --------------- | --------- | ------- | ---- |
| `spring-gentle` | 100       | 20      | 1    |
| `spring-bouncy` | 400       | 10      | 1    |
| `spring-stiff`  | 500       | 30      | 1    |

#### Scenario: Spring-bouncy produces overshoot

- GIVEN interpolation mode `'spring-bouncy'` and numeric values 0 → 100
- WHEN interpolated at t=0.3
- THEN the result exceeds 100 (overshoot due to low damping)

#### Scenario: Spring-stiff settles quickly

- GIVEN interpolation mode `'spring-stiff'` and numeric values 0 → 100
- WHEN interpolated at t=0.8
- THEN the result is within 1 unit of 100 (fast settle)

#### Scenario: Spring-gentle smooth deceleration

- GIVEN interpolation mode `'spring-gentle'` and numeric values 0 → 100
- WHEN interpolated at t=0.5
- THEN the result is between 0 and 100 with no overshoot (high damping)

#### Scenario: Custom spring parameters

- GIVEN interpolation mode `'spring(300, 15, 1)'` and numeric values 0 → 200
- WHEN interpolated at t=1.0
- THEN the result is within 0.2 units of 200 (settled)

#### Acceptance Criteria

- [ ] Given `'spring-bouncy'`, interpolation exhibits overshoot past the target value
- [ ] Given `'spring-stiff'`, interpolation settles to within tolerance of the target by t=0.8
- [ ] Given `'spring-gentle'`, interpolation progresses smoothly without overshoot
- [ ] Given custom spring parameters, the decay curve matches the harmonic oscillator model
- [ ] Given any spring mode at t=1.0, the result is within 0.001 of the target value

---

### Requirement: Counting Text Interpolation

The interpolation system MUST support a `'counting'` interpolation mode for keyframe properties where both the `from` and `to` values are numeric strings. When `'counting'` mode is active, the system MUST parse both values as numbers, linearly interpolate the numeric value, and format the result back as a string. An optional `countingFormat` on the keyframe property specifies formatting: `decimalPlaces` (integer ≥ 0, default 0), `thousandsSeparator` (string, default `''`), `prefix` (string, default `''`), and `suffix` (string, default `''`). When either `from` or `to` is not a valid numeric string, the system MUST fall back to discrete value switching (from value until t≥1, then to value).

#### Scenario: Integer counting

- GIVEN `from: '0'`, `to: '100'`, interpolation mode `'counting'` with default format
- WHEN interpolated at t=0.5
- THEN the result is `'50'`

#### Scenario: Counting with decimal places

- GIVEN `from: '0'`, `to: '99.9'`, mode `'counting'`, `countingFormat: { decimalPlaces: 1 }`
- WHEN interpolated at t=0.5
- THEN the result is `'50.0'`

#### Scenario: Counting with prefix and suffix

- GIVEN `from: '0'`, `to: '1000'`, mode `'counting'`, `countingFormat: { prefix: '$', suffix: 'k', thousandsSeparator: ',' }`
- WHEN interpolated at t=0.5
- THEN the result is `'$500k'`

#### Scenario: Non-numeric fallback to discrete

- GIVEN `from: 'Hello'`, `to: 'World'`, mode `'counting'`
- WHEN interpolated at t=0.5
- THEN the result is `'Hello'` (discrete — from value until t≥1)

#### Acceptance Criteria

- [ ] Given two numeric strings with `'counting'` mode, the interpolated value is a formatted numeric string
- [ ] Given `decimalPlaces: 2`, the result has exactly 2 decimal places
- [ ] Given prefix and suffix in countingFormat, they are prepended and appended to the result
- [ ] Given non-numeric from or to value, counting falls back to discrete switching

---

## Spec Gaps

- [x] **Hex-Only Color Input Guarantee:** Test coverage exists — `returns from value unchanged for non-hex input` and `returns from value unchanged for named colors` in `interpolation.test.ts`.

---

## Non-Goals

- Timeline computation → see [timeline.md](timeline.md)
- DOM playback and style writing → see [playback.md](playback.md)
