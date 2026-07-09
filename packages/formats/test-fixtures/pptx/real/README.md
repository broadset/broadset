# Real-world PPTX fixtures

This directory hosts licensed `.pptx` files used by the
`pptx/real-fixtures.test.ts` harness. The directory contents (every
`.pptx` file) are **git-ignored** — corporate or proprietary content
must not be committed.

## How to add a fixture

1. Verify the file's licence allows local development use. Office
   documents authored by employees on company time are usually
   acceptable; third-party templates / customer artefacts often are
   not. **When in doubt, ask legal.**
2. Drop the file in this directory.
3. Run the harness locally:

   ```sh
   npm run test -w @broadset/formats -- --run pptx/real-fixtures
   ```

   Each `.pptx` is imported and re-exported. The acceptance bar is
   intentionally low — the harness gates against silent total drops,
   not visual fidelity. Use the import warnings to investigate any
   missing content and file follow-up bugs against the importer.

## Why git-ignore the files

Real-world PPTX exports often contain:

- Embedded fonts under licence restrictions (Microsoft Office's
  default fonts, type-foundry pay-for-redistribution fonts).
- Customer logos, internal decks, financial data.
- Personally-identifiable metadata (author / company in `core.xml`).

Shipping these in the repo creates legal exposure. The git-ignore
pattern (`*.pptx` in this directory) is the simplest defence —
nothing accidentally lands via `git add .`.

## CI behaviour

The harness skips cleanly when the directory is empty, so CI stays
green for contributors who can't share licensed fixtures. To validate
a corpus in CI later, mount the fixture directory at this path during
the CI test step (e.g. via a private S3 bucket or git submodule with
restricted access).

## Authoring synthesised fixtures instead

For test cases that don't require a real licensed `.pptx` (the vast
majority), use the synthesised fixtures in
[`pptx/fixtures/external-tools.ts`](../../../src/pptx/fixtures/external-tools.ts).
Those exercise tool-specific OOXML quirks (Keynote `<a:custGeom>`
fallbacks, Google Slides minimal master, Canva picture-flatten,
LibreOffice multi-slide, etc.) without any licensing risk.
