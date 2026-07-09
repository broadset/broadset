# veraPDF PDF corpus

This directory carries a manifest for the small veraPDF seed corpus used
by Broadset's PDF importer and PDF/A validator tests. The PDF bytes are
not committed; run:

```sh
npm run pdf:corpus:fetch -w @broadset/formats
```

Then run:

```sh
npm run test -w @broadset/formats -- src/pdf/vendored-fixture-corpus.test.ts
```

The same `.cache/` files are also used by `npm run validate:pdfa -w
@broadset/formats` when Docker/veraPDF validation is requested.

Source: https://github.com/veraPDF/veraPDF-corpus  
License: CC BY 4.0, attribution © veraPDF Consortium

## Fixtures

The manifest pins nine atomic files: PDF/A-1b, 2b, 2u, 2a, 3b, 4,
PDF/UA-1, one deliberately failing PDF/A-2b metadata case, and a plain
ISO 32000-1 PDF. Each entry is pinned by upstream commit, SHA-256, byte
count, and feature tags.
