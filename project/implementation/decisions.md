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

### Phase 1 Unit #13 — Extensions Registry Validates In-Element

**Decision:** Wire `validateExtensions` into the existing element/document Zod `superRefine` rather than ship the registry as a standalone helper. Extracted to `refineExtensionsAgainstRegistry(raw, ctx)` so the call site stays one line and the surrounding cognitive complexity score stays under the project lint threshold.
**Alternatives considered:**

1. Keep `validateExtensions` as a standalone helper that callers invoke after `parse` (rejected — leaves IO-D-11 enforcement to discipline; importers and tests would skip it).
2. Inline the try/catch directly into element.ts and document.ts (rejected — pushed cognitive complexity over the lint threshold and duplicated five lines of error fan-out across two files).
   **Rationale:** IO-D-11 mandates "validated at load time". The only way to make that mechanical is to wire it into the existing `parse` call sites the rest of the codebase already uses. Extracting to a helper preserves single-responsibility on element.ts/document.ts while keeping the contract enforceable.

### Phase 1 Unit #13 — Forward-Compat For Unregistered Format Namespaces

**Decision:** When `extensions.<formatId>` is present but no schema is registered for that format id, accept the namespace without validation rather than reject the load.
**Alternatives considered:**

1. Reject any namespace whose schema is not registered (rejected — would prevent the model from loading documents whose owning format package is not in the consumer\u2019s deployment, defeating the purpose of an `extensions` field).
2. Drop the namespace silently (rejected — violates IO-D-18 "no silent drops").
   **Rationale:** The registry is a runtime concern. A standalone validator (CI tooling, lightweight hosts) may not load `@broadset/formats`; demanding registration would force every consumer to import every format package. Forward-compat preservation keeps the data intact while still failing loudly when the schema *is* registered and the data is stale.

### P5.1 — PSD metadata channel strategy

**Decision:** Document-level `ImageResources.xmpMetadata` (ISO 16684-1 XMP packet) carries the shared `broadset:` namespace packet end-to-end via `ag-psd@^30.1.0`. The in-process round-trip is verified by `packages/formats/src/psd/xmp-roundtrip-spike.test.ts`. Per-layer Broadset tags (element id, dirty flag, preservation blobs) are carried via `PsdExtensions` on the Broadset element — the layer-resident `BsPs`-signature `additionalInfo` is NOT emitted until we confirm upstream `ag-psd` exposes a custom-signature write surface or we fork.
**Alternatives considered:**

1. Rely on `ag-psd` to emit a custom-signature `additionalInfo` directly at layer level (rejected — `ag-psd`'s public `LayerAdditionalInfo` surface is closed; custom signatures are not exposed as of v30.1.0).
2. Contribute a `customAdditionalInfo` API upstream before Phase 2 (rejected for now — blocks the critical path; can be reconsidered once the first full round-trip pipeline is shipped).
3. Encode per-layer metadata as a hidden signature-named layer group (deferred — viable fallback but defers Photoshop-side testing; revisit if the XMP + element-id approach proves insufficient for the chain-round-trip scenarios in Phase 5 tests).

**Rationale:** The XMP packet already carries an `elements[]` array keyed by `id` + `fingerprint` (see `_shared/xmp/BroadsetXmpPacket`). Combined with per-element `extensions.psd.roundTrip`, this is sufficient to reconcile Broadset-exported PSDs end-to-end: the layer `name` field links layers back to the XMP entry, and the `_shared/fingerprint/` module recovers identity when both are stripped. The Photoshop-macOS preservation verification of document XMP is well-established in the ISO spec; the custom-signature Photoshop preservation (the part not yet verified) is deferred until upstream support lands or we have a fallback ship decision. Tracked in the PSD risk register in `project/implementation/psd-support-plan.md` §Risk register.
