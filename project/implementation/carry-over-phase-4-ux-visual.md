## UX/UI Design Pass - Better In Previous Version (and Why)

This pass focuses on interaction design, information architecture, and perceived usability differences.

### 1) Animation timeline workflow is clearer and more trustworthy in the previous version

- Previous timeline panel is wired to real playback controls (`onPlayTimeline`, `onSeekTimeline`, `onStopTimeline`) and opens in-context via timeline editing state (`../dom-compositor/packages/demo/src/main.tsx`, `TimelineBottomPanel` usage).
- Current timeline panel opens, but key editing actions still show "not yet wired" toasts (`packages/demo/src/DemoApp.tsx`, lines ~2583-2611).
- Why previous is better: users can complete the full timeline loop (edit -> preview -> iterate) without dead-end interactions, which strongly improves UX confidence.
- Carry-over: complete timeline action wiring and remove placeholder toasts from primary authoring paths.

### 2) Visual interaction density is better balanced in the previous version

- Previous shell distributes controls across distinct zones (top toolbar, left element rail, right panel rail, bottom-left utility cluster, bottom timeline), each with a narrow responsibility (`../dom-compositor/packages/demo/src/main.tsx`).
- Current shell has richer functionality but a denser top region (stacked floating bars, large mixed-control toolbar groups) in `packages/demo/src/DemoApp.tsx`.
- Why previous is better: clearer zoning lowers cognitive load and helps users build a stable mental map of "where to go" for each task.
- Carry-over: reduce top-toolbar density in current demo by moving lower-frequency actions into anchored secondary regions.

### 3) Sidebar ergonomics are more explicit in the previous version

- Previous right drawer has stronger motion/affordance cues via dedicated classes, resize affordances, and tab-state styling (`../dom-compositor/packages/demo/src/heroui-theme.css` drawer + tab styles).
- Current sidebar works and is resizable, but visual state communication is spread between floating icon toolbar and separate panel container (`packages/demo/src/DemoApp.tsx`), with less explicit in-panel tab context.
- Why previous is better: clearer active-state and drawer affordance signals make panel transitions feel more intentional and reduce orientation loss.
- Carry-over: strengthen active tab context inside the panel surface itself (header + active label + keyboard hints), not only in floating icon rail.

### 4) Help/onboarding affordances are more direct in the previous version

- Previous puts shortcuts/about in always-visible bottom-left utility controls (`../dom-compositor/packages/demo/src/main.tsx`).
- Current places these under a top "Help" dropdown (`packages/demo/src/DemoApp.tsx`).
- Why previous is better: one-click discoverability for onboarding/help lowers friction for first-time users and QA flows.
- Carry-over: keep Help dropdown, but restore a lightweight persistent shortcut/help affordance in canvas chrome.

### 5) Export UX in previous version better supports user intent before commit

- Previous export modal includes practical output controls (pixel ratio, JPEG quality, custom FPS, bitrate, progress feedback) in `../dom-compositor/packages/heroui/src/ExportModal.tsx`.
- Current export modal in `packages/ui/src/modals.tsx` is simpler and easier, but lacks advanced controls for production-ready output tuning.
- Why previous is better: advanced options reduce failed export iterations and allow users to match output constraints without leaving the app.
- Carry-over: add an "Advanced" section in current export flow with contextual defaults and progress indicators.

### 6) Information architecture for high-frequency edits is stronger in previous timeline/property integration

- Previous properties, animation sidebar, and timeline panel are tightly integrated around editing context.
- Current has capable components, but some high-frequency flows remain split across callback shells and partial wiring.
- Why previous is better: fewer context jumps and fewer integration gaps create a smoother "edit-inspect-preview" cycle.
- Carry-over: treat properties/layers/animations + timeline as one continuous authoring surface, not independent islands.

## UX/UI Carry-Over Priority

1. Make timeline interactions fully actionable (no placeholder actions in core editing path).
2. Restore persistent page/scene strip for quick navigation.
3. Rebalance control density by moving low-frequency actions out of top toolbar.
4. Improve right-sidebar context cues (in-panel active tab labeling + stronger affordances).
5. Add advanced export controls behind an expandable section.

## Color & Pure Visuals Pass - Subjective Artistic Preference

