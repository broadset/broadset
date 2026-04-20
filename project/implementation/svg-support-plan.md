# SVG Support Plan

Status: draft — pre-Phase 0. Not yet reflected in [project/spec/formats/web-vector.md](../spec/formats/web-vector.md).

This plan captures the full-fidelity SVG import/export strategy for Broadset, covering round-trip within Broadset, external-source import (Illustrator, Inkscape, Figma/Sketch/Affinity export, d3, hand-authored, Figma-exported, browser `outerHTML`), and external-target export with minimal-loss editability in Illustrator and Inkscape. It also covers the chain case: Broadset → Illustrator → save → Broadset, where the user's Illustrator edits survive and Broadset semantics (animations, data bindings, pages-as-overrides) survive wherever Illustrator didn't touch them.

This plan is intentionally shaped like the sibling [pdf-support-plan.md](./pdf-support-plan.md) so the two formats share vocabulary and can cross-reference shape-classifier, color, and font-subsetting utilities.

**App-level prerequisites are split into [io-prereqs-plan.md](./io-prereqs-plan.md)** — model extensions (strokeMiterlimit, conic gradient center/angle, structured filter primitives, pattern fill, text-fidelity fields, content-hash identity), the renderer refactor (replace `innerHTML` with a safe DOM-builder), the font/asset pipeline, and the shared cross-format modules under [packages/formats/src/_shared/](../../packages/formats/src/) — `_shared/reconcile/`, `_shared/shape-classifier/`, `_shared/fonts/`, `_shared/sanitize/`, `_shared/fingerprint/`, `_shared/color/`, `_shared/text-layout/`, `_shared/xmp/`. The per-format gating matrix in that document calls out exactly which io-prereqs phase unblocks each SVG phase below. Reading this plan in isolation is fine for the shape of the SVG work; no implementation bullet below should land before its corresponding prereq has shipped.

## Current state (what "absolutely broken" means)

**Broadset today — [packages/formats/src/web-vector/](../../packages/formats/src/web-vector/):**

- `importSvg` ([import.ts](../../packages/formats/src/web-vector/import.ts), 313 lines) uses `DOMParser`, handles `<rect>`, `<path>`, `<ellipse>`, `<circle>`, `<text>`, `<image>`, `<foreignObject>`, and flattens `<g>` when it has no transform — otherwise preserves the group as an opaque `svg`-type element. Transforms support `translate` and `rotate` only; `matrix`/`scale`/`skew` are dropped and the element is kept as an opaque payload with a warning. Styling extraction is limited to `fill`, `stroke`, and `clip-path`; stroke-width, stroke-linecap, stroke-linejoin, opacity, fill-opacity, stroke-opacity, font-*, gradients, filters, patterns, masks, CSS `<style>` blocks, and Illustrator/Inkscape namespaced attributes are silently dropped. Gradients defined in `<defs>` are never parsed — elements come in with no gradient data even when the source SVG clearly had one.
- `exportSvg` ([svg.ts](../../packages/formats/src/web-vector/svg.ts), 300 lines) has a critical bug: `group` elements serialize as an empty `<g>` with no recursive rendering of children. Any grouped content is lost on export. Conic gradients and most CSS gradient strings are dropped (first-stop fallback at best). Box-shadow is approximated by a hand-built `<filter><feDropShadow>` with blur divided by 2. Fonts are referenced by family name only — no `@font-face`, no subsetted `<defs>` fonts, no fallback chain — so AI/Inkscape/browser rendering diverges from the Broadset canvas whenever the machine doesn't have the exact font installed. Animations are entirely discarded. The QR code path extracts inner SVG via a loose regex.
- Rendering — [screen-renderer/element-renderers.ts:352-364](../../packages/renderer/src/screen-renderer/element-renderers.ts) uses `host.innerHTML = element.content` to render `svg`-type elements. No sanitization. Any imported SVG (from an arbitrary file the user drops in) can include `<script>`, event-handler attributes, or foreign-object XSS payloads that execute in the editor.
- Tests — [web-vector.test.ts](../../packages/formats/src/web-vector/web-vector.test.ts) (881 lines) covers basic primitives, single-level groups, clip-path references, box-shadow filters, and some text attributes. It does **not** cover: recursive group export, gradient import, stroke-width/linecap/linejoin round-trip, matrix/scale/skew transforms, text-on-path, embedded fonts, `<pattern>`, `<mask>`, `<use>`/`<symbol>`, CSS stylesheets inside `<style>`, or round-trip through an external editor.
- Spec [project/spec/formats/web-vector.md](../spec/formats/web-vector.md) promises most of this — so the spec is ahead of the implementation, and the gap is visible.

**dom-compositor reference — [packages/formats/src/svgImport.ts](../../../dom-compositor/packages/formats/src/svgImport.ts) + [svgExport.ts](../../../dom-compositor/packages/formats/src/svgExport.ts), ~1,270 lines combined:**

