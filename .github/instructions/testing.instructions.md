---
description: 'Use when writing or reviewing tests — unit tests (Jest + React Testing Library) and component tests (Playwright CT). Covers test strategy for math utilities, Zustand store, hooks, canvas interactions, and renderer parity.'
applyTo: packages/*/src/**/*.test.*, ct/**
---

# Testing Strategy

## Unit Tests (Jest + React Testing Library)

### Math Utilities

- Exhaustive tests for `pxToMm` and `mmToPx` in `units.ts`.
- Test `calculateEdgeAnchors` with multiple simulated canvas sizes and coordinates that cross the center-line.

### Zustand Store

- Test the vanilla store **independently of React**.
- Prove `updateElementEphemeral` updates coordinates correctly.
- Prove `commitElementChange` recalculates anchors on center-line cross.
- Prove `reorderElement` shifts array indexes without data loss.

### Custom Hooks

- Test `useEditorStore` selector logic with React Testing Library.

## Component Tests

### Canvas Interaction

- Simulate real pointer events: click a `<TransformableNode>`, drag 100px, release, assert DOM update and Zustand state commit.

## General Rules

- Code is not complete unless it is tested.
- Run `npm run test` for unit tests, `npm run ct` for Playwright component tests.
- Run the full Playwright CT suite before every 25th commit or before concluding a major feature block.
