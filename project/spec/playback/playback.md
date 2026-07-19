# Playback Specification

## Purpose

Defines browser scheduling for canonical sequences, typed resolved property contributions, lifecycle/state-machine transitions, exact-tick transport, DOM application, and playback-controller lifecycle.

---

## Requirements

### Requirement: Sequence and State Determinism Guarantee

At any exact tick T, the complete resolved scene—typed track contributions, lifecycle phase, state-machine states, instance visibility, and provenance—MUST be a deterministic pure function of canonical data, validated runtime data, the ordered typed event log, and T. Playback history, seek direction, wall-clock rounding, and previously dispatched side effects MUST NOT influence the result.

This means:

1. **Seeking to tick T** produces the same resolved state whether reached directly, by forward playback from zero, by backward seek, or by arbitrary seeks.
2. **Scrubbing** (rapid seeks to arbitrary times) produces correct state at every position without gaps, glitches, or accumulated drift.
3. **Resuming from a paused state** at time T produces the same result as a cold start that seeks directly to T.
4. **State derivation is not DOM event dispatch.** State machines replay the typed runtime event log through T and start canonical transition sequence actions at their recorded ticks. Keyframes remain typed property values and never masquerade as state actions.

The playback handle MAY checkpoint event-log/state-machine evaluation for forward-playback performance, but its logical result MUST remain equivalent to deterministic replay from initial states.

#### Acceptance Criteria

- [ ] Given any tick T and any sequence of seeks to reach T, resolved state is identical
- [ ] Given a scrub across the full sequence, every sampled tick produces correct state
- [ ] Given a pause and resume at time T, the state matches a fresh seek to T
- [ ] Given identical canonical data, validated runtime data, event log, and tick T, independent playback instances produce identical state

---

### Requirement: Playback Handle Lifecycle

The system MUST provide a playback handle that drives one canonical sequence using exact ticks. The canonical method `seekTick(tick)` accepts only safe-integer ticks in `[0, durationTicks]` and otherwise returns `time-out-of-range` without clamping. A UI/media boundary MAY expose `seekDisplayTimeMs(value)`: it clamps the display value to the sequence presentation interval, computes the exact rational `value × ticksPerSecond / 1000`, rounds to the nearest integer tick with exact half values toward the greater tick, and calls `seekTick`. Display milliseconds and `currentTimeMs` are derived views and are never serialized. The handle supports play, pause, setSpeed, and cancel. Cancel makes later play calls no-ops. A non-looping completion invokes optional `onComplete` before becoming inactive.

#### Scenario: Seek clamping

- GIVEN `ticksPerSecond: 1000`, a sequence with `durationTicks: 800`, and the display-time seek adapter
- WHEN display seek receives -100ms and then 99999ms
- THEN it calls canonical seek at tick 0 and then tick 800
- AND its displayed current time derives as 0ms and then 800ms

#### Scenario: Cancel makes play a no-op

- GIVEN a cancelled handle
- WHEN play is called
- THEN isActive remains `false`

#### Scenario: Seek derives state machines from the event log

- GIVEN state-machine events at ticks 100 and 300 whose transitions start referenced sequences
- WHEN seeked to tick 400
- THEN machine states and active transition sequence actions reflect both events

#### Scenario: Forward seek applies only newly changed resolved targets to DOM

- GIVEN typed state-machine events at ticks 100, 200, and 300
- WHEN seeked from tick 0 to 150 and then to 250
- THEN the first seek applies the resolved delta through tick 100 and the second only the changed resolved targets through tick 200
- AND no result from tick 300 is applied

> **Note:** This optimization avoids redundant DOM writes; the derived snapshot remains equivalent to replay from initial machine states.

#### Scenario: Backward seek re-derives state from scratch

- GIVEN events at ticks 100 and 200 were evaluated by a forward seek to tick 250
- WHEN seeked backward to tick 50 and then forward again to tick 250
- THEN state is re-derived from t=0 at each seek position, producing the same result as a cold start

#### Scenario: Seek applies styles to DOM

