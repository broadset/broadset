# Wave W2 implementation plan

Status: draft — re-sliced at the W1 phase exit

Draft task stacks for the professional authoring core. File paths that exist in today's tree are named directly; paths expected to be created (or reshaped by W1) are marked `(new)`. Every XL/XXL initiative carries a draft PR-slice table; slices, not initiatives, are the PR unit.

## W2-CMD-01 tasks

### T1 — Typed command registry core

- Files: `packages/editor/src/commands/registry.ts` (new), `packages/editor/src/commands/registry.test.ts` (new), `packages/editor/src/commands/types.ts` (new)
- Interfaces: `CommandDefinition`, `CommandRegistry`, `registerCommand`, `executeCommand`, `CommandConflictReport`
- RED: registering two commands with the same id or the same shortcut chord yields a conflict report, and a command with neither `undo` nor `readOnly: true` fails validation → GREEN: implement the typed registry with chord normalization, conflict detection, and undoable/read-only classification
- Commit: `feat(editor): add typed command registry with conflict detection`

### T2 — Route shortcuts, menus, toolbar, and context UI through the registry

- Files: `packages/editor/src/keyboard.ts`, `packages/ui/src/toolbar-nav.tsx`, `packages/editor/src/commands/bindings.ts` (new), `packages/editor/src/commands/bindings.test.ts` (new)
- Interfaces: `resolveShortcut`, `listCommandsForSurface`
- RED: a dispatch-audit test asserting every shipped shortcut, menu item, and toolbar action resolves to a registered command id fails against the legacy ad-hoc handlers → GREEN: replace direct handler dispatch with registry execution in keyboard, menu, context, and toolbar surfaces
- Commit: `refactor(editor): route shortcuts and menus through command registry`

### T3 — Registry coverage and undoability gate

- Files: `packages/editor/src/commands/registry-coverage.test.ts` (new)
- Interfaces: none
- RED: coverage test enumerating shipped command surfaces reports unregistered or unclassified commands → GREEN: register the stragglers and mark each command undoable or explicitly read-only until the report is empty
- Commit: `test(editor): enforce command registry coverage and undoability`

## W2-CANVAS-01 tasks

### T1 — Hit testing, marquee, and multi-select with mixed values

- Files: `packages/editor/src/canvas.ts`, `packages/editor/src/selection/hit-test.ts` (new), `packages/editor/src/selection/marquee.ts` (new), `packages/editor/src/selection/mixed-values.ts` (new), `packages/editor/src/selection/selection.test.ts` (new)
- Interfaces: `hitTestScene`, `MarqueeState`, `MixedValue<T>`, `computeMixedValues`
- RED: property tests for hit testing across rotated/nested elements and marquee containment fail; mixed-value derivation for a heterogeneous selection fails → GREEN: implement scene hit testing, marquee selection, and mixed-value aggregation consumed by the properties panel
- Commit: `feat(editor): add canvas hit testing, marquee, and mixed values`

### T2 — Smart snapping, guides, and unit-correct rulers and nudge

- Files: `packages/editor/src/snapping/snap-engine.ts` (new), `packages/editor/src/snapping/snap-engine.test.ts` (new), `packages/editor/src/guides.ts` (new), `packages/renderer/src/rulers.tsx` (new), `packages/editor/src/keyboard.ts`
- Interfaces: `SnapEngine`, `SnapCandidate`, `GuideStore`, `nudgeSelection`
- RED: snap-candidate tests (edges, centers, spacing, guide lines) and unit-correct nudge tests (px/mm/in per canvas unit) fail → GREEN: implement the snapping engine, persistent guides, ruler rendering in the declared canvas unit, and modifier-aware nudge increments
- Commit: `feat(editor): add smart snapping, guides, and unit-correct rulers`

### T3 — Transform HUD, modifier semantics, and frame-budget CT

- Files: `packages/renderer/src/transform-hud.tsx` (new), `packages/editor/src/transforms.ts`, `packages/ui/ct/canvas-transform-mechanics.ct.tsx` (new)
- Interfaces: `TransformHudState`
- RED: cross-region CTs (drag/snap/nudge/transform reflected in canvas, HUD, and properties panel) fail; a frame-budget assertion around direct manipulation fails → GREEN: mount the transform HUD, wire modifier semantics (constrain, duplicate, center-scale), and keep interaction within the frame budget
- Commit: `feat(renderer): add transform HUD with modifier semantics`

| Slice           | Scope                                                         | Proof                                   | Rollback / evidence                | Merge prerequisite |
| --------------- | ------------------------------------------------------------- | --------------------------------------- | ---------------------------------- | ------------------ |
| W2-CANVAS-01.S1 | Scene hit testing + click selection                           | hit-test property tests                 | revert slice; unit-test log        | none               |
| W2-CANVAS-01.S2 | Marquee + multi-select                                        | marquee CT (canvas → layers panel)      | revert slice; CT trace             | W2-CANVAS-01.S1    |
| W2-CANVAS-01.S3 | Mixed-value aggregation in properties panel                   | mixed-value unit tests + panel CT       | revert slice; CT trace             | W2-CANVAS-01.S2    |
| W2-CANVAS-01.S4 | Snap engine (edges, centers, spacing)                         | snap-candidate property tests           | revert slice; unit-test log        | W2-CANVAS-01.S1    |
| W2-CANVAS-01.S5 | Guides + unit-correct rulers                                  | ruler unit tests + guide persistence CT | revert slice; CT trace             | W2-CANVAS-01.S4    |
| W2-CANVAS-01.S6 | Nudge + modifier semantics                                    | keyboard nudge unit tests + CT          | revert slice; CT trace             | W2-CANVAS-01.S5    |
| W2-CANVAS-01.S7 | Transform HUD                                                 | HUD cross-region CT                     | revert slice; CT trace             | W2-CANVAS-01.S6    |
| W2-CANVAS-01.S8 | Frame-budget assertions + cross-region CT sweep for all flows | perf assertion + full CT sweep green    | revert slice; perf report + CT run | W2-CANVAS-01.S7    |

