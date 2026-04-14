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

- Overall status: `in-progress` (planning completed)
- Completed tasks: `1 / 15`
- Active execution wave: `Wave 1 (P0 correctness)`

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

| ID  | Priority | Status  | Scope                    | Additive improvement target                                                           | Regression guard                                                 | Acceptance gate                                                                                                |
| --- | -------- | ------- | ------------------------ | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| C1  | P0       | planned | demo + ui                | Harden full timeline edit/preview loop and eliminate glue fragility in authoring path | Keep all current transport behavior and tests green              | Unit + CT for timeline authoring flows; `npm run quality -w @broadset/demo`; `npm run quality -w @broadset/ui` |
| C2  | P3       | planned | ui + demo                | Add integrated animation adapter/hook while preserving callback API                   | Do not break existing callback consumers                         | Adapter unit tests + existing sidebar tests + demo integration tests                                           |
| C3  | P0       | planned | ui + demo                | Complete keyframe-context properties orchestration in sidebar flow                    | Preserve non-animation property editing behavior                 | Panel tests for include/remove/keyframe-scoped values + demo CT coverage                                       |
| C4  | P2       | planned | ui                       | Strengthen nested subtree DnD guardrails and feedback                                 | Preserve existing layers reorder/select behavior                 | Dedicated layers sidebar tests for descendant rejection and range/toggle selection                             |
| C5  | P2       | planned | demo + editor + renderer | Reduce interaction-path write amplification with profile-driven fixes                 | Keep pointer interaction parity and visual preview correctness   | Before/after profiling artifacts + CT interaction suites + quality gates                                       |
| C6  | P1       | planned | ui + demo                | Add advanced export controls (raster/video tuning) and progress UI                    | Keep simple one-click export flow intact                         | Export modal unit tests + demo export flow tests                                                               |
| C7  | P0       | done    | formats + demo           | Make MP4 option truthful: implement real MP4 or gate option until true support exists | Keep WebM path and existing downloads stable                     | Video export tests for MIME/path correctness + bridge tests + quality                                          |
| C8  | P1       | planned | formats                  | Enrich HTML standalone export (runtime, anchors, masks, QR inline)                    | Preserve current basic HTML export compatibility                 | Format-specific tests + parity assertions for sample docs                                                      |
| C9  | P1       | planned | formats                  | Enrich SVG export (gradients, named masks, shadows, richer shape handling, QR inline) | Preserve current SVG import/export outputs where already correct | SVG export unit tests + non-regression fixtures                                                                |
| C10 | P1       | planned | formats                  | Improve PDF fidelity (gradient approximation + SVG embed/raster fallback)             | Preserve existing text/font/QR behavior                          | PDF tests for gradients/SVG + prior baseline tests                                                             |
| C11 | P2       | planned | formats                  | Verify and complete OGraf manifest/state/background fidelity                          | Preserve current OGraf package generation behavior               | OGraf manifest snapshot/assertion tests + sample package validation                                            |
| C12 | P2       | planned | formats                  | Add PPTX embedded image extraction from relationships/zip payloads                    | Preserve current shape/text mapping behavior                     | PPTX import tests covering embedded images and mixed slides                                                    |
| C13 | P2       | planned | formats                  | Add cross-format parity conformance + stress/round-trip tests                         | Keep all existing format tests passing                           | New parity/stress suites + `npm run quality -w @broadset/formats`                                              |
| C14 | P3       | planned | all packages             | Add concise package README files with API and usage guidance                          | No behavior impact                                               | Documentation lint/review, links valid                                                                         |
| C15 | P3       | planned | ui                       | Continue decomposition of high-churn large modules by domain internals                | Preserve public exports and behavior                             | Existing and new unit tests, unchanged package public API from `src/index.ts`                                  |

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
