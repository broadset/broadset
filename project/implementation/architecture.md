# Architecture Manifest

This document provides the structural and technology context that behavioral specs intentionally omit. Together with the Spec files in `../spec/`, this manifest gives builders the implementation context needed to reconstruct the broadset project from scratch.

**Specs define WHAT the system does. This document defines HOW it is structured.**

---

## 1. Project Identity

| Field       | Value                                                       |
| ----------- | ----------------------------------------------------------- |
| Name        | broadset                                                    |
| Tagline     | "Design Once, Render Anywhere" — a headless template editor |
| Version     | 0.1.0 (all packages)                                        |
| License     | See `LICENSE` in repository root                            |
| Module type | ESM (`"type": "module"`)                                    |
| Monorepo    | npm workspaces (no Lerna, no Turborepo)                     |

---

## 2. Runtime & Toolchain

| Tool          | Version / Range | Purpose                        |
| ------------- | --------------- | ------------------------------ |
| Node.js       | ≥ 22            | Runtime                        |
| npm           | ≥ 10            | Package manager and workspaces |
| TypeScript    | ^6.0            | Type system                    |
| React         | ^19.2           | UI framework (editor + ui)     |
| Vite          | ^8.0            | Demo app bundler + dev server  |
| tsup          | ^8.5            | Library package bundler        |
| Jest          | ^30.2           | Unit test runner               |
| Playwright CT | ^1.58           | Component test runner          |
| ESLint        | ^9.37           | Linter                         |
| Prettier      | ^3.8            | Code formatter                 |
| Babel         | ^7.29           | Jest transform (test-only)     |

---

## 3. Package Dependency Graph

```
model (foundation — no internal deps)
  ├── zod ^4.3

playback (animation engine)
  ├── @broadset/model
  │
  ▼
renderer (DOM rendering)
  ├── @broadset/model
  ├── @broadset/playback
  ├── qrcode-generator ^2.0
  │
  ▼
editor (headless editor engine + React components)
  ├── @broadset/model
  ├── @broadset/playback
  ├── @broadset/renderer
  ├── zustand ^5.0           (state management)
  ├── zundo ^2.3             (undo/redo middleware)
  ├── zod ^4.3               (config validation)
  ├── subjx ^1.1             (transform handle interactions)
  ├── peerDeps: react, react-dom, pdfjs-dist

formats (import/export)
  ├── @broadset/model
  ├── @broadset/playback
  ├── @libpdf/core ^0.3      (PDF generation)
  ├── ag-psd ^30.1            (PSD read/write)
  ├── html-to-image ^1.11    (raster export)
  ├── jszip ^3.10             (OGraf zip packaging)
  ├── mediabunny ^1.39        (video export)
  ├── pdfjs-dist ^5.5         (PDF parsing)
  ├── pizzip ^3.2             (PPTX zip handling)
  ├── qrcode-generator ^2.0   (QR in exports)

ui (React UI component library)
  ├── @uiw/react-color ^2.9  (color picker)
  ├── peerDeps:
  │     @broadset/editor
  │     @broadset/formats
  │     @broadset/model
  │     @broadset/renderer
  │     @heroui/react ^3.0.0-rc.1
  │     lucide-react ^0.514
  │     react, react-dom

demo (reference host application)
  ├── @broadset/editor
  ├── @broadset/formats
  ├── @broadset/ui
  ├── @broadset/model
  ├── @broadset/renderer
  ├── @heroui/react ^3.0.0-rc.1
  ├── @heroui/styles ^3.0.0-rc.1
  ├── lucide-react ^0.514
  ├── devDeps: @tailwindcss/vite ^4.2, @vitejs/plugin-react ^5.1, vite ^7.3
```

### Build Order

Packages MUST be built in dependency order:

```
playback → model → formats → renderer → editor → ui → demo
```

The root `npm run build` script enforces this order. Playback and model have no circular dependency — playback depends on model, but tsup resolves this via source imports during build. The root script lists playback first for parallelism safety.

---

## 4. Package Roles and Boundaries

