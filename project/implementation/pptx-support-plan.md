# PPTX Support Plan

Status: draft — pre-Phase 0. Supersedes the scope of [project/spec/formats/pptx.md](../spec/formats/pptx.md); the spec file is rewritten in Phase 0.

This plan captures the full-fidelity PPTX import/export strategy for Broadset, covering round-trip within Broadset, external-source import (PowerPoint for Windows/Mac/Office 365, Keynote, Google Slides, LibreOffice Impress, Canva), and external-target export with minimal-loss editability in PowerPoint. It also covers the "chain" case: Broadset → PPTX → edit in PowerPoint → Save → re-import to Broadset with user edits preserved and Broadset semantics (animations, data bindings, page overrides) preserved wherever PowerPoint did not touch them.

**App-level prerequisites live in [io-prereqs-plan.md](./io-prereqs-plan.md).** That file enumerates the Broadset data-model / editor capabilities the fidelity tiers below assume and which must be added. Prereqs are shared across PPTX, PDF, PSD, and SVG. Key PPTX dependencies on io-prereqs phases:

- **io-prereqs Phase 1 (model additions)** — rich-text `TextBody`/`Paragraph`/`Run` with hyperlinks + lang + bullets (unblocks Phase 2a text emission and Phase 3 import), `BroadsetColor` theme-slot variant with `ColorMods` (unblocks Phase 2b generated theme + Phase 3 `<a:schemeClr>` import), `BroadsetFill` picture-fill variant (unblocks Phase 3 `<a:blipFill>` import), `BroadsetGradientStop.mods` (unblocks theme-gradient round-trip), stroke `strokeHeadEnd`/`strokeTailEnd` (unblocks `<a:ln>` arrow endings), `Page.notes` (unblocks notes round-trip), typed `extensions.pptx` namespace + per-element dirty flag (unblocks preserved blobs for tables, charts, connectors, transitions, unknown OOXML).
- **io-prereqs Phase 2 (shared modules)** — `_shared/fonts/` (font subsetting for `ppt/fonts/`), `_shared/fingerprint/` + `_shared/reconcile/` (round-trip ledger), `_shared/color/` (theme-color math + OKLCH conversions).
- **io-prereqs Phase 3 (renderer)** — nested group transform composition audit (so "groups stay groups" actually works; audit A1 in io-prereqs Phase 6 testing).
- **io-prereqs Phase 4 (asset pipeline)** — font asset type, image asset bytes, subsetting pipeline (shared with PDF/SVG).
- **io-prereqs Phase 5 (editor UI)** — run-edit mode + bullets editor (unblocks PPTX Phase 2a text-run round-trip in the editor), swatches + theme-aware color picker, picture-fill picker, reconciliation diff view.

The PPTX plan's degradation-class features (tables, charts, connectors, transitions, comments, pattern fill) ride in `extensions.pptx.*` via the typed-namespace contract (io-prereqs Phase 1) and graduate to first-class element types in separate tracks. See the degradation table in [io-prereqs-plan.md](./io-prereqs-plan.md) for the preservation keys.

## Current state (what "absolutely broken" means)

**Broadset today — [packages/formats/src/pptx/](../../packages/formats/src/pptx/), 1,689 lines:**

- **XML parsing is regex-based, not namespace-aware.** [import-utils.ts](../../packages/formats/src/pptx/import-utils.ts) uses raw regex to pull attributes out of slide XML. Any PPTX that uses non-default prefixes, CRLF whitespace, nested comments, CDATA, or unusual namespace declarations can silently mis-parse. This is the biggest foundational gap.
- **Single slide only.** [import.ts:113](../../packages/formats/src/pptx/import.ts) hardcodes a single page; only `ppt/slides/slide1.xml` is ever opened. Every multi-slide deck in the world becomes a one-slide document.
- **No slide master / layout / theme resolution.** Theme colors (`<a:schemeClr val="accent1"/>`), theme fonts (`+mj-lt`, `+mn-lt`), layout placeholders, and master inheritance are all ignored. Real-world PPTX is ~80% theme-driven; today we see none of it.
- **Text is reduced to plain strings.** [slide-shapes.ts:113-137](../../packages/formats/src/pptx/slide-shapes.ts) only emits `fontSize` and `fontColor`; bold, italic, underline, font family, alignment, paragraph spacing, bullets, hyperlinks, line breaks, and multi-run paragraphs are all discarded on both import and export.
- **Paths silently drop their geometry.** [slide-shapes.ts:175-189](../../packages/formats/src/pptx/slide-shapes.ts) serializes every `path` element as an empty rectangle — the `d` attribute is never written.
- **QR codes export as empty rectangles.** No QR rendering. [slide-shapes.ts:329-330](../../packages/formats/src/pptx/slide-shapes.ts) falls through to the rect handler; `qrcode-generator` is in [package.json](../../packages/formats/package.json) but unused here.
- **Groups do not compose transforms.** Group rotation/scale is not composed into children; grouped content drifts as soon as a group is rotated.
- **Gradients, strokes, shadows, opacity, blend modes, clip paths** — all silently dropped except the single-gradient SVG fallback in [svg-fallback.ts](../../packages/formats/src/pptx/svg-fallback.ts), which supports only uniform corner radius, fill, and a solid border-radius on rect.
- **Unknown content is lost, not preserved.** Any shape type Broadset doesn't recognize (tables, charts, SmartArt, connectors, ink, 3D, equations) is dropped on import, and any Broadset metadata that PPTX can't express visually is dropped on export.
- **Image media placeholder bug.** [import-utils.ts:178](../../packages/formats/src/pptx/import-utils.ts) returns the literal string `pptx-media:rId123` for a missing image — a broken placeholder that the tests never exercise because the tests only round-trip data URIs they themselves supplied.
- **No animations, transitions, notes, tables, charts, SmartArt, connectors, comments, embedded media, embedded fonts, speaker notes.**
- **No real-world fixtures.** All 17 tests in [pptx.test.ts](../../packages/formats/src/pptx/pptx.test.ts) use synthetic documents produced by the same code they test. The round-trip tests prove only that the exporter and importer are mutually consistent, not that either matches the PPTX spec or any external tool.

