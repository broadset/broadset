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

### Unit 3.4 — Drive the demo from real document animations

**Decision:** Wire `createPlaybackController` directly to the existing renderer host and extend the sample document with three real animation cases: a looping transform/opacity pulse, a counting score text animation, and an `IN`/`OUT` state-bound promo panel.
**Alternatives considered:** Fake the preview with CSS-only animation or add a heavier timeline UI before the playback slice was proven.
**Rationale:** Using the real playback engine in the demo proves the Phase 3 contract end to end with minimal UI, while the mixed sample animations cover the spec’s transform, counting, and state-binding requirements in one visible slice.

### Unit 4-A — Keep editor interaction state explicit and synchronized

**Decision:** Track `pendingPlacementType`, `pathEditingElementId`, and `pathDrawingElementId` explicitly in the editor store while deriving the public `editingMode` snapshot from those fields through a shared helper.
**Alternatives considered:** Store only a single `editingMode` union, or only the raw per-mode IDs with no unified view.
**Rationale:** The Phase 4 specs assert the explicit IDs directly, while the editor API and future UI integrations benefit from a single mode union. Keeping the raw fields authoritative and deriving the union avoids desynchronization while satisfying both contracts.
