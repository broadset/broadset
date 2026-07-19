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

The exact v1 sequence vocabulary is:

```ts
type LoopDefinition =
  | { readonly kind: 'none' }
  | { readonly kind: 'repeat'; readonly count?: number; readonly gapTicks: number }
  | {
      readonly kind: 'ping-pong';
      readonly count?: number;
      readonly gapTicks: number;
      readonly endpoint: 'once' | 'duplicate';
    };

interface Sequence {
  readonly id: Id;
  readonly name: string;
  readonly durationTicks: number;
  readonly workArea?: readonly [number, number];
  readonly loop: LoopDefinition;
  readonly tracks: readonly Track[];
  readonly markers: readonly Marker[];
  readonly cues: readonly Cue[];
  readonly childClips: readonly SequenceClip[];
}
```

Loop counts are positive safe integers when present; omission means unbounded. Gap ticks are
non-negative safe integers. IDs are unique within each sequence-owned collection.

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

The exact v1 property-track vocabulary is:

```ts
interface Track {
  readonly id: Id;
  readonly name: string;
  readonly target: PropertyTarget;
  readonly valueType: ValueType;
  readonly keyframes: readonly Keyframe[];
}

interface Keyframe {
  readonly id: Id;
  readonly tick: number;
  readonly value: TypedValue;
  readonly interpolation?: Interpolation;
}

type Interpolation =
  | { readonly kind: 'hold' }
  | { readonly kind: 'step'; readonly position: 'start' | 'end' }
  | { readonly kind: 'cubic-bezier'; readonly controlPoints: readonly [number, number, number, number] }
  | {
      readonly kind: 'spring';
      readonly mass: number;
      readonly stiffness: number;
      readonly damping: number;
      readonly initialVelocity: number;
      readonly settleThreshold: number;
    }
  | { readonly kind: 'spatial-path'; readonly path: StructuredPath; readonly orientToPath: boolean }
  | {
      readonly kind: 'counting';
      readonly rounding: 'floor' | 'ceil' | 'round' | 'truncate';
      readonly minimumDigits: number;
      readonly grouping: boolean;
    }
  | {
      readonly kind: 'color';
      readonly space: 'srgb' | 'display-p3' | 'rec2020' | 'lab' | 'oklab' | 'oklch' | 'cmyk' | 'gray';
    };
```

Tracks are non-empty. Keyframe ticks are strictly increasing and unique. Every non-final keyframe
has one outgoing interpolation and the final keyframe has none. Cubic-Bézier x controls lie in
`[0,1]`; spring mass, stiffness, and settle threshold are positive and damping is non-negative.
Counting is compatible only with string values, color only with color values, spatial path only
with point values, and continuous numeric interpolation only with numeric scalar or point values.
Counting `minimumDigits` is bounded (`PROJECT_V1_LIMITS.maxCountingMinimumDigits`) so a single
interpolation record cannot force unbounded display formatting; values above the bound are rejected.
Every non-close segment in a spatial-path interpolation MUST resolve to exactly one point within
that interpolation path; duplicate points and orphan segment endpoints are semantic errors.

### Requirement: Markers and Cues

Markers and cues MUST have stable identity and valid tick positions. Audio cues MUST reference compatible audio assets and declare deterministic firing behavior. Seeking MUST NOT accidentally fire crossed cues; forward playback and explicit event evaluation use declared cue semantics.

#### Acceptance Criteria

- [ ] Given a cue referencing an audio asset at a valid tick, validation succeeds
- [ ] Given a cue referencing a missing or non-audio asset, semantic validation fails
- [ ] Given a seek past a cue, audio does not fire as an unintended side effect

Markers are `{id, tick, label, color?}`. A cue is either audio
`{id, kind:'audio', tick, assetId, gain, firing}` or event
`{id, kind:'event', tick, eventId, payload?, firing}`. Gain is finite and non-negative. `firing` is
`'forward-only'`, `'explicit-only'`, or `'forward-and-explicit'`.

### Requirement: Child Sequence Clips

Child sequences MUST be referenced by ID with typed clip timing, time remapping, direction, and deterministic stagger parameters. Definitions are not recursively copied inline. Sequence dependency graphs MUST be acyclic and randomized behavior MUST store a deterministic seed.

