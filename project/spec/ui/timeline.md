# UI — Timeline Editor Specification

## Purpose

Defines the user-facing timeline editor for document/component sequences, stable property tracks, typed keyframes, lifecycle bindings, and state-machine transition actions. The UI may display seconds, frames, or timecode, but every mutation commits exact integer ticks.

---

## Requirements

### Requirement: Timeline Editor Keyframe Management

The editor MUST render an empty state when the selected canonical track has no keyframes. The add button creates a stable typed keyframe on a selected track and selects it. Clicking a marker shows its hint and sets `aria-pressed`; only one keyframe is selected at a time.

**Visual structure:**

| Zone            | Position      | Content                                                                                                                                                        |
| --------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Editor controls | Top-left      | Add-keyframe button; playback controls remain in the host Animation toolbar                                                                                    |
| Timeline ruler  | Top, spanning | Shared exact-tick rail with seconds/frame/timecode labels derived through the document timebase                                                                |
| Track lanes     | Center        | One lane per stable property track; markers use `keyframe.tick`; empty-area gestures move the playhead                                                         |
| Playhead        | Vertical line | Accent line showing the current exact tick and a derived presentation label; draggable for scrubbing                                                           |
| Keyframe list   | Bottom        | Stable ID/name, derived time label, target property, typed value kind, and interpolation; click selects and double-click renames the user-facing keyframe name |

**Track lanes and ordering:**

Document-owned or component-owned sequences render one lane per stable track. Lanes sort deterministically by target entity identity and RFC 6901 property pointer, with tracks targeting the current selection first. Lane labels never seek. Same-tick markers remain bounded within their lane and fan horizontally so dense stacks remain selectable.

**Duration and time conversion:**

Visible length MUST equal the selected sequence's explicit `durationTicks`. A newly created sequence MAY use a friendly default of three display seconds, but the authoring command converts that duration through the timebase and commits explicit `durationTicks` before the editor opens. The UI MUST NOT derive duration from keyframe positions.

Ruler labels MAY display seconds with one decimal, frame number, or document timecode. Pointer positions first map to a ratio of `durationTicks`, then to an integer tick using the selected snap policy. A default “100 ms” UI grid is a presentation preference converted once to a positive integer tick interval; the UI displays the actual resolved interval when the timebase cannot represent the preference exactly. Frame snapping maps to exact frame-start ticks. No millisecond offset is persisted.

**Keyframe markers:**

Markers are circular or diamond indicators positioned by `keyframe.tick`. Selected markers have a distinct highlight. Color communicates typed track/value category rather than a state-changing action:

| Track/value category                    | Color  | Semantic                         |
| --------------------------------------- | ------ | -------------------------------- |
| Numeric/tuple transform or scalar       | Accent | Continuous property contribution |
| Color                                   | Focus  | Color-space-aware contribution   |
| Boolean/string/asset or hold/step value | Danger | Discrete contribution            |

**Interpolation:**

The keyframe detail area edits the closed interpolation variant for the segment beginning at that keyframe. It MUST offer only variants compatible with the track value and target. Friendly presets map to typed cubic-Bézier or spring records before commit.

**Scrubbing and add at playhead:**

Dragging the playhead or empty rail calls `onSeekTick(tick)` on pointer-down and pointer-move. Dragging a marker also previews its candidate tick. The add control calls `onAddKeyframe(sequenceId, trackId, tick)` and seeds a type-compatible value from the resolved target snapshot at that tick. If no track is selected, the UI asks the user to select/create a property track rather than creating a generic property bag.

#### Scenario: Empty track

- GIVEN a selected track with no keyframes
- WHEN the editor renders
- THEN its lane shows an empty state

#### Scenario: Add and select keyframe

- GIVEN a selected type-compatible property track and playhead at tick 500
- WHEN the add button is clicked
- THEN a stable typed keyframe is inserted at tick 500 and selected

#### Scenario: Single selection and hint

