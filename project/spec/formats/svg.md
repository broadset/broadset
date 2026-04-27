# Formats — SVG Specification

## Purpose

Defines SVG export, import, and round-trip for Broadset. Covers round-trip within Broadset, external-source import (Illustrator, Inkscape, Figma export, Sketch export, Affinity Designer, d3, hand-authored, browser `outerHTML`), and external-target export with minimal-loss editability in Illustrator and Inkscape. Implementation roadmap lives at [project/implementation/svg-support-plan.md](../../implementation/svg-support-plan.md).

This spec supersedes prior SVG fidelity requirements that lived under [web-vector.md](web-vector.md) (which now covers only HTML standalone export). It organises the contract as a **Feature Matrix** scoring Export / Import / Round-trip fidelity per feature, followed by acceptance-criteria requirements for the headline behaviours. It inherits the cross-format contracts in [spec.md](spec.md) — importer contract, importer security contract, and the Format Round-Trip Metadata pattern (XMP + per-element tag + content-hash fallback).

---

## Sources of truth at export time

Every SVG Broadset writes carries three collaborating layers. This is the concrete instantiation of the cross-format Format Round-Trip Metadata requirement in [spec.md](spec.md) for SVG.

### Visual layer — what any SVG renderer draws

Native SVG primitives cover every Broadset feature that has an SVG counterpart:

- **Vectors** as real `<path>` / `<rect>` / `<ellipse>` / `<g>` with proper `fill`, `stroke`, `stroke-width`, `stroke-linecap`, `stroke-linejoin`, `stroke-miterlimit`, `stroke-dasharray`, `stroke-dashoffset`, `fill-rule`, `fill-opacity`, `stroke-opacity`, `opacity`.
- **Text** as `<text>` + `<tspan>` with font-family/size/weight/style/letter-spacing/text-anchor/text-decoration, `textLength` + `lengthAdjust` where set, and text-on-path via `<textPath href="#…">`.
- **Groups** as real recursive `<g>` with per-group `transform` when flattening is disabled.
- **Gradients** as `<linearGradient>` / `<radialGradient>` in `<defs>` with full stop arrays. Conic gradients fall back to a many-stop linear approximation (SVG 2 has no conic primitive) with the true conic spec in document metadata.
- **Clip-paths / masks / patterns / filters** as `<clipPath>` / `<mask>` / `<pattern>` / `<filter>` in `<defs>`.
- **Images** as `<image href="…">` with base64 data URIs for embedded assets, external URL for referenced assets, `preserveAspectRatio` derived from `objectFit`.
- **Embedded fonts** via `<defs><style>@font-face { src: url('data:font/woff2;base64,…'); }</style></defs>` (WOFF2 base64) for non-system fonts when `FontEmbedChoice = 'embed'`. External `url()` reference when `'reference'`. Text converted to paths when `'flatten'`.

The visual layer alone is a valid, fully-editable SVG 2 document. Illustrator and Inkscape see a normal SVG.

### Document metadata layer — Broadset semantics SVG cannot express visually

A `broadset:` XML namespace — using the shared URI `https://broadset.io/ns/xmp/1.0/` per IO-D-08 (the same URI used by the PSD `XMPMetadata` packet, the PDF `Metadata` dict, and the PPTX `docProps/custom.xml`; see [spec.md](spec.md) §Broadset XMP Packet) — is declared on the root `<svg>` and carried in a document-level `<metadata>` block using RDF/XML (the W3C-recommended encoding, used by Inkscape for its `<cc:Work>` metadata). The `<metadata>` block carries:

- Project settings, canvas unit/dpi declaration, asset registry (with base64 payloads or external refs per asset), data schema, page definitions and their override maps, element ordering, Dublin Core metadata from `document.metadata`.
- A `broadset:elements` sequence keyed by element id, each carrying the element's fingerprint (for tag-stripping fallback) and the original-source preservation blob for any SVG construct the importer recognised but cannot represent natively (sanitised `outerHTML` for opaque `svg`-type payloads, metadata-only fields like `dataField` / `visibleWhen` / `repeater`).
- **No animation data** per IO-D-16 — SVG is a static carrier from Broadset's perspective; animated elements export at their fully-entered "IN" state.

This is the SVG analogue of PDF's XMP and PSD's `BsPs` `additionalInfo` — standards-blessed, preserved by Illustrator and Inkscape across save.

### Element-tagging layer — per-element identity

Each rendered element carries:

- `data-bs-id` — stable Broadset element id.
- `data-bs-kind` — Broadset element type (`text`, `rectangle`, `ellipse`, `path`, `image`, `svg`, `qrcode`, `group`, `video`, `clock`, `ticker`).
- `data-bs-data-field`, `data-bs-visible-when`, `data-bs-repeater` — optional data-binding markers.
- `broadset:content-hash` — namespaced attribute carrying the content-hash fingerprint for identity recovery when `data-bs-*` is stripped.

`data-*` attributes are part of SVG 2 / HTML5 globally and survive Illustrator, Inkscape, Figma import/export, and browser copy-paste unless the user aggressively flattens or restructures. Namespaced `broadset:` attributes are preserved by Illustrator (which uses its own `ai:` namespace) and Inkscape (which uses `sodipodi:` / `inkscape:`).

### Tag-stripping fallback

