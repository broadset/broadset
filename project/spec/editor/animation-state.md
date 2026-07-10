# Editor — Animation Authoring State Specification

## Purpose

Defines editor mutations for document-owned and component-owned sequences with stable property tracks/keyframes, plus the document-owned lifecycle, document-owned state machines, and runtime event dispatch. It does NOT define playback interpolation or sequence evaluation math. See [conventions](../../README.md).

---

## Requirements

### Requirement: Sequence Upsert and Removal

The system MUST upsert and remove sequences in their document or component owner by stable `sequenceId` only. Display names MUST NOT serve as identity fallbacks. Upsert MUST preserve unrelated sequences and replace only the matching stable ID. Removal MUST be atomic and MUST reject a sequence that remains referenced by lifecycle, a state-machine action, or a child clip unless the same validated transaction removes or retargets every reference.

#### Scenario: Upsert replaces one stable sequence

- GIVEN a document owner with multiple sequences
- WHEN a sequence with an existing stable ID is upserted
- THEN only that sequence is replaced and its unrelated siblings remain unchanged

#### Scenario: Duplicate display names do not alias

- GIVEN two sequences with different stable IDs and the same display name
- WHEN one sequence is updated by ID
- THEN the other sequence remains unchanged

#### Scenario: Referenced sequence removal is rejected

- GIVEN a lifecycle binding or state-machine action references a sequence
- WHEN removal is requested without retargeting that reference
- THEN the transaction is rejected without mutation

#### Acceptance Criteria

- [ ] Given an existing stable sequence ID, upsert replaces only that sequence
- [ ] Given duplicate display names, every command still resolves by stable ID
- [ ] Given a stale owner or sequence ID, the command fails without mutation
- [ ] Given a remaining lifecycle, transition-action, or child-clip reference, sequence removal is rejected atomically

---

### Requirement: Property Track and Keyframe Integrity

Property-track commands MUST address owner, sequence, track, and keyframe entities by stable IDs. A track owns exactly one resolving `PropertyTarget`, declared value type, and ordered keyframes; each keyframe contains one type-compatible value and compatible outgoing interpolation. Commands MUST NOT read or write multi-property keyframe bags. Adding, updating, removing, or reordering a track/keyframe MUST preserve unrelated tracks/keyframes, maintain exact safe-integer ticks within `durationTicks`, and reject stale or type-incompatible targets.

#### Scenario: Keyframe update is stable-ID scoped

- GIVEN a sequence with multiple property tracks and keyframes
- WHEN one keyframe is updated by `sequenceId`, `trackId`, and `keyframeId`
- THEN only that keyframe's typed value or interpolation changes

#### Scenario: Track target determines the property

- GIVEN a numeric keyframe on an opacity track
- WHEN its value is edited
- THEN the property is resolved from the track's `PropertyTarget` and the keyframe stores only the numeric value

#### Scenario: Empty track cleanup is atomic

- GIVEN a track with one keyframe
- WHEN that keyframe is removed and empty tracks are not retained by the command
- THEN the keyframe and track are removed in the same transaction without leaving stale selection

#### Acceptance Criteria

- [ ] Given a stable keyframe address, only the addressed typed keyframe changes
- [ ] Given two tracks targeting different properties, editing one preserves the other
- [ ] Given a stale ID, out-of-range tick, or incompatible value, the whole command fails
- [ ] Keyframe commands never infer identity from a display name or store a property bag

---

### Requirement: Lifecycle Binding Integrity

The system MUST set and remove the document's optional IN, HOLD/UPDATE, and OUT lifecycle phase actions using resolving stable sequence addresses or typed state-machine events. IN and OUT are fixed lifecycle phase slots in the authoring view, not removable custom states and not synthetic entries in a per-element configuration array. An empty slot MAY be displayed without serializing a binding. Each committed action MUST validate its referenced sequence or state-machine event in the document's permitted identity scope.

#### Scenario: Lifecycle action replacement is phase-scoped

- GIVEN IN and OUT lifecycle actions
- WHEN the IN action is replaced with another resolving sequence ID
- THEN OUT remains unchanged

#### Scenario: Empty lifecycle view does not create data

- GIVEN a document without a lifecycle definition
- WHEN the Animation panel displays empty IN and OUT slots
- THEN canonical project data remains unchanged until the user commits an action

