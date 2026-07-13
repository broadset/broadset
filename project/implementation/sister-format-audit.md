# Sister-format production-readiness audit (PSD / SVG / PDF)

Status: immutable historical audit evidence. Current destinations are the W0 findings ledger and W3 format/corpus/QE initiatives.

> Closes [pptx-known-gaps §B4](pptx-known-gaps.md). Applies the PPTX
> legacy Phase 8 audit lens (silent drops, lazy-boundary checks, perf scaling,
> async resource resolvers) to the three sister format tracks.
> Audited 2026-04-29 against `dev2-phase-11`.

## Method

Each track audited under four lenses:

1. **Silent drops** — code paths that discard content without surfacing a warning per IO-D-18 (`if (...) continue;`, swallowed catch blocks, filter / map elisions, `// for now` no-ops). Findings list the concrete file:line and recommend the warning code/message that should fire.
2. **Lazy-boundary checks** — input validation that runs late or not at all. Each importer is checked for an effective byte cap, per-element / per-page / per-layer count cap, recursion depth cap, and namespace / scheme allowlists at the right boundary. Compared against PPTX's `maxBytes` / `maxEntries` / `maxDepth` and SVG's `SVG_ELEMENT_COUNT_CAP` / `SVG_GROUP_DEPTH_CAP` / `SVG_USE_DEPTH_CAP` / `SVG_CSS_RULE_CAP` baseline.
3. **Perf scaling** — does the implementation scale linearly, and what's the practical input-size limit? Each track is checked for the existence of a perf test file with explicit budgets, and the gap between the test fixture shape and realistic production-input shape.
4. **Async resource resolvers** — when fetching external resources (fonts, images, ICC profiles), is there a default timeout, byte cap, abort signal, retry policy, structured failure warning? Compared against PPTX's `fontFetchTimeoutMs` (10 s) / `fontMaxBytes` (5 MiB) baseline.

Severity scale appears at the bottom of this document.

---

## PSD track

### Silent drops

- **[High]** [`packages/formats/src/psd/import.ts:296-340`](../../packages/formats/src/psd/v1/import.ts) `layerToElement` — every PSD layer that is not text, not a placed-layer image, not a borderRadius rectangle, not an open vector path, not bitmap-data-bearing, and not a group falls through to the **last branch** that emits an empty rectangle. Adjustment layers, smart-filter layers, type-3D layers, video layers, and any future PSD layer type Broadset has not yet mapped end up as nameless empty rectangles with **no warning**, in direct violation of IO-D-18 ("no silent drops"). The PSD spec at [`psd.md:373-383`](../spec/formats/psd.md) explicitly requires this warning. Recommend warning code `psd-import: layer "${layer.name}" mapped as placeholder rectangle (no native mapping for this layer type — feature preserved is empty)`. Per [`types.ts:158-165`](../../packages/formats/src/psd/v1/index.ts) `PsdImportOptions.warnOnPreservation` is the typed surface for this — but it is never read because `importPsdDocument(data)` accepts no options at all (see lazy-boundary findings).
- **[High]** [`packages/formats/src/psd/import.ts:451-467`](../../packages/formats/src/psd/v1/import.ts) — XMP packet reconciliation pairs `xmpPacket.elements[index]` to imported elements **by array index**, not by stable id. Any XMP packet whose element count differs from the recovered visual layer count silently drops the trailing entries from one side or the other. No warning is emitted when `packetEntry === undefined`. Recommend `psd-import: XMP packet declares N elements, layer tree yielded M; trailing entries in the smaller list were ignored.`
- **[High]** [`packages/formats/src/psd/import-document.ts:64-68`](../../packages/formats/src/psd/v1/import.ts) — `try { document = importPsd(data); } catch { return MALFORMED_PSD_WARNING }` swallows the error. The user sees "the file may be malformed or truncated" with no indication of which layer / sub-section the parser choked on. Recommend including `err.message` in the surfaced warning so support can diagnose third-party PSDs that fail.
- **[Medium]** [`packages/formats/src/psd/export.ts:90-107`](../../packages/formats/src/psd/v1/export.ts) `fetchImageAsBytes` — `} catch { return undefined; }` swallows every fetch failure (DNS, TLS, abort, response.body decode). The async-with-preflight wrapper [`export.ts:330-337`](../../packages/formats/src/psd/v1/export.ts) does emit a generic warning (`failed to fetch image "${name}" from ${url}; the layer will export with placeholder pixels`), but the **plain** `exportPsdBytesAsync` swallows the failure entirely with no warning surface. Recommend the plain async exporter route through the same warning collector or expose a `warnings` accessor.
- **[Medium]** [`packages/formats/src/psd/reconcile.ts:138-152`](../../packages/formats/src/psd/v1/import.ts) `tryParseElementPayload` — corrupt payloads return `null` silently. The caller drops them from the element list. Recommend pushing a reconciliation warning so the reconciliation modal can show "N preserved elements failed payload parse and were treated as deletions."
- **[Low]** [`packages/formats/src/psd/import.ts:328-330`](../../packages/formats/src/psd/v1/import.ts) — group layer with zero children returns `undefined` and is dropped. Empty groups are arguably noise, but the behaviour is silent.

