# Editor — Path Geometry Specification

## Purpose

Defines editor-side path geometry contracts for parsing and serializing path command strings, extracting editable handle points, and refitting element bounds after path edits. This scope covers observable path-editing data transformations and geometry outcomes, not rendering internals or playback behavior. See [conventions](../../README.md).

---

## Requirements

### Requirement: Path Command Parsing

The system MUST parse supported path commands into deterministic segment sequences, including implicit repeated coordinate groups and relative/absolute command forms.

#### Scenario: Supported command families parse into expected segments

- GIVEN path strings containing line, curve, arc, horizontal/vertical, and close commands
- WHEN parsed
- THEN the resulting segments preserve command intent and coordinate ordering

#### Scenario: Implicit repeated coordinates are normalized

- GIVEN path strings with implicit repeated coordinate groups
- WHEN parsed
- THEN each implicit coordinate group is represented as an explicit segment

#### Scenario: Empty path input yields no segments

- GIVEN an empty path string
- WHEN parsed
- THEN the parsed segment list is empty

#### Acceptance Criteria

- [ ] Given path strings containing line, curve, arc, horizontal/vertical, and close commands, the resulting segments preserve command intent and coordinate ordering
- [ ] Given path strings with implicit repeated coordinate groups, each implicit coordinate group is represented as an explicit segment
- [ ] Given an empty path string, the parsed segment list is empty

---

### Requirement: Path Serialization Stability

The system MUST serialize parsed segments into stable path strings and round coordinate values consistently.

#### Scenario: Basic parse/serialize round-trip is stable

- GIVEN a valid path string
- WHEN it is parsed and then serialized
- THEN the serialized output preserves the expected path structure

#### Scenario: Serialized coordinates are rounded consistently

- GIVEN segment values with higher precision decimals
- WHEN serialized
- THEN coordinates are rounded consistently to editor precision

#### Acceptance Criteria

- [ ] Given a valid path string, the serialized output preserves the expected path structure
- [ ] Given segment values with higher precision decimals, coordinates are rounded consistently to editor precision

---

### Requirement: Editable Handle Extraction

The system MUST expose editable handle points classified as either `anchor` (on-curve) or `control` (off-curve tangent) handles. Each handle MUST reference its parent segment and the coordinate indices it controls. Handle behavior by command type:

- **Move/Line (M, L, T):** One `anchor` handle per endpoint with X and Y indices.
- **Cubic Bézier (C):** Two `control` handles for the control points, plus one `anchor` handle for the endpoint. All three have X and Y indices.
- **Smooth Cubic (S):** One `control` handle plus one `anchor` handle.
- **Quadratic (Q):** One `control` handle plus one `anchor` handle.
- **Horizontal (H):** One `anchor` handle with X index only; Y is constrained (index = -1).
- **Vertical (V):** One `anchor` handle with Y index only; X is constrained (index = -1).
- **Arc (A):** One `anchor` handle for the endpoint coordinates.
- **Close (Z):** No handles emitted.

#### Scenario: Cubic Bézier extracts three handles

- GIVEN a cubic Bézier segment (C command) with 6 coordinate values
- WHEN handles are extracted
- THEN two `control` handles and one `anchor` handle are returned with correct positions

#### Scenario: Horizontal command constrains Y axis

- GIVEN a horizontal line segment (H command)
- WHEN handles are extracted
- THEN one `anchor` handle is returned with Y index = -1 (constrained)

#### Scenario: Line segment extracts one anchor

- GIVEN a line segment (L command)
- WHEN handles are extracted
- THEN one `anchor` handle is returned with both X and Y indices

#### Acceptance Criteria

- [ ] Given a cubic Bézier segment, two control handles and one anchor handle are extracted
- [ ] Given a horizontal command, the handle constrains Y axis (index = -1)
- [ ] Given a vertical command, the handle constrains X axis (index = -1)
- [ ] Given a line or move command, one anchor handle with both axes is extracted
- [ ] Given a close (Z) command, no handles are emitted

---

### Requirement: Path Bounds Refit

The system MUST refit edited path elements to tight bounds with stroke padding and rebase path coordinates to the updated element origin.

