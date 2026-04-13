# Carry-Over Phase 5 — Format Import/Export Feature Parity

Date: 2026-04-13
Scope compared: ../dom-compositor/packages/formats vs packages/formats (current)

This pass documents what is supported in the previous version but not fully covered in the
current implementation, for each import and export format.

---

## Format Surface Overview

| Format          | Old: export | Old: import | Current: export | Current: import |
| --------------- | ----------- | ----------- | --------------- | --------------- |
| JSON (.bsp)     | ✅          | ✅          | ✅              | ✅              |
| SVG             | ✅ rich     | ✅          | ✅ basic        | ✅              |
| SVG embedded    | ✅          | —           | ✅              | —               |
| HTML standalone | ✅ rich     | —           | ✅ basic        | —               |
| PDF             | ✅ rich     | —           | ✅ basic        | —               |
| PSD             | ✅ rich     | ✅ rich     | ✅ rich         | ✅ rich         |
| PPTX            | ✅          | ✅ rich     | ✅              | ✅ basic        |
| PNG / JPEG      | ✅          | —           | ✅              | —               |
| MP4 / WebM      | ✅ rich     | —           | ⚠️ WebM only    | —               |
| OGraf ZIP       | ✅ rich     | —           | ✅              | —               |

---

## 1) HTML Standalone Export

### What is richer in the previous version

- Previous HTML export is a complete **live broadcast/signage runtime** with:
  - Per-element CSS animation playback driven by the animation registry
    (`../dom-compositor/packages/formats/src/htmlExportRuntime.ts`).
  - Full element type support: text, image, svg (inline + external), path (inlined SVG), rectangle, ellipse, with all style properties serialized (text stroke, gradient, backdrop-filter, filter, box-shadow, border-radius arrays, letter-spacing, line-height, word-spacing, text-transform, text-shadow, text-decoration).
  - Anchor-aware layout (`anchorX`/`anchorY` → right/bottom absolute positioning).
  - Mask / clip-path shapes (circle, squircle, triangle, star, custom) applied via inline `clip-path` CSS.
  - `data-element-id` + CSS class name emitted per element, enabling external data injection.
  - QR code elements rasterized via `qrSvg` and inlined in the bundle.
  - Dedicated round-trip conformance test (`htmlExportRuntime.test.ts`) and stress test (`importExportStress.test.ts`).

- Current `exportHtmlStandalone` in `packages/formats/src/web-vector.ts`:
  - Serializes layout geometry and basic text/image/fill.
  - No animation runtime embedded in the output.
  - No mask/clip-path shapes in HTML output.
  - No anchor-aware layout emitted.
  - No QR rasterization in HTML path.

### Carry-over tasks

1. Port HTML animation runtime embedding from `htmlExportRuntime.ts` (or integrate the playback runtime as an injectable bundle).
2. Add clip-path/mask shape serialization to HTML export element mapper.
3. Add anchor-aware CSS rule generation (`right`/`bottom` instead of `left`/`top`).
4. Inline QR rasterization into HTML export path.

---

## 2) SVG Export

### What is richer in the previous version

- Previous SVG export in `svgExport.ts` preserves a wider set of style properties:
  - `backgroundGradient` → gradient fill via `<linearGradient>`/`<radialGradient>` defs.
  - `maskType` (circle, squircle, triangle, star, custom) → `<clipPath>` defs applied per element.
  - `boxShadow` → SVG filter (`<feDropShadow>`).
  - `borderRadius` arrays → `rx`/`ry` and `<rect>` corner handling.
  - Full path stroke attributes: `stroke-dasharray`, `stroke-dashoffset`, `stroke-linecap`, `stroke-linejoin`, `stroke-opacity`, `fill-opacity`, `fill-rule`.
  - `objectFit` for image elements.
  - QR code elements rendered as inline SVG fragments via `qrSvg`.

- Current SVG export in `packages/formats/src/web-vector.ts`:
  - Exports fill, stroke, stroke-width, fill-opacity, stroke-opacity, opacity.
  - Exports custom clip-path if present, but not the named mask shapes.
  - Exports gradient fill, font properties, image href.
  - Missing: `boxShadow` → SVG filter, `maskType` named shapes, QR inline SVG, `objectFit` rendering, border-radius variants on rectangles.