### Lazy-boundary checks

- **[High]** [`packages/formats/src/psd/import-document.ts:57`](../../packages/formats/src/psd/v1/import.ts) — `importPsdDocument(data: Uint8Array)` accepts **zero options**. The typed `PsdImportOptions { maxDepth, maxBytes, warnOnPreservation }` surface is exported from the barrel ([`index.ts:21`](../../packages/formats/src/psd/v1/index.ts)) and documented on [`types.ts:158-165`](../../packages/formats/src/psd/v1/import.ts) but is **never plumbed into the importer**. Effect: a hostile PSD has no caller-controllable byte cap, no depth cap, and no `warnOnPreservation` toggle. ag-psd's parser has no documented input-byte cap; a 4 GB malformed PSD signature with declared 4 GB dimensions (the [`importer-fuzz.test.ts:103-120`](../../packages/formats/src/psd/v1/import.test.ts) test case) relies entirely on ag-psd's internal bounds. Attack scenario: a PSD declaring 100 000 nested group layers exhausts call-stack memory before any cap fires. Recommend adding the same default of `200 MiB` byte cap and `100` depth cap PPTX uses, and wiring `PsdImportOptions` into `importPsdDocument`.
- **[High]** [`packages/formats/src/psd/import.ts:431-435`](../../packages/formats/src/psd/v1/import.ts) — `readPsd(data.buffer ...)` is invoked with `useImageData: true` (full layer pixel decoding) on every imported PSD. A hostile PSD declaring 1 000 layers each at 30 000 × 30 000 px (the PSD format hard cap) decodes ~3.6 TB of pixel data before any structural check fires. Recommend a per-layer pixel-area cap that defaults to ~64 MP and surfaces a warning past the cap. Also consider `useImageData: false` on the third-party path when the caller does not need pixel data.
- **[High]** [`packages/formats/src/psd/validate-psd.ts:38,98`](../../packages/formats/src/psd/v1/import.ts) — the validator carries a `SOFT_DEPTH_CAP = 16` for layer-tree depth, but it only **warns** post-parse. The importer itself has no depth cap. The validator is opt-in (only run by tests), so a deeply nested layer tree from a third-party PSD blows V8's call stack before validation fires.
- **[Medium]** PSD's `PsdImportOptions` has no `maxLayers` or `maxLinkedFiles` cap. ag-psd reads the full `linkedFiles[]` map before yielding control. A hostile PSD declaring 100 000 linked file entries each pointing at 100 MB blobs is parsed in full. Recommend `maxLinkedFiles` defaulting to ~256 and `maxLinkedFileBytes` defaulting to ~50 MiB per entry.

### Perf scaling

- **[Medium]** No PSD perf test file exists. `find packages/formats/src/psd -name '*perf*'` returns nothing. Compared to PPTX's `performance.test.ts` (1 000-element budget at 5 s import / 3 s export, 50-iteration heap-delta cap), PSD has **no perf gate**. Production PSDs routinely contain 200+ layer groups with smart objects, layer effects, vector masks. The 200 MiB byte cap plumbed in (well, **not** plumbed in — see lazy-boundary above) is unverified.
- Recommended additions to a new `packages/formats/src/psd/performance.test.ts`:
  - 1 000-rectangle vector-shape document — pin import/export budget at 5 s / 3 s (parity with PPTX).
  - 50-layer group nesting — pin `validateLayerTree` linear-time scaling (no exponential blow-up via children-of-children copies).
  - 100-layer `linkedFiles[]` map with 1 KB blobs each — pin `populateLinkedFiles` is O(n).
  - Repeated 50-iteration import of a single document — assert steady-state heap delta < 50 MiB (parity with PPTX `MEMORY_DELTA_BUDGET_BYTES`).
  - Per-layer pixel-area sweep (1 layer @ 8 MP, 64 MP, 256 MP, 1 GP) — pin where `useImageData: true` decode time goes non-linear.

