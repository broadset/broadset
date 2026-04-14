# CT Testing Guide (Spec-Driven)

Date: 2026-04-13 12:00
Scope: Playwright component tests for `@broadset/demo` covering all user-facing UI component behaviors from `@broadset/ui`.

## 1. Purpose

This document defines:

1. What must be tested with CT.
2. Why those scenarios must be tested in a browser (not only unit tests).
3. The expected outcome for each scenario according to specs.

Use this as the source of truth when expanding or refactoring CT coverage.

## 2. Why CT Is Mandatory

- `project/spec/ui/spec.md` requires browser-level CT for interaction flows that unit tests cannot validate completely.
- `.github/instructions/testing.instructions.md` requires cross-region verification: if a user action happens in one region and outcome is visible in another, CT must assert all affected regions in one test.
- `CONTRIBUTING.md` and spec gates require `npm run ct` for user-facing interaction changes.

## 3. Authoritative Sources

Derive CT coverage from these files:

- `project/spec/demo/layout.md`
- `project/spec/demo/state.md`
- `project/spec/demo/visual.md`
- `project/spec/demo/data-integration.md`
- `project/spec/demo/config.md`
- `project/spec/ui/toolbar-nav.md`
- `project/spec/ui/panels.md`
- `project/spec/ui/inputs.md`
- `project/spec/ui/modals.md`
- `project/spec/ui/timeline.md`
- `project/spec/editor/canvas.md`
- `project/spec/editor/editing.md`
- `project/spec/editor/keyboard.md`
- `project/spec/editor/timeline-playback.md`

## 4. CT Derivation Workflow

1. Read every `Requirement`, `Scenario`, and `Acceptance Criteria` block in the spec files above.
2. For each user action, list all UI regions affected:
   - canvas
   - transform widget
   - properties panel
   - layers panel
   - toolbar
   - timeline
   - modal
   - bottom panel
3. Create one CT case that performs the action with real pointer/keyboard APIs.
4. Assert all affected regions in that same test.
5. Add a JSDoc `@description` that references the exact spec file and requirement.
6. Prefer `data-testid` selectors; do not rely on CSS classes.

## 5. Coverage Baseline (Current)

- Current CT count: 87 tests across 10 files.
- Current CT files are folder-organized under `packages/demo/ct/` by domain (`accessibility/`, `canvas-transform/`, `layout/`, `state/`, `timeline/`).
- Current matrix coverage is partial: 42/57 scenario IDs covered; gaps remain concentrated in C-_, D-_, and some L-\* scenarios.

## 6. Comprehensive CT Matrix

### 6.1 Canvas, Selection, Transform, and Placement

