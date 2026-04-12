# Phase 11 — Advanced Cross-Cutting Features

**Packages:** `packages/model`, `packages/playback`, `packages/renderer`,
`packages/editor`, `packages/ui`, `packages/demo`
**Depends on:** All prior phases
**Index:** [plan.md](plan.md)

**Approach:** Each feature group is cross-cutting — it adds model types, then
wires them through playback/renderer/editor/UI as needed. Complete one group
fully before starting the next. Each group ends with a demo milestone proving
the feature works end-to-end.

---

## Feature Group 11-A: Vertical text alignment

_Affected packages:_ model, renderer, ui
_Spec sections:_ `model/style.md` §verticalAlignment, `model/format-reference.md`

- [ ] model: add `verticalAlignment` ('top'|'middle'|'bottom') to style types + Zod schema
- [ ] renderer: map to CSS `align-items` on text container (flexbox)
- [ ] ui: vertical alignment segmented control in properties panel
- [ ] demo milestone: select text → change vertical alignment → text repositions
      within bounding box

## Feature Group 11-B: Trim path properties

_Affected packages:_ model, renderer, playback, ui
_Spec sections:_ `model/style.md` §trimStart/trimEnd/trimOffset, `model/format-reference.md`

- [ ] model: add `trimStart`, `trimEnd`, `trimOffset` (0–1) to style types + Zod schema
- [ ] renderer: compute `stroke-dasharray`/`stroke-dashoffset` from trim values on path/ellipse/rectangle stroke
- [ ] playback: register `trimStart`, `trimEnd`, `trimOffset` as valid animation targets (number interpolation)
- [ ] ui: three slider inputs (0–1) in properties panel, gated by `svgStrokeFill` capability
- [ ] demo milestone: draw path → adjust trim start/end sliders → stroke
      progressively reveals; add keyframes → animated stroke draw-on effect plays

## Feature Group 11-C: Boolean shape operations

_Affected packages:_ model, renderer, ui
_Spec sections:_ `model/element.md` §booleanOperation, `model/format-reference.md`

- [ ] model: add `booleanOperation` (union/subtract/intersect/exclude) to group element types + Zod schema
- [ ] renderer: compute flattened SVG path from boolean op on group children (paper.js or equivalent); first child styling inherited
- [ ] ui: boolean operation dropdown on group properties panel (union/subtract/intersect/exclude/none)
- [ ] demo milestone: two overlapping shapes → group → select "subtract" →
      second cuts hole in first; switch to "union" → merged outline

## Feature Group 11-D: Template groups / multi-format

_Affected packages:_ model, editor, ui
_Spec sections:_ `model/project.md` §templateGroups, `model/format-reference.md`

- [ ] model: add `templateGroups` array to project types + Zod schema (metadata-only, no render/validation effect)
- [ ] editor: template group CRUD actions (create group, add/remove member documents, edit role/label)
- [ ] ui: template group management panel (list groups, add/remove members, role selector: 16:9/9:16/1:1/4:3/custom)
- [ ] demo milestone: create template group → assign documents with roles →
      group persists in project JSON export

## Feature Group 11-E: Gradient animation targets

_Affected packages:_ model, playback, renderer
_Spec sections:_ `model/animation.md` §gradient stop animation, `model/format-reference.md`

- [x] model: validate dot-path gradient stop targets (`backgroundGradient.stops[N].color`, `.position`, `.angle`, `.center`)
- [x] playback: gradient stop interpolation (OKLab for color, number for position/angle/center); resolve dot-path targets into nested style updates
- [x] renderer: style writer reconstructs full gradient CSS value from per-stop changes
- [x] demo milestone: gradient background → keyframes targeting stop color →
      play → gradient animates smoothly through OKLab color space

## Feature Group 11-F: Per-character text animation

_Affected packages:_ model, playback, renderer, ui
_Spec sections:_ `model/animation.md` §TextAnimator, `model/format-reference.md`

