# Wave W3 implementation plan

Status: draft — re-sliced at the W2 phase exit

Draft task stacks for interoperability and delivery excellence. File paths that exist in today's tree are named directly; paths expected to be created (including paths W1/W2 initiatives introduce) are marked `(new)`. Every XL/XXL initiative carries a draft PR-slice table; slices, not initiatives, are the PR unit.

## W3-CORPUS-01 tasks

### T1 — Corpus manifest schema, hash validation, and CI gate

- Files: `test/corpus/manifest.json` (new), `scripts/check-corpus.mjs` (new), `scripts/check-corpus.test.mjs` (new), `.github/workflows/ci.yml`
- Interfaces: `CorpusEntry` (id, sha256, license, provenance, fetch instructions, feature assertions, expected warnings), `validateCorpusManifest`
- RED: validator tests fail when a referenced golden or fixture is missing on disk, when a hash mismatches, or when an entry lacks license/provenance/fetch fields → GREEN: implement the Zod-checked manifest schema and the validator wired into CI so any missing golden or fixture fails the build
- Commit: `feat(scripts): add interop corpus manifest validator to CI`

### T2 — Fetch/generation tooling and update policy

- Files: `scripts/corpus/fetch-corpus.mjs` (new), `scripts/corpus/generate-fixtures.mjs` (new), `project/implementation/corpus-policy.md` (new)
- Interfaces: none
- RED: a dry-run test asserts every manifest entry is reproducible — fetchable from its recorded source or regenerable from a seeded generator — and fails for any entry with neither → GREEN: implement fetch and deterministic generation tooling plus the written update policy (adding, superseding, and license-auditing entries)
- Commit: `feat(scripts): add corpus fetch and generation tooling with update policy`

### T3 — Migrate existing per-format fixtures under the manifest

- Files: `packages/formats/src/psd/__fixtures__`, `packages/formats/src/pdf/__fixtures__`, `packages/formats/src/svg/__fixtures__`, `packages/formats/src/pptx/fixtures`, `test/corpus/manifest.json` (new)
- Interfaces: none
- RED: manifest-coverage test reports fixture files on disk that no manifest entry claims (or entries claiming absent files) across the four format fixture trees → GREEN: register every existing fixture with hash, license, provenance, and feature assertions until the coverage diff is empty
- Commit: `test(formats): register existing format fixtures in the corpus manifest`

## W3-RECON-01 tasks

### T1 — Import report model with appearance/editability scores and confidence

- Files: `packages/formats/src/import-report/report.ts` (new), `packages/formats/src/import-report/report.test.ts` (new), `packages/formats/src/import-document-types.ts`, `packages/formats/src/index.ts`
- Interfaces: `ImportReport`, `AppearanceScore`, `EditabilityScore`, `ElementConfidence`, `scoreImport`, `SilentDropAudit`
- RED: scoring tests over corpus imports fail — appearance and editability must be reported separately per element with confidence, and a silent-drop audit must prove every source element is mapped, preserved, or warned (QG-INT-02) → GREEN: implement the report model and the audit that every importer must satisfy before returning
- Commit: `feat(formats): add import report with appearance and editability scores`

### T2 — Undoable reconciliation actions and exportable warnings

- Files: `packages/formats/src/apply-reconciliation-choices.ts`, `packages/editor/src/reconciliation-commands.ts` (new), `packages/editor/src/reconciliation-commands.test.ts` (new), `packages/formats/src/import-report/warning-export.ts` (new)
- Interfaces: `ReconciliationAction`, `applyReconciliationAction`, `exportImportWarnings`
- RED: history tests fail — each reconciliation decision must be a single undoable transaction that restores the pre-decision document exactly; warning-export tests fail for the machine-readable report file → GREEN: route reconciliation choices through registry commands with grouped undo and implement warning export
- Commit: `feat(editor): make reconciliation actions undoable with exportable warnings`

### T3 — Report UI: side-by-side diff, fallback visibility, accessible warnings

- Files: `packages/ui/src/modals/format-reconciliation.tsx`, `packages/ui/src/modals/import-report.tsx` (new), `packages/ui/src/modals/format-import-warnings.tsx`, `packages/ui/ct/import-report-flow.ct.tsx` (new)
- Interfaces: `ImportReportModalProps`, `SideBySideDiffProps`
- RED: cross-region CTs fail — accepting a per-element reconciliation choice in the modal must update the canvas and layers panel, warnings must be screen-reader accessible and keyboard-operable (QG-A11Y-01), and fallback elements must be visibly badged → GREEN: build the report modal with side-by-side source/result diff, per-element confidence display, and accessible warning list
- Commit: `feat(ui): add import report modal with side-by-side diff`

| Slice          | Scope                                                    | Proof                           | Rollback / evidence         | Merge prerequisite |
| -------------- | -------------------------------------------------------- | ------------------------------- | --------------------------- | ------------------ |
| W3-RECON-01.S1 | Report model: appearance/editability scores + confidence | scoring unit tests              | revert slice; unit-test log | none               |
| W3-RECON-01.S2 | Silent-drop audit enforced across importers (QG-INT-02)  | audit sweep over corpus imports | revert slice; audit report  | W3-RECON-01.S1     |
| W3-RECON-01.S3 | Undoable reconciliation commands                         | history unit tests              | revert slice; unit-test log | W3-RECON-01.S2     |
| W3-RECON-01.S4 | Warning export (machine-readable report file)            | export round-trip tests         | revert slice; unit-test log | W3-RECON-01.S3     |
| W3-RECON-01.S5 | Report modal with per-element confidence                 | modal CT                        | revert slice; CT trace      | W3-RECON-01.S4     |
| W3-RECON-01.S6 | Side-by-side diff + fallback visibility                  | diff CT (modal → canvas)        | revert slice; CT trace      | W3-RECON-01.S5     |
| W3-RECON-01.S7 | Accessible warnings (QG-A11Y-01)                         | keyboard/AT CT                  | revert slice; CT trace      | W3-RECON-01.S6     |
| W3-RECON-01.S8 | Demo wiring + cross-region CT sweep over corpus imports  | full import-report CT sweep     | revert slice; CT run        | W3-RECON-01.S7     |

## W3-PSD-01 tasks

### T1 — Color modes, ICC profiles, and 16/32 bits per channel

