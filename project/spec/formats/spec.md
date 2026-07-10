# Formats Specification

## Purpose

Defines all export and import format converters for broadset. Each format converts between a `BroadsetDocument` and an external file format (PDF, PPTX, PSD, SVG, HTML, JSON, OGraf, video, raster). The formats domain does NOT modify the document model, manage editor state, or drive animation playback. See [conventions](../../README.md).

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

All importers (PPTX, PSD, SVG, etc.) MUST support **arbitrary external files** created by any tool — not only files previously exported from Broadset. The goal is best-effort conversion: map as much of the external file's content as possible to BroadsetDocument elements, and gracefully handle anything that cannot be mapped.

Specifically:

- **Best-effort mapping.** When an external file contains content that has an approximate equivalent in the Broadset model, the importer MUST map it — even if the mapping is lossy. A lossy import is better than a dropped element.
- **Graceful degradation.** Content that cannot be mapped to any Broadset element type MUST be preserved as a fallback representation (e.g., SVG payload, raster image) rather than silently dropped.
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

Every format importer (PSD, PDF, PPTX, SVG) MUST account for every piece of source content it encounters via one of three paths: (a) map to a native Broadset element, (b) preserve the raw source fragment under `extensions.<format>.<key>` (or an opaque `svg`-type element for SVG) for lossless re-emission, or (c) emit a structured import warning describing what was dropped and why. A fourth path — silently discarding content — is forbidden. This invariant is what keeps users in control of their own files: anything the importer doesn't fully understand still surfaces somewhere the user can see.

This cross-cutting rule derives from IO-D-18 and is enforced at every importer boundary by the Importer Contract bullets "Preservation by default" and "Warnings, not exceptions" below, plus the format-specific preservation schemas in `extensions.<format>`.

#### Scenario: Unknown feature preserved under extensions

- GIVEN a PSD with a Photoshop-specific effect Broadset does not natively model (e.g. bevel/emboss)
- WHEN the importer processes the layer
- THEN the effect parameters are preserved under `extensions.psd.unmappedEffects` with `dirty: false`
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

- [ ] Every importer maps recognised content to a native Broadset element OR preserves it under `extensions.<format>` OR emits an import warning
- [ ] No importer silently drops source content without the user seeing a warning OR a preservation blob
- [ ] Every format sub-spec enumerates its preservation surface (`extensions.psd.*`, `extensions.pdf.*`, `extensions.pptx.*`, `extensions.svg.*` or opaque SVG elements)
- [ ] Every importer under test reports warnings via the shared `{ document, warnings }` `DocumentImportResult` shape
- [ ] Importer security-cap hits surface as warnings per the Importer Security Contract `Resource-Limit Failures Emit Warnings` requirement below

---

### Importer Contract

Every format importer MUST satisfy the following contract in addition to the format-specific behaviour in its sub-spec. These rules derive from IO-D-17 and IO-D-18 in the [decision log](../../implementation/decisions.md), and exist so that multi-format round-trip, reconciliation, and preservation behave uniformly across PDF, PSD, PPTX, and SVG.

- **Group-preserving tree.** Every importer MUST build a `parentId` element tree that mirrors the source file's grouping (PSD layer groups, PPTX group shapes, SVG `<g>` / nested SVG, PDF marked-content parents). Flattening groups on import is a bug, not an option.
- **Preservation by default.** Every importer MUST either map a source construct to a native Broadset element or preserve the raw source fragment for lossless re-emission. Preservation uses typed namespaces under `extensions.<format>.<key>` (PDF, PSD, PPTX) or an opaque `svg`-type element (SVG). Silent drops are prohibited.
- **Dirty flag initialisation.** Every hydrated element — including SVG opaque elements, which carry the flag under `extensions.svg.dirty` — MUST have its `extensions.<format>.dirty` set to `false` so exporters can distinguish untouched imports (re-emit original blob byte-for-byte) from edited elements (re-emit from current Broadset state).
- **Structured text by default.** When a source file carries mixed-run text (multiple character-level styles within a paragraph), the importer MUST populate `content` as a `TextBody` rather than flattening to a single string.
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

### Requirement: Format Round-Trip Metadata — XMP + Per-Element Tag + Hash Fallback

Every layer-or-container format (PSD, PDF, PPTX, SVG) that Broadset round-trips MUST persist Broadset-native state inside the format file using a three-layer pattern so round-trip survives external edits, external-tool normalization, and aggressive tag strippers uniformly. No sidecar files and no app-private streams outside the format's documented extension mechanism (IO-D-17). No silent drops (IO-D-18).

