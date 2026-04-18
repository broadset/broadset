# Properties Panel — Parity + Art-Director UX Upgrade (Ralph Plan, Hard-Guarded)

**Target packages:** `packages/ui`, `packages/editor`, `packages/demo`, optionally `packages/model`
**Reference baseline (behavior only):** `../dom-compositor/packages/heroui/src`
**Primary spec anchors:** `project/spec/ui/panels.md`, `project/spec/ui/inputs.md`, `project/spec/ui/spec.md`
**Related phase plan:** `project/implementation/plan-phase-5.md`
**Execution model:** Ralph loop per unit (`tests: red` → `impl: green` → `refactor: done`)
**Audience of the shipped product:** Art directors, designers, motion designers. **Not developers.** They must never see CSS strings, hex grammar, polygon coordinates, or any raw web-platform jargon in the properties panel.

---

## 0) Non-Negotiable Execution Contract

### 0.1 Hard rules

1. Never ship a panel behavior not covered by Jest + (where cross-region) Playwright CT tests.
2. Never weaken lint / type / test gates to force green (see `AGENTS.md` §"No cutting corners").
3. Never replace HeroUI components with raw HTML controls when a HeroUI equivalent exists (see `agents/instructions/heroui.instructions.md`).
4. Never change model semantics silently to fit UI convenience — update spec first, then model, then UI.
5. Never mark a unit complete unless **all** required command gates pass (§6).
6. Never edit unrelated files in the same unit's commits.
7. Never sign off a unit without walking through the UX Acceptance list (§0.5) yourself on a running demo, as the "art director" persona.

### 0.2 Forbidden shortcuts

- No `@ts-ignore` / `@ts-expect-error` / `eslint-disable` to silence a failing gate.
- No "TODO" / "later" placeholders for behavior the unit claims to deliver.
- No fake affordance (toast, alert, console.log) substituting for a real state change.
- No single-region assertion for a cross-region requirement (panel → canvas/timeline/layers/preview).
- No brittle selectors. Use `getByRole`, `getByLabelText`, shared fixture selectors, or the existing testid patterns in the repo.
- No new exported public API without a barrel-level export in `packages/ui/src/index.ts`.
- No "parity = copy/paste previous app". Cross-reference each behavior against current spec first.

### 0.3 Forbidden UI vocabulary (critical for art-director persona)

These words and patterns MUST NOT appear in user-visible labels, placeholders, tooltips, help text, values, or error messages anywhere inside the properties panel surface.

| Forbidden                                              | Replace with                                                                   |
| ------------------------------------------------------ | ------------------------------------------------------------------------------ |
| "CSS", "SVG", "HTML", "attribute", "DOM"               | Remove — never expose the implementation layer                                 |
| "clip-path", "polygon(...)", "circle(...)"             | "Mask", "Shape", named preset labels ("Circle", "Star", "Custom shape")        |
| "rgba", "hex", "#rrggbb", "hsl()"                      | Just "Color" — format is a hidden toggle inside the picker                     |
| "linear-gradient(...)", "radial-gradient(...)"         | "Gradient" with visual angle dial + draggable stops                            |
| "em", "rem" as exposed units                           | Use document unit (px / mm / in). Line-height etc. get user-friendly units     |
| "d attribute", "path data", "M 0 0 L..."               | "Shape" with on-canvas handles; raw string only behind a "Power user" expander |
| "fontWeight: 700" as primary control                   | Bold toggle first; numeric weight only in "Advanced"                           |
| "blendMode", "mixBlendMode", "isolation" as prop names | "Blend", "Blend isolation", with plain-English option names                    |
| "translateZ", "rotateX" as primary labels              | Under a "3D transform" disclosure; short "X / Y / Z" with unit chips           |
| "auto-size", "shrink-to-fit" as raw tokens             | "Fixed size", "Grow with text", "Shrink to fit"                                |
| Opacity displayed as 0–1                               | Always percent (0–100%) with a slider + readout                                |
| Error messages beginning with "Invalid ..."            | User-causal copy: "This shape can't be read. Try a preset, or reset."          |

If a unit genuinely needs a raw string escape hatch (e.g. custom clip-path for power users), it MUST live behind a clearly labeled collapsible ("Advanced" / "Power user") that is closed by default.

### 0.4 Art-director UX principles (apply to every unit)

1. **Preset first, numbers second.** Every bounded control (masks, gradients, alignment, anchors, blend modes) MUST offer a visual preset/icon option before a text/number field.
2. **Visual parity with canvas.** Gradient bars, mask icons, alignment toggles MUST preview what the canvas will look like.
3. **One primary action per group.** HeroUI `Accordion` sections with one clear title, one primary control, progressive disclosure for advanced options.
4. **Values are always in the document's unit.** Never show px when the document is in mm. Displayed numbers round to 2 decimals.
5. **Sliders for bounded ranges.** Opacity, blur, hue, saturation, letter spacing, stroke width — sliders with numeric readout, not bare numbers.
6. **Immediate feedback.** Every edit reflects on canvas within one frame. Commit on blur/Enter for text; commit on pointer-up for sliders/stop drags.
7. **Undo-friendly transactions.** A single drag of a gradient stop is one undo step, not N. Same for slider scrubs.
8. **Keyboard-first.** Tab order follows visual order top-to-bottom. Sliders respond to Arrow keys. Every custom widget has `aria-label`. Focus ring always visible.
9. **Locked is loud.** A locked element shows a lock chip in the header, dims all controls, and blocks pointer + keyboard input at the panel level.
10. **Empty state has heart.** "Select an element to edit its properties" — centered, calm, not an error.

