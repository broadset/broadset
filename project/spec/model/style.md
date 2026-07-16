# Model — Appearance Contract

## Purpose

Defines typed, ordered element appearance using paints, fill and stroke layers, effects, blend/compositing semantics, clips, and masks.

## Requirements

### Requirement: Appearance Shape

Every element appearance MUST define finite `opacity` in the inclusive range 0 through 1, a supported `blendMode`, boolean `isolation`, ordered `fills`, ordered `strokes`, and ordered `effects`. It MAY define one typed clip and one typed mask.

Fill, stroke, and effect entries MUST have stable IDs unique within their collection, `enabled`, opacity, and blend mode where the entry kind supports them. Array order is semantic stack order.

#### Acceptance Criteria

- [ ] Given multiple uniquely identified layers, repeated serialization preserves their order
- [ ] Given duplicate layer IDs or opacity outside 0 through 1, validation fails
- [ ] Given a disabled layer, it remains authorable but does not affect resolved appearance

### Requirement: Paint Union

Paint MUST be exactly one of:

- `none`;
- `solid` with typed `ColorValue`;
- `gradient` with typed gradient definition;
- `pattern` with asset ID, affine transform, and repeat rule; or
- `picture` with asset ID, fit, and optional normalized crop.

CSS paint strings and producer-specific tokens are not canonical values.

#### Acceptance Criteria

- [ ] Given any paint discriminant with its matching payload, structural validation succeeds
- [ ] Given a mismatched paint payload or raw CSS paint string, structural validation fails
- [ ] Given a pattern or picture asset of the wrong kind, semantic validation fails
- [ ] Given a picture crop on a surface background or any document/component fill or stroke, `x + width` and `y + height` remain at most one or semantic validation fails at that paint

### Requirement: Gradients

A gradient MUST contain stable stop IDs, typed colors, stop opacity, offset, optional midpoint, coordinate space, transform, spread mode, and interpolation color space. Its geometry MUST be a typed linear, radial, conic, diamond, or explicitly producer-preserved variant.

Stops remain in semantic array order and offsets and midpoints use validated finite normalized ranges.

#### Acceptance Criteria

- [ ] Given linear, radial, conic, and diamond gradients with valid typed geometry, validation succeeds
- [ ] Given duplicate stop IDs or invalid normalized ranges, validation fails
- [ ] Given wide-gamut stop colors, interpolation uses the declared color space

### Requirement: Strokes

Stroke layers MUST combine a typed paint with width, alignment, cap, join, miter, dash, and optional typed arrow endings as applicable. Spatial values use the owning surface unit and MUST be finite and non-negative where required.

#### Acceptance Criteria

- [ ] Given multiple stroke layers, stack order and stable identity are preserved
- [ ] Given a negative stroke width or malformed dash pattern, validation fails
- [ ] Given an arrow ending, its geometry is typed rather than stored as SVG markup

### Requirement: Effect Stack

Core effects use a closed union of known primitives including blur, drop shadow, inner shadow, glow, color matrix, bevel, displacement, opacity, and backdrop blur. Every effect has stable identity and typed parameters. Unknown producer effects MUST use interop preservation with a diagnostic and MUST NOT enter the core union as executable text.

#### Acceptance Criteria

- [ ] Given a supported effect with type-correct parameters, validation succeeds
- [ ] Given an unknown effect in the core effects array, structural validation fails
- [ ] Given an unsupported producer effect, interop retains it and resolution reports its fallback

### Requirement: Clip and Mask

Clips and masks MUST use typed references to vector elements, component-local vector paths, or alpha/luminance asset masks. Every reference MUST resolve in scope to an allowed kind. Arbitrary clip-path strings and executable markup are forbidden.

#### Acceptance Criteria

- [ ] Given a resolving vector clip reference, semantic validation succeeds
- [ ] Given a wrong-kind or cyclic clip/mask dependency, semantic validation fails
- [ ] Given an alpha or luminance asset mask, the mask mode is explicit

### Requirement: Shared-Style and Variable Resolution

Appearance values MAY reference project shared styles, variables, and swatches. Resolution applies shared definitions before sparse element-local values and retains provenance for each effective property. Reference and inheritance graphs MUST be acyclic.

#### Acceptance Criteria

- [ ] Given shared and local fill values, the local value wins and both sources remain in provenance
- [ ] Given an unresolved variable or swatch, semantic validation fails
- [ ] Given an inheritance cycle, semantic validation fails before rendering

### Requirement: Color and Compositing Semantics

All colors MUST use the typed color contract. Compositing MUST be performed in the document working space using linear premultiplied alpha, with explicit conversion at preview or output boundaries.

#### Acceptance Criteria

- [ ] Given semi-transparent layers, compositing uses premultiplied alpha
- [ ] Given a wide-gamut source, canonical appearance preserves its authoritative channels
- [ ] Given an output incapable of representing an effect or color, preflight reports intentional loss

## Spec Gaps

- Exact parameter schemas for every effect and gradient geometry are finalized in the professional-resources program while preserving this closed-union contract.

## Non-Goals

- CSS generation or renderer implementation
- Pre-v1 style-string migration
- Producer-specific effect execution
