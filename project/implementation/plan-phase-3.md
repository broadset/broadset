# Phase 3 — Playback + Demo animated

**Packages:** `packages/playback`, `packages/demo`
**Depends on:** Phase 1 (model), Phase 2 (renderer + demo shell)
**Index:** [plan.md](plan.md)

**Goal by end of phase:** The demo app plays animations. The sample document
gets a second animated version (or a second page) with keyframes, states, and
modifiers. A play/pause control proves the playback controller is wired up.

---

## 3.1 Interpolation engine (`playback/interpolation.md`)

- [x] tests: red
- [x] impl: green

_Spec:_ `project/spec/playback/interpolation.md`
_What to cover:_ All 5 easing presets plus spring easing (harmonic oscillator
with 3 named presets: gentle/bouncy/stiff), cubic-bezier solver (Newton's
method, tolerance 1e-6, malformed → linear), t clamped to [0,1], type dispatch
(number, hex color via OKLab, numeric string, array, step fallback), counting
text interpolation (numeric string formatting with prefix/suffix/decimals), path
morphing (element-wise, different lengths rejected, 2dp rounding), hex-only
color contract.

## 3.2 Timeline computation (`playback/timeline.md`)

- [x] tests: red
- [x] impl: green

_Spec:_ `project/spec/playback/timeline.md`
_What to cover:_ Duration (max offset + 300ms, explicit durationMs override,
empty = 0, child timelines accounted for), frame before/after/between keyframes,
deterministic state derivation (pure function of markers from t=0, seek-direction
independent, no fired/unfired tracking), child timeline composition (relative
offsets, absent until started), loop duration computation (modular time mapping,
Infinity for infinite), stagger offset computation (normal/reverse/center
direction), motion path position interpolation (arc-length sampling, tangent
angle), target routing into targetProperties map, batch computation for all
named timelines.

## 3.3 Playback controller (`playback/playback.md`)

- [x] tests: red
- [x] impl: green

_Spec:_ `project/spec/playback/playback.md`
_What to cover:_ PlaybackHandle API (play/pause/seek/setSpeed/cancel; cancelled
→ no-op); timeline state determinism guarantee (same T = same state regardless
of seek path); declarative action marker evaluation (not imperative triggers);
anti-cascade validation (state-triggered timelines must not contain self-targeting
action markers); loop and ping-pong playback (seamless restart, reverse on odd
iterations, settle timer rules); style writer target routing
(`[data-element-content]`, opacity → `[data-opacity-target]`, camelCase →
kebab-case); DOM observation lifecycle (attach/detach/destroy); offscreen =
visibility:hidden + pointer-events:none; transition suppression flag.

## 3.4 Demo: animated sample content + play/pause control

- [x] tests: red (Playwright CT)
- [x] impl: green

_Spec:_ `project/spec/demo/data-integration.md`, `project/spec/demo/state.md`
_What to cover:_

- Extend the sample document with `animations` entries: at minimum one
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
| 3.1 interpolation engine  | ☒   | ☒     |
| 3.2 timeline computation  | ☒   | ☒     |
| 3.3 playback controller   | ☒   | ☒     |
| 3.4 demo animated content | ☒   | ☒     |
