# Implementation Gaps

Generated: 2026-04-13

## 1) Animation sidebar actions not wired (demo UI)

- State selection not wired: `toast.info('State selection not yet wired.')` at [packages/demo/src/DemoApp.tsx](../../packages/demo/src/DemoApp.tsx#L1268)
- Modifier toggle not wired: `toast.info('Modifier toggle not yet wired.')` at [packages/demo/src/DemoApp.tsx](../../packages/demo/src/DemoApp.tsx#L1271)
- Add timeline not wired: `toast.info('Add timeline not yet wired.')` at [packages/demo/src/DemoApp.tsx](../../packages/demo/src/DemoApp.tsx#L1274)
- Delete timeline not wired: `toast.info('Delete timeline not yet wired.')` at [packages/demo/src/DemoApp.tsx](../../packages/demo/src/DemoApp.tsx#L1285)
- Duplicate timeline not wired: `toast.info('Duplicate timeline not yet wired.')` at [packages/demo/src/DemoApp.tsx](../../packages/demo/src/DemoApp.tsx#L1288)
- Rename timeline not wired: `toast.info('Rename timeline not yet wired.')` at [packages/demo/src/DemoApp.tsx](../../packages/demo/src/DemoApp.tsx#L1291)
- Quick setup not wired: `toast.info('Quick setup not yet wired.')` at [packages/demo/src/DemoApp.tsx](../../packages/demo/src/DemoApp.tsx#L1294)
- Add state binding not wired: `toast.info('Add state binding not yet wired.')` at [packages/demo/src/DemoApp.tsx](../../packages/demo/src/DemoApp.tsx#L1297)
- Remove state binding not wired: `toast.info('Remove state binding not yet wired.')` at [packages/demo/src/DemoApp.tsx](../../packages/demo/src/DemoApp.tsx#L1300)
- Add modifier binding not wired: `toast.info('Add modifier binding not yet wired.')` at [packages/demo/src/DemoApp.tsx](../../packages/demo/src/DemoApp.tsx#L1303)
- Remove modifier binding not wired: `toast.info('Remove modifier binding not yet wired.')` at [packages/demo/src/DemoApp.tsx](../../packages/demo/src/DemoApp.tsx#L1306)

## 2) Timeline editor actions not wired (demo UI)

- Add keyframe not wired: `toast.info('Add keyframe not yet wired.')` at [packages/demo/src/DemoApp.tsx](../../packages/demo/src/DemoApp.tsx#L2599)
- Move keyframe not wired: `toast.info('Move keyframe not yet wired.')` at [packages/demo/src/DemoApp.tsx](../../packages/demo/src/DemoApp.tsx#L2602)
- Change easing not wired: `toast.info('Change easing not yet wired.')` at [packages/demo/src/DemoApp.tsx](../../packages/demo/src/DemoApp.tsx#L2605)
- Play timeline not wired: `toast.info('Play timeline not yet wired.')` at [packages/demo/src/DemoApp.tsx](../../packages/demo/src/DemoApp.tsx#L2608)
- Stop timeline not wired: `toast.info('Stop timeline not yet wired.')` at [packages/demo/src/DemoApp.tsx](../../packages/demo/src/DemoApp.tsx#L2611)
- Seek timeline not wired: `toast.info('Seek timeline not yet wired.')` at [packages/demo/src/DemoApp.tsx](../../packages/demo/src/DemoApp.tsx#L2614)

## 3) Template browser uses placeholder load behavior

- Comment documents temporary behavior: "In a full implementation, this would load the template's BroadsetDocument. For now, create a placeholder document named after the template." at [packages/demo/src/DemoApp.tsx](../../packages/demo/src/DemoApp.tsx#L566)

## 4) SVG import intentionally skips content

- Simple `<g>` groups are skipped with warning at [packages/formats/src/web-vector.ts](../../packages/formats/src/web-vector.ts#L371)
- Unsupported SVG elements are skipped with warnings at [packages/formats/src/web-vector.ts](../../packages/formats/src/web-vector.ts#L380)

## 5) PSD sync export skips URL images

- Sync PSD export skips URL images and instructs using async export for URL support at [packages/formats/src/psd.ts](../../packages/formats/src/psd.ts#L802)

## 6) PDF export uses placeholders for unsupported/non-embeddable content

- SVG data URIs are not natively embedded; placeholder rectangle is drawn at [packages/formats/src/pdf.ts](../../packages/formats/src/pdf.ts#L615)
- Image embed failures fall back to placeholder rectangle at [packages/formats/src/pdf.ts](../../packages/formats/src/pdf.ts#L639)
- Non-data-URI content falls back to placeholder rectangle at [packages/formats/src/pdf.ts](../../packages/formats/src/pdf.ts#L652)
- `video`, `clock`, and `ticker` render as placeholder rectangle at [packages/formats/src/pdf.ts](../../packages/formats/src/pdf.ts#L708)

## 7) Video export can be unsupported at runtime

- Explicit unsupported error when `VideoEncoder` API is unavailable at [packages/formats/src/interchange.ts](../../packages/formats/src/interchange.ts#L127)