- GIVEN multiple keyframes on visible lanes
- WHEN a second marker is clicked
- THEN only the new marker has `aria-pressed="true"`
- AND its keyframe hint is shown

#### Scenario: Dense same-tick stack

- GIVEN five keyframes at one tick on the same lane
- WHEN the lane renders
- THEN markers fan within the lane and remain individually selectable

#### Scenario: Lane label is not a seek target

- GIVEN a visible lane label
- WHEN the user clicks it
- THEN the playhead does not seek

#### Scenario: Presentation time converts once

- GIVEN `ticksPerSecond: 1000` and a user scrub to the 0.5-second ruler label
- WHEN the boundary conversion runs
- THEN `onSeekTick(500)` is called and only tick 500 is committed

#### Acceptance Criteria

- [ ] Empty tracks show an empty state
- [ ] Add creates a stable type-compatible keyframe on the selected track at an integer tick
- [ ] Only one keyframe has `aria-pressed="true"`
- [ ] Clicking a marker shows its keyframe hint
- [ ] Visible length comes only from explicit `sequence.durationTicks`
- [ ] Seconds, frames, and timecode remain derived labels over exact ticks
- [ ] Marker colors represent typed track/value category, not keyframe actions
- [ ] Pointer scrubbing and marker dragging preview exact ticks continuously
- [ ] Clicking an empty rail area seeks to its resolved exact tick
- [ ] Same-tick marker stacks remain inside their lane and selectable
- [ ] Lane ordering is deterministic from stable target identity
- [ ] Lane labels never trigger seek

---

### Requirement: Keyframe Drag Repositioning

Dragging a marker MUST preview and commit a new integer `keyframe.tick` within `[0, durationTicks]`. The visual indicator shows both the exact tick and selected presentation label. Drop reorders by tick while preserving stable keyframe identity. A move that would collide with a track rule or exceed duration is rejected or resolved by an explicit merge command; it MUST NOT create fractional time.

#### Scenario: Drag marker to new position

- GIVEN a keyframe at tick 500 in a 2000-tick sequence
- WHEN dragged to 75% of the rail
- THEN it retains its ID and commits tick 1500

#### Scenario: Visual feedback during drag

- GIVEN a marker is being dragged
- WHEN the pointer moves
- THEN the indicator shows candidate tick and the selected seconds/frame/timecode label

#### Acceptance Criteria

- [ ] Marker drag commits an in-range safe-integer tick
- [ ] Drag feedback shows exact tick plus derived time label
- [ ] Stable keyframe identity survives repositioning
- [ ] Out-of-range or invalid collisions do not commit fractional/invalid time

---

### Requirement: Timeline Playback

Playback controls live in the host shell's Animation toolbar, not inside TimelineEditor. When a sequence is open, Play/Pause and Reset act on that sequence by stable ID and exact tick.

Starting preview playback MUST NOT attach an `onComplete` callback from TimelineEditor; non-looping stop-at-end behavior belongs to the playback handle and host toolbar state.

| Control    | Icon         | Behavior                                                         |
| ---------- | ------------ | ---------------------------------------------------------------- |
| Play/Pause | Play / Pause | Starts exact-tick transport from playhead; toggles runtime pause |
| Reset      | RotateCcw    | Stops sequence playback and seeks canonical transport to tick 0  |

The playhead animates with the playback engine via `requestAnimationFrame`, but wall-clock deltas convert through the timebase and never enter canonical data. A non-looping sequence stops at `durationTicks`.

Before play or seek, preview resolution MUST start from the canonical base layers (definition/component/page/variables/bindings/state) and evaluate sequences at the requested tick. A captured DOM/style snapshot MAY optimize restoration, but it is runtime-only and cannot replace canonical resolution.

#### Scenario: Playback start

- GIVEN an open sequence with typed tracks
- WHEN playback starts through the host Animation toolbar
- THEN the selected sequence handle starts from the playhead tick without a TimelineEditor `onComplete` callback

#### Scenario: Reset

