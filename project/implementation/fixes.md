# Fixes Backlog From Audit — Phases 1–9

> This file lists **bugs, stale behaviors, code problems, and maintenance issues** found while auditing phases 1–9.
>
> All actionable fixes have been applied. Only 5.1 (CT coverage) remains as an acknowledged gap.

---

## 1) User-Visible Bugs / No-Op Behaviors

### ✅ 1.1 Animation tab is still a Phase 4 stub

- **Fixed in:** `8b95710` — wire AnimationSidebar into animation tab replacing Phase 4 stub

### ✅ 1.2 Preflight tab always reports success

- **Fixed in:** `a9fc1de` — enrich PreflightIssue; preflight diagnostics engine wired in DemoApp

### ✅ 1.3 "Edit clip path" is a no-op action

- **Fixed in:** `77f2465` — wire clip-path editing context menu action to startClipPathEditing

### ✅ 1.4 Export dialog is still Phase 4 / JSON-only copy

- **Fixed in:** prior DemoApp/modal work — ExportModal from packages/ui now used

### ✅ 1.5 About dialog content is stale

- **Fixed in:** prior DemoApp/modal work — AboutModal from packages/ui now used

---

## 2) Concrete Implementation Mismatches

### ✅ 2.1 `PreflightIssue` is underspecified vs. the spec

- **Fixed in:** `a9fc1de` — PreflightIssue now includes severity, message, elementName, ruleId

### ✅ 2.2 `ClipPathPanel` only covers presets + raw CSS

- **Fixed in:** `77f2465` — clip-path editing wired through editor's startClipPathEditing

### ✅ 2.3 Named snapshots are absent from editor/model code

- **Status:** Already implemented in packages/editor/src/store-actions.ts (saveSnapshot, restoreSnapshot, renameSnapshot, deleteSnapshot, MAX_SNAPSHOTS=20)

### ✅ 2.4 Preflight logic is absent from the editor package

- **Status:** Already implemented in packages/editor/src/editing.ts (runPreflightDiagnostics with 7 rules)

---

## 3) UI / Architecture Problems

### ✅ 3.1 Raw file input bypasses the HeroUI-first rule

- **Fixed in:** `af80d3c` — DemoApp decomposition

### ✅ 3.2 `DemoApp.tsx` is far beyond the repo's file-size guidance

- **Fixed in:** `af80d3c` — decomposed into demo-types.ts, demo-utils.ts, demo-components.tsx

### ✅ 3.3 `panels.tsx` is also a monolith

- **Fixed in:** `6e1a229` + `6aad9f5` — decomposed into panel-types.tsx, property-panels.tsx, properties-sidebar.tsx, layers-sidebar.tsx, animation-sidebar.tsx, template-group-panel.tsx

### ✅ 3.4 Reusable later-phase UI exists but is effectively dead code in the demo

- **Fixed in:** multiple commits — AnimationSidebar (8b95710), PreflightPanel (a9fc1de), all 7 modals wired, TimelineBottomPanel (b61339c)

---

## 4) Sample Data / Content Problems

### ✅ 4.1 Legacy `scorebug` naming still leaks through the sample document

- **Fixed in:** `0bdd20c` — rename legacy scorebug IDs to info-panel

### ✅ 4.2 Demo configuration content is still too thin for the phase-9 contract

- **Fixed in:** `e2b15ca` — upgrade sample project fonts from 2 system to 5 URL-sourced web fonts

---

## 5) Testing / Verification Problems

### ⬜ 5.1 Later-phase cross-region CT coverage is still missing

- **Status:** Acknowledged gap. Playwright CT coverage for later-phase cross-region workflows (properties→canvas, layers→canvas, timeline→preview, preflight, modal workflows) is not yet implemented. This requires dedicated CT authoring effort beyond the current scope.
