# Production Readiness Rerun - 2026-04-28

This report describes only the current worktree state.

## Executive Verdict

Broadset is gate-clean and materially organized for release hardening, but it is not yet at final release quality.

`npm run gate:full`, `npm run test:coverage`, `npm run audit:prod -- --json`, and `npm run audit:all -- --json` all pass in the current worktree. Coverage reporting exists, audit remediation is documented, the cross-region CT inventory exists, and producer fixture governance plus the shared private-fixture harness are present.

The release blocker is now validation closure: the CT inventory still has open partial/missing cross-region flows, the real producer compatibility matrix is still untriaged, warning/bundle output is not quiet, and the branch is heavily dirty. Broadset should be treated as release-candidate hardening, not production release ready.

Current readiness label: gate-clean release-candidate hardening. Not final production release quality.

## Current Grade

| Area                          | Grade | Current State                                                                                                                                 |
| ----------------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Overall production readiness  | B     | Formal gates, coverage, and audits pass; release validation and clean-branch proof remain.                                                    |
| Gate health                   | A-    | `npm run gate:full` passes, Knip is clean, and type coverage is above threshold. Warning-level build and CT output remains.                   |
| Runtime security posture      | B+    | SVG sanitization, safe fetch, PDF operator caps, and PSD depth/pixel caps exist. Pre-decompression/allocation limits still need stress proof. |
| External format compatibility | C+    | Format support is broad, but the real producer matrix is untriaged and release signoff is pending.                                            |
| Test surface                  | B+    | Unit, CT, and coverage signals are strong. CT traceability is inventoried, but 22 partial and 33 missing cross-region bullets remain.         |
| Operational release posture   | B-    | Production and full audits are clean. Fresh-checkout validation, warning hygiene, bundle posture, and dirty-worktree cleanup remain.          |

## Verified Current Facts