### Carry-over tasks

1. Add gradient fill support to SVG element renderer (linear/radial gradient defs).
2. Port named mask shapes (circle/squircle/triangle/star) as `<clipPath>` defs in SVG export.
3. Add `<filter>` generation for box-shadow in SVG export.
4. Handle border-radius arrays on `<rect>` (separate `rx`/`ry` per corner via `<path>`).
5. Inline QR SVG fragments in SVG export element mapper.

---

## 3) Video Export (MP4)

### What is missing in the current version

- Previous video export (`videoExport.ts`) produces both **MP4 (H.264)** and **WebM (VP9)** via `mediabunny` + WebCodecs:
  - `format: 'mp4'` or `format: 'webm'` — both fully supported.
  - Configurable `fps` (default 30), `bitrate` (default 5 Mbit/s), `width`, `height`.
  - `onProgress` callback for encoding progress reporting (fraction 0…1).
  - Selective timeline rendering via `timelineSelections: { elementId, timelineName }[]`.
  - Auto-discovers all timelines when `timelineSelections` is empty.
  - Duration is computed from timeline keyframes via `computeTimelineDuration`.

- Current video export in `packages/formats/src/raster.ts`:
  - Only WebM output via `MediaRecorder` + `captureStream`.
  - No `fps`/`bitrate`/`width`/`height` options.
  - No `onProgress` callback.
  - No selective timeline rendering.
  - Duration supplied externally (`durationMs`) with no timeline-driven auto-detection.
  - `exportVideoBlob` in `interchange.ts` notes it is a `WebMExportOptions`-only path.

### Carry-over tasks

1. Add MP4 encoding path (MediaRecorder + mime `video/mp4` where supported, or WebCodecs H.264 via `mediabunny`).
2. Add `fps`, `bitrate`, `width`, `height` options to `VideoExportOptions`.
3. Add `onProgress` fraction callback.
4. Add timeline-aware duration auto-detection driven by `document.animations`.
5. Add `timelineSelections` filter to support per-element-timeline video clips.

---

## 4) PPTX Import

### What is richer in the previous version

- Previous PPTX importer (`pptxImport.ts`) maps:
  - `<p:sp>` text shapes with full font/para properties.
  - `<p:sp>` shapes without text → rectangle with fill color from `<a:solidFill>`.
  - `<p:pic>` → image placeholder.
  - Preserves full slide dimension ordering from `presentation.xml` manifest.

- Current PPTX importer in `packages/formats/src/pptx.ts`:
  - Same shape type coverage as previous.
  - Current additionally handles: gradient fills on rectangles (`backgroundGradient`), non-uniform border-radius via SVG fallback (`needsSvgFallback`), and unit-aware EMU conversion (`mm`/`in`/`px` via canvas unit).
  - Previous version does not extract embedded images from `<p:pic>` — current version also only produces placeholders, so parity is equal on that gap.
  - Net: current PPTX import is roughly at parity or ahead.

### Carry-over tasks

1. Add embedded image extraction from `<p:pic>` (extract relationship target, read zip entry, convert to data URI) — gap shared by both versions.

---

## 5) PSD Import: Multi-artboard Page Support

### What is present in the previous version

- Previous `parsePsd` explicitly returns `pages: readonly (readonly DcElement[])[]` when artboard layers exist, creating one page per artboard.
- The public API (`importPsdAsDocument`) creates a multi-page document in this case.
- This means a multi-artboard PSD file correctly imports as a multi-page broadset document.

- Current `packages/formats/src/psd.ts`:
  - Export side is richer (blend mode mapping, smart-object context, group hierarchy).
  - Import side: check needed for artboard-aware multi-page mapping.
  - The current `importPsd` public function signature should be verified against artboard case.

### Carry-over tasks

1. Verify that current PSD import handles artboard-based PSDs as multiple document pages (matching previous behavior).

---

## 6) OGraf Export

### What is richer in the previous version

- Previous OGraf exporter in `ografExport.ts`:
  - Generates one OGraf graphic package per **top-level element** (independent files per element tree).
  - Serializes full animation step state (`stateOrder`) per element for real-time step control.
  - Embeds background as a rasterized PNG asset via `RasterizedBackground`.
  - Manifest includes `stepCount`, `customActions` (set-step), `renderRequirements` (width/height).
  - Supports `supportsRealTime` / `supportsNonRealTime` options for EBU manifest compliance.
  - QR code elements inlined as SVG in OGraf payload.
  - Schema properties emitted per element for data binding (dynamic content).

