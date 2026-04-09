# Phase 8 — Path & Vector Tools

**Packages:** `packages/editor`, `packages/ui`, `packages/demo`
**Depends on:** Phase 6 (interaction polish)
**Index:** [plan.md](plan.md)

**Goal by end of phase:** Complete vector editing toolkit. Users can edit
existing paths by dragging control handles, draw new paths point-by-point,
visually edit clip-paths, and author motion path animations with Bézier
overlays. The demo showcases these tools with a rich sample path element.

---

## Feature Group 8-A: Path geometry engine

_Editor specs:_ `editor/path-geometry.md` (parse SVG path d attribute →
deterministic segments; all supported command types — M/L/H/V/C/S/Q/A/Z;
implicit repeated coords normalized; empty string → empty array; serialize
round-trip stable; extract editable handles for cubic C, smooth S, quadratic Q,
horizontal H, vertical V, arc A; bounds refit with stroke padding; empty path
no-op)

- [x] tests: red — editor/path-geometry
- [x] impl: green

## Feature Group 8-B: Path editing + drawing modes

_Editor specs:_ `editor/editing.md` (path editing — start/stop modes, control
handle overlay, drag to update d attribute, bounds refitting, selection auto-exit,
multi-select keeps editing; path drawing — start/stop, addElement auto-enters,
click-to-place points, M first then L subsequent, coords relative to bbox with
2dp rounding, Enter closes path, Escape commits open path, selection auto-exit,
no-op outside drawing mode)

- [x] tests: red — editor/editing (path editing + drawing modes)
- [x] impl: green
- [x] demo milestone: select path element → enter edit mode → drag control handles
      to reshape; use draw tool → click to place points → Enter closes path →
      new path element created; Escape commits open path

## Feature Group 8-C: Clip-path editing

_Editor specs:_ `editor/editing.md` (clip-path editing — visual SVG overlay with
drag handles, default path seeding for elements without existing clip-path)
_UI specs:_ `ui/panels.md` (clip-path panel — start/editing/stop states, default
path seeding)

- [x] tests: red — editor/editing (clip-path editing mode)
- [x] tests: red — ui/panels (clip-path panel states)
- [x] impl: green
- [x] demo milestone: select element → click "Edit Clip Path" → SVG overlay with
      drag handles appears → reshape clipping region; elements without clip-path
      get default rectangular clip

## Feature Group 8-D: Motion path editor

_Editor specs:_ `editor/editing.md` (motion path editing — visual Bézier overlay,
draggable control points, ghost preview at endpoint, start/stop editing mode)

- [ ] tests: red — editor/editing (motion path editing)
- [ ] impl: green
- [ ] demo milestone: select element with motion path animation → enter motion
      path edit mode → Bézier curve overlay with control points → drag to reshape
      path → ghost preview shows element at path endpoint

---

## Progress

| Group                      | Red | Green | Demo |
| -------------------------- | --- | ----- | ---- |
| 8-A path geometry          | ✅  | ✅    | ☐    |
| 8-B path editing + drawing | ✅  | ✅    | ✅   |
| 8-C clip-path editing      | ✅  | ✅    | ✅   |
| 8-D motion path editor     | ☐   | ☐     | ☐    |