**dom-compositor reference (~2,488 lines across pptxImport.ts + pptxExport.ts):** meaningfully better in several places that we should port immediately, but still nowhere near full-fidelity. Worth taking:

- Namespace-aware parsing via `DOMParser` + `getElementsByTagNameNS()` with a `getAttribute('r:id')` fallback.
- Proper EMU / rotation / color normalization helpers (`emuToMm`, `pptxRotationToDegrees`, `normalizeHexColor`).
- Relationship manager — per-slide rel-ID → media-path map.
- Transform flattening (`flattenElementsForPptx`) with cycle detection for grouped children on export.
- Centralized `requiresPictureFallback()` predicate that decides native-OOXML vs SVG-raster.
- Text run/paragraph property extraction (font family, size, bold, italic, color, alignment).

Worth _not_ taking: dom-compositor still flattens groups on export rather than emitting `<p:grpSp>`, never resolves theme colors, has no gradient support, no multi-slide export, no animations, no custom-geometry path emission, no preservation of unknown content.

Neither codebase has ever imported a third-party PPTX with high fidelity.

## Goals

1. **Round-trip fidelity (Broadset ↔ PPTX ↔ Broadset)** — lossless except for features PPTX genuinely cannot express; those are explicitly enumerated in the spec.
2. **External-source import** — PPTX produced by PowerPoint for Windows/Mac, PowerPoint for the Web / Office 365, Keynote export, Google Slides export, LibreOffice Impress, Canva export, and Slideshare export must land as a sensible Broadset document; best-effort mapping, never crash.
3. **External-target export** — output must open cleanly in PowerPoint with everything editable in-place (text selectable with real runs, shapes adjustable, paths editable in Edit Points mode, images high-resolution); must pass the Microsoft Office "Inspect Document" and "File → Info → Check for Issues" checks; ECMA-376 / ISO/IEC 29500 compliant.
4. **Chain tolerance** — Broadset → PPTX → edit in PowerPoint → Save → re-import: the user's PowerPoint edits are preserved where possible, and Broadset semantics (animations, data bindings, pages-as-overrides) are preserved where PowerPoint didn't touch them.

## Strategy: standards-only — OOXML extension lists + shape-name tags + custom XML parts

**No sidecar. No app-private streams. No repurposed fields.** Everything we need to round-trip must live in mechanisms that are part of the core OOXML specification (ECMA-376) and that PowerPoint, Keynote, and Google Slides already understand as "metadata I should preserve on save." That is the only durable way to survive the chain; anything else gets silently dropped the first time a user saves the deck in a foreign tool.

Three layers, all standard:

- **Visual layer (what any PPTX reader draws).**
  - Text as real `<a:r>`/`<a:p>` runs and paragraphs with full run properties (`<a:rPr>` — font, size, bold, italic, underline, color, language, hyperlink) and paragraph properties (`<a:pPr>` — alignment, indent, margin, line spacing, bullets/numbering).
  - Shapes as preset geometries (`<a:prstGeom prst="…">`) when Broadset's element maps to one of PPTX's ~180 presets, otherwise as `<a:custGeom>` with native PPTX path operators (`moveTo`, `lnTo`, `cubicBezTo`, `arcTo`, `close`). Vectors stay vectors — no SVG rasterization for arbitrary paths.
  - Fills including `<a:solidFill>`, `<a:gradFill>` (linear, radial, and path gradients with full stop lists, `lumMod`/`lumOff`/`tint`/`shade` modifiers), `<a:blipFill>` (picture fill with stretch/tile/crop), `<a:pattFill>`, and theme-color references (`<a:schemeClr>`).
  - Strokes as `<a:ln>` with width, dash, join, cap, and head/tail arrow endings.
  - Images as `<p:pic>` with proper relationships, preserving original compression (JPEG pass-through, PNG pass-through, no re-encode).
  - Groups as native `<p:grpSp>` with proper child-relative coordinates and cumulative group transform — not flattened.
  - Masks via `<a:clipPath>` where expressible, SVG picture fallback where not.
  - Opacity via `<a:alpha>` inside fills; element-level opacity via transparency groups on the group shape.
  - Slide masters and layouts generated from Broadset's canvas + style tokens so that foreign editors see a theme-consistent deck, not a pile of absolute-positioned shapes.
  - Multi-slide support: one Broadset page → one PPTX slide, with page overrides materialized into per-slide shape overrides.

