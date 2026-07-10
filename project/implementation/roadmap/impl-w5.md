# Wave W5 implementation plan

Status: draft — re-sliced at the W4 phase exit

## W5-SVC-01 tasks

### T1 — Identity, session, and tenant core

- Files: `services/platform/src/identity/session.ts` (new), `services/platform/src/identity/tenant.ts` (new), `services/platform/src/identity/session.test.ts` (new), `services/platform/src/identity/tenant-isolation.test.ts` (new)
- Interfaces: `AuthSession`, `TenantContext`, `IdentityProvider` (produced by the service ADR from W0-PLAT-01/RFC-11)
- RED: tenant-isolation test proving a session scoped to tenant A cannot read or write tenant B resources → GREEN: implement session issuance/verification with tenant-scoped resource resolution
- Commit: `feat(services): add identity session and tenant core`

### T2 — Capability authorization with deny-by-default

- Files: `services/platform/src/authz/capability.ts` (new), `services/platform/src/authz/matrix.ts` (new), `services/platform/src/authz/matrix.test.ts` (new)
- Interfaces: `CapabilityGrant`, `AuthorizationDecision`, `requireCapability` middleware
- RED: matrix test enumerating every declared capability and asserting deny without an explicit grant (QG-SEC-01) → GREEN: implement grant schema, deny-by-default middleware, and decision audit records
- Commit: `feat(services): add deny-by-default capability authorization`

### T3 — API versioning, secrets, rotation, and environments

- Files: `services/platform/src/api/versioning.ts` (new), `services/platform/src/secrets/rotation.ts` (new), `services/platform/src/secrets/rotation.test.ts` (new), `services/platform/deploy/environments.md` (new)
- Interfaces: `ApiVersionPolicy`, `SecretRotationPlan`
- RED: key-rotation test asserting active sessions and stored data survive a full rotation → GREEN: implement versioned API contracts, envelope-encrypted secrets handling, rotation runbook, and dev/stage/prod environment definitions
- Commit: `feat(services): add api versioning secrets and rotation`

| Slice         | Scope                                                        | Proof                                          | Rollback / evidence                              | Merge prerequisite |
| ------------- | ------------------------------------------------------------ | ---------------------------------------------- | ------------------------------------------------ | ------------------ |
| W5-SVC-01.S1  | Threat model + service ADR conformance note                  | docs:check; maintainer review                  | docs-only revert; threat-model doc               | none               |
| W5-SVC-01.S2  | Service scaffold: HTTP host, config, env bootstrap           | unit tests; service boots in dev env           | revert scaffold; boot log evidence               | W5-SVC-01.S1       |
| W5-SVC-01.S3  | Identity and session issuance (token mint/verify)            | session unit tests                             | revert; token-lifecycle test output              | W5-SVC-01.S2       |
| W5-SVC-01.S4  | Tenant model + isolation enforcement                         | tenant-isolation tests (no cross-tenant R/W)   | revert; isolation suite report                   | W5-SVC-01.S3       |
| W5-SVC-01.S5  | Capability grant schema + deny-by-default middleware         | authz unit tests                               | revert; deny-by-default test output              | W5-SVC-01.S4       |
| W5-SVC-01.S6  | Authorization matrix covering every capability               | matrix enumeration test; QG-SEC-01             | revert; matrix coverage report                   | W5-SVC-01.S5       |
| W5-SVC-01.S7  | API versioning policy + contract tests                       | contract tests across two versions             | revert; contract test output                     | W5-SVC-01.S6       |
| W5-SVC-01.S8  | Secrets handling with envelope encryption                    | secrets unit tests; no plaintext at rest       | revert; secrets scan output                      | W5-SVC-01.S7       |
| W5-SVC-01.S9  | Key rotation without session or data loss                    | rotation drill test                            | revert; rotation drill log                       | W5-SVC-01.S8       |
| W5-SVC-01.S10 | Deployment environments (dev/stage/prod) definitions         | env provisioning dry-run                       | revert config; provisioning log                  | W5-SVC-01.S9       |
| W5-SVC-01.S11 | Audit logging of authz decisions                             | audit-log unit tests                           | revert; sample audit trail                       | W5-SVC-01.S10      |
| W5-SVC-01.S12 | Rate limiting + hostile-input caps on every endpoint         | abuse tests; QG-SEC-01                         | revert; abuse suite report                       | W5-SVC-01.S11      |
| W5-SVC-01.S13 | Security review + threat-model re-validation evidence bundle | review sign-off; full service test suite green | evidence bundle in tracker; no code to roll back | W5-SVC-01.S12      |

