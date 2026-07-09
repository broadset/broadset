# Editor Preview Runtime Separation

## Goal

Separate durable editing state from animation preview/playback state so property edits, layer visibility, and animation scrubbing do not compete for the same canvas DOM styles.

## Diagnosis

The package graph remains sound: `model` defines data, `playback` evaluates animation timing, `renderer` paints documents, `editor` owns editing state, and `demo` integrates the shell. The failure is at the preview boundary: `ScreenPreview` currently creates a renderer and a playback controller against the same DOM host. The renderer writes base document styles, while playback writes animation styles and restores cached baselines on the same nodes.

That makes basic editing and animation preview last-writer-wins. A base opacity or fill edit can be visually overwritten by a timeline seek, and a timeline reset can reapply keyframe values after unrelated layer operations.

## Target Model

Editor preview state is split into three concepts:

- **Base document:** durable `BroadsetDocument` from the editor store.
- **Animation authoring state:** selected timeline/keyframe, scrub time, and play state.
- **Runtime overlay:** ephemeral property overrides computed from playback timeline frames.

The editor preview MUST render by composing:

```text
base document + runtime overlay -> composed preview document -> renderer DOM write
```

The playback DOM writer may remain for real playback/runtime use, but timeline editing in the demo preview MUST NOT call `PlaybackController.seekTimeline()` to mutate the editor canvas.

## Implementation Phases

1. Add pure overlay composition tests for owner and child-target animation properties.
2. Implement a small preview overlay composer in the demo integration layer using playback's existing `computeTimelineFrame` output.
3. Route timeline seek/play/reset/state preview actions through overlay state passed into `ScreenPreview`.
4. Keep global playback isolated: document updates pause the DOM playback path, while timeline authoring never uses it.
5. Add cross-region CT coverage proving base opacity/fill/layer edits remain stable after timeline preview state.
6. Move animation document updates toward editor-owned store actions once the preview boundary is stable.

## Current Pass Scope

The demo preview overlay is intentionally model-composable. It supports the
animation properties that can be represented by a temporary `BroadsetDocument`
without writing directly to DOM nodes: opacity, fill/background color,
gradient sub-properties, text/path content, x/y translation, rotation, and
trim-path fields.

Animation effects that only exist as runtime DOM transforms or generated spans
remain playback-owned for now. Full parity for those effects should move toward
a renderer-level preview overlay API, not a return to `seekTimeline()` mutating
the editor canvas DOM.

## Non-Goals For This Pass

- No new hard UX mode switch.
- No replacement animation engine.
- No export/player rewrite.
- No compatibility shim for old Broadset-owned preview state.
