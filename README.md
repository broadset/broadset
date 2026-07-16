# Broadset

A web-native broadcast graphics suite for authoring and rendering motion graphics — live TV GFX, animated transitions, and interactive HTML overlays. Design once, render anywhere, via composable `@broadset` packages.

## Documentation Layout

- `README.md` — human-facing project overview
- `CONTRIBUTING.md` — working agreements, quality gates, and spec conventions
- `AGENTS.md` — concise workspace instructions for coding agents
- `project/spec/` — behavioral source of truth
- `project/implementation/` — implementation definitions and architecture context
- `project/spec/README.md` — spec and documentation map

## Packages

| Package              | Description                                                                      |
| -------------------- | -------------------------------------------------------------------------------- |
| `@broadset/formats`  | Native checksummed `.bsp` project load/save                                      |
| `@broadset/model`    | Canonical v1 project model, validation, resolution, and editing primitives       |
| `@broadset/playback` | Deterministic v1 animation evaluation                                            |
| `@broadset/renderer` | Resolved v1 scene DOM rendering and physical-unit conversion                    |
| `@broadset/editor`   | V1 project editor store, provider, mutations, selection, history, and clipboard |
| `@broadset/ui`       | HeroUI v3 UI host — sidebars, toolbars, property panels, animation controls      |
| `@broadset/demo`     | Private demo app wiring all `@broadset/*` packages together                      |

## Usage

```ts
import { createProjectEditorStore } from '@broadset/editor';
import { exportBspPackageV1, loadBspPackageV1 } from '@broadset/formats';
import { projectFormatV1 } from '@broadset/model';

const project = projectFormatV1.createProjectV1({ name: 'Broadcast graphics' });
const editorStore = createProjectEditorStore({ project });
const saved = await exportBspPackageV1({ project: editorStore.getState().project, blobs: new Map() });

if (saved.status === 'exported') {
  const loaded = await loadBspPackageV1(saved.bytes);

  if (loaded.status === 'loaded') editorStore.getState().setProject(loaded.project, loaded.blobs);
}
```
