# Producer Fixture Acquisition Guide

Date: 2026-04-28
Status: ready for execution
Companion to: [`real-producer-compatibility.md`](./real-producer-compatibility.md), [`release-quality-closure-plan.md`](./release-quality-closure-plan.md) RQ-5..RQ-8.

This is a hand-off doc for an agent (or human) who can run real producer software (Photoshop, PowerPoint, Illustrator, etc.) to acquire the fixtures Broadset needs for release validation. It tells you exactly what to build, in which tool, where to put it, and how to wire it into the test harness.

The harness (`packages/formats/src/_shared/test-infrastructure/producer-fixtures.ts`) is already wired. Once a producer directory has files matching its manifest, the matching test suite picks them up automatically.

## Step 0 — Prerequisites

Required:

- A workstation with the producer software installed (Photoshop, PowerPoint, Illustrator, etc.). Different fixtures need different producers — see Step 3.
- A clone of the Broadset repository.
- `npm ci` from a clean checkout, then `npm run gate:full` green.
- An out-of-repo directory you control to host private/licensed fixtures.

Optional:

- GIMP, Krita, Inkscape (free) for the Class A redistributable fixtures.
- Figma, Sketch, Canva accounts for cloud-export fixtures.

## Step 1 — Set up the private mount root

Pick a directory **outside this repo**:

```bash
export BROADSET_PRIVATE_FIXTURE_ROOT="$HOME/broadset-private-fixtures"
mkdir -p "$BROADSET_PRIVATE_FIXTURE_ROOT"
```

Add the `export` line to your shell profile (`.zshrc` / `.bashrc`) so it persists across sessions.

The harness reads this env var. When it is **unset**, Class C fixture tests skip with an explicit message in normal local runs. When `RELEASE_VALIDATION=1` is also set, the harness fails fast if the mount is missing — this is what the release CI job runs.

## Step 2 — Build the directory tree

```
$BROADSET_PRIVATE_FIXTURE_ROOT/
├── pptx/
│   ├── powerpoint-windows/
│   ├── powerpoint-mac/
│   ├── keynote/
│   ├── google-slides/
│   └── canva/
├── pdf/
│   ├── illustrator-save-as/
│   ├── illustrator-export/
│   ├── indesign/
│   ├── figma/
│   ├── preview/
│   └── word/
├── psd/
│   ├── photoshop-mac/
│   ├── photoshop-windows/
│   ├── affinity-photo/
│   ├── photopea/
│   ├── colorspace-icc/
│   └── bitdepth/
└── svg/
    ├── illustrator-save-as/
    ├── illustrator-export/
    └── affinity-designer/
```

Class A (committable, redistributable) fixtures go in **the repo** under `packages/formats/src/<format>/__fixtures__/<producer>/` instead of the private mount. Each Class A file MUST be ≤ 1 MB.

## Step 3 — Per-format fixture instructions

### PPTX

#### P-1 PowerPoint Windows 365 (Class C — required)

Run on Windows 11. Path: `$BROADSET_PRIVATE_FIXTURE_ROOT/pptx/powerpoint-windows/`.

Build and save these files via **File → Save As → PowerPoint Presentation (.pptx)**:

| File                              | Build steps                                                                                       | What it exercises                                     |
| --------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `simple-text.pptx`                | One slide. Title placeholder + one bullet body.                                                   | Basic shape→text round-trip.                          |
| `multi-slide-deck.pptx`           | 5 slides. Each has a title, body text, and one image.                                             | Slide enumeration, per-slide page instances.          |
| `tables-and-charts.pptx`          | Slide 1: 4×4 table. Slide 2: column chart with 3 categories.                                      | Tests `table.ts` / `chart.ts` (currently 0% covered). |
| `transitions-and-animations.pptx` | One slide with an entrance + an exit animation. Use Animations tab.                               | Timing-tree importer.                                 |
| `embedded-fonts.pptx`             | One slide using a non-system font. Save with **Embed fonts in the file** (File → Options → Save). | `ppt/fonts/` part extraction.                         |
| `large-deck-100-slides.pptx`      | 100+ slides. Build via Insert → Slides from Outline using a ~100-line text file.                  | Large-deck stress (P-8 row).                          |

