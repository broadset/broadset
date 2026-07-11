# BroadsetProject v1 — Canonical JSON Format Reference

## Purpose

Defines the authoritative persisted names, shapes, ownership scopes, validation stages, serialization rules, resolution order, and package identity for Broadset Project Format v1. Behavioral details are expanded in the linked model sub-specs.

## Published Model Foundation

`@broadset/model` publishes the v1 structural schemas, whole-project semantic validator, bounded JSON loader, canonical serializer, and semantic hasher through its package root. The primary entry points are:

| Entry point                                | Contract                                                                          |
| ------------------------------------------ | --------------------------------------------------------------------------------- |
| `BroadsetProjectV1` / `BroadsetDocumentV1` | Canonical persisted root and document types                                       |
| `broadsetProjectV1Schema`                  | Strict structural parser; inserts no runtime defaults                             |
| `validateBroadsetProjectV1Semantics`       | Whole-graph reference, identity, type, ordering, constraint, and cycle validation |
| `parseProjectV1Unknown`                    | Bounded validation for an already decoded unknown value                           |
| `loadProjectV1Json`                        | Bounded JSON-text loading with typed quarantine and source-text preservation      |
| `canonicalizeProjectV1`                    | Lossless canonical JSON serialization of the complete project                     |
| `computeProjectSemanticHashV1`             | SHA-256 over the canonical semantic projection defined by this specification      |

This published foundation is the greenfield application cutover target. It does not make v1 the active editor, renderer, player, persistence, or format-adapter representation by itself. Those consumers migrate in the remaining cutover programs, and the final program deletes the unversioned legacy model. No v1 loader accepts legacy Broadset-owned records, and no compatibility alias changes persisted field names.

#### Acceptance Criteria

- [ ] Given a package-root-only consumer, it can structurally parse, semantically validate, canonicalize, hash, and reload a valid v1 project
- [ ] Given canonical project JSON containing nested extension JSON values, a complete load and canonicalize round trip preserves the decoded JSON value
- [ ] Given structurally or semantically invalid JSON text, loading returns typed diagnostics and the exact original text without inserting defaults
- [ ] Given a legacy Broadset-owned project shape, the v1 load boundary quarantines it rather than migrating or aliasing it

## Requirements

### Requirement: Foundational Values

Core fields use strict typed JSON. Every number MUST be finite. Declared integers MUST be JSON-safe integers. IDs MUST be non-empty Unicode strings without control characters. UTC timestamps MUST be timezone-qualified ISO 8601 values. Property pointers use RFC 6901 JSON Pointer.

```ts
type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue };

type ValueType =
  | 'null'
  | 'boolean'
  | 'integer'
  | 'number'
  | 'string'
  | 'date-time'
  | 'length'
  | 'angle'
  | 'color'
  | 'asset'
  | 'point2d'
  | 'point3d'
  | 'list'
  | 'object';

type AssetKind = 'image' | 'video' | 'audio' | 'font' | 'icc-profile' | 'data' | 'vector' | 'foreign';

type AssetValueSchema = {
  readonly kind: 'asset';
  readonly acceptedAssetKinds?: readonly AssetKind[];
  readonly acceptedMediaTypes?: readonly string[];
};

interface EntityAddress {
  readonly projectId: Id;
  readonly documentId?: Id;
  readonly pageId?: Id;
  readonly entityKind: string;
  readonly entityId: Id;
  readonly instancePath?: readonly Id[];
}
```

`pageId` is required for page-root and page-descendant addresses because root-instance identity is
page-local. Page-descendant addresses also require `documentId` and a page-relative `instancePath`
beginning with the addressed root-instance ID. Project-owned resources and project identity forbid
`documentId`, `pageId`, and `instancePath`. Document-owned definitions require `documentId` and
forbid `pageId`; this includes `page`, whose canonical address uses `documentId`, `entityKind:
'page'`, and the page ID as `entityId`. A page address carrying the same ID again in `pageId` is
invalid. Page-root addresses use `documentId`, `pageId`, and the root-instance ID as `entityId`
without `instancePath`; page descendants use a root-prefixed `instancePath`. Component-definition
scope also forbids `pageId`. An `InstanceAddress` remains
page-local because its containing `PageDefinition` supplies the page context.

#### Acceptance Criteria

- [ ] Given finite values and valid typed primitives, structural validation succeeds
- [ ] Given `NaN`, infinity, an unsafe declared integer, or a forbidden control character, validation fails
- [ ] Given an RFC 6901 pointer, its target is evaluated against the addressed entity schema

### Requirement: Canonical Project Root

