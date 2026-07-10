# Broadset Project Format v2 Design

**Status:** Approved design direction; non-authoritative until the corresponding files under `project/spec/` are reconciled and ratified.

**Date:** 2026-07-10

**Scope:** Canonical project semantics, JSON representation, package representation, validation, resolution, persistence boundary, and greenfield cutover.

## 1. Purpose

Broadset needs one project format that can represent professional broadcast, motion, screen, and print graphics without making the editor, renderer, player, or format adapters invent missing semantics.

The v2 format remains human-readable JSON. It replaces the current schema rather than extending it through compatibility branches. A portable `.bsp` file packages the canonical JSON together with content-addressed binary resources.

The design has four primary outcomes:

1. A whole project survives open, edit, save, import, export, collaboration, and recovery without silent loss.
2. Every consumer resolves the same project into the same semantic scene.
3. Invalid states are difficult to represent and rejected before reaching editor or rendering state.
4. Arbitrary third-party content is either editable, safely preserved, or represented by an explicit fallback with diagnostics.

## 2. Goals

- Keep JSON as the canonical semantic representation.
- Make `BroadsetProject` the only persisted authoring root.
- Support multiple documents, shared resources, related output variants, and complete project metadata.
- Represent element kinds with discriminated unions and type-specific payloads.
- Support exact transforms, rich text, professional appearance stacks, components, variables, live data, animation, audio cues, color management, and prepress intent.
- Preserve external-format source material without polluting core semantic fields.
- Use stable identity for every independently editable, orderable, targetable, or collaborative entity.
- Make page, component, variable, data, and animation resolution deterministic and observable.
- Separate portable project snapshots from runtime state, persistence journals, and collaboration transport state.
- Support content-addressed assets, integrity validation, deduplication, relinking, proxies, and licensing metadata.
- Provide strict Zod and JSON Schema validation plus whole-project semantic validation.
- Preserve invalid source bytes for recovery rather than silently normalizing them into a different project.

## 3. Non-goals

- Backward compatibility with the current Broadset-owned project schema.
- Persisting editor selection, viewport, open panels, active tools, presence, or transient playback state.
- Persisting derived render plans, shaped glyphs, raster caches, thumbnails, or runtime lookup indexes in `project.json`.
- Embedding undo stacks, CRDT tombstones, or a collaboration event log into the canonical snapshot.
- Treating external executable markup or scripts as native Broadset content.
- Requiring every importer to make every external construct editable. Safe explicit fallback is valid when native mapping is impossible.

## 4. Chosen approach

Broadset v2 uses a **canonical semantic graph with ordered arrays and stable IDs**.

This approach is preferred over two alternatives:

- Hardening the current schema would preserve overloaded content, generic element bags, conflicting transforms, weak animation identity, and consumer-specific page merging.
- A fully normalized event-sourced JSON database would help collaboration internals but would make the portable format difficult to inspect, author, diff, and support independently.

The canonical snapshot is deliberately not an event store. Persistence and collaboration adapters may maintain journals or CRDT state, but they must materialize and validate the same `BroadsetProject` snapshot.

## 5. Core principles

### 5.1 One semantic pipeline

All visual and export consumers use the same resolution contract:

```text
untrusted bytes or persistence snapshot
  -> bounded container/parser validation
  -> strict JSON structural validation
  -> whole-project semantic validation
  -> canonical BroadsetProject
  -> ResolvedSceneSnapshot
       resources
       component expansion
       document hierarchy
       page instances and overrides
       variables and modes
       sample/live data bindings
       state machine and animation evaluation
       coordinate, text, color, effect, and visibility resolution
  -> immutable RenderPlan
       editor canvas
       interactive renderer
       offline frame renderer
       player and playout
       PDF/PSD/PPTX/SVG/raster/video/OGraf exporters
```

No exporter or UI host independently merges persisted page, component, binding, or animation fields.

### 5.2 Strict canonical state, permissive recovery boundary

Canonical in-memory projects are strict. Missing references, duplicate IDs, invalid override paths, cycles, and incompatible values are validation errors.

The load boundary is recovery-friendly: it preserves original bytes, reports typed diagnostics, exposes a last-valid snapshot when available, and lets the user export quarantined input. It does not silently repair and overwrite the input.

### 5.3 Stable identity

Every independently addressable item has a stable non-empty ID, including:

- projects, documents, resources, assets, and blobs;
- elements and page instances;
- component definitions, local component elements, and exposed properties;
- text paragraphs and runs;
- appearance layers and effects;
- variable collections, variables, modes, and values;
- view-model fields and bindings;
- sequences, tracks, keyframes, markers, and cues;
- state machines, states, and transitions;
- interop source records and preserved fragments.

Array index is never durable identity.

### 5.4 Typed values, not transport strings

CSS strings, HTML strings, JSON encoded inside strings, dot paths, and producer-specific tokens are not canonical authoring representations when Broadset understands the concept.

