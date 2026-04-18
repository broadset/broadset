# Broadset — Copilot Workspace Instructions

These are the always-on workspace instructions for GitHub Copilot. The actual content lives in the files linked below — read them in full before answering or making changes. They are the same source of truth used by every other coding agent in this repo (Claude Code, Codex, Ralph). Do not duplicate the content here.

## Required reading (in this order)

1. [AGENTS.md](../AGENTS.md) — concise workspace conventions, HeroUI mandate, no-cutting-corners rules, package boundary rules, and data model essentials.
2. [CONTRIBUTING.md](../CONTRIBUTING.md) — quality gates, HeroUI compliance gate, package boundary gate, barrel-export gate, and spec authoring conventions.
3. [agents/instructions/ways-of-working.instructions.md](../agents/instructions/ways-of-working.instructions.md) — global engineering standards (architecture, robustness, UX, performance) and the greenfield compatibility rule.
4. [agents/instructions/typescript.instructions.md](../agents/instructions/typescript.instructions.md) — strict typing, null safety, immutability, runtime validation.
5. [agents/instructions/testing.instructions.md](../agents/instructions/testing.instructions.md) — unit + Playwright CT strategy, including the cross-region CT derivation rule.
6. [agents/instructions/heroui.instructions.md](../agents/instructions/heroui.instructions.md) — HeroUI v3 host-package rules for `packages/ui` and `packages/demo`.
7. [agents/instructions/workflow.instructions.md](../agents/instructions/workflow.instructions.md) — pre-commit checks, commit message format, implementation order.

The per-domain `*.instructions.md` files in [agents/instructions/](../agents/instructions/) also carry `applyTo` frontmatter so Copilot auto-applies them to matching paths. Treat both this loader and those frontmatter scopes as in force at the same time.

## Optional, manually invoked

- [agents/ralph.agent.md](../agents/ralph.agent.md) — the long-form Ralph agent loop for autonomous phase execution.

## Rules of engagement

- Do not summarise, paraphrase, or skim the files above. Read them fully when their topic is in scope for the current task.
- Do not weaken, suppress, or bypass any quality gate, lint rule, or typecheck — see "No cutting corners" in [AGENTS.md](../AGENTS.md).
- Specs in `project/spec/` are the source of truth for behavior; `project/implementation/` is the source of truth for structure. If they conflict with anything here, follow the spec or stop and report.
