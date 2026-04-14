# QA Analysis - Package-by-Package (Refreshed)

Date: 2026-04-14 22:10
Scope: model, playback, renderer, editor, formats, ui, demo
Method: targeted refresh against current code and spec state after remediation commits.

## Verification Baseline

- Validation includes code and spec inspection plus package quality verification for playback and demo.
- This refresh reflects completed QA remediation work that landed after the prior snapshot.

## Severity Legend

- HIGH: likely to block acceptance gates or create user-visible behavior gaps.
- MEDIUM: meaningful quality risk or significant maintainability/documentation drift.
- LOW: cleanup/naming/ergonomics issues with limited immediate impact.

## 1) @broadset/model

### Findings

No active findings.

### Resolved Since Prior Snapshot

- Document mode runtime immutability is now explicitly guarded and covered by tests.

### Strengths

- Model contract remains aligned with spec reference shape and invariants.
- Validation and tests remain strong.

## 2) @broadset/playback

### Findings

No active findings.

### Resolved Since Prior Snapshot

- Legacy registry naming was removed from controller and validation API:
  - `validateAnimationDefinitions(...)` replaces `validateAnimationRegistry(...)`
  - `setAnimations(...)` replaces `setRegistry(...)`
  - create options now use `animations` instead of `registry`

### Strengths

- Package boundary remains correct (`model` only).
- Controller lifecycle and validation tests remain green.

## 3) @broadset/renderer

### Findings

No active QA-gap findings from the prior report remain open.

### Resolved Since Prior Snapshot

- Renderer spec gaps previously listed for incremental updates and broken image fallback were closed and reflected in spec notes.

### Ongoing Risk (Maintainability)

- Medium-sized implementation files remain in the screen-renderer split modules and should continue to be monitored.

## 4) @broadset/editor

### Findings

No active implementation gap findings from the prior report remain open.

### Resolved Since Prior Snapshot

- Store-actions spec gaps were synchronized with existing automation for descendant promotion, snapshots, and clipboard flows.

### Ongoing Risk (Maintainability)

- `keyboard.ts` remains near the soft module-size threshold and may merit further decomposition when touched.

## 5) @broadset/formats

### Findings

No active implementation gap findings from the prior report remain open.

### Resolved Since Prior Snapshot

- Unified warning contract is now represented through document import result wiring and surfaced through demo import handling.
- PDF/PSD animated-static-export spec gaps were updated to reference existing tests.

### Ongoing Risk (Maintainability)

- Large converter modules remain candidates for incremental split when changed.

## 6) @broadset/ui

### Findings

No active high-severity findings from the prior report remain open.

### Resolved Since Prior Snapshot

- Dedicated UI package Playwright CT now exists.
- UI spec references were aligned with current split test paths.

### Ongoing Risk (Maintainability)

- Near-threshold panel modules remain and should be kept under active review during feature work.

## 7) @broadset/demo

### Findings

No active high-severity findings from the prior report remain open.

### Resolved Since Prior Snapshot

- Timeline editor and animation-sidebar callbacks are wired to real animation editing actions.
- Hidden native file input exception is now explicitly documented in demo layout spec.
- Save-menu visibility contract is now covered by automated test (Save hidden when `onSave` is not configured).

### Ongoing Risk (Maintainability)

- Complexity hotspot remains centered in split app/layout modules; continue phased extraction when changes are made.

## Cross-Package Systemic Findings

1. LOW - Continued spec/document drift prevention is required.

- As refactors land, corresponding spec gap notes and implementation docs must be updated in the same change window.

2. LOW - Maintainability hotspots are now primarily module-size concerns, not functional acceptance gaps.

## Recommended Next Sequence

1. Keep `project/spec/**` and implementation docs synchronized as part of each feature PR.
2. Continue incremental module decomposition in near-threshold files when touched for feature work.
3. Keep CT matrix ownership and status current in `project/implementation/component-testing.md` as scenarios evolve.

## Appendix: Evidence Snapshot

- Source/spec inspection in `project/spec/**`, `project/implementation/**`, and `packages/**`.
- Verified package quality for playback and demo after playback naming updates and demo menu test additions.
