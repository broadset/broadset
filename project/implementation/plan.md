# Master Implementation Plan

This file is the index. Each phase lives in its own file to keep agent context
small when working on a single phase.

For repo guidance, see `../../README.md` and `../../AGENTS.md`.

---

## TDD Convention ("Ralph Loop")

Every unit below is implemented test-first using the acceptance criteria in the
corresponding spec file:

1. **Red** — translate the spec's `- [ ]` acceptance criteria into failing Jest tests
2. **Green** — write the minimum production code to make them pass
3. **Refactor** — clean up without breaking tests; commit

Each checklist item therefore has two sub-checks:

```
- [ ] tests: red   ← spec ACs translated into a failing test file
- [ ] impl: green  ← production code written; all tests pass
```

A unit is **done** only when both boxes are checked and `npm run quality` passes in
its package.

---

## Current Status

- **Active Phase:** Phase 2 — Renderer (static) + Demo shell
- **In Progress:** 2.1 Renderer core
- **Last Merged:** 1.10 JSON format reference / Zod schema

---

## Build Strategy — Walking Skeleton

Each phase ends with something visible and runnable in the browser. Never build
a library in isolation for long without being able to see it working.

```
Phase 1 — Model
  ↓ pure types, zero deps
Phase 2 — Renderer (static) + Demo shell
  ↓ pixels on screen: sample doc rendered
Phase 3 — Playback + Demo animated
  ↓ animations play in browser
Phase 4 — Editor + UI (feature by feature into demo)
  ↓ each feature group lands in the running demo
Phase 5 — Formats
  ↓ export/import; independent of editor, parallelisable after Phase 1
```

---

## Phase Files

| Phase | File                               | Packages                             | Status      |
| ----- | ---------------------------------- | ------------------------------------ | ----------- |
| 1     | [plan-phase-1.md](plan-phase-1.md) | `model`                              | not started |
| 2     | [plan-phase-2.md](plan-phase-2.md) | `renderer` + `demo` shell            | not started |
| 3     | [plan-phase-3.md](plan-phase-3.md) | `playback` + `demo` animated         | not started |
| 4     | [plan-phase-4.md](plan-phase-4.md) | `editor` + `ui` (feature groups A–I) | not started |
| 5     | [plan-phase-5.md](plan-phase-5.md) | `formats`                            | not started |

Update the Status column and the checkboxes inside each phase file as work
progresses.

types, 3D transform fields, clipChildren default.

### 1.4 Capability flags (`model/capabilities.md`)

- [ ] tests: red
- [ ] impl: green

_Spec:_ `project/spec/model/capabilities.md`
_What to cover:_ 10 boolean flags for each built-in type; unknown type → all
false; profile shape is complete (no missing keys).

### 1.5 Change stream types (`model/changes.md`)

- [ ] tests: red
- [ ] impl: green

_Spec:_ `project/spec/model/changes.md`
_What to cover:_ All 8 discriminated union variants; each carries required
fields; type guards / Zod discriminated union parse correctly.

### 1.6 Animation data structures (`model/animation.md`)

- [ ] tests: red
- [ ] impl: green

_Spec:_ `project/spec/model/animation.md`
_What to cover:_ AnimationRegistry (unique IDs, stale entries ignored),
ElementAnimationConfig, Timeline (named, ordered entries), Keyframe fields,
state/modifier binding structures, reserved IN/OUT names.

### 1.7 EditorConfig and feature flags (`model/config.md`)

- [ ] tests: red
- [ ] impl: green

_Spec:_ `project/spec/model/config.md`
_What to cover:_ EditorConfig shape, EditorFeatureConfig defaults per
documentMode (screen vs print), CanvasSettings defaults, ComponentPlugin
contract, MediaSourceConfig.

### 1.8 Document root invariants (`model/spec.md`)

- [ ] tests: red
- [ ] impl: green

_Spec:_ `project/spec/model/spec.md`
_What to cover:_ createEmptyBroadsetDocument(), documentMode immutability,
canvas dimension rejections, padding tuple, at least 1 page, flat element
arrays, unique IDs, intra-page acyclic parentId.

### 1.9 Model utilities (`model/utilities.md`)

- [ ] tests: red
- [ ] impl: green

_Spec:_ `project/spec/model/utilities.md`
_What to cover:_ deepClone (structural independence), capability profile lookup
(built-in, unknown, stable shape), clip-path parse/serialize round-trip (quoted
and unquoted, ≥2 decimal places, minimum non-zero dimensions).

