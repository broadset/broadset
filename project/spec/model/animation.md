# Model — Sequences and Declarative Animation

## Purpose

Defines stable sequences, typed tracks and keyframes, reusable child clips, markers and cues, lifecycle bindings, and deterministic state machines.

## Requirements

### Requirement: Sequence Definitions

A document and component definition MAY own ordered sequences. Each sequence MUST have stable `id`, `name`, non-negative safe-integer `durationTicks`, typed `loop`, ordered `tracks`, `markers`, `cues`, and `childClips`, and MAY have a valid `workArea` within its duration. IDs MUST be unique in each sequence collection.

#### Acceptance Criteria

- [ ] Given a sequence with duration and uniquely identified children, validation succeeds
- [ ] Given duplicate sequence or child IDs, semantic validation fails
- [ ] Given a work area outside zero through duration, validation fails

### Requirement: Property Tracks

A property track MUST have stable identity, a resolving `PropertyTarget`, declared value type, and stable ordered keyframes. Every keyframe value MUST match both the track and target property. Track times are non-negative safe-integer ticks within sequence duration.

#### Acceptance Criteria

- [ ] Given type-compatible ordered keyframes targeting an approved property, validation succeeds
- [ ] Given a stale target reference, semantic validation rejects the project
- [ ] Given a keyframe value incompatible with its track or target, validation fails

### Requirement: Typed Keyframes and Interpolation

Every keyframe MUST have stable ID, exact tick time, typed value, and explicit segment interpolation where applicable. Supported interpolation is a closed typed union including hold, step, cubic Bézier, spring, spatial path, counting, and color interpolation with declared color space. An interpolation kind MUST be compatible with the value and target.

#### Acceptance Criteria

- [ ] Given numeric cubic Bézier and spring segments with valid parameters, validation succeeds
- [ ] Given color interpolation without an interpolation color space, validation fails
- [ ] Given interpolation incompatible with a boolean, string, or asset value, validation fails

### Requirement: Markers and Cues

Markers and cues MUST have stable identity and valid tick positions. Audio cues MUST reference compatible audio assets and declare deterministic firing behavior. Seeking MUST NOT accidentally fire crossed cues; forward playback and explicit event evaluation use declared cue semantics.

#### Acceptance Criteria

- [ ] Given a cue referencing an audio asset at a valid tick, validation succeeds
- [ ] Given a cue referencing a missing or non-audio asset, semantic validation fails
- [ ] Given a seek past a cue, audio does not fire as an unintended side effect

### Requirement: Child Sequence Clips

Child sequences MUST be referenced by ID with typed clip timing, time remapping, direction, and deterministic stagger parameters. Definitions are not recursively copied inline. Sequence dependency graphs MUST be acyclic and randomized behavior MUST store a deterministic seed.

#### Acceptance Criteria

- [ ] Given a child clip referencing an existing sequence with valid timing, validation succeeds
- [ ] Given a direct or indirect sequence cycle, semantic validation fails
- [ ] Given deterministic stagger input and seed, repeated evaluation produces the same schedule

### Requirement: Lifecycle

Optional document lifecycle maps IN, HOLD/UPDATE, and OUT phases to resolving sequences or state-machine events. Lifecycle state is runtime evaluation input and MUST NOT duplicate mutable playback state in canonical data.

#### Acceptance Criteria

- [ ] Given valid lifecycle sequence and event references, semantic validation succeeds
- [ ] Given an unresolved lifecycle target, validation fails
- [ ] Given the same lifecycle phase, event log, and tick, evaluation is deterministic

### Requirement: State Machines

Each state machine MUST contain stable ID, stable uniquely identified states and transitions, typed triggers, expression-AST guards, deterministic priorities, and optional sequence actions. Initial and transition target states MUST resolve. Guards MUST be side-effect-free and type-correct.

#### Acceptance Criteria

- [ ] Given a resolving initial state and valid transitions, validation succeeds
- [ ] Given equal-priority ambiguous transitions, validation fails unless the schema defines deterministic tie-breaking
- [ ] Given an invalid guard or missing state, validation fails

### Requirement: Deterministic Evaluation and Seeking

Declarative state at tick T MUST be a pure function of canonical data, validated input data, runtime event log, and T. Direct seek to T and sequential evaluation to T MUST produce semantically identical resolved values. Timed media uses `[0, durationTicks)` while interactive seek permits `durationTicks` to inspect terminal state.

#### Acceptance Criteria

- [ ] Given the same inputs, direct and sequential evaluation at T are identical
- [ ] Given terminal seek at `durationTicks`, the terminal state is inspectable without sampling media beyond its interval
- [ ] Given repeated offline evaluation, no wall-clock or unseeded-random difference occurs

### Requirement: Resolution Precedence

State-machine values apply after bindings. Sequence evaluation and runtime lifecycle state apply last. Resolved properties MUST retain provenance identifying track, keyframe segment, state, and earlier overridden values.

#### Acceptance Criteria

- [ ] Given binding, state, and sequence values on one target, the sequence value is effective
- [ ] Given no active sequence contribution, the state value remains effective
- [ ] Given an effective animated value, provenance identifies its exact target and sequence source

## Spec Gaps

- Full track, loop, marker, cue, transition, and interpolation variant field tables are finalized by the exact-time program without weakening these invariants.

## Non-Goals

- Playback scheduling implementation
- Wall-clock storage in canonical animation data
- Compatibility with element-indexed animation registries
