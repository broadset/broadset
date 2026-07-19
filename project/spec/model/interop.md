# Model — Interoperability and External Preservation

## Purpose

Defines external source provenance, semantic round-trip records, derived cleanliness, safe foreign fallback, diagnostics, and the boundary between Broadset-owned interop data and generic extensions.

## Requirements

### Requirement: Interop Registry

Every project `interop` object MUST contain ordered `sources` and `records` arrays. Source IDs and record IDs MUST be stable and unique in their respective project scopes.

#### Acceptance Criteria

- [ ] Given empty source and record arrays, structural validation succeeds
- [ ] Given duplicate source or record IDs, semantic validation fails
- [ ] Given repeated parse and serialization, registry order and identity are preserved

### Requirement: Interop Sources

An interop source MUST contain stable `id`, external `format`, resolving `sourceAssetId`, importer version, and UTC `importedAt`. The source asset preserves the imported file or an approved content-addressed equivalent.

The strict v1 source record is `{id, format, sourceAssetId, importerVersion, importedAt}`. `format`
and `importerVersion` are non-empty inert strings. Parsing this record never fetches or executes the
referenced source.

#### Acceptance Criteria

- [ ] Given a source asset and timezone-qualified import timestamp, validation succeeds
- [ ] Given a missing source asset or invalid timestamp, semantic validation fails
- [ ] Given a future importer version string, core parsing preserves it as inert metadata

### Requirement: Interop Records

An interop record MUST contain stable `id`, resolving `sourceId`, resolving `target` entity address, SHA-256 `baselineSemanticHash`, mapping confidence from 0 through 1, editability (`native`, `partial`, or `appearance-only`), and ordered warnings. It MAY contain source identity JSON, preserved blob, and preview asset reference.

The strict v1 record fields are exactly `id`, `sourceId`, `target`, `baselineSemanticHash`,
`mappingConfidence`, `editability`, `warnings`, and optional `sourceIdentity`, `preservedBlob`, and
`previewAssetId`. Source identity is inert `JsonValue`; a preserved blob is a self-contained
`BlobReference`; a preview resolves to an image or vector asset.

Each warning is a strict `InteropDiagnostic` containing non-empty inert `code`, `message`, and
optional `remediation`, shared diagnostic `severity`, a dimension of `appearance`, `editability`,
`semantics`, or `output`, and at least one RFC 6901 `pointer` or `EntityAddress`. Diagnostics contain
data only and never executable remediation behavior.

#### Acceptance Criteria

- [ ] Given resolving references, valid hash, confidence, and editability, validation succeeds
- [ ] Given a missing source, target, blob, or preview asset, semantic validation fails
- [ ] Given a preserved source identity payload, semantic JSON equality survives round-trip
- [ ] Given a preview reference to an asset other than image or vector, semantic validation fails at the preview reference
- [ ] Given a warning without a pointer or entity location, structural validation fails
- [ ] Given structurally valid interop records, validation performs no network, DOM, or execution behavior

### Requirement: Derived Cleanliness

External round-trip cleanliness MUST be derived by comparing the current defined semantic projection hash with `baselineSemanticHash`. A permanent mutable dirty boolean MUST NOT be persisted. Undo that restores the baseline semantics restores clean status.

#### Acceptance Criteria

- [ ] Given unchanged relevant semantics, the record derives clean
- [ ] Given a relevant edit, the record derives dirty
- [ ] Given undo restoring the baseline projection, the record derives clean again

### Requirement: Map, Preserve, or Explicitly Fall Back

Every external construct MUST be mapped to native semantics when representable, otherwise preserved as a typed interop fragment or represented by a foreign element with explicit preview and diagnostic. Unsupported source content MUST NOT be dropped without a diagnostic.

#### Acceptance Criteria

- [ ] Given a representable external construct, import produces equivalent native semantics
- [ ] Given an unrepresentable construct, source preservation and explicit fallback remain available
- [ ] Given any encountered construct, importer accounting classifies it as mapped, preserved, or diagnosed fallback

### Requirement: Safe Foreign Rendering

Foreign content MUST use `preview-only` or shared-policy `sanitized-vector` rendering. Raw foreign markup, scripts, links, and active producer payloads MUST NOT be injected into browser DOM or executed during parse, preview, or export.

#### Acceptance Criteria

- [ ] Given preview-only foreign content, rendering uses only its resolving safe preview asset
- [ ] Given sanitized-vector mode, preview and export use the same context-specific sanitization policy
- [ ] Given active markup, parsing preserves bytes without executing them

### Requirement: Structured Diagnostics and Preflight

Interop diagnostics MUST have stable code, severity, location or entity address, explanation, and safe remediation. Export preflight MUST report every intentional loss separately from mapping editability and appearance fidelity.

#### Acceptance Criteria

- [ ] Given partial editability with preserved appearance, both dimensions are reported independently
- [ ] Given an export loss, structured preflight identifies affected entities and semantics
- [ ] Given a diagnostic, it contains no executable remediation payload

### Requirement: Generic Extension Boundary

Generic extension envelopes contain reverse-domain namespace, schema identifier, version, and inert JSON payload. Unknown envelopes remain core-valid and preserve semantic JSON equality. Broadset-owned format round-trip data MUST use `interop`, not extensions.

#### Acceptance Criteria

- [ ] Given an unknown valid extension envelope, core parse succeeds without a plugin
- [ ] Given a loaded owner plugin, additional payload validation does not change core shape validation
- [ ] Given Broadset-owned producer preservation, it is stored in an interop record

## Spec Gaps

- Producer-specific identity projections, semantic hash projections, and preservation-fragment schemas are defined by each format program.

## Non-Goals

- Executing third-party source content
- Guaranteeing native editability for every producer construct
- Using extensions as an untyped substitute for core or interop fields
