# Wave W5 — Secure cloud, collaboration, and ecosystem

W5 adds optional team and cloud power without compromising local ownership, determinism, or authorization. Every capability in this wave layers onto the local-first product: offline use remains first class and cloud features are opt-in. The service platform (W5-SVC-01) is the shared foundation — storage, collaboration, render jobs, libraries, plugins, MCP, broadcast control, and observability all build on its identity and capability-authorization model.

**Wave gate:** Team/Cloud Qualified. Offline/local use remains first class; collaboration converges; authorization is deny-by-default; backups restore; every automated mutation is previewable, auditable, and reversible.

## W5-SVC-01 — Cloud service identity and authorization platform (XXL)

- **Dependencies:** W0-PLAT-01/RFC-11
- **Definition:** Implement the service ADR: identity and session management, tenant isolation, capability-based authorization, API versioning, secrets handling, and deployment environments for the optional cloud tier.
- **Acceptance criteria:**
  - [ ] Threat model documented and reviewed for every service surface
  - [ ] Authorization matrix covers every capability with deny-by-default semantics; meets QG-SEC-01
  - [ ] Tenant-isolation tests prove no cross-tenant read or write
  - [ ] Key rotation completes without session or data loss

## W5-STORE-01 — Encrypted cloud storage and sync (XL)

- **Dependencies:** W1-PERSIST-01/W5-SVC-01
- **Definition:** Encrypted document and asset storage with a sync protocol, quotas, user-initiated deletion and export, backup and restore, and retention policy.
- **Acceptance criteria:**
  - [ ] Backup restore drill completes on a clean environment
  - [ ] RPO and RTO budgets defined and measured during the restore drill
  - [ ] Corruption tests prove corrupted stored payloads are detected and never applied; meets QG-SEC-01
  - [ ] Partial-upload tests prove interrupted uploads leave no inconsistent state

## W5-COLLAB-01 — Collaboration convergence and presence (XXL)

- **Dependencies:** W0-COLLAB-01/W5-STORE-01
- **Definition:** Ratified CRDT or operation adapter covering offline edits, network partitions, presence, comments, local-only undo, and tombstone/garbage-collection policy.
- **Acceptance criteria:**
  - [ ] Randomized change-order convergence tests produce identical documents across concurrent editors
  - [ ] Conflict suites for rich text, ordering, hierarchy, and components converge without data loss
- **User-visible:** yes — collaborators see live presence and comments, and concurrent edits merge without losing local work.

## W5-REVIEW-01 — Branching review and audit workflow (XL)

- **Dependencies:** W5-COLLAB-01
- **Definition:** Version diff, named branches, review and approval flow, conflict presentation, audit trail, and a share-link viewer for stakeholders.
- **Acceptance criteria:**
  - [ ] Branch, update, merge, and restore E2E tests pass
  - [ ] Permission tests deny unauthorized branch, review, approval, and share-link access
- **User-visible:** yes — authors browse version diffs, request review and approval, and share read-only viewer links.

## W5-JOBS-01 — Idempotent render job service (XL)

- **Dependencies:** W3-PLAYER-01/W5-SVC-01
- **Definition:** Idempotent job queue and render service driven by the exact player offline clock, with cancellation, retry, quota enforcement, and artifact integrity verification.
- **Acceptance criteria:**
  - [ ] Duplicate-submission tests produce exactly one artifact
  - [ ] Retry and worker-loss tests complete jobs without corruption
  - [ ] ProRes and HAP reference outputs validate against expected frames; meets QG-REL-01

## W5-LIB-01 — Versioned team libraries (XL)

- **Dependencies:** W2-COMP-01/W5-REVIEW-01
- **Definition:** Team libraries for components, variables, and templates with semantic versioning, impact review, staged publish, and rollback.
- **Acceptance criteria:**
  - [ ] Cross-project library update tests pass
  - [ ] Conflict and rollback tests preserve consumer documents
  - [ ] Permission tests deny unauthorized publish and rollback
- **User-visible:** yes — teams publish, consume, and roll back shared component, variable, and template libraries.

## W5-PLUGIN-01 — Sandboxed plugin SDK (XL)

- **Dependencies:** W2-CMD-01/W5-SVC-01
- **Definition:** Typed plugin SDK running in a sandboxed worker or iframe with signed manifests, capability grants, resource quotas, UI slots, and validated change proposals.
- **Acceptance criteria:**
  - [ ] Sandbox escape tests fail to break isolation; meets QG-SEC-01
  - [ ] Flood and crash tests keep the host responsive
  - [ ] Capability revocation takes effect immediately
  - [ ] Plugins never mutate the store or DOM directly; every change flows through validated proposals

## W5-MCP-01 — Scoped MCP access modes (L)

- **Dependencies:** W5-PLUGIN-01/W5-SVC-01
- **Definition:** Local stdio MCP server by default; optional network mode restricted to short-lived scoped capabilities with strict read, propose, and apply separation.
- **Acceptance criteria:**
  - [ ] Every apply operation requires explicit user approval
  - [ ] Audit log records every operation; replay protection rejects reused tokens
  - [ ] Red-team tests find no capability escalation; meets QG-SEC-01

## W5-BCAST-01 — Broadcast automation control API (XL)

- **Dependencies:** W4-PLAYOUT-01/W5-SVC-01
- **Definition:** Authenticated automation and control API aligned with the OGraf Server API, a CasparCG AMCP adapter, and an ADR settling MOS/NRCS integration scope.
- **Acceptance criteria:**
  - [ ] Permissioned clean-room integration validates the control API end to end; meets QG-BCAST-01
  - [ ] Replay protection and audit logging cover every control operation; meets QG-SEC-01
  - [ ] Reconnect and idempotency tests prove no duplicated or lost commands

## W5-OBS-01 — Observability and consented telemetry (L)

- **Dependencies:** W5-SVC-01
- **Definition:** Service logs, metrics, traces, and alerts; consented product telemetry; a locally generated redacted diagnostic bundle; and incident response with runbook ownership.
- **Acceptance criteria:**
  - [ ] SLO dashboards live for every service
  - [ ] Alert drills fire and route to the owning runbook
  - [ ] Privacy schema enforcement rejects unconsented or unredacted telemetry fields
