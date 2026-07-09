# Playback Specification

## Purpose

Defines how the system drives timeline playback in the browser, applies computed frames to the DOM, manages element state/visibility/modifier transitions, and provides the playback controller lifecycle (attach, detach, play, pause, seek, destroy).

---

## Requirements

### Requirement: Timeline State Determinism Guarantee

At any time T on any timeline, the complete state of every element — interpolated properties, `activeState`, `modifiers`, and `visibility` — MUST be a **deterministic pure function** of the animation data alone. No playback history, no seek direction, no previously "fired" events, and no external mutable state may influence the result.

This means:

1. **Seeking to time T** produces the exact same element state whether T was reached by direct seek, forward playback from 0, backward seek from the end, or any arbitrary sequence of seeks.
2. **Scrubbing** (rapid seeks to arbitrary times) produces correct state at every position without gaps, glitches, or accumulated drift.
3. **Resuming from a paused state** at time T produces the same result as a cold start that seeks directly to T.
4. **State derivation is not event dispatch.** Keyframe action markers (`setState`, `addModifier`, `removeModifier`) are evaluated as declarative state declarations, not imperative triggers. The system evaluates all markers from t=0 to T to derive the current state — it does not "fire" events that can be missed or double-counted.

The implementation layer (Playback Handle) MAY track which markers have been processed for performance optimization during continuous forward playback, but this is strictly an optimization — the logical model MUST remain equivalent to full replay from t=0.

#### Acceptance Criteria

- [ ] Given any time T and any sequence of seeks to reach T, element state is always identical
- [ ] Given a scrub across the full timeline, every sampled position produces correct state
- [ ] Given a pause and resume at time T, the state matches a fresh seek to T
- [ ] Given identical animation data and time T, two independent playback instances produce identical state

---

### Requirement: Playback Handle Lifecycle

The system MUST provide a playback handle that drives a single timeline with frame-based scheduling. The handle MUST support play, pause, seek, setSpeed, and cancel. Seek MUST clamp to `[0, durationMs]`. Cancel MUST make subsequent play calls a no-op. When playback reaches the end of the timeline (non-looping), the handle MUST invoke an optional `onComplete` callback before becoming inactive.

#### Scenario: Seek clamping

- GIVEN a timeline with duration 800ms
- WHEN seeked to -100
- THEN currentTimeMs is `0`
- AND when seeked to 99999 then currentTimeMs is `800`

#### Scenario: Cancel makes play a no-op

- GIVEN a cancelled handle
- WHEN play is called
- THEN isActive remains `false`

#### Scenario: Seek derives state from all markers up to seek point

- GIVEN a timeline with setState at 100ms and addModifier at 300ms
- WHEN seeked to 400ms
- THEN element state reflects both markers: activeState is set and modifier is present

#### Scenario: Forward seek applies only new state transitions to DOM

- GIVEN a timeline with action markers at 100ms, 200ms, and 300ms
- WHEN seeked forward from 0ms to 150ms, then seeked forward from 150ms to 250ms
- THEN the first seek applies the 100ms marker's DOM side effects, and the second seek applies only the 200ms marker's DOM side effects
- AND the 300ms marker is NOT applied in either seek

> **Note:** This forward-only optimization avoids redundant DOM mutations. The derived state at any point is still equivalent to a full replay from t=0 (see Timeline State Determinism Guarantee).

#### Scenario: Backward seek re-derives state from scratch

- GIVEN a timeline where markers at 100ms and 200ms have been applied by a forward seek to 250ms
- WHEN seeked backward to 50ms, then seeked forward again to 250ms
- THEN state is re-derived from t=0 at each seek position, producing the same result as a cold start

#### Scenario: Seek applies styles to DOM

- GIVEN a timeline with opacity keyframes from 0 to 1
- WHEN seeked to durationMs
- THEN the animation target element's inline `opacity` style MUST equal the final keyframe value

#### Scenario: onComplete fires when playback reaches end

- GIVEN a non-looping playback handle with an `onComplete` callback
- WHEN playback naturally reaches `durationMs`
- THEN the `onComplete` callback is invoked exactly once
- AND `isActive` is `false`

#### Scenario: onComplete does not fire on cancel

- GIVEN an active playback handle with an `onComplete` callback
- WHEN the handle is cancelled before reaching durationMs
- THEN the `onComplete` callback is NOT invoked

#### Acceptance Criteria

