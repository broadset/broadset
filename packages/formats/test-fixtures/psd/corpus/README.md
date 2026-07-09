# Permissively-licensed PSD corpus

This directory carries `manifest.json` for PSD/PSB fixtures fetched from
the `psd-tools` test corpus. The fixture bytes are not committed; run
the fetcher to populate `.cache/` from commit-pinned raw GitHub URLs:

```sh
npm run psd:corpus:fetch -w @broadset/formats
```

Then run:

```sh
npm run test -w @broadset/formats -- src/psd/corpus.test.ts
```

The cached files exercise real PSD structures Broadset does not author
itself: simple layers, groups, Unicode layer names, 16/32-bit headers,
type layers, shape layers, effects, path operations, and a tiny
third-party PSD. Tests skip when `.cache/` is empty so normal CI stays
fast; release or deep-compatibility CI should fetch first.

Source: https://github.com/psd-tools/psd-tools  
License: MIT