## W5-STORE-01 tasks

### T1 — Encrypted store with integrity verification

- Files: `services/storage/src/blob-store.ts` (new), `services/storage/src/encryption-envelope.ts` (new), `services/storage/src/integrity.test.ts` (new)
- Interfaces: `EncryptedBlobStore`, `IntegrityManifest`
- RED: corruption test proving a tampered stored payload is detected and never applied (QG-SEC-01) → GREEN: implement content-addressed encrypted chunks with integrity hashes verified on read
- Commit: `feat(services): add encrypted blob store with integrity checks`

### T2 — Sync protocol with partial-upload safety and quotas

- Files: `services/storage/src/sync-protocol.ts` (new), `services/storage/src/upload-session.ts` (new), `services/storage/src/partial-upload.test.ts` (new), `packages/editor/src/persistence/cloud-sync-adapter.ts` (new)
- Interfaces: `SyncSession`, `UploadResumeToken`, `QuotaPolicy` (client adapter layered on W1-PERSIST-01 persistence)
- RED: interrupted-upload test proving an aborted upload leaves no inconsistent visible state → GREEN: implement resumable upload sessions, commit-or-discard semantics, and per-tenant quota enforcement
- Commit: `feat(services): add resumable sync protocol with quotas`

### T3 — Backup, restore, deletion, export, and retention

- Files: `services/storage/src/backup.ts` (new), `services/storage/src/retention.ts` (new), `services/storage/scripts/restore-drill.mjs` (new), `services/storage/src/backup.test.ts` (new)
- Interfaces: `BackupManifest`, `RetentionPolicy`, user-initiated `deleteAll`/`exportAll`
- RED: restore-drill script failing on a clean environment → GREEN: implement backup pipeline, restore automation measuring RPO/RTO against defined budgets, deletion/export flows, and retention policy
- Commit: `feat(services): add backup restore and retention`

| Slice          | Scope                                                 | Proof                              | Rollback / evidence                | Merge prerequisite |
| -------------- | ----------------------------------------------------- | ---------------------------------- | ---------------------------------- | ------------------ |
| W5-STORE-01.S1 | Storage schema + encryption envelope design note      | docs:check; maintainer review      | docs-only revert; design note      | none               |
| W5-STORE-01.S2 | Encrypted blob store write/read with integrity hashes | corruption tests; QG-SEC-01        | revert; corruption suite report    | W5-STORE-01.S1     |
| W5-STORE-01.S3 | Resumable upload sessions (partial-upload safety)     | interrupted-upload tests           | revert; partial-upload test output | W5-STORE-01.S2     |
| W5-STORE-01.S4 | Sync protocol + client adapter on W1-PERSIST-01 layer | round-trip sync tests              | revert adapter; sync test output   | W5-STORE-01.S3     |
| W5-STORE-01.S5 | Quotas + user-initiated deletion and export           | quota and deletion/export tests    | revert; quota test output          | W5-STORE-01.S4     |
| W5-STORE-01.S6 | Backup pipeline + retention policy                    | backup unit tests                  | revert; backup manifest evidence   | W5-STORE-01.S5     |
| W5-STORE-01.S7 | Restore drill automation + RPO/RTO measurement        | restore drill on clean environment | drill log with measured RPO/RTO    | W5-STORE-01.S6     |

## W5-COLLAB-01 tasks

### T1 — Ratified convergence adapter and change encoding

- Files: `packages/collab/src/adapter.ts` (new), `packages/collab/src/change-encoding.ts` (new), `packages/collab/src/convergence.property.test.ts` (new)
- Interfaces: `CollabAdapter`, `EncodedChange`, `mergeRemoteChanges` (implements the W0-COLLAB-01 ratified CRDT/operation decision)
- RED: randomized change-order property test asserting identical documents across concurrent editors → GREEN: implement the ratified adapter over the document model with deterministic merge
- Commit: `feat(collab): add ratified convergence adapter`

### T2 — Conflict semantics for rich text, ordering, hierarchy, components