## W2-PATH-01 tasks

### T1 — Bézier geometry operations and property tests

- Files: `packages/editor/src/path-geometry.ts`, `packages/editor/src/path-geometry/bezier-ops.ts` (new), `packages/editor/src/path-geometry/bezier-ops.test.ts` (new)
- Interfaces: `insertAnchor`, `convertAnchor`, `splitSegment`, `PathSelection`
- RED: property tests for anchor insertion/conversion, segment splitting, and handle symmetry invariants fail → GREEN: implement the Bézier geometry operations on the path model with exact round-trip guarantees
- Commit: `feat(editor): add bezier anchor and segment operations`

### T2 — Pen tool phases A–B with keyboard and pointer parity

- Files: `packages/editor/src/tools/pen-tool.ts` (new), `packages/renderer/src/path-overlay.tsx` (new), `packages/editor/src/keyboard.ts`, `packages/ui/ct/pen-path-authoring.ct.tsx` (new)
- Interfaces: `PenToolState`, `PathEditMode`
- RED: CTs drawing a path with pointer and reproducing the identical geometry keyboard-only fail (parity per QG-A11Y-01) → GREEN: implement pen draw (phase A) and path edit (phase B) with an on-canvas overlay, anchor conversion gestures, and full keyboard equivalents
- Commit: `feat(editor): add pen tool with keyboard authoring parity`

### T3 — Text-path and mask/matte editing with undo grouping

- Files: `packages/editor/src/tools/text-path.ts` (new), `packages/editor/src/tools/mask-editing.ts` (new), `packages/editor/src/editing.ts`, `packages/editor/src/tools/mask-editing.test.ts` (new)
- Interfaces: `attachTextToPath`, `MaskEditSession`
- RED: undo-grouping tests proving a multi-gesture path edit collapses to one history entry fail; text-path and mask edit round-trip tests fail → GREEN: implement text-on-path authoring and mask/matte edit sessions grouped as single undoable transactions
- Commit: `feat(editor): add text-path and mask editing with grouped undo`

| Slice         | Scope                                    | Proof                                | Rollback / evidence           | Merge prerequisite |
| ------------- | ---------------------------------------- | ------------------------------------ | ----------------------------- | ------------------ |
| W2-PATH-01.S1 | Bézier geometry ops                      | geometry property tests              | revert slice; unit-test log   | none               |
| W2-PATH-01.S2 | Pen tool phase A (draw)                  | pointer draw CT                      | revert slice; CT trace        | W2-PATH-01.S1      |
| W2-PATH-01.S3 | Anchor conversion + path selection modes | conversion unit tests + selection CT | revert slice; CT trace        | W2-PATH-01.S2      |
| W2-PATH-01.S4 | Pen tool phase B (edit existing paths)   | edit CT + geometry round-trip        | revert slice; CT trace        | W2-PATH-01.S3      |
| W2-PATH-01.S5 | Keyboard path authoring parity           | keyboard-only CT matching pointer CT | revert slice; parity CT trace | W2-PATH-01.S4      |
| W2-PATH-01.S6 | Text-path authoring                      | text-path round-trip tests + CT      | revert slice; CT trace        | W2-PATH-01.S4      |
| W2-PATH-01.S7 | Mask/matte editing                       | mask edit CT + renderer assertions   | revert slice; CT trace        | W2-PATH-01.S6      |
| W2-PATH-01.S8 | Undo grouping + cross-region CT sweep    | history unit tests + full CT sweep   | revert slice; CT run          | W2-PATH-01.S7      |

## W2-TIMELINE-01 tasks

### T1 — Virtualized property lanes with zoom/pan and timebase modes

- Files: `packages/ui/src/timeline/editor.tsx`, `packages/ui/src/timeline/per-property-lanes.tsx`, `packages/ui/src/timeline/virtual-lanes.tsx` (new), `packages/ui/src/timeline/timebase.ts` (new), `packages/ui/src/timeline/virtual-lanes.test.tsx` (new)
- Interfaces: `VirtualLaneWindow`, `TimebaseMode` (frame/timecode), `formatTimecode`
- RED: virtualization tests proving only visible lanes render at 10k keyframes fail; frame/timecode conversion tests fail → GREEN: implement windowed lane rendering, zoom/pan, and frame/timecode display modes
- Commit: `feat(ui): virtualize timeline lanes with frame and timecode modes`

### T2 — Stable keyframe operations, markers, work area, copy/paste/multi-select

- Files: `packages/editor/src/timeline-playback.ts`, `packages/editor/src/timeline/keyframe-ops.ts` (new), `packages/ui/src/timeline/markers.tsx` (new), `packages/editor/src/timeline/keyframe-ops.test.ts` (new)
- Interfaces: `moveKeyframes`, `copyKeyframes`, `pasteKeyframes`, `WorkArea`, `TimelineMarker`
- RED: keyframe multi-select/move/copy/paste tests with identity stability across edits fail; marker and work-area persistence tests fail → GREEN: implement stable keyframe operations as registry commands plus markers and work area
- Commit: `feat(editor): add stable keyframe operations, markers, and work area`

### T3 — Keyboard-only E2E, 10k-keyframe budget, and de-gating

- Files: `packages/ui/ct/timeline-keyboard-flow.ct.tsx` (new), `packages/ui/src/timeline/performance.test.tsx` (new), `packages/demo/src/demo-app/` (new flag removal)
- Interfaces: none
- RED: keyboard-only timeline E2E CT (QG-A11Y-01) and 10k-keyframe performance assertion fail → GREEN: close operability gaps, meet the budget, and remove the experimental flag so the timeline ships mounted
- Commit: `feat(ui): de-gate professional timeline with keyboard E2E`