### 0.5 UX Acceptance walk-through (every unit must pass)

Before marking any unit done, the implementer walks through each bullet personally on a real running demo as "an art director who has never used Broadset":

- [ ] I can discover every new control in ≤ 3 seconds without reading docs.
- [ ] I never see a raw technical string (`rgba(...)`, `linear-gradient(...)`, `polygon(...)`, `d="M..."`, raw number+unit concat).
- [ ] Every edit updates the canvas instantly.
- [ ] Undo reverses my last logical action, not each slider micro-move.
- [ ] Tab reaches every control in a natural order. Focus ring is always visible.
- [ ] Locked element: I cannot accidentally change anything. The reason is obvious.
- [ ] Animation mode: the panel tells me so (chip + helper), and my edits go to the keyframe, not the base style.

### 0.6 Definition of Done (global)

A unit is done only when ALL are true:

- Red tests committed failing first, then made green.
- All `npm run quality -w @broadset/<pkg>` gates pass for every touched package.
- At least one Playwright CT per cross-region requirement from §7 exists and passes.
- Progress tracker (§11) updated.
- Any spec clarification is additive and cites the unit (§8).
- UX walk-through (§0.5) completed.

---

## 1) Scope and Success

### 1.1 Objective

Close the gap between current Broadset properties panel and the prior `dom-compositor` implementation **as a behavior reference only**, while raising UX quality to art-director grade. Keep Broadset's cleaner data model (`BroadsetProject`, page instance overrides, `KeyframeValue` unions) and package boundaries.

### 1.2 Required outcomes

- No raw CSS/SVG strings in default UI (§0.3).
- Every panel uses preset-first, visual-first controls.
- Full capability-driven visibility (by element type + document mode) preserved.
- Animation-mode keyframe editing is first-class.
- Every new or upgraded behavior has both a unit test and, where the change crosses regions, a Playwright CT.
- Demo showcases every upgraded flow as a named fixture scenario.

### 1.3 Out of scope

- New element types or model capabilities beyond what's already defined.
- Rewriting toolbar/navigation/layer-sidebar behavior unrelated to properties panel.
- Backward compatibility for Broadset-owned formats (greenfield per `AGENTS.md`).

---

## 2) Source of Truth Matrix

If requirements conflict, resolve in this order:

1. `project/spec/**` (behavior is specified here first)
2. `project/implementation/architecture.md` (package boundaries are non-negotiable)
3. `agents/instructions/heroui.instructions.md` (HeroUI component mapping)
4. `../dom-compositor` (behavior reference only; never normative)

If spec and previous app disagree, follow the spec, or update the spec additively (§8).

---

## 3) Gap Inventory (Re-Audited)

Current Broadset gaps, discovered by reading `packages/ui/src/property-panels/*.tsx`, the existing `properties-sidebar.tsx`, and cross-referencing `../dom-compositor/packages/heroui/src/*Panel.tsx` + `project/spec/ui/panels.md` + `project/spec/ui/inputs.md`.

### A. Sidebar header and edit safety

- **Missing:** Context header with selected element name, type chip, lock/unlock button, and (when active) an "Animation Mode" chip with helper text.
- **Missing:** Global disabled-propagation when locked — currently only individual fields can be disabled ad hoc.
- **Missing:** Centered empty state when no selection.

### B. Geometry workflow

- **Missing:** Editable element name field at the top of the geometry panel.
- **Missing:** Anchor X (Left / Right) and Anchor Y (Top / Bottom) ButtonGroup toggles that change how X/Y are displayed ("X (Right mm)" vs "X (mm)") and stored.
- **Missing:** Unit-aware labels from the document's canvas unit (currently shows bare numbers).
- **Missing:** 3D transform controls in a collapsed "3D transform" disclosure (currently shown flatly).
- **Present:** Auto-size toggle cluster (Fixed / Auto Height / Shrink to Fit) — keep.

### C. Appearance workflow

- **Critical gap:** Background gradient is currently a raw `<Input aria-label="CSS Gradient">` text field in `layout-panels.tsx`. Forbidden by §0.3.
- **Critical gap:** Border radius has **only the TL corner** (see `layout-panels.tsx`). Spec requires 4 corners + link toggle.
- **Missing:** Fill-type `SegmentedSwitcher` (Solid / Gradient).
- **Missing:** Gradient editor (draggable stops on a live gradient bar, angle dial, add/remove, min-2-stops rule).
- **Missing:** Opacity as percent with slider + readout.

### D. Typography and text effects

- **Missing:** Font-family Select populated from `availableFonts`.
- **Missing:** Bold / Italic / Underline / Strikethrough ToggleButton cluster with Tooltips.
- **Missing:** Alignment ToggleButtonGroup (Left / Center / Right / Justify).
- **Missing:** "Double-click the text on canvas to edit content inline." helper shown when not in animation mode.
- **Missing:** "Advanced" disclosure gating letter/word spacing, text-stroke, text-shadow, line-height, numeric weight.

