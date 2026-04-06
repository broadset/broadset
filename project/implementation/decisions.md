# Implementation Decision Log

Non-trivial judgment calls made during implementation. See each unit for context.

---

### Unit 1.3 / 1.10 — Reject Broadset-owned legacy model shapes

**Decision:** Remove support for old Broadset-owned fields like `screen`, `animationRegistry`, and timeline `entries`, and validate only the current documented model shape.
**Alternatives considered:** Continue normalizing old serialized shapes at load time.
**Rationale:** Broadset is a greenfield project, so the cleanest current contract is more valuable than compatibility shims for our own data.

### Unit 1.2 / 1.3 — Fail loudly on impossible model styling input

**Decision:** Reject impossible alpha/color ranges at the model boundary and sanitize inline rich-text styles through a safe allowlist instead of preserving raw `style="..."` strings.
**Alternatives considered:** Continue clamping invalid RGBA/HSLA values and keep verbatim inline styles after tag stripping.
**Rationale:** Silent clamping and raw inline-style preservation hide bad data and leave brittle edge cases behind; explicit rejection plus safe-style filtering keeps the model contract predictable and safer.