- Files: `packages/collab/src/conflicts/rich-text.ts` (new), `packages/collab/src/conflicts/ordering.ts` (new), `packages/collab/src/conflicts/hierarchy.ts` (new), `packages/collab/src/conflicts/components.test.ts` (new)
- Interfaces: per-domain conflict resolvers consumed by `CollabAdapter`
- RED: conflict suites for rich text, z-ordering, group hierarchy, and component overrides asserting convergence without data loss → GREEN: implement domain resolvers and tombstone/GC policy with compaction
- Commit: `feat(collab): add domain conflict resolution and gc policy`

### T3 — Presence, comments, offline queue, and local-only undo

- Files: `packages/collab/src/presence.ts` (new), `packages/collab/src/comments.ts` (new), `packages/editor/src/collab/undo-isolation.ts` (new), `packages/ui/src/panels/presence-overlay.tsx` (new), `packages/ui/ct/collab-presence.ct.tsx` (new)
- Interfaces: `PresenceChannel`, `CommentThread`, undo-isolation hook for the editor store
- RED: CT proving remote edits appear on canvas without entering the local undo stack, and presence/comments render in their UI regions → GREEN: implement presence channel, comment threads, offline edit queue with partition rejoin, and local-only undo isolation
- Commit: `feat(collab): add presence comments and local undo isolation`

| Slice            | Scope                                                    | Proof                                  | Rollback / evidence              | Merge prerequisite |
| ---------------- | -------------------------------------------------------- | -------------------------------------- | -------------------------------- | ------------------ |
| W5-COLLAB-01.S1  | Adapter ratification note + change-encoding spec         | docs:check; maintainer review          | docs-only revert; encoding spec  | none               |
| W5-COLLAB-01.S2  | Core adapter for element map + document tree             | adapter unit tests                     | revert; adapter test output      | W5-COLLAB-01.S1    |
| W5-COLLAB-01.S3  | Randomized convergence harness (fuzzed change orders)    | property tests converge across editors | revert harness; fuzz seed corpus | W5-COLLAB-01.S2    |
| W5-COLLAB-01.S4  | Rich-text conflict semantics                             | rich-text conflict suite, no data loss | revert; suite report             | W5-COLLAB-01.S3    |
| W5-COLLAB-01.S5  | Ordering (z-order/array) conflict semantics              | ordering conflict suite                | revert; suite report             | W5-COLLAB-01.S4    |
| W5-COLLAB-01.S6  | Hierarchy (group/parenting) conflict semantics           | hierarchy conflict suite               | revert; suite report             | W5-COLLAB-01.S5    |
| W5-COLLAB-01.S7  | Component/override conflict semantics                    | component conflict suite               | revert; suite report             | W5-COLLAB-01.S6    |
| W5-COLLAB-01.S8  | Offline edit queue + network-partition rejoin            | partition replay tests                 | revert; partition test output    | W5-COLLAB-01.S7    |
| W5-COLLAB-01.S9  | Presence channel (cursors, selections)                   | presence unit tests                    | revert; presence test output     | W5-COLLAB-01.S8    |
| W5-COLLAB-01.S10 | Comments model + threads                                 | comments unit tests                    | revert; comments test output     | W5-COLLAB-01.S9    |
| W5-COLLAB-01.S11 | Local-only undo isolation in editor store                | undo-isolation unit tests              | revert; isolation test output    | W5-COLLAB-01.S10   |
| W5-COLLAB-01.S12 | Tombstone/GC policy + compaction                         | GC tests preserve convergence          | revert; GC test output           | W5-COLLAB-01.S11   |
| W5-COLLAB-01.S13 | Demo integration + cross-region CT for presence/comments | ct:all green; presence CT evidence     | revert UI wiring; CT report      | W5-COLLAB-01.S12   |

## W5-REVIEW-01 tasks

### T1 — Version graph, named branches, and diff

- Files: `services/review/src/version-graph.ts` (new), `services/review/src/branch.ts` (new), `packages/collab/src/diff/document-diff.ts` (new), `services/review/src/branch-merge.e2e.test.ts` (new)
- Interfaces: `VersionGraph`, `NamedBranch`, `DocumentDiff`
- RED: branch → update → merge → restore E2E test → GREEN: implement version graph over W5-COLLAB-01 history, named branches, and structural/visual diff computation
- Commit: `feat(review): add version graph branches and diff`

### T2 — Review, approval, and conflict presentation