Meaningfully richer in a few specific places and worth carrying over: (1) the "no silent drops" invariant — unknown SVG elements always become an opaque `svg`-type fragment with `outerHTML` preserved, guaranteeing round-trip information preservation; (2) separation of path concerns — `pathBoundsUtils.ts`, `pathLerp.ts` (with a `COMMAND_COORDS` arity table), and `clipPathPathUtils.ts` split parsing/morphing/clip responsibilities across three small files; (3) a slightly smarter gradient parser on export. But dom-compositor is no better than broadset today on: full transform support, gradient **import**, stroke properties, font embedding, `<use>`/`<symbol>`/`<mask>`/`<pattern>`/CSS parsing, animation preservation, or external-editor chain tolerance. Neither codebase has ever round-tripped SVG through Illustrator or Inkscape end-to-end.

## Goals

1. **Round-trip fidelity (Broadset ↔ SVG ↔ Broadset)** — lossless for static content; explicitly lossy for animations per io-prereqs **IO-D-16** (SVG exports render the fully-entered "IN" state and discard animation data). Broadset semantics that SVG cannot express visually — data bindings, repeaters, page-override maps — ride in standards-blessed `<metadata>` RDF so static round-trip works. The lossy surface is enumerated in the spec.
2. **External-source import** — SVGs produced by Illustrator, Inkscape, Figma export, Sketch export, Affinity Designer, d3, hand-authored, and browser `outerHTML` all land as a sensible Broadset document. Best-effort mapping, never crash, never silently drop structure.
3. **External-target export** — output must open cleanly in Illustrator and Inkscape with vectors editable, text selectable, and strokes/gradients visually identical. Valid SVG 2 per the W3C schema; passes `xmllint` and browser SVG rendering.
4. **Chain tolerance** — Broadset → SVG → edit in Illustrator → save → Broadset: Illustrator edits are preserved, Broadset semantics (animations, data bindings, page overrides) preserved where Illustrator didn't touch them, and elements the user deleted in Illustrator are surfaced as deletions the user confirms in Broadset.

## Strategy: standards-only — SVG `<metadata>` RDF + `data-bs-*` attributes + custom namespace

Like the PDF plan, **no sidecar, no out-of-band JSON blob**. Everything needed to round-trip must live in mechanisms that are part of the core W3C SVG specification and that Illustrator and Inkscape are already known to preserve across save.

Three layers, all standard:

