# Editor — Structured Vector Geometry

## Purpose

Defines deterministic editing utilities for canonical structured vector paths, stable point/segment identity, exact bounds refitting, overlays, clipboard remapping, alignment, snapping, and hierarchy traversal.

## Requirements

### Requirement: Structured Path Contract

Editor path utilities MUST consume and produce `kind: 'vector'` elements with `geometryData.kind: 'path'`. Path commands, points, and segments are typed and stably identified. SVG path strings are importer/exporter transport forms and MUST NOT be canonical editor state.

#### Acceptance Criteria

- [ ] Given structured move, line, cubic, quadratic, arc, and close segments, validation preserves their stable IDs
- [ ] Given an SVG path imported at a format boundary, conversion produces structured geometry before editor state
- [ ] Given malformed transport path data, import reports diagnostics and commits no invalid vector

### Requirement: Stable Point and Segment Operations

Insert, update, convert, and delete operations MUST address stable point or segment IDs. Updating coordinates preserves identity. Insertion creates fresh IDs. Deletion removes only explicitly dependent segments and MUST reject geometry that violates the path schema.

#### Acceptance Criteria

- [ ] Given point movement, the point ID and unaffected segment IDs are unchanged
- [ ] Given insertion, the new point and segment receive fresh non-conflicting IDs
- [ ] Given invalid deletion, no geometry is mutated

### Requirement: Exact Bounds Refit

Refitting computes tight finite bounds from structured line and curve geometry plus required stroke padding. It MUST atomically rebase local point coordinates and update the element transform so resolved world geometry is unchanged. Empty or invalid geometry does not mutate bounds.

#### Acceptance Criteria

- [ ] Given a structured path and stroke, refit returns positive tight padded bounds
- [ ] Given refit, every resolved world-space point remains unchanged
- [ ] Given empty geometry, bounds and transform remain unchanged

### Requirement: Derived Editing Handles

Anchor and control handles are derived from structured geometry. Line endpoints expose anchors; cubic and quadratic segments expose typed controls; arc controls expose their typed radii and axis data. Overlay SVG is runtime UI and MUST NOT be persisted.

#### Acceptance Criteria

- [ ] Given a cubic segment, the overlay derives two controls and an endpoint anchor
- [ ] Given a point drag, ephemeral geometry updates while canonical state remains unchanged until commit
- [ ] Given overlay destruction, all listeners and derived DOM are removed

### Requirement: Editor Session Lifecycle

A path editor session MUST be created only for a valid vector path, expose current structured geometry, emit typed ephemeral updates, commit one atomic batch on completion, and be explicitly destroyable. A session MUST NOT accept or emit path `d` strings as its model contract.

#### Acceptance Criteria

- [ ] Given a vector path, session creation returns handles keyed by stable IDs
- [ ] Given pointer release, one typed geometry change commits
- [ ] Given session destruction, later pointer input produces no mutation

### Requirement: Alignment and Distribution

Alignment and distribution operate on resolved bounds and exact transforms. Alignment uses the selected left, center, right, top, middle, or bottom target. Distribution orders by resolved position and creates deterministic equal gaps without changing element identity.

#### Acceptance Criteria

- [ ] Given several elements, alignment produces the selected shared resolved anchor
- [ ] Given three or more elements, distribution produces equal deterministic gaps
- [ ] Given locked elements, commands follow the explicit lock policy and report skipped entities

### Requirement: Clipboard Identity Remapping

Clipboard payloads contain validated canonical entities and declared resource dependencies. Paste MUST allocate fresh IDs and remap all internal hierarchy, component, clip/mask, boolean operand, binding, and animation references within the pasted scope. External references remain only when valid in the destination project.

#### Acceptance Criteria

- [ ] Given paste, every duplicated entity receives a fresh ID
- [ ] Given internal references, all resolve to the corresponding remapped entity
- [ ] Given an unavailable external dependency, paste rejects or requires explicit user resolution before commit

### Requirement: Resize Handles and Matrices

Resize-handle geometry is derived from resolved bounds and zoom. Dragging computes a new exact affine or 3D matrix and positive bounds; it MUST NOT persist decomposed transform fields. Handles remain constant-size in screen space.

#### Acceptance Criteria

- [ ] Given zoom changes, handle screen size remains stable
- [ ] Given resize, canonical bounds stay positive and transform remains exact
- [ ] Given a reflected transform, resize preserves reflection unless the user crosses the explicit flip boundary

### Requirement: Smart Guides and Grid Snapping

Snapping compares resolved edges, centers, user guides, safe areas, and grid intersections using a screen-space threshold converted through zoom. Precedence and tie-breaking MUST be deterministic. Preview guides remain runtime state.

#### Acceptance Criteria

- [ ] Given multiple equal-distance candidates, documented category then stable-ID order selects one
- [ ] Given zoom, the visual snap threshold remains constant in screen pixels
- [ ] Given a snap preview, no guide is serialized into the project unless the user explicitly creates one

### Requirement: Immutable Entity Update and Descendants

Entity update utilities MUST return a new canonical graph and preserve unaffected references. Descendant collection follows `parentId`, returns depth-first preorder, and detects cycles rather than recursing indefinitely.

#### Acceptance Criteria

- [ ] Given an existing entity update, source project objects remain unchanged
- [ ] Given a missing target, the operation returns a typed diagnostic and unchanged project
- [ ] Given a hierarchy cycle in untrusted input, traversal terminates and reports validation failure

### Requirement: Debug Snapshot Determinism

Debug snapshots MAY expose structured geometry, resolved bounds, stable addresses, and diagnostics. They MUST sort non-semantic diagnostic collections deterministically and exclude DOM nodes, functions, and transient pointer state.

#### Acceptance Criteria

- [ ] Given semantically equivalent editor state, debug snapshots are identical
- [ ] Given transient DOM or pointer changes, canonical debug projection is unchanged
- [ ] Given diagnostics, stable code and address determine deterministic order

## Spec Gaps

- Exact structured-path leaf schemas and geometric curve extrema tolerances are finalized by the vector implementation while preserving these identity and fidelity rules.

## Non-Goals

- Persisting SVG `d` strings or overlay DOM
- Compatibility parsing inside editor state
- Rasterizing editable vector geometry