- Files: `services/review/src/approval-flow.ts` (new), `packages/ui/src/modals/review-request.tsx` (new), `packages/ui/src/panels/conflict-presentation.tsx` (new), `packages/ui/ct/review-approval-flow.ct.tsx` (new)
- Interfaces: `ReviewRequest`, `ApprovalDecision`, conflict presentation panel
- RED: CT driving request-review → approve → merge across modal and panel regions → GREEN: implement approval state machine and HeroUI review/conflict surfaces
- Commit: `feat(review): add approval flow and conflict presentation`

### T3 — Audit trail and share-link viewer

- Files: `services/review/src/audit-trail.ts` (new), `services/review/src/share-link.ts` (new), `services/review/src/permissions.test.ts` (new)
- Interfaces: `AuditEntry`, `ShareLinkToken` (read-only viewer scope)
- RED: permission tests denying unauthorized branch, review, approval, and share-link access → GREEN: implement append-only audit trail and scoped read-only share-link viewer on W5-SVC-01 capabilities
- Commit: `feat(review): add audit trail and share-link viewer`

| Slice           | Scope                                     | Proof                           | Rollback / evidence             | Merge prerequisite |
| --------------- | ----------------------------------------- | ------------------------------- | ------------------------------- | ------------------ |
| W5-REVIEW-01.S1 | Version graph + named branch model        | version-graph unit tests        | revert; graph test output       | none               |
| W5-REVIEW-01.S2 | Document diff (structural + visual)       | diff unit tests                 | revert; diff test output        | W5-REVIEW-01.S1    |
| W5-REVIEW-01.S3 | Merge + restore over collab history       | branch/update/merge/restore E2E | revert; E2E report              | W5-REVIEW-01.S2    |
| W5-REVIEW-01.S4 | Review/approval workflow states           | approval state-machine tests    | revert; approval test output    | W5-REVIEW-01.S3    |
| W5-REVIEW-01.S5 | Conflict presentation UI + review modal   | review-approval CT              | revert UI; CT report            | W5-REVIEW-01.S4    |
| W5-REVIEW-01.S6 | Append-only audit trail                   | audit unit tests                | revert; audit trail sample      | W5-REVIEW-01.S5    |
| W5-REVIEW-01.S7 | Share-link viewer + full permission suite | permission denial tests         | revert; permission suite report | W5-REVIEW-01.S6    |

## W5-JOBS-01 tasks

### T1 — Idempotent job queue with retry, cancellation, quotas

- Files: `services/jobs/src/queue.ts` (new), `services/jobs/src/idempotency.ts` (new), `services/jobs/src/duplicate-submission.test.ts` (new)
- Interfaces: `RenderJob`, `IdempotencyKey`, `JobQueue`
- RED: duplicate-submission test asserting exactly one artifact for repeated submissions → GREEN: implement dedupe-keyed queue with cancellation, retry with backoff, and per-tenant quota enforcement on W5-SVC-01 capabilities
- Commit: `feat(services): add idempotent render job queue`

### T2 — Render worker on the exact player offline clock

- Files: `services/jobs/src/render-worker.ts` (new), `services/jobs/src/artifact-integrity.ts` (new), `services/jobs/src/worker-loss.test.ts` (new), `services/jobs/src/reference-output.test.ts` (new)
- Interfaces: `RenderWorker`, `ArtifactManifest` (drives the W3-PLAYER-01 offline clock; no wall-clock dependence)
- RED: worker-loss test proving jobs complete without corruption after a mid-render crash; ProRes/HAP reference outputs validated frame-by-frame against expected hashes (QG-REL-01) → GREEN: implement deterministic worker, artifact integrity verification, and storage handoff
- Commit: `feat(services): add deterministic render worker`

