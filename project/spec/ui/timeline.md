# UI — Timeline Specification

## Purpose

Defines the behavioral requirements for the timeline editor, timeline bottom panel, and timeline editing context — the controls for creating and editing animation keyframes and timelines.

---

## Requirements

### Requirement: Timeline Editor Keyframe Management

The system MUST render an empty state when no keyframes exist. A `+` button MUST add a keyframe and select it. Clicking a keyframe marker MUST show the keyframe hint and set `aria-pressed`. Only one keyframe MUST be selected at a time. Re-clicking the same marker MUST keep it selected.

**Timeline Editor Visual Structure:**

The timeline editor MUST be composed of these visual zones:

| Zone            | Position      | Content                                                                                                                                                   |
| --------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Editor controls | Top-left      | Add-keyframe button. Play/Pause and Stop buttons MUST NOT render inside the editor — playback is owned by the host shell's animation toolbar              |
| Timeline ruler  | Top, spanning | Horizontal ruler with time markers (step interval configurable, default every 500ms). Grid lines at snap intervals (default 100ms)                        |
| Keyframe track  | Center        | Horizontal track where keyframe markers are positioned at their time offsets. Clicking an empty area of the track MUST position the playhead at that time |
| Playhead        | Vertical line | Red/accent-colored vertical line indicating current playback time. Draggable for timeline scrubbing. Synced with playback engine time                     |
| Keyframe list   | Bottom        | Table/list of keyframes showing: Name, Offset (ms), Action type, Property count. Click to select, double-click to rename                                  |

**Timeline Scope Lanes:**

The keyframe track MUST render separate named lanes for owner keyframes and targeted child-element keyframes. The owner lane MUST remain first regardless of keyframe time ordering, and target lanes MUST use deterministic target-identity ordering so lane positions do not jump when keyframes are added, moved, renamed, or resolved from fallback IDs to display names. The lane label column MUST be visually distinct from the time rail and MUST NOT respond to scrub or seek gestures. The time ruler, playhead, scrub gestures, and keyframe dragging MUST remain aligned to one shared time rail across all lanes.

**Timeline Duration:**

The visible timeline length MUST use `timeline.durationMs` when an explicit duration is present. When no explicit duration is present, it MUST be calculated as `max(keyframe offsets) + 1000ms`, with a minimum of `3000ms`. This ensures the visual ruler, playhead position, and host playback/seek clamping all share one duration contract.

**Ruler Time Format:**

Ruler time labels MUST use seconds with one decimal place (e.g., `0.0s`, `0.5s`, `1.0s`, `2.5s`). This provides clear, scannable time references without millisecond clutter.

**Keyframe Markers:**

Keyframe markers MUST appear as small circular or diamond-shaped indicators positioned along the timeline track at their offset. Selected markers MUST have a distinct highlight (e.g., accent color fill). Markers MUST be draggable to reposition.

Markers MUST be color-coded by their action type for quick visual identification:

| Action type      | Color  | Semantic                   |
| ---------------- | ------ | -------------------------- |
| `setState`       | Accent | Primary state change       |
| `addModifier`    | Focus  | Adding a visual modifier   |
| `removeModifier` | Danger | Removing a visual modifier |

Same-time markers MAY stack within a lane, but their stack offsets MUST remain bounded inside that lane so markers do not visually cross into another scope lane. Dense same-time stacks MUST fan horizontally before markers collapse onto identical positions so each keyframe remains visible and selectable.

**Keyframe Easing:**

Each keyframe MUST have a configurable easing function that controls interpolation from this keyframe to the next. The default easing MUST be `ease`. Common presets MUST be available via a dropdown (e.g., `linear`, `ease`, `ease-in`, `ease-out`, `ease-in-out`). The easing dropdown MUST appear in the keyframe detail area when a keyframe is selected.

**Snap Behavior:**

When dragging keyframes, positions MUST snap to the grid interval. The default snap interval is 100ms.

The shared time rail MUST show visible snap grid lines. For long explicit timelines, the renderer MAY increase the visible grid interval while preserving drag snapping behavior so the UI does not create thousands of sub-pixel grid nodes.