When both the `<metadata>` packet and `data-bs-*` are stripped (aggressive "Export As" rebuild, flatten-and-rasterise), the reconciliation pipeline recovers element identity by matching the fingerprint produced by `_shared/fingerprint/fingerprintElement()` against the preserved metadata. Elements that cannot be matched either way become new elements on re-import; elements present in preserved metadata but missing from the visual layer surface as deletions that the user confirms.

---

## Feature matrix

Scoring legend for each of the three columns (Export, Import, Round-trip):

- **native** — emitted via a native SVG primitive and re-read via the same primitive.
- **metadata-preserved** — round-tripped via the `<metadata>` packet or `data-bs-*` tag; not visible in the visual layer but the user sees it in Broadset after re-import.
- **dropped** — the feature is not representable; deliberately omitted on export, flagged on import.

| Domain | Feature | Export | Import | Round-trip |
| --- | --- | --- | --- | --- |
| Vectors | Rectangle / ellipse / path | native | native | native |
| Vectors | Circle (`cx` / `cy` / `r`) | native (as `ellipse`) | native | native |
| Vectors | Polygon / polyline (`points="..."`) | native (as `path` with `M`/`L`/`Z` commands) | native | native |
| Vectors | Element-level positional attributes (`<rect x y>`, `<circle cx cy>`, `<ellipse cx cy>`) | n/a (Broadset uses `transform=`) | native (combined with parent transform) | n/a |
| Vectors | Rounded rectangle (`borderRadius`) | native (`rx`/`ry`) | native | native |
| Vectors | Stroke — width / dasharray / dashoffset | native | native | native |
| Vectors | Stroke — linecap / linejoin | native | native | native |
| Vectors | Stroke — miterlimit | native | native | native |
| Vectors | Stroke — arrow heads (head / tail) | native (marker refs) | native | native |
| Vectors | Fill — solid colour | native | native | native |
| Vectors | Fill — linear gradient | native | native | native |
| Vectors | Fill — radial gradient | native | native | native |
| Vectors | Fill — conic gradient | native (linear fallback) + metadata-preserved | metadata-preserved | native (recovered from metadata) |
| Vectors | Fill — pattern | native (`<pattern>`) | native | native |
| Vectors | Fill — picture | native (`<pattern>` with `<image>`) | native | native |
| Text | Single-run plain text | native (`<text>` + `<tspan>`) | native | native |
| Text | Multi-run styled text (`TextBody` + `Paragraph` + `Run`) | native (`<tspan>` per run) | native | native |
| Text | Paragraph style (alignment, leading, tracking, first-line indent) | native | native | native |
| Text | Text decoration (underline, strike) | native | native | native |
| Text | Text-on-path | native (`<textPath>`) | native | native |
| Text | Font — embedded WOFF2 / TTF / OTF (`embed` option) | native (`<defs><style>@font-face { src: url(data:font/...;base64,...) }`, subset to used codepoints via `_shared/fonts/subsetFont`) | n/a (consumer reads `@font-face`) | n/a |
| Text | Font — external reference (`reference` option) | native (`@font-face { src: url(<external>) }`) | n/a | n/a |
| Text | Font — flattened to paths (`flatten` option) | native (`<g>` of `<path>` glyph outlines via fontkit `font.layout`) | n/a (paths re-read as paths, text identity lost) | lossy |
| Groups | `'group'` element ↔ `<g>` | native | native | native |
| Groups | Nested groups + composed transforms | native | native | native |
| Groups | Group-level opacity / blend mode / effects | native | native | native |
| Transforms | `translate` | native | native | native |
| Transforms | `rotate` | native | native | native |
| Transforms | `scale` | n/a (not in Broadset fields per IO-D-02) | native (baked to path) | baked |
| Transforms | `skewX` / `skewY` | n/a (not in Broadset fields per IO-D-02) | native (baked to path) | baked |
| Transforms | `matrix` | n/a (composed from above) | native (baked to path when non-decomposable) | baked |
| Masks | `<clipPath>` | native (`customClipPath` style → `<clipPath>` def) | native | native |
| Masks | `<mask>` | native (`<mask>` def emitted when `style.maskType !== 'none'`, deduplicated by content hash) | n/a | n/a |
| Masks | `<pattern>` (pattern fill) | native (`<pattern>` def with `<image>` body for `fill.kind === 'pattern' \| 'picture'`, deduplicated by content hash) | n/a | n/a |
| Filters | `box-shadow` / drop-shadow | native (`<filter><feDropShadow>`, deduplicated by content hash) | native | native |
| Filters | Blur | native (`<feGaussianBlur>` via `style.filter` `FilterStack`) | n/a | n/a |
| Filters | Structured `FilterPrimitive[]` (hue-rotate, saturate, grayscale, sepia, invert, brightness, contrast) | native (`<feColorMatrix>` / `<feComponentTransfer>` per primitive, content-hash-deduped) | n/a | n/a |
| Images | Embedded (data URI) | native | native | native |
| Images | External reference (URL) | native | native | native |
| Colour | sRGB hex / `rgb()` / `rgba()` | native | native | native |
| Colour | `hsl()` | native | native | native |
| Colour | `oklab()` / `oklch()` / `color(display-p3 …)` | native (visual layer + `BroadsetColor.originalColor` metadata) | native | native |
| Colour | Theme-slot references | native (resolved visually + metadata-preserved tag) | native | native |
| Metadata | Document `<metadata>` `broadset:` RDF/XML packet | native | native | native |
| Metadata | Per-element `data-bs-*` tag | native | native | native |
| Metadata | Per-element `broadset:content-hash` attribute | native | native | native |
| Metadata | Content-hash fallback when tags stripped | n/a | native | native |
| Metadata | `document.metadata` (Dublin Core) | native (XMP in `<metadata>`) | native | native |
| Animation | Animations (`animations` array, keyframes) | dropped (exported IN state) | dropped | dropped — animations are not serialised to `<metadata>` per IO-D-16 |
| Data binding | `dataField`, `visibleWhen`, `repeater` | metadata-preserved (`data-bs-*` + `<metadata>`) | metadata-preserved | metadata-preserved |
| Pages | Multi-page override maps | metadata-preserved (`<metadata>` `broadset:pages`) | metadata-preserved | metadata-preserved |
| Preservation | Opaque `svg`-type payload | native (sanitised `outerHTML`) | native | native |
| Preservation | Unknown elements (`<use>` / `<symbol>` references) | n/a (dereferenced inline on import) | native (dereferenced inline group) | lossy (structural — visually identical) |
| Security | `<script>` | dropped + rejected | dropped + warning | n/a |
| Security | `on*=` event handlers | dropped + rejected | dropped + warning | n/a |
| Security | `javascript:` URLs | dropped + rejected | dropped + warning | n/a |
| Security | `<foreignObject>` with active content | dropped + rejected | dropped + warning | n/a |

