# Wave W2 — Professional authoring core

W2 delivers the professional authoring core: a coherent, fully mounted, keyboard-authorable professional editor rather than disconnected implementation fragments. Every feature in this wave ships mounted in the editor with CT evidence; nothing closes as "implemented but hidden".

**Wave gate:** a professional user can create, animate, componentize, bind, validate, save, restore, and operate a sample graphic entirely through shipped UI and keyboard. No W2 feature remains behind the generic experimental flag. **External evidence gates:** professional benchmark session against the W0-UX-01 baseline (owner: maintainer); VoiceOver/NVDA assistive-technology session signoff (owner: maintainer).

## W2-CMD-01 — Central typed command registry (L)

- **Dependencies:** W1-HISTORY-01
- **Definition:** Central typed command registry consumed by shortcuts, menus, context UI, palette, toolbar, automation, and help.
- **Acceptance criteria:**
  - [ ] 100% of shipped commands are registered in the central registry
  - [ ] Shortcut and menu conflicts are detected and reported
  - [ ] Every registered command is undoable or explicitly marked read-only

## W2-CANVAS-01 — Canvas selection and transform mechanics (XL)

- **Dependencies:** W1-SCENE-01/W2-CMD-01
- **Definition:** Marquee, hit testing, multi-select, mixed values, smart snapping, guides, unit-correct rulers and nudge, transform HUD, and modifier semantics for direct canvas manipulation.
- **Acceptance criteria:**
  - [ ] Every cross-region canvas scenario has a passing Playwright CT
  - [ ] Direct manipulation (drag, snap, nudge, transform) stays within the frame budget
- **User-visible:** yes — authors get marquee selection, smart snapping, guides, unit-correct rulers, and a transform HUD on the canvas.

## W2-PATH-01 — Pen, path, and mask authoring (XL)

- **Dependencies:** W2-CANVAS-01/W1-RENDER-02
- **Definition:** Pen/path tool phases A–B: Bézier handles, anchor conversion, path selection, text-path authoring, and mask/matte editing.
- **Acceptance criteria:**
  - [ ] Path geometry property tests pass
  - [ ] Path edits group correctly in undo history
  - [ ] Keyboard and pointer path authoring reach parity, meeting QG-A11Y-01
- **User-visible:** yes — authors draw and edit Bézier paths, text paths, and masks directly on the canvas.

## W2-TIMELINE-01 — Virtualized professional timeline (XL)

- **Dependencies:** W1-TIME-02/W2-CMD-01
- **Definition:** De-gated virtualized property lanes with stable keyframe operations, zoom/pan, frame and timecode modes, markers, work area, and copy/paste/multi-select.
- **Acceptance criteria:**
  - [ ] Keyboard-only timeline E2E flow passes, meeting QG-A11Y-01
  - [ ] Timeline stays within its performance budget at 10k keyframes
- **User-visible:** yes — the full timeline panel with property lanes, markers, work area, and timecode modes ships without flags.

## W2-GRAPH-01 — Graph editor and motion paths (L)

- **Dependencies:** W2-TIMELINE-01
- **Definition:** Value and speed graphs with temporal/spatial tangents per RFC-02, easing presets, motion paths, and separate dimensions where approved.
- **Acceptance criteria:**
  - [ ] Curve oracle tests pass
  - [ ] Accessible alternatives exist for tangent handle manipulation, meeting QG-A11Y-01
  - [ ] Graph edits play back with parity between editor preview and playback
- **User-visible:** yes — authors shape easing in value/speed graphs and edit motion paths on the canvas.

## W2-COMP-01 — Component creation and propagation (XL)

- **Dependencies:** W1-SCENE-01/W2-CMD-01
- **Definition:** Components per RFC-07: create, instantiate, nested propagation, exposed properties, overrides, unlink, and cycle handling.
- **Acceptance criteria:**
  - [ ] Propagation to 100 instances completes in <100 ms
  - [ ] Instances and overrides keep collaboration-ready stable identity
- **User-visible:** yes — authors create components and see edits propagate to every instance.

## W2-VAR-01 — Typed document variables and tokens (L)

- **Dependencies:** W1-COLOR-01/W2-COMP-01
- **Definition:** Typed document variables and tokens with aliases, modes, cycle detection, impact preview, and component bindings.
- **Acceptance criteria:**
  - [ ] Theme, locale, and aspect-mode switching is covered by CT
  - [ ] Alias resolution and cycle-detection property tests pass
- **User-visible:** yes — authors define variables and switch theme, locale, and aspect modes with impact preview.

## W2-DATA-01 — Data schema and binding authoring (XL)

- **Dependencies:** W2-VAR-01/RFC-05
- **Definition:** Typed view-model and data-schema editor, binding builder, sample and live preview, lists and repeaters, conditional visibility, and fallback/stale states.
- **Acceptance criteria:**
  - [ ] End-to-end scoreboard and lower-third binding flows pass
  - [ ] Invalid or stale data never corrupts the project, meeting QG-SEC-01
