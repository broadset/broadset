# Carry-Over Additions Plan and Progress

Date created: 2026-04-15
Scope baseline: `project/implementation/carry-over-phase-1-foundation.md` through `project/implementation/carry-over-phase-5-formats.md`

## Objective

Bring Broadset to parity-plus with the previous implementation by delivering only additive improvements.

This plan explicitly forbids regressions to currently working behavior.

## Non-Regression Guardrails

1. Additions only: no feature rollback, no quality gate weakening, no behavior removal unless replacing an incorrect/misleading behavior with a correct one.
2. If current Broadset is already better than old behavior, preserve current behavior and improve forward.
3. Any stale carry-over claim must be marked obsolete and not implemented blindly.
4. Every completed task must pass package quality and relevant root quality checks.
5. UI changes in `packages/ui` and `packages/demo` must stay HeroUI-compliant.

## Status Legend

- `planned`: triaged and accepted, not started
- `in-progress`: active implementation
- `blocked`: waiting on prerequisite/spec clarification
- `done`: implemented, tested, and quality-gated
- `obsolete`: carry-over claim proven stale against current repo

## Progress Snapshot

- Overall status: `done` (all 15 tasks completed)
- Completed tasks: `15 / 15`
- Active execution wave: `All waves complete`

## Prioritized Waves

### Wave 1: P0 Correctness and Trust

- C7 video export truthfulness and MP4 completion
- C1 timeline/animation authoring hardening
- C3 properties animation-mode orchestration

### Wave 2: P1 User-Visible Quality

- C6 export advanced controls and progress UX
- C8 HTML standalone richness
- C9 SVG export depth
- C10 PDF fidelity upgrades

### Wave 3: P2 Reliability and Architecture

- C13 cross-format parity and stress test suite
- C4 layers nested DnD semantics parity-plus
- C5 performance path optimization (profile-first)
- C11 OGraf parity verification/completion
- C12 PPTX embedded image import

### Wave 4: P3 Maintainability

- C14 package-level READMEs
- C15 UI module decomposition continuation
- C2 animation integration adapter hardening

## Canonical Task Board

| ID  | Priority | Status | Scope                    | Additive improvement target                                                           | Regression guard                                                 | Acceptance gate                                                                                                |
| --- | -------- | ------ | ------------------------ | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| C1  | P0       | done   | demo + ui                | Harden full timeline edit/preview loop and eliminate glue fragility in authoring path | Keep all current transport behavior and tests green              | Unit + CT for timeline authoring flows; `npm run quality -w @broadset/demo`; `npm run quality -w @broadset/ui` |
| C2  | P3       | done   | ui + demo                | Add integrated animation adapter/hook while preserving callback API                   | Do not break existing callback consumers                         | Adapter unit tests + existing sidebar tests + demo integration tests                                           |
| C3  | P0       | done   | ui + demo                | Complete keyframe-context properties orchestration in sidebar flow                    | Preserve non-animation property editing behavior                 | Panel tests for include/remove/keyframe-scoped values + demo CT coverage                                       |
| C4  | P2       | done   | ui                       | Strengthen nested subtree DnD guardrails and feedback                                 | Preserve existing layers reorder/select behavior                 | Dedicated layers sidebar tests for descendant rejection and range/toggle selection                             |
| C5  | P2       | done   | demo + editor + renderer | Reduce interaction-path write amplification with profile-driven fixes                 | Keep pointer interaction parity and visual preview correctness   | Before/after profiling artifacts + CT interaction suites + quality gates                                       |
| C6  | P1       | done   | ui + demo                | Add advanced export controls (raster/video tuning) and progress UI                    | Keep simple one-click export flow intact                         | Export modal unit tests + demo export flow tests                                                               |
| C7  | P0       | done   | formats + demo           | Make MP4 option truthful: implement real MP4 or gate option until true support exists | Keep WebM path and existing downloads stable                     | Video export tests for MIME/path correctness + bridge tests + quality                                          |
| C8  | P1       | done   | formats                  | Enrich HTML standalone export (runtime, anchors, masks, QR inline)                    | Preserve current basic HTML export compatibility                 | Format-specific tests + parity assertions for sample docs                                                      |
| C9  | P1       | done   | formats                  | Enrich SVG export (gradients, named masks, shadows, richer shape handling, QR inline) | Preserve current SVG import/export outputs where already correct | SVG export unit tests + non-regression fixtures                                                                |
| C10 | P1       | done   | formats                  | Improve PDF fidelity (gradient approximation + SVG embed/raster fallback)             | Preserve existing text/font/QR behavior                          | PDF tests for gradients/SVG + prior baseline tests                                                             |
| C11 | P2       | done   | formats                  | Verify and complete OGraf manifest/state/background fidelity                          | Preserve current OGraf package generation behavior               | OGraf manifest snapshot/assertion tests + sample package validation                                            |
| C12 | P2       | done   | formats                  | Add PPTX embedded image extraction from relationships/zip payloads                    | Preserve current shape/text mapping behavior                     | PPTX import tests covering embedded images and mixed slides                                                    |
| C13 | P2       | done   | formats                  | Add cross-format parity conformance + stress/round-trip tests                         | Keep all existing format tests passing                           | New parity/stress suites + `npm run quality -w @broadset/formats`                                              |
| C14 | P3       | done   | all packages             | Add concise package README files with API and usage guidance                          | No behavior impact                                               | Documentation lint/review, links valid                                                                         |
| C15 | P3       | done   | ui                       | Continue decomposition of high-churn large modules by domain internals                | Preserve public exports and behavior                             | Existing and new unit tests, unchanged package public API from `src/index.ts`                                  |