| ID   | What must be tested                               | Why CT                                                        | Expected outcome according spec                                                                    | Spec source                                                                                                                       |
| ---- | ------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| C-01 | Click element on canvas                           | Selection is a pointer/DOM interaction                        | Element becomes selected, transform widget appears, selected layer highlights, properties populate | `project/spec/editor/canvas.md` (Element Selection, Transform Widget), `project/spec/demo/layout.md` (Canvas Selection Indicator) |
| C-02 | Click empty canvas                                | Cross-region clear state                                      | Selection clears, widget disappears, properties empty state shown                                  | `project/spec/editor/canvas.md` (Element Selection), `project/spec/ui/panels.md` (Properties Sidebar Rendering)                   |
| C-03 | Marquee drag selection                            | Unit tests cannot validate drag geometry and visual rectangle | Intersecting elements selected, marquee visual uses accent fill and dashed border                  | `project/spec/editor/canvas.md` (Marquee Selection, Marquee Selection Visual)                                                     |
| C-04 | Drag transform bounds to move                     | Browser pointer capture and geometry updates                  | Element moves in canvas, geometry fields update, committed value remains after pointer up          | `project/spec/editor/canvas.md` (Transform Widget), `project/spec/ui/panels.md` (Geometry Panel)                                  |
| C-05 | Drag resize handle                                | Requires real pointer events and visual bounds                | Width/height change on canvas, widget size updates, geometry panel reflects new size               | `project/spec/editor/canvas.md` (Transform Widget), `project/spec/editor/transforms.md`                                           |
| C-06 | Drag rotation handle                              | Rotation gesture not fully unit-testable end-to-end           | Rotation changes visibly on canvas and in properties                                               | `project/spec/editor/canvas.md` (Transform Widget), `project/spec/editor/transforms.md`                                           |
| C-07 | Activate placement mode and drag-create element   | Multi-step user flow across toolbar and canvas                | Placement banner visible, new element created with drag bounds, selection switches to new element  | `project/spec/editor/editing.md` (Element Placement Mode), `project/spec/demo/layout.md` (Placement Mode Banner)                  |
| C-08 | Click-only placement fallback size                | Threshold behavior must be validated visually                 | If drag extent is below threshold, default dimensions are used and centered around click           | `project/spec/editor/editing.md` (Element Placement Mode)                                                                         |
| C-09 | Escape while in placement mode                    | Keyboard cancellation path                                    | Placement cancels, banner hides, tool deactivates                                                  | `project/spec/demo/layout.md` (Placement Mode Banner), `project/spec/editor/editing.md`                                           |
| C-10 | Zoom in/out and clamp                             | Wheel and zoom behavior are device/browser specific           | Zoom changes by step, clamps at min/max, zoom display updates                                      | `project/spec/editor/canvas.md` (Zoom and Pan)                                                                                    |
| C-11 | Cursor-locked zoom                                | Requires coordinate checks in real DOM                        | World point under cursor stays fixed during zoom                                                   | `project/spec/editor/canvas.md` (Cursor-Locked Zoom)                                                                              |
| C-12 | Pan via trackpad-like wheel and space-drag        | Input-device semantics require browser event path             | Pan updates viewport, cursor mode toggles correctly, no accidental zoom                            | `project/spec/editor/canvas.md` (Zoom and Pan, Space-Bar Pan Mode)                                                                |
| C-13 | Grid and rulers visibility toggles                | Visual overlays and view toggles are integration behaviors    | Grid/rulers show-hide according to settings and remain aligned after zoom/pan                      | `project/spec/editor/canvas.md` (Grid Overlay, Ruler System), `project/spec/ui/toolbar-nav.md` (View toggles)                     |
| C-14 | Drag guide from ruler and remove by dragging back | Requires drag gestures and coordinate conversions             | Guide appears at correct document coordinate, can be removed by dragging to ruler area             | `project/spec/editor/canvas.md` (Ruler System, User Guide Line Visual)                                                            |
| C-15 | Snap guide line appears during align drag         | Runtime snap visual is integration-only                       | Snap line appears with accent color during alignment and disappears after drag end                 | `project/spec/editor/canvas.md` (Snap Guide Line Visual)                                                                          |
| C-16 | Inline text editing mode                          | Requires contenteditable and focus behavior                   | Double-click opens overlay, pan/zoom suppressed during edit, Escape cancels, click-outside commits | `project/spec/editor/canvas.md` (Canvas Inline Text Editing Mode)                                                                 |

### 6.2 Toolbar, Context Menu, Element Library, Scene Sorting

| ID   | What must be tested                                 | Why CT                                                    | Expected outcome according spec                                                                       | Spec source                                                                                                 |
| ---- | --------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| T-01 | Toolbar icon-only controls with tooltips and labels | Accessibility + visual chrome behavior                    | All clickable toolbar controls are icon-only and have `aria-label` and tooltip                        | `project/spec/ui/toolbar-nav.md` (Toolbar Actions), `project/spec/demo/layout.md` (Floating Main Toolbar)   |
| T-02 | Undo/redo disabled-state transitions                | State-driven UI behavior across edits                     | Fresh doc: both disabled, after edit: undo enabled, after undo: redo enabled                          | `project/spec/ui/toolbar-nav.md` (Undo/Redo Button States)                                                  |
| T-03 | File menu actions                                   | Dropdown and side effects are integration paths           | New/Open/Save/Import/Export/Settings/Debug trigger expected callbacks and dialogs                     | `project/spec/ui/toolbar-nav.md` (File Menu), `project/spec/demo/data-integration.md`                       |
| T-04 | View menu toggles and checkmarks                    | Toggle semantics and visual indicators                    | Show rulers/grid/snap updates state and checkmarks                                                    | `project/spec/ui/toolbar-nav.md` (View Menu)                                                                |
| T-05 | Scenes menu and scene sorter                        | Cross-region scene switching                              | Scene tabs/menu switch active page and canvas content, add/remove rules enforced                      | `project/spec/ui/toolbar-nav.md` (Scenes, Scene Sorter), `project/spec/demo/layout.md`                      |
| T-06 | Element library built-ins + plugin                  | Plugin integration path                                   | Built-ins plus custom types render; selecting type enters placement mode and highlights active button | `project/spec/ui/toolbar-nav.md` (Element Library), `project/spec/demo/config.md` (Custom Component Plugin) |
| T-07 | Context menu on element vs empty canvas             | Right-click context behavior                              | Element menu shows full action list; empty canvas shows Paste-only menu                               | `project/spec/ui/toolbar-nav.md` (Context Menu), `project/spec/demo/layout.md`                              |
| T-08 | Context menu lock/required constraints              | State-dependent action disablement                        | Locked items disable cut/duplicate/delete, required items disable delete, lock label toggles          | `project/spec/ui/toolbar-nav.md` (Context Menu)                                                             |
| T-09 | Context menu reorder/group/ungroup actions          | Z-order and grouping must be visible in canvas and layers | Reorder changes visual stacking; group/ungroup only appears when allowed                              | `project/spec/ui/toolbar-nav.md` (Context Menu), `project/spec/editor/store-actions.md`                     |
| T-10 | Toolbar keyboard accessibility                      | Browser-level focus behavior                              | Toolbar has role/label, arrow keys move focus, toggle buttons expose correct pressed state            | `project/spec/ui/toolbar-nav.md` (WCAG AA Toolbar Accessibility)                                            |

