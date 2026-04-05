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