| Slice         | Scope                                               | Proof                                     | Rollback / evidence           | Merge prerequisite |
| ------------- | --------------------------------------------------- | ----------------------------------------- | ----------------------------- | ------------------ |
| W5-JOBS-01.S1 | Job schema + idempotency key design                 | schema unit tests                         | revert; schema test output    | none               |
| W5-JOBS-01.S2 | Queue with dedupe (exactly-one-artifact)            | duplicate-submission tests                | revert; dedupe test output    | W5-JOBS-01.S1      |
| W5-JOBS-01.S3 | Cancellation + retry with backoff                   | cancellation/retry tests                  | revert; retry test output     | W5-JOBS-01.S2      |
| W5-JOBS-01.S4 | Per-tenant quota enforcement                        | quota tests                               | revert; quota test output     | W5-JOBS-01.S3      |
| W5-JOBS-01.S5 | Render worker on player offline clock               | deterministic frame-hash tests; QG-REL-01 | revert; frame-hash report     | W5-JOBS-01.S4      |
| W5-JOBS-01.S6 | Artifact integrity verification + storage handoff   | integrity tests                           | revert; integrity test output | W5-JOBS-01.S5      |
| W5-JOBS-01.S7 | ProRes/HAP reference validation + worker-loss chaos | reference-output + chaos test evidence    | revert; chaos suite report    | W5-JOBS-01.S6      |

## W5-LIB-01 tasks

### T1 — Library model, semver publish, and consumption

- Files: `services/library/src/package-model.ts` (new), `services/library/src/publish.ts` (new), `services/library/src/cross-project-update.test.ts` (new)
- Interfaces: `LibraryPackage`, `LibraryVersion` (semver), `PublishRequest` (covers W2-COMP-01 components, variables, templates)
- RED: cross-project library update test asserting a consuming document picks up a published version → GREEN: implement versioned library packages with staged publish and consumer resolution
- Commit: `feat(library): add versioned team library model and publish`

### T2 — Impact review, rollback, and permissions

- Files: `services/library/src/impact-review.ts` (new), `services/library/src/rollback.ts` (new), `services/library/src/permissions.test.ts` (new)
- Interfaces: `ImpactReport`, `RollbackPlan`
- RED: conflict and rollback tests proving consumer documents are preserved; permission tests denying unauthorized publish and rollback → GREEN: implement impact computation across consuming projects, rollback that never corrupts consumers, and capability-gated publish/rollback
- Commit: `feat(library): add impact review and safe rollback`

### T3 — Library UI surfaces

- Files: `packages/ui/src/panels/library-browser.tsx` (new), `packages/ui/src/modals/library-update-review.tsx` (new), `packages/ui/ct/library-update-flow.ct.tsx` (new)
- Interfaces: library browser panel and update-review modal (HeroUI)
- RED: CT driving publish → consumer update-review → accept across panel, modal, and canvas regions → GREEN: implement HeroUI library browser and update-review modal bound to the editor store
- Commit: `feat(ui): add team library browser and update review`

| Slice        | Scope                                         | Proof                        | Rollback / evidence             | Merge prerequisite |
| ------------ | --------------------------------------------- | ---------------------------- | ------------------------------- | ------------------ |
| W5-LIB-01.S1 | Library package model + semver rules          | model unit tests             | revert; model test output       | none               |
| W5-LIB-01.S2 | Staged publish pipeline                       | publish unit tests           | revert; publish test output     | W5-LIB-01.S1       |
| W5-LIB-01.S3 | Consumer resolution + cross-project update    | cross-project update tests   | revert; update test output      | W5-LIB-01.S2       |
| W5-LIB-01.S4 | Impact review across consuming documents      | impact-report tests          | revert; impact report sample    | W5-LIB-01.S3       |
| W5-LIB-01.S5 | Rollback preserving consumer documents        | conflict + rollback tests    | revert; rollback test output    | W5-LIB-01.S4       |
| W5-LIB-01.S6 | Capability-gated publish/rollback permissions | permission denial tests      | revert; permission suite report | W5-LIB-01.S5       |
| W5-LIB-01.S7 | Library browser + update-review UI and CT     | ct:all green; update-flow CT | revert UI; CT report            | W5-LIB-01.S6       |

## W5-PLUGIN-01 tasks

### T1 — Sandboxed runtime with signed manifests and capability grants

- Files: `packages/plugin-host/src/sandbox.ts` (new), `packages/plugin-host/src/manifest-signature.ts` (new), `packages/plugin-host/src/escape.test.ts` (new)
- Interfaces: `PluginManifest`, `PluginSandbox`, `CapabilityGrantSet` (aligned with W5-SVC-01 capability model)
- RED: sandbox escape tests attempting DOM, store, network, and parent-scope access from plugin code, all failing (QG-SEC-01) → GREEN: implement worker/iframe sandbox host, signature verification, and grant/revoke lifecycle with immediate revocation
- Commit: `feat(plugin): add sandboxed host with signed manifests`

### T2 — Typed SDK with validated change proposals

