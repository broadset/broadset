# Production Readiness Inspection - 2026-04-28

Inspection scope: repository state, documented roadmap/spec gaps, quality gates, production build, component tests, dependency audit, and targeted source review of the highest-risk areas: import/export trust boundaries, active-page rendering, page instances, UI compliance, package hygiene, and release validation.

No fixes were made and no commits were created.

## Executive Verdict

Broadset has a strong engineering base, but it is not production-ready yet. The strict package quality pass is green, type coverage is at the required threshold, production build completes, and production dependencies have no current npm audit findings. The codebase also has a large and useful test surface.

The blockers are mostly release-hardening and trust-boundary issues rather than a lack of core implementation: `gate:full` currently fails at `knip`, several importers can create documents whose elements exist in state but do not render on the active page, untrusted imported text can reach `dangerouslySetInnerHTML`, and several importer/exporter paths still lack hard resource caps. The cross-region CT audit and visual/external validation work are also not complete, so the existing tests do not yet prove the full product contract.

## Gate Results

| Check | Result | Notes |
| --- | --- | --- |
| `git status` before inspection | Pass | Worktree was clean. |
| `npm run quality:strict` | Pass | All package lint/typecheck/unit gates passed: demo 179 tests, editor 427, formats 1120 passed / 5 skipped, model 596, playback 84, renderer 93, ui 421. |
| `npm run lint:dead` | Fail | Blocks `gate:full`. `knip` reports unused files, unused dependencies/devDependencies, unlisted `zod`, unlisted `python3` binary, and many unused exports/types. |
| `npm run lint:typecoverage` | Pass | `(217256 / 217343) 99.95%`. |
| `npm run ct:all` | Flaky / first run failed | UI CT passed. Demo CT first failed in `ct/editing/path-tool.ct.tsx` because only 2 of 3 path vertices were recorded; the focused test and a full demo CT rerun both passed. This is a reliability signal, not a clean gate. |
| `npm run build` | Pass with warnings | Demo build completes, but Vite warns about browser-externalized `util` from `ag-psd` and chunks over 500 kB; largest minified chunks are about 1.26 MB and 2.73 MB. |
| `npm audit --omit=dev --json` | Pass | 0 production vulnerabilities reported. |
| `npm audit --json` | Fail | Dev/test stack reports 1 high (`vite` through `@playwright/experimental-ct-core/node_modules/vite <=6.4.1`) and 1 moderate (`postcss <8.5.10`). |

## Findings

### Critical - Imported Text Can Execute When Inline Editing Starts

Evidence:

- `packages/demo/src/demo-components/inline-text-overlay.tsx` renders `element.content` through `dangerouslySetInnerHTML` in the contenteditable overlay.
- `packages/model/src/element.ts` sanitizes text only in `elementSchema.transform`; `createDefaultElement` returns `overrides.content` as-is.
- PDF third-party import passes `item.text` directly into `createDefaultElement('text', ...)` in `packages/formats/src/pdf/import/third-party.ts`.
- PSD text import passes `layer.text.text` through `createImportedElement` in `packages/formats/src/psd/import.ts`.
- PPTX text import can return a plain string from OOXML text runs in `packages/formats/src/pptx/import/slide.ts`.

Impact: a malicious or malformed PDF/PSD/PPTX with text containing markup such as an event-handler attribute can become a text element. Opening inline edit injects that content as HTML before the commit sanitizer runs. This is an app-context XSS path.

Remediation direction: sanitize at every importer boundary and/or make `createDefaultElement` normalize text content. The inline editor should also avoid trusting persisted text HTML; sanitize before setting `dangerouslySetInnerHTML` or render a safe editable representation.

### Critical - Imported Format Documents Can Be Invisible Because Page Instances Are Empty

Evidence:

- The demo renders active-page roots by requiring a matching `PageElementInstance`; `buildRenderableDocumentForActivePage` skips any root element missing from `page.elements` in `packages/demo/src/demo-utils.ts`.
- PPTX import builds pages with `elements: []` in `packages/formats/src/pptx/import/slide.ts`.
- PSD import creates pages with `elements: []` in `packages/formats/src/psd/import.ts`.
- SVG import starts from `createEmptyBroadsetDocument()` and replaces `document.elements`, but does not populate page instances in `packages/formats/src/svg/import-document.ts`.
- PDF import appends third-party/fast-path elements to an empty document without adding page instances in `packages/formats/src/pdf/import.ts` and `packages/formats/src/pdf/import/fast-path.ts`.

