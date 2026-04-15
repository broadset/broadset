# Carry-Over Phase 4 — UX/Visual Refinement Plan

Source: `project/implementation/carry-over-phase-4-ux-visual.md`
Target packages: `ui`, `demo`

---

## Units

### V1 — Canonical Chrome Language + Plane Hierarchy (checklist A+B)

Spec source: `carry-over-phase-4-ux-visual.md` → Visual Implementation Checklist A + B

Add structured token system for shell surfaces: radius presets, shadow presets, blur presets, z-layer tokens, and plane hierarchy tokens (base, raised, active, overlay). Replace ad-hoc inline values with token-driven helpers. Surface style helpers for matte vs glass vs overlay panels.

- [x] tests: red
- [x] impl: green

### V2 — Sidebar Context Headers (checklist D)

Spec source: `carry-over-phase-4-ux-visual.md` → Visual Implementation Checklist D

Add explicit in-panel active context header with tab name + icon to sidebar shell. Ensure users can identify active panel context from inside the panel body without checking the outer rail.

- [x] tests: red
- [x] impl: green

### V3 — Page/Scene Strip + Help Discoverability (checklist E)

Spec source: `carry-over-phase-4-ux-visual.md` → Visual Implementation Checklist E

Add a persistent compact scene/page strip in canvas chrome for quick page switching without opening menus. Add persistent one-click shortcut/help affordance in canvas chrome.

- [x] tests: red
- [x] impl: green

### V4 — Toolbar Density Rebalance (checklist C)

Spec source: `carry-over-phase-4-ux-visual.md` → Visual Implementation Checklist C

Move low-frequency actions from top toolbar into secondary anchored surfaces. Keep high-frequency controls (undo/redo/play/zoom/selection actions) in primary line of sight. Preserve whitespace intervals between action clusters.

- [x] tests: red
- [x] impl: green

### V5 — Timeline Visual Integration (checklist F)

Spec source: `carry-over-phase-4-ux-visual.md` → Visual Implementation Checklist F

Align timeline panel surface styling with canonical chrome tokens from V1. Ensure timeline panel looks like part of same design system as side/top chrome.

- [x] tests: red
- [x] impl: green
