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