This section captures what is likely to feel better to artistic human users in the previous version, based on visual language and composition.

### 1) Previous version has a more cohesive visual voice

- Previous demo consistently applies one floating-glass panel language across top, side, and bottom chrome (`../dom-compositor/packages/demo/src/main.tsx`, `../dom-compositor/packages/demo/src/heroui-theme.css`).
- Current demo uses similar ingredients, but visual treatment is split between inline style clusters and multiple overlay groups (`packages/demo/src/DemoApp.tsx`, `packages/ui/src/tokens.ts`).
- Why it feels better: artistic users tend to notice stylistic continuity immediately; unified chrome feels intentional and premium.

### 2) Previous version has clearer tonal separation between planes

- Previous token semantics emphasize role-based layering (`layer`, `layer-selected`, `layer-accent`, `border-subtle`) in `../dom-compositor/packages/heroui/src/tokens.ts`.
- Current tokens are valid but more implementation-oriented and often used in denser mixed contexts (`foreground`, `surface`, `surface-secondary`, `glass-bg`) in `packages/ui/src/tokens.ts`.
- Why it feels better: stronger plane separation improves scanability and makes canvas content feel foregrounded rather than competing with chrome.

### 3) Previous version uses calmer visual rhythm around the canvas

- Previous shell distributes controls into cleaner corner zones (top controls, right panel rail, bottom utility/timeline) with less central crowding.
- Current shell has richer functionality but denser top-region control grouping.
- Why it feels better: reduced clustering gives a quieter, composition-first workspace that better supports visual focus and creative flow.

### 4) Previous version communicates affordances with subtler, more coherent micro-contrast

- Previous drawer and tab states rely on restrained contrast shifts and consistent transition timing in CSS (`../dom-compositor/packages/demo/src/heroui-theme.css`).
- Current also has transitions, but visual cues are spread across separate floating rails and panel shells.
- Why it feels better: subtle-but-clear affordance language avoids both flat ambiguity and over-signaled noise.

### 5) Previous version presents a stronger “editor identity” aesthetic

- Previous styling forms a distinct editorial/broadcast-tool feel through consistent dark surfaces, muted neutrals, and controlled accent use.
- Current visual system is functional, but the identity feels more utilitarian due to mixed density and uneven emphasis.
- Why it feels better: artistic users often value tools that feel opinionated and crafted, not merely operational.

### 6) Previous version likely reduces visual fatigue over long sessions

- Previous tone hierarchy and spacing rhythm produce fewer simultaneous attention hotspots.
- Current interface can create more competing focal points at once (toolbar groups + floating rails + panels).
- Why it feels better: lower visual competition can reduce fatigue and improve sustained creative decision-making.

## Visual Carry-Over Priority

1. Define one canonical chrome language (surface opacity, border weight, blur, radius, shadow) and apply it consistently.
2. Strengthen plane hierarchy tokens (base/raised/active/overlay) with explicit usage rules.
3. Reduce top-region control density; preserve more negative space around the canvas focal area.
4. Harmonize active/hover/selected states across rails, tabs, and drawers.
5. Add a visual QA checklist (contrast hierarchy, spacing rhythm, accent restraint, panel consistency) for demo shell reviews.

## Visual Implementation Checklist (File-Mapped)

Use this as an execution checklist for the current demo shell.

### A) Canonical Chrome Language

- Files:
  - `packages/ui/src/tokens.ts`
  - `packages/demo/src/index.css`
  - `packages/demo/src/DemoApp.tsx`
- Components/surfaces:
  - `glassPanelStyle` tokenized chrome values in UI package.
  - Top toolbar, element rail, sidebar rail, right sidebar container, timeline bottom panel.
- Tasks:
  1. Define a single set of shell tokens for panel surface, border, radius, blur, and shadow.
  2. Replace ad-hoc inline panel visual values in `DemoApp.tsx` with shared token-driven styles.
  3. Keep one motion profile for panel reveal/hide transitions.
- Acceptance checks:
  1. All floating chrome surfaces use the same baseline surface recipe.
  2. No duplicate hard-coded shadow/blur values remain in demo shell containers.

### B) Plane Hierarchy and Contrast Ladder

