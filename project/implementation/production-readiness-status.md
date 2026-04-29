# Production Readiness Status - 2026-04-28

This is the consolidated production-readiness status for Broadset. It replaces the dated readiness inspection, the readiness rerun report, and the release-quality closure plan.

Use this file for the current release status and the active work queue. Keep supporting detail in the focused artifacts linked below:

- [dev-audit-remediation.md](./dev-audit-remediation.md) - audit history and applied dependency overrides.
- [coverage-reporting.md](./coverage-reporting.md), [coverage-baseline.md](./coverage-baseline.md), and [coverage-thresholds-proposal.md](./coverage-thresholds-proposal.md) - coverage setup, baseline, and threshold decision.
- [cross-region-ct-inventory.md](./cross-region-ct-inventory.md) - the full cross-region acceptance inventory and CRA-2.x CT work queue.
- [real-producer-compatibility.md](./real-producer-compatibility.md) and [producer-fixture-acquisition-guide.md](./producer-fixture-acquisition-guide.md) - real producer validation matrix and fixture acquisition instructions.
- Format-specific implementation plans - [pptx-support-plan.md](./pptx-support-plan.md), [pdf-support-plan.md](./pdf-support-plan.md), [psd-support-plan.md](./psd-support-plan.md), and [svg-support-plan.md](./svg-support-plan.md).

Do not create new dated readiness reports for the same release track. Update this file instead.

## Executive Status

Broadset is not production-ready yet.

Current label: gate-clean release-candidate hardening with active export-fix work in the worktree.

Strong signals exist: package quality gates have been green, audits were cleaned, coverage reporting exists, CT inventory exists, and producer fixture governance exists. The remaining work is no longer vague; it is concentrated in import trust boundaries, export verification, cross-region CT closure, real producer compatibility, resource-budget stress proof, bundle/performance signoff, and fresh-checkout validation.

## Current Worktree Note

The worktree is currently dirty because the PSD/PDF export fix batch and this documentation consolidation are uncommitted. Do not treat earlier "worktree clean" wording from dated reports as current.

Current export-related dirty work includes:

- Demo export bridge byte slicing for PDF/PPTX/PSD blobs.
- Demo sample fixture schema canonicalization and removal of legacy fixture reliance.
- Raster download helper changes so generated files click from an attached anchor and revoke object URLs after the browser starts the download.
- PSD layer-bounds fixes that add channel bodies where Photoshop/ag-psd require them while keeping vector metadata.
- Focused PSD/raster regressions that use synthetic fixtures, not the demo sample document.
- PDF `uax14-linebreak` Vite dynamic-import hint.

Latest validation known from this workstream:

- `npm run quality -w @broadset/formats` passed after the PSD/export changes.
- Focused PSD/raster regressions passed: 5 files, 41 tests.
- `npm run quality -w @broadset/demo` passed earlier after demo fixture/export changes.
- A demo-path PSD smoke export read back non-zero bounds for representative layers.
- Full root `npm run gate:full` was rerun in this worktree and passed (2026-04-28, local run).
- Root `npm run test:coverage` passed with 278 test files and 2970 passing tests (coverage summary: statements 79.9%, branches 68.68%, functions 82.37%, lines 82.13%).
- Root `npm run audit:prod` passed with 0 vulnerabilities.
- Root `npm run audit:all` passed with 0 vulnerabilities.
- Playwright browser-path CT now verifies PDF export completion and PSD download from the demo Export modal (`packages/demo/ct/state/export-document-downloads.ct.tsx`, local run passed).
- Manual Photoshop verification is still open.

## Active Execution Queue (Live)

This queue translates the blocker list below into concrete closeout work. Keep it current in the same change where status or evidence changes.

Status values: `open`, `in-progress`, `blocked`, `done`.

