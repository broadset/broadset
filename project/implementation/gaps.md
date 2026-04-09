# Gaps Audit — Phases 1–9

> Review scope: `plan-phase-1.md` through `plan-phase-9.md`, related specs under `project/spec/**`, and the current implementation in `packages/**`.
>
> Phases **10** and **11** were intentionally skipped per request.
>
> This file lists **implementation/spec/plan gaps** only. No fixes were applied in this pass.

---

## Executive Summary

- **Phases 1–4** look largely present and usable at the core engine level.
- The biggest remaining gaps are in the **later vertical slices**: animation authoring/demo wiring, clip-path and motion-path authoring UX, preflight diagnostics, named snapshots, and the full phase-9 demo configuration.
- Several later-phase UI pieces exist in `packages/ui`, but the demo shell in `packages/demo/src/DemoApp.tsx` still exposes **Phase 4-era stubs** instead of the newer flows.
- Plan/status tracking is also stale in multiple places, especially around **phase 9**.

---

## Phase-by-Phase Findings

### Phase 1 — Model

- **No major high-confidence blocking implementation gap found in the core model layer during this pass.**
- **Bookkeeping gap:** model/spec acceptance checkboxes remain unchecked in several spec files even though `project/implementation/plan-phase-1.md` marks the units green. The implementation looks present, but the spec-tracking state is stale.

### Phase 2 — Renderer + Demo Shell

- **No major renderer-core functional gap found in the current static renderer slice during this pass.**
- **Coverage gap:** the repo has only one Playwright CT file, `packages/demo/ct/demo-shell.ct.tsx`, so later cross-region behaviors described in the testing instructions are not covered end-to-end.

### Phase 3 — Playback + Demo Animated

- **The playback slice is in place, but the documentation/progress tracking is stale.** `project/implementation/plan-phase-3.md` still uses ambiguous/stale progress markers even though the code and tests for playback are present.

### Phase 4 — Editor MVP

- **The demo shell still carries Phase 4 placeholder copy in later-phase UI surfaces.** In `packages/demo/src/DemoApp.tsx`, the animation tab, export dialog copy, and about dialog still explicitly describe the app as a **Phase 4** shell (`"Animations are disabled in this Phase 4 demo shell."`, `"Export the current Phase 4 demo document..."`, `"Broadset Phase 4 showcases..."`).
- This is not a phase-4 engine failure, but it shows that later phases did not fully replace the earlier demo shell scaffolding.

### Phase 5 — Rich Properties & Layers

- **Core properties/layers inputs are implemented, but later-phase demo wiring remains incomplete.** `PropertiesSidebar` and `LayersSidebar` are used in the demo, but the later animation/preflight/sidebar evolution did not fully land in `DemoApp.tsx`.
- **Plan bookkeeping mismatch:** in `project/implementation/plan-phase-5.md`, the group summary table marks all groups complete, but the 5-A demo milestone inside the section is still unchecked.

### Phase 6 — Keyboard, Text & Interaction Polish

- **Most keyboard/clipboard/context-menu work appears present**, but the plan bookkeeping is stale.
- **Plan bookkeeping mismatch:** `project/implementation/plan-phase-6.md` still shows 6-C and 6-D as not started in the progress table even though the feature-group checklists above are marked complete and the corresponding code/tests exist.
- **Coverage gap:** the CT suite does not yet exercise the later phase-6 cross-region flows that the repo testing instructions call for (keyboard -> canvas/properties/layers updates, context menu -> canvas/layers/property changes, etc.).

### Phase 7 — Animation Authoring

#### Confirmed gaps

1. **The timeline authoring UI exists but is not mounted anywhere in the demo.**
   - `packages/ui/src/timeline.tsx` exports `TimelineBottomPanel` and related timeline authoring UI.
   - A repo-wide search shows `TimelineBottomPanel` is only defined there and is not used elsewhere.
   - `packages/demo/src/DemoApp.tsx` imports only `TimelineEditingProvider`, not the actual timeline panel UI.

2. **The animation sidebar exists but is not wired into the demo.**
   - `packages/ui/src/panels.tsx` exports `AnimationSidebar`.
   - A repo-wide search shows `AnimationSidebar` is only defined there and is never used elsewhere.
   - In `packages/demo/src/DemoApp.tsx`, the animation tab still renders a static message: `Animations are disabled in this Phase 4 demo shell.`

#### Effect on the phase plan

- The phase-7 plan marks the timeline UI, easing graph, and animation sidebar demo milestones as complete, but the current demo shell still exposes only the earlier playback controls and a disabled animation tab message.

### Phase 8 — Path & Vector Tools

#### Confirmed gaps

1. **Clip-path editing is only partially implemented.**
   - `packages/ui/src/panels.tsx` `ClipPathPanel` currently supports preset buttons and a raw CSS input.
   - It does **not** expose the visual edit-mode toggle or the canvas overlay workflow required by `project/spec/ui/panels.md` (anchor handles, midpoint insertion, point deletion, interactive overlay lifecycle).

2. **The demo shell still treats clip-path editing as a no-op.**
   - In `packages/demo/src/DemoApp.tsx`, the canvas context-menu action for `Edit clip path` only shows the toast: `Clip-path editing is not wired in this shell yet.`

3. **Motion-path authoring is not surfaced through the UI/demo shell.**
   - `packages/editor/src/editing.ts` includes `startMotionPathEditing()` / `stopMotionPathEditing()` helpers.
   - However, a search across `packages/ui/src/**/*.{ts,tsx}` and `packages/demo/src/DemoApp.tsx` shows no motion-path authoring controls or panel wiring, so the phase-8 demo milestone remains open in practice.

### Phase 9 — Data, Collaboration, Modals & Demo Polish

#### 9-A to 9-D: partially implemented but unevenly wired

