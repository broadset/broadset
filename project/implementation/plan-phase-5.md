# Phase 5 — Rich Properties & Layers

**Packages:** `packages/ui`, `packages/editor`, `packages/demo`
**Depends on:** Phase 4 (editor MVP)
**Index:** [plan.md](plan.md)

**Goal by end of phase:** Full visual property editing. Every style field is
editable through polished input components. Layers panel provides element
management. Type-specific panels configure video, clock, and ticker elements.
The demo showcases rich visual editing with capability-driven panel visibility.

---

### ⚠️ MANDATORY — HeroUI component library

All UI components **MUST** use `@heroui/react`. See `AGENTS.md` and
`.github/instructions/heroui.instructions.md`.

---

## Feature Group 5-A: Input components

_UI specs:_ `ui/inputs.md` (color picker — saturation/brightness area + hue
slider, hex/rgba text input, invalid strings not submitted, alpha support;
gradient editing via fill type switcher — solid/linear/radial/conic; CSS length
input — numeric value + unit switching with auto-convert; text stroke input —
width + color → text-stroke shorthand; filter editor — stack CRUD with ordered
individually configurable filter functions; shadow editor — box-shadow/
text-shadow builder),
`ui/utilities.md` (CSS parsers — shadow parse/build, filter parse/build, CSS
length parse, animation binding normalization, timeline/state resolution,
keyframe value resolution)

- [x] tests: red — ui/utilities (CSS parsers)
- [x] tests: red — ui/inputs (all 5 input components)
- [x] impl: green — all
- [x] **HeroUI verified**
- [ ] demo milestone: color picker shows saturation/brightness area + hue slider;
      gradient editing via fill type switcher; filter and shadow editors allow
      stacking multiple effects; color values normalized to hex

## Feature Group 5-B: Full properties panel

_UI specs:_ `ui/panels.md` (properties sidebar — all style fields organized by
capability: typography block for text elements — fontFamily, fontSize, fontColor,
fontWeight 100–900 numeric, fontStyle, textAlignment, textDecoration,
textTransform, letterSpacing, lineHeight, wordSpacing, textShadow, textStroke,
writingMode; appearance block — backgroundColor, backgroundGradient, opacity;
border block — borderWidth, borderColor, borderRadius, borderStyle, padding;
box effects — boxShadow, filter, backdropFilter, mixBlendMode, isolation;
SVG stroke/fill — stroke, strokeWidth, strokeDasharray, strokeDashoffset,
strokeLinecap, strokeLinejoin, strokeOpacity, fill, fillOpacity, fillRule;
3D transforms — rotateX/Y/Z, translateZ; masking — maskType, customClipPath,
clipChildren; objectFit for media; capability-driven visibility — panels shown
based on element’s capability profile; screen vs print mode — print hides
gradient/3D/clip; multi-element editing — common values shown, “Mixed” for
differing values; animation mode adapter — keyframe selection routes edits to
keyframe values)

- [x] tests: red — ui/panels (full properties panel)
- [x] impl: green
- [x] **HeroUI verified**
- [x] demo milestone: select element → all applicable style fields visible based
      on element type capabilities; select multiple → common values shown, differing
      show “Mixed”; print mode hides gradient/3D/clip fields; changing any property
      updates canvas in real-time

## Feature Group 5-C: Layers panel

_UI specs:_ `ui/panels.md` (layers panel — list with per-element lock toggle,
visibility toggle, delete button; inline rename via double-click, Enter commits,
Escape cancels, empty rejected; “Scenes” terminology in UI labels not “Pages”;
drag-to-reorder elements)

- [x] tests: red — ui/panels (layers panel)
- [x] impl: green
- [x] **HeroUI verified**
- [x] demo milestone: layers tab shows all elements with lock/visibility/delete
      controls; double-click to rename element; reorder by dragging; “Scenes”
      label used throughout

## Feature Group 5-D: Type-specific panels + auto-size

_UI specs:_ `ui/panels.md` (video panel — source URL, autoplay, loop, muted,
start/end time; clock panel — format pattern, mode selector, start value, target
value, countdownTo for absolute datetime countdown; ticker panel — items array,
speed 1–2000 px/s, direction left/right/up/down, gap, paused toggle),
`ui/panels.md` (auto-size mode — segmented button: fixed/auto-height/
shrink-to-fit with minimum 6pt)

- [x] tests: red — ui/panels (type-specific panels + auto-size)
- [x] impl: green
- [x] **HeroUI verified**
- [x] demo milestone: select video element → source URL + playback controls shown;
      select clock → format pattern + mode selector; select ticker → items list +
      speed/direction; text elements show auto-size toggle (fixed/auto-height/
      shrink-to-fit)

---

## Progress

| Group                         | Red | Green | Demo |
| ----------------------------- | --- | ----- | ---- |
| 5-A input components          | ☒   | ☒     | ☒    |
| 5-B full properties panel     | ☒   | ☒     | ☒    |
| 5-C layers panel              | ☒   | ☒     | ☒    |
| 5-D type-specific + auto-size | ☒   | ☒     | ☒    |
