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

The persisted records are exactly:

```ts
interface AssetBase {
  readonly id: Id;
  readonly name: string;
  readonly blob: BlobReference;
  readonly provenance?:
    | { readonly kind: 'created'; readonly application: string; readonly createdAt?: UtcTimestamp }
    | {
        readonly kind: 'imported';
        readonly sourceName: string;
        readonly sourceUri?: string;
        readonly importer: string;
        readonly importedAt: UtcTimestamp;
      };
  readonly license?: {
    readonly name: string;
    readonly spdxIdentifier?: string;
    readonly url?: string;
    readonly attribution?: string;
    readonly permissions: {
      readonly embedding: boolean;
      readonly modification: boolean;
      readonly redistribution: boolean;
    };
  };
  readonly derivatives?: readonly {
    readonly id: Id;
    readonly role: 'preview' | 'proxy' | 'thumbnail' | 'optimized';
    readonly name: string;
    readonly blob: BlobReference;
  }[];
}

type Asset =
  | (AssetBase & {
      readonly kind: 'image';
      readonly metadata: {
        readonly pixelWidth: number;
        readonly pixelHeight: number;
        readonly orientation: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
        readonly hasAlpha: boolean;
        readonly bitDepth: number;
        readonly colorModel: 'gray' | 'rgb' | 'cmyk' | 'lab' | 'indexed' | 'unknown';
        readonly iccProfileAssetId?: Id;
      };
    })
  | (AssetBase & {
      readonly kind: 'video';
      readonly metadata: {
        readonly pixelWidth: number;
        readonly pixelHeight: number;
        readonly frameRate: { readonly numerator: number; readonly denominator: number };
        readonly durationTicks: number;
        readonly videoCodec: string;
        readonly hasAlpha: boolean;
        readonly audioTracks: readonly {
          readonly id: Id;
          readonly codec: string;
          readonly sampleRate: number;
          readonly channelCount: number;
          readonly language?: string;
        }[];
      };
    })
  | (AssetBase & {
      readonly kind: 'audio';
      readonly metadata: {
        readonly durationTicks: number;
        readonly sampleRate: number;
        readonly channelCount: number;
        readonly channelLayout: string;
        readonly codec: string;
      };
    })
  | (AssetBase & {
      readonly kind: 'font';
      readonly metadata: {
        readonly format: 'opentype' | 'truetype' | 'woff' | 'woff2' | 'type1' | 'collection';
        readonly postScriptName: string;
        readonly family: string;
        readonly weight: number;
        readonly style: 'normal' | 'italic' | 'oblique';
        readonly stretch: number;
        readonly variableAxes: readonly {
          readonly id: Id;
          readonly tag: string;
          readonly minimum: number;
          readonly defaultValue: number;
          readonly maximum: number;
        }[];
        readonly unicodeCoverage: readonly {
          readonly id: Id;
          readonly start: number;
          readonly end: number;
        }[];
        readonly embeddingPermissions: 'installable' | 'editable' | 'preview-print' | 'restricted';
      };
    })
  | (AssetBase & {
      readonly kind: 'icc-profile';
      readonly metadata: {
        readonly profileClass:
          | 'input'
          | 'display'
          | 'output'
          | 'device-link'
          | 'color-space'
          | 'abstract'
          | 'named-color';
        readonly colorSpace: string;
        readonly profileConnectionSpace: 'xyz' | 'lab';
        readonly description: string;
        readonly identifier: string;
      };
    })
  | (AssetBase & {
      readonly kind: 'data';
      readonly metadata: {
        readonly encoding: string;
        readonly schemaUri?: string;
        readonly recordShape:
          | { readonly kind: 'opaque' }
          | {
              readonly kind: 'records' | 'tabular';
              readonly fields: readonly {
                readonly id: Id;
                readonly name: string;
                readonly valueType: ValueType;
                readonly nullable: boolean;
              }[];
            };
      };
    })
  | (AssetBase & {
      readonly kind: 'vector' | 'foreign';
      readonly metadata: {
        readonly intrinsicBounds: {
          readonly x: number;
          readonly y: number;
          readonly width: number;
          readonly height: number;
        };
        readonly safePreviewAssetId?: Id;
      };
    });
```