```ts
interface BroadsetProjectV1 {
  readonly $schema: 'https://schema.broadset.dev/v1/project.schema.json';
  readonly format: 'broadset-project';
  readonly schemaVersion: 1;
  readonly id: Id;
  readonly metadata: ProjectMetadata;
  readonly resources: ProjectResources;
  readonly documents: readonly BroadsetDocumentV1[];
  readonly templateGroups: readonly TemplateGroup[];
  readonly interop: InteropRegistry;
  readonly extensions: readonly ExtensionEnvelope[];
}
```

| Field            | Required | Contract                                                    |
| ---------------- | -------- | ----------------------------------------------------------- |
| `$schema`        | Yes      | Exact canonical v1 schema URI                               |
| `format`         | Yes      | Exact literal `broadset-project`                            |
| `schemaVersion`  | Yes      | Exact safe integer `1`                                      |
| `id`             | Yes      | Stable project identity                                     |
| `metadata`       | Yes      | Semantic project metadata                                   |
| `resources`      | Yes      | Project-owned reusable resources                            |
| `documents`      | Yes      | Non-empty ordered document collection                       |
| `templateGroups` | Yes      | Ordered relationships among independently authored variants |
| `interop`        | Yes      | Broadset-owned external source and round-trip preservation  |
| `extensions`     | Yes      | Ordered generic extension envelopes                         |

Unknown root fields are invalid. Unsupported identities are quarantined with typed diagnostics and original bytes.

#### Acceptance Criteria

- [ ] Given the exact root identity and complete vocabulary, project parsing proceeds
- [ ] Given an unknown root field or unsupported identity value, structural loading fails with a typed diagnostic
- [ ] Given invalid input bytes, the loader preserves them for recovery

### Requirement: Project Metadata

```ts
interface ProjectMetadata {
  readonly name: string;
  readonly createdAt: UtcTimestamp;
  readonly updatedAt: UtcTimestamp;
  readonly description?: string;
  readonly authors?: readonly string[];
  readonly keywords?: readonly string[];
  readonly rights?: string;
  readonly generator?: {
    readonly name: string;
    readonly version: string;
    readonly build?: string;
  };
}
```

`updatedAt` MUST NOT precede `createdAt`. Save timestamps and package creation metadata are not project semantic fields.

#### Acceptance Criteria

- [ ] Given ordered valid UTC timestamps, metadata validation succeeds
- [ ] Given `updatedAt` preceding `createdAt`, semantic validation fails

### Requirement: Project Resources

```ts
interface ProjectResources {
  readonly assets: readonly Asset[];
  readonly fonts: readonly FontFamilyResource[];
  readonly swatches: readonly Swatch[];
  readonly variables: readonly VariableCollection[];
  readonly styles: readonly SharedStyle[];
  readonly outputProfiles: readonly OutputProfile[];
}
```

Each array is required and ordered. Resource IDs are unique in their respective project scope. See [assets.md](assets.md), [color-management.md](color-management.md), and [output-spec.md](output-spec.md).

#### Acceptance Criteria

- [ ] Given required resource arrays with unique IDs, validation succeeds
- [ ] Given duplicate IDs or wrong-kind references, semantic validation fails

### Requirement: Blob and Asset Reference

```ts
interface BlobReference {
  readonly digest: `sha256:${string}`;
  readonly byteLength: number;
  readonly mediaType: string;
  readonly source:
    | { readonly kind: 'package'; readonly path: string }
    | {
        readonly kind: 'external';
        readonly url: string;
        readonly integrity: `sha256:${string}`;
        readonly cachedDigest?: `sha256:${string}`;
      }
    | { readonly kind: 'missing'; readonly lastKnownName?: string };
}
```

Assets add stable `id`, discriminating `kind`, `name`, typed kind metadata, and optional provenance, license, and derivatives. Element media payloads reference asset IDs rather than URLs or paths.

The closed `Asset` union has exactly the `image`, `video`, `audio`, `font`, `icc-profile`, `data`, `vector`, and `foreign` discriminants. Their exact metadata, provenance, license, derivative, font-family, variable, and shared-style records are defined in [assets.md](assets.md). Font faces discriminate an `asset` source from a `system` source; system faces never carry a pretend asset reference. Shared-style fragments are stable ordered RFC 6901 pointer and `TypedValue` entries or an explicit style alias, not an open JSON property bag.

`ColorValue` and `Swatch` use the exact records and per-space numeric ranges in [color-management.md](color-management.md). Swatches discriminate `process` from `spot`, spot swatches retain an alternate concrete process color, and the only v1 swatch-reference adjustment is a finite normalized `tint`.

#### Acceptance Criteria