### 1.10 JSON format reference / Zod schema (`model/format-reference.md`)

- [ ] tests: red
- [ ] impl: green

_Spec:_ `project/spec/model/format-reference.md`
_What to cover:_ Full Zod schema validating BroadsetDocument; common canvas
sizes parse correctly; invalid documents are rejected with structured errors.

---

## Phase 2 — Playback (depends on: model)

Target package: `packages/playback`

Pure computation — no DOM mutations in tests. Playback controller (2.3) touches
DOM; test with jsdom.

### 2.1 Interpolation engine (`playback/interpolation.md`)

- [ ] tests: red
- [ ] impl: green

_Spec:_ `project/spec/playback/interpolation.md`
_What to cover:_ All 5 easing presets, cubic-bezier solver (Newton's method,
tolerance 1e-6, malformed → linear), t clamped to [0,1], type dispatch (number,
hex color via OKLab, numeric string, array, step fallback), path morphing
(element-wise, different lengths rejected, 2dp rounding), hex-only color
contract.

### 2.2 Timeline computation (`playback/timeline.md`)

- [ ] tests: red
- [ ] impl: green

_Spec:_ `project/spec/playback/timeline.md`
_What to cover:_ Duration (max offset + 300ms, empty = 0, child timelines
accounted for), frame before/after/between keyframes, action state replay
(setState exclusive, add/removeModifier idempotent, backward seek from zero),
child timeline composition (relative offsets, absent until started), target
routing into targetProperties map, batch computation for all named timelines.

### 2.3 Playback controller (`playback/playback.md`)

- [ ] tests: red
- [ ] impl: green

_Spec:_ `project/spec/playback/playback.md`
_What to cover:_ PlaybackHandle API (play/pause/seek/setSpeed/cancel; cancelled
→ no-op); style writer target routing (`[data-element-content]`, opacity →
`[data-opacity-target]`, camelCase → kebab-case); DOM observation lifecycle
(attach/detach/destroy); offscreen = visibility:hidden + pointer-events:none;
transition suppression flag.

---

## Phase 3 — Renderer (depends on: model, playback)

Target package: `packages/renderer`

DOM output — tests run in jsdom. Validate data-attribute contract because
playback depends on it.

### 3.1 Renderer core (`renderer/spec.md`)

- [ ] tests: red
- [ ] impl: green

_Spec:_ `project/spec/renderer/spec.md`
_What to cover:_ All 4 data-attribute contracts (`data-element-id`,
`data-element-content`, `data-opacity-target`, `data-visibility`); scene tree
construction from flat array (parent resolution, orphan promotion, sibling
order); background style (gradient clears solid; solid clears gradient);
capability resolution order (plugin > built-in > all-false); renderer lifecycle
(mount, remount on type change, destroy clears host).

---

## Phase 4 — Editor (depends on: model, playback, renderer)

Target package: `packages/editor`

State management and business logic — mostly jsdom tests; React integration
tests use @testing-library/react.

Implement in dependency order within the package: pure geometry and mode helpers
first, then the store, then React bindings.

### 4.1 Path geometry (`editor/path-geometry.md`)

- [ ] tests: red
- [ ] impl: green

_Spec:_ `project/spec/editor/path-geometry.md`
_What to cover:_ Parse all supported SVG command types to deterministic segments;
implicit repeated coords normalized; empty → []; serialize round-trip stable;
extract editable handles (cubic C, smooth S, quadratic Q, horizontal H, vertical
V, arc A); bounds refit with stroke padding; empty path no-op.

### 4.2 Editing modes (`editor/editing.md`)

- [ ] tests: red
- [ ] impl: green

_Spec:_ `project/spec/editor/editing.md`
_What to cover:_ Path editing (start/stop, selection auto-exit, multi-select
keeps editing); path drawing (start/stop, addElement auto-enters, Escape commits,
Enter closes, selection auto-exit); point appending (M first, L subsequent,
coords relative to bbox, 2dp rounding, no-op outside drawing); element placement
(start/cancel/place with click position centering, no pending → no-op).

### 4.3 Core store actions (`editor/store-actions.md`)

- [ ] tests: red
- [ ] impl: green

_Spec:_ `project/spec/editor/store-actions.md`
_What to cover:_ Document init (replace + reset undo), selection CRUD
(single/multi/toggle/clear, exits editing modes), ephemeral vs committed
(ephemeral untracked by undo), group move (single snapshot), style update (all
BroadsetElementStyle props), undo/redo full-snapshot cycle with configurable
limit.