- Files: `packages/formats/src/psd/color-utils.ts`, `packages/formats/src/psd/import.ts`, `packages/formats/src/psd/depth-decode.ts` (new), `packages/formats/src/psd/depth-decode.test.ts` (new), `packages/formats/src/_shared/color/color-ops.ts`
- Interfaces: `decodeChannelData` (8/16/32 bpc), `resolvePsdColorProfile`
- RED: corpus tests fail for CMYK/Lab/grayscale/indexed modes and 16/32 bpc fixtures; profile-managed conversions exceed ΔE00 budgets (QG-COR-02) → GREEN: implement depth-aware channel decoding and ICC-profile-managed conversion through the shared color pipeline
- Commit: `feat(formats): decode psd color modes, profiles, and deep channels`

### T2 — Effects, clipping and adjustment layers, smart-object preservation

- Files: `packages/formats/src/psd/import-document.ts`, `packages/formats/src/psd/effects-map.ts` (new), `packages/formats/src/psd/effects-map.test.ts` (new), `packages/formats/src/psd/reconcile.ts`
- Interfaces: `mapLayerEffects`, `AdjustmentLayerFallback`, `SmartObjectPreservation`
- RED: third-party corpus tests fail — layer effects must map to Broadset styles where representable, clipping and adjustment layers must map or produce labeled fallbacks with warnings (QG-INT-02), and smart objects plus opaque data must survive re-export byte-preserved → GREEN: implement effect mapping, adjustment/clipping handling, and opaque preservation (BsPs) round-tripping
- Commit: `feat(formats): map psd effects and preserve smart objects`

### T3 — Support matrix closure and Photoshop manual protocol

- Files: `packages/formats/src/psd/corpus.test.ts`, `packages/formats/src/psd/producer-quirks.test.ts`, `project/spec/formats/psd.md`, `project/implementation/evidence/psd-photoshop-protocol.md` (new)
- Interfaces: none
- RED: the advertised support matrix reports open P5 and CFIO PSD gap rows against the corpus (QG-INT-01) → GREEN: close each gap row with corpus fixtures and assertions, update the spec support matrix, and document the Photoshop manual validation protocol executed at the maintainer external evidence gate
- Commit: `test(formats): close psd support matrix with photoshop protocol`

| Slice        | Scope                                                       | Proof                                   | Rollback / evidence          | Merge prerequisite |
| ------------ | ----------------------------------------------------------- | --------------------------------------- | ---------------------------- | ------------------ |
| W3-PSD-01.S1 | ICC profile-managed color decode + ΔE00 harness (QG-COR-02) | color corpus tests within budget        | revert slice; ΔE00 report    | none               |
| W3-PSD-01.S2 | 16/32 bpc channel decoding                                  | deep-channel corpus tests               | revert slice; unit-test log  | W3-PSD-01.S1       |
| W3-PSD-01.S3 | Color modes (CMYK/Lab/grayscale/indexed)                    | mode corpus tests                       | revert slice; unit-test log  | W3-PSD-01.S2       |
| W3-PSD-01.S4 | Layer effects mapping                                       | effects corpus tests                    | revert slice; unit-test log  | W3-PSD-01.S3       |
| W3-PSD-01.S5 | Clipping + adjustment layers (map or labeled fallback)      | clipping/adjustment tests (QG-INT-02)   | revert slice; warning report | W3-PSD-01.S4       |
| W3-PSD-01.S6 | Smart-object + opaque preservation (BsPs) round-trip        | byte-preservation tests                 | revert slice; round-trip log | W3-PSD-01.S5       |
| W3-PSD-01.S7 | P5/CFIO gap-row closure + support matrix (QG-INT-01)        | matrix sweep green over corpus          | revert slice; matrix report  | W3-PSD-01.S6       |
| W3-PSD-01.S8 | Photoshop manual protocol doc + evidence index              | protocol doc reviewed; docs:check green | revert slice; protocol doc   | W3-PSD-01.S7       |

## W3-PDF-01 tasks

### T1 — Pre-parse caps, page boxes, CTMs, and clipping

- Files: `packages/formats/src/pdf/import/parse.ts`, `packages/formats/src/pdf/import/operators.ts`, `packages/formats/src/pdf/geometry.ts`, `packages/formats/src/pdf/import-resource-caps.test.ts`, `packages/formats/src/pdf/import/page-boxes.ts` (new)
- Interfaces: `PreParseCaps`, `resolvePageBoxes`, `ClipStack`
- RED: hostile corpus tests fail — every input must be size- and structure-capped before full parsing (QG-SEC-01); page-box, nested-CTM, and clipping fixtures exceed geometry budgets (QG-COR-01) → GREEN: enforce pre-parse caps in the worker path and implement exact page-box, CTM, and clip-stack handling
- Commit: `feat(formats): add pdf pre-parse caps with exact page geometry`

### T2 — Text and CMaps with exact run identity

- Files: `packages/formats/src/pdf/text.ts`, `packages/formats/src/pdf/import/cmap.ts` (new), `packages/formats/src/pdf/import/cmap.test.ts` (new), `packages/formats/src/pdf/fonts.ts`
- Interfaces: `decodeCMapText`, `TextRunAssembly`
- RED: CMap corpus fixtures (Identity-H, embedded, predefined CJK CMaps, ToUnicode gaps) fail text content and run-identity checks (QG-COR-03) → GREEN: implement full CMap decoding and run assembly on the W1-TEXT-01 text model so extracted runs are exact
- Commit: `feat(formats): decode pdf cmaps with exact run identity`

### T3 — Images, resources, per-page mapping, and import scores

- Files: `packages/formats/src/pdf/import/third-party.ts`, `packages/formats/src/pdf/import/resources.ts` (new), `packages/formats/src/pdf/import/resources.test.ts` (new), `packages/formats/src/pdf/import/preservation-blobs.ts`
- Interfaces: `resolveResourceDictionary`, `PerPageMapping`
- RED: rich third-party fixtures fail — image decoding (filters, color spaces, SMasks), shared resource resolution, and per-page mapping to Broadset pages must pass, and every import must emit the W3-RECON-01 report with separate editability and appearance scores; P6.4b, P6.G1, and P6.G3 rows remain open → GREEN: implement image/resource handling and per-page mapping wired to the import report until the gap rows close
- Commit: `feat(formats): import pdf images and resources with per-page mapping`