- [ ] Given a timeline with duration 800ms, currentTimeMs is `0` and when seeked to 99999 then currentTimeMs is `800`
- [ ] Given a cancelled handle, isActive remains `false`
- [ ] Given a timeline with setState at 100ms and addModifier at 300ms, seeking to 400ms reflects both markers in element state
- [ ] Given sequential forward seeks, each seek applies only the markers between the previous and current position to the DOM
- [ ] Given a backward seek followed by a forward seek, state is re-derived from t=0 producing identical results to a cold start
- [ ] Given a timeline with opacity keyframes, seeking to the end results in the target element's inline style reflecting the final opacity value
- [ ] Given a non-looping handle with onComplete, the callback fires exactly once when playback reaches durationMs
- [ ] Given a cancelled handle with onComplete, the callback is NOT invoked

---

### Requirement: Style Writer Target Routing

The system MUST apply CSS properties to the animation target element, located by querying for the `[data-element-content]` attribute within the rendered node. The renderer is responsible for placing this attribute on the content element. If no element with `data-element-content` is found, the style writer MUST fall back to the container element itself. The `opacity` property MUST be routed to the `data-opacity-target` descendant instead, to preserve 3D rendering contexts. CamelCase property names MUST be converted to kebab-case.

The style writer MUST NOT re-query the DOM for sub-targets (content element, opacity target) on every style-application call. Resolved targets MUST be reused across calls for the same container element. A cache-invalidation entry point MUST be available so that callers can signal when the DOM structure has changed and targets need to be re-resolved.

#### Scenario: Opacity routed to opacity target

- GIVEN an element with a `data-opacity-target` descendant
- WHEN opacity is applied
- THEN the `data-opacity-target` element receives the opacity style

#### Scenario: Other properties go to data-element-content target

- GIVEN an element with a `[data-element-content]` child
- WHEN `transform` is applied
- THEN the `[data-element-content]` element receives the transform style

#### Scenario: Fallback to container when no data-element-content present

- GIVEN an element with no `[data-element-content]` descendant
- WHEN a property is applied
- THEN the container element itself receives the style

#### Scenario: Cache invalidation

- GIVEN a cached animation target
- WHEN the DOM structure changes and the cache is invalidated
- THEN the next lookup returns the new `[data-element-content]` element

#### Acceptance Criteria

- [ ] Given an element with a `data-opacity-target` descendant, the `data-opacity-target` element receives the opacity style
- [ ] Given an element with a `[data-element-content]` child, the `[data-element-content]` element receives the transform style
- [ ] Given an element with no `[data-element-content]` descendant, the container element itself receives the style
- [ ] Given a cached animation target, the next lookup returns the new `[data-element-content]` element

---

### Requirement: Playback Controller DOM Observation

The system MUST observe DOM mutations on attached elements and initiate state/visibility/modifier transitions based on derived state. Elements starting `offscreen` MUST be hidden. The controller MUST support attach, detach, play, pause, seek, setSpeed, and destroy.

#### Scenario: Offscreen element is hidden on attach

- GIVEN an element with class `offscreen`
- WHEN the playback controller attaches
- THEN the element has `visibility:hidden` and `pointer-events:none`

#### Scenario: Registry update refreshes runtime

- GIVEN an attached playback controller
- WHEN `setRegistry` is called with a new registry
- THEN element runtimes are re-parsed

#### Scenario: SeekTimeline creates and cleans up handles

- GIVEN a timeline named `spin` on an element
- WHEN seekTimeline is called then stopTimeline is called
- THEN no errors occur and handles are cleaned up

#### Acceptance Criteria

- [ ] Given an element with class `offscreen`, the element has `visibility:hidden` and `pointer-events:none`
- [ ] Given an attached playback controller, element runtimes are re-parsed
- [ ] Given a timeline named `spin` on an element, no errors occur and handles are cleaned up

---

### Requirement: Suppress Transitions Mode

The system MUST support a `suppressTransitions` flag that applies state and modifier snapshots instantly without animation.

#### Scenario: Instant state snapshot

- GIVEN `suppressTransitions = true`
- WHEN an element's class changes to a state with property keyframes
- THEN the final keyframe properties are applied instantly to the DOM

#### Acceptance Criteria

- [ ] Given `suppressTransitions = true`, the final keyframe properties are applied instantly to the DOM

---

### Requirement: Visibility and State Transitions

The system MUST animate visibility changes using bound IN/OUT timelines. When no timeline is bound, the system MUST fall back to direct CSS. State changes MUST stop previous state controls before playing the new timeline.

#### Scenario: Onscreen plays IN timeline

- GIVEN visibility changes from offscreen to onscreen
- WHEN no activeState is set
- THEN the IN state timeline is played

#### Scenario: No timeline falls back to CSS

- GIVEN no state timeline bindings exist
- WHEN visibility changes to offscreen
- THEN `visibility:hidden` is set directly

