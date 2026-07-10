# Coverage Baseline — 2026-04-28

Snapshot from the first `npm run test:coverage` run after `@vitest/coverage-v8` was wired into the workspace. Coverage is **non-gating** — these numbers are a release signal, not a CI threshold. See `coverage-reporting.md` for tooling; W0-QE-01/W0-PERF-01 own the risk-weighted gate decision.

Date: 2026-04-28
Vitest: 4.1.5
Provider: `@vitest/coverage-v8`
Command: `npm run test:coverage`
Reports: `coverage/index.html` (browseable), `coverage/coverage-summary.json` (machine-readable). Both git-ignored.

## Workspace total

| Metric     |      % | Covered / Total |
| ---------- | -----: | --------------- |
| Statements | 79.80% | 16,281 / 20,402 |
| Branches   | 68.58% | 9,288 / 13,542  |
| Functions  | 82.18% | 3,224 / 3,923   |
| Lines      | 82.01% | 15,204 / 18,537 |

## Per-package summary

| Package              |  Lines | Branches | Functions | Statements | Total lines |
| -------------------- | -----: | -------: | --------: | ---------: | ----------: |
| `@broadset/model`    | 88.02% |   80.73% |    96.63% |     87.80% |         977 |
| `@broadset/editor`   | 91.09% |   78.23% |    94.86% |     90.23% |       1,616 |
| `@broadset/playback` | 78.46% |   68.49% |    93.41% |     78.14% |       1,184 |
| `@broadset/renderer` | 86.53% |   70.63% |    86.99% |     85.82% |         772 |
| `@broadset/formats`  | 88.65% |   70.19% |    92.31% |     84.59% |       9,086 |
| `@broadset/ui`       | 75.29% |   67.41% |    70.31% |     74.46% |       2,307 |
| `@broadset/demo`     | 57.15% |   51.21% |    57.27% |     55.92% |       2,595 |

## Five lowest-covered files per package

### `@broadset/model`

| File                                      | Line % |
| ----------------------------------------- | -----: |
| `src/migrations/migrate-legacy-filter.ts` | 48.18% |
| `src/style.ts`                            | 81.08% |
| `src/color.ts`                            | 84.50% |
| `src/element/content-types.ts`            | 87.27% |
| `src/broadset-gradient.ts`                | 87.50% |

### `@broadset/editor`

| File                             | Line % |
| -------------------------------- | -----: |
| `src/collaboration/apply.ts`     | 61.06% |
| `src/store-actions/transform.ts` | 79.16% |
| `src/path-geometry/normalize.ts` | 85.71% |
| `src/store-ui-actions.ts`        | 86.44% |
| `src/editing/preflight.ts`       | 86.51% |

### `@broadset/playback`

| File                                      | Line % |
| ----------------------------------------- | -----: |
| `src/playback-dom/style-apply-helpers.ts` | 43.85% |
| `src/playback-dom/style-apply.ts`         | 53.06% |
| `src/playback-controller.ts`              | 73.18% |
| `src/playback-controller-utils.ts`        | 75.00% |
| `src/gradient-targets.ts`                 | 79.31% |

### `@broadset/renderer`

| File                                      | Line % |
| ----------------------------------------- | -----: |
| `src/adapters/broadset/custom-element.ts` |  0.00% |
| `src/elements/fallback.ts`                |  0.00% |
| `src/elements/_util/alignment.ts`         | 44.44% |
| `src/elements/svg.ts`                     | 57.14% |
| `src/elements/shape.ts`                   | 60.00% |

### `@broadset/formats`

| File                                 | Line % |
| ------------------------------------ | -----: |
| `src/pdf/export/woff2-decompress.ts` |  0.00% |
| `src/pptx/fixture-harness.ts`        |  0.00% |
| `src/pptx/export/group.ts`           |  0.00% |
| `src/pptx/import/chart.ts`           |  0.00% |
| `src/pptx/import/table.ts`           |  0.00% |

