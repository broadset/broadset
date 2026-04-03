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