Impact: a user can import a valid file and get elements in document state, while the canvas and layer flows show nothing for the active page. Current PPTX chain CT polls store state only, so it does not catch this visual failure.

Remediation direction: every importer should construct root `PageElementInstance` entries for imported root elements, preserving per-page ordering/visibility/transform where available. Add CT coverage that imports a file and asserts both store state and visible canvas/layers.

### High - `gate:full` Is Blocked By Dead-Code And Manifest Hygiene

Evidence: `npm run gate:full` stops at `npm run lint:dead`.

Current `knip` classes:

- Unused files: `packages/formats/src/_shared/asset-dedup/index.ts`, `packages/formats/src/pdf/_test-helpers/download-w3c-fixtures.ts`, `packages/formats/src/pptx/import/shapes.ts`.
- Unused dependency: `wawoff2` in `packages/formats/package.json`.
- Unused devDependencies: `@types/pixelmatch`, `@types/pngjs`, `jspdf`, `pngjs`, `tsx` in `packages/formats/package.json`.
- Unlisted dependencies: `zod` imported directly from `packages/formats/src/_shared/xmp/broadset-xmp.ts`, `packages/formats/src/psd/types.ts`, and `packages/formats/src/svg/types.ts`, but not listed in `packages/formats/package.json`.
- Unlisted binary: `python3` in `packages/formats/package.json` scripts.
- Large unused export/type surface: 72 unused exports and 130 unused exported types.

Impact: this fails the repo's required full gate and indicates public API/dependency drift. The unlisted `zod` dependency is especially concrete: `@broadset/formats` relies on a transitive/workspace dependency instead of declaring what it imports.

Remediation direction: clean or intentionally mark real public APIs, add missing direct dependencies/binary declarations where appropriate, and delete or wire unused files/deps.

### High - SVG Element-Count Cap Can Leave Unsanitized Descendants Preserved

Evidence:

- `sanitizeDomInPlace` in `packages/formats/src/svg/import-security.ts` sanitizes only the first `SVG_ELEMENT_COUNT_CAP` elements and returns `false` when the input exceeds the cap, with a warning that remaining elements were not validated.
- `hydrateThirdPartyFallbackFromDoc` in `packages/formats/src/svg/import-document.ts` still walks the DOM after over-cap sanitization; it merely skips style/use/tool-namespace passes.
- `capturePreservedOuterHtml` in `packages/formats/src/svg/import-walk.ts` captures `outerHTML` for preserved blobs.
- `renderElement` in `packages/formats/src/svg/export.ts` re-emits `extensions.svg.preserved.raw` verbatim when an element is clean.

Impact: a deeply nested SVG can exceed the global cap, leave descendants after the cap unsanitized, have their `outerHTML` captured as preservation data, and then re-export active markup. The warning is not enough for a fail-closed importer security contract.

Remediation direction: fail closed or truncate the parsed DOM before the visual walk when the cap is exceeded; never capture preservation blobs from unsanitized nodes.

### High - PPTX ZIP Caps Are Applied After Full Decompression And Do Not Abort Processing

Evidence:

- `readOoxmlPackage` calls `unzipSync(bytes)` in `packages/formats/src/pptx/ooxml/zip.ts` before entry-count or uncompressed-size checks.
- `importPptxWithReport` checks only total input bytes before unzip in `packages/formats/src/pptx/import.ts`.
- `enforcePackageCaps` only appends warnings for entry/part caps after decompression and then import continues.
- `importPptxWithMerge` performs a second `readOoxmlPackage(data)` after the base import.
- `PptxImportOptions` declares `maxInputBytes`, `maxPartBytes`, `maxEntries`, and `maxDepth`, but the import entrypoints do not accept/use those options.

Impact: a ZIP bomb can exhaust memory before the cap warning is emitted. Even non-hostile oversized decks may continue through expensive XML parsing after the code already knows caps were exceeded.

Remediation direction: inspect central-directory metadata before inflation, enforce configured/default caps before decoding parts, abort over-cap inputs, and plumb `PptxImportOptions` through public import APIs.

### High - PDF And PSD Importers Still Lack Effective Parser-Boundary Caps

Evidence:

- `PdfImportOptions` only exposes `password` and `fetch` in `packages/formats/src/pdf/types.ts`.
- `importPdfDocument` calls the pdf-lib load/probe path without byte/page/object/depth caps in `packages/formats/src/pdf/import.ts`.
- PDF content streams are decoded and concatenated in `packages/formats/src/pdf/import/operators.ts`; unsupported decode failures return `undefined`, and regex scanners then operate on decoded streams with no per-page byte budget.
- `PsdImportOptions` declares `maxDepth`, `maxBytes`, and `warnOnPreservation`, but `importPsdDocument(data)` in `packages/formats/src/psd/import-document.ts` accepts no options.
- `importPsd` calls `readPsd(data.buffer as ArrayBuffer, { useImageData: true })` in `packages/formats/src/psd/import.ts` before any importer-side byte/depth/pixel budget can fire.