- Live data, change-stream logging, local save/restore, toasts, sidebar persistence, and fullscreen support are already present in `packages/demo/src/DemoApp.tsx`.
- However, the demo shell still relies on simplified phase-4-style dialogs and stub tabs instead of the full later-phase UI package surfaces.

#### 9-E — Named Snapshots

- **Missing entirely.**
- `project/spec/editor/store-actions.md` defines a full named-snapshot requirement (`create`, `restore`, `rename`, `delete`, `limit = 20`, serialization round-trip).
- A search across `packages/editor/src/**/*.{ts,tsx}` and `packages/model/src/**/*.{ts,tsx}` shows no named snapshot storage or document-schema support (`snapshots`, `saveSnapshot`, `restoreSnapshot`, `renameSnapshot`, `deleteSnapshot` are absent).

#### 9-F — Preflight Diagnostics

- **The diagnostic engine is missing, and the demo tab is only a stub.**
- `project/spec/editor/editing.md` requires rule evaluation for `title-safe`, `dpi-resolution`, `bleed`, `small-text`, `color-mode`, `unsupported-property`, plus a `missing-font` rule.
- A search across `packages/editor/src/**/*.{ts,tsx}` finds no preflight rule engine.
- `packages/ui/src/panels.tsx` contains a minimal `PreflightPanel`, but it is not used anywhere outside its own file/tests.
- `packages/demo/src/DemoApp.tsx` currently hardcodes a success chip: `No preflight issues detected`.

#### 9-D / 9-G — Modal suite and demo orchestration

1. **All seven reusable modal components exist in `packages/ui/src/modals.tsx`, but the demo does not use them.**
   - `AboutModal`, `CanvasSettingsModal`, `ExportModal`, `MediaLibraryModal`, `NewDocumentModal`, `ShortcutHelpModal`, and `TemplateBrowserModal` are all defined there.
   - A repo-wide search shows they are not consumed outside their definition file.
   - `packages/demo/src/DemoApp.tsx` instead maintains its own simplified `activeDialog` flow with only `about`, `export`, `new-document`, `settings`, and `shortcuts`.
   - `MediaLibrary` and `TemplateBrowser` are absent from the demo shell.

2. **Import/export orchestration is still JSON-only in the demo shell.**
   - `handleImportFileChange()` parses JSON and `handleSaveAsJson()` downloads JSON in `packages/demo/src/DemoApp.tsx`.
   - The later phase-9 flow for feature-gated, cached exporter loading is not wired here.

#### 9-G — Demo Config

- **The full demo config spec is still not satisfied.**
- `project/spec/demo/config.md` requires:
  - at least **5 web fonts with URLs**,
  - preset categories for **Broadcast / Print / Social Media / Commercial / Large Format**,
  - at least one **required element**,
  - a configured **media source**,
  - at least one real **custom component plugin**.
- Current evidence:
  - `packages/demo/src/sampleDocument.ts` `SAMPLE_PROJECT.settings.fonts` only lists **2 system fonts** (`Inter`, `Barlow Condensed`), not 5 downloadable web fonts.
  - `packages/editor/src/store-ui-actions.ts` falls back to four generic system fonts when no `allowedFonts` are provided.
  - `packages/demo/src/DemoApp.tsx` creates the store with `createEditorStore()` and does not pass a rich phase-9 config object.
  - The demo’s `countdown` tool is appended directly in `ELEMENT_TOOL_TYPES`, but there is no real `ComponentPlugin` registration in the demo package with `rendererFactory`, `propertyPanel`, defaults, and capabilities.

---

## Cross-Cutting Testing Gaps

1. **CT coverage is far behind the spec surface area.**
   - The repo currently has a single component-test file: `packages/demo/ct/demo-shell.ct.tsx`.
   - It covers shell rendering, playback, context-menu bounds, and placement mode, but it does **not** cover the later cross-region flows required by `.github/instructions/testing.instructions.md`.

2. **Missing CT scenarios for later phases include (at minimum):**
   - property panel edits updating the canvas in real time,
   - layer reordering changing z-order on canvas,
   - timeline/keyframe authoring affecting the canvas preview,
   - clip-path and motion-path overlay editing,
   - preflight issues appearing/disappearing in the sidebar,
   - modal flows that affect canvas/document state,
   - persistence/reload flows for later-phase shell behavior.

---

## Plan / Status Tracking Gaps

1. **`project/implementation/plan.md` is stale for phase 9.**
   - It still says the active phase is 9 and the phase is “not started”, even though `plan-phase-9.md` already marks 9-A through 9-D as red/green complete and the codebase contains live data, collaboration logging, fullscreen, toasts, persistence, and modal scaffolding.

2. **`plan-phase-5.md` summary table is inconsistent with the detailed checklist.**
   - The section-level 5-A demo milestone remains unchecked while the summary table shows the phase group complete.

3. **`plan-phase-6.md` summary table is stale.**
   - 6-C and 6-D still show as not started in the table despite completed checkboxes above and existing code/tests.

4. **`plan-phase-7.md` overstates demo completion.**
   - The plan marks the later animation-authoring demo milestones complete, but the actual demo shell still exposes a disabled/stub animation tab and does not mount the timeline authoring UI.

---

## Bottom Line

The core engine work through phases 1–6 is mostly present, but the repo still has a **big vertical-slice gap** between what exists in `packages/ui` / `packages/editor` and what the demo shell actually exposes. The most important open items are:

1. **Animation authoring demo wiring (phase 7)**
2. **Full clip-path / motion-path authoring UX (phase 8)**
3. **Named snapshots + real preflight diagnostics (phase 9)**
4. **Full phase-9 demo configuration and modal/orchestration wiring**
5. **Much broader Playwright CT coverage for later-phase cross-region workflows**
