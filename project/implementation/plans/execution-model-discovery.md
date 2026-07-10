# Execution-model discovery record (Step 0)

Verified findings that shaped the autonomous execution model, recorded 2026-07-10 against commit `12930a9` plus this
branch. Every path and number below was checked mechanically, not assumed.

## Stack and architecture

- npm workspaces monorepo, Node ≥24 (`package.json` → `engines`), TypeScript 6, React 19; seven packages under
  `packages/` with a strict dependency matrix in [architecture.md](../architecture.md) §3.2 (mirrored in `AGENTS.md`).
- Behavior authority: `project/spec/**`; implementation structure: `project/implementation/`; roadmap: `plan.md`.

## How gates actually run

- Local hooks (husky): `.husky/pre-commit` → `agents/hooks/gitleaks-check.sh`, `agents/hooks/quality-gate.sh`
  (docs + roadmap audits, format, typecheck, quality:strict), `agents/hooks/actionlint-check.sh`; `.husky/pre-push`
  → `npm run gate:full`; `.husky/commit-msg` → commitlint (`@commitlint/config-conventional`, types
  build/chore/ci/dev/docs/feat/fix/perf/refactor/revert/style/test).
- Claude Code hooks (`.claude/settings.json`): SessionStart → `session-context.sh`; PreToolUse(Bash) →
  `gate-commit.sh`; UserPromptSubmit → `check-quality.sh`; Stop → `quality-gate.sh`.
- CI (`.github/workflows/ci.yml`): single Quality-gate job ≈ **17–21 min wall clock** (run 29053644935: 20.8 min on PR #3;
  run 29037416902: 16.9 min on a main push; biggest steps: demo component tests 4 m 41 s, ui strict quality 2 m 28 s, demo strict quality
  1 m 57 s); PPTX LibreOffice/XSD validation jobs follow (~2 min). Documentation-integrity step costs ~0 s.
- ESLint globally ignores `scripts/*.mjs` (eslint.config.cjs ignore list); prettier printWidth 120, `proseWrap`
  default (preserve), padded GFM tables — the audit parsers tolerate padding by design.

## GitHub state (via `gh api`, 2026-07-10)

- Repo `broadset/broadset` is **private on a free plan**: branch protection and rulesets return HTTP 403
  ("Upgrade to GitHub Pro…"), `autoMergeAllowed: false`. There are **no required checks and no server-side
  auto-merge**; the self-merge protocol in [operating-loop.md](../operating-loop.md) is policy-enforced, not
  settings-enforced. All three merge methods allowed; squash chosen for slices; `deleteBranchOnMerge: false`
  (agents pass `--delete-branch`).
- Branches: `main`, `agent/professional-authoring-roadmap` (PR #3, open), `agent/update-heroui` (PR #4, open —
  **CI failing** as of discovery). Branch convention: `agent/<topic>`. Maintainer: `timokorkalainen`
  (git user Timo Korkalainen).
- Agent permissions before this branch: no `gh` rules and no `git push`/`git worktree` rules existed in
  `.claude/settings.json` — merge tooling was NOT pre-allowed; this branch adds scoped allow rules (gh pr/run,
  `git push … origin agent/*`, `git worktree`).

## Docs and roadmap shape (before this branch)

- `plan.md` (as carried on this branch: 12930a9 plus the PR #3 review fixes) was 12,321 words (word-count method: `wc -w` per `## `-split section); §7 alone 3,295 words; §3 1,195;
  §15 1,049. 101 initiatives (W0 27, W1 14, W2 16, W3 15, W4 9, W5 10, W6 10), 14 RFCs, 18 IO-D decisions,
  17 crosswalk rows — all re-extracted and preserved 1:1 in the new structure.
- `plan-progress.md` held the 101-row initiative register inside `MANAGED: INITIATIVE REGISTER` markers (all
  `proposed`/`unassigned`); that block is superseded by [program-state.json](../program-state.json); the legacy tier
  tables (P/I/UI/CFIO/…, 164 rows) remain because specs and package sources reference them
  (e.g. `packages/formats/src/psd/preflight.ts` cites CFIO.4.1 in user-facing warning strings).
- 34 inbound references to `plan.md` were mapped before restructuring; the index keeps its §-numbering (§1.3, §2.2,
  §2.3, §7) so spec references survive; §3/§6 citers were retargeted to `roadmap/current-state.md` /
  `roadmap/rfc-register.md`.

## In-flight work respected

- PR #3 (`agent/professional-authoring-roadmap`) — this branch stacks on its head `12930a9` and additionally carries
  the reviewed-but-uncommitted PR #3 review fixes (checker split + doc truthfulness fixes) plus the 13 stale
  source-comment cleanups, applied with wording identical to the maintainer's working tree so future merges
  auto-resolve.
- PR #4 (`agent/update-heroui`) — untouched by this branch; its CI failure predates this work.

## Consequences encoded in the model

- No branch protection ⇒ merge safety lives in the self-merge protocol (local gate + CI watch + diff-scope check +
  independent review) rather than GitHub settings.
- 20-minute CI ⇒ slices are the PR unit and WIP is capped at 3; the structural audits run in <1 s so they gate
  every commit, including docs-only ones.
- Free-plan API limits ⇒ the frontier, state, and steering channel are files in the repo, not external services.
