# Broadset — Packages

This directory contains all `@broadset/*` npm workspace packages.

## Packages

| Package              | Role                                                        |
| -------------------- | ----------------------------------------------------------- |
| `@broadset/model`    | Document types, element model, animation data model         |
| `@broadset/playback` | Animation engine, interpolation, timeline computation       |
| `@broadset/renderer` | React scene tree, element renderers, font injection         |
| `@broadset/editor`   | Headless editor store, canvas, transforms, keyboard         |
| `@broadset/formats`  | Export formats: PDF, PPTX, PSD, raster, web-vector          |
| `@broadset/ui`       | HeroUI v3 UI host — panels, modals, toolbar, timeline       |
| `@broadset/demo`     | Integration host — wires all packages into a working editor |

## Scripts (run from repo root)

- `npm run dev` — start the demo app (Vite dev server)
- `npm run build` — typecheck + Vite production build
- `npm run test` — Jest unit tests
- `npm run ct` — Playwright component tests
- `npm run quality` — full quality gate (lint + format check + typecheck + tests)
- `npm run format` — auto-fix lint and formatting
