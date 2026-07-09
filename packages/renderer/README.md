# @broadset/renderer

Screen/document renderer that turns Broadset documents into preview DOM output.

## Responsibilities

- Render document elements to preview output.
- Apply style/content/page overrides.
- Expose update hooks for live editor and playback integration.

## Usage

```ts
import { createScreenRenderer } from '@broadset/renderer';

const renderer = createScreenRenderer({ document });
renderer.updateDocument(document);
```

## Notes

- Package boundary: may import `@broadset/model` and `@broadset/playback`.
