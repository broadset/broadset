# UI Specification

## Purpose

Defines the React-based editor UI for broadset. The ui package provides property panels, modals, sidebars, toolbar, context menu, timeline editor, and utility hooks/parsers that drive the editor store. It does NOT own document state (that's the editor domain), render the canvas (renderer domain), or compute animations (playback domain). See [conventions](../../README.md).

---

## Sub-Specs

| Sub-Spec                         | Scope                                                                           |
| -------------------------------- | ------------------------------------------------------------------------------- |
| [panels.md](panels.md)           | Property sidebars, box effects, clip-path, preflight, animation sidebar, layers |
| [modals.md](modals.md)           | About, canvas settings, export, media library, new document, shortcut help      |
| [toolbar-nav.md](toolbar-nav.md) | Toolbar, context menu, element library, page sorter                             |
| [timeline.md](timeline.md)       | Timeline editor, bottom panel, editing context                                  |
| [inputs.md](inputs.md)           | Color picker, CSS length, text stroke, filter editor, shadow editor inputs      |
| [utilities.md](utilities.md)     | CSS value parsers, animation binding helpers, keyframe value hooks, wheel input |

---

## Non-Goals

- Document model types → see `project/spec/model/spec.md`
- Animation engine → see `project/spec/playback/spec.md`
- DOM rendering → see `project/spec/renderer/spec.md`
- Editor state management → see `project/spec/editor/spec.md`
- Export format logic → see `project/spec/formats/spec.md`
