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
| `@broadset/formats`  | Format adapters: PDF/PSD/PPTX/raster/SVG import-export                           |
| `@broadset/model`    | Document model, store, validation, conversion, and math utilities                |
| `@broadset/playback` | Animation engine, animation types, and CSS generation                            |
| `@broadset/renderer` | React rendering components: scene tree, element/screen renderers, font injection |
| `@broadset/editor`   | Interactive editor runtime: store, provider, canvas, transforms, and shortcuts   |
| `@broadset/ui`       | HeroUI v3 UI host — sidebars, toolbars, property panels, animation controls      |
| `@broadset/demo`     | Private demo app wiring all `@broadset/*` packages together                      |

## Usage

```tsx
// Editor runtime imports:
import { EditorProvider, useEditorStore, EditorCanvas } from '@broadset/editor';

// Rendering-only imports:
import { ScreenRenderer, DynamicStyleSheet } from '@broadset/renderer';
import { createEditorStore, type BroadsetDocument } from '@broadset/model';
import { generatePdf, exportPsd } from '@broadset/formats';
import { DEFAULT_ANIMATION_CONFIG } from '@broadset/model';

import { Toolbar, LayersSidebar, PropertiesSidebar, PreflightPanel } from '@broadset/ui';
```