- **Semantic layer (shape-name tags + extension list on every element).** Each Broadset element is emitted with:
  - A shape name (`<p:cNvPr name="BSET:{uuid}:{kind}:{dataField?}"/>`) carrying the element's Broadset ID, kind, and optional data-field binding. Shape names survive PowerPoint save/load cleanly; they are user-visible in the Selection pane but semantically opaque. When the user renames the shape, the `BSET:{uuid}` prefix is preserved if the user didn't delete it; otherwise content-hash re-matching recovers identity on re-import.
  - An OOXML extension element on the shape's non-visual properties (`<p:extLst><p:ext uri="{broadset-element-ext}"><bset:elementMeta>…</bset:elementMeta></p:ext></p:extLst>`). The extension carries the structured per-element semantics that don't fit in a shape name: full data-field path, `visibleWhen` expression, repeater config, per-element animation IDs, style-token references, and the original element kind for cases where Broadset's kind doesn't collapse to a single PPTX shape type (e.g. `ticker`, `clock`, `qrcode`). The `uri` attribute is the standard OOXML extension-discrimination mechanism; conforming readers (PowerPoint, Keynote, LibreOffice) preserve unknown extensions verbatim across save.

- **Document layer (custom XML parts).** Two custom XML parts under `customXml/` in the OOXML package, with proper `[Content_Types].xml` registration and `_rels` to the presentation:
  - `customXml/broadset-project.xml` — project-level state that lives above the slide level: settings, canvas unit/dpi declaration, asset registry (with original asset IDs so images stay stable across re-import), data schema, page definitions and their override maps, Dublin Core metadata. **No animations** — animations are handled either as native `<p:timing>` (when mappable) or discarded (when not), per io-prereqs decision **IO-D-16**.
  - `customXml/broadset-interop.xml` — the round-trip ledger: per-element content hashes computed at export time, the Broadset document version, and the export timestamp. On re-import, the ledger is used to detect which elements PowerPoint touched (hash mismatch) versus which are unchanged (hash match), so we can decide field-by-field whether XML part values or the current visual state should win.

When extension-list tags are stripped by an aggressive external tool and the shape name has been rewritten past recognition, content-hash re-matching (geometry + text + style fingerprint + z-order) recovers element identity as a fallback. Elements that cannot be matched either way become new elements on re-import; elements present in the custom XML but missing from the slides are surfaced as deletions for the user to confirm in the demo UI.

## Phase plan

### Phase 0 — Spec & scope lockdown (no code)

- Rewrite [project/spec/formats/pptx.md](../spec/formats/pptx.md). Today's spec is four tiny requirements and describes the current implementation; the new spec describes the target behavior. New sections: Import, Round-trip, External Interop, Theme & Master Resolution, Color Model, Text Model, Geometry Model, Animations & Transitions, Custom XML Parts, Shape-name Tagging, Extension-list Tagging, Preservation of Unknown Content.
- Enumerate explicit non-goals: SmartArt authoring (import-only, best-effort visual recovery), charts authoring (import-only, best-effort static recovery), ink annotations, 3D models, embedded OLE objects, VBA/macros, password protection / DRM, comments (import-only initially), co-authoring metadata.
- State the standards-only constraint explicitly: Broadset MUST NOT rely on app-private OOXML streams or out-of-package sidecars; everything that must round-trip lives in the visual layer, `<p:extLst>` extensions, shape-name tags, or custom XML parts.
- Update [project/spec/formats/spec.md](../spec/formats/spec.md) to cross-reference the shared extension-list / custom-XML-part pattern (the same pattern DOCX and XLSX support) so other OOXML-family formats can reuse it later.
- Acceptance criteria covering every new requirement, per [CONTRIBUTING.md](../../CONTRIBUTING.md) spec conventions.

### Phase 1 — Types, architecture, and dependency swap

