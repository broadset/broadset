# Model — Host Editor Configuration

## Purpose

Defines host-provided editor policy and integration callbacks that operate on canonical v1 projects without becoming persisted project truth.

## Requirements

### Requirement: Configuration Boundary

`EditorConfig` MAY provide font choices, palette suggestions, document presets, required entity IDs, media integration, shortcuts, grid defaults, undo limits, plugin registrations, feature overrides, and change/save callbacks. Host configuration MUST NOT add fields to `BroadsetProjectV1`, `BroadsetDocumentV1`, or any core entity.

#### Acceptance Criteria

- [ ] Given host configuration and a canonical project, project serialization is unchanged
- [ ] Given an unknown host option, configuration validation fails without modifying the project
- [ ] Given omitted optional configuration, deterministic editor defaults are used

### Requirement: Feature Policy by Document Kind

Feature defaults MUST be derived from canonical document `kind` and actual schema capabilities. Motion documents enable timeline and lifecycle authoring. Static and print documents hide motion-only authoring unless a valid optional timebase and timed content make it applicable. Print documents expose prepress and output-intent tools. Host overrides MAY further restrict features but MUST NOT enable an operation that would create invalid canonical state.

#### Acceptance Criteria

- [ ] Given `kind: 'motion'`, exact-timeline authoring is available
- [ ] Given `kind: 'print'`, prepress and output-intent authoring is available
- [ ] Given a host override enabling an operation invalid for the active schema, the operation remains unavailable

### Requirement: Canvas View State

Editor canvas configuration MAY contain zoom, pan, ruler origin, guide visibility, grid visibility, snapping preferences, preview mode, and experimental-UI visibility. These are runtime UI values and MUST NOT replace canonical `surface`, `color`, guide, or output-profile fields.

Spatial conversion MUST use the active document's `surface.unit` and `surface.dpi`. Canvas background, padding, guides, safe areas, bleed, trim, and safe insets are edited through `surface` rather than duplicated in host state.

#### Acceptance Criteria

- [ ] Given zoom or pan changes, canonical project serialization is unchanged
- [ ] Given unit conversion, the active `surface.dpi` is used
- [ ] Given a safe-area edit, the canonical `surface.broadcastSafeAreas` field is updated through a validated editor command

### Requirement: Exact Timeline Presentation

Timeline UI MUST derive rate and tick conversion from the document `timebase`. Frame display, snapping, seek, and keyframe creation use integer ticks. Floating frame-rate literals and millisecond keyframe offsets MUST NOT become canonical animation values.

#### Acceptance Criteria

- [ ] Given a 30000/1001 timebase, frame snapping produces exact integer ticks
- [ ] Given a selected frame, every timeline surface resolves the same tick
- [ ] Given a UI duration shown in seconds, committing it converts once to a validated integer tick

### Requirement: Typed Color Inputs

Palette suggestions and color controls MUST produce typed `ColorValue` records. CSS color strings MAY be accepted only as untrusted UI input and MUST be parsed into authoritative channels and a declared color space before any project mutation.

#### Acceptance Criteria

- [ ] Given a supported CSS color entered in the UI, parsing produces a typed concrete color before commit
- [ ] Given invalid color text, no project mutation occurs
- [ ] Given a wide-gamut typed color, host palette handling preserves its authoritative channels

### Requirement: Plugin Registration

A plugin registration MUST identify a plugin, its supported plugin-element schemas, authorized renderer/editor integrations, optional property panel, and capability policy. Creating plugin content MUST produce the canonical `plugin` element variant with inert JSON payload and optional preview asset. Registration MUST NOT add arbitrary core element kinds.

#### Acceptance Criteria

- [ ] Given a registered plugin schema, creation produces `kind: 'plugin'` with matching plugin identity and schema version
- [ ] Given an unregistered plugin element, core parsing preserves it without executing its payload
- [ ] Given a plugin capability override, it cannot bypass core validation or security policy

### Requirement: Media Integration

Host media integration MAY list candidates and handle upload or relink requests. Selecting media MUST create or resolve a project asset and then write a compatible asset ID into the typed element payload. Host URLs and credentials MUST NOT be stored as generic element content.

#### Acceptance Criteria

- [ ] Given a selected image candidate, the editor resolves or creates an image asset before updating the image element's `assetId`
- [ ] Given upload cancellation, project resources and element payload remain unchanged
- [ ] Given host credentials, project serialization excludes them

### Requirement: Save and Change Callbacks

The save callback receives the whole validated `BroadsetProjectV1`. Change callbacks receive validated atomic change batches. A callback failure MUST NOT be reported as durable save success and MUST NOT cause a document-only payload to masquerade as a full project.

#### Acceptance Criteria

- [ ] Given save, the callback receives every document and project resource
- [ ] Given callback failure, the previous valid snapshot remains recoverable
- [ ] Given a change callback, its batch uses stable IDs, RFC 6901 pointers, and integer-tick values

### Requirement: Document Presets

Host presets MUST contain complete canonical v1 project or document input with valid resources, surface, color, pages, and references. Applying a preset creates fresh project/document identity where required and passes full structural and semantic validation.

#### Acceptance Criteria

- [ ] Given a valid preset, creation produces a canonical document with fresh identity
- [ ] Given a preset containing a legacy field alias, creation fails validation
- [ ] Given no presets, blank creation still produces a complete schema-valid project

### Requirement: Component Commands

Component creation, instantiation, property editing, and unlink MUST use [components.md](components.md). Host configuration MAY expose or hide those commands but MUST NOT define a second component persistence model.

#### Acceptance Criteria

- [ ] Given component creation, a document-owned `ComponentDefinition` is created
- [ ] Given instantiation, a `component-instance` element references the definition and exposed-property IDs
- [ ] Given unlink, one atomic transaction materializes ordinary elements with fresh IDs

## Spec Gaps

- The exact host API type names and default shortcut map are finalized with the editor cutover while preserving this boundary.

## Non-Goals

- Persisting editor viewport or feature flags in `project.json`
- Defining a legacy document or component model
- Storing network credentials or upload transport state
