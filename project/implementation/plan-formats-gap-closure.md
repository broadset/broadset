# Formats Gap Closure Plan — SVG, PSD, PDF

**Package:** `packages/formats` (plus existing demo integration call paths where needed)
**Depends on:** Phase 10 baseline complete
**Index:** [plan.md](plan.md)
**Gap Source:** [gaps.md](gaps.md)

**Goal:** close the remaining format limitations in SVG import, PSD sync export, and PDF export while preserving spec-first behavior, no silent data loss, and strict package boundaries.

---

## Scope

- In scope:
  - SVG import currently skipping simple `<g>` and unsupported elements.
  - PSD sync export currently skipping URL-backed images.
  - PDF export currently drawing placeholders for SVG/non-embeddable image content and non-static types (`video`, `clock`, `ticker`).
- Out of scope:
  - Template-browser gap in demo.
  - VideoEncoder runtime support gap.

---

## Feature Group FGC-A: SVG Import Preservation Instead of Skip

_Spec anchors:_ `project/spec/formats/web-vector.md` (Import, Fallback Preservation, Error Recovery)

- [ ] tests: red
- [ ] impl: green

### Implementation targets

1. Replace simple `<g>` skip path with child flattening/import pass:
   - apply inherited transform/style where representable,
   - import supported children as native Broadset elements,
   - preserve relative order for stacking parity.
2. Replace unsupported element skip path with preserved `svg` payload fallback:
   - capture unsupported node markup into `svg` element content,
   - keep best-effort size/position when recoverable,
   - emit warning that fallback was used (not silently dropped).
3. Keep strict invalid-XML failure behavior unchanged.

### Tests to add

1. Mixed SVG fixture with supported + unsupported elements imports supported nodes natively and preserves unsupported nodes as `svg` payload elements.
2. Simple non-matrix group fixture imports group children instead of dropping group branch.
3. Warning list includes fallback warnings for preserved unsupported nodes.
4. Existing invalid-XML failure tests remain green.

### Done criteria

- No element content is silently dropped for unsupported-but-preservable SVG fragments.
- Existing warning contract remains intact.

---

## Feature Group FGC-B: PSD Sync URL Image Coverage

_Spec anchors:_ `project/spec/formats/psd.md` (Smart Object Export)

- [ ] tests: red
- [ ] impl: green

### Decision gate (first step)

Pick one path and implement fully (do not mix partially):

1. Preferred path: make sync API capable with caller-provided URL image bytes map.
   - Extend sync export API with optional prefetched image payload input.
   - If URL image payload exists in the map, embed as smart object in sync mode.
   - If missing, return explicit warning/error per chosen policy (no silent skip).
2. Alternate path: explicitly fail sync export when URL images exist and instruct caller to use async export.
   - This is acceptable only if behavior is deterministic and documented; no silent omission.

### Implementation targets

1. Remove silent-skip behavior for URL images in sync path.
2. Preserve current async URL-fetch path behavior and parity.
3. Ensure smart object embedding parity between data URI images and URL images when bytes are available.

### Tests to add

1. Sync export with URL image + provided bytes embeds smart object.
2. Sync export with URL image + missing bytes follows explicit failure/warning policy.
3. Async export still fetches and embeds URL images.
4. Regression: data URI image sync export still embeds correctly.

### Done criteria

- Sync export behavior for URL images is explicit, test-covered, and non-silent.
- Smart object AC coverage is complete for both sync and async paths.

---

## Feature Group FGC-C: PDF Fallback Upgrade for Placeholder Cases

_Spec anchors:_ `project/spec/formats/pdf.md` (Masked SVG fallback, multi-type rendering, static export)

- [ ] tests: red
- [ ] impl: green

### Implementation targets

1. Replace placeholder rectangle for SVG data URIs with real image embedding path:
   - rasterize SVG payload to PNG bytes using existing formats stack (no new cross-package boundary),
   - embed produced bitmap into PDF.
2. Replace placeholder for non-data-URI image/svg content when resolvable:
   - support optional fetch resolver to obtain bytes,
   - embed when byte decoding succeeds,
   - keep explicit placeholder fallback only for unrecoverable content.
3. Improve non-static type rendering strategy:
   - keep static-export semantics (t=0) for `video`, `clock`, `ticker`,
   - render deterministic textual/static snapshot where possible (for example, clock/ticker current content) instead of generic rectangle.

### Tests to add

1. SVG data URI no longer takes placeholder branch; PDF output includes embedded image path.
2. Non-data-URI image with resolver embeds image, unresolved URL still falls back with warning.
3. `clock` and `ticker` elements render deterministic static output (not plain placeholder rectangle).
4. Existing animated-at-rest tests stay green.

### Done criteria

- Placeholder usage in PDF path is reduced to truly unrecoverable cases.
- Static-export semantics remain intact and covered by tests.

---

## Execution Order

1. FGC-A SVG import preservation (lowest external dependency risk)
2. FGC-B PSD sync URL behavior hardening (API decision required)
3. FGC-C PDF fallback upgrade (largest behavior surface)

---

## Validation Gates

Run after each feature group:

1. `npm run quality -w @broadset/formats`
2. `npm run quality -w @broadset/demo` (only if demo integration/API contracts changed)

Run at plan completion:

1. `npm run quality:all`
2. `npm run build`

---

## Risks and Mitigations

1. SVG import transform complexity for nested groups:
   - mitigate with incremental fixtures (single group, nested group, mixed transforms).
2. PSD sync API churn:
   - mitigate by adding backward-compatible options object and preserving existing call signatures.
3. PDF rasterization determinism/perf:
   - mitigate with bounded raster dimensions and snapshot-based tests that assert branch behavior, not brittle byte equality.

---

## Progress

| Group                         | Red | Green |
| ----------------------------- | --- | ----- |
| FGC-A SVG import preservation | ☐   | ☐     |
| FGC-B PSD sync URL coverage   | ☐   | ☐     |
| FGC-C PDF fallback upgrade    | ☐   | ☐     |