Impact: hostile or simply huge PDFs/PSDs can drive high memory use, slow parsing, or empty partial imports with weak diagnostics. This is a release hardening blocker for arbitrary external-file import.

Remediation direction: add pre-parse byte/header checks, decoded-stream budgets, page/object/layer/depth caps, pixel/channel dimension caps, and structured warnings when content is skipped.

### High - Export Fetches Are Unbounded

Evidence:

- PSD `fetchImageAsBytes` calls `fetchFn(url)`, trusts `content-type` fallback, and buffers the full response in `packages/formats/src/psd/export.ts`.
- PDF `tryEmbedGoogleFont` fetches Google Fonts CSS and then a discovered font URL, reads full text/arrayBuffer, and has no timeout, byte cap, abort, or host/scheme allowlist in `packages/formats/src/pdf/export/fonts.ts`.

Impact: exports can hang or buffer very large responses. This is particularly risky if export moves server-side or processes untrusted project files with remote asset/font references.

Remediation direction: add timeout/AbortSignal, byte caps, MIME/scheme/host allowlists, and structured preflight/export warnings.

### High - Standalone HTML Export Emits Raw SVG Markup

Evidence:

- `packages/formats/src/web-vector/html.ts` returns raw `resolveContentAsPlainString(el.content)` for `case 'svg'`.
- The same file interpolates path `fill` and `stroke` into SVG attributes without XML escaping in `renderHtmlPath`.

Impact: exported standalone HTML can contain active markup if a project has hostile or unsanitized SVG content. Even if model validation is expected upstream, export should be a trust boundary because imports and programmatic callers can bypass schema transforms.

Remediation direction: sanitize SVG content immediately before HTML emission and escape all attribute values, including generated paint values.

### Medium - Component Tests Show A Reliability Problem

Evidence:

- First `npm run ct:all` run failed one demo CT: `ct/editing/path-tool.ct.tsx` expected 3 path vertices but received 2.
- The same test passed when rerun in isolation.
- A full `npm run ct -w @broadset/demo` rerun passed all 147 tests.

Impact: the browser CT gate is broad, but not yet fully reliable. A flaky or order-sensitive path drawing test weakens confidence in a release gate, especially because this flow exercises pointer choreography and canvas/document coordinate conversion.

Remediation direction: isolate shared state, remove timing assumptions, and add deterministic waits around path drawing input. Keep this on the release checklist until repeated full `ct:all` runs are clean.

### Medium - Cross-Region CT Derivation Rule Is Not Complete

Evidence:

- `project/implementation/plan-progress.md` still has Parallel Track B unchecked.
- `project/implementation/cross-region-ct-audit.md` says the current plan exists because earlier CT work sampled flows but never produced a complete inventory.

Impact: passing CT does not yet prove every spec scenario where one UI region changes another is covered. This is an explicit repo mandate, so it is a production-readiness gap even with many existing CTs.

Remediation direction: run the inventory across `project/spec/editor/**`, `project/spec/ui/**`, and `project/spec/demo/**`, map each scenario to existing CT, then fill missing/partial cases.

### Medium - Release Validation For External Formats Is Still Incomplete

Evidence:

- `project/implementation/pptx-known-gaps.md` lists no PowerPoint-on-Windows sanity protocol, no visual-fidelity reference-image gate, and no real-world large-deck load test.
- Format tests include skipped opt-in PPTX validation/corpus tests: LibreOffice verify, OpenXML XSD validate, python-pptx oracle, real fixtures, corpus.
- `project/spec/formats/psd.md` still tracks CMYK/Lab/Grayscale + ICC, 16/32-bpc preservation, linked-smart-object embedding, importer caps, and unbounded async image fetch as gaps.
- `project/spec/formats/pdf.md` still tracks importer caps, content-stream scanner caps, unsupported stream-filter diagnostics, Google Fonts fetch hardening, color-space output gaps, and per-element OCG membership.

Impact: the import/export core is impressively built out, but real-world compatibility is not yet at a general-release bar for PowerPoint/Photoshop/PDF edge cases and large external documents.