| Slice        | Scope                                            | Proof                             | Rollback / evidence               | Merge prerequisite |
| ------------ | ------------------------------------------------ | --------------------------------- | --------------------------------- | ------------------ |
| W3-PDF-01.S1 | Pre-parse caps before full parsing (QG-SEC-01)   | hostile-input cap tests           | revert slice; fuzz report         | none               |
| W3-PDF-01.S2 | Page boxes (media/crop/trim/bleed)               | page-box corpus tests (QG-COR-01) | revert slice; unit-test log       | W3-PDF-01.S1       |
| W3-PDF-01.S3 | CTM + clipping stacks                            | geometry corpus tests             | revert slice; unit-test log       | W3-PDF-01.S2       |
| W3-PDF-01.S4 | CMap decoding + run identity (QG-COR-03)         | CMap corpus green                 | revert slice; run-identity report | W3-PDF-01.S3       |
| W3-PDF-01.S5 | Image decoding (filters, color spaces, SMasks)   | image corpus tests                | revert slice; unit-test log       | W3-PDF-01.S4       |
| W3-PDF-01.S6 | Resource dictionaries + path fidelity            | resource corpus tests             | revert slice; unit-test log       | W3-PDF-01.S5       |
| W3-PDF-01.S7 | Per-page mapping + preservation blobs            | per-page round-trip tests         | revert slice; round-trip log      | W3-PDF-01.S6       |
| W3-PDF-01.S8 | Import report scores + P6.4b/P6.G1/P6.G3 closure | report sweep + gap rows closed    | revert slice; matrix report       | W3-PDF-01.S7       |

## W3-PDF-02 tasks

### T1 — Real output profiles and CMYK/Lab/spot support policy

- Files: `packages/formats/src/pdf/export/color.ts`, `packages/formats/src/pdf/export/pdfa.ts`, `packages/formats/src/_shared/color/default-profiles.ts`, `project/spec/formats/pdf.md`
- Interfaces: `OutputIntentProfile`, `SpotColorPolicy`
- RED: export tests fail — PDF/A output intents must embed real ICC profiles, and the CMYK/Lab/spot policy (convert, preserve, or refuse with a warning) must be explicit and enforced; P6.G2 and P9.G1–G3 rows remain open in the support matrix → GREEN: implement profile embedding and the documented color policy until the matrix and validators agree
- Commit: `feat(formats): embed real output profiles with explicit color policy`

### T2 — Font totality, veraPDF gate, and canonical viewer matrix

- Files: `packages/formats/src/pdf/export/fonts.ts`, `packages/formats/src/pdf/export/preflight.ts`, `.github/workflows/verapdf.yml`, `project/implementation/evidence/pdf-viewer-matrix.md` (new)
- Interfaces: `FontEmbedTotalityReport`
- RED: font-totality tests fail for any text that would render without an embedded, subset font; veraPDF CI reports failures on advertised PDF/A rows (QG-INT-01) → GREEN: enforce total font embedding, keep veraPDF green for every advertised conformance level, and document the canonical viewer validation matrix executed at the maintainer external evidence gate
- Commit: `feat(formats): enforce pdf font totality with verapdf gate`

## W3-SVG-01 tasks

### T1 — Full CSS, defs, and structural use/symbol policy

- Files: `packages/formats/src/svg/import-css.ts`, `packages/formats/src/svg/import-defs.ts`, `packages/formats/src/svg/import-transforms.test.ts`, `packages/formats/src/svg/use-symbol-policy.ts` (new), `packages/formats/src/svg/use-symbol-policy.test.ts` (new)
- Interfaces: `UseSymbolResolution` (structural reuse vs expansion), `resolveCssCascade`
- RED: corpus tests fail for CSS cascade/specificity, nested defs, `use`/`symbol` reuse, and transform-list fidelity; P7.G1–G3 rows remain open → GREEN: implement full CSS resolution, the documented structural reuse policy, and exact transform handling until the gap rows close
- Commit: `feat(formats): resolve svg css cascade with structural reuse policy`

### T2 — Animated-SVG strategy and safe fallback

- Files: `packages/formats/src/svg/import.ts`, `packages/formats/src/svg/import-security.ts`, `packages/formats/src/svg/animated-svg.ts` (new), `packages/formats/src/svg/animated-svg.test.ts` (new), `packages/formats/src/svg/KNOWN-GAPS.md`
- Interfaces: `AnimatedSvgStrategy` (map to timeline, preserve, or warn)
- RED: animated-SVG fixtures (SMIL, CSS animations) fail — each must map to Broadset animations where representable or fall back safely with a warning, never a silent drop (QG-INT-02); sanitizer symmetry with W1-SEC-01 must hold → GREEN: implement the animated-SVG strategy and safe-fallback path with warnings surfaced through the import report
- Commit: `feat(formats): add animated svg strategy with safe fallback`

### T3 — Cross-browser raster parity harness

- Files: `packages/formats/src/svg/corpus.test.ts`, `packages/formats/src/svg/raster-parity.ct.tsx` (new), `test/corpus/manifest.json` (new)
- Interfaces: none
- RED: raster-parity checks against Chromium, WebKit, and Firefox reference renders exceed the approved perceptual threshold on corpus fixtures → GREEN: render imported documents and compare against per-engine references until parity holds, recording per-fixture baselines in the corpus manifest
- Commit: `test(formats): add cross-browser svg raster parity harness`

## W3-PPTX-01 tasks

### T1 — Layout and master inheritance with placeholders and groups

- Files: `packages/formats/src/pptx/import.ts`, `packages/formats/src/pptx/inheritance.ts` (new), `packages/formats/src/pptx/inheritance.test.ts` (new), `packages/formats/src/pptx/reconcile.ts`
- Interfaces: `resolveInheritanceChain` (slide → layout → master), `PlaceholderResolution`
- RED: third-party corpus decks fail — placeholder properties must resolve through the full slide/layout/master chain, and nested groups must preserve transforms exactly → GREEN: implement the inheritance resolver and group handling on the semantic import path
- Commit: `feat(formats): resolve pptx layout and master inheritance`

### T2 — Text/theme fidelity and tables/charts native-or-labeled fallback

- Files: `packages/formats/src/pptx/import.ts`, `packages/formats/src/pptx/theme-export.test.ts`, `packages/formats/src/pptx/tables-charts.ts` (new), `packages/formats/src/pptx/tables-charts.test.ts` (new)
- Interfaces: `mapThemeColorScheme`, `TableChartFallback`
- RED: theme fixtures fail scheme/font resolution on the W1-TEXT-01 run model (QG-COR-03 for text content); tables and charts neither map natively nor produce labeled fallbacks with warnings (QG-INT-02) → GREEN: implement theme-aware text fidelity and native-or-labeled table/chart handling
- Commit: `feat(formats): map pptx themes with table and chart fallback`

### T3 — Large-deck worker path, XSD/LibreOffice CI, and PowerPoint protocol

