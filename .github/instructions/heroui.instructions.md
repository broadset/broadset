---
description: 'Use when building or editing the HeroUI v3 host package — sidebars, toolbars, modals, form controls, layout, theming, and accessibility.'
applyTo: 'packages/ui/src/**'
---

# HeroUI Host Package Rules (`@broadset/ui`)

> The `packages/ui/` directory contains the **`@broadset/ui`** package — a full-featured UI layer that consumes the headless engine via `useEditorStore` and provides the complete editor experience (sidebars, toolbars, property panels, animation controls) using HeroUI v3 components.

## Component Usage

- Use `@heroui/react` for **everything** outside the raw canvas. Never build custom dropdowns, toggles, or modals when a HeroUI equivalent exists.
- Use HeroUI `Accordion` for collapsible property panels, `Tabs` for sidebar sections, `Modal` for dialogs, `Select` for selections, `Switch` for boolean toggles, `TextField`/`NumberField`/`TextArea` for form fields.

## Styling & Tokens

- **Never hardcode** HEX colors, font sizes, or padding in the UI shell.
- Use the design tokens from `tokens.ts` via the `sp()`, `color()`, and `font()` helpers.
- Adhere to the spacing and typography token scales for a dense, professional layout.

## Accessibility

- Every HeroUI component must have proper `aria-labels`.
- The UI must be fully keyboard-navigable (Tab, Enter, Space, Arrows).
- Focus states must use HeroUI's default focus rings — do not override them.

## Feedback & Error States

- Inputs must show clear validation error states using HeroUI's built-in validation props.
- **Zero layout shift (CLS):** Pre-allocate space for dynamic elements. The UI must not jump when the canvas loads, sidebars expand, or fonts are injected.

## State Binding

Bind all HeroUI inputs to the `useEditorStore` hook:

```tsx
<TextField value={activeElement.fontSize} onChange={(v) => updateElementStyle(activeElement.id, { fontSize: v })}>
  <Label>Font Size</Label>
  <Input />
</TextField>
```
