# SVG track real-world fixtures

These fixtures exercise the import → re-export → re-import chain against
shapes the synthetic fixtures in `chain-round-trip.test.ts` don't cover.
Each fixture pins a distinct surface — there's no overlap between them.

> Outstanding gaps in the SVG track are tracked in
> [`../KNOWN-GAPS.md`](../KNOWN-GAPS.md). Read that before claiming
> the importer is "done" for a given deployment scenario.

| File | Source | License | Exercises |
| --- | --- | --- | --- |
| [`material-home.svg`](./material-home.svg) | Google [Material Icons](https://github.com/google/material-design-icons) — `home` | Apache-2.0 | Bare-path icon (single `<path>`, implicit black fill) |
| [`heroicons-pencil.svg`](./heroicons-pencil.svg) | Tailwind [Heroicons](https://github.com/tailwindlabs/heroicons) — `pencil` outline | MIT | Stroke-only icon (`stroke-width` / `stroke-linecap` / `stroke-linejoin`) |
| [`bootstrap-gear.svg`](./bootstrap-gear.svg) | [Bootstrap Icons](https://github.com/twbs/icons) — `gear-fill` | MIT | Multi-subpath single `<path>` (outer ring + inner cutout via fill-rule) |
| [`w3c-gradient.svg`](./w3c-gradient.svg) | [W3C SVG 1.1](https://www.w3.org/TR/SVG11/pservers.html#LinearGradients) reference snippet | W3C document license (redistributable for testing) | Standards-canonical `<linearGradient>` import |
| [`w3c-smil-animate.svg`](./w3c-smil-animate.svg) | W3C-style SMIL sample (locally assembled from SVG 1.1 animation patterns) | W3C-compatible test fixture | Import-time SMIL stripping (`<animate>`, `<animateTransform>`, `<set>`) while preserving static geometry |
| [`inkscape-shapes.svg`](./inkscape-shapes.svg) | Locally authored — Inkscape-style structure | Broadset (this repo) | `sodipodi:` / `inkscape:` namespace surface, `<g inkscape:groupmode="layer">`, positional attrs |
| [`complex-document.svg`](./complex-document.svg) | Locally authored | Broadset (this repo) | `<text>` with `<tspan>` overrides + paragraph break, `<g transform>` hierarchy, `<polygon>`, `<use>` / `<symbol>` |
| [`chrome-outerhtml.svg`](./chrome-outerhtml.svg) | Locally authored — Chrome `element.outerHTML` shape | Broadset (this repo) | Single-line markup, no XML prolog, explicit closing tags (`<circle></circle>`), no `xmlns:xlink` |
| [`illustrator-switch-wrapper.svg`](./illustrator-switch-wrapper.svg) | Locally authored — Adobe Illustrator `<switch>`/`<foreignObject>` wrapper shape | Broadset (this repo) | The Illustrator-CS through CC `<switch>` envelope: `<foreignObject requiredExtensions="ns_ai">` + sibling `<g i:extraneous="self">`. We could not find a small (<10 KB) MIT/Apache/CC0 real export carrying this exact wrapper, so the surface stays synthetic. The complementary `illustrator-cordova-bug.svg` covers the modern AI export shape. |

## Real tool-export fixtures (P7.7o — `git blame` for provenance audit)

The fixtures below are **unmodified bytes** from license-clean public
sources, downloaded specifically to exercise the importer against
ecosystem inputs we cannot synthesise faithfully. Each row cites the
permanent (commit-pinned) URL the bytes came from. The Broadset repo is
MIT-licensed; including these files under their original licenses is
compatible because none of them are linked at build time — they live in
test-only `__fixtures__` directories and are loaded via `readFileSync`.

| File | Source URL (commit-pinned) | License | Exercises |
| --- | --- | --- | --- |
| [`illustrator-cordova-bug.svg`](./illustrator-cordova-bug.svg) | [apache/cordova-docs · `bug_icon.svg`](https://github.com/apache/cordova-docs/blob/7312a685cfc1f7e8db91436817f0de2c573b6749/www/static/img/bug_icon.svg) | Apache-2.0 | Real Adobe Illustrator 19.1.0 export — `Generator` comment, `<style type="text/css">` with `.stN` class system, `class="stN"` on shapes (CSS-class fill resolution path) |
| [`figma-adobe-spectrum.svg`](./figma-adobe-spectrum.svg) | [adobe/react-spectrum · `ListBox.svg`](https://github.com/adobe/react-spectrum/blob/edc24b0ff9fdc9639fc062deb181f8ffc52c5331/packages/dev/docs/pages/assets/component-illustrations/ListBox.svg) | Apache-2.0 | Real Figma export — `data-name` attrs on every group (must NOT collide with `data-bs-id`), Figma's distinctive dual-`<rect>` stroke pattern (separate fill rect + stroke rect with 0.5-px offset), CSS variable references in `fill="var(--…)"` |
| [`sketch-wikimedia-adguard.svg`](./sketch-wikimedia-adguard.svg) | [Wikimedia Commons · `AdGuard.svg`](https://commons.wikimedia.org/wiki/File:AdGuard.svg) (uploader: KenigNat) | CC-BY-SA 4.0 + PD-textlogo | Real Sketch 52.2 export — `Generator: Sketch 52.2 (67145)` comment, `<title>` + `<desc>Created with Sketch.</desc>` blocks, `Page-1` wrapper group with cascading `stroke="none" fill="none" fill-rule="evenodd"`, decimal-precision `translate()` transforms |
| [`affinity-jimschubert-hi.svg`](./affinity-jimschubert-hi.svg) | [jimschubert/hi · `assets/icon.svg`](https://github.com/jimschubert/hi/blob/c5b8263e52aee9c9decf5324cbb1cac836ffbb30/assets/icon.svg) | Apache-2.0 | Real Affinity Designer export — `<!-- Export settings for Affinity Designer: ... -->` comment, `xmlns:serif="http://www.serif.com/"` namespace, root `style="…stroke-miterlimit:1.41421;"` (Affinity's distinctive √2 default), grouped paths |
| [`d3-elm-visualization.svg`](./d3-elm-visualization.svg) | [gampleman/elm-visualization · `bar4.svg`](https://github.com/gampleman/elm-visualization/blob/c64525e2098283692575d1dfe7e6bf58c521dead/docs/intro/bar4.svg) | MIT | Real `d3-shape`-equivalent axis output (Elm Visualization byte-matches d3) — `<path class="domain">`, `<g class="tick">` per tick with fractional `translate()`, `<line>` + `<text>` siblings, `<rect>` bars, programmatic group nesting |

## Attribution

- **AdGuard.svg**: © KenigNat, distributed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Used here unmodified as a test fixture; the depicted text logo is also classified as Public Domain (PD-textlogo) on Wikimedia Commons. Trademark: AdGuard is a trademark of AdGuard Software Ltd. — fixture use is non-commercial test-suite coverage of the Sketch export shape, not a brand display.
- **adobe/react-spectrum**, **apache/cordova-docs**, **jimschubert/hi**, **gampleman/elm-visualization**: see each file's source URL above for the upstream LICENSE.

## Fixture additions require

1. Provenance row above (source + license + what it exercises) — including
   a commit-pinned URL when the source is on GitHub so the bytes can be
   audited later via `git blame`.
2. Size **< 10 KB** per fixture — these test the importer, not raster fidelity.
3. License compatibility with MIT (this repo): MIT / Apache-2.0 / BSD /
   ISC / W3C / CC0 / public domain / CC-BY / CC-BY-SA with attribution /
   Broadset-authored. Reject GPL / AGPL.
4. **No overlap** with an existing fixture's surface. If the new file tests
   the same thing as an existing one, expand the existing test instead.

## What's intentionally NOT here

- **Hostile / XSS samples.** The security suite in `import-third-party.test.ts`
  and `security-audit.test.ts` use synthetic fixtures with explicit attacker
  payloads — those make the threat model legible. Real-world hostile SVG
  would be redundant.
- **SMIL animation fidelity.** Broadset intentionally drops animation
  commands on import per IO-D-16; the SMIL fixture validates safe
  stripping only (not animation preservation).
- **Sketch / Affinity / Figma original `.sketch` / `.afdesign` / `.fig` files.**
  The fixtures here are SVG bytes the tools produce; we don't import the
  native binary formats.
