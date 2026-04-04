# Implementation Decision Log

Non-trivial judgment calls made during implementation. See each unit for context.

---

### Unit 2.3 — Demo shell with mounted renderer

**Decision:** QR code renderer uses a synchronous text placeholder ("QR") instead of rendering an actual QR code SVG via the `qrcode-generator` library.

**Alternatives considered:** (a) Import qrcode-generator synchronously in mount() — adds a heavyweight dependency to the synchronous render path. (b) Use dynamic import() with async mount — the renderer lifecycle (`mount()`) is currently synchronous, changing it would ripple through the entire architecture.

**Rationale:** Phase 2 is a static renderer phase. The goal is "pixels on screen proving the renderer works." A visible placeholder satisfies this. The full QR rendering can be implemented when the renderer lifecycle is revisited (possibly async mount in Phase 3 or 4).

---

### Unit 2.3 — Playwright CT setup

**Decision:** Playwright CT requires `playwright/index.ts` as a JS entry point alongside `playwright/index.html`. The CT framework's Vite plugin (`transformIndexFile`) only injects component registration code into `.ts`/`.tsx`/`.js`/`.jsx` files — not HTML directly.

**Alternatives considered:** None — this was a discovery of undocumented behavior in `@playwright/experimental-ct-core@1.59.1`.

**Rationale:** Documenting here to save future debugging time. Without `playwright/index.ts`, the build produces an empty JS bundle and all mount() calls timeout.

---

### Unit 2.3 — SAMPLE_DOCUMENT type narrowing

**Decision:** Added `as const` to `documentMode` and `padding` fields in `sampleDocument.ts`, plus `as BroadsetDocument` cast in `App.tsx`, rather than typing the entire constant.

**Alternatives considered:** (a) `as const` on entire object — breaks due to spread operators with DEFAULT_SCREEN/DEFAULT_STYLE producing mutable types. (b) Runtime Zod parsing at module load — adds import-time cost and Zod runtime dep to demo bundle. (c) Type annotation `BroadsetDocument` on constant — fails because `readonly` arrays in interface vs mutable arrays in Zod-inferred type.

**Rationale:** Minimal `as const` on the two widened fields + cast at consumption site is the least invasive. The constant is runtime-validated via Zod in tests.

---

### Unit 3.3 — PlaybackController architecture (factory vs class)

**Decision:** Used a closure-based factory function (`createPlaybackController`) rather than a class, consistent with the existing `createPlaybackHandle` pattern.

**Alternatives considered:** (a) Class-based controller — more natural for stateful objects with many mutable fields, but would be inconsistent with the rest of the package. (b) Separate controller per element — simpler per-element state, but the spec requires global play/pause/seek/setSpeed that affect all elements.

**Rationale:** Factory pattern keeps the public API consistent with `createPlaybackHandle` and other playback exports. Internal mutable state is encapsulated via closure variables with `/* mutable */` comments.

---

### Unit 3.3 — Playback loop at handle level (not controller)

**Decision:** Implemented loop wrapping in `createPlaybackHandle` (via `options.loop`) rather than in the controller.

**Alternatives considered:** Controller-level loop management that restarts timelines — would require the controller to detect timeline completion and re-trigger, adding significant complexity and coupling.

**Rationale:** The handle already owns the rAF loop and timing. Adding modular wrapping there is minimal code (6 lines vs a callback-based coordinator). The controller can pass `loop: true` when creating handles if needed.

---

### Unit 4-A.1 — Internal EditorDocument / EditorPage types

**Decision:** Introduced `EditorDocument` and `EditorPage` types in the editor package that use `BroadsetElement[]` directly, instead of reusing the model's `BroadsetDocument` / `Page` types which use `PageElement` (with `screen?: Record<string, unknown>`).

**Alternatives considered:** (a) Add an index signature to `BroadsetScreenProps` in the model — would weaken the model's type safety for all consumers. (b) Use `PageElement` and cast back to `BroadsetElement` when needed — lots of unsafe casts throughout the store. (c) Make `PageElement.screen` typed as `BroadsetScreenProps` — would be a breaking change to the model's serialization-friendly `PageElement` interface.

**Rationale:** Under strict TypeScript (`exactOptionalPropertyTypes`, no index signatures), `BroadsetScreenProps` is not assignable to `Record<string, unknown>`. The editor works with fully typed elements internally, so using `BroadsetElement` directly is both safer and simpler. Conversion to/from `BroadsetDocument` happens at the boundary (load/save).