- [ ] Given a matching digest, byte length, media type, and source variant, blob validation succeeds
- [ ] Given every closed asset or resource discriminant with its exact metadata, structural validation succeeds
- [ ] Given an unknown asset metadata field, ambiguous font source, open shared-style property bag, or recursive swatch definition, structural validation fails
- [ ] Given a nonexistent asset ID, semantic validation fails rather than selecting an implicit fallback URL

### Requirement: Template Groups

```ts
interface TemplateGroup {
  readonly id: Id;
  readonly name: string;
  readonly members: readonly {
    readonly id: Id;
    readonly documentId: Id;
    readonly role:
      | { readonly kind: 'aspect-ratio'; readonly ratio: readonly [number, number] }
      | { readonly kind: 'named'; readonly name: string };
    readonly label?: string;
    readonly outputProfileIds: readonly Id[];
  }[];
}
```

Member IDs are unique per group. Aspect ratios use reduced positive safe integers. Document and profile references resolve.

#### Acceptance Criteria

- [ ] Given resolving members with valid roles, validation succeeds
- [ ] Given an unresolved reference or invalid ratio, semantic validation fails

### Requirement: Canonical Document

```ts
interface BroadsetDocumentV1 {
  readonly id: Id;
  readonly name: string;
  readonly kind: 'motion' | 'static' | 'print';
  readonly metadata?: DocumentMetadata;
  readonly surface: SurfaceDefinition;
  readonly timebase?: Timebase;
  readonly color: DocumentColorConfiguration;
  readonly elements: readonly Element[];
  readonly components: readonly ComponentDefinition[];
  readonly pages: readonly PageDefinition[];
  readonly sequences: readonly Sequence[];
  readonly lifecycle?: LifecycleDefinition;
  readonly stateMachines: readonly StateMachine[];
  readonly viewModels: readonly ViewModel[];
  readonly bindings: readonly Binding[];
  readonly selectedVariableModes: Readonly<Record<Id, Id>>;
  readonly outputProfileIds: readonly Id[];
  readonly extensions: readonly ExtensionEnvelope[];
}

interface DocumentMetadata {
  readonly description?: string;
  readonly authors: readonly string[];
  readonly keywords: readonly string[];
  readonly rights?: string;
}
```

| Field                   | Required                      | Contract                                                |
| ----------------------- | ----------------------------- | ------------------------------------------------------- |
| `id`, `name`, `kind`    | Yes                           | Stable identity and motion/static/print discriminator   |
| `metadata`              | No                            | Document-specific semantic metadata                     |
| `surface`               | Yes                           | Size, unit, coordinate system, background, guide intent |
| `timebase`              | Motion: yes; static/print: no | Exact rational frame and tick contract                  |
| `color`                 | Yes                           | Working space, compositing, optional output intent      |
| `elements`              | Yes                           | Ordered flat scene definitions                          |
| `components`            | Yes                           | Document-owned masters                                  |
| `pages`                 | Yes, non-empty                | Ordered authoring/output instances                      |
| `sequences`             | Yes                           | Stable declarative animation definitions                |
| `lifecycle`             | No                            | IN, HOLD/UPDATE, and OUT bindings                       |
| `stateMachines`         | Yes                           | Stable declarative state graphs                         |
| `viewModels`            | Yes                           | Typed runtime data contracts                            |
| `bindings`              | Yes                           | Typed property-target expressions                       |
| `selectedVariableModes` | Yes                           | Document variable-mode selections                       |
| `outputProfileIds`      | Yes                           | References to project output profiles                   |
| `extensions`            | Yes                           | Generic extension envelopes                             |

Unknown document fields are invalid. At least one page is required.

#### Acceptance Criteria

- [ ] Given the complete exact document vocabulary, structural validation succeeds
- [ ] Given an unknown document field, missing page, or motion document without timebase, validation fails

### Requirement: Surface and Color

```ts
interface SurfaceDefinition {
  readonly size: readonly [number, number];
  readonly unit: 'px' | 'mm' | 'in';
  readonly dpi: number;
  readonly coordinateSystem: {
    readonly origin: 'top-left';
    readonly xAxis: 'right';
    readonly yAxis: 'down';
  };
  readonly background: Paint;
  readonly padding: Insets;
  readonly guides: readonly GuideDefinition[];
  readonly broadcastSafeAreas: readonly NamedPercentageInsets[];
  readonly prepress?: { readonly bleed: Insets; readonly trim: Insets; readonly safe: Insets };
}

interface Insets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

interface GuideDefinition {
  readonly id: Id;
  readonly name: string;
  readonly axis: 'x' | 'y';
  readonly position: number;
  readonly locked: boolean;
}

interface NamedPercentageInsets {
  readonly id: Id;
  readonly name: string;
  readonly insets: readonly [number, number, number, number];
}

type ColorSpaceDefinition =
  | {
      readonly kind: 'named';
      readonly space: 'srgb' | 'display-p3' | 'rec2020' | 'lab' | 'oklab' | 'oklch' | 'cmyk' | 'gray';
    }
  | {
      readonly kind: 'icc';
      readonly iccProfileAssetId: Id;
      readonly model: 'rgb' | 'cmyk' | 'gray' | 'lab';
    };

interface DocumentColorConfiguration {
  readonly workingSpace: ColorSpaceDefinition;
  readonly compositing: 'linear-premultiplied';
  readonly outputIntent?: {
    readonly iccProfileAssetId: Id;
    readonly renderingIntent: 'perceptual' | 'relative-colorimetric' | 'saturation' | 'absolute-colorimetric';
    readonly blackPointCompensation: boolean;
  };
}
```

