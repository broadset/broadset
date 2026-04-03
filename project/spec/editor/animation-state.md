# Editor — Animation State Specification

## Purpose

Defines editor behavior for animation configuration mutations and screen-state updates applied to document elements. This includes timeline assignment, state/modifier bindings, and element state/modifier transitions reflected in document screen properties. It does NOT define playback interpolation or timeline playback math. See [conventions](../../README.md).

---

## Requirements

### Requirement: Timeline Upsert and Removal

The system MUST upsert timelines per element by identity/name, preserving unrelated timelines and replacing matching timelines; removing a timeline MUST affect only the targeted timeline.

#### Scenario: Upsert creates or replaces targeted timeline

- GIVEN an element animation configuration
- WHEN a timeline with an existing identity or name is upserted
- THEN the targeted timeline is replaced with the new timeline content

#### Scenario: Upsert preserves unrelated timelines

- GIVEN an element with multiple timelines
- WHEN one timeline is upserted
- THEN other timelines remain unchanged

#### Scenario: Timeline removal is scoped

- GIVEN an element with multiple timelines
- WHEN one timeline is removed
- THEN only that timeline is removed and others remain

#### Acceptance Criteria

- [ ] Given an element animation configuration, the targeted timeline is replaced with the new timeline content
- [ ] Given an element with multiple timelines, other timelines remain unchanged
- [ ] Given an element with multiple timelines, only that timeline is removed and others remain

---

### Requirement: State Timeline Binding Integrity

The system MUST support setting, removing, and reordering state-to-timeline bindings. Reserved entry/exit states MUST remain protected from removal.

#### Scenario: State binding set is idempotent by state name

- GIVEN an element state binding for a named state
- WHEN that state binding is set again
- THEN the state binding is replaced for that state name

#### Scenario: Reserved entry/exit state bindings are protected

- GIVEN reserved entry/exit state bindings
- WHEN removal is requested for those reserved states
- THEN the reserved bindings remain present

#### Scenario: Reordering affects custom states only

- GIVEN reserved and custom state bindings
- WHEN custom states are reordered
- THEN custom state ordering changes while reserved state ordering is preserved

#### Acceptance Criteria

- [ ] Given an element state binding for a named state, the state binding is replaced for that state name
- [ ] Given reserved entry/exit state bindings, the reserved bindings remain present
- [ ] Given reserved and custom state bindings, custom state ordering changes while reserved state ordering is preserved

---

### Requirement: Modifier Timeline Binding Integrity

The system MUST set and remove modifier timeline bindings by modifier name without affecting unrelated modifier bindings.

#### Scenario: Modifier binding set replaces same-name binding

- GIVEN an existing modifier binding
- WHEN the same modifier binding is set again
- THEN the binding is replaced for that modifier name

#### Scenario: Modifier binding removal is scoped

- GIVEN multiple modifier bindings
- WHEN one modifier binding is removed
- THEN only the requested modifier binding is removed

#### Acceptance Criteria

- [ ] Given an existing modifier binding, the binding is replaced for that modifier name
- [ ] Given multiple modifier bindings, only the requested modifier binding is removed

---

### Requirement: Element State Visibility Mapping

The system MUST map element state activation to screen visibility semantics and propagate offscreen/onscreen transitions to descendants only when descendant animation state definitions exist.

#### Scenario: Entry and exit states map to onscreen/offscreen visibility

- GIVEN an element with screen state data
- WHEN entry then exit state is applied
- THEN visibility is set to onscreen for entry and offscreen for exit

#### Scenario: Descendant propagation is constrained by descendant animation state definitions

- GIVEN a parent with multiple descendants
- WHEN exit state is applied to the parent
- THEN only descendants with corresponding animation state definitions receive propagated visibility changes

#### Acceptance Criteria

- [ ] Given an element with screen state data, visibility is set to onscreen for entry and offscreen for exit
- [ ] Given a parent with multiple descendants, only descendants with corresponding animation state definitions receive propagated visibility changes

---

### Requirement: Modifier and Screen Class Updates

The system MUST support explicit/toggle modifier updates without duplicates, and class-style updates MUST persist custom clip-path values.

#### Scenario: Modifier toggles are deterministic and deduplicated

- GIVEN an element and a modifier name
- WHEN explicit enable/disable and toggle operations are applied
- THEN the modifier list remains deduplicated and reflects requested state

#### Scenario: Custom clip-path update persists in screen properties

- GIVEN an element with screen properties
- WHEN custom mask mode and custom clip-path are updated
- THEN the persisted screen properties include the requested mask mode and clip-path

#### Acceptance Criteria

- [ ] Given an element and a modifier name, the modifier list remains deduplicated and reflects requested state
- [ ] Given an element with screen properties, the persisted screen properties include the requested mask mode and clip-path

---

## Spec Gaps

_None — all requirements have acceptance criteria._

---

## Non-Goals

- Timeline interpolation and easing behavior → see `project/spec/playback/spec.md`
- Timeline playback orchestration in UI editing sessions → see [timeline-playback.md](timeline-playback.md)
- Document-level schema constraints → see `project/spec/model/spec.md`
