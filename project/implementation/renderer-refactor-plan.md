# Renderer Refactor Plan

Date: 2026-04-22
Status: draft - extracted from [io-prereqs-plan.md](./io-prereqs-plan.md) Phase 3 and expanded into a dedicated renderer workstream

This plan turns `@broadset/renderer` from a Broadset-centric preview DOM into a reusable HTML motion-graphics renderer with a thin Broadset adapter.

It stays inside the current package boundary defined in [architecture.md](./architecture.md): no new workspace package is introduced unless the architecture doc is changed first. The refactor is internal to `packages/renderer` and keeps the existing package root import surface stable while the internals are re-layered.

## Why this plan exists

The renderer package is locally healthy but structurally underspecified for the work queued behind it.

- `npm run quality -w @broadset/renderer` is green today, so this is not a rescue plan for a broken package.
- The package is concentrated in two oversized implementation files: [base-render.ts](../../packages/renderer/src/screen-renderer/base-render.ts) and [element-renderers.ts](../../packages/renderer/src/screen-renderer/element-renderers.ts).
- The public runtime is tightly coupled to `BroadsetDocument`, Broadset-specific `data-*` contracts, and editor-preview affordances such as the overlay root and custom element registration.
- DOM updates are not truly incremental: the current implementation rebuilds the scene fragment and replaces the whole element layer on document updates.
- Several renderer-spec requirements are either unimplemented or fused into Broadset-specific assumptions, which blocks reuse as a generic HTML motion-graphics renderer.

This plan gives the renderer its own execution path instead of leaving "renderer refactor" as a one-line dependency inside cross-format plans.

## Current state

Current implementation facts, verified against the package on 2026-04-22:

- Core control flow is concentrated in [base-render.ts](../../packages/renderer/src/screen-renderer/base-render.ts), which owns scene traversal, DOM host creation, layout styling, canvas scaling, preview background policy, overlay-root creation, and the compatibility custom element.
- Per-type rendering plus several unrelated helpers are concentrated in [element-renderers.ts](../../packages/renderer/src/screen-renderer/element-renderers.ts), including text flattening, boolean path composition, QR generation, image fallback behavior, and media placeholders.
- Incremental update behavior is callback-incremental but not DOM-incremental: [base-render.ts](../../packages/renderer/src/screen-renderer/base-render.ts) still uses whole-layer replacement and `JSON.stringify` equivalence checks.
- The API surface exported from [index.ts](../../packages/renderer/src/index.ts) mixes true renderer primitives with Broadset-specific helpers such as capabilities metadata and screen-renderer compatibility utilities.
- Broadset-specific preview behavior, such as the checkerboard background, is implemented in the renderer core instead of a host policy or adapter.
- The SVG sanitization path in [svg-sanitize.ts](../../packages/renderer/src/screen-renderer/svg-sanitize.ts) is the cleanest reusable part of the package and should be preserved as a first-class security boundary.

## Objectives

1. Keep `@broadset/renderer` compatible for current Broadset consumers while re-layering the internals.
2. Introduce a generic renderer core that can render a normalized scene graph without depending on `BroadsetDocument`.
3. Replace whole-layer DOM replacement with keyed reconciliation and explicit dirty-node updates.
4. Separate semantic DOM rendering from Broadset-specific playback/editor instrumentation.
5. Support runtime-driven motion concerns explicitly: time, data substitution, state, font loading, asset resolution, and visibility policy.
6. Close current spec drift by either implementing missing behavior or narrowing Broadset-specific behavior into the adapter layer.

## Non-goals

- No new workspace package unless [architecture.md](./architecture.md) is updated first.
- No rewrite of `@broadset/playback`; playback integration remains a consumer of renderer-owned contracts.
- No attempt to build a canvas/WebGL renderer in this plan. The target remains DOM/SVG/HTML output.
- No broad redesign of the Broadset document model. This plan adapts the renderer to the existing and planned model shape from [io-prereqs-plan.md](./io-prereqs-plan.md).
- No speculative plugin marketplace API. The goal is a clean internal architecture plus a stable package root API.

## Design principles

