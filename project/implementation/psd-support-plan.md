# PSD Support Plan

Status: historical companion plan. Current task status lives in
[plan-progress.md](./plan-progress.md), and release readiness lives in
[production-readiness-status.md](./production-readiness-status.md). This file
preserves the original PSD scope and acceptance detail; old "current state"
sections describe the pre-track baseline, not the present implementation.

This plan captures the full-fidelity PSD import/export strategy for Broadset, covering round-trip within Broadset, external-source import (Photoshop for macOS/Windows, Photoshop Web/iPad, Affinity Photo, Photopea, GIMP, Krita, Figma export), and external-target export with minimal-loss editability in Photoshop. It also covers the "chain" case: Broadset → PSD → edit in Photoshop → Save → re-import to Broadset with user edits preserved and Broadset semantics (animations, data bindings, page overrides) preserved wherever Photoshop did not touch them.

**Depends on** [io-prereqs-plan.md](./io-prereqs-plan.md) — the cross-format foundations (text-run model, color infra, font infra, XMP reader/writer, content-hash identity, reconciliation framework). Those foundations are shared with the PDF, PPTX, and SVG format work, so they are tracked separately and Phase 0 of this plan cannot begin until the prereqs plan's Phase 0 and Phase 1 are in place.

## Current state (what "absolutely broken" means)

**Broadset today — [packages/formats/src/psd/](../../packages/formats/src/psd/), 1,959 lines across 13 files, `ag-psd@^30.1.0`:**

