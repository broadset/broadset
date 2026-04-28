# Master Implementation Plan

This file is the consolidated execution roadmap across the shared prerequisites,
renderer refactor, and all format tracks.

Detailed task-level planning still lives in the dedicated companion files:

- [io-prereqs-plan.md](./io-prereqs-plan.md)
- [renderer-refactor-plan.md](./renderer-refactor-plan.md)
- [psd-support-plan.md](./psd-support-plan.md)
- [pdf-support-plan.md](./pdf-support-plan.md)
- [svg-support-plan.md](./svg-support-plan.md)
- [pptx-support-plan.md](./pptx-support-plan.md)
- [pdf-pdfa-compliance-plan.md](./pdf-pdfa-compliance-plan.md)
- [io-prereqs-ui-features-plan.md](./io-prereqs-ui-features-plan.md)
- [coverage-reporting.md](./coverage-reporting.md)
- [cross-region-ct-audit.md](./cross-region-ct-audit.md)
- [release-quality-closure-plan.md](./release-quality-closure-plan.md)
- [package-split.md](./package-split.md)

Use this file for sequencing. Use the companion files for detailed unit scope,
acceptance criteria, and risk notes.

Current planning status is recorded in the [Status](#status) section near the
end of this file. Update that section whenever any companion plan changes state.
Per-task execution tracking lives in [plan-progress.md](./plan-progress.md).
Update that file whenever an individual task moves.

For repo guidance, see `../../README.md` and `../../AGENTS.md`.

## TDD Convention

Every implementation unit in this roadmap is executed test-first using the
acceptance criteria in the relevant spec file and the current repo test stack
(Vitest for unit tests, Playwright CT where required).

1. **Red** — translate the spec acceptance criteria into failing tests.
2. **Green** — implement the minimum production code to pass them.
3. **Refactor** — clean up without breaking tests or weakening checks.

Each unit is complete only when:

- the targeted tests are green
- the relevant package `quality` command is green
- any required CT for cross-region UI behavior is green

## Planning rules

1. **Phases 0 through 4 are hard prerequisites.** Do not start format work before the shared foundation is in place.
2. **Format priority is product-driven and fixed here:** PSD, then PDF, then SVG, then PPTX.
3. **io-prereqs Phase 5 is interleaved, not front-loaded.** Land only the UI slices needed by the active format track, then reuse them downstream.
4. **io-prereqs Phase 6 lands at first need.** The first format track that needs the shared fixture convention, chain harness, and preserved-blob stress test introduces them once for everyone.
5. **The renderer refactor is its own workstream.** Treat it as the detailed execution of io-prereqs Phase 3.
6. **PDF/A-2b is deferred.** It starts only after the main PDF track has reached Phase 5 completion.
7. **Every phase ends green.** Use `npm run gate:full` as the closing gate, with `npm run ct` added for UI-visible phases.

## Master order

```text
Phase 0  → Shared decisions and spec lock
Phase 1  → Shared model additions
Phase 2  → Shared libraries and _shared modules
Phase 3  → Renderer refactor
Phase 4  → Shared asset pipeline
Phase 5  → PSD track
Phase 6  → PDF track
Phase 7  → SVG track
Phase 8  → PPTX track
Phase 9  → PDF/A-2b followup
Parallel A → Coverage reporting
Parallel B → Cross-region CT audit
Release D → Release quality closure
Deferred C → Package split
```

## Phase 0 — Shared decisions and spec lock

Source of truth: [io-prereqs-plan.md](./io-prereqs-plan.md)

This phase is docs and decisions only. No production code lands here.

Deliverables:

- ratify cross-format decisions IO-D-01 through IO-D-18 in [decisions.md](./decisions.md)
- update model specs in `project/spec/model/` for every Phase 1 shape change
- update [project/spec/formats/spec.md](../spec/formats/spec.md) with the importer contract, importer security contract, no-sidecar rule, and no-silent-drops rule
- keep format-specific behavior in the format spec files, not here

Exit condition:

- specs and decisions are updated and internally consistent
- no code changes yet

## Phase 1 — Shared model additions

Source of truth: [io-prereqs-plan.md](./io-prereqs-plan.md)

This phase lands the shared data-model work all four formats depend on.

### Phase 1 landing order

1. Unit utilities plus `parseLength`
2. Importer security contract spec update
3. `BroadsetColor` discriminated union and migration path
4. Content-hash identity field
5. Stroke enhancements (`strokeMiterlimit`, head/tail arrow ends)
6. Structured filter primitives (`FilterStack`)
7. Gradient enhancements (conic center/start angle, color mods)
8. `BroadsetFill` discriminated union
9. Text model (`string | TextBody`)
10. Text-on-path reference
11. Text fidelity fields
12. Model-level script rejection
13. Extensions typing registry
14. Per-format dirty flag and editor middleware
15. Page, canvas, and document additions (`notes`, bleed/trim/safe-area, metadata, output intent)
16. Importer contract spec closeout

### Phase 1 notes

- The three largest cascades are `BroadsetColor`, `BroadsetFill`, and the text-model upgrade.
- Update fixtures and tests in the same commits as breaking type changes.
- Do not preserve Broadset-owned backwards compatibility shims; this repo is greenfield.

Exit condition:

- model and validators support the shared format work
- affected packages compile and pass their relevant quality gates

## Phase 2 — Shared libraries and `_shared` modules

Source of truth: [io-prereqs-plan.md](./io-prereqs-plan.md)

This phase adds the shared format infrastructure under `packages/formats/src/_shared/`.

Deliverables:

- `_shared/color/`
- `_shared/fonts/`
- `_shared/text-layout/`
- `_shared/xmp/`
- `_shared/fingerprint/`
- `_shared/reconcile/`
- `_shared/shape-classifier/`
- `_shared/sanitize/`
- bundle-size assertion coverage for the heavy lazy-loaded paths

Exit condition:

- shared modules exist with narrow public APIs and unit coverage
- format plans can consume them directly without re-implementing the same logic

## Phase 3 — Renderer refactor

Source of truth: [renderer-refactor-plan.md](./renderer-refactor-plan.md)

This phase is the detailed execution of the renderer refactor needed by the
format work.

### Phase 3 subphases

#### Phase 3.0 — Contract cleanup

- separate generic renderer contracts from Broadset adapter contracts
- resolve spec drift around renderer-owned data attributes and group semantics

#### Phase 3.1 — Internal layer split

- split the current monolith into controller, host policy, layout, DOM, and adapter layers
- keep `createScreenRenderer` compatibility intact during the split

#### Phase 3.2 — Keyed reconciliation

- replace whole-layer DOM replacement with keyed reconciliation
- replace `JSON.stringify` change detection with explicit dirty-node classification

#### Phase 3.3 — Semantic renderers and safe builders

- replace unsafe markup paths with safe AST-to-DOM builders
- separate semantic text rendering from character-level instrumentation
- separate generic groups from boolean/composite behavior

#### Phase 3.4 — Runtime services

- add time, data, state, font, and asset service seams
- stop treating runtime behavior as document replacement

#### Phase 3.5 — Broadset adapter migration

- move Broadset-specific data attributes, overlay-root behavior, and compatibility wrappers into the adapter layer

#### Phase 3.6 — Spec closure and hardening

- align renderer specs, exports, DOM-stability tests, and performance checks with the refactored shape

Exit condition:

- renderer core is generic enough to consume a normalized scene graph
- Broadset behavior remains available through the compatibility adapter

## Phase 4 — Shared asset pipeline

Source of truth: [io-prereqs-plan.md](./io-prereqs-plan.md)

This phase lands the shared asset capabilities all format tracks depend on.

Deliverables:

- font asset type
- image assets normalized to bytes + metadata
- ICC profile preservation on image assets
- `icc-profile` asset type
- shared font subsetting pipeline
- font embed-permission surface
- content-hash asset deduplication on import

Exit condition:

- fonts, images, ICC profiles, and dedup semantics are available to every format exporter/importer

## Phase 5 — PSD track

Source of truth: [psd-support-plan.md](./psd-support-plan.md)

This is the first format track by explicit product priority.

### Phase 5 sequence

#### Phase 5.0 — PSD spec and scope lock

- rewrite the PSD spec around native layers, metadata layer, groups, masks, effects, and round-trip guarantees

#### Phase 5.1 — PSD types and de-risking spike

- add PSD types and namespace schema
- verify `ag-psd` metadata-channel viability and Photoshop preservation of custom signatures and XMP

#### Phase 5.2 — PSD export parity rebuild

- preserve groups
- add full path grammar and rotation export
- restore meaningful effect coverage

#### Phase 5.3 — PSD export beyond prior art

- native shape layers
- full text-run export
- all layer-effect coverage
- bitmap masks, clipping masks, linked smart objects, ICC-aware color handling
- XMP + `additionalInfo` metadata layer

#### Phase 5.4 — PSD import

- 5.4a fast path: XMP + `additionalInfo`
- 5.4b third-party layer-level extraction

#### Phase 5.5 — PSD reconciliation

- reconcile metadata defaults with current layer-tree edits
- recover identity by hash when tags are stripped

#### Phase 5.6 — PSD tests and UI wiring

- external-tool fixtures and chain tests
- import/export UI wiring and warning surfaces

### Phase 5 interleaves

During the PSD track, land the first tranche of io-prereqs Phase 5 UI work that PSD needs:

- run-edit mode
- bullets and paragraph editing
- swatches + ICC picker
- export options modal
- import warnings and reconciliation UI

Trigger io-prereqs Phase 6 during this track when PSD first needs the shared test harness and fixture convention.

Exit condition:

- PSD import/export/reconciliation/UI track is complete and green

## Phase 6 — PDF track

Source of truth: [pdf-support-plan.md](./pdf-support-plan.md)

This is the second format track by explicit product priority.

### Phase 6 sequence

#### Phase 6.0 — PDF spec and scope lock

- expand the PDF spec to import, round-trip, metadata, marked content, and external interop

#### Phase 6.1 — PDF types and dependency swap

- swap `@libpdf/core` to `pdf-lib`
- add `pdfjs-dist` and `@pdf-lib/fontkit`

#### Phase 6.2 — PDF export parity rebuild

- parent-child flattening
- rotation composition
- per-corner radii
- clip-path and mask fidelity

#### Phase 6.3 — PDF export beyond prior art

- real gradients and color-space handling
- OCGs by page
- marked content tagging
- XMP packet and richer export structure

#### Phase 6.4 — PDF import

- 6.4a fast path: XMP + marked content
- 6.4b third-party operator-level extraction

#### Phase 6.5 — PDF reconciliation

- reconcile visual edits against XMP defaults and hash recovery

#### Phase 6.6 — PDF tests and UI wiring

- external-tool fixtures and chain tests
- import/export UI, preflight, and preview surfaces

### Phase 6 interleaves

Land the additional io-prereqs Phase 5 slices PDF needs during this track:

- color mode selector
- gradient editor
- bleed/trim/safe-area canvas UI
- preflight panel
- document metadata editor
- multi-page sorter
- custom font upload surface

Reuse the shared test infrastructure introduced during the PSD track.

Exit condition:

- PDF import/export/reconciliation/UI track is complete and green

## Phase 7 — SVG track

Source of truth: [svg-support-plan.md](./svg-support-plan.md)

This is the third format track by explicit product priority.

### Phase 7 sequence

#### Phase 7.0 — SVG spec and scope lock

- split or rewrite the SVG spec to cover import, export, metadata, sanitization, and external interop

#### Phase 7.1 — SVG types and architecture

- add SVG types and direct-format dependencies
- verify metadata preservation in Illustrator and Inkscape

#### Phase 7.2 — SVG export parity and critical bug fix

- recursive group export
- stroke coverage
- transform handling
- safe sanitized output

#### Phase 7.3 — SVG export beyond prior art

- embedded fonts
- conic fallback + metadata
- OKLCH/display-p3 preservation
- full tagging and metadata path

#### Phase 7.4 — SVG import

- 7.4a fast path: metadata + `data-bs-*`
- 7.4b arbitrary third-party SVG import

#### Phase 7.5 — SVG reconciliation

- reconcile visual edits against metadata defaults and content-hash fallback

#### Phase 7.6 — SVG tests and UI wiring

- external-tool fixtures and chain tests
- SVG-specific import/export UI affordances

### Phase 7 interleaves

Land the remaining io-prereqs Phase 5 slices SVG needs during this track:

- stroke subpanel
- pattern fill picker
- filter editor
- text fidelity subpanel
- font-asset picker
- import warnings modal refinements

Reuse the existing shared test infrastructure.

Exit condition:

- SVG import/export/reconciliation/UI track is complete and green

## Phase 8 — PPTX track

Source of truth: [pptx-support-plan.md](./pptx-support-plan.md)

This is the fourth format track by explicit product priority.

### Phase 8 sequence

#### Phase 8.0 — PPTX spec and scope lock

- rewrite the PPTX spec around OOXML-native geometry, theme, metadata, and round-trip strategy

#### Phase 8.1 — PPTX types, package architecture, and parser swap

- replace regex parsing with namespace-safe OOXML parsing
- add PPTX types and package helpers

#### Phase 8.2 — PPTX export parity rebuild

- real text runs
- grouped export that preserves groups
- proper relationship handling and geometry helpers

#### Phase 8.3 — PPTX export beyond prior art

- multi-slide support
- generated theme/master/layout
- native paths and gradients
- notes, QR, and shape-tag metadata layers

#### Phase 8.4 — PPTX import

- 8.4a fast path: custom XML + shape tags
- 8.4b arbitrary third-party PPTX extraction

#### Phase 8.5 — PPTX reconciliation

- reconcile visual edits against custom XML defaults and interop ledger hashes

#### Phase 8.6 — PPTX tests and UI wiring

- external-tool fixtures and chain tests
- final import/export UI wiring for the PowerPoint flow

### Phase 8 interleaves

Land any remaining io-prereqs Phase 5 slices PPTX needs during this track:

- theme-aware color workflow
- picture-fill picker
- speaker notes UI
- final export options and import warning variants for PPTX

By the time this track starts, most of the required UI surface should already exist from PSD, PDF, and SVG.

Exit condition:

- PPTX import/export/reconciliation/UI track is complete and green

## Phase 9 — PDF/A-2b followup

Source of truth: [pdf-pdfa-compliance-plan.md](./pdf-pdfa-compliance-plan.md)

This phase is intentionally deferred until the main PDF track is mature enough.

### Phase 9 sequence

#### Phase 9.0 — PDF/A audit and spec update

#### Phase 9.1 — font embedding totality

#### Phase 9.2 — color-management and output-intent enforcement

#### Phase 9.3 — forbidden-feature gating

#### Phase 9.4 — PDF/A metadata and trailer correctness

#### Phase 9.5 — validator integration and CI

#### Phase 9.6 — round-trip support for PDF/A exports

Start this phase only after the PDF track has reached Phase 6.5 or later and the exporter/importer behavior is already stable.

## Parallel Track A — Coverage reporting

Source of truth: [coverage-reporting.md](./coverage-reporting.md)

This is an active supporting track, not a core dependency phase.

Purpose:

- add non-gating Vitest runtime coverage reporting
- establish a baseline report for untested production paths
- support future audit and prioritization work without blocking PRs on thresholds

Start conditions:

- Vitest migration complete
- `npm run gate:full` green on the branch

Recommended slot:

- can start immediately
- preferably complete before the cross-region CT audit is deep into gap triage, since its baseline is useful signal
- safe to run in parallel with shared foundation work because it is mostly test tooling and reporting

### Parallel Track A sequence

#### A.1 — wire `@vitest/coverage-v8` into shared Vitest config

#### A.2 — add exclusion rules and per-package overrides

#### A.3 — add root coverage scripts and ignore rules

#### A.4 — capture and document the baseline report

#### A.5 — update docs and testing guidance

#### A.6 — optional follow-up threshold proposal based on baseline numbers

Exit condition:

- coverage reporting is available and documented
- coverage remains non-gating in this track

## Parallel Track B — Cross-region CT audit

Source of truth: [cross-region-ct-audit.md](./cross-region-ct-audit.md)

This is an active supporting track, not a replacement for the main format roadmap.

Purpose:

- systematically inventory cross-region scenarios required by the CT Derivation Rule
- identify missing CT coverage from the specs
- land missing CTs or explicit spec-gap waivers

Start conditions:

- `test-improvement-plan.md` already complete
- `npm run gate:full` green on the branch

Recommended slot:

- start after or alongside Parallel Track A so the team has coverage baseline signal
- run before and during the PSD/PDF/SVG/PPTX tracks so CT gaps are identified early and closed continuously
- especially relevant once io-prereqs Phase 5 UI slices start landing

### Parallel Track B sequence

#### B.1 — inventory cross-region scenarios in `project/spec/editor/**`

#### B.2 — inventory cross-region scenarios in `project/spec/ui/**`

#### B.3 — inventory cross-region scenarios in `project/spec/demo/**`

#### B.4 — consolidate into one gap list

#### B.5 — land missing CT coverage in focused batches

#### B.6 — final regression and gate closeout

Exit condition:

- every identified cross-region scenario has CT coverage or an explicit documented waiver in the owning spec

## Release Track D — Release quality closure

Source of truth: [release-quality-closure-plan.md](./release-quality-closure-plan.md)

This is the coordinating release-readiness track for the current gate-clean branch.

Purpose:

- resolve or explicitly risk-accept full dev audit advisories
- execute coverage reporting and cross-region CT accountability work
- run and document real producer compatibility checks for PPTX, PDF, PSD, and SVG
- align specs and release docs with validated external compatibility

Start conditions:

- `npm run gate:full` green on the branch
- current release-readiness gaps documented in `production-readiness-rerun-2026-04-28.md`

Recommended slot:

- start immediately after the gate-clean hardening branch stabilizes
- run before declaring a release candidate production-ready
- execute coverage and CT units before producer compatibility closeout so test-accountability gaps are visible while real files are being validated

### Release Track D sequence

#### D.1 — resolve full dev audit advisories

#### D.2 — wire coverage reporting and baseline docs

#### D.3 — complete cross-region CT inventory and gap closure

#### D.4 — establish real producer fixture governance and harness

#### D.5 — run PPTX real producer checks

#### D.6 — run PDF real producer checks

#### D.7 — run PSD real producer checks

#### D.8 — run SVG real producer checks

#### D.9 — release compatibility report and fresh-checkout validation

Exit condition:

- release-quality closure plan done definition is met, including clean or accepted audit status, coverage baseline, cross-region CT accountability, producer compatibility report, aligned specs, and fresh-checkout validation

## Deferred Track C — Package split

Source of truth: [package-split.md](./package-split.md)

This is a real unfinished plan, but it is intentionally not on the critical path for the current platform and format program.

Rationale for deferral:

- the main roadmap is already restructuring `@broadset/renderer`, `@broadset/formats`, and editor internals substantially
- mixing facade/package moves into the active feature-delivery phases would create avoidable churn and merge-conflict pressure
- the package split will be easier and cleaner after the format and renderer work stabilizes the new ownership boundaries

Recommended slot:

- start after Phase 8 completes
- if PDF/A becomes urgent, still keep package split after the feature-complete format program unless there is a specific build-scaling emergency

### Deferred Track C sequence

#### C.1 — prep and API freeze

- inventory current public exports for `@broadset/formats` and `@broadset/editor`
- define the facade compatibility contract

#### C.2 — formats split

- create `formats-core`
- create specialized format packages
- keep `@broadset/formats` as a stable facade

#### C.3 — editor split

- create `editor-store`
- create `editor-interaction`
- keep `@broadset/editor` as a stable facade

#### C.4 — optional UI tokens split

- only if reuse justifies it after the larger splits settle

#### C.5 — cleanup and hardening

- remove duplicates
- update architecture docs and package READMEs
- verify root validation chain

Exit condition:

- facades remain stable
- new internal packages are introduced with clear ownership and architecture docs reflect the final graph

## Interleave rules for io-prereqs Phase 5 and Phase 6

### io-prereqs Phase 5 — editor UI surface

Do not try to finish all of Phase 5 before format work starts.

Instead:

- land the PSD-required UI slice during Phase 5
- extend it with the PDF-required slice during Phase 6
- extend it with the SVG-required slice during Phase 7
- finish the remaining PPTX-specific needs during Phase 8

This keeps the UI work aligned to the active format track and avoids overbuilding unused controls early.

### io-prereqs Phase 6 — testing infrastructure

Land Phase 6 once, at first need, during the PSD track:

- external-tool fixture convention
- `assertReImportableBy(...)`
- chain CT harness
- preserved-blob stress test

Then reuse it unchanged across PDF, SVG, and PPTX except for format-specific fixture additions.

## Recommended execution summary

```text
Shared foundation:
	Phase 0 → Phase 1 → Phase 2 → Phase 3 → Phase 4

Formats in priority order:
	Phase 5 PSD
	Phase 6 PDF
	Phase 7 SVG
	Phase 8 PPTX

Followup:
	Phase 9 PDF/A-2b

Supporting tracks:
	Parallel A Coverage reporting
	Parallel B Cross-region CT audit
	Release D Release quality closure

Deferred structural track:
	Deferred C Package split
```

More detailed sequence:

```text
io-prereqs 0 → 1 → 2 → renderer-refactor → io-prereqs 4
→ PSD 0 → 1 → 2a → 2b → io-prereqs 5 slice A → PSD 3a → 3b → 4 → io-prereqs 6 → PSD 5 → 6
→ PDF 0 → 1 → 2a → 2b → io-prereqs 5 slice B → PDF 3a → 3b → 4 → 5 → 6
→ SVG 0 → 1 → 2a → 2b → io-prereqs 5 slice C → SVG 3a → 3b → 4 → 5 → 6
→ PPTX 0 → 1 → 2a → 2b → io-prereqs 5 slice D → PPTX 3a → 3b → 4 → 5 → 6
→ PDF/A-2b

parallel: coverage-reporting
parallel: cross-region-ct-audit
release: release-quality-closure

deferred-after-main-program: package-split
```

## Status

Status is collected here so this file is the single place to check planning state.

As of 2026-04-28:

- **io-prereqs:** draft — pre-Phase 0
- **renderer refactor:** draft — extracted from io-prereqs Phase 3 into its own detailed plan
- **PSD support:** draft — pre-Phase 0
- **PDF support:** complete — all 8 units of the PDF track shipped (`pdf-lib` exporter with rebuilt parity, XMP + `/BSET` marked-content round-trip, page boxes, OCGs, XMP fast-path + third-party operator extraction import, reconciliation wrapper, chain round-trip test + demo dispatcher wiring)
- **SVG support:** draft — pre-Phase 0
- **PPTX support:** draft — pre-Phase 0
- **PDF/A-2b compliance:** complete — all 7 P9 units shipped (PDF/A spec section + acceptance criteria, bundled minimal sRGB v2 profile via `_shared/color/getDefaultProfile`, `pdfaConformance: '2b'` opt-in on `exportPdfBytes` / `exportPdfWithPreflight`, `/OutputIntents` + `/GTS_PDFA1` + ICC stream, `pdfaid:part`/`pdfaid:conformance` XMP block, deterministic trailer `/ID` array, in-tree `validatePdfA2b` structural validator, round-trip identifier preservation via `extensions.pdf.pdfa`). Real sRGB IEC61966-2.1 profile embed, font-subsetting totality, and veraPDF CI integration recorded as Spec Gaps in `project/spec/formats/pdf.md`.
- **io-prereqs UI features:** draft companion plan — consumed during io-prereqs Phase 5 interleaves
- **coverage reporting:** complete — non-gating V8 coverage is wired, documented, and baselined.
- **cross-region CT audit:** inventory complete; gap closure pending — 120 cross-region bullets mapped, with 65 covered, 22 partial, and 33 missing.
- **release quality closure:** in progress — audits, coverage, and producer fixture governance/harness are complete; CT gap closure and real producer validation remain.
- **package split:** proposed planning-only followup — deferred until after the main format program

Completed reference:

- **test improvement plan:** complete — not part of the unfinished roadmap

Current master-plan state:

- **Phase 0 (decisions + spec-first updates):** complete
- **Phase 1 (shared model additions):** complete — all 16 units shipped (IO-D-01 through IO-D-18 ratified; unit utilities, importer security, BroadsetColor / BroadsetFill / FilterStack unions, content-hash identity, stroke + gradient enhancements, TextBody + text-on-path + text fidelity, model-level script rejection, extensions typing + dirty-flag middleware, page / canvas / document additions, importer contract)
- **Phase 2 (shared libraries + `_shared` modules):** complete — 9 units shipped (shape-classifier, fingerprint, reconcile, sanitize, xmp, color, fonts, text-layout, bundle-size guard). `lcms-wasm` / ICC / CMYK / `harfbuzzjs` / font-resolve / subsetting are spec-gapped and light up when Phase 4 asset pipeline or a concrete caller arrives.
- **Phase 3 (renderer refactor):** complete — all 7 subphases shipped (P3.0 contract cleanup, P3.1 internal layer split into core/dom/elements/adapters, P3.2 keyed reconciliation with composite child invalidation, P3.3 semantic renderers + safe builders removing innerHTML paths, P3.4 runtime service seams for time/data/state/fonts/assets, P3.5 generic `createHtmlMotionRenderer` entry + Broadset adapter, P3.6 performance tests + spec closure)
- **Phase 4 (shared asset pipeline):** complete — all 7 units shipped (P4.1 font asset type with `format`/`postScriptName`/`familyName`/`subsetRanges?`; P4.2 image asset `width`/`height` required; P4.3 image `iccProfileAssetId?`; P4.4 `IccProfileAsset` variant; P4.5 `_shared/fonts/subset.ts` + codicon fixture; P4.6 `_shared/fonts/embed-policy.ts`; P4.7 `_shared/asset-dedup/` with `AssetDeduplicator`)
- **Phase 5 (PSD track):** complete — P5.0 spec + cross-format round-trip metadata requirement; P5.1 PSD types + XMP round-trip spike; P5.2 export parity (groups via parentId tree, rotation, TextBody → styleRuns, `broadset:` XMP packet); P5.4a fast-path XMP import; P5.5 reconciliation wrapper + dirty-flag discipline; P5.6 chain round-trip test via shared harness. Deeper P5.2b/P5.3 surface (native shape layers, all 10 effects, bitmap masks, CMYK/Lab, linked smart objects) recorded as Spec Gaps in `project/spec/formats/psd.md`.
- **I5.1 PSD UI slice:** complete — `FormatExportOptionsModal` + `FormatImportWarningsModal` in `packages/ui/src/modals/`, format-agnostic so PDF/SVG/PPTX interleaves I6.1/I7.1/I8.1 reuse them unchanged.
- **I6.2 Phase 6 testing infrastructure:** complete — `_shared/test-infrastructure/` ships `assertReImportableBy`, `runChainRoundTrip`, `assertPreservedBlobSurvives`. PSD chain test wires the harness.
- **Phase 6 (PDF track):** complete — all 8 units shipped (P6.0 spec + feature matrix; P6.1 `@libpdf/core` → `pdf-lib` swap + `pdfjs-dist` + `@pdf-lib/fontkit` deps; P6.2 parent-child translation + rotation CTM brackets + per-corner radii via kappa cubic Béziers + clip-path via native PDF clipping operators for `inset`/`circle`/`ellipse`/`polygon`; P6.3 `/BSET` marked-content property dicts registered in page `/Resources /Properties` + `broadset:` XMP packet on catalog `/Metadata` + page boxes from `canvas.bleed`/`canvas.safeArea` + one OCG per Broadset page in `/OCProperties`; P6.4a XMP fast-path hydrates document id + element ids + types; P6.4b third-party operator-level text extraction via FlateDecode + Tj / hex-Tj scanner; P6.5 reconciliation wrapper over `_shared/reconcile/` with `dirtyElementIds` for re-export discipline; P6.6 chain round-trip test + demo dispatcher wires `.pdf`). Real PDF shading-pattern gradients, CMYK/Lab/Gray/spot + ICC emission, font subsetting via `@pdf-lib/fontkit`, per-element `/OC` OCG membership, and the external-tool fixture corpus recorded as Spec Gaps in `project/spec/formats/pdf.md`.
- **Phase 7 (SVG track):** complete — all 8 units shipped (P7.0 spec + scope lock with feature matrix; P7.1 types + architecture with Zod registration and import-tuned DOMPurify sanitizer; P7.2 parity + critical bug fix — recursive `<g>`, full stroke coverage, gradient import, opaque-payload sanitization; P7.3 beyond prior art — `data-bs-*` tagging, `broadset:content-hash`, `<metadata>` RDF packet, conic-fallback with metadata, OKLCH/display-p3 preservation; P7.4a fast-path hydration with nested group identity, `extensions.svg.dirty` init; P7.4b third-party import with `<use>` / `<symbol>` dereferencing + cycle detection, CSS `<style>` block resolution, namespace warnings, no silent drops; P7.5 reconciliation via `_shared/reconcile` with `dirtyElementIds` helper; P7.6 chain round-trip + synthetic external-tool fixtures + hostile-SVG security suite + `FormatExportOptionsModal` SVG fields)
- **Phase 8 (PPTX track):** substantially complete (audit-closed) — see `project/spec/formats/pptx.md → Spec Gaps` for the honest list of deferred features and known acceptance-criteria deviations
  - P8.0 spec lockdown: complete
  - P8.1 types + architecture + dependency swap: complete
  - P8.2a/2b export: complete (groups via `<p:grpSp>`, text runs, rotation, multi-slide, generated theme/master/layout, custom XML parts, `broadset:` XMP packet at `docProps/custom.xml`, shape-name tags + `<p:extLst>`, native `<a:custGeom>` paths, gradient + theme colours + arrow ends)
  - P8.3a/3b import: complete (fast-path via `customXml/broadset-project.xml`; operator-level: theme + master cascade, placeholder inheritance, shapes, text as `TextBody` with per-run styling, theme-slot colour preservation with mods, gradients, arrow ends, picture, groups, common-preset expansion to native paths, unsupported shapes preserved under `extensions.pptx.raw` with `dirty: false`, structured import warnings, security-contract size/depth/entry caps + `vbaProject.bin` rejection)
  - P8.4 reconciliation: complete via `reconcile.ts` wrapping `_shared/reconcile/`
  - P8.5 tests: 447 tests across 53 files, including per-tool synthesized fixtures (PowerPoint / Keynote / Google Slides / LibreOffice / Canva) and round-trip coverage for fade-entry animations
  - P8.6 UI wiring: PPTX dispatch wired through `formatBridge.ts`; shared `FormatImportWarningsModal` + `FormatExportOptionsModal` from I5.1 cover the format
  - **Audit gaps (closed during audit pass):** invalid `<p:spTgt bset-id>` attribute → canonical `spid`; theme-colour preservation; multi-run TextBody; gradient + arrow-end + raw preservation; XMP packet emission; placeholder cascade through master; preset shape expansion. **Known deviations remaining:** importer regex parsing (rebuild to fast-xml-parser AST tracked); page-override content/style/assetId (model-level work); `<a:blipFill>` srcRect crop baking; non-`entr` `<p:timing>` presets.
- PDF/A-2b followup: not started
- Coverage reporting: complete — `npm run test:coverage` emits HTML/JSON/text reports and `coverage-baseline.md` plus threshold proposal are present.
- Cross-region CT audit: inventory complete; gap closure pending — `cross-region-ct-inventory.md` lists the 74 CRA-2.x work items that remain before closeout.
- Release quality closure: in progress — D.1, D.2, and D.4 are complete; D.3 gap closure, D.5-D.8 producer runs, and D.9 fresh-checkout validation remain.
- Package split: deferred, not started