- **Preconditions:** io-prereqs Phase 0 (decisions), Phase 1 (rich-text model, BroadsetColor with theme slots, BroadsetFill picture variant, typed extensions, dirty flag, Page.notes, strokeHead/TailEnd) and Phase 2 (`_shared/color/`, `_shared/fonts/`, `_shared/xmp/` if applicable, `_shared/fingerprint/`, `_shared/reconcile/`) complete.
- `packages/formats/src/pptx/types.ts` — `PptxImportOptions`, `PptxExportOptions`, `PptxRoundTripLedger`, `ShapeNameTag`, `ElementMetaExtension`, `ThemeColorRef`, `ResolvedColor`, `ResolvedFont`, `OoxmlRelId`, `SlideMasterResolved`, `SlideLayoutResolved`.
- **Dependency changes — drop regex parsing, consume shared utilities from io-prereqs, add PPTX-specific helpers.** Record in [decisions.md](./decisions.md).

  **Consumed from `packages/formats/src/_shared/` (added once in io-prereqs Phase 2):**
  - `_shared/xmp/` (wraps `fast-xml-parser`) — reused here for namespace-aware OOXML parsing. `fast-xml-parser` is added by io-prereqs Phase 2; the PPTX importer uses it directly (not via the XMP wrapper) for slide/theme/master XML. Staying on the JSON-shape API keeps the bundle small.
  - `_shared/color/` (wraps `culori` + `lcms-wasm`) — OOXML theme-color math per ECMA-376 §20.1.2.3.4 (`lumMod`, `lumOff`, `tint`, `shade`, `alpha`) plus HSL/OKLCH/CMYK conversions. Tint/shade is the canonical PPTX bug surface; the shared module's `applyMods()` primitive replaces every hand-rolled attempt.
  - `_shared/fonts/` (wraps `fontkit`) — TTF/OTF parsing and subsetting for embedded fonts under `ppt/fonts/`. Same subsetting pipeline PDF and SVG use.
  - `_shared/fingerprint/` + `_shared/reconcile/` — round-trip ledger hashing and per-element diff for Phase 4.

  **PPTX-specific additions:**
  - **Add `svgpath`** — parses, normalizes, and mutates SVG path `d` strings. Used in both directions: SVG `d` → OOXML `<a:custGeom>` path operators on export, and reverse on import. Normalizes arcs to cubics where OOXML lacks an arc op that matches, handles absolute/relative conversion, composes transforms. Without it, arc emission alone is a multi-day sink.
  - **Swap `pizzip` → `fflate`** in Phase 1. `fflate` is ~8× faster, smaller bundle, and works identically in browser + Node. One-day swap; lands before any of the split-file work so every new file is written against the final ZIP API.
  - **Add `svgo`** — minimizes the SVG picture fallbacks we embed. Smaller `.pptx` output, cleaner XML, fewer round-trip surprises from namespace bloat and dead attributes.
  - **Devonly: add `python-pptx` as a test oracle** (invoked from a test-fixture-generation script, not shipped). Golden-source PPTX produced by a known-good OOXML library we can import and assert structure against. Catches our misreads of ECMA-376 faster than reading the spec back to ourselves.
  - **Explicitly not added:** `pptxgenjs`, `officegen`, `node-pptx` — all high-level "build a deck" APIs that hide the XML we specifically need to control (extension lists, custom XML parts, `<a:custGeom>`, theme references). `@xmldom/xmldom` — deferred; revisit only if `fast-xml-parser`'s JSON shape becomes a readability problem in the import tree-walk code.
- Public API in [packages/formats/src/pptx/index.ts](../../packages/formats/src/pptx/index.ts): `exportPptxBytes`, `importPptxDocument`, `canRoundTripPptx`.
- Wire `importPptxDocument` through [import-document.ts](../../packages/formats/src/import-document.ts) (already registered — swap to the new implementation).
- Split current 1,689 lines into files under the 500-line soft cap per [typescript.instructions.md](../../agents/instructions/typescript.instructions.md), each single-concern:
  - `ooxml/package.ts` — ZIP + `[Content_Types].xml` + root `_rels` orchestration.
  - `ooxml/relationships.ts` — per-part relationship read/write, `OoxmlRelId` allocation.
  - `ooxml/namespaces.ts` — the full OOXML namespace table (a, p, r, xdr, mc, p14, p15, etc.).
  - `ooxml/units.ts` — EMU ↔ mm, twips, 60000ths-of-a-degree rotation.
  - `ooxml/xml.ts` — namespace-safe reader/writer wrappers over `fast-xml-parser`.
  - Import-side: `import/theme.ts`, `import/master.ts`, `import/layout.ts`, `import/slide.ts`, `import/shape.ts`, `import/text.ts`, `import/geometry.ts`, `import/picture.ts`, `import/group.ts`, `import/table.ts`, `import/chart.ts`, `import/animation.ts`, `import/notes.ts`.
  - Export-side: `export/theme.ts`, `export/master.ts`, `export/layout.ts`, `export/slide.ts`, `export/shape.ts`, `export/text.ts`, `export/geometry.ts`, `export/picture.ts`, `export/group.ts`, `export/table.ts`, `export/animation.ts`, `export/notes.ts`.
  - Semantic layer: `semantic/shape-name.ts`, `semantic/element-ext.ts`, `semantic/custom-xml.ts`, `semantic/ledger.ts`.
  - `core.ts` — orchestration only, ≤ 250 lines.