- GIVEN a sequence with a typed opacity track from 0 to 1
- WHEN seeked to `durationTicks`
- THEN the animation target element's inline `opacity` style MUST equal the final keyframe value

#### Scenario: onComplete fires when playback reaches end

- GIVEN a non-looping playback handle with an `onComplete` callback
- WHEN playback naturally reaches `durationTicks`
- THEN the `onComplete` callback is invoked exactly once
- AND `isActive` is `false`

#### Scenario: onComplete does not fire on cancel

- GIVEN an active playback handle with an `onComplete` callback
- WHEN the handle is cancelled before reaching `durationTicks`
- THEN the `onComplete` callback is NOT invoked

#### Acceptance Criteria

- [ ] Given the display-time seek adapter, clamping occurs before one deterministic conversion to a canonical tick
- [ ] Given `seekTick` outside the sequence range, evaluation returns `time-out-of-range` without clamping
- [ ] Given a cancelled handle, isActive remains `false`
- [ ] Given state-machine events through the requested tick, seeking derives the correct states and transition sequence actions
- [ ] Given sequential forward seeks, each seek applies only changed resolved targets while remaining equivalent to cold evaluation
- [ ] Given a backward seek followed by a forward seek, state is re-derived from t=0 producing identical results to a cold start
- [ ] Given a typed opacity track, terminal seek applies the final resolved opacity
- [ ] Given a non-looping handle with onComplete, the callback fires exactly once at `durationTicks`
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

The system MUST observe its attached rendered-scene roots for host lifecycle changes while treating the resolved snapshot—not arbitrary DOM classes—as state truth. Typed page-instance visibility, lifecycle phase, and state-machine evaluation determine painted/interactive output. The controller supports attach, detach, play, pause, exact-tick seek, display-time seek conversion, setSpeed, and destroy.

#### Scenario: Offscreen element is hidden on attach

- GIVEN a resolved page instance whose effective `visible` value is false
- WHEN the playback controller attaches
- THEN the element has `visibility:hidden` and `pointer-events:none`

#### Scenario: Registry update refreshes runtime

- GIVEN an attached playback controller
- WHEN a new validated resolved-scene snapshot and sequence registry are supplied
- THEN runtime targets and canonical sequence/state-machine references are refreshed

#### Scenario: SeekTimeline creates and cleans up handles

- GIVEN a sequence with stable ID `seq-spin`
- WHEN its playback handle is sought and then stopped by stable ID
- THEN no errors occur and handles are cleaned up

#### Acceptance Criteria

- [ ] Given effective instance visibility false, output has `visibility:hidden` and `pointer-events:none`
- [ ] Given a new resolved snapshot, runtime targets and canonical references refresh
- [ ] Given a sequence addressed by stable ID, seek/stop cleans up its handle

---

### Requirement: Suppress Transitions Mode

The system MUST support a runtime `suppressTransitions` flag that applies the target state-machine/lifecycle resolved snapshot instantly without playing transition sequence actions.

#### Scenario: Instant state snapshot

- GIVEN `suppressTransitions = true`
- WHEN a typed event transitions a state machine to a state with a sequence action
- THEN the transition sequence's terminal resolved properties are applied instantly

#### Acceptance Criteria

- [ ] Given suppressed transitions, the target state and terminal typed properties apply without time progression

---

### Requirement: Lifecycle and State-Machine Transitions

The system MUST animate lifecycle changes through canonical IN/HOLD-UPDATE/OUT sequence references and state-machine changes through transition sequence actions. When no lifecycle sequence is declared, effective instance visibility applies directly. When a transition supersedes an incompatible active transition action on the same target/property, deterministic resolution stops or overrides the earlier control according to canonical precedence.

#### Scenario: Becoming visible plays lifecycle IN sequence

- GIVEN effective page-instance visibility changes from false to true and lifecycle IN references `seq-in`
- WHEN runtime lifecycle input enters IN
- THEN `seq-in` plays from the exact transition tick

#### Scenario: No lifecycle sequence applies visibility directly

