# broadset Spec Map

The repository documentation is intentionally split into three layers.

## 1. Spec — behavioral source of truth

Spec lives in `project/spec/` and defines **what broadset must do**.

| Domain   | Package              | Spec                                           |
| -------- | -------------------- | ---------------------------------------------- |
| model    | `@broadset/model`    | [spec/model/spec.md](spec/model/spec.md)       |
| playback | `@broadset/playback` | [spec/playback/spec.md](spec/playback/spec.md) |
| renderer | `@broadset/renderer` | [spec/renderer/spec.md](spec/renderer/spec.md) |
| editor   | `@broadset/editor`   | [spec/editor/spec.md](spec/editor/spec.md)     |
| formats  | `@broadset/formats`  | [spec/formats/spec.md](spec/formats/spec.md)   |
| ui       | `@broadset/ui`       | [spec/ui/spec.md](spec/ui/spec.md)             |
| demo     | `@broadset/demo`     | [spec/demo/spec.md](spec/demo/spec.md)         |

High-level behavioral overview: [spec/executive-summary.md](spec/executive-summary.md)

## 2. Implementation definitions

Implementation-facing definitions live in `project/implementation/` and define **how the repo is structured**.

- [implementation/architecture.md](implementation/architecture.md)
- [implementation/project.md](implementation/project.md)
- [implementation/plan.md](implementation/plan.md)

## 3. Root guidance docs

Repo-level overview and default guidance now live at the root:

- [`../README.md`](../README.md)
- [`../AGENTS.md`](../AGENTS.md)

When behavior changes, update the relevant Spec file first or alongside the implementation.
