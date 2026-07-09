# Model — Animation Type Contracts

## Purpose

Defines the structural contracts for the animation data model: animation definitions, element animation configs, timelines, keyframes, state bindings, and modifier bindings. These types define _what_ animation data looks like; not how it is played back (→ `project/spec/playback/`) or how it is mutated by the editor (→ `project/spec/editor/animation-state.md`). See [conventions](../../README.md).

**Key structural changes from previous format:**

- `animationRegistry` is now `animations` — a flat array of `AnimationDefinition` on the document
- Timeline `entries` are now `keyframes`
- `KeyframeProperty.value` is now a discriminated union (`KeyframeValue`) with explicit type tag
- `interpolation` is now `easing` (`EasingMode`)
- Keyframes support optional `timecodeAnnotation` for broadcast frame alignment

---

## Requirements

### Requirement: Animation Definitions Array

Animations MUST be stored as a flat array of `AnimationDefinition` on the document. Each definition pairs an `elementId` with an `ElementAnimationConfig`. Each element ID MUST appear at most once. Entries for deleted elements MUST be silently ignored by consumers.

#### Scenario: Animations is a flat array

- GIVEN a document with animation configs for three elements
- WHEN the animations array is inspected
- THEN it is an array of three entries, each with elementId and config

#### Scenario: Duplicate element IDs rejected

- GIVEN an animations array with two entries for the same element ID
- WHEN the document is validated
- THEN validation fails

#### Scenario: Stale entries silently ignored

- GIVEN an animation entry referencing a deleted element
- WHEN the playback system processes the animations
- THEN no error is thrown and the entry is skipped

#### Acceptance Criteria

- [ ] Given animation configs for multiple elements, the animations array has one entry per element
- [ ] Given duplicate element IDs in animations, validation fails
- [ ] Given an animation entry for a deleted element, the playback system ignores it without error

---

### Requirement: Element Animation Config Shape

Each `ElementAnimationConfig` MUST contain: `timelines` (ordered array of named timelines), `stateTimelineBindings` (ordered state-to-timeline bindings including reserved IN/OUT), and `modifierTimelineBindings` (modifier-to-timeline binding pairs). A new element with no animation MUST use an empty config (empty arrays for all three fields).

#### Acceptance Criteria

- [ ] Given a new element, its default animation config has empty arrays for all fields
- [ ] Given an element with configured animation, timelines and bindings are present in the config

---

### Requirement: Timeline Structure

A timeline MUST have a `name` (human-readable string), `keyframes` (ordered array of keyframe objects), and optionally `id` (stable internal ID for bindings) and `childTimelines` (nested bindings to child elements). Timeline names are for display; bindings reference timelines by `id`.

#### Acceptance Criteria

- [ ] Given a named timeline with keyframes, name, keyframes array, and id are all present
- [ ] Given child timeline bindings, each binding pairs a childElementId with a nested timeline

---

### Requirement: Keyframe Structure

Each keyframe MUST have: `name` (human-readable), `action` (`'none'` | `'setState'` | `'addModifier'` | `'removeModifier'`), `offsetMs` (milliseconds from timeline start), and `properties` (map of CSS property name to `KeyframeValue`). Optional fields: `payload` (action parameter, e.g., state name), `target` (element ID, defaults to owner element), and `timecodeAnnotation` (see Timecode below).

#### Acceptance Criteria

- [ ] Given a keyframe with offsetMs, action, and properties, all fields are present and correctly typed
- [ ] Given a setState action with a payload, the state is declared as active from that offset forward

---

### Requirement: Declarative Action Semantics

Keyframe actions (`setState`, `addModifier`, `removeModifier`) are **declarative state markers**, not imperative event triggers. They declare "from this offset forward, the element's state includes/excludes this value." The system derives element state at any time T by evaluating all action markers chronologically from t=0 to T. This evaluation is a **pure function** — the same time T always produces the same state regardless of playback history, seek direction, or previous computations.

This distinction is critical for broadcast reliability:

- **Correct (declarative):** "At 500ms, activeState becomes 'highlighted'" — state at any T is derivable from data alone.
- **Incorrect (imperative trigger):** "At 500ms, fire an event to change state" — depends on whether the event was observed, replay order, and playback direction.

