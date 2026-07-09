# Coverage Thresholds Proposal — 2026-04-28

Companion to `coverage-baseline.md`. Recommends per-package, per-metric coverage floors derived from the 2026-04-28 baseline. **No threshold is wired into Vitest or `gate:full` in this unit** — this proposal is the input to a separate go/no-go decision.

## Recommendation: defer gating until D.3 + D.5..D.8 land

Adding coverage thresholds to `gate:full` today would freeze regressions that _raise_ the baseline (good) but also lock in distortions caused by:

- CT-only coverage that V8 can't see (path-editing-overlay, clip-path-editing-overlay, the layers panel's cross-region flows).
- Producer-compatibility stubs that intentionally have no test until the corresponding fixture lands (PPTX `chart.ts`, `table.ts`, `export/group.ts`).
- Migration paths (`migrate-legacy-filter.ts`, parts of `apply.ts` collaboration) whose only realistic exercise is integration-flavoured and currently lives in CT.

Wait for the cross-region CT audit (D.3) and producer-compatibility runs (D.5..D.8) to fill those rows, then re-evaluate.

## Proposed thresholds (when we eventually gate)

Each threshold is **2 percentage points below the 2026-04-28 baseline**, rounded to the nearest integer. That margin absorbs normal churn while flagging a meaningful regression. Apply per package, not workspace-wide — the demo's CT-heavy packages will always look weaker than core libraries on a unit-coverage chart.

| Package              | Lines floor | Branches floor | Functions floor | Statements floor |
| -------------------- | ----------: | -------------: | --------------: | ---------------: |
| `@broadset/model`    |         86% |            78% |             94% |              85% |
| `@broadset/editor`   |         89% |            76% |             92% |              88% |
| `@broadset/playback` |         76% |            66% |             91% |              76% |
| `@broadset/renderer` |         84% |            68% |             84% |              83% |
| `@broadset/formats`  |         86% |            68% |             90% |              82% |
| `@broadset/ui`       |         73% |            65% |             68% |              72% |
| `@broadset/demo`     |         55% |            49% |             55% |              53% |

Workspace-aggregate floor (informational only — not a CI gate even when per-package gating turns on):

| Metric     | Floor |
| ---------- | ----: |
| Lines      |   80% |
| Branches   |   66% |
| Functions  |   80% |
| Statements |   77% |

## Justification per package

- **`model`, `editor`, `formats`, `renderer`** — core libraries with strong unit-level coverage. Floors at the baseline minus 2pp catch real drops without false-flagging churn.
- **`playback`, `ui`, `demo`** — heavier CT coverage that V8 unit coverage doesn't see. Floors are deliberately lower to avoid penalizing CT-covered work; the cross-region CT inventory + Playwright coverage tooling (out of scope here) is a better signal for these.
- **Branches** — the lowest absolute number across every package (68.58% workspace, 51.21% demo). Branch coverage is the most volatile metric because adding any new conditional drops it. Floor at -2pp is permissive enough that an honest defensive-branch addition doesn't break CI.

## Go / No-Go on gate inclusion

**Recommendation: NO-GO for now.** Reasons:

1. The PPTX producer-compatibility stubs (D.5) will populate `chart.ts` / `table.ts` and add fixture rows for `import/group.ts` etc. — those will move the formats numbers up; locking the floor at today's baseline would gate every PR that bumps coverage temporarily as new stubs land.
2. Cross-region CT (D.3) will likely move some demo files from "0 unit coverage, full CT coverage" to "still 0 unit coverage, still full CT coverage" — the unit-coverage signal stays misleading until the CT audit closes.
3. The `audit:all` and `audit:prod` scripts already gate the production-risk side at release signoff. Coverage as an additional gate gives diminishing returns vs. the friction it adds to dev loop.

**Re-evaluation trigger:** revisit this proposal once D.3, D.5, D.6, D.7, and D.8 are all checked in `production-readiness-status.md`. At that point:

- Re-run `npm run test:coverage`.
- Compare each package's new baseline to the floors above.
- If the workspace median crosses 85% lines / 75% branches / 90% functions, propose the gate.
- Otherwise, re-defer with a documented reason.

## What to do if a PR drops a baseline number

1. Run `npm run test:coverage` locally.
2. Open `coverage/index.html` and confirm the lower number is in code you actually changed (not a flaky V8 instrumentation effect).
3. If the drop is real and intentional (e.g., adding a new defensive branch you can't test until upstream support lands), add a `## Spec Gaps` row in the relevant spec file naming the untestable path.
4. Update `coverage-baseline.md`'s lowest-five list for the affected package so the trend stays visible.

## Done state of this proposal

- Recommendation: NO-GO for now.
- Per-package thresholds documented for future use.
- Re-evaluation trigger named: D.3 + D.5..D.8 closure.
- No `gate:full` change in this unit.