- GIVEN sequence preview at a nonzero tick
- WHEN Reset is clicked
- THEN playback stops and preview resolves at tick 0

#### Acceptance Criteria

- [ ] The host toolbar starts/pauses/resets the selected sequence by stable ID
- [ ] TimelineEditor starts preview without supplying an `onComplete` callback
- [ ] TimelineEditor renders no duplicate Play/Pause/Stop controls
- [ ] Reset seeks to tick 0
- [ ] Preview resolution does not accumulate prior DOM mutations

---

### Requirement: Timeline Bottom Panel

The wrapper MUST use `aria-hidden` when no sequence is being edited. When open, it renders TimelineEditor and closing calls `onClose`. Custom height and className props remain supported.

The panel is fixed at the viewport bottom with 16px side insets, slides with CSS transform, uses `pointer-events: none` while closed, and uses the specified surface background/top radii. A visible HeroUI close button appears in the header.

The header identifies the active sequence and owning document/component plus a concise target subtitle. The editor surfaces selected track, exact tick with presentation label, and preview state (`Playing`, `Paused`, or `Scrubbing`).

#### Scenario: Hidden when no sequence

- GIVEN no sequence is being edited
- WHEN the panel renders
- THEN the wrapper has `aria-hidden` and is translated off-screen with no pointer events

#### Scenario: Editor shown when sequence open

- GIVEN a sequence is being edited
- WHEN the panel renders with custom height/className
- THEN TimelineEditor is visible and those props are respected

#### Acceptance Criteria

- [ ] No active sequence produces `aria-hidden`
- [ ] An active sequence renders TimelineEditor with sequence owner, target, tick label, and preview state
- [ ] Closing clears runtime editing state and calls `onClose`
- [ ] Closed/open transitions use the specified transform, pointer-events, surface, radius, and side-inset behavior
- [ ] Custom height and className are respected

---

### Requirement: Timeline Editing Context

Runtime editing context starts with no sequence/track target and no preview snapshot. Opening stores stable owner/sequence/track IDs and may capture a resolved preview snapshot. Closing clears them. Using the hook outside its provider returns null. No editor context field is serialized.

#### Scenario: Open sets stable target

- GIVEN no sequence open
- WHEN `openSequence(ownerAddress, sequenceId, trackId)` is called
- THEN stable target IDs are stored and a resolved preview snapshot is captured

#### Scenario: Close clears runtime state

- GIVEN a sequence is open
- WHEN `closeSequence()` is called
- THEN owner/sequence/track IDs and preview snapshot are null

#### Scenario: Outside provider returns null

- GIVEN a component outside the provider
- WHEN it calls the context hook
- THEN the result is null

#### Acceptance Criteria

- [ ] Open stores stable canonical identities rather than element-local animation objects
- [ ] Close clears target and runtime snapshot
- [ ] Outside-provider access returns null

---

### Requirement: Lifecycle and State-Machine Authoring Sections

The authoring sections MUST edit canonical lifecycle and state-machine structures in the owning document. For component-owned sequences, sequence editing stays within the component definition; document lifecycle and state machines may reference only resolving allowed targets.

Lifecycle controls edit IN, HOLD/UPDATE, and OUT sequence/event references by stable ID. State-machine controls edit stable states/transitions, typed triggers, expression guards, unique safe-integer priorities, and optional transition sequence actions.

A friendly independent “modifier” toggle creates or edits a two-state machine (`inactive`/`active`) rather than a modifier binding. The UI MAY offer “create reverse exit”: this creates a separate canonical sequence with fresh IDs, reverses keyframe ticks/interpolation compatibly within explicit `durationTicks`, and assigns its ID to the deactivation transition. It does not serialize an in/out timeline pair.

Ordering remains predictable: lifecycle IN first, custom state machines alphabetically, lifecycle OUT last. State-machine transition order is display-only; semantic selection uses trigger/guard/priority.

#### Scenario: Lifecycle display

