# Broadset V1 Production Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair every Critical/High finding from the PR #7-#32 campaign review, restore deleted behavioral evidence, and finish with fresh full-repository and component-test gates on stacked repair PRs.

**Architecture:** Land one dependency-ordered stacked PR per repair slice: model foundation, playback/renderer, formats/security, host/editor, and final cleanup. Each behavior begins with a focused failing test, changes only its owning package, passes an independent task review, and leaves the stack green before the next branch is created.

**Tech Stack:** TypeScript 6, Zod 4, Vitest 4, Zustand, React 19, HeroUI 3, Playwright CT, pdf-lib/pdfjs-dist, ag-psd, JSZip.

## Maintainer scope amendment — 2026-07-15

All non-native import/export work is deferred to a later campaign. SVG, PDF, PSD, PPTX, video, and every other external interchange path are out of production scope; their existing package implementations remain available but are not exposed by the native application and are not release blockers. The already-completed importer trust-boundary hardening remains part of this stack. Continue with the v1 editor/runtime, `.bsp` package persistence, optional `.broadset.json` recovery input, native host behavior, cleanup, release verification, push, and the final PR.

## Global Constraints

- `project/spec/**` is behavioral authority; spec changes are additive only.
- No `any`, unsafe `as`, `@ts-ignore`, `@ts-expect-error`, or lint suppression.
- Every function has an explicit return type; every interface/type property is readonly.
- Functions use at most three positional parameters; use options objects beyond that.
- External-input regexes must be linear-time and public importer/exporter APIs fail soft.
- Model name collisions are referenced through `projectFormatV1.*` until no collision remains.
- Package boundaries and public root barrels remain exact.
- Files stay below the 500 non-empty-line soft limit or are split by responsibility.
- No Broadset-owned legacy compatibility path is introduced.
- Every production change follows RED -> GREEN -> REFACTOR and receives an independent review.
- Stage explicit intended paths only; never stage `.codex/` or use `git add -A` / `git add .`.
- Before each commit run formatting and touched-package typecheck/tests; before every push run `npm run gate:full`.

## Closed ambiguity decisions

- Canonical model discriminants and fields are structural truth when older playback prose uses retired field names; counting maps `rounding`, `minimumDigits`, and `grouping` directly.
- `step.position: 'start'` jumps at the segment start; `'end'` holds the source until the segment end.
- Loop endpoint `once` emits a shared boundary once; `duplicate` exposes it at both adjacent iteration boundaries. Finite trailing gaps do not extend completion.
- Sequence clip stagger uses the canonical precompiled `index`, `intervalTicks`, `jitterTicks`, and `seed`; direction is represented by index ordering rather than a second runtime direction field.
- Spatial-path sampling returns its typed point and runtime-only tangent orientation provenance; it never persists an extra canonical property.
- Canonical video `controls` remains preserved data, but the broadcast renderer never exposes native browser controls.

---

### Task 1: Preserve project source bytes at the load boundary

**Files:**

- Modify: `packages/model/src/v1/load.ts`
- Modify: `packages/model/src/v1/load.test.ts`
- Modify: `packages/model/src/v1/public-api.test.ts`
- Modify: `packages/model/src/v1/public-api-inventory.test-support.ts`
- Modify: `packages/model/src/v1/index.ts`
- Modify: `packages/model/README.md`
- Modify: `packages/demo/src/v1-project-persistence.ts`
- Modify: `packages/demo/src/v1-project-persistence.test.ts`
- Modify: `packages/demo/src/demo-app/v1-project-file-controls.tsx`
- Modify: `packages/demo/src/demo-app/v1-project-file-controls.test.tsx`

**Interfaces:**

- `ProjectSourceV1 = string | Uint8Array`
- `loadProjectV1Json(source: ProjectSourceV1, options?: ProjectLoadOptions): Promise<ProjectLoadResult>`
- Quarantined `ProjectLoadResult` contains `originalBytes: Uint8Array` and optional `lastValidProject`; it does not substitute a default project.

