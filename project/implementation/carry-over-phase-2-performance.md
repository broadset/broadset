## Performance Pass (Old Feels Faster) - Comparison Findings

This pass focuses on why the current app feels laggy during editor interaction compared to the original.

### 1) Current demo does full-store subscription at top level (HIGH confidence)

- Current demo uses a custom full-state subscription via `useSyncExternalStore` in `packages/demo/src/DemoApp.tsx` (lines ~201-206).
- Old demo uses selective Zustand subscriptions (`useEditorStore((s) => ...)`) in `../dom-compositor/packages/demo/src/main.tsx` (lines ~304-317).
- Impact: more top-level React work for every store mutation in current app, including fast interaction updates.
- Carry-over: replace full-store subscription in `DemoApp` with selector-based subscriptions for only needed slices.

### 2) Drag/resize/rotate writes to document on every pointer move (HIGH confidence)

- Current transform widget calls `onPreviewUpdate` on pointer move (`packages/demo/src/demo-components.tsx`, lines ~277/301/314), which routes to `updateElementEphemeral` (`packages/demo/src/DemoApp.tsx`, line ~603).
- `updateElementEphemeral` rewrites document element arrays immutably each call (`packages/editor/src/store-actions.ts`, lines ~256-263 and ~402-409).
- Old transform path is mostly visual/imperative during interaction: `onMove` and `onDrop` in `../dom-compositor/packages/editor/src/components/TransformableNode.tsx` (lines ~199 and ~215), with committed store write on drop (`commitElementChange`, line ~318). Ephemeral writes are limited (e.g., border radius drag, line ~525).
- Impact: current app pays full state + React + renderer update cost per pointer event.
- Carry-over: use local/imperative transform preview (or rAF-throttled preview state) and commit to store on pointer-up.

### 3) Current demo diffs entire document and logs every state update (HIGH confidence)

- Current demo subscribes to store updates and runs `diffDocuments(prevDoc, nextDoc)` on every document ref change (`packages/demo/src/DemoApp.tsx`, lines ~256-260), then logs each batch (`console.info`, line ~272).
- Current diff implementation is deep/recursive (`deepEqual` + full element/animation diff traversal) in `packages/editor/src/collaboration.ts` (lines ~80, ~115, ~173, ~333).
- Old implementation's change stream skips ephemeral updates when temporal tracking is paused (`if (!store.temporal.getState().isTracking) return;`) in `../dom-compositor/packages/editor/src/store/changeStreamMiddleware.ts` (line ~416).
- Impact: expensive diff + console output flood during interactive updates.
- Carry-over:
  1. Gate change-stream diffing/logging behind an explicit debug flag.
  2. Skip diffs for ephemeral tracking-paused updates (same strategy as old).

### 4) Current preview re-renders/updates renderer + playback reset on every document change (HIGH confidence)

- In `packages/demo/src/demo-components.tsx`, document updates trigger:
  - `rendererRef.current?.updateDocument(documentData)` (line ~551)
  - playback pause/seek resets (lines ~553-554, ~559-560)
- Because document changes happen on interaction preview updates, these effects execute repeatedly during manipulation.
- Impact: extra DOM/render/playback churn in the hottest interaction path.
- Carry-over: decouple live transform preview from full document updates; only push full document updates on commit, or batch renderer updates via rAF.

### 5) Current demo runs preflight diagnostics continuously, not only when needed (MEDIUM confidence)

- Current demo computes `runPreflightDiagnostics(currentDocument, {})` in top-level memo (`packages/demo/src/DemoApp.tsx`, line ~292).
- Preflight iterates all elements (`for (const el of elements)`) in `packages/editor/src/editing.ts` (line ~667).
- Old demo renders preflight panel conditionally (`sidebarTab === 'preflight'`) in `../dom-compositor/packages/demo/src/main.tsx` (line ~1124).
- Impact: avoidable per-update CPU usage while editing other panels.
- Carry-over: lazy-compute diagnostics only when preflight tab/panel is visible, or debounce during active transform gestures.

## Most Likely Primary Root Cause

The strongest root cause is interaction-path write amplification:

1. Pointer move -> ephemeral document write
2. Full demo rerender (full-store subscription)
3. Full document diff + console logging
4. Renderer document update + playback reset side effects

Old app avoided this chain by keeping drag interaction largely imperative/local and committing state at drop, with change stream explicitly skipping ephemeral updates.

## Performance Carry-Over Priority

1. Stop per-move full-document pipeline: local preview + commit-on-drop.
2. Remove or debug-gate per-update diff+console logging in `DemoApp`.
3. Replace full-store subscription with selector-based subscriptions.
4. Make preflight computation lazy/conditional.
5. Add rAF batching where live preview updates must stay continuous.
