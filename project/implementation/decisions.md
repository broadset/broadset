# Implementation Decision Log

Non-trivial judgment calls made during implementation. See each unit for context.

---

### Unit 1.3 / 1.10 — Normalize legacy model shapes at the schema boundary

**Decision:** Accept legacy serialized fields like `screen`, `animationRegistry`, and timeline `entries` at parse time, but normalize them into the current model output (`name`/`locked` on the element, masking and 3D fields on `style`, `animations`, and timeline `keyframes`).
**Alternatives considered:** Reject legacy shapes outright, or keep the legacy fields in the public output types.
**Rationale:** This preserves compatibility for older documents and fixtures while keeping the exported Phase 1 model aligned with the current Broadset spec.
