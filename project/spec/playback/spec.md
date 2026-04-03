# Playback Specification

## Purpose

Defines the animation and interpolation engine for broadset. The playback domain computes interpolated property values at arbitrary points in time, applies easing curves, manages timeline playback, and drives DOM style updates for element state transitions. It operates on the `AnimationRegistry` from the model domain and is consumed by the renderer and editor. It does NOT own the document model, render DOM structure, or manage editor state. See [conventions](../../README.md).

---

## Sub-Specs

| Sub-Spec                             | Scope                                                           |
| ------------------------------------ | --------------------------------------------------------------- |
| [interpolation.md](interpolation.md) | Easing, value interpolation, color lerp, path morphing          |
| [timeline.md](timeline.md)           | Timeline computation, action state, duration, child composition |
| [playback.md](playback.md)           | Playback controller, playback handle, style writer, transitions |

---

## Non-Goals

- Document model types and validation → see `project/spec/model/spec.md`
- DOM rendering pipeline → see `project/spec/renderer/spec.md`
- Editor store integration → see `project/spec/editor/spec.md`
- Export format behavior → see `project/spec/formats/spec.md`