#### Scenario: Refit computes padded bounds for edited path coordinates

- GIVEN an edited path with drawable coordinates
- WHEN bounds are refit
- THEN updated position, width, and height include stroke padding

#### Scenario: Refit rebases coordinates to updated origin

- GIVEN an edited path whose minimum bounds shift
- WHEN bounds are refit
- THEN path coordinates are rebased relative to the new origin

#### Scenario: Empty path updates do not mutate geometry

- GIVEN an empty path payload
- WHEN bounds are refit
- THEN content updates without geometry changes

#### Acceptance Criteria

- [ ] Given an edited path with drawable coordinates, updated position, width, and height include stroke padding
- [ ] Given an edited path whose minimum bounds shift, path coordinates are rebased relative to the new origin
- [ ] Given an empty path payload, content updates without geometry changes

---

### Requirement: Tight SVG Bounding-Box Refit

When a tight SVG bounding box is available, the system MUST support refitting geometry from that box and preserve coordinate rebasing behavior.

#### Scenario: SVG-provided bounds produce tight geometry updates

- GIVEN a provided tight bounding box for a curve path
- WHEN SVG-based refit is applied
- THEN resulting geometry reflects the tight bounds

#### Scenario: SVG-based refit rebases coordinates to updated origin

- GIVEN a path and a shifted SVG bounding box
- WHEN SVG-based refit is applied
- THEN output path coordinates are rebased to the new element origin

#### Acceptance Criteria

- [ ] Given a provided tight bounding box for a curve path, resulting geometry reflects the tight bounds
- [ ] Given a path and a shifted SVG bounding box, output path coordinates are rebased to the new element origin

---

### Requirement: Palette Persistence

The system MUST support deterministic palette add/remove behavior, duplicate handling, and persistence/restore across editor lifecycle boundaries.

#### Scenario: Palette updates persist and restore

- GIVEN palette updates including adds, removes, and duplicate candidates
- WHEN palette persistence lifecycle is exercised
- THEN persisted palette content restores with deterministic duplicate handling

#### Acceptance Criteria

- [ ] Given palette updates including adds, removes, and duplicate candidates, persisted palette content restores with deterministic duplicate handling

---

### Requirement: Alignment and Distribution Contracts

The system MUST align selected elements to shared alignment anchors and distribute selected elements with deterministic spacing.

#### Scenario: Alignment produces expected shared anchors

- GIVEN multiple selected elements
- WHEN alignment is applied for left/right/center/top/bottom
- THEN resulting positions share the expected alignment anchor

#### Scenario: Distribution produces deterministic spacing

- GIVEN multiple selected elements
- WHEN horizontal or vertical distribution is applied
- THEN resulting gaps are deterministic for the selected axis

#### Acceptance Criteria

- [ ] Given multiple selected elements, resulting positions share the expected alignment anchor
- [ ] Given multiple selected elements, resulting gaps are deterministic for the selected axis

---

### Requirement: Clipboard Payload Contracts

The system MUST preserve copied selection payload fidelity and remap identities on paste while preserving relative placement semantics.

#### Scenario: Paste remaps identities and preserves relative placement

- GIVEN copied element selection payload
- WHEN pasted into a document
- THEN pasted elements receive remapped identities and preserve relative placement

#### Acceptance Criteria

- [ ] Given copied element selection payload, pasted elements receive remapped identities and preserve relative placement

---

### Requirement: Resize-Handle Geometry

The system MUST expose deterministic edge/corner handle positions and honor applicable geometric constraints for constrained element kinds.

#### Scenario: Edge and corner handles are positioned deterministically

- GIVEN an element bounding box
- WHEN resize handles are computed
- THEN edge and corner handles appear at deterministic geometric positions

#### Acceptance Criteria

- [ ] Given an element bounding box, edge and corner handles appear at deterministic geometric positions

---

### Requirement: Shortcut Dispatch Semantics

The system MUST provide deterministic shortcut registration and dispatch precedence, including predictable conflict handling for duplicate bindings.

#### Scenario: Duplicate shortcut bindings resolve deterministically

- GIVEN duplicate shortcut bindings
- WHEN dispatch is triggered
- THEN the selected handler follows deterministic precedence rules