| Slice             | Scope                                       | Proof                           | Rollback / evidence         | Merge prerequisite |
| ----------------- | ------------------------------------------- | ------------------------------- | --------------------------- | ------------------ |
| W2-TIMELINE-01.S1 | Lane virtualization core                    | windowed-render unit tests      | revert slice; unit-test log | none               |
| W2-TIMELINE-01.S2 | Zoom/pan + frame/timecode modes             | timebase unit tests + CT        | revert slice; CT trace      | W2-TIMELINE-01.S1  |
| W2-TIMELINE-01.S3 | Keyframe multi-select + stable move         | keyframe-op unit tests          | revert slice; unit-test log | W2-TIMELINE-01.S2  |
| W2-TIMELINE-01.S4 | Copy/paste across lanes and elements        | clipboard round-trip tests + CT | revert slice; CT trace      | W2-TIMELINE-01.S3  |
| W2-TIMELINE-01.S5 | Markers + work area                         | persistence tests + CT          | revert slice; CT trace      | W2-TIMELINE-01.S4  |
| W2-TIMELINE-01.S6 | Keyboard-only operability                   | keyboard E2E CT (QG-A11Y-01)    | revert slice; CT trace      | W2-TIMELINE-01.S5  |
| W2-TIMELINE-01.S7 | 10k-keyframe performance budget             | perf assertion in CI            | revert slice; perf report   | W2-TIMELINE-01.S6  |
| W2-TIMELINE-01.S8 | De-gate (flag removal) + cross-region sweep | full timeline CT sweep green    | revert slice; CT run        | W2-TIMELINE-01.S7  |

## W2-GRAPH-01 tasks

### T1 — Curve model with temporal/spatial tangents and oracle tests

- Files: `packages/playback/src/curves/tangent-curves.ts` (new), `packages/playback/src/curves/tangent-curves.test.ts` (new), `packages/model/src/animation.ts`
- Interfaces: `TemporalTangent`, `SpatialTangent`, `evaluateValueGraph`, `evaluateSpeedGraph`
- RED: curve oracle tests (known input curves → sampled values within tolerance) fail for value and speed graphs per RFC-02 → GREEN: implement tangent-based curve evaluation shared by editor preview and playback
- Commit: `feat(playback): add tangent curve evaluation per RFC-02`

### T2 — Graph editor UI with easing presets and accessible tangent editing

- Files: `packages/ui/src/timeline/easing-graph-editor.tsx`, `packages/ui/src/timeline/graph-presets.ts` (new), `packages/ui/ct/graph-editor-flow.ct.tsx` (new)
- Interfaces: `EasingPreset`, `GraphEditorMode`
- RED: CTs for preset application and keyboard/numeric tangent editing (accessible alternative per QG-A11Y-01) fail → GREEN: extend the graph editor with value/speed modes, presets, and non-pointer tangent manipulation
- Commit: `feat(ui): add value and speed graph editing with accessible tangents`

### T3 — Motion paths on canvas and playback parity

- Files: `packages/renderer/src/motion-path-overlay.tsx` (new), `packages/editor/src/motion-paths.ts` (new), `packages/editor/src/motion-paths.test.ts` (new)
- Interfaces: `MotionPathHandle`, `separateDimensions`
- RED: parity tests sampling editor preview vs playback for graph-edited animations fail; motion-path drag CT fails → GREEN: render editable motion paths with spatial tangents, support separate dimensions where RFC-02 approved, and lock preview/playback parity
- Commit: `feat(editor): add motion path editing with playback parity`

## W2-COMP-01 tasks

### T1 — Component model per RFC-07 with stable identity and cycle handling

- Files: `packages/model/src/component.ts` (new), `packages/model/src/component.test.ts` (new), `packages/model/src/index.ts`
- Interfaces: `ComponentDefinition`, `ComponentInstance`, `ComponentOverride`, `detectComponentCycles`
- RED: schema validation, stable-identity (collaboration-ready ids survive edits), and cycle-detection property tests fail → GREEN: implement the component data model with deterministic identity and cycle rejection
- Commit: `feat(model): add component definitions, instances, and overrides`

### T2 — Create, instantiate, propagate, override, and unlink operations

- Files: `packages/editor/src/components/component-ops.ts` (new), `packages/editor/src/components/propagation.ts` (new), `packages/editor/src/components/propagation.test.ts` (new)
- Interfaces: `createComponentFromSelection`, `instantiateComponent`, `propagateComponentEdit`, `unlinkInstance`
- RED: nested-propagation correctness tests and a benchmark asserting propagation to 100 instances completes in <100 ms fail → GREEN: implement editor operations with an indexed instance graph so propagation meets the budget
- Commit: `feat(editor): add component operations with fast propagation`

### T3 — Component UI surfaces and CT coverage

- Files: `packages/ui/src/panels/component-panel.tsx` (new), `packages/ui/src/layers-sidebar.tsx`, `packages/ui/ct/component-flow.ct.tsx` (new)
- Interfaces: `ComponentPanelProps`
- RED: cross-region CTs (create component from canvas selection → layers badge + panel exposure; edit definition → all instances update) fail → GREEN: mount component creation, exposed-property editing, override badges, and unlink in shipped UI
- Commit: `feat(ui): add component panel with overrides and unlink`

