# veraPDF Corpus — Vendored Fixtures

These PDF fixtures are sourced from the [veraPDF corpus](https://github.com/veraPDF/veraPDF-corpus)
which is licensed under [Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/).

Attribution: © veraPDF Consortium. Used under CC BY 4.0.

## Vendored files

Each fixture is a small (≈2-13 KB) atomic test file targeting a specific
PDF/A or PDF/UA conformance clause. They are committed verbatim from the
upstream `master` branch and serve as real-binary regression fixtures
for the Broadset PDF importer.

| Local name | Upstream path | Bytes | PDF ver | Purpose |
| --- | --- | --- | --- | --- |
| `pdfa-1b-pass.pdf` | `PDF_A-1b/6.2 Graphics/6.2.3.3 Uncalibrated color space/veraPDF test suite 6-2-3-3-t03-pass-d.pdf` | 2 564 | 1.4 | Smallest passing PDF/A-1b fixture (uncalibrated colour space, conforming) |
| `pdfa-2b-pass.pdf` | `PDF_A-2b/6.1 File structure/6.1.13 Implementation limits/veraPDF test suite 6-1-13-t09-pass-b.pdf` | 2 392 | 1.7 | Smallest passing PDF/A-2b fixture (implementation limits, conforming) |
| `pdfa-2u-pass.pdf` | `PDF_A-2u/6.2 Graphics/6.2.11 Fonts/6.2.11.7 Unicode character maps/.../veraPDF test suite 6-2-11-7-2-t01-pass-f.pdf` | 3 728 | 1.7 | Smallest passing PDF/A-2u fixture (Unicode CMap conformance) |
| `pdfa-2a-pass.pdf` | `PDF_A-2a/6.7 Logical structure/6.7.3 Artefacts/6.7.3.4 Structure types/veraPDF test suite 6-7-3-4-t01-pass-a.pdf` | 3 556 | 1.7 | Smallest passing PDF/A-2a fixture (tagged structure) |
| `pdfa-3b-pass.pdf` | `PDF_A-3b/6.8 Embedded files/veraPDF test suite 6-8-t02-pass-a.pdf` | 4 976 | 1.7 | Smallest passing PDF/A-3b fixture (embedded files) |
| `pdfa-4-pass.pdf` | `PDF_A-4/6.2 Graphics/6.2.4 Colour spaces/.../veraPDF test suite 6-2-4-3-t01-pass-e.pdf` | 2 644 | 2.0 | Smallest passing PDF/A-4 fixture (newest standard, PDF 2.0) |
| `pdfua-1-pass.pdf` | `PDF_UA-1/7.2 Text/7.2-t17-pass-d.pdf` | 13 060 | 1.6 | Smallest passing PDF/UA-1 fixture (accessibility tagged structure) |
| `pdfa-2b-fail.pdf` | `PDF_A-2b/6.6 Metadata/6.6.2 Metadata streams/6.6.2.1 General/veraPDF test suite 6-6-2-1-t01-fail-a.pdf` | 2 296 | 1.7 | Deliberately non-conforming PDF/A-2b — exercises importer's tolerance of malformed metadata |
| `iso-32000-1.pdf` | `ISO 32000-1/veraPDF test suite 6-2-3-2-t01-fail-b.pdf` | 3 912 | 1.4 | Plain ISO 32000-1 (vanilla PDF 1.7-class) test fixture |

Total vendored size: ≈40 KB across 9 fixtures.

## How to refresh

The `download-w3c-fixtures.ts` helper [`packages/formats/src/pdf/_test-helpers/download-w3c-fixtures.ts`]
ships an opt-in script — extend its `FIXTURES` table to vendor additional
files. The fixtures committed under `__fixtures__/verapdf/` are the
deterministic regression baseline; to add new ones, fetch them via the
script (or `curl`), commit the binary, document them in this file with
their upstream path + size + purpose.

## What real Adobe / Microsoft / Apple binaries are NOT here, and why

We do not redistribute Adobe Illustrator / InDesign / Acrobat output,
Microsoft Word PDF exports, or macOS Preview "Save as PDF" output as
test fixtures. Those binaries are owned by the user / organisation that
generated them and are not freely redistributable. The veraPDF corpus
above is explicitly designed to exercise the same producer-quirk
surface those tools emit — Adobe-class output is covered by the
Carousel-edited PDF/A-2 fixtures, Microsoft-class by the embedded-files
+ tagged structure tests, etc.

If you want to test against literal Adobe / Microsoft / Apple binaries
locally, drop them under `__fixtures__/local/` (gitignored — see
`.gitignore` in this directory) and the test runner will pick them up
automatically.