---

## Requirements

### Requirement: Standards-Only Round-Trip

Every SVG Broadset writes MUST be a single `.svg` file with no sidecar files and no app-private payloads outside the SVG specification's documented extension mechanisms. Round-trip metadata rides exclusively in (1) a document `<metadata>` RDF/XML packet under the shared `broadset:` namespace, (2) `data-bs-*` attributes (SVG 2 / HTML5 globals), and (3) `broadset:`-namespaced attributes for per-element identity hashes. Content-hash matching provides the fallback when tags are stripped.

#### Scenario: Single-file output

- GIVEN a Broadset project exported to SVG
- WHEN the exporter writes output
- THEN the output is a single `.svg` file with no companion files

#### Scenario: Metadata + tagging both present

- GIVEN a Broadset-exported SVG parsed with `DOMParser('image/svg+xml')`
- WHEN inspecting the document
- THEN a `<metadata>` child of the root `<svg>` is present carrying a `broadset:` RDF/XML packet
- AND every rendered element carries `data-bs-id`, `data-bs-kind`, and a `broadset:content-hash` attribute

#### Acceptance Criteria

- [ ] Exported SVG is a single file; no sidecars emitted
- [ ] Root `<svg>` declares `xmlns:broadset` using the shared Broadset XMP namespace URI from [spec.md](spec.md) §Broadset XMP Packet (`https://broadset.io/ns/xmp/1.0/` per IO-D-08) — **not** a format-specific URI
- [ ] Document-level `<metadata>` carries a well-formed RDF/XML packet under the `broadset:` namespace
- [ ] Every rendered element carries `data-bs-id` and `data-bs-kind` attributes
- [ ] Every rendered element carries a `broadset:content-hash` attribute
- [ ] Importer hydrates from `<metadata>` when present, falling back to visual-layer geometry when absent
- [ ] Importer falls back to `fingerprintElement()` when both the metadata packet and `data-bs-*` are stripped

---

### Requirement: Recursive Group Export (Critical Bug Fix)

Broadset `'group'` elements MUST export as real `<g>` nodes that recursively serialise their children in element order. The previous exporter emitted empty `<g>` nodes with no children — this is a regression that is explicitly disallowed.

#### Scenario: Group with three children

- GIVEN a Broadset document with a `'group'` element containing three children (a rectangle, a text node, and a nested group)
- WHEN exported to SVG
- THEN the output contains `<g data-bs-id="…" data-bs-kind="group">` with the three child nodes serialised inside, in the same order they appear in the `parentId` tree
- AND the nested child group itself contains its own children recursively

#### Scenario: Group transform composition

- GIVEN a `'group'` with `rotation: 45` containing a child rectangle
- WHEN exported to SVG
- THEN the outer `<g>` carries the rotation transform
- AND the child rectangle does not double-apply the rotation

#### Acceptance Criteria

- [ ] A `'group'` element emits a `<g>` with all children serialised inside in element order
- [ ] Nested groups serialise recursively with no flattening
- [ ] Group-level rotation composes onto the `<g>` transform
- [ ] Child transforms apply relative to the group's local coordinate system
- [ ] Group-level opacity and blend mode emit on the `<g>`

---

### Requirement: Full Stroke Property Coverage

Stroke styling MUST round-trip across `stroke`, `stroke-width`, `stroke-linecap`, `stroke-linejoin`, `stroke-miterlimit`, `stroke-dasharray`, `stroke-dashoffset`, and marker-based arrow heads.

#### Scenario: Dashed stroke with miter join and miterlimit

- GIVEN a rectangle with stroke width 4, linecap `'square'`, linejoin `'miter'`, miterlimit 8, dasharray `[6, 4]`, dashoffset 2
- WHEN exported to SVG
- THEN the `<rect>` carries `stroke-width="4"`, `stroke-linecap="square"`, `stroke-linejoin="miter"`, `stroke-miterlimit="8"`, `stroke-dasharray="6,4"`, `stroke-dashoffset="2"`

#### Scenario: Path with arrow heads

- GIVEN a path with `strokeHead: 'arrow'` and `strokeTail: 'arrow'`
- WHEN exported to SVG
- THEN the output contains `<marker>` definitions in `<defs>` referenced by `marker-start` and `marker-end` on the `<path>`

