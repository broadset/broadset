# UI — Canonical v1 Panels

## Purpose

Defines accessible HeroUI property, hierarchy, animation, data, component, clip/mask, and preflight panels for canonical v1 projects.

## Requirements

### Requirement: Capability-Driven Property Panels

The properties sidebar MUST derive sections from the selected canonical element `kind`, vector geometry subtype, schema-approved targets, and host restrictions. It MUST NOT infer a legacy element kind or expose fields rejected by strict v1 validation. With no selection, it shows a clear empty state.

#### Acceptance Criteria

- [ ] Given a vector rectangle, vector geometry and appearance sections are shown
- [ ] Given a vector path, structured-path controls are shown without a top-level path kind
- [ ] Given no selection, the panel prompts the user to select an element
- [ ] Given a field that is not valid for the variant, no control for it is rendered

### Requirement: HeroUI and Accessibility

Panels MUST use HeroUI Accordion, Tabs, Input, Select, Switch, Button, Modal, and related components for available UI chrome. Every control has an accessible name, keyboard operation, visible focus, typed validation feedback, and no layout shift when sections appear.

#### Acceptance Criteria

- [ ] Given keyboard-only navigation, every panel control can be reached and operated
- [ ] Given invalid input, the HeroUI control reports a specific error and no mutation commits
- [ ] Given a section expands, surrounding layout remains stable

### Requirement: Geometry Panel

Geometry controls MUST edit positive bounds, three-value origin, and an exact affine or 3D matrix. Decomposed translation, rotation, scale, and skew controls MAY be presented when stable, but MUST derive from and commit back to the canonical matrix without persisting duplicated decomposition.

#### Acceptance Criteria

- [ ] Given a stable affine transform, friendly controls display its derived decomposition
- [ ] Given a transform edit, one exact matrix is committed
- [ ] Given an unstable decomposition, raw matrix controls remain available without overwriting it

### Requirement: Appearance Panel

Appearance UI MUST edit opacity, blend mode, isolation, ordered fills, strokes, effects, typed clip, and typed mask. Layer controls address stable IDs and support enabled state and reorder through stable anchors. Paint editors create typed solid, gradient, pattern, or picture values.

#### Acceptance Criteria

- [ ] Given multiple fill layers, reorder preserves stable IDs and commits semantic array order
- [ ] Given a wide-gamut color, its declared space and authoritative channels remain visible and editable
- [ ] Given an unsupported effect for an output profile, the panel preserves it and preflight reports the output limitation

### Requirement: Typed Clip and Mask Panel

The clip/mask section appears only when derived capabilities allow it. It selects or creates compatible vector clip sources, alpha/luminance asset masks, or component-local vector paths. Presets create typed rectangle, ellipse, or structured-path vector geometry. Custom point editing addresses stable structured-path point IDs.

The panel MUST NOT offer raw CSS clip input, arbitrary SVG markup, or fields outside `appearance.clip` and `appearance.mask`.

#### Acceptance Criteria

- [ ] Given no clip, selecting rectangle creates a typed vector source and reference atomically
- [ ] Given a structured-path clip, the panel opens stable point editing
- [ ] Given mask mode, alpha or luminance is explicit and the referenced asset kind is validated
- [ ] Given pasted CSS clip text, the panel reports unsupported input and commits nothing
- [ ] Given None, the typed reference and any unreferenced dedicated source are removed atomically

### Requirement: Structured Text Panel

Text panels MUST edit paragraphs and runs through stable IDs and typed properties: font resources, size, color, features, axes, language, direction, decoration, spacing, alignment, lists, tabs, hyphenation, and keep rules. The UI MUST NOT expose authored HTML as text state.

#### Acceptance Criteria

- [ ] Given a run selection, formatting commits typed run properties
- [ ] Given a paragraph selection, paragraph controls edit only those stable paragraph IDs
- [ ] Given a missing font resource, the panel shows the resource diagnostic and fallback status

