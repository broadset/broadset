# Interpolation Specification

## Purpose

Defines evaluation of the closed typed interpolation variants between type-compatible keyframes on one stable property track.

---

## Requirements

### Requirement: Easing Presets

The system MUST support typed hold, step, and cubic-Bézier interpolation. Friendly presets `linear`, `ease`, `ease-in`, `ease-out`, and `ease-in-out` resolve at the UI boundary to closed cubic-Bézier records; `ease` resolves to control points `[0.25, 0.1, 0.25, 1]`. Presets return 0 at normalized progress 0 and 1 at progress 1. Step holds the source until exactly 1.

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

The system MUST evaluate a typed cubic-Bézier interpolation record containing four finite control values and SHOULD use an efficient solver such as Newton's method. Structural validation rejects malformed control tuples; canonical playback MUST NOT parse arbitrary easing strings or silently replace invalid data with linear interpolation. A UI text boundary MAY parse CSS-like input before committing the typed record.

#### Scenario: Valid cubic-bezier curve

- GIVEN typed cubic-Bézier control points `[0.42, 0, 1, 1]`
- WHEN progress `t=0.5` is applied
- THEN the result is less than `0.5`

#### Scenario: Malformed controls rejected

- GIVEN a cubic-Bézier tuple with a non-finite or missing value
- WHEN validation runs
- THEN structural validation fails before interpolation

#### Acceptance Criteria

- [ ] Given typed control points `[0.42, 0, 1, 1]`, the result is less than `0.5`
- [ ] Given invalid controls, validation fails before evaluation

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

Interpolation dispatch MUST use the track's declared value type and closed interpolation variant: numbers use numeric interpolation; `ColorValue` uses the interpolation's declared color space; fixed typed tuples interpolate element-wise; compatible structured paths use structured morph/spatial interpolation; strings, booleans, asset references, and other discrete types use hold/step unless a compatible closed counting variant is declared. Runtime type guessing is forbidden.

#### Scenario: Number lerp

- GIVEN from=`0` and to=`100`
- WHEN interpolated at `t=0.5`
- THEN the result is `50`

#### Scenario: Boolean step

- GIVEN from=`true` and to=`false`
- WHEN interpolated at `t=0.5`
- THEN the result is `true`
- AND at `t=1` the result is `false`

#### Scenario: Numeric string counting

- GIVEN a string track from `'1'` to `'0'` with a compatible typed counting interpolation
- WHEN interpolated at `t=0.5`
- THEN the result is the string `'0.5'`

#### Acceptance Criteria

- [ ] Given from=`0` and to=`100`, the result is `50`
- [ ] Given from=`true` and to=`false`, the result is `true` and at `t=1` the result is `false`
- [ ] Given numeric string endpoints with typed counting interpolation, the result is the formatted string `'0.5'`

---

### Requirement: Typed Color Interpolation

Color keyframes MUST contain authoritative typed `ColorValue` channels. The interpolation record MUST declare a compatible color space such as OKLab. Alpha interpolates linearly. Output remains a typed concrete color; rendering/export projections perform explicit gamut mapping without replacing canonical source channels.

#### Scenario: Identical colors round-trip

- GIVEN two identical typed sRGB red colors and OKLab interpolation
- WHEN interpolated at any `t`
- THEN the result is the same typed red color

#### Scenario: Alpha interpolation

- GIVEN typed red colors whose alpha values are 0 and 1
- WHEN interpolated at `t=0.5`
- THEN the result has a partial alpha value

#### Scenario: Gamut boundary clamping

- GIVEN saturated typed colors such as red and blue
- WHEN interpolated at `t=0.5`
- THEN the result has finite typed channels and a valid alpha value

#### Acceptance Criteria

- [ ] Identical typed colors remain identical
- [ ] Alpha interpolates linearly
- [ ] Saturated color interpolation produces finite typed channels and explicit gamut mapping at output boundaries

---

### Requirement: Path Morphing

Structured-path morphing MUST interpolate compatible typed points/segments while preserving stable identity and topology. Incompatible topology fails validation or requires an explicit preprocessing command before canonical commit. Playback MUST NOT create or parse authored SVG `d` strings. Runtime numeric precision is preserved; format exporters apply target-specific rounding.

#### Scenario: Triangle path at midpoint

- GIVEN compatible triangle structured paths with matching stable points/segments
- WHEN interpolated at `t=0.5`
- THEN point/control coordinates are typed midpoints and topology/identity are preserved

#### Scenario: Mismatched coordinate lengths rejected

- GIVEN structured paths with incompatible segment topology
- WHEN interpolation is attempted
- THEN validation rejects the morph segment before playback

#### Acceptance Criteria

- [ ] Compatible structured paths interpolate coordinates while preserving stable topology
- [ ] Incompatible path topology is rejected before evaluation

---

### Requirement: Property Interpolation

The system MUST interpolate one track's declared typed value between adjacent keyframes using the outgoing segment interpolation on the earlier keyframe. Each track has exactly one stable `PropertyTarget`; multi-property keyframe bags and per-property easing maps are forbidden.

#### Scenario: Independent tracks use independent interpolation

- GIVEN an opacity track with linear interpolation and an exact-transform track with typed ease-in interpolation
- WHEN interpolated at `t=0.5`
- THEN each track produces its own type-compatible contribution and provenance

#### Scenario: Structured path morphing