| Slice         | Scope                                      | Proof                              | Rollback / evidence         | Merge prerequisite |
| ------------- | ------------------------------------------ | ---------------------------------- | --------------------------- | ------------------ |
| W2-COMP-01.S1 | Component model + validation + cycles      | model property tests               | revert slice; unit-test log | none               |
| W2-COMP-01.S2 | Create + instantiate operations            | op unit tests                      | revert slice; unit-test log | W2-COMP-01.S1      |
| W2-COMP-01.S3 | Propagation engine + <100 ms benchmark     | propagation tests + perf assertion | revert slice; perf report   | W2-COMP-01.S2      |
| W2-COMP-01.S4 | Exposed properties + overrides             | override precedence tests          | revert slice; unit-test log | W2-COMP-01.S3      |
| W2-COMP-01.S5 | Unlink + nested/cycle edge cases           | unlink + cycle tests               | revert slice; unit-test log | W2-COMP-01.S4      |
| W2-COMP-01.S6 | Component panel UI                         | panel CT                           | revert slice; CT trace      | W2-COMP-01.S5      |
| W2-COMP-01.S7 | Cross-region CT + stable-identity evidence | full component CT sweep            | revert slice; CT run        | W2-COMP-01.S6      |

## W2-VAR-01 tasks

### T1 — Typed variable and token model with aliases, modes, and cycle detection

- Files: `packages/model/src/variables.ts` (new), `packages/model/src/variables.test.ts` (new), `packages/model/src/index.ts`
- Interfaces: `DocumentVariable`, `VariableMode`, `resolveVariable`, `detectAliasCycles`
- RED: alias-resolution and cycle-detection property tests (deep alias chains, mode fallback) fail → GREEN: implement typed variables/tokens with per-mode values and safe resolution
- Commit: `feat(model): add typed document variables with modes and aliases`

### T2 — Editor resolution, component bindings, and impact preview

- Files: `packages/editor/src/variables/variable-bindings.ts` (new), `packages/editor/src/variables/impact-preview.ts` (new), `packages/editor/src/variables/variable-bindings.test.ts` (new)
- Interfaces: `bindVariableToProperty`, `computeVariableImpact`
- RED: binding tests (variable edit updates bound element and component properties) and impact-preview tests (list of affected elements before commit) fail → GREEN: implement binding resolution in the editor store and an impact-preview computation
- Commit: `feat(editor): bind document variables with impact preview`

### T3 — Variables panel with theme/locale/aspect-mode switching CT

- Files: `packages/ui/src/panels/variables-panel.tsx` (new), `packages/ui/ct/variables-mode-switch.ct.tsx` (new)
- Interfaces: `VariablesPanelProps`
- RED: cross-region CTs switching theme, locale, and aspect mode and asserting canvas + properties panel updates with impact preview fail → GREEN: mount the variables panel with mode switchers and preview affordances
- Commit: `feat(ui): add variables panel with mode switching`

## W2-DATA-01 tasks

### T1 — Typed view-model, schema editing operations, and safe ingestion

- Files: `packages/editor/src/data-store.ts`, `packages/editor/src/data/schema-ops.ts` (new), `packages/editor/src/data/schema-ops.test.ts` (new)
- Interfaces: `DataSchemaEdit`, `validateSampleData`, `StaleDataState`
- RED: schema-edit round-trip tests and hostile-input tests (oversized, malformed, wrongly-typed data rejected without corrupting the project, per QG-SEC-01) fail → GREEN: implement typed schema editing with Zod-validated ingestion and fallback/stale state modeling
- Commit: `feat(editor): add typed data schema editing with safe ingestion`

### T2 — Binding builder with sample and live preview

- Files: `packages/ui/src/panels/binding-builder.tsx` (new), `packages/editor/src/data/live-preview.ts` (new), `packages/ui/ct/data-binding-flow.ct.tsx` (new)
- Interfaces: `BindingBuilderProps`, `LivePreviewSession`
- RED: CTs building a binding from schema field to element property and toggling sample vs live preview fail; stale/fallback indicators missing → GREEN: mount the binding builder with typed field pickers, sample data preview, and live preview with stale/fallback states
- Commit: `feat(ui): add data binding builder with sample and live preview`

### T3 — Lists, repeaters, conditional visibility, and end-to-end flows

- Files: `packages/editor/src/data/repeaters.ts` (new), `packages/editor/src/data/repeaters.test.ts` (new), `packages/ui/ct/scoreboard-lower-third.ct.tsx` (new)
- Interfaces: `RepeaterBinding`, `evaluateVisibleWhen`
- RED: end-to-end scoreboard and lower-third CT flows (schema → bindings → repeater rows → conditional visibility → preview) fail → GREEN: implement list/repeater binding and conditional visibility so both flows pass entirely through shipped UI
- Commit: `feat(editor): add repeaters and conditional visibility bindings`

| Slice         | Scope                                  | Proof                           | Rollback / evidence         | Merge prerequisite |
| ------------- | -------------------------------------- | ------------------------------- | --------------------------- | ------------------ |
| W2-DATA-01.S1 | Typed schema model + edit ops          | schema round-trip tests         | revert slice; unit-test log | none               |
| W2-DATA-01.S2 | Safe ingestion + stale/fallback states | hostile-input tests (QG-SEC-01) | revert slice; unit-test log | W2-DATA-01.S1      |
| W2-DATA-01.S3 | Schema editor UI                       | schema editor CT                | revert slice; CT trace      | W2-DATA-01.S2      |
| W2-DATA-01.S4 | Binding builder                        | binding CT (panel → canvas)     | revert slice; CT trace      | W2-DATA-01.S3      |
| W2-DATA-01.S5 | Sample + live preview                  | preview toggle CT               | revert slice; CT trace      | W2-DATA-01.S4      |
| W2-DATA-01.S6 | Lists/repeaters                        | repeater unit tests + CT        | revert slice; CT trace      | W2-DATA-01.S5      |
| W2-DATA-01.S7 | Conditional visibility                 | visibleWhen tests + CT          | revert slice; CT trace      | W2-DATA-01.S6      |
| W2-DATA-01.S8 | Scoreboard + lower-third E2E flows     | end-to-end CT green             | revert slice; CT run        | W2-DATA-01.S7      |

