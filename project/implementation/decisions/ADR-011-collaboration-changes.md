# ADR-011: Complete Atomic Change Semantics

Status: proposed 2026-07-09 — does not override `project/spec/**` without explicit maintainer ratification.

## Context

`model/changes.md` defined page overrides, data-schema, assets, and project settings, while the editor collaboration spec and implementation covered only a subset. Choosing a network/CRDT substrate before local semantics are complete would encode data loss into the transport.

## Proposed decision

- `model/changes.md` is the exhaustive local change vocabulary. It covers project/document lifecycle and metadata, assets, component definitions, elements, animations, pages, ordered page instances/overrides, document settings, and data schemas.
- Changes travel in versioned atomic batches with stable transaction/operation identity and explicit origin.
- Property paths use RFC 6901 JSON Pointer; ordered collections use stable identity anchors rather than persistent array indices.
- Every operation is independently invertible from its payload, and update application verifies the expected old value rather than silently overwriting divergent state.
- Every external/remote batch is size-capped and schema-validated in full before mutation. Invalid batches return typed indexed diagnostics and apply nothing.
- A valid batch applies atomically with one transaction ID and explicit origin.
- Remote-origin transactions do not enter local undo; compensating user actions do.
- The editor core remains transport-neutral. W5 may ship a first-party mature CRDT/operation adapter, but hosts can provide another adapter satisfying the same convergence and origin contract.
- Network conflict resolution cannot repair missing local semantics; B-20/B-22 close before CRDT selection.

## Consequences

Local history, persistence, collaboration, and audit share mutation identity. Project assets/settings and page variants can no longer disappear between clients.

## Verification

Round-trip/inversion tests cover every variant and every persisted project field. Property-based randomized ordering, hostile-size batches, malformed paths/anchors, duplicate replay, partial-failure, remote-undo isolation, persistence replay, partition/reconnect, and eventual-convergence tests are required.