#### Acceptance Criteria

- [ ] `stroke`, `stroke-width`, `stroke-linecap`, `stroke-linejoin` round-trip
- [ ] `stroke-miterlimit` round-trips (default 4 per SVG 2 is elided on export)
- [ ] `stroke-dasharray` and `stroke-dashoffset` round-trip
- [ ] Stroke arrow heads round-trip via `<marker>` defs + `marker-start` / `marker-end`
- [ ] `stroke-opacity` and `fill-opacity` round-trip independently from `opacity`

---

### Requirement: Full Transform Parsing and Composition on Import

The importer MUST parse every SVG transform variant: `translate`, `rotate`, `scale`, `skewX`, `skewY`, `matrix`, and compose nested transforms down the element tree. When the composed affine cannot be represented by Broadset's native `position` + `rotation` fields (IO-D-02 — Broadset does not carry element-level `scale` / `skew`), the importer MUST convert the shape to a path and bake the transform into the `d` attribute via `svgpath`.

#### Scenario: Matrix transform on a rectangle

- GIVEN SVG with `<rect transform="matrix(0.866, 0.5, -0.5, 0.866, 10, 20)" width="100" height="50"/>` (a 30° rotation plus translation)
- WHEN imported
- THEN the matrix is decomposed into `(translate(10, 20), rotate(30))`
- AND the resulting element is a `rectangle` with `position: {x: 10, y: 20}` and `rotation: 30`

#### Scenario: Skew transform is baked to path

- GIVEN SVG with `<rect transform="skewX(15)" width="100" height="50"/>`
- WHEN imported
- THEN the rectangle is converted to a `path` element
- AND the `d` attribute carries the skewed geometry baked in

#### Scenario: Non-decomposable matrix is baked to path

- GIVEN SVG with a `matrix(...)` that cannot be cleanly decomposed into translate + rotate
- WHEN imported
- THEN the shape is converted to a `path` and the transform is baked into `d`
- AND the element's `rotation` is 0

#### Acceptance Criteria

- [x] `translate`, `rotate`, `scale`, `skewX`, `skewY`, `matrix` all parse without throwing
- [x] Nested group transforms compose down the element tree
- [x] Translate-only and rotate-only matrices decompose to Broadset `position` + `rotation`
- [x] Translate + rotate combinations decompose without information loss
- [x] Matrices with non-trivial `scale` or `skew` bake to path geometry via `svgpath`
- [x] Baked geometry is numerically close to the source within the rounding tolerance of `svgpath` (3 decimal places)

---

### Requirement: Gradient Import and Export

Linear, radial, and conic gradients MUST round-trip. `<linearGradient>` and `<radialGradient>` elements in `<defs>` MUST be parsed into Broadset's structured `BroadsetGradient` representation (not flattened to the first stop's colour). Conic gradients have no SVG 2 primitive; the visual layer emits a many-stop linear approximation and the true conic spec rides in `<metadata>`.

#### Scenario: Linear gradient round-trip

- GIVEN a Broadset element with a linear gradient (angle 45°, stops red/blue)
- WHEN exported and re-imported
- THEN the gradient type, angle, and stop array are preserved

#### Scenario: Conic gradient fallback

- GIVEN a Broadset element with a conic gradient
- WHEN exported
- THEN the visual layer emits a linear gradient approximation
- AND the document `<metadata>` packet carries the original conic spec under `broadset:gradients`

- WHEN re-imported
- THEN the element's fill is hydrated as the original conic gradient (metadata takes precedence over the visual approximation)

#### Scenario: Third-party gradient import

- GIVEN an SVG from Illustrator with a `<radialGradient>` in `<defs>` with five stops
- WHEN imported
- THEN the resulting Broadset element carries a `BroadsetGradient` with `type: 'radial'` and all five stops — not just the first

#### Acceptance Criteria

- [ ] `<linearGradient>` and `<radialGradient>` parse into `BroadsetGradient` with complete stop arrays
- [ ] Linear gradient angle round-trips
- [ ] Radial gradient centre (`cx`, `cy`) and focal point round-trip
- [ ] Conic gradients export as a linear approximation with the true spec in `<metadata>`
- [ ] Conic gradients re-import from `<metadata>` as the original conic definition
- [ ] Gradient stops carry opacity (`stop-opacity`) when the source declares it
- [ ] Shared `<defs>` entries are deduplicated by content-hash so multiple elements referencing the same gradient share one `<defs>` node

---

### Requirement: Font Embedding (Embed / Reference / Flatten)

The exporter MUST offer a `FontEmbedChoice` option: `'embed'` (default), `'reference'`, or `'flatten'`. `'embed'` emits `@font-face { src: url('data:font/woff2;base64,…'); }` inside `<defs><style>` for every non-system font referenced. `'reference'` emits an external `url()` reference. `'flatten'` converts text to paths (useful for consumers that forbid font embedding).

**Implementation status as of P7.7d:** Implemented. Callers pass per-family bytes / URLs through `SvgExportOptions.fonts` (a `ReadonlyMap<string, SvgFontSource>` keyed by `font-family`). The exporter walks every text element, collects the codepoints used, and runs the subset / reference / flatten pipeline through `_shared/fonts/subsetFont` (P4.5) and `_shared/fonts/embed-policy` (P4.6). Permission gating per IO-D-14: a restricted-permission font (`OS/2.fsType` bit 1) emits a warning and falls back to `'reference'` for that family.

