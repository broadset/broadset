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

**Decision:** Ratify the 18 cross-format design decisions that gate PSD, PDF, PPTX, SVG, and PDF/A work. The full ratified table is embedded below (folded from the retired io-prereqs plan). Two entries are not verbatim folds: IO-D-12 and IO-D-13 were amended on 2026-07-09 to match the contracts the specs actually ratified — each amended entry preserves its original wording inline. The **IO-D-** prefix namespaces these from the unrelated `Unit N.0` series above; they are referenced by number throughout the format specs and [plan.md](./plan.md).

Headline decisions (full rationale in the ratified table below):

- **IO-D-01 Runs, not HTML** — text is stored as `TextBody`/`Paragraph`/`Run`; HTML exists only at export boundaries.
- **IO-D-02 Bake-to-path for non-trivial affine** — no `scale`/`skew` on elements.
- **IO-D-03 Structured filter primitives** — CSS filter string becomes a discriminated union; string is a derived view.
- **IO-D-04 `fill` is a discriminated union** — solid / gradient / pattern / picture / none.
- **IO-D-05 `BroadsetColor` is a discriminated union; never silently downgrade** — RGB (with space + originalColor preservation) / theme (with mods). Preflight warns on unsupported target.
- **IO-D-06 `TextRun[]` type lands before run-edit UI** — importers have somewhere to put data; editor completion routes to W2-TEXT-01.
- **IO-D-07 Cross-format logic under `_shared/`; format-only libraries direct** — no pointless wrappers; `_shared/*` is for logic serving ≥2 formats.
- **IO-D-08 Shared `broadset:` XMP namespace** — one Broadset footprint across every carrier.
- **IO-D-09 `@font-face` embedding default-on** — reference / flatten are opt-ins.
- **IO-D-10 Properties-panel exposure gates every round-trippable field.**
- **IO-D-11 `extensions.<format>` validated at load time** — central Zod registry; fail loudly on stale `.bsp`.
- **IO-D-12 Run-editor keyboard shortcuts deferred** — Ctrl-B etc. land later; range selection + panel suffices.
- **IO-D-13 Color intent is per-document** — `document.outputIntent.colorSpace`; spot colors are typed swatch/ink resources, not a document mode string (amended 2026-07-09).
- **IO-D-14 Preflight warns and proceeds** — never blocks export.
- **IO-D-15 Gradient editor UI ships with the model additions** — per IO-D-10.
- **IO-D-16 Export emits the fully-entered "IN" state; animations are discarded unless native** — PPTX exempts the `<p:timing>`-mappable subset; PDF/PSD/SVG are static carriers.
- **IO-D-17 No sidecars** — round-trip metadata lives inside the format file using the format's own extension mechanism.
- **IO-D-18 No silent drops** — every importer maps to a native element or preserves under `extensions.<format>.raw` / opaque fragment with a warning.

**Alternatives considered** (per decision, in the ratified table below).

**Rationale:** Each decision emerged from the 2026-04 cross-format audit (io-prereqs program, since folded into [plan.md](./plan.md)). This entry is the formal ratification record and the namespace reservation for `IO-D-` prefixed references.

#### Ratified table (IO-D-01 … IO-D-10, IO-D-16 … IO-D-18)