| Queue ID | Priority | Work item                                   | Status      | Exit evidence required                                                                                                                                                         |
| -------- | -------- | ------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| RQ-01    | P0       | PPTX malformed-input hardening              | in-progress | High-level PPTX import path always returns controlled warnings/results for malformed ZIP / cap violations; no uncaught rejection; hostile-size tests added at public boundary. |
| RQ-02    | P0       | PDF/PSD export user-path verification       | in-progress | Browser/demo PDF + PSD download checks recorded; manual Photoshop openability notes recorded; post-fix root `npm run gate:full` recorded.                                      |
| RQ-03    | P1       | Cross-region CT gap closure                 | in-progress | `cross-region-ct-inventory.md` partial/missing rows reduced to zero or each waived with written spec-gap rationale; repeated `npm run ct:all` clean runs logged.               |
| RQ-04    | P1       | Resource-budget pre-allocation stress proof | open        | Hostile-size tests prove caps fire before expensive buffering/parsing where possible; unavoidable post-parse caps documented with residual risk and safe envelope.             |
| RQ-05    | P1       | Real producer compatibility triage          | open        | Required producer matrix rows (`PPTX`, `PDF`, `PSD`, `SVG`) moved from `untriaged` to `pass`, `waived`, or `risk-accepted` with owner + expiry where applicable.               |
| RQ-06    | P2       | Bundle and lazy-load performance signoff    | open        | Measured eager first-load and lazy first-import metrics recorded with release accept/reject decision and any follow-up split plan.                                             |
| RQ-07    | P2       | Fresh-checkout release validation           | in-progress | Clean-checkout run log includes OS + Node + npm versions and outcomes for `npm ci`, `npm run gate:full`, `npm run test:coverage`, `npm run audit:prod`, `npm run audit:all`.   |

## Readiness Scoreboard (As Of 2026-04-28)

| Signal                              | Source artifact                                                          | Current value                                                                                             | Release target                                                                                   |
| ----------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Cross-region CT closure             | [cross-region-ct-inventory.md](./cross-region-ct-inventory.md)           | 120 cross-region bullets: 77 covered, 12 partial, 31 missing; 63 open work-queue rows.                    | 120/120 covered, or explicit written waiver per non-covered row.                                 |
| Producer compatibility triage       | [real-producer-compatibility.md](./real-producer-compatibility.md)       | 44/44 matrix rows are still `untriaged` (PPTX 9, PDF 11, PSD 11, SVG 13).                                 | Required rows must be `pass`, `waived`, or `risk-accepted` with owner + expiry where applicable. |
| Post-export-fix root gate           | This file (`Current Worktree Note`)                                      | Root `npm run gate:full` rerun completed and passed in this worktree.                                     | Root `npm run gate:full` passes from this branch state.                                          |
| Coverage and audit command set      | This file (`Current Worktree Note`)                                      | `npm run test:coverage`, `npm run audit:prod`, and `npm run audit:all` all passed in this worktree.       | All release-signoff commands pass from a clean checkout run log.                                 |
| PDF/PSD real user-path verification | This file (`P0 - PDF/PSD Export Fixes Need Real User-Path Verification`) | Browser-level Playwright CT verification is done; manual Photoshop openability verification remains open. | Browser + manual-tool verification complete with recorded evidence.                              |

## Broken Or Must Fix Before Release

### P0 - Public PPTX Import Can Throw On Malformed Input

The demo-facing PPTX import path is still not safe enough for arbitrary malformed user files. The lower importer uses capped reading, but reconciliation and validation still reach the legacy uncapped OOXML ZIP reader in some paths. A malformed-byte probe has rejected with `invalid zip data` instead of returning a controlled import result with warnings.

Fix requirements:

- Route PPTX reconciliation and validation through a capped ZIP reader or a metadata-only capped reader.
- Do not run reconciliation when the base capped import has already rejected the package as unreadable.
- Add malformed ZIP, entry-cap, part-size-cap, and total-uncompressed-size tests at the high-level `importPptxDocument` or demo bridge boundary.
- Public import surfaces must return controlled warnings/results for expected hostile or malformed files, not uncaught rejected promises.

