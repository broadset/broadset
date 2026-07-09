# Production Readiness Status - 2026-07-09

This is the consolidated production-readiness status for Broadset. It replaces the dated readiness inspection, the readiness rerun report, and the release-quality closure plan.

Use this file for the current release status and the active work queue. Keep supporting detail in the focused artifacts linked below:

- [dev-audit-remediation.md](./dev-audit-remediation.md) - audit history and applied dependency overrides.
- [coverage-reporting.md](./coverage-reporting.md) and [coverage-baseline.md](./coverage-baseline.md) - coverage setup and baseline; W0-QE-01/W0-PERF-01 own the risk-weighted coverage and performance-gate decision.
- [cross-region-ct-inventory.md](./cross-region-ct-inventory.md) - the full cross-region acceptance inventory and CRA-2.x CT work queue.
- [real-producer-compatibility.md](./real-producer-compatibility.md) and [producer-fixture-acquisition-guide.md](./producer-fixture-acquisition-guide.md) - real producer validation matrix and fixture acquisition instructions.
- Format execution status - [plan-progress.md](./plan-progress.md) §Format tracks; format behavior specs in `project/spec/formats/`.

Do not create new dated readiness reports for the same release track. Update this file instead.

## Executive Status

Broadset is not production-ready yet.

Current label: **baseline-ready functional PR** (#2, `initial-dev-phase` → `main`) with format round-trip scaffolding functional and release signoff work concentrated in cross-region CT closure, licensed/manual real producer triage, io-prereqs editor UI, and remaining high-fidelity format gaps.

Strong signals exist: package quality gates have been green, audits were cleaned, coverage reporting exists, CT inventory exists, and producer fixture governance exists. The remaining work is no longer vague; it is tracked in tiered form in [plan-progress.md](./plan-progress.md).

## Current Worktree Note

Use `git status --short` for the actual current worktree state. Do not infer clean/dirty status from dated notes in this file.

## Last Recorded Validation (historical evidence)

Fresh validation for the 2026-07-07 main-integration credibility bundle was run in a clean copied directory at `/tmp/broadset-phase0-validation` from the `dev2-phase-11` source working tree after `npm ci` (no `node_modules`, `.git`, coverage, or corpus cache copied from the source workspace). The baseline content was then squashed onto `main` as PR #2 (`initial-dev-phase` → `main`). GitHub validation for PR #2 is the merge gate for the committed branch tip.

- Environment: macOS 26.5.2 (25F84), Node v25.2.1, npm 11.6.2.
- `npm ci` passed; install audit summary reported the known one low dev-only advisory tracked in [dev-audit-remediation.md](./dev-audit-remediation.md).
- `npm run gate:full` passed: type coverage 99.95%; package strict gates passed; formats strict included 141 passed / 8 skipped files and 1,156 passed / 8 skipped tests; UI CT passed 7/7; demo CT passed 160/160; production build passed.
- `npm run test:coverage` passed with 281 passed / 8 skipped test files and 2,973 passed / 8 skipped tests. Coverage summary: statements 79.53%, branches 68.53%, functions 82.20%, lines 81.76%.
- `npm run audit:prod` passed with 0 vulnerabilities.
- `npm run audit:all` returned the known low dev-only `esbuild@0.27.7` advisory under `@playwright/experimental-ct-react`; owner/expiry risk acceptance remains in [dev-audit-remediation.md](./dev-audit-remediation.md).

These command outcomes were recorded on `dev2-phase-11` before the 2026-07-07 tracker reconciliation. PR #2 GitHub checks were green on 2026-07-09: Quality gate, PDF/A conformance via veraPDF, PPTX ECMA-376 XSD validation, and LibreOffice PPTX openability. After any pre-merge amend, the new PR branch tip must be green before merge. Re-run full clean-checkout validation before release signoff:

- `npm run quality -w @broadset/formats` passed after the PDF/PSD/SVG hardening changes.
- Focused PSD/raster regressions passed: 5 files, 41 tests.
- `npm run quality -w @broadset/demo` passed earlier after demo fixture/export changes.
- A demo-path PSD smoke export read back non-zero bounds for representative layers.
- Full root `npm run gate:full` was rerun in this worktree and passed (2026-04-28, local run).
- Root `npm run quality:all` passed in this worktree on 2026-06-21 with 287 package test files, 3,101 passing tests, and 3 skipped tests.
- `npm run corpus:fetch -w @broadset/formats` fetched commit-pinned public corpora into gitignored `.cache/` directories: 9 PDF (veraPDF), 29 PPTX (Apache POI/Tika/python-pptx), 11 PSD (psd-tools), and 8 SVG (WPT) fixtures. Focused corpus verification passed with 5 files and 138 tests.
- Root `npm run test:coverage` passed with 278 test files and 2970 passing tests (coverage summary: statements 79.9%, branches 68.68%, functions 82.37%, lines 82.13%).
- Root `npm run audit:prod` / `npm audit --omit=dev` passed with 0 vulnerabilities on 2026-06-21.
- Full root `npm audit` currently reports one low dev-only advisory for nested `esbuild@0.27.7` under `@playwright/experimental-ct-react`; production runtime is unaffected. Risk acceptance is tracked in [dev-audit-remediation.md](./dev-audit-remediation.md).
- Playwright browser-path CT now verifies PDF export completion and PSD download from the demo Export modal (`packages/demo/ct/state/export-document-downloads.ct.tsx`, local run passed).
- Manual Photoshop verification is still open.

## Active Execution Queue (Live)

This queue translates the blocker list below into concrete closeout work. Keep it current in the same change where status or evidence changes.

Status values: `open`, `in-progress`, `blocked`, `done`.

| Queue ID | Priority | Work item                                   | Status      | Exit evidence required                                                                                                                                                                       |
| -------- | -------- | ------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RQ-00    | P0       | Proposed contracts ratified or rejected     | open        | A maintainer explicitly resolves each W0-RFC-01 proposal; only ratified behavior is reconciled into specs and later implemented with release evidence, while rejected proposals are removed. |
| RQ-01    | P0       | PPTX malformed-input hardening              | done        | High-level PPTX import path always returns controlled warnings/results for malformed ZIP / cap violations; no uncaught rejection; hostile-size tests added at public boundary.               |
| RQ-02    | P0       | PDF/PSD export user-path verification       | in-progress | Browser/demo PDF + PSD download checks recorded; manual Photoshop openability notes recorded; post-fix root `npm run gate:full` recorded.                                                    |
| RQ-03    | P1       | Cross-region CT gap closure                 | in-progress | `cross-region-ct-inventory.md` partial/missing rows reduced to zero or each waived with written spec-gap rationale; repeated `npm run ct:all` clean runs logged.                             |
| RQ-04    | P1       | Resource-budget pre-allocation stress proof | open        | Hostile-size tests prove caps fire before expensive buffering/parsing where possible; unavoidable post-parse caps documented with residual risk and safe envelope.                           |
| RQ-05    | P1       | Real producer compatibility triage          | in-progress | Required producer matrix rows (`PPTX`, `PDF`, `PSD`, `SVG`) moved from `untriaged` to `pass`, `waived`, or `risk-accepted` with owner + expiry where applicable.                             |
| RQ-06    | P2       | Bundle and lazy-load performance signoff    | open        | Measured eager first-load and lazy first-import metrics recorded with release accept/reject decision and any follow-up split plan.                                                           |
| RQ-07    | P2       | Fresh-checkout release validation           | done        | Clean-checkout run log includes OS + Node + npm versions and outcomes for `npm ci`, `npm run gate:full`, `npm run test:coverage`, `npm run audit:prod`, `npm run audit:all`.                 |

## Readiness Scoreboard (As Of 2026-07-09)

| Signal                              | Source artifact                                                          | Current value                                                                                                                                                    | Release target                                                                                                              |
| ----------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Cross-region CT closure             | [cross-region-ct-inventory.md](./cross-region-ct-inventory.md)           | 120 cross-region bullets: 77 covered, 12 partial, 31 missing; 64 open work-queue rows.                                                                           | 120/120 covered, or explicit written waiver per non-covered row.                                                            |
| Producer compatibility triage       | [real-producer-compatibility.md](./real-producer-compatibility.md)       | 16 generated/public matrix rows are `pass`; 30 licensed/manual/release-hardening rows remain `untriaged`.                                                        | Required rows must be `pass`, `waived`, or `risk-accepted` with owner + expiry where applicable.                            |
| Post-export-fix root gate           | [plan-progress.md](./plan-progress.md) + Last Recorded Validation below  | Root `npm run gate:full` passed from `/tmp/broadset-phase0-validation` on 2026-07-07; PR #2 Quality gate passed on GitHub on 2026-07-09.                         | Root `npm run gate:full` passes from a clean checkout run log.                                                              |
| Coverage and audit command set      | Last Recorded Validation below                                           | `npm run test:coverage` and `npm audit --omit=dev` pass from clean validation; full `npm audit` has one low dev-only advisory with owner/expiry risk acceptance. | All release-signoff commands pass from a clean checkout run log, or residual advisories carry owner/expiry risk acceptance. |
| PDF/PSD real user-path verification | This file (`P0 - PDF/PSD Export Fixes Need Real User-Path Verification`) | Browser-level Playwright CT verification is done; manual Photoshop openability verification remains open.                                                        | Browser + manual-tool verification complete with recorded evidence.                                                         |

## Broken Or Must Fix Before Release

### P0 - Proposed Target Contracts Require Ratification and Implementation

The timing, typed-text/security, component, canonical `.bsp`, resolved-scene, collaboration-change, and shared preflight contracts are roadmap/ADR proposals. Current `project/spec/**` remains authoritative until an authorized maintainer ratifies a proposal and applies any required behavioral spec change. The architecture status table records the proposal/runtime boundary. Release claims, UI labels, file extensions, MIME types, compatibility matrices, and documentation MUST describe current specified runtime behavior until both ratification and executable release evidence exist.

Fix requirements:

- Implement the shared rational timebase/duration/sampling helpers and cross-package conformance suite under W0-TIME-01/W1-TIME-01.
- Migrate persisted rich text from sanitized HTML strings to inert plain strings/typed `TextBody` and DOM-safe run rendering under W1-SEC-01/W1-TEXT-01/W2-TEXT-01.
- Implement the resolved scene and component registry/instance model under W1-SCENE-01/W2-COMP-01.
- Implement checksummed ZIP `.bsp`, asset integrity, atomic persistence, recovery, and raw JSON representation separation under W1-ASSET-01/W1-PERSIST-01.
- Complete atomic project diff/apply/invert and common structured preflight/loss reporting under W0-COLLAB-01/02, W2-DOC-01, and W3-RECON-01.

### P0 - Public PPTX Import Can Throw On Malformed Input (Resolved 2026-06-21)

The demo-facing PPTX import path now routes normal import, reconciliation, and validation through the capped OOXML ZIP reader. Malformed ZIP bytes and cap violations return controlled warning/result objects rather than uncaught `invalid zip data` rejections.

Closure evidence:

- `importPptxWithReport`, `importPptxWithMerge`, `reconcilePptx`, `readPreservedPptxDocument`, and `validatePptxPackage` use capped package reads.
- `importPptxDocument` returns controlled warnings for malformed bytes and public entry-count cap hits.
- Focused regression command passed: `npm run test -w @broadset/formats -- src/pptx/import-resource-caps.test.ts src/pptx/importer-fuzz.test.ts src/pptx/reconcile.test.ts src/pptx/validate.test.ts src/import-document.test.ts`.

### P0 - PDF/PSD Export Fixes Need Real User-Path Verification

The current batch addresses the observed PDF no-download and Photoshop PSD zero-sized-layer regressions, but the final release proof is not done.

Fix requirements:

- Verify PDF and PSD downloads through the demo UI in a real browser or Playwright browser flow.
- Open the generated PSD in Photoshop and confirm rectangle, text, path, image/video placeholder, and group-layer behavior is usable.
- Keep the PSD tests synthetic-fixture based. Do not add tests against the demo sample document.
- Run root `npm run gate:full` after the export work and doc consolidation are complete.

### P1 - Cross-Region CT Closure Is Still Open

The cross-region inventory records 120 cross-region acceptance bullets: 77 covered, 12 partial, and 31 missing. The 43 partial/missing bullets are consolidated into 64 open work-queue rows in [cross-region-ct-inventory.md](./cross-region-ct-inventory.md).

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
- PDF text extraction accepts `maxOperatorBytes` and now applies it stream-by-stream before regex scanning, but each individual PDF content stream is still materialized by `pdf-lib` before Broadset can compare its decoded size.
- PPTX normal import, reconciliation, and validation now use capped reading; keep future stress work focused on dependency limits and real large-package fixtures rather than this former outlier.

Fix requirements:

- Add hostile-size tests proving caps fire before expensive full buffering, decompression, parser recursion, or image allocation wherever dependency APIs allow.
- Where post-parse caps are unavoidable, document the dependency limitation, residual risk, maximum safe input envelope, and release decision.

### P1 - Real Producer Compatibility Needs Licensed/Manual Completion

The matrix and fixture harness exist, and the initial baseline pass moved 16 generated/public rows to `pass`. Licensed private mounts, latest desktop producer outputs, and manual chain protocols still need real pass/fail/waived/risk-accepted outcomes for PPTX, PDF, PSD, and SVG.

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
- PSD per-layer `BsPs` export (document XMP fast path exists; layer tags not written on export).
- PDF third-party import depth beyond text extraction (raster, vectors, rich-text runs).
- PDF ICC-based CMYK/Lab/spot emission (device fallback today).
- PPTX unit chain round-trip test + visual-fidelity CI and PowerPoint-on-Windows manual sanity protocol.
- io-prereqs editor UI features (theme, FilterStack, picture/pattern fill, prepress panel, …) — see [plan-progress.md](./plan-progress.md) UI.1–UI.15.
- Cross-region CT gap closure — see [cross-region-ct-inventory.md](./cross-region-ct-inventory.md).
- Accessibility audit for format modals (preflight, reconciliation, import warnings, export options).

Fix requirement:

- Implement these capabilities, move them to explicit post-release scope with specs that do not overclaim support, or record release waivers with owner and expiry.

### P2 - Coverage Is Useful But Not A Release Gate Yet

Coverage reporting works, but it is intentionally non-gating. The latest recorded baseline is a release signal, not a CI threshold.

Known low or under-credited areas include renderer `custom-element.ts`/`fallback.ts`, formats WOFF2 decompression and PPTX chart/table/group paths, UI `template-group-panel.tsx`, and demo path/clip overlays. Some are true unit-test gaps; some are CT-covered behavior that V8 coverage cannot see.

Fix requirements:

- Refresh [coverage-baseline.md](./coverage-baseline.md) before release.
- Revisit risk-weighted coverage thresholds under W0-QE-01/W0-PERF-01 after cross-region CT gap closure and producer compatibility work.
- Add focused unit coverage only where it exercises real behavior CT cannot observe.

### P2 - Bundle And Performance Signoff Is Missing

The previous browser-externalized Node-module warning concern was addressed at build-output and smoke-test level, but bundle size and lazy-load performance still need release signoff.

Current watch item:

- The lazy formats chunk is intentionally large because PSD/PPTX/PDF/SVG dependencies load there. That may be acceptable, but it needs measured user impact.

Fix requirements:

- Record expected first-load and first-import costs for the eager app chunk and lazy formats chunk.
- Decide whether additional format-chunk splitting is required before release.
- Keep bundle-boundary and built-app smoke tests as release gates for avoiding accidental eager imports and Node-builtin leakage.

### P2 - Fresh-Checkout Release Validation Is Recorded For Baseline

The 2026-07-07 baseline credibility run recorded clean-directory validation for the pending baseline diff. Repeat from a committed branch-tip clone before release tag signoff.

Fix requirements:

- Before release tag signoff, repeat from a fresh clone or clean checkout of the committed branch tip: `npm ci`, `npm run gate:full`, `npm run test:coverage`, `npm run audit:prod`, and `npm run audit:all`.
- Record OS, Node version, npm version, command outcomes, and private fixture validation availability in this file or the producer compatibility report.

## Release Track Status

This replaces the old closure-plan tracker.

| Track                                              | Status                           | Current artifact                                                                                 |
| -------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------ |
| D.1 Audit remediation                              | Done                             | [dev-audit-remediation.md](./dev-audit-remediation.md)                                           |
| D.2 Coverage reporting and baseline                | Done                             | [coverage-reporting.md](./coverage-reporting.md), [coverage-baseline.md](./coverage-baseline.md) |
| D.3 Cross-region CT accountability                 | Inventory done; gap closure open | [cross-region-ct-inventory.md](./cross-region-ct-inventory.md)                                   |
| D.4 Producer fixture governance and harness        | Done                             | [real-producer-compatibility.md](./real-producer-compatibility.md)                               |
| D.5 PPTX producer checks                           | Functional baseline              | [real-producer-compatibility.md](./real-producer-compatibility.md)                               |
| D.6 PDF producer checks                            | Functional baseline              | [real-producer-compatibility.md](./real-producer-compatibility.md)                               |
| D.7 PSD producer checks                            | Functional baseline              | [real-producer-compatibility.md](./real-producer-compatibility.md)                               |
| D.8 SVG producer checks                            | Functional baseline              | [real-producer-compatibility.md](./real-producer-compatibility.md)                               |
| D.9 Release closeout and fresh-checkout validation | Functional baseline              | This file and [real-producer-compatibility.md](./real-producer-compatibility.md)                 |

## Evidence Log (Append-Only)

Record concrete closeout evidence here as it lands. Keep rows newest-first and link to the source artifact or command output location.

| Date       | Queue ID | Evidence                                                                                                                                                                                     | Result             | Notes                                                                                                                                                                                              |
| ---------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-07-09 | RQ-03    | Browser smoke from PR #2 worktree: opacity edit, child layer hide, solid/gradient fill switch, timeline context/scrub/reset                                                                  | pass               | Score Bug opacity stayed stable at 0.5 while hiding Home Color Bar; solid/gradient rendered without frame-to-frame jumps; Score Bug In timeline controls were timeline-scoped and scrubbed live.   |
| 2026-07-09 | RQ-07    | PR #2 (`initial-dev-phase` → `main`) GitHub checks: Quality gate, PDF/A conformance via veraPDF, PPTX ECMA-376 XSD validation, LibreOffice PPTX openability                                  | pass               | Baseline PR is green and mergeable as a functional baseline; release-level producer/manual/tooling gaps remain tracked below.                                                                      |
| 2026-07-07 | RQ-07    | Clean copied-directory validation from `/tmp/broadset-phase0-validation`: `npm ci`, `npm run gate:full`, `npm run test:coverage`, `npm run audit:prod`, `npm run audit:all`                  | pass/risk-accepted | macOS 26.5.2, Node v25.2.1, npm 11.6.2. `gate:full`, coverage, and prod audit passed; full audit reports known low dev-only `esbuild@0.27.7` advisory risk-accepted in `dev-audit-remediation.md`. |
| 2026-07-07 | RQ-05    | Initial producer triage in [real-producer-compatibility.md](./real-producer-compatibility.md); focused generated/public harness commands for PPTX/PDF/PSD/SVG                                | pass               | 16 generated/public rows now `pass`; licensed/private/manual producer rows remain untriaged and must not be claimed as release signoff.                                                            |
| 2026-06-21 | RQ-05    | `npm run corpus:fetch -w @broadset/formats`; focused corpus tests; `npm run quality:all`                                                                                                     | pass               | Fetched 57 public corpus fixtures into gitignored `.cache/` directories (PDF 9, PPTX 29, PSD 11, SVG 8). Focused corpus suite passed 138 tests; root quality passed with 287 files / 3,101 tests.  |
| 2026-06-21 | RQ-03    | `npm run ct:all`                                                                                                                                                                             | pass               | 167 CT tests passed (7 UI + 160 demo) after the PDF/PSD/SVG hardening continuation. Existing Vite Node-externalization warnings for `wawoff2` remain non-fatal.                                    |
| 2026-06-21 | RQ-07    | `npm run quality:all`                                                                                                                                                                        | pass               | 280 package test files passed, 4 skipped; 2,991 tests passed, 4 skipped after the PDF/PSD/SVG hardening continuation. Local workspace run, not fresh-checkout proof.                               |
| 2026-06-21 | RQ-04    | PDF/PSD/SVG focused hardening tests                                                                                                                                                          | pass               | `font-fetch-hardening`, PDF stream-granular operator cap, PSD embedded smart-object option behavior, and shared SVG sanitizer unsafe-URL regression tests passed. Includes cached font cap.        |
| 2026-06-21 | RQ-07    | `npm audit`                                                                                                                                                                                  | risk-accepted      | One low dev-only advisory remains: `esbuild@0.27.7` nested under `@playwright/experimental-ct-react`; `npm audit fix` makes no change. Owner/expiry recorded in `dev-audit-remediation.md`.        |
| 2026-06-21 | RQ-07    | `npm audit --omit=dev`                                                                                                                                                                       | pass               | 0 production vulnerabilities.                                                                                                                                                                      |
| 2026-06-21 | RQ-07    | `npm run quality:all`                                                                                                                                                                        | pass               | 279 package test files passed, 4 skipped; 2,984 tests passed, 4 skipped. Local workspace run, not fresh-checkout proof.                                                                            |
| 2026-06-21 | RQ-07    | `npm run quality -w @broadset/formats`                                                                                                                                                       | pass               | Lint, typecheck, and 141 format test files passed; 1,175 tests passed, 4 skipped. Local workspace run, not fresh-checkout proof.                                                                   |
| 2026-06-21 | RQ-04    | PSD/PDF hardening focused tests                                                                                                                                                              | pass               | PSD parser detail, placeholder warning, XMP mismatch warning, async image byte cap, PDF unsupported-filter, malformed/password, and attachment-warning regressions passed.                         |
| 2026-06-21 | RQ-01    | `npm run test -w @broadset/formats -- src/pptx/import-resource-caps.test.ts src/pptx/importer-fuzz.test.ts src/pptx/reconcile.test.ts src/pptx/validate.test.ts src/import-document.test.ts` | pass               | 37 PPTX/import-dispatch tests passed; covers malformed ZIP, entry cap, part cap, total uncompressed cap, reconciliation, validation, and public import warnings.                                   |
| 2026-06-21 | RQ-03    | `npm run ct:all`                                                                                                                                                                             | pass               | 167 CT tests passed (7 UI + 160 demo) after the import/export hardening and dependency refresh. Does not close remaining inventory gaps.                                                           |
| 2026-04-29 | RQ-03    | `npm run ct -w @broadset/demo -- ct/state/interleaved-mutations-cross-region.ct.tsx`                                                                                                         | pass               | 1/1 test passed; closed CRA-2.3 and updated inventory to 77 covered / 12 partial / 31 missing. Later row-count reconciliation records 64 open work-queue rows.                                     |
| 2026-04-28 | RQ-03    | `npm run ct -w @broadset/demo -- ct/canvas-transform/safety-overlays.ct.tsx ct/canvas-transform/handle-chip-constant-size.ct.tsx`                                                            | pass               | 2/2 tests passed; closed CRA-2.2 + CRA-2.72 and updated inventory to 76 covered / 12 partial / 32 missing (64 open rows).                                                                          |
| 2026-04-28 | RQ-03    | `npm run ct -w @broadset/demo -- ct/layout/zoom-toolbar-label.ct.tsx ct/layout/zoom-to-fit-cross-region.ct.tsx`                                                                              | pass               | 2/2 tests passed; closed CRA-2.1 + CRA-2.73 and updated inventory to 72 covered / 16 partial / 32 missing (67 open rows).                                                                          |
| 2026-04-28 | RQ-07    | Environment stamp                                                                                                                                                                            | pass               | OS macOS 26.4.1, Node v22.14.0, npm 10.9.2.                                                                                                                                                        |
| 2026-04-28 | RQ-02    | `npm run ct -w @broadset/demo -- ct/state/export-document-downloads.ct.tsx`                                                                                                                  | pass               | 2/2 tests passed: PDF export browser-path completion and PSD download event from demo Export modal.                                                                                                |
| 2026-04-28 | RQ-02    | Root `npm run gate:full` rerun after adding export browser-path CT coverage                                                                                                                  | pass               | Full gate remains green with the new CT file included (155 CT tests in the demo/ui sweep).                                                                                                         |
| 2026-04-28 | RQ-07    | Root `npm run test:coverage`                                                                                                                                                                 | pass               | 278 test files passed; 2970 tests passed; coverage summary recorded in this file.                                                                                                                  |
| 2026-04-28 | RQ-07    | Root `npm run audit:prod`                                                                                                                                                                    | pass               | 0 vulnerabilities.                                                                                                                                                                                 |
| 2026-04-28 | RQ-07    | Root `npm run audit:all`                                                                                                                                                                     | pass               | 0 vulnerabilities.                                                                                                                                                                                 |
| 2026-04-28 | RQ-02    | Root `npm run gate:full`                                                                                                                                                                     | pass               | Full quality gate, CT, and build completed successfully in this worktree.                                                                                                                          |
| 2026-04-28 | RQ-02    | `npm run quality -w @broadset/formats`; focused PSD/raster regressions (5 files, 41 tests); demo PSD smoke readback                                                                          | pass               | Export-fix stream baseline before the later full gate + browser CT closeout entries above.                                                                                                         |
| 2026-04-28 | RQ-02    | `npm run quality -w @broadset/demo`                                                                                                                                                          | pass               | Ran earlier in the export-fix stream after demo bridge + fixture schema updates.                                                                                                                   |

## Superseded Findings From Earlier Reports

The removed dated reports captured an older, rougher state. The following items are no longer tracked as current release blockers in this status because later work either resolved them or folded them into a broader active track:

- Dead-code/dependency hygiene blocking `gate:full` - resolved in the current gate-clean baseline.
- Dev audit advisories for PostCSS and nested Playwright CT core Vite - resolved via documented root overrides. A newer dev-only nested Playwright CT React `esbuild` advisory remains tracked in [dev-audit-remediation.md](./dev-audit-remediation.md).
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
