# Playback Specification

## Purpose

Defines how the system drives timeline playback in the browser, applies computed frames to the DOM, manages element state/visibility/modifier transitions, and provides the playback controller lifecycle (attach, detach, play, pause, seek, destroy).

---

## Requirements

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

#### Scenario: Seek fires cumulative actions

- GIVEN a timeline with setState at 100ms and addModifier at 300ms
- WHEN seeked to 400ms
- THEN both actions are fired in order

#### Scenario: Forward seek fires only unfired actions

- GIVEN a timeline with actions at 100ms, 200ms, and 300ms
- WHEN seeked forward from 0ms to 150ms, then seeked forward from 150ms to 250ms
- THEN the first seek fires only the 100ms action, and the second seek fires only the 200ms action
- AND the 300ms action is NOT fired in either seek

#### Scenario: Backward seek resets action tracking

- GIVEN a timeline where actions at 100ms and 200ms have already been fired by a forward seek to 250ms
- WHEN seeked backward to 50ms, then seeked forward again to 250ms
- THEN the forward seek fires the 100ms and 200ms actions again

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
- [ ] Given a timeline with setState at 100ms and addModifier at 300ms, both actions are fired in order
- [ ] Given sequential forward seeks, each seek fires only the actions between the previous and current position
- [ ] Given a backward seek followed by a forward seek, previously fired actions are fired again
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

The system MUST observe DOM mutations on attached elements and trigger state/visibility/modifier transitions. Elements starting `offscreen` MUST be hidden. The controller MUST support attach, detach, play, pause, seek, setSpeed, and destroy.

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

#### Acceptance Criteria

- [ ] Given visibility changes from offscreen to onscreen, the IN state timeline is played
- [ ] Given no state timeline bindings exist, `visibility:hidden` is set directly
- [ ] Given visibility remains onscreen, no timeline is played
- [ ] Given an OUT timeline that finishes playing, the element has `visibility:hidden` and `pointer-events:none`

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

The system MUST resolve state and modifier timelines from the animation registry using a two-step lookup:

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

The system MUST support three keyframe action types that modify element screen state during playback:

- **setState:** Sets `screen.activeState` to the action's payload string (or null if no payload).
- **addModifier:** Adds the payload string to `screen.modifiers`.
- **removeModifier:** Removes the payload string from `screen.modifiers`.

When seeking to a time position, the system MUST evaluate all keyframe actions from t=0 to the seek point in chronological order, accumulating the resulting `activeState` and `modifiers` set.

#### Scenario: setState applies payload as active state

- GIVEN a keyframe at 500ms with action `setState` and payload `highlighted`
- WHEN playback reaches 500ms
- THEN `screen.activeState` is set to `highlighted`

#### Scenario: Accumulated state across multiple actions

- GIVEN keyframes: `addModifier('pulse')` at 0ms, `setState('active')` at 500ms, `removeModifier('pulse')` at 1000ms
- WHEN seeking to 750ms
- THEN `activeState` is `active` and `modifiers` contains `pulse`

#### Acceptance Criteria

- [ ] Given a setState action, screen.activeState is set to the payload
- [ ] Given an addModifier action, the payload is added to screen.modifiers
- [ ] Given a removeModifier action, the payload is removed from screen.modifiers
- [ ] Given a seek to a time point, all actions from t=0 to the seek point are evaluated in order

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

Multiple timelines MAY play simultaneously on different elements. However, only one timeline MAY be active on a given element at any time. If a new timeline is triggered on an element that already has an active timeline, the existing timeline MUST be cancelled before the new one begins. The cancellation MUST invoke the cancelled timeline's cleanup, removing applied styles and restoring defaults.

#### Scenario: New timeline cancels existing timeline on same element

- GIVEN element A is playing timeline X
- WHEN timeline Y is triggered on element A
- THEN timeline X is cancelled and timeline Y begins

#### Scenario: Timelines on different elements are independent

- GIVEN element A is playing timeline X and element B is playing timeline Y
- WHEN both play simultaneously
- THEN both timelines run independently without interference

#### Scenario: Cancelled timeline cleanup is invoked

- GIVEN element A is playing timeline X with applied styles
- WHEN timeline Y is triggered on element A and timeline X is cancelled
- THEN timeline X's applied styles are removed before timeline Y begins

#### Acceptance Criteria

- [ ] Given a new timeline triggered on an element with an active timeline, the existing timeline is cancelled first
- [ ] Given timelines on different elements, they play independently without interference
- [ ] Given a cancelled timeline, applied styles are cleaned up before the new timeline starts

---

## Spec Gaps

- [x] **Style Writer Target Routing — fallback to container:** Automated test coverage now exists.
- [x] **Settle Timer Behavior — reset on mutation:** Automated test coverage now exists.
- [x] **Simultaneous Timeline Playback:** Automated tests now cover single-element cancellation-on-replacement, style cleanup, and multi-element independence.
- [x] **Visibility transition post-animation:** When an OUT timeline finishes playing (non-suppress mode), the element becomes hidden. Covered via `onComplete` callback.
- [ ] **State cleared to null:** When `activeState` transitions from a named state to `null`, the previous state's timeline control should be stopped. No automated test exists for this case.

---

## Non-Goals

- Easing math and value interpolation → see [interpolation.md](interpolation.md)
- Timeline computation → see [timeline.md](timeline.md)
