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

- [x] tests: red
- [x] impl: green

_Spec:_ `project/spec/model/element.md`
_What to cover:_ 8 built-in type literals, width/height > 0 invariant, default
screen/style props, parentId/groupId independence.

### 1.2 Style properties (`model/style.md`)

- [x] tests: red
- [x] impl: green

_Spec:_ `project/spec/model/style.md`
_What to cover:_ Typography, background (solid vs gradient precedence), border
(4-tuple radius), visual effects, SVG stroke/fill, non-negative padding.

### 1.3 Screen properties (`model/screen.md`)

- [x] tests: red
- [x] impl: green

_Spec:_ `project/spec/model/screen.md`
_What to cover:_ Anchor values, visibility enum, state/modifier arrays, mask
types, 3D transform fields, clipChildren default.

### 1.4 Capability flags (`model/capabilities.md`)

- [x] tests: red
- [x] impl: green

_Spec:_ `project/spec/model/capabilities.md`
_What to cover:_ 10 boolean flags for each built-in type; unknown type → all
false; profile shape is complete (no missing keys).

### 1.5 Change stream types (`model/changes.md`)

- [x] tests: red
- [x] impl: green

_Spec:_ `project/spec/model/changes.md`
_What to cover:_ All 8 discriminated union variants; each carries required
fields; type guards / Zod discriminated union parse correctly.

### 1.6 Animation data structures (`model/animation.md`)

- [x] tests: red
- [x] impl: green

_Spec:_ `project/spec/model/animation.md`
_What to cover:_ AnimationRegistry (unique IDs, stale entries ignored),
ElementAnimationConfig, Timeline (named, ordered entries), Keyframe fields,
state/modifier binding structures, reserved IN/OUT names.

### 1.7 EditorConfig and feature flags (`model/config.md`)

- [x] tests: red
- [x] impl: green

_Spec:_ `project/spec/model/config.md`
_What to cover:_ EditorConfig shape, EditorFeatureConfig defaults per
documentMode (screen vs print), CanvasSettings defaults, ComponentPlugin
contract, MediaSourceConfig.

### 1.8 Document root invariants (`model/spec.md`)

- [x] tests: red
- [x] impl: green

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
| 1.1 element vocabulary   | ✅  | ✅    |
| 1.2 style properties     | ✅  | ✅    |
| 1.3 screen properties    | ✅  | ✅    |
| 1.4 capability flags     | ✅  | ✅    |
| 1.5 change stream types  | ✅  | ✅    |
| 1.6 animation structures | ✅  | ✅    |
| 1.7 EditorConfig         | ✅  | ✅    |
| 1.8 document invariants  | ✅  | ✅    |
| 1.7 EditorConfig         | ☐   | ☐     |
| 1.8 document root        | ☐   | ☐     |
| 1.9 utilities            | ☐   | ☐     |
| 1.10 Zod schema          | ☐   | ☐     |
