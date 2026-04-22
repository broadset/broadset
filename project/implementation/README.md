# Implementation Definitions

This folder contains the **implementation-facing definitions** that support the Spec requirements.
These files describe **how the project is structured**, not the behavioral source of truth.

## Files

- `architecture.md` — package graph, dependencies, toolchain, repo layout
- `project.md` — implementation context and technical constitution
- `plan.md` — execution order and current implementation status
- `renderer-refactor-plan.md` — detailed plan to split a generic renderer core from the Broadset adapter and close renderer-spec drift
- `carry-over-plan-progress.md` — additive-only parity-plus execution board and task tracking for carry-over phases

## Scope boundary

- Put **behavioral product requirements** in `../spec/`.
- Put **implementation definitions, build structure, and technical constraints** here.
- Put **root-level workflow and meta guidance** in `../../README.md` and `../../AGENTS.md`.
