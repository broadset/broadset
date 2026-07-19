# Playback — Sequence Evaluation Specification

## Purpose

Defines pure evaluation of canonical sequences, typed tracks/keyframes, child clips, state machines, lifecycle, looping, stagger, and cross-entity property targets at exact integer ticks. DOM scheduling and authoring UI are outside this file.

---

## Requirements

### Requirement: Sequence Duration Computation

Every sequence MUST use its declared non-negative safe-integer `durationTicks` as its base duration. Track keyframes, markers, cues, work area, and child-clip output ranges MUST lie within that duration. Playback MUST NOT infer an implicit millisecond tail from the last keyframe. An empty sequence MAY declare `durationTicks: 0`; a non-empty sequence MUST declare a duration covering every contained tick and child output range.

Authoring commands MAY offer friendly default durations, but they MUST convert the chosen display duration through the document timebase and commit the resulting explicit integer `durationTicks` before validation.

#### Scenario: Empty sequence

- GIVEN a sequence with no tracks, markers, cues, or child clips and `durationTicks: 0`
- WHEN its duration is read
- THEN the result is exactly `0`

#### Scenario: Keyframes within explicit duration

- GIVEN a sequence with keyframes at ticks 0, 500, and 1000 and `durationTicks: 1300`
- WHEN its duration is read
- THEN the result is exactly `1300` without adding an implicit tail

#### Scenario: Child clip extends beyond duration

- GIVEN a child clip whose output range ends after the parent `durationTicks`
- WHEN semantic validation runs
- THEN validation fails at the child output range

#### Acceptance Criteria

- [ ] Given an empty sequence with `durationTicks: 0`, its duration is zero
- [ ] Given keyframes within an explicit duration, evaluation uses the declared `durationTicks` unchanged
- [ ] Given any contained tick or child output range beyond duration, semantic validation fails
- [ ] No evaluator derives canonical duration from milliseconds or a hard-coded tween tail

---

### Requirement: Sequence Frame Computation

The system MUST compute resolved typed property contributions for a sequence at any valid exact tick. Each property track has one stable `PropertyTarget`, declared value type, and ordered typed keyframes. Before a track's first keyframe, that track contributes no value. At or after its last keyframe through `durationTicks`, it holds the last typed value unless the track's closed interpolation/segment contract states otherwise.

#### Scenario: Linear interpolation between numeric keyframes

- GIVEN an opacity track with numeric keyframes 0 at tick 0 and 1 at tick 1000
- WHEN computed at tick 500 with linear interpolation
- THEN the typed opacity contribution is `0.5`

#### Scenario: Step interpolation holds value

- GIVEN a boolean target track with `false` at tick 0 and `true` at tick 500 using step interpolation
- WHEN computed at tick 250
- THEN the contribution is `false`

#### Scenario: Before first keyframe contributes nothing

- GIVEN a property track whose first keyframe is at tick 500
- WHEN computed at tick 0
- THEN that track contributes no value

#### Scenario: Terminal seek holds the final value

- GIVEN an opacity track ending at tick 300 with value 1 in a sequence whose duration is 5000 ticks
- WHEN computed at tick 5000
- THEN the typed opacity contribution is `1`

#### Acceptance Criteria

- [ ] Numeric interpolation at an exact midpoint produces the type-correct midpoint
- [ ] Step interpolation holds the prior typed value until the next keyframe tick
- [ ] A track contributes nothing before its first keyframe
- [ ] Interactive seek at `durationTicks` exposes terminal values without sampling timed media beyond its interval

---

### Requirement: Deterministic State-Machine Derivation

Runtime state at tick T MUST derive from canonical state-machine definitions, lifecycle input, validated data, and the ordered typed runtime event log through T. Keyframes contain typed property values only; they MUST NOT contain `setState`, `addModifier`, or `removeModifier` action payloads.

Each state machine begins at its declared initial state. At each event tick, eligible transitions are evaluated using typed trigger, side-effect-free guard, and deterministic priority; the numerically lowest eligible priority wins. Optional transition sequence actions start referenced sequences at that exact tick. UI “modifier” affordances MAY author independent two-state machines (inactive/active), but no modifier set is serialized.