- Files: `packages/formats/src/pptx/performance.test.ts`, `packages/formats/src/pptx/openxml-xsd-validate.test.ts`, `packages/formats/src/pptx/libreoffice-verify.test.ts`, `project/implementation/evidence/pptx-powerpoint-protocol.md` (new)
- Interfaces: none
- RED: large-deck fixtures exceed main-thread budgets outside the W1-WORKER-01 path; exported decks fail OOXML XSD validation; LibreOffice round-trip evidence is absent from CI; P8 and CFIO PPTX gap rows remain open (QG-INT-01) → GREEN: route large decks through the worker, keep XSD and LibreOffice lanes green in CI, close the gap rows, and document the PowerPoint-on-Windows manual protocol for the maintainer external evidence gate
- Commit: `test(formats): close pptx matrix with xsd and libreoffice gates`

| Slice         | Scope                                                | Proof                                   | Rollback / evidence          | Merge prerequisite |
| ------------- | ---------------------------------------------------- | --------------------------------------- | ---------------------------- | ------------------ |
| W3-PPTX-01.S1 | Slide/layout/master inheritance resolver             | inheritance corpus tests                | revert slice; unit-test log  | none               |
| W3-PPTX-01.S2 | Placeholders + nested groups                         | placeholder/group corpus tests          | revert slice; unit-test log  | W3-PPTX-01.S1      |
| W3-PPTX-01.S3 | Theme color/font scheme fidelity                     | theme corpus tests                      | revert slice; unit-test log  | W3-PPTX-01.S2      |
| W3-PPTX-01.S4 | Text fidelity on the run model (QG-COR-03)           | run-identity tests                      | revert slice; run report     | W3-PPTX-01.S3      |
| W3-PPTX-01.S5 | Tables/charts native-or-labeled fallback (QG-INT-02) | table/chart tests + warnings            | revert slice; warning report | W3-PPTX-01.S4      |
| W3-PPTX-01.S6 | Large-deck worker path within budgets                | performance tests                       | revert slice; perf report    | W3-PPTX-01.S5      |
| W3-PPTX-01.S7 | OOXML XSD + LibreOffice round-trip CI lanes          | XSD + LibreOffice CI green              | revert slice; CI evidence    | W3-PPTX-01.S6      |
| W3-PPTX-01.S8 | P8/CFIO gap closure + PowerPoint manual protocol     | matrix sweep (QG-INT-01) + protocol doc | revert slice; matrix report  | W3-PPTX-01.S7      |

## W3-MOTION-01 tasks

### T1 — Sequence, preset, and behavior model with deterministic seeds

- Files: `packages/model/src/motion/sequences.ts` (new), `packages/model/src/motion/sequences.test.ts` (new), `packages/playback/src/behaviors.ts` (new), `packages/playback/src/behaviors.test.ts` (new), `packages/model/src/index.ts`
- Interfaces: `MotionSequence`, `MotionPreset`, `Behavior`, `RepeaterConfig`, `StaggerConfig`, `SeededRandom`
- RED: determinism tests fail — procedural behaviors, repeaters, and stagger evaluated twice from the same seed must produce identical keyframe streams, per the RFC-04 contract → GREEN: implement the sequence/preset/behavior schema and seeded procedural evaluation shared by preview and playback
- Commit: `feat(model): add motion sequences and seeded behaviors per RFC-04`

### T2 — Text animators, time remap, and bake-to-keyframes

- Files: `packages/playback/src/text-animator.ts`, `packages/playback/src/time-remap.ts` (new), `packages/editor/src/motion/bake.ts` (new), `packages/editor/src/motion/bake.test.ts` (new)
- Interfaces: `TextAnimatorRange`, `TimeRemapCurve`, `bakeToKeyframes`
- RED: bake-equivalence tests fail — sampling a baked sequence at every frame must reproduce live procedural output exactly; text-animator range selectors and time-remap curves fail oracle tests → GREEN: extend the text animator, implement time remap, and implement exact bake-to-keyframes
- Commit: `feat(playback): add text animators, time remap, and exact bake`

### T3 — Onion skin, motion blur, timeline UI, and parity gates

- Files: `packages/renderer/src/onion-skin.tsx` (new), `packages/renderer/src/motion-blur.ts` (new), `packages/ui/src/timeline/motion-presets-panel.tsx` (new), `packages/ui/ct/motion-authoring-flow.ct.tsx` (new)
- Interfaces: `OnionSkinConfig`, `MotionBlurConfig`, `MotionPresetsPanelProps`
- RED: cross-region CTs fail (apply preset in panel → canvas animates and timeline gains lanes); export-parity tests comparing exported frames to live playback fail; authoring and playback frame budgets are exceeded → GREEN: mount onion skin, motion blur, and the presets panel, and hold export parity and performance budgets
- Commit: `feat(ui): add motion presets panel with onion skin and blur`

| Slice           | Scope                                               | Proof                          | Rollback / evidence         | Merge prerequisite |
| --------------- | --------------------------------------------------- | ------------------------------ | --------------------------- | ------------------ |
| W3-MOTION-01.S1 | Sequence/preset/behavior schema                     | model validation tests         | revert slice; unit-test log | none               |
| W3-MOTION-01.S2 | Seeded procedural evaluation (deterministic replay) | seed-determinism tests         | revert slice; replay report | W3-MOTION-01.S1    |
| W3-MOTION-01.S3 | Repeaters + stagger                                 | repeater/stagger oracle tests  | revert slice; unit-test log | W3-MOTION-01.S2    |
| W3-MOTION-01.S4 | Text animators                                      | animator oracle tests          | revert slice; unit-test log | W3-MOTION-01.S3    |
| W3-MOTION-01.S5 | Time remap                                          | remap curve tests              | revert slice; unit-test log | W3-MOTION-01.S4    |
| W3-MOTION-01.S6 | Bake-to-keyframes exactness                         | bake-equivalence tests         | revert slice; bake report   | W3-MOTION-01.S5    |
| W3-MOTION-01.S7 | Onion skin + motion blur rendering                  | renderer tests + CT            | revert slice; CT trace      | W3-MOTION-01.S6    |
| W3-MOTION-01.S8 | Presets panel + timeline integration                | cross-region CT                | revert slice; CT trace      | W3-MOTION-01.S7    |
| W3-MOTION-01.S9 | Export parity + performance budgets                 | parity tests + perf assertions | revert slice; parity report | W3-MOTION-01.S8    |

## W3-MOTION-02 tasks

### T1 — Typed expression core: parser, checker, and sandboxed total evaluation

- Files: `packages/playback/src/expressions/parser.ts` (new), `packages/playback/src/expressions/type-check.ts` (new), `packages/playback/src/expressions/evaluate.ts` (new), `packages/playback/src/expressions/evaluate.test.ts` (new), `packages/playback/src/index.ts`
- Interfaces: `ExpressionAst`, `ExpressionType`, `evaluateExpression`, `ExpressionDiagnostic`
- RED: totality tests fail — hostile expressions (unbounded recursion, huge literals, cycles) must terminate within hard caps without hanging or crashing the editor, and evaluation of the same inputs must replay deterministically per the RFC-05 contract → GREEN: implement the typed parser, checker, and sandboxed evaluator with step and memory budgets
- Commit: `feat(playback): add typed expression evaluation per RFC-05`