| Package    | Role                               | Has React | Build tool | Output                  |
| ---------- | ---------------------------------- | --------- | ---------- | ----------------------- |
| `model`    | Document types, validation, clone  | No        | tsup       | ESM + .d.ts             |
| `playback` | Animation engine, easing, timeline | No        | tsup       | ESM + .d.ts             |
| `renderer` | DOM element rendering, scene tree  | No        | tsup       | ESM + .d.ts             |
| `editor`   | Store, transforms, canvas, hooks   | Yes       | tsup       | ESM + .d.ts (React ext) |
| `formats`  | PDF/PPTX/PSD/SVG/HTML/raster/video | No        | tsup       | ESM + .d.ts             |
| `ui`       | Panels, modals, toolbar, timeline  | Yes       | tsup       | ESM + .d.ts (React ext) |
| `demo`     | Reference host app                 | Yes       | Vite       | Static site (dist/)     |

### Boundary Rules

- `model` MUST NOT import any other workspace package
- `playback` MUST only import `model`
- `renderer` MUST only import `model` and `playback`
- `editor` MUST only import `model`, `playback`, and `renderer`
- `formats` MUST only import `model` and `playback`
- `ui` MUST only import via peer dependencies (editor, formats, model, renderer)
- `demo` MAY import all packages — it is the integration surface

---

## 5. TypeScript Configuration

### Base Config (tsconfig.base.json)

| Setting                              | Value     |
| ------------------------------------ | --------- |
| `target`                             | ES2022    |
| `module`                             | ESNext    |
| `moduleResolution`                   | Bundler   |
| `strict`                             | true      |
| `jsx`                                | react-jsx |
| `isolatedModules`                    | true      |
| `verbatimModuleSyntax`               | true      |
| `exactOptionalPropertyTypes`         | true      |
| `noUncheckedIndexedAccess`           | true      |
| `noUncheckedSideEffectImports`       | true      |
| `noPropertyAccessFromIndexSignature` | true      |
| `noImplicitReturns`                  | true      |
| `noFallthroughCasesInSwitch`         | true      |
| `noImplicitOverride`                 | true      |
| `declaration` + `declarationMap`     | true      |
| `sourceMap`                          | true      |

### Per-Package Pattern

Each library package extends `tsconfig.base.json` with:

- `composite: true` (for project references)
- `outDir: ./dist` (or `./dist-tsc` for packages needing separate tsc declarations)
- `rootDir: ./src`
- `references` matching the dependency edges above

The demo package additionally sets `jsx: react-jsx` explicitly.

### tsup Configuration

All library packages use identical tsup config:

- Entry: `src/index.ts`
- Format: ESM only
- DTS generation: enabled
- Source maps: enabled
- Tree shaking: enabled
- React packages (editor, ui): `jsx: 'automatic'`, external: `['react', 'react-dom']`
- ui additionally externalizes all workspace peer deps and `@heroui/react`, `lucide-react`

---

## 6. Test Infrastructure

### Unit Tests (Jest)

| Setting             | Value                                      |
| ------------------- | ------------------------------------------ |
| Environment         | jsdom                                      |
| Transform           | babel-jest (ES modules + TypeScript + JSX) |
| Setup file          | `test/jest.setup.js`                       |
| Module name mapping | All `@broadset/*` → source `src/index.ts`  |
| CSS mock            | `test/mocks/styleMock.js`                  |
| Roots               | All 7 package directories                  |

Run: `npm test` (all) or `npm test -- --testPathPattern=<pattern>`

### Component Tests (Playwright CT)

| Setting   | Value                                       |
| --------- | ------------------------------------------- |
| Test dir  | `ct/`                                       |
| Match     | `**/*.ct.tsx`                               |
| Browser   | Chromium (Desktop Chrome, 1280×720)         |
| Vite port | 3100                                        |
| Alias     | Same workspace source aliases as unit tests |

Run: `npm run ct`

### Linting

- ESLint 9 flat config with TypeScript parser
- Plugins: `@typescript-eslint`, `import`, `simple-import-sort`, `unused-imports`
- Prettier integration via `eslint-config-prettier`
- Import sorting enforced and auto-fixable

---

## 7. Demo Application Structure

### Entry Point

`packages/demo/index.html` → `src/main.tsx`

### HTML Shell

```html
<html lang="en" class="dark" data-theme="dark">
  <body class="bg-background text-foreground">
    <div id="root"></div>
  </body>
</html>
```

### Vite Configuration

- Plugins: `@tailwindcss/vite`, `@vitejs/plugin-react`
- Workspace aliases: all `@broadset/*` packages resolve to source for HMR
- Chunk size warning limit: 2000 KB (full editor shell bundle)

### CSS Stack

