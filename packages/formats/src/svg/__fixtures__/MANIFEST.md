# SVG track real-world fixtures

These fixtures exercise the import → re-export → re-import chain against
shapes the synthetic fixtures in `chain-round-trip.test.ts` don't cover.
Each fixture pins a distinct surface — there's no overlap between them.

| File | Source | License | Exercises |
| --- | --- | --- | --- |
| [`material-home.svg`](./material-home.svg) | Google [Material Icons](https://github.com/google/material-design-icons) — `home` | Apache-2.0 | Bare-path icon (single `<path>`, implicit black fill) |
| [`heroicons-pencil.svg`](./heroicons-pencil.svg) | Tailwind [Heroicons](https://github.com/tailwindlabs/heroicons) — `pencil` outline | MIT | Stroke-only icon (`stroke-width` / `stroke-linecap` / `stroke-linejoin`) |
| [`bootstrap-gear.svg`](./bootstrap-gear.svg) | [Bootstrap Icons](https://github.com/twbs/icons) — `gear-fill` | MIT | Multi-subpath single `<path>` (outer ring + inner cutout via fill-rule) |
| [`w3c-gradient.svg`](./w3c-gradient.svg) | [W3C SVG 1.1](https://www.w3.org/TR/SVG11/pservers.html#LinearGradients) reference snippet | W3C document license (redistributable for testing) | Standards-canonical `<linearGradient>` import |
| [`w3c-smil-animate.svg`](./w3c-smil-animate.svg) | W3C-style SMIL sample (locally assembled from SVG 1.1 animation patterns) | W3C-compatible test fixture | Import-time SMIL stripping (`<animate>`, `<animateTransform>`, `<set>`) while preserving static geometry |
| [`inkscape-shapes.svg`](./inkscape-shapes.svg) | Locally authored — Inkscape-style structure | Broadset (this repo) | `sodipodi:` / `inkscape:` namespace surface, `<g inkscape:groupmode="layer">`, positional attrs |
| [`complex-document.svg`](./complex-document.svg) | Locally authored | Broadset (this repo) | `<text>` with `<tspan>` overrides + paragraph break, `<g transform>` hierarchy, `<polygon>`, `<use>` / `<symbol>` |

## Fixture additions require

1. Provenance row above (source + license + what it exercises).
2. Size **< 10 KB** per fixture — these test the importer, not raster fidelity.
3. License compatibility: MIT / Apache / W3C / Broadset-authored only. Skip
   proprietary tool exports (Illustrator, Figma) — they're user content
   even when the user is testing.
4. **No overlap** with an existing fixture's surface. If the new file tests
   the same thing as an existing one, expand the existing test instead.

## What's intentionally NOT here

- **Hostile / XSS samples.** The security suite in `import-third-party.test.ts`
  uses synthetic fixtures with explicit attacker payloads — those make the
  threat model legible. Real-world hostile SVG would be redundant.
- **SMIL animation fidelity.** Broadset intentionally drops animation
  commands on import per IO-D-16; the SMIL fixture validates safe
  stripping only (not animation preservation).
- **Illustrator / Figma exports.** Proprietary tool output is user content
  even when authored for testing; license risk isn't worth the marginal
  coverage. Inkscape (free, open source) covers the tool-namespace surface.