### T2 — Dependency graph, cycle diagnostics, and value tracing

- Files: `packages/playback/src/expressions/dependency-graph.ts` (new), `packages/playback/src/expressions/dependency-graph.test.ts` (new), `packages/playback/src/expressions/trace.ts` (new)
- Interfaces: `ExpressionDependencyGraph`, `detectExpressionCycles`, `ValueTrace`
- RED: cycle tests fail — any dependency cycle must be detected, reported with a path, and evaluated to the documented fallback instead of looping; value-trace tests must record every intermediate value for a sampled frame → GREEN: implement the dependency graph, cycle diagnostics, and per-frame value tracing consumed by the authoring UI
- Commit: `feat(playback): add expression dependency graph with value tracing`

### T3 — Authoring UI with keyboard-operable diagnostics

- Files: `packages/ui/src/panels/expression-editor.tsx` (new), `packages/editor/src/expressions/binding.ts` (new), `packages/ui/ct/expression-authoring-flow.ct.tsx` (new), `packages/ui/src/index.ts`
- Interfaces: `ExpressionEditorProps`, `bindExpressionToProperty`
- RED: cross-region CTs fail (author expression in panel → bound property animates on canvas and trace inspector updates); diagnostics, dependency graph, and value traces must be fully keyboard-operable (QG-A11Y-01) → GREEN: build the HeroUI expression editor with typed autocomplete, inline diagnostics, and the trace inspector
- Commit: `feat(ui): add typed expression editor with trace diagnostics`

| Slice           | Scope                                                 | Proof                     | Rollback / evidence           | Merge prerequisite |
| --------------- | ----------------------------------------------------- | ------------------------- | ----------------------------- | ------------------ |
| W3-MOTION-02.S1 | Parser + typed AST                                    | parser unit tests         | revert slice; unit-test log   | none               |
| W3-MOTION-02.S2 | Type checker + diagnostics                            | checker unit tests        | revert slice; unit-test log   | W3-MOTION-02.S1    |
| W3-MOTION-02.S3 | Sandboxed total evaluator (caps, no hangs)            | hostile-expression tests  | revert slice; totality report | W3-MOTION-02.S2    |
| W3-MOTION-02.S4 | Deterministic replay                                  | replay-identity tests     | revert slice; replay report   | W3-MOTION-02.S3    |
| W3-MOTION-02.S5 | Dependency graph + cycle detection                    | cycle property tests      | revert slice; unit-test log   | W3-MOTION-02.S4    |
| W3-MOTION-02.S6 | Value tracing                                         | trace unit tests          | revert slice; unit-test log   | W3-MOTION-02.S5    |
| W3-MOTION-02.S7 | Expression editor UI + property binding               | cross-region authoring CT | revert slice; CT trace        | W3-MOTION-02.S6    |
| W3-MOTION-02.S8 | Keyboard-operable diagnostics (QG-A11Y-01) + CT sweep | keyboard/AT CT green      | revert slice; CT run          | W3-MOTION-02.S7    |

## W3-VIDEO-01 tasks

### T1 — Capability detection, codec matrix, and exact frame timestamps

- Files: `packages/formats/src/video/capabilities.ts` (new), `packages/formats/src/video/capabilities.test.ts` (new), `packages/formats/src/video/frame-clock.ts` (new), `packages/formats/src/interchange/video-export.test.ts`
- Interfaces: `ExportCapabilityMatrix`, `detectEncoderSupport`, `exactFrameTimestamp`
- RED: capability tests fail — the published MP4/WebM/GIF/PNG/EXR matrix must be derived from runtime detection, never assumed; timestamp tests fail for drift over long durations against the W1-TIME-01 clock → GREEN: implement capability detection and exact rational-time frame timestamps shared by all encoders
- Commit: `feat(formats): add video export capability matrix with exact timestamps`

### T2 — Deterministic encoders with audio mux and alpha policy

- Files: `packages/formats/src/video/encode-mp4.ts` (new), `packages/formats/src/video/encode-webm.ts` (new), `packages/formats/src/video/encode-sequence.ts` (new), `packages/formats/src/video/media-inspection.test.ts` (new)
- Interfaces: `VideoEncodeJob`, `AudioMuxPolicy`, `AlphaPolicy`
- RED: media-inspection tests fail — produced files must match the published codec matrix on inspection, A/V duration and frame counts must be exact, and offline renders must produce stable frame hashes (QG-REL-01); alpha and audio-mux policies must be enforced per format → GREEN: implement the encoders over deterministic offline rendering with the W2-AUDIO-01 mux path
- Commit: `feat(formats): add deterministic video encoders with media inspection`

### T3 — Export queue UI with progress, cancel, and resume

- Files: `packages/ui/src/modals/video-export.tsx` (new), `packages/editor/src/export-queue.ts` (new), `packages/editor/src/export-queue.test.ts` (new), `packages/ui/ct/video-export-flow.ct.tsx` (new)
- Interfaces: `ExportQueue`, `ExportJobState` (queued/running/cancelled/resumable/done), `VideoExportModalProps`
- RED: cross-region CTs fail — starting an export shows visible progress, cancel releases resources, and resume continues from the last completed chunk; wall-clock and media-duration budgets are exceeded on the reference corpus → GREEN: implement the persistent export queue and modal UI meeting the budgets
- Commit: `feat(ui): add video export queue with progress and resume`

| Slice          | Scope                                         | Proof                           | Rollback / evidence          | Merge prerequisite |
| -------------- | --------------------------------------------- | ------------------------------- | ---------------------------- | ------------------ |
| W3-VIDEO-01.S1 | Capability detection + published codec matrix | capability tests                | revert slice; unit-test log  | none               |
| W3-VIDEO-01.S2 | Exact frame timestamps on the shared clock    | drift tests over long durations | revert slice; timing report  | W3-VIDEO-01.S1     |
| W3-VIDEO-01.S3 | PNG/EXR sequence export                       | sequence hash tests (QG-REL-01) | revert slice; hash report    | W3-VIDEO-01.S2     |
| W3-VIDEO-01.S4 | WebM encoder + alpha policy                   | media inspection tests          | revert slice; inspection log | W3-VIDEO-01.S3     |
| W3-VIDEO-01.S5 | MP4 encoder + audio mux policy                | A/V duration/frame tests        | revert slice; inspection log | W3-VIDEO-01.S4     |
| W3-VIDEO-01.S6 | GIF export                                    | inspection + palette tests      | revert slice; inspection log | W3-VIDEO-01.S5     |
| W3-VIDEO-01.S7 | Export queue (progress/cancel/resume)         | queue unit tests                | revert slice; unit-test log  | W3-VIDEO-01.S6     |
| W3-VIDEO-01.S8 | Export modal UI + demo wiring                 | cross-region export CT          | revert slice; CT trace       | W3-VIDEO-01.S7     |
| W3-VIDEO-01.S9 | Wall-clock + media-duration budgets           | perf assertions on corpus       | revert slice; perf report    | W3-VIDEO-01.S8     |

