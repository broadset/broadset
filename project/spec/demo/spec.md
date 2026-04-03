# Demo Application Specification

## Purpose

Defines the reference host application that integrates all broadset packages into a complete, usable template editor. The demo serves as the integration validation surface — no library feature is considered complete until it is exposed and usable here. It does NOT define library behavior (→ `project/spec/editor/`, `project/spec/ui/`, etc.) but specifies how the host wires packages together, configures the editor, manages application state, and orchestrates user workflows. See [conventions](../../README.md).

---

## Sub-Specs

| Sub-Spec                                   | Scope                                                             |
| ------------------------------------------ | ----------------------------------------------------------------- |
| [layout.md](layout.md)                     | App shell, canvas area, toolbars, sidebar, context menu, timeline |
| [state.md](state.md)                       | Provider wiring, persistence, toasts, fullscreen, zoom prevention |
| [config.md](config.md)                     | Editor configuration, fonts, presets, plugins, change logging     |
| [data-integration.md](data-integration.md) | Live data, export/import orchestration, lazy loading, sample doc  |
| [visual.md](visual.md)                     | Dark theme, glass-morphism, icon system, responsive canvas        |

---

## Non-Goals

- Editor store actions and state management → see `project/spec/editor/spec.md`
- UI component behavior (panels, modals, timeline) → see `project/spec/ui/spec.md`
- Renderer internals → see `project/spec/renderer/spec.md`
- Format conversion logic → see `project/spec/formats/spec.md`
- Animation engine → see `project/spec/playback/spec.md`
- Document model types → see `project/spec/model/spec.md`
