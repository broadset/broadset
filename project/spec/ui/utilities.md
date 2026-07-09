# UI — Utilities Specification

## Purpose

Defines the behavioral requirements for editor utility modules: CSS value parsers, animation binding helpers, keyframe value resolution hooks, and wheel input classification.

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

### Requirement: Animation Binding Normalization

The system MUST normalize state bindings to always include IN and OUT entries, renumber custom bindings sequentially, and use fallback IDs when binding ID is empty. State options MUST be sorted with labels for reserved states. IN MUST be placed first and OUT last in binding views.

#### Scenario: Empty bindings produce IN/OUT

- GIVEN an empty binding map
- WHEN normalized
- THEN IN and OUT bindings are present

#### Scenario: Custom bindings renumbered

- GIVEN custom state bindings
- WHEN normalized
- THEN orders are sequential

#### Acceptance Criteria

- [ ] Given an empty binding map, IN and OUT bindings are present
- [ ] Given custom state bindings, orders are sequential

---

### Requirement: Timeline and State Resolution

The system MUST build sorted timeline options from timelines (using name as ID fallback). State binding and modifier binding accessors MUST return the config arrays when present or empty arrays when missing.

#### Scenario: Timeline options sorted

- GIVEN timelines with names
- WHEN options are built
- THEN they are sorted alphabetically

#### Scenario: Missing bindings return empty array

- GIVEN a config without stateTimelineBindings
- WHEN accessed
- THEN an empty array is returned

#### Acceptance Criteria

- [ ] Given timelines with names, they are sorted alphabetically
- [ ] Given a config without stateTimelineBindings, an empty array is returned

---

### Requirement: Keyframe Value Resolution

For numbers, the system MUST return the element value when no keyframe adapter exists. When a property is not included in the keyframe, it MUST return disabled=true. When included, it MUST return the keyframe value. onChange MUST route to the adapter. Zero keyframe values MUST NOT fall back to element values.

#### Scenario: Number from element (no adapter)

- GIVEN adapter is null
- WHEN resolveNumber is called
- THEN element value is returned

#### Scenario: Keyframe zero preserved

- GIVEN keyframe value is `0`
- WHEN resolved
- THEN `0` is returned, not the element fallback

#### Scenario: String resolution

- GIVEN a string property in a keyframe
- WHEN resolveString is called
- THEN keyframe value is returned and onChange routes to adapter

#### Acceptance Criteria

- [ ] Given adapter is null, element value is returned
- [ ] Given keyframe value is `0`, `0` is returned, not the element fallback
- [ ] Given a string property in a keyframe, keyframe value is returned and onChange routes to adapter

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

Utility components (wheel input classifier, animation binding helpers, CSS parsers) that produce UI-facing output MUST ensure accessible output. The wheel event classifier MUST NOT interfere with assistive technology scroll behavior; when a screen reader is active, wheel zoom MUST be disabled in favor of explicit zoom controls. Animation binding dropdowns and selectors MUST use proper `role="listbox"` or `role="combobox"` semantics.

#### Scenario: Screen reader active disables wheel zoom

- GIVEN a screen reader is active
- WHEN the user scrolls with a wheel
- THEN the page scrolls normally (wheel zoom is disabled)

#### Scenario: Animation binding selector has ARIA role

- GIVEN an animation binding selector
- WHEN inspected
- THEN it has an appropriate listbox or combobox ARIA role

#### Acceptance Criteria

- [ ] Given a screen reader active, wheel zoom is disabled
- [ ] Given animation binding selectors, proper ARIA roles are applied

---

## Spec Gaps

- [ ] **WCAG AA Utility Component Accessibility:** No automated tests verify that wheel zoom is suppressed when a screen reader is active, or that animation binding selectors expose correct ARIA roles — accessibility-focused component and integration tests are needed.

---

## Non-Goals

- Property panels → see [panels.md](panels.md)
- Modal dialogs → see [modals.md](modals.md)
- Toolbar and navigation → see [toolbar-nav.md](toolbar-nav.md)
- Timeline editing → see [timeline.md](timeline.md)
