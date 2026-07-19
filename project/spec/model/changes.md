# Model — Atomic Change Batches

## Purpose

Defines the model boundary for invertible local mutations used by persistence, undo, recovery, and collaboration without embedding operation history in the canonical project snapshot.

## Requirements

### Requirement: Change Batch Envelope

A `ChangeBatch` MUST contain `version: 1`, stable `transactionId`, `origin` (`local`, `remote`, `recovery`, or `system`), and a non-empty ordered `operations` array. The whole batch MUST be structurally, semantically, and size validated before application.

#### Acceptance Criteria

- [ ] Given a valid supported batch, every operation is validated before mutation begins
- [ ] Given an unsupported batch version or invalid operation, no operation is applied
- [ ] Given a size-cap violation, the batch is rejected before allocation proportional to its declared payload

### Requirement: Stable Targets and Ordered Collections

Operations MUST address entities by stable identity and properties by RFC 6901 JSON Pointer. Ordered-collection changes MUST use stable identity anchors rather than durable array indexes. Operation order within a batch is deterministic and later operations observe earlier batch results.

#### Acceptance Criteria

- [ ] Given entity reorder after concurrent index changes, stable anchors preserve the intended entity target
- [ ] Given multiple operations in one batch, they apply sequentially against batch-relative state
- [ ] Given a missing stable anchor, atomic validation fails

### Requirement: Invertibility and Preconditions

Every operation MUST carry enough typed prior and next state to be independently invertible and MUST verify its expected prior value before applying. A failed precondition rejects the entire batch without partial mutation.

#### Acceptance Criteria

- [ ] Given an applied operation, its inverse restores the exact prior canonical state
- [ ] Given an expected prior value mismatch, the whole batch is rejected
- [ ] Given a rejected batch, project identity and serialization remain unchanged

### Requirement: Atomic Application

Batch application is all-or-nothing. External and remote batches receive the same validation as local batches. Successful durable acknowledgement requires an atomic persistence journal/head commit; mutation alone is not durable acknowledgement.

#### Acceptance Criteria

- [ ] Given a failure at any operation, none of the batch effects become visible
- [ ] Given a successful batch but failed persistence commit, durability is not acknowledged
- [ ] Given a verified atomic commit, recovery can select the complete new head

### Requirement: Snapshot Boundary

Change logs, undo stacks, CRDT metadata, presence, sync cursors, and journals MUST NOT appear inside `project.json`. They MAY reference snapshot semantic hashes and stable project entity IDs in external persistence or collaboration stores.

#### Acceptance Criteria

- [ ] Given a project save after many edits, no operation log or undo entry is serialized
- [ ] Given collaboration metadata, removing it does not alter project semantics
- [ ] Given a persistence journal, it can materialize the same validated project snapshot

### Requirement: Recovery

The previous valid snapshot MUST remain recoverable until a replacement package or journal head is fully verified and atomically committed. Recovery-origin batches still require full validation and explicit diagnostics.

#### Acceptance Criteria

- [ ] Given interruption before head commit, reopening returns the prior valid snapshot
- [ ] Given a corrupt candidate head, recovery preserves it for diagnosis and uses the last verified snapshot when available
- [ ] Given a recovery batch, its origin is retained outside canonical project semantics

## Spec Gaps

- [ ] **Proposed complete atomic/stable-anchor vocabulary:** ADR-011 proposes versioned batches, stable anchors, JSON Pointer paths, project/document/component lifecycle coverage, and independently invertible operations. Current discriminants, dot paths, and index-based reorder payloads remain authoritative until a maintainer ratifies a replacement and defines deterministic multi-reorder batch semantics, migration, and exhaustive round-trip tests.
- The complete operation union, journal storage adapters, conflict protocol, and CRDT mapping are owned by the persistence and collaboration programs.

---

## Non-Goals

- Persisting operation history in `.bsp`
- Defining a network collaboration protocol
- Using array index as durable identity
