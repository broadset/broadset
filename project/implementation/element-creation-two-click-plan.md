# Element Creation — Two-Click (and Three-Click) Placement Plan

## Goal

Replace the current **click-places-at-default-size** behavior with a proper **click → move (preview) → click** flow, and remove the floating "placement mode" banner. Built-in element sizes are always derived from the user's clicks — no fallback to factory defaults. Ellipse gets a third click for rotation. External plugins keep single-click placement.

## Scope / Principles

- **User clicks always determine size.** Built-ins never fall back to default dimensions when the user's extent click lands on (or near) the anchor. If the extent click equals the anchor, the click is ignored and we stay in the sizing sub-state.
- **No huge banner.** Placement state is communicated by the crosshair cursor and the active toolbar button highlight only. (An optional subtle bottom-bar chip is allowed; no floating card.)
- **External plugins use single-click placement by default.** They are the only path that may create an element at a factory-declared default size. Built-ins are always multi-click.

## Anchor semantics per element type

| Element | Mode | Click 1 | Click 2 | Click 3 |
|---|---|---|---|---|
| rectangle, image, svg, video, qrcode, clock, ticker, group, text | two-click (corner) | top-left corner | bottom-right corner | — |
| ellipse | three-click (center+radius+theta) | center | `rx = |Δx|`, `ry = |Δy|` from center | `rotation = atan2(Δy, Δx)` in degrees |
| path | multi-click | first vertex (M) | second vertex (L) | further clicks keep adding; Enter/Esc commits |
| plugin element types | single-click | place at plugin's declared default size at click point | — | — |

Ellipse phase-2 rule: `rx` / `ry` come from the component-wise deltas of the click vs. center (so a diagonal click produces an oval, a near-horizontal click produces a flat oval). This is the literal reading of "center, radius, theta" and is authoritative for this plan.

**Text note:** text follows the uniform two-click rule. Inline edit begins after the extent click commits. No single-click-to-default-and-edit shortcut.

## Spec update (do first)

Rewrite `project/spec/editor/editing.md:272-331` ("Element Placement Mode"):

- Replace drag-to-create + 5 mm minimum with the two-click model and the per-type anchor table above.
- Document the three-phase ellipse flow and the multi-click path flow.
- Document that built-ins never fall back to default size; the extent click ON the anchor is ignored.
- Document that external plugins are single-click placements.
- Escape cancels at any sub-state and returns `editingMode` to `{ type: 'none' }`.

## State machine changes

`packages/editor/src/store-actions/store.ts:37-44` — replace the single `placement` variant with per-phase variants:

```ts
| { readonly type: 'placement-anchor'; readonly elementType: string }
| { readonly type: 'placement-extent'; readonly elementType: string; readonly anchor: { x: number; y: number } }
| { readonly type: 'placement-ellipse-radius'; readonly anchor: { x: number; y: number } }
| { readonly type: 'placement-ellipse-rotation'; readonly anchor: { x: number; y: number }; readonly radius: { rx: number; ry: number } }
```

Drop `pendingPlacementType: string | null` and replace with a single `placement: PlacementState | null` field (the discriminated union above, or `null` when inactive). Preview pointer position is stored as an ephemeral `placementPreview: { x: number; y: number } | null` — updated on every pointer-move, never part of history.

`path` placement skips the generic extent state: first click creates the path element with a single M point and enters the existing `path-drawing` editing mode. All further clicks dispatch to `appendPathPoint`.

## Commands

`packages/editor/src/editing/commands.ts` — split the existing `placeElement` into focused actions:

1. `beginPlacement(store, elementType)` — sets `placement-anchor`. (Existing `startPlacement` renamed.)
2. `setPlacementAnchor(store, x, y)` — transitions to the correct next sub-state based on `elementType`:
   - corner types → `placement-extent`
   - ellipse → `placement-ellipse-radius`
   - path → creates the element with one M point and enters `path-drawing`
   - plugin single-click type → creates element immediately at plugin default size and clears placement
3. `updatePlacementPreview(store, x, y)` — ephemeral preview update (no history).
4. `commitPlacementExtent(store, x, y)` — corner types only: creates the element using `resolvePlacementBounds`, records history, clears placement.
5. `setEllipseRadius(store, x, y)` — transitions `placement-ellipse-radius → placement-ellipse-rotation`.
6. `commitEllipseRotation(store, x, y)` — creates the ellipse with `rotation` applied, clears placement.
7. `cancelPlacement(store)` — works in any sub-state; returns to `{ type: 'none' }`.

Add a pure resolver in a sibling file (e.g. `packages/editor/src/editing/placement-bounds.ts`):

```ts
resolvePlacementBounds(
  elementType: string,
  anchor: { x: number; y: number },
  extent: { x: number; y: number },
  plugins: ElementPluginRegistry,
): { position: { x: number; y: number }; width: number; height: number; rotation?: number }
```

All anchor math (corner normalization for negative drags, ellipse center-to-radius, etc.) lives here so commands and tests share one source of truth.