## W3-LOTTIE-01 tasks

### T1 — Lottie import with supported-feature matrix and fallback

- Files: `packages/formats/src/lottie/import.ts` (new), `packages/formats/src/lottie/feature-matrix.ts` (new), `packages/formats/src/lottie/import.test.ts` (new), `packages/formats/src/index.ts`
- Interfaces: `importLottie`, `LottieFeatureMatrix`, `LottieFallback`
- RED: corpus tests fail — supported features (shapes, transforms, keyframes, precomps within the matrix) must map onto the W1-SCENE-01 scene model, and unsupported features must produce warnings, never silent drops (QG-INT-02) → GREEN: implement the importer against the explicit feature matrix with report-integrated fallback
- Commit: `feat(formats): add lottie import with explicit feature matrix`

### T2 — Lottie and dotLottie export with theming

- Files: `packages/formats/src/lottie/export.ts` (new), `packages/formats/src/lottie/dotlottie.ts` (new), `packages/formats/src/lottie/export.test.ts` (new)
- Interfaces: `exportLottie`, `exportDotLottie`, `LottieThemeBinding`
- RED: export round-trip tests fail — exported animations must re-import within the feature matrix without loss, dotLottie packaging must bundle assets and themes, and theme bindings must map document variables where representable → GREEN: implement export and dotLottie packaging with theming
- Commit: `feat(formats): add lottie and dotlottie export with theming`

### T3 — Validator and perceptual-diff conformance

- Files: `packages/formats/src/lottie/validate.ts` (new), `packages/formats/src/lottie/perceptual-diff.test.ts` (new), `test/corpus/manifest.json` (new)
- Interfaces: `validateLottie`
- RED: perceptual-diff tests comparing Broadset playback frames against reference lottie-player renders exceed 1% at the approved threshold on the supported corpus → GREEN: implement the schema validator and close rendering gaps until the corpus passes with per-fixture baselines recorded in the manifest
- Commit: `test(formats): add lottie validator and perceptual diff gate`

| Slice           | Scope                                                  | Proof                           | Rollback / evidence          | Merge prerequisite |
| --------------- | ------------------------------------------------------ | ------------------------------- | ---------------------------- | ------------------ |
| W3-LOTTIE-01.S1 | Feature matrix + schema validation                     | matrix/validator unit tests     | revert slice; unit-test log  | none               |
| W3-LOTTIE-01.S2 | Import: shapes, transforms, keyframes                  | import corpus tests             | revert slice; unit-test log  | W3-LOTTIE-01.S1    |
| W3-LOTTIE-01.S3 | Import: precomps + advanced supported features         | import corpus tests             | revert slice; unit-test log  | W3-LOTTIE-01.S2    |
| W3-LOTTIE-01.S4 | Fallback warnings for unsupported features (QG-INT-02) | warning tests via import report | revert slice; warning report | W3-LOTTIE-01.S3    |
| W3-LOTTIE-01.S5 | Lottie export round-trip                               | export round-trip tests         | revert slice; round-trip log | W3-LOTTIE-01.S4    |
| W3-LOTTIE-01.S6 | dotLottie packaging + theming                          | packaging tests                 | revert slice; unit-test log  | W3-LOTTIE-01.S5    |
| W3-LOTTIE-01.S7 | Perceptual-diff gate ≤1% on supported corpus           | diff harness green              | revert slice; diff report    | W3-LOTTIE-01.S6    |

## W3-FIGMA-01 tasks

### T1 — Figma file parsing mapped to components, variables, text, and assets

- Files: `packages/formats/src/figma/import.ts` (new), `packages/formats/src/figma/node-map.ts` (new), `packages/formats/src/figma/import.test.ts` (new), `packages/formats/src/index.ts`
- Interfaces: `importFigma`, `FigmaNodeMapping`, `FigmaAssetResolution`
- RED: corpus tests fail — Figma components/instances must map to W2-COMP-01 components, Figma variables/styles to W2-VAR-01 variables, text to the run model, and images/vectors to assets, with every unmapped node warned (QG-INT-02) → GREEN: implement the parser and mapping tables over the corpus fixtures
- Commit: `feat(formats): import figma files onto components and variables`

### T2 — Auto-layout and constraints where representable

- Files: `packages/formats/src/figma/auto-layout.ts` (new), `packages/formats/src/figma/auto-layout.test.ts` (new), `packages/formats/src/figma/constraints.ts` (new)
- Interfaces: `mapAutoLayout`, `mapConstraints`, `LayoutFidelityReport`
- RED: layout fixtures fail — auto-layout stacks and resize constraints must map to representable Broadset layout, and non-representable configurations must degrade to fixed geometry with a per-element fidelity warning → GREEN: implement the mapping with the documented representability policy; corpus coverage for mapped features passes in CI
- Commit: `feat(formats): map figma auto-layout and constraints`

### T3 — Update reconciliation preserving local edits with conflict UI

- Files: `packages/formats/src/figma/update-reconcile.ts` (new), `packages/formats/src/figma/update-reconcile.test.ts` (new), `packages/ui/src/modals/figma-update-conflicts.tsx` (new), `packages/ui/ct/figma-update-flow.ct.tsx` (new)
- Interfaces: `reconcileFigmaUpdate`, `UpdateConflict`, `FigmaUpdateConflictsProps`
- RED: update tests fail — re-importing a changed Figma file must preserve local edits per the documented policy, keep stable identity across updates, and present every non-mergeable change in the conflict UI (built on W3-RECON-01) with undoable decisions → GREEN: implement three-way reconciliation and the conflict modal
- Commit: `feat(formats): add figma update reconciliation with conflict ui`