- [x] model: add `TextAnimator` type (rangeMode: character/word/line, staggerDelayMs, randomOrder, timelineId) + Zod schema
- [x] playback: per-unit splitting engine — decompose text into characters/words/lines, compute per-unit stagger offsets, apply referenced timeline to each unit with delay
- [x] renderer: wrap individual text characters in `<span>` with `data-char-index` for per-character animation targeting
- [x] ui: text animator controls in animation sidebar (range mode dropdown, stagger delay input, random order toggle, timeline selector)
- [x] demo milestone: text element → add text animator with character stagger →
      play → each character animates in sequence with configured delay

## Feature Group 11-G: Audio cue support

_Affected packages:_ model, playback, ui
_Spec sections:_ `model/animation.md` §audioCues, `model/format-reference.md`

- [x] model: add `audioCues` array to timeline type (assetId, offsetMs, volume 0–1, loop) + Zod schema
- [x] playback: fire-and-forget `<audio>` during forward playback; skip cues on seek; re-fire when time crosses cue offset forward; respect volume and loop flag
- [ ] ui: audio cue markers on timeline editor (visual markers at cue offsets, add/remove controls, asset picker, volume slider)
- [ ] demo milestone: add audio cue at 500ms → play → audio fires; seek past →
      no audio; replay → fires again at 500ms

## Feature Group 11-H: Variable font controls

_Affected packages:_ model, renderer, ui
_Spec sections:_ `model/style.md` §fontVariationSettings, `model/capabilities.md` §typography

- [ ] model: `fontVariationSettings` (CSS string) on style, gated by typography capability
- [ ] renderer: apply `font-variation-settings` CSS property to text elements
- [ ] ui: per-axis sliders in properties panel when variable font is active (dynamically generated from font metadata)
- [ ] demo milestone: select text with variable font → adjust weight/width axes
      via sliders → font appearance changes in real-time

## Feature Group 11-I: Output specification integration

_Affected packages:_ model, editor, ui
_Spec sections:_ `model/output-spec.md` (frame rate, color space, dynamic range)

- [ ] model: add `BroadcastOutputSpec` type (frameRate: 23.976/24/25/29.97/30/50/59.94/60, colorSpace: rec709/rec2020/srgb, dynamicRange: sdr/hlg/pq) + Zod validation
- [ ] editor: output spec in canvas/document settings (applies to animation quantization, timecode display)
- [ ] ui: output spec controls in canvas settings modal (frame rate dropdown, color space select, dynamic range select)
- [ ] demo milestone: set frame rate to 25fps → animation quantizes to 40ms
      frames; output spec visible in canvas settings

## Feature Group 11-J: Accessibility audit

_Affected packages:_ ui, demo
_Spec sections:_ `ui/utilities.md` §Accessibility, `ui/spec.md` §WCAG AA

- [ ] ui: verify all inputs labeled, keyboard-operable, 4.5:1 contrast ratio, `aria-invalid` on validation errors
- [ ] ui: tab navigation through all interactive elements, collapsibles with `aria-expanded`, toolbars with arrow key navigation, icon buttons with `aria-label`
- [ ] ui: modals with focus trap + escape close + `aria-modal` + `aria-labelledby`
- [ ] demo: full WCAG AA compliance audit across all UI components
- [ ] demo milestone: screen reader navigates entire UI; all interactive elements
      keyboard-reachable; contrast ratios meet AA; focus management correct in
      modals and dialogs

---

## Progress

| Group                             | Model | Renderer | Playback | Editor/UI | Demo |
| --------------------------------- | ----- | -------- | -------- | --------- | ---- |
| 11-A vertical text alignment      | ☐     | ☐        | —        | ☐         | ☐    |
| 11-B trim path properties         | ☐     | ☐        | ☐        | ☐         | ☐    |
| 11-C boolean shape operations     | ☐     | ☐        | —        | ☐         | ☐    |
| 11-D template groups              | ☐     | —        | —        | ☐         | ☐    |
| 11-E gradient animation targets   | ☐     | ☐        | ☐        | —         | ☐    |
| 11-F per-character text animation | ☐     | ☐        | ☐        | ☐         | ☐    |
| 11-G audio support                | ☐     | —        | ☐        | ☐         | ☐    |
| 11-H variable font controls       | ☐     | ☐        | —        | ☐         | ☐    |
| 11-I output specification         | ☐     | —        | —        | ☐         | ☐    |
| 11-J accessibility audit          | —     | —        | —        | ☐         | ☐    |