- [ ] Add a test passing distinct invalid UTF-8 byte sequences and assert each quarantine preserves its exact bytes and reports `invalid-utf8`.
- [ ] Run `npm.cmd exec -w @broadset/model -- vitest run src/v1/load.test.ts` and verify the new test fails because the API accepts only text / returns `originalText`.
- [ ] Add a bounded byte-to-text decoder using `TextDecoder('utf-8', { fatal: true })`; encode string inputs once with `TextEncoder`; apply the byte cap before decoding and the JSON complexity caps after decoding.
- [ ] Update existing quarantine assertions and public inventory for the byte-preserving result.
- [ ] Route browser file loads through `File.arrayBuffer()` and retain quarantined bytes in demo recovery state; decode a separate display-only string only where UI copy requires it.
- [ ] Run the focused model/demo tests, model and demo typechecks, strict lints, and both package suites.
- [ ] Commit the explicit model/demo paths with `fix(model): preserve quarantined project bytes`.

### Task 2: Define immutable resolved-scene data and resolve canonical layers

**Files:**

- Split/modify: `packages/model/src/v1/resolved-scene.ts`
- Create: `packages/model/src/v1/resolved-scene-types.ts`
- Create: `packages/model/src/v1/resolved-overrides.ts`
- Modify: `packages/model/src/v1/resolved-scene.test.ts`
- Create: `packages/model/src/v1/resolved-geometry.ts`
- Modify: `packages/model/src/v1/index.ts`
- Modify: model public API inventory tests

**Interfaces:**

- `ResolvedSceneAddressV1` carries `rootInstanceId`, `componentInstancePath`, and `elementId`.
- `ResolvedSceneNodeV1` carries address, parent address, source element, resolved element, local geometry, world transform, visibility, provenance, selected variable modes, selected sample datasets, resolved resources, and fallback records.
- `ResolvedSceneSnapshotV1` carries project/document/page identity, exact tick, surface/color, ordered nodes, diagnostics, selected data, fallbacks, and immutable resource context.
- Model owns only DOM-free data types, canonical topology, override application, and matrix composition. The final `resolveSceneSnapshotV1` orchestrator belongs to playback so model never imports or duplicates playback evaluation.

- [ ] Add failing tests for two roots of one definition with distinct transforms/overrides, descendant override paths, component exposed-property values, root z-order, composed world transforms, composite parent addresses, ownership/deep-freeze, and invalid-project refusal.
- [ ] Run `npm.cmd exec -w @broadset/model -- vitest run src/v1/resolved-scene.test.ts` and verify failures show raw topology-only values.
- [ ] Implement typed pointer application for schema-approved override targets without mutation or unsafe casts.
- [ ] Compose affine/matrix3d transforms and root surface-relative transforms into local/world geometry.
- [ ] Resolve definition/component/page layers, selected modes/datasets, resources, visibility, and explicit fallbacks into ordered nodes; leave binding/state/sequence/lifecycle contributions to playback.
- [ ] Keep `resolvePageInstanceTree` only as a private helper or remove it from the public inventory once all consumers use snapshots.
- [ ] Run model strict quality and semantic/property tests.
- [ ] Commit explicit model paths with `feat(model): resolve complete v1 scene snapshots`.
- [ ] Run independent task review; resolve every Critical/Important finding before branching.

### Task 3: Make playback an exact pure function of canonical data and tick

**Files:**

- Modify/split: `packages/playback/src/v1/sequence-sampler.ts`
- Modify/split: `packages/playback/src/v1/state-machine.ts`
- Modify: `packages/playback/src/v1/resolved-properties.ts`
- Modify: `packages/playback/src/v1/expression-eval.ts`
- Modify: `packages/playback/src/v1/typed-value-ops.ts`
- Modify: `packages/playback/src/v1/formatter-pipeline.ts`
- Create: `packages/playback/src/v1/scene-resolver.ts`
- Create: `packages/playback/src/v1/scene-resolver.test.ts`
- Modify corresponding tests and `packages/playback/src/index.ts`

