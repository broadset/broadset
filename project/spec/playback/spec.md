# Playback Specification

## Purpose

Defines the animation and interpolation engine for broadset. Playback resolves canonical sequences, stable tracks/keyframes, lifecycle and state-machine transitions at exact integer ticks, then exposes typed property results to renderer/editor adapters. It does NOT own project validation, DOM structure, or editor state. See [conventions](../../README.md).

---

## Sub-Specs

| Sub-Spec                             | Scope                                                                           |
| ------------------------------------ | ------------------------------------------------------------------------------- |
| [interpolation.md](interpolation.md) | Easing, value interpolation, color lerp, path morphing                          |
| [timeline.md](timeline.md)           | Exact-tick sequence, track, child-clip, lifecycle, and state-machine evaluation |
| [playback.md](playback.md)           | Sequence transport, playback handle, DOM writer, and transition scheduling      |

---

## Non-Goals

- Document model types and validation → see `project/spec/model/spec.md`
- DOM rendering pipeline → see `project/spec/renderer/spec.md`
- Editor store integration → see `project/spec/editor/spec.md`
- Export format behavior → see `project/spec/formats/spec.md`