### Async resource resolvers

- **[High]** [`packages/formats/src/psd/export.ts:90-107`](../../packages/formats/src/psd/v1/export.ts) `fetchImageAsBytes` — calls `fetchFn(url)` with **no timeout**, **no byte cap**, **no AbortSignal**, **no scheme allowlist**, and **no retry budget**. Compared to PPTX's `fontFetchTimeoutMs` (default 10 s) and `fontMaxBytes` (default 5 MiB), PSD has zero protection. Attack scenario: a Broadset document with an image element pointing at `http://attacker.example/slow-loris` hangs the export for the duration of `globalThis.fetch`'s default timeout (which in Node 20+ is **infinite** for streaming responses). A response declaring `content-type: image/png` but streaming 4 GB before EOF fills the export pipeline's memory.
- Recommend adding `imageFetchTimeoutMs` (default 10 s) and `maxImageBytes` (default 10 MiB) options to `ExportPsdAsyncOptions`, wiring them through an `AbortSignal` and a `Content-Length` pre-check, and routing failures through the warning collector with code `psd-export: image fetch exceeded byte cap` / `…fetch timed out`.
- **[Medium]** [`export.ts:99`](../../packages/formats/src/psd/v1/export.ts) — `contentType.split(';')[0]?.trim() ?? 'image/png'` defaults the MIME to `image/png` when the response provides no `Content-Type`. ag-psd's writer trusts the declared MIME. A `text/html` payload silently masquerades as PNG bytes inside a PSD smart object. Recommend a MIME allowlist (`image/png`, `image/jpeg`, `image/gif`, `image/webp`).

---

## SVG track

### Silent drops

- **[Low]** [`packages/formats/src/svg/import-walk.ts:468`](../../packages/formats/src/svg/import-walk.ts) — `Math.min(children.length, SVG_ELEMENT_COUNT_CAP)` truncates the walk silently per child node (the cap warning is emitted from `sanitizeDomInPlace`, but the walker enforces a second copy of the cap silently). Acceptable defence-in-depth, but consider a structured "cap reached during walk" warning so users know the walker also hit it.
- **[Low]** [`packages/formats/src/svg/v1/import.ts`](../../packages/formats/src/svg/v1/import.ts) returns a minimal valid v1 fallback when even fallback assembly fails. This is intentionally fail-soft, but the final branch has no interop record because no source resource could be assembled.

### Lazy-boundary checks

This track is the **best-audited of the three**. P7.7n closed the security audit findings (C1 `<use>` fan-out, C2 byte cap default, H1 scheme allowlist, M2 CSS dangerous URLs, L2 doctype removal, L3 namespaced event handlers). Resource caps are explicit:

- Byte cap: `DEFAULT_MAX_BYTES = 32 MiB` ([`v1/import.ts`](../../packages/formats/src/svg/v1/import.ts)) enforced **pre-parse**.
- Element count: `SVG_ELEMENT_COUNT_CAP = 10 000` ([`import-security.ts:15`](../../packages/formats/src/svg/import-security.ts)).
- Group depth: `DEFAULT_SVG_GROUP_DEPTH_CAP = 100` ([`import-walk.ts:42`](../../packages/formats/src/svg/import-walk.ts)).
- `<use>` depth: `USE_DEREFERENCE_DEPTH_CAP = 16` ([`import-security.ts:3`](../../packages/formats/src/svg/import-security.ts)).
- `<use>` invocation budget: `USE_DEREFERENCE_INVOCATION_CAP = 5 000` ([`import-security.ts:237`](../../packages/formats/src/svg/import-security.ts)).
- CSS rule cap: `SVG_CSS_RULE_CAP = 5 000` ([`import-css.ts:39`](../../packages/formats/src/svg/import-css.ts)) — caps mid-selector-list expansion.