Surface dimensions and DPI are positive finite values. Spatial values use the surface unit unless explicitly percentage or dimensionless. ICC references resolve to compatible profile assets.

#### Acceptance Criteria

- [ ] Given a valid surface and working color definition, validation succeeds
- [ ] Given zero-area surface or wrong-kind ICC reference, validation fails

### Requirement: Element Base and Geometry

```ts
interface ElementBase {
  readonly id: Id;
  readonly kind: ElementKind;
  readonly name: string;
  readonly parentId: Id | null;
  readonly locked: boolean;
  readonly hiddenInEditor: boolean;
  readonly geometry: ElementGeometry;
  readonly appearance: Appearance;
  readonly accessibility?: ElementAccessibility;
  readonly sharedStyleIds: readonly Id[];
  readonly extensions: readonly ExtensionEnvelope[];
}

interface ElementGeometry {
  readonly bounds: { readonly width: number; readonly height: number };
  readonly transform:
    | { readonly kind: 'affine2d'; readonly matrix: readonly [number, number, number, number, number, number] }
    | {
        readonly kind: 'matrix3d';
        readonly matrix: readonly [
          number,
          number,
          number,
          number,
          number,
          number,
          number,
          number,
          number,
          number,
          number,
          number,
          number,
          number,
          number,
          number,
        ];
      };
  readonly origin: readonly [number, number, number];
}
```

The matrix3d array has exactly sixteen finite values. Bounds are strictly positive. Elements are in depth-first preorder with contiguous subtrees. The closed element kinds are text, image, vector, group, component-instance, video, audio, clock, ticker, qrcode, foreign, and plugin.

#### Acceptance Criteria

- [ ] Given a valid closed element variant in canonical hierarchy order, validation succeeds
- [ ] Given generic overloaded payloads, invalid hierarchy order, or wrong matrix length, validation fails

### Requirement: Structured Text and Appearance

Text uses stable ordered paragraph and run records with inert Unicode and typed properties. Appearance uses opacity, blend mode, isolation, ordered stable fills, strokes, effects, and optional typed clip and mask. Paint is `none`, `solid`, `gradient`, `pattern`, or `picture`.

See [element.md](element.md), [style.md](style.md), and [color-management.md](color-management.md).

#### Acceptance Criteria

- [ ] Given structured text and typed appearance layers, structural validation succeeds
- [ ] Given authored HTML, raw CSS paint, or executable effect markup, structural validation fails

### Requirement: Components

```ts
interface ComponentDefinition {
  readonly id: Id;
  readonly name: string;
  readonly elements: readonly ComponentElement[];
  readonly rootElementIds: readonly Id[];
  readonly sequences: readonly Sequence[];
  readonly exposedProperties: readonly ExposedProperty[];
  readonly extensions: readonly ExtensionEnvelope[];
}

interface ExposedProperty {
  readonly id: Id;
  readonly label: string;
  readonly group: string;
  readonly valueSchema: ValueSchema;
  readonly defaultValue: TypedValue;
  readonly constraints: readonly ExposedPropertyConstraint[];
  readonly bindings: readonly { readonly id: Id; readonly target: PropertyTarget }[];
}

type ExposedPropertyConstraint =
  | { readonly kind: 'numeric-range'; readonly minimum?: number; readonly maximum?: number; readonly step?: number }
  | { readonly kind: 'string-length'; readonly minimum?: number; readonly maximum?: number }
  | { readonly kind: 'allowed-values'; readonly values: readonly TypedValue[] };
```

Component element identity is local to its definition. Nested component instances are valid in a component-local collection when the dependency graph remains acyclic. Instance values address stable exposed-property IDs. See [components.md](components.md).

#### Acceptance Criteria

- [ ] Given acyclic nested components and typed exposed values, validation succeeds
- [ ] Given a dependency cycle or invalid exposed-property value, semantic validation fails
- [ ] Given an exposed property without a binding, duplicate binding IDs, or a constraint incompatible with its value schema, validation fails

