# Main Integration Plan

Date: 2026-07-07
Status: baseline PR open and green
Branch: `initial-dev-phase` → `main` (squashed from `dev2-phase-11`)
Owner: release/integration track (complements [plan-progress.md](./plan-progress.md))

## Goal

Land the current Broadset development baseline on `main` in a **honest, reviewable way**, then switch to **small PRs on `main`** for all future work.

This plan rejects two failure modes:

1. **Retroactive PR archaeology** — trying to split 679 commits into a dozen historical vertical PRs (high git cost, low user value).
2. **Overclaiming merge** — calling the baseline “production-ready” when producer signoff, cross-region CT closure, and io-prereqs editor UI are still open.

## Context (updated 2026-07-09)

| Branch              | State                                                                             |
| ------------------- | --------------------------------------------------------------------------------- |
| `main`              | Early scaffold. Not the active codebase until PR #2 lands.                        |
| `dev2-phase-11`     | Historical active integration branch and source of the baseline content.          |
| `initial-dev-phase` | PR #2 head branch. One squashed commit on top of `main`; GitHub checks are green. |

Execution status tiers live in [plan-progress.md](./plan-progress.md). This plan defines **what merges to `main` now** vs **what continues afterward**.

## Strategy summary

```text
Phase 0  Credibility bundle on dev2-phase-11      complete
Phase 1  Baseline PR: initial-dev-phase → main    PR #2 open, green
Phase 2  Workflow switch: main + small PRs        after merge
Phase 3  Post-merge priority queue                sprints on main
```

