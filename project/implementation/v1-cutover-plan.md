# Project format v1 — application cutover plan

This plan operationalizes the app-wide legacy → v1 migration into a reviewed, dependency-ordered set of
stacked pull requests. It is the authoritative decomposition for completing the cutover after the v1
model foundation lands.

## Status snapshot

- **Foundation (shipped):** the complete v1 model under `packages/model/src/v1` — closed Zod schemas,
  whole-project semantic validation, bounded loading and quarantine, canonical JSON, semantic hashing,
  the published JSON Schema, and the locked public API.
- **Authoring utilities (this slice):** `createProjectV1` / `createDocumentV1` / `createElementV1` and
  the shared appearance, geometry, and text-body builders in `packages/model/src/v1/construction.ts`.
  Every downstream slice needs these to construct v1 documents.
- **Coexistence:** `packages/model/src/index.ts` dual-publishes the model. It re-exports v1 both flatly
  (`export * from './v1'`) and namespaced (`export * as projectFormatV1 from './v1'`), while explicit
  legacy re-exports win the colliding names (`Asset`, `Swatch`, `ColorSpace`, `DocumentMetadata`,
  `TextBody`, `Keyframe`, `elementSchema`, `TemplateGroup`, `PatternRepeat`). On a bare
  `@broadset/model` import those names resolve to the LEGACY symbol; the v1 counterparts are reachable
  through `projectFormatV1.<name>` until the final delete. Every stacked PR adds v1 code paths and
  retains the legacy modules, so each intermediate branch builds green.

## Scope

The full cutover touches roughly 320 files across every consumer package. It is quasi-atomic at the
editor-store seam — the store's source-of-truth type is shared by `ui` and `demo`, so the host cutover
lands as one unit.

## Migration slices

### Slice A — v1 authoring utilities (model)

Construction factories and public semantic indexes. Pure model logic, validated by parsing factory
output through the v1 schemas and `parseProjectV1Unknown`.

### Slice B — v1 resolved scene (model)

The resolved-scene compositor: flatten `document.elements` (canonical ownership) plus each page's
`rootInstances` (`PageRootInstance` transform / visible / `TypedOverride[]`), `descendantOverrides`,
component-instance expansion, and `selectedVariableModes` into a flat renderable instance tree plus a
resolved resource context. Builds on `resolved-address.ts` and the semantic indexes. This is the
critical-path prerequisite for all v1 rendering and the highest-risk correctness surface (override
application through `PropertyTarget`, component path descent, variable-mode selection).

### Slice C — v1 render pipeline (renderer, playback)

CSS/paint resolvers (`ColorValue` → CSS across srgb / display-p3 / rec2020 / oklab / oklch / lab / cmyk
/ gray plus swatch reference and tint; `Gradient` → CSS; layered fills / strokes / effects; structured
`TextBody` runs → DOM), v1 element renderers keyed by `ElementKind`, and playback evaluation of
`document.sequences` / `stateMachines` / `bindings` on a tick `Timebase`. Runs beside the untouched
legacy DOM renderer.

### Slice D — v1 interop (formats, model)

The largest blast radius. Importers PRODUCE `BroadsetDocumentV1` plus project-level resources (assets
and font families via `BlobReference`) and a first-class `InteropRegistry` that replaces the flat
warning list and starts preserving source blobs. Exporters CONSUME v1 directly and are verified to open
correctly in the canonical external tool. Reconcile identity moves from the xxhash element fingerprint
to canonical-JSON SHA-256. `.bsp` persistence routes through `loadProjectV1Json` and
`canonicalizeProjectV1`.

### Slice E — host cutover (editor, ui, demo, model)

The editor store's source of truth becomes `BroadsetProjectV1`; create / delete / reparent / reorder,
component, page-as-override-layer, data, animation, and resource commands preserve every v1 invariant
(including delete-cascade purging of dangling `PropertyTarget`s). UI inspectors, timeline, data panels,
component editing, output settings, and quarantine diagnostics read and write v1. The demo host, local
persistence, fixtures, and the regenerated sample project move to v1. The legacy modules and the
temporary collision re-exports are deleted only after a search proves zero remaining legacy references,
and home-less concerns (collaboration change schema, capability gating, fingerprinting, unit and
geometry utilities) are relocated first.

## Critical risks

- `formats` is the single largest blast radius (roughly 185 files). The produce/consume contract change
  is a semantic rewrite, not a rename: page-instance synthesis becomes page-definition placement,
  document-embedded fonts move to project-level resources, the flat warning list becomes a captured
  interop registry, and reconcile identity flips to canonical-JSON hashing.
- The host cutover is genuinely quasi-atomic (roughly 150 files) — the editor store type is shared by
  every consumer, so editor, ui, demo, fixtures, and the legacy delete must ship together.
- The resolved-scene compositor does not exist yet and is the linchpin for all v1 rendering.
- The demo sample project must be regenerated as a valid `BroadsetProjectV1` while preserving every
  element id baked into the component-test selectors.
- v1 enforces invariants via both a strict schema and a separate semantic pass, so editor mutations that
  parse can still fail semantic validation; the store must add invariant-preserving logic.

## Verification per slice

Each slice must pass `npm run quality:strict` for its packages and add unit or component tests proving
the new behavior. Slices touching UI regions add the required cross-region Playwright component tests.
The host-cutover slice must pass the full `npm run gate:full` and `npm run ct:all` on v1 fixtures.
