# Editor — Canonical v1 Editing

## Purpose

Defines interactive authoring commands for canonical v1 elements, structured paths and text, typed clips, component instances, data, and exact animation. Editing commands never create legacy aliases or partially valid project state.

## Requirements

### Requirement: Atomic Validated Commands

Every editor command MUST target stable IDs, produce one atomic change batch, and leave the whole `BroadsetProjectV1` structurally and semantically valid. Ephemeral preview MAY exist in editor state, but commit MUST validate the complete candidate batch before mutation.

#### Acceptance Criteria

- [ ] Given a valid edit, one atomic batch commits and undo restores the exact prior project
- [ ] Given any invalid operation or failed precondition, no part of the batch becomes visible
- [ ] Given pointer movement during an interaction, ephemeral preview is excluded from canonical serialization

### Requirement: Mutually Exclusive Editing Modes

The editor MUST have one discriminated editing mode: none, placement, structured-path drawing, structured-path point editing, typed-clip editing, inline structured-text editing, or motion-path editing. Selecting another entity, pressing Escape, or starting another mode exits the current mode according to its explicit commit/cancel behavior.

#### Acceptance Criteria

- [ ] Given one active editing mode, starting another exits the first before activating the second
- [ ] Given selection changes away from the edited entity, the mode exits deterministically
- [ ] Given Escape during an uncommitted interaction, ephemeral changes are discarded

### Requirement: Canonical Element Placement

Placement tools MAY use friendly tool IDs, but MUST create canonical variants:

- rectangle, ellipse, path, and boolean tools create `kind: 'vector'` with matching `geometryData.kind`;
- text, image, group, video, audio, clock, ticker, and qrcode tools create their matching core variants;
- component tools create `component-instance` elements;
- plugin tools create `plugin` elements with registered inert payload defaults.

Two-click tools define bounds from opposite corners. Ellipse placement MAY use center, radii, and rotation. Path placement creates a structured path with stable point and segment IDs. Zero-area placement MUST NOT commit.

#### Acceptance Criteria

- [ ] Given rectangle placement from (50,30) to (110,70), a vector rectangle with 60×40 bounds and exact transform is created
- [ ] Given path placement, the first point and each later segment receive stable IDs
- [ ] Given coincident extent points, no element is created and placement remains active
- [ ] Given plugin placement, canonical `kind: 'plugin'` payload matches the registered schema

### Requirement: Structured Path Drawing

Path drawing operates on `kind: 'vector'` with `geometryData.kind: 'path'`. Each click creates or updates typed commands, points, and segments in element-local coordinates with stable identity. Closing a path updates typed path closure; no SVG `d` string is persisted.

Bounds refitting MUST preserve world geometry by atomically rebasing local structured coordinates and the element matrix. Point coordinates remain finite and use the document surface unit.

#### Acceptance Criteria

- [ ] Given the first click, a stable move point is created in structured geometry
- [ ] Given later clicks, stable line or curve segments are appended in order
- [ ] Given Enter, the path closes through typed geometry and exits drawing mode
- [ ] Given a bounds refit, resolved world geometry is unchanged

### Requirement: Structured Path Point Editing

Point editing renders derived SVG overlay handles but mutates only structured path points and segments addressed by stable ID. Dragging is ephemeral until pointer release commits one atomic batch. Inserting or deleting points preserves remaining identity and validates minimum geometry requirements.

#### Acceptance Criteria

- [ ] Given a point drag, preview updates continuously and pointer release commits one change
- [ ] Given point insertion, existing point and segment IDs remain stable
- [ ] Given deletion that would invalidate the path, the command is rejected without mutation
- [ ] Given zoom, overlay handles remain usable without changing project geometry

### Requirement: Typed Clip Editing

Clip editing is available only when derived capabilities allow `appearance.clip`. The clip value MUST reference compatible typed vector geometry. If an eligible element has no clip, starting edit creates a dedicated vector clip source with a non-rendering appearance and positive bounds, assigns fresh stable IDs, and attaches a typed clip reference in one atomic batch.

Preset commands materialize typed rectangle, ellipse, or structured-path geometry. Custom editing delegates to structured-path point editing by stable point ID. Raw CSS clip text, arbitrary SVG markup, and legacy screen/style clip fields MUST NOT be accepted.

