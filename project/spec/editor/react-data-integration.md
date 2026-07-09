# Editor — React Data Integration Specification

## Purpose

Defines React integration contracts for runtime element data subscriptions in editor UI trees. The editor MUST provide context-backed data access, preserve provider boundaries, and limit re-renders to subscribed data slices. It does NOT define document diffing, path editing, or animation playback math. See [conventions](../../README.md).

---

## Requirements

### Requirement: Provider-Scoped Data Access

The system MUST provide runtime element data through a provider-scoped context, and consumers inside the provider MUST read current element data values.

#### Scenario: Element data resolves inside provider

- GIVEN a provider with runtime data for an element
- WHEN an element data selector is used inside the provider
- THEN the current element data is returned

#### Scenario: Missing element returns undefined

- GIVEN a provider without data for an element
- WHEN an element data selector is used
- THEN the result is undefined

#### Acceptance Criteria

- [ ] Given a provider with runtime data for an element, the current element data is returned
- [ ] Given a provider without data for an element, the result is undefined

---

### Requirement: Provider Boundary Enforcement

The system MUST enforce provider usage for state-selection hooks and expose nullable raw store access when outside a provider boundary.

#### Scenario: State-selection hook fails outside provider

- GIVEN a component outside the data provider
- WHEN a state-selection hook is used
- THEN an error is raised indicating provider scope is required

#### Scenario: Raw store API is nullable outside provider

- GIVEN a component outside the data provider
- WHEN raw store API access is requested
- THEN the returned API value is null

#### Acceptance Criteria

- [ ] Given a component outside the data provider, an error is raised indicating provider scope is required
- [ ] Given a component outside the data provider, the returned API value is null

---

### Requirement: Reactive Data Propagation

The system MUST propagate runtime data updates to subscribers and preserve integration through the editor-level provider wrapper.

#### Scenario: Element data subscribers receive updates

- GIVEN an element data subscriber inside provider scope
- WHEN that element's runtime data is updated
- THEN the subscriber renders the updated value

#### Scenario: Editor-level provider forwards runtime data store

- GIVEN an editor-level provider configured with runtime data
- WHEN element data is queried and updated through that provider tree
- THEN values resolve and update correctly

#### Acceptance Criteria

- [ ] Given an element data subscriber inside provider scope, the subscriber renders the updated value
- [ ] Given an editor-level provider configured with runtime data, values resolve and update correctly

---

### Requirement: Selector Render Isolation

The system MUST limit re-renders to components whose subscribed element data slice changes.

#### Scenario: Updating one element does not re-render unrelated subscribers

- GIVEN two components subscribing to different element data slices
- WHEN only one element's data changes
- THEN only the corresponding subscriber re-renders

#### Acceptance Criteria

- [ ] Given two components subscribing to different element data slices, only the corresponding subscriber re-renders

---

### Requirement: Editor Provider Context

The editor provider MUST wrap the editor component tree, providing store access and component registry via React context. All child components MUST be able to access the editor store and registered component plugins.

#### Scenario: Store access inside provider

- GIVEN a component inside the editor provider
- WHEN the editor store hook is used
- THEN the current editor state is accessible

#### Scenario: Component registry access

- GIVEN custom component plugins registered via EditorConfig
- WHEN the component registry is queried inside the provider
- THEN all registered plugins are available

#### Acceptance Criteria

- [ ] Given a component inside the editor provider, the editor store is accessible via hook
- [ ] Given registered component plugins, the component registry provides them inside the provider

---

### Requirement: Error Boundary Recovery

The editor error boundary MUST catch rendering errors in the editor tree and display a recovery UI instead of crashing the entire application. The fallback UI MUST display: a heading ("Something went wrong"), the error message text (for debugging), and a "Reload" button that reloads the page. The fallback MUST be styled with `--surface` background, centered in the canvas area, and use the `--danger` color for the heading icon. The error boundary MUST log the caught error to `console.error` with the component stack.

#### Scenario: Rendering error caught

- GIVEN a rendering error in an editor child component
- WHEN the error propagates
- THEN the error boundary catches it and displays a fallback UI with heading, error message, and reload button
- AND the rest of the application continues functioning

#### Scenario: Reload button reloads page

- GIVEN the error boundary fallback is displayed
- WHEN the user clicks the Reload button
- THEN the page reloads

#### Acceptance Criteria

- [ ] Given a rendering error in the editor tree, a fallback UI is displayed instead of a crash
- [ ] Given the fallback UI, it shows a heading, the error message, and a Reload button
- [ ] Given the fallback UI, it is centered in the canvas area with `--surface` background
- [ ] Given a caught error, it is logged to console.error with component stack

---

### Requirement: Timeline Playback Hook

The timeline playback hook MUST provide play, pause, seek, stop, and current-time state for timeline animation preview in the editor.

#### Scenario: Play and pause

- GIVEN a document with animation timelines
- WHEN play is invoked via the hook
- THEN the animation plays and current time advances
- WHEN pause is invoked
- THEN the animation pauses at the current time

#### Scenario: Seek to offset

- GIVEN a playing animation
- WHEN seek is invoked with a specific time offset
- THEN the animation jumps to that offset

#### Acceptance Criteria

- [ ] Given a play command, the animation starts and current time advances
- [ ] Given a pause command, the animation stops at the current time
- [ ] Given a seek command, the animation jumps to the specified time

---

## Spec Gaps

_None — all requirements have acceptance criteria._

---

## Non-Goals

- Store mutation primitives and bulk update behavior → see [data-store.md](data-store.md)
- Collaborative change-stream behavior → see [collaboration.md](collaboration.md)
- Timeline playback wiring behavior → see [timeline-playback.md](timeline-playback.md)
- Playback controller internals → see `project/spec/playback/playback.md`