### P0 - PDF/PSD Export Fixes Need Real User-Path Verification

The current batch addresses the observed PDF no-download and Photoshop PSD zero-sized-layer regressions, but the final release proof is not done.

Fix requirements:

- Verify PDF and PSD downloads through the demo UI in a real browser or Playwright browser flow.
- Open the generated PSD in Photoshop and confirm rectangle, text, path, image/video placeholder, and group-layer behavior is usable.
- Keep the PSD tests synthetic-fixture based. Do not add tests against the demo sample document.
- Run root `npm run gate:full` after the export work and doc consolidation are complete.

### P1 - Cross-Region CT Closure Is Still Open

The cross-region inventory records 120 cross-region acceptance bullets: 77 covered, 12 partial, and 31 missing. The 43 partial/missing bullets are consolidated into 63 open work-queue rows in [cross-region-ct-inventory.md](./cross-region-ct-inventory.md).

Representative open areas:

- Rapid undo/redo alternation across canvas, layers, properties, and transform widget.
- Marquee selection still needs same-test layers + properties parity assertions.
- Inline text, path editing, clip editing, keyboard nudge, clipboard/paste, select-all, group/ungroup, layer reorder, and lock shortcut cross-region sync.

Fix requirements:

- Every partial/missing row becomes covered by a Playwright CT asserting every affected visible region in one test, or gets a written spec-gap waiver.
- Final closeout runs `npm run ct:all` repeatedly enough to catch local flake.

### P1 - Resource Budgets Need Pre-Allocation Stress Proof

Major trust boundaries now have caps, but some caps may still fire after expensive buffering, decompression, parsing, or image allocation.

Known caveats:

- `safeFetchBytes` streams and aborts when `response.body` exists, but the non-streaming fallback calls `response.arrayBuffer()` before comparing against `maxBytes`.
- PSD import enforces byte/depth/pixel caps around collection, but pixel caps run after `ag-psd` has parsed image data.
- PDF text extraction accepts `maxOperatorBytes`, but decoded page content may be read before cumulative scan budgets stop processing.
- PPTX normal import uses capped reading, but reconciliation and validation are the current outliers.

Fix requirements:

- Add hostile-size tests proving caps fire before expensive full buffering, decompression, parser recursion, or image allocation wherever dependency APIs allow.
- Where post-parse caps are unavoidable, document the dependency limitation, residual risk, maximum safe input envelope, and release decision.

### P1 - Real Producer Compatibility Is Untriaged

The matrix and fixture harness exist, but producer rows still need real pass/fail/waived/risk-accepted outcomes for PPTX, PDF, PSD, and SVG.

Fix requirements:

- Populate required Class A/B/C/D fixture coverage per [real-producer-compatibility.md](./real-producer-compatibility.md).
- Acquire private/licensed fixtures through [producer-fixture-acquisition-guide.md](./producer-fixture-acquisition-guide.md).
- Run and document producer checks for PPTX, PDF, PSD, and SVG.
- Align specs and release notes with validated behavior so Broadset does not overclaim external compatibility.

### P1 - Non-Fixture Format Fidelity Gaps Remain

These are not just fixture availability problems; they are capability or release-claim gaps that need implementation, explicit scope reduction, or documented waivers.

Open gaps:

- PSD CMYK/Lab/grayscale plus ICC profile round-trip.
- PSD 16/32-bpc preservation.
- PSD effects parity: bevel, satin, pattern overlay preservation, inner glow, and native overlays.
- PDF real shading patterns.
- PDF per-element OCG wrappers.
- PPTX visual-fidelity CI and PowerPoint-on-Windows manual sanity protocol.
- Accessibility audit for newer modals.

Fix requirement:

- Implement these capabilities, move them to explicit post-release scope with specs that do not overclaim support, or record release waivers with owner and expiry.

### P2 - Coverage Is Useful But Not A Release Gate Yet

Coverage reporting works, but it is intentionally non-gating. The latest recorded baseline is a release signal, not a CI threshold.