Canonical values use typed JSON objects. Format adapters and renderers derive CSS, SVG, OOXML, PDF operators, PSD structures, and other boundary representations.

### 5.5 Sparse inheritance

Definitions contain defaults. Component instances, page instances, modes, data bindings, and animations store only intentional overrides. Every resolved value retains provenance so the UI can show its source and reset the correct layer.

### 5.6 Foundational JSON types

The design uses these common types:

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

type TypedValue =
  | { readonly type: 'null'; readonly value: null }
  | { readonly type: 'boolean'; readonly value: boolean }
  | { readonly type: 'integer'; readonly value: number }
  | { readonly type: 'number'; readonly value: number }
  | { readonly type: 'string' | 'date-time'; readonly value: string }
  | { readonly type: 'length' | 'angle'; readonly value: number }
  | { readonly type: 'color'; readonly value: ColorValue }
  | { readonly type: 'asset'; readonly assetId: Id }
  | { readonly type: 'point2d'; readonly value: readonly [number, number] }
  | { readonly type: 'point3d'; readonly value: readonly [number, number, number] }
  | { readonly type: 'list'; readonly items: readonly TypedValue[] }
  | { readonly type: 'object'; readonly fields: Readonly<Record<Id, TypedValue>> };

interface EntityAddress {
  readonly projectId: Id;
  readonly documentId?: Id;
  readonly entityKind: string;
  readonly entityId: Id;
  readonly instancePath?: readonly Id[];
}

interface PropertyTarget {
  readonly entity: EntityAddress;
  readonly pointer: string; // RFC 6901 JSON Pointer into the addressed entity
}

interface TypedOverride {
  readonly id: Id;
  readonly target: PropertyTarget;
  readonly value: TypedValue;
}
```

Every JSON number must be finite. Values declared as integers must be safe integers. `date-time` values are timezone-qualified ISO 8601 strings. A property target is valid only when its pointer is declared overridable by the target entity's schema and its value type matches that property. The property's type is derived from the schema and is not duplicated on the target.

## 6. Root project shape

The canonical project root is:

```ts
interface BroadsetProjectV2 {
  readonly $schema: 'https://schema.broadset.dev/v2/project.schema.json';
  readonly format: 'broadset-project';
  readonly schemaVersion: 2;
  readonly id: Id;
  readonly metadata: ProjectMetadata;
  readonly resources: ProjectResources;
  readonly documents: readonly BroadsetDocumentV2[];
  readonly templateGroups: readonly TemplateGroup[];
  readonly interop: InteropRegistry;
  readonly extensions: readonly ExtensionEnvelope[];
}
```

`Id` is a non-empty Unicode string without control characters. UUIDs are the default generator, but the schema does not require a UUID shape so deterministic import IDs remain possible.

A project contains at least one document. Project-level document, resource, template-group, interop-source, and interop-record IDs are unique in their respective scopes. Extension namespaces are unique within each owning entity.

### 6.1 Project metadata

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

Timestamps are UTC ISO 8601 strings. `updatedAt` must not precede `createdAt`. Package creation timestamps and local save timestamps are not semantic project metadata and belong in the package manifest or persistence journal.

### 6.2 Template groups

Template groups relate independently authored document variants without altering their rendering semantics:

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

Member IDs are unique within a group. Document references and output-profile references must resolve. Aspect-ratio terms are positive integers reduced to lowest terms. The same document may participate in multiple groups.

### 6.3 Project ownership

The editor store owns the full `BroadsetProjectV2`. Runtime navigation such as `activeDocumentId` and `activePageId` is separate UI state.

Main project save and export always serialize the whole project. A document-only interchange export uses a distinct command, file label, and schema and must not be presented as a full `.bsp` save.

## 7. Project resources

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

Resources are project-owned so multiple documents and component definitions can share them. Document-local resources are introduced only when their semantics genuinely cannot be shared.

### 7.1 Asset and blob separation

Logical assets are separate from their byte sources:

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

interface AssetBase {
  readonly id: Id;
  readonly kind: AssetKind;
  readonly name: string;
  readonly blob: BlobReference;
  readonly provenance?: AssetProvenance;
  readonly license?: AssetLicense;
  readonly derivatives?: readonly AssetDerivative[];
}
```

Canonical portable packages use package sources. Raw JSON interchange may reference external or missing sources. Embedded data URIs are not canonical v2 asset sources.

Asset variants contain typed metadata:

- image: pixel dimensions, orientation, alpha, bit depth, color model, ICC profile reference;
- video: dimensions, rational frame rate, duration ticks, codecs, alpha, audio-track summary;
- audio: duration, sample rate, channel layout, codec;
- font: format, PostScript name, family, weight/style/stretch, variable axes, Unicode coverage, embedding permissions;
- ICC profile: profile class, color space, PCS, description, identifier;
- data: encoding, declared schema reference, record shape summary;
- vector/foreign: intrinsic bounds and safe preview information when applicable.

