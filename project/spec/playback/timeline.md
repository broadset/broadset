# Timeline Specification

## Purpose

Defines how the system computes timeline durations, interpolated frames at arbitrary times, cumulative action state, child timeline composition, and cross-element target routing — all as pure functions with no DOM or side effects.

---

## Requirements

### Requirement: Timeline Duration Computation

The system MUST compute timeline duration as the maximum keyframe offset plus a default tween duration (300ms). The default tween duration of 300ms is a compile-time constant — it is NOT configurable per-timeline or per-document, and all timelines use the same default tween duration. Empty timelines MUST have duration `0`. Child timeline durations MUST be accounted for relative to their trigger offset.

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

### Requirement: Action State Accumulation

The system MUST compute cumulative action state by replaying all keyframe actions from `t=0`. `setState` MUST set the active state name. `addModifier`/`removeModifier` MUST toggle modifier set membership. Backward seeks MUST replay from zero. The computation MUST be idempotent.

#### Scenario: setState accumulation

- GIVEN entries: setState=IN at 0ms, setState=active at 500ms
- WHEN computed at 250ms
- THEN activeState is `IN`

#### Scenario: Modifier add and remove

- GIVEN entries: addModifier=pulse at 0ms, addModifier=glow at 200ms, removeModifier=pulse at 500ms
- WHEN computed at 300ms
- THEN modifiers contain `pulse` and `glow`
- AND at 600ms modifiers contain only `glow`

#### Scenario: Backward seek replays correctly

- GIVEN forward computation to 800ms then backward to 200ms
- WHEN both results are inspected
- THEN the 200ms result matches a fresh computation at 200ms

#### Scenario: Unsorted entries handled

- GIVEN entries in non-chronological order
- WHEN computed
- THEN actions are applied in offset order regardless of input order

#### Acceptance Criteria

- [ ] Given entries: setState=IN at 0ms, setState=active at 500ms, activeState is `IN`
- [ ] Given entries: addModifier=pulse at 0ms, addModifier=glow at 200ms, removeModifier=pulse at 500ms, modifiers contain `pulse` and `glow` and at 600ms modifiers contain only `glow`
- [ ] Given forward computation to 800ms then backward to 200ms, the 200ms result matches a fresh computation at 200ms
- [ ] Given entries in non-chronological order, actions are applied in offset order regardless of input order

---

### Requirement: Child Timeline Composition

The system MUST compute child timeline frames relative to their parent trigger offset. Child timelines that have not started MUST not appear in the frame.

#### Scenario: Child starts at parent trigger

- GIVEN a parent trigger at 500ms for a child timeline
- WHEN parent is computed at 400ms
- THEN no child frames are present
- AND at 600ms child frames reflect 100ms of child playback

#### Scenario: Child properties interpolate

- GIVEN a child triggered at 200ms with keyframes at 0ms and 1000ms
- WHEN parent is computed at 700ms
- THEN child frame properties reflect 500ms progress (50%)

#### Acceptance Criteria

- [ ] Given a parent trigger at 500ms for a child timeline, no child frames are present and at 600ms child frames reflect 100ms of child playback
- [ ] Given a child triggered at 200ms with keyframes at 0ms and 1000ms, child frame properties reflect 500ms progress (50%)

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

The system MUST compute all named timelines for an element at a given time from the animation registry. Elements with no registry entry MUST return an empty array.

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

## Spec Gaps

_None — all requirements have acceptance criteria._

---

## Non-Goals

- Easing and value interpolation math → see [interpolation.md](interpolation.md)
- DOM playback and style application → see [playback.md](playback.md)
