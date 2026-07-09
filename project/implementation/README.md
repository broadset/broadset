# Implementation Definitions

This folder contains the **implementation-facing definitions** that support the Spec requirements.
These files describe **how the project is structured**, not the behavioral source of truth.

## Files

- `architecture.md` — package graph, dependencies, toolchain, repo layout
- `project.md` — historical implementation context; `architecture.md` is the current toolchain/package baseline
- `plan.md` — master execution order and roadmap summary
- `renderer-refactor-plan.md` — historical detailed Phase 3 renderer plan
- `plan-progress.md` — per-task execution board with **release / functional / scaffold / open / deferred** tiers (reconciled against code)
- `main-integration-plan.md` — PR #2 (`initial-dev-phase` → `main`) baseline merge strategy and post-merge PR queue
- `production-readiness-status.md` — consolidated current release-readiness blockers, status, and closeout bar
- `cross-region-ct-inventory.md` — current cross-region CT coverage inventory and open work queue
- `real-producer-compatibility.md` — current real-producer fixture/signoff matrix

## Tracking split

- `production-readiness-status.md` owns release-readiness status and active release blockers
- `plan-progress.md` owns task-by-task execution tracking
- `cross-region-ct-inventory.md` owns cross-region CT gap accounting
- `real-producer-compatibility.md` owns producer compatibility signoff
- `plan.md` owns execution order and roadmap summary only

Older phase/support plans in this directory are retained for implementation
context and acceptance detail. When their header status or checkboxes disagree
with the live trackers above, the live trackers win.

## Scope boundary

- Put **behavioral product requirements** in `../spec/`.
- Put **implementation definitions, build structure, and technical constraints** here.
- Put **root-level workflow and meta guidance** in `../../README.md` and `../../AGENTS.md`.