- Files:
  - `packages/ui/src/tokens.ts`
  - `packages/demo/src/DemoApp.tsx`
  - `packages/ui/src/panels.tsx`
  - `packages/ui/src/properties-sidebar.tsx`
  - `packages/ui/src/layers-sidebar.tsx`
  - `packages/ui/src/animation-sidebar.tsx`
- Components/surfaces:
  - Base canvas surround, inactive panel surfaces, active panel surfaces, selected row states, focus states.
- Tasks:
  1. Introduce explicit semantic tokens for plane levels (base, raised, active, overlay).
  2. Map selection and hover states in panel rows to one consistent contrast scale.
  3. Ensure focus outlines use one accent token and stroke weight.
- Acceptance checks:
  1. Selected/hover/focus states are visually consistent across layers/properties/animation panels.
  2. Panel background elevation is readable without overpowering canvas content.

### C) Toolbar Density Rebalance

- Files:
  - `packages/demo/src/DemoApp.tsx`
  - `packages/demo/src/demo-components.tsx`
- Components/surfaces:
  - Main toolbar action clusters, right rail shortcuts, help/scenes entry points.
- Tasks:
  1. Move low-frequency actions from top toolbar into secondary anchored surfaces.
  2. Keep high-frequency controls (undo/redo/play/zoom/selection actions) in primary line of sight.
  3. Preserve whitespace intervals between action clusters to avoid a single dense block.
- Acceptance checks:
  1. Primary toolbar scan path is shorter and visually grouped by task category.
  2. Canvas retains larger uninterrupted negative space near top-center.

### D) Sidebar Context Clarity

- Files:
  - `packages/demo/src/DemoApp.tsx`
  - `packages/ui/src/panels.tsx`
  - `packages/ui/src/properties-sidebar.tsx`
  - `packages/ui/src/layers-sidebar.tsx`
  - `packages/ui/src/animation-sidebar.tsx`
- Components/surfaces:
  - Floating sidebar icon rail and right-side panel body.
- Tasks:
  1. Add explicit in-panel active context header (current tab name + icon).
  2. Unify tab active styling language between icon rail and panel interior.
  3. Increase resize-handle affordance clarity with consistent handle visuals.
- Acceptance checks:
  1. Users can identify active panel context from inside panel body without checking outer rail.
  2. Tab switch state changes are obvious at a glance.

### E) Page/Scene and Help Discoverability

- Files:
  - `packages/demo/src/DemoApp.tsx`
  - `packages/ui/src/toolbar-nav.tsx`
- Components/surfaces:
  - Scenes menu, help access, optional persistent utility strip.
- Tasks:
  1. Add a persistent compact scene/page strip or switcher surface in canvas chrome.
  2. Add persistent one-click shortcut/help affordance while retaining menu access.
  3. Keep scene operations (switch/add/remove) available from both persistent and menu paths.
- Acceptance checks:
  1. Page switching does not require opening a menu for common workflows.
  2. Keyboard shortcuts help is discoverable in one click from default layout.

### F) Timeline Visual Integration

- Files:
  - `packages/demo/src/DemoApp.tsx`
  - `packages/ui/src/timeline.tsx`
- Components/surfaces:
  - Timeline bottom panel open state, transport controls, keyframe lane visuals.
- Tasks:
  1. Align timeline panel surface styling with other chrome surfaces.
  2. Replace temporary "not yet wired" visual dead-ends in timeline controls.
  3. Tune keyframe/selection highlights for stronger legibility on dark surfaces.
- Acceptance checks:
  1. Timeline panel looks like part of same design system as side/top chrome.
  2. No primary timeline action produces placeholder toasts.

### G) Visual QA Gate (per PR)

- Files:
  - `project/implementation/qa-analysis.md`
  - `project/implementation/carry-over.md`
- Checklist criteria:
  1. Chrome consistency: same border/radius/shadow/blur recipe across shell surfaces.
  2. Contrast hierarchy: base vs raised vs active planes clearly distinguishable.
  3. Accent restraint: accent color reserved for focus/selection/primary actions.
  4. Density balance: no single toolbar zone overloaded with mixed-priority controls.
  5. Discoverability: scenes and help reachable in one click from default layout.
  6. Motion consistency: panel reveal/hide timings feel uniform.
