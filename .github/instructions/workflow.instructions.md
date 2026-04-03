---
description: 'Use when committing code, managing version control, or following development workflow. Covers pre-commit checks, commit message format, and implementation order.'
---

# Workflow & Version Control

## Pre-Commit Requirements

Before every commit, successfully run:

1. `npm run format` (lint fix + prettier)
2. `npm run typecheck` (strict TypeScript compiler)

Code that does not format cleanly or pass the TypeScript compiler must not be committed.

## Commit Frequency

Commit like a professional senior full-stack developer:

- Commit when a logical, testable piece of work is complete — a new utility, a store action, a component, a bug fix, a refactor step.
- Avoid too-small commits (e.g., a single typo fix alongside unrelated work) and too-large commits (e.g., an entire feature in one shot).
- A good commit should be reviewable on its own and tell a clear story in the diff.
- If a feature requires multiple steps, each step that leaves the codebase in a working state is a commit.

## Commit Messages

- Use conventional prefixes: `feat:`, `fix:`, `chore:`, `refactor:`, `test:`
- Keep messages very short — no paragraphs.
- Examples: `feat: add onscreen toggle to BroadsetElements`, `fix: correct anchor math on center cross`, `chore: update subjx wrapper cleanup`

## Implementation Order

When implementing a feature, follow this sequence:

1. Types / Interfaces
2. Math / Logic utilities
3. Zustand state (actions and selectors)
4. React components / UI

## Do Show, Don't Tell

A feature is not done until it is both **tested** (as close to code as possible) and **demoable** via at least the demo app.

Every feature must have:

- Unit or component tests proving it works.
- CT tests if appicable.
- A visible demonstration in the demo app or a Playwright CT test that exercises it end-to-end.
- Tests for everything must recide in one of the packages, but do NOT repeat/duplicate tests among packages.

No feature is considered complete on the strength of code alone.

When feature is done, mark that task with [DONE]

## Quality Gates

- Run `npm run quality:strict` (lint strict + prettier check + strict typecheck + tests) before merging or concluding a feature block.
- Run `npm run ct` before every 25th commit or before concluding a major feature block.
- **When a quality gate fails, fix the code — never weaken the check.** Do not add suppression flags, ignore comments, or config changes that make the check more lenient.

## Keep working

Unless stopped specifically, keep working without asking for permission to go to the next task or phase.