Ignore-same-point rule: `setPlacementAnchor → commitPlacementExtent` (and the two ellipse transitions) check that the new click is not the same point as the current anchor/preview. If it is, the action is a no-op and state is unchanged.

## UI / canvas

- **Remove the banner** at `packages/demo/src/demo-app/layout-side-rails.tsx:73-104`. Active toolbar button + crosshair cursor are the only placement affordances.
- **Canvas click handler** at `packages/demo/src/demo-app/command-handlers.ts:114-147`: dispatch based on current `placement` sub-state — `setPlacementAnchor`, `commitPlacementExtent`, `setEllipseRadius`, `commitEllipseRotation`, or `appendPathPoint`.
- **Pointer move**: during any `placement-*` extent/radius/rotation sub-state or `path-drawing`, call `updatePlacementPreview` with doc coords. Current `handlePointerMove` in `packages/demo/src/demo-components/screen-preview.tsx:514-516` only tracks panning; extend it.
- **Placement-preview overlay**: new SVG overlay component in `packages/renderer/src/` that reads from the store and renders only when placement is in an extent/radius/rotation or path-drawing sub-state:
  - corner-anchored types → dashed rect from anchor to preview point
  - ellipse radius phase → dashed axis-aligned ellipse (center at anchor, rx/ry from Δ components to preview)
  - ellipse rotation phase → the committed rx/ry ellipse, rotated so the major axis points at the preview
  - path → dashed line from last committed vertex to preview, plus dots at committed vertices
- **Cursor**: crosshair throughout all placement sub-states (already set during placement mode).

## Tests

### Unit — `packages/editor/src/editing.defaults-placement.test.ts` (rename or add sibling)

- Pure `resolvePlacementBounds`:
  - corner normalization for all four drag directions
  - ellipse: center + radius extent → correct position, width, height, rotation = 0
  - ellipse: center + radius + rotation → rotation in degrees
- `setPlacementAnchor` / `commitPlacementExtent` state transitions for corner types
- Ellipse three-phase transitions
- Path: `setPlacementAnchor` creates single-point element and enters `path-drawing`
- Plugin single-click: `setPlacementAnchor` creates element at plugin-declared default size and clears placement
- Same-point ignore: `commitPlacementExtent(anchor, anchor)` is a no-op, sub-state unchanged
- Cancel from every sub-state → `{ type: 'none' }`, no element created

### CT (Playwright)

- `packages/demo/ct/canvas-transform/handles.ct.tsx:36-69` — replace click-only placement with two-click rectangle creation; assert measured bounds match clicks
- New: two-click image / qrcode / clock / ticker creation (spot-check one or two more to prove the corner flow is generic)
- New: three-click ellipse creation — assert rx/ry from phase-2 delta and rotation from phase-3 angle
- New: multi-click path creation with Enter commit
- New: Escape during extent / radius / rotation cancels and leaves no element on the canvas
- New: same-point extent click is ignored — element not yet created, still in sizing state
- New: plugin single-click placement creates element at declared default size
- Update `packages/demo/ct/state/demo-state-data.ct.tsx:226-230` and `packages/demo/ct/layout/toolbar-navigation.ct.tsx:66-84` — assert the banner is **absent**; active toolbar button + crosshair cursor remain the only indicators

## Execution order

1. Update `project/spec/editor/editing.md`.
2. Land `resolvePlacementBounds` + its unit tests.
3. Split the store state + commands; update existing unit tests.
4. Wire demo canvas click + pointer-move handlers.
5. Add placement-preview overlay in `packages/renderer`.
6. Remove the banner; update CT tests (banner absence + new multi-click CTs).
7. `npm run gate:full`.

## Files touched (anticipated)

- `project/spec/editor/editing.md`
- `packages/editor/src/store-actions/store.ts`
- `packages/editor/src/editing/commands.ts`
- `packages/editor/src/editing/placement-bounds.ts` (new)
- `packages/editor/src/element-defaults.ts` (add `placementMode` field; no functional regression for single-click plugins)
- `packages/editor/src/editing.defaults-placement.test.ts` (rewritten)
- `packages/editor/src/index.ts` (barrel export new symbols)
- `packages/demo/src/demo-app/command-handlers.ts`
- `packages/demo/src/demo-app/layout-side-rails.tsx` (banner removal)
- `packages/demo/src/demo-components/screen-preview.tsx` (pointer-move → preview)
- `packages/renderer/src/placement-preview-overlay.tsx` (new)
- `packages/renderer/src/index.ts` (barrel export)
- `packages/demo/ct/canvas-transform/handles.ct.tsx`
- `packages/demo/ct/layout/toolbar-navigation.ct.tsx`
- `packages/demo/ct/state/demo-state-data.ct.tsx`
- New CT files for ellipse / path / plugin single-click scenarios under `packages/demo/ct/canvas-transform/`

## Out of scope

- Press-and-drag-release as an alternative gesture (not requested).
- Modifier keys (Alt to recenter, Shift to constrain aspect ratio, etc.).
- Snapping / guides during placement preview.
- Changes to path-drawing completion semantics (Enter/Escape behavior stays as today).