### Semantic DOM first

Renderers produce the most semantic DOM the platform can support. Character-level animation wrappers, Broadset playback markers, and editor-only hooks are layered on top as optional decorators.

### Adapter owns Broadset policy

Broadset-specific concerns - `data-*` contracts, preview backgrounds, overlay-root semantics, custom-element registration, document-to-scene mapping, and capability metadata - live in an adapter layer, not in the generic core.

### Scene graph over document schema

The renderer core consumes a normalized scene graph and runtime services. `BroadsetDocument` is one producer of that scene graph, not the renderer's native domain model.

### Incremental by identity

DOM stability is driven by stable node identity and explicit dirty classification, not by full serialization equality or fragment replacement.

### Safe DOM construction

Untrusted markup never reaches `innerHTML`. SVG and rich-text markup are parsed, sanitized, and materialized as DOM nodes via safe builders.

## Target architecture

The target shape stays under `packages/renderer/src/` and keeps a single package barrel.

```text
packages/renderer/src/
  index.ts
  core/
    scene/
    runtime/
    reconciler/
    contracts/
  dom/
    controller/
    layout/
    tree/
    decorators/
  elements/
    text/
    image/
    video/
    svg/
    path/
    group/
    qrcode/
    clock/
    ticker/
  adapters/
    broadset/
      document-to-scene.ts
      data-attributes.ts
      capabilities.ts
      preview-host.ts
      custom-element.ts
      create-screen-renderer.ts
```

### Core layer

Responsibilities:

- define normalized scene-node types
- define runtime-service interfaces (`time`, `data`, `state`, `fonts`, `assets`)
- define the keyed reconciliation contract
- expose renderer lifecycle operations independent of Broadset

Must not own:

- Broadset document parsing
- Broadset-specific `data-*` attributes
- editor overlay-root policy
- preview checkerboard policy

### DOM layer

Responsibilities:

- host node creation and retention
- keyed parent/child reconciliation
- layout/style application from normalized node data
- per-type DOM renderers
- optional decorators for animation targets, testing hooks, or editor instrumentation

### Broadset adapter layer

Responsibilities:

- map `BroadsetDocument` plus runtime settings into the normalized scene graph
- attach Broadset-owned `data-*` attributes
- expose `createScreenRenderer` and the existing compatibility custom element
- host the overlay root and any Broadset preview-only shell concerns

## Target public API

The package should end up with two intentionally different entry surfaces:

### Generic renderer surface

Conceptually:

```ts
createHtmlMotionRenderer({
  host,
  scene,
  registry,
  runtime,
  settings,
})
```

Where:

- `scene` is a normalized render tree, not a Broadset document
- `registry` maps node kinds to semantic renderers
- `runtime` provides time, data, state, asset, and font services
- `settings` controls host policy such as scaling, transparency, and optional decorations

### Broadset compatibility surface

Keep and progressively reimplement:

- `createScreenRenderer`
- `BroadsetScreenRendererElement`
- `defineBroadsetScreenRenderer`
- `buildElementTransform`

These become wrappers or adapter exports over the generic core rather than the core itself.

## Work phases

### Phase 0 - Scope and contract cleanup

Purpose: separate generic-renderer contracts from Broadset-specific contracts before code movement starts.

- Decide which current exported symbols remain package-root public API and which become Broadset-adapter exports.
- Update [project/spec/renderer/spec.md](../spec/renderer/spec.md) to clearly mark generic renderer behavior vs Broadset adapter behavior.
- Resolve contract drift around undeclared attributes such as `data-gradient`: either promote them into the spec registry or move them behind adapter-owned hooks.
- Clarify group semantics: plain group containers vs boolean/composite behavior.
- Write down DOM-stability expectations for incremental updates so later tests assert the right thing.

Validation:

- docs-only change set
- no behavior change yet

### Phase 1 - Internal layer split with compatibility wrappers

Purpose: create the new internal seams without changing runtime behavior yet.