### 4.4 UI-workspace actions (`editor/store-ui-actions.md`)

- [ ] tests: red
- [ ] impl: green

_Spec:_ `project/spec/editor/store-ui-actions.md`
_What to cover:_ Page navigation (out-of-range ignored, clears selection), page
add/remove (≥1 page invariant, active index adjustment), canvas settings merge
(NOT tracked by undo), guide CRUD (h/v type, mm position, locked flag), color
palette (reject duplicates, remove by index), fonts/media CRUD.

### 4.5 Runtime data store (`editor/data-store.md`)

- [ ] tests: red
- [ ] impl: green

_Spec:_ `project/spec/editor/data-store.md`
_What to cover:_ Empty default init; merge update (partial, new elements
created); full replacement; bulk update (single subscription notification);
selector isolation (unrelated selectors not triggered); store independence
(multiple stores fully independent).

### 4.6 Animation state mutations (`editor/animation-state.md`)

- [ ] tests: red
- [ ] impl: green

_Spec:_ `project/spec/editor/animation-state.md`
_What to cover:_ Timeline upsert/remove (idempotent, preserves unrelated);
state timeline binding (idempotent by name, reserved IN/OUT protected from
removal, reorder custom only); modifier binding (replace same-name); element
state → visibility mapping (entry=onscreen, exit=offscreen); descendant
propagation; modifier deduplication; custom clip-path persistence.

### 4.7 Collaboration / change stream (`editor/collaboration.md`)

- [ ] tests: red
- [ ] impl: green

_Spec:_ `project/spec/editor/collaboration.md`
_What to cover:_ Element diffing (add/remove/update paths/reorder, runtime
animation fields excluded, identical docs → empty diff); page/settings diffing;
animation registry diffing (config adds/removals, per-field changes); change
stream (subscribe/unsubscribe, suppress flag, empty arrays not emitted);
ephemeral vs committed (only committed emitted, commit after ephemeral emits
full diff from last committed state).

### 4.8 Transform interactions (`editor/transforms.md`)

- [ ] tests: red
- [ ] impl: green

_Spec:_ `project/spec/editor/transforms.md`
_What to cover:_ Drag (ephemeral during, committed on drop); 8 resize handles
(corners both axes, edges one axis); rotation handle; anchor auto-assignment
(quadrant-based anchorX/Y recalculation after translation); zoom compensation
(deltas ÷ zoom); 3D field persistence; border radius handles (rectangle only).

### 4.9 Keyboard shortcuts (`editor/keyboard.md`)

- [ ] tests: red
- [ ] impl: green

_Spec:_ `project/spec/editor/keyboard.md`
_What to cover:_ Shortcut map (key+modifier → action, host overrides merge with
defaults); nudge (1mm / 10mm with Shift, multi-element simultaneous); clipboard
(copy captures elements, paste at same position, duplicate); delete
(Delete/Backspace, deselects); select-all (all IDs on active page); group
(Ctrl+G shared groupId) / ungroup (Ctrl+Shift+G clear groupId).

### 4.10 Canvas behaviors (`editor/canvas.md`)

- [ ] tests: red
- [ ] impl: green

_Spec:_ `project/spec/editor/canvas.md`
_What to cover:_ Element rendering (positioned DOM nodes scaled by zoom, only
active page visible); click selection (element → select, void → deselect all);
marquee selection (intersecting rect → selected); zoom (scroll/pinch) + pan
(background drag) reflected in CanvasSettings; grid visibility; ruler ticks;
guide dragging from rulers; safety overlay modes (broadcast/print/none).

### 4.11 Timeline playback coordination (`editor/timeline-playback.md`)

- [ ] tests: red
- [ ] impl: green