1. Tailwind CSS v4 (via Vite plugin — no `tailwind.config.js`, uses CSS-based config)
2. HeroUI styles (`@heroui/styles`) — dark theme out of the box
3. Custom CSS (`heroui-theme.css`) for layout:
   - Glass-morphism drawer panel with backdrop blur
   - Slide-in/out transitions (180ms ease)
   - Tab styling for sidebar sections
   - Bottom timeline panel with fixed positioning
   - Browser zoom prevention (`touch-action: pan-x pan-y`)

### Theming

- Dark mode: enforced via `class="dark" data-theme="dark"` on `<html>`
- HeroUI provides CSS custom properties: `--surface`, `--border`, `--foreground`, `--muted`, etc.
- Floating panels use: semi-transparent background + `backdrop-filter: blur()`
- Drawer bounds: min-width 256px, max-width 800px
- Sidebar position: fixed, right-aligned, z-index 8000
- Timeline position: fixed, bottom-aligned, inset 28px from edges, z-index 8000

---

## 8. Key Architectural Patterns

### State Management

- **Zustand** store with immer-style immutable updates
- **Zundo** middleware provides undo/redo with configurable history depth
- Change stream middleware emits `DocumentChange` events for collaboration
- Editor store is provided to React tree via `EditorProvider` context
- Data store (`BroadsetDataStore`) is a separate Zustand instance for runtime data injection

### Component Plugin System

- Host registers `ComponentPlugin` entries in `EditorConfig`
- Each plugin declares: element type name, renderer component, optional property panel, optional defaults
- Renderer resolves plugins via `ComponentRegistry`
- Unknown element types fall back to a default renderer

### Format Export Architecture

- Format modules are lazy-loaded in the demo via dynamic `import()`
- Each format exports both a "generate" function (returns data) and an "export" function (triggers download)
- Export modal coordinates format selection, progress feedback, and download

### Canvas Rendering

- `EditorCanvas` renders the document inside a zoom/pan-able container
- `TransformableNode` wraps each element with drag/resize/rotate handles
- `GridOverlay`, `RulerSystem`, `SafetyBoundaries` render as canvas overlays
- Smart guides appear during drag interactions
- All pointer deltas are zoom-compensated

---

## 9. Monorepo Layout

```
broadset/
├── package.json              (root workspace config — "workspaces": ["packages/*"])
├── tsconfig.base.json        (shared TypeScript base — all library packages extend this)
├── README.md                 (repo overview, working agreements, and spec conventions)
├── AGENTS.md                 (concise workspace instructions for coding agents)
├── spec/
│   ├── README.md             (spec map)
│   ├── config.yaml           (domain/test mapping)
│   ├── spec/             (behavioral specifications)
│   │   ├── README.md
│   │   ├── executive-summary.md
│   │   ├── model/            (model domain specs)
│   │   ├── playback/           (playback domain specs)
│   │   ├── renderer/         (renderer specs)
│   │   ├── editor/           (editor specs)
│   │   ├── formats/          (format specs)
│   │   ├── ui/               (UI specs)
│   │   └── demo/             (demo app specs)
│   └── implementation/       (implementation-facing definitions)
│       ├── README.md
│       ├── architecture.md
│       ├── project.md
│       └── plan.md
└── packages/
    ├── model/                (@broadset/model — types, validation, clone, units)
    ├── playback/             (@broadset/playback — easing, interpolation, controller, timeline)
    ├── renderer/             (@broadset/renderer — element rendering, scene tree, fonts, QR)
    ├── editor/               (@broadset/editor — store, transforms, canvas, hooks)
    ├── formats/              (@broadset/formats — PDF/PPTX/PSD/SVG/HTML/raster/video)
    ├── ui/                   (@broadset/ui — panels, modals, toolbar, timeline)
    └── demo/                 (@broadset/demo — reference host app)
        ├── src/
        ├── ct/               (Playwright component tests)
        └── test/             (Jest setup and mocks)
```

---

## 10. Cross-Cutting Conventions

### Naming

- Package scope: `@broadset/*`
- Document type prefix: `Broadset` (e.g., `BroadsetDocument`, `BroadsetElement`, `BroadsetScreenProps`)
- Store type: `EditorStore` (Zustand state shape)
- Config type: `EditorConfig` (host-provided configuration)
- Change types: `DocumentChange` (collaboration stream payload)

### Error Handling

- Document validation returns arrays of validation error objects (not exceptions)
- Preflight diagnostics return severity-classified issues
- `EditorErrorBoundary` catches React rendering errors and provides recovery UI
- Invalid inputs to store actions are silently ignored (no-op) rather than throwing