## W2-TEXT-01 tasks

### T1 — Structured run editing core on the canvas

- Files: `packages/editor/src/inline-text.ts`, `packages/editor/src/text/run-editing.ts` (new), `packages/editor/src/text/run-editing.test.ts` (new)
- Interfaces: `RunEditOperation`, `applyRunEdit`, `TextSelectionRange`
- RED: run-model edit tests (split, merge, style application across run boundaries, caret mapping) fail → GREEN: implement structured TextBody run editing behind the inline canvas editor with exact run identity preservation
- Commit: `feat(editor): add structured text run editing core`

### T2 — Bullets, links, language/direction, IME, and RTL

- Files: `packages/editor/src/text/block-features.ts` (new), `packages/editor/src/text/bidi.ts` (new), `packages/ui/ct/text-multilingual-flow.ct.tsx` (new)
- Interfaces: `BulletStyle`, `LinkRun`, `setRunLanguage`, `setParagraphDirection`
- RED: multilingual CTs (IME composition, RTL paragraph editing, mixed-direction runs, bullets, links) fail → GREEN: implement block-level features and bidi-aware editing with CT coverage for IME and RTL flows
- Commit: `feat(editor): add bullets, links, and bidi text editing`

### T3 — Variable axes, auto-size, font fallback UI, and metrics parity

- Files: `packages/ui/src/panels/typography-advanced.tsx` (new), `packages/editor/src/text/auto-size.ts` (new), `packages/editor/src/text/metrics-parity.test.ts` (new)
- Interfaces: `VariableAxisValue`, `AutoSizeMode`, `FontFallbackReport`
- RED: metrics-parity tests proving renderer and export text metrics are unchanged after editing (QG-COR-03) fail; variable-axis and auto-size CTs fail → GREEN: mount variable font axis controls, auto-size, and font fallback UI without perturbing text metrics
- Commit: `feat(ui): add variable axes, auto-size, and font fallback controls`

| Slice         | Scope                                      | Proof                              | Rollback / evidence         | Merge prerequisite |
| ------------- | ------------------------------------------ | ---------------------------------- | --------------------------- | ------------------ |
| W2-TEXT-01.S1 | Run editing ops (split/merge/style)        | run-model unit tests               | revert slice; unit-test log | none               |
| W2-TEXT-01.S2 | Inline canvas editor on run model          | caret/selection CT                 | revert slice; CT trace      | W2-TEXT-01.S1      |
| W2-TEXT-01.S3 | Bullets + links                            | block-feature tests + CT           | revert slice; CT trace      | W2-TEXT-01.S2      |
| W2-TEXT-01.S4 | Language/direction + RTL + IME             | multilingual CT suite              | revert slice; CT trace      | W2-TEXT-01.S3      |
| W2-TEXT-01.S5 | Variable font axes UI                      | axis control CT                    | revert slice; CT trace      | W2-TEXT-01.S2      |
| W2-TEXT-01.S6 | Auto-size                                  | auto-size unit tests + CT          | revert slice; CT trace      | W2-TEXT-01.S5      |
| W2-TEXT-01.S7 | Font fallback UI                           | fallback report CT                 | revert slice; CT trace      | W2-TEXT-01.S6      |
| W2-TEXT-01.S8 | Metrics parity gate (QG-COR-03) + CT sweep | parity tests + full CT sweep green | revert slice; parity report | W2-TEXT-01.S7      |

## W2-AUDIO-01 tasks

### T1 — Audio track/cue model and sample-clock conversion (RFC-14)

- Files: `packages/model/src/audio.ts` (new), `packages/model/src/audio.test.ts` (new), `packages/playback/src/audio-clock.ts` (new), `packages/playback/src/audio-clock.test.ts` (new)
- Interfaces: `AudioTrack`, `AudioCue`, `sampleToTimelineTime`, `timelineTimeToSample`
- RED: sample-clock conversion property tests (round-trip at 44.1/48/96 kHz across long durations without drift) fail → GREEN: implement the ratified RFC-14 track/cue schema and exact sample-clock math
- Commit: `feat(model): add audio tracks and sample-clock conversion`

### T2 — Waveform cache, timeline lanes, and scrub/solo/mute

- Files: `packages/editor/src/audio/waveform-cache.ts` (new), `packages/ui/src/timeline/audio-lanes.tsx` (new), `packages/editor/src/audio/scrub.ts` (new), `packages/editor/src/audio/waveform-cache.test.ts` (new)
- Interfaces: `WaveformCache`, `ScrubSession`, `setTrackSolo`, `setTrackMute`
- RED: waveform cache tests (peak accuracy at multiple zoom levels, cache invalidation on asset replace) and seek/scrub tests fail → GREEN: implement multi-resolution waveform caching, timeline waveform rendering, and scrub/solo/mute with accessible controls
- Commit: `feat(ui): add waveform lanes with scrub, solo, and mute`

### T3 — A/V sync, offline alignment, and missing-codec handling

- Files: `packages/playback/src/av-sync.test.ts` (new), `packages/editor/src/audio/codec-fallback.ts` (new), `packages/ui/ct/audio-scrub-flow.ct.tsx` (new)
- Interfaces: `MissingCodecReport`
- RED: long-duration A/V sync tests, offline frame/audio alignment verification (QG-REL-01), and missing-codec fallback tests fail → GREEN: lock deterministic alignment between rendered frames and audio samples and surface actionable missing-codec warnings
- Commit: `test(playback): verify long-duration A/V sync and codec fallback`

