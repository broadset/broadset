# Model — Canonical Utilities

## Purpose

Defines pure model utilities for cloning, stable-ID remapping, unit conversion, typed clip geometry, matrices, and semantic addressing without creating alternate persisted shapes.

## Requirements

### Requirement: Project and Document Clone Fidelity

Clone utilities MUST preserve every canonical field and ordered collection while producing structurally independent JSON values. A plain clone preserves identity. A duplicate command MUST explicitly remap every duplicated stable ID and all references within its declared duplication scope.

#### Acceptance Criteria

- [ ] Given a canonical project clone, semantic JSON equality and identity are preserved
- [ ] Given mutation of a clone, the source object is unchanged
- [ ] Given document duplication, fresh IDs and all internal references form one valid remapped graph

### Requirement: Surface Unit Conversion

Pixel, millimetre, inch, and PostScript-point conversion MUST use the active document's positive `surface.dpi`. Exact constants are `1 in = 25.4 mm` and `1 in = 72 pt`. Converting between physical units does not require DPI; conversion to or from pixels does.

#### Acceptance Criteria

- [ ] Given 96 px at `surface.dpi: 96`, conversion returns 1 in and 25.4 mm
- [ ] Given 25.4 mm at `surface.dpi: 300`, conversion returns 300 px
- [ ] Given zero or non-finite DPI, conversion rejects the input

### Requirement: Typed Length Input Boundary

UI/import boundary parsing MAY accept signed finite numeric strings with explicit supported units. It MUST return a typed length plus diagnostics and MUST NOT persist the transport string. Ambiguous or unsupported units are rejected.

#### Acceptance Criteria

- [ ] Given `12.5 mm`, parsing returns a finite typed length in millimetres
- [ ] Given uppercase or surrounding whitespace, normalization is deterministic
- [ ] Given a missing or unsupported unit, parsing fails without project mutation

### Requirement: Typed Clip Geometry

Clip utilities MUST operate on structured vector geometry and stable point/segment IDs. They MAY create rectangle, ellipse, or structured-path clip-source geometry and scale it between element-local coordinate systems. They MUST NOT parse or serialize CSS `path(...)`, polygon strings, or arbitrary markup as canonical clip data.

#### Acceptance Criteria

- [ ] Given structured path geometry, scaling preserves stable point and segment identity
- [ ] Given a default rectangular clip source, its bounds are positive and match the target element
- [ ] Given raw CSS clip text, the canonical utility rejects it

### Requirement: Matrix Utilities

Matrix utilities MUST accept exact six-number affine or sixteen-number 3D tuples, reject non-finite values, compose transforms deterministically, and preserve arbitrary skew, reflection, and nested transforms. Decomposition is derived and MUST NOT overwrite the canonical matrix when unstable.

#### Acceptance Criteria

- [ ] Given valid affine matrices, composition returns the same matrix in every consumer
- [ ] Given a 3D matrix with other than sixteen values, validation fails
- [ ] Given an unstable decomposition, the original matrix remains authoritative

### Requirement: Edge Anchor Inference

Runtime anchor inference MAY compare resolved element bounds with resolved surface bounds for editor placement. It MUST consume resolved geometry, remain outside canonical serialization, and use an explicit tie rule: a center exactly on an axis selects the right or bottom anchor.

#### Acceptance Criteria

- [ ] Given an element center left and above surface center, inference returns left/top
- [ ] Given an element center right and below surface center, inference returns right/bottom
- [ ] Given coincident centers, inference returns right/bottom and persists no anchor fields

### Requirement: Stable Address and Hash Utilities

Address utilities MUST use stable entity IDs, component instance paths, and RFC 6901 pointers. Semantic hash utilities use RFC 8785 canonicalization over the defined projection and exclude non-semantic timestamps, package metadata, and runtime state.

#### Acceptance Criteria

- [ ] Given a collection reorder, a stable entity address continues to identify the same entity
- [ ] Given equivalent object-member order, semantic hashing returns the same digest
- [ ] Given a runtime-only state change, the canonical semantic hash is unchanged

## Spec Gaps

- Exact ID-remapping scopes and semantic hash projections are finalized with their owning implementation programs.

## Non-Goals

- CSS clip serialization as canonical state
- Persisting runtime anchor or decomposition caches
- Compatibility transforms for legacy Broadset-owned fields
