# Carry-Over From Original (dom-compositor)

Date: 2026-04-13
Scope compared: ../dom-compositor vs current broadset app implementation

## What Is Better In The Original

1. Timeline and animation flows are fully wired end-to-end.

- Original demo wires timeline controls directly to playback handlers (`onPlayTimeline`, `onSeekTimeline`, `onStopTimeline`) in `../dom-compositor/packages/demo/src/main.tsx` (lines ~1134-1136).
- Current demo still has placeholder handlers for animation/timeline actions (`"not yet wired"`) in `packages/demo/src/DemoApp.tsx` (17 occurrences at lines 1268-1306 and 2596-2611).
- Carry-over: complete all animation sidebar + timeline editor handler wiring in `DemoApp` and remove placeholder toasts.

2. Animation authoring UX is significantly richer and stateful.

- Original has integrated animation builder flows in `../dom-compositor/packages/heroui/src/AnimationBuilder.tsx`:
  - Quick setup that creates enter/exit timelines and bindings (lines ~282-288).
  - Starter presets (line ~295).
  - Add custom animation flow (line ~391).
- Current `packages/ui/src/animation-sidebar.tsx` is callback-driven only (props like `onAddTimeline`, `onQuickSetup`, `onAddStateBinding`) and depends on host wiring.
- Carry-over: add a reusable integration layer (or hook) that provides ready-to-use timeline/binding CRUD and quick presets for host apps.

3. CT coverage breadth is much stronger in the original.

- Original has 22 CT scenario files under `../dom-compositor/ct` (transform, zoom, path editing, keyboard, motion playback, import/export round-trips, etc.).
- Current app has 1 CT scenario file in `packages/demo/ct/demo-shell.ct.tsx`.
- Carry-over: split CT into scenario-focused files and port the highest-value missing flows first (zoom/pan, path editing, timeline playback, import/export round-trip).

4. CT architecture is more maintainable in the original (harness-based).

- Original includes dedicated harness components (`../dom-compositor/ct/*Harness.tsx`) such as `TransformTestHarness.tsx`, `MotionPlaybackHarness.tsx`, `SvgRoundTripHarness.tsx`, `PsdRoundTripHarness.tsx`.
- Current CT coverage is mostly a single shell-driven path, which increases test coupling and brittleness.
- Carry-over: introduce focused harnesses in `packages/demo/ct` to isolate subsystems and reduce cross-test setup complexity.

5. Export UX is more feature-complete in the original.

- Original `../dom-compositor/packages/heroui/src/ExportModal.tsx` exposes advanced controls:
  - Raster pixel ratio (`raster-pixel-ratio`, line ~660)
  - JPEG quality (`raster-jpeg-quality`, line ~672)
  - Video custom FPS (`video-custom-fps`, line ~714)
  - Video bitrate (`video-bitrate`, line ~757)
  - Encoding progress UI (line ~864)
- Current `packages/ui/src/modals.tsx` export flow is format selection + export trigger, without these advanced controls.
- Carry-over: add optional advanced export settings and progress reporting to current export modal.

6. Package-level developer documentation is better in the original.

- Original has package README files for editor/formats/heroui/model/motion/renderer.
- Current broadset packages only expose `packages/README.md` at package-root level.
- Carry-over: add concise README files per package (`editor`, `formats`, `ui`, `renderer`, `playback`, `model`) covering API surface and usage snippets.

7. UI module granularity is better in the original host package.

- Original `heroui` has many focused modules (70 source files) and narrower feature files.
- Current `ui` has fewer, larger files (21 source files) with concentration in large modules (e.g., `property-panels.tsx`, `timeline.tsx`, `inputs.tsx`).
- Carry-over: continue splitting high-churn UI modules by domain (timeline editor internals, property sections, export settings, panel adapters).

## Priority Carry-Over Order

1. Wire timeline/animation handlers in demo (remove placeholder flows).
2. Expand CT coverage using harness-based scenario files.
3. Bring back advanced export options and progress UX.
4. Add reusable animation integration helpers (quick setup/presets/bindings).
5. Add package-level READMEs and continue UI module decomposition.
