# Model — Screen Properties Contract

## Purpose

Defines the shape and semantics of `BroadsetScreenProps` — the broadcast and layout properties attached to every element. Screen properties control element naming, anchor positioning, visibility state, state/modifier classes, locking, masking, 3D transforms, and child clipping. This spec ensures any consumer can reconstruct the screen property data layer. It does NOT cover how screen properties drive animation transitions (→ `project/spec/playback/`) or how they are rendered (→ `project/spec/renderer/`). See [conventions](../../README.md).

---

## Requirements

### Requirement: Screen Property Vocabulary

Every element MUST carry these screen properties: `name` (string), `anchorX` (`'left'` | `'right'`), `anchorY` (`'top'` | `'bottom'`), `visibility` (`'onscreen'` | `'offscreen'`), `activeState` (string or null), `modifiers` (array of strings), `locked` (boolean), `maskType` (`'none'` | `'circle'` | `'squircle'` | `'triangle'` | `'star'` | `'custom'`), `rotateX` (degrees), `rotateY` (degrees), `rotateZ` (degrees), `translateZ` (px), `clipChildren` (boolean), `customClipPath` (CSS clip-path string).

#### Scenario: Full screen property set

- GIVEN an element with all screen properties explicitly set
- WHEN the element is inspected
- THEN every screen property is present with its assigned value

#### Scenario: Defaults for new elements

- GIVEN a newly created element using default screen properties
- WHEN the screen properties are inspected
- THEN name is `''`, anchorX is `'left'`, anchorY is `'top'`, visibility is `'onscreen'`, activeState is `null`, modifiers is `[]`, locked is `false`, maskType is `'none'`, all rotations are `0`, translateZ is `0`, clipChildren is `false`, customClipPath is `''`

#### Acceptance Criteria

- [ ] Given an element with all screen properties set, every property is present and correctly typed
- [ ] Given default screen properties, all values match the documented defaults

---

### Requirement: Mask Type Semantics

The `maskType` property MUST clip the element's visual content to a predefined shape. Each mask type applies a specific CSS clip-path: `'none'` applies no clipping, `'circle'` clips to a circle, `'squircle'` clips to a superellipse, `'triangle'` clips to a triangle, `'star'` clips to a 5-point star, and `'custom'` uses the `customClipPath` string as a freeform CSS clip-path value.

#### Scenario: Circle mask clips to circle

- GIVEN an element with `maskType: 'circle'`
- WHEN the element is rendered
- THEN the element's visual content is clipped to a circular shape

#### Scenario: Custom mask uses customClipPath

- GIVEN an element with `maskType: 'custom'` and `customClipPath: 'polygon(50% 0%, 100% 100%, 0% 100%)'`
- WHEN the element is rendered
- THEN the element is clipped to the specified polygon

#### Acceptance Criteria

- [ ] Given a circle maskType, the element is clipped to a circle shape
- [ ] Given a custom maskType with a customClipPath value, the element is clipped to the specified path

---

### Requirement: 3D Transform Properties

The properties `rotateX`, `rotateY`, `rotateZ` (all in degrees) and `translateZ` (in px) MUST define 3D CSS transforms on the element. These values are independent of the 2D `rotation` property on the element geometry. They are applied as a CSS `transform` combined with a `perspective` value from canvas settings.

#### Scenario: 3D rotation applied

- GIVEN an element with `rotateX: 30`, `rotateY: 45`, `rotateZ: 0`, `translateZ: 50`
- WHEN the element is rendered with perspective enabled
- THEN a 3D CSS transform is applied combining all axes

#### Scenario: Zero 3D values produce no 3D transform

- GIVEN an element with all 3D properties at `0`
- WHEN the element is rendered
- THEN no 3D transform is applied

#### Acceptance Criteria

- [ ] Given non-zero 3D rotation and translation values, a 3D CSS transform is applied to the rendered element
- [ ] Given all 3D values at zero, no 3D transform is applied

---

### Requirement: Anchor and Visibility Semantics

`anchorX` and `anchorY` MUST determine which canvas edge the element position is measured from. `visibility` MUST be either `'onscreen'` (element is visible and animated in) or `'offscreen'` (element is hidden and animated out). These values drive CSS class assignment and transition behavior.