- GIVEN lifecycle IN references `seq-enter`
- WHEN the authoring section renders
- THEN it lists the resolving sequence and opens it by stable ID

#### Scenario: Add friendly independent toggle

- GIVEN an owning document and compatible sequence
- WHEN the user adds a `pulse` toggle with reverse exit
- THEN a two-state machine and separate activation/deactivation sequence actions are created with fresh stable IDs

#### Scenario: Ordering remains predictable

- GIVEN lifecycle and several custom state machines
- WHEN the section renders
- THEN lifecycle IN appears first, custom machine names sort alphabetically, and lifecycle OUT appears last

#### Acceptance Criteria

- [ ] Lifecycle controls edit stable sequence/event references
- [ ] State-machine controls edit typed triggers, guards, priorities, and sequence actions
- [ ] Friendly toggles compile to canonical two-state machines
- [ ] Reverse exit creates a separate valid sequence with fresh IDs and type-compatible reversed segments
- [ ] Removing a referenced sequence requires reference cleanup/reassignment in the same valid atomic command
- [ ] Lifecycle/custom/lifecycle ordering is predictable without affecting semantic transition priority

---

### Requirement: Property Editing Context for Keyframes

When a keyframe is selected, property panels edit only that keyframe's typed value and compatible outgoing interpolation. The track's `PropertyTarget` determines the property; keyframes do not contain multi-property bags. Without a keyframe selection, panels edit the canonical base property through normal commands.

#### Scenario: Keyframe-aware property edit

- GIVEN a keyframe on an opacity track is selected
- WHEN opacity is changed in the property panel
- THEN that keyframe's typed value changes and the element's base appearance remains unchanged

#### Acceptance Criteria

- [ ] Selected-keyframe edits preserve track/target value compatibility
- [ ] No selected keyframe routes edits to base canonical properties
- [ ] Keyframe editing cannot change target identity implicitly

---

### Requirement: Keyframe Deletion

Delete/Backspace and context menu delete the selected stable keyframe atomically and undoably. Deleting a track's final keyframe removes the empty track. An empty sequence is removed only when no lifecycle, page, child clip, state-machine, or component reference targets it; otherwise the user must reassign/remove references in the same command.

#### Scenario: Delete key removes selected keyframe

- GIVEN a selected keyframe
- WHEN Delete is pressed
- THEN the keyframe is removed

#### Scenario: Context menu delete

- GIVEN a selected keyframe
- WHEN “Delete Keyframe” is chosen
- THEN the keyframe is removed

#### Scenario: Last keyframe removes track

- GIVEN a track with one keyframe
- WHEN it is deleted
- THEN the track is removed and the owning sequence remains if still referenced or otherwise non-empty

#### Scenario: Undo restores deletion

- GIVEN a keyframe deletion was committed
- WHEN undo runs
- THEN the keyframe, stable ID, tick, typed value, and track relationship are restored

#### Acceptance Criteria

- [ ] Keyboard and context-menu deletion remove the selected keyframe
- [ ] Deleting the final keyframe removes its empty track
- [ ] Sequence deletion never leaves stale references
- [ ] Undo restores stable identities and references

---

### Requirement: Visual Easing Graph Editor

Selecting a segment between compatible keyframes opens an inline graph editor. Cubic-Bézier control points are draggable; named presets display read-only until converted to a typed editable Bézier; spring presets show overshoot/decay and edit typed stiffness/damping/mass when allowed. Preset chips map friendly labels (`linear`, `ease`, `ease-in`, `ease-out`, `ease-in-out`, `spring-gentle`, `spring-bouncy`, `spring-stiff`) to closed interpolation records. A preview dot follows normalized segment progress at the current exact tick.

#### Scenario: Open graph editor

- GIVEN two compatible keyframes with a segment
- WHEN the segment is selected
- THEN the graph opens below the ruler with the current typed curve

#### Scenario: Drag Bézier handles

- GIVEN an editable cubic-Bézier record
- WHEN a control handle is dragged
- THEN typed control points and the curve update in real time