- Current `generateOGrafPackages` in `packages/formats/src/interchange.ts`:
  - Generates OGraf packages from the project (exists).
  - Full implementation depth needs to be verified against the previous feature list above.

### Carry-over tasks

1. Verify current OGraf export produces per-top-level-element packages (matching old behavior).
2. Confirm `stateOrder` / animation step metadata is included in manifest.
3. Confirm background rasterization is included.
4. Add or verify `customActions` (set-step) in manifest.
5. Verify `renderRequirements` resolution block is emitted.

---

## 7) PDF Export

### What is richer in the previous version

- Previous PDF generation (`pdfGenerator.ts`, `pdfColorUtils.ts`, `pdfFontUtils.ts`, `pdfTextWrap.ts`, `pdfQrCode.ts`) has:
  - Custom font embedding and Google Fonts URL resolution (`pdfFontUtils.ts`).
  - Advanced text wrapping with line-break and overflow logic (`pdfTextWrap.ts`).
  - QR code generation directly into PDF pages (`pdfQrCode.ts`).
  - Gradient background support via color utility helpers.
  - Dedicated parity conformance test (`exportParityConformance.test.ts`).
  - `PdfGenerateOptions` type with per-export configuration.

- Current `packages/formats/src/pdf.ts`:
  - Uses `@libpdf/core` (`PDF`, `PDFPage`, `StandardFonts`).
  - Handles Standard14 fonts and embedded custom fonts.
  - Owns color parsing (`parseCssColor`), Google Font URL resolution (`resolveGoogleFontUrl`), text wrapping (`wrapText`), masked SVG (`buildMaskedSvgSource`).
  - QR rendering via `drawQrOnPage` — QR support exists.
  - SVG elements produce a placeholder border — SVG are not embedded in PDF.
  - No gradient-to-PDF translation (only flat fill).

### Carry-over tasks

1. Add gradient fill support to PDF rectangle/element export (approximate via flat or image fallback).
2. Add SVG element embedding in PDF output (render-to-canvas or rasterize SVG before embedding).
3. Add parity conformance test equivalent to `exportParityConformance.test.ts`.

---

## 8) JSON / BSP Round-Trip

### No material gap

- Both versions export full JSON with all document data.
- Current `exportProjectJson` / `importPptx` / `importPsd` / `importSvg` use the current model schema.
- No gap identified.

---

## 9) Testing Coverage

### What is more thorough in the previous version

- Previous formats package has dedicated tests:
  - `exportParityConformance.test.ts` — cross-format output consistency.
  - `importExportStress.test.ts` — round-trip under edge-case inputs.
  - `pptxRoundTrip.test.ts` — PPTX round-trip fidelity.
  - `psdPathVector.test.ts` — vector mask path round-trip.
  - `htmlExportRuntime.test.ts` — HTML runtime animation correctness.
  - Dedicated unit tests per format: `svgExport.test.ts`, `psdImport.test.ts`, `psfExport.test.ts`, `pptxImport.test.ts`, `pptxExport.test.ts`, `videoExport.test.ts`, etc.

- Current package has per-format test files but lacks:
  - Cross-format parity conformance test.
  - Import/export stress (round-trip) test.
  - Round-trip test for PPTX.

### Carry-over tasks

1. Add a cross-format parity conformance test covering all supported output formats for a fixed sample document.
2. Add an import/export stress test with edge-case documents (empty content, long text, nested groups, multi-page).
3. Add a PPTX round-trip test.

---

## Priority Carry-Over Order

1. MP4 video export: add H.264 encoding path + progress callback + bitrate/fps options.
2. HTML standalone: port animation runtime embedding + mask shapes + anchor layout.
3. SVG export: add gradient defs, named mask clip-paths, box-shadow filters.
4. OGraf: verify and complete step-state, rasterized background, and manifest fields.
5. PDF: add gradient fill approximation + SVG rasterize-and-embed path.
6. Testing: add cross-format parity conformance + round-trip stress tests.
7. PPTX import: add embedded image extraction from `<p:pic>`.
