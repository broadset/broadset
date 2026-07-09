# W0-DEF-01 Roadmap and Legacy Documentation Reconciliation Plan

> **For agentic workers:** execute this plan task-by-task. Preserve historical evidence, but never leave historical sequencing executable.

**Goal:** Connect every roadmap initiative and legacy work item to one truthful tracker and remove misleading plan navigation.

**Architecture:** `plan-progress.md` contains a mechanically validated stable-initiative register plus the retained legacy evidence tables. Index, readiness, coverage, and historical UX documents link to current initiative IDs instead of obsolete phase locations.

**Tech stack:** Markdown, the documentation checker from W0-GOV-02.

**Execution status:** documentation-reconciliation scope completed 2026-07-09. W0-DEF-01 remains `proposed` until its full bug/spec-gap/readiness re-audit has a named DRI and release evidence.

## Global Constraints

- Specs own behavioral acceptance criteria.
- The master roadmap owns sequencing.
- The tracker owns status/evidence.
- Proposed initiatives may have an unassigned DRI; ready/active initiatives may not.

### Task 1: Index and tracker lifecycle

**Files:**

- Modify: `project/implementation/README.md`
- Modify: `project/implementation/plan-progress.md`
- Modify: `project/implementation/production-readiness-status.md`
- Modify: `project/implementation/coverage-reporting.md`
- Modify: `project/implementation/coverage-baseline.md`

- [x] Correct W0–W6 and section navigation.
- [x] Add every stable initiative with `proposed` status, unassigned DRI, dependency summary, and evidence destination.
- [x] Preserve legacy release/functional/scaffold/open/deferred evidence as a separate register.
- [x] Replace nonexistent QE-10 with W0-QE-01/W0-PERF-01 coverage-policy routing.
- [x] Repair malformed Markdown tables.

### Task 2: Historical UX routing

**Files:**

- Modify: `project/implementation/io-prereqs-ui-features-plan.md`
- Modify: `project/implementation/properties-panel.md`
- Modify: format specs and format gap notes containing ambiguous phase references.

- [x] Add explicit non-authority/supersession metadata.
- [x] Add a many-to-many mapping from historical feature numbers to current UI IDs and W2/W3 initiatives.
- [x] Replace removed-plan references and obsolete sequencing with current dependencies.
- [x] Label historical phase references as legacy tracker identifiers and add current roadmap destinations.
- [x] Run `npm run docs:check`.
