# Editor Specification

## Purpose

Defines the editor engine for broadset. The editor manages document state with undo/redo history, provides a real-time change stream for collaboration, applies remote document changes, and supports path editing/drawing and element placement modes. It does NOT render DOM, compute animations, or export documents. See [conventions](../../README.md).

---

## Sub-Specs

| Sub-Spec                                               | Scope                                                                                  |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| [store-actions.md](store-actions.md)                   | Core store actions — document lifecycle, element CRUD, selection, undo/redo, grouping  |
| [store-ui-actions.md](store-ui-actions.md)             | Workspace actions — pages, canvas settings, guides, palette, fonts, media              |
| [data-store.md](data-store.md)                         | Runtime data injection store (BroadsetDataStore) — CRUD, bulk ops, selector isolation  |
| [collaboration.md](collaboration.md)                   | Document diffing, animation registry diffing, change stream, remote change application |
| [editing.md](editing.md)                               | Path editing, path drawing, element placement, factory, validation, capabilities       |
| [animation-state.md](animation-state.md)               | Animation config timeline/state/modifier mutations and screen-state updates            |
| [timeline-playback.md](timeline-playback.md)           | Editor timeline playback orchestration with snapshot restore                           |
| [react-data-integration.md](react-data-integration.md) | Provider context, error boundary, playback controller, data subscriptions              |
| [path-geometry.md](path-geometry.md)                   | Path parsing/serialization, handle extraction, and geometry refit behavior             |
| [canvas.md](canvas.md)                                 | Canvas rendering, selection, zoom/pan, grid, rulers, safety boundaries                 |
| [transforms.md](transforms.md)                         | Drag, resize, rotate, snapping, anchor auto-assignment, 3D persistence                 |
| [keyboard.md](keyboard.md)                             | Shortcut resolution, nudge, clipboard, delete, select-all, group/ungroup               |

---

## Non-Goals

- Document model types and validation → see `project/spec/model/spec.md`
- Animation engine → see `project/spec/playback/spec.md`
- DOM rendering → see `project/spec/renderer/spec.md`
- Export/import formats → see `project/spec/formats/spec.md`

## Cross-References

- **Custom Component Plugin Lifecycle:** Registration in EditorConfig (→ `project/spec/model/config.md`), factory defaults (→ `editing.md`), canvas rendering (→ `project/spec/renderer/spec.md`), property panel (→ `project/spec/ui/panels.md`), capability gating (→ `project/spec/renderer/spec.md`), export (→ `project/spec/formats/`)