#### Acceptance Criteria

- [ ] Given duplicate shortcut bindings, the selected handler follows deterministic precedence rules

---

### Requirement: Smart-Guide Snapping

The system MUST apply deterministic snapping based on snap thresholds, candidate-guide evaluation, and guide precedence.

#### Scenario: Snapping chooses guides by threshold and precedence

- GIVEN multiple candidate guides within snapping thresholds
- WHEN snapping is evaluated
- THEN the resulting snap follows deterministic guide precedence

#### Acceptance Criteria

- [ ] Given multiple candidate guides within snapping thresholds, the resulting snap follows deterministic guide precedence

---

### Requirement: Debug Snapshot Determinism

The system MUST produce debug snapshots with stable shape, complete expected fields, and deterministic serialization for equivalent editor states.

#### Scenario: Equivalent states produce deterministic snapshots

- GIVEN equivalent editor states
- WHEN debug snapshots are generated
- THEN snapshot structure and serialized representation are deterministic

#### Acceptance Criteria

- [ ] Given equivalent editor states, snapshot structure and serialized representation are deterministic

---

### Requirement: Path Editor Session Lifecycle

The system MUST support creating an interactive path editor session from an SVG path element. The session MUST render draggable anchor and control-point handles as an SVG overlay. Dragging handles MUST emit updated path `d` attribute strings via a callback. The session MUST be explicitly destroyable, removing the overlay and detaching all event listeners.

#### Scenario: Create and destroy session

- GIVEN an SVG path element with a valid `d` attribute
- WHEN a path editor session is created
- THEN interactive handles overlay the path, and destroying the session removes all overlays and listeners

#### Scenario: Handle drag emits updated path

- GIVEN an active path editor session
- WHEN an anchor handle is dragged to a new position
- THEN the change callback fires with the updated `d` attribute string

#### Scenario: Current path data retrieval

- GIVEN an active path editor session
- WHEN the current path data is requested
- THEN the current `d` attribute string is returned reflecting any edits

#### Acceptance Criteria

- [ ] Given an SVG path element, a session creates interactive handles as an SVG overlay
- [ ] Given handle drag, the change callback fires with the updated path data
- [ ] Given an active session, current path data is retrievable
- [ ] Given session destruction, all overlays and event listeners are removed

---

### Requirement: Immutable Document Element Update

The system MUST support immutably updating a single element within a document page by ID. The update MUST produce a new page array with only the targeted element changed. If the element ID is not found on the target page, the pages MUST be returned unchanged.

#### Scenario: Update existing element

- GIVEN a document page containing element "e1"
- WHEN an immutable update is applied to "e1"
- THEN a new page array is returned with "e1" updated and all other elements unchanged

#### Scenario: Element not found

- GIVEN a document page that does not contain element "e99"
- WHEN an immutable update is applied to "e99"
- THEN the original pages are returned unchanged

#### Acceptance Criteria

- [ ] Given an existing element ID, the update produces a new page array with only that element changed
- [ ] Given a non-existent element ID, the original pages are returned unchanged

---

### Requirement: Descendant Collection

The system MUST recursively collect all descendant element IDs for a given parent element. The collection MUST follow the `parentId` hierarchy and avoid infinite loops for cyclic references.

#### Scenario: Collect group descendants

- GIVEN a group element "g1" with children "c1" and "c2", where "c1" has child "c1a"
- WHEN descendants of "g1" are collected
- THEN the result contains "c1", "c2", and "c1a"

#### Scenario: No descendants

- GIVEN a leaf element "leaf1" with no children
- WHEN descendants of "leaf1" are collected
- THEN the result is empty

#### Acceptance Criteria

- [ ] Given a parent element, all descendants are recursively collected following parentId links
- [ ] Given a leaf element, the descendant set is empty

---

## Spec Gaps

_None — all requirements have acceptance criteria._

---

## Non-Goals

- Path editing mode lifecycle and placement mode behavior → see [editing.md](editing.md)
- Animation state and timeline mutation behavior → see [animation-state.md](animation-state.md)
- Renderer-side path and SVG drawing behavior → see `project/spec/renderer/spec.md`