#### Scenario: Apply preset

- GIVEN the graph editor is open
- WHEN `ease-in-out` is selected
- THEN its typed preset record and visualization apply immediately

#### Scenario: Spring and preview

- GIVEN a spring segment while playback/scrubbing advances
- WHEN the graph renders
- THEN overshoot/decay is visible and the preview dot follows normalized exact-tick progress

#### Acceptance Criteria

- [ ] Segment selection opens the graph for the track's closed interpolation variant
- [ ] Bézier handles commit typed control points
- [ ] Spring display/edits use typed parameters
- [ ] Incompatible interpolation choices are unavailable
- [ ] Preview follows exact-tick normalized segment progress
- [ ] Clicking outside or selecting another keyframe closes the graph

---

### Requirement: Per-Property Track Lanes

The expanded view shows one lane per canonical property track, grouped for display by target schema category such as Geometry, Appearance, or Typography. Examples use schema-approved targets (exact transform/bounds pointers, appearance opacity/fill-layer pointers, and text run-property pointers), not generic `x`, `backgroundColor`, or `fontSize` bags.

Double-clicking a lane creates/updates a keyframe on that track at the resolved tick. Dragging a marker changes only that keyframe's tick; it never moves one property out of a multi-property keyframe because each track already owns one typed property. The collapsed overview combines markers visually without changing the underlying track model. Only one element target group expands at a time.

#### Scenario: Add keyframe to one track

- GIVEN an appearance-opacity track
- WHEN the user double-clicks its lane at tick 500
- THEN a type-compatible opacity keyframe is created or updated at tick 500

#### Scenario: Drag one track marker

- GIVEN opacity and exact-transform tracks each have a keyframe at tick 300
- WHEN only the opacity marker is dragged to tick 600
- THEN opacity moves to tick 600 while the transform keyframe remains at tick 300

#### Scenario: Collapse overview

- GIVEN track lanes are expanded
- WHEN the user collapses them
- THEN markers combine into the overview without changing canonical tracks/keyframes

#### Scenario: Property categories

- GIVEN tracks targeting geometry transform, appearance opacity, and a text run size
- WHEN expanded
- THEN lanes group under Geometry, Appearance, and Typography

#### Acceptance Criteria

- [ ] Expanded lanes correspond one-to-one with stable canonical tracks
- [ ] Lane double-click creates a keyframe only on that track
- [ ] Marker drag preserves track and keyframe identity while changing exact tick
- [ ] Display categories derive from schema-approved property targets
- [ ] Collapsing changes presentation only
- [ ] Only one element target group expands at a time

---

## Spec Gaps

- [ ] Keyframe deletion interaction requires component tests.
- [ ] Easing graph interactions require component tests.
- [ ] Per-property lane expansion and exact-tick drag require component tests.
- [ ] Frame-number and timecode ruler label modes (spec MAY) are not yet implemented; labels render seconds only.
- [ ] Marker pointer-drag repositioning is unit-tested at the widget level; a Playwright CT for the drag gesture remains open.
- [ ] Per-property lane grouping (Geometry/Appearance/Typography accordion, double-click-to-add on a lane, one-group-expands) is not yet implemented; lanes render flat (one lane per track, deterministic order) and keyframe creation goes through the add button.
- [ ] Transition guard-expression editing and per-transition sequence-action editing have command-layer support but no dedicated editing UI yet; the `StateMachineEditor` (wired into the demo's animation sidebar) edits states, transition target/trigger/priority, and reverse-exit wiring to the deactivation transition, but not guard expressions or per-transition sequence actions.

---

## Non-Goals

- Property panels → see [panels.md](panels.md)
- Modal dialogs → see [modals.md](modals.md)
- Toolbar and navigation → see [toolbar-nav.md](toolbar-nav.md)
- Timeline zoom or horizontal scroll—the full explicit sequence duration is visible
- Playback speed control in this UI—runtime playback defaults to 1×