#### Scenario: Anchor determines position reference edge

- GIVEN an element with `anchorX: 'right'` and `anchorY: 'bottom'`
- WHEN the element position is rendered
- THEN position is measured from the right and bottom canvas edges

#### Scenario: Visibility drives transition class

- GIVEN an element with `visibility: 'offscreen'`
- WHEN the element is rendered
- THEN the element receives the offscreen CSS class

#### Acceptance Criteria

- [ ] Given anchorX 'right' and anchorY 'bottom', position is measured from the right and bottom edges
- [ ] Given visibility 'offscreen', the element receives the offscreen CSS class

---

### Requirement: State and Modifier Classes

`activeState` MUST be an exclusive state (only one active at a time, or null). `modifiers` MUST be an additive list of modifier names that can be independently toggled on/off. State changes and modifier toggles drive CSS class management and animation transitions.

#### Scenario: Exclusive state activation

- GIVEN an element with `activeState: 'highlighted'`
- WHEN the element's state is inspected
- THEN only the `'highlighted'` state is active

#### Scenario: Multiple modifiers active simultaneously

- GIVEN an element with `modifiers: ['pulse', 'glow']`
- WHEN the element's modifiers are inspected
- THEN both `'pulse'` and `'glow'` are active simultaneously

#### Acceptance Criteria

- [ ] Given an activeState value, only that single state is active on the element
- [ ] Given multiple modifiers, all are independently active simultaneously

---

### Requirement: Element Locking

When `locked` is `true`, the element MUST NOT be movable, resizable, or deletable through user interface interactions. Locked elements MAY still be modified programmatically via store actions.

#### Scenario: Locked element resists UI interaction

- GIVEN an element with `locked: true`
- WHEN a user attempts to drag, resize, or delete the element via the canvas
- THEN the interaction is rejected

#### Acceptance Criteria

- [ ] Given a locked element, UI drag, resize, and delete interactions are rejected

---

### Requirement: Clip Children

When `clipChildren` is `true`, the element MUST clip its child elements to its own bounds (CSS `overflow: hidden`). When `false`, child elements MAY overflow the parent bounds visually.

#### Scenario: Clipped children

- GIVEN a group element with `clipChildren: true` and a child extending beyond the group bounds
- WHEN the group is rendered
- THEN the child's overflow is visually hidden

#### Acceptance Criteria

- [ ] Given clipChildren true, child elements overflowing the parent are visually clipped

---

### Requirement: Custom Clip-Path Validation

When `maskType` is `'custom'`, the `customClipPath` field MUST contain a syntactically valid CSS `clip-path` value (e.g., `polygon(...)`, `circle(...)`, `ellipse(...)`, `inset(...)`, `path(...)`). Malformed CSS values MUST be rejected by validation. An empty string MUST be treated as "no clip-path."

#### Scenario: Valid polygon custom clip-path

- GIVEN maskType is `'custom'` and customClipPath is `polygon(50% 0%, 100% 100%, 0% 100%)`
- WHEN validation runs
- THEN the value is accepted

#### Scenario: Malformed clip-path value

- GIVEN maskType is `'custom'` and customClipPath is `not-valid-css`
- WHEN validation runs
- THEN validation fails

#### Scenario: Empty customClipPath treated as no clip-path

- GIVEN maskType is `'custom'` and customClipPath is empty string
- WHEN validation runs
- THEN it is treated as no clip-path

#### Acceptance Criteria

- [ ] Given a valid CSS clip-path polygon value, validation succeeds
- [ ] Given a valid CSS clip-path circle value, validation succeeds
- [ ] Given a malformed clip-path string, validation fails
- [ ] Given an empty customClipPath with maskType 'custom', validation succeeds (no clip-path)

---

## Spec Gaps

_None — all requirements have acceptance criteria._

---

## Non-Goals

- How visibility drives animation transitions → see `project/spec/playback/playback.md`
- How states/modifiers bind to timelines → see `project/spec/editor/animation-state.md`
- How mask shapes are rendered as CSS clip-path → see `project/spec/renderer/spec.md`
