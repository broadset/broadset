# Editor — Collaboration Specification

## Purpose

Defines the document diffing engine, canonical sequence/lifecycle/state-machine diffing, change stream controller, and remote change application. These mechanisms enable real-time collaboration by detecting local changes, broadcasting them, and applying incoming remote changes without re-emitting them.

---

## Requirements

### Requirement: Document Element Diffing

The system MUST detect element additions, removals, property updates (including nested paths), and reorder changes between two document snapshots. Identical documents MUST produce an empty diff. The runtime event log, derived state-machine state, active sequence controls, and resolved playback contributions are outside canonical project data and MUST be excluded from diffs.

#### Scenario: Element add detected

- GIVEN prev has no elements and next has `el-1`
- WHEN diffed
- THEN the result contains an `element:add` change for `el-1`

#### Scenario: Element remove detected

- GIVEN prev has `el-1` and next is empty
- WHEN diffed
- THEN the result contains an `element:remove` change for `el-1`

#### Scenario: Nested property update detected

- GIVEN `el-1` position changes from `x=0` to `x=100`
- WHEN diffed
- THEN the result contains an `element:update` change with a position path

#### Scenario: Reorder detected

- GIVEN elements `[el-1, el-2]` reordered to `[el-2, el-1]`
- WHEN diffed
- THEN two `element:reorder` changes are produced

#### Scenario: Derived playback state excluded

- GIVEN only the runtime event log, derived machine state, or active sequence controls changed
- WHEN diffed
- THEN no update changes are produced for those fields

#### Scenario: Identical documents produce empty diff

- GIVEN the same document reference
- WHEN diffed
- THEN the result is empty

#### Acceptance Criteria

- [ ] Given prev has no elements and next has `el-1`, the result contains an `element:add` change for `el-1`
- [ ] Given prev has `el-1` and next is empty, the result contains an `element:remove` change for `el-1`
- [ ] Given `el-1` position changes from `x=0` to `x=100`, the result contains an `element:update` change with a position path
- [ ] Given elements `[el-1, el-2]` reordered to `[el-2, el-1]`, two `element:reorder` changes are produced
- [ ] Given only non-canonical runtime playback state changed, no project update changes are produced
- [ ] Given the same document reference, the result is empty

---

### Requirement: Page and Surface Diffing

The system MUST detect stable page additions/removals and canonical surface changes through atomic operations addressed by stable IDs and RFC 6901 pointers.

#### Scenario: Page add detected

- GIVEN prev has 1 page and next has 2
- WHEN diffed
- THEN the result contains a `page:add` change

#### Scenario: Surface width change detected

- GIVEN `surface.size[0]` changes from its prior value to 500
- WHEN diffed
- THEN the result contains a typed replace operation targeting the document surface width pointer

#### Acceptance Criteria

- [ ] Given prev has 1 page and next has 2, the result contains a `page:add` change
- [ ] Given surface width changes to 500, the result contains a typed operation targeting `surface.size` with expected prior value

---

### Requirement: Sequence, Lifecycle, and State-Machine Diffing

The system MUST detect additions, removals, stable reorders, and typed per-field changes in document-owned sequences, component-owned sequences, their property tracks/keyframes, and the document-only lifecycle definition and state machines. Operations MUST address canonical entities by stable ID and properties by RFC 6901 pointer; display names and array indexes MUST NOT be durable identity. Same-reference immutable collections MUST produce an empty diff.

#### Scenario: Sequence added to document owner

- GIVEN the prior document has no sequences and the next document owns sequence `seq-1`
- WHEN diffed
- THEN a typed stable-ID insertion operation for `seq-1` is produced

#### Scenario: Keyframe value change detected

- GIVEN one typed keyframe value changes on track `track-1` in sequence `seq-1`
- WHEN diffed
- THEN a typed replace operation addresses that keyframe by stable entity identity and value pointer

#### Scenario: Lifecycle action changes

- GIVEN the document OUT lifecycle action changes from `seq-1` to `seq-2`
- WHEN diffed
- THEN a typed replace operation targets the OUT action and retains its expected prior value

#### Acceptance Criteria

- [ ] Given a sequence addition, a stable-ID insertion operation is produced for its canonical owner
- [ ] Given a typed keyframe change, the operation identifies the owner, sequence, track, keyframe, and exact value pointer without using names as identity
- [ ] Given lifecycle or state-machine changes, typed operations preserve stable references and expected prior values
- [ ] Given unchanged immutable canonical collections, no operation is produced

---

### Requirement: Change Stream Controller

The system MUST emit change arrays to subscribers. Empty arrays MUST NOT be emitted. Suppression MUST prevent emission until unsuppressed. Unsubscribe MUST remove the listener.