| Check                          | Result             | Notes                                                                                                                                         |
| ------------------------------ | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run gate:full`            | Pass               | Includes `quality:strict`, `lint:dead`, `lint:typecoverage`, `ct:all`, and `build`.                                                           |
| `npm run quality:strict`       | Pass               | Gate unit counts: demo 187, editor 427, formats 1150 with 5 skipped, model 603, playback 84, renderer 93, ui 421.                             |
| `npm run lint:dead`            | Pass               | Knip reports no issues.                                                                                                                       |
| `npm run lint:typecoverage`    | Pass               | `(219658 / 219745) 99.96%`, above the 99.95 gate.                                                                                             |
| `npm run ct:all`               | Pass               | UI CT passes 7/7. Demo CT passes 148/148.                                                                                                     |
| `npm run build`                | Pass with warnings | Build completes. Warnings remain for browser-externalized `ag-psd`/`wawoff2` Node modules and chunks above 500 kB.                            |
| `npm run test:coverage`        | Pass               | 276 test files passed with 5 skipped; 2965 tests passed with 5 skipped. Workspace coverage: 79.84% statements, 68.63% branches, 82.05% lines. |
| `npm run audit:prod -- --json` | Pass               | 0 production vulnerabilities.                                                                                                                 |
| `npm run audit:all -- --json`  | Pass               | 0 total vulnerabilities after root overrides for PostCSS and nested Playwright CT Vite.                                                       |
| Cross-region CT inventory      | Partial            | 14 spec files, 261 acceptance bullets, 120 cross-region; 65 covered, 22 partial, 33 missing, consolidated into 74 CRA-2.x work items.         |
| Real producer compatibility    | Partial            | Governance, matrix, and fixture harness exist; PPTX/PDF/PSD/SVG rows are still `untriaged` and release signoff is pending.                    |
| Worktree state                 | Dirty              | Many modified and untracked files are present. The gate proves the current workspace, not a clean release branch.                             |

## Release-Level Quality Bar

A release-level Broadset build should meet all of these conditions:

1. Formal gate stays green from a clean branch.
2. Production and dev dependency audits are clean, or any remaining advisory has written owner/expiry risk acceptance.
3. Test and build output is quiet enough that new warnings are actionable.
4. External file import/export paths have explicit byte, entry, depth, page, stream, pixel, decompression, and network budgets at trust boundaries.
5. Real-world producer files are validated for PPTX, PDF, PSD, and SVG, including large-file and malformed-file cases.
6. Every cross-region UI behavior is covered by CT or has an explicit spec-gap waiver.
7. Bundle size and browser externalization warnings are fixed or documented as intentional release exceptions.
8. Documentation/spec gaps match the shipped behavior and do not overclaim external compatibility.

## Required Work To Reach Release Level

### 1. Close Cross-Region CT Gaps

The CT inventory is now the authoritative work queue. It identifies 120 cross-region acceptance bullets: 65 covered, 22 partial, and 33 missing. Those 55 partial/missing bullets are consolidated into 74 CRA-2.x work items in `cross-region-ct-inventory.md`.

Release expectation:

- Every partial/missing row becomes covered by a Playwright CT that asserts all affected UI regions in one test, or gets an explicit spec-gap waiver.
- CT closure lands in focused batches, preferably no more than five small flow fixes at a time.
- Final cross-region closeout runs `npm run ct:all` repeatedly enough to catch local flakes.

### 2. Run Real Producer Compatibility Checks

The compatibility report has governance, fixture classes, storage rules, and producer rows for PPTX, PDF, PSD, and SVG. The shared producer-fixture harness can load committed and private mounted fixtures and fail hard under `RELEASE_VALIDATION=1` when required private fixtures are absent.

Current open items:

- PPTX, PDF, PSD, and SVG producer rows are still `untriaged`.
- Required Class A/B/C/D fixture coverage has not reached release signoff.
- Manual protocols and private fixture mounts have not been executed and recorded.

Release expectation:

- Every required producer row is `pass`, `waived`, or `risk-accepted` with a documented reason.
- Release notes and specs state validated support honestly.
- Private/licensed fixtures remain outside the repo and are validated only through the approved mount path.

### 3. Stress-Prove Trust-Boundary Budgets

The obvious stale risks in the prior report are now handled in code: PDF image export uses `safeFetchBytes`; PDF third-party text extraction accepts `maxOperatorBytes`; PSD import enforces `maxDepth` and `maxTotalPixels` while surfacing warnings.

Remaining release hardening is about proving those caps fire early enough under hostile inputs:

- PDF operator extraction still decodes stream bytes before comparing the cumulative budget, so compressed-stream expansion needs stress coverage and, if feasible, pre/post-decode accounting.
- `safeFetchBytes` streams with a cap when `response.body` is available, but its non-streaming fallback buffers via `response.arrayBuffer()` before checking the cap.
- PSD still calls `readPsd(..., { useImageData: true })`; the importer caps collected layer pixels after `ag-psd` has parsed the file, so very large pixel allocations need release stress proof.
- Large PPTX deck, large PDF, large PSD, hostile SVG, malformed stream, and remote asset cases need compatibility-report evidence rather than only unit-level assertions.

Release expectation:

- Oversized external files and remote assets fail safely or degrade with explicit warnings.
- Caps are enforced before expensive decompression, parsing, image allocation, or full response buffering wherever the dependency APIs allow it.
- Fuzz/stress tests and producer-corpus runs cover cap boundaries.

### 4. Make Warning Output Release-Clean

The formal gate passes, but routine output still contains warning-level noise.

Current warnings to address or document:

- Vite CT hint recommending `@vitejs/plugin-react-oxc`.
- Production build warnings for browser-externalized `ag-psd` `util` imports.
- Production build warnings for browser-externalized `wawoff2` `fs`/`path` imports.
- Production chunks above the 500 kB warning threshold.

Release expectation:

- Routine test/build output is quiet.
- Remaining warnings are documented release exceptions with owners and follow-up tickets.

### 5. Decide Coverage Threshold Timing

Coverage reporting is wired and documented. The current proposal correctly keeps coverage non-gating until CT gap closure and producer compatibility work land.

Release expectation:

- Refresh `coverage-baseline.md` before release.
- Revisit `coverage-thresholds-proposal.md` after the CT and producer-compatibility tracks close.
- Do not wire thresholds into `gate:full` until the team accepts the proposal.

### 6. Stabilize Release Engineering

The current branch is not a final release branch until it is clean, repeatable, and documented.

Current open items:

- Worktree is heavily dirty with many modified and untracked files.
- Fresh-checkout `npm ci` plus `npm run gate:full` has not been recorded for this state.
- Bundle size and browser externalization warnings remain.
- Producer compatibility signoff is pending.

Release expectation:

- Release candidate branch is clean and committed.
- `npm ci`, `npm run gate:full`, `npm run audit:prod`, and `npm run audit:all` are reproducible on a fresh checkout.
- Private fixture validation is either run in release mode or explicitly unavailable with a release decision.

## Recommended Release Path

1. Keep `npm run gate:full`, `npm run audit:prod`, and `npm run audit:all` green after every change.
2. Close the 74 CRA-2.x cross-region CT work items or document explicit spec-gap waivers.
3. Execute the producer compatibility matrix for PPTX, PDF, PSD, and SVG, then update rows to `pass`, `waived`, or `risk-accepted`.
4. Stress-test trust-boundary budgets around PDF decompression, safe-fetch non-streaming responses, PSD pixel allocation, large PPTX decks, and hostile SVG graphs.
5. Resolve or document CT/build warning noise and bundle-size warnings.
6. Refresh coverage, reconsider thresholds only after CT/producer closure, and keep coverage non-gating until accepted.
7. Freeze a clean release-candidate branch and rerun fresh-checkout validation.

## Bottom Line

Broadset has crossed from basic gate-clean into structured release hardening: audits are clean, coverage exists, CT gaps are inventoried, and producer validation has a governance/harness path. It should still not be called production-ready until cross-region CT gaps are closed or waived, real producer compatibility rows are triaged, resource budgets are stress-proven, warning output is release-clean, and the result is verified from a clean checkout.
