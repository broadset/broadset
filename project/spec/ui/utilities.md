# UI — Utilities Specification

## Purpose

Defines the behavioral requirements for editor utility modules: CSS value parsers, sequence/lifecycle/state-machine authoring helpers, keyframe value resolution hooks, and wheel input classification.

---

## Requirements

### Requirement: CSS Shadow Parsing and Building

The system MUST parse box-shadow strings into structured objects with offset, blur, spread, color, and inset fields. Empty strings MUST return defaults. The system MUST build valid box-shadow and text-shadow strings from structured objects.

#### Scenario: Parse box-shadow with px values

- GIVEN `"2px 4px 6px 8px rgba(0,0,0,0.5)"`
- WHEN parsed
- THEN offsets, blur, spread, and color are extracted

#### Scenario: Build box-shadow string

- GIVEN structured shadow data
- WHEN built
- THEN a valid CSS box-shadow string is produced

#### Scenario: Build text-shadow (no spread/inset)

- GIVEN structured shadow data
- WHEN built as text-shadow
- THEN spread and inset are omitted

#### Acceptance Criteria

- [ ] Given `"2px 4px 6px 8px rgba(0,0,0,0.5)"`, offsets, blur, spread, and color are extracted
- [ ] Given structured shadow data, a valid CSS box-shadow string is produced
- [ ] Given structured shadow data, spread and inset are omitted

---

### Requirement: CSS Filter Parsing and Building

The system MUST parse filter strings into arrays of `{ function, value, unit }` objects. Empty strings MUST return empty arrays. Building MUST produce valid CSS filter strings.

#### Scenario: Parse multiple filters

- GIVEN `"blur(4px) brightness(1.2)"`
- WHEN parsed
- THEN two filter objects are returned

#### Scenario: Parse hue-rotate

- GIVEN `"hue-rotate(90deg)"`
- WHEN parsed
- THEN function is `hue-rotate`, value is `90`, unit is `deg`

#### Acceptance Criteria

- [ ] Given `"blur(4px) brightness(1.2)"`, two filter objects are returned
- [ ] Given `"hue-rotate(90deg)"`, function is `hue-rotate`, value is `90`, unit is `deg`

---

### Requirement: CSS Length Parsing

The system MUST parse CSS length strings into value and unit. Empty strings MUST return `0px`.

#### Scenario: Parse em value

- GIVEN `"1.5em"`
- WHEN parsed
- THEN value is `1.5` and unit is `em`

#### Acceptance Criteria

- [ ] Given `"1.5em"`, value is `1.5` and unit is `em`

---

### Requirement: Lifecycle and State-Machine View Normalization

The system MUST derive a lifecycle authoring view that presents IN first, ordered HOLD/UPDATE actions next, and OUT last. State-machine options are normalized separately in deterministic canonical order. Empty lifecycle slots are view models only and MUST NOT create canonical data. Every persisted selection or mutation MUST use an existing stable owner, sequence, state-machine, state, transition, or event ID; helpers MUST NOT generate missing identity from a label or array position.

#### Scenario: Missing lifecycle displays empty IN/OUT slots

- GIVEN a document without a lifecycle definition
- WHEN its authoring view is normalized
- THEN empty IN and OUT slots are displayed without mutating the project

#### Scenario: State machines retain stable identity

- GIVEN multiple state machines and transitions
- WHEN authoring options are normalized
- THEN their deterministic display order changes neither their stable IDs nor transition priorities

#### Acceptance Criteria

- [ ] Given a missing lifecycle definition, empty IN and OUT view slots are present without canonical mutation
- [ ] Given state-machine authoring options, normalization preserves stable IDs and deterministic priority semantics
- [ ] No normalizer invents canonical identity from display labels or positions

---

### Requirement: Sequence and State-Machine Resolution

The system MUST build authoring options from document-owned or component-owned sequences and document-owned state machines. Options MAY sort by display label, but their values MUST remain canonical stable owner/entity addresses; duplicate names MUST remain distinct and names MUST NOT be identity fallbacks. Lifecycle and transition-action accessors MUST resolve references against the document's permitted sequence/state-machine scope and return typed empty view results when an optional canonical definition is absent.

#### Scenario: Sequence options sort without changing identity

- GIVEN sequences with stable IDs and display names
- WHEN options are built
- THEN they are sorted alphabetically by label while each option value remains its stable owner/sequence address

#### Scenario: Duplicate names remain distinct

- GIVEN two sequences with the same name and different IDs
- WHEN options are built and one is selected
- THEN the exact selected owner/sequence address resolves without ambiguity

