# Project Constitution

## 1. Tech Stack

- **Language:** TypeScript 5.9, targeting ES2022
- **Frontend:** React 19, HeroUI v3, Tailwind CSS v4, Lucide icons
- **State Management:** Zustand + Zundo (undo/redo middleware)
- **Schema Validation:** Zod
- **DOM Manipulation:** subjx (drag-and-drop transforms)
- **Playback Engine:** Custom — cubic-bezier interpolation, timeline compilation, CSS style writer
- **Formats:** @libpdf/core (PDF), ag-psd (PSD), html-to-image (raster), JSZip/PizZip (archives), mediabunny (video), qrcode-generator
- **Build:** tsup (library bundles), Vite (demo app)
- **Testing:**
  - Unit: Jest + @testing-library/react — Run via: `npm test`
  - Component: Playwright CT — Run via: `npm run ct`
- **Linting:** ESLint + Prettier — Run via: `npm run quality`
- **Type-checking:** `npx tsc --noEmit` or `npm run typecheck`
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