The `action` field on keyframes names the state operation; the `payload` field provides the state/modifier name. A keyframe with `action: 'none'` is a pure property keyframe with no state implications.

#### Default State Contract

Before any action markers (i.e., at t=0 with no preceding markers), element state defaults to:

- `activeState`: `null` (no active state)
- `modifiers`: empty set
- `visibility`: the element's initial visibility value (typically `'onscreen'`)

#### Acceptance Criteria

- [ ] Given the same animation data and time T, the derived state is always identical regardless of how T was reached
- [ ] Given a direct seek to T vs. frame-by-frame playback to T, the element state is identical
- [ ] Given no action markers before time T, activeState is null, modifiers is empty, and visibility is the element's initial value

---

### Requirement: KeyframeValue Discriminated Union

Keyframe property values MUST use a discriminated union with an explicit type tag instead of `value: unknown`. Every `KeyframeValue` MUST have a `type` field and corresponding `value` field:

- `{ type: 'number'; value: number; easing: EasingMode }` — numeric properties (opacity, x, y, width, height, rotation, etc.)
- `{ type: 'color'; value: string; easing: EasingMode }` — color properties (fontColor, backgroundColor, stroke, fill, etc.)
- `{ type: 'string'; value: string; easing: EasingMode }` — string properties (CSS transform, content, etc.)
- `{ type: 'tuple'; value: readonly number[]; easing: EasingMode }` — multi-value properties (padding, position, etc.)

#### Scenario: Numeric keyframe value

- GIVEN a keyframe property `opacity` with `{ type: 'number', value: 0.5, easing: 'ease-out' }`
- WHEN the playback system interpolates between keyframes
- THEN numeric interpolation is applied based on the easing curve

#### Scenario: Color keyframe value

- GIVEN a keyframe property `fontColor` with `{ type: 'color', value: '#ff0000', easing: 'linear' }`
- WHEN the playback system interpolates between keyframes
- THEN color-space interpolation is applied

#### Scenario: String keyframe value with step easing

- GIVEN a keyframe property `content` with `{ type: 'string', value: 'Hello', easing: 'step' }`
- WHEN interpolation is computed
- THEN the value snaps at the keyframe offset (step behavior for strings)

#### Acceptance Criteria

- [ ] Given a KeyframeValue with type 'number', the value is a number and numeric interpolation applies
- [ ] Given a KeyframeValue with type 'color', the value is a color string and color interpolation applies
- [ ] Given a KeyframeValue with type 'string', the value is a string and step interpolation is used
- [ ] Given a KeyframeValue with type 'tuple', the value is a number array and per-component interpolation applies
- [ ] Given a KeyframeValue without a type field, validation fails

---

### Requirement: EasingMode

The `easing` field on `KeyframeValue` replaces the former `interpolation` field. Valid `EasingMode` values are: `'linear'`, `'ease'`, `'ease-in'`, `'ease-out'`, `'ease-in-out'`, `'cubic-bezier(...)'` (custom curve), `'step'` (discrete snap), and spring easing modes (`'spring(...)'` and named presets). The `'ease'` preset is equivalent to `cubic-bezier(0.25, 0.1, 0.25, 1.0)`.

#### Acceptance Criteria

- [ ] Given any easing preset (linear, ease, ease-in, ease-out, ease-in-out), validation succeeds
- [ ] Given a cubic-bezier easing value, validation succeeds
- [ ] Given 'step' easing, values hold until the next keyframe then snap

---

### Requirement: State and Modifier Bindings

State bindings MUST map state names to timeline IDs. Reserved states `IN` and `OUT` MUST always be present in bindings. Modifier bindings MUST pair a modifier name with an `inTimeline` ID and optionally an `outTimeline` ID; when outTimeline is absent, the system MUST play the in-timeline in reverse.

#### Acceptance Criteria

- [ ] Given animation config initialization, IN and OUT state bindings are always present
- [ ] Given a modifier with both in and out timelines, the correct timeline plays for each toggle direction
- [ ] Given a modifier with only an inTimeline, deactivation plays the inTimeline in reverse

---

### Requirement: Timecode Annotations

Keyframes MAY carry an optional `timecodeAnnotation` object for broadcast frame alignment:

