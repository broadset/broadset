# Model — Project Resources and Assets

## Purpose

Defines project-owned resources, logical assets, content-addressed blob references, font families, variables, and shared styles.

## Requirements

### Requirement: Project Resource Collection

`ProjectResources` MUST contain ordered arrays named `assets`, `fonts`, `swatches`, `variables`, `styles`, and `outputProfiles`. Each resource has a stable non-empty ID unique within its resource scope. Resources are project-owned and MAY be shared by documents and component definitions.

#### Acceptance Criteria

- [ ] Given empty arrays for every resource kind, structural validation succeeds
- [ ] Given duplicate IDs within one resource kind, semantic validation fails
- [ ] Given two documents referencing one resource ID, both resolve the same resource

### Requirement: Logical Asset and Blob Separation

Every asset MUST contain stable `id`, discriminating `kind`, `name`, and a `blob` reference. It MAY contain provenance, license, and derivative records. The asset describes semantic media identity while the blob reference describes byte identity and location.

A blob reference MUST contain a SHA-256 digest, non-negative safe-integer `byteLength`, MIME `mediaType`, and exactly one source variant:

- `package` with a normalized package path;
- `external` with URL, required SHA-256 integrity, and optional cached digest; or
- `missing` with optional last-known name.

#### Acceptance Criteria

- [ ] Given two assets with the same digest, storage MAY deduplicate their bytes without merging their logical identities
- [ ] Given a digest or declared byte length that does not match loaded bytes, validation fails before hydration
- [ ] Given an asset without a blob source variant, structural validation fails

### Requirement: Asset Source Semantics

Canonical `.bsp` packages MUST use package blob sources. Raw `.broadset.json` interchange MAY use external or explicitly missing sources. Data URIs and large base64 payloads are not canonical asset sources. Parsing an external URL MUST NOT fetch it.

An explicitly missing source remains structurally valid, produces a required-resource diagnostic, and renders an explicit placeholder. A reference to a nonexistent asset ID is invalid.

#### Acceptance Criteria

- [ ] Given a packaged asset, its normalized blob path resolves to a manifest-listed entry
- [ ] Given an explicitly missing asset source, structural validation succeeds and resolution reports a placeholder diagnostic
- [ ] Given an element referencing an absent asset ID, semantic validation fails

### Requirement: Typed Asset Variants

Asset variants MUST carry typed metadata appropriate to their kind:

- image: pixel dimensions, orientation, alpha, bit depth, color model, and optional ICC-profile reference;
- video: dimensions, rational frame rate, duration ticks, codecs, alpha, and audio-track summary;
- audio: duration, sample rate, channel layout, and codec;
- font: format, PostScript name, family, weight, style, stretch, variable axes, Unicode coverage, and embedding permissions;
- ICC profile: profile class, color space, profile connection space, description, and identifier;
- data: encoding, declared schema reference, and record-shape summary;
- vector or foreign: intrinsic bounds and safe-preview information when applicable.

#### Acceptance Criteria

- [ ] Given an image with positive safe-integer pixel dimensions, typed metadata validation succeeds
- [ ] Given a video with an unreduced or non-positive frame-rate rational, validation fails
- [ ] Given an ICC-profile reference pointing to another asset kind, semantic validation fails

### Requirement: Font Family Resources

A font-family resource MUST define stable `id`, `familyName`, `fallbackFontIds`, and ordered `faces`. Each face has a stable ID and either references a font asset or explicitly identifies a system-only face; it MUST declare weight, style, stretch, and optional variable-axis values.

Fallback and face IDs MUST resolve to compatible resources. Export preflight MUST diagnose targets requiring embedding when no compatible embeddable face is available.

#### Acceptance Criteria

- [ ] Given a face referencing a compatible packaged font asset, validation succeeds
- [ ] Given a system-only face, validation does not pretend font bytes are packaged
- [ ] Given export requiring embedding without an embeddable face, preflight reports intentional loss or failure

### Requirement: Variable Collections

A variable collection MUST define stable `id`, `name`, ordered modes, a resolving `defaultModeId`, and ordered variables. A variable has stable `id`, `name`, `valueType`, a complete `valuesByMode` map, and optional typed alias target.

Mode, variable, and value IDs MUST be unique in their scopes. Every value MUST match the declared type. Alias targets MUST resolve, match value types, and form an acyclic graph.

#### Acceptance Criteria

- [ ] Given one type-compatible value for every collection mode, variable validation succeeds
- [ ] Given a missing mode value or mismatched value type, validation fails
- [ ] Given a direct or indirect variable-alias cycle, semantic validation fails

### Requirement: Shared Styles

Shared styles MUST have stable identity and hold reusable typed appearance or text-style fragments. They MAY reference variables and swatches. Inheritance and alias relationships MUST resolve, remain type-compatible, and be acyclic. Element-local overrides are sparse.

#### Acceptance Criteria

- [ ] Given an element referencing a shared style, resolution applies the shared fragment before local overrides
- [ ] Given a missing shared style or inheritance cycle, semantic validation fails
- [ ] Given a local override, provenance retains both the shared source and effective local source

### Requirement: Asset Integrity and Safety

Package paths MUST be normalized relative forward-slash paths and MUST NOT be absolute, traverse directories, use backslashes, name symlinks, duplicate entries, or reference unlisted payloads. Blob length and SHA-256 MUST be verified before expensive decoding.

#### Acceptance Criteria

- [ ] Given a manifest-listed blob with matching length and digest, hydration may proceed
- [ ] Given traversal, an absolute path, a duplicate path, or an unlisted entry, container validation fails
- [ ] Given a remote asset URL, parsing alone causes no network request

## Spec Gaps

- Operational relinking, proxy generation, licensing UI, and measured resource budgets belong to the professional-resources and persistence programs.

## Non-Goals

- Binary decoding or media playback
- Network fetch policy implementation
- Output-profile field details, which are defined in [output-spec.md](output-spec.md)