Remaining findings:

- **[Low]** [`v1/import.ts`](../../packages/formats/src/svg/v1/import.ts) — when caller passes `maxBytes: 0`, the cap is disabled entirely. A config typo can therefore turn protection off silently. Consider rejecting `0` and requiring explicit `Number.POSITIVE_INFINITY` for the disable case.

### Perf scaling

- **[Medium]** No standalone SVG performance test exists. The closest coverage is the real-producer validity loop in [`v1/import.test.ts`](../../packages/formats/src/svg/v1/import.test.ts) and the native round-trip fixture suite in [`v1/fixtures-round-trip.test.ts`](../../packages/formats/src/svg/v1/fixtures-round-trip.test.ts), but neither pins a positive wall-clock budget for realistic-load shapes.
- Recommended additions to a new `packages/formats/src/svg/performance.test.ts`:
  - 5 000-rectangle SVG (just under cap) — pin import budget < 3 s.
  - 1 000-element SVG with 1 000 CSS rules in `<style>` — pin total time < 5 s (this is the path most likely to go non-linear via `applyStyleBlocks`).
  - 100-level `<g>` nesting — pin walker time < 500 ms.
  - `<use>` fan-out tree (`s0 → 4× s1 → 4× s2 → 4× s3` ≈ 256 invocations) — pin time < 1 s.
  - 5 MiB SVG with 500-element document — pin import budget < 5 s.

### Async resource resolvers

- **[N/A]** Native v1 SVG export does **not** fetch resources. [`v1/export.ts`](../../packages/formats/src/svg/v1/export.ts) serializes project-owned values and resolved asset references only, so it has no network fetch-resource attack surface.
- **[Low]** Recommend documenting the no-fetch contract explicitly beside the public v1 SVG export API in [`v1/index.ts`](../../packages/formats/src/svg/v1/index.ts) so future contributors do not accidentally introduce a network boundary.

---

## PDF track

### Silent drops

- **[High]** [`packages/formats/src/pdf/import/operators.ts:117-130`](../../packages/formats/src/pdf/import/operators.ts) `tryDecodeStream` — content-stream decode failure returns `undefined`; the page contributes **zero text items** with no warning. A PDF whose content streams use `/LZWDecode`, `/JBIG2Decode`, or any filter pdf-lib does not implement silently produces an empty Broadset document on the third-party path. The fast-path is unaffected (uses XMP metadata), but third-party PDFs from older Acrobat / scanner-OCR pipelines silently lose all text. Recommend `pdf-import: page ${n} content stream uses unsupported filter (LZW / JBIG2 / Crypt); text extraction skipped.`
- **[High]** [`packages/formats/src/pdf/import/parse.ts:80-94`](../../packages/formats/src/pdf/import/parse.ts) `probeLoadPdf` — when `options.password !== undefined` AND pdf-lib throws a non-`EncryptedPDFError`, the result is hard-coded to `'encrypted'` so UI messaging is "honest". But this **conflates** "wrong password" with "malformed PDF that happens to be encrypted." A user supplies a password, the PDF is malformed, and the warning says "encrypted — provide password" → support loop. Recommend distinguishing `kind: 'encrypted-decrypt-failed'` vs `kind: 'malformed'` based on `EncryptedPDFError` instance check only.
- **[High]** [`packages/formats/src/pdf/import.ts:170-174`](../../packages/formats/src/pdf/v1/import.ts) — embedded files are preserved as a **name list only** (`extensions.pdf.embeddedFiles: string[]`). The actual file bytes are dropped from the import. The warning correctly names the files, but a user re-exporting will lose the binary attachments. The spec at [`pdf.md`](../spec/formats/pdf.md) treats this as a Spec Gap implicitly via "preserved as metadata" — recommend explicit warning code `pdf-import: ${count} embedded file attachment(s) — names preserved, bytes dropped (re-export will not include the attached files)`.
- **[Medium]** [`packages/formats/src/pdf/import/preservation-blobs.ts:74-77`](../../packages/formats/src/pdf/v1/source-details.ts) `safeGetPages` — wraps a malformed `/Pages` tree as an empty array silently. The capture pass produces zero blobs. The downstream import does emit `EMPTY_THIRD_PARTY_WARNING` if no elements come through, but the specific "preservation blobs unrecoverable" cause is hidden.
- **[Medium]** [`packages/formats/src/pdf/import/parse.ts:185-205`](../../packages/formats/src/pdf/import/parse.ts) — multiple `try { ... } catch { return undefined; }` helpers (`lookupMaybeDict`, `safeCatalogGet`) silently degrade on every malformed catalog entry. The aggregate effect is that a hostile PDF with a tampered catalog dictionary imports as an empty document with no diagnostic. Acceptable as defence-in-depth, but a single "PDF catalog walk encountered N malformed entries; some metadata may be missing" warning would help users distinguish a deliberately-empty PDF from a tampered one.
- **[Medium]** [`packages/formats/src/pdf/import/operators.ts:55-58`](../../packages/formats/src/pdf/import/operators.ts) `extractThirdPartyElements` — `if (text === '') continue;` drops empty-text-string text-show operators. Acceptable in isolation, but combined with the LZW-decode failure above, the importer has multiple silent paths to "zero text elements."
- **[Medium]** [`packages/formats/src/pdf/import/parse.ts:240-249`](../../packages/formats/src/pdf/import/parse.ts) `collectEmbeddedFileNames` — the comment notes "Deeply-nested name trees produce a partial list, but that is a 'count is at least N' signal, never a silent drop". This is a good honest comment, but the **caller** never sees the partial-vs-complete distinction. The warning surfaces the recovered names but doesn't say "deep tree; some names may be missing." Consider returning a `{ names, complete: boolean }` tuple.
- **[Low]** [`packages/formats/src/pdf/import/fast-path.ts:117-120`](../../packages/formats/src/pdf/v1/import.ts) — `tryParseElementPayload` JSON failure returns `null` and falls back to placeholder hydration. Identical pattern to PSD's `tryParseElementPayload`; recommend the same warning fix.

