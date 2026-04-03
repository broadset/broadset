# Phase 3 — Playback + Demo animated

**Packages:** `packages/playback`, `packages/demo`
**Depends on:** Phase 1 (model), Phase 2 (renderer + demo shell)
**Index:** [plan.md](plan.md)

**Goal by end of phase:** The demo app plays animations. The sample document
gets a second animated version (or a second page) with keyframes, states, and
modifiers. A play/pause control proves the playback controller is wired up.

---

## 3.1 Interpolation engine (`playback/interpolation.md`)

- [ ] tests: red
- [ ] impl: green

_Spec:_ `project/spec/playback/interpolation.md`
_What to cover:_ All 5 easing presets, cubic-bezier solver (Newton's method,
tolerance 1e-6, malformed → linear), t clamped to [0,1], type dispatch (number,
hex color via OKLab, numeric string, array, step fallback), path morphing
(element-wise, different lengths rejected, 2dp rounding), hex-only color
contract.

## 3.2 Timeline computation (`playback/timeline.md`)

- [ ] tests: red
- [ ] impl: green

_Spec:_ `project/spec/playback/timeline.md`
_What to cover:_ Duration (max offset + 300ms, empty = 0, child timelines
accounted for), frame before/after/between keyframes, action state replay
(setState exclusive, add/removeModifier idempotent, backward seek from zero),
child timeline composition (relative offsets, absent until started), target
routing into targetProperties map, batch computation for all named timelines.

## 3.3 Playback controller (`playback/playback.md`)

- [ ] tests: red
- [ ] impl: green

_Spec:_ `project/spec/playback/playback.md`
_What to cover:_ PlaybackHandle API (play/pause/seek/setSpeed/cancel; cancelled
→ no-op); style writer target routing (`[data-element-content]`, opacity →
`[data-opacity-target]`, camelCase → kebab-case); DOM observation lifecycle
(attach/detach/destroy); offscreen = visibility:hidden + pointer-events:none;
transition suppression flag.

## 3.4 Demo: animated sample content + play/pause control

- [ ] tests: red (Playwright CT)
- [ ] impl: green

_Spec:_ `project/spec/demo/data-integration.md`, `project/spec/demo/state.md`
_What to cover:_

- Extend the sample document with `animationRegistry` entries: at minimum one
  element with a position/opacity timeline, one with an IN/OUT state binding
- Wire `PlaybackController` to the renderer output
- Add a minimal play/pause button to the demo (no full timeline editor yet)
- Prove: pressing play animates elements; pressing pause freezes them; seek to 0
  resets to initial state
- Browser zoom prevention and viewport overflow lock in place
  (so the demo feels like an app, not a web page)

---

## Progress

| Unit                      | Red | Green |
| ------------------------- | --- | ----- |
| 3.1 interpolation engine  | ☐   | ☐     |
| 3.2 timeline computation  | ☐   | ☐     |
| 3.3 playback controller   | ☐   | ☐     |
| 3.4 demo animated content | ☐   | ☐     |