### Requirement: Pages and Instances

```ts
interface PageDefinition {
  readonly id: Id;
  readonly name: string;
  readonly locale?: string;
  readonly notes?: TextBody;
  readonly rootInstances: readonly PageRootInstance[];
  readonly descendantOverrides: readonly DescendantOverride[];
  readonly selectedVariableModes: Readonly<Record<Id, Id>>;
  readonly selectedSampleDataSets: Readonly<Record<Id, Id>>;
  readonly sequenceId?: Id;
  readonly extensions: readonly ExtensionEnvelope[];
}

interface PageRootInstance {
  readonly id: Id;
  readonly elementId: Id;
  readonly visible?: boolean;
  readonly transform?: ElementGeometry['transform'];
  readonly overrides: readonly TypedOverride[];
  readonly componentPropertyValues: readonly ExposedPropertyValue[];
}
```

Root-instance order is root z-order. Root transforms are surface-relative; descendant local transforms remain parent-relative. Descendant overrides use stable root and nested instance paths. Orphan references are invalid.

`selectedSampleDataSets` maps each selected view-model ID to exactly one sample-data-set ID owned by
that view model. The map is required and may be empty. Every key and value MUST resolve as a pair;
sample-data-set IDs are not resolved globally across view models.

#### Acceptance Criteria

- [ ] Given repeated roots with distinct instance IDs, each resolves independently
- [ ] Given equal root-instance IDs on different pages, page-aware addresses resolve independently
- [ ] Given one selected sample data set per view model, every map key and value resolves in that view model
- [ ] Given an orphan override or invalid nested path, semantic validation rejects the project

### Requirement: View Models, Expressions, and Bindings

View models contain stable typed fields and sample data. Bindings combine stable property targets with closed expression ASTs, optional deterministic formatter pipelines, and typed fallbacks. Expressions contain no arbitrary code or unparsed expression string.

The v1 safe-function registry contains `coalesce`, `length`, `lowercase`, `uppercase`, `round`, `min`, `max`, `clamp`, and `format-date`. The v1 formatter registry contains `number`, `date-time`, `duration`, `prefix`, `suffix`, and `truncate`. Their exact structural signatures and formatter transitions are defined in [data-schema.md](data-schema.md).

#### Acceptance Criteria

- [ ] Given a type-correct expression and target, validation succeeds
- [ ] Given a missing field, unknown function, or incompatible result, validation fails

### Requirement: Exact Time and Sequences

```ts
interface Timebase {
  readonly frameRate: { readonly numerator: number; readonly denominator: number };
  readonly ticksPerSecond: number;
  readonly timecode: { readonly nominalFramesPerSecond: number; readonly dropFrame: boolean };
}

interface Sequence {
  readonly id: Id;
  readonly name: string;
  readonly durationTicks: number;
  readonly workArea?: readonly [number, number];
  readonly loop: LoopDefinition;
  readonly tracks: readonly Track[];
  readonly markers: readonly Marker[];
  readonly cues: readonly Cue[];
  readonly childClips: readonly SequenceClip[];
}
```

Rates are reduced positive rationals and frame starts map to exact integer ticks. Tracks, keyframes, markers, cues, state machines, and transitions use stable identity. Keyframes are homogeneous with their property track and every non-final keyframe has explicit outgoing interpolation. Child clips use stable sequence IDs, bounded half-open ranges, explicit remap, and explicit deterministic stagger seeds. Lifecycle definitions and state machines are document-owned; component sequences remain valid. Stale animation references are rejected by semantic validation. The exact closed v1 field tables are defined in [timebase.md](timebase.md) and [animation.md](animation.md).

#### Acceptance Criteria

- [ ] Given exact time and valid stable animation targets, validation succeeds
- [ ] Given fractional ticks, incompatible keyframes, or stale references, validation fails

### Requirement: Closed Output Profiles

`resources.outputProfiles` is a strict discriminated union on `kind: 'motion' | 'print'`. Motion
profiles contain exact rational pixel/frame geometry, scan, color signal, dynamic-range, alpha,
audio, safe-area, and runtime intent. Print profiles contain physical page intent, ICC output
intent, bleed/trim edges, spot/overprint policy, and a closed PDF target. Unknown fields and
cross-kind fields are invalid. See [output-spec.md](output-spec.md) for the exact v1 field table.

#### Acceptance Criteria

- [ ] Given every required field of one output-profile variant, strict validation succeeds
- [ ] Given a missing required field, unknown field, or field from the other variant, strict validation fails

### Requirement: Interop and Extensions