Direct seek, forward evaluation, backward seek, and repeated scrubbing MUST produce the same machine states and sequence-action schedule for identical inputs. Implementations MAY checkpoint derived state but MUST remain semantically equivalent to replaying the ordered event log from the initial state.

#### Scenario: State transition derives from event log

- GIVEN a state machine initially `idle` with an `activate` event transition to `active` at tick 500
- WHEN state is derived at tick 250 and tick 750
- THEN the state is `idle` at tick 250 and `active` at tick 750

#### Scenario: Independent modifier-like state machines

- GIVEN independent `pulse` and `glow` two-state machines with typed activation/deactivation events
- WHEN `pulse` and `glow` activate by tick 300 and `pulse` deactivates at tick 500
- THEN both are active at tick 300 and only `glow` is active after tick 500

#### Scenario: Seek direction independence

- GIVEN sequential evaluation to tick 800 followed by a direct seek to tick 200
- WHEN results are compared with a fresh evaluation at tick 200
- THEN the state-machine states and active sequence actions are identical

#### Scenario: Same-tick transitions use stable priority

- GIVEN multiple eligible transitions for one source state and trigger at the same tick
- WHEN they are evaluated
- THEN the unique numerically lowest priority transition wins

#### Acceptance Criteria

- [ ] Given identical canonical data, runtime event log, validated data, and tick, state derivation is identical regardless of seek history
- [ ] Given independent two-state machines, each derives independently without a serialized modifier set
- [ ] Given same-tick eligible transitions, deterministic priority selects one result
- [ ] Given a stale sequence action or state reference, semantic validation fails before playback
- [ ] Canonical keyframes never store state/modifier action markers

---

### Requirement: Child Sequence Clip Composition

The system MUST compute referenced child sequences relative to each canonical child clip's exact output range, source range, direction, and typed time remap. A child clip contributes nothing before its output start or after its output end. Child sequence definitions remain referenced by stable ID and dependency graphs MUST be acyclic.

#### Scenario: Child starts at output start tick

- GIVEN a child clip with output range `[500, 1500]` and source range `[0, 1000]`
- WHEN the parent is evaluated at tick 400 and tick 600
- THEN the child contributes nothing at tick 400 and samples source tick 100 at tick 600

#### Scenario: Child properties interpolate

- GIVEN a child clip starting at parent tick 200 whose source property track spans ticks 0 through 1000
- WHEN the parent is computed at tick 700
- THEN the child samples source tick 500 and contributes 50% progress

#### Acceptance Criteria

- [ ] Child sampling uses exact source/output tick mapping
- [ ] Child clips outside their output range contribute nothing
- [ ] Cyclic or stale child-sequence references fail semantic validation

---

### Requirement: Stable Target Property Routing

Every property track MUST contribute to its declared stable `PropertyTarget`—an entity address plus schema-approved RFC 6901 pointer. Resolved contributions MUST retain target and provenance; they MUST NOT be split into owner-relative generic property bags or addressed by element indexes.

#### Scenario: Cross-element targeting

- GIVEN an opacity track targeting element `other-el` through its stable entity address and appearance pointer
- WHEN computed at the midpoint
- THEN the resolved contribution for that exact target is opacity `0.5`
- AND no contribution is attributed to the sequence's authoring-context element

#### Acceptance Criteria

- [ ] Cross-entity tracks route only to their declared stable targets
- [ ] Resolved values retain sequence, track, keyframe-segment, and overridden-value provenance
- [ ] Stale, wrong-kind, or type-incompatible targets fail semantic validation

---

### Requirement: Element Track Batch Computation

The system MUST compute all active sequence tracks targeting an element at an exact tick from document-owned and expanded component-owned sequences. Elements with no targeted tracks return an empty contribution list.

#### Scenario: No tracks returns empty

- GIVEN a resolving element ID with no active targeted tracks
- WHEN contributions are computed
- THEN the result is an empty list

#### Scenario: Multiple sequences contribute

- GIVEN lifecycle and state-machine sequence actions whose tracks target one element
- WHEN computed at an exact tick where both are active
- THEN both typed contributions are returned with precedence/provenance resolved deterministically

#### Acceptance Criteria

