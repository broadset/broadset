# Implementation Decision Log

Non-trivial judgment calls made during implementation. See each unit for context.

---

### Unit 1.3 / 1.10 — Reject Broadset-owned legacy model shapes

**Decision:** Remove support for old Broadset-owned fields like `screen`, `animationRegistry`, and timeline `entries`, and validate only the current documented model shape.
**Alternatives considered:** Continue normalizing old serialized shapes at load time.
**Rationale:** Broadset is a greenfield project, so the cleanest current contract is more valuable than compatibility shims for our own data.