```ts
interface InteropRegistry {
  readonly sources: readonly InteropSource[];
  readonly records: readonly InteropRecord[];
}

interface InteropSource {
  readonly id: Id;
  readonly format: string;
  readonly sourceAssetId: Id;
  readonly importerVersion: string;
  readonly importedAt: UtcTimestamp;
}

interface InteropRecord {
  readonly id: Id;
  readonly sourceId: Id;
  readonly target: EntityAddress;
  readonly baselineSemanticHash: Sha256Digest;
  readonly mappingConfidence: number;
  readonly editability: 'native' | 'partial' | 'appearance-only';
  readonly warnings: readonly InteropDiagnostic[];
  readonly sourceIdentity?: JsonValue;
  readonly preservedBlob?: BlobReference;
  readonly previewAssetId?: Id;
}

interface InteropDiagnostic {
  readonly code: string;
  readonly severity: 'info' | 'warning' | 'error';
  readonly message: string;
  readonly dimension: 'appearance' | 'editability' | 'semantics' | 'output';
  readonly pointer?: string;
  readonly entity?: EntityAddress;
  readonly remediation?: string;
}

interface ExtensionEnvelope {
  readonly namespace: string;
  readonly schema: string;
  readonly version: number;
  readonly payload: JsonValue;
}
```

Interop records retain source, stable target, baseline semantic hash, optional preserved blob and preview, mapping confidence, editability, and warnings. Cleanliness is derived from semantic hashes. A generic extension namespace is a lowercase reverse-DNS-style name with at least two valid dot-separated labels, its schema is an absolute HTTPS URL, and its version is a positive JSON-safe integer. Unknown valid generic extension payloads are inert and preserve semantic JSON equality; malformed envelope identity is structurally invalid rather than preserved as an extension.

Interop entity addresses resolve project resources with the exact kinds `asset`, `font-family`,
`swatch`, `variable-collection`, `shared-style`, and `output-profile`. Project-owned
`template-group`, `interop-source`, and `interop-record` IDs are also addressable. These addresses
MUST omit `documentId`, `pageId`, and `instancePath`. Project identity has the same omission rule.
Document definitions require `documentId` and forbid `pageId` and `instancePath`; page-root and
page-descendant addresses require the exact owning `pageId`. Pages themselves are document-owned:
their address omits `pageId` and uses the page ID as `entityId`. Warning addresses use the identical
resolver and legality rules as record targets.

#### Acceptance Criteria

- [ ] Given valid interop and extension envelopes, round-trip preservation succeeds
- [ ] Given a malformed extension namespace, relative or non-HTTPS schema URL, or non-positive, fractional, or unsafe version, structural validation fails
- [ ] Given missing interop references or duplicate extension namespaces, semantic validation fails
- [ ] Given an interop warning without a pointer or entity, structural validation fails
- [ ] Given an interop preview referencing an asset other than image or vector, semantic validation fails
- [ ] Given an exact project-resource or other ratified project-owned address, interop resolution succeeds
- [ ] Given an address with ownership fields forbidden for its entity kind, interop resolution fails closed

### Requirement: Validation Stages

Validation proceeds in three stages:

1. Container validation enforces byte, entry, path, ratio, length, digest, manifest, and supported package-version rules.
2. Structural validation enforces strict core shapes and typed primitive constraints through Zod and published JSON Schema with equivalent acceptance.
3. Whole-project semantic validation enforces identity scopes, reference kinds, ordering, acyclicity, override legality, expression and target types, time constraints, output compatibility, color/profile compatibility, and interop integrity.

No validation stage mutates input. Open JSON is permitted only inside declared plugin, extension, and interop payload containers.
Semantic reference validation MUST index stable identities and remain near-linear for large valid
interop registries, variable/sample selections, component exposed values, and address resolution;
it MUST NOT perform a full owner-collection scan for every referenced item.
Within one semantic-validation call, each page-root hierarchy and nested-entity address scope MUST
be constructed once and reused for all root and descendant overrides targeting that root.

The structural contract is the exact intersection published by Zod and JSON Schema. Constraints
that JSON Schema can express are structural; constraints requiring projected object keys,
cross-field comparison, arbitrary-precision instant comparison, arithmetic, reference indexes, or
graph traversal are semantic. Consumers MUST use the load boundary, which executes both stages,
rather than treating successful leaf-schema parsing as complete project validation.

Absolute URI and HTTPS fields follow this same boundary: structural validation enforces the shared
scheme, whitespace, and minimum hierarchical HTTPS pattern, while semantic validation parses every
declared URL-bearing field and validates protocol, authority, credentials, host syntax, and port.
Validation occurs before URL-parser normalization, rejects malformed percent escapes and authority-confusable
backslashes, and follows typed targets so persisted override, animation, state, binding, and component values
cannot bypass hyperlink HTTPS validation. Non-literal or formatted hyperlink bindings fail closed.
Opaque extension or interop JSON strings are never inferred to be URLs, and validation never fetches
network content.