1. **Document XMP (ISO 16684-1) under a shared `broadset:` namespace** (IO-D-08). Every supporting format carries the document-level state (project settings, canvas, asset registry, data schema, page definitions + override maps, animations where preserveable, Dublin Core metadata from `document.metadata`) in a single XMP packet using the same namespace URI across formats. Read via `_shared/xmp/readBroadsetXmp()`; write via `_shared/xmp/writeBroadsetXmp()`.
2. **Per-element tag under a format-native extension mechanism.** Each Broadset element's format-native carrier (PSD layer, PPTX shape, PDF marked-content range, SVG element) carries a tag containing the element's stable `id`, its `extensions.<format>.dirty` flag, data bindings, animation references, and the original-source blob for any feature the importer recognized but cannot represent natively. The tag carrier MUST be a mechanism the canonical external tool preserves across save (PSD `additionalInfo` under the `BsPs` 4-byte signature, PPTX custom `<ext>` elements, PDF marked-content custom properties, SVG `data-bs-*` attributes).
3. **Content-hash fallback when tags are stripped.** When an external tool strips or rewrites the per-element tag (aggressive flatten, rasterize, "Export As" rebuild), the reconciliation pipeline recovers element identity by matching the fingerprint produced by `_shared/fingerprint/fingerprintElement()` against the preserved metadata. Elements that cannot be matched either way become new elements on re-import; elements present in the preserved metadata but missing from the stream surface as deletions that the user confirms.

#### Scenario: Round-trip from Broadset through an external tool and back

- GIVEN a Broadset project exported in a round-trippable format
- AND the file is opened in the canonical external tool (Photoshop, PowerPoint, browser, Illustrator), saved, and re-imported
- WHEN the format's reconciliation pipeline runs
- THEN Broadset-native state (animations, data bindings, override maps) is hydrated from XMP
- AND per-element identity survives via the per-element tag
- AND when a tag is stripped, content-hash matching recovers identity

#### Scenario: Dirty-flag discipline on re-export

- GIVEN an element imported from a format file with `extensions.<format>.dirty === false`
- AND the user has not touched the element in Broadset
- WHEN the document is re-exported
- THEN the original format-native blob is emitted byte-for-byte (no re-synthesis from current Broadset state)

- GIVEN an element the user has edited in Broadset (dirty flag flipped to `true`)
- WHEN the document is re-exported
- THEN the element is re-synthesized from current Broadset state (the preserved blob is discarded)

#### Scenario: No sidecar files

- GIVEN any format exporter
- WHEN the export produces output
- THEN the output is a single file of the target format — no companion JSON, no ZIP of the file plus a metadata payload, no hidden filesystem artifact

#### Acceptance Criteria

- [ ] Every round-trippable format exporter writes a `broadset:` XMP packet using the shared namespace URI
- [ ] Every round-trippable format exporter attaches a per-element tag carrying `id`, `dirty`, and preservation blob
- [ ] Every round-trippable format importer prefers the per-element tag when present and falls back to `fingerprintElement()` when the tag is absent
- [ ] Every round-trippable format importer hydrates document-level state (project settings, canvas, animations, page override maps, `document.metadata`) from XMP when present
- [ ] Untouched elements (`extensions.<format>.dirty === false`) re-export byte-identical to the preserved blob
- [ ] No exporter writes a sidecar file alongside the main format output
- [ ] Reconciliation reports additions, deletions, and hash-recovered matches per `_shared/reconcile/` contract
- [ ] Elements present in preserved metadata but missing from the stream surface as deletions that require user confirmation before being dropped

---

## Shared utilities under `_shared/`

Cross-format utilities live under `packages/formats/src/_shared/<module>/`. Format code imports only from the `_shared/index.ts` barrel; submodule internals stay unexported. Each module ships with its own Vitest unit tests and a narrow public API (four-to-six functions).

### Requirement: Shape Classifier (`_shared/shape-classifier/`)

The shape classifier MUST identify canonical SVG rectangle and ellipse paths so every importer (SVG, PDF, PPTX, PSD) maps them back to native Broadset `rectangle` / `ellipse` elements instead of generic `path` payloads.

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

- [ ] Given a canonical absolute-coord rectangle (`M x y L x+w y L x+w y+h L x y+h Z`), the classifier returns `rectangle` with correct `x/y/width/height`
- [ ] Given a relative-coord rectangle (`M x y l w 0 l 0 h l -w 0 Z`), the classifier returns `rectangle`
- [ ] Given a rectangle expressed with `H`/`V` commands, the classifier returns `rectangle`
- [ ] Given a non-axis-aligned quadrilateral (any edge not parallel to an axis), the classifier returns `path`
- [ ] Given a triangle or other non-rectangle polygon, the classifier returns `path`
- [ ] Given a canonical four-cubic-Bézier ellipse with kappa control points, the classifier returns `ellipse` with correct `cx/cy/rx/ry`
- [ ] Given a circle (rx === ry) in the same canonical form, the classifier returns `ellipse` with equal radii
- [ ] Given an arbitrary four-cubic path that does not match the kappa layout, the classifier returns `path`
- [ ] Given an empty or whitespace-only `d`, the classifier returns `path` without throwing
- [ ] Given malformed or unsupported commands, the classifier returns `path` without throwing
- [ ] Given a rounded rectangle (line + arc commands), the classifier returns `path`
- [ ] Given a multi-subpath path, the classifier returns `path`

---

### Requirement: Element Fingerprint (`_shared/fingerprint/`)

The element fingerprint is a stable cross-document hash used by reconciliation (PSD / PDF / SVG / PPTX re-import) to recover element identity when external tools strip `data-bs-*` tags, XMP entries, or shape-name markers. Visually identical elements MUST hash identically regardless of source-file formatting.