| #       | Decision                                                                                                                | Recommended resolution                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| IO-D-01 | **Runs, not HTML, for text storage.**                                                                                   | Structured runs and paragraphs are the canonical representation. PSD, PPTX, Word, Figma, Sketch, and professional typography engines use runs. HTML↔runs translation is lossy both ways, and HTML from an attacker-supplied importer is an unsafe-DOM surface. If HTML is needed at an export boundary, serialize runs to HTML there—never introduce HTML as a new authoring-store representation. The existing sanitized-HTML compatibility path remains governed by current specs until an explicitly ratified migration.                                                                  |
| IO-D-02 | **Bake-to-path for non-trivial affine transforms.**                                                                     | Do not add `scale` or `skew` to elements. When an importer hits a transform that can't be expressed by `position` + `rotation`, convert the shape to a path and bake the transform into `d`. Matches user intuition; keeps the model small.                                                                                                                                                                                                                                                                                                                                                  |
| IO-D-03 | **Structured filter primitives replace the CSS filter string.**                                                         | The `filter`/`backdropFilter` strings on style today become a discriminated union of filter primitives (`drop-shadow`, `blur`, `color-matrix`, …). Renderer derives the CSS string view. Canonical form is typed primitives, not strings.                                                                                                                                                                                                                                                                                                                                                    |
| IO-D-04 | **`fill` becomes a discriminated union.**                                                                               | `{ kind: 'none' } \| { kind: 'solid'; color } \| { kind: 'gradient'; gradient } \| { kind: 'pattern'; … } \| { kind: 'picture'; assetId; mode: 'stretch' \| 'tile'; preserveAspectRatio?; tile? }`. Cleaner than bolting fill types onto flat color fields. No cropping in the model — importers bake crops into the source image on import.                                                                                                                                                                                                                                                 |
| IO-D-05 | **Color becomes a discriminated union; never silently downgrade color space.**                                          | `{ kind: 'rgb'; hex } \| { kind: 'theme'; slot; mods? }`. Unlocks PPTX theme-color round-trip, and color-space-preserving stops for SVG/PDF when `kind: 'rgb'` is extended with optional `space` and `originalColor` preservation strings. Export rule: when the target format cannot represent the source color space (e.g. OKLCH → PPTX sRGB), preserve `originalColor` on re-import and surface a preflight warning. No silent flattening to sRGB hex.                                                                                                                                    |
| IO-D-06 | **`TextRun[]` as type now, editor support staged.**                                                                     | The legacy program landed paragraph/run types before UI so importers had a structured destination. Full professional run editing now routes to W2-TEXT-01.                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| IO-D-07 | **Cross-format logic lives under `packages/formats/src/_shared/`; format-specific libraries may be imported directly.** | `_shared/*` is for logic or library wrappers that serve ≥2 formats (color math, font subsetting, XMP parsing, reconcile, fingerprint, sanitize, shape-classifier, text-layout). Not a separate package — keeps the change surface small. Format-only libraries (`pdf-lib`, `pdfjs-dist`, `ag-psd`, `svgpath`, `css-tree`, `transformation-matrix`, `fflate`, `svgo`, …) are imported directly by the format package that needs them — no pointless wrapper. If a format's "private" library later turns out to be shared, factor into `_shared/` when the second consumer lands, not before. |
| IO-D-08 | **`broadset:` XMP namespace shared across carriers.**                                                                   | Same XMP namespace in PDF XMP, PSD XMP, SVG `<metadata>`, TIFF XMP. Downstream tooling sees one Broadset footprint regardless of container.                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| IO-D-09 | **`@font-face` embedding is the default for Broadset-owned exports.**                                                   | SVG export, PDF export, and PPTX export embed subsetted fonts by default. `reference` / `flatten` are opt-ins per-format.                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| IO-D-10 | **Properties-panel exposure gates every new round-trippable field.**                                                    | No shipping a model field without a user-editable UI on it, except fields explicitly documented as "imported-only, no UI surface" (e.g. low-level filter primitives a user would never hand-author). Principle: if the user can import it but can't edit it, round-trip through editing is broken.                                                                                                                                                                                                                                                                                           |
| IO-D-16 | **Animation export policy: emit the fully-entered "IN" state; discard animations that do not map natively.**            | Exporters render each element in its fully-entered state — the resting composition after entry and before exit. Animation data is not serialized unless the target supports it and the Broadset animation maps cleanly to the target's native model. Unmappable animations are discarded silently on export; the `.bsp` remains the source of truth. ADR-IO-014/016 records a proposal to replace this intentional-loss policy, but does not supersede it without maintainer ratification.                                                                                                   |
| IO-D-17 | **No sidecars. Standards-only round-trip carriers.**                                                                    | Every format's round-trip metadata lives inside the format file using mechanisms the format's native specification already documents: PDF XMP + marked content, PSD XMP + `additionalInfo`, PPTX `<p:extLst>` + custom XML parts + shape names, SVG `<metadata>` RDF + `data-bs-*` + namespaced attributes. No out-of-package sidecar JSON, no embedded-file attachments used as sidecars, no app-private streams outside the format's own documented extension mechanism. This makes Broadset exports survive any chain where the intermediate tool respects the format's own spec.         |
| IO-D-18 | **No silent drops. Unknown content preserved as `extensions.<format>.raw` or opaque fragment.**                         | Every importer either maps a source construct to a native element, preserves the raw source fragment for lossless re-emission while clean, or emits a structured warning. SVG uses opaque elements; PDF/PSD/PPTX use typed `extensions.<format>` namespaces. W3-CORPUS-01/W3-QE-01 own current cross-format enforcement.                                                                                                                                                                                                                                                                     |

