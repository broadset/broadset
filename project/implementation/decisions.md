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

### Unit 9.0 — Tuple-Safe Animation Property Routing

**Decision:** Expand the animation property adapter contract to accept full `PropertyValue` payloads (including tuple values) and propagate tuple values end-to-end through `PropertyEditingProvider` and demo keyframe adapter logic.
**Alternatives considered:**

1. Keep number/string-only adapter values and coerce tuple properties to a scalar fallback (drops data and breaks per-corner radius edits).
2. Remove appearance controls from animation mode to avoid tuple handling (reduces user capability and diverges from property-level include/remove behavior goals).
   **Rationale:** Unit 9 requires keyframe editing to route true property values without mutating base styles. Supporting full value shapes prevents silent data loss, keeps include/remove behavior consistent across geometry, text, and appearance controls, and aligns with Broadset's discriminated `KeyframeValue` model.

### Unit 7.0 — Custom MaskType Canonicalization

**Decision:** Canonicalize custom mask preset selection to `maskType: 'custom'` while still interpreting legacy `'url'` values as custom in panel resolution.
**Alternatives considered:**

1. Keep emitting `'url'` for custom masks (diverges from UI spec and model schema semantics).
2. Hard-switch to `'custom'` and reject legacy `'url'` in panel resolution (could break older fixtures/tests still carrying `'url'`).
   **Rationale:** This keeps behavior spec-aligned for new edits while preserving resilience when loading prior data or tests that still contain legacy custom mask values.

### Unit 10.0 — SVG Path Panel Visibility Alignment

**Decision:** Force `Path Properties` visibility for SVG elements in `PropertiesSidebar` by extending the visibility condition to include `primary.type === 'svg'`.
**Alternatives considered:**

1. Keep visibility solely capability-profile driven (`profile.svgStrokeFill || profile.pathEditing`) and remove SVG defaults from the expanded-section map.
2. Leave SVG in the defaults map but tolerate the missing panel for some capability-profile configurations.
   **Rationale:** Unit 10's default-expanded behavior explicitly includes SVG under `path-stroke`. Showing the panel for SVG avoids a mismatch where defaults point to a non-rendered section, and preserves a consistent first-edit workflow for vector elements.

### IO-D-01 through IO-D-18 — IO Format Prerequisites

**Decision:** Ratify the 18 cross-format design decisions that gate PSD, PDF, PPTX, SVG, and PDF/A work. Full table lives in [io-prereqs-plan.md](./io-prereqs-plan.md) §Cross-format design decisions. The **IO-D-** prefix namespaces these from the unrelated `Unit N.0` series above; they are referenced by number throughout the four format-support plans and the PDF/A compliance plan.

Headline decisions (full rationale in the source table):

- **IO-D-01 Runs, not HTML** — text stored as `TextBody`/`Paragraph`/`Run`; HTML only at export boundaries.
- **IO-D-02 Bake-to-path for non-trivial affine** — no `scale`/`skew` on elements.
- **IO-D-03 Structured filter primitives** — CSS filter string becomes a discriminated union; string is a derived view.
- **IO-D-04 `fill` is a discriminated union** — solid / gradient / pattern / picture / none.
- **IO-D-05 `BroadsetColor` is a discriminated union; never silently downgrade** — RGB (with space + originalColor preservation) / theme (with mods). Preflight warns on unsupported target.
- **IO-D-06 `TextRun[]` type lands before run-edit UI** — importers have somewhere to put data; editor catches up in Phase 5.
- **IO-D-07 Cross-format logic under `_shared/`; format-only libraries direct** — no pointless wrappers; `_shared/*` is for logic serving ≥2 formats.
- **IO-D-08 Shared `broadset:` XMP namespace** — one Broadset footprint across every carrier.
- **IO-D-09 `@font-face` embedding default-on** — reference / flatten are opt-ins.
- **IO-D-10 Properties-panel exposure gates every round-trippable field.**
- **IO-D-11 `extensions.<format>` validated at load time** — central Zod registry; fail loudly on stale `.bsp`.
- **IO-D-12 Run-editor keyboard shortcuts deferred** — Ctrl-B etc. land later; range selection + panel suffices.
- **IO-D-13 Color mode is per-document.**
- **IO-D-14 Preflight warns and proceeds** — never blocks export.
- **IO-D-15 Gradient editor UI ships with the model additions** — per D-10.
- **IO-D-16 Export emits the fully-entered "IN" state; animations discarded unless native** — PPTX exempts the `<p:timing>`-mappable subset; PDF/PSD/SVG are static carriers.
- **IO-D-17 No sidecars** — round-trip metadata lives inside the format file using the format's own extension mechanism.
- **IO-D-18 No silent drops** — every importer maps to a native element or preserves under `extensions.<format>.raw` / opaque fragment with a warning.

**Alternatives considered** (per decision, in the source table).

**Rationale:** Each decision emerged from the cross-format audit in [io-prereqs-plan.md](./io-prereqs-plan.md). Keeping the full table there avoids duplication; this entry is the formal ratification marker and the namespace reservation for `IO-D-` prefixed references.