Remediation direction: separate release-blocking verification from future fidelity work. At minimum, close parser/resource caps and PowerPoint/visual sanity before calling external-format support production-grade.

### Medium - Coverage Reporting Is Not Wired

Evidence:

- `project/implementation/coverage-reporting.md` is not started and says there is no runtime line/branch visibility despite high test counts.
- `project/implementation/plan-progress.md` keeps Parallel Track A unchecked.

Impact: the repo has thousands of assertions, but no source/branch coverage baseline. That makes it harder to judge dead zones in importers, parser branches, and UI flows.

Remediation direction: add non-gating Vitest V8 coverage first, record a baseline, then decide whether thresholds are warranted.

### Medium - UI/A11y Warnings And HeroUI Compliance Need Triage

Evidence:

- Unit test output repeatedly logs `<Pressable> child must be focusable` for UI panels.
- Unit test output logs React unknown-prop warnings such as `isRowHeader`, `textValue`, and `data-ariaLabel`; at least some appear to come from test mocks/helpers, but they still add noise and can hide real regressions.
- `packages/ui/src/modals/format-reconciliation.tsx` uses native `<details>` for companion warnings even though the package mandate prefers HeroUI chrome; the test documents this choice.
- `packages/demo/src/demo-app/layout.tsx` has a hidden native file input for upload. That may be a practical browser-file-picker necessity, but it should be explicitly documented/waived because raw inputs are normally forbidden in the UI host.

Impact: not all of this is necessarily user-facing, but the current logs and native elements weaken the HeroUI/a11y gate story.

Remediation direction: fix test mocks that leak props, audit real Pressable focusability, replace `<details>` with HeroUI Accordion/Disclosure, and document any unavoidable file-input exception.

### Medium - Build Output Is Large And Has Browser Externalization Warnings

Evidence:

- `npm run build` warns that Node `util` is externalized for browser compatibility due to `ag-psd/dist/abr.js` and `ag-psd/dist/additionalInfo.js`.
- Vite reports chunks larger than 500 kB; the largest built JS chunks are roughly 1.26 MB and 2.73 MB minified.
- CT builds also show very large chunks, including multi-megabyte bundled HeroUI/lucide/demo chunks.

Impact: the app builds, but first-load and lazy-boundary behavior need scrutiny before production. Browser externalization warnings are especially worth testing on PSD import/export paths in a built app, not only in unit tests.

Remediation direction: inspect bundle composition, ensure `@broadset/formats` remains behind lazy boundaries in the demo, split heavy format/export code where needed, and run built-app smoke tests for PSD/PDF/PPTX/SVG workflows.

### Medium - Dev Dependency Audit Is Not Clean

Evidence:

- Production audit (`npm audit --omit=dev`) reports 0 vulnerabilities.
- Full audit reports high-severity `vite` through `@playwright/experimental-ct-core/node_modules/vite <=6.4.1` and moderate `postcss <8.5.10`.

Impact: not a shipped runtime dependency issue, but dev server/test tooling vulnerabilities matter for local preview, CI, and supply-chain posture.

Remediation direction: update the affected transitive path where Playwright CT permits it, or track as an explicit tooling-risk exception until upstream updates land.

## Positive Signals

- Strict lint/type/unit quality is green across all packages.
- Type coverage meets the `99.95%` gate exactly enough to pass.
- Production dependency audit is clean.
- Production build completes.
- Package boundary scan did not reveal obvious cross-package import violations in source; imports mostly follow the architecture graph.
- Renderer-side SVG rendering now goes through a sanitizer (`packages/renderer/src/elements/svg.ts`), so the older direct `innerHTML` renderer issue in the historical bug report appears fixed.
- SVG importer/exporter has much stronger targeted security coverage than earlier reports suggested, though the over-cap preservation edge remains.

## Suggested Release Readiness Path

1. Fix the two critical bugs: imported text sanitization before inline editing, and importer page-instance creation for active-page rendering.
2. Make `gate:full` green by resolving `knip` findings and direct dependency declarations.
3. Close parser/resource cap issues for SVG/PPTX/PDF/PSD and unbounded export fetches.
4. Add import visual CTs that assert canvas/layers after PDF/PSD/PPTX/SVG import, not only document state.
5. Complete the cross-region CT inventory and fill missing coverage.
6. Stabilize CT flakiness with repeated full-suite runs.
7. Run built-app smoke tests for heavy import/export workflows and inspect bundle split points.
8. Close or explicitly defer external validation items: PowerPoint-on-Windows sanity, PPTX visual snapshot gate, large-deck tests, PSD/PDF real-world corpora and caps.
