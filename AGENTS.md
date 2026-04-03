# Broadset Agent Guide

This file provides the concise, always-on workspace instructions for coding agents working in this repository.
Use it together with the detailed reference docs linked below.

## Sources of truth

- `project/spec/` defines **what** broadset must do.
- `project/implementation/` defines **how** the repository is structured and implemented.
- `project/implementation/architecture.md` defines which packages and external dependencies to use.
- If behavior changes, update the relevant spec file in `project/spec/` first or alongside the implementation.

## Working expectations, quality gates, and spec conventions

See `CONTRIBUTING.md` for working agreements, quality gates, development commands, and spec authoring rules.

## No cutting corners — applies to ALL agents

When a quality gate, lint rule, typecheck, or CI check fails, **always fix the root cause**. Never weaken, suppress, or bypass the check to make it pass. Specifically forbidden:

- Adding CLI flags that silence warnings/errors (e.g. `--no-warn-ignored`, `--quiet`, `--no-verify`)
- Adding suppression comments (`// eslint-disable`, `@ts-ignore`, `@ts-expect-error`)
- Widening ignore patterns, raising warning thresholds, or downgrading rule severity
- Deleting or skipping tests that reveal real bugs

If you believe a rule or config is genuinely wrong, **stop and report it** — do not change it yourself.

## Spec updates — additive only

Agents may update specs in `project/spec/` during implementation, but only as **additive refinements** — never behavioral changes.

**Allowed:** adding acceptance criteria, clarifying ambiguous wording, noting edge cases, adding default values or valid ranges, adding `## Spec Gaps` entries.

**Forbidden:** changing the intended behavior of an existing requirement, removing or weakening criteria, rewriting specs to match a convenient implementation, adding requirements that belong to a different unit or phase.

If you believe a spec is genuinely wrong, **stop and report it** — do not change it yourself.

## References

- `README.md` — project overview
- `CONTRIBUTING.md` — working agreements, quality gates, and spec conventions
- `project/spec/README.md` — documentation map