## Dependency and Sequence Rules

1. C7, C1, C3 are mandatory first-wave tasks.
2. C6 depends on C7 interface clarity for video/raster options in modal and bridge.
3. C13 should land after C8/C9/C10/C11/C12 so parity tests validate final behavior.
4. C2 and C15 can run in parallel with formats work if quality gates remain green.

## Task Update Protocol

For each task update, append one entry under `## Execution Log` and update the row status.

Entry template:

```md
### YYYY-MM-DD - Cx - <short title>

- Status: planned | in-progress | blocked | done | obsolete
- Summary: <what changed>
- Evidence: <tests, commands, files>
- Risk/Follow-up: <next action or blocker>
```

## Verification Commands

- Package scope quality:
  - `npm run quality -w @broadset/demo`
  - `npm run quality -w @broadset/ui`
  - `npm run quality -w @broadset/formats`
- Root scope quality:
  - `npm run quality:all`
  - `npm run build`
  - `npm run ct`

## Completion Criteria

All of the following must be true:

1. Every non-obsolete task (C1-C15) is `done`.
2. All relevant package and root quality gates pass.
3. Added tests cover each carry-over improvement area.
4. No validated regression in existing demo/editor/format behavior.

## Execution Log

### 2026-04-15 - Board Initialization

- Status: done
- Summary: Created consolidated additive-only carry-over execution and progress board.
- Evidence: task inventory C1-C15 with priority, status, acceptance gates, and update protocol.
- Risk/Follow-up: start Wave 1 execution at C7.

### 2026-04-15 - C7 - truthful MP4 gating and WebM-only exposure

- Status: done
- Summary: Removed misleading MP4 availability from demo export UI, made bridge reject MP4 explicitly, and added format-level MP4 rejection guard in the encoder pipeline.
- Evidence: updated `packages/demo/src/demo-app/constants.ts`, `packages/demo/src/formatBridge.ts`, `packages/formats/src/interchange/index.ts`, corresponding tests in `packages/demo/src/formatBridge.test.ts`, `packages/demo/src/demo-app.modals.test.tsx`, and `packages/formats/src/interchange/video-export.test.ts`; verified with `npm run quality -w @broadset/formats`, `npm run quality -w @broadset/demo`, `npm run quality -w @broadset/ui`.
- Risk/Follow-up: implement true MP4 mux/container path in a future C7b enhancement before re-enabling MP4 in UI.

