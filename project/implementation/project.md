# Project Constitution

Status: historical summary. The current package graph, dependency baseline, and
quality commands are maintained in [architecture.md](./architecture.md). When
this file and `architecture.md` disagree, `architecture.md` is authoritative.

## 1. Tech Stack

- **Language:** TypeScript ^6.0.2, targeting ES2022
- **Frontend:** React 19, HeroUI v3, Tailwind CSS v4, Lucide icons
- **State Management:** Zustand + Zundo (undo/redo middleware)
- **Schema Validation:** Zod
- **DOM Manipulation:** Native pointer events with editor transform utilities
- **Playback Engine:** Custom — cubic-bezier interpolation, timeline compilation, CSS style writer
- **Formats:** pdf-lib/pdfjs-dist/@pdf-lib/fontkit (PDF), ag-psd (PSD), PizZip/OOXML utilities (PPTX), DOMPurify/css-tree/svgpath/transformation-matrix (SVG), modern-screenshot (raster), mediabunny (video), qrcode-generator
- **Build:** TypeScript project builds for packages, Vite for the demo app
- **Testing:**
  - Unit/integration: Vitest + @testing-library/react — Run via: `npm test`
  - Component: Playwright CT — Run via: `npm run ct`
- **Linting:** ESLint + Prettier — Run via: `npm run quality`
- **Type-checking:** `tsc -b` through package `typecheck` scripts or `npm run typecheck`
- **Monorepo:** npm workspaces — 7 packages (`model`, `playback`, `renderer`, `editor`, `formats`, `ui`, `demo`)

## 2. Definition Scope

This document captures implementation-facing project facts: the stack, major libraries, package layout, and technical constitution.

### Keep in `project/implementation/`

- architecture and package boundaries
- toolchain and dependency definitions
- active implementation plan and sequencing

### Keep out of `project/implementation/`

- behavioral requirements → `../spec/`
- human-facing workflow and spec guidance → `../../README.md`
- concise agent instructions → `../../AGENTS.md`
