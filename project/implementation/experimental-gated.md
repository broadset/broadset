# Experimental Feature Gating (Demo App)

Snapshot date: 2026-04-22

Status: current gating reference verified against the listed source paths on 2026-07-09. W2 initiative child plans own feature graduation; W6-REL-01 owns release-claim verification.

The demo app hides a set of feature surfaces behind a user-toggleable
`showExperimentalFeatures` flag. The flag lives on `CanvasSettings`
(`packages/model/src/config.ts`) as `readonly showExperimentalFeatures: boolean`
and defaults to `false`. It is exposed as a Switch in the **Document
Settings** (`CanvasSettingsModal`) demo dialog.

This document records what is **hidden in the demo UI** while the flag is
off, so those surfaces can be re-introduced by their owning initiatives without the
underlying functionality being lost or rewritten.

> **Scope.** Gating is UI-only. All production code paths, types, store
> actions, model fields, and non-demo packages remain fully intact. Only the
> demo layout declines to render the gated affordances. Toggling the flag on
> restores every surface immediately.

## Gated surfaces

| Surface                                                   | Location                                               | Gated when flag is off         |
| --------------------------------------------------------- | ------------------------------------------------------ | ------------------------------ |
| Main toolbar "Open" item                                  | `packages/demo/src/demo-app/layout-main-toolbar.tsx`   | hidden                         |
| Main toolbar "Import" item                                | `packages/demo/src/demo-app/layout-main-toolbar.tsx`   | hidden                         |
| Main toolbar "Export" item                                | `packages/demo/src/demo-app/layout-main-toolbar.tsx`   | hidden                         |
| Main toolbar "Browse Templates" item                      | `packages/demo/src/demo-app/layout-main-toolbar.tsx`   | hidden                         |
| Main toolbar unit-picker items (`px`/`mm`/`in`)           | `packages/demo/src/demo-app/layout-main-toolbar.tsx`   | hidden                         |
| Main toolbar view-mode items (`none`/`broadcast`/`print`) | `packages/demo/src/demo-app/layout-main-toolbar.tsx`   | hidden                         |
| CanvasSettingsModal — Ruler-unit `Select`                 | `packages/ui/src/modals/core-modals.tsx`               | hidden                         |
| CanvasSettingsModal — View-mode `ButtonGroup`             | `packages/ui/src/modals/core-modals.tsx`               | hidden                         |
| Sidebar — Animation tab                                   | `packages/demo/src/demo-app/layout-side-rails.tsx`     | hidden                         |
| Sidebar — Pre-flight tab                                  | `packages/demo/src/demo-app/layout-side-rails.tsx`     | hidden                         |
| Sidebar — Template Groups tab                             | `packages/demo/src/demo-app/layout-side-rails.tsx`     | hidden                         |
| Canvas context menu — "Edit motion path"                  | `packages/demo/src/demo-app/layout-context-menu.tsx`   | hidden                         |
| Timeline bottom panel                                     | `packages/demo/src/demo-app/layout-timeline-panel.tsx` | component returns `null`       |
| Export dialog                                             | `packages/demo/src/demo-app/layout-dialogs.tsx`        | modal is not mounted           |
| Template Browser dialog                                   | `packages/demo/src/demo-app/layout-dialogs.tsx`        | modal is not mounted           |
| Preflight diagnostics computation                         | `packages/demo/src/demo-app/app.tsx`                   | `preflightIssues` returns `[]` |
| Document unit passed to sidebar                           | `packages/demo/src/demo-app/app.tsx`                   | coerced to `'px'`              |

The **"Save as JSON"** item in the File menu and the **"Media Library"** item
are **not gated** — they remain available in the non-experimental UI.

### Dialog + tab auto-dismiss when flag flips off

When `showExperimentalFeatures` transitions from `true` → `false` while a
gated surface is open, `app.tsx` resets:

- the sidebar tab back to `'layers'` if it was `'animation'`, `'preflight'`,
  or `'template-groups'`;
- the bottom timeline editor (`editingTimeline`) to `null`;
- the active dialog to `null` if it was `'export'` or `'template-browser'`.

## How to re-introduce a gated surface

1. Remove the `isExperimental ? ... : null` guard (or the `if
(!canvasSettings.showExperimentalFeatures) return null;` guard) from the
   file listed above.
2. If the setting is being retired entirely, remove
   `showExperimentalFeatures` from `CanvasSettings` in
   `packages/model/src/config.ts` and from the CanvasSettingsModal
   (`packages/ui/src/modals/core-modals.tsx`) together with the
   `onShowExperimentalFeaturesChange` prop; remove the demo's
   `isExperimental` derivations and the coercion in `app.tsx`.
3. Remove the `enableExperimentalFeatures()` helper
   (`packages/demo/src/demo-shell-test-utils.ts`) and its call sites in the
   demo vitest suites (`demo-app.*.test.tsx`).

## What was **not** gated

- Model types, store actions, and reducers (`packages/editor/src/...`)
  remain fully functional. Motion-path, animation, preflight, template, and
  unit-aware code paths are untouched.
- Importers and exporters in `packages/formats/**` keep their full behavior —
  only the demo's menu wiring is hidden.
- CT harnesses under `packages/demo/ct/**` pass
  `showExperimentalFeatures: true` (via `CanvasSettingsHarness`) so their
  assertions continue to exercise the full modal surface.

## Why `CanvasSettings` and not a separate flag?

- It reuses the existing `updateCanvasSettings` plumbing and the
  `CanvasSettingsModal` ("Document Settings" in the demo File menu).
- Keeping the flag in editor-state (not document-persisted data) avoids
  contaminating the `.bsp` file format with a demo-only UI preference.

## Verification

- Demo unit tests that exercise gated surfaces (preflight, animation,
  export, template browser) call `enableExperimentalFeatures()` after
  mounting `<DemoApp />` so the guarded UI is present for their assertions.
- The default (flag off) is the path exercised by the general demo chrome
  tests and by anyone opening the app for the first time.