#### Scenario: Embed option (default) produces self-contained output

- GIVEN a Broadset document with a text element using a custom font
- WHEN exported with `FontEmbedChoice: 'embed'`
- THEN the output `<defs>` contains a `<style>` block with an `@font-face` rule
- AND the `src:` value is a base64-encoded WOFF2 data URI
- AND no external font references are needed to render the SVG

#### Scenario: Flatten option emits paths

- GIVEN a text element with custom font
- WHEN exported with `FontEmbedChoice: 'flatten'`
- THEN the text element emits as `<path>` elements (one per glyph) with no `<text>` or `<tspan>`
- AND the document carries no `@font-face` declarations

#### Scenario: Restricted embed permission

- GIVEN a text element whose font has `preview-print` or `restricted` embed permission
- WHEN export runs with `FontEmbedChoice: 'embed'`
- THEN the exporter emits a warning per IO-D-14 (preflight warns, never blocks)
- AND falls back to `FontEmbedChoice: 'reference'` for that element

#### Acceptance Criteria

- [x] Default `FontEmbedChoice` is `'embed'`
- [x] `'embed'` emits font bytes as base64 inside `@font-face { src: url(...) }` in `<defs><style>` (WOFF2 / TTF / OTF per the supplied source format)
- [x] `'embed'` shares a single `@font-face` entry across multiple elements that use the same font
- [x] `'reference'` emits an external `url()` reference
- [x] `'flatten'` converts text elements to `<path>` glyph outlines via fontkit `font.layout` + `glyph.path.toSVG()`
- [x] Restricted-permission fonts surface a preflight warning and fall back to `'reference'`
- [x] Font subsetting runs through `_shared/fonts/subsetFont` (P4.5) so embedded fonts contain only used glyphs

---

### Requirement: Colour Space Preservation

OKLab / OKLCH / display-p3 colours from either Broadset content or third-party imports MUST round-trip through SVG without silent downgrade to sRGB. The visual layer emits a gamut-mapped sRGB fallback; `BroadsetColor.originalColor` (per IO-D-05) is preserved in the document `<metadata>` so re-import recovers the original colour spec.

#### Scenario: OKLCH colour round-trip

- GIVEN a Broadset element with `fill: { space: 'oklch', originalColor: 'oklch(70% 0.25 30)', … }`
- WHEN exported to SVG and re-imported
- THEN the element's `fill` carries the original `oklch(...)` representation in `originalColor`
- AND the visual-layer `fill=` attribute carries a gamut-mapped sRGB hex

#### Scenario: Third-party display-p3 colour

- GIVEN an SVG from Illustrator with `fill="color(display-p3 1 0.2 0)"`
- WHEN imported
- THEN the resulting element's `fill` carries `space: 'display-p3'` and `originalColor` set to the source string

#### Acceptance Criteria

- [ ] `oklab()`, `oklch()`, and `color(display-p3 …)` round-trip via `BroadsetColor.originalColor` in the `<metadata>` packet
- [ ] Visual-layer colour uses the `_shared/color/gamutMap` sRGB fallback so browsers that don't support wide-gamut colour still render correctly
- [ ] Named colours (`red`, `blue`), hex, `rgb()`, `rgba()`, and `hsl()` all parse on import via `_shared/color/toRgb`
- [ ] Theme-slot colours resolve visually via the palette and ride in `<metadata>` as their slot reference

---

### Requirement: Import Sanitization (Importer Security Contract Floor)

The SVG importer MUST sanitize input through `_shared/sanitize/sanitizeSvg` before any parsed AST reaches the model, editor, or renderer. `<script>`, inline event-handler attributes (`on*=`), `javascript:` URLs in `href` / `xlink:href`, and `<foreignObject>` elements MUST be stripped. The underlying `DOMParser` MUST run with DTD processing and external-entity resolution disabled. Resource caps from the shared importer security contract apply: total input size, parser depth, `<use>` / `<symbol>` follow depth, entry count for gradient / filter / mask / pattern refs.

#### Scenario: Inline script is stripped

- GIVEN an SVG input containing `<script>alert('xss')</script>`
- WHEN the importer runs
- THEN the `<script>` element is stripped before the AST reaches any downstream code
- AND the import report lists "script element removed" as a warning

#### Scenario: Event handler attribute is stripped

- GIVEN an SVG input containing `<rect onload="alert('xss')"/>`
- WHEN the importer runs
- THEN the `onload` attribute is stripped
- AND the import report lists "event handler attribute removed" as a warning

#### Scenario: javascript: href is stripped

- GIVEN an SVG input containing `<a href="javascript:alert('xss')">click</a>` or `<image xlink:href="javascript:alert('xss')"/>`
- WHEN the importer runs
- THEN the `javascript:` URL is stripped (attribute removed or set to empty string)
- AND the import report lists "javascript URL removed" as a warning

#### Scenario: Self-referential `<use>` is detected

- GIVEN an SVG with `<use xlink:href="#A"/>` inside `<symbol id="A">`
- WHEN the importer resolves references
- THEN the cycle is detected and a warning emitted without recursing indefinitely

#### Scenario: Billion-laughs entity expansion is rejected

- GIVEN an SVG input with a DTD carrying nested entity declarations
- WHEN the importer parses XML
- THEN no entities are expanded and no external resources are fetched
- AND the importer completes parsing in bounded time and memory

#### Acceptance Criteria

