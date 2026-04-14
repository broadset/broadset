# Implementation Gaps

Generated: 2026-04-14

## 1) Template browser uses placeholder load behavior

- Selecting a template still creates an empty document with the template name instead of loading template-authored content at [packages/demo/src/demo-app/use-demo-file-handlers.ts](../../packages/demo/src/demo-app/use-demo-file-handlers.ts#L212) and [packages/demo/src/demo-app/use-demo-file-handlers.ts](../../packages/demo/src/demo-app/use-demo-file-handlers.ts#L214).

## 2) Video export can be unsupported at runtime

- Explicit unsupported error when `VideoEncoder` API is unavailable at [packages/formats/src/interchange/index.ts](../../packages/formats/src/interchange/index.ts#L127).