- GIVEN compatible structured-path keyframes
- WHEN interpolated at `t=0.5`
- THEN the result is typed structured spatial-path geometry with midpoint coordinates and stable topology

#### Acceptance Criteria

- [ ] Independent tracks use their own compatible interpolation records
- [ ] Given compatible structured spatial-path keyframes, interpolation returns typed midpoint geometry with stable point/segment identity

---

### Requirement: Typed Color Input Guarantee

Color interpolation MUST accept only validated typed `ColorValue` inputs compatible with the track and interpolation color space. UI/import strings are parsed before canonical commit. A string or mismatched color space reaching a color track is a validation/programming error, not a silent “hold from” fallback.

#### Scenario: Valid typed colors produce typed result

- GIVEN typed red and blue colors with OKLab interpolation
- WHEN interpolation runs at `t=0.5`
- THEN the result is a typed color representing the OKLab midpoint

#### Scenario: String input rejected

- GIVEN an unparsed CSS color string assigned to a color track
- WHEN validation runs
- THEN validation fails before interpolation

#### Acceptance Criteria

- [ ] Given compatible typed colors, interpolation produces a typed color result
- [ ] Given an unparsed string on a color track, validation fails

---

### Requirement: Spring Easing Function

The interpolation system MUST evaluate typed spring records containing positive finite stiffness, damping, and mass. Friendly preset labels resolve at the UI boundary to these records. The spring produces normalized progress with possible overshoot and models a critically/under-damped harmonic oscillator: `x(t) = 1 - e^(-damping*t/2mass) * cos(ωt)` where `ω = sqrt(stiffness/mass - (damping/2mass)^2)`. It settles within 0.001 at normalized progress 1. Presets resolve to:

| Preset          | Stiffness | Damping | Mass |
| --------------- | --------- | ------- | ---- |
| `spring-gentle` | 100       | 20      | 1    |
| `spring-bouncy` | 400       | 10      | 1    |
| `spring-stiff`  | 500       | 30      | 1    |

#### Scenario: Spring-bouncy produces overshoot

- GIVEN the typed parameters for `spring-bouncy` and numeric values 0 → 100
- WHEN interpolated at t=0.3
- THEN the result exceeds 100 (overshoot due to low damping)

#### Scenario: Spring-stiff settles quickly

- GIVEN the typed parameters for `spring-stiff` and numeric values 0 → 100
- WHEN interpolated at t=0.8
- THEN the result is within 1 unit of 100 (fast settle)

#### Scenario: Spring-gentle smooth deceleration

- GIVEN the typed parameters for `spring-gentle` and numeric values 0 → 100
- WHEN interpolated at t=0.5
- THEN the result is between 0 and 100 with no overshoot (high damping)

#### Scenario: Custom spring parameters

- GIVEN typed spring parameters `{ stiffness: 300, damping: 15, mass: 1 }` and numeric values 0 → 200
- WHEN interpolated at t=1.0
- THEN the result is within 0.2 units of 200 (settled)

#### Acceptance Criteria

- [ ] Given the `spring-bouncy` typed preset record, interpolation exhibits overshoot
- [ ] Given the `spring-stiff` typed preset record, interpolation settles within tolerance by t=0.8
- [ ] Given the `spring-gentle` typed preset record, interpolation progresses without overshoot
- [ ] Given custom spring parameters, the decay curve matches the harmonic oscillator model
- [ ] Given any valid typed spring at t=1.0, the result is within 0.001 of the target value

---

### Requirement: Counting Text Interpolation

The closed counting interpolation variant MUST support string tracks whose adjacent typed string values are valid numeric representations. Its typed configuration contains `decimalPlaces`, `thousandsSeparator`, `prefix`, and `suffix`. Invalid numeric endpoints are rejected for counting interpolation; authors may choose hold/step for arbitrary strings.

#### Scenario: Integer counting

- GIVEN `from: '0'`, `to: '100'`, and the typed counting variant with default format
- WHEN interpolated at t=0.5
- THEN the result is `'50'`

#### Scenario: Counting with decimal places

- GIVEN `from: '0'`, `to: '99.9'`, and typed counting config `{ decimalPlaces: 1 }`
- WHEN interpolated at t=0.5
- THEN the result is `'50.0'`

#### Scenario: Counting with prefix and suffix

- GIVEN `from: '0'`, `to: '1000'`, and typed counting config `{ prefix: '$', suffix: 'k', thousandsSeparator: ',' }`
- WHEN interpolated at t=0.5
- THEN the result is `'$500k'`

#### Scenario: Non-numeric endpoints rejected for counting

- GIVEN `from: 'Hello'`, `to: 'World'`, and the typed counting variant
- WHEN interpolated at t=0.5
- THEN validation rejects counting interpolation for that segment

#### Acceptance Criteria

- [ ] Given two numeric strings with the typed counting variant, the result is a formatted numeric string
- [ ] Given `decimalPlaces: 2`, the result has exactly 2 decimal places
- [ ] Given prefix and suffix in typed counting config, they are applied to the result
- [ ] Given non-numeric endpoints, counting interpolation is rejected and hold/step remains available

---

## Spec Gaps

- [ ] **Typed color interpolation:** Tests must cover authoritative typed channels, declared interpolation space, alpha, and invalid string rejection.

---

## Non-Goals

- Timeline computation → see [timeline.md](timeline.md)
- DOM playback and style writing → see [playback.md](playback.md)
