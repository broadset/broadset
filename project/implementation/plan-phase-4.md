# Phase 4 — Editor + UI (feature by feature)

**Packages:** `packages/editor`, `packages/ui`, `packages/demo` (ongoing)
**Depends on:** Phase 1 (model), Phase 2 (renderer), Phase 3 (playback)
**Index:** [plan.md](plan.md)

**Approach:** Each feature group (A–I) lands end-to-end in the running demo.
Complete one group fully — tests red → green, demo updated — before starting
the next. The demo grows feature by feature rather than having a big-bang
integration at the end.

Each group lists its editor spec units, its UI spec units, and a concrete
**demo milestone** — the observable proof that the feature works.

---

## Feature Group 4-A: Core editing scaffold

_Editor specs:_ `editor/store-actions.md` (doc init, element CRUD, selection),
`editor/editing.md` (element placement mode)
_UI specs:_ `ui/toolbar-nav.md` (element library tiles, page sorter)

- [x] tests: red — editor/store-actions
- [x] tests: red — editor/editing (placement)
- [x] tests: red — ui/toolbar-nav (element library + page sorter)
- [ ] impl: green — all three
- [ ] demo milestone: click element type in toolbar → element appears on canvas;
      click to select; Delete key removes it; page tabs visible and switching works

## Feature Group 4-B: Transforms + Properties panel

_Editor specs:_ `editor/transforms.md`
_UI specs:_ `ui/utilities.md` (CSS parsers), `ui/inputs.md` (input components),
`ui/panels.md` (properties sidebar — basic style fields)

- [ ] tests: red — editor/transforms
- [ ] tests: red — ui/utilities
- [ ] tests: red — ui/inputs
- [ ] tests: red — ui/panels (properties sidebar)
- [ ] impl: green — all
- [ ] demo milestone: select an element → drag it, resize via handles, rotate;
      properties sidebar shows style fields; changing color/opacity updates the canvas

## Feature Group 4-C: Undo/redo, page management, canvas

_Editor specs:_ `editor/store-ui-actions.md` (pages, canvas settings, guides),
`editor/canvas.md`
_UI specs:_ `ui/toolbar-nav.md` (undo/redo buttons, updated page sorter)

- [ ] tests: red — editor/store-ui-actions
- [ ] tests: red — editor/canvas
- [ ] impl: green — all
- [ ] demo milestone: add/remove pages; undo/redo buttons work; zoom and pan
      canvas; grid visible; rulers rendered; drag from ruler creates a guide;
      safety overlay visible in broadcast mode

## Feature Group 4-D: Animation state editing + Timeline UI

_Editor specs:_ `editor/animation-state.md`, `editor/timeline-playback.md`
_UI specs:_ `ui/timeline.md` (timeline editor + bottom panel),
`ui/panels.md` (animation sidebar)

- [ ] tests: red — editor/animation-state
- [ ] tests: red — editor/timeline-playback
- [ ] tests: red — ui/timeline
- [ ] tests: red — ui/panels (animation sidebar + keyframe properties)
- [ ] impl: green — all
- [ ] demo milestone: select an element → open animation sidebar → add keyframe
      in timeline editor → hit play → see the animation running in the demo

## Feature Group 4-E: Path editing

_Editor specs:_ `editor/path-geometry.md`, `editor/editing.md` (path
editing/drawing modes)

- [ ] tests: red — editor/path-geometry
- [ ] tests: red — editor/editing (path editing + drawing)
- [ ] impl: green — all
- [ ] demo milestone: select a path element → enter path editing mode → drag
      handles; use draw tool to sketch a new path point-by-point; Escape commits,
      Enter closes path

## Feature Group 4-F: Keyboard shortcuts

_Editor specs:_ `editor/keyboard.md`

- [ ] tests: red
- [ ] impl: green
- [ ] demo milestone: arrow nudge moves selected element 1 mm; Shift+arrow moves
      10 mm; Ctrl+Z/Y undo/redo; Ctrl+C/V copy/paste; Delete removes; Ctrl+G groups;
      Ctrl+A selects all

## Feature Group 4-G: Modals

_UI specs:_ `ui/modals.md`

- [ ] tests: red
- [ ] impl: green
- [ ] demo milestone: all 6 modals open/close correctly — About, Canvas Settings
      (updates take effect), Export (feature-gated exporters), Media Library (assets
      browsable), New Document (presets create correct canvas), Shortcut Help

## Feature Group 4-H: Runtime data store + React integration

_Editor specs:_ `editor/data-store.md`, `editor/react-data-integration.md`
_Demo:_ `demo/data-integration.md` (live data section)

- [ ] tests: red — editor/data-store
- [ ] tests: red — editor/react-data-integration
- [ ] impl: green — all
- [ ] demo milestone: live data placeholders (scores, clock, ticker) update on
      a timer and are reflected in the rendered output without a full re-render of
      the canvas; EditorProvider error boundary shows fallback on deliberate throw

## Feature Group 4-I: Collaboration / change stream + full demo config

_Editor specs:_ `editor/collaboration.md`
_Demo:_ `demo/config.md`, `demo/state.md` (provider wiring, persistence,
toasts, fullscreen)

- [ ] tests: red — editor/collaboration
- [ ] impl: green
- [ ] demo milestone: change stream logs batches to console with cumulative
      count; sidebar width and active tab persist across page reload; export/import
      toasts appear; fullscreen toggle works; ≥5 fonts, ≥8 palette colors, ≥1
      custom plugin, ≥1 required element all configured

---

## Progress

| Group                           | Spec(s)                                                    | Red | Green | Demo live |
| ------------------------------- | ---------------------------------------------------------- | --- | ----- | --------- |
| 4-A core editing scaffold       | store-actions, editing (placement), ui/toolbar-nav         | ☐   | ☐     | ☐         |
| 4-B transforms + properties     | transforms, ui/utilities, ui/inputs, ui/panels             | ☐   | ☐     | ☐         |
| 4-C undo / pages / canvas       | store-ui-actions, canvas, ui/toolbar-nav                   | ☐   | ☐     | ☐         |
| 4-D animation editing           | animation-state, timeline-playback, ui/timeline, ui/panels | ☐   | ☐     | ☐         |
| 4-E path editing                | path-geometry, editing (paths)                             | ☐   | ☐     | ☐         |
| 4-F keyboard shortcuts          | keyboard                                                   | ☐   | ☐     | ☐         |
| 4-G modals                      | ui/modals                                                  | ☐   | ☐     | ☐         |
| 4-H data store + React          | data-store, react-data-integration                         | ☐   | ☐     | ☐         |
| 4-I change stream + full config | collaboration, demo/config, demo/state                     | ☐   | ☐     | ☐         |