- **User-visible:** yes — authors bind elements to typed data and preview sample or live values, including lists and conditional visibility.

## W2-TEXT-01 — Structured rich text editing (XL)

- **Dependencies:** W1-TEXT-01/W2-CANVAS-01
- **Definition:** Structured TextBody and run editor: inline rich text, bullets, links, language and direction, variable axes, auto-size, and font fallback UI.
- **Acceptance criteria:**
  - [ ] Multilingual editing, IME, and RTL flows are covered by CT
  - [ ] Renderer and export text metrics are unchanged after editing, meeting QG-COR-03
- **User-visible:** yes — authors edit rich multilingual text inline on the canvas with bullets, links, and variable font axes.

## W2-AUDIO-01 — Audio tracks, waveforms, and scrubbing (XL)

- **Dependencies:** RFC-14/W1-TIME-01/W1-ASSET-01
- **Definition:** Ratified audio tracks and cues, waveform cache, scrub/solo/mute, markers, sample-clock conversion, and accessible controls.
- **Acceptance criteria:**
  - [ ] Long-duration A/V sync tests pass
  - [ ] Seek and scrub tests pass
  - [ ] Offline frame/audio alignment is verified, meeting QG-REL-01
  - [ ] Missing-codec handling is tested
- **User-visible:** yes — authors see waveforms in the timeline and scrub, solo, and mute audio.

## W2-STYLE-01 — Style, fill, and effect controls (XL)

- **Dependencies:** W1-COLOR-01/W1-RENDER-02
- **Definition:** Theme swatches, gradients, FilterStack, picture and pattern fills, stroke ends, clip path, 3D inputs, and effect stack mounted as working controls.
- **Acceptance criteria:**
  - [ ] UI.1–UI.10 are closed with mounted controls
  - [ ] Every mounted control has CT coverage
- **User-visible:** yes — gradient, filter, pattern, stroke, and effect controls appear in the properties panel.

## W2-DOC-01 — Document setup and preflight (L)

- **Dependencies:** W2-STYLE-01/W1-ASSET-01
- **Definition:** Prepress, metadata and output intent, notes, unit-aware fields, canvas and profile settings, and actionable preflight.
- **Acceptance criteria:**
  - [ ] UI.11–UI.15 are closed
  - [ ] Unit, profile, and preflight flows are covered by CT
- **User-visible:** yes — document settings, unit-aware fields, and actionable preflight warnings appear in shipped UI.

## W2-ASSET-01 — Virtualized asset library (L)

- **Dependencies:** W1-ASSET-01/W1-PERSIST-01
- **Definition:** Virtualized asset library with search and tags, relink, replace-everywhere, viewport proxies, and font/license warnings.
- **Acceptance criteria:**
  - [ ] Library stays within performance budgets at 10k assets
  - [ ] Missing-asset, relink, and offline workflows are covered
- **User-visible:** yes — authors browse a searchable, tagged asset library with relink and replace-everywhere workflows.

## W2-A11Y-01 — Editor accessibility completeness (XXL)

- **Dependencies:** W2-PATH-01/W2-GRAPH-01/W2-DATA-01/W2-TEXT-01/W2-AUDIO-01/W2-DOC-01/W2-ASSET-01/W2-UX-01
- **Definition:** Semantic canvas/layers relationship, announcements, focus restoration, drag alternatives, forced colors, and target/focus mechanics across all W2 authoring surfaces.
- **Acceptance criteria:**
  - [ ] axe reports zero violations across shipped editor surfaces
  - [ ] Every logged VoiceOver/NVDA blocker is resolved; manual AT signoff is tracked at the wave external evidence gate
  - [ ] Modal accessibility audit is closed
  - [ ] Full keyboard operability with visible focus meets QG-A11Y-01
- **User-visible:** yes — keyboard-only and screen-reader users can author end to end.

## W2-UX-01 — Command palette and workflow polish (XL)

- **Dependencies:** W0-UX-01/W2-CMD-01
- **Definition:** Command palette, shortcut discovery and editor, contextual inspector, empty states, progress and cancel feedback, and light/dark/high-contrast themes.
- **Acceptance criteria:**
  - [ ] User actions show feedback within ≤100 ms
  - [ ] W0-UX-01 benchmark tasks run end-to-end in shipped UI; improvement is measured at the wave external evidence gate
- **User-visible:** yes — a command palette, shortcut editor, and light/dark/high-contrast themes appear across the editor.

## W2-QE-01 — Authoring coverage and quality gates (L)

- **Dependencies:** W2-A11Y-01
- **Definition:** Generated cross-region coverage, property tests for authoring math and state, visual CT, and performance assertions.
- **Acceptance criteria:**
  - [ ] B.5 and B.6 report zero missing shipped cross-region rows
  - [ ] D.3 and F-20 close with zero missing shipped rows