- **Visual layer (what any SVG renderer draws).** Vectors as real `<path>`/`<rect>`/`<ellipse>` with proper `fill`, `stroke`, `stroke-width`, `stroke-linecap`, `stroke-linejoin`, `stroke-miterlimit`, `stroke-dasharray`, `stroke-dashoffset`, `fill-rule`, `fill-opacity`, `stroke-opacity`, `opacity`. Text as `<text>` + `<tspan>` with embedded fonts via `<defs><style>@font-face{…}</style></defs>` (WOFF2 base64) for non-system fonts. Groups as real `<g>` with recursive children and proper transform composition. Gradients as `<linearGradient>`/`<radialGradient>` with full stop arrays (conic is an SVG 2 gap — falls back to a many-stop linear approximation with a metadata hint carrying the true conic spec). Clip-paths as `<clipPath>`, masks as `<mask>`, patterns as `<pattern>`, filters as `<filter>`. Illustrator and Inkscape see a normal, fully-editable SVG.
- **Document metadata (SVG `<metadata>` with RDF/XML, W3C-recommended).** A `broadset:` XML namespace declared on the root `<svg>` and carried in a document-level `<metadata>` block using RDF/XML (the W3C-recommended encoding, used by Inkscape for its `<cc:Work>` metadata). The `<metadata>` block carries everything that lives above the page level: project settings, canvas unit/dpi declaration, asset registry (with base64 payloads or external refs per asset), data schema, page definitions and their override maps, element ordering, Dublin Core metadata. **No animations** per io-prereqs **IO-D-16** — SVG is a static carrier as far as Broadset is concerned. This is the SVG analogue of PDF's XMP — standards-blessed, preserved by Illustrator and Inkscape on save.
- **Element tagging (`data-bs-*` attributes + custom-namespace attributes).** Each rendered element carries `data-bs-id`, `data-bs-kind`, optionally `data-bs-data-field`, `data-bs-visible-when`, `data-bs-repeater`, and a `broadset:original-content-hash` namespaced attribute. These are the SVG 2 / HTML5 analogue of PDF marked content. `data-*` is part of SVG 2 ([data-* attributes spec](https://www.w3.org/TR/SVG2/struct.html#HTMLGlobalAttributes)) and survives cleanly through Illustrator, Inkscape, Figma import/export, and browser copy-paste unless the user aggressively flattens or restructures. Namespaced attributes are preserved by Illustrator (which uses its own `ai:` namespace) and Inkscape (`sodipodi:`/`inkscape:`).

When `data-bs-*` is stripped by an aggressive external edit, content-hash re-matching (geometry + text + style fingerprint) recovers element identity as a fallback. Elements that cannot be matched either way become new elements on re-import; elements present in document metadata but missing from the visual layer are flagged as deletions for the user to confirm. This matches the PDF plan's reconciliation model exactly — both importers consume the shared [packages/formats/src/_shared/reconcile/](../../packages/formats/src/) module defined in io-prereqs Phase 2.

Security posture is explicit and enforced by the importer, not by the renderer: `<script>`, `on*=` event handlers, `javascript:` URLs in `href`/`xlink:href`, and `<foreignObject>` with active content are stripped on import before the SVG ever reaches the renderer. The renderer's `innerHTML` path is replaced with a safe DOM-builder path that re-serializes from the parsed, sanitized AST.

## Dependencies — what to pull in, what to keep rolling

Most dependencies are shared across formats and are added once in io-prereqs Phase 2 (`culori`, `fontkit`, `dompurify`, plus the color / text-layout / xmp / fingerprint / reconcile stack). The SVG plan consumes them from `packages/formats/src/_shared/`. SVG-only libraries (`svgpath`, `css-tree`, `transformation-matrix`) are added by this plan and imported directly per io-prereqs **IO-D-07**:

- **`svgpath` (~14 KB, 1.5M downloads/week)** — path parsing, abs/rel normalization, and **transform baking**. This is exactly the tool we need for the Phase 3 decision "when a transform can't be represented by the target element's native fields, the shape is first converted to a path and the transform is baked into the `d`" — `svgpath(d).matrix(...).abs().round(3).toString()` does it in one line. Also handles `.unarc()` (elliptical arc → cubics) and `.unshort()` (short cubic/quadratic → full form) which we need for round-tripping paths through editors that don't accept all SVG path grammar.
- **`svg-path-properties` (already installed, ^2.0.0)** — keep using it for trim-path math and text-on-path offset queries. It's already in [packages/renderer](../../packages/renderer/package.json); reuse rather than duplicating.
- **`path-bool` (already installed, ^0.0.7)** — keep using it for path boolean ops; no change.
- **`css-tree` (~20 KB, used by csso, svgo, @astrojs)** — CSS parsing for SVG `<style>` blocks, including selector specificity resolution. `css-tree` is purpose-built for AST walks with a selector resolver, whereas `postcss` is plugin-heavy and selector matching is an add-on there. We emit valid CSS on export through the same tool for symmetry.
- **`transformation-matrix` (~2 KB, pure TS)** — compose/decompose affine transforms (`translate`, `rotate`, `scale`, `skew`, `matrix`). Works in Node and browser (DOM's `DOMMatrix` is browser-only and awkward in Vitest without jsdom configured for it). Used in `svg/import/transform.ts` for decomposing any affine into (tx, ty, angle, sx, sy, skewX) when decomposition is possible, and for composing the final transform on export.

**Consumed from `packages/formats/src/_shared/` (defined in io-prereqs Phase 2):** `_shared/color/` (wraps `culori` + `lcms-wasm`), `_shared/fonts/` (wraps `fontkit`; subsetting for embedded fonts shared with PDF), `_shared/text-layout/` (wraps `linebreak` + `bidi-js` + `harfbuzzjs`), `_shared/xmp/` (wraps `fast-xml-parser`), `_shared/sanitize/` (wraps `dompurify` with a Broadset-specific SVG policy), `_shared/shape-classifier/`, `_shared/fingerprint/` (wraps `xxhash-wasm`), `_shared/reconcile/` (wraps `microdiff`).

Not adopting, with reasons: `svgson` (DOMParser is enough, one more layer adds no fidelity); `paper.js` / `fabric` (authoring engines, far too heavy for a format module); `@svgdotjs/svg.js` (authoring API, wrong shape for import/export); `opentype.js` (fontkit covers this); `svgo` (output optimization is a separate concern — can be offered as an opt-in export option later, not in this plan's scope); `postcss` (replaced by css-tree above).

SVG-specific adds go in [packages/formats/package.json](../../packages/formats/package.json) and are declared in [project/implementation/architecture.md](./architecture.md). Bundle impact is ~40 KB gzipped for the SVG-specific importer path; the shared-module cost is paid once by io-prereqs Phase 2. All lazy-loaded from the format entry points so export-only consumers don't pay for importer deps.

## Phase plan

### Phase 0 — Spec & scope lockdown (no code)

- Rewrite [project/spec/formats/web-vector.md](../spec/formats/web-vector.md) SVG sections to cover: Import (with explicit matrix/all-variants of [spec/formats/web-vector.md](../spec/formats/web-vector.md) needs to be exhaustive here; split into a dedicated `project/spec/formats/svg.md` if that helps readability), Round-trip, External Interop, Color Model, Font Embedding, SVG Metadata (document-level RDF), Element Tagging (`data-bs-*`), Sanitization rules.
- Enumerate explicit non-goals: SMIL `<animate>` emission on export (Broadset animations ride in `<metadata>` instead, because SMIL is deprecated in browsers), embedded JavaScript, external CSS references, `<foreignObject>` with active content, `<script>`.
- State the standards-only constraint explicitly: Broadset MUST NOT rely on sidecar JSON files, non-namespaced custom attributes, or comment-embedded data to round-trip; everything rides in `<metadata>`, `data-bs-*`, or namespaced attributes.
- Update [project/spec/formats/spec.md](../spec/formats/spec.md): reflect the shared XMP/RDF + tagged-content pattern (see [pdf-support-plan.md](./pdf-support-plan.md)) as a reusable cross-format pattern.
- Acceptance criteria covering every new cross-format requirement and every external-tool fixture listed in Phase 5.

### Phase 1 — Types & architecture

Gated on io-prereqs **Phase 0** (decisions IO-D-01 through IO-D-15 ratified) and **Phase 1** (model additions — text runs, BroadsetColor, BroadsetFill, strokeMiterlimit, structured filter primitives, content hash, unit utilities) landing first.

- `packages/formats/src/svg/types.ts` — `SvgImportOptions`, `SvgExportOptions`, `SvgRoundTripMetadata`, `SvgSanitizationReport`, `BroadsetRdfPacket`, `ElementTagAttrs`, `FontEmbedChoice ('embed'|'reference'|'flatten')`, `UnitSystem ('px'|'mm'|'in'|'pt'|'em')`.
- Reorganize [packages/formats/src/](../../packages/formats/src/): `web-vector/` continues to mean "HTML standalone export"; SVG moves to `packages/formats/src/svg/`. The shared `_shared/` modules (`reconcile/`, `shape-classifier/`, `fonts/`, `sanitize/`, `fingerprint/`, `color/`, `text-layout/`, `xmp/`) are introduced by io-prereqs Phase 2 and consumed here.
- Add the SVG-specific dependencies (`svgpath`, `css-tree`, `transformation-matrix`) to [packages/formats/package.json](../../packages/formats/package.json). The shared libraries (`dompurify`, `culori`, `fontkit`, `fast-xml-parser`, `xxhash-wasm`, `microdiff`, `linebreak`, `bidi-js`, `harfbuzzjs`, `lcms-wasm`) land in io-prereqs Phase 2 — the SVG plan does not add them. Declare the SVG-specific additions in [architecture.md](./architecture.md) so the package-boundary gate recognizes them.
- Public API in [packages/formats/src/svg/index.ts](../../packages/formats/src/svg/index.ts): `exportSvgString`, `exportSvgDocument`, `importSvgDocument`, `canRoundTrip`.
- Register `importSvgDocument` in [import-document.ts](../../packages/formats/src/import-document.ts) (already wired but refactor for the new folder layout) and wire the new `exportSvgString` through [packages/demo/src/formatBridge.ts](../../packages/demo/src/formatBridge.ts).
- **De-risking spike:** round-trip a minimal SVG with `<metadata>` through Illustrator (Save As SVG) and Inkscape (File → Save) and confirm the RDF survives verbatim in both. If Illustrator rewrites or strips the `<metadata>`, adjust the Strategy — e.g. move the metadata into a `<defs><g id="broadset-metadata" …>` with namespaced attributes, which AI is known to preserve more reliably. Record the decision in [decisions.md](./decisions.md).

### Phase 2 — Export, rebuilt (fixes the known bugs, then exceeds dom-compositor)

Gated on:
- **Before 2a:** io-prereqs Phase 1 (strokeMiterlimit, content hash, model-level script rejection, unit conversion + length parser) + Phase 2 (`_shared/sanitize/`) + Phase 3 (safe DOM-builder renderer refactor).
- **Before 2b:** io-prereqs Phase 1 (conic center/angle, BroadsetColor with color-space preservation, structured filter primitives, pattern fill, text fidelity fields) + Phase 2 (`_shared/color/`, `_shared/fonts/`, `_shared/text-layout/`, `_shared/xmp/`) + Phase 3 (native renderer paths, font-asset-aware rendering) + Phase 4 (font asset type, image bytes, subsetting, dedup).

See the per-format gating matrix in [io-prereqs-plan.md](./io-prereqs-plan.md).

Small focused files, each soft-capped at ~300 lines (hard cap 500):

- `svg/export/geometry.ts` — unit conversion across px/mm/pt/in/em, affine transform composition, parent-child transform flatten (or preserve as a `<g transform>`, configurable per element), rotation composition, viewBox math.
- `svg/export/color.ts` — CSS color → SVG color via `_shared/color/` across named, hex, `rgb()`/`rgba()`, `hsl()`, `oklab()`, `oklch()`, and `color(display-p3 …)`. Gradient normalization. Conic gradients fall back to a many-stop linear approximation on the visual layer and carry the true spec in metadata.
- `svg/export/gradient.ts` — `<linearGradient>`, `<radialGradient>`, and the conic fallback — emit real `<defs>` entries with stable IDs, share defs across elements by content hash.
- `svg/export/fonts.ts` — font subsetting via the shared `_shared/fonts/subsetFont()`; embed as `@font-face { src: url('data:font/woff2;base64,…'); }` inside `<defs><style>` when `FontEmbedChoice = 'embed'`; external `url()` reference when `= 'reference'`; convert text to paths when `= 'flatten'` (useful for Illustrator users who forbid font embedding).
- `svg/export/text.ts` — `<text>` + `<tspan>` with font-family/size/weight/style/letter-spacing/text-anchor/text-decoration, baseline math that actually round-trips (not the current `fontSize * 0.35` hack), textLength + lengthAdjust where set, text-on-path via `<textPath href="#…">`.
- `svg/export/path.ts` — path element → `<path d="…">` with full stroke property coverage, preserve the original `d` verbatim when possible (no regex-based munging). When a transform must be baked (e.g. exporter targets a strict SVG 1.1 consumer that rejects nested transforms), use `svgpath(d).matrix(...).round(3)`. Trim-path → `stroke-dasharray`/`stroke-dashoffset` preserved; existing `svg-path-properties` continues to compute total length.
- `svg/export/shapes.ts` — rectangle/ellipse/group rendering. **Fixes the group bug:** `<g>` recursively renders children in the same element order as the Broadset document, with one `transform` attribute per group when flattening is disabled.
- `svg/export/image.ts` — `<image href="…">` with base64 data URIs for embedded assets, external URL for referenced assets, `preserveAspectRatio` from object-fit.
- `svg/export/mask.ts` — clipPath → `<clipPath>`, mask → `<mask>`, pattern → `<pattern>`; shared defs by content hash.
- `svg/export/filter.ts` — box-shadow/drop-shadow → `<filter><feDropShadow>`, blur → `<feGaussianBlur>`, color-matrix for hue-rotate/saturate/etc.
- `svg/export/metadata.ts` — build the `<metadata>` RDF/XML packet carrying project settings, canvas unit/dpi, asset registry, data schema, page definitions with override maps, Dublin Core metadata. No animation data (io-prereqs **IO-D-16**). Pure serialization.
- `svg/export/tagging.ts` — attach `data-bs-id`, `data-bs-kind`, `data-bs-data-field`, etc. to each element, plus a `broadset:content-hash` namespaced attribute for re-identification after tag stripping.
- `svg/export/sanitize.ts` — thin wrapper that calls `_shared/sanitize/` on Broadset-native `svg`-type opaque payloads before they're embedded in the output, so the exporter can never write `<script>` or event handlers even when re-exporting a hostile imported payload.
- `svg/export/core.ts` — orchestration only, ≤ 250 lines.

Sequencing inside Phase 2:
- **2a** parity + critical-bug fixes: recursive group rendering, full stroke property coverage, correct transform composition, gradient import→export round-trip, safe sanitized output, IN-state resolution for animated elements (per io-prereqs **IO-D-16**).
- **2b** surpasses prior art: font embedding, conic-fallback with metadata, OKLab color preservation via `_shared/color/` + `BroadsetColor.originalColor`, `data-bs-*` tagging on every rendered element. Animations are discarded per **IO-D-16** — not preserved in metadata.

### Phase 3 — Import

Gated on:
- **Before 3a:** io-prereqs Phase 1 (content hash) + Phase 2 (`_shared/fingerprint/`, `_shared/sanitize/`, `_shared/xmp/`).
- **Before 3b:** io-prereqs Phase 2 (`_shared/shape-classifier/`).

- `svg/import/parse.ts` — `DOMParser('image/svg+xml')` → parserror detection → `_shared/sanitize/sanitizeSvg(...)` → AST walk. The shared sanitize module is backed by DOMPurify's SVG profile and handles `<script>`, `on*=`, and `javascript:` URLs in `href`/`xlink:href`; no other content reaches downstream code.
- `svg/import/style-resolve.ts` — style resolution pass that composes, in CSS precedence order: inherited presentation attributes, inline `style=""`, `<style>` blocks (parsed via `css-tree` with its selector-matching and specificity calculator). Output is a fully resolved style map per element, so the element converters don't each redo this.
- `svg/import/transform.ts` — full affine transform parser built on `transformation-matrix`: `translate`, `rotate`, `scale`, `skewX`, `skewY`, `matrix`. Decomposes any affine transform into (translate, rotate, scale, skew) where possible; when skew is non-zero and the target element type doesn't support it, convert the shape to a path and bake the transform via `svgpath(d).matrix(m).abs().round(3)`.
- `svg/import/defs.ts` — walk `<defs>` once up front, building maps for gradients, patterns, filters, masks, clip-paths, `<symbol>` definitions, and font `@font-face` rules. Inline references on the elements that use them.
- `svg/import/element-converters/` — one file per native type: `rect.ts`, `ellipse.ts`, `circle.ts`, `line.ts`, `polyline.ts`, `polygon.ts`, `path.ts`, `text.ts`, `tspan.ts`, `image.ts`, `g.ts`, `use.ts` (dereferences `<symbol>` into an inline group), `foreign-object.ts` (sanitized, preserved as opaque `svg`-type element).
- `svg/import/gradient.ts` — parse `<linearGradient>`/`<radialGradient>` from defs into Broadset's structured gradient representation (not just the first stop's color).
- `svg/import/font-resolve.ts` — read `@font-face` from `<defs><style>`, preserve PostScript name, map to the closest available web-font family, fall back to local assets.
- `svg/import/metadata.ts` — parse the `<metadata>` RDF/XML if a `broadset:` namespace is present and hydrate project-level state (canvas, assets, data schema, page definitions, `document.metadata`) from it. No animation data in the packet (**IO-D-16**) — re-imported SVGs arrive static. Use the visual layer only to recover element geometry/style and to detect post-export edits that should override metadata defaults on tagged elements matched by `data-bs-id`.
- `svg/import/shape-classifier.ts` — thin wrapper around `_shared/shape-classifier/classifyPath()`: cubic Béziers in the canonical ellipse shape → ellipse, four right-angled lines → rectangle, otherwise generic path. Shared with PDF.
- `svg/import/css.ts` — thin wrapper over `css-tree`'s `parse`, `walk`, and selector-matcher; yields the style map consumed by `style-resolve.ts`. No custom selector engine.

Sequencing inside Phase 3:
- **3a** metadata + `data-bs-*` fast-path — import any SVG Broadset itself exported with perfect fidelity, round-trip golden tests pass.
- **3b** operator/element-level extraction — import arbitrary third-party SVGs (Illustrator, Inkscape, Figma export, Sketch export, Affinity, d3, hand-authored) as Broadset documents; every non-convertible fragment falls back to an opaque `svg`-type element, preserving information, with a warning.

### Phase 4 — Round-trip reconciliation

Gated on io-prereqs **Phase 2** (`_shared/reconcile/`).

- `svg/roundtrip.ts` — thin wrapper over `_shared/reconcile/reconcile(...)`: given the document `<metadata>` RDF + current visual layer, diff per tagged element:
  - Metadata values are defaults.
  - Current visual overrides them field-by-field when an external edit is detected (size, position, color, text content, path geometry, stroke properties).
  - New objects in the visual layer with no `data-bs-id` become new Broadset elements on an "Imported from SVG" page.
  - Tagged elements present in metadata but missing from the visual layer are flagged as deletions; user confirms in the demo UI.
  - When `data-bs-*` has been stripped (aggressive external edit), fall back to content-hash matching (geometry + text + style fingerprint via `_shared/fingerprint/`) before giving up and treating as new.
- The reconciliation engine is format-agnostic and consumes a canonical `TaggedElementDiff` shape that both SVG and PDF importers produce.

### Phase 5 — Tests (spec-first, per [testing.instructions.md](../../agents/instructions/testing.instructions.md))

- **Unit** — parse/emit for every element converter, every color space, every transform variant, every defs type (gradient/pattern/filter/mask/clipPath/symbol), CSS selector resolution, RDF packet serialization, sanitization (every known XSS vector), shape classifier.
- **Round-trip golden tests** — canonical BroadsetProject with every element type + animations + data bindings + multi-page overrides → export → re-import → deep-equal (except explicitly-lossy fields documented in the spec). Run on CI. Include a "worst-case" fixture: group of groups of groups of mixed types with transforms at every level.
- **External-tool fixtures.** Commit SVGs produced by:
  - Illustrator — Save As SVG (SVG 1.1 + SVG 2)
  - Illustrator — Export As SVG (web-optimized)
  - Inkscape — Plain SVG + Inkscape SVG
  - Figma — Export as SVG
  - Sketch — Export as SVG
  - Affinity Designer — Export as SVG
  - d3 — a small visualization snapshotted from a test page
  - Hand-authored — a dense `<style>`-heavy SVG, a `<use>/<symbol>`-heavy SVG, a gradient-heavy SVG, a clip-path + mask combination, text-on-path
  - Browser — `document.querySelector('svg').outerHTML` from a real page

  Smoke-test: import, count elements, assert no exceptions, snapshot structure so regressions surface immediately. Every fixture must complete import with either a native mapping or an explicit opaque-fragment preservation — never a silent drop.
- **Chain round-trip fixtures.** For each of Illustrator and Inkscape, commit two SVGs: one that Broadset exported, then opened and saved in the external editor, then re-imported. Assert `data-bs-*` preservation and metadata preservation. Document which tools strip what.
- **Chain CT (Playwright).** User imports an SVG in the demo, edits one element in each affected region, exports, re-imports, and asserts the edit survived across all affected regions — conforms to the cross-region CT rule in [testing.instructions.md](../../agents/instructions/testing.instructions.md).
- **Security tests.** A dedicated suite of hostile SVG fixtures (`<script>`, `onclick`, `javascript:` hrefs, `<foreignObject>` with active content, billion-laughs entity expansion, recursive `<use>` depth-bombs). Every one must be sanitized or rejected with a clear error before reaching the renderer.

### Phase 6 — UI

Gated on io-prereqs **Phase 5** (properties-panel expansions for stroke, gradient, filter, pattern picker, text fidelity, font-asset picker; import-warnings modal, deletion-confirmation modal, reconciliation diff view).

- Demo import dispatcher continues to accept `.svg` / `image/svg+xml` and routes through the new `importSvgDocument`.
- Export menu adds per-export options: font embedding (`embed` / `reference` / `flatten`), metadata inclusion on/off (default on), element tagging on/off (default on). `@heroui/react` `Select`/`Switch`/`Modal` per [heroui.instructions.md](../../agents/instructions/heroui.instructions.md).
- Import reports surface the `SvgSanitizationReport` and the warnings list from opaque-fragment preservation, in the shared HeroUI import-warnings modal from io-prereqs Phase 5.
- Deletion reconciliation modal shared with PDF (io-prereqs Phase 5).

## Risk register

- **Illustrator `<metadata>` preservation.** Illustrator may rewrite or strip the root `<metadata>` on save, particularly when exporting via "Export As" vs. "Save As". Verified in Phase 1 spike. Fallback: move metadata into a `<defs><g id="broadset-metadata" data-bs-metadata="…">` with everything on namespaced attributes, which AI preserves more reliably.
- **Font embedding size.** Embedding WOFF2 as base64 inflates SVG size roughly 1.4× the font bytes. Provide the `reference` and `flatten` options so users can choose. Document trade-offs in the spec.
- **Conic gradient round-trip.** SVG 2 has no native conic gradient. Visual layer carries the many-stop linear approximation; metadata carries the true conic spec. Third-party editors that drop the metadata turn a re-import into the approximation. Documented as known-lossy.
- **Animations are discarded on export (io-prereqs IO-D-16).** SVG export emits the fully-entered "IN" state of every animated element as static geometry/style. No SMIL `<animate>` (deprecated), no CSS-keyframe emission, no metadata preservation of animation data. If a user needs an animated SVG for an external consumer, that is a future feature — out of scope.
- **`<foreignObject>` fidelity.** HTML-in-SVG is a security vector and a cross-renderer compatibility hazard. Our policy: opaque `svg`-type preservation of sanitized HTML (no scripts, no event handlers, no external resources), best-effort render via the existing `svg`-type renderer path. Documented as known-limited.
- **`<use>` and `<symbol>` references.** Import dereferences them into inline groups by default (safer round-trip, larger output). External-tool export preserves the dereferenced form. We do not attempt to reconstruct `<use>` relationships on export in the first cut — documented as known-lossy for "structural" round-trip, but visually identical.
- **CSS stylesheet specificity edge cases.** `postcss` handles the parsing, but selectors like `:nth-child` and attribute selectors composed in the source SVG can be tricky to resolve correctly into a flat style map. Covered by tests. When resolution is ambiguous, the importer falls back to the last-declared rule and emits a warning.
- **Security.** Covered by the io-prereqs **Importer security contract** (entity-expansion hardening, size/depth caps, DOMPurify at the sanitize boundary, `security-reviewer` on every importer diff). SVG-specific additions: pin DOMPurify to a minor version and track its CVE feed; maintain a dedicated hostile-SVG fixture suite in Phase 5 (`<script>`, `onclick`, `javascript:` hrefs, `<foreignObject>` with active content, billion-laughs, `<use>` depth-bombs).

## Sequencing & commits

Combined with [io-prereqs-plan.md](./io-prereqs-plan.md):

**io-prereqs Phase 0** (decisions) **→ io-prereqs Phase 1** (model) **→ io-prereqs Phase 2** (`_shared/` modules + libraries) **→ io-prereqs Phase 3** (renderer refactor) **→ io-prereqs Phase 4** (asset pipeline) **→ SVG Phase 0** (spec) **→ SVG Phase 1** (types, arch, de-risking spike) **→ SVG Phase 2a** (~8 commits, group-children fix lands first as an isolated commit) **→ SVG Phase 2b** (~6 commits) **→ io-prereqs Phase 5** (editor UI surface) **→ SVG Phase 3a** (~4 commits) **→ SVG Phase 3b** (~8 commits, one per external-tool fixture family) **→ SVG Phase 4** (~3 commits) **→ io-prereqs Phase 6** (testing infra) **→ SVG Phase 5/6**.

Each phase ends on a green `npm run gate:full`. UI-visible phases also end on a green `npm run ct`.

## Decisions locked in

- **No sidecar, standards only.** All round-trip metadata rides in SVG `<metadata>` RDF/XML (W3C-recommended) and `data-bs-*` attributes (SVG 2 / HTML5 global), plus a `broadset:` namespace for attributes that must travel on individual elements. No separate JSON file, no comment-embedded data, no non-namespaced custom attributes.
- **No silent drops — ever.** Any SVG element or attribute not natively mappable is preserved as either (a) an opaque `svg`-type Broadset element with the original sanitized `outerHTML`, or (b) a namespaced attribute on the nearest ancestor. A matching warning is emitted in the import report. This invariant is inherited from dom-compositor and enforced by tests in Phase 5.
- **Renderer path is a safe DOM-builder, not `innerHTML`.** The current `host.innerHTML = element.content` path in [screen-renderer/element-renderers.ts:352-364](../../packages/renderer/src/screen-renderer/element-renderers.ts) is replaced. Sanitization happens at import; the renderer trusts the AST. Landed in io-prereqs Phase 3.
- **DOMPurify is the sole sanitization entry point.** Both the importer (`svg/import/parse.ts`) and the exporter's opaque-payload re-emission (`svg/export/sanitize.ts`) go through the shared `packages/formats/src/_shared/sanitize/` module. We never hand-roll sanitization logic, and we track DOMPurify's CVE feed.
- **Full affine transform parsing on import, bake-to-path when non-trivial.** No more matrix/scale/skew-as-opaque-payload. When a transform can't be represented by the target element's native fields (`position` + `rotation`), the shape is first converted to a path and the transform is baked into the `d` via `svgpath`. `scale`/`skew` are **not** added to element fields — per io-prereqs decision **IO-D-02**.
- **Recursive group export.** `<g>` emits children in order. The current empty-`<g>` bug is a day-one fix in Phase 2a.
- **Animations are discarded on export per io-prereqs IO-D-16.** SVG export renders the fully-entered "IN" state of each animated element. No SMIL, no CSS keyframes, no metadata preservation. The `.bsp` is the source of truth for animation data. Matches the PDF and PSD plans.
- **Font embedding is default-on.** The default `FontEmbedChoice` is `embed` so Broadset-exported SVGs render identically everywhere out of the box. Users who want smaller output opt into `reference` or `flatten`. Shared font-subsetting pipeline at `packages/formats/src/_shared/fonts/` (io-prereqs Phase 2 + Phase 4) is consumed by SVG, PDF, and PPTX exporters.
- **Color preservation via `_shared/color/`.** OKLCH/OKLab/display-p3 colors from import round-trip through the model without silently being flattened to sRGB hex. Depends on io-prereqs Phase 1 `BroadsetColor` (optional `space` + `originalColor` preservation).
- **CSS parsing via `css-tree`, not `postcss`.** css-tree is purpose-built for AST walks with a selector-specificity calculator; postcss is plugin-heavy and selector matching is an add-on. Used symmetrically for parse and emit.
- **Cross-environment affine math via `transformation-matrix`.** Works in Node (Vitest) and browser; DOMMatrix is browser-only and awkward in tests.
- **Importer dependencies are lazy-loaded** from the format entry points so export-only bundles don't pay the SVG-specific importer cost.
- **Shared cross-format modules with PDF, PPTX, PSD.** `packages/formats/src/_shared/{reconcile, shape-classifier, fonts, sanitize, fingerprint, color, text-layout, xmp}/` are introduced by io-prereqs Phase 2 and consumed across every format plan — neither SVG nor PDF nor PPTX nor PSD rebuilds these wheels.

## Open questions

- Inkscape's own `sodipodi:`/`inkscape:` namespace carries node-level metadata (e.g. object type hints) that could accelerate import classification for Inkscape-authored files. Worth consuming those hints opportunistically when present, or keep the importer source-agnostic? Decide in Phase 0.
- For Illustrator-sourced SVGs, does the `ai:` namespace carry any information worth preserving on re-export so that Illustrator recognizes them as its own on reopen? Decide in Phase 0 after inspecting a few AI fixtures.
- Do we want a dedicated `project/spec/formats/svg.md` split off from the current combined [web-vector.md](../spec/formats/web-vector.md), or keep one spec for both? Lean toward a split once the SVG section grows past ~300 lines.
