# Model — Animation Type Contracts

## Purpose

Defines the structural contracts for the animation data model: the animation registry, element animation configs, timelines, keyframes, state bindings, and modifier bindings. These types define _what_ animation data looks like; not how it is played back (→ `project/spec/playback/`) or how it is mutated by the editor (→ `project/spec/editor/animation-state.md`). See [conventions](../../README.md).

---

## Requirements

### Requirement: Animation Registry Structure

The animation registry MUST be a flat array of entries, each pairing an `elementId` with an `ElementAnimationConfig`. Each element ID MUST appear at most once in the registry. Entries for deleted elements MUST be silently ignored by consumers.

#### Scenario: Registry is a flat array

- GIVEN a document with animation configs for three elements
- WHEN the animation registry is inspected
- THEN it is an array of three entries, each with elementId and config

#### Scenario: Duplicate element IDs rejected

- GIVEN a registry with two entries for the same element ID
- WHEN the document is validated
- THEN validation fails

#### Scenario: Stale entries silently ignored

- GIVEN a registry entry referencing a deleted element
- WHEN the playback system processes the registry
- THEN no error is thrown and the entry is skipped

#### Acceptance Criteria

- [ ] Given animation configs for multiple elements, the registry is a flat array with one entry per element
- [ ] Given duplicate element IDs in the registry, validation fails
- [ ] Given a registry entry for a deleted element, the playback system ignores it without error

---

### Requirement: Element Animation Config Shape

Each `ElementAnimationConfig` MUST contain: `timelines` (ordered array of named timelines), `stateTimelineBindings` (ordered state-to-timeline bindings including reserved IN/OUT), and `modifierTimelineBindings` (modifier-to-timeline binding pairs). A new element with no animation MUST use an empty config (empty arrays for all three fields).

#### Scenario: Empty default config

- GIVEN a new element with no animation configured
- WHEN its animation config is resolved
- THEN timelines, stateTimelineBindings, and modifierTimelineBindings are all empty arrays

#### Scenario: Config with timelines and bindings

- GIVEN an element with two timelines and one state binding
- WHEN the animation config is inspected
- THEN timelines contains both, stateTimelineBindings contains the binding

#### Acceptance Criteria

- [ ] Given a new element, its default animation config has empty arrays for all fields
- [ ] Given an element with configured animation, timelines and bindings are present in the config

---

### Requirement: Timeline Structure

A timeline MUST have a `name` (human-readable string), `entries` (ordered array of keyframes), and optionally `id` (stable internal ID for bindings) and `childTimelines` (nested bindings to child elements). Timeline names are for display; bindings reference timelines by `id`.

#### Scenario: Timeline with keyframes

- GIVEN a timeline named `'entrance'` with three keyframes
- WHEN the timeline is inspected
- THEN it has name `'entrance'`, entries is an array of three keyframes, and id is present

#### Scenario: Child timeline bindings

- GIVEN a parent timeline with a child timeline bound to a child element ID
- WHEN the child bindings are inspected
- THEN each binding has `childElementId` and a nested `timeline`

#### Acceptance Criteria

- [ ] Given a named timeline with keyframes, name, entries, and id are all present
- [ ] Given child timeline bindings, each binding pairs a childElementId with a nested timeline

---

### Requirement: Keyframe Structure

Each keyframe MUST have: `name` (human-readable), `action` (`'none'` | `'setState'` | `'addModifier'` | `'removeModifier'`), `offsetMs` (milliseconds from timeline start), and `properties` (map of CSS property name to value+interpolation). Optional fields: `payload` (action parameter, e.g., state name) and `target` (element ID, defaults to owner element).

#### Scenario: Property keyframe at offset

- GIVEN a keyframe at `offsetMs: 500` with property `opacity` set to value `0` with `'ease-out'` interpolation
- WHEN the keyframe is inspected
- THEN offsetMs is `500`, properties contains opacity with value `0` and interpolation `'ease-out'`

#### Scenario: Action keyframe triggers state change

- GIVEN a keyframe with `action: 'setState'` and `payload: 'highlighted'`
- WHEN the keyframe is reached during playback
- THEN the target element's active state is set to `'highlighted'`

#### Scenario: Step interpolation holds value

- GIVEN a keyframe property with `interpolation: 'step'`
- WHEN interpolation is computed between keyframes
- THEN the from-value is held until the next keyframe offset, then snaps to the target value

#### Acceptance Criteria