- `timecode`: SMPTE timecode string (e.g., `'01:00:05:12'`)
- `frameRate`: the frame rate this timecode is expressed in (must match document output.frameRate if present)

When a document has an `output.frameRate`, keyframe `offsetMs` values SHOULD align to frame boundaries. Timecode annotations are metadata — they do not override `offsetMs` for playback timing.

#### Scenario: Keyframe with timecode annotation

- GIVEN a keyframe with `offsetMs: 200` and `timecodeAnnotation: { timecode: '01:00:05:05', frameRate: 25 }`
- WHEN the keyframe is inspected
- THEN the timecodeAnnotation is preserved but offsetMs governs playback timing

#### Acceptance Criteria

- [ ] Given a keyframe with timecodeAnnotation, it is preserved on round-trip
- [ ] Given timecodeAnnotation, the offsetMs value still governs playback timing

---

### Requirement: Cubic-Bezier Control Point Validation

Custom `cubic-bezier(x1, y1, x2, y2)` easing values MUST have `x1` and `x2` clamped to the range [0, 1]. The `y1` and `y2` values MAY exceed the [0, 1] range (enabling overshoot/bounce effects). All four values MUST be finite numbers.

#### Acceptance Criteria

- [ ] Given x1 and x2 within [0, 1], validation succeeds
- [ ] Given y1 or y2 outside [0, 1], validation succeeds (overshoot allowed)
- [ ] Given x1 or x2 outside [0, 1], validation fails
- [ ] Given any NaN or Infinity control point, validation fails

---

### Requirement: Timeline Loop Mode

Each timeline MAY specify a `loop` mode: `'none'` (default — plays once), `'loop'` (restarts from beginning), `'ping-pong'` (alternates forward/reverse). Optional `loopCount` (positive integer or `null` for infinite).

#### Acceptance Criteria

- [ ] Given a timeline with no loop field, the resolved default is `'none'`
- [ ] Given `loop: 'loop'` with `loopCount: null`, the timeline repeats indefinitely
- [ ] Given `loop: 'ping-pong'` with `loopCount: 3`, the timeline alternates for exactly 3 iterations

---

### Requirement: Explicit Timeline Duration

A timeline MAY specify an optional `durationMs` field (positive finite number) that overrides the computed duration. Validation MUST reject `durationMs` values shorter than the maximum keyframe offset.

#### Acceptance Criteria

- [ ] Given explicit `durationMs: 2000`, the resolved duration is 2000ms
- [ ] Given no explicit duration, the computed duration based on keyframe offsets is used
- [ ] Given `durationMs` shorter than the maximum keyframe offset, validation fails

---

### Requirement: Spring Easing Mode

Spring easing is expressed as `'spring(stiffness, damping, mass)'` where all three parameters are positive finite numbers. Named presets: `'spring-gentle'`, `'spring-bouncy'`, `'spring-stiff'`.

#### Acceptance Criteria

- [ ] Given `'spring(300, 15, 1)'`, validation accepts it as a valid easing mode
- [ ] Given `'spring-gentle'`, `'spring-bouncy'`, or `'spring-stiff'`, validation accepts each
- [ ] Given spring parameters where any value is negative, zero, or non-finite, validation fails

---

### Requirement: Child Timeline Stagger

Child timeline bindings MAY include stagger configuration with `delayMs` (positive finite number) and `direction` (`'normal'` | `'reverse'` | `'center'`). Stagger delays are additive with explicit start offsets.

#### Acceptance Criteria

- [ ] Given normal stagger with 3 children, start times increase by delayMs in document order
- [ ] Given reverse stagger with 3 children, start times increase in reverse document order
- [ ] Given stagger combined with an explicit start offset, the stagger delay is additive

---

### Requirement: Motion Path Animation

Keyframe properties MAY include a `motionPath` field (valid SVG path `d` string) for position interpolation along a curve instead of linearly. Optional `motionRotate` boolean (default `false`) auto-orients element rotation to path tangent.

#### Acceptance Criteria

- [ ] Given keyframes with a valid motionPath, position interpolates along the path arc length
- [ ] Given `motionRotate: true`, the element rotation aligns with the path tangent
- [ ] Given no motionPath, linear position interpolation is preserved
- [ ] Given an invalid SVG path in motionPath, validation fails

---

### Requirement: Per-Character Text Animation

