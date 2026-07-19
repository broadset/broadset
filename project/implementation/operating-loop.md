# Autonomous Operating Loop

This runbook defines how agents execute the roadmap in [plan.md](./plan.md) non-stop while the maintainer steers by
exception. It is execution policy (HOW to run the program); the index owns WHAT to build and
[program-state.json](./program-state.json) owns lifecycle state. When this document conflicts with older execution
guidance, this document wins; behavioral authority stays with `project/spec/**`.

## Roles

- **Agents** execute continuously: select work from the frontier, plan, implement, verify, self-merge, record state,
  and continue. Agents never wait for permission that this runbook already grants.
- **The maintainer (GitHub `timokorkalainen`)** evaluates merged results asynchronously and steers through
  [directives.md](./directives.md). Silence means continue. The maintainer owns every external evidence gate
  (manual canonical-tool signoff, usability/expert studies, licensed-fixture acquisition, spending, publishing).
- **Reviewers are always fresh contexts.** The implementer of a slice never reviews its own work.

## The loop

1. **Sync.** `git fetch origin && git checkout main && git pull --ff-only`. Run `npm ci` when the lockfile changed.
2. **Reconcile directives.** Read [directives.md](./directives.md) top to bottom. For any entry without a resolution,
   act on it first: a `Stop:` entry halts all matching in-flight work immediately. Append a
   `**Resolution (agent):**` line describing what was done. Never edit or delete existing entries. Agents may also
   append their own entries with scope prefix `request:` (same `## D-###` format) to ask for maintainer action —
   external evidence gates, spending approval, ratification — and continue with other work while it is open.
3. **Audit, then frontier.** `npm run roadmap:check` must pass; then `npm run roadmap:frontier` prints the machine
   frontier: `ready`, `advanceCandidates`, `inProgress`, `measuring`, `blocked`, `activePhase`.
4. **Select work.** Hard rules:
   - WIP cap: at most **3** initiatives in `implementing` or agent-actionable `measuring` at once. An initiative in
     `measuring` that waits only on an external evidence gate (owner: maintainer) does not consume a WIP slot —
     record the pending gate in its program-state `evidence` field and keep working elsewhere.
   - At most **1 advance slot**: one initiative from `advanceCandidates` (the next phase) may run concurrently with
     active-phase work when the ready set is smaller than the WIP cap.
   - **Disjoint write scopes:** compare the `Files:` lists in the wave's `impl-w*.md` sections (and open PR diffs)
     before starting; overlapping scopes serialize — pick non-overlapping work instead.
5. **Plan per initiative.** Move the initiative to `approved` by authoring its child plan under
   `plans/<initiative-id>.md` satisfying index §2.3 (files, interfaces, RED→GREEN steps, commands, review
   checkpoints), seeded from the initiative's section in `roadmap/impl-w*.md`. Update
   [program-state.json](./program-state.json) via PR alongside the work.
6. **Implement per slice, test-first, isolated.** Work in a fresh worktree on a branch named
   `agent/<initiative-id>-s<slice>` (repo convention: `agent/…`). One PR per slice — slices, not initiatives, are
   the PR unit; XL/XXL initiatives follow their PR-slice tables in `roadmap/impl-w*.md`. RED before GREEN; commit
   boundaries per the child plan; conventional commit messages (commitlint enforces).
7. **Self-merge protocol** (below). On merge, set the entry in program-state.json: `implementing` → `measuring` when
   acceptance-criteria measurement remains, else straight to `shipped`, always with the `pr` link and evidence.
8. **Continue.** Return to step 1. Do not stop because a slice merged; stop only on a blocking directive, an
   exhausted escalation path, or an empty frontier after phase-exit work.

**Empty frontier ⇒ phase exit.** When `ready` and `advanceCandidates` are empty and nothing is in progress: verify
the wave gate evidence listed in the wave file and the universal wave-close checklist — `npm run gate:full`
green **from a fresh clone**, demo and user documentation for every shipped behavior, and a professional workflow
review plus a closure audit against the wave objective (recorded under `reviews/`) — then re-plan the next phase — re-audit its `wave-w*.md` against the
current codebase, re-slice its `impl-w*.md` (drafts are drafts by construction), re-estimate sizes, and update the
registry via PR. Then proceed into the next phase by default — no approval needed; the maintainer steers by
directive if priorities changed. If the frontier is empty because every remaining initiative is blocked on open
RFCs or external evidence gates, resolving the blockers IS the work: draft the pending ADR/analysis artifacts,
append `request:` entries to directives.md naming exactly what the maintainer must decide, and re-check the
frontier after each resolution.

### Child-plan quality bar

Every initiative child plan starts with:

```markdown
# <Initiative ID>: <Outcome> Implementation Plan

**Goal:** one testable user/system outcome.
**Owner and reviewers:** named DRI plus required domain reviewers.
**Dependencies:** stable initiative/RFC IDs and exact interfaces consumed.
**Produces:** exact public/internal interfaces and consumers.
**Files:** exact create/modify/test/spec/demo paths.
**Budgets:** applicable performance, reliability, fidelity, security, and accessibility rows.

### Task N: independently reviewable unit

- [ ] Add or refine the spec scenario.
- [ ] Write the exact failing unit/property/CT/integration test.
- [ ] Run the narrow command and record the expected failure.
- [ ] Implement the minimum complete production behavior.
- [ ] Run the narrow command and record the expected pass.
- [ ] Run the touched-package strict quality gate.
- [ ] Demonstrate the workflow in demo/CT.
- [ ] Update tracker, gap, support-matrix, and docs evidence.
- [ ] Commit one logical green change.
```

Code-changing steps in the child plan include the actual types/signatures/code required by `superpowers:writing-plans`; phrases such as “handle edge cases” or “add tests” without exact content are plan failures.

## Dependency flow, contention, and change sizing

### Critical path

```text
W0 evidence + RFCs + product/host design
  → W1 timebase + resolved scene + text/color/security
      → W1 persistence/workers/playback/render/player
          → W2 commands/canvas/timeline/components/variables/data
              → W3 reconciliation/formats/video/Lottie/OGraf/player
                  → W4 state/rundown/operator/data/playout
                  → W5 services/collaboration/libraries/plugins/MCP
                      → W6 release, scale, showcase, award qualification
```

W4 local operate work may overlap W5 service implementation after W3. W6 quality, research, and craft practices run continuously, but their release qualification occurs after their dependencies.

### High-contention files and merge order

| Surface                                                        | Contenders                                              | Required order                                                                      |
| -------------------------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `project/spec/model/animation.md` and `model/src/animation.ts` | RFC-02/03/04/06, W1-TIME, W2 timeline, W4 state         | RFC/timebase first; stable IDs next; authoring consumers after                      |
| `project/spec/model/config.md` and component types             | RFC-07, W2-COMP, W2-VAR, W4 controls                    | reconcile spec/model first; components; variables/exposed controls                  |
| `editor/collaboration/*` and `model/changes.ts`                | W0-COLLAB, W1 persistence, W5 CRDT                      | complete local/project semantics; persistence transaction origin; network adapter   |
| `demo/src/demo-app/app.tsx`                                    | selectors, persistence UX, command registry, onboarding | region split; persistence; command consumption; onboarding                          |
| `editor/store-actions/store.ts`                                | transactions, coordinate migration, commands, recovery  | command/transaction seam; coordinate consumers; recovery integration                |
| `ui/src/timeline/**`                                           | timebase, virtualization, graph, accessibility          | timebase APIs; timeline owner; perf/a11y requirements integrated in same child plan |
| `renderer/**` DOM contract                                     | resolved scene, accessibility, effects, player          | resolved scene contract; parity fixtures; renderer/player adapters                  |
| `formats/svg/export.ts`                                        | sanitizer, structural reuse, animation                  | security policy first; structural fidelity; animated export                         |
| `formats/pptx/export/shape-tree.ts`                            | F-01/F-04, component/group semantics                    | W0 group fix under current contract; component exports after RFC-07                 |
| `demo/src/formats-loader.ts`                                   | chunks, worker RPC, reconciliation                      | worker RPC first; per-format adapters; UI report                                    |

### Change sizing

- A child-plan task is the smallest independently reviewable unit with its own red/green cycle.
- A contract migration may span packages but lands package-by-package behind a consistently green gate.
- Unrelated RFCs do not share one giant commit merely because they occur in the same wave.
- Fixture regeneration is isolated from semantic code where reviewers need to inspect generated churn.
- Visual baseline changes are separate from the renderer behavior change.
- Tracker/spec/doc evidence lands with the behavior it describes.

Before selecting overlapping work, check this table: a slice touching a contended surface merges in the listed
order, and out-of-order work waits.

## Self-merge protocol

This repository is private on a free plan: **no branch protection and no server-side auto-merge exist**. The
protocol below is therefore mandatory policy, enforced by discipline and audits, not by GitHub settings.

1. Local gate green: `npm run gate:full` (docs + roadmap audits, typecoverage, strict quality, knip, CT, build).
2. Push the slice branch, open the PR with `gh pr create` — base `main`, title in conventional-commit form (it
   becomes the squash commit subject), body containing: slice ID, declared file scope, proof (test names/evidence),
   and the rollback line (see below).
