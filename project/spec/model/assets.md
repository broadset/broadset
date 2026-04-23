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

### Requirement: Image Asset Intrinsic Dimensions

Image assets (`kind: 'image'`) MUST declare intrinsic pixel dimensions so exporters (SVG `<image>`, PDF image XObject bounding box, PPTX picture frame geometry) can emit coordinates without decoding the byte blob. The asset's `source` continues to locate the bytes (URL / embedded / file) but the dimensions MUST be present on the asset record:

- `width`: positive integer — intrinsic pixel width
- `height`: positive integer — intrinsic pixel height

Both fields MUST be positive integers. Zero, negative, and non-integer values are rejected at the model boundary. Byte blobs remain `assetId`-keyed and elements reference them by ID (see existing `Element-to-Asset Reference` requirement above).

#### Scenario: Well-formed image asset

- GIVEN an asset `{ id: 'asset-logo', kind: 'image', name: 'Logo', mimeType: 'image/png', source: { type: 'url', url: '...' }, width: 512, height: 256 }`
- WHEN the asset is validated
- THEN validation succeeds

#### Scenario: Image asset without width

- GIVEN an image asset missing `width`
- WHEN the asset is validated
- THEN validation fails

#### Scenario: Image asset with zero or negative dimension

- GIVEN an image asset with `width: 0` or `height: -1`
- WHEN the asset is validated
- THEN validation fails

#### Scenario: Image asset with non-integer dimension

- GIVEN an image asset with `width: 1.5`
- WHEN the asset is validated
- THEN validation fails

#### Acceptance Criteria

- [ ] Given an image asset with positive integer width and height, validation succeeds
- [ ] Given an image asset missing width or height, validation fails
- [ ] Given an image asset with zero or negative dimensions, validation fails
- [ ] Given an image asset with non-integer dimensions, validation fails

---

### Requirement: Font Assets

Font assets (`kind: 'font'`) carry the font file data used by text elements. When a document references a `fontFamily` that matches a font asset name, the font MUST be loaded from the asset before rendering. The project's `settings.fonts` array (see [project.md](project.md)) declares available font families; each font family SHOULD have corresponding font assets for used weights/styles.

#### Acceptance Criteria

- [ ] Given a font asset, it can be loaded and applied to text elements
- [ ] Given a fontFamily matching a font asset name, the font is loaded from assets

---

### Requirement: Font Asset Fidelity Fields

Font assets MUST carry the metadata every format exporter (PDF, PPTX, SVG, PSD) needs to round-trip a font embed without re-parsing the byte blob. In addition to the shared asset base fields, each font asset MUST declare:

- `format`: one of `'woff2' | 'ttf' | 'otf'` — the on-disk font format. Drives SVG `@font-face` `format(...)` hints, PDF `/Subtype` selection, and PPTX font embed routing.
- `postScriptName`: the canonical PostScript name (e.g. `Inter-Regular`). Required for PDF `/BaseFont` and for cross-format identification. MUST match `[A-Za-z0-9._+-]+` — whitespace and reserved punctuation are rejected at the model boundary.
- `familyName`: the human-readable CSS / display family name (e.g. `Inter`). Required for editor font pickers, CSS `font-family` keying, and PPTX `rPr` typeface attributes.
- `subsetRanges?`: optional array of inclusive `{ start, end }` Unicode codepoint ranges declaring the font's glyph coverage. Consumed by the shared subsetting pipeline (`_shared/fonts/subset.ts`). Each endpoint MUST be an integer codepoint in `[0, 0x10FFFF]` with `start <= end`.

#### Scenario: Well-formed font asset

- GIVEN an asset `{ id: 'asset-inter', kind: 'font', name: 'Inter', mimeType: 'font/woff2', source: { type: 'embedded', dataUri: '...' }, format: 'woff2', postScriptName: 'Inter-Regular', familyName: 'Inter' }`
- WHEN the asset is validated
- THEN validation succeeds

#### Scenario: Font asset without PostScript name

- GIVEN a font asset missing the `postScriptName` field
- WHEN the asset is validated
- THEN validation fails

#### Scenario: Font asset with whitespace in PostScript name

- GIVEN a font asset with `postScriptName: 'Inter Regular'`
- WHEN the asset is validated
- THEN validation fails — PostScript names must not contain whitespace

#### Scenario: Font asset with reversed subset range

- GIVEN a font asset with `subsetRanges: [{ start: 100, end: 10 }]`
- WHEN the asset is validated
- THEN validation fails — range start MUST be <= end

#### Scenario: Font asset with out-of-Unicode codepoint

- GIVEN a font asset with `subsetRanges: [{ start: 0, end: 0x110000 }]`
- WHEN the asset is validated
- THEN validation fails — codepoints MUST be in `[0, 0x10FFFF]`

#### Acceptance Criteria

- [ ] Given a font asset with `format` ∈ `{woff2, ttf, otf}`, a non-empty PostScript name matching `[A-Za-z0-9._+-]+`, and a non-empty family name, validation succeeds
- [ ] Given a font asset missing `format`, `postScriptName`, or `familyName`, validation fails
- [ ] Given a font asset with a `format` value outside `{woff2, ttf, otf}`, validation fails
- [ ] Given a `postScriptName` containing whitespace or reserved punctuation, validation fails
- [ ] Given a `subsetRanges` entry where `start > end`, validation fails
- [ ] Given a `subsetRanges` entry with a codepoint below 0 or above `0x10FFFF`, validation fails
- [ ] Given a `subsetRanges` entry with a non-integer codepoint, validation fails

---

## Spec Gaps

_None — all requirements have acceptance criteria._

---

## Non-Goals

- Asset upload/management UI → see `project/spec/ui/`
- Asset CDN hosting → application-level infrastructure concern
- DRM or asset licensing → out of scope