### 6.3 Sidebars, Layers, Properties, and Property Panels

| ID   | What must be tested                                    | Why CT                               | Expected outcome according spec                                                                                       | Spec source                                                                                              |
| ---- | ------------------------------------------------------ | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| P-01 | Sidebar open/close + tab switching                     | Host shell behavior                  | Active tab click closes sidebar, inactive tab opens/switches; no-selection auto-switches to Layers                    | `project/spec/demo/layout.md` (Sidebar Toolbar, Sidebar Tab Switching)                                   |
| P-02 | Properties empty state                                 | Cross-region selection behavior      | No selection shows "Select an element..." empty state                                                                 | `project/spec/ui/panels.md` (Properties Sidebar Rendering)                                               |
| P-03 | Properties panel ordering and conditional visibility   | Conditional rendering by type/mode   | Correct accordion section order; print mode hides gradient/3D/clipChildren controls                                   | `project/spec/ui/panels.md` (Properties Sidebar Rendering)                                               |
| P-04 | Multi-select mixed values and apply-to-all edit        | Multi-entity editing flow            | Mixed placeholders shown for differing fields; edit applies value to all selected elements                            | `project/spec/ui/panels.md` (Multi-Element Property Display)                                             |
| P-05 | Layers selection and canvas sync                       | Cross-region interaction             | Clicking layer selects element and repositions transform widget                                                       | `project/spec/ui/panels.md` (Layers Sidebar), `project/spec/editor/canvas.md`                            |
| P-06 | Layers inline rename behavior                          | Keyboard and inline editing behavior | Double-click enters rename, Enter commits, Escape cancels, empty name rejected                                        | `project/spec/ui/panels.md` (Element Rename in Layers Panel)                                             |
| P-07 | Layers drag reorder                                    | Drag and drop interaction            | Drag from grip reorders layers, z-order changes on canvas, invalid descendant drops rejected                          | `project/spec/ui/panels.md` (Layers Sidebar)                                                             |
| P-08 | Visibility and lock toggles                            | State-to-render behavior             | Visibility toggles class to onscreen/offscreen; lock prevents destructive edits                                       | `project/spec/ui/panels.md` (Layers Sidebar), `project/spec/editor/keyboard.md`                          |
| P-09 | Clip-path edit activation from properties/context menu | Mode transitions and overlay         | Clip-path editing starts only for capable elements, default polygon seeded if empty, exits on selection change/Escape | `project/spec/ui/panels.md` (Clip-Path Panel), `project/spec/editor/editing.md` (Clip-Path Editing Mode) |
| P-10 | Video, Clock, Ticker panel mode-specific fields        | Conditional controls                 | Correct panel appears by type; mode-dependent fields show/hide correctly and update element config                    | `project/spec/ui/panels.md` (Video Element Panel, Clock Element Panel, Ticker Element Panel)             |
| P-11 | Panel accessibility                                    | Keyboard and ARIA behavior           | Tab reaches controls in order, accordion `aria-expanded` accurate, visible focus ring, labels linked                  | `project/spec/ui/panels.md` (WCAG AA Panel Accessibility)                                                |