3. CI green: `gh pr checks <n> --watch` (Quality gate ≈ 20 min wall clock; PPTX validation jobs follow). Checks
   register with a delay after push — if the command reports "no checks", wait a minute and retry.
4. **Diff-scope verification:** `gh pr diff <n> --name-only` must match the slice's declared `Files:` scope. An
   undeclared file means: amend the child plan first or split the change — never merge undeclared scope.
5. **Independent review in a fresh context:** a reviewer agent (never the implementer) reviews the full diff with
   `.claude/agents/code-reviewer.md`; add a second pass with `.claude/agents/security-reviewer.md` when the diff
   touches importers/exporters, file or network I/O, sanitization, dependency changes, or third-party content
   rendering. The reviewer records the verdict as a PR review (`gh pr review <n> --approve` or
   `--request-changes --body <findings>`), so the merge decision is auditable on the PR itself. Merge requires an
   approving review and **zero unresolved Critical or Important findings**.
6. Rollback recorded: the PR body names the revert command (`git revert <merge-sha>`) and any state to reset
   (program-state entry, evidence links).
7. Merge: `gh pr merge <n> --squash --delete-branch`, run from the main checkout (not the slice worktree, whose
   checked-out branch blocks local cleanup). Squash is the repository's merge method for slices; for single-commit
   PRs GitHub takes the squash subject from the commit title, so keep the commit message AND the PR title in
   conventional-commit form.

**Revert-first.** Reverting a flagged or suspect slice is always in-policy and needs no approval — revert, set the
initiative back to `implementing` with a note, and append the resolution to the triggering directive. A revert is
progress, not failure.

## Permission layering

In Claude Code sessions the PreToolUse hook (`agents/hooks/gate-commit.sh`) currently auto-allows every Bash
command except `git commit` (which it gates behind the quality gate); the `.claude/settings.json` allowlist is the
effective boundary only in environments without that hook. The allowlist is still kept accurate and scoped
(pushes limited to `agent/*` branches, merges limited to same-repo squash) as defense in depth; whether to narrow
the hook so the allowlist becomes the single boundary is an open maintainer decision — steer via directive.

## Never without a directive

Agents must not do any of the following without an explicit directive entry:

- Publish anything outside this repository: npm or other registries, external services, marketing surfaces, GitHub
  releases. (No production deploy target exists in this repo; if one appears, it joins this list.)
- Spend money or accept license terms (including licensed fixture acquisition).
- Ratify RFCs or change behavioral contracts in `project/spec/**` (index §2.1 — maintainer ratification only; an
  agent may draft ADRs and additive spec clarifications).
- Override or weaken a failed safety, security, or quality gate (also forbidden by AGENTS.md "No cutting corners").
- Delete evidence: directives entries, review records, program-state history, `reviews/` artifacts.
- Force-push or delete branches other than the agent's own slice branches; any history rewrite on `main`.

## Model routing

Size labels are the default trigger; escalation is by evidence, de-escalation once the design is pinned.

| Work                                                                                            | Model                                |
| ----------------------------------------------------------------------------------------------- | ------------------------------------ |
| Advisory consults, hardest design (contracts, XXL architecture), phase-exit re-planning reviews | Fable 5                              |
| Loop orchestration, independent reviews, XL/XXL and safety-critical coding                      | Opus                                 |
| S/M and bulk coding (via the codex plugin's `/codex:rescue` delegation)                         | Codex — never reviews its own output |

Escalate Codex → Opus after **two** failed independent reviews of the same slice. Escalate Opus → Fable 5 for a
design consult when a slice fails review for design (not implementation) reasons — record the decision in the child
plan or an ADR. De-escalate to the default tier once the design is pinned.

## Evidence ladder

- **Directional** (agent-runnable: unit/CT suites, perf runs, heuristic a11y audits, structural audits) — gates
  every iteration and slice merge.
- **Expert** (maintainer or named-owner validation: manual canonical-tool signoff per
  [production-readiness-status.md](./production-readiness-status.md), expert review) — gates phase exits.
- **Full** (release-grade: complete producer matrix, licensed-corpus runs, user studies where a wave file names
  them) — gates the final release claim only.

External evidence gates are listed in wave files as `External evidence gates (owner: maintainer)` — they are never
agent-executable checkboxes, and a pending external gate never blocks other frontier work (that is the point of the
ladder: iterate on directional evidence while expert/full evidence is scheduled).

## Bootstrap

```bash
npm ci
npm run roadmap:check && npm run roadmap:frontier   # shows the ready set
# pick the first ready initiative, author plans/<id>.md, set status approved via PR, then loop from step 1
```

The first iteration of a fresh loop starts at step 1 like every other iteration. If `roadmap:check` fails, fixing
the audit findings IS the frontier.