**Playhead Scrubbing:**

Dragging the playhead or an empty area of the track MUST call `onSeekTimeline` on pointer-down and on every pointer-move so the canvas previews the scrub position in real-time. Dragging a keyframe marker MUST also seek the preview to the dragged offset during the drag.

**Add at Playhead:**

The add-keyframe control MUST pass the current playhead/scrub time to the host via `onAddKeyframe(offsetMs)`. Hosts SHOULD insert the new keyframe at that snapped offset, select it after sorting, and seed any already-animated properties from the sampled timeline frame at that time.

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
- [ ] Given keyframes at 500ms and 1200ms, the visible timeline length is at least 2200ms (max offset + 1000ms)
- [ ] Given no keyframes, the visible timeline length is at least 3000ms
- [ ] Given ruler markers, time labels use `N.Ns` format (e.g., `0.5s`, `1.0s`)
- [ ] Given keyframes with different action types, markers are color-coded (setState=accent, addModifier=focus, removeModifier=danger)
- [ ] Given a click on an empty area of the keyframe track, the playhead moves to that time position
- [ ] Given a pointer drag on the track, the playhead seeks on pointer-down and every pointer-move
- [ ] Given a keyframe marker drag, the preview seeks to the dragged offset while the marker is moving
- [ ] Given the add-keyframe button, the host receives the current playhead time for insertion
- [ ] Given a selected keyframe, an easing dropdown is available with common presets
- [ ] Given owner and targeted child keyframes, the track renders separate named scope lanes on one shared time rail
- [ ] Given a child-targeted keyframe appears earlier than owner keyframes, the owner lane still renders first
- [ ] Given multiple same-time keyframes in one lane, marker stack offsets remain inside that lane
- [ ] Given five or more same-time keyframes in one lane, markers remain visually distinguishable
- [ ] Given a click on a lane label, the playhead does not seek

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

**Playback Controls (Host Shell Responsibility):**

Timeline playback controls MUST live in the host shell's Animation toolbar (see `project/spec/demo/layout.md` → Animation Bottom Toolbar), not inside the TimelineEditor. The host shell MUST expose Play/Pause and Reset controls whose behavior switches to timeline-scoped handlers whenever a timeline is open.

| Control    | Icon         | Behavior                                                     |
| ---------- | ------------ | ------------------------------------------------------------ |
| Play/Pause | Play / Pause | Starts playback from playhead position; toggles pause        |
| Reset      | RotateCcw    | Stops playback and resets the timeline playhead to the start |

The playhead MUST animate in sync with the playback engine via `requestAnimationFrame`. When playback reaches the end without loop mode, it MUST stop automatically.

**Snapshot Restore on Play:**

Before starting playback or seeking, the system MUST restore the element to its base snapshot state. This ensures the animation always starts from a known visual state rather than accumulating incremental changes.

#### Scenario: Playback start

- GIVEN a timeline with keyframes
- WHEN playback is started via the host Animation toolbar
- THEN the timeline playback handler is invoked without an onComplete callback

#### Acceptance Criteria

- [ ] Given a timeline with keyframes, the timeline playback handler is invoked without onComplete
- [ ] Given playback starting, the element is restored to its base snapshot state before animation begins
- [ ] Given the TimelineEditor is open, it does not render its own Play/Pause/Stop buttons

---

### Requirement: Timeline Bottom Panel

The system MUST render with `aria-hidden` when no timeline is being edited. When a timeline is open, the TimelineEditor MUST be rendered. Closing the panel MUST call onClose. Custom height and className props MUST be respected.

**Visual Behavior:**

The bottom panel MUST be fixed-positioned at the bottom of the viewport, with 16px side insets (`TIMELINE_BOTTOM_PANEL_SIDE_INSET_PX`). See `project/spec/demo/layout.md` → Timeline Panel for the full positioning table.

The panel MUST slide up from the bottom edge using a CSS transform transition. When closed, it MUST be translated off-screen (`translateY(100%)`) with `pointer-events: none` to avoid blocking canvas interaction. When open, it MUST translate to its natural position (`translateY(0)`) with full interactivity.

