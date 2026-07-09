# PPTX known production gaps

Status: historical gap evidence from legacy Phase 8. Current status is in [plan-progress.md](./plan-progress.md); current destinations are W3-CORPUS-01, W3-PPTX-01, W3-QE-01, W2-A11Y-01, and W6-REL-01.

This file lists honest production-readiness gaps for the PPTX
import / export track as of the end of the legacy Phase 8 push. Items here
are NOT closed — they are tracked here so the spec, the
implementation plan, and the release readiness review stay aligned.

Each gap names the concrete code / infra / spec change required to
close it. When closed, move the entry to the corresponding "Spec
Gaps" section in [project/spec/formats/pptx.md](../spec/formats/pptx.md)
(if user-visible) or remove it (if internal). Do not silently delete.

> **Tracked closures:** the entries below are scheduled across the
> cross-format I/O improvement program (CFIO — status in [plan-progress.md](./plan-progress.md) §CFIO):
>
> - **B3** (accessibility audit on new modals) — legacy CFIO 5.5 → W2-A11Y-01.
> - **S1** (CI jobs unverified end-to-end) — closes once branch lands.
> - **S2** (PowerPoint-on-Windows sanity) — legacy CFIO 5.2 → W3-QE-01/W6-REL-01.
> - **S3** (visual fidelity coverage) — legacy CFIO 5.1 → W3-QE-01.
> - **B2** (real-world large-deck load testing) — legacy CFIO 5.7 → W3-PPTX-01/W3-QE-01.

## Tier S — verify before general release

### S1. New CI jobs unverified end-to-end

`pptx-libreoffice-verify` and `pptx-xsd-validate` were added in this
session but have never run on a real GitHub Actions runner. Possible
failure modes:

- `apt-get install libreoffice` slow / wrong package set.
- `actions/setup-dotnet@v4` install timing or cold-start NuGet
  restore on the validator project.
- LibreOffice headless misbehaving without an Xvfb wrapper on the
  runner image.
- The `/error/i` regex in `libreoffice-verify.test.ts` flagging
  legitimate LibreOffice info-log lines (e.g. fontconfig warnings).

**To close:** push the branch, watch the two new jobs run on Actions,
fix any environment-specific failures, observe both pass twice in a
row before relying on them as gates.

### S2. No PowerPoint-on-Windows sanity check

LibreOffice ≠ PowerPoint. The spec acceptance is "PowerPoint Inspect
Document zero warnings". We have OOXML schema validity (XSD job) and
LibreOffice headless render success — that's a strong signal but not
the contract. PowerPoint has its own quirks that schema-valid OOXML
can still trip.

**To close:** before each release, manually open the canonical
fixture (`pptx/fixtures/canonical.ts` build) and 2–3 corpus
fixtures (`tika-charts.pptx`, `poi-with-master.pptx`,
`poi-table.pptx`) in PowerPoint on Windows. Run File → Info → Check
for Issues → Inspect Document. Capture results in a release-notes
table.

### S3. No visual fidelity coverage

All current gates are structural: no exception, schema valid,
byte-correct round-trip, perf scaling. We never compare rendered
output against a reference image. A regression that shifts how a
gradient fills, how a path strokes, or where text wraps would ship.

**To close:** add a `pptx-visual-snapshot` CI job that uses
`libreoffice --headless --convert-to png` (or `pdf`-then-pdftoppm) on
the canonical fixture, compares against a checked-in reference PNG
with a perceptual diff (e.g. `pixelmatch` at <1% threshold), and
fails on regressions. Reference image needs hand-review on
generation. Different LibreOffice versions render differently — pin
the apt package version to keep the reference stable.

## Tier A — known scope cuts

### A3. Connectors / ink / SmartArt are preserve-only, not first-class

`<p:graphicFrame>` (table / chart / SmartArt) and `<p:cxnSp>` /
`<p:contentPart>` round-trip via `extensions.pptx.raw` byte
preservation. They render as a placeholder rectangle in the
Broadset canvas — users can't edit them in Broadset, only in the
external tool. First-class native authoring is out of scope.

**To close:** would require new Broadset element types (table,
chart, connector, ink) and corresponding model + renderer support.
Tracked under W3-PPTX-01's native-or-explicitly-labeled-fallback decision; legacy Phase 8 did not deliver it.

## Tier B — operational concerns

### B2. No real-world large-deck load testing

`pptx/performance.test.ts` covers 1000 small rectangles in 5 s.
Production decks include hundreds of slides with thousands of
complex shapes (text bodies, gradients, picture fills, custGeom
paths). The 200 MiB input cap is plumbed but the practical perf at
scale is unverified.

**To close:** acquire 3–5 representative large decks under
permissive licence (Apache POI's larger test files might qualify),
add to a separate `pptx-perf-suite` test that runs on a slower CI
job, pin per-fixture import + export budgets.

### B3. No accessibility audit on new modals

`FormatImportWarningsModal` and `FormatReconciliationModal` have
aria-labels and the `Accordion` is HeroUI-built so it inherits a11y
defaults. But: no screen-reader walkthrough, no focus-trap
verification on the modal close, no keyboard-only navigation test
of the Accordion expand / collapse.

**To close:** run the demo with VoiceOver / NVDA, fix focus and
labelling issues, add CT coverage for keyboard navigation of the
new modal surfaces.

## Other deferred items

These are tracked in [project/spec/formats/pptx.md](../spec/formats/pptx.md)
under "Spec Gaps" and are repeated here for completeness so the
review checklist is single-source:

- **First-class Broadset table element.** `<a:tbl>` rounds-trips as
  raw blob; native authoring deferred.
- **First-class Broadset chart element.** Same as above for
  `<c:chart>`.
- **`<p:timing>` animations beyond the supported preset set.**
  Fade, fly, zoom, wipe, rotate, motion-path round-trip natively;
  every other PowerPoint preset drops with an
  `animation-preset-unsupported` warning.
- **CMYK / display-p3 edit-then-export downgrade (accepted gap).**
  Untouched round-trips are lossless via `BroadsetColor.originalColor`;
  edits resolve to sRGB. Print-workflow CMYK pipeline requires
  typed-colour-primitive model addition.
- **Real-world external-tool golden files.** The fetched corpus
  (Apache POI / Tika / python-pptx) covers tool quirks; the
  user-dropped local-licensed corpus (`test-fixtures/pptx/real/`)
  remains opt-in.
- **Keynote-specific round-trip.** Keynote strips `<p:extLst>`
  extensions on re-save. Treated as a lossy endpoint; content-hash
  fallback recovers identity for visually-unchanged elements.

## How to close a gap

1. Implement the change.
2. Move the entry to the corresponding "Spec Gaps" section in
   [project/spec/formats/pptx.md](../spec/formats/pptx.md) (if
   user-visible) or delete it from this file (if purely internal).
3. Reference the closing commit in the spec entry.
4. Cross-check: this file should always be a strict superset of
   internal-only gaps + a pointer to the spec for user-visible
   ones. No item is in both files at the same time.