Pixel dimensions, sample rates, channel counts, bit depths, and Unicode scalar values are safe integers. Dimensions, sample rates, channel counts, and bit depths are positive; durations are non-negative. Frame-rate terms are reduced positive safe integers. Font axis defaults lie inclusively between their minimum and maximum; Unicode ranges are ordered and valid. Intrinsic bounds have positive finite width and height. Local IDs are unique within derivatives, audio tracks, variable axes, Unicode ranges, and data fields.

#### Acceptance Criteria

- [ ] Given an image with positive safe-integer pixel dimensions, typed metadata validation succeeds
- [ ] Given a video with an unreduced or non-positive frame-rate rational, validation fails
- [ ] Given an ICC-profile reference pointing to another asset kind, semantic validation fails

### Requirement: Font Family Resources

A font-family resource MUST define stable `id`, `familyName`, `fallbackFontIds`, and ordered `faces`. Each face has a stable ID and either references a font asset or explicitly identifies a system-only face; it MUST declare weight, style, stretch, and optional variable-axis values.

Fallback and face IDs MUST resolve to compatible resources. Export preflight MUST diagnose targets requiring embedding when no compatible embeddable face is available.

```ts
interface FontFamilyResource {
  readonly id: Id;
  readonly familyName: string;
  readonly fallbackFontIds: readonly Id[];
  readonly faces: readonly {
    readonly id: Id;
    readonly source:
      | { readonly kind: 'asset'; readonly assetId: Id }
      | { readonly kind: 'system'; readonly postScriptName: string };
    readonly weight: number;
    readonly style: 'normal' | 'italic' | 'oblique';
    readonly stretch: number;
    readonly axes?: Readonly<Record<string, number>>;
  }[];
}
```

Weights are finite integers from 1 through 1000 and stretch values are finite percentages greater than zero. Axis tags are four printable ASCII characters and axis values are finite. Face IDs and fallback font IDs are unique within the resource.

#### Acceptance Criteria

- [ ] Given a face referencing a compatible packaged font asset, validation succeeds
- [ ] Given a system-only face, validation does not pretend font bytes are packaged
- [ ] Given export requiring embedding without an embeddable face, preflight reports intentional loss or failure

### Requirement: Variable Collections

A variable collection MUST define stable `id`, `name`, ordered modes, a resolving `defaultModeId`, and ordered variables. A variable has stable `id`, `name`, `valueType`, a complete `valuesByMode` map, and optional typed alias target.

Mode, variable, and value IDs MUST be unique in their scopes. Every value MUST match the declared type. Alias targets MUST resolve, match value types, and form an acyclic graph.

```ts
interface VariableCollection {
  readonly id: Id;
  readonly name: string;
  readonly modes: readonly { readonly id: Id; readonly name: string }[];
  readonly defaultModeId: Id;
  readonly variables: readonly {
    readonly id: Id;
    readonly name: string;
    readonly valueType: ValueType;
    readonly valuesByMode: Readonly<Record<Id, TypedValue>>;
    readonly aliasOf?: { readonly collectionId: Id; readonly variableId: Id };
  }[];
}
```

#### Acceptance Criteria

- [ ] Given one type-compatible value for every collection mode, variable validation succeeds
- [ ] Given a missing mode value or mismatched value type, validation fails
- [ ] Given a direct or indirect variable-alias cycle, semantic validation fails

### Requirement: Shared Styles

Shared styles MUST have stable identity and hold reusable typed appearance or text-style fragments. They MAY reference variables and swatches. Inheritance and alias relationships MUST resolve, remain type-compatible, and be acyclic. Element-local overrides are sparse.

A shared style uses a closed typed source so the foundation does not introduce an open property bag or depend cyclically on the completed appearance/text schemas:

```ts
interface SharedStyle {
  readonly id: Id;
  readonly name: string;
  readonly kind: 'appearance' | 'text';
  readonly source:
    | {
        readonly kind: 'properties';
        readonly inheritedStyleId?: Id;
        readonly entries: readonly {
          readonly id: Id;
          readonly pointer: string;
          readonly value: TypedValue;
        }[];
      }
    | { readonly kind: 'alias'; readonly styleId: Id };
}
```

Property pointers are valid RFC 6901 JSON Pointers. Entry IDs are unique within a style. Pointer legality, value compatibility with the completed appearance/text schema, and inheritance or alias cycles are semantic checks.

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
