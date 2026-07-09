# WPT SVG corpus

This directory carries `manifest.json` for a small Web Platform Tests
SVG seed corpus. The bytes are not committed; run:

```sh
npm run svg:corpus:fetch -w @broadset/formats
```

Then run:

```sh
npm run test -w @broadset/formats -- src/svg/corpus.test.ts
```

The seed set covers spec-oriented SVG surfaces: basic geometry,
rounded rectangles, dashed strokes, markers, paint-server inheritance,
text inheritance, transforms, and gradients. The full WPT suite is much
larger and browser-oriented, so Broadset starts with a curated subset
that is useful for import/export chain tests without turning normal CI
into a browser-conformance lab.

Source: https://github.com/web-platform-tests/wpt  
License: BSD-3-Clause / W3C test suite terms