#### Acceptance Criteria

- [ ] Given an existing lifecycle phase action, setting it again replaces only that phase
- [ ] Given an unresolved sequence or state-machine event reference, the transaction fails
- [ ] IN and OUT remain fixed phase slots while optional HOLD/UPDATE actions retain deterministic order
- [ ] Empty authoring slots do not create element-local bindings or placeholder canonical objects

---

### Requirement: State-Machine Mutation Integrity

The system MUST add, update, remove, and reorder document-owned state machines, states, and transitions by stable ID. Initial-state, transition-target, trigger, guard, priority, and optional sequence-action references MUST validate atomically against the document's permitted sequence scope. Friendly modifier controls MUST author independent two-state machines with stable inactive/active states and typed activation/deactivation events; no modifier binding collection is serialized.

#### Scenario: Transition update is stable-ID scoped

- GIVEN a state machine with multiple transitions
- WHEN one transition is updated by stable ID
- THEN unrelated transitions and state machines remain unchanged

#### Scenario: Modifier-like control remains independent

- GIVEN independent pulse and glow authoring controls
- WHEN pulse is enabled and disabled
- THEN only pulse's two-state machine and event schedule change

#### Acceptance Criteria

- [ ] Given an existing state-machine entity ID, a mutation affects only that entity
- [ ] Given a stale state, transition, sequence-action, or event reference, the whole transaction fails
- [ ] Reordering uses stable identity and preserves deterministic transition priority semantics
- [ ] Friendly modifier controls serialize independent state machines rather than modifier bindings

---

### Requirement: Lifecycle and State Event Visibility Mapping

The editor MUST represent onscreen/offscreen changes through lifecycle actions or typed state-machine events whose referenced sequences contain explicit visibility tracks targeting stable elements. Applying IN then OUT MUST preserve the existing onscreen/offscreen result without mutating canonical element-local runtime fields. A convenience command MAY include descendants, but it MUST generate or target explicit descendant property tracks only for descendants that have corresponding canonical lifecycle/state-machine authoring definitions; no implicit recursive runtime field mutation is allowed.

#### Scenario: IN and OUT actions drive visibility

- GIVEN lifecycle actions whose sequences target an element's visibility property
- WHEN IN then OUT is evaluated
- THEN the resolved element becomes onscreen then offscreen

#### Scenario: Descendant propagation uses explicit targets

- GIVEN a parent with multiple descendants
- WHEN an OUT convenience action includes descendants
- THEN only descendants with corresponding canonical definitions receive explicit targeted visibility contributions

#### Acceptance Criteria

- [ ] Given valid IN and OUT actions, resolved visibility becomes onscreen then offscreen
- [ ] Given descendant inclusion, only explicitly targeted descendants with canonical definitions change
- [ ] Canonical elements do not acquire mutable active-state, modifier, or per-element playback fields

---

### Requirement: Runtime Events and Typed Clip Updates

The system MUST support typed runtime state-machine events with stable event identity and atomic typed clip updates. Exact retransmissions of the same event ID MUST be deduplicated, while distinct event IDs with equal payloads remain ordered events. The runtime event log remains outside canonical project data; authoring clip changes update `appearance.clip` through a compatible vector reference.

#### Scenario: State-machine events are deterministic and deduplicated

- GIVEN an element-targeted typed event and resolving state-machine trigger
- WHEN activation, deactivation, or toggle affordances retransmit one stable event ID
- THEN the runtime event log contains that event once in deterministic order

#### Scenario: Typed clip update persists

- GIVEN an element eligible for clip authoring and a compatible vector source
- WHEN the clip command commits
- THEN `appearance.clip` contains the typed resolving reference

#### Acceptance Criteria

- [ ] Given exact retransmission of one stable event ID, the event log contains it once; given distinct IDs, both events remain ordered
- [ ] Given a valid clip edit, `appearance.clip` stores the typed resolving vector reference

---

## Spec Gaps

_None — all requirements have acceptance criteria._

---

## Non-Goals

- Sequence interpolation and easing behavior → see `project/spec/playback/spec.md`
- Sequence playback orchestration in UI editing sessions → see [timeline-playback.md](timeline-playback.md)
- Document-level schema constraints → see `project/spec/model/spec.md`