### Phase 2 — Export, rebuilt (matches, then exceeds dom-compositor)

Gated on io-prereqs **Phase 3** (renderer — nested group transform composition; "groups stay groups" depends on it) before 2a, and io-prereqs **Phase 4** (font asset type, image asset bytes, subsetting, embed-permission) + **Phase 5** (run-edit UI, bullets editor, swatches + theme-aware color picker) before 2b.

Sequencing:
- **2a — parity rebuild with dom-compositor.** Namespace-safe emission, EMU/rotation/color helpers, relationship manager, transform flattening *only within* `<p:grpSp>` children (groups stay groups), per-corner radii, uniform-radius → `prst="roundRect"`, non-uniform → SVG fallback picture, clip-path masking via SVG fallback, text run/paragraph props, solid fills with alpha.
- **2b — surpass prior art.**
  - **Multi-slide.** One Broadset page → one PPTX slide; page overrides are materialized into per-slide shape deltas at export time so the on-slide visual matches what the page renders in Broadset.
  - **Generated theme + master + layout.** Emit a proper `ppt/theme/theme1.xml`, `ppt/slideMasters/slideMaster1.xml`, and one `ppt/slideLayouts/slideLayoutN.xml` per distinct Broadset layout family, populated from the project's style tokens. Shape fills reference theme colors (`<a:schemeClr>` with `lumMod`/`lumOff`) when the Broadset color matches a theme slot, giving users a "Reset to theme" affordance in PowerPoint.
  - **Real gradients.** `<a:gradFill>` with full stop lists (linear, radial, path), replacing today's SVG-only gradient path.
  - **Native paths.** `<a:custGeom>` for any Broadset path element, emitting `moveTo`/`lnTo`/`cubicBezTo`/`arcTo`/`close` path operators directly so the path is editable in PowerPoint's Edit Points mode. No SVG rasterization for paths that PPTX can express natively.
  - **QR codes.** Render via `qrcode-generator` (already in the package) and emit as a grouped `<p:grpSp>` of filled rects when module count is small enough, otherwise as a single `<p:pic>` with embedded SVG. Either way, the QR remains crisp at any zoom.
  - **Clocks, tickers, videos.** Rendered visually as their initial frame (not an animation-timeline IN state — these elements have no entry keyframes, their dynamism comes from the element kind itself). Their configuration (clock format, ticker content list, video source) is preserved in the shape's `<p:extLst>` entry per io-prereqs **IO-D-18** so re-import restores them as live Broadset elements.
  - **Text autofit, multi-paragraph, hyperlinks, bullets and numbered lists, RTL, language runs.**
  - **Speaker notes** emitted as `ppt/notesSlides/notesSlideN.xml` with proper master + rels.
  - **Animations & transitions (per io-prereqs IO-D-16).** Where Broadset's animation maps cleanly to PowerPoint's `<p:timing>` tree (fade, wipe, fly-in, zoom, rotate, path motion), emit native animations so the deck plays in PowerPoint. For unmappable animations, export the element in its fully-entered "IN" state and **discard** the animation data — no `customXml` preservation of animations. The `.bsp` is the source of truth; round-trip through PPTX is explicitly lossy for unmappable animations and documented as such in the spec.
  - **Shape-name tagging + `<p:extLst>` extensions** on every shape.
  - **Custom XML parts.** `broadset-project.xml` and `broadset-interop.xml` attached with proper `customXml/_rels/*` and `[Content_Types].xml` entries; registered against `ppt/presentation.xml` via its own relationships file.

### Phase 3 — Import

Gated on io-prereqs **Phase 1** (rich-text runs, `BroadsetColor` with theme slots + mods, `BroadsetFill` picture variant, gradient stop mods, content hash, typed `extensions.pptx` namespace) and **Phase 2** (`_shared/color/` for theme-color math, `_shared/fonts/` for font subsetting, `_shared/fingerprint/`, `_shared/reconcile/`, `_shared/shape-classifier/`).