**Chosen approach:** Option A — single baseline merge after a short credibility pass. Option B (stacked vertical PRs carved from history) is documented in [Appendix B](#appendix-b-option-b-stacked-vertical-prs-deferred) and is **not** the default path.

---

## Merge tier definitions (for PR descriptions)

Use the same vocabulary as [plan-progress.md](./plan-progress.md):

| Tier           | Merge to `main`?        | PR language                                                       |
| -------------- | ----------------------- | ----------------------------------------------------------------- |
| **release**    | Yes                     | “Meets spec acceptance criteria; evidence linked.”                |
| **functional** | Yes, with explicit gaps | “Broadset round-trip + demo wiring work; known spec gaps listed.” |
| **scaffold**   | Only if labeled         | “Partial / shallow; not user-complete.”                           |
| **open**       | No                      | Do not merge until implemented.                                   |
| **deferred**   | No                      | Out of scope for this integration.                                |

**Baseline PR tier claim:** the merged codebase is **functional** for format I/O and editor shell — **not release-ready**.

---

## Phase 0 — Credibility bundle (before baseline PR)

Completed from `dev2-phase-11` and squashed into `initial-dev-phase`. Do not merge the baseline PR until every item below is done or explicitly waived in writing in this file.

### 0.1 P8.G1 — PPTX unit chain round-trip test

**Why:** PDF, PSD, and SVG already have `chain-round-trip.test.ts`. PPTX only has demo CT (`packages/demo/ct/state/pptx-chain.ct.tsx`). Parity gap is visible and cheap to close.

**Work:**

1. Add `packages/formats/src/pptx/chain-round-trip.test.ts` mirroring the PDF/PSD/SVG harness (`runChainRoundTrip`, `assertReImportableBy` from `_shared/test-infrastructure/`).
2. Cover at minimum: synthetic Broadset document → export → import → zero-drift reconcile (or documented acceptable drift with warning codes).

**Exit evidence:**

- `npm run test -w @broadset/formats -- src/pptx/chain-round-trip.test.ts` passes.
- Update [plan-progress.md](./plan-progress.md): P8.G1 → **functional** (or fold into P8.6 tier note).

**Estimate:** 0.5–1 day.

### 0.2 D.9 — Fresh-checkout validation log

**Why:** Baseline PR to `main` needs one recorded clean-environment gate run, not only “works on Timo’s laptop.”

**Work:**

1. In a **clean directory** (fresh clone or worktree from the baseline branch tip):
   - Record OS, Node (`node -v`), npm (`npm -v`).
   - `npm ci`
   - `npm run gate:full`
   - `npm run test:coverage` (optional but recommended)
   - `npm run audit:prod`
2. Append results to [production-readiness-status.md](./production-readiness-status.md) under **Last Recorded Validation**, with date **2026-07-xx** and branch **`initial-dev-phase`** or the source validation worktree.
3. If any step fails, fix root cause on the PR branch before Phase 1 — do not waive.

**Exit evidence:**

- Dated log section exists with pass/fail per command.
- [plan-progress.md](./plan-progress.md): D.9 moves from **open** → **functional** (full **release** waits on repeat before tag).

**Estimate:** 0.5 day (+ fix time if red).

### 0.3 Producer triage — Class B easy passes only

**Why:** `real-producer-compatibility.md` shows 44/44 `untriaged`. Baseline PR should not claim external compatibility, but **should not look neglected** — triage generated/MIT fixtures that already run in CI.

**Work:**

1. Run existing corpus/generator tests and mark rows **pass** where tests already green:
   - PDF: pdfkit / jsPDF / producer-quirks / real-producer-fixtures paths (Class B).
   - PPTX: LibreOffice verify script when `BROADSET_REQUIRE_LIBREOFFICE=1` (Class A/B as documented per row).
   - PSD/SVG: synthetic producer-quirks + corpus-fetch verification where applicable.
2. Leave Class C/D rows (Adobe binaries, PowerPoint-on-Windows manual, licensed mounts) as **`untriaged`** or **`waived`** with owner + “post-baseline” rationale — **never fake `pass`**.
3. Update [real-producer-compatibility.md](./real-producer-compatibility.md) rows + summary counts.

**Exit evidence:**

- At least **15–20 rows** moved from `untriaged` → `pass` (generated/MIT only).
- Zero rows marked `pass` without a linked test command or documented manual protocol.

**Estimate:** 1–2 days.

### Phase 0 gate

All of:

- [x] 0.1 P8.G1 chain test green
- [x] 0.2 D.9 fresh-checkout log recorded
- [x] 0.3 Class B producer rows triaged
- [x] `npm run gate:full` green on the pending `dev2-phase-11` baseline working tree after 0.1–0.3; repeat on committed branch tip before opening the PR

2026-07-07 evidence: `packages/formats/src/pptx/chain-round-trip.test.ts` passed; 16 generated/public producer rows are marked `pass`; clean copied-directory validation from `/tmp/broadset-phase0-validation` passed `npm ci`, `npm run gate:full`, `npm run test:coverage`, and `npm run audit:prod`. Full `npm run audit:all` still reports the known low dev-only Playwright CT React `esbuild` advisory with risk acceptance in [dev-audit-remediation.md](./dev-audit-remediation.md).

2026-07-09 evidence: PR #2 (`initial-dev-phase` → `main`) is open as a single squashed commit. GitHub checks are green: Quality gate, PDF/A conformance via veraPDF, PPTX ECMA-376 XSD validation, and LibreOffice PPTX openability.

---

## Phase 1 — Baseline PR (`initial-dev-phase` → `main`)

### 1.1 Pre-flight

1. Push `initial-dev-phase` to `origin`.
2. Confirm CI green on the branch, including `verapdf.yml` and the PR-triggered PPTX validation jobs.
3. Re-read [plan-progress.md](./plan-progress.md) open queue — baseline PR description must list top open items honestly.

Current status: complete for PR opening. PR #2 is open, mergeable, and green. It remains intentionally draft until the final manual smoke/review pass is recorded.

### 1.2 PR title (suggested)

```text
feat: Broadset v0.1 development baseline (functional format I/O)
```

### 1.3 PR body template

Use this structure when opening the PR:

```markdown
## Summary

- Land the active Broadset monorepo baseline: model, playback, renderer, editor, ui, demo, formats (PSD/PDF/SVG/PPTX/PDF-A).
- Tier: **functional** — Broadset round-trip and demo wiring work; **not** release signoff.
- Supersedes stale `main` scaffold (~3 commits).

## What is done (evidence)

- Shared foundation P0–P4: see plan-progress tiers **release** / **functional**.
- Format tracks: import/export/reconcile/preflight/caps + chain round-trip tests (PDF/PSD/SVG; PPTX after P8.G1).
- CFIO waves 1–3: format modals, reconciliation, preflight, SVG security, shared utilities.
- CI: root gate:full, coverage reporting, veraPDF workflow for PDF/A.
- Fresh-checkout validation: [link to production-readiness-status.md section + date].

## Known gaps (do not claim fixed)

- io-prereqs editor UI (UI.1–UI.15): not started — model exists, editor UX open.
- Cross-region CT: 31 missing + 12 partial bullets — see cross-region-ct-inventory.md.
- Producer matrix: Class C/D rows still untriaged/waived — see real-producer-compatibility.md.
- PSD: BsPs layer export (P5.G1), CMYK/effects (CFIO 4.1, 4.3).
- PDF: third-party import text-only (P6.G1).
- PPTX: visual CI / licensed fixtures (CFIO 5.1, 5.3).

## Test plan

- [ ] CI green on PR
- [ ] Reviewer: spot-check packages/formats chain-round-trip tests
- [ ] Reviewer: confirm PR tier language matches plan-progress.md

## Post-merge

- `main` becomes default integration branch.
- Future work: small PRs only — see main-integration-plan.md Phase 2–3.
```

### 1.4 Merge rules

1. **Squash merge vs merge commit:** Use a **single squash commit** for the baseline PR. The historical branch has high noise and low review value; carry the useful audit trail in the PR body, linked evidence, and squash commit message instead. The PR branch itself is already a single squashed commit; keep it that way when amending pre-merge cleanup.
2. After merge: delete or archive `dev2-phase-11` branch on remote (optional; reduces confusion).
3. Update default branch to `main` on GitHub if not already.

### 1.5 Post-merge doc updates (same day)

| File                                                               | Update                                                            |
| ------------------------------------------------------------------ | ----------------------------------------------------------------- |
| [README.md](../../README.md)                                       | State `main` is active dev branch; link plan-progress + this plan |
| [plan-progress.md](./plan-progress.md)                             | Note baseline landed on `main` (date)                             |
| [production-readiness-status.md](./production-readiness-status.md) | Executive status: “baseline on main; release work continues”      |

---

## Phase 2 — Workflow switch (after baseline merge)

### Branch policy

| Rule                   | Detail                                                                                        |
| ---------------------- | --------------------------------------------------------------------------------------------- |
| **Integration branch** | `main` only                                                                                   |
| **Feature branches**   | `feat/<short-name>` or `fix/<short-name>` from `main`                                         |
| **Lifetime**           | ≤ 3–5 days preferred; ≤ 2 weeks max                                                           |
| **PR size**            | One concern per PR (one format gap, one UI slice, one CT batch)                               |
| **Forbidden**          | Long-lived `dev2-phase-N` integration branches unless explicitly reopened for a release train |

### PR checklist (every PR to `main`)

1. `npm run gate:full` passes (or scoped package gate documented in PR if infra PR).
2. Tier stated in PR title or summary (**functional** / **fix** / **docs**).
3. Tests cover the claim (unit, CT, or producer row update).
4. Open spec gaps linked when behavior is partial.
5. [plan-progress.md](./plan-progress.md) updated in same PR when task tier changes.

### Worktree policy

- One primary clone on `main`.
- Optional short-lived worktrees for parallel agents; remove when PR merges.
- Do not accumulate `broadset.worktrees/phase-*` format branches — use feature branches from `main`.

---

## Phase 3 — Post-merge priority queue

Ordered backlog for **small PRs on `main`**. Each row is one PR (or one PR batch where noted).

### Sprint 1 — Format parity quick wins

| PR    | ID                                  | Work                                                               | Tier target                           | Estimate |
| ----- | ----------------------------------- | ------------------------------------------------------------------ | ------------------------------------- | -------- |
| PR-01 | P5.G1                               | PSD per-layer `BsPs` export + id-based reconcile pairing           | functional → release (PSD round-trip) | 2–4 days |
| PR-02 | P3.G1                               | Renderer `pattern` / `picture` fill consumption in `background.ts` | functional                            | 2–3 days |
| PR-03 | P6.G1 (scaffold→functional slice 1) | PDF third-party: raster image extraction (not full vector yet)     | scaffold → functional (partial)       | 3–5 days |

### Sprint 2 — Editor UX first slice

| PR    | ID   | Work                                                | Tier target       | Estimate |
| ----- | ---- | --------------------------------------------------- | ----------------- | -------- |
| PR-04 | UI.1 | Theme swatches panel + theme tab in color pickers   | open → functional | 5–8 days |
| PR-05 | UI.4 | FilterStack editor in properties panel              | open → functional | 5–8 days |
| PR-06 | UI.7 | Picture fill picker + asset binding (depends PR-02) | open → functional | 3–5 days |

Each UI PR **must** include at least one cross-region CT per [testing.instructions.md](../../agents/instructions/testing.instructions.md).

### Sprint 3 — Quality / release hardening (parallel)

| PR    | ID          | Work                                                                                       | Tier target             | Estimate  |
| ----- | ----------- | ------------------------------------------------------------------------------------------ | ----------------------- | --------- |
| PR-07 | B.5 batch 1 | CT: marquee, selection cycling, clipboard cross-region (~10 gap rows)                      | open → partial          | 5–10 days |
| PR-08 | D.5–D.8     | Producer triage: first Class C mount (one format)                                          | untriaged → pass/waived | 3–5 days  |
| PR-09 | CFIO.5.5    | Format modals a11y: extend `modals-a11y.ct.tsx` to preflight/reconciliation/export options | scaffold → functional   | 2–3 days  |

### Deferred (explicitly not blocking baseline or Sprint 1–3)

- CFIO.4.1 / `lcms-wasm` CMYK (multi-week)
- CFIO.4.3 PSD full effects parity
- CFIO.5.1 / 5.3 PPTX visual CI + licensed CI mounts
- Track C package split
- Full B.5 CT closure (all 63 gap rows)

---

## Release signoff bar (future `v0.1.0` or similar)

Do **not** tag a release until all of:

1. [plan-progress.md](./plan-progress.md) open queue P0 items (UI slice minimum, B.5–B.6, D.5–D.8) at **functional** or **release** with waivers documented.
2. [cross-region-ct-inventory.md](./cross-region-ct-inventory.md): 120/120 cross-region bullets **covered** or waived.
3. [real-producer-compatibility.md](./real-producer-compatibility.md): required rows **pass** or **risk-accepted** with owner + expiry.
4. D.9 repeated on release candidate SHA.
5. [production-readiness-status.md](./production-readiness-status.md) executive status updated to “release candidate” with evidence links.

---

## Appendix A — Baseline PR scope inventory

What the baseline PR **includes** (functional tier unless noted):

| Package / area           | Included | Notes                                  |
| ------------------------ | -------- | -------------------------------------- |
| `packages/model`         | Yes      | release                                |
| `packages/playback`      | Yes      | release                                |
| `packages/renderer`      | Yes      | functional — pattern/picture stub      |
| `packages/editor`        | Yes      | functional — no io-prereqs property UX |
| `packages/ui`            | Yes      | functional — chrome + format modals    |
| `packages/demo`          | Yes      | functional — full demo app + CT suite  |
| `packages/formats`       | Yes      | functional — four formats + PDF/A      |
| `project/spec`           | Yes      | specs + acceptance criteria            |
| `project/implementation` | Yes      | plans + trackers                       |
| CI / agents / hooks      | Yes      | gate:full, husky, agent instructions   |

What the baseline PR **does not claim**:

- Production deployment readiness
- Arbitrary third-party file fidelity (Adobe/MSOffice binaries)
- Complete editor property surface for io-prereqs model fields
- Full accessibility signoff on all modals

---

## Appendix B — Option B: stacked vertical PRs (deferred)

Use only if baseline single-PR review is blocked and team accepts git cost.

| Stack PR | Contents                        | Depends on |
| -------- | ------------------------------- | ---------- |
| B1       | model + playback                | —          |
| B2       | renderer                        | B1         |
| B3       | editor + ui + demo (no formats) | B2         |
| B4       | formats/\_shared + PSD          | B3         |
| B5       | PDF + PDF/A                     | B4         |
| B6       | SVG                             | B4         |
| B7       | PPTX                            | B4         |
| B8       | docs/CI/agents                  | B7         |

Implementation requires filtered merges or cherry-picks from `dev2-phase-11` — estimate **3–5 days git work** before review starts. Not recommended given greenfield status and empty `main`.

---

## Appendix C — Tracking updates

When Phase 0 completes, update in the **same PR** as the work:

- [plan-progress.md](./plan-progress.md) — P8.G1, D.9, D.5–D.8 partial tiers
- [real-producer-compatibility.md](./real-producer-compatibility.md) — triaged rows
- [production-readiness-status.md](./production-readiness-status.md) — validation log

When Phase 1 completes:

- This file — mark Phase 0–1 checkboxes done; add merge date + PR link under Phase 1.
- [README.md](../../README.md) — branch policy

---

## Phase checklist (living)

### Phase 0 — Credibility bundle

- [x] 0.1 P8.G1 PPTX chain-round-trip test
- [x] 0.2 D.9 fresh-checkout validation log
- [x] 0.3 Class B producer triage
- [x] Phase 0 gate (`gate:full` green)

### Phase 1 — Baseline PR

- [x] PR opened (`initial-dev-phase` → `main`)
- [x] CI green
- [ ] Merged
- [ ] Post-merge doc updates
- [ ] Merge date: _TBD_
- [x] PR link: https://github.com/broadset/broadset/pull/2

### Phase 2 — Workflow switch

- [ ] Team using `main` + small feature branches
- [ ] No new long-lived `dev2-phase-*` worktrees

### Phase 3 — First post-merge PRs

- [ ] PR-01 P5.G1 PSD BsPs
- [ ] PR-02 P3.G1 pattern/picture fills
- [ ] _extend as sprints complete_
