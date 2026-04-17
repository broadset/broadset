### Unit 1.0 — Gradient Editor As Shared Primitive

**Decision:** Implement `GradientEditor` as a reusable input primitive in `packages/ui/src/inputs/` instead of embedding gradient editing logic directly inside an appearance panel component.
**Alternatives considered:**

1. Keep gradient controls panel-local in `property-panels/layout-panels.tsx` (faster short-term, but duplicates behavior and tests later).
2. Keep raw gradient text input and defer visual editing to a later unit (violates the plan's art-director UX constraints).
   **Rationale:** Unit 1 is the primitives foundation for later panel units. A dedicated primitive centralizes drag-stop logic, angle control, and minimum-stop constraints, and lets later panel work compose behavior instead of re-implementing it.

### Unit 2.0 — Lock Guard Uses Layered Disable Semantics

**Decision:** Apply locked-state protection with a layered guard (`aria-disabled` + `inert` + `pointer-events: none` + `<fieldset disabled>`), and use the same wrapper for both default panel routing and custom panels.
**Alternatives considered:**

1. Disable each field ad hoc in individual panel components (high maintenance and easy to miss fields).
2. Use only `pointer-events: none` (blocks mouse but leaves keyboard/focus and assistive semantics inconsistent).
3. Use only `<fieldset disabled>` (covers form controls but not all interactive wrappers and custom non-form controls).
   **Rationale:** Unit 2 requires panel-level lock behavior that is obvious, accessibility-friendly, and consistent across all panel composition paths. A single wrapper with layered semantics is resilient to component mix differences and prevents regressions when new controls are added.