- `import/package.ts` — unzip, read `[Content_Types].xml` and root `_rels`, enumerate slides via `ppt/presentation.xml` + `ppt/_rels/presentation.xml.rels`, fall back to numeric sort only if the rels file is malformed.
- `import/theme.ts` — read `ppt/theme/theme1.xml`; build a theme color resolver (`accent1..6`, `lt1/lt2`, `dk1/dk2`, `hlink`, `folHlink`) that applies `lumMod`/`lumOff`/`tint`/`shade`/`alpha` modifiers.
- `import/master.ts` + `import/layout.ts` — resolve placeholder inheritance. Any value unset on a slide shape inherits from the layout's corresponding placeholder, then from the master's placeholder, then from the theme. Today we ignore all three layers; most real-world PPTX breaks without them.
- `import/shape.ts` — walk the slide shape tree recursively, building a per-shape resolved-property record before mapping to Broadset.
- `import/text.ts` — reconstruct style from resolved font, size (sz/100), bold, italic, underline, color, language, alignment, indent, margin, line spacing, bullets; preserve multi-paragraph, mixed-run paragraphs.
- `import/geometry.ts` — map `prstGeom` presets to Broadset element kinds with a preset table (rect/roundRect/ellipse/triangle/star/arrow/callout/…); unknown presets become `svg` elements with a rasterized fallback so nothing is lost. `custGeom` → native Broadset `path` with `d` attribute reconstructed from OOXML path operators.
- `import/picture.ts` — resolve `<p:blipFill>` via rels, handle external image references, preserve original bytes + MIME, re-use dom-compositor's SVG unwrapping heuristic when the picture *is* a Broadset SVG fallback.
- `import/group.ts` — map `<p:grpSp>` to Broadset groups without flattening; compose `a:chOff`/`a:chExt` child offset transforms correctly.
- `import/table.ts` — `<a:tbl>` → Broadset's closest representation (group of text boxes with borders until Broadset grows a native table element; tracked as a spec gap).
- `import/chart.ts` — `<c:chart>` → a picture of the chart's static rendering plus a preserved XML blob in the element extension so re-export doesn't lose it.
- `import/animation.ts` — walk `<p:timing>` trees into Broadset's animation model for the subset we can express natively. For unmappable `<p:timing>` entries, drop on import and emit a warning in the import report (no round-trip preservation per io-prereqs **IO-D-16**; the user can re-author in Broadset if needed).
- `import/notes.ts` — `notesSlideN.xml` → Broadset document-level speaker-notes field per page.

Sequencing inside Phase 3:
- **3a — fast-path.** When `customXml/broadset-project.xml` and shape-name tags / extensions are present, hydrate the Broadset document directly and use the slide operator tree only to detect post-export edits per-element (hash compare against `broadset-interop.xml` ledger). This is the "we exported it, so we know exactly what it should be" path.
- **3b — operator-level extraction.** Import arbitrary third-party PPTX as Broadset documents. All of the above modules run even when no Broadset metadata is present.

### Phase 4 — Round-trip reconciliation

Gated on io-prereqs **Phase 2** (`_shared/reconcile/`, `_shared/fingerprint/`) and **Phase 5** (reconciliation diff view, deletion-confirmation modal, conflict indicators).