| Slice          | Scope                                    | Proof                          | Rollback / evidence         | Merge prerequisite |
| -------------- | ---------------------------------------- | ------------------------------ | --------------------------- | ------------------ |
| W2-AUDIO-01.S1 | Track/cue model + sample-clock math      | conversion property tests      | revert slice; unit-test log | none               |
| W2-AUDIO-01.S2 | Audio decode + waveform cache            | peak-accuracy tests            | revert slice; unit-test log | W2-AUDIO-01.S1     |
| W2-AUDIO-01.S3 | Timeline waveform lanes                  | lane render CT                 | revert slice; CT trace      | W2-AUDIO-01.S2     |
| W2-AUDIO-01.S4 | Scrub engine + seek                      | seek/scrub tests + CT          | revert slice; CT trace      | W2-AUDIO-01.S3     |
| W2-AUDIO-01.S5 | Solo/mute + markers                      | state tests + CT               | revert slice; CT trace      | W2-AUDIO-01.S4     |
| W2-AUDIO-01.S6 | Accessible audio controls                | keyboard/AT CT (QG-A11Y-01)    | revert slice; CT trace      | W2-AUDIO-01.S5     |
| W2-AUDIO-01.S7 | A/V sync + offline alignment (QG-REL-01) | long-duration sync tests       | revert slice; sync report   | W2-AUDIO-01.S6     |
| W2-AUDIO-01.S8 | Missing-codec handling + CT sweep        | fallback tests + full CT sweep | revert slice; CT run        | W2-AUDIO-01.S7     |

## W2-STYLE-01 tasks

### T1 — Theme swatches, gradients, and picture/pattern fills mounted

- Files: `packages/ui/src/inputs/gradient-editor.tsx`, `packages/ui/src/inputs/swatch-picker.tsx` (new), `packages/ui/src/inputs/pattern-fill-editor.tsx` (new), `packages/ui/ct/fill-controls-flow.ct.tsx` (new)
- Interfaces: `SwatchPickerProps`, `PatternFillEditorProps`
- RED: cross-region CTs (edit gradient/pattern/picture fill in panel → canvas fill updates) fail for unmounted controls → GREEN: mount theme swatch, gradient, and picture/pattern fill controls in the properties panel bound to the editor store
- Commit: `feat(ui): mount swatch, gradient, and pattern fill controls`

### T2 — FilterStack, effect stack, stroke ends, and clip path controls

- Files: `packages/ui/src/inputs/filter-editor.tsx`, `packages/ui/src/inputs/effect-stack-editor.tsx` (new), `packages/ui/src/inputs/stroke-ends-editor.tsx` (new), `packages/model/src/filter-stack.ts`, `packages/ui/ct/effect-controls-flow.ct.tsx` (new)
- Interfaces: `EffectStackEditorProps`, `StrokeEndsValue`
- RED: CTs for filter-stack reordering, effect add/remove, stroke end caps/markers, and clip-path editing reflected on canvas fail → GREEN: mount the FilterStack and effect stack editors with ordering, stroke ends, and clip-path controls
- Commit: `feat(ui): mount filter stack, effect, stroke, and clip controls`

### T3 — 3D inputs and UI.1–UI.10 closure sweep

- Files: `packages/ui/src/inputs/transform-3d-inputs.tsx` (new), `packages/ui/ct/style-controls-closure.ct.tsx` (new)
- Interfaces: `Transform3DInputsProps`
- RED: 3D transform input CTs and the UI.1–UI.10 closure sweep (every mounted control has CT coverage) report gaps → GREEN: mount 3D inputs and close every UI.1–UI.10 row with CT evidence
- Commit: `feat(ui): add 3d transform inputs and close style control gaps`

| Slice          | Scope                       | Proof                        | Rollback / evidence    | Merge prerequisite |
| -------------- | --------------------------- | ---------------------------- | ---------------------- | ------------------ |
| W2-STYLE-01.S1 | Theme swatches              | swatch CT                    | revert slice; CT trace | none               |
| W2-STYLE-01.S2 | Gradient controls mounted   | gradient CT (panel → canvas) | revert slice; CT trace | W2-STYLE-01.S1     |
| W2-STYLE-01.S3 | Picture/pattern fills       | pattern fill CT              | revert slice; CT trace | W2-STYLE-01.S2     |
| W2-STYLE-01.S4 | FilterStack editor mounted  | filter reorder CT            | revert slice; CT trace | W2-STYLE-01.S3     |
| W2-STYLE-01.S5 | Stroke ends + clip path     | stroke/clip CT               | revert slice; CT trace | W2-STYLE-01.S4     |
| W2-STYLE-01.S6 | 3D transform inputs         | 3D input CT                  | revert slice; CT trace | W2-STYLE-01.S5     |
| W2-STYLE-01.S7 | Effect stack ordering UI    | effect stack CT              | revert slice; CT trace | W2-STYLE-01.S6     |
| W2-STYLE-01.S8 | UI.1–UI.10 closure CT sweep | closure sweep green          | revert slice; CT run   | W2-STYLE-01.S7     |

## W2-DOC-01 tasks

### T1 — Document setup: canvas/profile settings, unit-aware fields, metadata, notes

- Files: `packages/ui/src/modals/document-setup.tsx` (new), `packages/editor/src/document-settings.ts` (new), `packages/editor/src/document-settings.test.ts` (new)
- Interfaces: `DocumentSetupProps`, `updateDocumentSettings`
- RED: unit-aware field tests (px/mm/in entry with dpi-correct conversion) and settings round-trip tests fail → GREEN: implement the document setup modal covering canvas, color profile, metadata/output intent, and notes with unit-aware inputs
- Commit: `feat(ui): add document setup modal with unit-aware fields`

### T2 — Actionable preflight and UI.11–UI.15 closure