Before parsing or canonicalization, implementations enforce these v1 resource limits iteratively:
32 MiB of UTF-8 JSON text, nesting depth 256, and 250,000 visited JSON values. Excess input is
quarantined with `input-too-large`, `input-too-deep`, or `input-too-complex`; cyclic in-memory input
uses `cyclic-input`, and canonical output beyond 32 MiB uses `canonical-output-too-large`. The root
JSON Pointer is the empty string.

The closed v1 property-target matrix is:

| Entity kind     | Approved pointer(s) and resulting `ValueType`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `element`       | `/geometry/bounds/width\|height` → `length`; `/geometry/origin` → `point3d`; affine `/geometry/transform/matrix/0..3` → `number`, `/4..5` → `length`; matrix3d `/0..11\|15` → `number`, `/12..14` → `length`; `/appearance/opacity` → `number`; `/accessibility/label\|description` → `string`; image/video/audio asset ID → `asset`; video autoplay/loop/muted/controls and audio autoplay/loop → `boolean`; audio volume → `number`; clock format/timeZone/locale → `string`; ticker direction → `string`, speed/gap → `number`, repeat → `boolean`; QR value/errorCorrection → `string`, quietZone → `length`; image focalPoint → `point2d`; text layout columns → `integer`, columnGap → `length`, verticalAlignment/overflow/autoSize → `string`, textPath startOffset → `length`; group clipChildren → `boolean`; foreign previewAssetId → `asset` |
| `page-root`     | `/visible` → `boolean`; transform tuple positions use the same affine/matrix3d mapping                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `text-run`      | `/text` → `string`; `/properties/size` → `length`, color → `color`, weight → `integer`, baselineShift → `length`, tracking → `number`, hyperlink → `string`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `paragraph`     | alignment/direction/hyphenation → `string`; spacing/indents → `length`; keep flags → `boolean`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `fill`          | enabled → `boolean`, opacity → `number`, solid color → `color`, picture/pattern assetId → `asset`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `stroke`        | fill mappings plus width/dashOffset → `length`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `effect`        | enabled → `boolean`, opacity → `number`, radius/spread/depth/soften → `length`, offset/scale → `point2d`, color/highlightColor/shadowColor → `color`, amount → `number`, angle/altitude → `angle`, assetId → `asset`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `gradient-stop` | color → `color`; opacity/offset/midpoint → `number`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `path-point`    | x/y → `length`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `guide`         | position → `length`; locked → `boolean`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

The actual element or nested variant MUST contain the conditional property before its pointer is
accepted. Stable nested entity IDs and component/page `instancePath` provide identity. Collection
array indexes are forbidden. IDs, kinds, parents, hierarchy/order, editor flags, extensions,
shared-style IDs, component IDs/property values, and raw plugin or foreign payloads are not
overridable. Asset-valued targets additionally declare compatible asset kinds: image/video/audio
element targets require their corresponding kind; foreign previews and picture/pattern paints
accept image or vector; displacement effects require image. Every override, binding, state value,
keyframe, and exposed-property binding MUST satisfy this target contract in document, component,
and page scope. `acceptedAssetKinds`, when present, is a non-empty duplicate-free closed kind set and
is independent of `acceptedMediaTypes`. A schema can feed a kind-restricted target only when it
declares an asset-kind subset; expression branches are unioned conservatively and unknown kinds
fail closed. MIME is compared only with actual resolved asset blobs, using exact ASCII
case-insensitive type/subtype equality. The model exports a pure resolver for reuse by all consumers.

#### Acceptance Criteria

- [ ] Given invalid container metadata, failure occurs before project hydration
- [ ] Given an unknown core field, both Zod and JSON Schema reject it
- [ ] Given every structural parity corpus case, Zod and the published JSON Schema return the same acceptance result
- [ ] Given a cross-reference error, semantic validation returns a stable diagnostic location
- [ ] Given excessive text, depth, node count, or an in-memory cycle, loading returns a typed quarantine result without recursion overflow
- [ ] Given an approved target on its actual entity variant, the pure resolver returns the matrix `ValueType`
- [ ] Given an array index or forbidden identity, hierarchy, runtime, extension, or raw-payload pointer, target resolution fails

### Requirement: Scene Resolution

All consumers resolve in this exact order:

1. element and component definition defaults;
2. component-instance exposed-property values;
3. page root and descendant overrides;
4. variable-mode resolution;
5. sample or live data bindings;
6. state-machine values;
7. sequence evaluation and runtime lifecycle state.

