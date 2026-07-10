# Model — BroadsetProject Contract

## Purpose

Defines the canonical `BroadsetProjectV1` authoring root, its identity, ownership boundaries, shared resources, document collection, template relationships, interoperability records, and extension envelopes.

## Requirements

### Requirement: Canonical v1 Project Identity

Every canonical project MUST contain `$schema`, `format`, and `schemaVersion` with these exact values:

- `$schema: 'https://schema.broadset.dev/v1/project.schema.json'`
- `format: 'broadset-project'`
- `schemaVersion: 1`

Consumers MUST reject every other schema version with a typed unsupported-version diagnostic. The production v1 loader MUST NOT migrate or accept legacy Broadset-owned project shapes.

#### Acceptance Criteria

- [ ] Given all three exact identity values, structural validation proceeds
- [ ] Given a missing or different identity value, validation fails at that field
- [ ] Given `schemaVersion: 2`, loading returns `unsupported-version` and preserves the source bytes

### Requirement: Canonical Root Vocabulary

A project MUST contain exactly these core fields: `$schema`, `format`, `schemaVersion`, `id`, `metadata`, `resources`, `documents`, `templateGroups`, `interop`, and `extensions`. Core objects are strict; unknown root fields are validation errors.

`id` MUST be a stable, non-empty Unicode string without control characters. UUIDs are the default generated form, but deterministic import identifiers MAY use another valid shape.

#### Acceptance Criteria

- [ ] Given a project containing every required root field and no unknown field, structural validation succeeds
- [ ] Given an unknown root field, structural validation fails at that field
- [ ] Given an empty or control-character project ID, validation fails

### Requirement: Project Metadata

`metadata` MUST contain `name`, UTC `createdAt`, and UTC `updatedAt`. It MAY contain `description`, `authors`, `keywords`, `rights`, and generator `name`, `version`, and optional `build`.

`updatedAt` MUST NOT precede `createdAt`. Package-creation and local-save timestamps are package or persistence metadata, not semantic project metadata.

#### Acceptance Criteria

- [ ] Given timezone-qualified UTC timestamps where `updatedAt` is not earlier than `createdAt`, validation succeeds
- [ ] Given a local or timezone-free timestamp, validation fails at that timestamp
- [ ] Given `updatedAt` earlier than `createdAt`, semantic validation fails

### Requirement: Project Resources

`resources` MUST contain ordered arrays named `assets`, `fonts`, `swatches`, `variables`, `styles`, and `outputProfiles`. Resource IDs MUST be stable and unique in their respective project scopes. Documents and component definitions reference these project-owned resources by ID.

#### Acceptance Criteria

- [ ] Given multiple documents referencing one project asset, each reference resolves to the same logical asset
- [ ] Given duplicate resource IDs in one resource scope, semantic validation fails
- [ ] Given a resource reference of the wrong kind, semantic validation fails at the reference

### Requirement: Project Documents

`documents` MUST contain at least one `BroadsetDocumentV1`. Document IDs MUST be unique in the project. The editor store owns the complete project; active document and page selections are runtime UI state.

Main save and export operations MUST serialize the whole project. A document-only interchange operation MUST use a distinct command, label, and schema and MUST NOT be presented as a full project save.

#### Acceptance Criteria

- [ ] Given one or more uniquely identified documents, project validation proceeds
- [ ] Given no documents or duplicate document IDs, validation fails
- [ ] Given a full project save, every document and project resource is serialized

### Requirement: Template Groups

`templateGroups` relates independently authored document variants without changing their render semantics. Each group MUST have a stable unique `id`, `name`, and ordered `members`. Each member MUST have a stable ID, a resolving `documentId`, an aspect-ratio or named role, optional label, and resolving `outputProfileIds`.

Aspect ratios MUST contain positive safe integers reduced to lowest terms. Member IDs MUST be unique within a group. A document MAY belong to multiple groups.

#### Acceptance Criteria

- [ ] Given a group linking horizontal and vertical document variants, both remain independently authored documents
- [ ] Given a missing document or output-profile reference, semantic validation fails
- [ ] Given a non-reduced, zero, or negative aspect ratio, validation fails

### Requirement: Interoperability Registry

`interop` MUST contain ordered `sources` and `records` arrays. Broadset-owned source preservation and external identity data MUST live in this registry rather than generic extensions. Interop IDs MUST be unique in their respective scopes and every record source and target MUST resolve.

#### Acceptance Criteria

- [ ] Given valid source and target references, an interop record is accepted
- [ ] Given a missing interop source or target, semantic validation fails
- [ ] Given format-specific Broadset round-trip data in an extension envelope, validation reports the incorrect ownership domain

### Requirement: Generic Extensions

`extensions` MUST be an ordered array of envelopes containing `namespace`, `schema`, `version`, and inert JSON `payload`. Namespaces use reverse-domain ownership and MUST be unique within their owning entity. Core parsing validates the envelope without requiring a plugin and preserves unknown payloads with semantic JSON equality.

#### Acceptance Criteria

- [ ] Given an unknown well-formed envelope, parse and serialization preserve its payload
- [ ] Given duplicate namespaces on one owner, semantic validation fails
- [ ] Given executable behavior encoded in a payload, core parsing leaves it inert

### Requirement: Canonical Ownership Boundary

The canonical project MUST exclude editor selection, viewport, open panels, active tools, playback state, undo, journals, presence, CRDT metadata, caches, shaped glyphs, thumbnails, runtime indexes, and render plans.

#### Acceptance Criteria

- [ ] Given a canonical save, no runtime UI, collaboration, or derived-render state is serialized
- [ ] Given a persistence journal, it can reference project IDs and content hashes without becoming a project field
- [ ] Given repeated parse and serialization, semantic project content remains stable

## Spec Gaps

- Package codec budgets, atomic persistence adapters, and collaboration transports are specified here only at their model boundary and require their owning implementation programs.

## Non-Goals

- Backward compatibility with legacy Broadset-owned draft shapes
- Runtime navigation or editor-state persistence
- Document-only interchange schema details
- Plugin execution or plugin payload semantics