- [ ] Given no active targeted tracks, the result is empty
- [ ] Given multiple active sequence contributions, resolution precedence and provenance are deterministic

---

### Requirement: Loop Duration and Tick Mapping

Canonical loop configuration MUST map transport ticks to exact sequence ticks without floating-point accumulation. A finite loop count has derived transport duration `durationTicks × count`. An unbounded loop has no finite completion tick; runtime APIs MAY expose that as `null` or an explicit unbounded variant, but canonical JSON MUST NOT store `Infinity`. Ping-pong mapping reverses odd iterations while retaining integer ticks.

#### Scenario: Finite loop duration

- GIVEN a sequence with `durationTicks: 1000`, loop mode `loop`, and count 3
- WHEN derived transport duration is computed
- THEN it is exactly 3000 ticks

#### Scenario: Ping-pong tick mapping

- GIVEN `durationTicks: 1000` in ping-pong mode
- WHEN transport tick 1500 is mapped
- THEN the effective sequence position is tick 500 on the reverse iteration

#### Scenario: Unbounded loop

- GIVEN an unbounded loop definition
- WHEN completion is queried
- THEN the runtime result is explicitly unbounded and no non-JSON numeric value is serialized

#### Acceptance Criteria

- [ ] Finite loops derive exact safe-integer transport durations
- [ ] Odd ping-pong iterations reverse exact tick mapping
- [ ] Unbounded loops never serialize `Infinity`
- [ ] Non-looping sequences retain their declared duration

---

### Requirement: Deterministic Stagger Offsets

Typed child-clip stagger parameters MUST produce exact integer tick offsets from canonical child order and a stored deterministic seed where randomization applies. Normal, reverse, and center direction preserve the existing visual ordering behavior. The maximum derived stagger offset plus child output duration MUST remain within the parent sequence duration.

#### Scenario: Normal stagger offsets

- GIVEN four children with delay 200 ticks and direction `normal`
- WHEN offsets are derived
- THEN they are 0, 200, 400, and 600 ticks

#### Scenario: Center stagger with odd count

- GIVEN five children with delay 100 ticks and direction `center`
- WHEN offsets are derived
- THEN the center starts at 0, adjacent children at 100, and outer children at 200 ticks

#### Scenario: Stagger must fit duration

- GIVEN three child clips with duration 500 ticks and normal stagger delay 200 ticks
- WHEN semantic validation runs against a parent duration below 900 ticks
- THEN validation fails because the last child completion is out of range

#### Acceptance Criteria

- [ ] Normal, reverse, and center stagger preserve deterministic child-order behavior
- [ ] Randomized stagger repeats identically from the stored seed
- [ ] Parent duration covers every derived child completion tick

---

### Requirement: Spatial-Path Transform Interpolation

A compatible transform track MAY use the closed spatial-path interpolation variant with typed structured path geometry, arc-length sampling, easing, and optional tangent orientation. Evaluation MUST output the target's type-compatible exact transform value; it MUST NOT persist generic `x`, `y`, `rotation`, `motionPath`, or raw SVG path fields.

#### Scenario: Arc-length position sampling

- GIVEN a curved typed spatial path and linear easing
- WHEN interpolated at normalized progress 0.5
- THEN translation lies at the arc midpoint rather than the straight-line midpoint

#### Scenario: Tangent orientation

- GIVEN spatial-path interpolation with tangent orientation enabled
- WHEN evaluated at a turn
- THEN the exact transform includes the tangent-aligned orientation composed with the base transform

#### Scenario: Easing applies to path progress

- GIVEN spatial-path interpolation with ease-in
- WHEN evaluated at normalized time 0.5
- THEN arc-length progress is below 50%

#### Acceptance Criteria

- [ ] Spatial paths sample by uniform arc length
- [ ] Optional tangent orientation composes into the exact target transform
- [ ] Easing applies before arc-length lookup
- [ ] Structured path identity and typed transform output remain canonical

---

## Spec Gaps

- Exact closed field tables for loop, child-clip remap, stagger, and spatial interpolation are finalized by the exact-time implementation program without changing these semantics.

---

## Non-Goals

- Easing and value interpolation math → see [interpolation.md](interpolation.md)
- DOM playback and scheduling → see [playback.md](playback.md)