Text elements MAY carry an optional `textAnimator` object within their `ElementAnimationConfig` that applies property keyframes per-character (or per-word/per-line) with staggered offsets. This enables typewriter reveals, per-glyph transitions, and wave effects without requiring individual elements per character.

A `TextAnimator` MUST contain:

- `rangeMode`: `'characters'` | `'words'` | `'lines'` — the unit of text segmentation
- `staggerDelayMs`: non-negative number — delay between consecutive segments
- `randomOrder`: boolean — when `true`, segments animate in random order instead of document order. Default: `false`
- `timelineId`: references a timeline within the same element's animation config. The timeline's keyframes are applied to each text segment with the stagger offset

The effective start time of segment `i` (0-indexed) is `staggerDelayMs × i` (or a random permutation when `randomOrder` is `true`). Each segment plays the full referenced timeline from its start time.

#### Scenario: Character-by-character reveal

- GIVEN a text element with content `'HELLO'` and `textAnimator: { rangeMode: 'characters', staggerDelayMs: 50, randomOrder: false, timelineId: 'tl-char-in' }`
- AND the referenced timeline animates opacity from 0 to 1 over 200ms
- WHEN animation plays
- THEN `H` starts at 0ms, `E` at 50ms, `L` at 100ms, `L` at 150ms, `O` at 200ms

#### Scenario: Word-level animation

- GIVEN a text element with content `'Breaking News Update'` and `rangeMode: 'words'`
- WHEN animation plays
- THEN each word animates as a unit with the stagger delay between them

#### Scenario: Random order

- GIVEN a text animator with `randomOrder: true` and 5 characters
- WHEN animation plays
- THEN characters animate in a shuffled order, but each still receives its full timeline

#### Scenario: Non-text element ignores textAnimator

- GIVEN a rectangle element with a `textAnimator` in its animation config
- WHEN the playback system processes the animation
- THEN the `textAnimator` is silently ignored

#### Acceptance Criteria

- [ ] Given a text element with `rangeMode: 'characters'`, each character receives a staggered copy of the referenced timeline
- [ ] Given a text element with `rangeMode: 'words'`, each word receives a staggered copy
- [ ] Given a text element with `rangeMode: 'lines'`, each line receives a staggered copy
- [ ] Given `staggerDelayMs: 50` with 5 characters, segment start times are 0, 50, 100, 150, 200ms
- [ ] Given `randomOrder: true`, segments animate in a non-sequential order
- [ ] Given `randomOrder: false`, segments animate in document order (left-to-right, top-to-bottom)
- [ ] Given a non-text element with textAnimator, the textAnimator is ignored
- [ ] Given a timelineId referencing a non-existent timeline, validation fails

---

### Requirement: Gradient Stop Animation Targets

Individual gradient stops within a `BroadsetGradient` MUST be addressable as animation keyframe targets using dot-path notation: `backgroundGradient.stops[N].position` (number, 0–100) and `backgroundGradient.stops[N].color` (color string). The gradient `angle` (for linear gradients) and `center` (for radial/conic gradients) MUST also be animatable.

This enables smooth gradient transitions — e.g., a color wash effect or an animated gradient sweep — without requiring the entire gradient to be replaced as a step value.

#### Scenario: Animate gradient stop color

- GIVEN keyframes targeting `backgroundGradient.stops[0].color` with `{ type: 'color', value: '#ff0000', easing: 'linear' }` at 0ms and `{ type: 'color', value: '#0000ff', easing: 'linear' }` at 1000ms
- WHEN interpolated at 500ms
- THEN the first gradient stop color is the OKLab midpoint between red and blue

#### Scenario: Animate gradient angle

- GIVEN keyframes targeting `backgroundGradient.angle` with `{ type: 'number', value: 0, easing: 'linear' }` at 0ms and `{ type: 'number', value: 360, easing: 'linear' }` at 2000ms
- WHEN interpolated at 1000ms
- THEN the gradient angle is 180

#### Scenario: Animate gradient stop position

- GIVEN keyframes targeting `backgroundGradient.stops[1].position` from 50 to 90
- WHEN interpolated at the midpoint
- THEN the stop position is 70

#### Acceptance Criteria

