# Model — Element Data Contract

## Purpose

Defines the closed element union, stable hierarchy, exact geometry, typed media payloads, structured text, and safe external or plugin fallback.

## Requirements

### Requirement: Closed Element Union

An element MUST be exactly one of `text`, `image`, `vector`, `group`, `component-instance`, `video`, `audio`, `clock`, `ticker`, `qrcode`, `foreign`, or `plugin`. Each core kind uses a strict discriminated payload. Plugins use only the explicit `plugin` variant; arbitrary kind strings cannot select core behavior.

#### Acceptance Criteria

- [ ] Given every core discriminant with its matching payload, structural validation succeeds
- [ ] Given an unknown core discriminant or mismatched payload, structural validation fails
- [ ] Given third-party element data, it is represented by the explicit plugin or foreign variant

### Requirement: Element Base

Every element MUST contain stable `id`, `kind`, `name`, `parentId`, `locked`, `hiddenInEditor`, `geometry`, `appearance`, `sharedStyleIds`, and `extensions`. It MAY contain typed accessibility metadata. IDs MUST be non-empty and unique in their document or component-local scope.

Selection grouping is editor state. Structural grouping uses actual group elements.

#### Acceptance Criteria

- [ ] Given a uniquely identified element with every base field, validation proceeds to its variant payload
- [ ] Given duplicate or empty IDs, validation fails
- [ ] Given a selection-only group, it is not serialized into element data

### Requirement: Flat Ordered Hierarchy

Document and component element collections are flat ordered arrays. `parentId` defines hierarchy. Canonical order MUST be depth-first preorder: a parent precedes every descendant, each subtree is contiguous, and sibling roots retain array order. Parent references MUST resolve in the same identity scope and the hierarchy MUST be acyclic.

#### Acceptance Criteria

- [ ] Given a depth-first contiguous tree, hierarchy validation succeeds
- [ ] Given a missing parent, cycle, descendant before parent, or split subtree, semantic validation fails
- [ ] Given siblings with one parent, their filtered array order defines stacking

### Requirement: Exact Geometry

`geometry` MUST contain strictly positive finite bounds, a finite `origin` three-tuple, and exactly one transform: six-value `affine2d` matrix or sixteen-value `matrix3d` matrix. Matrix values are canonical; decomposed translation, rotation, scale, and skew are derived and not duplicated.

Singular transforms MAY be preserved only as explicitly diagnosed external content. Newly authored singular transforms MUST be rejected by editor commands.

#### Acceptance Criteria

- [ ] Given finite positive bounds and a valid matrix tuple, geometry validation succeeds
- [ ] Given zero-area bounds, non-finite values, or the wrong matrix length, validation fails
- [ ] Given reflected or skewed affine input, serialization preserves its exact matrix

### Requirement: Structured Text

A text element MUST contain inert `TextBody` with ordered paragraphs. Each paragraph and run MUST have stable identity and typed properties; each run contains Unicode text. Paragraph properties cover alignment, direction, spacing, indents, tabs, lists, hyphenation, and keep rules. Run properties cover fonts, size, color, variation axes, OpenType features, language, script, direction, decoration, baseline, tracking, hyperlink, and semantic role.

Authored HTML is forbidden. Glyph shaping, line breaks, measured layout, and DOM nodes are derived and are not persisted.

#### Acceptance Criteria

- [ ] Given multilingual Unicode runs with stable paragraph and run IDs, validation succeeds
- [ ] Given authored HTML or executable markup in text content, validation fails
- [ ] Given repeated shaping of identical text, no shaped-glyph cache is added to canonical data

### Requirement: Typed Visual and Media Payloads

Image, video, and audio elements MUST reference compatible project assets by ID. Image payloads declare fit and optional normalized crop and focal point. Vector payloads MUST be a typed rectangle, ellipse, structured path, or boolean operation. Clock, ticker, and QR-code variants use typed purpose-specific fields rather than generic content strings.

#### Acceptance Criteria

- [ ] Given an image referencing an image asset with a valid crop, validation succeeds
- [ ] Given media referencing an incompatible asset kind, semantic validation fails
- [ ] Given editable structured-path geometry, stable point and segment identity is preserved

### Requirement: Component Instances

A component-instance element MUST reference a component definition in the owning document and contain typed values addressed only by exposed-property IDs. Component instances are valid in document and component-local element collections.

#### Acceptance Criteria

- [ ] Given a nested component instance with type-correct exposed-property values, validation succeeds
- [ ] Given a missing component or unknown exposed-property ID, semantic validation fails
- [ ] Given a value that violates the exposed-property schema, validation fails

### Requirement: Foreign Fallback

A foreign element MUST contain media type, content-addressed source blob, resolving preview asset, safe render mode (`preview-only` or `sanitized-vector`), and human-readable reason. Foreign markup MUST NOT be injected directly into HTML or SVG DOM.

#### Acceptance Criteria

- [ ] Given unsupported external content with source and preview, it remains visibly and recoverably represented
- [ ] Given a missing preview asset or unsafe render mode, validation fails
- [ ] Given preview-only content, renderers display the preview without executing source markup

### Requirement: Plugin Elements and Extensions

A plugin element MUST contain plugin ID, element type, plugin schema version, inert JSON payload, and optional preview asset. Core validity MUST NOT depend on plugin registration or import order. Loaded plugins MAY perform additional payload validation in an authorized sandbox.

#### Acceptance Criteria

- [ ] Given an unknown plugin element with a valid core envelope, core parsing preserves it
- [ ] Given plugin payload data, core parsing does not execute it
- [ ] Given a preview reference, it resolves to a compatible asset

### Requirement: Cross-References and Targets

Mask, clip, text-path, boolean-operand, asset, shared-style, component, and property-target references MUST resolve to allowed entity kinds. Property targets use stable entity addresses plus RFC 6901 JSON Pointer and MUST address schema-approved overridable properties with type-compatible values.

#### Acceptance Criteria

- [ ] Given a valid vector text-path reference in scope, semantic validation succeeds
- [ ] Given an orphan, wrong-kind, or self-invalidating reference, semantic validation fails
- [ ] Given an array index as durable identity, target validation fails

## Spec Gaps

- Exact structured-path commands, full run/paragraph property unions, and accessibility schemas are finalized by their owning implementation program without changing these semantics.

## Non-Goals

- Editor selection or transform-control state
- Renderer DOM structure
- Compatibility with overloaded generic element payloads
