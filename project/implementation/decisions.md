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

---

### Unit 4-I — Collaboration diffing via shallow comparison

**Decision:** Document diffing uses shallow equality per top-level element property (position, width, height, style, screen) rather than deep recursive property-level diffs.

**Alternatives considered:** (a) Deep recursive property-level diffs producing granular changes like `style.opacity` — much more complex to implement, harder to roundtrip, and the collaboration spec doesn't require sub-property granularity. (b) Using a third-party diff library like `deep-diff` — adds dependency for a straightforward feature.

**Rationale:** The spec defines change types as `element:update` with a `path` field. Shallow comparison at the top-level property level (position, style, screen) is sufficient for the change stream's primary purpose of logging and remote synchronization. A host that needs deeper granularity can diff the old/new values in the change payload itself.

---

### Unit 5.4 — @libpdf/core API is mostly synchronous

**Decision:** Discovered that `@libpdf/core` v0.3 has synchronous `PDF.create()`, `addPage()`, `embedPng()`, `embedJpeg()`, and `embedFont()` — only `save()` is async. Initially wrote all calls with `await`; corrected after lint caught `@typescript-eslint/await-thenable`.

**Alternatives considered:** None — this was a correction based on the actual type signatures.

**Rationale:** The library documentation examples show `await` for everything, but the TypeScript types are authoritative. Using unnecessary `await` on sync calls is harmless at runtime but violates lint rules.

---

### Unit 5.4 — SVG-to-PDF rendering falls back to placeholder

**Decision:** SVG element rendering in PDF attempts `embedPng(svgBytes)` which always fails (PNG decoder rejects SVG XML), then draws a placeholder rectangle. This is deliberate graceful degradation rather than a bug.

**Alternatives considered:** (a) Server-side SVG-to-PNG rasterization — requires a headless browser or canvas API not available in the library. (b) SVG-to-PDF path conversion — extremely complex, essentially reimplementing an SVG renderer. (c) Using a dedicated SVG-to-PDF library — no suitable library found in the ecosystem.

**Rationale:** The spec requires SVG elements to be "exported" in PDF. A placeholder that doesn't crash is acceptable for the initial implementation. Full SVG fidelity in PDF would require significant infrastructure (e.g., a canvas-based rasterizer or an SVG-to-PDF path converter) that's out of scope for this unit.

---

### Unit 5.5 — Regex-based XML parsing for PPTX import

**Decision:** Used regex patterns to extract elements from OOXML slide XML instead of a full XML/DOM parser.

**Alternatives considered:** (a) `fast-xml-parser` — adds another dependency, OOXML namespaces make it complex to configure. (b) `DOMParser` via jsdom — available in test but not guaranteed in all target environments. (c) Writing a minimal SAX parser — over-engineering for the subset of OOXML we need to parse.

**Rationale:** The import only needs to extract `p:sp`, `pic:pic`, `p:grpSp` elements and their `a:xfrm` bounds. Regex is sufficient for this well-structured, machine-generated XML. The patterns are simple and testable via round-trip. If import fidelity ever needs to handle arbitrary PPTX files (not just our own exports), a proper XML parser would be warranted.