**Interfaces:**

- `sampleSequenceV1` returns no contribution before the first keyframe and samples repeat/ping-pong/count/gap, child clips, and stagger at an exact integer tick.
- `evaluateStateMachineAtTickV1({ machine, events, tick, context })` derives state from the ordered event log and tick without prior mutable state.
- `resolvePropertyMapV1` sorts by closed precedence `binding < state < sequence` and preserves full overridden provenance, including track/keyframe segment and binding fallback.
- `resolveSceneSnapshotV1(options: ResolveSceneSnapshotOptionsV1): ResolvedSceneResultV1` composes the model-owned canonical layers with runtime field values, bindings, state, lifecycle, and sequences; invalid project/runtime input returns only `{ status: 'invalid'; diagnostics }`.

- [ ] Add failing tests for pre-first-keyframe absence, finite/infinite repeat, odd ping-pong reversal, gaps, child clips/stagger, every interpolation kind/color space, direct/backward seek, overshoot, shuffled contribution input, safe-function signatures, and grapheme truncation.
- [ ] Run focused playback tests and record expected failures.
- [ ] Implement exact tick mapping and closed interpolation dispatch; unsupported or invalid closed values return typed diagnostics instead of silent approximation.
- [ ] Implement event-log state derivation and precedence sorting with complete provenance.
- [ ] Implement `round(value, precision?)`, `format-date(value, pattern, locale, timeZone)`, null-preserving `coalesce`, mixed numeric operations, and `Intl.Segmenter` grapheme truncation with deterministic fallback.
- [ ] Implement the playback-owned snapshot orchestrator and prove direct seek equals sequential evaluation at the same tick.
- [ ] Run playback strict quality and commit `fix(playback): make v1 evaluation deterministic`.
- [ ] Run independent task review and resolve all Critical/Important findings.

### Task 4: Render resolved scenes faithfully and incrementally

**Files:**

- Modify/split: `packages/renderer/src/v1/scene-dom.ts`
- Modify: `packages/renderer/src/v1/transform-css.ts`
- Modify: `packages/renderer/src/v1/element-dom.ts`
- Modify: `packages/renderer/src/v1/appearance-css.ts`
- Modify: `packages/renderer/src/v1/gradient-css.ts`
- Modify: `packages/renderer/src/v1/text-css.ts`
- Add/modify corresponding renderer tests and public barrel

**Interfaces:**

- Renderer accepts only validated `ResolvedSceneSnapshotV1` plus render context.
- DOM identity uses page-aware instance addresses, while `data-element-id`, `data-element-content`, `data-opacity-target`, and `data-visibility` remain renderer-owned contracts.
- Reconciliation updates only affected nodes; full rebuild is initial mount/page replacement only.

- [ ] Add failing tests for mm/in conversion at DPI, repeated instance identity, stable node reuse, single-subtree update, required data attributes, every closed element kind, missing/failed image fallback, absolute line spacing, layered opacity/blend/effects, and full gradient geometry.
- [ ] Verify focused failures, then implement unit conversion and snapshot-only rendering.
- [ ] Add keyed DOM reconciliation and semantic renderers/fallbacks without executable imported content.
- [ ] Run renderer strict quality and commit `fix(renderer): render resolved v1 scenes faithfully`.
- [ ] Run independent code and security reviews.

### Task 5: Restore cross-format identity, fidelity, and trust-boundary safety

**Files:**

- Create: `packages/formats/src/v1/fingerprint.ts`, `reconcile.ts`, `xmp.ts`, `export-result.ts`
- Modify SVG/PDF/PSD/PPTX v1 import/export/serialization/metadata files and tests
- Modify `packages/formats/src/v1/index.ts` and package root barrel

**Interfaces:**

