# Master Implementation Plan

This file is the index. Each phase lives in its own file to keep agent context
small when working on a single phase.

For repo guidance, see `../../README.md` and `../../AGENTS.md`.

---

## TDD Convention (“Ralph Loop”)

Every unit below is implemented test-first using the acceptance criteria in the
corresponding spec file:

1. **Red** — translate the spec’s `- [ ]` acceptance criteria into failing Jest tests
2. **Green** — write the minimum production code to make them pass
3. **Refactor** — clean up without breaking tests; commit

Each checklist item therefore has two sub-checks:

```
- [ ] tests: red   ← spec ACs translated into a failing test file
- [ ] impl: green  ← production code written; all tests pass
```

A unit is **done** only when both boxes are checked and `npm run quality` passes in
its package.

---

## Current Status

- **Active Phase:** Phase 9 — Data & Collaboration
- **In Progress:** 9-A (first unit of phase 9)
- **Last Merged:** 8-D motion path editor

---

## Build Strategy — Vertical Slices

Each phase ends with something visible and runnable in the demo app. The demo
always showcases ALL features implemented so far with great UX. Never build a
library in isolation without being able to see and interact with it.

```
Phase 1  — Model                 → pure types, zero deps
Phase 2  — Renderer + Demo shell → pixels on screen: sample doc rendered
Phase 3  — Playback + Animated   → animations play in browser
Phase 4  — Editor MVP            → add/move/resize/rotate elements, undo/redo, scenes
Phase 5  — Rich Properties       → full visual styling, layers, input components
Phase 6  — Interaction Polish    → keyboard, text editing, clipboard, context menu
Phase 7  — Animation Authoring   → timeline editor, keyframe editing, easing curves
Phase 8  — Path & Vector Tools   → path drawing/editing, clip-path, motion paths
Phase 9  — Data & Collaboration  → data binding, live data, modals, change stream
Phase 10 — Formats               → export/import (PDF, PPTX, PSD, SVG, HTML, raster, video)
Phase 11 — Advanced Features     → trim path, boolean ops, text animation, audio, and more
```

---

## Phase Files

| Phase | File                                 | Packages                              | Status      |
| ----- | ------------------------------------ | ------------------------------------- | ----------- |
| 1     | [plan-phase-1.md](plan-phase-1.md)   | `model`                               | complete    |
| 2     | [plan-phase-2.md](plan-phase-2.md)   | `renderer` + `demo` shell             | complete    |
| 3     | [plan-phase-3.md](plan-phase-3.md)   | `playback` + `demo` animated          | complete    |
| 4     | [plan-phase-4.md](plan-phase-4.md)   | `editor` + `ui` + `demo` (MVP)        | complete    |
| 5     | [plan-phase-5.md](plan-phase-5.md)   | `ui` + `editor` + `demo` (properties) | complete    |
| 6     | [plan-phase-6.md](plan-phase-6.md)   | `editor` + `ui` + `demo` (polish)     | complete    |
| 7     | [plan-phase-7.md](plan-phase-7.md)   | `editor` + `ui` + `demo` (animation)  | complete    |
| 8     | [plan-phase-8.md](plan-phase-8.md)   | `editor` + `ui` + `demo` (paths)      | complete    |
| 9     | [plan-phase-9.md](plan-phase-9.md)   | `editor` + `ui` + `demo` (data)       | not started |
| 10    | [plan-phase-10.md](plan-phase-10.md) | `formats` + `demo`                    | not started |
| 11    | [plan-phase-11.md](plan-phase-11.md) | cross-cutting (all packages)          | not started |

Update the Status column and the checkboxes inside each phase file as work
progresses.
