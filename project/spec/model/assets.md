# Model — Asset Library Specification

## Purpose

Defines the `Asset` contract — the centralized media library stored at the project level. Assets provide a single source of truth for images, videos, fonts, and other media referenced by elements across all documents in a project. Elements reference assets by `assetId` instead of embedding URLs directly. This enables asset deduplication, offline packaging, and consistent media management. See [conventions](../../README.md).

---

## Requirements

### Requirement: Asset Array on Project

The `BroadsetProject` MUST carry an `assets` array. Each asset has:

- `id`: non-empty string, unique within the project
- `name`: human-readable display name
- `kind`: `'image'` | `'video'` | `'font'` | `'audio'` | `'data'` — asset classification
- `mimeType`: MIME type string (e.g., `'image/png'`, `'video/mp4'`, `'font/woff2'`)
- `source`: `AssetSource` — where the asset data comes from
- `fileSizeBytes` (optional): file size for display/management purposes
- `metadata` (optional): `Record<string, unknown>` for asset-specific metadata (dimensions, duration, etc.)

#### Scenario: Image asset

- GIVEN an asset `{ id: 'asset-logo', name: 'Company Logo', kind: 'image', mimeType: 'image/png', source: { type: 'url', url: 'https://cdn.example.com/logo.png' } }`
- WHEN the asset is validated
- THEN validation succeeds

#### Scenario: Duplicate asset IDs rejected

- GIVEN two assets both with `id: 'asset-001'`
- WHEN the project is validated
- THEN validation fails

#### Acceptance Criteria

- [ ] Given an asset with valid id, name, kind, mimeType, and source, validation succeeds
- [ ] Given duplicate asset IDs, validation fails
- [ ] Given an empty asset ID, validation fails
- [ ] Given an unsupported kind value, validation fails

---

### Requirement: AssetSource Variants

The `source` field MUST be a discriminated union with a `type` tag:

- `{ type: 'url'; url: string }` — asset hosted at a URL (CDN, external server)
- `{ type: 'embedded'; dataUri: string }` — asset embedded as a data URI (base64-encoded)
- `{ type: 'file'; path: string }` — asset as a relative file path within a `.bsp` ZIP package

#### Scenario: URL source

- GIVEN an asset with `source: { type: 'url', url: 'https://cdn.example.com/bg.jpg' }`
- WHEN the asset is resolved
- THEN the URL is fetched

#### Scenario: Embedded data URI

- GIVEN an asset with `source: { type: 'embedded', dataUri: 'data:image/png;base64,iVBOR...' }`
- WHEN the asset is resolved
- THEN the data URI is used directly

#### Scenario: File path in ZIP package

- GIVEN a `.bsp` file containing an asset with `source: { type: 'file', path: 'assets/logo.png' }`
- WHEN the package is opened
- THEN the file is read from the ZIP at the relative path

#### Acceptance Criteria

- [ ] Given a URL source, the URL is used to fetch the asset
- [ ] Given an embedded source, the data URI is used directly
- [ ] Given a file source, the path is resolved relative to the package root
- [ ] Given a source without a valid type tag, validation fails

---

### Requirement: Element-to-Asset Reference

Elements reference assets via the optional `assetId` field. When `assetId` is present:

- The value MUST reference a valid asset in the project's `assets` array
- The asset's content is used as the element's media source
- The element's `content` field MAY serve as a fallback when the asset is unavailable

#### Scenario: Image element with asset reference

- GIVEN an image element with `assetId: 'asset-logo'`
- AND the project has an asset with `id: 'asset-logo'` and `source: { type: 'url', url: '...' }`
- WHEN the element is rendered
- THEN the image source is resolved from the asset

#### Scenario: Missing asset graceful fallback

- GIVEN an image element with `assetId: 'asset-missing'` and `content: 'fallback.png'`
- AND no asset with `id: 'asset-missing'` exists
- WHEN the element is rendered
- THEN the `content` URL is used as a fallback

#### Acceptance Criteria

- [ ] Given a valid assetId, the element uses the asset source
- [ ] Given an invalid assetId, the element falls back to its content field
- [ ] Given assetId on a text element, the field is ignored (text content is not media)

---

### Requirement: ZIP Packaging (.bsp format)

When a `BroadsetProject` is saved as a `.bsp` file, it MUST be a ZIP archive with:

- `project.json` — the serialized `BroadsetProject` JSON at the archive root
- `assets/` — directory containing asset files referenced by `source: { type: 'file', path: '...' }`

File paths in asset sources use forward slashes and are relative to the archive root. The archive MUST NOT contain absolute paths or path traversal sequences (`../`).

#### Scenario: Round-trip packaging

- GIVEN a project with two image assets and one document
- WHEN the project is saved as `.bsp` and reopened
- THEN all assets are preserved and elements render correctly

#### Scenario: Path traversal rejected

- GIVEN an asset with `source: { type: 'file', path: '../../../etc/passwd' }`
- WHEN the package is validated
- THEN validation fails — path traversal is not allowed

#### Acceptance Criteria

- [ ] Given a valid .bsp file, it contains project.json at root and asset files under assets/
- [ ] Given a round-trip save/load, all data is preserved
- [ ] Given a path with traversal sequences, validation fails
- [ ] Given a path with backslashes, validation normalizes to forward slashes

---

### Requirement: Font Assets

Font assets (`kind: 'font'`) carry the font file data used by text elements. When a document references a `fontFamily` that matches a font asset name, the font MUST be loaded from the asset before rendering. The project's `settings.fonts` array (see [project.md](project.md)) declares available font families; each font family SHOULD have corresponding font assets for used weights/styles.

#### Acceptance Criteria

- [ ] Given a font asset, it can be loaded and applied to text elements
- [ ] Given a fontFamily matching a font asset name, the font is loaded from assets

---

## Spec Gaps

_None — all requirements have acceptance criteria._

---

## Non-Goals

- Asset upload/management UI → see `project/spec/ui/`
- Asset CDN hosting → application-level infrastructure concern
- DRM or asset licensing → out of scope
