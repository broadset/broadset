# Formats Specification

## Purpose

Defines all export and import format converters for broadset. Each format converts a validated `BroadsetProjectV1` or an explicitly addressed document/page projection to or from an external file format (PDF, PPTX, PSD, SVG, HTML, JSON, OGraf, video, raster). The formats domain does NOT mutate canonical input, manage editor state, or drive animation playback. See [conventions](../../README.md).

---

## Sub-Specs

| Sub-Spec                         | Scope                                                                                              |
| -------------------------------- | -------------------------------------------------------------------------------------------------- |
| [pdf.md](pdf.md)                 | PDF export, import, round-trip, XMP + marked-content metadata, colour space, font embedding        |
| [pptx.md](pptx.md)               | PPTX export with SVG fallback, import with path recovery, round-trip fidelity                      |
| [psd.md](psd.md)                 | PSD export (layers, masks, effects, artboards), import, path vector conversion                     |
| [svg.md](svg.md)                 | SVG export, import, round-trip, sanitization, `<metadata>` RDF packet, `data-bs-*` element tagging |
| [web-vector.md](web-vector.md)   | HTML standalone export with embedded playback runtime                                              |
| [interchange.md](interchange.md) | JSON export, OGraf packages, video export, QR SVG, filename sanitization, cross-format conformance |
| [raster.md](raster.md)           | PNG/JPEG raster export, pixel-ratio behavior, canvas discovery                                     |

---

## Non-Goals

- Document model types and validation → see `project/spec/model/spec.md`
- Animation engine → see `project/spec/playback/spec.md`
- DOM rendering → see `project/spec/renderer/spec.md`
- Editor state management → see `project/spec/editor/spec.md`

---

## Cross-Cutting Principles

### Import scope: arbitrary external files

All importers (PPTX, PSD, SVG, etc.) MUST support **arbitrary external files** created by any tool — not only files previously exported from Broadset. The goal is best-effort conversion into a valid canonical v1 project: map as much source content as possible to closed elements/resources and preserve the rest through interop or safe foreign fallback.

Specifically:

- **Best-effort mapping.** When an external file contains content that has an approximate equivalent in the Broadset model, the importer MUST map it — even if the mapping is lossy. A lossy import is better than a dropped element.
- **Graceful degradation.** Content that cannot map to a closed native variant MUST use a canonical foreign element with inert blob/preview or a typed interop preserved fragment, rather than a generic SVG/raster payload or silent drop.
- **No silent data loss.** If the importer skips content, it MUST report warnings describing what was skipped and why.
- **Round-trip fidelity is a bonus, not the scope.** Re-importing a Broadset-exported file should round-trip cleanly, but this is a secondary goal. The primary goal is useful import of files the user already has.

### Export: maximise external tool compatibility

All exporters MUST produce files that open correctly in the canonical external tool (PowerPoint for PPTX, Photoshop for PSD, browsers for SVG/HTML, etc.) — not just files that re-import cleanly into Broadset.

---

### Requirement: No Sidecar Files (IO-D-17)

Every round-trippable format exporter (PSD, PDF, PPTX, SVG) MUST produce a single file of the target format. Broadset-native state that cannot be represented in the format's visible payload rides inside the file via the format's own documented extension mechanism — never as a companion file, hidden filesystem artifact, or app-private stream outside the format spec. This invariant is what lets an exported file travel through arbitrary user workflows (email, cloud sync, DAM, external editors) without losing reconciliation identity.

Carrier mechanisms per format (restated from the Format Round-Trip Metadata requirement below):

- **PSD** — document `ImageResources.xmpMetadata` (ISO 16684-1 XMP packet) + per-layer `additionalInfo` under the `BsPs` 4-byte signature.
- **PDF** — document `Metadata` dictionary (XMP) + marked-content custom properties.
- **PPTX** — custom XML parts under `ppt/customXml/` + per-shape `<ext>` elements, plus the shape tag map.
- **SVG** — `<metadata>` element under the shared `broadset:` namespace + `data-bs-*` attributes on individual elements.

#### Scenario: Single-file export

- GIVEN a Broadset project exported to PSD, PDF, PPTX, or SVG
- WHEN the exporter writes output
- THEN the exporter produces exactly one file of the target format
- AND no companion JSON, ZIP wrapper around the format output, or hidden artifact is written alongside

#### Scenario: App-private streams rejected

