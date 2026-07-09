# HeroUI Usage Improvement Audit

Status: current audit findings verified 2026-07-09. Sequencing belongs to W2-A11Y-01/W2-QE-01 and the owning child plans.

This file records confirmed opportunities to improve HeroUI usage in `packages/ui`, `packages/editor`, and `packages/demo`. It is evidence, not independent execution authority.

## Pass 1: `packages/ui`

### 1) Replace custom interactive label in layer rows with HeroUI button semantics

- File: `packages/ui/src/layers-sidebar.tsx` (around the layer-name selection span with `role="button"`)
- Current:
  - A `<span role="button" tabIndex={0}>` handles selection and keyboard activation.
- Improvement:
  - Use a HeroUI `Button` (ghost/flat styling, full-width, left-justified content) for the selectable row label region, and keep multi-select behavior in `onPress`/keyboard handlers.
- Why:
  - Aligns with HeroUI's accessibility model instead of recreating button semantics manually.
  - Reduces custom key handling surface and keeps interactive chrome consistently HeroUI-based.

## Pass 2: `packages/editor`

### 2) Move recovery chrome out of the editor package boundary

- File: `packages/editor/src/react-data-integration.tsx` (inside `EditorErrorBoundary.render` fallback)
- Current:
  - A raw `<button>` with inline styling is used for "Reload".
- Improvement:
  - Keep `@broadset/editor` independent of `@heroui/react`. Expose a semantic recovery callback/fallback slot and render the actual recovery `Button` from `@broadset/ui` or the demo host. Until that boundary-safe composition lands, use native semantic button behavior in the headless editor fallback and test keyboard/focus/recovery behavior.
- Why:
  - Importing HeroUI into `editor` would violate the package graph.
  - Host-owned recovery chrome keeps the normal product surface consistent without coupling editor state primitives to a UI kit.

## Pass 3: `packages/demo`

### 3) Replace custom `role="button"` delete affordance inside snapshot menu rows

- File: `packages/demo/src/demo-app/layout-main-toolbar.tsx` (snapshot row delete affordance)
- Current:
  - A `<span role="button" tabIndex={0}>` with custom click/key handlers is used inside `Dropdown.Item`.
- Improvement:
  - Use HeroUI `Button` (or `CloseButton`) as an icon-only destructive affordance and stop propagation in its press handler.
- Why:
  - Uses native HeroUI interaction semantics instead of manual keyboard emulation.
  - Improves consistency and reduces a11y edge-case risk in menu rows.

### 4) Explicit Dropdown trigger composition in toolbar menu wrapper — resolved

- File: `packages/demo/src/demo-components/toolbar-controls.tsx` (`ToolbarMenu`)
- Current:
  - `ToolbarMenu` uses `Dropdown.Trigger` around the button and keeps `Dropdown.Popover`/`Dropdown.Menu` as the content pair.
- Evidence:
  - `packages/demo/src/demo-components/toolbar-controls.tsx`
- Why:
  - Matches HeroUI compound composition patterns directly and improves readability/maintainability for future contributors.
