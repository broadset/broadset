# Formats Specification

## Purpose

Defines all export and import format converters for broadset. Each format converts between a `BroadsetDocument` and an external file format (PDF, PPTX, PSD, SVG, HTML, JSON, OGraf, video, raster). The formats domain does NOT modify the document model, manage editor state, or drive animation playback. See [conventions](../../README.md).

---

## Sub-Specs

| Sub-Spec                         | Scope                                                                                              |
| -------------------------------- | -------------------------------------------------------------------------------------------------- |
| [pdf.md](pdf.md)                 | PDF generation, color parsing, font embedding, text wrapping, QR codes                             |
| [pptx.md](pptx.md)               | PPTX export with SVG fallback, import with path recovery, round-trip fidelity                      |
| [psd.md](psd.md)                 | PSD export (layers, masks, effects, artboards), import, path vector conversion                     |
| [web-vector.md](web-vector.md)   | SVG export/import, HTML standalone export with embedded playback runtime                           |
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

### Importer Contract

Every format importer MUST satisfy the following contract in addition to the format-specific behaviour in its sub-spec. These rules derive from [io-prereqs-plan.md](../../implementation/io-prereqs-plan.md) decisions IO-D-17 and IO-D-18, and exist so that multi-format round-trip, reconciliation, and preservation behave uniformly across PDF, PSD, PPTX, and SVG.

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