The immutable DOM-free `ResolvedSceneSnapshot` contains expanded identity, provenance, local and world geometry, resolved appearance, text, resources, data, exact tick state, and explicit fallback records. A structurally invalid project produces no partial scene.

#### Acceptance Criteria

- [ ] Given conflicts across layers, the later defined layer wins and provenance records the chain
- [ ] Given identical resolution inputs, every visual and export consumer obtains a semantically identical snapshot

### Requirement: Canonical JSON Serialization

Raw canonical JSON is UTF-8 without BOM and contains no `undefined`, functions, non-finite numbers, bigint values, lone UTF-16 surrogates, or cycles. Arrays retain semantic order; object-member order is not semantic. Human-facing JSON is pretty printed. Semantic hashes use RFC 8785 JSON Canonicalization Scheme over a defined projection excluding `metadata.updatedAt` and `metadata.generator.build`; all other project fields, including generator name and version, remain semantic. Object keys sort by UTF-16 code units and accepted numbers use ECMAScript shortest-round-trip serialization.

#### Acceptance Criteria

- [ ] Given repeated serialization of one project, semantic content and ordered arrays are stable
- [ ] Given different object-member order, canonical semantic hashing returns the same digest
- [ ] Given edge numbers, escapes, multilingual keys and values, and the published known digest vector, canonicalization matches RFC 8785 behavior
- [ ] Given a lone surrogate, non-finite number, excessive output, or cycle, canonicalization fails deterministically
- [ ] Given runtime indexes or materialized defaults, they do not enter canonical serialization

### Requirement: File and Package Identity

Portable `.bsp` is a checksummed ZIP package with MIME `application/vnd.broadset.project`. Raw JSON interchange uses `.broadset.json` with MIME `application/vnd.broadset.project+json`.

```text
project.bsp
  manifest.json
  project.json
  blobs/sha256/<digest>
  previews/<document-or-page-id>.<ext>
  optional-history/<snapshot-id>.json
```

The manifest lists every entry with normalized path, media type, byte length, and SHA-256 digest, plus project JSON integrity, package format/version, tool metadata, and optional preview/history roles. Unlisted entries are invalid. Optional history never changes `project.json` semantics.

#### Acceptance Criteria

- [ ] Given a valid `.bsp`, manifest and every listed entry pass length and digest checks before hydration
- [ ] Given raw project JSON, its file identity is `.broadset.json`, not `.bsp`
- [ ] Given an unlisted, duplicate, traversing, absolute, backslash, or symlink entry, container validation fails

### Requirement: Load, Recovery, and Snapshot Boundary

Loading returns either a validated project with diagnostics or a quarantined result containing typed diagnostics, original bytes, and optional last-valid project. Parsing never substitutes a demo or default project. Save is atomic and preserves the previous valid snapshot until replacement verification and commit complete.

Canonical snapshots exclude UI state, playback state, undo, operation logs, journals, CRDT metadata, presence, sync cursors, caches, shaped glyphs, thumbnails, runtime indexes, and render plans.

#### Acceptance Criteria

- [ ] Given valid input, loading returns the complete project and diagnostics
- [ ] Given invalid input, loading quarantines original bytes and never returns a fabricated project
- [ ] Given interrupted save, the previous verified snapshot remains recoverable

### Requirement: Root Vocabulary Example

The following illustrates required root ownership and vocabulary. It intentionally leaves `documents` empty so the following paragraph can state the remaining semantic requirement explicitly.

```json
{
  "$schema": "https://schema.broadset.dev/v1/project.schema.json",
  "format": "broadset-project",
  "schemaVersion": 1,
  "id": "project-example",
  "metadata": {
    "name": "Example",
    "createdAt": "2026-07-10T00:00:00Z",
    "updatedAt": "2026-07-10T00:00:00Z"
  },
  "resources": {
    "assets": [],
    "fonts": [],
    "swatches": [],
    "variables": [],
    "styles": [],
    "outputProfiles": []
  },
  "documents": [],
  "templateGroups": [],
  "interop": { "sources": [], "records": [] },
  "extensions": []
}
```

A valid project replaces `documents` with at least one complete document containing at least one page.

#### Acceptance Criteria

- [ ] Given the illustrated root with a complete valid document added, canonical validation succeeds
- [ ] Given the illustrative empty `documents` array as literal input, semantic validation fails

## Spec Gaps

- Full field tables for every discriminated leaf variant are generated alongside the published JSON Schema and must preserve the contracts in these sub-specs.

## Non-Goals

- Compatibility parsing of legacy Broadset-owned draft shapes
- Runtime/editor state serialization
- Producer-specific source schemas
- Renderer or exporter implementation details