```ts
async function fingerprintElement(element: BroadsetElement): Promise<string>;
```

Contract:

- Canonicalizes element `type`, `width`, `height`, `rotation`, `content` (flat string or serialized `TextBody`), and a key-sorted projection of `style` so source-file whitespace / attribute-ordering differences do not drift the hash.
- Wraps `xxhash-wasm` — returns a 16-char lowercase hex `h64` digest.
- The WASM runtime initializes lazily on first call and caches the API promise; subsequent calls reuse it.
- Two elements that differ only in `id` (or other non-visible identity fields) MUST produce the same fingerprint.
- Two elements that differ in `content`, geometry, rotation, or any persisted style field MUST produce different fingerprints.
- Flat-string content and an equivalent `TextBody` structure intentionally hash differently — rich-text metadata (paragraph / run boundaries) is part of identity.

#### Acceptance Criteria

- [ ] Given a canonical text element, the fingerprint is a 16-char lowercase hex string
- [ ] Given two elements that differ only in `id`, the fingerprints match
- [ ] Given two elements that differ in `content`, the fingerprints differ
- [ ] Given two elements that differ in `width`, `height`, or `rotation`, the fingerprints differ
- [ ] The WASM runtime is cached so subsequent calls do not re-initialize the module
- [ ] A flat-string `content` hashes differently from an equivalent `TextBody` structure

---

### Requirement: Reconciliation (`_shared/reconcile/`)

Every format importer (PSD / PDF / SVG / PPTX) produces a diff between the last-known Broadset state (preserved in XMP, `extensions.<format>`, or similar metadata) and the current visual document (what the external tool now shows). The reconciliation module unifies that diff into a canonical four-bucket result so downstream UI (import warnings, conflict markers) works against one shape regardless of source format.

```ts
interface ReconcileResult {
  readonly modifications: readonly ElementModification[];
  readonly additions: readonly BroadsetElement[];
  readonly deletions: readonly BroadsetElement[];
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

The SVG sanitizer wraps DOMPurify with a Broadset-specific policy so the SVG importer, the `svg`-type element re-render path, and any foreign-markup boundary never let an execution surface reach the renderer. Complements the importer security contract earlier in this spec.

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
- The AST `root` carries the parsed SVG element for direct renderer consumption without re-parsing.
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

function toRgb(color: BroadsetColor): ResolvedRgb;
function gamutMap(color: BroadsetColor, targetSpace?: 'srgb'): BroadsetColor;
function applyMods(color: BroadsetColor, mods: ColorMods | undefined): BroadsetColor;
```

Contract:

- **toRgb** converts any `RgbBroadsetColor` into culori-parsed 0-1 channels plus optional alpha, honoring `originalColor` so non-sRGB sources (`oklch`, `display-p3`) pass through their source space before being projected to sRGB. Theme-slot colors MUST be resolved against a palette first; passing one throws.
- **gamutMap** clamps any `BroadsetColor` into the destination gamut (sRGB today). Non-sRGB colors that fall outside sRGB are hue-preserving chroma-reduced via culori's `clampRgb`. Theme colors pass through unchanged (clamping happens after palette resolution).
- **applyMods** applies PowerPoint-style color modifiers (`lumMod`, `lumOff`, `tint`, `shade`, `alpha`) to a color. Emits a fresh sRGB `RgbBroadsetColor` whose `originalColor` is dropped (the modification alters the source identity). Theme colors pass through unchanged — the palette-aware resolver is the canonical theme + mods path.
- `applyMods(color, undefined)` and `applyMods(color, {})` are no-ops that return the input identity so callers can invoke unconditionally.

#### Acceptance Criteria

- [ ] `toRgb` converts an sRGB hex to the expected 0-1 channels
- [ ] `toRgb` preserves alpha for an RGBA hex input
- [ ] `toRgb` honors `originalColor` for non-sRGB sources (produces channels distinct from the sRGB-hex fallback)
- [ ] `toRgb` throws when given a theme-slot color
- [ ] `gamutMap` leaves an in-gamut sRGB color unchanged
- [ ] `gamutMap` clamps a display-p3 red into a valid sRGB hex
- [ ] `gamutMap` passes theme colors through unchanged
- [ ] `applyMods` returns the input unchanged for `undefined` or empty `mods`
- [ ] `applyMods` with `tint: 0.5` lightens the color toward white
- [ ] `applyMods` with `shade: 0.5` darkens the color toward black
- [ ] `applyMods` with `alpha: 0.5` reduces the output alpha channel
- [ ] `applyMods` leaves theme colors as theme colors (palette-aware resolver handles them)

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

- [ ] **Proposed unified preflight and intentional-loss policy:** ADR-IO-014/016 proposes stable severity codes, explicit overrides for fidelity warnings, blocking unsafe/invalid output, and per-element animation-loss reporting. Current per-format requirements and ratified IO-D-14/16 behavior remain authoritative until an authorized maintainer ratifies and reconciles the replacement across every exporter and authoring surface.
