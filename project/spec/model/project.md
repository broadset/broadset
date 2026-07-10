# Model — BroadsetProject Contract

## Purpose

Defines the structural rules and invariants for `BroadsetProject` — the top-level container of the Broadset format. A project bundles shared settings, a centralized asset library, and one or more documents (templates/graphics). All consumers (validators, serializers, editors, renderers, playout systems) MUST preserve every requirement in this spec.

---

## Requirements

### Requirement: Schema Version

Every project MUST carry a `schemaVersion` field with a positive integer value. The initial schema version is `1`. Consumers MUST reject projects with an unrecognized schema version.

#### Scenario: Valid schema version

- GIVEN a project with `schemaVersion: 1`
- WHEN the project is validated
- THEN validation succeeds

#### Scenario: Missing schema version rejected

- GIVEN a project without a `schemaVersion` field
- WHEN the project is validated
- THEN validation fails

#### Scenario: Unknown schema version rejected

- GIVEN a project with `schemaVersion: 999`
- WHEN a consumer attempts to load it
- THEN the consumer rejects it with a clear version-mismatch error

#### Acceptance Criteria

- [ ] Given a project with `schemaVersion: 1`, validation succeeds
- [ ] Given a project without `schemaVersion`, validation fails
- [ ] Given an unknown schema version, the consumer rejects with a version-mismatch error

---

### Requirement: Project Identity and Metadata

Every project MUST have a non-empty `id`, a `name` string, and ISO 8601 timestamps `createdAt` and `updatedAt`.

#### Scenario: Valid project metadata

- GIVEN a project with `id: 'proj-001'`, `name: 'Sports Show'`, `createdAt: '2026-04-05T12:00:00Z'`, `updatedAt: '2026-04-05T12:00:00Z'`
- WHEN the project is validated
- THEN validation succeeds

#### Scenario: Empty ID rejected

- GIVEN a project with `id: ''`
- WHEN the project is validated
- THEN validation fails

#### Acceptance Criteria

- [ ] Given a project with valid id, name, and ISO 8601 timestamps, validation succeeds
- [ ] Given a project with an empty id, validation fails
- [ ] Given a project with non-ISO-8601 timestamps, validation fails

---

### Requirement: Project Settings

Every project MUST have a `settings` object containing:

- `fonts`: array of `FontDefinition` (may be empty — empty triggers fallback system fonts)
- `palette`: array of CSS color strings (brand colors, may be empty)
- `defaultDocumentMode`: `'screen'` or `'print'`

#### Scenario: Valid settings

- GIVEN settings with `fonts: [{ family: 'Arial', variants: [{ weight: 400, style: 'normal' }], source: { kind: 'system' } }]`, `palette: ['#ff0000']`, `defaultDocumentMode: 'screen'`
- WHEN the project is validated
- THEN validation succeeds

#### Scenario: Empty fonts triggers fallback

- GIVEN settings with `fonts: []`
- WHEN fonts are resolved
- THEN fallback system fonts are used (Arial, Courier New, Times New Roman, Georgia)

#### Acceptance Criteria

- [ ] Given valid settings with fonts, palette, and defaultDocumentMode, validation succeeds
- [ ] Given empty fonts array, fallback system fonts are used
- [ ] Given invalid defaultDocumentMode, validation fails

---

### Requirement: Font Definition Structure

Each `FontDefinition` MUST have:

- `family`: non-empty string
- `variants`: array of `FontVariant` (each with `weight: 100–900` and `style: 'normal' | 'italic'`)
- `source` (optional): `{ kind: 'system' }`, `{ kind: 'url', url: string }`, or `{ kind: 'assetId', assetId: string }`

#### Scenario: System font

- GIVEN a font with `family: 'Arial'`, `variants: [{ weight: 400, style: 'normal' }]`, `source: { kind: 'system' }`
- WHEN the font is validated
- THEN validation succeeds

#### Scenario: Asset-referenced font

- GIVEN a font with `source: { kind: 'assetId', assetId: 'font-001' }`
- WHEN the font is validated
- THEN the assetId MUST reference a valid asset with `kind: 'font'`

#### Acceptance Criteria

- [ ] Given a system font definition, validation succeeds
- [ ] Given a URL-sourced font, validation succeeds with a valid URL
- [ ] Given an asset-referenced font, the assetId must reference a font asset

---

### Requirement: Non-Empty Documents

A project MUST contain at least one document. An empty `documents` array is invalid.

#### Scenario: Project with one document

- GIVEN a project with `documents: [{ ... }]`
- WHEN the project is validated
- THEN validation succeeds

#### Scenario: Empty documents rejected

- GIVEN a project with `documents: []`
- WHEN the project is validated
- THEN validation fails

#### Acceptance Criteria

- [ ] Given a project with at least one document, validation succeeds
- [ ] Given a project with empty documents array, validation fails

---