- `fingerprintEntityV1` hashes the defined visible/semantic projection and excludes identity-only fields.
- `reconcileImportedEntitiesV1` returns modifications, additions, deletions, recovered-by-hash, and deletion confirmation requirements.
- Every export returns a discriminated typed result; byte helpers return bytes only for `status: 'exported'` and never convert failure fallbacks into success.
- Round-trippable files carry shared Broadset XMP plus format-native per-element identity tags.

- [ ] Add RED tests proving different IDs produce equal recovery fingerprints, untouched PPTX produces no diff, external deletion is reported, stripped tags recover by hash, each carrier survives export/import, and missing selections return typed failures with no downloadable bytes.
- [ ] Add security RED tests for PDF worker isolation, PSD pre-decode header caps, SVG oversize non-retention, PPTX blob digest verification, depth limits, and surfaced sanitizer warnings.
- [ ] Implement shared v1 fingerprint/reconcile/XMP modules and format carriers in SVG, PDF `/BSET`, PSD `BsPs`, and PPTX metadata/tags.
- [ ] Move limits ahead of allocation/decompression and verify every recovered blob digest/length.
- [ ] Restore committed/licensed-fixture-compatible corpus tests without network-only skips for required release evidence.
- [ ] Run formats strict quality, PDF/A and PPTX validation, independent code/security reviews, then commit logical per-format changes.

### Task 6: Restore editor and host production behavior on v1

**Files:**

- Modify editor project store/actions/selectors/tests
- Modify demo persistence/file controls/canvas/sequence components
- Restore v1-native command, clipboard, snapshot, required-element, timeline, renderer, and cross-region CT evidence required by active specs
- Update HeroUI host components and tests without raw chrome controls

**Interfaces:**

- `setProject` accepts only structurally and semantically valid v1 projects, resets every runtime editing mode and history, and preserves verified package blobs.
- Selection and page mutations use stable instance addresses, not bare element IDs.
- `.bsp` uses the checksummed ZIP package API; `.broadset.json` uses canonical JSON.
- The production host exposes only `.bsp`/`.broadset.json` project persistence; external import/export controls are absent.

- [ ] Add RED store tests for invalid replacement rejection, complete runtime reset, required-element deletion/promotion, repeated-root selection/visibility, and root-instance reorder.
- [ ] Add RED persistence tests for package manifest/digest/blob round trip and raw JSON extension identity.
- [ ] Add RED CT for canvas/panel real-time transform sync, repeated-root addressing, layer z-order, playback/seek, clipboard/grouping, snapshots, keyboard, and toast outcomes derived from active specs.
- [ ] Implement invariant-safe store commands and stable instance addressing before React integration.
- [ ] Remove external import/export controls, implement package persistence, HeroUI feedback, and deterministic file-control synchronization.
- [ ] Run editor/demo/ui strict quality and focused CT, then commit logical store, persistence, playback, and coverage units with independent review.

### Task 7: Final cleanup and release evidence

**Files:**

- Remove stale legacy API names/product messages/spec test claims only after replacement evidence exists
- Update authoritative specs additively and release evidence under `project/implementation/`
- Update public API inventories and program state only with real PR/evidence links

- [ ] Search for legacy modules, deleted API names, unversioned model aliases, stale test references, suppressions, skipped tests, and package-internal imports; resolve every real finding.
- [ ] Run `npm.cmd run audit:prod` and `npm.cmd run audit:all`; document only genuine externally owned residual risk.
- [ ] Run fresh `npm.cmd run gate:full`, `npm.cmd run ct:all`, and the production build; external-format compatibility gates are deferred.
- [ ] Run independent full-branch code review plus security review; fix and re-review every Critical/Important issue.
- [ ] Push each stacked repair branch, create its PR, verify declared diff scope, wait for fresh GitHub checks, and record rollback commands.
- [ ] Confirm `.codex/` and `.superpowers/` scratch files are not staged; finish with a clean intended worktree.