- GIVEN any proposed exporter change that would persist Broadset state outside the format's documented extension mechanism
- WHEN the change is reviewed
- THEN the change MUST be rejected regardless of convenience — sidecar streams are not an acceptable fallback even when the carrier mechanism is lossy

#### Acceptance Criteria

- [ ] Every round-trippable format exporter (PSD/PDF/PPTX/SVG) writes exactly one file per invocation
- [ ] No exporter emits a companion file, ZIP wrapper, or hidden filesystem artifact
- [ ] Broadset-native state rides in the format's own XMP / marked-content / `additionalInfo` / `data-bs-*` mechanism
- [ ] Every exporter's single-file invariant is covered by a CI test that fails if a companion file is produced

---

### Requirement: No Silent Drops (IO-D-18)

Every importer MUST account for every source construct by mapping it to canonical v1 semantics, preserving it through a typed interop record or safe foreign fallback, or emitting a structured diagnostic explaining why no source fragment can be retained. Unreported discard is forbidden.

This cross-cutting rule is enforced by the importer contract below plus each format's interop preservation schema.

#### Scenario: Unknown feature preserved through interop

- GIVEN a PSD with a Photoshop-specific effect Broadset does not natively model (e.g. bevel/emboss)
- WHEN the importer processes the layer
- THEN effect parameters are preserved through a PSD interop record with content-addressed fragment and baseline semantic hash
- AND the element is otherwise imported normally

#### Scenario: Unknown feature surfaces as warning

- GIVEN an input file containing content that cannot be mapped AND cannot be preserved losslessly (e.g. an importer security cap was hit before the tail of the file was read)
- WHEN the importer finalises
- THEN an import warning describing the dropped content MUST appear in the import report
- AND the warning names the element / region affected and the reason

#### Scenario: Importer throws instead of warning — rejected

- GIVEN any proposed importer path that throws an exception for content it doesn't recognise
- WHEN the change is reviewed
- THEN the change MUST be rejected — importers degrade gracefully per the Importer Contract "Warnings, not exceptions" bullet

#### Acceptance Criteria

- [ ] Every importer maps recognized content to canonical v1 semantics OR preserves it through interop/foreign fallback OR emits an import diagnostic
- [ ] No importer silently drops source content without the user seeing a warning OR a preservation blob
- [ ] Every format sub-spec enumerates its interop record, preserved-blob, and safe foreign fallback surfaces
- [ ] Every importer under test reports warnings via the shared `{ document, warnings }` `DocumentImportResult` shape
- [ ] Importer security-cap hits surface as warnings per the Importer Security Contract `Resource-Limit Failures Emit Warnings` requirement below

---

### Importer Contract

Every format importer MUST satisfy the following contract in addition to the format-specific behaviour in its sub-spec. These rules derive from IO-D-17 and IO-D-18 in the [decision log](../../implementation/decisions.md), and exist so that multi-format round-trip, reconciliation, and preservation behave uniformly across PDF, PSD, PPTX, and SVG.

- **Group-preserving tree.** Every importer MUST build a `parentId` element tree that mirrors the source file's grouping (PSD layer groups, PPTX group shapes, SVG `<g>` / nested SVG, PDF marked-content parents). Flattening groups on import is a bug, not an option.
- **Preservation by default.** Every importer maps a construct to canonical v1 or preserves it in an interop record, content-addressed blob, or safe foreign fallback. Unreported drops are prohibited.
- **Derived cleanliness.** Every preserved mapping stores `baselineSemanticHash`; exporters compare the current defined semantic projection rather than persisting a dirty boolean.
- **Structured text by default.** Mixed-run source text imports as stable paragraphs/runs with typed properties and never flattens to a string alternative.
- **Warnings, not exceptions.** Content that cannot be imported MUST surface as an import warning; the importer MUST NOT throw for content it doesn't recognise. The surrounding elements MUST still import.

---

### Importer Security Contract

Every format importer operates on attacker-influenceable input — a user may open any file from any source. The following floor applies to all importers (PDF, PSD, PPTX, SVG, and any future format). Each format sub-spec MAY add format-specific mitigations in its risk register, but MUST NOT weaken this floor and is not required to restate it.

#### Requirement: Entity Expansion Hardening

Every XML-based parser path (XMP, SVG metadata, OOXML parts) MUST disable DTD processing and external entity resolution so that billion-laughs, entity-expansion, and XXE attacks cannot reach the importer.

#### Scenario: DTD and external entity processing is disabled

- GIVEN an input file carrying a DTD with nested entity declarations
- WHEN the importer parses XML-bearing parts
- THEN the parser MUST NOT expand the entities and MUST NOT fetch external resources