#### Ratified additions (IO-D-11 … IO-D-15)

- **IO-D-11 `extensions.<format>` validated at load time.** Each format package registers a Zod schema for its `extensions.<format>` namespace into a central registry; `.bsp` load validates every present namespace. Fail loudly on stale or corrupt files rather than at re-export.
- **IO-D-12 Run-editor keyboard shortcuts were deferred by the legacy program.** W2-CMD-01/W2-TEXT-01 now own command-registry integration, discoverability, collision handling, and keyboard parity. _Amended 2026-07-09; originally ratified as: "Range selection + properties-panel controls are the Phase 5 scope. Ctrl-B / Ctrl-I / Ctrl-U on a selected range land in a later polish pass."_
- **IO-D-13 Color intent is per-document.** `document.outputIntent.colorSpace` is `'rgb' | 'cmyk' | 'gray' | 'lab'` and references an ICC profile asset; absence uses the target format's documented default. There is no per-element color-mode override. Spot colors are typed swatch/ink resources under W1-COLOR-01 rather than a document mode string. _Amended 2026-07-09 to match the ratified spec contract; originally ratified as: "`settings.colorMode: 'rgb' | 'cmyk' | 'spot'` on the document. No per-element override in the initial cut; spot overlays are expressed via the swatches panel, not a per-element mode flag."_
- **IO-D-14 Preflight warns and proceeds.** Preflight surfaces missing fonts, out-of-gamut colors, overflow-bleed, image resolution, and embed-permission issues as warnings. Export is never blocked under the current decision. ADR-IO-014/016 records a proposed replacement policy.
- **IO-D-15 Gradient editor UI ships in the same phase as the gradient model additions.** Per IO-D-10, shipping the model without its editor surface is forbidden.

### Legacy Phase 1 Unit #13 — Extensions Registry Validates In-Element

**Decision:** Wire `validateExtensions` into the existing element/document Zod `superRefine` rather than ship the registry as a standalone helper. Extracted to `refineExtensionsAgainstRegistry(raw, ctx)` so the call site stays one line and the surrounding cognitive complexity score stays under the project lint threshold.
**Alternatives considered:**

1. Keep `validateExtensions` as a standalone helper that callers invoke after `parse` (rejected — leaves IO-D-11 enforcement to discipline; importers and tests would skip it).
2. Inline the try/catch directly into element.ts and document.ts (rejected — pushed cognitive complexity over the lint threshold and duplicated five lines of error fan-out across two files).
   **Rationale:** IO-D-11 mandates "validated at load time". The only way to make that mechanical is to wire it into the existing `parse` call sites the rest of the codebase already uses. Extracting to a helper preserves single-responsibility on element.ts/document.ts while keeping the contract enforceable.

### Legacy Phase 1 Unit #13 — Forward-Compat For Unregistered Format Namespaces

**Decision:** When `extensions.<formatId>` is present but no schema is registered for that format id, accept the namespace without validation rather than reject the load.
**Alternatives considered:**

1. Reject any namespace whose schema is not registered (rejected — would prevent the model from loading documents whose owning format package is not in the consumer\u2019s deployment, defeating the purpose of an `extensions` field).
2. Drop the namespace silently (rejected — violates IO-D-18 "no silent drops").
   **Rationale:** The registry is a runtime concern. A standalone validator (CI tooling, lightweight hosts) may not load `@broadset/formats`; demanding registration would force every consumer to import every format package. Forward-compat preservation keeps the data intact while still failing loudly when the schema _is_ registered and the data is stale.

### P5.1 — PSD metadata channel strategy

