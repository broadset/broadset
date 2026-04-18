# Phase 4 — Editor MVP: Core Editing & Canvas

**Packages:** `packages/editor`, `packages/ui`, `packages/demo`
**Depends on:** Phase 1 (model), Phase 2 (renderer), Phase 3 (playback)
**Index:** [plan.md](plan.md)

**Goal by end of phase:** A functional editor MVP. Users can add elements from a
toolbar, select them, drag/resize/rotate on canvas, switch scenes, undo/redo,
zoom/pan, and see a grid and rulers. The demo looks professional with dark theme
and glass-morphism. This is the "it’s a real editor" moment.

---

### ⚠️ MANDATORY — HeroUI component library

All UI components in this phase **MUST** be built with `@heroui/react` — not raw
HTML elements. See `AGENTS.md` and `agents/instructions/heroui.instructions.md`.

| Instead of                      | Use                          |
| ------------------------------- | ---------------------------- |
| Raw `<button>`                  | HeroUI `Button`              |
| Raw `<input>` / `<textarea>`    | HeroUI `Input` / `Textarea`  |
| Raw `<select>`                  | HeroUI `Select`              |
| Hand-rolled collapsible `<div>` | HeroUI `Accordion`           |
| Custom tab bar                  | HeroUI `Tabs`                |
| Custom modal / dialog           | HeroUI `Modal`               |
| Custom toggle / checkbox        | HeroUI `Switch` / `Checkbox` |

`@heroui/react` **MUST** be in the package’s `peerDependencies` before any UI
unit is marked green.

---

## Feature Group 4-A: Store scaffold + element placement

_Editor specs:_ `editor/store-actions.md` (document init — replace + reset undo;
element CRUD — add with factory defaults, update partial merge, remove cascading,
reorder within page; selection — single/multi/toggle/clear, clears on page
switch, exits editing modes; undo/redo — full-snapshot cycle, configurable limit
default 50; ephemeral vs committed — ephemeral untracked, pointer-up commits;
grouping — group multi-selection, ungroup promotes children),
`editor/editing.md` (element placement mode — start/cancel/place with click
position centering, per-type defaults, no pending = no-op; placement vs
instant-place distinction),
`editor/react-data-integration.md` (EditorProvider context — store + component
registry; EditorErrorBoundary — catches render errors, fallback UI)

- [x] tests: red — editor/store-actions (init, CRUD, selection, undo/redo, grouping)
- [x] tests: red — editor/editing (placement mode + factory)
- [x] tests: red — editor/react-data-integration (EditorProvider + error boundary)
- [x] impl: green — all three
- [x] demo milestone: EditorProvider wraps app; click element type in toolbar →
      element appears on canvas; click to select; Delete key removes it; undo/redo
      works; group/ungroup via multi-select

## Feature Group 4-B: Transforms + canvas

_Editor specs:_ `editor/transforms.md` (drag — ephemeral during, committed on
drop; 8 resize handles — corners both axes, edges one axis; rotation handle;
anchor auto-assignment — quadrant-based anchorX/Y after translation; zoom
compensation — deltas ÷ zoom; 3D field persistence; border radius handles —
rectangle only; smart snapping — page center → page edge → element center →
element edge, 5px threshold; grid snapping — quantize to grid intersections),
`editor/canvas.md` (viewport zoom — scroll/pinch, pan — background drag;
click selection — element → select, void → deselect all; marquee selection —
intersecting rect → selected; grid visibility and snap; ruler ticks; guide
dragging from rulers; safety overlay — broadcast/print/none; smart guides —
5px threshold, center/edge precedence)

- [x] tests: red — editor/transforms
- [x] tests: red — editor/canvas
- [x] impl: green — all
- [x] demo milestone: select element → drag, resize via 8 handles, rotate via
      handle; zoom (scroll/pinch), pan (drag background); grid toggleable; rulers
      visible; drag from ruler creates guide; safety overlay in broadcast mode;
      smart guides snap elements to each other

## Feature Group 4-C: Pages + canvas settings + basic toolbar

_Editor specs:_ `editor/store-ui-actions.md` (page navigation — out-of-range
ignored, clears selection; page add/remove — ≥1 page invariant, active index
adjustment; canvas settings merge — NOT tracked by undo; guide CRUD — h/v type,
mm position, locked flag; color palette — reject duplicates, remove by index;
fonts/media CRUD)
_UI specs:_ `ui/toolbar-nav.md` (floating toolbar — undo/redo buttons disabled
when unavailable, save button, zoom controls, grid toggle, guide toggle;
element library — 11 built-in tiles + custom plugins with icons, startPlacement
on click, 2-column grid; scene sorter — tabs match scene count, switching, add/
remove, remove hidden at 1 scene),
`ui/utilities.md` (CSS parsers needed for property panels),
`ui/panels.md` (basic properties — position/size/rotation/opacity fields only). Remember to use HeroUI Toolbar component for the toolbars!

- [x] tests: red — editor/store-ui-actions
- [x] tests: red — ui/toolbar-nav (toolbar + element library + scene sorter)
- [x] tests: red — ui/utilities (CSS parsers)
- [x] tests: red — ui/panels (basic position/size/rotation/opacity)
- [x] impl: green — all
- [x] **HeroUI verified** — no raw HTML elements in ui/ files
- [x] demo milestone: scene tabs visible, switching works, add/remove scenes;
      undo/redo buttons in toolbar; element library with 11 types; basic property
      fields (position, size, rotation, opacity) update canvas in real-time

## Feature Group 4-D: Demo shell polish

_Demo specs:_ `demo/layout.md` (full-viewport 100vw × 100vh, overflow hidden;
floating main toolbar top-left above ruler offset; canvas area fills remaining
space; placement mode banner when active),
`demo/visual.md` (dark theme enforced — `class="dark" data-theme="dark"`;
glass-morphism — semi-transparent panels with backdrop blur; Lucide icons
throughout; responsive canvas — fills available space, no scrollbars on resize),
`demo/state.md` (browser zoom prevention — pinch, Ctrl+scroll, Ctrl+±/0, Safari
gesture; overflow lock on mount/unmount)

- [x] tests: red (Playwright CT)
- [x] impl: green
- [x] demo milestone: 100vw × 100vh dark-themed layout with glass-morphism panels;
      responsive canvas fills available space; Lucide icons throughout; placement
      mode banner when active; browser zoom prevented; the app looks and feels
      like a professional design tool

---

## Progress

| Group                             | Red | Green | Demo |
| --------------------------------- | --- | ----- | ---- |
| 4-A store + placement             | ☑   | ☑     | ☑    |
| 4-B transforms + canvas           | ☑   | ☑     | ☑    |
| 4-C pages + toolbar + basic props | ☑   | ☑     | ☑    |
| 4-D demo shell polish             | ☑   | ☑     | ☑    |
