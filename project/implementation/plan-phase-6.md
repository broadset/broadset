# Phase 6 — Keyboard, Text & Interaction Polish

**Packages:** `packages/editor`, `packages/ui`, `packages/demo`
**Depends on:** Phase 5 (rich properties)
**Index:** [plan.md](plan.md)

**Goal by end of phase:** The editor feels like a professional design tool.
Keyboard shortcuts for all common operations, inline text editing with a
formatting toolbar, system clipboard integration, element alignment and
distribution, right-click context menu. Everything is polished and responsive.

---

### ⚠️ MANDATORY — HeroUI component library

All UI components **MUST** use `@heroui/react`. See `AGENTS.md` and
`.github/instructions/heroui.instructions.md`.

---

## Feature Group 6-A: Keyboard shortcuts

_Editor specs:_ `editor/keyboard.md` (shortcut map with key+modifier → action,
host overrides merge with defaults; nudge 1mm / 10mm with Shift, multi-element
simultaneous; clipboard copy/paste/cut with system Clipboard API primary +
internal fallback + custom MIME type + plain text; delete Delete/Backspace with
deselect; select-all on active page; group Ctrl+G / ungroup Ctrl+Shift+G;
zoom in/out/reset; layer reorder forward/backward/front/back; lock toggle;
undo/redo)

- [x] tests: red — editor/keyboard
- [x] impl: green
- [ ] demo milestone: arrow nudge 1mm, Shift+arrow 10mm; Ctrl+Z/Y undo/redo;
      Ctrl+C/V copy/paste (system clipboard primary, internal fallback);
      Delete removes; Ctrl+G groups; Ctrl+A selects all; Ctrl+]/[ reorder layers

## Feature Group 6-B: Inline text editing + formatting toolbar

_Editor specs:_ `editor/editing.md` (double-click → contenteditable overlay,
zoom-compensated positioning, respects font/color/alignment, Escape/click-outside
commits; inline text formatting toolbar — floating bold/italic/underline/color/
size controls during text selection)

- [x] tests: red — editor/editing (inline text editing + formatting toolbar)
- [x] impl: green
- [ ] demo milestone: double-click text element → inline editing with cursor;
      select text → floating toolbar with B/I/U/color/size; Escape commits

## Feature Group 6-C: Element operations + clipboard

_Editor specs:_ `editor/store-actions.md` (alignment: left/center/right/top/
middle/bottom for ≥2 elements; distribution: horizontal/vertical for ≥3
elements; reorder: forward/backward/front/back; lock toggle; grouping/ungrouping;
required element protection — cannot delete elements in EditorConfig.
requiredElements, deletion of parent promotes required descendants to root;
system clipboard with custom MIME type `application/vnd.broadset.elements+json`

- plain text fallback, cross-tab/cross-page paste, duplicate)

* [ ] tests: red — editor/store-actions (alignment, distribution, reorder, lock, clipboard)
* [ ] impl: green
* [ ] demo milestone: select ≥2 elements → alignment buttons align them;
      select ≥3 → distribute evenly; copy from one page, paste to another;
      required elements cannot be deleted

## Feature Group 6-D: Context menu

_UI specs:_ `ui/toolbar-nav.md` (right-click context menu — copy, paste, delete,
duplicate, lock/unlock, bring forward/backward/to front/to back, group/ungroup;
not rendered before first right-click; position at cursor; items disabled when
no element selected; all 8 actions; group/ungroup visibility based on selection;
closes after action)

- [ ] tests: red — ui/toolbar-nav (context menu)
- [ ] impl: green
- [ ] **HeroUI verified**
- [ ] demo milestone: right-click on canvas → context menu with all operations;
      items correctly disabled/enabled based on selection; group/ungroup visibility
      toggles based on selection type

---

## Progress

| Group                     | Red | Green | Demo |
| ------------------------- | --- | ----- | ---- |
| 6-A keyboard shortcuts    | ☑   | ☑     | ☐    |
| 6-B inline text + toolbar | ☑   | ☑     | ☐    |
| 6-C element operations    | ☐   | ☐     | ☐    |
| 6-D context menu          | ☐   | ☐     | ☐    |
