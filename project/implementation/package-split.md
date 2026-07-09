# Package Split Plan

Date: 2026-04-13 11:00
Status: Proposed (planning only; no implementation in this document)
Scope: Monorepo package structure improvements under `packages/*`

---

## 1. Goal

Reduce maintenance pressure from oversized modules while preserving the current public package API for consumers.

Primary drivers from QA analysis:

- Large editor modules (`store-actions.ts`, `editing.ts`, `path-geometry.ts`)
- Large formats converters (`psd.ts`, `pptx.ts`, `pdf.ts`, `web-vector.ts`)
- Large UI modules (`property-panels.tsx`, `timeline.tsx`, `inputs.tsx`, `modals.tsx`)
- Keep current architecture boundary discipline intact

---

## 2. Constraints

This plan must remain consistent with architecture rules in `project/implementation/architecture.md`:

- Existing boundaries are strict and must remain strict after split
- Public API entry points remain package-root barrel exports
- `demo` remains integration host
- No behavior change is introduced by package movement alone

Also:

- Greenfield rule applies: prefer clean structure over compatibility shims for internal code
- External consumer ergonomics should remain stable (`@broadset/editor`, `@broadset/formats`, `@broadset/ui`)

---

## 3. Proposed Splits

### 3.1 Formats Domain Split (recommended)

Create specialized format packages and keep `@broadset/formats` as a facade package.

Target packages:

- `@broadset/formats-core`
- `@broadset/formats-pdf`
- `@broadset/formats-pptx`
- `@broadset/formats-psd`
- `@broadset/formats-raster`
- `@broadset/formats-web-vector`
- `@broadset/formats` (facade; re-exports public API)

Responsibility mapping:

- `formats-core`: shared helpers, common types, shared utility contracts, filename/data helpers used by multiple format packages
- `formats-pdf`: PDF-only export implementation
- `formats-pptx`: PPTX import/export implementation
- `formats-psd`: PSD import/export implementation
- `formats-raster`: PNG/JPEG/WebM/SVG-embedded export implementation
- `formats-web-vector`: SVG/HTML standalone import/export
- `formats` facade: stable aggregate surface and compatibility entry point

Expected benefits:

- Smaller package compile/test surfaces
- Clear dependency ownership per converter
- Lower review scope for format-specific changes

### 3.2 Editor Runtime Split (recommended)

Split editor runtime into store/state and interaction layers, keep `@broadset/editor` as facade.

Target packages:

- `@broadset/editor-store`
- `@broadset/editor-interaction`
- `@broadset/editor` (facade; re-exports stable API)

Responsibility mapping:

- `editor-store`: Zustand state, history, snapshots, collaboration diff/apply, data store, template groups
- `editor-interaction`: canvas interaction logic, transforms, keyboard orchestration, path/clip-path editing logic, timeline-playback orchestration adapters
- `editor` facade: stable aggregate surface and compatibility entry point

Expected benefits:

- Better cohesion around state vs interaction concerns
- Reduced churn coupling in core editor package
- Easier targeted testing ownership

### 3.3 UI Tokens Extraction (optional, phase later)

Optional split if token/theme utilities need reuse beyond `@broadset/ui`.

Target package:

- `@broadset/ui-tokens`

Responsibility mapping:

- `ui-tokens`: tokens, `sp/color/font` helpers, shared style primitives
- `ui`: components and panel composition

Expected benefits:

- Separate release cadence for design primitives
- Cleaner dependency for non-panel consumers (if needed)

This split is lower priority than formats/editor.

---

## 4. What Should Not Be Split Now

Keep these as-is for now:

- `@broadset/model`
- `@broadset/playback`
- `@broadset/renderer`
- `@broadset/demo`

Rationale:

- Existing boundaries are already clean
- Current issues are mostly inside large modules, not necessarily package topology for these domains
- `demo` should remain the integration host and CT surface