- [ ] `<script>` elements are stripped before reaching downstream code
- [ ] `on*=` event handler attributes are stripped
- [ ] `javascript:` URLs in `href` / `xlink:href` are stripped
- [ ] `<foreignObject>` elements are stripped by default (opaque `svg`-type preservation MAY be offered behind an explicit opt-in)
- [ ] DTD processing and external-entity resolution are disabled on the underlying parser
- [ ] `<use>` / `<symbol>` follow depth is capped and cycles are detected
- [ ] A billion-laughs entity-expansion fixture completes parsing with bounded memory
- [ ] Every sanitization action emits a warning describing what was removed
- [ ] Resource-limit violations emit warnings, never exceptions — surviving content still imports

---

### Requirement: Exporter Sanitization of Opaque `svg`-Type Payloads

When a Broadset `'svg'`-type element carries raw SVG markup as its `content` (from a previous import), the exporter MUST pass that markup through `_shared/sanitize/sanitizeSvg` before embedding it in the output. This guarantees that even a hostile payload that somehow survived the importer cannot reach a downstream consumer's browser as executable markup.

#### Acceptance Criteria

- [ ] `'svg'`-type element content is sanitized on re-emission
- [ ] A round-trip of a hostile-imported SVG produces an output SVG that is itself free of `<script>`, `on*=`, and `javascript:` URLs

---

### Requirement: No Silent Drops — Opaque Preservation

Any SVG element or attribute that the importer cannot natively map MUST be preserved as one of:

1. An opaque `svg`-type Broadset element carrying the sanitized `outerHTML` of the source fragment.
2. A namespaced attribute on the nearest recognised ancestor.

Silent drops are prohibited. Every preservation decision MUST surface as a warning in the import report describing what was preserved and why it wasn't natively mapped.

#### Scenario: Mixed native and non-native

- GIVEN an SVG with a `<rect>` and a `<foreignObject>` (with active content)
- WHEN imported
- THEN the `<rect>` becomes a `rectangle` element
- AND the `<foreignObject>` is stripped (active content policy) OR preserved as an opaque `svg`-type element with sanitized markup (when active-content opt-in is off)

#### Scenario: Unknown element preservation

- GIVEN an SVG with an unknown element type (e.g., a vendor-specific extension)
- WHEN imported
- THEN the unknown element becomes an opaque `svg`-type element with sanitized `outerHTML`
- AND the import report lists the preservation

#### Acceptance Criteria

- [ ] Unknown SVG elements preserve as opaque `svg`-type elements
- [ ] Unknown attributes on a recognised element preserve as namespaced attributes on that element
- [ ] Preservation decisions emit warnings naming the source construct

---

### Requirement: Group-Preserving Import

Every `<g>` in the source SVG MUST produce a corresponding `'group'` element in the Broadset output with a `parentId` tree mirroring the source's nesting. Flattening groups on import is a regression per the cross-format importer contract in [spec.md](spec.md).

#### Scenario: Nested group import

- GIVEN an SVG with `<g><g><rect/></g></g>` (three levels deep including the outer root)
- WHEN imported
- THEN the resulting Broadset elements form a `parentId` tree with two `'group'` elements and one `'rectangle'` nested inside

#### Acceptance Criteria

- [ ] Every `<g>` produces a `'group'` element with children linked via `parentId`
- [ ] Nested group structure is preserved to arbitrary depth (up to the importer-security depth cap)
- [ ] Group-level `transform`, `opacity`, and `style` map onto the group element's native fields

---

### Requirement: CSS Style Resolution

The importer MUST resolve styles in CSS precedence order: inherited presentation attributes, inline `style=""`, `<style>` blocks parsed via `css-tree` with selector-specificity calculation. Output is a fully resolved style map per element.

#### Scenario: Stylesheet with class selector

- GIVEN an SVG with `<style>.foo { fill: red }</style>` and `<rect class="foo"/>`
- WHEN imported
- THEN the resulting rectangle's `fill` is red

#### Scenario: Inline style overrides stylesheet

- GIVEN `<style>.foo { fill: red }</style>` and `<rect class="foo" style="fill: blue"/>`
- WHEN imported
- THEN the resulting rectangle's `fill` is blue

#### Scenario: Presentation attribute overridden by inline style

- GIVEN `<rect fill="red" style="fill: blue"/>`
- WHEN imported
- THEN the resulting rectangle's `fill` is blue

#### Acceptance Criteria

- [x] `<style>` blocks parse via `css-tree`
- [x] Selector specificity is calculated correctly (id > class > type)
- [x] Inline `style=""` overrides `<style>` block rules
- [x] `<style>` block rules override presentation attributes (per CSS 2.1)
- [x] Attribute selectors (`[attr]`, `[attr=value]`, `[attr~=word]`, `[attr|=prefix]`, `[attr^=prefix]`, `[attr$=suffix]`, `[attr*=substring]`) resolve against the static tree
- [x] Combinators (`>`, `+`, `~`, descendant space) resolve right-to-left against the ancestor / sibling chain
- [x] Pseudo-classes that cannot be resolved against a static tree surface a warning and fall back to the last-declared rule

---

### Requirement: External-Source Import

The importer MUST handle SVGs produced by any tool that writes the format. Best-effort mapping applies per the cross-format `Import scope: arbitrary external files` principle in [spec.md](spec.md). Tool-specific deviations are documented, not silently accepted.

Covered sources (see Phase 5 of [svg-support-plan.md](../../implementation/svg-support-plan.md) for the fixture list):