### 6.4 Input Components (browser-level interaction)

| ID   | What must be tested                    | Why CT                                                               | Expected outcome according spec                                                                     | Spec source                                               |
| ---- | -------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| I-01 | ColorInput picker + text draft + alpha | Popover and slider behavior are browser interaction paths            | Valid colors emit, invalid blur reverts, alpha works, transparent swatch checkerboard shown         | `project/spec/ui/inputs.md` (Color Input)                 |
| I-02 | NumField commit timing                 | Real typing/blur/enter behavior                                      | Commit on blur/Enter, immediate commit on increment/decrement and arrow keys, invalid input reverts | `project/spec/ui/inputs.md` (NumField)                    |
| I-03 | CssLengthInput unit conversion         | Input/select coupling                                                | Unit switch converts value correctly and commits in selected unit                                   | `project/spec/ui/inputs.md` (CSS Length Input)            |
| I-04 | FilterEditor stack operations          | Rich editor interactions                                             | Add/remove/reorder filters, no duplicate functions, emitted filter string preserves order           | `project/spec/ui/inputs.md` (Filter Editor)               |
| I-05 | ShadowEditor toggle + layers           | Multi-control interaction                                            | Disable emits none, re-enable restores prior layers, multi-layer output remains valid               | `project/spec/ui/inputs.md` (Shadow Editor)               |
| I-06 | Input accessibility                    | Browser semantics cannot be proven with static unit assertions alone | Inputs expose labels, sliders respond to arrow keys, invalid states set `aria-invalid`              | `project/spec/ui/inputs.md` (WCAG AA Input Accessibility) |

### 6.5 Modal Dialogs and Modal Accessibility

| ID   | What must be tested                                   | Why CT                                            | Expected outcome according spec                                                                          | Spec source                                                                         |
| ---- | ----------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| M-01 | About and Shortcut Help modal open/close from toolbar | Full trigger-to-modal flow                        | Correct modal opens from menu and closes via button/Escape                                               | `project/spec/ui/modals.md` (About Modal, Shortcut Help Modal)                      |
| M-02 | Canvas Settings modal controls                        | Immediate callback behavior                       | Name, view mode, rulers, perspective, grid controls update state instantly                               | `project/spec/ui/modals.md` (Canvas Settings Modal)                                 |
| M-03 | Export modal format gating and submit payload         | Feature-flag and payload integration              | Only enabled exporters visible; submit includes exporter, dynamic data, and snapshot                     | `project/spec/ui/modals.md` (Export Modal), `project/spec/demo/data-integration.md` |
| M-04 | Media Library modal search/category/select/upload     | Media selection workflow                          | Search/category filters work, select disabled until choice, confirm updates target element               | `project/spec/ui/modals.md` (Media Library Modal)                                   |
| M-05 | New Document + Template Browser modal flow            | Document replacement workflow                     | Preset/template selection creates new document, no-selection blocks create, unsaved confirmation appears | `project/spec/ui/modals.md` (New Document Modal, Template Browser Modal)            |
| M-06 | Guide Position modal                                  | Ruler-guide precision workflow                    | Apply updates guide position, Delete removes guide, Enter/Escape behaviors respected                     | `project/spec/ui/modals.md` (Guide Position Modal)                                  |
| M-07 | Modal focus trap and focus restore                    | Core accessibility gate                           | Tab stays inside modal, Escape closes modal, focus returns to trigger                                    | `project/spec/ui/modals.md` (WCAG AA Modal Accessibility)                           |
| M-08 | Modal ARIA contract                                   | Accessibility metadata must be present at runtime | Modal uses `role=dialog`, `aria-modal=true`, title linked by `aria-labelledby`                           | `project/spec/ui/modals.md` (WCAG AA Modal Accessibility)                           |

### 6.6 Timeline and Animation Editing