### Lazy-boundary checks

- **[High]** [`packages/formats/src/pdf/types.ts:66-71`](../../packages/formats/src/pdf/v1/import.ts) `PdfImportOptions { password?, fetch? }` — has **zero size / depth / entry caps**. Compared to PPTX's `maxInputBytes` (200 MiB), `maxPartBytes` (50 MiB), `maxEntries` (4 096), `maxDepth` (100), PDF has nothing. pdf-lib's `PDFDocument.load(bytes)` allocates the entire xref table and object map in memory before yielding control. Attack scenario: a malformed PDF with a 1 GB declared object stream length triggers OOM. The fuzz suite in [`importer-fuzz.test.ts`](../../packages/formats/src/pdf/v1/import.test.ts) covers this for fuzz-bytes inputs, but a pathological _valid_ PDF (e.g. a PDF with 10 million empty pages declared) is not caught. Recommend `maxInputBytes` (200 MiB), `maxPages` (~10 000), `maxObjectCount` (~1 000 000), and pre-validating these against the trailer dict before `PDFDocument.load`.
- **[High]** [`packages/formats/src/pdf/import.ts:145`](../../packages/formats/src/pdf/v1/import.ts) — `importPdfDocument(data, options?)` does not pass `options` through to any of the cap surfaces because no caps exist (above). Even when the `PdfImportOptions` interface is extended, the importer needs explicit plumbing — currently `options.password` flows to `probeLoadPdf` but `options.fetch` is documented and unused. Recommend wiring the fetch into resource resolution and adding the cap surfaces.
- **[High]** [`packages/formats/src/pdf/import/operators.ts:156-181`](../../packages/formats/src/pdf/import/operators.ts) — content-stream regex scanners (`BT_RE`, `ET_RE`, `TJ_LITERAL_RE`, `TJ_HEX_RE`, `TJ_ARRAY_RE`) run unbounded over every page's decompressed content stream. A PDF page with a 100 MB compressed content stream that decompresses to 10 GB (a deliberately-engineered Flate bomb) drives the scanner into pathological time. The PSD validator wraps in a soft cap; PDF has none. Recommend a `MAX_CONTENT_STREAM_BYTES` (default ~10 MiB per page) check on `streamBytes.byteLength` before invoking the regex scanners.
- **[Medium]** [`parse.ts:240-317`](../../packages/formats/src/pdf/import/parse.ts) `collectEmbeddedFileNames` recursively walks `/Kids` arrays without a depth cap. A PDF with a self-referential name tree (`Kids → Kids → ...`) loops indefinitely. Recommend a `MAX_NAME_TREE_DEPTH = 16` cap and a `seen` ref-set to break cycles.