| Slice          | Scope                                         | Proof                         | Rollback / evidence           | Merge prerequisite |
| -------------- | --------------------------------------------- | ----------------------------- | ----------------------------- | ------------------ |
| W3-FIGMA-01.S1 | File parsing + node model                     | parser unit tests             | revert slice; unit-test log   | none               |
| W3-FIGMA-01.S2 | Text, fills, effects, and asset mapping       | mapping corpus tests          | revert slice; unit-test log   | W3-FIGMA-01.S1     |
| W3-FIGMA-01.S3 | Components/instances → W2-COMP-01 mapping     | component mapping tests       | revert slice; unit-test log   | W3-FIGMA-01.S2     |
| W3-FIGMA-01.S4 | Variables/styles → W2-VAR-01 mapping          | variable mapping tests        | revert slice; unit-test log   | W3-FIGMA-01.S3     |
| W3-FIGMA-01.S5 | Auto-layout + constraints where representable | layout corpus tests           | revert slice; fidelity report | W3-FIGMA-01.S4     |
| W3-FIGMA-01.S6 | Stable identity + update reconciliation core  | three-way reconcile tests     | revert slice; unit-test log   | W3-FIGMA-01.S5     |
| W3-FIGMA-01.S7 | Local-edit preservation policy                | policy tests over edit corpus | revert slice; policy report   | W3-FIGMA-01.S6     |
| W3-FIGMA-01.S8 | Conflict UI + cross-region CT sweep           | conflict CT green             | revert slice; CT run          | W3-FIGMA-01.S7     |

## W3-OGRAF-01 tasks

### T1 — OGraf manifest and GDD export/import per RFC-12

- Files: `packages/formats/src/ograf/export.ts` (new), `packages/formats/src/ograf/import.ts` (new), `packages/formats/src/ograf/gdd.ts` (new), `packages/formats/src/ograf/gdd.test.ts` (new), `packages/formats/src/interchange/json-ograf.test.ts`
- Interfaces: `exportOgrafPackage`, `importOgrafPackage`, `GddSchemaMapping`
- RED: schema tests fail — exported manifests and GDD payload schemas must validate against the official OGraf schema (QG-BCAST-01), and W2-DATA-01 data schemas must round-trip through GDD without loss → GREEN: implement package export/import with the ratified RFC-12 mapping
- Commit: `feat(formats): add ograf manifest and gdd interchange per RFC-12`

### T2 — Lifecycle, steps, assets, fonts, and thumbnails

- Files: `packages/formats/src/ograf/lifecycle.ts` (new), `packages/formats/src/ograf/package-assets.ts` (new), `packages/formats/src/ograf/lifecycle.test.ts` (new)
- Interfaces: `OgrafLifecycleBinding` (load/play/step/stop/clear), `packageAssetsAndFonts`
- RED: lifecycle tests fail — document in/out/step animations must bind to OGraf lifecycle commands via the W1-PLAYER-01 runtime, and packages must bundle assets, subset fonts, and generated thumbnails with correct references → GREEN: implement lifecycle binding and complete package assembly
- Commit: `feat(formats): bind ograf lifecycle with packaged assets and fonts`

### T3 — Validator and independent renderer/controller evidence

- Files: `packages/formats/src/ograf/validate.ts` (new), `packages/formats/src/ograf/validate.test.ts` (new), `project/implementation/evidence/ograf-conformance.md` (new)
- Interfaces: `validateOgrafPackage`
- RED: validator tests fail on malformed packages; conformance evidence for two independent external renderer/controller validations is absent → GREEN: implement the package validator and record the two independent validation runs in the evidence index (QG-BCAST-01)
- Commit: `test(formats): add ograf validator with independent conformance evidence`

| Slice          | Scope                                               | Proof                               | Rollback / evidence          | Merge prerequisite |
| -------------- | --------------------------------------------------- | ----------------------------------- | ---------------------------- | ------------------ |
| W3-OGRAF-01.S1 | Manifest export/import + official schema validation | schema tests green (QG-BCAST-01)    | revert slice; schema report  | none               |
| W3-OGRAF-01.S2 | GDD mapping for data schemas                        | GDD round-trip tests                | revert slice; round-trip log | W3-OGRAF-01.S1     |
| W3-OGRAF-01.S3 | Lifecycle command binding                           | lifecycle tests over player runtime | revert slice; unit-test log  | W3-OGRAF-01.S2     |
| W3-OGRAF-01.S4 | Steps + update semantics                            | step sequence tests                 | revert slice; unit-test log  | W3-OGRAF-01.S3     |
| W3-OGRAF-01.S5 | Asset/font packaging + thumbnails                   | packaging tests                     | revert slice; unit-test log  | W3-OGRAF-01.S4     |
| W3-OGRAF-01.S6 | Package validator                                   | validator tests on hostile packages | revert slice; unit-test log  | W3-OGRAF-01.S5     |
| W3-OGRAF-01.S7 | Two independent renderer/controller validations     | recorded evidence index             | revert slice; evidence doc   | W3-OGRAF-01.S6     |

## W3-PLAYER-01 tasks

### T1 — Versioned player API with lazy feature modules and size tiers

- Files: `packages/player/src/api.ts` (new), `packages/player/src/modules/registry.ts` (new), `packages/player/src/bundle-size.test.ts` (new), `packages/player/src/index.ts` (new)
- Interfaces: `PlayerApiVersion`, `loadFeatureModule`, `PlayerSizeTier`
- RED: bundle tests fail — the optional player core must stay within its gzip budget (QG-PERF-04) with feature modules (video, audio, expressions, OGraf) loading lazily only when a document requires them; API-version negotiation tests fail for mismatched hosts → GREEN: implement the versioned API surface and lazy module registry with enforced size tiers
- Commit: `feat(player): add versioned api with lazy modules and size tiers`

### T2 — Exact seek, state, and data lifecycle with conformance suite

- Files: `packages/player/src/seek.ts` (new), `packages/player/src/data-lifecycle.ts` (new), `packages/player/src/conformance.test.ts` (new)
- Interfaces: `seekExact`, `PlayerState`, `DataLifecycle` (bind/update/stale/clear)
- RED: deterministic conformance suite fails — exact seek to any timestamp must produce the identical frame as continuous playback (QG-REL-01), and state/data lifecycle transitions must match the documented machine on randomized schedules → GREEN: implement exact seek on the shared clock and the data lifecycle until the conformance suite passes deterministically
- Commit: `feat(player): add exact seek and data lifecycle with conformance suite`

### T3 — Sandbox and CSP hardening, diagnostics, and showcase embed

- Files: `packages/player/src/diagnostics.ts` (new), `packages/player/src/csp.test.ts` (new), `packages/demo/src/showcase-embed/` (new), `packages/player/examples/csp-embed` (new)
- Interfaces: `PlayerDiagnostics`, `getDiagnosticsSnapshot`
- RED: CSP tests fail under a strict no-unsafe-inline/eval policy; hostile-document tests escape resource caps (QG-SEC-01); the showcase embed does not run the shipped player build → GREEN: harden the sandbox, expose structured diagnostics, and wire the showcase embed to the published player bundle
- Commit: `feat(player): harden csp sandbox with diagnostics and showcase embed`