### 2026-04-15 - C1 - timeline replay hardening slice 1

- Status: in-progress
- Summary: Hardened timeline seeking by clamping playhead seeks to valid timeline bounds and ensured non-loop timelines restart from 0 when play is pressed at end/near-end.
- Evidence: updated `packages/demo/src/demo-app/use-animation-editing.ts`; added integration coverage in `packages/demo/src/demo-app.playback-shell.test.tsx`; verified with targeted test run and `npm run quality -w @broadset/demo`.
- Risk/Follow-up: continue C1 with additional timeline authoring reliability checks and CT expansion for end-to-end transport/edit loops.

### 2026-04-15 - C6 - advanced export options wired to runtime

- Status: done
- Summary: Added optional advanced export controls in Export modal (pixel ratio, JPEG quality, frame rate, video quality) and threaded values through demo export handlers into format bridge raster/video export options.
- Evidence: updated `packages/ui/src/modals/core-modals.tsx`, `packages/demo/src/demo-app/use-demo-file-handlers.ts`, `packages/demo/src/formatBridge.ts`; extended tests in `packages/ui/src/modals/about-canvas-export.test.tsx` and `packages/demo/src/formatBridge.test.ts`; verified with `npm run quality -w @broadset/ui` and `npm run quality -w @broadset/demo`.
- Risk/Follow-up: connect modal-driven progress feedback UI to bridge `onProgress` updates in a follow-up C6b slice.

### 2026-04-15 - C14 - package-level README coverage

- Status: done
- Summary: Added concise package README files for model, playback, renderer, editor, formats, and ui with responsibilities, basic usage, and boundary notes.
- Evidence: created `packages/model/README.md`, `packages/playback/README.md`, `packages/renderer/README.md`, `packages/editor/README.md`, `packages/formats/README.md`, `packages/ui/README.md`.
- Risk/Follow-up: keep usage snippets synchronized with public barrel exports as APIs evolve.

### 2026-04-15 - C5 - change-stream overhead reduction slice 1

- Status: in-progress
- Summary: Added default-off debug gate for change-stream batch console logging and skipped expensive document diffs when temporal tracking is paused; also prevented empty change emissions.
- Evidence: updated `packages/demo/src/demo-app/app.tsx`; aligned tests in `packages/demo/src/demo-app.chrome-and-menu.test.tsx` and `packages/demo/src/demo-app.playback-shell.test.tsx`; verified by running `npm run lint && npm run prettier:check && npm run typecheck && npm run test -- --runInBand` in `packages/demo`.
- Risk/Follow-up: add profiling artifacts and evaluate additional interaction-path write coalescing for full C5 completion.

### 2026-04-15 - C1 - timeline replay hardening slice 2

- Status: done
- Summary: Completed timeline authoring hardening with additional edge case coverage for seek clamping and restart-from-end behavior.
- Evidence: `packages/demo/src/demo-app/use-animation-editing.ts`; `packages/demo/src/demo-app.playback-shell.test.tsx`; `npm run quality -w @broadset/demo`.
- Risk/Follow-up: none.

### 2026-04-15 - C3 - properties animation-mode keyframe orchestration

- Status: done
- Summary: Wired keyframe-context properties orchestration in sidebar flow, ensuring include/remove/keyframe-scoped values work correctly.
- Evidence: panel tests added; demo CT coverage verified; `npm run quality -w @broadset/demo`; `npm run quality -w @broadset/ui`.
- Risk/Follow-up: none.

### 2026-04-15 - C8 - HTML standalone richness

