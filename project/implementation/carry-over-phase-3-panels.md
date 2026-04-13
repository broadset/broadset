## Panel Pass - Properties, Layers, Animations

This section compares panel implementations specifically and lists what is better/more thorough in the original.

### Properties Panel - Better In Original

1. Animation-mode property editing is fully integrated in the sidebar flow.

- Original `PropertiesSidebar` switches into animation mode when a timeline keyframe is selected and wraps normal property panels in `PropertyEditingProvider` (`../dom-compositor/packages/heroui/src/PropertiesSidebar.tsx`, lines ~290-320).
- Current code has `AnimationModePropertiesPanel` + adapter primitives in `packages/ui/src/property-panels.tsx` (lines ~1148+), but `packages/ui/src/properties-sidebar.tsx` does not wire them into a keyframe-driven editing mode.
- Carry-over: port the original animation-mode orchestration into current `PropertiesSidebar` so include/remove property toggles and keyframe-scoped values are actually active during timeline editing.

2. Path editing controls are more complete and editor-integrated.

- Original path panel includes explicit Draw/Edit toggles bound to store actions (`startPathDrawing`, `stopPathDrawing`, `startPathEditing`, `stopPathEditing`) in `../dom-compositor/packages/heroui/src/PathPropertiesPanel.tsx`.
- Current path panel surface is present, but the old path workflow is more tightly coupled to editor state transitions and property adapters.
- Carry-over: align current path panel behavior with the original toggled editing lifecycle and animation-aware property adapters.

3. Property-to-animation coupling is richer in original.

- Original `AnimationModePropertiesPanel` supports keyframe action metadata updates (setState/addModifier/removeModifier), keyframe removal, and custom CSS property channels from the same property-side context (`../dom-compositor/packages/heroui/src/AnimationModePropertiesPanel.tsx`).
- Current animation-mode component exists but is not connected to the main properties sidebar workflow.
- Carry-over: integrate keyframe action/payload editing and custom property channels into current property flow.

4. Panel-level automated test coverage is more granular in original.

- Original has dedicated tests for `PropertiesSidebar`, `PropertyField`, `PathPropertiesPanel`-related behavior through component-level files (`PropertiesSidebar.test.tsx`, `PropertyField.test.tsx`, etc.).
- Current UI has fewer broad tests (`panels.test.tsx`, `timeline.test.tsx`) and less per-panel isolation.
- Carry-over: split panel tests by component responsibility (properties core, animation mode, path controls, adapter inclusion behavior).

### Layers Panel - Better In Original

1. Hierarchical drag-and-drop behavior is more robust.

- Original `LayersSidebar` supports subtree-safe DnD with explicit before/inside/after drop zones, descendant guardrails, parent resolution, and order replay (`../dom-compositor/packages/heroui/src/LayersSidebar.tsx`).
- Current layers panel supports DnD and drop positions, but original behavior is more comprehensive for nested tree semantics and drag state handling.
- Carry-over: adopt original subtree/ancestor validation and reorder replay semantics as the reference behavior.

2. Selection behavior is more advanced.

- Original supports range selection + additive selection patterns in layer tree with explicit last-selected tracking (`../dom-compositor/packages/heroui/src/LayersSidebar.tsx`).
- Current panel supports single/toggle/range callback modes, but host-side semantics are simpler and less deeply integrated.
- Carry-over: ensure full range/toggle behavior parity including hierarchical context and visual order mapping.

3. Layer row UX is more thorough.

- Original row implementation includes dedicated quick toggles, stronger drag affordance behavior, drop visualization, and hierarchy guides tuned for nested groups.
- Current implementation is functional but comparatively lighter in nested hierarchy guidance and advanced drag UX details.
- Carry-over: port original row-level hierarchy visuals and drop feedback behavior.

4. Dedicated layers tests are stronger in original.

- Original has `LayersSidebar.test.tsx` focused on panel behavior.
- Current coverage is mostly consolidated under `panels.test.tsx`.
- Carry-over: add dedicated `layers-sidebar.test.tsx` coverage for nested DnD, descendant rejection, and range selection interactions.

### Animations Panel - Better In Original

1. Animation sidebar is store-integrated rather than callback shell.

- Original `AnimationSidebar` renders `AnimationBuilder`, which directly uses store actions (`setElementState`, `toggleModifier`, `upsertTimeline`, `removeTimeline`, binding actions) in `../dom-compositor/packages/heroui/src/AnimationBuilder.tsx`.
- Current `packages/ui/src/animation-sidebar.tsx` is a callback-only shell; current demo still leaves many handlers unwired.
- Carry-over: provide an integrated animation sidebar variant (or hook) that owns timeline/binding operations directly against editor store.

2. Timeline creation workflows are much richer in original.

- Original has quick setup (auto enter/exit timelines + bindings), starter presets, custom timeline creation, timeline open/close/edit/remove flows (`../dom-compositor/packages/heroui/src/AnimationBuilder.tsx`).
- Current animation sidebar offers buttons for these actions but relies on host callbacks and currently does not deliver the same end-to-end behavior.
- Carry-over: port quick setup + preset generation logic and timeline CRUD wiring.

3. State/modifier binding management is more complete.

- Original includes ordered state bindings, reordering support (`reorderStateTimelineBindings`), in/out modifier timeline assignment, and guided creation forms (`../dom-compositor/packages/heroui/src/AnimationBindingSections.tsx`).
- Current sections are present but simpler and less integrated.
- Carry-over: add ordering controls and richer binding forms (including reverse/out timeline semantics) to current UI.

4. Timeline panel/editor integration is deeper in original.

- Original `TimelineBottomPanel` resolves current editing target from context and mounts a store-backed `TimelineEditor` with play/seek/stop wiring and loop controls (`../dom-compositor/packages/heroui/src/TimelineBottomPanel.tsx`, `TimelineEditor.tsx`).
- Current timeline module has capable UI parts, but integration currently depends on host wiring that is incomplete in demo.
- Carry-over: align with original pattern where timeline UI is tightly bound to editing context/store to reduce glue-code failure points.

5. Animation panel testing breadth is better in original.

- Original has dedicated tests for `AnimationBuilder`, `AnimationSidebar`, `TimelineEditor`, `TimelineBottomPanel`, and editing context.
- Current has broad `timeline.test.tsx` and shared panel tests, but fewer dedicated animation-panel files.
- Carry-over: add targeted tests for sidebar timeline CRUD, quick setup presets, binding reorder, and timeline editor transport integration.

## Panel Carry-Over Priority

1. Integrate animation-mode property editing into `PropertiesSidebar` (adapter + keyframe context).
2. Replace callback-only animation sidebar usage with store-integrated flows (or provide integrated adapter hook used by demo).
3. Port original quick setup/preset timeline authoring logic and binding management UX.
4. Tighten layers subtree DnD semantics and hierarchical selection behavior.
5. Expand panel-specific tests: dedicated files for properties, layers, animation builder/sidebar/timeline integration.
