# @broadset/formats

Import/export adapters for Broadset project and external interchange formats.

## Responsibilities

- Export Broadset documents to formats such as SVG, HTML, PDF, PSD, PPTX, raster, and video.
- Import external files into Broadset documents.
- Provide shared interchange helpers (filename sanitization, package generation, runtime export helpers).

## Usage

```ts
import { exportSvg, importPptxDocument } from '@broadset/formats';

const svg = exportSvg(document);
```

## Notes

- Package boundary: may import `@broadset/model` and `@broadset/playback`.