Missing external assets do not invalidate the structural project when the source is explicitly `missing`. They produce required-asset diagnostics and render an explicit placeholder. A reference to a nonexistent asset ID is invalid.

### 7.2 Font resources

A font family resource maps semantic faces to font assets:

```ts
interface FontFamilyResource {
  readonly id: Id;
  readonly familyName: string;
  readonly fallbackFontIds: readonly Id[];
  readonly faces: readonly {
    readonly id: Id;
    readonly assetId: Id;
    readonly weight: number;
    readonly style: 'normal' | 'italic' | 'oblique';
    readonly stretch: number;
    readonly axes?: Readonly<Record<string, number>>;
  }[];
}
```

System-only fonts use an explicit system face without pretending bytes are packaged. Export preflight reports targets that require embedding when a compatible embeddable face is unavailable.

### 7.3 Colors and swatches

Concrete colors store authoritative channels:

```ts
type ColorValue =
  | {
      readonly kind: 'color';
      readonly space: 'srgb' | 'display-p3' | 'rec2020' | 'lab' | 'oklab' | 'oklch' | 'cmyk' | 'gray';
      readonly channels: readonly number[];
      readonly alpha: number;
    }
  | {
      readonly kind: 'swatch';
      readonly swatchId: Id;
      readonly adjustments?: readonly ColorAdjustment[];
    };
```

Channel count and ranges are validated per color space. A swatch may carry spot-ink metadata, alternate color, tint behavior, and producer aliases. Producer theme slots belong in interop mappings or map to project swatches; they are not the universal color model.

### 7.4 Variables

Variables represent reusable authoring-time values and modes:

```ts
interface VariableCollection {
  readonly id: Id;
  readonly name: string;
  readonly modes: readonly { readonly id: Id; readonly name: string }[];
  readonly defaultModeId: Id;
  readonly variables: readonly VariableDefinition[];
}

interface VariableDefinition {
  readonly id: Id;
  readonly name: string;
  readonly valueType: ValueType;
  readonly valuesByMode: Readonly<Record<Id, TypedValue>>;
  readonly aliasOf?: { readonly collectionId: Id; readonly variableId: Id };
}
```

Aliases must have compatible value types. Alias graphs must be acyclic. A document or page selects a mode per collection. Variables are distinct from live data and component exposed properties.

### 7.5 Shared styles

Shared styles hold reusable typed appearance or text-style fragments. They may reference variables and swatches. Alias and inheritance graphs are acyclic. Element-local overrides are sparse and retain provenance after resolution.

## 8. Document shape

```ts
interface BroadsetDocumentV2 {
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
```

A document has at least one page. `timebase` is required for `motion` documents and optional for static/print documents. Output profiles are references to project resources, allowing multiple targets without changing the document's authoring truth.

### 8.1 Surface

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
  readonly prepress?: {
    readonly bleed: Insets;
    readonly trim: Insets;
    readonly safe: Insets;
  };
}
```

All spatial numeric values use the surface unit unless their type states otherwise. Percentage and dimensionless values are separately typed. DPI converts physical units and pixels; it does not change the meaning of stored physical coordinates.

Canvas background uses the same `Paint` union as elements.

### 8.2 Document color configuration

```ts
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

Working space, display preview, and output profiles are distinct. A document never stores an sRGB approximation as the authoritative value of a wide-gamut color.

## 9. Elements and hierarchy

