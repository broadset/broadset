# Phase 7 — Animation Authoring

**Packages:** `packages/editor`, `packages/ui`, `packages/demo`
**Depends on:** Phase 6 (interaction polish)
**Index:** [plan.md](plan.md)

**Goal by end of phase:** Full animation authoring workflow. Users can add
keyframes, edit easing curves, see per-property lanes, control playback from
the editor, and see animations rendered in real-time. The timeline bottom panel
provides a professional animation editing experience.

---

### ⚠️ MANDATORY — HeroUI component library

All UI components **MUST** use `@heroui/react`. See `AGENTS.md` and
`.github/instructions/heroui.instructions.md`.

---

## Feature Group 7-A: Animation state mutations

_Editor specs:_ `editor/animation-state.md` (timeline upsert/remove — idempotent,
preserves unrelated; keyframe add/update/remove; state timeline bindings —
idempotent by name, reserved IN/OUT protected from removal, reorder custom only;
modifier bindings — replace same-name; element state → visibility mapping —
entry=onscreen, exit=offscreen; descendant propagation; modifier deduplication;
custom clip-path persistence)

- [ ] tests: red — editor/animation-state
- [ ] impl: green

## Feature Group 7-B: Timeline playback in editor

_Editor specs:_ `editor/timeline-playback.md` (snapshot pattern — capture
pre-playback state → hand to playback controller → restore on stop; controller
registration; editing-close restoration — stop + restore; no-op without
controller; transition suppression window timing),
`editor/react-data-integration.md` (usePlayback hook — play/pause/seek/stop/
currentTime/speed)

- [ ] tests: red — editor/timeline-playback
- [ ] tests: red — editor/react-data-integration (usePlayback hook)
- [ ] impl: green

## Feature Group 7-C: Timeline UI + bottom panel

_UI specs:_ `ui/timeline.md` (keyframe management — empty state, + button
add+select, single selection, re-click keeps selected, aria-pressed hint;
keyframe drag repositioning — visual indicator, committed on drop; playback
controls — calls onPlayTimeline without onComplete; bottom panel — aria-hidden,
open/close, height/className, callbacks; editing context — start with no target,
open sets target+snapshot, close clears both, null outside provider; animation
binding sections — state bindings CRUD with rename, modifier binding pairs)

- [ ] tests: red — ui/timeline
- [ ] impl: green
- [ ] **HeroUI verified**
- [ ] demo milestone: timeline bottom panel opens; keyframes visible as dots on
      timeline; click to select, drag to reposition in time; Delete key removes;
      play button starts animation; state/modifier bindings editable

## Feature Group 7-D: Easing graph + per-property lanes

_UI specs:_ `ui/timeline.md` (visual easing graph editor — preset chips for
linear/ease-in/ease-out/ease-in-out/ease + draggable cubic-bezier handles +
animated preview dot showing curve behavior), `ui/timeline.md` (per-property
keyframe lanes — expandable per-element property tracks for x, y, opacity,
rotation, etc.)

- [ ] tests: red — ui/timeline (easing graph + per-property lanes)
- [ ] impl: green
- [ ] **HeroUI verified**
- [ ] demo milestone: click keyframe → easing graph opens with preset chips and
      draggable bezier handles; expand element row → individual property tracks
      visible; animated preview dot shows easing curve behavior

## Feature Group 7-E: Animation sidebar

_UI specs:_ `ui/panels.md` (animation tab in sidebar — element selected +
animations enabled guard, empty/disabled states, lock helper, keyframe property
fields integrating with animation mode adapter, property field keyframe
integration)

- [ ] tests: red — ui/panels (animation sidebar)
- [ ] impl: green
- [ ] **HeroUI verified**
- [ ] demo milestone: select element → open animation tab → add timeline → add
      keyframes in timeline editor → configure properties in animation sidebar →
      hit play → animation runs in real-time on canvas

---

## Progress

| Group                         | Red | Green | Demo |
| ----------------------------- | --- | ----- | ---- |
| 7-A animation state mutations | ☐   | ☐     | ☐    |
| 7-B timeline playback         | ☐   | ☐     | ☐    |
| 7-C timeline UI + bottom      | ☐   | ☐     | ☐    |
| 7-D easing graph + lanes      | ☐   | ☐     | ☐    |
| 7-E animation sidebar         | ☐   | ☐     | ☐    |
