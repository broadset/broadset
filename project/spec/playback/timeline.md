# Timeline Specification

## Purpose

Defines how the system computes timeline durations, interpolated frames at arbitrary times, cumulative action state, child timeline composition, and cross-element target routing — all as pure functions with no DOM or side effects.

---

## Requirements

### Requirement: Timeline Duration Computation

The system MUST compute timeline duration as the maximum keyframe offset plus a default tween duration (300ms). The default tween duration of 300ms is a compile-time constant — it is NOT configurable per-timeline or per-document, and all timelines use the same default tween duration. Empty timelines MUST have duration `0`. Child timeline durations MUST be accounted for relative to their start offset.

#### Scenario: Empty timeline

- GIVEN a timeline with no entries
- WHEN duration is computed
- THEN the result is `0`

#### Scenario: Multi-keyframe timeline

- GIVEN keyframes at 0ms, 500ms, and 1000ms
- WHEN duration is computed
- THEN the result is `1300` (1000 + 300)

#### Scenario: Child timeline extends parent duration

- GIVEN a parent trigger at 200ms and a child with 800ms max offset
- WHEN parent duration is computed
- THEN it accounts for 200 + 800 + 300 = 1300ms total

#### Acceptance Criteria

- [ ] Given a timeline with no entries, the result is `0`
- [ ] Given keyframes at 0ms, 500ms, and 1000ms, the result is `1300` (1000 + 300)
- [ ] Given a parent trigger at 200ms and a child with 800ms max offset, it accounts for 200 + 800 + 300 = 1300ms total

---

### Requirement: Timeline Frame Computation

The system MUST compute the full interpolated frame (properties + action state) for any timeline at any arbitrary time. Before the first keyframe, properties MUST be empty. After the last keyframe, properties MUST hold the last keyframe's values.

#### Scenario: Linear interpolation between keyframes

- GIVEN keyframes at 0ms (opacity=0) and 1000ms (opacity=1)
- WHEN computed at 500ms
- THEN `opacity` is `0.5`

#### Scenario: Step interpolation holds value

- GIVEN keyframes at 0ms (visibility=hidden, step) and 500ms (visibility=visible, step)
- WHEN computed at 250ms
- THEN `visibility` is `hidden`

#### Scenario: Before first keyframe returns empty

- GIVEN a keyframe starting at 500ms
- WHEN computed at 0ms
- THEN properties are empty

#### Scenario: After last keyframe holds values

- GIVEN keyframes ending at 300ms with opacity=1
- WHEN computed at 5000ms
- THEN `opacity` is `1`

#### Acceptance Criteria

- [ ] Given keyframes at 0ms (opacity=0) and 1000ms (opacity=1), `opacity` is `0.5`
- [ ] Given keyframes at 0ms (visibility=hidden, step) and 500ms (visibility=visible, step), `visibility` is `hidden`
- [ ] Given a keyframe starting at 500ms, properties are empty
- [ ] Given keyframes ending at 300ms with opacity=1, `opacity` is `1`

---

### Requirement: Deterministic State Derivation

The system MUST derive element state (`activeState`, `modifiers`) at any time T as a **pure function** of the animation data. The derivation evaluates all keyframe action markers from t=0 to T in chronological offset order, applying each marker's state operation:

- `setState(payload)`: sets `activeState` to `payload` (or `null` if no payload)
- `addModifier(payload)`: adds `payload` to the `modifiers` set
- `removeModifier(payload)`: removes `payload` from the `modifiers` set

**Determinism invariant:** The result at time T MUST be identical regardless of how T was reached — direct seek, forward playback, backward seek, or any sequence of seeks. There is no concept of "fired" vs "unfired" actions at this layer; every derivation evaluates the full marker history from t=0. Implementations MAY cache or optimize this (e.g., binary search on sorted markers), but MUST maintain equivalence with full replay.

**Default state (before any markers):** `activeState` is `null`, `modifiers` is the empty set.

**Unsorted markers:** If keyframe action markers arrive in non-chronological order, the system MUST sort them by `offsetMs` before evaluation.

#### Scenario: setState derivation

- GIVEN action markers: setState='IN' at 0ms, setState='active' at 500ms
- WHEN state is derived at 250ms
- THEN activeState is `IN`
- AND when derived at 750ms, activeState is `active`

#### Scenario: Modifier add and remove

- GIVEN markers: addModifier='pulse' at 0ms, addModifier='glow' at 200ms, removeModifier='pulse' at 500ms
- WHEN state is derived at 300ms
- THEN modifiers contain `pulse` and `glow`
- AND when derived at 600ms, modifiers contain only `glow`