**Decision:** Document-level `ImageResources.xmpMetadata` (ISO 16684-1 XMP packet) carries the shared `broadset:` namespace packet end-to-end via `ag-psd@^30.1.0`. The in-process round-trip is verified by `packages/formats/src/psd/xmp-roundtrip-spike.test.ts`. Per-layer Broadset tags (element id, dirty flag, preservation blobs) are carried via `PsdExtensions` on the Broadset element — the layer-resident `BsPs`-signature `additionalInfo` is NOT emitted until we confirm upstream `ag-psd` exposes a custom-signature write surface or we fork.
**Alternatives considered:**

1. Rely on `ag-psd` to emit a custom-signature `additionalInfo` directly at layer level (rejected — `ag-psd`'s public `LayerAdditionalInfo` surface is closed; custom signatures are not exposed as of v30.1.0).
2. Contribute a `customAdditionalInfo` API upstream before the legacy Phase 2 work (rejected then because it blocked the critical path; W3-PSD-01 may reconsider it against current fidelity evidence).
3. Encode per-layer metadata as a hidden signature-named layer group (deferred by the legacy Phase 5 evidence; W3-PSD-01 revisits only if XMP + element ID proves insufficient in canonical chain tests).

**Rationale:** The XMP packet already carries an `elements[]` array keyed by `id` + `fingerprint` (see `_shared/xmp/BroadsetXmpPacket`). Combined with per-element `extensions.psd.roundTrip`, this is sufficient to reconcile Broadset-exported PSDs end-to-end: the layer `name` field links layers back to the XMP entry, and the `_shared/fingerprint/` module recovers identity when both are stripped. The Photoshop-macOS preservation verification of document XMP is well-established in the ISO spec; the custom-signature Photoshop preservation (the part not yet verified) is deferred until upstream support lands or we have a fallback ship decision. Tracked as P5.G1 in [plan-progress.md](./plan-progress.md).

### P6.1 — PDF emitter swap: @libpdf/core → pdf-lib

**Decision:** The legacy PDF track replaced `@libpdf/core@^0.3.4` with `pdf-lib@^1.17.1`, added `pdfjs-dist` and `@pdf-lib/fontkit`, and recorded the result in the manifest-derived [architecture baseline](./architecture.md).
**Alternatives considered:**

1. Keep `@libpdf/core` and extend it with marked-content, shading patterns, OCGs, and CMYK support (rejected by the legacy Phase 6 decision because its capability ceiling around operator injection and custom XMP was unknown and the required matrix needed shading, OCGs, `/BSET` marked content, and catalog XMP).
2. Use `jsPDF` (rejected — generation-only, no operator-level control; cannot emit the marked-content and shading-pattern fidelity the spec requires).
3. Use `pdfkit` (rejected — stream-based Node-first API is awkward for a browser-first app).
4. Use `pdftron` / `Apryse` / `iText` (rejected — commercial licensing conflicts with the repo's OSS posture).

**Rationale:** `pdf-lib` exposes `page.pushOperators(...)` for raw operator injection (required for `/BSET` marked-content BDC/EMC pairs and shading-pattern painting), native DeviceCMYK / DeviceN / Separation colour spaces (required for IO-D-13 per-document colour mode), OCG registration via `/OCProperties`, Form XObjects for group preservation, and `PDFHexString` / `PDFRawStream` for writing custom-namespace XMP on the catalog's `/Metadata`. `pdfjs-dist` is Mozilla's reference parser — the only browser-first choice for operator-level extraction in P6.4b. `@pdf-lib/fontkit` is the official adapter wiring `_shared/fonts/` (fontkit-backed subsetting) into pdf-lib's font embedding.

The P6.1 swap is strictly mechanical: `PDF.create()` → `await PDFDocument.create()`, `addPage({width, height})` → `addPage([widthPt, heightPt])`, `embedImage(bytes)` → `embedPng(bytes)` / `embedJpg(bytes)` based on MIME, `drawEllipse({xRadius, yRadius, ...})` → `drawEllipse({xScale, yScale, ...})`, `Standard14FontName` union → pre-embedded `PDFFont` (every standard-font variant is embedded via `pdf.embedFont(StandardFonts.X)` before render time). Existing 358 formats tests stay green. Operator injection, shading patterns, OCGs, marked content, XMP, and CMYK all land in P6.2 / P6.3 on top of this foundation.