| ID   | What must be tested                                 | Why CT                                          | Expected outcome according spec                                                                              | Spec source                                                                                           |
| ---- | --------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| L-01 | Timeline bottom panel open/close behavior           | Host-shell + timeline integration               | Closed state hidden/off-screen; open state shows editor with proper layout and close behavior                | `project/spec/ui/timeline.md` (Timeline Bottom Panel), `project/spec/demo/layout.md` (Timeline Panel) |
| L-02 | Add/select keyframes and single-selection semantics | Real interaction required                       | Add creates and selects keyframe; only one marker is selected at a time                                      | `project/spec/ui/timeline.md` (Timeline Editor Keyframe Management)                                   |
| L-03 | Drag keyframe marker to new offset                  | Pointer drag + snapping behavior                | Marker moves with drag feedback and commits new offset on drop                                               | `project/spec/ui/timeline.md` (Keyframe Drag Repositioning)                                           |
| L-04 | Playback controls                                   | Browser timing and UI state                     | Play starts playback, pause/stop behave correctly, playhead updates                                          | `project/spec/ui/timeline.md` (Timeline Playback)                                                     |
| L-05 | Keyframe delete + undo                              | Keyboard and context-menu behavior              | Delete removes selected keyframe, deleting last removes timeline entry, undo restores                        | `project/spec/ui/timeline.md` (Keyframe Deletion)                                                     |
| L-06 | Animation binding sections                          | Complex editor interactions                     | State bindings list/edit/remove, modifier bindings create in/out pairs and ordering rules hold               | `project/spec/ui/timeline.md` (Animation Binding Sections)                                            |
| L-07 | Keyframe-aware property editing                     | Cross-region behavior (timeline <-> properties) | With selected keyframe, property edits update keyframe values; without it, edits target base element         | `project/spec/ui/timeline.md` (Property Editing Context for Keyframes)                                |
| L-08 | Visual easing graph editor                          | Pointer interactions and visual feedback        | Graph opens on tween select, handle drag updates curve, preset chips apply immediately, outside click closes | `project/spec/ui/timeline.md` (Visual Easing Graph Editor)                                            |
| L-09 | Per-property lanes                                  | Multi-lane timeline interaction                 | Expand shows grouped lanes, double-click adds lane keyframe, drag moves one property independently           | `project/spec/ui/timeline.md` (Per-Property Keyframe Lanes)                                           |
| L-10 | Snapshot restore before play/seek                   | Integration between editor and playback runtime | Play/seek restore snapshot before applying timeline action                                                   | `project/spec/editor/timeline-playback.md`                                                            |

### 6.7 Demo Host State, Data, and Workflow Integration

| ID   | What must be tested                         | Why CT                                     | Expected outcome according spec                                                                              | Spec source                                                                          |
| ---- | ------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| D-01 | Provider wiring in rendered app             | Integration-only context behavior          | Editor, timeline, and data providers are all available and functional from child UI                          | `project/spec/demo/state.md` (Editor Provider Wiring)                                |
| D-02 | Sidebar preference persistence              | Browser storage behavior                   | Open/closed, tab, and width persist to localStorage and restore on remount/reload                            | `project/spec/demo/state.md` (Sidebar Preferences Persistence)                       |
| D-03 | Save and restore document lifecycle         | Browser storage and host callback behavior | Save writes document to localStorage, startup restores saved doc or falls back to sample                     | `project/spec/demo/state.md` (Save via Host Callback)                                |
| D-04 | Toast behavior and severity timing          | Visual timing and stacking behavior        | Success/info and error toasts appear with correct message and dismiss timing behavior                        | `project/spec/demo/state.md` (Toast Notification System)                             |
| D-05 | Import and export success/failure workflows | End-to-end user workflow                   | Success paths show success toast; failures show descriptive error toast; raster/video preconditions enforced | `project/spec/demo/data-integration.md` (Export Orchestration, Import Orchestration) |
| D-06 | Live data propagation                       | Runtime data updates through renderer      | Updated scores/clock/ticker values propagate to rendered elements                                            | `project/spec/demo/data-integration.md` (Live Data Injection)                        |
| D-07 | Fullscreen toggle and icon state            | Browser API integration                    | Fullscreen toggles and icon reflects current mode                                                            | `project/spec/demo/state.md` (Fullscreen Toggle)                                     |
| D-08 | Browser zoom prevention                     | Browser event policy behavior              | Ctrl/Cmd wheel and key zoom gestures are prevented without breaking app interactions                         | `project/spec/demo/state.md` (Browser Zoom Prevention)                               |
| D-09 | Full-viewport and no-scroll layout          | Layout integration                         | App fills viewport, no page-level scrollbars, canvas and chrome are positioned per spec                      | `project/spec/demo/layout.md` (Full-Viewport Layout), `project/spec/demo/visual.md`  |

## 7. Component Coverage Checklist (Public UI Components)

Use this section to ensure all exported UI components are covered by at least one CT scenario.