#### Scenario: Seek direction independence

- GIVEN a forward derivation to 800ms then a backward derivation to 200ms
- WHEN both results are inspected
- THEN the 200ms result is identical to a fresh derivation at 200ms with no prior context

#### Scenario: Unsorted markers handled

- GIVEN action markers in non-chronological order
- WHEN state is derived
- THEN markers are evaluated in offset order regardless of input order

#### Scenario: No markers returns defaults

- GIVEN an element with no keyframe action markers
- WHEN state is derived at any time T
- THEN activeState is `null` and modifiers is empty

#### Acceptance Criteria

- [ ] Given action markers setState='IN' at 0ms, setState='active' at 500ms, at 250ms activeState is 'IN' and at 750ms activeState is 'active'
- [ ] Given markers addModifier='pulse' at 0ms, addModifier='glow' at 200ms, removeModifier='pulse' at 500ms, at 300ms modifiers are {pulse, glow} and at 600ms modifiers are {glow}
- [ ] Given forward derivation to 800ms then backward to 200ms, the result matches fresh derivation at 200ms
- [ ] Given markers in non-chronological order, they are evaluated in offset order
- [ ] Given no action markers, activeState is null and modifiers is empty at all times
- [ ] Given the same animation data and time T, the result is identical regardless of how T was reached

---

### Requirement: Child Timeline Composition

The system MUST compute child timeline frames relative to their parent start offset. Child timelines that have not started MUST not appear in the frame.

#### Scenario: Child starts at parent start offset

- GIVEN a parent start offset at 500ms for a child timeline
- WHEN parent is computed at 400ms
- THEN no child frames are present
- AND at 600ms child frames reflect 100ms of child playback

#### Scenario: Child properties interpolate

- GIVEN a child starting at 200ms with keyframes at 0ms and 1000ms
- WHEN parent is computed at 700ms
- THEN child frame properties reflect 500ms progress (50%)

#### Acceptance Criteria

- [ ] Given a parent start offset at 500ms for a child timeline, no child frames are present and at 600ms child frames reflect 100ms of child playback
- [ ] Given a child starting at 200ms with keyframes at 0ms and 1000ms, child frame properties reflect 500ms progress (50%)

---

### Requirement: Target Property Routing

The system MUST route keyframe properties with an explicit `target` to a separate `targetProperties` map, not to the owner's properties.

#### Scenario: Cross-element targeting

- GIVEN keyframes targeting `other-el` with opacity 0→1
- WHEN computed at midpoint
- THEN `targetProperties['other-el'].opacity` is `0.5`
- AND owner `properties.opacity` is undefined

#### Acceptance Criteria

- [ ] Given keyframes targeting `other-el` with opacity 0→1, `targetProperties['other-el'].opacity` is `0.5` and owner `properties.opacity` is undefined

---

### Requirement: Element Timeline Batch Computation

The system MUST compute all named timelines for an element at a given time from the animations array. Elements with no animation entry MUST return an empty array.

#### Scenario: No timelines returns empty

- GIVEN a missing element ID
- WHEN all timelines are computed
- THEN the result is an empty array

#### Scenario: Multiple timelines computed

- GIVEN an element with intro and outro timelines
- WHEN computed at 250ms
- THEN both timeline frames are returned with correct interpolated values

#### Acceptance Criteria

- [ ] Given a missing element ID, the result is an empty array
- [ ] Given an element with intro and outro timelines, both timeline frames are returned with correct interpolated values

---

### Requirement: Loop Duration Computation

When a timeline has `loop` mode `'loop'` or `'ping-pong'`, the timeline computation MUST extend the effective timeline duration to account for repeated iterations. For `'loop'` mode with `loopCount: N`, the effective duration is `baseDuration × N`. For `'ping-pong'` mode with `loopCount: N`, the effective duration is `baseDuration × N` (each iteration includes one forward and one reverse pass, so the contained tween duration per iteration equals the base). For `loopCount: null` (infinite), the effective duration is `Infinity` — the timeline never completes on its own. The `computeAt(timeMs)` function MUST map the absolute time to the correct position within the current iteration using modular arithmetic: `effectiveTime = timeMs % baseDuration` for loop mode, and for ping-pong `iterationIndex = floor(timeMs / baseDuration)`, odd iterations reverse the effectiveTime.

#### Scenario: Loop mode duration with finite count

- GIVEN a timeline with 1000ms base duration, `loop: 'loop'`, `loopCount: 3`
- WHEN the effective duration is computed
- THEN the result is 3000ms

