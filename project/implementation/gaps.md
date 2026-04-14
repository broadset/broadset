# Implementation Gaps

Generated: 2026-04-14

## 1) Template browser uses placeholder load behavior

- Selecting a template still creates an empty document with the template name instead of loading template-authored content at [packages/demo/src/demo-app/use-demo-file-handlers.ts](../../packages/demo/src/demo-app/use-demo-file-handlers.ts#L212) and [packages/demo/src/demo-app/use-demo-file-handlers.ts](../../packages/demo/src/demo-app/use-demo-file-handlers.ts#L214).

## 2) SVG import intentionally skips content

- Simple `<g>` groups are skipped with warning at [packages/formats/src/web-vector/import.ts](../../packages/formats/src/web-vector/import.ts#L179).
- Unsupported SVG elements are skipped with warnings at [packages/formats/src/web-vector/import.ts](../../packages/formats/src/web-vector/import.ts#L196).

## 3) PSD sync export skips URL images

- Sync export docs explicitly state URL images are skipped and async export should be used for URL image support at [packages/formats/src/psd/export.ts](../../packages/formats/src/psd/export.ts#L104).

## 4) PDF export uses placeholders for unsupported/non-embeddable content

- SVG data URIs are not natively embedded; placeholder rectangle is drawn at [packages/formats/src/pdf/core.ts](../../packages/formats/src/pdf/core.ts#L280).
- Image embed failures fall back to placeholder rectangle at [packages/formats/src/pdf/core.ts](../../packages/formats/src/pdf/core.ts#L304).
- Non-data-URI content falls back to placeholder rectangle at [packages/formats/src/pdf/core.ts](../../packages/formats/src/pdf/core.ts#L317).
- `video`, `clock`, and `ticker` render as placeholder rectangle at [packages/formats/src/pdf/core.ts](../../packages/formats/src/pdf/core.ts#L370).

## 5) Video export can be unsupported at runtime

- Explicit unsupported error when `VideoEncoder` API is unavailable at [packages/formats/src/interchange/index.ts](../../packages/formats/src/interchange/index.ts#L127).