_Spec:_ `project/spec/editor/timeline-playback.md`
_What to cover:_ Controller registration; snapshot restore before play/seek;
stop delegation; editing-close restoration (stop + restore); no-op without
controller (don't mutate screen state); transition suppression window timing.

### 4.12 React data integration (`editor/react-data-integration.md`)

- [ ] tests: red
- [ ] impl: green

_Spec:_ `project/spec/editor/react-data-integration.md`
_What to cover:_ EditorProvider context (store + component registry), error
boundary (fallback UI, rest of app continues), timeline playback hook
(play/pause/seek/stop/currentTime), selector render isolation, provider boundary
enforcement (error outside provider), reactive propagation.

---

## Phase 5 — Formats (depends on: model; independent of editor)

Target package: `packages/formats`

Can be developed in parallel with editor phases 4.x. Each sub-spec is
independent of the others; implement in order of increasing complexity.

### 5.1 JSON interchange and utilities (`formats/interchange.md`)

- [ ] tests: red
- [ ] impl: green

_Spec:_ `project/spec/formats/interchange.md`
_What to cover:_ JSON export/import round-trip (BroadsetDocument ↔ JSON string);
OGraf package creation; QR SVG generation; filename sanitization; stress tests
(large documents, deeply nested elements).

### 5.2 Raster export (`formats/raster.md`)

- [ ] tests: red
- [ ] impl: green

_Spec:_ `project/spec/formats/raster.md`
_What to cover:_ PNG/JPEG export; pixel-ratio behaviour (1x, 2x); canvas
discovery from rendered DOM.

### 5.3 Web vector (SVG / HTML) (`formats/web-vector.md`)

- [ ] tests: red
- [ ] impl: green

_Spec:_ `project/spec/formats/web-vector.md`
_What to cover:_ SVG export/import round-trip; HTML standalone export with
embedded playback runtime.

### 5.4 PDF export (`formats/pdf.md`)

- [ ] tests: red
- [ ] impl: green

_Spec:_ `project/spec/formats/pdf.md`
_What to cover:_ PDF generation; color parsing; font embedding; text wrapping;
QR code rendering.

### 5.5 PPTX export/import (`formats/pptx.md`)

- [ ] tests: red
- [ ] impl: green

_Spec:_ `project/spec/formats/pptx.md`
_What to cover:_ PPTX export with SVG fallback; import with path recovery;
round-trip fidelity requirements.

### 5.6 PSD export/import (`formats/psd.md`)

- [ ] tests: red
- [ ] impl: green

_Spec:_ `project/spec/formats/psd.md`
_What to cover:_ PSD export (layers, masks, effects, artboards); import; path
vector conversion.

---

## Phase 6 — UI (depends on: model, editor)

Target package: `packages/ui`

React component tests use @testing-library/react. Implement utilities and
primitive inputs first; panels and modals depend on inputs.

### 6.1 CSS utilities and parsers (`ui/utilities.md`)

- [ ] tests: red
- [ ] impl: green

_Spec:_ `project/spec/ui/utilities.md`
_What to cover:_ Shadow parse/build (box/text-shadow ↔ structured object); filter
parse/build (function/value/unit arrays ↔ CSS string); CSS length parse (value +
unit, empty → 0px); animation binding normalization (IN/OUT presence, sequential
numbering, fallback IDs, reserved first); timeline/state resolution; keyframe
value resolution (zero preserved, disabled routing).

### 6.2 Input components (`ui/inputs.md`)

- [ ] tests: red
- [ ] impl: green

_Spec:_ `project/spec/ui/inputs.md`
_What to cover:_ Color picker (saturation/brightness area + hue slider,
hex/rgba text, invalid strings not submitted, alpha); CSS length input (numeric +
unit switching, auto-convert); text stroke input (width + color → text-stroke
shorthand); filter editor (stack CRUD, ordered, individually configurable);
shadow editor integration.

### 6.3 Toolbar, context menu, element library, page sorter (`ui/toolbar-nav.md`)

- [ ] tests: red
- [ ] impl: green

_Spec:_ `project/spec/ui/toolbar-nav.md`
_What to cover:_ Toolbar actions (JSON export from document, feature-gated
export visibility, undo/redo, alignment ≥2 elements, distribute ≥3 elements);
context menu (not rendered before right-click, position, items disabled with no
element, all 8 actions, group/ungroup visibility, closes after action); element
library (7 built-in tiles, custom plugins with icons, startPlacement on click, 2-
column grid); page sorter (tabs match page count, switching, add/remove, remove
hidden at 1 page).

### 6.4 Property panels and sidebars (`ui/panels.md`)

- [ ] tests: red
- [ ] impl: green

_Spec:_ `project/spec/ui/panels.md`
_What to cover:_ Properties sidebar (screen gradient switcher, print hides
gradient/3D/clip, custom property panels, showAnimations flag); animation mode
properties panel (keyframe adapter contracts, included editable, excluded
disabled); box effects (screen only); clip-path (start/editing/stop states,
default path seeding); preflight (zero-issue success, structured issue list,
success hidden when issues exist); animation sidebar (element selected + enabled,
empty/disabled states, lock helper); property field keyframe integration.

### 6.5 Modal dialogs (`ui/modals.md`)

- [ ] tests: red
- [ ] impl: green

_Spec:_ `project/spec/ui/modals.md`
_What to cover:_ About modal (open/close rendering); canvas settings (all
controls fire callbacks); export modal (feature-gated exporters, submit payload,
selection preserved on data update); media library (empty state, assets, search,
categories, select+confirm, Upload conditional); new document (category tabs,
preset selection → createDocument, empty selection no-op, custom overrides
built-in); shortcut help (5 groups, kbd elements, close).

### 6.6 Timeline editor and bottom panel (`ui/timeline.md`)

- [ ] tests: red
- [ ] impl: green

_Spec:_ `project/spec/ui/timeline.md`
_What to cover:_ Keyframe management (empty state, + button add+select, single
selection, re-click keeps selected, aria-pressed hint); keyframe drag
repositioning (visual indicator, committed on drop); playback (calls
onPlayTimeline without onComplete); bottom panel (aria-hidden, open/close,
height/className, callbacks); editing context (start with no target, open sets
target+snapshot, close clears both, null outside provider); animation binding
sections (state bindings CRUD with rename, modifier binding pairs).

---

## Phase 7 — Demo (depends on: all packages)

Target package: `packages/demo`

Integration-level tests only (Playwright CT). Each sub-spec represents a
user-observable behaviour, not a unit.

### 7.1 EditorConfig configuration (`demo/config.md`)

- [ ] tests: red (CT smoke tests)
- [ ] impl: green

_Spec:_ `project/spec/demo/config.md`
_What to cover:_ ≥5 web fonts; ≥8 palette colors including black and white;
≥1 preset per category; ≥1 required element; media source configured; ≥1 custom
plugin with all fields; change stream logging; grid/undo defaults.

### 7.2 Provider wiring and persistence (`demo/state.md`)

- [ ] tests: red
- [ ] impl: green

_Spec:_ `project/spec/demo/state.md`
_What to cover:_ All 3 providers wired (EditorProvider, TimelineEditingProvider,
BroadsetDataStoreProvider); sidebar preferences persist across reload (versioned
key, corrupt → silent ignore); toast messages (success ~3s, error ~5s); fullscreen
toggle; browser zoom prevention (pinch, Ctrl+scroll, Ctrl+±/0, Safari gesture);
overflow lock on mount/unmount; save via onSave callback.

### 7.3 App shell layout (`demo/layout.md`)

- [ ] tests: red
- [ ] impl: green

_Spec:_ `project/spec/demo/layout.md`
_What to cover:_ 100vw × 100vh, overflow hidden; EditorCanvas in RulerSystem in
ErrorBoundary; glass-morphism floating main toolbar (top-left, above ruler
offset); vertical element toolbar; resizable right sidebar (256px–800px, persists
width, tab switching closes/opens); context menu on canvas; timeline panel.

### 7.4 Data injection and export orchestration (`demo/data-integration.md`)

- [ ] tests: red
- [ ] impl: green

_Spec:_ `project/spec/demo/data-integration.md`
_What to cover:_ Live data store populated with initial placeholders (scores,
clock, ticker); mock hook periodic updates reflected in renderers; dynamic data
passed to exports (not stale tokens); lazy format loading (not in initial bundle,
cached); all enabled export formats through ExportModal (success/error toasts);
import orchestration (success/error toasts); new document creation from
NewDocumentModal preset; sample document on startup.

### 7.5 Visual design (`demo/visual.md`)

- [ ] tests: red (visual regression or snapshot)
- [ ] impl: green

_Spec:_ `project/spec/demo/visual.md`
_What to cover:_ Dark theme; glass-morphism panels with backdrop blur; all 7
element type icons; toolbar action icons; custom plugin default icon fallback;
responsive canvas (fills available space, no scrollbars on resize).

---

## Progress Summary

| Phase        | Units  | Red   | Green |
| ------------ | ------ | ----- | ----- |
| 1 — Model    | 10     | 0     | 0     |
| 2 — Playback | 3      | 0     | 0     |
| 3 — Renderer | 1      | 0     | 0     |
| 4 — Editor   | 12     | 0     | 0     |
| 5 — Formats  | 6      | 0     | 0     |
| 6 — UI       | 6      | 0     | 0     |
| 7 — Demo     | 5      | 0     | 0     |
| **Total**    | **43** | **0** | **0** |

Update the counts (and the `- [ ]` boxes above) as work progresses.