Elements are a flat ordered array. `parentId` defines hierarchy. The array order defines sibling order only after filtering to siblings with the same parent. Canonical element order is depth-first preorder: a parent precedes all descendants, each subtree is contiguous, and sibling order is the order of sibling roots in the array.

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
```

`groupId` is removed. Selection-only grouping is editor state. Structural groups use actual `group` elements.

### 9.1 Geometry and transforms

```ts
interface ElementGeometry {
  readonly bounds: {
    readonly width: number;
    readonly height: number;
  };
  readonly transform:
    | {
        readonly kind: 'affine2d';
        readonly matrix: readonly [number, number, number, number, number, number];
      }
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

Matrices are canonical because they preserve arbitrary affine transforms, reflections, skew, nested transforms, and imported producer content exactly. Editor controls expose decomposed translation, rotation, scale, skew, and origin when a stable decomposition exists. Decomposition is derived rather than duplicated in JSON.

Zero-area element bounds are invalid. Singular transforms are allowed only when explicitly preserved from external content and produce a warning; newly authored singular transforms are rejected by editor commands.

### 9.2 Element union

```ts
type Element =
  | TextElement
  | ImageElement
  | VectorElement
  | GroupElement
  | ComponentInstanceElement
  | VideoElement
  | AudioElement
  | ClockElement
  | TickerElement
  | QrCodeElement
  | ForeignElement
  | PluginElement;
```

Core variants are closed. Plugins use the explicit plugin variant so an arbitrary string cannot accidentally select built-in behavior.

Important payloads include:

```ts
interface TextElement extends ElementBase {
  readonly kind: 'text';
  readonly text: TextBody;
  readonly layout: TextLayoutOptions;
  readonly textPath?: { readonly vectorElementId: Id; readonly startOffset: number; readonly side: 'left' | 'right' };
}

interface ImageElement extends ElementBase {
  readonly kind: 'image';
  readonly image: {
    readonly assetId: Id;
    readonly fit: 'fill' | 'contain' | 'cover' | 'none' | 'scale-down';
    readonly crop?: NormalizedRect;
    readonly focalPoint?: readonly [number, number];
  };
}

interface VectorElement extends ElementBase {
  readonly kind: 'vector';
  readonly geometryData:
    | { readonly kind: 'rectangle'; readonly cornerRadii: readonly [number, number, number, number] }
    | { readonly kind: 'ellipse' }
    | { readonly kind: 'path'; readonly path: StructuredPath; readonly fillRule: 'nonzero' | 'evenodd' }
    | { readonly kind: 'boolean'; readonly operation: BooleanOperation; readonly operandIds: readonly Id[] };
}

interface ComponentInstanceElement extends ElementBase {
  readonly kind: 'component-instance';
  readonly componentId: Id;
  readonly propertyValues: readonly ExposedPropertyValue[];
}

interface ForeignElement extends ElementBase {
  readonly kind: 'foreign';
  readonly foreign: {
    readonly mediaType: string;
    readonly sourceBlob: BlobReference;
    readonly previewAssetId: Id;
    readonly safeRenderMode: 'preview-only' | 'sanitized-vector';
    readonly reason: string;
  };
}

interface PluginElement extends ElementBase {
  readonly kind: 'plugin';
  readonly plugin: {
    readonly pluginId: string;
    readonly elementType: string;
    readonly schemaVersion: number;
    readonly payload: JsonValue;
    readonly previewAssetId?: Id;
  };
}
```

Image, video, and audio payloads reference assets; URLs and paths never occupy generic `content`. Tickers store typed item configuration or binding references, not JSON arrays encoded as strings. Paths use a real structured geometry representation with stable point/segment IDs when editable.

## 10. Appearance

```ts
interface Appearance {
  readonly opacity: number;
  readonly blendMode: BlendMode;
  readonly isolation: boolean;
  readonly fills: readonly FillLayer[];
  readonly strokes: readonly StrokeLayer[];
  readonly effects: readonly Effect[];
  readonly clip?: ClipDefinition;
  readonly mask?: MaskDefinition;
}
```

Fills, strokes, and effects are ordered and have stable IDs, `enabled`, opacity, and blend mode where applicable. This supports multiple fills/strokes, producer effect stacks, animation targeting, and granular collaboration.

### 10.1 Paint

```ts
type Paint =
  | { readonly kind: 'none' }
  | { readonly kind: 'solid'; readonly color: ColorValue }
  | { readonly kind: 'gradient'; readonly gradient: Gradient }
  | { readonly kind: 'pattern'; readonly assetId: Id; readonly transform: Affine2D; readonly repeat: PatternRepeat }
  | { readonly kind: 'picture'; readonly assetId: Id; readonly fit: PictureFit; readonly crop?: NormalizedRect };
```

Gradients include:

- stable stop IDs;
- typed color values and stop opacity;
- offset and optional midpoint;
- linear, radial, conic, diamond, or producer-preserved type;
- user-space or object-bounds coordinate space;
- gradient transform, spread mode, focal point, and interpolation color space.

### 10.2 Effects

Effects use a closed core union for known primitives such as blur, drop shadow, inner shadow, glow, color matrix, bevel, displacement, opacity, and backdrop blur. Unknown producer effects become interop-preserved fragments plus warnings; they do not enter the native effect union as raw executable markup.

### 10.3 Clip and mask

Clips and masks reference vector elements, component-local vector paths, or typed alpha/luminance asset masks. Raw `customClipPath` strings and style-level 3D transforms are removed.

## 11. Text model

Text always uses structured, inert Unicode content:

```ts
interface TextBody {
  readonly paragraphs: readonly TextParagraph[];
}

interface TextParagraph {
  readonly id: Id;
  readonly properties: ParagraphProperties;
  readonly runs: readonly TextRun[];
}

interface TextRun {
  readonly id: Id;
  readonly text: string;
  readonly properties: RunProperties;
}
```

Run properties are typed and include font resource/face, size, color, weight, variation axes, OpenType features, language, script, direction, decoration, baseline shift, tracking, hyperlink, and semantic role.

Paragraph properties include alignment, writing direction, line spacing, space before/after, indents, tabs, bullets/numbering, hyphenation, and keep rules.

No text field contains authored HTML. Renderers produce safe DOM nodes or positioned glyphs while maintaining a semantic text mirror. Glyph shaping, line breaks, and measured layout are derived from the shared text kernel and are not persisted.

## 12. Components

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
```

`ComponentElement` is the same discriminated union as `Element`, evaluated in a component-local identity scope. Definition-local element IDs are unique within the definition. Components may nest through component-instance elements. Dependency cycles are invalid.

An exposed property has a stable ID, label, group, typed value schema, default, validation constraints, and one or more internal bindings. Instance values address exposed-property IDs only. Generic internal paths are not part of the ordinary instance contract.

Resolved nested element identity is a composite instance path. A component master is never stored as hidden document elements. Unlink materializes the resolved instance into ordinary document elements with fresh IDs in one atomic transaction.

## 13. Pages and instances

```ts
interface PageDefinition {
  readonly id: Id;
  readonly name: string;
  readonly locale?: string;
  readonly notes?: TextBody;
  readonly rootInstances: readonly PageRootInstance[];
  readonly descendantOverrides: readonly DescendantOverride[];
  readonly selectedVariableModes: Readonly<Record<Id, Id>>;
  readonly sampleDataSetId?: Id;
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

`rootInstances` array order is root z-order. The same document root element may be instantiated more than once because page-instance identity is separate from element-definition identity.

Descendant overrides use a typed `InstanceAddress` containing the root instance ID and the descendant/component instance path. They can target only schema-approved overridable properties. Orphan overrides and invalid paths are errors.

Resolution order is:

1. element/component definition defaults;
2. component instance exposed-property values;
3. page root and descendant overrides;
4. variable-mode resolution;
5. sample or live data bindings;
6. state-machine values;
7. sequence evaluation and runtime lifecycle state.

Each resolved property retains this provenance chain.

## 14. View models and bindings

Runtime data contracts are separate from authoring variables:

```ts
interface ViewModel {
  readonly id: Id;
  readonly name: string;
  readonly fields: readonly ViewModelField[];
  readonly sampleDataSets: readonly SampleDataSet[];
}

interface ViewModelField {
  readonly id: Id;
  readonly name: string;
  readonly label?: string;
  readonly schema: ValueSchema;
  readonly defaultValue?: TypedValue;
  readonly stalePolicy?: 'keep-last' | 'use-default' | 'hide' | 'error';
}
```

`ValueSchema` is a recursive discriminated union covering string, number, integer, boolean, date/time, color, asset, enum, object, and array values. Constraints are type-specific and defaults must validate against them.

Bindings address stable field IDs and stable property targets:

```ts
interface Binding {
  readonly id: Id;
  readonly target: PropertyTarget;
  readonly expression: ExpressionAst;
  readonly formatter?: FormatterPipeline;
  readonly fallback?: TypedValue;
}
```

Expressions use a closed AST:

```ts
type ExpressionAst =
  | { readonly kind: 'literal'; readonly value: TypedValue }
  | { readonly kind: 'field'; readonly viewModelId: Id; readonly fieldId: Id }
  | { readonly kind: 'variable'; readonly collectionId: Id; readonly variableId: Id }
  | { readonly kind: 'unary'; readonly operator: 'not' | 'negate'; readonly operand: ExpressionAst }
  | {
      readonly kind: 'binary';
      readonly operator: 'and' | 'or' | 'eq' | 'neq' | 'lt' | 'lte' | 'gt' | 'gte' | 'add' | 'sub' | 'mul' | 'div';
      readonly left: ExpressionAst;
      readonly right: ExpressionAst;
    }
  | {
      readonly kind: 'conditional';
      readonly condition: ExpressionAst;
      readonly whenTrue: ExpressionAst;
      readonly whenFalse: ExpressionAst;
    }
  | { readonly kind: 'get'; readonly source: ExpressionAst; readonly fieldId: Id }
  | { readonly kind: 'index'; readonly source: ExpressionAst; readonly index: ExpressionAst }
  | { readonly kind: 'safe-function'; readonly functionId: string; readonly arguments: readonly ExpressionAst[] };

interface FormatterPipeline {
  readonly steps: readonly {
    readonly id: Id;
    readonly formatterId: string;
    readonly arguments: readonly TypedValue[];
  }[];
}
```

The function and formatter registries are closed, deterministic, side-effect-free, locale-explicit, and versioned by the core model. Type checking proves operand, function, formatter, and final target compatibility before a binding enters canonical state. Arbitrary code and unparsed expression strings are forbidden.

Repeaters are explicit layout/instance-generation definitions with stable item-key rules, direction, wrapping/grid configuration, gap, maximum items, empty state, and overflow behavior.

## 15. Exact time and animation

### 15.1 Timebase

```ts
interface Timebase {
  readonly frameRate: {
    readonly numerator: number;
    readonly denominator: number;
  };
  readonly ticksPerSecond: number;
  readonly timecode: {
    readonly nominalFramesPerSecond: number;
    readonly dropFrame: boolean;
  };
}
```

Rates are reduced positive rationals. `ticksPerSecond` is chosen so frame starts have exact integer tick positions for the document rate. Tick values are non-negative safe integers.

Timed media occupies `[0, durationTicks)`. Interactive seek accepts the closed interval through `durationTicks` to inspect the terminal state.

### 15.2 Sequences

```ts
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

A property track has a stable target, declared value type, and stable keyframes. All keyframe values must match the target property. Segment interpolation is explicit and type-compatible. Color interpolation declares a color space. Hold, step, cubic Bézier, spring, spatial path, and counting behavior use typed parameter objects.

Child sequences are referenced by ID with clip timing, remap, direction, and deterministic stagger settings; they are not recursively copied inline. Randomized behavior stores a deterministic seed.

### 15.3 Lifecycle and state machines

Lifecycle bindings map IN, HOLD/UPDATE, and OUT to sequences or state-machine events. State machines store stable states, transitions, triggers, guards as expression ASTs, deterministic priority, and optional sequence actions.

Declarative state at time T is a pure function of canonical data, input data, runtime event log, and T. Direct seek and sequential evaluation produce the same result.

## 16. Output profiles

Output profiles are reusable project resources. A document may reference multiple profiles.

Motion/screen profiles include:

- pixel dimensions and pixel aspect ratio;
- rational frame rate and scan mode;
- field order where interlaced;
- primaries, transfer function, matrix coefficients, and signal range;
- SDR/HDR metadata and peak/reference luminance;
- alpha/key/fill policy;
- audio routing where applicable;
- safe-area preset and target player/runtime requirements.

Print profiles include:

- physical page size and orientation;
- output ICC intent;
- bleed/trim requirements;
- spot-color and overprint policy;
- target PDF standard and conformance level.

Export command options and presets are distinct from document truth. An exporter reports every intentional loss through structured preflight.

## 17. Interoperability and external preservation

Broadset-owned interop data is separate from generic extensions:

```ts
interface InteropRegistry {
  readonly sources: readonly InteropSource[];
  readonly records: readonly InteropRecord[];
}

interface InteropSource {
  readonly id: Id;
  readonly format: 'pdf' | 'psd' | 'pptx' | 'svg' | string;
  readonly sourceAssetId: Id;
  readonly importerVersion: string;
  readonly importedAt: UtcTimestamp;
}

interface InteropRecord {
  readonly id: Id;
  readonly sourceId: Id;
  readonly target: EntityAddress;
  readonly sourceIdentity?: JsonValue;
  readonly baselineSemanticHash: `sha256:${string}`;
  readonly preservedBlob?: BlobReference;
  readonly previewAssetId?: Id;
  readonly mappingConfidence: number;
  readonly editability: 'native' | 'partial' | 'appearance-only';
  readonly warnings: readonly InteropDiagnostic[];
}
```

Clean/dirty state is derived by comparing the relevant canonical semantic hash with `baselineSemanticHash`. Undo can therefore restore clean state. A single permanent boolean is not persisted.

Unknown source constructs become native elements when representable, otherwise a foreign element or typed preserved fragment with an explicit preview. No unsupported source content is silently dropped.

## 18. Generic extensions

```ts
interface ExtensionEnvelope {
  readonly namespace: string;
  readonly schema: string;
  readonly version: number;
  readonly payload: JsonValue;
}
```

Namespaces use reverse-domain ownership. Core parsing validates the envelope independently of loaded plugins. An owning plugin may additionally validate the payload against the declared schema. Unknown envelopes preserve semantic JSON equality through parse/serialize round-trips and are never interpreted by core code.

Core validity does not depend on module import order. Format-specific round-trip data owned by Broadset uses `interop`, not generic extensions.

## 19. Validation

Validation has three explicit stages.

### 19.1 Container validation

- total compressed and expanded byte budgets;
- entry count and per-entry limits;
- normalized relative forward-slash paths;
- no absolute paths, backslashes, traversal, symlinks, duplicates, or unlisted entries;
- compression-ratio limits;
- declared length and SHA-256 verification before hydration;
- exact required package entries and supported manifest version.

### 19.2 Structural validation

Zod and the published JSON Schema validate the same closed shapes. Core objects are strict: unknown fields are errors. Open-world data is permitted only inside declared extension and interop payload containers.

Numbers must be finite. Integer identifiers such as ticks and byte lengths must be JSON-safe integers. Strings reject forbidden control characters. URLs, timestamps, locales, digests, MIME types, and package paths receive type-specific validation.

### 19.3 Semantic validation

Whole-project validation checks:

- uniqueness in every identity scope;
- all cross-references and referenced entity kinds;
- hierarchy order, acyclicity, and root/descendant legality;
- component dependency cycles and exposed-property types;
- variable alias cycles, mode completeness, and value types;
- page instance and descendant override addresses;
- mask, clip, text-path, boolean operand, and asset references;
- view-model field uniqueness and typed defaults;
- expression references and expression result compatibility;
- binding target compatibility;
- sequence, track, target, keyframe, clip, marker, and cue integrity;
- timebase and duration constraints;
- output profile compatibility;
- ICC profile and color-space compatibility;
- interop target and blob references.

No stale reference is silently ignored in the canonical model.

## 20. Canonical JSON serialization

- UTF-8 without BOM.
- JSON objects contain no `undefined`, functions, `NaN`, infinities, bigint values, or cycles.
- Arrays retain semantic order.
- Object-member order is not semantically meaningful.
- Canonical semantic hashing uses RFC 8785 JSON Canonicalization Scheme over a defined semantic projection.
- Non-semantic timestamps and package metadata are excluded from semantic hashes.
- Pretty-printed JSON is the human-facing default; canonicalized JSON is used only for hashing and signatures.
- Runtime indexes and default materialization do not alter canonical serialization.

Defaults are explicit when their absence would change interpretation across versions. Pure convenience defaults may be omitted only when the schema defines one unambiguous value.

## 21. Portable `.bsp` package

The portable representation is:

```text
project.bsp
  manifest.json
  project.json
  blobs/sha256/<digest>
  previews/<document-or-page-id>.<ext>
  optional-history/<snapshot-id>.json
```

`manifest.json` declares:

- package format and version;
- project JSON digest and byte length;
- every listed entry's normalized path, media type, byte length, and SHA-256 digest;
- package creation tool metadata;
- optional preview and history roles.

Unlisted payloads are rejected. Optional history snapshots are convenience/recovery artifacts and never alter `project.json` semantics.

File identities are:

- `.bsp`, MIME `application/vnd.broadset.project`: checksummed ZIP package;
- `.broadset.json`, MIME `application/vnd.broadset.project+json`: raw project JSON interchange/debug representation.

Plain JSON is never named `.bsp`.

## 22. Persistence and collaboration boundary

Portable save is not the live durability mechanism. A host persistence adapter may use IndexedDB, OPFS, a desktop filesystem, or a remote service, but durable acknowledgement requires an atomic journal/head commit.

The local mutation vocabulary uses versioned atomic batches:

```ts
interface ChangeBatch {
  readonly version: 1;
  readonly transactionId: Id;
  readonly origin: 'local' | 'remote' | 'recovery' | 'system';
  readonly operations: readonly ChangeOperation[];
}
```

Operations use RFC 6901 JSON Pointer and stable identity anchors for ordered collections. Every operation is independently invertible and verifies its expected prior value. A batch is fully size-capped and validated before atomic application.

The operation log, undo history, CRDT metadata, presence, and sync cursors are not persisted inside `project.json`. They may reference snapshot content hashes and stable project entity IDs.

## 23. Resolution contract

`ResolvedSceneSnapshot` is immutable, DOM-free, cacheable, and worker-transferable. It contains:

- fully expanded instance identity and provenance;
- resolved local and world transforms;
- resolved bounds, visibility, appearance, text, resources, and data;
- evaluated state and animation values at an exact tick;
- explicit missing-resource and fallback records;
- source addresses for every resolved overridable value;
- no mutable editor or DOM references.

Resolution returns either a complete snapshot plus non-fatal diagnostics or a typed failure. A structurally invalid canonical project never produces a partial scene.

Editor overlays, selection boxes, handles, guides, and UI chrome consume snapshot geometry but remain outside persisted scene content.

## 24. Security

- Text is inert Unicode, never authored HTML.
- Expression bindings are a closed AST and cannot execute arbitrary code.
- Plugin elements and extension payloads are inert JSON until handled by an authorized sandboxed plugin.
- Foreign markup is never injected directly into HTML or SVG DOM.
- Sanitized-vector rendering uses one shared context-specific security policy across preview and export.
- Asset URLs are not fetched merely because a project is parsed.
- Fetch adapters enforce allowlists, credentials policy, redirect policy, MIME verification, size caps, cancellation, and platform-specific SSRF protections.
- Project files never store secrets, credentials, auth tokens, or private service configuration.
- External and remote change batches are validated atomically before mutation.

## 25. Error handling and recovery

Load returns a discriminated result:

```ts
type ProjectLoadResult =
  | { readonly status: 'loaded'; readonly project: BroadsetProjectV2; readonly diagnostics: readonly Diagnostic[] }
  | {
      readonly status: 'quarantined';
      readonly diagnostics: readonly Diagnostic[];
      readonly originalBytes: Blob;
      readonly lastValidProject?: BroadsetProjectV2;
    };
```

Diagnostics have stable code, severity, JSON Pointer or package path, entity address where known, explanation, and safe remediation. Parsing never falls back silently to a demo or default project.

Save is atomic. The previous valid snapshot remains recoverable until the replacement package or journal head has been fully verified and committed.

## 26. Performance expectations

- Parse and semantic validation are linear or near-linear in project size with bounded recursion.
- Runtime indexes provide O(1) ID lookup without changing JSON shape.
- Scene resolution is incremental by dirty entity/resource IDs and exact time dependencies.
- Components are expanded virtually; their definitions are not copied into the canonical document per instance.
- Content-addressed assets deduplicate bytes and load lazily.
- Large binary preservation fragments live in blobs, not base64 JSON.
- Render plans are immutable and support structural sharing and worker transfer.
- Ordered collections remain arrays in JSON; adapters may build maps, parent indexes, and topological indexes at load time.

Performance gates cover at least 1,000 visible elements, 10,000 assets, 100 component instances, 10,000 keyframes, deeply nested valid hierarchies/components, and long multilingual text.

## 27. Testing and verification

### 27.1 Schema and model

- Zod and published JSON Schema accept and reject an identical generated corpus.
- Every discriminated variant has positive and negative fixtures.
- Unknown core fields fail; extension payloads survive round-trip.
- Property-based tests cover all reference graphs, cycles, ordering, and numeric boundaries.
- Canonical serialization and semantic hashing are deterministic across key order and repeated runs.

### 27.2 Resolution

- Golden snapshots cover hierarchy, repeated roots, sparse overrides, nested components, variables, data, state, and animation.
- Every resolved value records correct provenance.
- Direct resolution at time T equals sequential playback to T.
- Editor, renderer, player, and exporters pass differential scene-equivalence tests.
- World/local transform round trips include rotation, skew, reflection, nested matrices, and 3D.

### 27.3 Assets and packaging

- Round-trip every asset kind and missing/external/package source.
- Corrupt every manifest and package entry independently.
- Cover traversal, duplicate path, symlink, unknown entry, checksum, length, expansion-ratio, and entry-count failures.
- Prove resource budgets fire before expensive allocation where dependency APIs allow.
- Verify atomic save/recovery at every write boundary.

### 27.4 Text, color, and animation

- Multilingual shaping and BiDi golden metrics are shared across renderer and exporters.
- Text edit/range operations preserve stable run identity.
- Wide-gamut, ICC, spot, alpha, and compositing oracles cover conversions and intentional-loss diagnostics.
- Exact rational time tests prove zero contractual drift at 24000/1001, 30000/1001, and 60000/1001.
- Long-duration frame sampling and terminal seek semantics are identical across outputs.

### 27.5 Interoperability

- Every importer maps, preserves, or reports every encountered construct.
- Appearance and editability fidelity are scored separately.
- Clean external round-trip re-emits preserved source where allowed.
- Editing and undo update derived cleanliness correctly.
- Foreign fallback remains safe and visually explicit.

## 28. Greenfield cutover

The cutover is intentionally breaking:

1. Ratify this design and reconcile authoritative behavioral specs.
2. Publish the v2 JSON Schema and Zod types together.
3. Replace the editor document store with a project store.
4. Implement structural and semantic validation plus typed load results.
5. Implement the shared resolver and migrate every visual/export consumer to it.
6. Replace the generic element/style/content model with v2 unions and typed values.
7. Implement resources, components, pages, text, color, variables, data, and exact animation.
8. Replace current format dirty extensions with interop records and content-addressed blobs.
9. Implement package integrity, portable save/load, atomic persistence, and recovery.
10. Update all importers to emit v2 and all exporters to consume resolved scenes.
11. Replace fixtures and sample projects with v2 data.
12. Delete legacy color/fill/filter/project migrations and compatibility branches.
13. Reject old `schemaVersion` values with a clear unsupported-version diagnostic.

No compatibility adapter ships in production. Temporary development adapters may exist only on an unshipped implementation branch and are deleted before the v2 cutover is complete.

## 29. Acceptance criteria

- Opening and saving a multi-document project preserves every project-owned field and resource.
- All visual and export consumers use one scene-resolution contract.
- The same validated project/page/data/state/time input produces semantically identical resolved scenes everywhere.
- Every core element kind has a closed type-specific payload; generic overloaded `content` and `typeConfig` fields do not exist.
- Transform semantics are exact and non-destructive for arbitrary affine input.
- Page instances have independent stable identity, ordered root z-order, sparse overrides, and repeatable element definitions.
- Components have document-owned masters, stable nested identity, typed exposed properties, propagation, cycle validation, and unlink behavior.
- Text is always structured inert content with typed run/paragraph properties and stable IDs.
- Appearance supports ordered fills, strokes, and effects with stable IDs.
- Colors store authoritative channels and distinguish working, display, and output spaces.
- Data contracts and expressions are recursive, typed, ID-addressed, and non-executable.
- Animation uses rational time, integer ticks, stable track/key identity, typed targets/values, and reusable sequence references.
- Assets are content-addressed and integrity-checked; portable JSON does not embed large data URIs.
- External content is mapped, explicitly preserved, or represented through safe fallback with diagnostics; it is never silently dropped.
- Core validation is strict and independent of plugin or format-module import order.
- Invalid input is quarantined with original-byte recovery and never silently replaced by a default project.
- `.bsp` is an integrity-checked package containing canonical `project.json`; raw JSON uses `.broadset.json`.
- Project snapshots exclude runtime UI, undo, presence, CRDT, cache, and derived render state.
- Current Broadset-owned legacy schema and migrations are removed rather than supported indefinitely.