#### Scenario: Unchanged visibility is a no-op

- GIVEN visibility remains onscreen
- WHEN transitions are checked
- THEN no timeline is played

#### Scenario: OUT timeline completion hides element

- GIVEN an element transitioning from onscreen to offscreen with a bound OUT timeline
- WHEN the OUT timeline animation finishes (non-suppress mode)
- THEN the element MUST have `visibility:hidden` and `pointer-events:none`

#### Scenario: State cleared to null stops active timeline

- GIVEN an element with an active state timeline playing
- WHEN the state class is removed (activeState transitions to null)
- THEN the active timeline MUST be stopped and applied styles cleaned up

#### Acceptance Criteria

- [ ] Given visibility changes from offscreen to onscreen, the IN state timeline is played
- [ ] Given no state timeline bindings exist, `visibility:hidden` is set directly
- [ ] Given visibility remains onscreen, no timeline is played
- [ ] Given an OUT timeline that finishes playing, the element has `visibility:hidden` and `pointer-events:none`
- [ ] Given an active state timeline and state cleared to null, the timeline is stopped and styles are cleaned up

---

### Requirement: Modifier Sync

The system MUST play modifier in-timelines when added and out-timelines when removed. When no out-timeline exists, the modifier control MUST be stopped.

#### Scenario: Modifier added plays in-timeline

- GIVEN modifier `pulse` is added
- WHEN it was not previously active
- THEN the pulse in-timeline is played

#### Scenario: Modifier removed stops control

- GIVEN modifier `pulse` is removed and has no out-timeline
- WHEN sync runs
- THEN the modifier control is stopped

#### Acceptance Criteria

- [ ] Given modifier `pulse` is added, the pulse in-timeline is played
- [ ] Given modifier `pulse` is removed and has no out-timeline, the modifier control is stopped

---

### Requirement: State and Modifier Timeline Resolution

The system MUST resolve state and modifier timelines from the animations array using a two-step lookup:

1. **Find binding by name:** Match the requested state/modifier name against the binding's `stateName` or `modifierName`.
2. **Find timeline by ID:** Use the binding's `timelineId` to locate the timeline, matching against both `id` and `name` fields.

Unknown states or modifiers (no matching binding) MUST return null. Missing timeline references (binding exists but timeline not found) MUST also return null.

For modifier bindings, the system MUST support separate `inTimeline` and `outTimeline` references. When no `outTimeline` is defined, removing the modifier MUST stop the in-timeline control.

#### Scenario: Resolve IN state timeline

- GIVEN a registry with an IN state binding pointing to timeline `tl-enter`
- WHEN the IN state timeline is resolved
- THEN the correct timeline is returned

#### Scenario: Unknown state returns null

- GIVEN a request for state `UNKNOWN`
- WHEN resolved
- THEN the result is null

#### Scenario: Timeline matched by name fallback

- GIVEN a binding with `timelineId: 'entrance'` and a timeline with `name: 'entrance'` but `id: 'tl-001'`
- WHEN resolved
- THEN the timeline is found via name match

#### Acceptance Criteria

- [ ] Given a registry with an IN state binding, the correct timeline is returned
- [ ] Given a request for state `UNKNOWN`, the result is null
- [ ] Given a binding referencing a timeline by name (not id), the timeline is found via name match
- [ ] Given a modifier binding with no outTimeline, removing the modifier stops the in-timeline control

---

### Requirement: Keyframe Action Discrimination

The system MUST support three keyframe action types as **declarative state markers** that define element runtime state at points along the timeline:

- **setState:** Declares the element's runtime `activeState` as the action's payload string (or null if no payload) from this point forward.
- **addModifier:** Declares the payload string as present in the element's runtime `modifiers` set from this point forward.
- **removeModifier:** Declares the payload string as absent from the element's runtime `modifiers` set from this point forward.

When seeking to a time position, the system MUST derive the element's state by evaluating all action markers from t=0 to the seek point in chronological order. This is a pure derivation — not event dispatch. See the Timeline State Determinism Guarantee.

#### Scenario: setState declares active state

- GIVEN a keyframe at 500ms with action `setState` and payload `highlighted`
- WHEN state is derived at 500ms or later
- THEN the element's runtime `activeState` is `highlighted`

#### Scenario: State derived from multiple markers

- GIVEN keyframes: `addModifier('pulse')` at 0ms, `setState('active')` at 500ms, `removeModifier('pulse')` at 1000ms
- WHEN state is derived at 750ms
- THEN `activeState` is `active` and `modifiers` contains `pulse`

#### Acceptance Criteria