### `@broadset/ui`

| File                                   | Line % |
| -------------------------------------- | -----: |
| `src/template-group-panel.tsx`         |  0.00% |
| `src/inputs/angle-dial.tsx`            | 24.19% |
| `src/property-panels/media-panels.tsx` | 28.84% |
| `src/modals/format-export-options.tsx` | 32.14% |
| `src/sidebar-context-header.tsx`       | 45.00% |

### `@broadset/demo`

| File                                                | Line % |
| --------------------------------------------------- | -----: |
| `src/demo-components/path-editing-overlay.tsx`      |  5.35% |
| `src/demo-components/clip-path-editing-overlay.tsx` |  7.77% |
| `src/demo-app/use-demo-file-handlers.ts`            | 12.03% |
| `src/demo-app/layout-context-menu.tsx`              | 16.66% |
| `src/demo-app/layout-sidebar-shell.tsx`             | 26.66% |

## Observations

### Surprises and load-bearing gaps

- **Renderer `custom-element.ts` and `fallback.ts` are at 0%** — these are the React-Aria custom-element adapters and the renderer's safety-net "unknown element type" path. Worth verifying whether they ship in production builds at all; if they're dead in the renderer's main path, knip should drop them.
- **Formats `woff2-decompress.ts` is at 0%** — the static-import refactor in D.1 made the dependency visible to knip, but no unit test exercises the decompression path. The single integration test (`pdf/woff2-and-tounicode.test.ts`) loads a real WOFF2 fixture but the V8 coverage instrumentation does not credit lines reached only via dynamic ESM probing in the heavier integration suite. Worth a focused unit test once the PSD/PDF release-validation work in D.7/D.6 lands.
- **PPTX `chart.ts` / `table.ts` / `export/group.ts` are at 0%** — these are intentionally-stubbed compatibility paths that real-world PPTX corpora never trigger in our current fixtures. The producer-compatibility work in D.5 will surface fixtures that exercise these; until then, the 0% is honest "no test fires this path".
- **Demo `path-editing-overlay.tsx` (5.35%) and `clip-path-editing-overlay.tsx` (7.77%)** are predominantly Playwright-CT-covered, not unit-test covered. Coverage doesn't track CT runs (out of scope per `coverage-reporting.md`); the visible numbers undersell the actual user-flow coverage. Cross-region CT inventory in D.3 will surface whether these flows are CT-tested.
- **UI `template-group-panel.tsx` (0%)** is genuinely dead per the unit test surface — every consumer flow lives behind a feature toggle the tests don't enable. Either reach it from a CT or shrink the surface.

### Why coverage is non-gating

- The PPTX importer's `import/chart.ts` and `import/table.ts` are correctness-stubs the spec deliberately leaves opt-in until the producer-compatibility work runs. A blanket coverage gate would require speculative tests against features Broadset has not committed to shipping.
- Several panels rely on Playwright CT for their primary user-flow validation. Adding unit-level tests purely to satisfy a coverage threshold would duplicate behavioral coverage that already exists in the CT layer (which V8 unit coverage cannot see).
- The cross-region CT audit (D.3 in `production-readiness-status.md`) will surface the real coverage gaps — we want that signal to drive future test work, not a coverage threshold that conflates CT-covered and unit-covered behavior.

## How to refresh

```bash
rm -rf coverage/
npm run test:coverage
```

The HTML report is at `coverage/index.html`; click into a package to find lowest-covered files. The JSON summary at `coverage/coverage-summary.json` is what this baseline doc reads from when refreshed.

## Refresh cadence

- Run before every release to confirm no major regression.
- Re-evaluate risk-weighted thresholds under W0-QE-01/W0-PERF-01 after D.3 (cross-region CT audit) and D.5..D.8 (producer compatibility) land — those units will fill many of the lowest-covered rows above.