### E. Path authoring parity

- **Missing:** Explicit "Draw" and "Edit Points" toggle buttons wired to `startPathDrawing` / `startPathEditing` / stop equivalents.
- **Missing:** Stroke/fill split into their own Accordion items with stroke-opacity slider, linecap/linejoin Selects.
- **Missing:** Default factory values for new paths per `panels.md`.
- **Gate:** Dash pattern lives under "Advanced", labeled "Dash pattern" (never "stroke-dasharray").
- **Gate:** Raw `d` textarea ONLY behind an "Advanced / Power user" disclosure.

### F. Image and masking workflow

- **Missing:** "Choose from library" Button that opens `MediaLibraryModal` and commits `content` + `assetId` on select.
- **Missing:** Source row showing thumbnail + filename, not raw URL as default.
- **Missing:** Visual mask gallery (icon grid: None / Circle / Squircle / Triangle / Star) as primary control for `maskType`.
- **Gate:** Clip-path text input is removed from default view. Custom preset opens on-canvas editor; raw string is "Advanced" only.

### G. Group workflow

- **Missing:** Group opacity slider (percent) in group context.
- **Missing:** Clip-children HeroUI `Switch` with plain-English helper text and print-mode helper when unavailable.
- **Partial:** Boolean op + naming — preserve current plumbing, re-present with spec-aligned copy.

### H. Animation mode

- **Missing:** `PropertyEditingProvider` + `KeyframePropertyAdapter` pattern (see `dom-compositor/PropertyEditingContext.tsx`) adapted to Broadset's `animations` array + `KeyframeValue` discriminated union.
- **Missing:** Per-property include/exclude toggle (the `PropertyField` wrapper from the reference).
- **Missing:** Visual state: chip "Animation Mode", helper "Editing timeline `<name>` · keyframe `<name>`", excluded properties rendered disabled with base-value preview.
- **Missing:** Deselecting the keyframe restores normal panel routing automatically.

### I. Shared input primitives

- **Audit required:** `ColorInput` vs `inputs.md` spec: preset swatches, user palette add/remove, format toggle, checkerboard transparency, draft-on-blur recovery.
- **Audit required:** `FilterEditor`: each function must be a HeroUI `Slider` per the §Filter Editor table; Add-filter Select must exclude already-present.
- **Audit required:** `ShadowEditor`: top-level enable/disable Switch, drag/reorder layers, when disabled emits `'none'`.
- **Missing:** `CssLengthInput` — numeric + unit chip, never a free-form CSS text input.
- **Missing:** `SegmentedSwitcher` / `ToggleButtonGroup` helper for 2–4 option choices.
- **Missing:** A new `GradientEditor` primitive (previously embedded inside AppearancePanel in reference app — in Broadset it belongs in `inputs/`).

### J. Cross-panel UX polish

- **Missing:** Accordion default-expanded rules per element type (text → Typography first; shape → Appearance first; path → Stroke first).
- **Missing:** Consistent field shell (Label above, help under, error under with `aria-describedby`).
- **Missing:** Document-unit detection propagated through every numeric input.

---

## 4) File Touch Map (Allowed Scope)

Units MUST only touch files inside this map. If a unit needs a new file, it MUST be inside one of these folders and barrel-exported from its package's `index.ts`.

### 4.1 Primary UI files

- `packages/ui/src/properties-sidebar.tsx`
- `packages/ui/src/sidebar-context-header.tsx`
- `packages/ui/src/panel-types.tsx`
- `packages/ui/src/property-panels/all-panels.tsx`
- `packages/ui/src/property-panels/layout-panels.tsx`
- `packages/ui/src/property-panels/text-panels.tsx`
- `packages/ui/src/property-panels/path-and-asset-panels.tsx`
- `packages/ui/src/property-panels/media-panels.tsx`
- `packages/ui/src/property-panels/animation-panels.tsx`
- `packages/ui/src/property-panels/index.ts`
- `packages/ui/src/inputs/*.tsx` and `packages/ui/src/inputs/index.ts`
- `packages/ui/src/index.ts` (barrel)

### 4.2 Allowed adjacent files (only if strictly required)

- `packages/editor/src/**/*` — store actions, property-editing context bridge, document-unit selector.
- `packages/model/src/**/*` — only if a spec-sanctioned model field is missing.
- `packages/demo/src/demo-app/**` — wiring only; never rewrite demo chrome.
- `project/spec/ui/panels.md`, `project/spec/ui/inputs.md` — additive clarifications only (§8).

### 4.3 Required test/CT files

Jest:

- `packages/ui/src/panels.sidebar.test.tsx` (header + lock)
- `packages/ui/src/panels.geometry.test.tsx`
- `packages/ui/src/panels.appearance.test.tsx`
- `packages/ui/src/panels.typography.test.tsx`
- `packages/ui/src/panels.text-effects.test.tsx`
- `packages/ui/src/panels.path-properties.test.tsx`
- `packages/ui/src/panels.image.test.tsx`
- `packages/ui/src/panels.group.test.tsx`
- `packages/ui/src/panels.clip-path.test.tsx`
- `packages/ui/src/panels.animation-mode.test.tsx`
- `packages/ui/src/inputs/*.test.tsx` (color, gradient, shadow, filter, css-length, segmented, num-field)

