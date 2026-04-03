# UI — Timeline Specification

## Purpose

Defines the behavioral requirements for the timeline editor, timeline bottom panel, and timeline editing context — the controls for creating and editing animation keyframes and timelines.

---

## Requirements

### Requirement: Timeline Editor Keyframe Management

The system MUST render an empty state when no keyframes exist. A `+` button MUST add a keyframe and select it. Clicking a keyframe marker MUST show the keyframe hint and set `aria-pressed`. Only one keyframe MUST be selected at a time. Re-clicking the same marker MUST keep it selected.

#### Scenario: Empty state

- GIVEN no keyframes in the timeline
- WHEN the editor renders
- THEN empty state is displayed

#### Scenario: Add and select keyframe

- GIVEN the add button (+)
- WHEN clicked
- THEN a new keyframe is added and selected

#### Scenario: Single selection only

- GIVEN multiple keyframes
- WHEN a second marker is clicked
- THEN only the new marker has `aria-pressed="true"`

#### Scenario: Keyframe hint on marker click

- GIVEN a keyframe marker
- WHEN clicked
- THEN the keyframe hint is shown

#### Acceptance Criteria

- [ ] Given no keyframes in the timeline, empty state is displayed
- [ ] Given the add button (+), a new keyframe is added and selected
- [ ] Given multiple keyframes, only the new marker has `aria-pressed="true"`
- [ ] Given a keyframe marker, the keyframe hint is shown

---

### Requirement: Keyframe Drag Repositioning

Dragging a keyframe marker along the timeline MUST reposition it to a new time offset. During drag, a visual indicator MUST show the current time position. On drop, the keyframe's time offset MUST be committed at the new position.

#### Scenario: Drag marker to new position

- GIVEN a keyframe marker at 500ms in a 2000ms timeline
- WHEN the marker is dragged to the 75% position
- THEN the keyframe is repositioned to 1500ms

#### Scenario: Visual feedback during drag

- GIVEN a keyframe marker being dragged
- WHEN the pointer moves along the timeline track
- THEN a visual indicator shows the current time position with a time label

#### Acceptance Criteria

- [ ] Given a keyframe marker drag, the keyframe is repositioned to the new time offset
- [ ] Given a drag in progress, a visual indicator with time label is displayed

---

### Requirement: Timeline Playback

The system MUST support starting playback. When starting playback, the system MUST NOT pass an onComplete callback.

#### Scenario: Playback start

- GIVEN a timeline with keyframes
- WHEN playback is started
- THEN onPlayTimeline is called without onComplete

#### Acceptance Criteria

- [ ] Given a timeline with keyframes, onPlayTimeline is called without onComplete

---

### Requirement: Timeline Bottom Panel

The system MUST render with `aria-hidden` when no timeline is being edited. When a timeline is open, the TimelineEditor MUST be rendered. Closing the panel MUST call onClose. Custom height and className props MUST be respected. Play/stop timeline callbacks MUST be threaded to the editor.

#### Scenario: Hidden when no timeline

- GIVEN no timeline being edited
- WHEN the panel renders
- THEN the wrapper has `aria-hidden`

#### Scenario: Editor shown when timeline open

- GIVEN a timeline being edited
- WHEN the panel renders
- THEN TimelineEditor is rendered

#### Acceptance Criteria

- [ ] Given no timeline being edited, the wrapper has `aria-hidden`
- [ ] Given a timeline being edited, TimelineEditor is rendered

---

### Requirement: Timeline Editing Context

The system MUST start with no target and no snapshot. Opening a timeline MUST set the target and capture a screen snapshot. Closing MUST clear both. Using the context outside a provider MUST return null.

#### Scenario: Open sets target and snapshot

- GIVEN no timeline open
- WHEN openTimeline is called
- THEN the target is set and a snapshot is captured

#### Scenario: Close clears state

- GIVEN a timeline is open
- WHEN closeTimeline is called
- THEN target and snapshot are both null

#### Scenario: Outside provider returns null

- GIVEN a component not wrapped in a provider
- WHEN the context hook is called
- THEN it returns null

#### Acceptance Criteria

- [ ] Given no timeline open, the target is set and a snapshot is captured
- [ ] Given a timeline is open, target and snapshot are both null
- [ ] Given a component not wrapped in a provider, it returns null

---

### Requirement: Animation Binding Sections

AnimationBindingSections MUST render state and modifier binding UI for the selected element's animation config. State bindings MUST be editable (add, remove, rename). Modifier bindings MUST support pairing in/out timelines.

#### Scenario: State binding display

- GIVEN an element with animation config containing state bindings
- WHEN the binding sections render
- THEN each state binding is listed with its associated timeline

#### Scenario: Add modifier binding

- GIVEN an element with animation config
- WHEN a new modifier binding is added
- THEN an in/out timeline pair is created for the modifier

#### Acceptance Criteria

- [ ] Given an element with state bindings, each binding is listed with its timeline
- [ ] Given a modifier binding addition, an in/out timeline pair is created
- [ ] Given state binding removal, the binding and its timeline reference are cleared

---

### Requirement: Property Editing Context for Keyframes

When a keyframe is selected in the timeline, property panels MUST switch to keyframe-aware editing mode. Property changes MUST update the selected keyframe's values instead of the element's base values.

#### Scenario: Keyframe-aware property edit

- GIVEN a keyframe is selected in the timeline
- WHEN a property value is changed in a panel
- THEN the keyframe's property value is updated, not the element's base value

#### Acceptance Criteria

- [ ] Given a selected keyframe, property panel edits target the keyframe values
- [ ] Given no keyframe selected, property panel edits target the element's base values

---

### Requirement: Keyframe Deletion

Selected keyframes MUST be deletable via the Delete/Backspace key or a right-click context menu. Deleting a keyframe MUST remove it from the timeline and update the animation registry. If the deleted keyframe is the only keyframe in a timeline, the entire timeline entry MUST be removed. Keyframe deletion MUST be undoable.

#### Scenario: Delete key removes selected keyframe

- GIVEN a keyframe is selected
- WHEN the user presses Delete
- THEN the keyframe is removed from the timeline

#### Scenario: Context menu delete

- GIVEN a keyframe is selected
- WHEN the user right-clicks and selects "Delete Keyframe"
- THEN the keyframe is removed from the timeline

#### Scenario: Last keyframe removes timeline entry

- GIVEN a timeline with a single keyframe
- WHEN that keyframe is deleted
- THEN the entire timeline entry is removed

#### Scenario: Undo restores deleted keyframe

- GIVEN a keyframe was just deleted
- WHEN the user triggers undo
- THEN the keyframe is restored

#### Acceptance Criteria

- [ ] Given a selected keyframe, pressing Delete removes it from the timeline
- [ ] Given a selected keyframe, a right-click context menu offers a delete option
- [ ] Given the last keyframe in a timeline, deleting it removes the timeline entry
- [ ] Given a deleted keyframe, undo restores it

---

## Spec Gaps

- [ ] **Keyframe Deletion:** No automated tests cover Delete/Backspace key handling, context-menu delete, last-keyframe timeline removal, or undo of deletion — component tests needed for the timeline editor keyframe deletion flow.

---

## Non-Goals

- Property panels → see [panels.md](panels.md)
- Modal dialogs → see [modals.md](modals.md)
- Toolbar and navigation → see [toolbar-nav.md](toolbar-nav.md)