#### Acceptance Criteria

- [ ] Given a child clip referencing an existing sequence with valid timing, validation succeeds
- [ ] Given a direct or indirect sequence cycle, semantic validation fails
- [ ] Given deterministic stagger input and seed, repeated evaluation produces the same schedule

```ts
type ClipRemap =
  | {
      readonly kind: 'linear';
      readonly sourceRange: readonly [number, number];
      readonly direction: 'forward' | 'reverse';
    }
  | { readonly kind: 'freeze'; readonly sourceTick: number };

interface SequenceClip {
  readonly id: Id;
  readonly sequenceId: Id;
  readonly outputRange: readonly [number, number];
  readonly remap: ClipRemap;
  readonly stagger?: {
    readonly index: number;
    readonly intervalTicks: number;
    readonly jitterTicks: number;
    readonly seed: number;
  };
}
```

All ranges are non-empty half-open tick intervals. Output ranges are bounded by the parent
sequence; source ranges and freeze ticks are bounded by the referenced child sequence during
semantic validation. Stagger fields are non-negative safe integers and the explicit seed makes
jitter deterministic.

### Requirement: Lifecycle

Optional document lifecycle maps IN, HOLD/UPDATE, and OUT phases to resolving sequence actions. Lifecycle state is runtime evaluation input and MUST NOT duplicate mutable playback state in canonical data.

#### Acceptance Criteria

- [ ] Given valid lifecycle sequence references, semantic validation succeeds
- [ ] Given an unresolved lifecycle target, validation fails
- [ ] Given the same lifecycle phase, event log, and tick, evaluation is deterministic

Lifecycle and state-machine actions use stable IDs and are the closed union `play-sequence`
`{sequenceId, behavior:'restart'|'resume'}`, `stop-sequence` `{sequenceId}`, or `seek-sequence`
`{sequenceId,tick}`. A `LifecycleDefinition` has stable `id` and required ordered `in`, `hold`,
`update`, and `out` action arrays; arrays may be empty. State machines are driven entirely by their
transition triggers (`event`/`lifecycle`/`after`), with external events supplied by the host
runtime; there is no action that dispatches a state-machine event directly. A prior fourth action
variant that did so was removed: it was runtime-inert (playback never dispatched it) and its
intended uses are already covered by transition triggers.

### Requirement: State Machines

Each state machine MUST contain stable ID, stable uniquely identified states and transitions, typed triggers, expression-AST guards, deterministic safe-integer priorities, and optional sequence actions. Initial and transition target states MUST resolve. Guards MUST be side-effect-free and type-correct. Priorities MUST be unique among transitions with the same source state and trigger; the eligible transition with the numerically lowest priority value wins.

#### Acceptance Criteria

- [ ] Given a resolving initial state and valid transitions, validation succeeds
- [ ] Given two transitions with the same source state, trigger, and priority, semantic validation fails
- [ ] Given multiple eligible transitions with distinct priorities, the transition with the numerically lowest priority value wins
- [ ] Given an invalid guard or missing state, validation fails

Each state contains stable `id`, `name`, ordered state values `{id,target,value}`, and required
`entryActions` and `exitActions`. A transition trigger is event `{kind:'event',eventId}`, lifecycle
`{kind:'lifecycle',phase:'in'|'hold'|'update'|'out'}`, or delayed
`{kind:'after',ticks}` with positive safe-integer ticks. A transition contains stable `id`, source
and target state IDs, trigger, optional Task 4 expression-AST guard, non-negative safe-integer
priority, and required actions. A state machine contains stable `id`, `name`, `initialStateId`,
ordered states, and ordered transitions. State/value/transition IDs are unique in their local
collections, state references resolve locally, and source+trigger+priority combinations are
unique. Guards that are structurally inferable without an external context MUST be boolean.

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

- Cross-sequence references, dependency cycles, cue asset kinds, target property compatibility, and contextual guard typing are validated by whole-project semantic validation.

## Non-Goals

- Playback scheduling implementation
- Wall-clock storage in canonical animation data
- Compatibility with element-indexed animation registries
