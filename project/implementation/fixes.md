# Fixes Backlog From Audit — Phases 1–9

> This file lists **bugs, stale behaviors, code problems, and maintenance issues** found while auditing phases 1–9.
>
> No fixes were applied in this pass.

---

## 1) User-Visible Bugs / No-Op Behaviors

### 1.1 Animation tab is still a Phase 4 stub

- **File:** `packages/demo/src/DemoApp.tsx`
- **Evidence:** the animation tab renders the literal message `Animations are disabled in this Phase 4 demo shell.`
- **Problem:** this blocks the later animation-authoring workflow from being demo-visible even though `packages/ui/src/timeline.tsx` and `packages/ui/src/panels.tsx` already contain animation UI building blocks.

### 1.2 Preflight tab always reports success

- **File:** `packages/demo/src/DemoApp.tsx`
- **Evidence:** the preflight tab is hardcoded to render `No preflight issues detected`.
- **Problem:** the tab ignores actual document state and gives a false impression that diagnostics are implemented.

### 1.3 “Edit clip path” is a no-op action

- **File:** `packages/demo/src/DemoApp.tsx`
- **Evidence:** the context-menu action only fires `pushToast('info', 'Clip-path editing is not wired in this shell yet.')`.
- **Problem:** the UI advertises a feature that still does not perform the requested operation.

### 1.4 Export dialog is still Phase 4 / JSON-only copy

- **File:** `packages/demo/src/DemoApp.tsx`
- **Evidence:** the export dialog copy says `Export the current Phase 4 demo document as JSON for inspection or reuse.` and only offers `Download JSON`.
- **Problem:** this is stale and does not reflect the later export orchestration described in the phase plans/specs.

### 1.5 About dialog content is stale

- **File:** `packages/demo/src/DemoApp.tsx`
- **Evidence:** the About dialog still says `Broadset Phase 4 showcases...`.
- **Problem:** the app copy understates current repo scope and signals unfinished shell polish.

---

## 2) Concrete Implementation Mismatches

### 2.1 `PreflightIssue` is underspecified vs. the spec

- **File:** `packages/ui/src/panels.tsx`
- **Evidence:** `PreflightIssue` currently includes only `id`, `severity`, and `message`.
- **Problem:** `project/spec/editor/editing.md` requires diagnostics to include at least severity, element name, message, and rule identifier. The current type and UI cannot represent the full contract.

### 2.2 `ClipPathPanel` only covers presets + raw CSS

- **File:** `packages/ui/src/panels.tsx`
- **Evidence:** `ClipPathPanel` exposes preset buttons and a text input, but it has no start/stop editing props, overlay state, anchor-handle callbacks, midpoint insertion, or point-deletion flow.
- **Problem:** the visual editor widget described in `project/spec/ui/panels.md` is not implemented at the panel API level.

### 2.3 Named snapshots are absent from editor/model code

- **Files:** `packages/editor/src/**/*`, `packages/model/src/**/*`
- **Evidence:** searches for `snapshots`, `saveSnapshot`, `restoreSnapshot`, `renameSnapshot`, and `deleteSnapshot` return no named-snapshot implementation.
- **Problem:** the phase-9 named snapshot feature is still missing at both state-management and serialization levels.

### 2.4 Preflight logic is absent from the editor package

- **Files:** `packages/editor/src/**/*`
- **Evidence:** searches for `preflight`, `title-safe`, `dpi-resolution`, `small-text`, `missing-font`, etc. return no diagnostic engine implementation.
- **Problem:** the UI stub exists, but the actual rule evaluation logic is missing.

---

## 3) UI / Architecture Problems

### 3.1 Raw file input bypasses the HeroUI-first rule

- **File:** `packages/demo/src/DemoApp.tsx`
- **Evidence:** the shell renders a hidden raw `<input type="file">` directly in the main app tree.
- **Problem:** this bypasses the repo’s HeroUI-only guidance for UI chrome/form controls and keeps import flow coupled to the app shell.

### 3.2 `DemoApp.tsx` is far beyond the repo’s file-size guidance

- **File:** `packages/demo/src/DemoApp.tsx`
- **Evidence:** the file runs past line `3350+`.
- **Problem:** this violates the repo’s 500-line soft limit and bundles shell layout, state orchestration, dialogs, context menu logic, playback controls, and persistence into one maintenance hotspot.

### 3.3 `panels.tsx` is also a monolith

- **File:** `packages/ui/src/panels.tsx`
- **Evidence:** the file runs past line `3000+`.
- **Problem:** it mixes properties, layers, clip-path, preflight, animation sidebar, and helper types into one oversized UI file, making later fixes riskier.

### 3.4 Reusable later-phase UI exists but is effectively dead code in the demo

- **Files:** `packages/ui/src/timeline.tsx`, `packages/ui/src/panels.tsx`, `packages/ui/src/modals.tsx`, `packages/demo/src/DemoApp.tsx`
- **Evidence:** `TimelineBottomPanel`, `AnimationSidebar`, `PreflightPanel`, and the full modal suite are defined/exported, but `DemoApp.tsx` does not consume them.
- **Problem:** the repo is carrying implemented UI that the main demo shell never exposes, which increases maintenance cost and hides regressions.

---

## 4) Sample Data / Content Problems

### 4.1 Legacy `scorebug` naming still leaks through the sample document

- **File:** `packages/demo/src/sampleDocument.ts`
- **Evidence:** multiple IDs and labels still use `scorebug` / `cmp-scorebug-shell` naming.
- **Problem:** this keeps old sports-broadcast/tutorial baggage in the canonical sample document instead of using more neutral Broadset-branded naming.

### 4.2 Demo configuration content is still too thin for the phase-9 contract

- **Files:** `packages/demo/src/sampleDocument.ts`, `packages/editor/src/store-ui-actions.ts`
- **Evidence:** `SAMPLE_PROJECT.settings.fonts` contains only two system fonts, and the editor slice falls back to generic system fonts when config is not provided.
- **Problem:** the demo content does not yet reflect the richer font/preset/plugin/media setup the later-phase plan expects.

---

## 5) Testing / Verification Problems

### 5.1 Later-phase cross-region CT coverage is still missing

- **File:** `packages/demo/ct/demo-shell.ct.tsx`
- **Evidence:** there is a single CT file focused on shell layout, playback, context-menu bounds, and placement banner.
- **Problem:** later flows from phases 5–9 (properties -> canvas, layers -> canvas, timeline -> preview, preflight, modal workflows, persistence reloads, clip-path/motion-path editing) are not protected by CT even though the repo testing instructions explicitly call for it.

---

## Priority Candidates (if/when fixes are scheduled)

1. Replace the **animation** and **preflight** sidebar stubs in `DemoApp.tsx` with the actual later-phase UI.
2. Wire the **clip-path** action to real editing mode instead of a toast.
3. Implement **named snapshots** and the **preflight diagnostics engine**.
4. Switch the demo from custom inline dialogs to the reusable **`packages/ui/src/modals.tsx`** components.
5. Break up `DemoApp.tsx` and `panels.tsx` into smaller units before adding more features.