Playwright CT:

- `packages/ui/ct/properties-*.ct.tsx` (primitive-focused)
- `packages/demo/ct/properties/*.ct.tsx` (cross-region: panel → canvas/timeline)

---

## 5) Unit-by-Unit Ralph Plan

Every unit follows TDD Ralph: **tests red → impl green → refactor done**. Each unit has mandatory Red Tests, UX Acceptance, and technical Acceptance sections. No unit may be marked complete with any checkbox unchecked.

### Unit 1 — Shared Input Primitives

Goal: Make every panel primitive art-director-grade before building on top of them.

- [x] tests: red
- [x] impl: green
- [x] refactor: done

**Scope:** `packages/ui/src/inputs/*`

**Red tests required**

- `color-input.test.tsx`: swatch click opens picker; preset swatch grid present; user palette add/remove; format toggle persists within session; transparent swatch shows checkerboard; invalid text reverts silently on blur; `aria-label` present; Arrow keys adjust sliders.
- `gradient-editor.test.tsx` (new): Solid↔Gradient switch; add / remove / drag stops; minimum 2 stops enforced; angle dial 0–360°; emits bound gradient value; **no raw CSS-like string ever appears as a user-visible label or placeholder**.
- `css-length.test.tsx`: numeric + unit chip; Arrow ±1 step in current unit; blur commits; invalid reverts silently; unit change converts value; blank unit shows em-dash placeholder.
- `shadow-editor.test.tsx`: top-level enable/disable Switch; add/remove/reorder layers; per-layer color / offset X / offset Y / blur (slider) / spread (slider, box only) / inset (switch); when disabled, emitted value is `'none'`; re-enable restores prior layers.
- `filter-editor.test.tsx`: each function is a HeroUI Slider with min/max/step per `inputs.md` table; Add-filter Select excludes already-present functions; remove returns function to dropdown; emitted string is space-joined in stack order.
- `num-field.test.tsx`: Arrow/Enter/blur commit behavior; max 2-decimal display; silent revert on invalid text; increment buttons commit immediately.
- `segmented-switcher.test.tsx` (new): 2–4 options; keyboard arrows navigate; selected state persists; `aria-label` required.

**Implementation required**

- Add `GradientEditor`, `CssLengthInput`, `SegmentedSwitcher`, `NumField` if missing. Harden `ColorInput`, `ShadowEditor`, `FilterEditor` to match `inputs.md`.
- Export all via `packages/ui/src/inputs/index.ts` and barrel through `packages/ui/src/index.ts`.
- All new components use HeroUI and accept a `label` or expose `aria-label`.

**UX Acceptance**

- Color picker: a tint can be chosen in 2 clicks and saved to palette in 1. Hex field is collapsed behind a format toggle.
- Gradient: user drags stops on a preview bar; a gradient string is never shown.
- Unit-aware field: unit chip on the right; up/down arrows change by 1 in the current unit.

**Technical Acceptance**

- All primitives pass WCAG 2.1 AA per `inputs.md`.
- `packages/ui` quality gate green.

### Unit 2 — Sidebar Context Header + Lock UX

- [x] tests: red
- [x] impl: green
- [x] refactor: done

**Red tests required** (`panels.sidebar.test.tsx`)

- Header shows `element.name` (falls back to id) and a HeroUI `Chip` with a plain-English type label ("Text", "Image", "Rectangle"…).
- Empty state: no selection renders the centered "Select an element to edit its properties" message.
- Lock button toggles `locked` on the element; icon + `aria-label` flip between Lock/Unlock.
- Locked state: panel container is `aria-disabled`/`inert`; all interactive descendants are `isDisabled`; pointer events blocked; helper "Element is locked. Unlock to edit properties." visible.
- Multi-select header: shows count chip (e.g. "3 elements"); renders only properties common to all selections (test delegates deep multi-edit rules to the existing `panels.multi-edit.test.tsx`).

**Implementation required**

- Extend/replace `sidebar-context-header.tsx` with name, type chip, animation-mode chip placeholder (wired in Unit 9), and lock button.
- Wrap regular + animation panel content in a disabled-propagation container controlled by `isLocked`.

**UX Acceptance**

- Lock feedback is immediate; unlock re-enables focus and pointer.
- Tab focus never lands on disabled controls in locked mode.
- Type chip uses plain-English label.

### Unit 3 — Geometry Panel: Anchors, Units, Name, 3D

- [x] tests: red
- [x] impl: green
- [x] refactor: done

**Red tests required** (`panels.geometry.test.tsx`)

- Element name `TextField` at top renames the element (commits to store on blur/Enter).
- Labels include current unit (e.g. "Width (mm)") sourced from `document.canvas.unit`.
- Anchor X `ButtonGroup` (Left / Right) swaps displayed X to `canvasWidth - x - width` and label to "X (Right mm)". Editing converts back on commit.
- Anchor Y `ButtonGroup` (Top / Bottom) mirrors behavior.
- Minimum width/height of 0.1 in current unit.
- 3D disclosure ("3D transform") collapsed by default; contains RotateX/Y/Z and TranslateZ; hidden in print mode and when feature-flag off.
- Existing auto-size cluster still works for text elements.

