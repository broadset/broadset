# Demo — State Management Specification

## Purpose

Defines application-level state management for the demo: provider wiring, sidebar preference persistence, toast notification system, fullscreen toggle, browser zoom prevention, and placement mode Escape handling. It does NOT define editor store state (→ `project/spec/editor/`) or component-level state (→ `project/spec/ui/`). See [conventions](../../README.md).

---

## Requirements

### Requirement: Editor Provider Wiring

The app MUST wrap the component tree in: EditorProvider (with EditorConfig and EditorStore), TimelineEditingProvider, and BroadsetDataStoreProvider. All child components MUST have access to the editor store, timeline editing context, and data store.

#### Scenario: Provider hierarchy

- GIVEN the demo app is mounted
- WHEN child components access the editor store, timeline context, and data store
- THEN all three contexts are available and functional

#### Acceptance Criteria

- [ ] Given the demo app is mounted, the editor store is accessible via hooks in child components
- [ ] Given the demo app is mounted, the timeline editing context is available
- [ ] Given the demo app is mounted, the data store is available for element data injection

---

### Requirement: Sidebar Preferences Persistence

Sidebar open/closed state, active tab, and drawer width MUST persist to localStorage under a versioned key. On reload, MUST restore the saved values. Invalid or missing localStorage data MUST be silently ignored.

#### Scenario: Preferences save on change

- GIVEN the sidebar is open on the Properties tab at width 500px
- WHEN the page is reloaded
- THEN the sidebar opens on Properties tab at width 500px

#### Scenario: Corrupt storage ignored

- GIVEN malformed JSON in the sidebar preferences storage key
- WHEN the app initializes
- THEN the sidebar uses defaults without error

#### Acceptance Criteria

- [ ] Given sidebar state changes, open/closed, tab, and width are saved to localStorage
- [ ] Given saved preferences on reload, the sidebar restores to the saved state
- [ ] Given corrupt localStorage data, the app initializes with defaults

---

### Requirement: Toast Notification System

Export success/failure, import success/failure, save, and placement mode actions MUST display auto-dismissing toast notifications. Success and info toasts MUST dismiss after approximately 3 seconds. Error toasts MUST dismiss after approximately 5 seconds.

#### Scenario: Export success toast

- GIVEN an export completes successfully
- WHEN the toast appears
- THEN it displays a success message and auto-dismisses after ~3 seconds

#### Scenario: Export error toast

- GIVEN an export fails
- WHEN the toast appears
- THEN it displays an error message and auto-dismisses after ~5 seconds

#### Acceptance Criteria

- [ ] Given a successful action, a success toast appears and auto-dismisses after ~3 seconds
- [ ] Given a failed action, an error toast appears and auto-dismisses after ~5 seconds
- [ ] Given multiple simultaneous toasts, all are visible and dismiss independently

---

### Requirement: Fullscreen Toggle

The app MUST support entering and exiting browser fullscreen mode via a toolbar button. The fullscreen icon MUST reflect the current state.

#### Scenario: Enter fullscreen

- GIVEN the app is not in fullscreen
- WHEN the fullscreen button is pressed
- THEN the app enters fullscreen and the icon updates

#### Acceptance Criteria

- [ ] Given the fullscreen button press, the app toggles between fullscreen and windowed mode
- [ ] Given the fullscreen state, the toolbar icon reflects the current mode

---

### Requirement: Browser Zoom Prevention

The app MUST prevent browser-native zoom gestures to avoid conflicts with canvas zoom: pinch-to-zoom (multi-touch), Ctrl/Cmd+scroll, Ctrl/Cmd+Plus/Minus/Zero, and Safari gesture events.

#### Scenario: Pinch-to-zoom prevented

- GIVEN a multi-touch event on the canvas
- WHEN the user pinches
- THEN the browser zoom is prevented and the event does not propagate

#### Acceptance Criteria

- [ ] Given multi-touch events, browser pinch-to-zoom is prevented
- [ ] Given Ctrl+scroll, browser zoom is prevented
- [ ] Given Ctrl+Plus/Minus/Zero, browser zoom is prevented

---

### Requirement: Viewport Overflow Lock

The app MUST set `overflow: hidden` and `height: 100%` on the `<html>`, `<body>`, and root `<div>` elements on mount, and MUST restore previous values on unmount.

#### Scenario: Overflow locked on mount

- GIVEN the demo app mounts
- WHEN the layout effect runs
- THEN html, body, and root div have overflow hidden and height 100%

#### Acceptance Criteria

- [ ] Given app mount, overflow is hidden and height is 100% on html, body, and root
- [ ] Given app unmount, previous overflow and height values are restored

---

### Requirement: Save via Host Callback

The demo app MUST configure `EditorConfig.onSave` with a callback that persists the current document to `localStorage`. When the user triggers save (toolbar button or Ctrl+S), the callback serializes the document to JSON and stores it under a well-known localStorage key. On app load, the demo MUST check localStorage for a saved document and restore it if found, falling back to the sample document if no saved data exists.

#### Scenario: Save writes to localStorage

- GIVEN the user clicks the save button
- WHEN the save action fires
- THEN the document JSON is written to localStorage

#### Scenario: Saved document restored on load

- GIVEN a previously saved document exists in localStorage
- WHEN the demo app loads
- THEN the saved document is restored

#### Scenario: Sample document used when no saved data

- GIVEN no saved document in localStorage
- WHEN the demo app loads
- THEN the sample document is used

#### Acceptance Criteria

- [ ] Given a save action, the document is serialized to localStorage
- [ ] Given a saved document in localStorage on load, the saved document is restored
- [ ] Given no saved document on load, the sample document is used as default

---

## Spec Gaps

- [ ] **Save via Host Callback:** No automated tests currently verify localStorage persistence on save, document restoration on load, or fallback to sample document. Tests covering each acceptance criterion need to be written.

---

## Non-Goals

- Editor store state shape and actions → see `project/spec/editor/store-actions.md`
- Modal open/close state management → see `project/spec/ui/modals.md`
- Timeline editing context internals → see `project/spec/ui/timeline.md`