- Files: `packages/ui/src/modals/format-preflight.tsx`, `packages/editor/src/editing.ts`, `packages/ui/ct/document-preflight-flow.ct.tsx` (new)
- Interfaces: `PreflightAction`, `applyPreflightFix`
- RED: CTs where a preflight warning offers an actionable fix (relink, convert, resize) that resolves the finding fail; UI.11–UI.15 closure sweep reports gaps → GREEN: extend preflight with actionable fixes and close UI.11–UI.15 with unit/profile/preflight CT coverage
- Commit: `feat(ui): add actionable preflight fixes and close doc setup gaps`

## W2-ASSET-01 tasks

### T1 — Virtualized library grid with search, tags, and 10k-asset budget

- Files: `packages/ui/src/panels/asset-library.tsx` (new), `packages/editor/src/assets/asset-index.ts` (new), `packages/editor/src/assets/asset-index.test.ts` (new)
- Interfaces: `AssetLibraryProps`, `AssetSearchQuery`, `AssetTag`
- RED: virtualization and search-index tests at 10k assets exceed the performance budget → GREEN: implement windowed grid rendering with an indexed search/tag store meeting the budget
- Commit: `feat(ui): add virtualized asset library with search and tags`

### T2 — Relink, replace-everywhere, and viewport proxies

- Files: `packages/editor/src/assets/relink.ts` (new), `packages/editor/src/assets/relink.test.ts` (new), `packages/renderer/src/asset-proxy.tsx` (new)
- Interfaces: `relinkAsset`, `replaceAssetEverywhere`, `ProxyResolution`
- RED: relink/replace-everywhere tests (all references updated, undo restores) and proxy-resolution tests (viewport-appropriate variants) fail → GREEN: implement relink and replace-everywhere as undoable commands plus viewport proxy selection
- Commit: `feat(editor): add asset relink and replace-everywhere`

### T3 — Font/license warnings and missing-asset/offline workflows

- Files: `packages/ui/src/panels/asset-warnings.tsx` (new), `packages/ui/ct/asset-library-flow.ct.tsx` (new)
- Interfaces: `AssetWarning`
- RED: CTs for missing-asset indication, relink flow from a warning, and offline library behavior fail → GREEN: surface font/license and missing-asset warnings with guided relink, covered end to end
- Commit: `feat(ui): add asset warnings with guided relink workflows`

## W2-A11Y-01 tasks

### T1 — Accessibility infrastructure: announcements, focus restoration, semantic scene

- Files: `packages/ui/src/a11y/announcer.ts` (new), `packages/ui/src/a11y/focus-restoration.ts` (new), `packages/renderer/src/semantic-scene.tsx` (new), `packages/ui/src/a11y/announcer.test.ts` (new)
- Interfaces: `announce`, `FocusRestorationScope`, `SemanticSceneNode`
- RED: tests for announcement queuing, focus restoration after modal/panel close, and a semantic canvas/layers relationship (AT tree mirrors layers panel) fail → GREEN: build the shared announcer, focus-restoration scopes, and semantic scene tree used by every surface
- Commit: `feat(ui): add announcer, focus restoration, and semantic scene`

### T2 — Drag alternatives, target/focus mechanics, and forced colors across W2 surfaces

- Files: `packages/ui/src/a11y/drag-alternatives.ts` (new), `packages/ui/src/a11y/forced-colors.css` (new), `packages/ui/ct/a11y-drag-alternatives.ct.tsx` (new)
- Interfaces: `DragAlternativeActions`
- RED: keyboard/AT alternative CTs for every drag interaction (canvas transform, path handles, graph tangents, timeline keyframes, audio scrub, asset drop) and forced-colors rendering checks fail → GREEN: implement structured drag alternatives, target-size and focus mechanics, and forced-colors support on all W2 authoring surfaces
- Commit: `feat(ui): add drag alternatives and forced-colors support`

### T3 — axe zero, modal audit closure, and AT blocker resolution

- Files: `packages/ui/ct/a11y-axe-sweep.ct.tsx` (new), `packages/ui/src/modals/` (fixes across existing modals), `project/implementation/at-session-log.md` (new)
- Interfaces: none
- RED: axe sweep across all shipped editor surfaces reports violations; logged VoiceOver/NVDA blockers remain open; modal audit items unresolved → GREEN: fix every violation and blocker until axe reports zero and the modal audit closes; track manual AT signoff at the wave external evidence gate (QG-A11Y-01)
- Commit: `fix(ui): resolve axe violations and assistive-technology blockers`

| Slice          | Scope                                        | Proof                        | Rollback / evidence         | Merge prerequisite |
| -------------- | -------------------------------------------- | ---------------------------- | --------------------------- | ------------------ |
| W2-A11Y-01.S1  | Announcer + focus-restoration infrastructure | infra unit tests             | revert slice; unit-test log | none               |
| W2-A11Y-01.S2  | Semantic canvas/layers scene tree            | AT-tree CT                   | revert slice; CT trace      | W2-A11Y-01.S1      |
| W2-A11Y-01.S3  | Focus restoration across modals and panels   | focus CT                     | revert slice; CT trace      | W2-A11Y-01.S2      |
| W2-A11Y-01.S4  | Canvas transform drag alternatives           | keyboard transform CT        | revert slice; CT trace      | W2-A11Y-01.S3      |
| W2-A11Y-01.S5  | Timeline + graph drag alternatives           | keyboard keyframe/tangent CT | revert slice; CT trace      | W2-A11Y-01.S4      |
| W2-A11Y-01.S6  | Path authoring keyboard/AT completeness      | pen keyboard CT              | revert slice; CT trace      | W2-A11Y-01.S5      |
| W2-A11Y-01.S7  | Data/variables surface accessibility         | binding/variables AT CT      | revert slice; CT trace      | W2-A11Y-01.S6      |
| W2-A11Y-01.S8  | Text editing AT (SR + IME interplay)         | text AT CT                   | revert slice; CT trace      | W2-A11Y-01.S7      |
| W2-A11Y-01.S9  | Audio controls accessibility                 | audio AT CT                  | revert slice; CT trace      | W2-A11Y-01.S8      |
| W2-A11Y-01.S10 | Document setup + asset library accessibility | doc/asset AT CT              | revert slice; CT trace      | W2-A11Y-01.S9      |
| W2-A11Y-01.S11 | Forced colors + high-contrast rendering      | forced-colors CT             | revert slice; CT trace      | W2-A11Y-01.S10     |
| W2-A11Y-01.S12 | Modal accessibility audit closure            | modal audit checklist green  | revert slice; audit log     | W2-A11Y-01.S11     |
| W2-A11Y-01.S13 | axe zero sweep + AT session preparation      | axe sweep zero violations    | revert slice; axe report    | W2-A11Y-01.S12     |