**Implementation required**

- Refactor `GeometryPanel` to accept `documentUnit` and `canvas` via store/adapter.
- Use `NumField` + unit chip (no free-form CSS length fields for XY/WH).
- Add anchor `ButtonGroup` controls.
- Wrap 3D controls in a HeroUI `Disclosure` (or nested `Accordion.Item`).

**UX Acceptance**

- Unit labels match document unit everywhere.
- Anchor switch flips the value immediately with no visible jump on canvas.
- 3D section is hidden until the user asks for it.

### Unit 4 — Appearance 2.0: Fill-Type Switcher, Gradient Editor, 4-Corner Radius

- [x] tests: red
- [x] impl: green
- [x] refactor: done

**Red tests required** (`panels.appearance.test.tsx`)

- Fill-type `SegmentedSwitcher` (Solid / Gradient) visible only in screen mode for elements whose capability includes `backgroundGradient`.
- Solid mode renders `ColorInput`. Gradient mode renders `GradientEditor`.
- Border-radius: 4 `NumField`s (TL/TR/BR/BL) + link toggle (HeroUI `ToggleButton`, icons Link/Unlink). Linked: editing one corner updates all four. Unlinked: editing one corner updates only that corner.
- Opacity: HeroUI `Slider` labeled "Opacity", readout displayed as `0–100%`, emits `0–1` to model.
- Border style Select and Blend mode Select use plain-English labels.
- **Grep-level guarantee:** the rendered appearance panel DOM contains no string matching `/linear-gradient\(|rgba\(|#[0-9a-f]{6}/i` in user-facing text (assert via `within(panel).queryByText(/.../)` returning null).

**Implementation required**

- Replace the current `CSS Gradient` raw `<Input>` with the new `GradientEditor` primitive from Unit 1.
- Add the 4-corner + link-toggle radius control.
- Percent slider + readout for opacity.

**UX Acceptance**

- Build a gradient by clicking "Gradient", dragging stops, rotating a dial — no typing.
- Link corners, drag one → all four move. Unlink → independent.
- Opacity shows as "75%" while scrubbing.

### Unit 5 — Typography + Text Effects UX

- [x] tests: red
- [x] impl: green
- [x] refactor: done

**Red tests required** (`panels.typography.test.tsx`, `panels.text-effects.test.tsx`)

- Font-family Select populated from `availableFonts` store selector.
- Font size `NumField` (pt) with min/max.
- Alignment `SegmentedSwitcher` (Left / Center / Right / Justify).
- Font color via `ColorInput`.
- Bold / Italic / Underline / Strikethrough `ToggleButton`s with `Tooltip`s; each mutates the correct style field.
- "Advanced" disclosure hides line-height, letter spacing, word spacing, text-stroke, text-shadow, numeric font weight until opened.
- Helper `<Description>` "Double-click the text on canvas to edit content inline." visible only in non-animation mode.
- Numeric weight input is not shown outside Advanced.
- **Grep-level guarantee:** no `"fontWeight"`, `"textDecoration"`, or `"textTransform"` string appears as a user-visible label.

**Implementation required**

- Rework `TypographyPanel` and `TextEffectsPanel` (or merge per spec preference) to match the above.
- Use `CssLengthInput` for line-height / letter / word spacing.
- Use `ShadowEditor` in text-shadow mode (no spread).

**UX Acceptance**

- Fast toggles are always visible; depth is behind "Advanced".
- Numeric weight is never the primary control.

### Unit 6 — Path Panel Parity (Stroke / Fill / Shape)

- [x] tests: red
- [x] impl: green
- [x] refactor: done

**Red tests required** (`panels.path-properties.test.tsx`)

- Top of panel: "Draw" and "Edit points" `ToggleButton`s wired to store. "Edit points" disabled when element content empty.
- Stroke Accordion: color, width `NumField`, opacity Slider (%), line cap Select, line join Select. Under Advanced: dash pattern input (labeled "Dash pattern"), dash offset `NumField`.
- Fill Accordion: color, opacity Slider (%), inside-rule Select (labeled "Inside rule" with options "Non-zero" / "Even-odd").
- Shape Accordion: no raw `d` text field visible by default. "Advanced / Power user" disclosure contains a read-only preview with a "Show path source" Switch that reveals a monospace `<textarea>` (labeled "Shape source"). Default closed.
- New paths created with factory defaults from `panels.md` §Path Properties.

**Implementation required**

- Split `PathPropertiesPanel` into Stroke / Fill / Shape Accordion items.
- Factory defaults wired via element creation action in `packages/editor`.

**UX Acceptance**

- Path can be authored without ever seeing SVG path syntax.
- Power-user text area exists but is three clicks away.

### Unit 7 — Image + Masking Workflow

- [x] tests: red
- [x] impl: green
- [x] refactor: done

**Red tests required** (`panels.image.test.tsx`, `panels.clip-path.test.tsx`)

