# Model — Output Profiles

## Purpose

Defines reusable project output profiles and their relationship to authoring documents and export preflight.

## Requirements

### Requirement: Project-Owned Output Profiles

Output profiles MUST be stable, uniquely identified resources under `resources.outputProfiles`. Documents and template-group members reference profiles by ID and MAY reference multiple targets. Profile settings do not alter document authoring truth.

#### Acceptance Criteria

- [ ] Given multiple documents referencing one profile, all resolve the same profile
- [ ] Given duplicate profile IDs or a missing profile reference, semantic validation fails
- [ ] Given multiple profile references on one document, all remain distinct output targets

### Requirement: Motion and Screen Profiles

A motion or screen profile MUST define pixel dimensions, pixel aspect ratio, rational frame rate, scan mode, field order when interlaced, color primaries, transfer function, matrix coefficients, signal range, SDR/HDR metadata, peak/reference luminance, alpha/key/fill policy, and target runtime requirements. It MAY define audio routing and a safe-area preset.

#### Acceptance Criteria

- [ ] Given a progressive SDR profile with valid dimensions and rational rate, validation succeeds
- [ ] Given an interlaced profile without field order, validation fails
- [ ] Given HDR signaling inconsistent with transfer or luminance metadata, semantic validation fails

### Requirement: Print Profiles

A print profile MUST define physical page size and orientation, output ICC intent, bleed/trim requirements, spot-color and overprint policy, and target PDF standard with conformance level.

#### Acceptance Criteria

- [ ] Given a compatible print profile and ICC intent, validation succeeds
- [ ] Given negative bleed or trim requirements, validation fails
- [ ] Given a PDF standard incompatible with requested color behavior, preflight reports the conflict

### Requirement: Timebase Compatibility

A motion profile frame rate MUST be rational and compatible with the owning motion document timebase so every output frame starts at an integer tick. A profile MUST NOT replace the document timebase.

#### Acceptance Criteria

- [ ] Given a compatible rate, every frame start maps to an integer tick
- [ ] Given an incompatible profile rate, semantic validation or preflight fails
- [ ] Given two compatible rates on one document, each samples the same exact document timeline

### Requirement: Output Color Boundary

Output-profile color signaling and ICC intent are output transformations from document working color. They MUST NOT overwrite authoritative document colors. Conversion or unsupported feature loss MUST be diagnosed by structured preflight.

#### Acceptance Criteria

- [ ] Given wide-gamut authoring color and an SDR output profile, canonical color values remain unchanged
- [ ] Given a target incapable of representing spot color, preflight reports intentional loss
- [ ] Given valid output conversion, the profile supplies all required target color metadata

### Requirement: Export Options Are Not Document Truth

Export command options, destinations, codec tuning, and user presets remain outside canonical project data unless a field is explicitly part of reusable output intent. Exporters MUST consume a resolved scene and produce structured preflight for every intentional loss.

#### Acceptance Criteria

- [ ] Given a destination or codec-quality change, canonical project serialization is unchanged
- [ ] Given unsupported target semantics, export does not omit them without a diagnostic
- [ ] Given identical resolved scene and output profile, export semantics are reproducible

## Spec Gaps

- Complete codec-, runtime-, and PDF-standard enumerations are owned by the output and formats programs.

## Non-Goals

- Export command UI
- Encoder implementation
- Persisting transient output destinations or credentials