#### P-2 PowerPoint Mac (Class C — required)

Run on macOS 14+. Path: `$BROADSET_PRIVATE_FIXTURE_ROOT/pptx/powerpoint-mac/`.

Same six fixtures as P-1, built on Mac Office. Different code path produces subtly different OOXML.

#### P-3 PowerPoint Web (Class D — manual sanity)

No file fixtures. Open `simple-text.pptx` (from P-1) in PowerPoint Web. Verify:

1. Opens without a "There's a problem with this file" banner.
2. Edit one character; save.
3. Download → re-import into Broadset via the demo's import flow.
4. Document any drift in `real-producer-compatibility.md` row P-3.

#### P-4 Keynote (Class C — required)

Run on macOS 14+. Path: `$BROADSET_PRIVATE_FIXTURE_ROOT/pptx/keynote/`.

Build the same six fixtures **in Keynote**, then for each: **File → Export To → PowerPoint…** and save under `keynote/`.

Expected behavior: Keynote drops some OOXML tags on export. Document which ones in the matrix's `Notes` column.

#### P-5 Google Slides (Class C — required)

Run in any browser. Path: `$BROADSET_PRIVATE_FIXTURE_ROOT/pptx/google-slides/`.

Build the same six fixtures **in Google Slides**, then for each: **File → Download → Microsoft PowerPoint (.pptx)**. Save under `google-slides/`.

Expected behavior: Google Slides reformats tags. Document differences.

#### P-6 LibreOffice Impress (Class A — committable)