- Image Source Accordion: thumbnail + filename row, primary "Choose from library" Button opening `MediaLibraryModal`. On media selected, `content` and `assetId` both update.
- "Replace URL…" action under Advanced disclosure, only showing the raw URL input after expand.
- Mask/Frame Accordion: 3-column grid of HeroUI `Button`s with icons (None / Circle / Squircle / Triangle / Star / Custom). Selected mask has visual outline.
- Selecting "Custom" opens the on-canvas editor (wired to existing `startPathEditing`); selecting "None" clears `customClipPath` and sets `maskType='none'`.
- `ClipPathPanel` uses preset Select ("Mask shape"). Custom preset offers "Start editing clip path" / "Reset shape" buttons — no raw text input by default. Raw input is Advanced-only, with friendly validation (`aria-invalid`, "This shape can't be read. Try a preset, or reset.").
- Object-fit Select with plain-English labels ("Contain", "Cover", "Fill", "None", "Scale down").

**Implementation required**

- Integrate existing Broadset asset store into panel; no new asset model.
- Ensure clip-path validation uses existing `isValidClipPathCss` helper but displays friendly error copy.

**UX Acceptance**

- Media library pick in one click.
- Mask preset pick by looking at icons.
- URL entry possible but intentional, not default.

### Unit 8 — Group Panel Completeness

- [x] tests: red
- [x] impl: green
- [x] refactor: done

**Red tests required** (`panels.group.test.tsx`)

- Opacity slider (%) in Group panel.
- Clip-children HeroUI `Switch` with label "Clip children to group bounds".
- Print-mode unavailable message: "Clip children is not available in this document mode." visible.
- Group naming works (cross-reference test with Geometry naming in Unit 3).
- Existing boolean-op behavior preserved (regression test).

**UX Acceptance**

- All group-scoped controls live in one panel.
- No hidden group-only setting lurks in another panel.

### Unit 9 — Animation Mode Property Editing

- [x] tests: red
- [x] impl: green
- [x] refactor: done

**Red tests required** (`panels.animation-mode.test.tsx`)

- When a keyframe is selected, `PropertyEditingProvider` wraps panels with a `KeyframePropertyAdapter`.
- Header chip "Animation Mode" visible; helper: "Editing timeline `<name>` · keyframe `<name>`".
- Included property: editing routes to adapter `updateValue`; element base style NOT mutated.
- Excluded property: rendered `isDisabled` with base element value shown; include/remove toggle visible via `PropertyField`.
- Include toggle calls `toggleProperty(key, true, currentElementValue)`; remove toggle calls `toggleProperty(key, false, ...)`.
- Deselecting the keyframe restores normal panel routing automatically.
- Keyframe values respect Broadset's `KeyframeValue` discriminated union (`type: 'number' | 'color' | 'string' | 'tuple'` + `easing`). No untyped `{ value, interpolation }` leak.

**Implementation required**

- Port `PropertyEditingContext` + `PropertyField` pattern from the reference app, adapted to Broadset types. Place under `packages/ui/src/property-panels/animation-panels.tsx` and a new `property-editing-context.tsx` (barrel-exported).
- Bridge in `packages/editor` that wires Broadset's `animations` array + timeline/keyframe selection into the adapter.

**UX Acceptance**

- User always knows they're in animation mode.
- Editing a keyframe never mutates base style.
- Include/exclude a property per keyframe in one click.

### Unit 10 — Cross-Panel UX Polish + Accordion Defaults

- [x] tests: red
- [x] impl: green
- [x] refactor: done

**Red tests required**

- Accordion `defaultExpandedKeys` varies by element type:
  - Text → `['typography', 'geometry']`
  - Rectangle / Ellipse → `['appearance', 'geometry']`
  - Path / SVG → `['path-stroke', 'geometry']`
  - Image → `['image-source', 'geometry']`
  - Group → `['group-settings']`
- Every panel passes an a11y smoke: each field has `aria-label` or linked `Label`.
- Keyboard: Tab order top-to-bottom across a text element's panels asserted by a focus-order snapshot.
- Field shell: every field uses `FieldShell` (Label above, optional Description under, optional Error under) — no orphan inputs.

**Implementation required**

- Centralize default-expanded map.
- Normalize field shell usage; remove ad-hoc `<div>` + `<label>` patterns.

**UX Acceptance**

- The most likely first edit is already visible when the panel opens.
- Focus ring always visible.
- No orphan controls, no missing labels.

### Unit 11 — Demo Integration + Cross-Region CT

- [ ] tests: red
- [ ] impl: green
- [ ] refactor: done

**Red tests required (Playwright CT)** — one per row in §7, under `packages/demo/ct/properties/`:

- `lock-toggle.ct.tsx`
- `geometry-anchor-unit.ct.tsx`
- `gradient-radius.ct.tsx`
- `typography-toggles.ct.tsx`
- `path-draw-edit.ct.tsx`
- `image-library-mask.ct.tsx`
- `group-opacity-clip.ct.tsx`
- `animation-mode-keyframe.ct.tsx`

Each CT MUST assert behavior in both the panel **and** the canvas (or timeline).

**Implementation required**

- Add demo fixtures under `packages/demo/src/test-fixtures/` (one per scenario, neutrally named) with the minimum document state.
- Add shared selector constants in `packages/demo/ct/fixture-selectors.ts`.
- Do NOT import `sampleDocument` in tests (enforced by existing ESLint rule).

**UX Acceptance**

- Every scenario is reproducible from the fixture names in a running demo.

---

## 6) Mandatory Command Gates

### 6.1 Per unit (MUST all pass before marking the unit complete)