---

## 5. Target Dependency Graph (Conceptual)

Current top-level graph remains valid at facade level:

- `model`
- `playback -> model`
- `renderer -> model, playback`
- `editor -> model, playback, renderer`
- `formats -> model, playback`
- `ui -> peer integration with editor, formats, model, renderer`
- `demo -> all`

Internal split graph (conceptual):

- `formats-core -> model, playback`
- `formats-pdf|pptx|psd|raster|web-vector -> formats-core, model, playback`
- `formats facade -> formats-*`
- `editor-store -> model, playback, renderer`
- `editor-interaction -> editor-store, model, playback, renderer`
- `editor facade -> editor-store, editor-interaction`
- optional `ui-tokens -> (no workspace deps)`
- `ui -> ui-tokens (if created), peer deps as today`

Note: Architecture docs must be updated when these packages are introduced.

---

## 6. Migration Strategy

### Phase A - Prep and API Freeze

- Catalog all current public exports from `@broadset/formats` and `@broadset/editor`
- Define explicit compatibility contract for facade packages
- Add package split tracking checklist in implementation docs

Exit criteria:

- Public API inventory complete
- No unresolved ambiguity on moved modules

### Phase B - Formats Split

- Create `formats-core` and move shared utilities first
- Introduce `formats-pdf`, `formats-pptx`, `formats-psd`, `formats-raster`, `formats-web-vector`
- Keep `@broadset/formats` facade with unchanged exports
- Move tests alongside each new package

Exit criteria:

- Existing imports from `@broadset/formats` continue to work unchanged
- All format package quality gates pass
- Root quality/build/ct pass

### Phase C - Editor Split

- Create `editor-store` and move store/collaboration/data-store modules
- Create `editor-interaction` and move transforms/keyboard/editing/canvas modules
- Keep `@broadset/editor` facade with unchanged exports
- Re-home tests by ownership domain

Exit criteria:

- Existing imports from `@broadset/editor` continue to work unchanged
- No behavior regressions in demo interaction flows
- Root quality/build/ct pass

### Phase D - Optional UI Tokens Split

- Extract token helpers into `ui-tokens`
- Keep `@broadset/ui` API stable
- Migrate imports internally

Exit criteria:

- UI behavior unchanged
- Root quality/build/ct pass

### Phase E - Cleanup and Hardening

- Remove dead/duplicate utility copies created during migration
- Update architecture docs and implementation plan index
- Update package READMEs and dependency tables

Exit criteria:

- Architecture docs represent final package graph
- No stale references to pre-split paths

---

## 7. Risk Register

1. API drift risk (facade breaks)

- Mitigation: export inventory + facade tests + contract snapshots

2. Boundary rule regressions

- Mitigation: enforce package-level lint/import boundary checks per new package

3. Test fragmentation risk

- Mitigation: define ownership map before moving tests; keep CT in demo unless explicitly moved

4. Migration churn and merge conflicts

- Mitigation: staged split per domain; avoid mixing feature work with split commits

5. Build script drift

- Mitigation: root workspace scripts verified after each phase

---

## 8. Acceptance Criteria

This plan is complete when all are true:

- `@broadset/formats` and `@broadset/editor` remain stable facade imports
- New internal packages are introduced with clear ownership and boundaries
- Architecture documentation is updated to reflect the new graph
- Root validation chain passes: `npm run quality:all && npm run build && npm run ct`
- No behavior regressions are introduced solely by package movement

---

## 9. Recommended Execution Order

1. Formats split (highest payoff, clear domain boundaries)
2. Editor split (second highest payoff, moderate coupling complexity)
3. Optional UI tokens split (only if reuse pressure remains high)

---

## 10. Out of Scope

- Any feature implementation or bug fix
- Any spec behavior changes
- Any runtime behavior redesign
- Any migration of external file formats or schema semantics

This document only plans package topology changes within the existing repository.
