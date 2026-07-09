# @broadset/editor

Headless editor state/actions package for document editing workflows.

## Responsibilities

- Store editor/session state.
- Provide editing actions (selection, transforms, layers, animation authoring, history).
- Provide document-level collaboration and change stream utilities.

## Usage

```ts
import { createEditorStore } from '@broadset/editor';

const store = createEditorStore();
store.getState().undo();
```

## Notes

- Package boundary: may import `@broadset/model`, `@broadset/playback`, and `@broadset/renderer`.