- Files: `packages/plugin-sdk/src/index.ts` (new), `packages/plugin-host/src/change-proposal.ts` (new), `packages/plugin-host/src/proposal-validation.test.ts` (new)
- Interfaces: `PluginApi`, `ChangeProposal` (routed through the W2-CMD-01 command pipeline; plugins never mutate store or DOM directly)
- RED: test proving a plugin attempting direct store/DOM mutation is rejected while an equivalent validated proposal applies → GREEN: implement typed SDK surface, Zod-validated proposals, and command-pipeline application
- Commit: `feat(plugin): add typed sdk with validated proposals`

### T3 — UI slots, quotas, and abuse containment

- Files: `packages/ui/src/panels/plugin-slot.tsx` (new), `packages/plugin-host/src/quotas.ts` (new), `packages/plugin-host/src/flood-crash.test.ts` (new)
- Interfaces: `PluginUiSlot`, `ResourceQuota`
- RED: flood and crash tests proving the host stays responsive and a crashing plugin is contained → GREEN: implement HeroUI-hosted plugin UI slots, CPU/memory/message quotas, and crash isolation with restart policy
- Commit: `feat(plugin): add ui slots quotas and crash containment`

| Slice           | Scope                                               | Proof                                    | Rollback / evidence             | Merge prerequisite |
| --------------- | --------------------------------------------------- | ---------------------------------------- | ------------------------------- | ------------------ |
| W5-PLUGIN-01.S1 | Plugin manifest schema + signature verification     | manifest/signature unit tests            | revert; signature test output   | none               |
| W5-PLUGIN-01.S2 | Sandboxed worker/iframe host + message bridge       | bridge unit tests                        | revert; bridge test output      | W5-PLUGIN-01.S1    |
| W5-PLUGIN-01.S3 | Capability grant/revoke with immediate revocation   | revocation tests take effect immediately | revert; revocation test output  | W5-PLUGIN-01.S2    |
| W5-PLUGIN-01.S4 | Typed SDK + validated change proposals via commands | proposal validation tests                | revert; proposal test output    | W5-PLUGIN-01.S3    |
| W5-PLUGIN-01.S5 | Plugin UI slots in HeroUI chrome                    | UI slot CT                               | revert UI; CT report            | W5-PLUGIN-01.S4    |
| W5-PLUGIN-01.S6 | Resource quotas + flood/crash containment           | flood/crash tests keep host responsive   | revert; containment test output | W5-PLUGIN-01.S5    |
| W5-PLUGIN-01.S7 | Escape/abuse red-team suite + evidence bundle       | escape suite green; QG-SEC-01            | evidence bundle; suite report   | W5-PLUGIN-01.S6    |

## W5-MCP-01 tasks

### T1 — Local stdio MCP server with read/propose/apply separation

- Files: `packages/mcp-server/src/stdio-server.ts` (new), `packages/mcp-server/src/modes.ts` (new), `packages/mcp-server/src/apply-approval.test.ts` (new)
- Interfaces: `McpAccessMode` (`read` | `propose` | `apply`), tool surface mapped to W5-PLUGIN-01 change proposals
- RED: test proving every apply operation without explicit user approval is rejected while read and propose succeed → GREEN: implement stdio MCP server with strict mode separation and approval gating on apply
- Commit: `feat(mcp): add local stdio server with scoped modes`

### T2 — Network mode with scoped short-lived capabilities and replay protection

- Files: `packages/mcp-server/src/network-mode.ts` (new), `packages/mcp-server/src/audit-log.ts` (new), `packages/mcp-server/src/replay-protection.test.ts` (new)
- Interfaces: `ScopedCapabilityToken` (short-lived, minted by W5-SVC-01), append-only operation audit log
- RED: replay test proving a reused token is rejected; red-team tests finding no capability escalation (QG-SEC-01) → GREEN: implement opt-in network mode with token expiry, nonce-based replay protection, and full operation audit logging
- Commit: `feat(mcp): add scoped network mode with replay protection`

## W5-BCAST-01 tasks

### T1 — Authenticated control API aligned with the OGraf Server API

