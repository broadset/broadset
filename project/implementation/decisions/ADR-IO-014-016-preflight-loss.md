# ADR-IO-014/016: Severity-Aware Preflight and Intentional Export Loss

Status: proposed 2026-07-09 — does not override `project/spec/**` or current IO-D-14/16 without explicit maintainer ratification.

## Proposed decision

- Preflight findings are `info`, `warning`, or `error` with stable code, affected elements, target, explanation, and safe remediation when available.
- Fidelity warnings are overridable through an explicit proceed action and remain in the export report.
- Security violations, structurally invalid source state, unavailable required assets, and conditions known to produce an invalid canonical-target file are errors and block export.
- A static carrier may export the fully-entered IN state, but every unmappable animation produces an accessible warning naming the element/timeline, selected sample state, and a motion-capable alternative when available.
- Exporters never describe intentional loss as preserved or silently discard it.
- Internal model/kernels may land before their UI, but a new persisted author-editable field cannot become release-visible until its editor surface, accessibility, undo, and round-trip tests land in the same release slice.

## Verification

Each exporter tests warning/error classification, explicit override, blocked invalid output, report persistence, keyboard/screen-reader access, and per-element animation-loss reporting.