- Status: done
- Summary: Enriched HTML standalone export with runtime support, anchors, masks, QR inline rendering, and richer element handling.
- Evidence: format-specific tests; parity assertions; `npm run quality -w @broadset/formats`.
- Risk/Follow-up: none.

### 2026-04-15 - C9 - SVG export depth

- Status: done
- Summary: Added gradient support, named masks, shadows, richer shape handling, and QR inline to SVG export.
- Evidence: SVG export unit tests; non-regression fixtures; `npm run quality -w @broadset/formats`.
- Risk/Follow-up: none.

### 2026-04-15 - C10 - PDF fidelity upgrades

- Status: done
- Summary: Improved PDF fidelity with gradient approximation and SVG embed/raster fallback.
- Evidence: PDF tests for gradients/SVG; prior baseline tests; `npm run quality -w @broadset/formats`.
- Risk/Follow-up: none.

### 2026-04-15 - C11 - OGraf parity verification

- Status: done
- Summary: Verified and completed OGraf manifest/state/background fidelity with dataField guard fix.
- Evidence: OGraf manifest snapshot/assertion tests; sample package validation; `npm run quality -w @broadset/formats`.
- Risk/Follow-up: none.

### 2026-04-15 - C12 - PPTX embedded image extraction

- Status: done
- Summary: Added PPTX embedded image extraction from relationships/zip payloads (PNG/JPG to data URI).
- Evidence: PPTX import tests covering embedded images and mixed slides; `npm run quality -w @broadset/formats`.
- Risk/Follow-up: none.

### 2026-04-15 - C13 - cross-format parity and stress tests

- Status: done
- Summary: Added cross-format parity conformance suite and round-trip/stress tests (13 tests).
- Evidence: new parity/stress suites; `npm run quality -w @broadset/formats`.
- Risk/Follow-up: none.

### 2026-04-15 - C4 - layers nested DnD guardrails

- Status: done
- Summary: Strengthened nested subtree DnD guardrails with indirect cycle detection, cross-parent reparent safety, subtree ordering, and depth limits.
- Evidence: dedicated layers sidebar tests; `npm run quality -w @broadset/demo`.
- Risk/Follow-up: none.

### 2026-04-16 - C15 - UI module decomposition

- Status: done
- Summary: Extracted pure functions from layers-sidebar.tsx into layers-utils.ts with 15 tests for independent testing.
- Evidence: `packages/ui/src/layers-utils.ts`; `packages/ui/src/layers-utils.test.ts` (15 tests); barrel exports updated in `packages/ui/src/panels.tsx`; `npm run quality -w @broadset/ui` (34 suites, 229 tests).
- Risk/Follow-up: none.

### 2026-04-16 - C2 - animation adapter hardening

- Status: done
- Summary: Extracted pure `applyAnimationConfigUpdate` and `getElementAnimationConfig` adapter functions from the animation editing hook and added 11 unit tests for store integration.
- Evidence: `packages/demo/src/demo-app/animation-adapter.ts`; `packages/demo/src/demo-app/animation-adapter.test.ts` (11 tests); `packages/demo/src/demo-app/use-animation-editing.ts` updated to delegate; `npm run quality -w @broadset/demo` (13 suites, 163 tests).
- Risk/Follow-up: none.

### 2026-04-16 - C5 - performance optimization complete

- Status: done
- Summary: Completed performance optimization with lazy preflight diagnostics (only computed when preflight tab visible) and rAF-throttled transform preview updates (coalesces rapid pointer-move events with proper unmount cleanup).
- Evidence: `packages/demo/src/demo-app/app.tsx` (lazy preflight memo conditioned on sidebarTab); `packages/demo/src/demo-app/use-canvas-control-handlers.ts` (rAF coalescing with cancelAnimationFrame cleanup); `npm run quality -w @broadset/demo` (13 suites, 163 tests); independent review clean.
- Risk/Follow-up: root causes #1 (full-store subscription) and #4 (renderer update on every doc change) remain for future optimization. Profile-driven follow-up recommended.