## W2-UX-01 tasks

### T1 — Command palette and shortcut discovery/editor on the registry

- Files: `packages/ui/src/palette/command-palette.tsx` (new), `packages/ui/src/palette/shortcut-editor.tsx` (new), `packages/ui/ct/command-palette-flow.ct.tsx` (new)
- Interfaces: `CommandPaletteProps`, `ShortcutEditorProps`
- RED: CTs for palette open → fuzzy search → execute registered command, shortcut discovery overlay, and shortcut reassignment with conflict warnings fail → GREEN: build palette and shortcut editor entirely on W2-CMD-01's registry, including conflict UI
- Commit: `feat(ui): add command palette and shortcut editor`

### T2 — Contextual inspector, empty states, and progress/cancel feedback

- Files: `packages/ui/src/panels.tsx`, `packages/ui/src/feedback/progress-feedback.tsx` (new), `packages/ui/src/feedback/empty-states.tsx` (new), `packages/ui/ct/workflow-feedback.ct.tsx` (new)
- Interfaces: `ProgressFeedbackProps`, `EmptyStateProps`
- RED: feedback-latency assertions (user actions show visible feedback within ≤100 ms) and CTs for contextual inspector switching, empty states, and cancellable long operations fail → GREEN: implement contextual inspector behavior, designed empty states, and progress/cancel affordances meeting the latency budget
- Commit: `feat(ui): add contextual inspector and progress feedback`

### T3 — Light/dark/high-contrast themes and benchmark E2E

- Files: `packages/ui/src/tokens.ts`, `packages/ui/src/themes/theme-definitions.ts` (new), `packages/ui/ct/benchmark-tasks.ct.tsx` (new)
- Interfaces: `EditorTheme`
- RED: theme-switch CTs (all three themes render every W2 surface without contrast regressions) and the W0-UX-01 benchmark task E2E suite fail → GREEN: ship the three themes via design tokens and run the benchmark tasks end to end in shipped UI; improvement is measured at the wave external evidence gate
- Commit: `feat(ui): add light, dark, and high-contrast themes`

| Slice       | Scope                                   | Proof                             | Rollback / evidence          | Merge prerequisite |
| ----------- | --------------------------------------- | --------------------------------- | ---------------------------- | ------------------ |
| W2-UX-01.S1 | Command palette shell + execution       | palette CT                        | revert slice; CT trace       | none               |
| W2-UX-01.S2 | Fuzzy search + recents/ranking          | search unit tests + CT            | revert slice; CT trace       | W2-UX-01.S1        |
| W2-UX-01.S3 | Shortcut discovery overlay              | discovery CT                      | revert slice; CT trace       | W2-UX-01.S2        |
| W2-UX-01.S4 | Shortcut editor with conflict UI        | reassignment CT                   | revert slice; CT trace       | W2-UX-01.S3        |
| W2-UX-01.S5 | Contextual inspector                    | inspector-switch CT               | revert slice; CT trace       | W2-UX-01.S4        |
| W2-UX-01.S6 | Empty states + progress/cancel feedback | latency assertions (≤100 ms) + CT | revert slice; latency report | W2-UX-01.S5        |
| W2-UX-01.S7 | Light/dark/high-contrast themes         | theme CT across surfaces          | revert slice; CT trace       | W2-UX-01.S6        |
| W2-UX-01.S8 | Benchmark task E2E suite                | benchmark E2E green               | revert slice; benchmark log  | W2-UX-01.S7        |

## W2-QE-01 tasks

### T1 — Generated cross-region coverage with zero missing shipped rows

- Files: `scripts/generate-cross-region-inventory.mjs` (new), `project/implementation/cross-region-ct-inventory.md`, `scripts/generate-cross-region-inventory.test.mjs` (new)
- Interfaces: none
- RED: the generated inventory diff against shipped W2 scenarios reports missing B.5/B.6 cross-region rows → GREEN: derive the inventory from spec GIVEN/WHEN/THEN blocks and add the missing CTs until zero rows are unaccounted for
- Commit: `test(ct): generate cross-region coverage with zero missing rows`

### T2 — Property tests, visual CT, and performance assertions closing D.3/F-20

- Files: `packages/editor/src/authoring-properties.test.ts` (new), `packages/ui/ct/visual-regression-sweep.ct.tsx` (new), `packages/ui/src/timeline/performance.test.tsx` (new)
- Interfaces: none
- RED: property-test suites for authoring math/state (geometry, curves, propagation, variables) and visual CT baselines are absent; D.3/F-20 report open rows → GREEN: land the property suites, visual CT baselines, and performance assertions so D.3 and F-20 close with zero missing shipped rows
- Commit: `test(editor): add authoring property tests and visual CT sweep`
