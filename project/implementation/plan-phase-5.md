# Phase 5 — Formats

**Package:** `packages/formats`
**Depends on:** Phase 1 (model); independent of editor
**Parallelisable:** Can be started any time after Phase 1 is complete, in
parallel with Phases 2–4.
**Index:** [plan.md](plan.md)

Can be developed in parallel with Phase 4 (editor). Each sub-spec is
independent of the others; implement in order of increasing complexity.

---

## Units

### 5.1 JSON interchange and utilities (`formats/interchange.md`)

- [ ] tests: red
- [ ] impl: green

_Spec:_ `project/spec/formats/interchange.md`
_What to cover:_ JSON export/import round-trip (BroadsetDocument ↔ JSON string);
OGraf package creation; QR SVG generation; filename sanitization; stress tests
(large documents, deeply nested elements).

### 5.2 Raster export (`formats/raster.md`)

- [ ] tests: red
- [ ] impl: green

_Spec:_ `project/spec/formats/raster.md`
_What to cover:_ PNG/JPEG export; pixel-ratio behaviour (1x, 2x); canvas
discovery from rendered DOM.

### 5.3 Web vector (SVG / HTML) (`formats/web-vector.md`)

- [ ] tests: red
- [ ] impl: green

_Spec:_ `project/spec/formats/web-vector.md`
_What to cover:_ SVG export/import round-trip; HTML standalone export with
embedded playback runtime.

### 5.4 PDF export (`formats/pdf.md`)

- [ ] tests: red
- [ ] impl: green

_Spec:_ `project/spec/formats/pdf.md`
_What to cover:_ PDF generation; color parsing; font embedding; text wrapping;
QR code rendering.

### 5.5 PPTX export/import (`formats/pptx.md`)

- [ ] tests: red
- [ ] impl: green

_Spec:_ `project/spec/formats/pptx.md`
_What to cover:_ PPTX export with SVG fallback; import with path recovery;
round-trip fidelity requirements.

### 5.6 PSD export/import (`formats/psd.md`)

- [ ] tests: red
- [ ] impl: green

_Spec:_ `project/spec/formats/psd.md`
_What to cover:_ PSD export (layers, masks, effects, artboards); import; path
vector conversion.

---

## Progress

| Unit                      | Red | Green |
| ------------------------- | --- | ----- |
| 5.1 JSON interchange      | ☐   | ☐     |
| 5.2 raster export         | ☐   | ☐     |
| 5.3 web vector (SVG/HTML) | ☐   | ☐     |
| 5.4 PDF export            | ☐   | ☐     |
| 5.5 PPTX export/import    | ☐   | ☐     |
| 5.6 PSD export/import     | ☐   | ☐     |