- GIVEN no lifecycle OUT sequence is declared
- WHEN effective instance visibility becomes false
- THEN `visibility:hidden` is set directly

#### Scenario: Unchanged visibility is a no-op

- GIVEN visibility remains onscreen
- WHEN transitions are checked
- THEN no sequence action starts

#### Scenario: OUT sequence completion hides output

- GIVEN lifecycle OUT references a finite sequence
- WHEN that sequence reaches its terminal tick
- THEN the element MUST have `visibility:hidden` and `pointer-events:none`

#### Scenario: State transition supersedes prior action

- GIVEN a state-machine transition sequence is active
- WHEN a later eligible transition changes state and targets the same properties
- THEN prior incompatible contributions are stopped/overridden and resolved styles are updated from canonical precedence

#### Acceptance Criteria

- [ ] Given lifecycle enters IN with a sequence reference, that sequence starts at the exact transition tick
- [ ] Given no lifecycle animation reference, effective visibility applies directly
- [ ] Given unchanged lifecycle/visibility input, no sequence starts
- [ ] Given OUT sequence completion, output becomes hidden and non-interactive
- [ ] Given a superseding transition, incompatible earlier contributions are cleaned up deterministically

---

### Requirement: Independent State-Machine Sync

Friendly independent “modifier” toggles MUST compile to canonical two-state machines with typed activation/deactivation triggers and optional transition sequence actions. Activation plays the transition-to-active sequence action; deactivation plays the transition-to-inactive action or stops the active action when none is declared. No modifier set or in/out timeline binding is serialized.

#### Scenario: Friendly toggle activation plays transition sequence

- GIVEN the `pulse` state machine receives its activation trigger
- WHEN it transitions from inactive to active
- THEN its transition-to-active sequence action plays

#### Scenario: Friendly toggle deactivation stops control

- GIVEN `pulse` receives its deactivation trigger and that transition has no sequence action
- WHEN sync runs
- THEN the active transition sequence control is stopped

#### Acceptance Criteria

- [ ] Given activation, the canonical transition-to-active action plays
- [ ] Given deactivation with no action, the active control stops

---

### Requirement: Lifecycle and State-Machine Sequence Resolution

The system MUST resolve lifecycle and state-machine sequence references using stable IDs:

1. **Find canonical owner/action:** Resolve the lifecycle phase or state-machine transition by stable identity and typed trigger.
2. **Find sequence by ID:** Resolve only the stable `sequenceId`; display names are not identity fallbacks.

Unknown runtime events that match no transition cause no state change. A persisted lifecycle/transition action whose sequence ID does not resolve is a semantic-validation error and cannot reach playback.

Independent two-state machines MAY declare different sequence actions on activation and deactivation transitions. Missing optional deactivation action means stop/settle without inventing a sequence.

#### Scenario: Resolve lifecycle IN sequence

- GIVEN lifecycle IN references sequence `seq-enter`
- WHEN the IN action is resolved
- THEN the exact sequence is returned by stable ID

#### Scenario: No eligible transition leaves state unchanged

- GIVEN a typed event for which no state-machine transition is eligible
- WHEN resolved
- THEN the result is null

#### Scenario: Display name is not an identity fallback

- GIVEN an action whose `sequenceId` is stale but a sequence display name happens to match
- WHEN resolved
- THEN semantic validation rejects the stale reference before playback

#### Acceptance Criteria

- [ ] Given lifecycle IN with a resolving stable sequence ID, the correct sequence is returned
- [ ] Given no eligible transition, state remains unchanged and no action sequence is resolved
- [ ] Given a persisted binding with a stale or name-only sequence reference, semantic validation rejects it before playback
- [ ] Given a two-state machine deactivation without an action, the active control stops

---

### Requirement: State-Machine Transition Actions

State-machine transitions MAY contain canonical sequence actions addressed by stable sequence ID. Transition actions begin at the exact event tick after trigger/guard/priority selection. Keyframes MUST contain only type-compatible property values and interpolation; they MUST NOT contain state-changing actions.