- [ ] Given a keyframe with offsetMs, action, and properties, all fields are present and correctly typed
- [ ] Given a setState action with a payload, the state change is triggered at the keyframe offset
- [ ] Given step interpolation, values hold until the next keyframe then snap

---

### Requirement: State and Modifier Bindings

State bindings MUST map state names to timeline IDs. Reserved states `IN` and `OUT` MUST always be present in bindings. Modifier bindings MUST pair a modifier name with an `inTimeline` ID and optionally an `outTimeline` ID; when outTimeline is absent, the system MUST play the in-timeline in reverse.

#### Scenario: Reserved IN/OUT state bindings

- GIVEN an element with animation config
- WHEN state bindings are initialized
- THEN `IN` and `OUT` state bindings are present with their reserved IDs

#### Scenario: Modifier with explicit in/out timelines

- GIVEN a modifier binding with `modifierName: 'pulse'`, `inTimeline: 'tl-1'`, `outTimeline: 'tl-2'`
- WHEN the modifier is toggled on then off
- THEN `tl-1` plays on activation and `tl-2` plays on deactivation

#### Scenario: Modifier without outTimeline reverses inTimeline

- GIVEN a modifier binding with `inTimeline: 'tl-1'` and no `outTimeline`
- WHEN the modifier is deactivated
- THEN `tl-1` is played in reverse

#### Acceptance Criteria

- [ ] Given animation config initialization, IN and OUT state bindings are always present
- [ ] Given a modifier with both in and out timelines, the correct timeline plays for each toggle direction
- [ ] Given a modifier with only an inTimeline, deactivation plays the inTimeline in reverse

---

### Requirement: Easing and Interpolation Modes

The system MUST support these interpolation modes: `'linear'`, `'ease-in'`, `'ease-out'`, `'ease-in-out'`, `'cubic-bezier(...)'` (custom curve), and `'step'` (discrete snap). Easing presets are a subset: `'linear'`, `'ease-in'`, `'ease-out'`, `'ease-in-out'`.

#### Scenario: All easing presets are valid

- GIVEN a keyframe property with each easing preset value
- WHEN the interpolation mode is validated
- THEN all presets are accepted

#### Scenario: Custom cubic-bezier is valid

- GIVEN a keyframe property with `interpolation: 'cubic-bezier(0.42, 0, 0.58, 1)'`
- WHEN the interpolation mode is validated
- THEN it is accepted as a valid custom easing

#### Acceptance Criteria

- [ ] Given any easing preset (linear, ease-in, ease-out, ease-in-out), it is a valid interpolation mode
- [ ] Given a cubic-bezier interpolation value, it is accepted as valid

---

### Requirement: Cubic-Bezier Control Point Validation

Custom `cubic-bezier(x1, y1, x2, y2)` easing values MUST have `x1` and `x2` clamped to the range [0, 1]. The `y1` and `y2` values MAY exceed the [0, 1] range (enabling overshoot/bounce effects). All four values MUST be finite numbers.

#### Scenario: Standard cubic-bezier accepted

- GIVEN easing `cubic-bezier(0.42, 0, 0.58, 1)`
- WHEN validation runs
- THEN the value is accepted

#### Scenario: y values outside [0,1] accepted (overshoot)

- GIVEN easing `cubic-bezier(0.42, 1.5, 0.58, -0.5)`
- WHEN validation runs
- THEN the value is accepted (y values may overshoot)

#### Scenario: x1 outside [0,1] is rejected

- GIVEN easing `cubic-bezier(1.5, 0, 0.58, 1)`
- WHEN validation runs
- THEN validation fails (x1 out of [0,1])

#### Scenario: NaN control point is rejected

- GIVEN easing `cubic-bezier(NaN, 0, 0.58, 1)`
- WHEN validation runs
- THEN validation fails

#### Acceptance Criteria

- [ ] Given x1 and x2 within [0, 1], validation succeeds
- [ ] Given y1 or y2 outside [0, 1], validation succeeds (overshoot allowed)
- [ ] Given x1 outside [0, 1], validation fails
- [ ] Given x2 outside [0, 1], validation fails
- [ ] Given any NaN or Infinity control point, validation fails

---

## Spec Gaps

_None — all requirements have acceptance criteria._

---

## Non-Goals

- Animation playback and timing computation → see `project/spec/playback/spec.md`
- Animation config mutation via editor actions → see `project/spec/editor/animation-state.md`
- How keyframe values are interpolated at runtime → see `project/spec/playback/interpolation.md`