### Requirement: Vector Geometry Panel

The vector panel MUST branch on `geometryData.kind`. Rectangle controls edit typed corner radii; ellipse controls edit ellipse geometry; path controls edit structured points, segments, and fill rule; boolean controls edit operation and stable operand IDs. Stroke and fill remain appearance layers.

#### Acceptance Criteria

- [ ] Given a vector path, point/segment controls edit structured geometry rather than an SVG string
- [ ] Given a vector rectangle, corner controls do not appear for other vector subtypes
- [ ] Given a boolean vector, missing or cyclic operands show semantic diagnostics

### Requirement: Media and Specialized Payload Panels

Image, video, and audio panels select compatible project assets. Image/video controls edit typed fit, crop, and focal point where applicable. Clock, ticker, and QR-code panels edit their typed payload fields. URLs and encoded JSON strings are not generic element content.

#### Acceptance Criteria

- [ ] Given image selection, the panel writes a compatible image `assetId`
- [ ] Given a ticker item source, the panel edits typed configuration or a binding
- [ ] Given a QR-code value, validation applies the QR payload schema before commit

### Requirement: Component Instance Panel

Component-instance panels show the definition identity, nested instance path, and exposed properties grouped and labeled by their schemas. Reset removes the sparse instance value so the definition default becomes effective. Unexposed internal paths are not ordinary controls.

#### Acceptance Criteria

- [ ] Given an exposed property, its typed control validates before commit
- [ ] Given Reset, the sparse value is removed and provenance returns to the definition
- [ ] Given an internal unexposed property, no direct instance control is shown

### Requirement: Data and Binding Panels

View-model panels edit stable fields, recursive schemas, defaults, samples, and stale policies. Binding panels build closed expression ASTs, deterministic formatter pipelines, type-compatible fallbacks, and stable property targets. They MUST NOT accept arbitrary script or expression text.

#### Acceptance Criteria

- [ ] Given a type-correct binding, the panel previews its deterministic result and target
- [ ] Given an invalid expression operand or formatter, the panel blocks commit with a typed diagnostic
- [ ] Given a stale policy, its keep/default/hide/error behavior is explicit

### Requirement: Exact Animation and State Panels

Timeline panels derive frames and display time from rational timebase and store integer ticks. Track and keyframe controls address stable IDs and type-compatible property targets. State panels enforce resolving states, typed guards, and unique same-source/same-trigger transition priorities.

#### Acceptance Criteria

- [ ] Given a frame selection at 30000/1001, the exact integer tick is shown and committed
- [ ] Given a stale track target, the panel displays the diagnostic and blocks commit
- [ ] Given equal priorities for the same source and trigger, the panel requires a unique priority before commit

### Requirement: Layers Panel

The layers panel displays document definitions and the active page's instance graph using stable IDs and composite instance paths. Reorder and reparent operations preserve canonical depth-first preorder and subtree contiguity. Component descendants show definition/instance provenance.

#### Acceptance Criteria

- [ ] Given repeated page roots, both appear with independent page-instance identity
- [ ] Given subtree reorder, all descendants move contiguously
- [ ] Given a resolved component descendant, the panel identifies its instance path and definition source

### Requirement: Preflight Panel

Preflight MUST present structured diagnostics by severity, entity address, explanation, affected output profiles, and safe remediation. It distinguishes editability, appearance fidelity, missing resources, and intentional export loss. Success appears only when no applicable issue exists.

#### Acceptance Criteria

- [ ] Given no applicable diagnostics, a success state is shown
- [ ] Given diagnostics, every issue is rendered and success is absent
- [ ] Given an intentional output loss, affected entities and profiles are identified

## Spec Gaps

- Exact panel layout and interaction tests are finalized during application cutover while preserving these canonical mutations.

## Non-Goals

- Persisting panel, tab, expansion, or selection state
- Editing legacy element aliases, raw CSS clips, authored HTML, or millisecond keyframes
- Executing plugin or foreign payloads in the panel process