#### Scenario: Transition starts sequence action

- GIVEN a transition from `idle` to `highlighted` whose action references `seq-highlight`
- WHEN its typed trigger is recorded at tick 500
- THEN the machine enters `highlighted` and `seq-highlight` starts at tick 500

#### Scenario: Multiple state machines derive independently

- GIVEN independent state machines whose transition actions reference `seq-pulse` and `seq-active`
- WHEN their ordered triggers have occurred by tick 750
- THEN both machine states and both active sequence schedules derive deterministically

#### Scenario: Action in keyframe rejected

- GIVEN a keyframe containing a state/action payload instead of a typed track value
- WHEN structural validation runs
- THEN validation fails at the keyframe

#### Acceptance Criteria

- [ ] Transition actions reference sequences by stable ID and start at the exact event tick
- [ ] Independent state machines derive deterministically from the same ordered event log
- [ ] Keyframe action payloads are structurally rejected
- [ ] Direct seek and sequential evaluation produce the same transition-action schedule

---

### Requirement: State Transition Anti-Cascade

State-machine and lifecycle sequence-action dependency graphs MUST be deterministic and acyclic where an action could synchronously retrigger its owning transition without an intervening typed runtime event. Sequence tracks cannot mutate state-machine state; cross-entity property targeting remains valid when property target validation succeeds.

#### Scenario: Recursive transition-action dependency rejected

- GIVEN lifecycle/state-machine actions forming a synchronous dependency cycle
- WHEN semantic validation runs
- THEN validation fails with an error identifying the circular dependency

#### Scenario: Cross-element property tracks allowed

- GIVEN a transition sequence with a typed property track targeting a different element
- WHEN semantic validation runs
- THEN validation succeeds

#### Acceptance Criteria

- [ ] Given a synchronous action dependency cycle, semantic validation fails
- [ ] Given a valid cross-entity property target, semantic validation succeeds
- [ ] Sequence tracks cannot encode state-machine transitions as keyframe values

---

### Requirement: DOM State Signal Boundary

When host integration uses DOM classes or data attributes as controls, the adapter MUST parse them into typed runtime lifecycle/state-machine events and effective page-instance visibility inputs. Parsed tokens are boundary signals only: they MUST NOT become canonical keyframe actions, modifier sets, or element visibility fields. Explicit `data-visibility` takes precedence over compatibility class signals at this boundary.

#### Scenario: Data-attribute visibility

- GIVEN an element with `data-visibility="onscreen"`
- WHEN class state is parsed
- THEN the adapter emits effective visibility true

#### Scenario: Class-based state detection

- GIVEN an element with class tokens `onscreen IN glow`
- WHEN parsed against configured lifecycle and state-machine trigger mappings
- THEN the adapter emits visibility true plus typed IN/glow events

#### Acceptance Criteria

- [ ] Given `data-visibility="onscreen"`, the adapter emits effective visibility true
- [ ] Given configured class tokens, the adapter emits typed runtime events without persisting token strings

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

The system MUST continue sequence playback across `durationTicks` boundaries when canonical looping is enabled, without entering a stopped state.

#### Scenario: Looping playback wraps and continues

- GIVEN a looping sequence playback session
- WHEN transport reaches the sequence `durationTicks`
- THEN playback position wraps to the beginning and continues running

#### Acceptance Criteria

- [ ] Given a looping sequence session, exact tick mapping wraps and playback continues

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

The system MUST scale transport progression by the configured runtime speed factor. Wall-clock deltas are converted to an exact accumulated rational tick delta using the document timebase; fractional remainder stays runtime-only and MUST NOT enter canonical data. At speed 1.0, 100ms of wall clock advances by the exact tick equivalent; at speed 2.0 it advances twice that number of ticks.

#### Scenario: Speed change increases progression rate

- GIVEN active playback at speed 1.0 where 100ms of wall-clock time advances playback by 100ms
- WHEN speed is changed to 2.0
- THEN 100ms of wall-clock time advances transport by the exact tick equivalent of 200ms

