# Architecture Definition

This document records implementation architecture for the current Broadset codebase.

Behavioral requirements are defined in `project/spec/**` and are the source of truth for WHAT the system does.
This file defines HOW the repository is structured to implement those requirements.

Snapshot date: 2026-04-05

---

## 1. Scope

- Define package topology and allowed dependency boundaries.
- Define active runtime/tooling/dependency baseline.
- Capture cross-package integration contracts required for implementation coherence.
- Exclude speculative or future-only stacks from the active baseline.

---

## 2. Verified Baseline

### 2.1 Runtime and Toolchain

| Area           | Baseline     | Source                       |
| -------------- | ------------ | ---------------------------- |
| Node.js        | `>=24.0.0`   | root `package.json` engines  |
| npm workspaces | `packages/*` | root `package.json`          |
| TypeScript     | `^6.0.2`     | package manifests            |
| React          | `^19.2.4`    | `ui`/`demo` peer/runtime     |
| Vite           | `^8.0.3`     | `packages/demo/package.json` |
| Jest           | `^30.3.0`    | root + package scripts       |
| Playwright CT  | `^1.59.1`    | `packages/demo/package.json` |
| ESLint         | `^10.1.0`    | root `package.json`          |
| Prettier       | `^3.8.1`     | root `package.json`          |

### 2.2 Repository Structure

- Behavioral specs: `project/spec/**`
- Implementation definitions/plans: `project/implementation/**`
- Runtime packages: `packages/{model,playback,renderer,editor,formats,ui,demo}`

### 2.3 Package Entry Strategy

- Packages expose `src/index.ts` via `main`, `types`, and `exports`.
- This source-first setup is the active development baseline for workspace integration.

---

## 3. Package Topology

### 3.1 Logical Graph

```text
model
playback -> model
renderer -> model, playback
editor -> model, playback, renderer
formats -> model, playback
ui -> peer integration with editor, formats, model, renderer
demo -> integration host for all packages
```

### 3.2 Boundary Rules (Required)

- `model` MUST NOT import any other workspace package.
- `playback` MUST only import `model`.
- `renderer` MUST only import `model` and `playback`.
- `editor` MUST only import `model`, `playback`, and `renderer`.
- `formats` MUST only import `model` and `playback`.
- `ui` MUST only import through its peer dependencies (`editor`, `formats`, `model`, `renderer`).
- `demo` MAY import all packages.

### 3.3 Public API Rule

- Every package keeps a maintained `src/index.ts` barrel.
- Public consumers import from package roots, never internal file paths.

---

## 4. Spec-Linked Structural Contracts

### 4.1 Model Shape Invariants

Architecture and implementation MUST follow the current model specs:

- Root container is `BroadsetProject` with `settings`, `assets`, and one or more `documents`.
- Elements are document-level flat arrays; pages are override layers (not independent element arrays).
- Animation storage is `animations` (flat array), not `animationRegistry`.
- Spatial units follow `canvas.unit` (`px`/`mm`/`in`) with explicit `dpi`.
- Element-level legacy `screen` object fields are not part of the active model.

Primary references:

- `project/spec/model/spec.md`
- `project/spec/model/project.md`
- `project/spec/model/animation.md`
- `project/spec/model/format-reference.md`

### 4.2 Renderer and Playback Contract

Renderer-owned data attributes are cross-package contracts:

- `data-element-id`
- `data-element-content`
- `data-opacity-target`
- `data-visibility`

Other packages MUST NOT introduce additional rendered-element `data-*` contracts without updating renderer spec and architecture docs.

Reference:

- `project/spec/renderer/spec.md`

### 4.3 Interaction and Collaboration Contracts

- Transform interactions use two-phase updates:
  - ephemeral updates during pointer movement
  - single committed update on pointer-up
- Collaboration diff/apply excludes runtime-only animation state (`visibility`, `activeState`, `modifiers`) from persisted change semantics.

Reference:

- `project/spec/editor/transforms.md`
- `project/spec/editor/collaboration.md`

---

## 5. Active Dependency Baseline

Dependencies below are part of the current implemented architecture and package manifests.

| Domain               | Dependency                                              | Role                                               |
| -------------------- | ------------------------------------------------------- | -------------------------------------------------- |
| Model                | `zod`                                                   | Runtime validation at model boundaries             |
| Editor state/history | `zustand`, `zundo`                                      | State store and undo/redo middleware               |
| Renderer/Formats QR  | `qrcode-generator`                                      | QR generation parity across renderer/export        |
| Formats PDF          | `@libpdf/core`                                          | PDF generation                                     |
| Formats PSD          | `ag-psd`                                                | PSD import/export                                  |
| Formats PPTX         | `pizzip`                                                | OOXML ZIP processing for PPTX                      |
| Formats raster       | `html-to-image`                                         | Raster and SVG capture utilities                   |
| Formats ZIP utility  | `jszip`                                                 | ZIP container utility (for format packaging paths) |
| UI shell             | `@heroui/react`                                         | Required UI component system                       |
| UI/demo icons        | `lucide-react`                                          | Icon system                                        |
| Demo UI styles       | `@heroui/styles`, `tailwindcss`, `@tailwindcss/vite`    | Host styling stack                                 |
| Host runtime         | `react`, `react-dom`                                    | React host integration                             |
| Demo build           | `vite`, `@vitejs/plugin-react`                          | Dev/build tooling                                  |
| Unit testing         | `jest`, `babel-jest`                                    | Unit/integration tests                             |
| Browser CT           | `@playwright/experimental-ct-react`, `@playwright/test` | Component browser tests                            |

---

## 6. Testing and Quality Baseline

### 6.1 Root Commands

- `npm run quality:strict`
- `npm run build`
- `npm run ct`

### 6.2 Package-Level Quality Contract

Each package keeps `quality` and `quality:strict` scripts with gate order:

1. lint
2. prettier check (where configured)
3. typecheck
4. test

### 6.3 Non-Negotiables

- Do not suppress lint/type/test failures.
- Fix root causes; do not weaken checks.

---

## 7. Exclusions from Active Architecture Baseline

The following are not part of the active, current architecture baseline and must not be treated as default stack decisions:

- `subjx`
- `mediabunny`
- `pdfjs-dist`
- `@uiw/react-color`

They may be reconsidered only if a concrete, spec-driven implementation unit requires them.

---

## 8. Practical Implementation Order

1. Implement model contracts from `project/spec/model/**`.
2. Layer playback/renderer/editor/formats within boundary rules.
3. Build `ui` with HeroUI-first component usage.
4. Validate integration in `demo`.
5. Continuously validate with strict quality and CT coverage gates.