| Slice           | Scope                                | Proof                           | Rollback / evidence             | Merge prerequisite |
| --------------- | ------------------------------------ | ------------------------------- | ------------------------------- | ------------------ |
| W3-PLAYER-01.S1 | Versioned API surface + negotiation  | API version tests               | revert slice; unit-test log     | none               |
| W3-PLAYER-01.S2 | Lazy feature-module registry         | module loading tests            | revert slice; unit-test log     | W3-PLAYER-01.S1    |
| W3-PLAYER-01.S3 | Size tiers enforced (QG-PERF-04)     | bundle-size gate in CI          | revert slice; size report       | W3-PLAYER-01.S2    |
| W3-PLAYER-01.S4 | Exact seek on the shared clock       | seek-identity tests (QG-REL-01) | revert slice; frame-hash report | W3-PLAYER-01.S3    |
| W3-PLAYER-01.S5 | State + data lifecycle machine       | lifecycle conformance tests     | revert slice; unit-test log     | W3-PLAYER-01.S4    |
| W3-PLAYER-01.S6 | Sandbox/CSP hardening (QG-SEC-01)    | strict-CSP + hostile-doc tests  | revert slice; security report   | W3-PLAYER-01.S5    |
| W3-PLAYER-01.S7 | Diagnostics surface                  | diagnostics snapshot tests      | revert slice; unit-test log     | W3-PLAYER-01.S6    |
| W3-PLAYER-01.S8 | Showcase embed on the shipped player | embed smoke test + CT           | revert slice; CT trace          | W3-PLAYER-01.S7    |

## W3-QE-01 tasks

### T1 — Tier-1 renderer raster CI with per-fixture reviewed baselines

- Files: `scripts/visual-ci/render-tier1.mjs` (new), `scripts/visual-ci/compare.mjs` (new), `scripts/visual-ci/compare.test.mjs` (new), `.github/workflows/ci.yml`
- Interfaces: `VisualBaseline`, `PerceptualDiffResult`
- RED: tier-1 tests fail — renderer rasters over the corpus must compare against per-fixture baselines with p95 and worst-case perceptual gates enforced in CI, and any attempt to update more than one baseline without explicit per-fixture review markers must fail the check → GREEN: implement the tier-1 raster lane, the diff gates, and the per-fixture baseline review policy
- Commit: `feat(scripts): add tier-1 renderer raster ci with reviewed baselines`

### T2 — Tier-2 canonical-tool export raster lane

- Files: `scripts/visual-ci/render-tier2.mjs` (new), `scripts/visual-ci/tools/libreoffice.mjs` (new), `scripts/visual-ci/tools/pdf-viewer.mjs` (new), `scripts/visual-ci/tools/lottie-player.mjs` (new)
- Interfaces: `CanonicalToolRunner`
- RED: tier-2 tests fail — exports rendered by scriptable canonical tools (LibreOffice for PPTX, a pinned PDF rasterizer, reference lottie-player, browser engines for SVG) must match per-fixture baselines within the same gates; rows requiring licensed tools (Photoshop, PowerPoint) must map to documented manual protocols instead of silently passing → GREEN: implement the tier-2 lane with containerized tool runners and manual-protocol placeholders
- Commit: `feat(scripts): add tier-2 canonical-tool export raster lane`

### T3 — Producer matrix aggregation and manual-protocol index

- Files: `scripts/visual-ci/producer-matrix.mjs` (new), `project/implementation/evidence/producer-matrix.md` (new), `project/implementation/evidence/manual-protocols.md` (new)
- Interfaces: `ProducerMatrixRow`
- RED: matrix aggregation fails — 100% of advertised producer/tool rows must pass or be explicitly waived with a documented manual protocol (QG-INT-01), and the generated matrix must reconcile against the corpus manifest feature assertions → GREEN: generate the producer matrix from tier-1/tier-2 results plus manual-protocol evidence and gate CI on full coverage
- Commit: `feat(scripts): aggregate producer matrix with manual protocol index`

| Slice        | Scope                                                        | Proof                           | Rollback / evidence           | Merge prerequisite |
| ------------ | ------------------------------------------------------------ | ------------------------------- | ----------------------------- | ------------------ |
| W3-QE-01.S1  | Perceptual diff engine + gate math                           | diff unit tests                 | revert slice; unit-test log   | none               |
| W3-QE-01.S2  | Tier-1 renderer raster harness                               | tier-1 run over seed corpus     | revert slice; run log         | W3-QE-01.S1        |
| W3-QE-01.S3  | Per-fixture baseline storage + review policy                 | wholesale-update rejection test | revert slice; policy test log | W3-QE-01.S2        |
| W3-QE-01.S4  | p95 + worst-case gates in CI                                 | gate assertions in CI run       | revert slice; CI evidence     | W3-QE-01.S3        |
| W3-QE-01.S5  | Tier-1 corpus expansion (PSD/PDF/SVG/PPTX imports)           | tier-1 green on format corpus   | revert slice; run log         | W3-QE-01.S4        |
| W3-QE-01.S6  | Tier-1 motion/player frames (deterministic renders)          | frame-hash tier-1 green         | revert slice; hash report     | W3-QE-01.S5        |
| W3-QE-01.S7  | Tier-2 runner contract + containerized tooling               | runner contract tests           | revert slice; unit-test log   | W3-QE-01.S4        |
| W3-QE-01.S8  | Tier-2 LibreOffice lane (PPTX exports)                       | tier-2 PPTX rows green          | revert slice; run log         | W3-QE-01.S7        |
| W3-QE-01.S9  | Tier-2 PDF rasterizer lane (+ veraPDF linkage)               | tier-2 PDF rows green           | revert slice; run log         | W3-QE-01.S8        |
| W3-QE-01.S10 | Tier-2 SVG browser-engine lane                               | tier-2 SVG rows green           | revert slice; run log         | W3-QE-01.S9        |
| W3-QE-01.S11 | Tier-2 lottie-player lane                                    | tier-2 Lottie rows green        | revert slice; run log         | W3-QE-01.S10       |
| W3-QE-01.S12 | Manual-protocol index (Photoshop, PowerPoint, viewers)       | protocol docs + waiver wiring   | revert slice; protocol docs   | W3-QE-01.S11       |
| W3-QE-01.S13 | Producer matrix aggregation + 100% coverage gate (QG-INT-01) | matrix generation green in CI   | revert slice; matrix report   | W3-QE-01.S12       |