#### Acceptance Criteria

- [ ] Given speed 1.0, wall-clock delta converts through the timebase to exact transport ticks
- [ ] Given speed 2.0, transport advances twice the exact tick delta with no canonical fractional tick

---

### Requirement: Simultaneous Sequence Playback

Multiple sequences MAY be active simultaneously. Contributions to distinct stable property targets are independent. When incompatible active tracks target the same property, canonical lifecycle/state/sequence precedence and transition replacement policy select the effective contribution; replacing a runtime control cleans up its DOM writes before the new resolved value applies.

#### Scenario: New sequence supersedes an incompatible contribution

- GIVEN sequence X contributes to a target property on element A
- WHEN a superseding transition starts sequence Y on the same target
- THEN X's runtime control is replaced and Y becomes effective under canonical precedence

#### Scenario: Sequences targeting different elements are independent

- GIVEN sequence X targets element A and sequence Y targets element B
- WHEN both play simultaneously
- THEN both sequences run independently without interference

#### Scenario: Replaced sequence-control cleanup is invoked

- GIVEN sequence X has applied a resolved target value
- WHEN a superseding transition replaces X with Y on that target
- THEN X's DOM contribution is cleaned before Y's resolved value applies

#### Acceptance Criteria

- [ ] Given incompatible contributions to one target, canonical precedence/replacement selects one effective value
- [ ] Given sequences on independent targets, they play without interference
- [ ] Given a replaced control, its DOM contribution is cleaned before the new value applies

---

### Requirement: Loop and Ping-Pong Playback

When a sequence's closed loop definition requests loop or ping-pong playback, transport MUST map exact elapsed ticks to exact sequence ticks as defined in [timeline.md](timeline.md). A finite count fires `onComplete` once after the final iteration; an unbounded loop continues until cancellation. Ping-pong reverses odd iterations. The runtime settle timer does not fire between iterations.

#### Scenario: Loop restarts seamlessly

- GIVEN a playing sequence with loop mode and count 2
- WHEN the first iteration completes
- THEN the sequence immediately restarts from tick 0 without a visible gap

#### Scenario: Ping-pong reverses smoothly

- GIVEN a playing sequence with ping-pong mode and count 2
- WHEN the first forward pass completes
- THEN the second iteration plays in reverse (properties animate from end values back to start values)

#### Scenario: Finite loop completion

- GIVEN a playing sequence with loop mode and count 3
- WHEN all 3 iterations complete
- THEN the `onComplete` callback fires and playback stops

#### Scenario: Infinite loop never auto-completes

- GIVEN a playing sequence with an unbounded loop
- WHEN playback has run for 100 iterations
- THEN playback continues; `onComplete` has not fired

#### Scenario: Settle timer on loop completion

- GIVEN a playing sequence with loop mode and count 2
- WHEN both iterations complete
- THEN the settle timer fires after the final iteration (not between iterations)

#### Acceptance Criteria

- [ ] Given loop mode with finite count, playback restarts seamlessly between iterations
- [ ] Given ping-pong mode, odd iterations reverse the interpolation direction
- [ ] Given a finite loop count N, `onComplete` fires exactly once after N iterations
- [ ] Given an unbounded loop, playback continues until cancelled
- [ ] Given a looping sequence, the settle timer fires only after the final iteration

---

## Spec Gaps

- [x] **Style Writer Target Routing — fallback to container:** Automated test coverage now exists.
- [x] **Settle Timer Behavior — reset on mutation:** Automated test coverage now exists.
- [x] **Simultaneous sequence playback:** Automated tests cover replacement cleanup and independent targets.
- [x] **Visibility transition post-animation:** When a lifecycle OUT sequence completes, output becomes hidden. Covered via `onComplete`.
- [x] **Superseding state transition:** When a later transition replaces an active sequence action on the same target, the previous control is stopped and DOM contributions are cleaned.

---

## Non-Goals

- Easing math and value interpolation → see [interpolation.md](interpolation.md)
- Sequence computation → see [timeline.md](timeline.md)