- [ ] Given keyframe targets using `backgroundGradient.stops[N].color`, color interpolation is applied per-stop
- [ ] Given keyframe targets using `backgroundGradient.stops[N].position`, numeric interpolation is applied per-stop
- [ ] Given keyframe targets using `backgroundGradient.angle`, numeric interpolation is applied
- [ ] Given keyframe targets using `backgroundGradient.center`, tuple interpolation is applied
- [ ] Given a gradient stop index that exceeds the stops array length, the keyframe is silently ignored

---

### Requirement: Audio Cue Markers

Timelines MAY contain `audioCues` — an array of audio trigger markers that fire at specific offsets during playback. Each audio cue MUST contain:

- `assetId`: non-empty string referencing an audio asset (`kind: 'audio'`) in the project's asset library
- `offsetMs`: non-negative number — the timeline offset at which the audio begins playback
- `volume`: number in [0, 1] — playback volume. Default: `1`
- `loop`: boolean — whether the audio loops. Default: `false`

Audio cues are **fire-and-forget markers** — they trigger audio playback at the specified offset and do not block timeline progression. When seeking past a cue's offset without playing through it, the audio MUST NOT fire (cues only fire during forward playback through the offset). When seeking backward past a fired cue and then playing forward, the cue MUST fire again.

Audio cues are stored on the timeline, NOT on individual keyframes. The `audioCues` array is optional and defaults to an empty array.

#### Scenario: Audio sting on entrance

- GIVEN a timeline with `audioCues: [{ assetId: 'asset-whoosh', offsetMs: 0, volume: 0.8, loop: false }]`
- WHEN the timeline plays forward through 0ms
- THEN the whoosh audio asset begins playback at 80% volume

#### Scenario: Multiple audio cues at different offsets

- GIVEN a timeline with cues at 0ms (whoosh) and 500ms (ding)
- WHEN the timeline plays forward to 600ms
- THEN the whoosh fires at 0ms and the ding fires at 500ms

#### Scenario: Seek past cue does not fire audio

- GIVEN a timeline with an audio cue at 200ms
- WHEN the timeline is seeked directly to 500ms
- THEN the 200ms audio cue does NOT fire

#### Scenario: Backward seek allows re-firing on forward play

- GIVEN a timeline with an audio cue at 200ms that has already fired
- WHEN the timeline is seeked backward to 0ms and then played forward through 200ms
- THEN the audio cue fires again

#### Scenario: Invalid asset reference

- GIVEN an audio cue with `assetId: 'missing-asset'` referencing a non-existent asset
- WHEN the document is validated
- THEN validation warns (audio cue is skipped at runtime, not a hard failure)

#### Acceptance Criteria

- [ ] Given a timeline with audioCues, cues fire during forward playback through their offsetMs
- [ ] Given a seek past a cue offset, the cue does NOT fire
- [ ] Given a backward seek and re-play, the cue fires again when crossed
- [ ] Given volume in [0, 1], the audio plays at the specified volume
- [ ] Given volume outside [0, 1], validation fails
- [ ] Given loop: true, the audio loops until the timeline ends or another cue replaces it
- [ ] Given an assetId referencing a non-audio or non-existent asset, a validation warning is emitted
- [ ] Given no audioCues field, the timeline has no audio triggers

---

## Spec Gaps

- **Audio cue asset validation** — Acceptance criterion "Given an assetId referencing a non-audio or non-existent asset, a validation warning is emitted" requires document-level validation context (access to the project asset library). The model-layer `audioCueSchema` validates `assetId` as a non-empty string but cannot verify asset existence or kind. This cross-package validation belongs in a document-level validator or editor-layer check when the full project context is available.
- **Audio cue loop termination** — Acceptance criterion "Given loop: true, the audio loops until the timeline ends or another cue replaces it" requires integration with the actual audio playback system (HTMLAudioElement or Web Audio API). The `AudioCueEngine` preserves the `loop` flag on fired cues for downstream consumers, but the actual loop-until-timeline-end behavior is handled at the integration layer, not in the engine itself.

---

## Non-Goals

- Animation playback and timing computation → see `project/spec/playback/spec.md`
- Animation config mutation via editor actions → see `project/spec/editor/animation-state.md`
- How keyframe values are interpolated at runtime → see `project/spec/playback/interpolation.md`
