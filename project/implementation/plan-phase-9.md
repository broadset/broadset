# Phase 9 — Data Binding, Collaboration, Modals & Demo Polish

**Packages:** `packages/editor`, `packages/ui`, `packages/demo`
**Depends on:** Phase 7 (animation authoring)
**Index:** [plan.md](plan.md)

**Goal by end of phase:** The editor is feature-complete for the core product.
Data-driven templates work with live data. Change stream enables collaboration.
All modal dialogs are functional. The demo has full configuration, persistence,
toasts, and fullscreen. The editor is production-ready.

---

### ⚠️ MANDATORY — HeroUI component library

All UI components **MUST** use `@heroui/react`. See `AGENTS.md` and
`.github/instructions/heroui.instructions.md`.

---

## Feature Group 9-A: Data store + React integration

_Editor specs:_ `editor/data-store.md` (empty default init; merge update —
partial, new elements created; full replacement; bulk update — single
subscription notification; selector isolation — unrelated selectors not
triggered; store independence — multiple stores fully independent),
`editor/react-data-integration.md` (EditorProvider context with store +
component registry, error boundary with fallback UI + rest of app continues,
selector render isolation, provider boundary enforcement — error outside
provider, reactive propagation)

- [ ] tests: red — editor/data-store
- [ ] tests: red — editor/react-data-integration (full coverage)
- [ ] impl: green — all
- [ ] demo milestone: EditorProvider error boundary catches errors and shows
      recovery UI; data subscriptions trigger selective re-renders

## Feature Group 9-B: Live data binding

_Demo specs:_ `demo/data-integration.md` (live data — sports scores, team names,
player data via BroadsetDataStore; token resolution `{{key}}`; mock hook with
periodic updates)
_Renderer spec:_ `renderer/spec.md` (dynamic data — `{{key}}` token resolution
from data store, dot-notation, unresolved tokens rendered literal)

- [ ] tests: red — demo live data integration
- [ ] impl: green
- [ ] demo milestone: sample document has data-bound elements; scores/clock/ticker
      update on a timer; rendered output reflects live data without full re-render

## Feature Group 9-C: Collaboration / change stream

_Editor specs:_ `editor/collaboration.md` (document diffing — element
add/remove/update paths/reorder, runtime animation fields excluded, identical
docs → empty diff; page/settings diffing; animation diffing — config
adds/removals, per-field changes; change stream — subscribe/unsubscribe with
suppress flag, empty arrays not emitted; ephemeral vs committed — only committed
emitted, commit after ephemeral emits full diff from last committed state;
echo-loop prevention)

- [ ] tests: red — editor/collaboration
- [ ] impl: green
- [ ] demo milestone: change stream logs batches to console with cumulative count

## Feature Group 9-D: All modal dialogs

_UI specs:_ `ui/modals.md` (About modal — open/close rendering; Canvas Settings
— all controls fire callbacks; Export modal — feature-gated exporters, submit
payload, selection preserved on data update; Media Library — empty state, assets,
search, categories, select+confirm, Upload conditional; New Document — category
tabs, preset selection → createDocument, empty selection no-op, custom overrides
built-in; Shortcut Help — 5 groups, kbd elements, close; Template Browser modal
— categorized grid, search/filter, responsive layout, thumbnail previews, loads
selected template as new document)

- [ ] tests: red — ui/modals (all 7 modal types)
- [ ] impl: green
- [ ] **HeroUI verified**
- [ ] demo milestone: all modals open/close correctly; Canvas Settings changes
      take effect; Export shows feature-gated formats; New Document presets create
      correct canvas; Template Browser with categories, search, thumbnails

## Feature Group 9-E: Named snapshots

_Editor specs:_ `editor/store-actions.md` (named snapshots — up to 20, undoable
restore, serialized with document)

- [ ] tests: red — editor/store-actions (snapshots)
- [ ] impl: green
- [ ] demo milestone: save named snapshot → restore it → document returns to
      saved state; snapshot names visible in UI

## Feature Group 9-F: Preflight diagnostics

_Editor specs:_ `editor/editing.md` (preflight diagnostics — 6 named rules:
title-safe, dpi, bleed, small-text, color-mode, unsupported-property; missing
font warning)
_UI specs:_ `ui/panels.md` (preflight tab — zero-issue success message,
structured issue list, success hidden when issues exist)

- [ ] tests: red — editor/editing (preflight rules)
- [ ] tests: red — ui/panels (preflight panel)
- [ ] impl: green
- [ ] demo milestone: preflight tab shows diagnostic results; fix issue → result
      updates; zero issues shows success message

## Feature Group 9-G: Full demo configuration + persistence

_Demo specs:_ `demo/config.md` (≥5 web fonts, ≥8 palette colors incl. black
and white, ≥1 preset per category, ≥1 required element, media source configured,
≥1 custom plugin with all fields, change stream logging, grid/undo defaults),
`demo/state.md` (all 3 providers wired — EditorProvider, TimelineEditingProvider,
BroadsetDataStoreProvider; sidebar preferences persist across reload — versioned
key, corrupt → silent ignore; toast messages — success ~3s, error ~5s; fullscreen
toggle; browser zoom prevention — pinch, Ctrl+scroll, Ctrl+±/0, Safari gesture;
overflow lock on mount/unmount; save via onSave → localStorage),
`demo/layout.md` (full-viewport 100vw × 100vh, overflow hidden; EditorCanvas
in RulerSystem in ErrorBoundary; glass-morphism floating main toolbar; vertical
element toolbar; resizable right sidebar 256–800px with persisted width and tab
switching; context menu on canvas; timeline panel),
`demo/data-integration.md` (export orchestration — lazy format loading not in
initial bundle, cached after first load; all enabled export formats through
ExportModal with success/error toasts; import orchestration; new document from
NewDocumentModal preset; sample document on startup)

- [ ] tests: red — demo config + state + data orchestration (Playwright CT)
- [ ] impl: green
- [ ] demo milestone: sidebar width and active tab persist across reload;
      toasts appear for export/import; fullscreen toggle works; ≥5 fonts, ≥8 palette
      colors, ≥1 custom plugin, ≥1 required element configured; save writes to
      localStorage; reload restores document; lazy format loading works

---

## Progress

| Group                              | Red | Green | Demo |
| ---------------------------------- | --- | ----- | ---- |
| 9-A data store + React integration | ☐   | ☐     | ☐    |
| 9-B live data binding              | ☐   | ☐     | ☐    |
| 9-C collaboration / change stream  | ☐   | ☐     | ☐    |
| 9-D modal dialogs                  | ☐   | ☐     | ☐    |
| 9-E named snapshots                | ☐   | ☐     | ☐    |
| 9-F preflight diagnostics          | ☐   | ☐     | ☐    |
| 9-G demo config + persistence      | ☐   | ☐     | ☐    |