- [ ] Given a setState marker, the element's runtime activeState is set to the payload from that point forward
- [ ] Given an addModifier marker, the payload is present in the element's runtime modifiers from that point forward
- [ ] Given a removeModifier marker, the payload is absent from the element's runtime modifiers from that point forward
- [ ] Given a seek to a time point, all markers from t=0 to the seek point are evaluated in chronological order

---

### Requirement: State Transition Anti-Cascade

When a state or modifier change triggers a bound timeline (e.g., the IN timeline plays when an element becomes visible), that triggered timeline MUST NOT contain keyframe action markers (`setState`, `addModifier`, `removeModifier`) that target the same element. This prevents recursive state transitions and ensures the state derivation remains a simple linear scan with no cascading side effects.

Cross-element targeting (a keyframe with an explicit `target` pointing to a different element) is permitted in triggered timelines, as it does not create recursion.

#### Scenario: Triggered timeline with self-targeting action marker rejected

- GIVEN a state-triggered timeline containing a `setState` action marker targeting the owner element
- WHEN the animation data is validated
- THEN validation fails with an error identifying the circular dependency

#### Scenario: Cross-element action markers in triggered timelines allowed

- GIVEN a state-triggered timeline containing a `setState` action marker targeting a different element
- WHEN the animation data is validated
- THEN validation succeeds

#### Acceptance Criteria

- [ ] Given a state-triggered timeline with a self-targeting action marker, validation fails
- [ ] Given a state-triggered timeline with a cross-element action marker, validation succeeds
- [ ] Given a modifier-triggered timeline with a self-targeting action marker, validation fails

---

### Requirement: Class State Parsing

The system MUST parse element visibility, active state, and modifiers from both CSS classes and data attributes. Data-attribute paths take precedence when `data-visibility` is set.

#### Scenario: Data-attribute visibility

- GIVEN an element with `data-visibility="onscreen"`
- WHEN class state is parsed
- THEN visibility is `onscreen`

#### Scenario: Class-based state detection

- GIVEN an element with class `onscreen IN glow`
- WHEN parsed against a registry with matching bindings
- THEN visibility=onscreen, activeState=IN, modifiers={glow}

#### Acceptance Criteria

- [ ] Given an element with `data-visibility="onscreen"`, visibility is `onscreen`
- [ ] Given an element with class `onscreen IN glow`, visibility=onscreen, activeState=IN, modifiers={glow}

---

### Requirement: CSS Identifier Escaping

The system MUST escape element IDs for safe use in CSS attribute selectors. Simple alphanumeric IDs and UUIDs MUST pass through unchanged.

#### Scenario: Special characters escaped

- GIVEN an element ID containing a double quote
- WHEN escaped
- THEN the quote is backslash-escaped and `querySelector` finds the element

#### Acceptance Criteria

- [ ] Given an element ID containing a double quote, the quote is backslash-escaped and `querySelector` finds the element

---

### Requirement: Playback Loop Progression

The system MUST continue timeline playback across timeline-end boundaries when looping is enabled, without entering a stopped state.

#### Scenario: Looping playback wraps and continues

- GIVEN a looping timeline playback session
- WHEN playback reaches the configured timeline end
- THEN playback position wraps to the beginning and continues running

#### Acceptance Criteria

- [ ] Given a looping timeline playback session, playback position wraps to the beginning and continues running

---

### Requirement: Settle Timer Behavior

The system MUST support on-demand settle timing that defers final settled state until the configured settle delay window has elapsed. The default settle delay is 50ms and is a compile-time constant. During this window, if a new class mutation is observed on the element, the timer MUST reset and the settle delay window restarts from the point of the new mutation.

#### Scenario: Settle delay defers settled state

- GIVEN a playback transition that uses settle timing
- WHEN settle timing is active
- THEN the playback state remains transitional until the settle window completes

#### Scenario: Settle timer resets on new mutation

- GIVEN an active settle window
- WHEN a new class mutation is observed on the element before the window expires
- THEN the settle timer resets and begins counting again from zero

#### Acceptance Criteria

- [ ] Given a playback transition that uses settle timing, the playback state remains transitional until the settle window completes
- [ ] Given a new class mutation during an active settle window, the settle timer resets

---

### Requirement: Playback Speed Multiplier

The system MUST scale playback progression rate by the configured speed factor. At speed 1.0, wall-clock time and playback time advance at the same rate. At speed 2.0, each unit of wall-clock time advances playback time by two units.

#### Scenario: Speed change increases progression rate

- GIVEN active playback at speed 1.0 where 100ms of wall-clock time advances playback by 100ms
- WHEN speed is changed to 2.0
- THEN 100ms of wall-clock time advances playback by 200ms