### Coordinate System

- Canvas units: millimeters (mm) for document coordinates, pixels (px) for screen coordinates
- Conversion constants: 1mm ≈ 3.7795px (96 DPI)
- Zoom factor divides pointer deltas to convert screen → canvas space
- Element position: `{ x, y }` relative to page origin (top-left)
- Anchor system: `anchorX` ('left' | 'center' | 'right'), `anchorY` ('top' | 'center' | 'bottom')

### Animation Model

- Timeline-based: each element has an `AnimationConfig` with timelines
- State-driven: elements can have named states with class-based CSS transitions
- Modifier-driven: modifier classes apply additional state transitions
- Easing: cubic-bezier with named presets + custom curves

### Document Model

- `BroadsetDocument` contains metadata + pages array + animation registry
- Each `BroadsetPage` contains a flat array of `BroadsetElement` (no nested DOM tree)
- Elements reference parents via `parentId` for logical grouping
- Element types: text, image, svg, path, rectangle, ellipse, qrcode, group
- Document modes: `'screen'` (full features) and `'print'` (reduced feature set)

---

## 11. Rebuilding From Scratch

An agent tasked with rebuilding this project should:

1. **Read this manifest** to understand the technology stack, package boundaries, and build pipeline
2. **Read `project/spec/model/spec.md`** first — the model is the foundation
3. **Follow the dependency graph** — implement packages in build order: playback → model → formats → renderer → editor → ui → demo
4. **Use the acceptance criteria** in each spec as the definition of done
5. **Use `spec/config.yaml`** to understand how domains map to test patterns
6. **Build the demo last** — it integrates everything and serves as the final validation surface

### Key Decisions Already Made

These are the architectural choices that specs intentionally don't prescribe but that an implementer must follow to maintain compatibility:

- **Zustand** for state management (not Redux, MobX, etc.)
- **Zundo** for undo/redo (not custom middleware)
- **Zod** for runtime validation (not io-ts, yup, etc.)
- **HeroUI** as the component library (not MUI, Chakra, etc.)
- **Lucide** for icons (not FontAwesome, Material Icons, etc.)
- **Tailwind CSS v4** for utility styles (via Vite plugin, CSS-based config)
- **tsup** for library builds (not Rollup, esbuild directly, etc.)
- **Vite** for the demo app (not Webpack, Parcel, etc.)
- **ESM only** — no CommonJS output from any package
- **React 19** with automatic JSX transform
- **Project references** for TypeScript (composite builds)

---

## 12. Coding Conventions

The `.github/instructions/` directory contains project-wide coding conventions that are NOT part of the Spec behavioral specs but govern implementation style:

| File                         | Scope                               | Key Rules                                                                                                                                                       |
| ---------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `typescript.instructions.md` | `**/*.{ts,tsx}`                     | No `any`, no `@ts-ignore`, explicit returns, strict null checks, immutable state, Zod for runtime validation, modular files (<500 lines), JSDoc on complex math |
| `heroui.instructions.md`     | `packages/ui/src/**`                | Use HeroUI for all UI outside canvas, design tokens not hardcoded colors, a11y-first (aria-labels, keyboard nav, focus rings), zero CLS                         |
| `testing.instructions.md`    | `packages/*/src/**/*.test.*, ct/**` | Unit tests for math/store/hooks, Playwright CT for canvas interaction and renderer parity, CT milestone checks every 25 commits                                 |
| `workflow.instructions.md`   | Global                              | Pre-commit: format + typecheck. Conventional commit prefixes. Implementation order: types → logic → state → UI. Feature = tested + demoable                     |
| `global.instructions.md`     | Global                              | Four pillars: TS strictness, HeroUI-first UX, meticulous testing, clean version control                                                                         |

These conventions define the project's engineering standards but are not behavioral specs.

---

## 13. Component Test Invariant Protocol

Playwright CT tests use a shared `ct/testInvariants.ts` module that defines a `StoreDebugSnapshot` contract for asserting editor store state through the DOM:

- The editor exposes a `createDebugSnapshot()` function that serializes the current store state to JSON
- CT tests read this snapshot via a `data-store-debug` DOM attribute or the exported function
- `StoreDebugSnapshot` contains: `activeElementIds` (string array) and `elements` (array of `{ id, x, y, width, height, rotate?, anchorX?, anchorY? }`)
- `assertStoreDebugInvariants()` validates that all element positions/dimensions are finite numbers
- This protocol enables CT tests to assert geometric outcomes without importing the Zustand store directly