#### Scenario: Emit reaches subscriber

- GIVEN a subscribed listener
- WHEN changes are emitted
- THEN the listener receives them

#### Scenario: Suppressed emission skipped

- GIVEN suppression is active
- WHEN changes are emitted
- THEN the listener does not receive them

#### Scenario: Empty array not emitted

- GIVEN a subscribed listener
- WHEN an empty array is emitted
- THEN the listener is not called

#### Acceptance Criteria

- [ ] Given a subscribed listener, the listener receives them
- [ ] Given suppression is active, the listener does not receive them
- [ ] Given a subscribed listener, the listener is not called

---

### Requirement: Ephemeral vs Committed Change Emission

The system MUST only emit changes for committed actions, not ephemeral updates (e.g. drag operations). After an ephemeral sequence, committing MUST emit the full diff from the last committed state.

#### Scenario: Ephemeral updates suppressed

- GIVEN an ephemeral drag sequence
- WHEN multiple ephemeral updates occur
- THEN no changes are emitted

#### Scenario: Commit after ephemeral emits full diff

- GIVEN ephemeral updates followed by a commit
- WHEN the commit fires
- THEN changes reflect the full diff from last committed state

#### Acceptance Criteria

- [ ] Given an ephemeral drag sequence, no changes are emitted
- [ ] Given ephemeral updates followed by a commit, changes reflect the full diff from last committed state

---

### Requirement: Remote Change Application

The system MUST apply incoming remote changes without re-emitting them through the change stream. It MUST support validated atomic operations for element add/remove/update/reorder, page add/remove, settings updates, and canonical sequence/lifecycle/state-machine changes.

#### Scenario: Remote add does not re-emit

- GIVEN a change stream listener
- WHEN a remote `element:add` is applied
- THEN the element exists in the document but no changes are emitted

#### Scenario: Runtime playback payload rejected in apply

- GIVEN a remote operation attempts to write derived state-machine state onto an element
- WHEN applied
- THEN validation rejects the non-canonical target and the project remains unchanged

#### Acceptance Criteria

- [ ] Given a change stream listener, the element exists in the document but no changes are emitted
- [ ] Given a remote operation targeting non-canonical runtime playback state, atomic validation rejects it without project mutation

---

### Requirement: Change Round-Trip Fidelity

Diffing two documents and applying the resulting changes to the first document MUST produce a state equivalent to the second document. This MUST hold for element add, remove, update, nested property update, sequence/lifecycle/state-machine changes, settings changes, and page operations.

#### Scenario: Element add round-trip

- GIVEN prev=empty, next=one element
- WHEN diff→apply is performed on prev
- THEN the result matches next

#### Scenario: Complex multi-change round-trip

- GIVEN prev=[el-1, el-2], next=[el-1(updated), el-3]
- WHEN diff→apply is performed
- THEN el-1 is updated, el-2 is removed, el-3 is added

#### Acceptance Criteria

- [ ] Given prev=empty, next=one element, the result matches next
- [ ] Given prev=[el-1, el-2], next=[el-1(updated), el-3], el-1 is updated, el-2 is removed, el-3 is added

---

### Requirement: Conflict Resolution is Host-Provided

The editor's collaboration system defines the change stream format and remote change application protocol. Conflict resolution for concurrent edits (e.g., two clients editing the same element simultaneously) is NOT in scope for the editor engine. The host application is responsible for implementing conflict resolution (last-writer-wins, OT, CRDT, or other strategy) at the transport layer. The editor applies remote changes as received, in order.

#### Scenario: Sequential remote changes for the same element

- GIVEN two remote changes arrive for the same element
- WHEN they are applied in order
- THEN the second change overwrites the first (no merge logic is applied by the editor)

#### Acceptance Criteria

- [ ] Given two sequential remote changes for the same element, the last change is the final state

---

## Spec Gaps

- [ ] **Conflict Resolution is Host-Provided:** No automated tests verify last-writer-wins behavior for sequential remote changes targeting the same element property.
- [ ] **Proposed atomic collaboration batches:** ADR-011 proposes broader project diff/apply/invert coverage, stable transaction identity, expected-old-value validation, and stable ordering anchors. The current array-based change stream and two-operation reversal scenario remain authoritative until a maintainer ratifies a replacement consistent with `model/changes.md`.

---

## Non-Goals

- Runtime data injection → see [data-store.md](data-store.md)
- Path editing and element placement → see [editing.md](editing.md)
- **Transport protocol** — The collaboration spec defines change detection, diffing, and application. How changes are transmitted between peers (WebSocket, REST, polling, server-sent events, etc.) is a host-application concern, not an editor-engine concern. The editor emits `DocumentChange` payloads; the host decides how to send and receive them.