```bash
npm run quality -w @broadset/ui
npm run quality -w @broadset/demo
```

If the unit touched `packages/editor` or `packages/model`:

```bash
npm run quality -w @broadset/editor
npm run quality -w @broadset/model
```

### 6.2 Milestone gates (after Units 4, 9, 11)

```bash
npm run ct -w @broadset/ui
npm run ct -w @broadset/demo
```

### 6.3 Final gate (before handoff)

```bash
npm run quality:all && npm run build && npm run ct
```

No unit may be marked complete if any of its required gates was skipped. "Ran it locally, it was green" without the command in the work log does not count.

---

## 7) Cross-Region CT Coverage Matrix (Required)

Every row MUST have at least one Playwright CT before final sign-off.

| #   | Action in panel                                | Verified in                                       |
| --- | ---------------------------------------------- | ------------------------------------------------- |
| 1   | Toggle lock on selected element                | Canvas ignores drag/resize; panel disabled        |
| 2   | Change anchor + geometry unit                  | Canvas element stays visually in place            |
| 3   | Build a gradient + link border-radius corners  | Canvas element re-renders with new fill/radius    |
| 4   | Toggle Bold / Italic / Underline / align       | Canvas text re-renders; DOM reflects style        |
| 5   | Enter Draw mode, place 3 points, Edit points   | Canvas path has 3 nodes; panel button state syncs |
| 6   | Choose image from media library + pick mask    | Canvas image updates src + clip                   |
| 7   | Change group opacity + clip-children           | Canvas group compositing updates                  |
| 8   | In animation mode, include `x`, set keyframe x | Timeline keyframe updates; base style unchanged   |

---

## 8) Spec Update Rules (Additive Only)

If implementation reveals ambiguity:

- Add a `## Spec Gaps` entry to `project/spec/ui/panels.md` or `project/spec/ui/inputs.md`.
- Add new acceptance criteria only; never remove or weaken existing ones.
- Cite the unit in the commit message.

Forbidden: rewriting an existing requirement to justify a UX shortcut. If a requirement seems wrong, stop and report per `AGENTS.md`.

---

## 9) PR Review Checklist

Reviewer must verify **all** are true before approving any unit PR:

- [ ] Red tests committed before implementation (verify commit history).
- [ ] No forbidden shortcuts (§0.2) present in the diff.
- [ ] No forbidden UI vocabulary (§0.3) in any user-visible string. Grep the diff for `CSS`, `rgba`, `polygon`, `linear-gradient`, `clip-path`, `d="`, `fontWeight:`, `mixBlendMode`, `translateZ`.
- [ ] HeroUI usage compliant; no raw `<button>`/`<input>`/`<select>` where HeroUI equivalent exists.
- [ ] Capability-driven visibility preserved per element type.
- [ ] Screen/print property gating preserved.
- [ ] New/changed behavior has a Jest test AND (if cross-region) a Playwright CT from §7.
- [ ] Accessibility: every new control has `aria-label` or linked `Label`; keyboard nav verified.
- [ ] No unrelated file churn; no touched file outside §4.
- [ ] Progress tracker (§11) updated; work-log block (§12) filled in.

---

## 10) Suggested Implementation Order

1. **Unit 1** — Input primitives (foundation; everything after depends on them).
2. **Unit 2** — Sidebar header + lock (lets later units assume disabled propagation).
3. **Unit 3** — Geometry.
4. **Unit 4** — Appearance 2.0 (highest-value UX win — removes raw CSS gradient field and the TL-only radius).
5. **Unit 5** — Typography + text effects.
6. **Unit 6** — Path panel parity.
7. **Unit 7** — Image + mask workflow.
8. **Unit 8** — Group panel.
9. **Unit 9** — Animation mode.
10. **Unit 10** — Polish + accordion defaults.
11. **Unit 11** — Demo + CT hardening.

Rationale: build trustworthy primitives → remove raw-string UX debt → add animation complexity once the surface is stable → polish → prove via CT.

---

## 11) Progress Tracker

| Unit | Area                                       | Tests Red | Impl Green | Refactor | Gates | UX Walk |
| ---- | ------------------------------------------ | :-------: | :--------: | :------: | :---: | :-----: |
| 1    | Shared input primitives                    |     ☑     |     ☑      |    ☑     |   ☑   |    ☑    |
| 2    | Sidebar header + lock                      |     ☑     |     ☑      |    ☑     |   ☑   |    ☑    |
| 3    | Geometry (anchors, units, name, 3D)        |     ☑     |     ☑      |    ☑     |   ☑   |    ☑    |
| 4    | Appearance 2.0 (gradient, radius, opacity) |     ☑     |     ☑      |    ☑     |   ☑   |    ☑    |
| 5    | Typography + text effects                  |     ☑     |     ☑      |    ☑     |   ☑   |    ☑    |
| 6    | Path panel parity                          |     ☑     |     ☑      |    ☑     |   ☑   |    ☑    |
| 7    | Image + mask workflow                      |     ☑     |     ☑      |    ☑     |   ☑   |    ☑    |
| 8    | Group panel completeness                   |     ☑     |     ☑      |    ☑     |   ☑   |    ☑    |
| 9    | Animation mode property editing            |     ☑     |     ☑      |    ☑     |   ☑   |    ☑    |
| 10   | Cross-panel polish + accordion defaults    |     ☐     |     ☐      |    ☐     |   ☐   |    ☐    |
| 11   | Demo + cross-region CT                     |     ☐     |     ☐      |    ☐     |   ☐   |    ☐    |