- Split [base-render.ts](../../packages/renderer/src/screen-renderer/base-render.ts) into focused modules for controller, host policy, layout application, and compatibility wrappers.
- Split [element-renderers.ts](../../packages/renderer/src/screen-renderer/element-renderers.ts) into per-type modules plus focused utilities.
- Introduce internal normalized scene-node and runtime-service types.
- Move Broadset-specific capability resolution from [capabilities.ts](../../packages/renderer/src/capabilities.ts) into `adapters/broadset/`.
- Move custom-element registration and preview-host concerns into `adapters/broadset/`.
- Keep `createScreenRenderer` working by routing it through the new adapter layer.

Acceptance criteria:

- package root imports used by the demo still compile unchanged
- file responsibilities are separated enough that no implementation file needs to own controller, layout, host shell, and Broadset compatibility at once

Validation:

- `npm run quality -w @broadset/renderer`
- `npm run quality -w @broadset/demo`

### Phase 2 - Keyed reconciler and dirty-node updates

Purpose: make updates truly incremental at the DOM level.

- Replace whole-layer `replaceChildren()` updates with keyed reconciliation.
- Replace `JSON.stringify` equivalence with explicit dirty classification.
- Track node identity, parent changes, sibling order changes, subtree invalidation, and type remounts separately.
- Ensure composite nodes can express child dependencies explicitly instead of closing over a stale document snapshot.
- Add tests that assert stable DOM identity for unaffected nodes.

Acceptance criteria:

- single-node updates mutate only the affected subtree
- adding a node does not remount unaffected siblings
- child changes correctly invalidate dependent composite nodes

Validation:

- `npm run quality -w @broadset/renderer`
- `npm run quality -w @broadset/demo`
- focused CT where preview-shell behavior is affected: `npm run ct -w @broadset/demo`

### Phase 3 - Semantic renderers and safe builders

Purpose: separate semantic rendering from instrumentation and remove unsafe markup paths.

- Replace string-to-`innerHTML` SVG mounting with an AST-to-DOM path using the sanitized SVG boundary.
- Rework text rendering so sanitized rich text can remain semantic DOM, with optional character-splitting as a decorator for animation/instrumentation use cases.
- Split boolean path composition out of generic group/container rendering.
- Move image/video placeholder policy into focused media renderers.
- Keep QR generation, path trimming, and shape composition in dedicated modules with narrow APIs.

Acceptance criteria:

- no untrusted markup reaches `innerHTML`
- text renderer can preserve allowed formatting tags when configured for semantic mode
- group rendering and boolean compositing are no longer the same responsibility

Validation:

- `npm run quality -w @broadset/renderer`
- add or update unit tests for semantic text, SVG sanitization, and composite-node invalidation

### Phase 4 - Runtime services for motion graphics

Purpose: give the generic renderer the inputs a motion-graphics engine actually needs.

- Add runtime-service interfaces for `time`, `data`, `state`, `fonts`, and `assets`.
- Implement visibility and named-state handling as runtime concerns rather than hard-coded Broadset defaults.
- Implement dynamic token substitution through runtime data services instead of document-only assumptions.
- Add idempotent font-face loading via a font service.
- Rework video, clock, and ticker renderers around time-driven updates rather than static text placeholders.

Acceptance criteria:

- runtime data can drive substitution without rebuilding the scene definition
- state and visibility changes can be applied without document replacement
- font loading happens once per resolved font resource
- clock and ticker are driven by runtime time, not only static content strings

Validation:

- `npm run quality -w @broadset/renderer`
- targeted runtime-behavior tests in Vitest

### Phase 5 - Broadset adapter migration

Purpose: move Broadset-specific behavior out of the core while preserving current product behavior.

- Implement `document-to-scene` mapping in the Broadset adapter.
- Re-home renderer-owned `data-*` attributes in adapter decorators.
- Keep `buildElementTransform` shared where it is genuinely generic; move any Broadset-only transform/widget assumptions into the adapter.
- Re-home overlay-root creation in the Broadset host adapter, keeping the same observable behavior for the demo and editor chrome.
- Preserve the existing `createScreenRenderer` API by composing the adapter with the generic core.

Acceptance criteria:

- Broadset demo and playback consumers do not need a flag day migration
- generic renderer core can be instantiated without `BroadsetDocument`
- Broadset-specific contracts are isolated to adapter code paths

Validation:

- `npm run quality -w @broadset/renderer`
- `npm run quality -w @broadset/demo`
- `npm run ct -w @broadset/demo`

### Phase 6 - Spec closure, performance, and release hardening

Purpose: close the loop between the implementation, the spec, and the repo's quality gates.

- Update renderer specs so the implemented behavior matches the documented contract.
- Add DOM-stability and incremental-update tests that assert node identity, not just renderer callback counts.
- Add performance checks for common workloads, at minimum around 100-element scenes and selective updates.
- Review public exports in [index.ts](../../packages/renderer/src/index.ts) and keep only the intended public surface.
- Run a focused second-pass review for security and package-boundary correctness before concluding the refactor.

Acceptance criteria:

- no known renderer-spec drift remains undocumented
- incremental-update tests prove DOM stability for unchanged nodes
- Broadset-specific behavior is documented as adapter behavior, not generic-core behavior

Validation:

- `npm run quality -w @broadset/renderer`
- `npm run quality -w @broadset/demo`
- `npm run ct -w @broadset/demo`
- `npm run gate:full`

## File breakup targets

The refactor should explicitly retire current concentration points.

- Break up [base-render.ts](../../packages/renderer/src/screen-renderer/base-render.ts) into controller, reconciliation, host policy, layout styling, and compatibility wrapper modules.
- Break up [element-renderers.ts](../../packages/renderer/src/screen-renderer/element-renderers.ts) into per-type renderers and separate utilities for boolean paths, trim paths, placeholders, and QR generation.
- Keep [svg-sanitize.ts](../../packages/renderer/src/screen-renderer/svg-sanitize.ts) as a dedicated security boundary and move it under the new SVG renderer area without mixing it into unrelated rendering logic.
- Keep [transforms.ts](../../packages/renderer/src/screen-renderer/transforms.ts) as a narrow reusable utility unless later work proves transform construction belongs in a more general layout module.

## Risks and mitigations

- Broad consumer breakage. Mitigation: keep `createScreenRenderer` and related compatibility exports stable until the adapter layer is fully in place.
- Reconciler regressions in the hottest path. Mitigation: land Phase 2 behind focused DOM-identity tests before broad semantic changes start.
- Text rendering regressions. Mitigation: separate semantic text rendering from character instrumentation and test both modes explicitly.
- Composite/group regressions. Mitigation: isolate boolean/composite behavior from plain grouping before touching more format-facing group logic.
- Scope creep into a new package split. Mitigation: keep this refactor inside `@broadset/renderer` unless [architecture.md](./architecture.md) is updated intentionally.

## Suggested execution order

1. Phase 0
2. Phase 1
3. Phase 2
4. Phase 3
5. Phase 4
6. Phase 5
7. Phase 6

Recommended commit shape:

- small compatibility-preserving extraction commits in Phase 1
- one or two focused reconciler commits in Phase 2
- per-renderer-family commits in Phase 3 and Phase 4
- one adapter migration batch for Broadset consumers in Phase 5
- one closing spec/perf hardening batch in Phase 6

## Relationship to other plans

- [io-prereqs-plan.md](./io-prereqs-plan.md) keeps the cross-format dependency summary. This file is the detailed execution plan behind its Phase 3 renderer refactor item.
- [pdf-support-plan.md](./pdf-support-plan.md), [svg-support-plan.md](./svg-support-plan.md), and [psd-support-plan.md](./psd-support-plan.md) continue to depend on the renderer refactor as an app-level prerequisite.
- [io-prereqs-ui-features-plan.md](./io-prereqs-ui-features-plan.md) remains the source of truth for user-facing editor UI that consumes the renderer's new capabilities.

## Exit condition

This plan is complete when `@broadset/renderer` can be described accurately as:

- a generic DOM-based motion renderer that consumes a normalized scene graph and runtime services
- a Broadset adapter that preserves current preview, playback, and editor integration behavior
- a package whose documented contracts, public exports, and tests all align with that split