The panel MUST have a `var(--surface)` background with top border-radius for visual distinction from the canvas. A close button (X icon) MUST be visible in the panel header to close the timeline editor.

The panel header MUST identify the active timeline and SHOULD include a concise subtitle with the edited target element when known. The TimelineEditor itself MUST surface the edited timeline, target, current time, and preview state (`Playing`, `Paused`, or `Scrubbing`) so the user can distinguish timeline-scoped editing from document-level playback at a glance.

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
- [ ] Given a timeline being edited, the panel and editor identify the timeline, target, current time, and preview state

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

**State Binding Ordering:**

State bindings MUST be displayed in a fixed order: `Enter` first, then custom states in alphabetical order, then `Exit` last. This ensures a predictable, scannable list regardless of creation order.

**Modifier Out-Timeline Default:**

When creating a new modifier binding, the out-timeline MUST default to a reversed copy of the in-timeline. This saves the user from manually building the reverse animation for common show/hide patterns.

#### Acceptance Criteria

- [ ] Given an element with state bindings, each binding is listed with its timeline
- [ ] Given a modifier binding addition, an in/out timeline pair is created
- [ ] Given state binding removal, the binding and its timeline reference are cleared
- [ ] Given multiple state bindings, they are ordered: Enter first, custom alphabetically, Exit last
- [ ] Given a new modifier binding with an in-timeline, the out-timeline defaults to a reversed copy

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

Selected keyframes MUST be deletable via Delete/Backspace or a context menu. Deleting a keyframe updates its canonical track in `document.sequences`. If it was the track's only keyframe, the empty track is removed; an empty sequence is removed only when no lifecycle, page, clip, state-machine, or other stable reference targets it. The atomic edit is undoable and must preserve reference validity.

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

### Requirement: Visual Easing Graph Editor

The timeline editor MUST provide a visual easing curve editor for authoring and previewing interpolation curves. When a keyframe tween is selected (click on the segment between two keyframes), a graph editor panel MUST appear inline below the timeline ruler. The graph editor displays a unit square (0,0 → 1,1) with the current easing curve plotted as a line. For cubic-bezier curves, two control point handles MUST be draggable to modify the curve shape in real time. For named presets (ease, ease-in, ease-out, ease-in-out), the curve MUST display as read-only — the user can switch to custom cubic-bezier to make it editable. For spring presets, the graph MUST show the spring decay curve as read-only with the overshoot visible. The graph editor MUST include a row of preset chips above the curve: `linear`, `ease`, `ease-in`, `ease-out`, `ease-in-out`, `spring-gentle`, `spring-bouncy`, `spring-stiff`. Clicking a preset chip MUST apply it immediately and update the curve visualization. A real-time animation preview dot MUST travel along the curve while the timeline is scrubbing or playing. The graph editor closes when clicking outside it or selecting a different keyframe.

#### Scenario: Open graph editor for tween segment

- GIVEN two keyframes with a tween segment between them
- WHEN the user clicks the tween segment
- THEN the graph editor panel appears below the timeline ruler showing the current easing curve

#### Scenario: Drag cubic-bezier control handles

- GIVEN the graph editor is open with a custom cubic-bezier curve
- WHEN the user drags a control point handle
- THEN the curve updates in real time and the keyframe's interpolation mode value is updated

#### Scenario: Apply preset chip

- GIVEN the graph editor is open
- WHEN the user clicks the `ease-in-out` preset chip
- THEN the interpolation mode is set to `ease-in-out` and the curve visualization updates

#### Scenario: Spring preset displays decay curve

- GIVEN the graph editor is open with interpolation mode `spring-bouncy`
- WHEN the graph renders
- THEN the curve shows the spring decay with visible overshoot (values above 1.0)

#### Scenario: Preview dot during playback

- GIVEN the graph editor is open and the timeline is playing
- WHEN the playhead advances
- THEN a dot travels along the curve in sync with the playback position

#### Acceptance Criteria