- `roundtrip.ts` — thin wrapper over `_shared/reconcile/reconcile(...)`. Given the custom XML parts + current slide tree + interop ledger, diff per tagged element:
  - Custom XML part values are defaults.
  - Current visual overrides them field-by-field when an external edit is detected (ledger hash mismatch on the element).
  - New objects in the slide tree with no shape-name tag and no element extension become new Broadset elements on an "Imported from PPTX" page (or on the matched page when slide identity is preserved via the slide's own extension-list entry).
  - Tagged elements present in the custom XML but missing from the slide tree are flagged as deletions; user confirms in the demo UI.
  - When shape-name tags and extensions have both been stripped (aggressive external edit or Keynote round-trip), fall back to content-hash matching (geometry + text + style fingerprint + z-order within slide) to recover identity before giving up and treating as new.

### Phase 5 — Tests (spec-first, per [testing.instructions.md](../../agents/instructions/testing.instructions.md))

Gated on io-prereqs **Phase 6** (external-tool fixture convention, `assertReImportableBy`, chain CT harness, preserved-blob stress test).

- **Unit** — parse/emit for every OOXML element family we touch, every color path (sRGB, theme, `lumMod`/`lumOff`/`tint`/`shade`/`alpha`), every geometry mapping (all presets we claim to support), every text run property, every fill/stroke variant, shape-name encode/decode, extension-list round-trip, custom-XML-part attach/extract, ledger hash compute/compare, animation IN-state resolution, animation native-mapping coverage.
- **Round-trip golden tests** — canonical BroadsetProject with every element type, multi-page, grouped, animated, data-bound, theme-referenced → export → re-import → deep-equal except for explicitly-lossy fields documented in the spec. Separate golden for each element kind.
- **External-tool fixtures.** Commit `.pptx` files produced by:
  - PowerPoint for Windows (latest) — Save As
  - PowerPoint for Mac — Save As
  - PowerPoint for the Web (Office 365) — Save As
  - Keynote — Export to PPTX
  - Google Slides — Download as PPTX
  - LibreOffice Impress — Save As
  - Canva — Download as PPTX

  Smoke-test: import, count slides/elements, assert no exceptions, snapshot Broadset JSON structure so regressions surface. For each, also export the imported document back to PPTX and re-open in the original tool manually for a documented visual baseline.

- **Chain CT (Playwright).** User imports a PPTX in the demo, edits one element in a given region (canvas, properties panel, layers, timeline), exports, re-imports, and asserts the edit survived across all affected regions. Conforms to the cross-region CT rule in [testing.instructions.md](../../agents/instructions/testing.instructions.md) — one CT per WHEN/THEN region pair the PPTX flow crosses.

- **PowerPoint-save chain smoke test.** Export → open in PowerPoint (or `libreoffice --headless --convert-to pptx` as a CI stand-in) → save → re-import → assert identity/hash preservation on untouched elements. Tracked as a nightly CI job, not a blocking gate, because the headless save is flaky across platforms.

### Phase 6 — UI

Gated on io-prereqs **Phase 5** (editor UI surface — run-edit mode, bullets editor, swatches, theme-aware color picker, picture-fill picker, export options modal, import-warnings modal, reconciliation diff view).

- Demo import dispatcher already accepts `.pptx` / `application/vnd.openxmlformats-officedocument.presentationml.presentation`; verify it dispatches to the new importer and shows the shared progress indicator.
- Export menu adds PPTX to the shared export options modal with options: preserve Broadset metadata (shape tags + custom XML) on/off, embed fonts on/off, flatten groups on/off, color model (sRGB only per io-prereqs decision **IO-D-13**'s per-document color mode — PPTX does not have first-class CMYK like PDF does). No "sidecar" option — standards-only.
- Import dialog: when ledger is present, show a "Detected: exported by Broadset on {date}" affordance; when absent, show "Best-effort import — some features may be mapped approximately." Both rendered via the shared HeroUI import-warnings modal from io-prereqs Phase 5.

## Risk register

- **Theme color misresolution.** `<a:schemeClr>` + `lumMod`/`lumOff`/`tint`/`shade`/`alpha` is notoriously fiddly; the exact math is in ECMA-376 §20.1.2.3.4 and is easy to get subtly wrong. Mitigation: dedicated unit tests against reference RGB values computed with a known-good tool (Office Open XML SDK or a cross-check against `python-pptx`).
- **Keynote round-trip.** Keynote exports PPTX with non-standard `<a:custGeom>` geometry, sometimes embeds Quartz PDFs as images, and strips unknown extension elements aggressively on re-save. Mitigation: treat Keynote as a lossy endpoint in the chain; document which Broadset features survive Keynote round-trip and which don't; add Keynote fixtures to the external-tool test set.
- **PowerPoint "Check for Issues" rejections.** Some OOXML the spec allows, PowerPoint won't open, or opens with "repair" dialogs that alarm users. Mitigation: every export must round-trip through PowerPoint's "Inspect Document" with zero warnings on a canonical fixture deck; tracked as a blocking acceptance criterion for Phase 2b.
- **Shape-name tag stripping.** PowerPoint preserves shape names across save, but some tools (notably older LibreOffice versions) rewrite them. Mitigation: the extension-list carries the same metadata, and content-hash matching is the final fallback; all three layers must be present for round-trip, and absence of any two is treated as "external edit" in reconciliation.
- **Custom XML parts stripped.** Google Slides and Canva may strip custom XML parts on save. Mitigation: import continues to work without them (Phase 3b operator-level extraction handles the no-metadata case); document these tools as "export-only" targets in the spec.
- **`fast-xml-parser` correctness on exotic inputs.** The library is fast but has historically had edge cases around whitespace-in-attribute and CDATA. Mitigation: lock to a known-good minor version; add a fixture set of adversarial XML (CDATA in `<a:t>`, entity references, CRLF mixing) to the unit tests.
- **`svgpath` ↔ `<a:custGeom>` mismatch.** OOXML's path grammar (`moveTo`/`lnTo`/`cubicBezTo`/`arcTo`/`quadBezTo`/`close`) is close to but not identical to SVG's. In particular, OOXML `arcTo` uses `wR`/`hR`/`stAng`/`swAng` — not SVG's endpoint-parameterized arc. Mitigation: normalize all arcs to cubics via `svgpath.unarc()` on export; preserve the original `d` string on the element's extension so re-export is byte-identical when the user didn't edit the path.
- **`culori` vs ECMA-376 theme math.** Spec math for `lumMod`/`lumOff`/`tint`/`shade` is defined in HSL space with a specific rounding order; library primitives may match or differ by a rounding digit. Mitigation: unit-test against RGB values produced by PowerPoint itself on a fixture deck (a known-good color for each theme slot × each modifier pair) before committing the resolver.
- **`fflate` vs `pizzip` behavioral delta.** `fflate` exposes a lower-level streaming API and doesn't preserve comment/extra fields the way `pizzip` does. Mitigation: write a thin adapter (`ooxml/zip.ts`) so the swap is isolated; golden-test the output ZIP byte-for-byte against a PowerPoint-produced reference on a canonical fixture to verify central-directory equivalence.
- **`svgo` over-optimization.** `svgo`'s default plugins can inline styles and collapse groups aggressively, which breaks the Broadset SVG-fallback roundtrip heuristic (single-path detection on re-import). Mitigation: run `svgo` with a curated plugin list — keep structure, only strip comments / whitespace / unused defs / redundant attributes.
- **Bundle size.** Incremental cost per dep, minified + gzipped rough estimates: `fast-xml-parser` ~20 KB, `svgpath` ~8 KB, `culori` (tree-shaken subset) ~15 KB, `fontkit` ~200 KB, `fflate` ~10 KB, `svgo` ~80 KB. Total delta vs. today: ~330 KB gzipped — too much to ship to demo consumers that only export. Mitigation: lazy-load the PPTX importer and all of (`fast-xml-parser`, `svgpath`, `fontkit`, `svgo`) from the demo's import dispatcher entry only; keep the export-side minimum (`culori`, `fflate`, `svgpath`) in the main bundle.
- **Security.** Covered by the io-prereqs **Importer security contract** (entity-expansion hardening, size/depth/entry caps, sandboxed workers where available, `security-reviewer` gate). PPTX-specific additions: reject `vbaProject.bin` (VBA macros) and OLE embeddings outright on import with a warning — they have no Broadset semantics and are a malware vector.

## Sequencing & commits

io-prereqs Phase 0 → 1 → 2 → 3 → 4 → PPTX Phase 0 → 1 → 2a (~8 commits) → 2b (~10 commits) → io-prereqs Phase 5 (editor UI) → PPTX Phase 3a (~3 commits) → 3b (~10 commits) → PPTX Phase 4 (~3 commits) → io-prereqs Phase 6 (testing infra) → PPTX Phase 5 (tests) → PPTX Phase 6 (UI wiring).

Each phase ends on a green `npm run gate:full`. UI-visible phases also end on a green `npm run ct`.

## Decisions locked in

- **No sidecar, standards only.** All round-trip metadata rides in OOXML extension lists (`<p:extLst uri="…">`), shape-name tags (`<p:cNvPr name="BSET:…"/>`), and custom XML parts under `customXml/` — all core OOXML (ECMA-376) mechanisms. No embedded-file attachments outside the package, no app-private streams, no repurposed core fields.
- **Namespace-safe XML parser is non-negotiable.** Regex parsing is dropped entirely in Phase 1; there is no "hybrid" phase where both coexist.
- **Groups stay groups.** `<p:grpSp>` is emitted natively on export; transform composition happens at render time in PowerPoint, not at export time in Broadset. The dom-compositor "flatten groups" approach is not ported. Relies on io-prereqs audit A1 (renderer nested-group composition CT).
- **Slide master + layout + theme are generated, not minimal stubs.** Every export emits a real theme + master + one-or-more layouts derived from the project's style tokens so foreign editors see a proper themed deck.
- **Paths are native.** `<a:custGeom>` with path operators, not SVG pictures, whenever Broadset path geometry can be expressed in OOXML (which is nearly always).
- **Runs, not HTML** per io-prereqs decision **IO-D-01**. PPTX rich-text runs round-trip to `TextBody`/`Paragraph`/`Run` in the model, not sanitized HTML.
- **Theme colors via `BroadsetColor`** per io-prereqs decision **IO-D-05**. `<a:schemeClr>` round-trips to `{ kind: 'theme', slot, mods }`.
- **Shared color/font/fingerprint/reconcile via `_shared/`** per io-prereqs decision **IO-D-07**. PPTX never ships its own color-mods math, font subsetting, content-hash, or diff engine.
- **Degradation items ride in `extensions.pptx.*`** per io-prereqs typed-namespace contract and **IO-D-18**. Tables (`pptx.table`), charts (`pptx.chart`), connectors (`pptx.connector`), transitions (`pptx.transition`), comments (`pptx.comments`), unknown OOXML (`pptx.raw`) — all re-emit verbatim when `extensions.pptx.dirty === false`.
- **Animations are emitted natively when mappable, discarded otherwise** per io-prereqs **IO-D-16**. No `customXml` preservation of animation data.

## Open questions

- **Native animation coverage.** Which Broadset animations map cleanly to PowerPoint's `<p:timing>` tree vs. which are Broadset-only? First-pass list in Phase 0; finalized in Phase 2b before the animation emitter lands.
- **Table element in Broadset.** PPTX `<a:tbl>` imports want to round-trip to something better than a group-of-text-boxes. Either we add a first-class Broadset table element (scope change) or we preserve the raw XML on a group element's extension and re-emit on export. Decision required in Phase 0 — cross-reference with [project/spec/model/](../spec/model/) before locking.
- **Chart round-trip.** Same question for `<c:chart>`: preserve-through as blob on a picture element, or add a first-class Broadset chart element. Likely preserve-through initially, with a spec gap noting future work.