#### Acceptance Criteria

- [ ] XML parser options disable DTD processing
- [ ] XML parser options disable external entity resolution
- [ ] A billion-laughs fixture completes parsing without unbounded memory growth

---

#### Requirement: Input Size, Depth, and Entry Caps

Every importer MUST cap total input size, per-part size (ZIP entries for PPTX, OOXML parts, PSD layer channels), decoded-output size, entry count for ZIP-based archives, and parser recursion / tree depth. A declared-but-absurd size in the file MUST NOT drive an unbounded allocation.

#### Scenario: Oversize input is rejected before allocation

- GIVEN an input file whose declared total size exceeds the configured cap
- WHEN the importer begins parsing
- THEN parsing MUST stop with an import warning and MUST NOT allocate memory proportional to the declared size

#### Scenario: Excessive nesting is rejected

- GIVEN an input tree nested beyond the configured depth cap
- WHEN the importer walks the tree
- THEN the importer MUST emit a warning at the cap and MUST NOT recurse further

#### Acceptance Criteria

- [ ] Total input size cap enforced before allocation
- [ ] Per-part size cap enforced for archive entries in PPTX and for PSD layer channels
- [ ] Decoded-output size cap enforced so compressed-to-decoded expansion cannot exhaust memory
- [ ] Archive entry-count cap enforced for ZIP-based formats (PPTX)
- [ ] Parser recursion depth cap enforced with a default of 100
- [ ] Element-tree depth cap enforced with the same default

---

#### Requirement: Reference-Cycle and Follow Caps

Every importer MUST detect and cap reference-cycle follow depth for constructs that can recursively reference other parts of the source file — SVG `<use>` / `<symbol>`, PSD clipping-mask chains, PPTX placeholder inheritance chains, PDF object-reference graphs. Unbounded follow is prohibited.

#### Scenario: Self-referential `<use>` is detected

- GIVEN an SVG with `<use xlink:href="#A"/>` inside `<symbol id="A">`
- WHEN the importer resolves references
- THEN the cycle MUST be detected and MUST emit a warning without recursing indefinitely

#### Acceptance Criteria

- [ ] SVG `<use>` / `<symbol>` follow depth is capped and cycles are detected
- [ ] PSD clipping-mask chains cap follow depth and detect cycles
- [ ] PPTX placeholder inheritance caps follow depth and detects cycles
- [ ] PDF indirect-object reference graph detects cycles

---

#### Requirement: No Execution Surface Reaches the Renderer

Every importer MUST strip or reject any active content — `<script>`, `on*=` event-handler attributes, `javascript:` URLs, active `<foreignObject>` content, PDF JavaScript, PPTX VBA / macros (`vbaProject.bin`) — before any downstream package (editor, renderer, formats) sees the content. The renderer MUST NOT receive importer output capable of executing code in the host page.

#### Scenario: Inline script is stripped from imported SVG

- GIVEN an SVG input containing a `<script>` element
- WHEN the importer sanitises it
- THEN the `<script>` element MUST be removed before the content reaches the renderer

#### Scenario: VBA macros are rejected from imported PPTX

- GIVEN a PPTX input containing a `vbaProject.bin` part
- WHEN the importer opens the archive
- THEN the macro part MUST be rejected and a warning emitted

#### Acceptance Criteria

- [ ] `<script>` elements and `on*=` attributes are stripped from all SVG content
- [ ] `javascript:` URLs are stripped from all href / src attributes
- [ ] `<foreignObject>` content is sanitised or rejected
- [ ] PDF JavaScript actions are stripped
- [ ] PPTX `vbaProject.bin` and macro-bearing content types are rejected with a warning

---

#### Requirement: Resource-Limit Failures Emit Warnings

Every importer MUST surface resource-limit enforcement as an import warning, not as an exception. Partial imports are preferable to crashes; the user MUST see what was dropped and why.

#### Scenario: Partial import after hitting a cap

- GIVEN an input file that exceeds one or more caps (size, depth, cycles, entries)
- WHEN the importer enforces the cap
- THEN the remaining unaffected content MUST still import and the cap violation MUST appear in the import report

#### Acceptance Criteria

- [ ] Resource-limit violations emit warnings, never thrown exceptions
- [ ] The import report lists the violated cap, the part or element affected, and the fact that content was dropped
- [ ] Elements that were successfully imported remain in the document

---

#### Requirement: Worker Sandboxing Where Available

