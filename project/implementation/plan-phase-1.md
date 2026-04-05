# Phase 1 — Model

**Package:** `packages/model`
**Depends on:** nothing
**Index:** [plan.md](plan.md)

The model is pure data — no DOM, no React, no side effects. All tests run in
jsdom (default) or pure Node. Implement in sub-spec order: foundational types
first, then compound structures that reference them.

---

## Units

### 1.1 Element type vocabulary and defaults (`model/element.md`)

- [ ] tests: red
- [ ] impl: green

_Spec:_ `project/spec/model/element.md`
_What to cover:_ 11 built-in type literals, width/height > 0 invariant, default
screen/style props, parentId/groupId independence.

### 1.2 Style properties (`model/style.md`)

- [ ] tests: red
- [ ] impl: green

_Spec:_ `project/spec/model/style.md`
_What to cover:_ Typography, background (solid vs gradient precedence), border
(4-tuple radius), visual effects, SVG stroke/fill, non-negative padding.

### 1.3 Element properties — name, locked, masking, 3D transforms (`model/element.md`, `model/style.md`)

- [ ] tests: red
- [ ] impl: green

_Spec:_ `project/spec/model/element.md`, `project/spec/model/style.md`
_What to cover:_ `name`/`locked` on element top-level, masking (`maskType` enum),
3D transform fields on style (`rotateX/Y/Z`, `translateZ`), `clipChildren`, `customClipPath`.

> **Note:** The old `screen.md` spec has been removed. Screen properties have
> been redistributed: `name`/`locked` → element, masking/3D → style, runtime
> state (visibility/activeState/modifiers) → playback-only.

### 1.4 Capability flags (`model/capabilities.md`)

- [ ] tests: red
- [ ] impl: green

_Spec:_ `project/spec/model/capabilities.md`
_What to cover:_ 10 boolean flags for each of the 11 built-in types; video,
clock, ticker capability profiles defined; unknown type → all false; profile
shape is complete (no missing keys).

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
_What to cover:_ Animations array (unique IDs, stale entries ignored),
ElementAnimationConfig, Timeline (named, ordered keyframes, timeline loop mode
none/loop/ping-pong + loopCount, explicit durationMs override), Keyframe fields
(KeyframeValue discriminated union with type tag, declarative action markers —
not imperative triggers, EasingMode replaces interpolation), spring easing mode
(stiffness/damping/mass + 3 named presets), state/modifier binding structures,
reserved IN/OUT names, child timeline stagger (delayMs + direction), motion path
animation (SVG d string + motionRotate).

### 1.7 EditorConfig and feature flags (`model/config.md`)

- [ ] tests: red
- [ ] impl: green

_Spec:_ `project/spec/model/config.md`
_What to cover:_ EditorConfig shape, EditorFeatureConfig defaults per
documentMode (screen vs print), CanvasSettings defaults (frame rate
configuration with default 50fps PAL and broadcast rates validated, safe zone
configuration with EBU R95 defaults), ComponentPlugin contract,
MediaSourceConfig, content template configuration (categories/thumbnails),
linked group identity (componentId/instanceOf + content overrides).

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

## Progress

| Unit                     | Red | Green |
| ------------------------ | --- | ----- |
| 1.1 element vocabulary   | ☐   | ☐     |
| 1.2 style properties     | ☐   | ☐     |
| 1.3 screen properties    | ☐   | ☐     |
| 1.4 capability flags     | ☐   | ☐     |
| 1.5 change stream types  | ☐   | ☐     |
| 1.6 animation structures | ☐   | ☐     |
| 1.7 EditorConfig         | ☐   | ☐     |
| 1.8 document invariants  | ☐   | ☐     |
| 1.9 model utilities      | ☐   | ☐     |
| 1.10 Zod schema          | ☐   | ☐     |
