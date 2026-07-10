# W0-RFC-01 Contradictory Contract Resolution Plan

> **For agentic workers:** `project/spec/**` remains authoritative. These ADR drafts are proposals only; do not rewrite behavior or implement a proposal without explicit maintainer ratification and a policy-compliant spec change.

**Goal:** Resolve the timing, component, persistence/file, page-scene, collaboration, export-preflight, and authoring-field sequencing contradictions found by the roadmap audit.

**Architecture:** Focused ADR drafts record alternatives, proposed decisions, and consequences. Authoritative specs remain unchanged until an authorized maintainer ratifies a proposal and owns any behavioral spec update; the tracker remains proposed until that governance gate, code, and evidence land.

**Tech stack:** Markdown ADRs and behavioral specifications.

**Execution status:** contradiction audit and proposal drafting completed 2026-07-09. W0-RFC-01 remains `proposed`; maintainer ratification and any resulting behavioral spec reconciliation are pending.

## Global Constraints

- Broadset-owned formats are greenfield.
- External compatibility and user data preservation remain mandatory.
- Invalid persisted data is quarantined, never silently rewritten.
- This task records proposed resolutions; it does not change authoritative behavior or claim runtime implementation.

### Task 1: Write focused ADRs

**Files:**

- Create: `project/implementation/decisions/ADR-003-006-time-duration.md`
- Create: `project/implementation/decisions/ADR-007-components.md`
- Create: `project/implementation/decisions/ADR-008-bsp-persistence.md`
- Create: `project/implementation/decisions/ADR-010-resolved-scene-pages.md`
- Create: `project/implementation/decisions/ADR-011-collaboration-changes.md`
- Create: `project/implementation/decisions/ADR-IO-014-016-preflight-loss.md`
- Modify: `project/implementation/decisions.md`
- Modify: `project/implementation/roadmap/rfc-register.md` (RFC register, moved from plan.md §6)

- [x] Record context, proposed decision, invariants, alternatives, consequences, migration stance, and verification for every ADR draft.
- [x] Link audited RFC rows to proposal artifacts without claiming ratification or runtime completeness.
- [ ] Obtain explicit maintainer ratification, rejection, or revision for every ADR draft.

### Task 2: Maintainer-led authoritative spec reconciliation

**Files:**

- Modify: timeline/playback/animation/output and raster specs.
- Create: `project/spec/model/components.md`
- Create: `project/spec/model/timebase.md`
- Create: `project/spec/renderer/resolved-scene.md`
- Modify: model config/element/spec/format-reference/project/assets/changes specs.
- Modify: editor collaboration spec and relevant format specs.

- [ ] After ratification, update only the maintainer-approved behavioral contracts; agent-authored refinements remain additive-only.
- [ ] Add or update acceptance criteria and migration notes for each ratified contract without weakening unrelated requirements.
- [ ] Run `npm run docs:check`, affected spec-derived tests, and Prettier.
