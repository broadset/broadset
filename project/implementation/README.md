# Implementation Definitions

This folder contains the **implementation-facing definitions** that support the Spec requirements.
These files describe **how the project is structured**, not the behavioral source of truth.

## The plan

- [`plan.md`](./plan.md) — **the single master roadmap**: strategy, W0–W6 sequencing, workstreams, quality bars, findings, and RFC gates. Deleted phase/support plans remain available in git history; current legacy routing is in [roadmap/current-state.md](./roadmap/current-state.md) → "Legacy open-gap routing".
- [`roadmap/`](./roadmap/) — wave files (`wave-w<n>.md`, initiative definitions), implementation plans (`impl-w<n>.md`), [`current-state.md`](./roadmap/current-state.md), [`rfc-register.md`](./roadmap/rfc-register.md), and [`program.md`](./roadmap/program.md)
- [`program-state.json`](./program-state.json) — machine lifecycle state for every initiative (status plus `pr`/`evidence` links)
- [`directives.md`](./directives.md) — append-only human steering channel
- [`operating-loop.md`](./operating-loop.md) — the autonomous operating loop and self-merge protocol
- [`plan-progress.md`](./plan-progress.md) — legacy-tier evidence board; initiative lifecycle lives in [`program-state.json`](./program-state.json). Specs own behavioral acceptance criteria; plan.md owns sequencing and scope.
- [`plans/`](./plans/) — just-in-time child plans for stable initiatives plus the approved documentation-reconciliation design.

## Live trackers

- [`production-readiness-status.md`](./production-readiness-status.md) — release-readiness status and active release blockers
- [`cross-region-ct-inventory.md`](./cross-region-ct-inventory.md) — cross-region CT coverage inventory and open work queue
- [`real-producer-compatibility.md`](./real-producer-compatibility.md) — producer compatibility fixture/signoff matrix (self-contained row sets)

If plan.md and a tracker disagree on _status_, the tracker wins; on _sequencing or scope_, plan.md wins.

## Reference

- [`architecture.md`](./architecture.md) — package graph, dependencies, toolchain, repo layout
- [`decisions.md`](./decisions.md) — decision log, including the full ratified IO-D-01…18 cross-format table
- [`io-prereqs-ui-features-plan.md`](./io-prereqs-ui-features-plan.md) — historical UX research/detail mapped explicitly to current UI IDs and W2/W3 initiatives; not execution authority
- [`cross-region-ct-audit.md`](./cross-region-ct-audit.md) — the CT Derivation Rule audit method behind the inventory
- [`coverage-reporting.md`](./coverage-reporting.md) / [`coverage-baseline.md`](./coverage-baseline.md) — coverage tooling and the non-gating baseline
- [`component-testing.md`](./component-testing.md), [`heroui-usage.md`](./heroui-usage.md) — active CT and UI implementation notes; [`properties-panel.md`](./properties-panel.md) is historical UX evidence only
- [`pptx-known-gaps.md`](./pptx-known-gaps.md), [`sister-format-audit.md`](./sister-format-audit.md) — format gap/audit records
- [`producer-fixture-acquisition-guide.md`](./producer-fixture-acquisition-guide.md) — how licensed producer fixtures are sourced and mounted
- [`dev-audit-remediation.md`](./dev-audit-remediation.md) — dependency-advisory remediation and risk acceptances
- [`experimental-gated.md`](./experimental-gated.md) — what hides behind the experimental flag and its gate-exit criteria
- [`bugs.md`](./bugs.md) — historical bug-hunt findings (per-item closure tracked via the [roadmap/current-state.md](./roadmap/current-state.md) findings ledger)
- [`project.md`](./project.md) — historical implementation context; `architecture.md` is the current baseline

## Scope boundary

- Put **behavioral product requirements** in `../spec/`.
- Put **implementation definitions, build structure, and technical constraints** here.
- Put **root-level workflow and meta guidance** in `../../README.md` and `../../AGENTS.md`.