Known low or under-credited areas include renderer `custom-element.ts`/`fallback.ts`, formats WOFF2 decompression and PPTX chart/table/group paths, UI `template-group-panel.tsx`, and demo path/clip overlays. Some are true unit-test gaps; some are CT-covered behavior that V8 coverage cannot see.

Fix requirements:

- Refresh [coverage-baseline.md](./coverage-baseline.md) before release.
- Revisit [coverage-thresholds-proposal.md](./coverage-thresholds-proposal.md) only after cross-region CT gap closure and producer compatibility work.
- Add focused unit coverage only where it exercises real behavior CT cannot observe.

### P2 - Bundle And Performance Signoff Is Missing

The previous browser-externalized Node-module warning concern was addressed at build-output and smoke-test level, but bundle size and lazy-load performance still need release signoff.

Current watch item:

- The lazy formats chunk is intentionally large because PSD/PPTX/PDF/SVG dependencies load there. That may be acceptable, but it needs measured user impact.

Fix requirements:

- Record expected first-load and first-import costs for the eager app chunk and lazy formats chunk.
- Decide whether additional format-chunk splitting is required before release.
- Keep bundle-boundary and built-app smoke tests as release gates for avoiding accidental eager imports and Node-builtin leakage.

### P2 - Fresh-Checkout Release Validation Is Unrecorded

Local green signals are not enough for release.

Fix requirements:

- From a fresh clone or clean checkout, run `npm ci`, `npm run gate:full`, `npm run test:coverage`, `npm run audit:prod`, and `npm run audit:all`.
- Record OS, Node version, npm version, command outcomes, and private fixture validation availability in this file or the producer compatibility report.

## Release Track Status

This replaces the old closure-plan tracker.

| Track                                              | Status                           | Current artifact                                                                                 |
| -------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------ |
| D.1 Audit remediation                              | Done                             | [dev-audit-remediation.md](./dev-audit-remediation.md)                                           |
| D.2 Coverage reporting and baseline                | Done                             | [coverage-reporting.md](./coverage-reporting.md), [coverage-baseline.md](./coverage-baseline.md) |
| D.3 Cross-region CT accountability                 | Inventory done; gap closure open | [cross-region-ct-inventory.md](./cross-region-ct-inventory.md)                                   |
| D.4 Producer fixture governance and harness        | Done                             | [real-producer-compatibility.md](./real-producer-compatibility.md)                               |
| D.5 PPTX producer checks                           | Open                             | [real-producer-compatibility.md](./real-producer-compatibility.md)                               |
| D.6 PDF producer checks                            | Open                             | [real-producer-compatibility.md](./real-producer-compatibility.md)                               |
| D.7 PSD producer checks                            | Open                             | [real-producer-compatibility.md](./real-producer-compatibility.md)                               |
| D.8 SVG producer checks                            | Open                             | [real-producer-compatibility.md](./real-producer-compatibility.md)                               |
| D.9 Release closeout and fresh-checkout validation | Open                             | This file and [real-producer-compatibility.md](./real-producer-compatibility.md)                 |

## Evidence Log (Append-Only)

Record concrete closeout evidence here as it lands. Keep rows newest-first and link to the source artifact or command output location.