Importers MUST use the sandboxing that the underlying parser offers. PDF parsing (via `pdfjs-dist`) MUST run in its own worker. Other importers (SVG, PPTX, PSD) run on the main thread; they MUST NOT `eval`, `new Function`, or otherwise execute imported content.

#### Acceptance Criteria

- [ ] PDF parsing runs in a dedicated worker
- [ ] No importer evaluates imported content as JavaScript

---

#### Requirement: Security Review Before Merge

Every change to an importer MUST go through the `security-reviewer` agent before merge. Sub-specs MAY document format-specific concerns (PSD's bounded layer streams, PPTX's macro rejection, SVG's `<foreignObject>` policy) but the shared floor above is non-negotiable.

#### Acceptance Criteria

- [ ] PR touching any importer includes evidence of `security-reviewer` sign-off

---

### Requirement: Format Round-Trip Metadata and Interop Records

Every layer/container format that Broadset round-trips MUST preserve project/entity source identity through canonical v1 interop records while using documented format-native metadata carriers. No sidecars, undocumented app-private streams, or unreported drops are permitted.

1. **Document metadata carrier.** A format MAY carry a defined canonical v1 semantic projection through XMP or another documented native mechanism. The projection and hash are explicit and never substitute a legacy project shape.
2. **Per-entity source identity.** Format-native tags MAY carry stable entity address, source identity, and baseline semantic hash. Preserved fragments live in content-addressed blobs referenced by interop records.
3. **Semantic-hash fallback.** When tags are stripped, reconciliation compares stable producer identity and defined RFC 8785/SHA-256 semantic hashes. Unmatched stream entities become additions; missing baselines become deletions requiring confirmation.

#### Scenario: Round-trip from Broadset through an external tool and back

- GIVEN a Broadset project exported in a round-trippable format
- AND the file is opened in the canonical external tool (Photoshop, PowerPoint, browser, Illustrator), saved, and re-imported
- WHEN the format's reconciliation pipeline runs
- THEN the defined canonical projection (sequences, stable bindings, and typed page-instance overrides) is hydrated from XMP after strict validation
- AND per-element identity survives via the per-element tag
- AND when a tag is stripped, content-hash matching recovers identity

#### Scenario: Derived cleanliness on re-export

- GIVEN an imported entity whose current semantic projection matches `baselineSemanticHash`
- WHEN the document is re-exported
- THEN the original format-native blob is emitted byte-for-byte (no re-synthesis from current Broadset state)

- GIVEN an imported entity whose current semantic projection differs from baseline
- WHEN the document is re-exported
- THEN current canonical semantics are mapped and intentional loss is reported while preserved source remains recoverable

#### Scenario: No sidecar files

- GIVEN any format exporter
- WHEN the export produces output
- THEN the output is a single file of the target format — no companion JSON, no ZIP of the file plus a metadata payload, no hidden filesystem artifact

#### Acceptance Criteria

- [ ] Every round-trippable format exporter writes a `broadset:` XMP packet using the shared namespace URI
- [ ] Every round-trippable exporter attaches stable source identity and baseline hash where supported
- [ ] Every importer prefers source identity and falls back to the defined semantic projection hash
- [ ] Embedded Broadset projections pass strict canonical v1 validation
- [ ] Baseline-equal entities may re-export preserved blobs byte-identically
- [ ] No exporter writes a sidecar file alongside the main format output
- [ ] Reconciliation reports additions, deletions, and hash-recovered matches per `_shared/reconcile/` contract
- [ ] Elements present in preserved metadata but missing from the stream surface as deletions that require user confirmation before being dropped

---

## Shared utilities under `_shared/`

Cross-format utilities live under `packages/formats/src/_shared/<module>/`. Format code imports only from the `_shared/index.ts` barrel; submodule internals stay unexported. Each module ships with its own Vitest unit tests and a narrow public API (four-to-six functions).

### Requirement: Shape Classifier (`_shared/shape-classifier/`)

The shape classifier MUST identify canonical SVG rectangle and ellipse paths so every importer maps them to `kind: 'vector'` with the most specific `geometryData` subtype instead of an unnecessarily generic structured path.

```ts
type ClassifiedShape =
  | { kind: 'rectangle'; x: number; y: number; width: number; height: number }
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number }
  | { kind: 'path' };

interface ShapeClassifierHints {
  readonly strokeWidth?: number;
}

function classifyPath(d: string, hints?: ShapeClassifierHints): ClassifiedShape;
```

Contract:

- **Rectangle** — an `M` followed by either three or four axis-aligned edges (`L`, `H`, `V` — absolute or relative) plus `Z` yields `kind: 'rectangle'`. Non-axis-aligned quadrilaterals, triangles, and rounded rectangles fall through to `path`.
- **Ellipse** — the canonical four-cubic-Bézier ellipse layout (kappa ≈ 0.5522847498) yields `kind: 'ellipse'` with the center and axis radii extracted. Arbitrary four-cubic curves whose control points don't match the kappa layout fall through to `path`.
- **Path** — malformed input (unknown commands, truncated arguments), empty / whitespace strings, and multi-subpath paths MUST return `{ kind: 'path' }` without throwing. Per IO-D-18 the caller preserves the original `d` string verbatim.

#### Acceptance Criteria

- [ ] Given an axis-aligned rectangle in absolute, relative, or H/V commands, the classifier returns a vector rectangle payload with correct geometry
- [ ] Given a non-axis-aligned quadrilateral, triangle, or other polygon, the classifier returns a vector structured-path payload
- [ ] Given a canonical four-cubic Bézier ellipse or circle, the classifier returns a vector ellipse payload with correct radii
- [ ] Given an arbitrary curve, rounded rectangle not exactly representable by rectangle payload, or multi-subpath input, the classifier returns a vector structured-path payload
- [ ] Given empty path input, the classifier returns an empty vector structured-path payload without throwing
- [ ] Given malformed or unsupported commands, the importer emits diagnostics and preserves source through interop or safe foreign fallback rather than creating invalid canonical geometry

---

### Requirement: Element Fingerprint (`_shared/fingerprint/`)

The element fingerprint is a stable cross-document hash used by reconciliation (PSD / PDF / SVG / PPTX re-import) to recover element identity when external tools strip `data-bs-*` tags, XMP entries, or shape-name markers. Visually identical elements MUST hash identically regardless of source-file formatting.

```ts
async function fingerprintEntity(project: BroadsetProjectV1, address: EntityAddress): Promise<Sha256Digest>;
```

Contract:

- Selects the defined semantic projection for the addressed entity: canonical kind and typed payload, bounds/matrix/origin, structured text, ordered appearance, bindings relevant to the format, and referenced semantic resources.
- Canonicalizes that projection with RFC 8785 and hashes it with SHA-256, returning the canonical `sha256:<hex>` digest.
- Hash implementation resources initialize lazily when needed and are reused.
- Two elements that differ only in `id` (or other non-visible identity fields) MUST produce the same fingerprint.
- Two entities that differ in relevant typed payload, exact geometry, structured text, ordered appearance, or binding semantics MUST produce different fingerprints.
- Structured paragraph/run boundaries and typed properties are part of identity; flat authored text content is not a canonical alternative.

#### Acceptance Criteria

- [ ] Given a canonical text element, the fingerprint is a valid SHA-256 digest
- [ ] Given two elements that differ only in `id`, the fingerprints match
- [ ] Given two entities that differ in structured text, typed payload, bounds, or exact matrix, fingerprints differ
- [ ] Given equivalent object-member ordering, RFC 8785 produces the same fingerprint
- [ ] Hash implementation initialization is reused across calls
- [ ] Given structured text, paragraph/run boundaries and typed properties affect the fingerprint

---

### Requirement: Reconciliation (`_shared/reconcile/`)

Every format importer produces a diff between baseline interop records/preserved blobs and the current external visual document. Reconciliation exposes one canonical result shape so warnings and conflicts behave uniformly across formats.

```ts
interface ReconcileResult {
  readonly modifications: readonly ElementModification[];
  readonly additions: readonly Element[];
  readonly deletions: readonly Element[];
  readonly recoveredByHash: readonly RecoveredByHashEntry[];
}

function reconcile(input: ReconcileInput): ReconcileResult;
```

Contract:

- **Modifications**: ids present on both sides with non-empty microdiff output. Carries `before` / `after` references and the raw `Difference[]` so UIs can render per-field conflict markers.
- **Additions**: ids present only in `currentVisual` with no fingerprint match against any deletion.
- **Deletions**: ids present only in `preservedMetadata` with no fingerprint match against any addition.
- **Recovered by hash**: pairs where a deleted id and an added id share the same fingerprint — the external tool stripped the `data-bs-*` tag but visual identity survived. Prevents spurious delete + add events.
- When multiple additions match a single deletion's fingerprint, only the first is recovered; the rest remain in `additions` so reconciliation never silently collapses distinct elements.
- Field-level diff is produced via `microdiff` — the model is not walked by hand.

#### Acceptance Criteria

- [ ] Given two identical documents, every output bucket is empty
- [ ] Given an id-matched pair with differing fields, the result contains a single `modifications` entry with the microdiff populated
- [ ] Given an id only in `preservedMetadata` with no fingerprint match, the result records a `deletions` entry
- [ ] Given an id only in `currentVisual` with no fingerprint match, the result records an `additions` entry
- [ ] Given a deletion + addition pair that share a fingerprint, the result records a `recoveredByHash` entry and the buckets contain no delete / add for that pair
- [ ] The recovery entry includes the microdiff when the two elements differ in any fields beyond the id
- [ ] When multiple additions match a single deletion's fingerprint, only the first is recovered; the rest remain in `additions`
- [ ] A mixed-change document partitions correctly across all four buckets

---

### Requirement: SVG Sanitization (`_shared/sanitize/`)

The SVG sanitizer wraps DOMPurify with a Broadset-specific policy so the SVG importer and authorized sanitized-vector foreign boundary never let an execution surface reach the renderer. Canonical v1 has no raw-SVG core element or generic markup payload.

```ts
function sanitizeSvg(input: string): {
  readonly ast: { readonly markup: string; readonly root: Element | null };
  readonly report: { readonly removed: readonly SvgSanitizationRemoval[]; readonly empty: boolean };
};
```

Contract:

- Strips `<script>` tags, `<foreignObject>` elements, inline event-handler attributes (`onload`, `onclick`, `onmouseover`, `onerror`, `onfocus`, `onblur`), `data-*` attributes, and `javascript:` URIs.
- Accepts both full `<svg>` documents and bare fragments — fragments are wrapped in a synthetic `<svg>` root for sanitization and unwrapped in the output markup.
- The `report.removed` list records what was stripped so importers surface "dropped element / attribute" warnings per IO-D-18.
- The AST `root` is importer-boundary data used to derive canonical vectors/foreign fallbacks; raw DOM nodes never become canonical data or direct renderer input.
- Empty and whitespace-only input returns an empty result (`report.empty = true`) without throwing.
- Malformed markup MUST NOT throw — the sanitizer returns an empty or best-effort result and the caller continues processing the document.

#### Acceptance Criteria

- [ ] Given a benign SVG fragment (e.g. `<rect/>`), the sanitizer passes it through unchanged and reports `empty: false`
- [ ] Given input containing `<script>` tags, the sanitized markup does not contain the script tag or its content
- [ ] Given input containing inline event-handler attributes, the sanitized markup does not contain any `on*` attributes
- [ ] Given input containing `<foreignObject>` elements, the sanitized markup does not contain the foreign object
- [ ] Given input containing a `javascript:` href, the sanitized markup does not contain the `javascript:` URI
- [ ] Given empty or whitespace-only input, the result carries an empty markup, a null root, and `report.empty = true`
- [ ] The `report.removed` list records each stripped element / attribute at least once
- [ ] The AST `root` is a non-null `Element` whenever the sanitized markup is non-empty

---

### Requirement: Broadset XMP Packet (`_shared/xmp/`)

The `_shared/xmp/` module reads and writes the canonical Broadset XMP packet under the shared `broadset:` namespace (`https://broadset.io/ns/xmp/1.0/`) per IO-D-08. One footprint across every carrier (PSD `XMPMetadata`, PDF `Metadata` dict, SVG `<metadata>`, PPTX `docProps/custom.xml`) so reconciliation recovers document identity regardless of source format.

```ts
interface BroadsetXmpPacket {
  readonly documentId: string;
  readonly version: string;
  readonly exportedAt: string;
  readonly elements: readonly { readonly id: string; readonly fingerprint: string }[];
}

function writeBroadsetXmp(packet: BroadsetXmpPacket): string;
function readBroadsetXmp(input: string | Uint8Array): BroadsetXmpPacket | null;
```

Contract:

- **Read** parses RDF/XML via `fast-xml-parser` with DTD and external-entity processing disabled (XXE / billion-laughs hardening intrinsic to the library). Accepts both `string` and `Uint8Array` input.
- **Read** returns `null` for empty / whitespace-only / malformed input, input without a `broadset:` description, or data that fails Zod validation — callers treat null as "no preserved metadata".
- **Write** composes RDF/XML as a deterministic string (no parser round-trip): stable ordering, canonical namespace declaration, explicit entity escaping for XML-special characters.
- **Write** Zod-validates the packet before emission; buggy callers cannot emit an incomplete surface.
- Round-trip stability is guaranteed: `readBroadsetXmp(writeBroadsetXmp(packet))` returns an equal packet (including order of element entries).

#### Acceptance Criteria

- [ ] A packet with a single element entry round-trips through write → read with no data loss
- [ ] A packet with zero element entries round-trips as an empty `rdf:Seq` without loss
- [ ] A packet with many element entries preserves order and per-element identity
- [ ] XML-special characters in ids / fingerprints are entity-escaped by write and decoded by read
- [ ] The rendered packet includes the canonical `broadset:` namespace URI
- [ ] Writing a packet missing required fields throws a Zod validation error
- [ ] Reading empty or whitespace-only input returns `null`
- [ ] Reading malformed XML returns `null` without throwing
- [ ] Reading RDF/XML without a `broadset:` description returns `null`
- [ ] Reading accepts `Uint8Array` input and decodes it as UTF-8

---

### Requirement: Color operations (`_shared/color/`)

The `_shared/color/` module wraps culori for the colour-space-aware operations every format exporter / importer depends on. The lcms-wasm / ICC-profile / CMYK surface is deferred to the Phase 4 asset pipeline; this module ships the pure-culori subset today.

```ts
interface ResolvedRgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly alpha?: number;
}

function toRgb(color: ColorValue, resolver: SwatchResolver): ResolvedRgb;
function gamutMap(color: ColorValue, targetSpace?: 'srgb'): ColorValue;
function applyMods(color: ColorValue, mods: ColorMods | undefined): ColorValue;
```

Contract:

- **toRgb** resolves a typed `ColorValue` (including a swatch through the supplied resolver) and projects authoritative channels to 0–1 sRGB plus alpha without replacing the canonical source value.
- **gamutMap** returns a typed concrete color in the destination gamut. Out-of-gamut colors are hue-preserving chroma-reduced; swatches resolve before projection and remain unchanged in canonical input.
- **applyMods** applies PowerPoint-style modifiers (`lumMod`, `lumOff`, `tint`, `shade`, `alpha`) to authoritative typed channels and returns a fresh concrete `ColorValue`. Producer syntax remains recoverable through interop when relevant.
- `applyMods(color, undefined)` and `applyMods(color, {})` are no-ops that return the input identity so callers can invoke unconditionally.

#### Acceptance Criteria

- [ ] `toRgb` converts an sRGB hex to the expected 0-1 channels
- [ ] `toRgb` preserves alpha for an RGBA hex input
- [ ] `toRgb` projects authoritative non-sRGB channels without mutating the input
- [ ] `toRgb` resolves swatch colors through the supplied resolver and rejects an unresolved swatch
- [ ] `gamutMap` leaves an in-gamut sRGB color unchanged
- [ ] `gamutMap` clamps a display-p3 red into a valid sRGB hex
- [ ] `gamutMap` does not mutate swatch identity in canonical input
- [ ] `applyMods` returns the input unchanged for `undefined` or empty `mods`
- [ ] `applyMods` with `tint: 0.5` lightens the color toward white
- [ ] `applyMods` with `shade: 0.5` darkens the color toward black
- [ ] `applyMods` with `alpha: 0.5` reduces the output alpha channel
- [ ] `applyMods` resolves swatches before modification and returns a concrete typed color

---

### Requirement: Font operations (`_shared/fonts/`)

The `_shared/fonts/` module wraps fontkit for the byte-aware font operations every format's font-embedding path calls. The Google Fonts fetch, system-font matching, and subsetting pipeline land with the Phase 4 asset pipeline; this module ships the capability surface available today.

```ts
interface FontMetrics {
  readonly ascender: number;
  readonly descender: number;
  readonly lineGap: number;
  readonly unitsPerEm: number;
  readonly capHeight: number | undefined;
  readonly xHeight: number | undefined;
}

type EmbedPermission = 'installable' | 'editable' | 'preview-print' | 'restricted';

function getFontMetrics(bytes: Uint8Array | undefined): FontMetrics | null;
function readEmbedPermission(bytes: Uint8Array | undefined): EmbedPermission | null;
function getGlyphToUnicodeMap(bytes: Uint8Array | undefined): ReadonlyMap<number, readonly number[]>;
```

Contract:

- **getFontMetrics** parses the font via fontkit and returns ascent / descent / line-gap / unitsPerEm plus optional cap-height / x-height. Returns `null` for absent / empty / unparseable input.
- **readEmbedPermission** reads the OS/2 `fsType` bit field and maps to the coarsest Broadset permission bucket. Restricted bit (0x0002) → `'restricted'`; preview-print (0x0004) → `'preview-print'`; editable (0x0008) → `'editable'`; otherwise `'installable'`. Returns `'installable'` for fonts without an OS/2 table (OpenType default); `null` for invalid input.
- **getGlyphToUnicodeMap** walks the font's character set and produces a glyph-id → codepoints map. Multiple codepoints per glyph are preserved (ligatures like `fi` yield `[0x66, 0x69]`). Returns an empty map for invalid input.
- All three functions degrade gracefully on malformed byte input (never throw) so importers processing arbitrary uploads stay resilient per IO-D-18.

#### Acceptance Criteria

- [ ] `getFontMetrics` returns `null` for `undefined`, empty, and invalid (non-font) input
- [ ] `readEmbedPermission` returns `null` for `undefined`, empty, and invalid input
- [ ] `getGlyphToUnicodeMap` returns an empty map for `undefined`, empty, and invalid input

#### Spec Gaps

- Byte-level happy-path tests (reading metrics / fsType / CMap from a real TTF / OTF) land with the Phase 4 asset pipeline when a Google-Fonts-backed fixture becomes available.
- `resolveFont` / `listAvailable` / `subsetFont` ship with the Phase 4 asset pipeline.

---

### Requirement: Text layout (`_shared/text-layout/`)

The `_shared/text-layout/` module wraps `linebreak` (UAX #14 line breaking) and `bidi-js` (UAX #9 embedding levels) for the cross-format text-layout surface every exporter / importer needs. The `harfbuzzjs` shaping path is lazy-loaded by a future caller (first non-Latin shape); this module ships the eager subset today.

```ts
interface LineSegment {
  readonly text: string;
  readonly width: number;
}

interface BidiAnalysis {
  readonly paragraphs: readonly BidiParagraph[];
  readonly levels: Uint8Array;
}

type TextMeasure = (text: string) => number;

function breakLines(text: string, boxWidth: number, measure: TextMeasure): readonly LineSegment[];
function analyzeBidi(text: string, baseDirection?: 'ltr' | 'rtl'): BidiAnalysis;
```

Contract:

- **breakLines** applies UAX #14 to find line-break opportunities, then greedily packs segments into `boxWidth` using the caller's `measure` callback. Mandatory breaks (hard newlines) always start a new line. Overflowing tokens that exceed the box are emitted unchanged — never dropped — per IO-D-18.
- Every emitted `LineSegment` reports its measured width so the caller positions lines without re-measuring.
- **analyzeBidi** runs UAX #9 on the full text and returns per-paragraph levels plus the per-character level array. `baseDirection` defaults to `'ltr'`; callers pass `'rtl'` for RTL-primary paragraphs.
- Empty input returns empty results (no null guards required at call sites).

#### Acceptance Criteria

- [ ] `breakLines` returns an empty array for empty input
- [ ] `breakLines` returns a single line when the text fits within the box
- [ ] `breakLines` breaks long text into multiple lines at word-boundary opportunities
- [ ] `breakLines` respects hard line breaks regardless of box width
- [ ] `breakLines` reports the measured width on every emitted line
- [ ] `breakLines` emits overflowing tokens unchanged instead of dropping them
- [ ] `analyzeBidi` returns empty paragraphs + zero-length level array for empty input
- [ ] `analyzeBidi` assigns level 0 across pure LTR text
- [ ] `analyzeBidi` elevates levels for embedded RTL characters (mixed-script input produces at least one odd-level character)
- [ ] `analyzeBidi` honors explicit `'rtl'` base direction (paragraph level is odd)

#### Spec Gaps

- `wrapRuns(runs, boxWidth, fontResolver)` and `shapeRuns(runs)` (harfbuzzjs-backed) land when the first PDF / PPTX importer surfaces a concrete need for run-aware layout. The eager `breakLines` / `analyzeBidi` surface above covers the single-style text paths every format emits today.

---

## Cross-Format Spec Gaps

- [ ] **Proposed unified preflight and intentional-loss policy:** ADR-IO-014/016 proposes stable severity codes, explicit overrides for fidelity warnings, blocking unsafe/invalid output, and per-element animation-loss reporting. Current per-format requirements and ratified IO-D-14/16 behavior remain authoritative until an authorized maintainer ratifies and reconciles a replacement across every exporter and authoring surface.