- [ ] Given a tween segment click, the graph editor appears with the current easing curve
- [ ] Given a cubic-bezier curve, control handles are draggable and update the interpolation mode
- [ ] Given a preset chip click, the interpolation mode and visualization update immediately
- [ ] Given a spring easing, the curve shows the decay with overshoot
- [ ] Given playback or scrubbing, a preview dot travels along the curve
- [ ] Given a click outside the graph editor, it closes

---

### Requirement: Per-Property Keyframe Lanes

The timeline editor MUST support an expandable per-property view that displays individual property tracks for the selected element's animation. When the user clicks an expand toggle on an element's timeline row, the row expands to show one horizontal lane per animated property (e.g., `x`, `y`, `opacity`, `backgroundColor`). Each lane shows diamond keyframe markers at the offsets where that specific property has values. Users can add keyframes to individual property lanes by double-clicking at the desired offset — this creates or updates a keyframe at that offset for only that property. Users can drag a property-specific keyframe marker to a different offset — this moves that property's value out of the source keyframe and into a new or existing keyframe at the target offset. The expanded view MUST group properties by category: Geometry (x, y, width, height, rotation), Appearance (opacity, backgroundColor, borderColor, etc.), and Typography (fontSize, color, etc.). When the expand toggle is collapsed, the view returns to the standard monolithic keyframe display. Only one element's properties can be expanded at a time.

#### Scenario: Expand property lanes

- GIVEN an element row in the timeline with animated properties `x`, `opacity`, and `backgroundColor`
- WHEN the user clicks the expand toggle
- THEN three property lanes appear, each showing keyframe markers at the relevant offsets

#### Scenario: Add keyframe to single property lane

- GIVEN the property lanes are expanded for `opacity`
- WHEN the user double-clicks at offset 500ms on the `opacity` lane
- THEN a keyframe is created (or updated) at 500ms with the current opacity value

#### Scenario: Drag property keyframe to different offset

- GIVEN a keyframe at 300ms with properties `x: 100` and `opacity: 0.5`
- WHEN the user drags the `opacity` marker from 300ms to 600ms on the opacity lane
- THEN `opacity: 0.5` is removed from the 300ms keyframe and placed in a keyframe at 600ms; `x: 100` remains at 300ms

#### Scenario: Collapse back to monolithic view

- GIVEN property lanes are expanded
- WHEN the user clicks the collapse toggle
- THEN lanes collapse back to the single-row monolithic keyframe display

#### Scenario: Property categories

- GIVEN an element with animated `x`, `y`, `opacity`, and `fontSize`
- WHEN property lanes are expanded
- THEN lanes are grouped: Geometry (x, y), Appearance (opacity), Typography (fontSize)

#### Acceptance Criteria

- [ ] Given the expand toggle, property lanes are shown with per-property keyframe markers
- [ ] Given a double-click on a property lane, a property-specific keyframe is created at that offset
- [ ] Given a property keyframe drag, that property value moves to the target offset independently
- [ ] Given the collapse toggle, the view returns to monolithic keyframe display
- [ ] Given animated properties, they are grouped by category (Geometry, Appearance, Typography)
- [ ] Given multiple elements, only one element's properties can be expanded at a time

---

## Spec Gaps

- [ ] **Keyframe Deletion:** No automated tests cover Delete/Backspace key handling, context-menu delete, last-keyframe timeline removal, or undo of deletion — component tests needed for the timeline editor keyframe deletion flow.
- [ ] **Visual Easing Graph Editor:** No automated tests cover graph editor appearance, control handle interaction, preset application, or preview dot behavior — requires CT.
- [ ] **Per-Property Keyframe Lanes:** No automated tests cover lane expansion, per-property keyframe creation, property value migration between offsets, or category grouping — requires CT.

---

## Non-Goals

- Property panels → see [panels.md](panels.md)
- Modal dialogs → see [modals.md](modals.md)
- Toolbar and navigation → see [toolbar-nav.md](toolbar-nav.md)
- Timeline zoom or horizontal scroll — the full duration is always visible at the current scale
- Playback speed control — animations always play at 1× speed