| Date       | Queue ID | Evidence                                                                                                            | Result | Notes                                                                                                                     |
| ---------- | -------- | ------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------- |
| 2026-04-29 | RQ-03    | `npm run ct -w @broadset/demo -- ct/state/interleaved-mutations-cross-region.ct.tsx`                                | pass   | 1/1 test passed; closed CRA-2.3 and updated inventory to 77 covered / 12 partial / 31 missing (63 open rows).            |
| 2026-04-28 | RQ-03    | `npm run ct -w @broadset/demo -- ct/canvas-transform/safety-overlays.ct.tsx ct/canvas-transform/handle-chip-constant-size.ct.tsx` | pass   | 2/2 tests passed; closed CRA-2.2 + CRA-2.72 and updated inventory to 76 covered / 12 partial / 32 missing (64 open rows). |
| 2026-04-28 | RQ-03    | `npm run ct -w @broadset/demo -- ct/layout/zoom-toolbar-label.ct.tsx ct/layout/zoom-to-fit-cross-region.ct.tsx`     | pass   | 2/2 tests passed; closed CRA-2.1 + CRA-2.73 and updated inventory to 72 covered / 16 partial / 32 missing (67 open rows). |
| 2026-04-28 | RQ-07    | Environment stamp                                                                                                   | pass   | OS macOS 26.4.1, Node v22.14.0, npm 10.9.2.                                                                               |
| 2026-04-28 | RQ-02    | `npm run ct -w @broadset/demo -- ct/state/export-document-downloads.ct.tsx`                                         | pass   | 2/2 tests passed: PDF export browser-path completion and PSD download event from demo Export modal.                       |
| 2026-04-28 | RQ-02    | Root `npm run gate:full` rerun after adding export browser-path CT coverage                                         | pass   | Full gate remains green with the new CT file included (155 CT tests in the demo/ui sweep).                                |
| 2026-04-28 | RQ-07    | Root `npm run test:coverage`                                                                                        | pass   | 278 test files passed; 2970 tests passed; coverage summary recorded in this file.                                         |
| 2026-04-28 | RQ-07    | Root `npm run audit:prod`                                                                                           | pass   | 0 vulnerabilities.                                                                                                        |
| 2026-04-28 | RQ-07    | Root `npm run audit:all`                                                                                            | pass   | 0 vulnerabilities.                                                                                                        |
| 2026-04-28 | RQ-02    | Root `npm run gate:full`                                                                                            | pass   | Full quality gate, CT, and build completed successfully in this worktree.                                                 |
| 2026-04-28 | RQ-02    | `npm run quality -w @broadset/formats`; focused PSD/raster regressions (5 files, 41 tests); demo PSD smoke readback | pass   | Export-fix stream baseline before the later full gate + browser CT closeout entries above.                                |
| 2026-04-28 | RQ-02    | `npm run quality -w @broadset/demo`                                                                                 | pass   | Ran earlier in the export-fix stream after demo bridge + fixture schema updates.                                          |

## Superseded Findings From Earlier Reports

The removed dated reports captured an older, rougher state. The following items are no longer tracked as current release blockers in this status because later work either resolved them or folded them into a broader active track:

- Dead-code/dependency hygiene blocking `gate:full` - resolved in the current gate-clean baseline.
- Dev audit advisories for PostCSS and nested Playwright CT Vite - resolved via documented root overrides.
- Coverage reporting not wired - resolved; coverage baseline and threshold proposal now exist.
- Build warnings for browser-externalized `ag-psd`/`wawoff2` Node imports - addressed by build-output changes and built-app smoke coverage.
- General real-producer fixture governance missing - resolved by the compatibility matrix and harness; actual producer validation remains open.

If any superseded item regresses, add it back above as a concrete current blocker with evidence and an owner.

## Release-Level Quality Bar

Broadset reaches release-level quality only when all of these are true:

1. `npm run gate:full` passes from a clean checkout.
2. `npm run audit:prod` and `npm run audit:all` pass, or every remaining advisory has owner/expiry risk acceptance.
3. Public import/export surfaces return controlled warnings/results for malformed external input instead of uncaught throws.
4. External file import/export paths have explicit byte, entry, depth, page, stream, pixel, decompression, and network budgets at trust boundaries.
5. Resource caps are stress-tested around hostile inputs and documented where dependency APIs force residual risk.
6. Every cross-region UI behavior is covered by CT or has an explicit spec-gap waiver.
7. Non-fixture format capability gaps are implemented, waived, or scoped out in specs and release notes.
8. Bundle size and lazy-load performance are measured and accepted for the release target.
9. Real-world producer compatibility validation is completed through the fixture governance process.
10. PDF and PSD exports are verified through the demo browser path and with real consumer tooling where required.
