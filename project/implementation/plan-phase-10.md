# Phase 10 — Formats (Export/Import)

**Package:** `packages/formats`, `packages/demo`
**Depends on:** Phase 1 (model), Phase 3 (playback); independent of editor
**Parallelisable:** Can be started any time after Phase 3 is complete, in
parallel with Phases 4–9.
**Index:** [plan.md](plan.md)

**Goal by end of phase:** All export and import formats working. The demo app
offers every format through the Export modal. Users can export to PDF, PPTX,
PSD, SVG, HTML, PNG, JPEG, WebM, and video. Import reads PPTX, PSD, SVG, and
JSON files. Each sub-spec is independent; implement in order of increasing
complexity.

---

## Units

### 10.1 JSON interchange and utilities (`formats/interchange.md`)

- [ ] tests: red
- [ ] impl: green

_Spec:_ `project/spec/formats/interchange.md`
_What to cover:_ JSON export/import round-trip (BroadsetDocument ↔ JSON string);
OGraf package creation (ZIP per top-level element); QR SVG generation; filename
sanitization (unsafe character removal); progress reporting (onProgress callback
0–1 + stage descriptor); error handling (full export or failure, no partial
exports); stress tests (large documents, deeply nested elements).

### 10.2 Raster export (`formats/raster.md`)

- [ ] tests: red
- [ ] impl: green

_Spec:_ `project/spec/formats/raster.md`
_What to cover:_ PNG export (lossless, pixel-ratio scaling, 1x preserves
dimensions); JPEG export (quality 0–1, default 0.92, pixel-ratio scaling);
canvas discovery from rendered DOM; embedded SVG deterministic blob output for
intermediate rasterization; WebM alpha video export (VP9 codec, alpha channel
for broadcast overlay, configurable frame rate and duration, transparent
background for compositing).

### 10.3 Web vector — SVG and HTML (`formats/web-vector.md`)

- [ ] tests: red
- [ ] impl: green

_Spec:_ `project/spec/formats/web-vector.md`
_What to cover:_ SVG export (static SVG with clip-path, rotation, viewBox);
SVG import (with error recovery — partially valid SVG skips bad elements,
completely invalid XML fails with error; arbitrary external SVG from any tool);
HTML standalone export (single-file with embedded playback runtime including
OKLab color interpolation, path morphing, easing solvers, self-contained
animation support).

### 10.4 PDF export (`formats/pdf.md`)

- [ ] tests: red
- [ ] impl: green

_Spec:_ `project/spec/formats/pdf.md`
_What to cover:_ PDF generation; coordinate conversion (mm → pt); font embedding
with deduplication and Google Fonts fallback; all element types rendered; color
parsing (hex+alpha, rgb/rgba; unsupported → undefined defense-in-depth); text
wrapping (word boundaries, explicit newlines preserved); QR code SVG → path for
PDF; animated elements exported at rest state (t=0, no active states applied);
masked SVG fallback (clip-path generates mask).

### 10.5 PPTX export/import (`formats/pptx.md`)

- [ ] tests: red
- [ ] impl: green

_Spec:_ `project/spec/formats/pptx.md`
_What to cover:_ PPTX OOXML output with SVG fallback for styled rectangles;
import with shape data recovery → path elements; round-trip fidelity; arbitrary
external PPTX file import (files from PowerPoint, Google Slides, Keynote, etc.
— best-effort mapping, graceful degradation).

### 10.6 PSD export/import (`formats/psd.md`)

- [ ] tests: red
- [ ] impl: green

_Spec:_ `project/spec/formats/psd.md`
_What to cover:_ PSD export (layer effects, smart objects, artboards, vector
masks); import (layer structure → BroadsetElements, path recovery); animated
elements at rest state (t=0); arbitrary external PSD import (files from
Photoshop, Affinity Photo, etc. — map as much as possible to Broadset elements,
preserve rest as fallback).

### 10.7 Video export (`formats/interchange.md`)

- [ ] tests: red
- [ ] impl: green

_Spec:_ `project/spec/formats/interchange.md`
_What to cover:_ VideoEncoder with capability detection; frame-by-frame rendering
from PlaybackController; configurable frame rate; progress reporting (onProgress
callback with 0–1 progress + stage); error handling (unsupported codec →
meaningful error, full export or failure).

### 10.8 Demo: export/import integration

- [ ] tests: red (Playwright CT)
- [ ] impl: green

_Spec:_ `project/spec/demo/data-integration.md` (export orchestration, import
orchestration, lazy format loading, success/error toasts)
_What to cover:_ All enabled export formats available through Export modal;
lazy loading (format modules not in initial bundle, cached after first load);
dynamic data passed to exports (not stale tokens); import from all supported
formats with validation; success/error toasts for all operations.

---

## Progress

| Unit                       | Red | Green |
| -------------------------- | --- | ----- |
| 10.1 JSON interchange      | ☐   | ☐     |
| 10.2 raster export         | ☐   | ☐     |
| 10.3 web vector (SVG/HTML) | ☐   | ☐     |
| 10.4 PDF export            | ☐   | ☐     |
| 10.5 PPTX export/import    | ☐   | ☐     |
| 10.6 PSD export/import     | ☐   | ☐     |
| 10.7 video export          | ☐   | ☐     |
| 10.8 demo export/import    | ☐   | ☐     |