- Illustrator — Save As SVG (SVG 1.1 + SVG 2)
- Illustrator — Export As SVG (web-optimised)
- Inkscape — Plain SVG + Inkscape SVG
- Figma — Export as SVG
- Sketch — Export as SVG
- Affinity Designer — Export as SVG
- d3 — small visualisation snapshot
- Hand-authored — dense `<style>`-heavy, `<use>` / `<symbol>`-heavy, gradient-heavy, clip-path + mask combinations, text-on-path
- Browser — `document.querySelector('svg').outerHTML` copy-paste

#### Acceptance Criteria

- [ ] Import never throws on valid SVGs from any supported source tool
- [ ] Tool-specific namespaces (`ai:`, `sodipodi:`, `inkscape:`) preserve as namespaced attributes on the nearest element; a warning describes them
- [ ] Non-RGB colours from any source import without silent colour conversion (via `BroadsetColor.originalColor`)
- [ ] The `<use>` and `<symbol>` dereferencing path produces a visually identical group without structural round-trip guarantee

---

### Requirement: Chain-Round-Trip Tolerance

Broadset → SVG → external editor (Illustrator, Inkscape) → save → re-import MUST preserve:

- **External-editor edits** — text changes, position moves, colour changes, path edits made in the external editor appear in Broadset after re-import.
- **Broadset semantics not touched by the external editor** — data bindings, page override maps, repeater configs, `visibleWhen` expressions (via `<metadata>` + `data-bs-*`).
- **Untouched elements** — the preserved `<metadata>` carries the original element fingerprint; untouched elements round-trip byte-identically to the original Broadset export.

#### Acceptance Criteria

- [ ] A Broadset-edited-then-external-editor-saved SVG re-imports cleanly
- [ ] Fields the external editor edited appear in Broadset with the new values
- [ ] Fields the external editor did not touch keep their Broadset-native state
- [ ] Elements whose `data-bs-*` markers were stripped by the external editor recover identity via `fingerprintElement()` matching
- [ ] Elements added by the external editor (new `<path>` or `<rect>` without `data-bs-*`) import as new Broadset elements on an "Imported from SVG" staging page
- [ ] Elements present in the preserved `<metadata>` but missing from the visual layer surface as deletions requiring user confirmation

---

### Requirement: Reconciliation Reporting

When a re-imported SVG has added, removed, or ambiguously-edited elements relative to the preserved `<metadata>`, the importer MUST produce a reconciliation report per the `_shared/reconcile/` contract in [spec.md](spec.md):

- **Modifications** — ids present in both metadata and visual layer with non-empty field diff.
- **Additions** — visual-layer elements with no matching tag or fingerprint.
- **Deletions** — metadata elements missing from the visual layer.
- **Hash-recovered** — pairs where the `data-bs-*` tag was stripped but the fingerprint matched.

Deletions require user confirmation before being dropped from the Broadset document.

#### Acceptance Criteria

- [ ] Re-import produces a reconciliation report listing modifications, additions, deletions, and hash-recovered matches
- [ ] Additions land on an "Imported from SVG" staging page
- [ ] Deletions surface as an import warning requiring user confirmation

---

### Requirement: Animated Element Static Export

Broadset animations (`animations` array, keyframes) MUST be discarded on SVG export per IO-D-16. Animated elements are exported at their fully-entered "IN" state (all `in` keyframes resolved to their end positions). Animation data is NOT serialised to `<metadata>` — SVG is a static carrier from Broadset's perspective.

If the same SVG is re-imported into Broadset, the animations are NOT recovered; the user must re-author them. This is documented known-lossy behaviour.

#### Scenario: Animation discarded at export

- GIVEN an element with a translation animation from left to right
- WHEN SVG export runs
- THEN the element is rendered at the end of the `in` keyframe sequence (the "IN" state)
- AND no animation data appears in the exported SVG or its `<metadata>` packet

#### Acceptance Criteria

- [ ] Animations are discarded on export (not serialised to `<metadata>`)
- [ ] Animated elements render at the fully-entered IN state
- [ ] No SMIL `<animate>`, `<animateTransform>`, `<animateMotion>`, or `<set>` elements are emitted on export
- [ ] Re-importing a Broadset-exported SVG surfaces an import warning that animations were lost

---

### Requirement: Dirty-Flag Discipline

Every imported SVG element MUST land with `extensions.svg.dirty === false`. On re-export:

- Untouched elements (`dirty === false`) re-emit the preserved original SVG fragment byte-for-byte.
- Edited elements (`dirty === true`) re-emit from current Broadset state; the preservation blob is discarded.

The dirty flag flips to `true` automatically when the user edits the element in Broadset via the editor middleware (IO-D-11).

#### Acceptance Criteria

- [ ] Every imported element carries `extensions.svg.dirty === false`
- [ ] Editing an element in the editor flips the flag to `true` via the dirty-flag middleware
- [ ] Re-exporting an untouched document produces output with preserved elements identical to the source
- [ ] Editing one element and re-exporting rewrites that element only; every other element is emitted from the preserved blob

---

### Requirement: Preflight and Warnings

Export preflight and import warnings MUST follow IO-D-14 ("preflight warns and proceeds — never blocks export") and IO-D-18 ("no silent drops"):

- **Export preflight** surfaces: missing fonts (when `_shared/fonts/resolveFont` returns no match), fonts with `preview-print` or `restricted` embed permission, conic gradients falling back to linear approximation, elements whose rendering requires rasterisation fallback.
- **Import warnings** surface: stripped active content (script / event handlers / javascript URLs / `<foreignObject>`), preserved opaque fragments, unresolved CSS selectors, resource-limit clipping, colour-space downgrades, baked transforms.

