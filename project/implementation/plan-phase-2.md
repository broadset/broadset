# Phase 2 — Renderer (static) + Demo shell

**Packages:** `packages/renderer`, `packages/demo`
**Depends on:** Phase 1 (model)
**Index:** [plan.md](plan.md)

**Goal by end of phase:** A running browser app (`packages/demo`) that loads a
hard-coded sample `BroadsetDocument` and renders it visually. No editing
controls. No animations. Just pixels on screen proving the renderer works.

---

## 2.1 Renderer core (`renderer/spec.md`)

- [x] tests: red
- [x] impl: green

_Spec:_ `project/spec/renderer/spec.md`
_What to cover:_ All 4 data-attribute contracts (`data-element-id`,
`data-element-content`, `data-opacity-target`, `data-visibility`); scene tree
construction from flat array (parent resolution, orphan promotion, sibling
order); background style (gradient clears solid; solid clears gradient);
capability resolution order (plugin > built-in > all-false); renderer lifecycle
(mount, remount on type change, destroy clears host).

## 2.2 Sample document fixture

- [ ] tests: red
- [ ] impl: green

_Spec:_ `project/spec/demo/data-integration.md` (sample document section)
_What to cover:_ A hard-coded `BroadsetDocument` exercising all 8 built-in
element types, at least 2 pages, valid canvas dimensions, no animations yet.
Exported as a constant from `packages/demo/src/sampleDocument.ts`. Tests verify
it passes the Phase 1 Zod schema.

## 2.3 Demo shell: mount renderer

- [ ] tests: red (Playwright CT)
- [ ] impl: green

_Spec:_ `project/spec/demo/layout.md`, `project/spec/demo/visual.md`
_What to cover:_

- 100vw × 100vh layout, overflow hidden, dark theme
- Renderer mounted and displaying the sample document
- All 8 element types visible in the browser
- Responsive canvas (fills available space, no scrollbars)

---

## Progress

| Unit                        | Red | Green |
| --------------------------- | --- | ----- |
| 2.1 renderer core           | ☑   | ☑     |
| 2.2 sample document fixture | ☐   | ☐     |
| 2.3 demo shell              | ☐   | ☐     |
