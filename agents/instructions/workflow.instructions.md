---
description: 'Use when committing code, managing version control, or following development workflow. Covers pre-commit checks, commit message format, and implementation order.'
applyTo: '**'
---

# Workflow & Version Control

## Pre-Commit Requirements

Quality gates run automatically:

- **Pre-commit (husky)** — three checks in order: [gitleaks-check.sh](../hooks/gitleaks-check.sh) (secret scan, staged files), [quality-gate.sh](../hooks/quality-gate.sh) (`format + typecheck + quality:strict`), [actionlint-check.sh](../hooks/actionlint-check.sh) (workflow YAML lint). gitleaks and actionlint gracefully skip locally if the binaries aren't installed; CI enforces both unconditionally.
- **Pre-push (husky)** — `npm run gate:full`: `quality:strict + lint:dead (knip) + lint:typecoverage (>= 99.95%) + ct (ui + demo) + build`.
- **CI** — same gate plus `gitleaks-action` and `actionlint-action` as separate steps for failure visibility.

If you want an early signal before commit, run `agents/hooks/quality-gate.sh` manually. Code that fails the gate must not be committed.

## Commit Frequency

Commit like a professional senior full-stack developer:

- Commit when a logical, testable piece of work is complete — a new utility, a store action, a component, a bug fix, a refactor step.
- Avoid too-small commits (e.g., a single typo fix alongside unrelated work) and too-large commits (e.g., an entire feature in one shot).
- A good commit should be reviewable on its own and tell a clear story in the diff.
- If a feature requires multiple steps, each step that leaves the codebase in a working state is a commit.

## Commit Messages

Commit message format is enforced by **commitlint** via the [.husky/commit-msg](../../.husky/commit-msg) hook. Commits that don't match are rejected.

- Use conventional prefixes: `feat`, `fix`, `chore`, `refactor`, `test`, `docs`, `style`, `perf`, `build`, `ci`, `revert`, `dev`. Optional scope: `feat(ui): ...`, `chore(hooks): ...`.
- Keep the subject line short — no paragraphs.
- Examples: `feat(ui): add onscreen toggle to BroadsetElements`, `fix(editor): correct anchor math on center cross`, `chore(renderer): update subjx wrapper cleanup`.

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

Two gates, both automatic:

- `npm run quality:strict` — lint:strict + prettier:check + typecheck + jest. Fires on every commit via husky pre-commit.
- `npm run gate:full` — `quality:strict` + `lint:dead` (knip dead-code/unused-deps) + `lint:typecoverage` (≥ 99.95% explicit types) + `ct:all` (Playwright CT in `packages/ui` and `packages/demo`) + `build`. Fires on every push via husky pre-push, and on every PR / main push via CI.

**When a quality gate fails, fix the code — never weaken the check.** Do not add suppression flags, ignore comments, raised warning thresholds, or config changes that make the check more lenient. See [AGENTS.md](../../AGENTS.md) → "No cutting corners".

## Persistent Memory (Claude Code)

Claude Code maintains a per-project memory store at `~/.claude/projects/<workspace>/memory/`. Use it to capture durable, non-obvious learnings that should survive across sessions:

- User preferences specific to this project ("user prefers single bundled PRs over splits in this area").
- Project quirks and invariants ("the `.bsp` format requires unit declaration in canvas, not at element level").
- Decisions and their rationale that aren't already in code or git history.

Do **not** save things derivable from the code, git log, or files in `agents/instructions/` — read those instead. See your `auto memory` system instructions for the full save/recall protocol.

## Keep working

Unless stopped specifically, keep working without asking for permission to go to the next task or phase.
