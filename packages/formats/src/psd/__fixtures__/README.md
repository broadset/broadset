# PSD fixture corpus

Mirrors `test-fixtures/pdf/corpus/` in intent: a diverse set of PSDs the
test suite re-reads, round-trips, and structurally validates so the
importer and exporter survive real-world variation.

## Layout

- `producer-quirks/` — PSDs **generated programmatically** by
  `producer-quirks.fixture.ts` to simulate the variation real producers
  introduce (RGB-only docs, multi-group trees, vector + shape
  combinations, layered effects, embedded smart objects). These run on
  every CI build via `producer-quirks.test.ts`.
- `external/` — PSDs exported from real third-party applications
  (Photoshop CC, Affinity Photo, GIMP, Krita, Figma, Pixelmator).
  **Not vendored** — this directory is `.gitignore`d. To extend the
  corpus, drop `.psd` files here and they will be picked up by
  `external-corpus.test.ts` when present.

## Adding a real third-party fixture

1. Save the PSD into `external/<producer>-<feature>.psd` — for example,
   `external/photoshop-cc-2025-text-runs.psd`.
2. The next `npx vitest run src/psd/external-corpus.test.ts` run will
   import the file via `importPsdDocument` and assert no warnings of
   level "failed" appear.
3. If the importer crashes or produces an empty document, the failure
   is the bug — report it before suppressing.

## Why no vendored real-world fixtures?

PSD files from Adobe Photoshop are not redistributable under permissive
licences. Broadset therefore keeps open PSD corpora under
`packages/formats/test-fixtures/psd/corpus/manifest.json` and fetches
their bytes into a gitignored `.cache/` directory. The `external/`
directory remains the contract for users who want to extend the corpus
locally with private Photoshop / Affinity / GIMP / Krita outputs; the
programmatic `producer-quirks/` corpus is what runs without network.