#### Scenario: Ping-pong time mapping

- GIVEN a timeline with 1000ms base duration, `loop: 'ping-pong'`
- WHEN computed at time 1500ms (iteration 1, which is reverse)
- THEN the effective position within the timeline is 500ms from the end → same as 500ms forward

#### Scenario: Infinite loop duration

- GIVEN a timeline with `loop: 'loop'` and `loopCount: null`
- WHEN the effective duration is queried
- THEN the result is `Infinity`

#### Scenario: Non-looping timeline unchanged

- GIVEN a timeline with `loop: 'none'`
- WHEN the effective duration is computed
- THEN the result equals the base duration

#### Acceptance Criteria

- [ ] Given loop mode with `loopCount: N`, effective duration is `baseDuration × N`
- [ ] Given ping-pong mode, odd iterations reverse the time mapping
- [ ] Given `loopCount: null`, effective duration is `Infinity`
- [ ] Given `loop: 'none'`, duration computation is unchanged from existing behavior

---

### Requirement: Stagger Offset Computation

When a parent timeline has a `stagger` configuration on its child bindings, the timeline computation MUST automatically offset each child's effective start time. The stagger delay for child at index `i` (0-based) depends on the direction:

- `'normal'`: child `i` starts at `baseOffset + (i × delayMs)`
- `'reverse'`: child `i` starts at `baseOffset + ((childCount - 1 - i) × delayMs)`
- `'center'`: child `i` starts at `baseOffset + (distanceFromCenter × delayMs)` where `distanceFromCenter = abs(i - (childCount - 1) / 2)` rounded down

The stagger offset is additive with any existing start offset on the child binding. The parent timeline's effective duration MUST account for the maximum stagger offset (last child's start + child duration).

#### Scenario: Normal stagger offsets

- GIVEN 4 children with stagger `{ delayMs: 200, direction: 'normal' }`
- WHEN child start times are computed
- THEN offsets are 0, 200, 400, 600ms

#### Scenario: Center stagger with odd count

- GIVEN 5 children with stagger `{ delayMs: 100, direction: 'center' }`
- WHEN child start times are computed
- THEN center child (index 2) starts first at +0ms, adjacent at +100ms, outer at +200ms

#### Scenario: Stagger extends parent duration

- GIVEN 3 children with 500ms timelines and stagger `{ delayMs: 200, direction: 'normal' }`
- WHEN the parent effective duration is computed
- THEN it accounts for the last child completing at 400ms + 500ms = 900ms

#### Acceptance Criteria

- [ ] Given normal stagger, children are offset by increasing multiples of delayMs
- [ ] Given reverse stagger, the last child in document order starts first
- [ ] Given center stagger, center children start first and outer children are delayed
- [ ] Given stagger, the parent timeline effective duration accounts for the last child's completion

---

### Requirement: Motion Path Position Interpolation

When a keyframe pair includes a `motionPath` field, the timeline computation MUST interpolate the element's `x` and `y` position along the SVG path arc instead of linearly. The path MUST be sampled at uniform arc-length intervals (not uniform parameter `t`) to ensure constant perceived speed. When `motionRotate` is `true`, the timeline MUST also output a `rotation` value equal to the tangent angle (in degrees) at the current path position, added to the element's base rotation. The motion path interpolation MUST use the same easing function applied to other properties in the keyframe.

#### Scenario: Arc-length position sampling

- GIVEN a semicircular motion path from (0,0) to (200,0) via (100,100)
- WHEN interpolated at t=0.5 using linear easing
- THEN the position is at the arc midpoint (near the apex), not at the linear midpoint (100,0)

#### Scenario: Motion rotate outputs tangent angle

- GIVEN a motion path with `motionRotate: true` and a 90° right turn
- WHEN interpolated at the turn point
- THEN the output rotation reflects the tangent direction at that point

#### Scenario: Easing applied to path progress

- GIVEN a motion path with `ease-in` easing
- WHEN interpolated at t=0.5
- THEN the arc-length progress is less than 50% (ease-in starts slowly)

#### Acceptance Criteria

- [ ] Given a curved motionPath, position samples are at uniform arc-length intervals
- [ ] Given `motionRotate: true`, the output includes a rotation value matching the path tangent angle
- [ ] Given a motionPath with easing, the easing function is applied to the arc-length progress

---

## Spec Gaps

_None — all requirements have acceptance criteria._

---

## Non-Goals

- Easing and value interpolation math → see [interpolation.md](interpolation.md)
- DOM playback and style application → see [playback.md](playback.md)