- Files: `services/broadcast/src/control-api.ts` (new), `services/broadcast/src/ograf-alignment.ts` (new), `services/broadcast/src/control-api.contract.test.ts` (new)
- Interfaces: `ControlCommand`, `PlayoutTarget` (dispatches to the W4-PLAYOUT-01 runtime; authenticated via W5-SVC-01 capabilities)
- RED: contract conformance suite against the OGraf Server API surface (QG-BCAST-01) → GREEN: implement authenticated control endpoints and playout command dispatch
- Commit: `feat(broadcast): add authenticated ograf-aligned control api`

### T2 — CasparCG AMCP adapter with reconnect and idempotency

- Files: `services/broadcast/src/amcp-adapter.ts` (new), `services/broadcast/src/reconnect.test.ts` (new)
- Interfaces: `AmcpAdapter` translating AMCP commands to control operations
- RED: reconnect and idempotency tests proving no duplicated or lost commands across connection drops → GREEN: implement AMCP adapter with sequence-tracked idempotent command handling
- Commit: `feat(broadcast): add caspar amcp adapter with idempotent reconnect`

### T3 — Replay protection, audit logging, and MOS/NRCS scope ADR

- Files: `services/broadcast/src/replay-protection.ts` (new), `services/broadcast/src/audit-log.ts` (new), `project/implementation/plans/W5-BCAST-01-mos-adr.md` (new)
- Interfaces: control-operation audit records; ADR settling MOS/NRCS integration scope
- RED: replay tests rejecting reused control tokens and audit tests covering every control operation (QG-SEC-01) → GREEN: implement replay protection and audit logging; ratify the MOS/NRCS ADR; run the permissioned clean-room integration validation
- Commit: `feat(broadcast): add replay protection audit log and mos adr`

| Slice          | Scope                                             | Proof                                     | Rollback / evidence              | Merge prerequisite |
| -------------- | ------------------------------------------------- | ----------------------------------------- | -------------------------------- | ------------------ |
| W5-BCAST-01.S1 | Control API surface spec + OGraf alignment note   | docs:check; maintainer review             | docs-only revert; alignment note | none               |
| W5-BCAST-01.S2 | Authenticated control endpoints on W5-SVC-01      | authz + endpoint unit tests               | revert; endpoint test output     | W5-BCAST-01.S1     |
| W5-BCAST-01.S3 | Playout command dispatch to W4-PLAYOUT-01 runtime | dispatch integration tests                | revert; dispatch test output     | W5-BCAST-01.S2     |
| W5-BCAST-01.S4 | CasparCG AMCP adapter                             | AMCP translation tests                    | revert; adapter test output      | W5-BCAST-01.S3     |
| W5-BCAST-01.S5 | Reconnect + idempotent command handling           | reconnect tests, no dup/lost commands     | revert; reconnect test output    | W5-BCAST-01.S4     |
| W5-BCAST-01.S6 | Replay protection + audit logging of operations   | replay/audit tests; QG-SEC-01             | revert; audit trail sample       | W5-BCAST-01.S5     |
| W5-BCAST-01.S7 | Clean-room integration validation + MOS/NRCS ADR  | permissioned integration run; QG-BCAST-01 | evidence bundle; ratified ADR    | W5-BCAST-01.S6     |

## W5-OBS-01 tasks

### T1 — Service observability with SLOs and alert routing

- Files: `services/observability/src/metrics.ts` (new), `services/observability/src/slo-dashboards.ts` (new), `services/observability/src/alert-routing.test.ts` (new), `services/observability/runbooks/README.md` (new)
- Interfaces: `SloDefinition`, `AlertRoute` (every alert routes to an owning runbook)
- RED: alert drill test proving a synthetic SLO breach fires and routes to the owning runbook → GREEN: implement logs/metrics/traces instrumentation across W5 services, SLO dashboards, and alert routing with incident-response ownership
- Commit: `feat(observability): add slo dashboards and alert routing`

### T2 — Consented telemetry and redacted diagnostic bundle

- Files: `services/observability/src/telemetry-schema.ts` (new), `packages/editor/src/diagnostics/diagnostic-bundle.ts` (new), `services/observability/src/privacy-enforcement.test.ts` (new)
- Interfaces: `TelemetryEventSchema` (Zod, consent-gated), `DiagnosticBundle` (locally generated, redacted)
- RED: privacy enforcement test rejecting unconsented or unredacted telemetry fields → GREEN: implement consent-gated telemetry with schema enforcement and a locally generated redacted diagnostic bundle
- Commit: `feat(observability): add consented telemetry and diagnostic bundle`
