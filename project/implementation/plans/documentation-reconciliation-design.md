# Documentation Reconciliation Design

Status: the documentation-reconciliation process below was approved by the maintainer on 2026-07-09 through the instruction to implement every recommendation from the repository documentation audit. This approval covers the reconciliation workflow and guardrails only — it does not ratify the contract proposals in the "Proposed contract decisions" section, which remain non-authoritative ADR drafts.

## Goal

Make the Broadset documentation graph deterministic, executable, and resistant to drift so every coding agent receives the same roadmap, architecture, behavioral contracts, status, and verification commands.

## Design

### One authority per concern

- `project/spec/**` owns observable behavior and acceptance criteria.
- `project/implementation/architecture.md` owns the current implemented package and dependency baseline; its manifest-derived sections are machine-checked.
- `project/implementation/plan.md` owns portfolio strategy, initiative IDs, dependencies, and sequencing.
- `project/implementation/program-state.json` owns initiative lifecycle/status and evidence links (2026-07-10 supersession; `plan-progress.md` keeps historical legacy-tier evidence).
- `project/implementation/plans/<initiative-id>.md` owns task-level execution.
- Historical documents may preserve rationale and UX detail, but must declare that they are not execution authority and map useful content to current initiatives.

### Proposed contract decisions

The eight statements below summarize the contract proposals recorded as `decisions/ADR-*.md` drafts with `Status: proposed`. They are **not** ratified: they do not override `project/spec/**`, and current spec behavior remains authoritative until a maintainer explicitly ratifies each ADR (tracked by RQ-00 and W0-RFC-01).

1. Timeline duration is resolved once: explicit valid `durationMs` wins; otherwise duration is `max(3000, maximumKeyframeOffset + 1000)` milliseconds, including an empty timeline at 3000 ms.
2. Timed media uses the half-open interval `[0, duration)`. Encoded frame starts are exact rational ticks less than duration; seeking may evaluate the terminal state at exactly `duration` without encoding a duplicate endpoint frame.
3. Components use document-owned component definitions and typed instance references. Component overrides are stored on the instance reference; page overrides remain a separate, later resolution layer.
4. Canonical `.bsp` files are ZIP packages containing `project.json`, a checksummed manifest, and embedded assets. Raw JSON remains a separate interchange/debug representation and does not use the `.bsp` extension.
5. Page instances have one complete shape: `elementId`, transform, visibility, and optional content/style/asset overrides. Dangling references fail canonical validation; recovery tooling quarantines invalid bytes rather than silently ignoring them.
6. Collaboration diff/apply covers every variant in `model/changes.md`, validates a batch before mutation, applies atomically, and excludes remote changes from local undo.
7. Static-format animation loss is allowed only with an accessible export-preflight warning. Fidelity warnings are overridable; security, structural-validity, and canonical-output errors block export.
8. Internal kernels may precede UI, but no new persisted author-editable field is release-visible until its editing UI and tests land in the same release slice.

### Automated guardrail

`scripts/check-documentation.mjs` checks local links, Markdown tables, roadmap ID definitions and tracker coverage, RFC/IO-D dependency registries, ADR status and authority, stale execution vocabulary in active guidance, manifest-derived architecture content, and forbidden references to removed phase plans — in Markdown and in `packages/**` TypeScript sources. `npm run docs:check` runs locally and in `gate:full`/CI.

## Error handling

The checker reports every finding in one run as `path:line — message`, exits non-zero on any violation, never rewrites files during check mode, and ignores external URLs. Generated architecture output is deterministic and can be refreshed explicitly.

## Verification

- Unit tests exercise checker behavior with temporary fixtures.
- `npm run docs:check` passes on the repository.
- Prettier and `git diff --check` pass for every touched document.
- Relevant spec and tracker identifiers are mechanically cross-checked.
