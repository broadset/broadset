# Executive Summary

> **Canonical location:** `project/spec/executive-summary.md`
>
> This root-level file is kept as a temporary compatibility entrypoint while the documentation is being reorganized. The authoritative high-level behavioral summary now lives under Spec.
>
> **broadset** — "Design Once, Render Anywhere"
>
> A headless template editor delivered as a monorepo of seven packages.
> This summary is derived exclusively from the behavioral specs in `project/spec/`
> and the structural manifest in `implementation/architecture.md`. Every statement traces
> back to a specific spec file; amending this summary implies amending the
> corresponding spec.

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [Document Model](#2-document-model)
3. [Elements](#3-elements)
4. [Element Styling](#4-element-styling)
5. [Screen Properties](#5-screen-properties)
6. [Animation Data Model](#6-animation-data-model)
7. [Playback Engine](#7-playback-engine)
8. [Renderer](#8-renderer)
9. [Editor Engine](#9-editor-engine)
10. [Format Import and Export](#10-format-import-and-export)
11. [UI Layer (HeroUI)](#11-ui-layer-heroui)
12. [Demo Application](#12-demo-application)
13. [Configuration System](#13-configuration-system)
14. [Cross-Cutting Concerns](#14-cross-cutting-concerns)
15. [Spec Traceability Index](#15-spec-traceability-index)

---

## 1. Product Overview

<!-- Source: config.yaml, architecture.md §1 -->

broadset is a headless template editor library. It lets host
applications create, edit, animate, and export design documents without
being coupled to any particular UI framework or rendering surface. The
system is organized into seven packages with strict dependency
boundaries:

| Package    | Role                                                     |
| ---------- | -------------------------------------------------------- |
| `model`    | Document types, validation, clone, unit conversion       |
| `playback` | Animation engine — easing, interpolation, playback       |
| `renderer` | DOM element rendering and scene tree construction        |
| `editor`   | Headless editor engine — store, transforms, canvas       |
| `formats`  | Import/export — PDF, PPTX, PSD, SVG, HTML, raster, video |
| `ui`       | React UI component library — panels, modals, timeline    |
| `demo`     | Reference host application integrating all packages      |

The dependency graph flows strictly downward:

```
model (foundation — no internal deps)
  └── playback
        └── renderer
              └── editor
formats (depends on model + playback, not renderer or editor)
ui (peer-depends on editor, formats, model, renderer)
demo (integrates everything)
```

No feature is considered complete until it is exposed and usable in the
demo app, which serves as the integration validation surface.

---

## 2. Document Model

<!-- Source: project/spec/model/spec.md -->

A `BroadsetDocument` is the root data type. Every document carries:

- A non-empty string **id**.
- A **documentMode** of `'screen'` or `'print'`, immutable after
  creation. Implementations enforce this via the type system and reject
  runtime mutation attempts.
- **Canvas dimensions** (width × height) in millimeters, both positive
  and finite. The sample document uses 508 mm × 285.75 mm, which
  equals 1920 px × 1080 px at 96 DPI.
- **Canvas padding** as a 4-tuple `[top, right, bottom, left]` of
  non-negative finite numbers.
- A **pages** array that always contains at least one page.
- An **animation registry** — a flat array keyed by element ID.

### Pages and Element Storage

<!-- Source: project/spec/model/spec.md — Flat Element Tree, Non-Empty Pages -->

Pages store elements as a flat array. There is no recursive DOM-like
nesting. Parent-child relationships are expressed via `parentId`
references. This flat structure simplifies serialization, diffing, and
collaboration.

### Validation Invariants

<!-- Source: project/spec/model/spec.md — Element Identity, Dimensions, Parent-Child -->

- Element IDs are non-empty strings, unique within their page.
- Element width and height must be positive and finite.
- `parentId` references must point to elements on the same page.
- The `parentId` graph must be acyclic.
- Deleting a parent removes all descendants (with special handling for
  required elements — see §9).
- Animation registry entries must not duplicate element IDs. Stale
  entries (referencing deleted elements) are silently ignored.

### No Hard Limits

<!-- Source: project/spec/model/spec.md — No Hard Page or Element Limits -->

The document model imposes no upper limit on pages per document or
elements per page. The renderer targets 60fps with up to 100 visible
elements, but exceeding this is valid — it may degrade performance.

---

## 3. Elements

<!-- Source: project/spec/model/element.md -->

Every element (`BroadsetElement`) is the fundamental building block of a page.
It carries geometry, content, visual style, screen properties, and
hierarchy references.

### Type Vocabulary

<!-- Source: project/spec/model/element.md — Element Type Vocabulary -->

Eight built-in element types: `text`, `image`, `svg`, `path`,
`rectangle`, `ellipse`, `qrcode`, `group`. Additional types may be
registered via the component plugin system.

### Geometry

<!-- Source: project/spec/model/element.md — Position and Dimensions, Rotation, Position Validation -->

- Position: `x` and `y` in millimeters. Both must be finite numbers.
  Negative positions are valid (elements may be off-canvas).
- Dimensions: `width` and `height`, both positive and finite.
- Rotation: in degrees. Any finite value is accepted — negative values
  and values exceeding 360° are preserved as-is in the document. NaN
  and Infinity are rejected.

### Content Semantics

<!-- Source: project/spec/model/element.md — Content Semantics, Content Validation -->

The `content` field carries type-specific payload:

| Type        | Content meaning               | Validation                                                                             |
| ----------- | ----------------------------- | -------------------------------------------------------------------------------------- |
| `text`      | Display text (rich text HTML) | Sanitized — only b, i, u, br, span, strong, em tags allowed; only style attribute kept |
| `image`     | Image source URL              | Must be a valid URL or empty string                                                    |
| `svg`       | Inline SVG markup             | Must be well-formed SVG                                                                |
| `path`      | SVG path `d` attribute data   | Must be syntactically valid SVG path                                                   |
| `qrcode`    | String to encode as QR code   | Must be non-empty                                                                      |
| `rectangle` | Empty or ignored              | —                                                                                      |
| `ellipse`   | Empty or ignored              | —                                                                                      |
| `group`     | Empty or ignored              | —                                                                                      |

Content validation occurs at the model boundary. Text content with
`<script>` tags or event handler attributes is stripped as an XSS
prevention measure.

### Hierarchy

<!-- Source: project/spec/model/element.md — Element Hierarchy, parentId/groupId Independence -->

Two independent hierarchy axes exist:

- **parentId**: References a group-type element for structural
  parent-child hierarchy. Used for transform inheritance and cascading
  deletion.
- **groupId**: Identifies visual group membership for multi-select
  operations. Ephemeral selection grouping.

These are independent — an element may have both a `parentId` and a
`groupId` simultaneously, pointing to different targets.

### Defaults

<!-- Source: project/spec/model/element.md — Element Default Values -->

New elements receive deterministic defaults: `anchorX: 'left'`,
`anchorY: 'top'`, `visibility: 'onscreen'`, `locked: false`,
`maskType: 'none'`, all 3D rotations `0`, `clipChildren: false`,
`opacity: 1`.

### Capability Matrix

<!-- Source: project/spec/model/capabilities.md -->

Every element type resolves to a 10-flag capability profile that
controls which editing features are available:

| Flag              | text | rect | ellipse | image | svg | path | qrcode | group |
| ----------------- | ---- | ---- | ------- | ----- | --- | ---- | ------ | ----- |
| borderRadius      | ✓    | ✓    |         | ✓     | ✓   |      |        |       |
| typography        | ✓    |      |         |       |     |      |        |       |
| appearance        | ✓    | ✓    | ✓       | ✓     | ✓   |      |        | ✓     |
| boxEffects        | ✓    | ✓    | ✓       | ✓     | ✓   |      |        |       |
| clipPath          |      | ✓    | ✓       | ✓     | ✓   |      |        | ✓     |
| objectFit         |      |      |         | ✓     | ✓   |      |        |       |
| svgStrokeFill     |      |      |         |       |     | ✓    |        |       |
| pathEditing       |      |      |         |       |     | ✓    |        |       |
| squareConstrained |      |      |         |       |     |      | ✓      |       |
| instantPlace      |      |      |         |       |     | ✓    |        |       |

Unknown element types resolve to all flags disabled. Plugins may
override capabilities.

---

## 4. Element Styling

<!-- Source: project/spec/model/style.md -->

`BroadsetElementStyle` defines CSS-mapped visual properties on every element.
Only `opacity` (0–1) is required; all other properties are optional.

### Typography

Font family, font size (px), font color (CSS color), font weight, font
style, text alignment, text decoration, text transform, letter spacing,
line height, word spacing. Text effects include text-stroke and
text-shadow.

### Backgrounds

`backgroundColor` (CSS color) and `backgroundGradient` (CSS gradient).
When both are set, gradient takes visual precedence.

### Borders

Border width (px), border color, border style, and border radius. Border
radius may be a uniform number or a 4-tuple
`[topLeft, topRight, bottomRight, bottomLeft]`.

### Visual Effects

Box shadow, filter, backdrop filter, mix-blend-mode, isolation, and
opacity.

### SVG Stroke and Fill

For path and SVG elements: stroke, stroke-width, stroke-dasharray,
stroke-dashoffset, stroke-linecap, stroke-linejoin, stroke-opacity,
fill, fill-opacity, fill-rule.

### Layout

Padding (CSS shorthand, non-negative values only) and object-fit.
Negative padding values are rejected by validation.

---

## 5. Screen Properties

<!-- Source: project/spec/model/screen.md -->

`BroadsetScreenProps` controls broadcast and layout behavior:

### Naming and Anchoring

Each element has a `name` (display label) and anchor edges (`anchorX`:
left/right, `anchorY`: top/bottom) that determine which canvas edge
the position is measured from.

### Visibility and State

- **visibility**: `'onscreen'` (visible, animated in) or `'offscreen'`
  (hidden, animated out). Drives CSS class assignment.
- **activeState**: An exclusive named state (only one at a time, or
  null). State changes trigger animation transitions.
- **modifiers**: Additive list of modifier names, independently
  toggleable. Each modifier can have in/out animation timelines.

### Locking

When `locked` is true, the element resists all UI interactions (drag,
resize, delete). Programmatic modifications via store actions are still
permitted.

### Masking

Six mask types: `none`, `circle`, `squircle`, `triangle`, `star`,
`custom`. The `custom` type uses the `customClipPath` string, which
must be a valid CSS clip-path value. Malformed values are rejected.

### 3D Transforms

`rotateX`, `rotateY`, `rotateZ` (degrees) and `translateZ` (px)
define CSS 3D transforms. These are independent of the 2D rotation
in element geometry. Combined with a perspective value from canvas
settings.

### Child Clipping

`clipChildren` controls whether a parent clips its children's overflow
(CSS `overflow: hidden`).

---

## 6. Animation Data Model

<!-- Source: project/spec/model/animation.md -->

### Registry

The animation registry is a flat array pairing element IDs with
`ElementAnimationConfig` objects. One entry per element maximum.

### Animation Config

Each config contains three arrays:

- **timelines**: Named, ordered timeline definitions with keyframes.
- **stateTimelineBindings**: Map state names to timeline IDs. Reserved
  states `IN` and `OUT` must always be present.
- **modifierTimelineBindings**: Pair modifier names with in/out
  timeline IDs. When no `outTimeline` is specified, the in-timeline
  plays in reverse on deactivation.

### Timelines

A timeline has a name, an id (for binding references), an ordered array
of keyframe entries, and optional child timeline bindings to child
elements.

### Keyframes

Each keyframe carries:

- `name` — human-readable label.
- `action` — `'none'`, `'setState'`, `'addModifier'`, or
  `'removeModifier'`.
- `offsetMs` — milliseconds from timeline start.
- `properties` — map of CSS property name to value + interpolation mode.
- Optional `payload` (action parameter) and `target` (element ID).

### Interpolation Modes

Supported: `linear`, `ease-in`, `ease-out`, `ease-in-out`,
`cubic-bezier(x1, y1, x2, y2)`, and `step`.

For cubic-bezier: x1 and x2 must be in [0, 1]; y1 and y2 may exceed
this range for overshoot/bounce effects. All four values must be finite.

---

## 7. Playback Engine

<!-- Source: project/spec/playback/interpolation.md, timeline.md, playback.md -->

The playback package provides the runtime animation engine.

### Easing

<!-- Source: project/spec/playback/interpolation.md -->

Four named presets (linear, ease-in, ease-out, ease-in-out) plus custom
cubic-bezier. The solver should use an efficient curve algorithm
(tolerance 1e-6); no specific algorithm is mandated.

Step easing: at `t < 1.0` returns the source value; at exactly
`t = 1.0` snaps to the target value.

### Color Interpolation

<!-- Source: project/spec/playback/interpolation.md -->

Interpolation operates in OKLab perceptual color space with gamut
clamping. Inputs must be hexadecimal strings — all other formats are
normalized to hex at the model boundary before reaching the playback
engine. Non-hex inputs are returned unchanged as a fallback.

### Path Morphing

<!-- Source: project/spec/playback/interpolation.md -->

Path interpolation requires matching coordinate counts between source
and target paths. Mismatched counts prevent interpolation.

### Timeline Computation

<!-- Source: project/spec/playback/timeline.md -->

Timeline duration equals the maximum keyframe offset plus a default
tween duration of 300ms. This is a compile-time constant, not
configurable per-timeline or per-document. Child timelines compose
relative to the parent's trigger offset.

### Playback

<!-- Source: project/spec/playback/playback.md -->

The playback controller manages playback handles and the style writer.

**Playback handles** support: play, pause, seek (clamped to duration),
setSpeed (multiplier), and cancel.

**Style writer** locates animation targets by querying the
`[data-element-content]` attribute on rendered elements — it does not
assume DOM structure. Opacity routes to `data-opacity-target`; other
CSS properties apply to the content element. If no `data-element-content`
is found, the container element itself is the fallback.

**State transitions** use a MutationObserver to detect CSS class
changes. A settle timer (50ms compile-time constant) ensures
transitions complete before the next state change. If a new mutation
arrives during the settle window, the timer resets.

**Simultaneous playback**: Multiple timelines may run on different
elements concurrently. On a single element, only one timeline may be
active. Triggering a new timeline on an element cancels the active one
first, cleaning up applied styles.

**Suppress transitions mode** enables instant snapshots by bypassing
CSS transitions entirely.

---

## 8. Renderer

<!-- Source: project/spec/renderer/spec.md -->

The renderer converts the flat document model into a DOM scene tree.

### Data-Attribute Contract

<!-- Source: project/spec/renderer/spec.md — Data-Attribute Contract Registry -->

The renderer owns four data attributes that form cross-package contracts:

| Attribute              | Placed on             | Consumer         | Purpose                      |
| ---------------------- | --------------------- | ---------------- | ---------------------------- |
| `data-element-id`      | Element container     | Editor, Playback | Identifies element by doc ID |
| `data-element-content` | Inner content element | Playback         | Animation style target       |
| `data-opacity-target`  | Opacity wrapper       | Playback         | Opacity animation routing    |
| `data-visibility`      | Element container     | Playback         | Visibility state class       |

Other packages must not invent new data attributes on rendered elements
without updating this registry.

### Scene Tree

<!-- Source: project/spec/renderer/spec.md — Scene tree, Incremental updates -->

The renderer builds a hierarchical scene tree from the flat element
list. Incremental updates are required — when a single element changes,
only the affected subtree re-renders. Full rebuilds occur only on
initial mount or page change.

### Component Resolution

<!-- Source: project/spec/renderer/spec.md -->

Resolution priority: plugin renderer > built-in renderer > fallback.
Each element type has a defined output contract:

- **Group elements** render as a `<div>` container with
  `data-element-content` on the container itself. Child elements
  render inside.
- **Text elements** sanitize HTML content at render time (defense in
  depth). Only b, i, u, br, span, strong, em tags and the style
  attribute survive.
- **Image elements** show a visible broken-image placeholder when the
  URL fails to load. No JavaScript error is thrown.

### Dynamic Data Tokens

<!-- Source: project/spec/renderer/spec.md — Dynamic Data Token Format -->

Element content supports `{{key}}` tokens where `key` is a
dot-notation path into the data store (e.g., `{{score.home}}`).
Unresolved tokens render as the literal token string.

### Rendering Performance

<!-- Source: project/spec/renderer/spec.md -->

The renderer should sustain 60fps with up to 100 elements on reference
hardware. Implementations must not introduce O(n²) or worse rendering
complexity. Performance testing should measure frame duration rather
than absolute FPS.

### Z-Order

<!-- Source: project/spec/renderer/spec.md -->

Z-order follows document array order. There is no z-index property.

### Visibility and State Classes

<!-- Source: project/spec/renderer/spec.md -->

The renderer manages CSS classes for visibility state, active state,
and modifiers. These classes are consumed by the playback engine for
animation transitions.

---

## 9. Editor Engine

<!-- Source: project/spec/editor/ (13 spec files) -->

The editor package provides the headless editing engine: state
management, canvas interactions, transforms, keyboard shortcuts, path
geometry, collaboration, and React integration.

### Store and State Management

<!-- Source: project/spec/editor/store-actions.md, store-ui-actions.md -->

The editor uses Zustand for state management with Zundo middleware for
undo/redo. The undo history defaults to 50 steps.

**Document lifecycle**: create empty document, load document (replaces
entire state), clear document (reset to empty).

**Element CRUD**: add (with per-type factory defaults), update (partial
property merge), remove (with cascading child deletion), reorder
(move within page array).

**Required element protection**: Elements listed in
`EditorConfig.requiredElements` cannot be deleted. When a parent
element is deleted and it has required descendants, those descendants
are promoted to root level (parentId cleared, absolute position
preserved). Non-required descendants are deleted normally.

**Selection**: Single select, multi-select, select all, deselect.
Selection is cleared on page switch.

**Undo/redo**: Applies to the full document regardless of active page.
Undoing an action on page 0 while viewing page 1 applies the change
to page 0 without switching the view. The editor never auto-switches
pages on undo/redo.

**Grouping**: Group selected elements (creates a group-type parent),
ungroup (promotes children to root, removes group element).

### Canvas Settings

<!-- Source: project/spec/editor/store-ui-actions.md -->

Canvas settings include: units (px/mm/in), view mode
(broadcast/print/none), rulers, zoom, pan, grid, guides, perspective,
and optional PDF background overlay.

Default grid: 5mm grid size, grid hidden, snap disabled, 5px snap
threshold.

### Pages

<!-- Source: project/spec/editor/store-ui-actions.md -->

Add page (appends), remove page (maintains minimum of 1), set active
page (clears selection).

### Data Store

<!-- Source: project/spec/editor/data-store.md -->

`BroadsetDataStore` is a separate Zustand instance for runtime data injection.
Host applications push live data (e.g., sports scores) into the data
store, and the renderer resolves `{{key}}` tokens against it.

### Collaboration

<!-- Source: project/spec/editor/collaboration.md -->

The change stream emits `DocumentChange` events with eight
discriminated variants (element:add, element:remove, element:update,
element:reorder, animation:update, page:add, page:remove,
settings:update). Each variant carries enough data to apply or invert
the mutation.

Remote changes are applied through a dedicated API with echo-loop
prevention (the editor does not re-emit changes it receives from
remote).

**Conflict resolution is explicitly out of scope** for the editor
engine. The host application is responsible for implementing
conflict resolution strategy (last-writer-wins, OT, CRDT) at the
transport layer. The editor applies remote changes as received,
in order.

Ephemeral updates during interactive transforms are suppressed from
the change stream — only committed changes are emitted.

### In-Place Text Editing

<!-- Source: project/spec/editor/editing.md, canvas.md -->

Double-clicking a text element enters inline editing mode with a
contenteditable overlay. During this mode:

- Drag/resize interactions are suppressed.
- Escape or click-outside commits changes and exits editing.
- Enter inserts a line break (does not exit).
- The overlay respects font, size, color, and alignment.
- The overlay is zoom-compensated at the current canvas zoom level.
- Canvas pan/zoom are suppressed during editing.

Advanced text properties (font family, size, alignment) are edited via
the properties sidebar.

### Path Editing and Drawing

<!-- Source: project/spec/editor/editing.md, path-geometry.md -->

**Path editing**: Select a path element to enter edit mode. SVG control
handles overlay the path. Dragging handles emits updated `d` attribute
strings. Handle extraction parses SVG path commands into draggable
control points.

**Path drawing**: Adding a path element auto-enters drawing mode.
Click to add points. Drawing completes by: (1) pressing Escape
(commits current points), (2) pressing Enter (closes the path by
connecting last point to first), or (3) calling `stopPathDrawing()`
programmatically.

**Geometry**: Path parsing, handle extraction, bounds refit, coordinate
normalization. The bounds-refit algorithm translates path coordinates
so the path data is origin-relative while the element position reflects
the absolute canvas location.

### Element Factory and Placement

<!-- Source: project/spec/editor/editing.md -->

The element factory creates elements with per-type defaults. Elements
may enter placement mode (click-to-place on canvas) or instant-place
mode (path elements appear immediately at a default position).

### Preflight Diagnostics

<!-- Source: project/spec/editor/editing.md -->

Six named diagnostic rules plus a missing-font rule:

| Rule                   | Checks                                         |
| ---------------------- | ---------------------------------------------- |
| `title-safe`           | Elements within title-safe boundaries          |
| `dpi`                  | Image resolution adequate for export size      |
| `bleed`                | Elements extend to bleed area                  |
| `small-text`           | Text size meets minimum readability            |
| `color-mode`           | Color values compatible with output mode       |
| `unsupported-property` | Properties not supported by target format      |
| `missing-font`         | Font used but not in allowedFonts or fallbacks |

Missing-font emits a warning-severity diagnostic.

### Animation State Management

<!-- Source: project/spec/editor/animation-state.md -->

The editor provides store actions for mutating animation configs:
add/remove timelines, add/update/remove keyframes, bind states and
modifiers to timelines.

### Timeline Playback in Editor

<!-- Source: project/spec/editor/timeline-playback.md -->

The editor orchestrates playback by:

1. Taking a snapshot of the current document state.
2. Handing the document to the playback controller.
3. On playback end or user stop, restoring the snapshot.

This ensures playback is non-destructive — the document returns to its
pre-playback state.

### Canvas Rendering

<!-- Source: project/spec/editor/canvas.md -->

The editor canvas provides:

- Zoom and pan with scroll/pinch gestures.
- Grid overlay (toggleable, snappable).
- Ruler system with origin handles.
- Safety boundary overlays (title-safe, bleed).
- Smart guides during drag interactions.
- Inline text editing mode on double-click.

### Transforms

<!-- Source: project/spec/editor/transforms.md -->

Interactive transforms (drag, resize, rotate) use a two-phase pattern:

1. **Ephemeral updates** at 60fps bypass undo tracking.
2. **Committed update** on pointer-up records the final state in undo
   history and emits to the change stream.

All pointer deltas are zoom-compensated. Smart guide snapping uses a
5px threshold. When multiple guides are equidistant, precedence is:
page center > page edge > element center alignment > element edge
alignment.

Grid snapping quantizes position to the nearest grid intersection.

### Keyboard Shortcuts

<!-- Source: project/spec/editor/keyboard.md -->

Shortcut dispatch maps key combinations to editor actions. The full
shortcut map is host-configurable.

- **Nudge**: Arrow key moves selected elements by 1mm. Shift+Arrow
  moves by 10mm.
- **Clipboard**: Copy and paste use an internal clipboard scoped to
  the editor instance (not the system clipboard). Paste places
  elements at their original position with zero offset. Paste works
  across pages within the same editor.
- **Delete**: Removes selected elements (respecting required element
  rules).
- **Select all**: Selects all elements on the active page.
- **Lock toggle**: Toggles locked state on selection.
- **Layer reorder**: Move elements forward, backward, to front, to back.
- **Undo/redo**: Full document undo regardless of active page.
- **Zoom**: Zoom in, zoom out, reset to 100%.
- **Group/ungroup**: Group selection, ungroup selected group.

### React Integration

<!-- Source: project/spec/editor/react-data-integration.md -->

The editor provides a React context (`EditorProvider`) that makes the
Zustand store available to the component tree. An `EditorErrorBoundary`
catches rendering errors and provides recovery UI. Data store
subscriptions enable reactive updates when live data changes.

---

## 10. Format Import and Export

<!-- Source: project/spec/formats/ (7 spec files) -->

The formats package provides bidirectional conversion between the
BroadsetDocument model and external file formats.

### JSON

<!-- Source: project/spec/formats/interchange.md -->

Lossless round-trip: serialize BroadsetDocument to JSON, deserialize back.
All element types, styles, screen properties, and animation data
survive the round-trip.

### OGraf

<!-- Source: project/spec/formats/interchange.md -->

Broadcast package format. Generates one ZIP package per top-level
element, containing element data and assets.

### PDF

<!-- Source: project/spec/formats/pdf.md -->

PDF generation with:

- mm → pt coordinate conversion.
- Font embedding with deduplication.
- QR code drawing via SVG path conversion.
- CSS color parsing (hex and rgb; unsupported formats return undefined
  as defense-in-depth since model normalizes to hex).
- Text wrapping with line-break calculation.
- Animated elements exported at default/rest state (t=0).

### PPTX (PowerPoint)

<!-- Source: project/spec/formats/pptx.md -->

Export produces OOXML with SVG fallback for styled rectangles. Import
recovers path elements from PPTX shape data.

### PSD (Photoshop)

<!-- Source: project/spec/formats/psd.md -->

Export supports layer effects, smart objects, artboards, and vector
masks. Import reads PSD layer structure back into BroadsetElements.
Animated elements exported at default/rest state (t=0).

### SVG

<!-- Source: project/spec/formats/web-vector.md -->

Export produces static SVG with clip-path, rotation, and viewBox.
Import parses SVG elements into BroadsetElements with error recovery —
invalid elements are skipped with warnings. Completely unparseable
SVG (not valid XML) results in import failure.

### HTML

<!-- Source: project/spec/formats/web-vector.md -->

Standalone HTML export embeds the playback runtime, OKLab color
interpolation, and path morphing. The output is a self-contained
single-file HTML document that plays animations without external
dependencies.

### Raster (PNG/JPEG)

<!-- Source: project/spec/formats/raster.md -->

Canvas-based rendering to PNG or JPEG. Supports pixel-ratio scaling
for high-DPI output. JPEG accepts an optional quality parameter
(0–1, default 0.92). PNG ignores quality (always lossless).

### Video (MP4/WebM)

<!-- Source: project/spec/formats/interchange.md -->

Video export uses VideoEncoder with capability detection. Requires a
live PlaybackController instance for frame-by-frame timeline capture.

### Filename Sanitization

<!-- Source: project/spec/formats/interchange.md -->

All export filenames are sanitized to remove unsafe characters.

### Error Handling

<!-- Source: project/spec/formats/interchange.md -->

Export failures reject with a descriptive Error object. Partial exports
are never returned — either the full export succeeds or it fails.

### Progress Reporting

<!-- Source: project/spec/formats/interchange.md -->

Long-running exports (PDF, PSD, video, raster) accept an optional
`onProgress` callback invoked with values between 0 and 1. The
callback may include a stage descriptor string.

### Static Export of Animated Elements

<!-- Source: project/spec/formats/pdf.md, psd.md -->

Static format exports (PDF, PSD) render animated elements at their
default/rest state (t=0). No active states or modifiers are applied.
Animation data is discarded.

---

## 11. UI Layer (HeroUI)

<!-- Source: project/spec/ui/ (7 spec files) -->

The ui package provides the React UI components for the editor.
It peer-depends on the editor, formats, model, and renderer packages.

### Properties Sidebar

<!-- Source: project/spec/ui/panels.md -->

A 4-tab sidebar (Layers, Properties, Animation, Preflight) with
capability-driven panel visibility. Panels shown depend on the
selected element's capability profile.

**Multi-element editing**: When multiple elements are selected,
common property values are displayed. Differing values show a "Mixed"
indicator. Editing a property applies the value to all selected
elements.

**Animation mode**: When a keyframe is selected, a property adapter
intercepts edits and routes them to keyframe values. Properties not
in the keyframe render as disabled.

### Layers Panel

<!-- Source: project/spec/ui/panels.md -->

Displays element list with per-element lock, visibility toggle, and
delete controls. Element names are rendered and support **inline
rename** on double-click (Enter commits, Escape cancels, empty names
rejected).

### Animation Sidebar

<!-- Source: project/spec/ui/panels.md -->

Controls for animation timelines, state bindings, modifier bindings.

### Preflight Panel

<!-- Source: project/spec/ui/panels.md -->

Displays diagnostic results from the preflight system with
severity-classified issues.

### Modals

<!-- Source: project/spec/ui/modals.md -->

- **Export modal**: Feature-flag-gated format selection with progress
  and download.
- **Media library**: Search, categories, upload delegation to host.
- **New document modal**: Preset categories for document creation.
- **Canvas settings modal**: Units, grid, rulers, perspective.
- **Shortcuts modal**: Displays configured keyboard shortcuts.
- **About modal**: Application information.

### Toolbar and Navigation

<!-- Source: project/spec/ui/toolbar-nav.md -->

Floating toolbar with action buttons (undo, redo, save, zoom, grid
toggle, guide toggle, element tools). Context menu for right-click
operations. Element library for adding new elements. Page sorter for
multi-page navigation.

**Undo/redo button states**: Disabled when no history is available.
Updated immediately after every store action.

**Save button**: Triggers the `EditorConfig.onSave` callback. Hidden
when `onSave` is not configured.

### Timeline Editor

<!-- Source: project/spec/ui/timeline.md -->

Bottom panel for timeline editing. Supports keyframe add, select,
drag (reposition in time), and **delete** (via Delete key or
right-click context menu). Deleting the last keyframe in a timeline
removes the timeline entry. All keyframe operations are undoable.

### Custom Inputs

<!-- Source: project/spec/ui/inputs.md -->

Specialized input components: color picker (saturation/brightness area

- hue slider), CSS length input, text stroke input, filter editor,
  shadow editor. The color picker handles solid colors; gradient editing
  is handled by the fill type switcher in the appearance panel.

### Utility Components

<!-- Source: project/spec/ui/utilities.md -->

CSS parsing helpers, animation binding helpers, wheel input
classification (distinguishes trackpad pan from zoom from pinch).

### Accessibility (WCAG AA)

<!-- Source: project/spec/ui/panels.md, modals.md, toolbar-nav.md, inputs.md, utilities.md -->

All UI components must conform to WCAG 2.1 AA:

**Panels**:

- Tab key navigation reaches all interactive elements.
- Collapsible sections use `aria-expanded`.
- Sidebar tabs use `role="tablist"`, `role="tab"`, `role="tabpanel"`.
- Visible focus rings with 3:1 contrast ratio.
- Property labels associated with inputs via `aria-labelledby`.

**Modals**:

- Focus trapping within open modals.
- Focus returns to trigger element on close.
- Escape key closes modals.
- `role="dialog"` with `aria-modal="true"` and `aria-labelledby`.

**Toolbar**:

- `role="toolbar"` with `aria-label`.
- Arrow key navigation between buttons.
- Icon-only buttons have descriptive `aria-label`.
- Toggle buttons use `aria-pressed`.

**Inputs**:

- All inputs labeled via `aria-label` or `aria-labelledby`.
- Keyboard-operable (arrow keys for sliders, up/down for numeric).
- 4.5:1 contrast ratio for text and borders.
- `aria-invalid="true"` on invalid values.

**Utilities**:

- Wheel zoom disabled when screen reader is active.
- Animation binding selectors use proper listbox/combobox ARIA roles.

---

## 12. Demo Application

<!-- Source: project/spec/demo/ (6 spec files) -->

The demo app is the reference host application that integrates all
packages and serves as the validation surface.

### Layout

<!-- Source: project/spec/demo/layout.md -->

Full-viewport layout with no page scrolling. Contains:

- Floating main toolbar at the top.
- Resizable 4-tab sidebar (Layers, Properties, Animation, Preflight)
  on the right, with tab persistence.
- Bottom timeline panel.
- Canvas area filling the remaining space.
- Placement mode banner when element placement is active.

The save button triggers `EditorConfig.onSave`. If `onSave` is not
configured, the save button is hidden.

### State Management

<!-- Source: project/spec/demo/state.md -->

- **Provider wiring**: EditorProvider wraps the app with Zustand store
  and data store.
- **Persistence**: Save uses `onSave` callback writing to localStorage.
  On load, saved documents restore from localStorage; fallback to the
  sample document.
- **Toasts**: Success auto-dismiss after 3 seconds. Error auto-dismiss
  after 5 seconds.
- **Fullscreen**: Toggle via toolbar button.
- **Zoom prevention**: Browser zoom is disabled to avoid conflicts
  with canvas zoom.

### Configuration

<!-- Source: project/spec/demo/config.md -->

The demo configures:

- Allowed fonts (host-provided font definitions).
- Document size presets (categories of standard sizes).
- Component plugins (custom element types).
- Feature flags derived from document mode with URL-based experimental
  overrides.
- Required elements (e.g., sports overlay elements that cannot be
  deleted).

### Data Integration

<!-- Source: project/spec/demo/data-integration.md -->

- **Live data**: Sports scores, team names, and player data injected
  via BroadsetDataStore, resolved as `{{key}}` tokens in element content.
- **Export/import**: Lazy-loaded format modules. Export orchestration
  with toast feedback (success/error).
- **Sample document**: Includes elements with animations and live data
  bindings to demonstrate all features.

### Visual Design

<!-- Source: project/spec/demo/visual.md -->

- Dark theme enforced via `class="dark" data-theme="dark"`.
- Glass-morphism panels with semi-transparent backgrounds and backdrop
  blur.
- Slide-in/out transitions for sidebar.
- Lucide icons throughout the UI.
- Responsive canvas that scales to fill available space.

---

## 13. Configuration System

<!-- Source: project/spec/model/config.md -->

### EditorConfig

Host-provided configuration with these fields:

| Field                  | Required | Description                                       |
| ---------------------- | -------- | ------------------------------------------------- |
| `allowedFonts`         | No\*     | Font definitions (fallback to system fonts)       |
| `defaultPalette`       | No       | Color strings for the color picker                |
| `allowedDocumentSizes` | No       | Size presets for new document modal               |
| `requiredElements`     | No       | Element IDs that cannot be deleted                |
| `mediaSource`          | No       | Media library assets, categories, upload callback |
| `shortcuts`            | No       | Shortcut binding overrides                        |
| `gridDefaults`         | No       | Grid setting overrides                            |
| `maxUndoSteps`         | No       | Undo history depth (default 50)                   |
| `components`           | No       | Custom element type plugins                       |
| `onChanges`            | No       | Change stream callback for collaboration          |
| `onSave`               | No       | Save action callback                              |

\*When allowedFonts is empty or undefined, the system provides fallback
fonts: Arial, Courier New, Times New Roman, Georgia.

### Feature Configuration

Boolean flags gate features by document mode:

- **Screen mode** enables: animations, 3D transforms, broadcast
  preview.
- **Print mode** disables: animations, 3D transforms.
- Host overrides merge on top of mode-derived defaults.
- URL parameter `?experimental=true` enables experimental features.

### Color Normalization

<!-- Source: project/spec/model/config.md — Color Normalization -->

All color values entering the document model are normalized to 6-digit
or 8-digit hex format (`#RRGGBB` or `#RRGGBBAA`). Accepted input
formats: 3-digit hex, 4-digit hex, `rgb()`, `rgba()`, `hsl()`,
`hsla()`, and CSS named colors. After normalization, all downstream
consumers (playback interpolation, rendering, export) are guaranteed
hex-only input.

### Component Plugins

<!-- Source: project/spec/model/config.md — Component Plugin Contract -->

A `ComponentPlugin` provides: type identifier, display label, renderer
factory, and optionally: icon, default dimensions/content, custom
property panel, and capability flag overrides.

### Media Source

<!-- Source: project/spec/model/config.md — Media Source Configuration -->

Provides assets with id/name/url/thumbnail, optional categories for
filtering, and an upload callback. The editor never handles file
uploads directly — it delegates to the host.

### Canvas Defaults

<!-- Source: project/spec/model/config.md — Default Canvas Settings, Default Grid -->

Default canvas: units=px, viewMode=none, showRulers=true, zoom=1,
pan=0, perspective=1000.

Default grid: gridSize=5mm, showGrid=false, snapToGrid=false,
snapThreshold=5px.

### Save Callback

<!-- Source: project/spec/model/config.md — Host-Provided Save Callback -->

When `onSave` is provided, the save action invokes it with the current
BroadsetDocument. When absent, save is a no-op and save UI is hidden.

---

## 14. Cross-Cutting Concerns

### Change Stream Types

<!-- Source: project/spec/model/changes.md -->

Eight discriminated variants enable collaboration, undo/redo, and
sync:

| Variant            | Payload                                            |
| ------------------ | -------------------------------------------------- |
| `element:add`      | pageIndex, elementId, full element data            |
| `element:remove`   | pageIndex, elementId, full element data (for undo) |
| `element:update`   | pageIndex, elementId, path, oldValue, newValue     |
| `element:reorder`  | pageIndex, elementId, fromIndex, toIndex           |
| `animation:update` | elementId, path, oldValue, newValue                |
| `page:add`         | pageIndex                                          |
| `page:remove`      | pageIndex                                          |
| `settings:update`  | path, oldValue, newValue                           |

### Unit System

<!-- Source: project/spec/model/utilities.md, config.md -->

- Document spatial values: millimeters (mm).
- Font size: pixels (px).
- Screen/pointer coordinates: pixels (px).
- Conversion: 1 px = 25.4/96 mm at 96 DPI standard.
- Canvas settings support units switching (px/mm/in) for display.

### Anchor Inference

<!-- Source: project/spec/model/utilities.md — Edge Anchor Inference -->

Anchor edges are computed by comparing the element's center point to
the canvas center point. Element left of center → anchorX=left;
element above center → anchorY=top. Ties go to right/bottom.

### Document Cloning

<!-- Source: project/spec/model/utilities.md — Document Clone Fidelity -->

Deep-equal clone with structural independence. All nested objects and
arrays are distinct references from the source.

### Clip-Path Utilities

<!-- Source: project/spec/model/utilities.md — Clip-Path Path Value Normalization -->

Parse CSS `path(...)` values from quoted and unquoted forms. Scale
path coordinates for zoom. Generate default clip paths with minimum
non-zero dimensions.

### Ephemeral vs Committed Mutations

<!-- Source: architecture.md §15.1 -->

Interactive transforms (drag, resize, rotate) use ephemeral updates
at 60fps that bypass undo tracking. On pointer-up, a single committed
update is recorded. The collaboration stream suppresses ephemeral
updates.

### Canvas Interaction Pipeline

<!-- Source: architecture.md §15.2 -->

1. Click empty canvas → deselect.
2. Click element → select.
3. Drag selected → ephemeral updates during drag, commit on drop.
4. Marquee drag → multi-select intersected elements.
5. Path editing → overlay SVG handles, drag emits updated `d` strings.

### Property Editing Mode Routing

<!-- Source: architecture.md §15.3 -->

In normal mode, property changes go to the store. In keyframe mode, a
property adapter routes edits to keyframe values. This routing is
transparent to panel implementations.

### Timeline Action Callbacks

<!-- Source: architecture.md §15.4 -->

During playback, keyframe actions invoke callbacks:

- `setState` → resolves state timeline binding, plays the timeline.
- `addModifier` / `removeModifier` → toggles modifier in element
  screen state.

Screen state changes during playback are ephemeral — excluded from
collaboration diffs.

### Export Function Variance

<!-- Source: architecture.md §15.5 -->

| Format | Return          | Notes                                |
| ------ | --------------- | ------------------------------------ |
| JSON   | void (download) | Direct document serialization        |
| HTML   | string          | Self-contained with embedded runtime |
| PDF    | Promise\<Blob\> | Async rendering pipeline             |
| PPTX   | Promise\<Blob\> | Async XML assembly                   |
| SVG    | string          | Static SVG markup                    |
| Raster | Promise\<Blob\> | Canvas-based rendering               |
| Video  | Promise\<Blob\> | Requires PlaybackController instance |

---

## 15. Spec Traceability Index

Every section in this summary maps to one or more spec files. This
index enables bidirectional tracing — changes to this summary should
be reflected in the corresponding spec, and vice versa.

| Summary Section            | Source Spec(s)                                                   |
| -------------------------- | ---------------------------------------------------------------- |
| §1 Product Overview        | config.yaml, architecture.md §1–§4                               |
| §2 Document Model          | project/spec/model/spec.md                                       |
| §3 Elements                | project/spec/model/element.md, capabilities.md                   |
| §4 Element Styling         | project/spec/model/style.md                                      |
| §5 Screen Properties       | project/spec/model/screen.md                                     |
| §6 Animation Data Model    | project/spec/model/animation.md                                  |
| §7 Playback Engine         | project/spec/playback/interpolation.md, timeline.md, playback.md |
| §8 Renderer                | project/spec/renderer/spec.md                                    |
| §9 Editor Engine           | project/spec/editor/\*.md (13 files)                             |
| §10 Format Import/Export   | project/spec/formats/\*.md (7 files)                             |
| §11 UI Layer (HeroUI)      | project/spec/ui/\*.md (7 files)                                  |
| §12 Demo Application       | project/spec/demo/\*.md (6 files)                                |
| §13 Configuration System   | project/spec/model/config.md                                     |
| §14 Cross-Cutting Concerns | project/spec/model/changes.md, utilities.md, architecture.md §15 |

---

_This summary covers the complete behavioral specification of
broadset as defined in the Spec `project/spec/` directory and the
`implementation/architecture.md` manifest. It is not a design document — it describes
what the system does, not how it is implemented. For implementation
details, refer to `implementation/architecture.md`. For acceptance criteria and
testable scenarios, refer to the individual spec files._
