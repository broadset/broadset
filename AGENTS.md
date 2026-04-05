# Broadset Agent Guide

This file provides the concise, always-on workspace instructions for coding agents working in this repository.
Use it together with the detailed reference docs linked below.

## Sources of truth

- `project/spec/` defines **what** broadset must do.
- `project/implementation/` defines **how** the repository is structured and implemented.
- `project/implementation/architecture.md` defines which packages and external dependencies to use.
- If behavior changes, update the relevant spec file in `project/spec/` first or alongside the implementation.

## Working expectations, quality gates, and spec conventions

See `CONTRIBUTING.md` for working agreements, quality gates, development commands, and spec authoring rules.

## No cutting corners — applies to ALL agents

When a quality gate, lint rule, typecheck, or CI check fails, **always fix the root cause**. Never weaken, suppress, or bypass the check to make it pass. Specifically forbidden:

- Adding CLI flags that silence warnings/errors (e.g. `--no-warn-ignored`, `--quiet`, `--no-verify`)
- Adding suppression comments (`// eslint-disable`, `@ts-ignore`, `@ts-expect-error`)
- Widening ignore patterns, raising warning thresholds, or downgrading rule severity
- Deleting or skipping tests that reveal real bugs

If you believe a rule or config is genuinely wrong, **stop and report it** — do not change it yourself.

## Interpret specs for maximum user value

When a spec is ambiguous or silent on scope, **always resolve the ambiguity in favor of the end user**, not in favor of less work. This is a design tool — users expect features that work with real-world content, not just content produced by Broadset itself.

Concrete examples of this principle:

- **Import = arbitrary external files.** An importer for PPTX, PSD, SVG, etc. must handle files created by _any_ tool (PowerPoint, Photoshop, Illustrator, Figma exports, etc.), not just re-importing Broadset-exported files. Map as much content as possible to Broadset elements; preserve the rest as fallback.
- **Export = real-world compatibility.** An exporter must produce files that open correctly in the canonical external tool, not just files that re-import into Broadset.
- **"Support X" means broadly.** If a spec says "support gradients," that means CSS linear, radial, and conic gradients — not just `linear-gradient(red, blue)`.
- **Edge cases are real cases.** If users will encounter it, it's in scope — even if the spec doesn't enumerate it.

If you catch yourself picking the narrower, easier interpretation, that's a signal you're cutting corners.

## Spec updates — additive only

Agents may update specs in `project/spec/` during implementation, but only as **additive refinements** — never behavioral changes.

**Allowed:** adding acceptance criteria, clarifying ambiguous wording, noting edge cases, adding default values or valid ranges, adding `## Spec Gaps` entries.

**Forbidden:** changing the intended behavior of an existing requirement, removing or weakening criteria, rewriting specs to match a convenient implementation, adding requirements that belong to a different unit or phase.

If you believe a spec is genuinely wrong, **stop and report it** — do not change it yourself.

## Package boundary rules

Every package has strict import boundaries defined in `project/implementation/architecture.md`. These are non-negotiable:

- `model` MUST NOT import any other workspace package
- `playback` MUST only import `model`
- `renderer` MUST only import `model` and `playback`
- `editor` MUST only import `model`, `playback`, and `renderer`
- `formats` MUST only import `model` and `playback`
- `ui` MUST only import via its peer dependencies (`editor`, `formats`, `model`, `renderer`)
- `demo` MAY import all packages

Additionally:

- **Barrel exports:** Every package must have a well-maintained `index.ts` that re-exports the public API. New public types, functions, and components MUST be added to `index.ts`. Consumers import from the package root — never from internal file paths.
- **Required dependencies:** If `architecture.md` lists an external dependency for a package (e.g., `@heroui/react` for `ui`), it MUST be in that package's `package.json` before the unit is marked complete.

## HeroUI mandate — `packages/ui` and `packages/demo`

The `packages/ui` package and any user-facing React components in `packages/demo` **MUST** use `@heroui/react` components for all UI chrome (toolbars, sidebars, panels, modals, inputs, toggles, tabs, accordions). Building custom equivalents with raw `<button>`, `<div>`, `<input>` etc. when a HeroUI component exists is **forbidden**.

Before committing any file under `packages/ui/src/` or any React component in `packages/demo/src/`, verify:

- No raw `<button>` where HeroUI `Button` should be used
- No raw `<input>` / `<select>` / `<textarea>` where HeroUI `Input`, `Select`, `Textarea` should be used
- No hand-rolled collapsible sections — use HeroUI `Accordion`
- No custom tab bars — use HeroUI `Tabs`
- No custom modal/dialog — use HeroUI `Modal`
- No custom toggle/switch — use HeroUI `Switch`
- `@heroui/react` is listed in the package's `peerDependencies` or `dependencies`

See `.github/instructions/heroui.instructions.md` for the full component mapping and design token rules.

## Data model essentials

The document format uses **BroadsetProject** as the root container type. Key structural rules:

- **BroadsetProject** contains `settings`, `assets`, and one or more `documents` (BroadsetDocument).
- **Elements** live on the **document**, NOT on pages. There is no `screen` object — `name`/`locked` are top-level element fields; masking, 3D transforms, and `clipChildren` are on `style`.
- **Pages** are lightweight **override layers** — they carry per-element `content`, `style`, `visible`, and `assetId` overrides, not independent element arrays.
- **Animations** are stored as an `animations` array on the document (NOT `animationRegistry`). Keyframes use `KeyframeValue` discriminated unions (`type: 'number'|'color'|'string'|'tuple'` + `easing`), NOT untyped `{ value: string, interpolation: string }`.
- **Canvas** declares `unit` (`'px'`/`'mm'`/`'in'`) and `dpi` — spatial values are in the declared unit, not millimeters.
- **Data binding** uses `dataSchema` (document-level), `dataField`/`visibleWhen`/`repeater` (element-level).
- **11 element types:** text, image, svg, path, rectangle, ellipse, qrcode, group, video, clock, ticker.
- **File format:** `.bsp` extension, `application/vnd.broadset.project+json` MIME.

Authoritative references: `project/spec/model/format-reference.md` (JSON shapes), `project/spec/model/spec.md` (invariants), `project/spec/model/element.md` (element contract).

## References

- `README.md` — project overview
- `CONTRIBUTING.md` — working agreements, quality gates, and spec conventions
- `project/spec/README.md` — documentation map