- **Text loses almost everything on round-trip.** [import.ts](../../packages/formats/src/psd/import.ts) and [export-layer.ts](../../packages/formats/src/psd/export-layer.ts) only carry `fontSize` and `fontColor`. Font family, weight, italic, tracking, leading, alignment, decoration, multi-run styling are all dropped. A PSD with mixed styling comes back as single-font plain text.
- **Layer groups are silently flattened on import.** The importer walks children recursively but emits them as a flat element list with no `parentId` linkage, even though [element.ts:88](../../packages/model/src/element.ts#L88) already supports a validated `parentId` tree and `'group'` is already a first-class element type. This is an importer bug, not a model gap.
- **Rotation is never exported.** `element.rotation` is read but not composed into PSD layer geometry; every rotated element arrives in Photoshop axis-aligned.
- **Shape layers rasterize on export.** Solid-fill rectangles/ellipses are encoded as pixel `imageData` rather than native PSD shape layers. Round-trip loses vector editability; re-opening in Photoshop shows pixels where the user expects editable shapes.
- **Most layer effects are dropped.** [effects.ts](../../packages/formats/src/psd/effects.ts) handles drop shadow and outer glow only. Inner shadow, inner glow, bevel/emboss, satin, stroke overlay, color overlay, gradient overlay, pattern overlay — all silently discarded in both directions.
- **Layer masks (bitmap alpha) are ignored.** Only vector masks survive. Clipping masks (clip-to-layer-below) are not imported or exported at all.
- **Linked smart objects are not supported.** Only embedded data-URI smart objects round-trip. Real-world Photoshop files that reference external .psd/.ai/.tif assets lose those references entirely.
- **Adjustment layers become rectangles.** Curves, levels, hue/sat, color balance, selective color, etc. are rasterized to approximate pixels or dropped; users lose all semantic intent.
- **Color space is hardcoded RGB, 8-bit.** CMYK/Lab/Grayscale PSDs are either refused or silently converted with wrong colors. 16- and 32-bit-per-channel images are flattened to 8-bit.
- **Stroke styling is incomplete.** `borderColor` and `borderWidth` only; no linecap, linejoin, dasharray.
- **Unknown features are lost, not preserved.** PSD guides, slices, layer comps, adjustment-layer parameters, ICC profiles, artboard metadata, and any layer type we don't recognize all vanish on import; any Broadset semantic (animations, data bindings, repeater configs) that PSD can't express visually vanishes on export.
- **No real-world fixtures.** All 30 PSD tests round-trip documents produced by the same code they test. Round-trip passes prove only internal consistency, not fidelity against Photoshop or any other tool.

**dom-compositor reference (~3,838 lines across `psdImport.ts`, `psdExport.ts`, `psdPathVector.ts`):** meaningfully richer. Worth porting immediately:

- Full SVG path grammar parser (M/L/H/V/C/S/Q/T/Z with abs/rel modes, quadratic→cubic conversion). Our current parser handles only M/L/C/Z.
- Recursive group hierarchy build with absolute↔relative coordinate tracking via `parentAbsX/Y` accumulation.
- Bezier-knot corner-radius extraction with aspect-ratio rescaling and tolerance checking.
- Effect parsing: drop shadow, inner shadow, outer glow, inner glow, stroke, with angle/distance ↔ offsetX/offsetY trigonometric conversion and `inset` detection.
- 30+ blend mode bidirectional map with sensible approximations for unmapped modes.
- Linked smart object resolution with MIME inference from Content-Type then file extension.
- Shape fill alpha blending from both `fillOpacity` and `color.a`.
- Opacity dual-range normalization (0–1 or 0–255).

Worth _not_ taking: dom-compositor still emits single-run text only, has no bitmap layer mask support, no adjustment layer preservation, no CMYK/Lab color, stores no metadata for lossless round-trip, and has no first-class preservation channel for unmapped data.

Neither codebase has ever survived a chained round-trip through Photoshop with high fidelity.

## Goals

1. **Round-trip fidelity (Broadset ↔ PSD ↔ Broadset)** — lossless except for features PSD genuinely cannot express; those are explicitly enumerated in the spec.
2. **External-source import** — PSDs produced by Photoshop for macOS/Windows/Web/iPad, Affinity Photo, Photopea, GIMP, Krita, and Figma's PSD export must land as a sensible Broadset document; best-effort mapping, never crash.
3. **External-target export** — output must open cleanly in Photoshop with text editable, shapes vector-editable, effects live (not baked), groups intact, and smart objects addressable. PSD format version compliant.
4. **Chain tolerance** — Broadset → PSD → edit in Photoshop → save → re-import: the user's Photoshop edits are preserved where possible, and Broadset semantics (animations, data bindings, pages-as-overrides, repeaters, visibleWhen expressions) are preserved wherever Photoshop did not touch them.

## Strategy: standards-only — XMP metadata + layer tagging

**No sidecar files, no app-private streams outside PSD's documented extension mechanisms.** Everything we need to round-trip must live inside the `.psd` file itself, using mechanisms Photoshop already preserves on save — the same posture as [pdf-support-plan.md](./pdf-support-plan.md), same `broadset:` namespace, so infrastructure and review-team mental model carry across formats.

Two layers, both standard:

- **Native layer (what any PSD reader draws and edits).** Native PSD primitives — text layers with full run styling, vector shape layers with editable paths, bitmap and vector masks, layer groups, layer effects, linked/embedded smart objects, artboards, blend modes, opacity/fillOpacity. Every feature Broadset represents natively is mapped to its native PSD counterpart so a Photoshop user gets a first-class editing experience.
- **Metadata layer (XMP + layer additionalInfo).** Broadset semantics that PSD cannot express visually — animations, data bindings, `visibleWhen`, repeater configs, page override maps, element identity — ride in two standard PSD mechanisms that Photoshop preserves across save:
  - **Document XMP (ISO 16684-1).** Photoshop embeds an XMP packet in every PSD it writes; Photoshop and every other Adobe tool preserve XMP across save. We add a custom `broadset:` namespace — same namespace the PDF plan uses — on the document-level XMP carrying everything that lives above the layer: project settings, canvas declaration (unit/dpi), asset registry, data schema, animations array, page definitions and their override maps.
  - **Layer additional info ("extra data").** Each element's PSD layer carries an `additionalInfo` entry under a 4-byte Broadset signature (candidate: `BsPs`) containing the element's stable ID, data bindings, animation references, dirty flag, and the original-source blob for any PSD feature we imported but cannot represent natively (adjustment layer params, unknown effects, exotic layer types). Photoshop preserves unknown `additionalInfo` entries when it doesn't recognize them — the same mechanism Illustrator, Sketch, and Affinity use to round-trip their own app state through PSD.

When Photoshop strips a tag (aggressive layer flatten, rasterize group, "Export As" that rebuilds the file), content-hash re-matching (geometry + text + style fingerprint via the shared fingerprint module from the prereqs plan) recovers element identity as a fallback. Elements that cannot be matched either way become new elements on re-import; elements present in the metadata layer but missing from the layer tree are flagged as deletions for the user to confirm.

Importer group-hierarchy flattening is a code bug in [import.ts](../../packages/formats/src/psd/import.ts), not a model gap — the model already has validated `parentId` trees and a `'group'` element type.

## Library stack

Most libraries are added in **io-prereqs Phase 2** and consumed from `packages/formats/src/_shared/` — the PSD plan does not add them. Only the PSD-specific library lands in this plan:

### PSD-specific

| Library                                   | Role                  | Why this one                                                                                                                                                        |
| ----------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`ag-psd`** (already in repo, `^30.1.0`) | PSD reader and writer | The only actively maintained JS PSD library with write support. Exposes raw `additionalInfo` and `globalAdditionalInfo` slots which we need for the metadata layer. |

### Consumed from `packages/formats/src/_shared/` (added once in io-prereqs Phase 2)

| Shared module              | Underlying library                          | Role in PSD pipeline                                                                                                                                                                                                                              |
| -------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`_shared/color/`**       | `culori` + lazy `lcms-wasm`                 | CSS color parsing, RGB/CMYK/OKLCH/P3/Lab, gamut mapping, ICC transforms. Consumed by `psd/import/color.ts` and `psd/export/color.ts`. Replaces the hand-rolled RGB-only paths in [color-utils.ts](../../packages/formats/src/psd/color-utils.ts). |
| **`_shared/fonts/`**       | `fontkit`                                   | Font resolution, metrics, PostScript-name lookup, `fsType` embed-permission. Matches Photoshop font references to available web fonts. Consumed by `psd/import/text.ts` and `psd/export/text.ts`.                                                 |
| **`_shared/text-layout/`** | `linebreak` + `bidi-js` + lazy `harfbuzzjs` | UAX #14 wrapping (for Photoshop paragraph text boxes), UAX #9 BiDi, complex-script shaping.                                                                                                                                                       |
| **`_shared/xmp/`**         | `fast-xml-parser`                           | Read Photoshop's XMP packet on import and write the `broadset:` namespace on export. Same XMP namespace shared with PDF and SVG per io-prereqs decision **IO-D-08**.                                                                              |
| **`_shared/fingerprint/`** | `xxhash-wasm`                               | Content-hash fingerprinting for Phase 4 element identity recovery when `additionalInfo` tags are stripped.                                                                                                                                        |
| **`_shared/reconcile/`**   | `microdiff`                                 | Structural diffs for the reconciliation UI.                                                                                                                                                                                                       |

`zod` (already in `@broadset/model`) continues to validate XMP-hydrated project JSON.

### Already in the repo, reused as-is

`svgpath` (normalize PSD path data in both directions — replaces the minimal M/L/C/Z parser), `svg-path-bbox` (vector-mask bounds), `qrcode-generator` (QR export continues to work), `modern-screenshot` (last-resort raster fallback for elements PSD cannot express natively — `backdrop-filter`, non-trivial CSS blends without a PSD counterpart).

### Explicitly rejected

- **`@webtoon/psd`** — read-only; ag-psd is required for write. Not worth splitting reader/writer across libraries and doubling parse cost.
- **`psd.js`** — unmaintained.
- **`opentype.js`** — simpler than fontkit but lacks CFF subsetting and has weaker table coverage. fontkit is strictly more capable.
- **`paper.js`** — ~250 KB; we don't need general boolean path operations at the formats layer. If we ever do, it belongs in a shared editor utility.
- **`DOMPurify`** — the model stores text as structured runs, not HTML, so there is no HTML surface in the PSD pipeline to sanitise. (See the prereqs plan's "runs, not HTML" decision.)

## Phase plan

### Phase 0 — Spec & scope lockdown (no code)

- Rewrite [project/spec/formats/psd.md](../spec/formats/psd.md) into a feature matrix organized by Text / Vector / Raster / Effects / Masks / Groups / Color / Metadata, each row scoring Export, Import, and Round-trip fidelity (native / metadata-preserved / dropped).
- Enumerate explicit non-goals: Photoshop actions, history states, 3D layers, video layers inside PSD (Broadset has its own `video` element type), animation frames (Broadset has its own animation system), scripting events, print output intents beyond ICC profile round-trip.
- State the standards-only rule explicitly: native layer uses native PSD primitives; metadata layer uses XMP + `additionalInfo` only. No embedded sidecar files, no app-private streams outside PSD's own extension mechanism.
- Update [project/spec/formats/spec.md](../spec/formats/spec.md): formalize the XMP + layer-signature + content-hash-fallback pattern so other raster-and-layer formats (TIFF, potentially AI) can reuse it later.
- Acceptance criteria covering every new cross-format requirement.

### Phase 1 — Types & dependency additions

- **Preconditions:** [io-prereqs-plan.md](./io-prereqs-plan.md) Phase 0 (decisions), Phase 1 (text runs in the model, `BroadsetColor`, `BroadsetFill` including picture + pattern, structured filter primitives, typed `extensions.psd` namespace + dirty flag, content hash, importer contract requiring `parentId` tree), Phase 2 (`_shared/color/`, `_shared/fonts/`, `_shared/text-layout/`, `_shared/xmp/`, `_shared/fingerprint/`, `_shared/reconcile/`, `_shared/shape-classifier/`) complete — no `_shared/sanitize/` since PSD text is stored as runs and PSD has no HTML surface. Phase 3 (renderer refactor) must be in before Phase 2a's shape/effect rewrite; Phase 4 (asset pipeline) before Phase 2b font subsetting + linked smart objects.
- All shared libraries land in io-prereqs Phase 2 — the PSD plan does not add `culori`, `fontkit`, `linebreak`, `harfbuzzjs`, `bidi-js`, `lcms-wasm`, `fast-xml-parser`, `xxhash-wasm`, or `microdiff` to [packages/formats/package.json](../../packages/formats/package.json). Verify they are present before Phase 1 starts.
- `packages/formats/src/psd/types.ts` — `PsdImportOptions`, `PsdExportOptions`, `PsdPreservedData`, `PsdRoundTripMetadata`, `ColorSpaceChoice ('rgb'|'cmyk'|'lab'|'grayscale')`, `BroadsetXmpPacket` (re-exported from `_shared/xmp/`). Register the `extensions.psd` Zod schema into the central registry (io-prereqs decision **IO-D-11** — load-time validation).
- Public API in [packages/formats/src/psd/index.ts](../../packages/formats/src/psd/index.ts): keep current `exportPsdBytes`, `exportPsdBytesAsync`, `importPsd`; add `importPsdDocument` returning `DocumentImportResult`, wired into [import-document.ts](../../packages/formats/src/import-document.ts). Import entry lazy-loads the CMYK/Lab path in `_shared/color/` and the complex-script shaping path in `_shared/text-layout/` so sRGB+Latin PSDs pay nothing extra.
- **De-risking spike:** verify that (a) `ag-psd` emits custom-signature `additionalInfo` and that these entries survive a Photoshop save cycle on macOS, and (b) Photoshop preserves a `broadset:` XMP namespace round-trip. If either fails, decide whether to contribute upstream, fork, or fall back to encoding the metadata blob in a hidden signature-named layer group. Record the decision in [decisions.md](./decisions.md).

### Phase 2 — Export, rebuilt (matches, then exceeds dom-compositor)

Gated on io-prereqs **Phase 3** (renderer refactor — native filter primitives, nested group composition) before 2a, and io-prereqs **Phase 4** (font asset type, image bytes, subsetting pipeline, embed-permission, ICC preservation, content-hash dedup) + **Phase 5** (run-edit UI, swatches + ICC picker) before 2b.

Small focused files, each soft-capped at ~300 lines (hard cap 500):

- `psd/export/geometry.ts` — unit conversion (via `@broadset/model/units`), transform matrix composition, rotation export (currently absent), parent-child flatten only where PSD's layer model requires it.
- `psd/export/color.ts` — thin wrapper over `_shared/color/`. RGB baseline, CMYK and Lab via the lazy-loaded `lcms-wasm` path with the embedded ICC profile, spot colors, gradients as native PSD gradient fills (not rasterized). `BroadsetColor.originalColor` preserves the original spec for round-trip.
- `psd/export/fonts.ts` — font resolution via `_shared/fonts/resolveFont()`: match family + weight + style to the nearest Photoshop-available font; emit font PostScript name in the layer's text engine data.
- `psd/export/text.ts` — full run emission: one PSD `styleRun` per Broadset `Run`, full paragraph style (alignment, leading, tracking, first-line indent), decoration. Wrapping and shaping via `_shared/text-layout/wrapRuns()`.
- `psd/export/shapes.ts` — native shape layers for rectangle, ellipse, path; emit vector path data via `svgpath`; rounded rectangles as PSD native primitive where possible, knot-composed otherwise.
- `psd/export/effects.ts` — all 10 layer effects with bidirectional CSS↔PSD mapping where CSS has equivalents; fall through to the metadata layer for bevel/satin/pattern-overlay which CSS can't express. Consumes `FilterPrimitive[]` (io-prereqs Phase 1) rather than CSS filter strings.
- `psd/export/masks.ts` — vector masks (current), bitmap layer masks (new), clipping masks (clip-to-layer-below, new), with intersect/add/subtract/exclude boolean ops.
- `psd/export/groups.ts` — emit `'group'` elements as PSD layer groups; compose child transforms; preserve group-level opacity, blend mode, and effects.
- `psd/export/smart-objects.ts` — embedded (current) and linked (new); resolve external asset references via the shared asset registry (io-prereqs Phase 4); preserve GUID identity across round-trips so Photoshop's "Update linked file" keeps working.
- `psd/export/xmp.ts` — builds the Broadset packet via `_shared/xmp/writeBroadsetXmp()` and attaches to the document. Packet carries: project settings, canvas unit/dpi, asset registry, data schema, page definitions with their override maps, Dublin Core metadata from `document.metadata` (io-prereqs Phase 1). **No animations** — PSD is a static layer format per io-prereqs decision **IO-D-16**.
- `psd/export/additional-info.ts` — serialize per-element state into layer `additionalInfo` under the Broadset signature; read back in import. Mirrors `pdf/export/marked-content.ts` in the PDF plan.
- `psd/export/animations.ts` — computes the fully-entered "IN" state for each animated element and hands the resolved geometry/style to the downstream emitters. Animation data itself is discarded per io-prereqs **IO-D-16**. Documented as known-lossy in the spec.
- `psd/export/core.ts` — orchestration only, ≤ 250 lines.

Sequencing inside Phase 2:

- **2a** parity rebuild with dom-compositor (groups preserved, text runs, full path grammar, 5 effects, rotation, opacity dual-alpha).
- **2b** surpasses prior art (native shape layers, all 10 effects, bitmap masks, clipping masks, linked smart objects, XMP metadata layer, `additionalInfo` tagging, CMYK/Lab via `lcms-wasm`, text metrics via `fontkit`).

### Phase 3 — Import

Gated on io-prereqs **Phase 1** (content hash, `BroadsetColor` with `originalColor`, text runs, typed `extensions.psd` namespace) and **Phase 2** (`_shared/xmp/`, `_shared/fingerprint/`, `_shared/reconcile/`, `_shared/shape-classifier/`, `_shared/color/`, `_shared/fonts/`).

- `psd/import/walk.ts` — recursive descent with `parentAbsX/Y` tracking, hierarchy preserved via `parentId` (io-prereqs importer contract); no more flattening.
- `psd/import/xmp.ts` — read the document XMP first via `_shared/xmp/readBroadsetXmp()`; if the `broadset:` namespace is present, hydrate project-level state (canvas, assets, data schema, animations, page definitions, `document.metadata`) from XMP and use the layer tree only to recover element geometry/style and to detect post-export edits.
- `psd/import/text.ts` — full `styleRun` → `Run[]` extraction (io-prereqs Phase 1 `TextBody`/`Paragraph`/`Run`) with paragraph style, font resolution via `_shared/fonts/` for metrics match.
- `psd/import/shapes.ts` — native shape layer recognition (not rasterized); vector path extraction via `svgpath`.
- `psd/import/effects.ts` — all 10 effects; map to `FilterPrimitive[]` (io-prereqs Phase 1) where possible, preserve original params in `extensions.psd.unmappedEffects` otherwise with `dirty: false` so untouched re-export is byte-identical.
- `psd/import/masks.ts` — vector, bitmap layer, clipping masks; preserve raw bytes when alpha can't be represented as a Broadset mask.
- `psd/import/color.ts` — CMYK→RGB via `_shared/color/` using the document's embedded ICC profile; `BroadsetColor.originalColor` preserves the original color spec so re-export is lossless.
- `psd/import/smart-objects.ts` — embedded (current) and linked with MIME resolution; preserve link identity.
- `psd/import/additional-info.ts` — read the signature-keyed `additionalInfo`; if present, hydrate per-element state (bindings, animations, dirty flag) and trust it over reconstructed visuals for fields it covers.
- `psd/import/reconcile-hash.ts` — thin wrapper over `_shared/fingerprint/fingerprintElement()` so identity survives when tags are stripped.

Sequencing inside Phase 3:

- **3a** XMP + `additionalInfo` fast-path — import any PSD Broadset itself exported with perfect fidelity.
- **3b** layer-level extraction — import arbitrary third-party PSDs as Broadset documents.

### Phase 4 — Round-trip reconciliation

Gated on io-prereqs **Phase 2** (`_shared/reconcile/`, `_shared/fingerprint/`) and io-prereqs **Phase 5** (reconciliation diff view, deletion-confirmation modal).

- `psd/roundtrip.ts` — thin wrapper over `_shared/reconcile/reconcile(...)`. Given the XMP + `additionalInfo` + current layer tree:
  - XMP / `additionalInfo` values are defaults.
  - Current layer state overrides them field-by-field when the user edited the layer in Photoshop (text changed, position moved, color changed, path edited).
  - New layers with no Broadset signature become new Broadset elements on an "Imported from PSD" page.
  - Tagged elements present in the metadata but missing from the tree are flagged as deletions; user confirms in the demo UI.
  - When tags are stripped (aggressive external edit — rasterize group, merge down), fall back to content-hash matching via `_shared/fingerprint/`.
- Color-space round-trip: if the original was CMYK/Lab, re-export in the original space using the preserved profile; never silently downgrade.
- Dirty-flag discipline (io-prereqs Phase 1): any element with `extensions.psd.dirty === true` re-emits from current Broadset state; untouched elements (`dirty === false`) re-emit the preserved original layer blob byte-for-byte.

### Phase 5 — Tests (spec-first, per [testing.instructions.md](../../agents/instructions/testing.instructions.md))

Gated on io-prereqs **Phase 6** (external-tool fixture convention, `assertReImportableBy`, chain CT harness, preserved-blob stress test).

- **Unit** — parser/emitter for every effect type, blend mode, mask type, shape geometry, color space, smart object kind, XMP read/write, `additionalInfo` round-trip, animation IN-state resolution.
- **Round-trip golden tests** — canonical `BroadsetDocument` with every element type + animations + data bindings + multi-page overrides + text runs → export → re-import → deep-equal (except fields explicitly documented as lossy in the spec).
- **Structural integrity check** — every exported PSD must re-parse cleanly via ag-psd's own reader with `throwForMissingFeatures: true`; fail the test if our writer produces a file our own reader rejects.
- **External-tool fixtures.** Commit PSDs produced by (small, <1 MB each, documented provenance in `packages/formats/src/psd/__fixtures__/MANIFEST.md` following the prereqs plan's fixture convention):
  - Photoshop macOS — native save
  - Photoshop Windows — native save
  - Photoshop Web / iPad — export
  - Affinity Photo — PSD export
  - Photopea — PSD export
  - GIMP — PSD export
  - Krita — PSD export
  - Figma — PSD export

  Smoke-test: import, count layers, assert no exceptions, snapshot Broadset structure so regressions surface immediately.

- **Chain CT (Playwright).** User imports a PSD in the demo, edits one element in a given region (text, canvas, properties panel), exports, re-imports, asserts the edit survived across all affected regions — conforms to the cross-region CT rule in [testing.instructions.md](../../agents/instructions/testing.instructions.md). Covers untouched-element byte-preservation.

### Phase 6 — UI

Gated on io-prereqs **Phase 5** (run-edit mode, swatches + ICC picker, reconciliation diff view, export options modal, import-warnings modal).

- Demo import dispatcher accepts `.psd` / `image/vnd.adobe.photoshop` via the shared progress indicator.
- Export menu adds PSD to the shared export options modal: color space (RGB/CMYK/Lab/Grayscale — per io-prereqs decision **IO-D-13** the document-level color mode drives the default), bit depth (8/16), ICC profile embed on/off, link vs embed smart objects, flatten visibility on/off.
- Text-run editing surfaces in the properties panel via the shared run-edit UI from io-prereqs Phase 5.
- Preflight panel warns and proceeds (io-prereqs decision **IO-D-14**) on font-missing and CMYK/Lab ICC-profile-missing cases.
- All chrome is `@heroui/react` per [heroui.instructions.md](../../agents/instructions/heroui.instructions.md).

## Risk register

- **`ag-psd` metadata-channel viability.** Writing custom-signature `additionalInfo` that survives a Photoshop save is unverified. Verified in Phase 1 spike before committing to Phase 2 structure. Fallback: encode the metadata blob as a hidden layer group with a signature-named root, which Photoshop trivially preserves.
- **XMP preservation across external tools.** Photoshop, Bridge, and Lightroom preserve `broadset:` XMP cleanly. Affinity, Photopea, GIMP, and Krita may strip it. Mitigation: test every external-tool fixture for XMP round-trip in Phase 5; document which tools are lossy in the spec so users know what to expect. When XMP is stripped, `additionalInfo` tags usually survive and we still reconcile via those; when both are stripped, content-hash matching is the final fallback.
- **Photoshop normalization.** Even when preserved, Photoshop may reorder `additionalInfo` entries, re-encode text engine data, or split/merge layers. Content-hash matching absorbs most of this; chain CT in Phase 5 is where we measure damage per external tool.
- **Font licensing and availability.** PSDs reference fonts by PostScript name. If the user's system doesn't have that font, we need a visible fallback and a user-facing "font missing" warning. Re-export must preserve the original name so re-opening in Photoshop on a machine that does have it still works. Embed-permission handling is centralized in `_shared/fonts/readEmbedPermission()` per io-prereqs Phase 4.
- **Color fidelity across spaces.** CMYK/Lab → RGB for display is lossy; ICC profile presence and accuracy varies by source tool. `_shared/color/` (backed by `lcms-wasm`) handles the math; the spec documents which tools produce profile-less files and the fallback profile we assume in that case (U.S. Web Coated SWOP for CMYK, ISO Coated v2 grayscale, documented as known-approximate). Per io-prereqs **IO-D-05**, original color specs are preserved via `BroadsetColor.originalColor` so re-export never silently downgrades.
- **File size.** Preserved raw layer blobs can be large. Only preserve what we need: for bitmap layers we fully understand (plain rasters with no unknown features), don't store a blob. Budget: metadata-channel overhead ≤ 15% on typical PSDs; warn the user if it exceeds this.
- **Text metrics parity with Photoshop.** Photoshop computes leading/tracking from its own text engine; `fontkit` (via `_shared/fonts/`) reads the same metrics from font files, but OpenType layout differs in edge cases. Dirty-flag discipline keeps untouched text byte-identical; edited text is re-emitted using our metrics, which may show <1 px drift. Documented as known-approximate.
- **Bundle size.** `_shared/text-layout/harfbuzzjs` and `_shared/color/lcms-wasm` lazy-load per io-prereqs Phase 2. Latin-only sRGB documents never download them. Enforced by the Phase 2 bundle-size assertion test.
- **Security.** Covered by the io-prereqs **Importer security contract** (depth/size/entry caps, `security-reviewer` gate). PSD-specific addition: validate `ag-psd`'s parse options (`throwForMissingFeatures: false` on import with a warning rather than a crash, but reject layer counts or channel sizes above the caps).

## Sequencing & commits

io-prereqs Phase 0 → 1 → 2 → 3 → 4 → PSD Phase 0 → 1 (deps + spike) → 2a (~10 commits) → 2b (~8 commits) → io-prereqs Phase 5 (editor UI) → PSD Phase 3a (~4 commits) → 3b (~8 commits) → PSD Phase 4 (~4 commits) → io-prereqs Phase 6 (testing infra) → PSD Phase 5 (tests) → PSD Phase 6 (UI wiring).

Each phase ends on a green `npm run gate:full`. UI-visible phases also end on a green `npm run ct`.

## Decisions locked in

- **Standards only, same posture as PDF.** Round-trip metadata rides in document XMP (ISO 16684-1) under a `broadset:` namespace (shared across formats per io-prereqs decision **IO-D-08**) and layer-level `additionalInfo` under a 4-byte Broadset signature. No sidecar files, no app-private streams outside PSD's own documented extension mechanism.
- **Runs, not HTML** per io-prereqs decision **IO-D-01**. Text stored as structured `TextBody`/`Paragraph`/`Run` in the model. HTML only at export boundaries.
- **`ag-psd` stays.** The only maintained JS PSD writer. Shared `_shared/color/`, `_shared/fonts/`, `_shared/text-layout/`, `_shared/xmp/`, `_shared/fingerprint/`, `_shared/reconcile/` modules from io-prereqs Phase 2 plug in on top per decision **IO-D-07**.
- **Groups already in the model.** First-class `'group'` element type + `parentId` tree exist today; the importer is the only thing that needs fixing (io-prereqs importer contract).
- **Animations are discarded on export per io-prereqs IO-D-16.** PSD has no native animation model; exporter resolves each animated element to its fully-entered "IN" state and emits a static layer. Animation data is not serialized to XMP. Documented as known-lossy. Matches the PDF and SVG plans.
- **Dirty flag is per-element** per io-prereqs decision **IO-D-11**/**IO-D-07**. `extensions.psd.dirty` drives the byte-preserve vs. re-synthesize choice in Phase 4.
- **Text-run editor UI ships in io-prereqs Phase 5** — PSD Phase 2 (text-run round-trip) is useless without it (io-prereqs decision **IO-D-06** — TextRun type lands early, editor catches up).

## Open questions

- Signature byte sequence for our `additionalInfo` key. Candidate: `BsPs` (ag-psd requires a 4-byte signature). Confirmed in Phase 1 once we verify ag-psd accepts custom signatures and Photoshop preserves them.
- Whether to preserve Photoshop layer comps as Broadset pages (semantic) or as metadata-layer-only data. Leaning metadata-only until we have a user story for editing them in Broadset.