Path: `packages/formats/src/pptx/__fixtures__/libreoffice/`. License: MIT (LibreOffice's own outputs are MIT-relicensable).

Build small versions of the same fixtures in LibreOffice Impress. Each ≤ 1 MB. Save with **File → Save As → Microsoft PowerPoint 2007-365 (.pptx)**.

Add a `MANIFEST.md` row per file (see Step 4).

#### P-7 Canva (Class C — optional)

Requires Canva PRO. Path: `$BROADSET_PRIVATE_FIXTURE_ROOT/pptx/canva/`.

Build a one-slide design in Canva, **Download → PowerPoint**.

#### P-8 Large-deck stress (Class B — generated by script)

Already partially covered by `large-deck-100-slides.pptx` (P-1 #6). The script-generated alternative under `packages/formats/scripts/generate-large-pptx.mjs` will produce a 250-slide synthetic deck via `pdf-lib`-style fixture generation. Don't acquire — wait for the generator to land.

#### P-9 Visual-fidelity CI (Class B + D)

Render the canonical Broadset export deck via headless LibreOffice (Class B), pixel-diff against committed reference under `__fixtures__/visual-baseline/`. The reference images need to come from a manual visual review against PowerPoint's actual rendering (Class D). Document the protocol in the matrix `Notes`.

### PDF

#### F-1 Illustrator Save As PDF (Class C — required)

Run with Adobe Illustrator (any recent version). Path: `$BROADSET_PRIVATE_FIXTURE_ROOT/pdf/illustrator-save-as/`.

Build a 3-page Illustrator document:

- Page 1: mixed text + paths (rectangles, lines, freeform).
- Page 2: raster + linked images (File → Place to embed at least one).
- Page 3: spot color (Window → Swatch Libraries → Color Books → PANTONE Solid Coated, drag any swatch onto an object) and CMYK fill.

**File → Save As → Adobe PDF** with these presets, saving as separate files:

| File          | Preset                 |
| ------------- | ---------------------- |
| `default.pdf` | `[High Quality Print]` |
| `pdfx-3.pdf`  | `[PDF/X-3:2002]`       |
| `pdfa-2b.pdf` | `[PDF/A-2b]`           |

#### F-2 Illustrator Export PDF (Class C — required)

Same source AI file as F-1. Path: `$BROADSET_PRIVATE_FIXTURE_ROOT/pdf/illustrator-export/`.

**File → Export → Export As → PDF**. Different code path emits different operator streams.

Same three variants (`default.pdf`, `pdfx-3.pdf`, `pdfa-2b.pdf`).

#### F-3 Acrobat Print to PDF (Class D — manual)

No fixtures. Manual protocol:

1. Open a Broadset-exported PDF in any viewer.
2. **File → Print → PDF → Save as Adobe PDF…** (must have Acrobat installed for that printer to appear on macOS).
3. Re-import the printed PDF via the Broadset demo.
4. Document fidelity loss in matrix row F-3.

#### F-4 InDesign Export (Class C — required)

Run with Adobe InDesign. Path: `$BROADSET_PRIVATE_FIXTURE_ROOT/pdf/indesign/`.

Build a one-spread document:

- Two text frames using paragraph styles.
- Two embedded images (File → Place).
- An OCG layer: Window → Layers → name a new layer "Translation" and put one element on it.

Save:

| File                  | Preset                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------- |
| `interactive-ocg.pdf` | `[High Quality Print]` with **General → View: Layers** and **Compatibility: Acrobat 8 (PDF 1.7)** |
| `print-ready.pdf`     | `[Press Quality]`                                                                                 |

#### F-5 Figma (Class C — required)

Run in Figma. Path: `$BROADSET_PRIVATE_FIXTURE_ROOT/pdf/figma/`.

Build a Figma frame with text + vectors + a single bitmap.

**Export → PDF**. Save:

| File                   | Settings                                               |
| ---------------------- | ------------------------------------------------------ |
| `figma-frame.pdf`      | Default export                                         |
| `figma-include-bg.pdf` | With "Include in export" toggled on for the background |

#### F-6 macOS Preview Export (Class C — optional)

Run on macOS. Path: `$BROADSET_PRIVATE_FIXTURE_ROOT/pdf/preview/`.

Open any source PDF in Preview. **File → Export As → PDF**. Save as `preview-roundtrip.pdf`. Tests Preview's QuickLook rewriter.

#### F-7 Word Save As PDF (Class C — required)

Run with Microsoft Word on Windows AND on macOS. Path: `$BROADSET_PRIVATE_FIXTURE_ROOT/pdf/word/`.

Build `Test.docx` with: heading 1, body paragraph, two hyperlinks, a 3×3 table, an inline image. Save the same `.docx` file via **File → Save As → PDF** on each OS:

| File               | OS         | Option                                               |
| ------------------ | ---------- | ---------------------------------------------------- |
| `word-windows.pdf` | Windows 11 | Standard                                             |
| `word-mac.pdf`     | macOS 14+  | Standard                                             |
| `word-tagged.pdf`  | Windows 11 | "Best for electronic distribution and accessibility" |

#### F-8 LaTeX / pdflatex (Class B — generated)

Don't acquire. The script under `packages/formats/scripts/generate-pdflatex-fixtures.*` (to be written) will run pdflatex on a fixed `.tex` source set.

#### F-9, F-10, F-11 (already wired)

`pdfkit`, `jsPDF`, and importer-fuzz are already exercised by tests in the formats package. No fixture acquisition needed; verify the rows pass at signoff.

### PSD

#### S-1 Photoshop macOS (Class C — required, hardest)

Run with Photoshop on macOS 14+. Path: `$BROADSET_PRIVATE_FIXTURE_ROOT/psd/photoshop-mac/`.

Build and save eight PSDs:

| File                    | Build steps                                                                                     | What it exercises                              |
| ----------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `single-raster.psd`     | One bitmap layer with a solid fill.                                                             | Sanity baseline.                               |
| `vector-mask.psd`       | A shape layer with a vector mask (e.g. rounded-rectangle clip on a fill).                       | Vector-mask preservation.                      |
| `text-layer.psd`        | One editable Type layer. Mid-text, change weight to bold and color via Character panel.         | Mixed-run text round-trip.                     |
| `smart-object.psd`      | File → Place Embedded → choose any image. Result is a smart-object layer.                       | `placedLayer` / `linkedFiles` import path.     |
| `layer-effects.psd`     | One layer with drop-shadow, outer-glow, and inner-shadow effects enabled (Layer → Layer Style). | `extractDropShadow`, `extractOuterGlowFilter`. |
| `nested-groups.psd`     | Three nested groups, 5 layers deep. Use Layer → Group Layers repeatedly.                        | `maxDepth` budget.                             |
| `artboards.psd`         | 3 artboards (Artboard tool), each with 2-3 elements.                                            | Per-artboard page instances.                   |
| `bitmap-layer-mask.psd` | A layer with a non-rectangular bitmap mask (Layer → Layer Mask → Reveal All, then paint).       | `extensions.psd.bitmapMask`.                   |

Save each via **File → Save As → Photoshop (\*.PSD)** with **Maximize Compatibility** ON.

#### S-2 Photoshop Windows (Class C — required)

Run on Windows 11. Path: `$BROADSET_PRIVATE_FIXTURE_ROOT/psd/photoshop-windows/`.

Same eight fixtures. Differences in `additionalInfo` byte order; PSB version-2 testing lives here. To create a PSB-2 file: **File → Save As → Photoshop Big** (only available for files > 30,000 px on a side, or enable in Preferences).

#### S-3 Photoshop Web/iPad (Class D — manual)

Open `single-raster.psd` (from S-1) in Photoshop Web or iPad. Verify it opens. Edit, save, re-import into Broadset. Note any drift.

#### S-4 Affinity Photo (Class C — required)

Run with Affinity Photo. Path: `$BROADSET_PRIVATE_FIXTURE_ROOT/psd/affinity-photo/`.

Build the same eight fixtures **in Affinity Photo**, then for each: **File → Export → Adobe Photoshop (.psd)**.

Expected: Affinity strips Photoshop XMP. The harness's `s-11 xmp-strip-detect` test asserts the importer's "XMP missing" warning fires correctly.

#### S-5 Photopea (Class C — required, free web app)

Run in https://www.photopea.com (free, browser-based). Path: `$BROADSET_PRIVATE_FIXTURE_ROOT/psd/photopea/`.

Build the same eight fixtures, **File → Export As → PSD**. Photopea's `additionalInfo` differs from Photoshop's — that's the test.

#### S-6 GIMP (Class A — committable, GPL-compatible)

Run with GIMP. Path: `packages/formats/src/psd/__fixtures__/gimp/`. License: MIT (GIMP outputs are MIT-relicensable).

Build the same eight fixtures in GIMP. **File → Export As → .psd**. Each ≤ 1 MB. Add `MANIFEST.md` rows.

#### S-7 Krita (Class A — committable, public domain)

Run with Krita. Path: `packages/formats/src/psd/__fixtures__/krita/`. License: CC0-1.0.

Build the same eight fixtures, **File → Export → PSD**. ≤ 1 MB each. Add `MANIFEST.md` rows.

#### S-8 Figma PSD export (Class C — optional)

Use Figma's PSD export (plugin or programmatic API). Path: `$BROADSET_PRIVATE_FIXTURE_ROOT/psd/figma/`.

#### S-9 CMYK / Lab / Grayscale + ICC (Class C — required)

Run with Photoshop on macOS. Path: `$BROADSET_PRIVATE_FIXTURE_ROOT/psd/colorspace-icc/`.

Open a 1000×1000 sample with embedded raster + text, then:

| File                     | Steps                                                          |
| ------------------------ | -------------------------------------------------------------- |
| `cmyk-with-icc.psd`      | Image → Mode → CMYK Color. Save with **Embed ICC profile** on. |
| `lab-with-icc.psd`       | Image → Mode → Lab Color. Save with embedded profile.          |
| `grayscale-with-icc.psd` | Image → Mode → Grayscale. Save with embedded gray profile.     |

Tests `output.colorSpace` round-trip and the `embedIccProfile` option.

#### S-10 Bit-depth fixtures (Class C — required)

Path: `$BROADSET_PRIVATE_FIXTURE_ROOT/psd/bitdepth/`.

| File        | Steps                                               |
| ----------- | --------------------------------------------------- |
| `8bpc.psd`  | Default 8 bits/channel image.                       |
| `16bpc.psd` | Image → Mode → 16 Bits/Channel before saving.       |
| `32bpc.psd` | Image → Mode → 32 Bits/Channel before saving (HDR). |

#### S-11 XMP-stripping detection (Class B — generated)

Don't acquire. The script `packages/formats/scripts/generate-xmp-strip-fixtures.*` (to be written) will save the same source through Affinity / Photopea / Krita, then assert the importer's "XMP missing" warning fires correctly.

### SVG

Most SVG producers redistribute their output freely, so nearly all SVG fixtures are Class A (committable).

#### V-1 Illustrator Save As SVG (Class C — required)

Run with Illustrator. Path: `$BROADSET_PRIVATE_FIXTURE_ROOT/svg/illustrator-save-as/`.

Build an Illustrator document containing each of:

- Text on a path.
- Gradient fill (linear and radial).
- Drop-shadow filter (Effect → Stylize → Drop Shadow).
- Embedded raster (File → Place, then Embed).
- A symbol with `<use>` references (Window → Symbols → drag instances).
- Both RGB and CMYK colors on the same artboard.

**File → Save As → SVG** at default settings. Save:

| File                             | Decimal Places preset                       |
| -------------------------------- | ------------------------------------------- |
| `illustrator-default.svg`        | Default                                     |
| `illustrator-presentation.svg`   | CSS Properties: **Presentation Attributes** |
| `illustrator-style-elements.svg` | CSS Properties: **Style Elements**          |

#### V-2 Illustrator Export As SVG (Class C — required)

Same source AI file as V-1. Path: `$BROADSET_PRIVATE_FIXTURE_ROOT/svg/illustrator-export/`.

**File → Export → Export As → SVG**. Save same three variants. Different code path than Save As emits different element shapes.

#### V-3 Inkscape Plain SVG (Class A — committable)

Run with Inkscape. Path: `packages/formats/src/svg/__fixtures__/inkscape-plain/`. License: CC0-1.0.

Build the same fixture (same content as V-1), **File → Save As → Plain SVG**. ≤ 1 MB. Plain SVG is W3C-canonical (no `sodipodi:` / `inkscape:` namespaces).

#### V-4 Inkscape SVG (Class A — committable)

Path: `packages/formats/src/svg/__fixtures__/inkscape/`. License: CC0-1.0.

Same source, **File → Save As → Inkscape SVG** (preserves the sodipodi/inkscape namespaces). Tests `sodipodi:` namespace handling and namespace-warn-then-strip.

#### V-5 Figma (Class A — committable, Figma allows redistribution of own-output SVG)

Path: `packages/formats/src/svg/__fixtures__/figma/`. License: CC0-1.0.

Build a frame in Figma with text, vectors, a mask. **Export → SVG**. ≤ 1 MB.

#### V-6 Sketch (Class A — committable)

Run with Sketch on macOS. Path: `packages/formats/src/svg/__fixtures__/sketch/`. License: MIT.

Same fixture, **File → Export → SVG**.

#### V-7 Affinity Designer (Class C — optional)

Run with Affinity Designer. Path: `$BROADSET_PRIVATE_FIXTURE_ROOT/svg/affinity-designer/`.

**File → Export → SVG**. Optional row.

#### V-8 d3.js (Class B — generated)

Don't acquire. Script under `packages/formats/scripts/generate-d3-fixtures.mjs` will render canonical d3 charts (bar, line, force-directed) to SVG strings. Wait for the script.

#### V-9 Hand-authored stress (Class A — author yourself)

Path: `packages/formats/src/svg/__fixtures__/stress/`. License: CC0-1.0 (you wrote them).

Author small SVG files exercising one feature each:

| File                       | Content                                                                                |
| -------------------------- | -------------------------------------------------------------------------------------- |
| `filters-blur.svg`         | A `<filter>` with `<feGaussianBlur stdDeviation="5"/>` applied to one `<rect>`.        |
| `filters-color-matrix.svg` | A `<filter>` with `<feColorMatrix type="matrix" values="…"/>` applied to one `<rect>`. |
| `symbols-use.svg`          | One `<symbol>` defined once, referenced 50 times via `<use href="…">`.                 |
| `text-on-path.svg`         | A `<textPath>` curving along a `<path>`.                                               |
| `fonts-fallback.svg`       | An explicit `font-family` chain with a custom `@font-face` block.                      |

#### V-10 Browser-captured (Class A)

Path: `packages/formats/src/svg/__fixtures__/browser-captured/`. License: depends on captured library.

For each of Highcharts, Chart.js, ApexCharts:

1. Open a public demo page that renders the chart.
2. Right-click the SVG node → Inspect.
3. In DevTools, right-click the `<svg>` → Copy → Copy outerHTML.
4. Paste into a `.svg` file with the standard XML + namespace wrapper:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" …>
  <!-- pasted DOM -->
</svg>
```

One file per library. Verify the captured library's SVG is under a redistribution-permissive license (most chart-library demo pages are MIT or under their company's content license — check before committing). When unsure, drop the fixture under `$BROADSET_PRIVATE_FIXTURE_ROOT/svg/browser-captured/` (Class C) instead.

#### V-11 Hostile cases (Class A — author yourself)

Path: `packages/formats/src/svg/__fixtures__/hostile/`. License: CC0-1.0.

Already partially covered by `svg/security-audit.test.ts`. Add committed files for:

| File                     | Content                                                                                                                |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `script-tag-bomb.svg`    | An `<svg>` with an embedded `<script>` (the importer must reject/strip it).                                            |
| `event-handler-bomb.svg` | An `<svg>` with `<g onload="alert(1)">` (handler attribute must be stripped).                                          |
| `xxe-doctype.svg`        | An `<svg>` with `<!DOCTYPE … [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>`.                                            |
| `use-fanout.svg`         | A `<use>` chain with high fan-out (10 `<use>` elements each referring to a `<g>` containing 10 more `<use>` elements). |

Tests assert the importer rejects/sanitizes each.

#### V-12, V-13 Chains (Class D — manual)

No fixture files. Manual protocol per release:

- **V-12 Illustrator chain**: export Broadset canonical doc to SVG → open in Illustrator → save → re-import. Verify content survives.
- **V-13 Inkscape chain**: same pattern through Inkscape.

Document results in matrix rows V-12, V-13 each release.

## Step 4 — Add manifest entries for every committed (Class A) file

For every Class A file you commit, append a row to its directory's `MANIFEST.md`. If the file does not exist yet, create it with the header:

```md
# <Producer> Fixture Manifest

| File | Format | Producer | Producer version | OS  | Export path | License | Expected import | Expected re-export | Known limitations |
| ---- | ------ | -------- | ---------------- | --- | ----------- | ------- | --------------- | ------------------ | ----------------- |
```

Every required field must be filled per the rules in `real-producer-compatibility.md` § "Manifest format". Example row:

```md
| simple-text.svg | svg | Inkscape | 1.4.0 | macOS 14 | File → Save As → Plain SVG | CC0-1.0 | One text element, one path | Round-trips with `data-bs-id` tags | Inkscape uses `text-anchor` for alignment; verify Broadset preserves it |
```

Class C (private mount) fixtures do **not** need a `MANIFEST.md` in the mount tree — their manifest lives next to the test file in the repo, where the loader test is wired (see Step 5).

## Step 5 — Wire each producer directory into a test suite

Once a producer's directory has fixtures, add a `<producer>-corpus.test.ts` under the format package. Example for PSD Photoshop macOS:

```ts
// packages/formats/src/psd/photoshop-mac-corpus.test.ts
import { describe, expect, it } from 'vitest';
import { loadPrivateFixtures, type ProducerFixtureManifestRow } from '../_shared/test-infrastructure/producer-fixtures';
import { importPsdDocument } from './import-document';

const MANIFEST: readonly ProducerFixtureManifestRow[] = [
  {
    file: 'single-raster.psd',
    format: 'psd',
    producer: 'Adobe Photoshop',
    producerVersion: '2025',
    os: 'macOS 14',
    exportPath: 'File → Save As → Photoshop',
    license: 'private-mount',
    expectedImport: 'One image element with the layer bitmap.',
    expectedReExport: 'Round-trips with bitmap intact.',
  },
  // ...one row per file under photoshop-mac/
];

describe('PSD producer corpus — Photoshop macOS', () => {
  const result = loadPrivateFixtures({
    format: 'psd',
    producerSlug: 'photoshop-mac',
    manifest: MANIFEST,
  });

  if (result.status === 'skipped') {
    it.skip('private fixtures not mounted; set BROADSET_PRIVATE_FIXTURE_ROOT', () => undefined);
    return;
  }

  if (result.status === 'missing-required') {
    throw new Error(`RELEASE_VALIDATION mode: ${result.skipReason}`);
  }

  for (const fixture of result.fixtures) {
    it(`imports ${fixture.manifest.file} without warnings`, () => {
      const importResult = importPsdDocument(fixture.bytes);
      expect(importResult.warnings.find((w) => /failed/i.test(w))).toBeUndefined();
      expect(importResult.document.elements.length).toBeGreaterThan(0);
    });
  }
});
```

Run:

```bash
npm run test -w @broadset/formats -- src/psd/photoshop-mac-corpus
```

In normal mode the test skips (no mount). With `BROADSET_PRIVATE_FIXTURE_ROOT` set, it runs.

## Step 6 — Update the matrix row

For each row in `real-producer-compatibility.md` § "Producer Matrix", change the `Status` column from `untriaged` to one of:

- `pass` — all fixtures imported with no `failed` warnings, expected behavior matches.
- `fail` — at least one fixture failed; add a Spec Gap entry in the format's spec file (`project/spec/formats/<format>.md` § "Spec Gaps") describing the gap.
- `waived` — the row is intentionally not validated this release; cite the waiver reason and the next-release re-check date.

Add the validation date and your name/handle in the `Notes` column.

## Step 7 — Release validation pass

Once every required-class row is `pass` / `waived`:

```bash
RELEASE_VALIDATION=1 npm run test -w @broadset/formats
RELEASE_VALIDATION=1 npm run gate:full
```

Both should exit 0. The release-signoff table at the bottom of `real-producer-compatibility.md` gets filled in.

## Effort + cost estimate

| Producer set                                                       | Effort                   | License cost                     |
| ------------------------------------------------------------------ | ------------------------ | -------------------------------- |
| Class A (GIMP / Krita / Inkscape / Figma / Sketch / hand-authored) | 3-5 h per format         | $0 (or existing accounts)        |
| Class C — Photoshop (S-1, S-2, S-9, S-10)                          | ~10 h                    | Adobe CC ($60+/mo)               |
| Class C — PowerPoint (P-1, P-2)                                    | ~6 h                     | Microsoft 365 ($10+/mo)          |
| Class C — Illustrator (F-1, F-2, V-1, V-2)                         | ~8 h                     | Adobe CC (shared with Photoshop) |
| Class C — InDesign (F-4)                                           | ~4 h                     | Adobe CC (shared)                |
| Class C — Affinity Photo / Designer (S-4, V-7)                     | ~4 h                     | $70 one-time per app             |
| Class D — manual sanity (P-3, F-3, S-3, V-12, V-13)                | ~30 min each per release | $0                               |

Total first-pass acquisition with Adobe CC + Microsoft 365 subscriptions on hand: **~40-50 hours** of focused work plus ~2-3 weeks of license access.

## Priorities if budget or time is tight

1. **PowerPoint Windows + macOS** (P-1, P-2). Highest user impact; PPTX is the format with the broadest producer matrix.
2. **Photoshop macOS** (S-1) + colorspace fixtures (S-9). The current PSD spec overclaims color support; fixtures here close the most concrete release-blocking gap.
3. **Illustrator Save As PDF** (F-1) + **Word Save As PDF** (F-7). Together cover ~80% of real-world PDF imports users encounter.
4. **Inkscape + Figma + Sketch SVG** (V-3, V-4, V-5, V-6). Free or already-have-account; commit them as Class A and they help every release without re-acquisition.

## Done state

This guide is done when:

- Every required-class row in `real-producer-compatibility.md` has at least one fixture in the right directory.
- Each Class A directory has a complete `MANIFEST.md`.
- A `<producer>-corpus.test.ts` file exists for every directory and `npm run test` skips cleanly when the mount is unset.
- `RELEASE_VALIDATION=1 npm run test -w @broadset/formats` exits 0 with the mount set.
- The matrix in `real-producer-compatibility.md` shows no `untriaged` rows for required classes.