#### Acceptance Criteria

- [ ] Given playback at speed 1.0, 100ms of wall-clock time advances playback by 100ms
- [ ] Given playback at speed 2.0, 100ms of wall-clock time advances playback by 200ms

---

### Requirement: Simultaneous Timeline Playback

Multiple timelines MAY play simultaneously on different elements. However, only one timeline MAY be active on a given element at any time. If a new timeline starts on an element that already has an active timeline, the existing timeline MUST be cancelled before the new one begins. The cancellation MUST invoke the cancelled timeline's cleanup, removing applied styles and restoring defaults.

#### Scenario: New timeline cancels existing timeline on same element

- GIVEN element A is playing timeline X
- WHEN timeline Y starts on element A
- THEN timeline X is cancelled and timeline Y begins

#### Scenario: Timelines on different elements are independent

- GIVEN element A is playing timeline X and element B is playing timeline Y
- WHEN both play simultaneously
- THEN both timelines run independently without interference

#### Scenario: Cancelled timeline cleanup is invoked

- GIVEN element A is playing timeline X with applied styles
- WHEN timeline Y starts on element A and timeline X is cancelled
- THEN timeline X's applied styles are removed before timeline Y begins

#### Acceptance Criteria

- [ ] Given a new timeline starting on an element with an active timeline, the existing timeline is cancelled first
- [ ] Given timelines on different elements, they play independently without interference
- [ ] Given a cancelled timeline, applied styles are cleaned up before the new timeline starts

---

### Requirement: Loop and Ping-Pong Playback

When a timeline with `loop: 'loop'` or `loop: 'ping-pong'` is playing, the playback engine MUST continue advancing past the base duration according to the loop mode. On each animation frame, the playback engine maps the elapsed time to the effective position within the current loop iteration (see timeline computation spec). When the loop `loopCount` is reached, the playback handle MUST fire its `onComplete` callback and stop. When `loopCount` is `null` (infinite), the playback continues until explicitly cancelled. In `'ping-pong'` mode, the style writer MUST reverse the interpolation direction on odd iterations — all animated properties smoothly reverse. The settle timer MUST NOT fire between loop iterations; it fires only after the final iteration completes (or not at all for infinite loops).

#### Scenario: Loop restarts seamlessly

- GIVEN a playing timeline with `loop: 'loop'` and `loopCount: 2`
- WHEN the first iteration completes
- THEN the timeline immediately restarts from offset 0 without a visible gap

#### Scenario: Ping-pong reverses smoothly

- GIVEN a playing timeline with `loop: 'ping-pong'` and `loopCount: 2`
- WHEN the first forward pass completes
- THEN the second iteration plays in reverse (properties animate from end values back to start values)

#### Scenario: Finite loop completion

- GIVEN a playing timeline with `loop: 'loop'` and `loopCount: 3`
- WHEN all 3 iterations complete
- THEN the `onComplete` callback fires and playback stops

#### Scenario: Infinite loop never auto-completes

- GIVEN a playing timeline with `loop: 'loop'` and `loopCount: null`
- WHEN playback has run for 100 iterations
- THEN playback continues; `onComplete` has not fired

#### Scenario: Settle timer on loop completion

- GIVEN a playing timeline with `loop: 'loop'` and `loopCount: 2`
- WHEN both iterations complete
- THEN the settle timer fires after the final iteration (not between iterations)

#### Acceptance Criteria

- [ ] Given loop mode with finite count, playback restarts seamlessly between iterations
- [ ] Given ping-pong mode, odd iterations reverse the interpolation direction
- [ ] Given `loopCount: N`, `onComplete` fires exactly once after N iterations
- [ ] Given `loopCount: null`, playback continues indefinitely until cancelled
- [ ] Given a looping timeline, the settle timer fires only after the final iteration

---

## Spec Gaps

- [x] **Style Writer Target Routing — fallback to container:** Automated test coverage now exists.
- [x] **Settle Timer Behavior — reset on mutation:** Automated test coverage now exists.
- [x] **Simultaneous Timeline Playback:** Automated tests now cover single-element cancellation-on-replacement, style cleanup, and multi-element independence.
- [x] **Visibility transition post-animation:** When an OUT timeline finishes playing (non-suppress mode), the element becomes hidden. Covered via `onComplete` callback.
- [x] **State cleared to null:** When `activeState` transitions from a named state to `null`, the previous state's timeline control is stopped and applied styles are cleaned up. Automated test coverage exists.

---

## Non-Goals

- Easing math and value interpolation → see [interpolation.md](interpolation.md)
- Timeline computation → see [timeline.md](timeline.md)
