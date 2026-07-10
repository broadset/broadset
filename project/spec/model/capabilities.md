# Model — Derived Element Capabilities

## Purpose

Defines deterministic editor capability profiles derived from canonical v1 element discriminants and typed payloads. Capability profiles are runtime presentation policy and are never persisted.

## Requirements

### Requirement: Capability Derivation

Every element resolves a profile containing booleans for geometry editing, appearance editing, typography, media fitting, vector geometry editing, structured-path editing, clip authoring, component-property editing, live-data binding, and timeline targeting. Derivation MUST inspect `kind` and, for `vector`, `geometryData.kind`.

#### Acceptance Criteria

- [ ] Given the same validated element, every editor surface derives the same profile
- [ ] Given a capability profile, project serialization contains none of its booleans
- [ ] Given an unknown plugin payload, only explicitly registered sandboxed plugin capabilities are enabled

### Requirement: Vector Subtype Capabilities

Rectangle, ellipse, path, and boolean shapes are `kind: 'vector'` payload variants, not top-level element kinds. Rectangle vectors enable corner geometry; ellipse vectors enable ellipse geometry; structured-path vectors enable point and segment editing; boolean vectors expose operand and operation editing. All vector variants enable typed appearance and clip-source use.

#### Acceptance Criteria

- [ ] Given `kind: 'vector'` with `geometryData.kind: 'rectangle'`, rectangle geometry controls are enabled
- [ ] Given `kind: 'vector'` with `geometryData.kind: 'path'`, structured-path editing is enabled
- [ ] Given a vector subtype mismatch, controls for another subtype remain unavailable

### Requirement: Text Capabilities

Text elements enable structured text, paragraph/run typography, text layout, appearance, data binding, and timeline targeting. Text-path controls are enabled only when a valid vector reference can be authored.

#### Acceptance Criteria

- [ ] Given `kind: 'text'`, structured typography controls are enabled
- [ ] Given no valid vector target, text-path selection cannot commit
- [ ] Given text animation targeting, only schema-approved text properties are offered

### Requirement: Media Capabilities

Image and video elements enable asset selection, fit/crop/focal-point editing, appearance, clip authoring, binding, and timeline targeting. Audio elements enable asset, routing, cue, binding, and timeline controls without visual fit controls.

#### Acceptance Criteria

- [ ] Given an image or video element, fit controls edit its typed media payload
- [ ] Given an audio element, visual crop controls are unavailable
- [ ] Given an incompatible asset kind, selection cannot commit

### Requirement: Group and Component Capabilities

Group elements enable hierarchy, appearance, clip authoring, binding, and timeline targeting. Component-instance elements enable exposed-property editing and instance navigation; definition-internal generic property paths are not exposed as ordinary instance controls.

#### Acceptance Criteria

- [ ] Given a group, hierarchy controls preserve canonical preorder
- [ ] Given a component instance, exposed properties are addressed by stable property ID
- [ ] Given an unexposed internal component property, ordinary instance editing cannot target it

### Requirement: Specialized Core Capabilities

Clock, ticker, and QR-code elements expose their typed payload controls, appearance, binding, and compatible timeline targets. Foreign elements expose source/preview diagnostics and safe fallback actions. Plugin elements expose only core envelope controls plus authorized plugin-provided controls.

#### Acceptance Criteria

- [ ] Given a QR-code element, QR payload controls are available without generic content editing
- [ ] Given a foreign element, source markup is not offered for executable editing
- [ ] Given a plugin element without its plugin, inert payload and preview remain inspectable

### Requirement: Typed Clip Authoring

The editor capability historically labeled `clipPath` means permission to author `appearance.clip` through typed vector references. It MUST NOT enable raw CSS clip strings, arbitrary SVG markup, or legacy screen/style clip fields.

#### Acceptance Criteria

- [ ] Given clip authoring on an eligible element, the committed value is a typed clip definition
- [ ] Given raw CSS clip text, no canonical mutation is produced
- [ ] Given a clip source of the wrong entity kind, semantic validation fails

### Requirement: Capability Use

Capability profiles control UI visibility and command availability only. Commands MUST still validate the resulting canonical project atomically; hiding a control is not a validation mechanism.

#### Acceptance Criteria

- [ ] Given a disabled capability, its ordinary UI command is unavailable
- [ ] Given a forged command, model validation still rejects invalid canonical state
- [ ] Given a host restriction, capabilities may be reduced but not expanded past schema legality

## Spec Gaps

- Exact runtime flag names and plugin capability negotiation are finalized during editor/UI cutover.

## Non-Goals

- Persisting capability flags
- Treating vector geometry subtypes as element discriminants
- Using capabilities to bypass structural or semantic validation