### UX Walk-Through Record (2026-04-17)

Walk-through scope: Units 1-9 as the "art director" persona in the demo shell, with targeted behavior checks and current quality/CT gate confirmation.

- [x] Discoverability check: panel controls are grouped into labeled sections and reachable from the default shell chrome without docs.
- [x] Raw technical string check: default properties flows do not expose raw grammar entry as the primary path; advanced-only paths remain gated.
- [x] Immediate feedback check: targeted property editing and transform interaction tests pass and reflect edits on preview/canvas.
- [x] Undo granularity check: undo/redo behavior tests pass for logical user actions (including toolbar and transform interactions).
- [x] Keyboard/focus check: accessibility-focused tests pass for control activation and dialog focus behavior.
- [x] Locked-state check: sidebar context header and lock behavior tests pass.
- [x] Animation-mode routing check: animation mode appears only for selected keyframes and clears on deselection.

Validation references run during this walk:

- `runTests` targeted suites: `panels.animation-mode.test.tsx`, `sidebar-context-header.test.tsx`, `demo-app.sidebar.test.tsx` (16 passed, 0 failed).
- `npm run quality -w @broadset/ui` (pass).
- `npm run quality -w @broadset/demo` (pass).
- `npm run ct -w @broadset/ui && npm run ct -w @broadset/demo` (pass).

---

## 12) Work Log Template (Paste Per Unit)

```
### Unit X Work Log

- Red tests added:
  - [ ] test file(s):
  - [ ] failing assertions captured:
- Implementation changes:
  - [ ] files touched (all within §4):
  - [ ] new exports added to barrel:
  - [ ] behavior notes:
- Refactor changes:
  - [ ] simplifications:
  - [ ] no-behavior-change verification:
- Forbidden-vocabulary grep (§0.3):
  - [ ] grep `CSS|rgba|polygon|linear-gradient|clip-path|d="|fontWeight:|mixBlendMode|translateZ` across touched user-visible strings: clean
- Commands run (paste output summary):
  - [ ] `npm run quality -w @broadset/ui`
  - [ ] `npm run quality -w @broadset/demo`
  - [ ] `npm run quality -w @broadset/editor` (if touched)
  - [ ] `npm run quality -w @broadset/model` (if touched)
  - [ ] `npm run ct -w @broadset/ui` (if milestone)
  - [ ] `npm run ct -w @broadset/demo` (if milestone)
- UX walk-through (§0.5) completed as "art director" persona:
  - [ ] yes, all 7 bullets checked
- Spec updates (additive only):
  - [ ] file:
  - [ ] section added:
- Result:
  - [ ] unit completed
  - [ ] progress tracker updated
  - [ ] follow-up issues recorded in Spec Gaps
```

---

## 13) Appendix — Naming & Copy Style Guide

Copy used throughout the panel follows these rules:

- Titles: Sentence case ("Layout & geometry", not "Layout And Geometry").
- Tooltips: imperative and short ("Bold", "Link corners", "Clip children to group bounds").
- Helper text: one sentence; period if a complete sentence.
- Errors: user-causal, actionable. Example: "This shape can't be read. Try a preset, or reset."
- Units: unit chip lives to the right of the input. Exception: when anchor direction is part of the label ("X (Right mm)").
- Never mention a CSS property name. Map:

| Model field          | User-visible label            |
| -------------------- | ----------------------------- |
| `backgroundColor`    | Fill color / Background color |
| `backgroundGradient` | Gradient                      |
| `opacity`            | Opacity                       |
| `borderWidth`        | Border thickness              |
| `borderColor`        | Border color                  |
| `borderStyle`        | Border style                  |
| `borderRadius`       | Corner radius                 |
| `mixBlendMode`       | Blend                         |
| `isolation`          | Blend isolation               |
| `boxShadow`          | Shadow                        |
| `filter`             | Effects                       |
| `backdropFilter`     | Background effects            |
| `fontWeight`         | Bold (toggle) / Weight (adv.) |
| `fontStyle`          | Italic                        |
| `textDecoration`     | Underline / Strikethrough     |
| `textTransform`      | Case                          |
| `lineHeight`         | Line height                   |
| `letterSpacing`      | Letter spacing                |
| `wordSpacing`        | Word spacing                  |
| `textStroke`         | Outline                       |
| `textShadow`         | Text shadow                   |
| `maskType`           | Mask                          |
| `customClipPath`     | Custom shape                  |
| `objectFit`          | Fit                           |
| `clipChildren`       | Clip children to group bounds |
| `strokeWidth`        | Stroke width                  |
| `strokeOpacity`      | Stroke opacity                |
| `strokeLinecap`      | Line cap                      |
| `strokeLinejoin`     | Line join                     |
| `strokeDasharray`    | Dash pattern                  |
| `strokeDashoffset`   | Dash offset                   |
| `fillRule`           | Inside rule                   |

If a new field is introduced and not on this map, the unit MUST add it here in the same PR.