### 7.1 `packages/ui/src/toolbar-nav.tsx`

- `EditorToolbar`: T-01, T-02, T-04, T-10
- `ElementLibrary`: T-06, C-07
- `PageSorter`: T-05
- `CanvasContextMenu`: T-07, T-08, T-09

### 7.2 `packages/ui/src/panels.tsx` family

- `PropertiesSidebar`: P-01, P-02, P-03, P-04
- `LayersSidebar`: P-05, P-06, P-07, P-08
- `AnimationSidebar`: L-06, L-07
- `TemplateGroupPanel`: P-09 and relevant grouping flows
- `PreflightPanel`: P-03 and preflight visibility flows

### 7.3 `packages/ui/src/property-panels/`

- `GeometryPanel`, `AppearancePanel`, `TypographyPanel`, `TextEffectsPanel`, `SpacingPanel`, `BoxEffectsPanel`, `ClipPathPanel`, `PathPropertiesPanel`, `ImagePanel`, `ObjectFitPanel`, `QrCodePanel`, `GroupPanel`, `VideoPanel`, `ClockPanel`, `TickerPanel`, `PropertyField`, `AnimationModePropertiesPanel`:
  - Covered via P-03, P-04, P-09, P-10, L-07, and type-specific edit scenarios.

### 7.4 `packages/ui/src/inputs/`

- `ColorInput`, `NumField`, `CssLengthInput`, `TextStrokeInput`, `FilterEditor`, `ShadowEditor`:
  - Covered via I-01 to I-06.

### 7.5 `packages/ui/src/modals/`

- `AboutModal`, `CanvasSettingsModal`, `ExportModal`, `MediaLibraryModal`, `NewDocumentModal`, `ShortcutHelpModal`, `GuidePositionModal`, `TemplateBrowserModal`:
  - Covered via M-01 to M-08.

### 7.6 `packages/ui/src/timeline/`

- `TimelineEditingProvider`, `TimelineEditor`, `TimelineBottomPanel`, `AnimationBindingSections`, `EasingGraphEditor`, `PerPropertyLanes`:
  - Covered via L-01 to L-10.

## 8. Recommended CT File Layout

Split CTs by feature area instead of keeping one monolithic file.

- `packages/demo/ct/canvas-transform/selection.ct.tsx` + `packages/demo/ct/canvas-transform/handles.ct.tsx` + `packages/demo/ct/canvas-transform/compound.ct.tsx` + `packages/demo/ct/canvas-transform/resize-rotation.ct.tsx` -> C-01..C-16
- `packages/demo/ct/layout/toolbar-navigation.ct.tsx` -> T-01..T-10
- `packages/demo/ct/layout/sidebar-properties-layers.ct.tsx` -> P-01..P-11
- `packages/demo/ct/accessibility/inputs-a11y.ct.tsx` -> I-01..I-06
- `packages/demo/ct/accessibility/modals-a11y.ct.tsx` -> M-01..M-08
- `packages/demo/ct/timeline/timeline-animation.ct.tsx` -> L-01..L-10
- `packages/demo/ct/state/demo-state-data.ct.tsx` -> D-01..D-09

## 9. Test Writing Rules

- Each test MUST include a JSDoc `@description` naming spec source and scenario intent.
- Use `data-testid` selectors as primary locators.
- Use real `page.mouse`, `page.keyboard`, and pointer interactions for drag/keyboard flows.
- Assert outcomes in every affected region for cross-region scenarios.
- Avoid fixed sleeps where possible; prefer explicit waits/assertions.

## 10. Traceability Template

Keep a traceability table in each CT file header or a central checklist.

| Case ID | CT file                             | Requirement                | Regions asserted                             | Status  |
| ------- | ----------------------------------- | -------------------------- | -------------------------------------------- | ------- |
| C-01    | `canvas-transform/selection.ct.tsx` | Element Selection by Click | canvas, transform widget, layers, properties | pending |

## 11. Definition Of Done For CT Coverage

All of the following must be true:

1. Every ID in Sections 6.1 to 6.7 has at least one passing CT case.
2. Each CT case references its spec requirement in `@description`.
3. Cross-region cases assert all impacted regions in one test.
4. `npm run ct` passes from repository root.
5. No acceptance criterion listed in this document remains untested without an explicit, documented exception.

## 12. Execution Commands

From repository root:

```bash
npm run ct
npm run quality:all && npm run build && npm run ct
```
