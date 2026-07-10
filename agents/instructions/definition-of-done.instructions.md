---
description: 'Always-on Definition of Done. Apply at the end of every task before claiming completion — code, refactors, bug fixes, spec edits, tooling.'
applyTo: '**'
---

# Definition of Done

A task is **not** done until every box below is true. Apply this checklist before claiming completion of any change — feature, bug fix, refactor, spec edit, tooling, or docs. Scope each item to what the task touched.

## Behavioral correctness

- [ ] **Tests added or updated.** New behavior has a test. Changed behavior has updated tests. Bug fixes have a regression test that fails without the fix.
- [ ] **Cross-region UI changes have a Playwright CT.** If a user action in one UI region produces a visible outcome in another (panel ↔ canvas, properties ↔ timeline, etc.), there is at least one CT covering it. See [agents/instructions/testing.instructions.md](testing.instructions.md) → "CT Derivation Rule".
- [ ] **No skipped or deleted tests** that previously revealed real behavior.

## Quality gates pass

- [ ] `npm run docs:check` and `npm run roadmap:check` pass when Markdown, package manifests, roadmap/tracker data, or agent guidance changed.
- [ ] `npm run quality:strict` passes for every touched package (lint:strict + prettier:check + typecheck + vitest).
- [ ] `npm run ct -w @broadset/ui` and `npm run ct -w @broadset/demo` pass when UI/demo source changed.
- [ ] `npm run build` passes when packaging or bundling-relevant code changed.
- [ ] No quality gate was weakened, suppressed, or bypassed (no new `@ts-ignore`, `eslint-disable`, `--no-verify`, raised warning thresholds, widened ignore patterns). See [AGENTS.md](../../AGENTS.md) → "No cutting corners".

## Spec and architecture alignment

- [ ] **Spec updated additively** if implementation revealed an ambiguity or new acceptance criterion. Behavior changes go to spec first or alongside, never after.
- [ ] **Package boundaries respected.** No new import that crosses an architecture line ([AGENTS.md](../../AGENTS.md) → "Package boundary rules").
- [ ] **Barrel exports updated.** Any new public type, function, or component is exported from the package's `index.ts`.
- [ ] **HeroUI compliance** preserved in `packages/ui` and `packages/demo`. No raw `<button>`, `<input>`, etc. where a HeroUI component exists.
- [ ] **Lifecycle state updated.** If the task advances an initiative, its entry in `project/implementation/program-state.json` is updated with a `pr` or `evidence` link. `plan-progress.md` keeps historical legacy-tier evidence only.

## Hygiene

- [ ] **Commit message** follows conventional format (`type(scope): subject`) — enforced by commitlint.
- [ ] **No unrelated file churn** in the same commit. Reformatting unrelated files, fixing unrelated bugs, or speculative refactors belong in their own commits.
- [ ] **No comments explaining the obvious** or referencing the current task / PR / issue. Comments only when the _why_ is non-obvious.
- [ ] **No half-finished implementations** or `TODO` / `FIXME` placeholders for behavior the change claims to deliver.

## Persistent learnings (Claude Code only)

- [ ] If you learned something durable about the user's preferences, the project's invariants, or a non-obvious quirk worth recalling next session, save it via the auto memory system (see your `auto memory` system instructions). Skip if nothing surprising came up.

If any box is unchecked and the task says it's done, it isn't — go back and finish it or be explicit about what was left out and why.