#### Acceptance Criteria

- [ ] Given an eligible element without a clip, one atomic command creates a rectangular vector source and typed clip reference
- [ ] Given an ellipse preset, the referenced source uses `geometryData.kind: 'ellipse'`
- [ ] Given a point edit, the structured clip-source geometry updates by stable point ID
- [ ] Given raw CSS clip input or a wrong-kind source, no canonical mutation is committed
- [ ] Given clip removal, only the typed reference and an unreferenced dedicated source are removed atomically

### Requirement: Structured Inline Text Editing

Inline editing operates on text paragraphs and runs. Text insertion, deletion, splitting, joining, and formatting preserve stable paragraph/run identity where the logical entity survives. Formatting writes typed run properties; authored HTML and `contenteditable` markup are transport-only UI details and MUST NOT enter the project.

#### Acceptance Criteria

- [ ] Given text insertion within a run, its stable run ID is preserved
- [ ] Given a paragraph split, new entities receive fresh IDs and unaffected entities retain theirs
- [ ] Given bold, color, or size formatting, typed run properties are committed
- [ ] Given pasted HTML, sanitization extracts inert Unicode and supported typed formatting before commit

### Requirement: Geometry and Appearance Editing

Geometry controls edit positive bounds, origin, and exact affine or 3D matrix values. Appearance controls edit ordered stable fill, stroke, and effect layers, typed paints, opacity, blend, isolation, clip, and mask. Reordering uses stable anchors; controls never write CSS strings as canonical values.

#### Acceptance Criteria

- [ ] Given a transform edit, the exact canonical matrix is updated without duplicated decomposed state
- [ ] Given appearance-layer reorder, stable layer IDs are preserved
- [ ] Given an invalid non-finite value or incompatible paint, the command is rejected

### Requirement: Component Editing

Creating a component writes a document-owned definition. Instances address the definition and exposed-property IDs only. Definition edits propagate through sparse resolution. Unlink materializes the resolved instance as ordinary elements with fresh IDs in one atomic transaction.

#### Acceptance Criteria

- [ ] Given component creation, masters are not hidden document elements
- [ ] Given an exposed-property edit, only the instance property value is changed
- [ ] Given unlink, resolved visual semantics remain equivalent and no component dependency remains

### Requirement: Data and Exact Animation Editing

View-model fields, bindings, state transitions, sequences, tracks, and keyframes are edited through stable IDs and typed values. Timeline positions are non-negative safe-integer ticks derived from the document timebase. Commands MUST reject stale targets, incompatible values, expression errors, and transition priority conflicts.

#### Acceptance Criteria

- [ ] Given keyframe creation at a displayed frame, the exact corresponding tick is stored
- [ ] Given a stale property target, the edit is rejected before commit
- [ ] Given two same-source, same-trigger transitions with equal priority, the edit is rejected

### Requirement: Delete and Reorder Integrity

Delete, reparent, and reorder commands MUST account for hierarchy descendants and every cross-reference. A command either updates or removes all affected references according to an explicit user action, or rejects with diagnostics. Canonical preorder and subtree contiguity are restored in the same batch.

#### Acceptance Criteria

- [ ] Given reparenting, the moved subtree remains contiguous and descendants retain identity
- [ ] Given deletion of a referenced entity without an explicit reference-removal action, the command is rejected
- [ ] Given stable-anchor reorder, concurrent index changes do not retarget another entity

### Requirement: Security and Plugin Boundary

Editing MUST keep text inert, expressions closed, foreign content non-executable, and plugin payloads sandboxed. Asset URLs are not fetched as a side effect of editing model fields. Plugin commands pass the same atomic structural and semantic validation as core commands.

#### Acceptance Criteria

- [ ] Given foreign markup, the editor shows safe preview and diagnostics without DOM injection
- [ ] Given plugin output, invalid core envelope or references reject the entire command
- [ ] Given an external URL assignment, no network request occurs until an authorized fetch action

## Spec Gaps

- Gesture-specific pointer thresholds and exact editor API names are finalized during application cutover without changing these canonical mutations.

## Non-Goals

- Persisting editing modes, selection, overlays, or derived handles
- Compatibility editing of legacy element, text, clip, component, or animation fields
- Defining renderer DOM structure