---

## 15. Cross-Package Integration Protocols

These are the runtime integration patterns that connect packages at behavioral boundaries. Specs define the WHAT; this section documents the HOW for an implementer.

### 15.0 Shared Data-Attribute Contract

The renderer owns these data attributes, which form cross-package contracts. Other packages MUST NOT invent new `data-*` attributes on rendered elements without updating this registry.

| Attribute              | Placed On             | Set By   | Consumed By                  | Purpose                                            |
| ---------------------- | --------------------- | -------- | ---------------------------- | -------------------------------------------------- |
| `data-element-id`      | Element container     | Renderer | Editor, Playback             | Identifies the element by document ID              |
| `data-element-content` | Inner content element | Renderer | Playback (style writer)      | Marks the animation style target for dynamic query |
| `data-opacity-target`  | Opacity wrapper       | Renderer | Playback (style writer)      | Target for opacity animation routing               |
| `data-visibility`      | Element container     | Renderer | Playback (state transitions) | Current visibility state class                     |

**Contract rule:** The playback style writer locates animation targets by querying `[data-element-content]` — it MUST NOT assume DOM structure (e.g., first-child). If no `data-element-content` element is found, the style writer falls back to the container element itself.

### 15.1 Ephemeral vs Committed Mutations

During interactive transforms (drag, resize, rotate), the editor performs **ephemeral updates** at 60fps that bypass undo history tracking. On pointer-up, a single **committed update** is recorded in the undo stack. This two-phase pattern is critical for performance and clean undo:

- Ephemeral: update element geometry → pause undo tracking → re-render canvas
- Commit: record final geometry → resume undo tracking → emit change to collaboration stream
- The collaboration change stream suppresses ephemeral updates (only committed changes are emitted)

### 15.2 Canvas Interaction Pipeline

User gestures on the canvas flow through this pipeline:

1. **Click on empty canvas** → `setActiveElement(null)` (deselect)
2. **Click on element** → `setActiveElement(id)` (select)
3. **Drag selected element** → ephemeral `updateElement()` calls during drag → `commitElementChange()` on drop
4. **Marquee drag** → `setActiveElements([...ids])` for all intersected elements
5. **Path editing** → overlay SVG handles on the selected path; drag handles emit updated `d` attribute strings

### 15.3 Property Editing Mode Routing

Property panels dynamically route edits based on whether a keyframe is selected:

- **Normal mode:** all property changes call store element update actions directly
- **Keyframe mode:** a property adapter intercepts edits and routes them to keyframe values; properties not included in the keyframe render as disabled

This routing is transparent to individual panel implementations — they use a resolver that returns the current value and onChange handler regardless of mode.

### 15.4 Timeline Action Callback Flow

When the playback controller encounters a keyframe with an action during playback, it fires a callback to the editor:

1. Playback controller calls `onTimelineAction(action, elementId, payload)`
2. Editor resolves the action:
   - `setState`: finds the state timeline binding by matching `payload` against binding `id` and `stateName`, then plays the resolved timeline
   - `addModifier` / `removeModifier`: toggles the modifier in the element's screen state
3. Screen state changes (`visibility`, `activeState`, `modifiers`) are applied to the element but excluded from collaboration diffs (they are ephemeral playback state)

### 15.5 Export Function Variance

Export functions follow a consistent pattern but return different types based on the format's delivery mechanism:

| Format                 | Return Type                | Notes                                                         |
| ---------------------- | -------------------------- | ------------------------------------------------------------- |
| JSON                   | `void` (triggers download) | Serializes BroadsetDocument directly                          |
| HTML                   | `string`                   | Self-contained HTML with embedded runtime                     |
| PDF                    | `Promise<Blob>`            | Async rendering pipeline                                      |
| PPTX                   | `Promise<Blob>`            | Async XML assembly                                            |
| SVG                    | `string`                   | Static SVG markup                                             |
| Raster (PNG/JPEG/WebP) | `Promise<Blob>`            | Canvas-based rendering                                        |
| Video (MP4/WebM)       | `Promise<Blob>`            | Requires `PlaybackController` instance for timeline rendering |

All exporters receive a `BroadsetDocument` as their primary input. Video export additionally requires a live `PlaybackController` for frame-by-frame capture.