### Requirement: Format Identity

The Broadset format uses:

- File extension: `.bsp` (Broadset Project)
- MIME type: `application/vnd.broadset.project+json`
- JSON Schema URL: `https://schema.broadset.dev/v1/project.json`

A project MAY include a `$schema` field referencing the JSON Schema URL for cross-platform validation.

Packaged projects (with embedded assets) use a ZIP container with the same `.bsp` extension:

```
my-show.bsp (ZIP)
├── project.json          ← BroadsetProject JSON
├── assets/               ← embedded asset files
│   ├── logo.png
│   └── font-bold.woff2
└── thumbnails/           ← optional preview images
    └── doc-scorebug.png
```

Detection: ZIP files start with `PK` magic bytes; plain JSON starts with `{`.

#### Acceptance Criteria

- [ ] Given a `.bsp` file containing valid JSON, it is parsed as a BroadsetProject
- [ ] Given a `.bsp` file that is a ZIP container, `project.json` inside it is parsed as a BroadsetProject
- [ ] Given a project with `$schema` set, the field is preserved on round-trip

---

### Requirement: Template Groups (Multi-Format)

A project MAY contain a `templateGroups` array at the project level. Each `TemplateGroup` links related documents that represent the same graphic adapted for different output formats (e.g., 16:9 HD, 9:16 vertical for social media, 1:1 square for Instagram).

A `TemplateGroup` MUST contain:

- `groupId`: non-empty string, unique within the project
- `name`: human-readable group name
- `members`: array of `TemplateGroupMember`, at least 1 member

A `TemplateGroupMember` MUST contain:

- `documentId`: references a document in the project's `documents` array
- `role`: `'16:9'` | `'9:16'` | `'1:1'` | `'4:3'` | `'custom'` — the aspect ratio / format role
- `label` (optional): human-readable label (e.g., `'Social Vertical'`, `'HD Primary'`)

Template groups are metadata — they do NOT affect document behavior, rendering, or validation. They exist to help editors and playout systems present related variants together. A document MAY appear in multiple template groups. A document MAY appear in zero template groups.

#### Scenario: HD and vertical variants linked

- GIVEN a project with two documents: `doc-hd` (1920×1080) and `doc-vertical` (1080×1920)
- AND a template group `{ groupId: 'tg-scorebug', name: 'Scorebug', members: [{ documentId: 'doc-hd', role: '16:9' }, { documentId: 'doc-vertical', role: '9:16' }] }`
- WHEN the project is validated
- THEN validation succeeds and both documents are linked in the group

#### Scenario: Template group with custom role

- GIVEN a member with `role: 'custom'` and `label: 'Ultra-wide Banner'`
- WHEN the template group is validated
- THEN validation succeeds

#### Scenario: Member references non-existent document

- GIVEN a template group member with `documentId: 'doc-missing'`
- AND no document with that ID exists in the project
- WHEN the project is validated
- THEN validation fails

#### Scenario: Empty template groups array is valid

- GIVEN a project with `templateGroups: []`
- WHEN the project is validated
- THEN validation succeeds (template groups are optional)

#### Acceptance Criteria

- [ ] Given a valid template group with members referencing existing documents, validation succeeds
- [ ] Given a member referencing a non-existent document, validation fails
- [ ] Given duplicate groupId values, validation fails
- [ ] Given an empty templateGroups array, validation succeeds
- [ ] Given a document appearing in multiple template groups, validation succeeds
- [ ] Given a template group with role 'custom', validation succeeds
- [ ] Given templateGroups on round-trip serialization, all data is preserved

---

### Requirement: Extension Points

Every major type (`BroadsetProject`, `BroadsetDocument`, `BroadsetElement`, `Page`) MAY carry an `extensions` field: a record of string keys to unknown JSON values.

- Keys SHOULD use reverse-domain namespacing (e.g., `'tv.vizrt'`, `'io.caspar'`)
- Parsers MUST preserve unrecognized extensions on round-trip
- Parsers MUST NOT fail on unknown extensions
- Extension values MUST be valid JSON (no functions, no undefined)

#### Scenario: Unknown extensions preserved

- GIVEN a project with `extensions: { 'com.example': { foo: 42 } }`
- WHEN the project is serialized and re-parsed
- THEN `extensions['com.example'].foo` is `42`

#### Acceptance Criteria

- [ ] Given a project with extension data, the extensions survive JSON round-trip
- [ ] Given unrecognized extension keys, the parser does not fail

---

## Spec Gaps

- [ ] **Proposed canonical package/interchange split:** ADR-008 proposes making checksummed ZIP the only canonical `.bsp` representation and moving raw JSON to a separate extension/MIME type. The current plain-JSON-or-ZIP `.bsp` contract and `application/vnd.broadset.project+json` MIME remain authoritative until explicit maintainer ratification, migration policy, codec limits, and compatibility tests are approved.