### Perf scaling

- **[Medium]** No PDF perf test file exists. `find packages/formats/src/pdf -name '*perf*'` returns nothing. Coverage is wide (74 test files at last count) but none enforce a wall-clock budget. The existing [`importer-fuzz.test.ts`](../../packages/formats/src/pdf/v1/import.test.ts) and [`comprehensive-features.test.ts`](../../packages/formats/src/pdf/v1/import.test.ts) cover correctness only.
- Recommended additions to a new `packages/formats/src/pdf/performance.test.ts`:
  - 100-page PDF, each page with 50 text elements + 50 shapes — pin export budget < 5 s.
  - 1 000-element single-page document — parity with PPTX `PERF_ELEMENT_COUNT`.
  - Importer pass on a 50-page operator-stream extraction — pin extraction time < 3 s.
  - Repeated 50-iteration import of a single PDF — assert steady-state heap delta < 50 MiB.
  - Font-bytes cache warm vs cold — assert second export ≥ 5× faster than first when 3+ Google Fonts families are referenced.

### Async resource resolvers

- **[High]** [`packages/formats/src/pdf/export/fonts.ts:255-304`](../../packages/formats/src/pdf/v1/serialize.ts) `tryEmbedGoogleFont` — calls `fetchFn(cssUrl)` and `fetchFn(fontUrl)` with **no timeout**, **no byte cap**, **no AbortSignal**. Compared to PPTX's `fontFetchTimeoutMs` (default 10 s) and `fontMaxBytes` (default 5 MiB), PDF has zero protection during font embedding. A document referencing a font family `"slow-loris"` resolved to a slow-loris attacker URL hangs the export indefinitely. The font-bytes cache makes repeated exports fast but never reaches that path on the cold call.
- Recommend adding `fontFetchTimeoutMs` (default 10 s) and `fontMaxBytes` (default 5 MiB) to `PdfExportOptions`, wiring them through `AbortSignal` and `Content-Length` pre-check / streaming-byte tally, and routing failures through the existing `failures` collector with codes `pdf-export: font fetch timed out` / `pdf-export: font fetch exceeded byte cap`.
- **[Medium]** [`export/fonts.ts:268-269`](../../packages/formats/src/pdf/v1/serialize.ts) — `cssUrl` is built from `resolveGoogleFontUrl(family)`, where `family` is the document-supplied `style.fontFamily`. If a hostile document sets `fontFamily: "?injection=here"` or otherwise crafts a string that bypasses `resolveGoogleFontUrl`'s sanitisation, the fetch flies to whatever URL results. Recommend asserting that the resolved URL has scheme `https` and host `fonts.googleapis.com` (or whatever the configured Google Fonts CSS endpoint is) before fetch.
- **[Medium]** [`export/fonts.ts:280`](../../packages/formats/src/pdf/v1/serialize.ts) — `fontUrl` is extracted from the **CSS response body** via `/url\(([^)]+\.(?:ttf|woff2?))\)/`. A hostile Google Fonts CSS proxy can return CSS pointing the URL at any host. Recommend asserting `fontUrl` has scheme `https` and host in a configured allowlist (the actual font-binary CDN, e.g. `fonts.gstatic.com`) before fetch.
- **[Medium]** [`export/fonts.ts:296-303`](../../packages/formats/src/pdf/v1/serialize.ts) — failures are routed to a `failures: string[]` collector that becomes preflight warnings. Good. Recommend adding a structured warning code so the demo's preflight modal can group / count by reason rather than displaying raw English strings.

---

## Cross-cutting recommendations

A small number of patterns repeat across all three sister tracks; closing them once at the right shared layer would close 6–8 individual findings.