#### Scenario: Missing lifecycle returns empty view slots

- GIVEN a document without a lifecycle definition
- WHEN lifecycle actions are read for the panel
- THEN typed empty view slots are returned without creating canonical data

#### Acceptance Criteria

- [ ] Given named sequences, sorted option labels retain their stable owner/sequence addresses
- [ ] Given duplicate names, stable-address selection resolves exactly one sequence
- [ ] Given an absent lifecycle or state-machine collection, helpers return typed empty view data without mutation

---

### Requirement: Keyframe Value Resolution

The keyframe adapter MUST address a stable owner, sequence, property track, and keyframe. The track's `PropertyTarget` determines the edited property and the keyframe contributes exactly one typed value. When no keyframe adapter exists, number and string resolvers MUST return the resolved base property value. When the requested property does not match the selected track target, the resolver MUST return `disabled=true`; when it matches, it MUST return the keyframe's typed value and route `onChange` through the stable-ID adapter. Zero values MUST NOT fall back to base values.

#### Scenario: Number from resolved base property (no adapter)

- GIVEN no keyframe adapter
- WHEN resolveNumber is called
- THEN the resolved base property value is returned

#### Scenario: Keyframe zero preserved

- GIVEN keyframe value is `0`
- WHEN resolved
- THEN `0` is returned, not the element fallback

#### Scenario: String resolution

- GIVEN a string keyframe on a string-compatible property track
- WHEN resolveString is called
- THEN keyframe value is returned and onChange routes to adapter

#### Acceptance Criteria

- [ ] Given no keyframe adapter, the resolved base property value is returned
- [ ] Given keyframe value is `0`, `0` is returned, not the element fallback
- [ ] Given a target-matching string track/keyframe, its typed value is returned and onChange routes through stable IDs
- [ ] Given a property that does not match the selected track target, the resolver is disabled rather than reading a property bag

---

### Requirement: Wheel Input Classification

The system MUST classify smooth pixel deltas as trackpad gestures. Trackpad scroll without modifiers MUST be pan. Trackpad + Alt MUST be zoom. Pinch-style Ctrl+wheel MUST be zoom. Coarse wheel steps MUST stay in legacy mode.

#### Scenario: Trackpad pan

- GIVEN smooth pixel delta without modifiers
- WHEN classified
- THEN the action is pan

#### Scenario: Trackpad + Alt zoom

- GIVEN smooth pixel delta with Alt key
- WHEN classified
- THEN the action is zoom

#### Scenario: Pinch zoom

- GIVEN Ctrl+wheel (pinch-style)
- WHEN classified
- THEN the action is zoom

#### Acceptance Criteria

- [ ] Given smooth pixel delta without modifiers, the action is pan
- [ ] Given smooth pixel delta with Alt key, the action is zoom
- [ ] Given Ctrl+wheel (pinch-style), the action is zoom

---

### Requirement: WCAG AA Utility Component Accessibility

Utility components (wheel input classifier, sequence/lifecycle/state-machine helpers, CSS parsers) that produce UI-facing output MUST ensure accessible output. The wheel event classifier MUST NOT interfere with assistive technology scroll behavior; when a screen reader is active, wheel zoom MUST be disabled in favor of explicit zoom controls. Animation authoring dropdowns and selectors MUST use proper `role="listbox"` or `role="combobox"` semantics.

#### Scenario: Screen reader active disables wheel zoom

- GIVEN a screen reader is active
- WHEN the user scrolls with a wheel
- THEN the page scrolls normally (wheel zoom is disabled)

#### Scenario: Animation authoring selector has ARIA role

- GIVEN a sequence or lifecycle-action selector
- WHEN inspected
- THEN it has an appropriate listbox or combobox ARIA role

#### Acceptance Criteria

- [ ] Given a screen reader active, wheel zoom is disabled
- [ ] Given animation authoring selectors, proper ARIA roles are applied

---

## Spec Gaps

- [ ] **WCAG AA Utility Component Accessibility:** No automated tests verify that wheel zoom is suppressed when a screen reader is active, or that sequence/lifecycle/state-machine selectors expose correct ARIA roles — accessibility-focused component and integration tests are needed.

---

## Non-Goals

- Property panels → see [panels.md](panels.md)
- Modal dialogs → see [modals.md](modals.md)
- Toolbar and navigation → see [toolbar-nav.md](toolbar-nav.md)
- Timeline editing → see [timeline.md](timeline.md)
