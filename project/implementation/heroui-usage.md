# HeroUI Usage Improvement Audit

This file records only confirmed opportunities to improve HeroUI usage in `packages/ui`, `packages/editor`, and `packages/demo`.

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

### 2) Replace raw reload button in error boundary with HeroUI button

- File: `packages/editor/src/react-data-integration.tsx` (inside `EditorErrorBoundary.render` fallback)
- Current:
  - A raw `<button>` with inline styling is used for "Reload".
- Improvement:
  - Use HeroUI `Button` with semantic variant/color and token-compatible styling.
- Why:
  - Keeps UI chrome consistent with HeroUI behavior and accessibility.
  - Avoids hand-rolled focus/interaction styles for a critical recovery action.

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

### 4) Use explicit Dropdown trigger composition in toolbar menu wrapper

- File: `packages/demo/src/demo-components/toolbar-controls.tsx` (`ToolbarMenu`)
- Current:
  - `Dropdown` root directly wraps a `Button` and `Dropdown.Popover`.
- Improvement:
  - Prefer explicit `Dropdown.Trigger` wrapping the button and keep `Dropdown.Popover`/`Dropdown.Menu` as the content pair.
- Why:
  - Matches HeroUI compound composition patterns directly and improves readability/maintainability for future contributors.