1. **Promote `_shared/asset-resolver/`** with a uniform contract: timeout, byte cap, abort signal, scheme allowlist, host allowlist, structured warning code. Today PSD's `fetchImageAsBytes` (`export.ts:90`), PDF's `tryEmbedGoogleFont` (`export/fonts.ts:255`), and PPTX's font resolver (`pptx/types.ts` `resolveFontBytes`) are three handwritten copies of the same control surface, with PPTX the only one that has all four protections. Lifting the contract to `_shared/` and migrating the three call sites closes the High findings under "async resource resolvers" for PSD and PDF in one change.

2. **`PsdImportOptions` is exported but never plumbed** ([`packages/formats/src/psd/index.ts:21`](../../packages/formats/src/psd/v1/index.ts) → [`import-document.ts:57`](../../packages/formats/src/psd/v1/import.ts)). The pattern of "type lives in `types.ts`, never wired to the entry-point" is not unique to PSD — similar dead-code surfaces exist for `PdfImportOptions` (`fetch?` field is typed but unused). Recommend a shared `_shared/import-options/` pattern and a lint-rule (or `knip` config) that flags exported types not consumed by an entry-point.

3. **Silent JSON parse fallback (`tryParseElementPayload`)** appears verbatim in PSD ([`reconcile.ts:138-152`](../../packages/formats/src/psd/v1/import.ts)) and PDF ([`import/fast-path.ts:109-121`](../../packages/formats/src/pdf/v1/import.ts)). Both swallow the error and drop the payload silently. Recommend extracting to `_shared/payload-parser/parsePreservedElement(json, expectedId, warnings)` and threading a warnings list.

4. **No perf test file exists for PSD or PDF** — only PPTX has one. Closing this gap in three places by copying `pptx/performance.test.ts` to PSD and PDF (with format-specific fixture builders) is a one-day effort and would catch the next O(n²) regression on each track.

5. **The IO-D-18 "no silent drops" requirement is enforced unevenly.** PPTX has structured `PptxImportWarningCode` / `PptxExportWarningCode` enums ([`pptx/types.ts:147-189`](../../packages/formats/src/pptx/types.ts)). PSD and PDF emit free-form English warning strings. Recommend lifting the enum + structured warning shape to `_shared/warnings/` so all four tracks share a common code vocabulary the demo's modals can group / count / filter by.

6. **Defence-in-depth caps should be _enforced_ not _advised_.** PSD has a validator with `SOFT_DEPTH_CAP = 16` that runs only in tests. SVG has both an enforced cap and a validator-style audit. Recommend the PSD pattern be promoted to a runtime check during import, not a post-hoc validation.

---

## Severity scale

- **Critical** — known DoS / data-loss bug shipping today. Should not appear; fix immediately. (No Critical findings in this audit.)
- **High** — narrow practical impact today, meaningful risk under different deployment assumptions (server-side rendering, untrusted import sources, untrusted external font URLs).
- **Medium** — missing surface a determined attacker / unusual input could exploit; mitigated by other defences.
- **Low** — hygiene / coverage / process gap, no immediate risk.

## Findings summary

| Track | Critical | High | Medium | Low |
| ----- | -------- | ---- | ------ | --- |
| PSD   | 0        | 5    | 4      | 1   |
| SVG   | 0        | 0    | 3      | 4   |
| PDF   | 0        | 5    | 6      | 1   |

The SVG track is the best-audited under all four lenses — P7.7n closed the security audit findings, the cap surface is comprehensive, fonts are caller-supplied (no fetch surface), and the fixture corpus is wide. PSD and PDF carry the bulk of the work.

The single highest-severity finding is **PSD `importPsdDocument` accepts no options at all** ([`import-document.ts:57`](../../packages/formats/src/psd/v1/import.ts)) — the typed `PsdImportOptions` surface is exported, documented, and never wired. Plumbing this single signature change unlocks the byte cap, depth cap, and `warnOnPreservation` toggle in one go.

## Follow-up tracking

Each High finding above lands its own gap entry in the relevant per-track gap file:

- SVG findings — none High; no per-track filing needed.
- PSD findings → [`project/spec/formats/psd.md`](../spec/formats/psd.md) `## Spec Gaps`.
- PDF findings → [`project/spec/formats/pdf.md`](../spec/formats/pdf.md) `## Spec Gaps`.

Each filed entry cites this audit + file:line + recommended fix and is dated 2026-04-29.