#### Acceptance Criteria

- [ ] Export preflight warnings surface missing fonts, restricted-font embeds, and conic-gradient fallbacks
- [ ] Export preflight never blocks — every warning carries a "proceed" path per IO-D-14
- [ ] Import warnings surface sanitization actions, preservation decisions, CSS resolution failures, and resource-limit clipping
- [ ] Every surfaced warning names the element or construct it applies to

---

### Requirement: UI Integration

The import and export UI MUST:

- Route `.svg` / `image/svg+xml` inputs through the new `importSvgDocument` in `packages/formats/src/svg/`.
- Expose per-export options via the shared `FormatExportOptionsModal` (landed in I5.1, reused via I7.1): `fontEmbedding` (`'embed'` / `'reference'` / `'flatten'`), `includeMetadata` (default on), `includeElementTagging` (default on).
- Surface import warnings and the reconciliation report through the shared `FormatImportWarningsModal` (from I5.1 / I7.1).
- Route user confirmation for deletions through the shared deletion-confirmation affordance.

#### Acceptance Criteria

- [ ] Demo import dispatcher accepts `.svg` and `image/svg+xml` and routes through `importSvgDocument`
- [ ] `FormatExportOptionsModal` exposes `fontEmbedding`, `includeMetadata`, `includeElementTagging` for SVG exports
- [ ] `FormatImportWarningsModal` surfaces the `SvgImportReport`
- [ ] Every HeroUI control in the SVG export / import surface uses `@heroui/react` components per [heroui.instructions.md](../../../agents/instructions/heroui.instructions.md) — no raw `<button>` / `<input>` / `<select>`

---

## Spec Gaps

This spec is authoritative for the SVG track (Phase 7). As units land, the following deeper surface will remain tracked here and will shift to the main requirements when implementation arrives:

- **SMIL `<animate>` emission on export.** SMIL is deprecated in modern browsers. Broadset animations ride in `.bsp` only; SVG exports render the IN state. Re-introducing SMIL emission would be a new feature behind an explicit opt-in, not a current requirement.
- **Structural `<use>` / `<symbol>` round-trip.** Current target: dereference to inline groups on import (visually identical, structurally flattened). Reconstructing `<use>` relationships on export is not in scope for the initial track.
- **Animated imports from third-party SMIL SVGs.** Currently SMIL is treated as static (IN state extracted via element geometry; animation commands dropped with a warning). Full SMIL parsing → Broadset `animations` mapping is a future feature.
- **Pseudo-class resolution.** `css-tree` parses pseudo-classes but the importer cannot evaluate `:hover` / `:nth-child` etc. against a static tree — a warning surfaces and the selector is dropped from matching. Attribute selectors (`[attr]`, `[attr=value]`, `[attr~=word]`, `[attr|=prefix]`, `[attr^=prefix]`, `[attr$=suffix]`, `[attr*=substring]`), CSS combinators (`>`, `+`, `~`, descendant space), and `:not(<simple>)` DO resolve as of P7.7e — they no longer fall through. State pseudo-classes remain the only unresolved selector surface.
- **Glyph flatten on import** for third-party SVGs that author baked text via inherited scale. Currently the importer warns and drops the scale to translate-only when a text element sits under a baking ancestor (P7.7g). Implementing import-side glyph flatten would require fontkit on the import path and asset resolution for the source font — meaningful work that doesn't currently have a customer surface.
- **Text scale / skew on import.** When a third-party SVG carries an inherited scale or skew transform on a `<text>` element, the importer drops the scale/skew to a translate-only position and emits a warning (P7.7g). Broadset's text element has no native scale field per IO-D-02, and the import-time "flatten-to-paths" path is an export-only feature. Future implementation could opt in to glyph-flattening on import for tools that author baked text.

_The following items are intentionally scoped out of the SVG track and tracked by other specs:_

- Run-edit UI, font-asset picker, gradient editor, stroke subpanel, pattern fill picker, filter editor, text-fidelity subpanel, import warnings modal refinements — covered by the io-prereqs Phase 5 UI spec under [project/spec/ui/](../ui/) and interleaved during the SVG track per the plan.
- External-tool fixture corpus and chain CT harness — covered by the io-prereqs Phase 6 testing infrastructure, landed during PSD track at first need and reused here.

---

## Non-Goals

- **SMIL `<animate>` / `<animateTransform>` / `<animateMotion>` / `<set>` emission on export.** SMIL is deprecated in modern browsers; Broadset animations are discarded per IO-D-16 and not re-emitted as SMIL.
- **CSS-keyframe emission on export.** Same rationale — animations ride in `.bsp` only.
- **Embedded JavaScript or external script references.** `<script>` elements and `javascript:` URLs are stripped on import and never emitted on export.
- **External CSS references (`<link rel="stylesheet">`).** External stylesheet references are not followed on import (security and determinism); inline `<style>` blocks are resolved via `css-tree`.
- **`<foreignObject>` with active content.** Stripped on import by default. Opt-in preservation as an opaque payload is an explicit user choice, not a default.
- **PDF generation** — see [pdf.md](pdf.md).
- **PPTX format** — see [pptx.md](pptx.md).
- **PSD format** — see [psd.md](psd.md).
- **HTML standalone export** — see [web-vector.md](web-vector.md).
