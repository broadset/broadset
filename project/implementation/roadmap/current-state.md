# Current state and complete repair floor

(moved from plan.md §3 on 2026-07-10 — behavior-neutral relocation)

## Evidence-qualified current verdict

Broadset has strong package discipline, strict typing, extensive specs, substantial export capability, and a serious test culture. It does **not** yet have evidence for an A-grade accessibility, import-fidelity, persistence, collaboration, timing, or performance claim. Letter grades live in dated review artifacts, not in this roadmap.

The current systemic risks are:

- self-round-trip bias versus arbitrary third-party producers;
- incomplete trust-boundary validation and sanitizer asymmetry;
- parent-relative versus canvas-space ambiguity;
- project/page changes missing from collaboration;
- UI features implemented but not mounted;
- no exact broadcast timebase;
- no durable project persistence;
- no measured performance baseline;
- component and migration spec/implementation contradictions;
- rich-text shaping and wide-gamut color below the intended product claim.

## Confirmed findings ledger

W0 cannot close while a W0 row is open. W1/W2 findings remain release blockers for the feature path they affect.

| ID   | Sev  | Defect                                                         | Primary location                             | Destination  | Required evidence                                                                                          |
| ---- | ---- | -------------------------------------------------------------- | -------------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------- |
| F-01 | CRIT | Grouped documents can export blank PPTX slides                 | `formats/pptx/export/shape-tree.ts`          | W0-IO-01     | Parent/group structure, interleaved z-order, child transforms, python-pptx oracle, LibreOffice visual gate |
| F-02 | CRIT | Percentage radial-gradient centers can crash SVG import        | `formats/svg/import-defs.ts`                 | W0-IO-02     | Property tests for percentage/fraction/default forms and bounds                                            |
| F-03 | HIGH | PDF import Y-flip ignores MediaBox height                      | `formats/pdf/import/third-party.ts`          | W0-IO-03     | Page-box fixtures within 0.5 pt                                                                            |
| F-04 | HIGH | PPTX child-space `chOff/chExt` ignored                         | `formats/pptx/import/shape.ts`               | W0-IO-01     | Nested/rotated group geometry oracle                                                                       |
| F-05 | HIGH | Placeholder geometry inheritance missing                       | `formats/pptx/import/shape.ts`               | W0-IO-04     | Layout/master fixtures within 0.5 px                                                                       |
| F-06 | HIGH | Inline SVG style can be silently dropped                       | `formats/svg/import-css.ts`                  | W0-IO-05     | Inline/presentation/CSS cascade fixtures                                                                   |
| F-07 | HIGH | Valid compact SVG paths rejected                               | `model/element/content-types.ts`             | W0-MODEL-01  | Linear tokenizer plus SVGO/Figma fuzz corpus                                                               |
| F-08 | HIGH | Clean SVG export can re-emit hostile preserved bytes           | `formats/svg/export.ts`                      | W0-SEC-01    | Hostile BSP/SVG corpus emits no active content                                                             |
| F-09 | MED  | Nested paste misinterprets parent-relative coordinates and IDs | `editor/element-operations.ts`               | W1-SCENE-01  | Nested/rotated property-based round trips                                                                  |
| F-10 | MED  | PDF CID/Identity-H text can decode as Latin-1                  | `formats/pdf/import/operators.ts`            | W0-IO-06     | ToUnicode/CMap multilingual fixtures                                                                       |
| F-11 | MED  | Multi-page PDF text can flatten onto page 1                    | `formats/pdf/import/operators.ts`            | W0-IO-07     | Three-page structural and visual fixture                                                                   |
| F-12 | MED  | PPTX gradient angle convention is wrong                        | `formats/pptx/import/style.ts`               | W0-IO-08     | Canonical-tool angle matrix                                                                                |
| F-13 | MED  | PPTX theme style-matrix references unresolved                  | `formats/pptx/import/style.ts`               | W0-IO-09     | Office default-theme gallery fixture                                                                       |
| F-14 | MED  | PSD reader ignores Uint8Array byteOffset                       | `formats/psd/import.ts`                      | W0-IO-10     | View-backed and copied-byte equivalence                                                                    |
| F-15 | MED  | SVG stop-opacity ignored                                       | `formats/svg/import-defs.ts`                 | W0-IO-11     | Transparent gradient fixtures                                                                              |
| F-16 | MED  | Model safeParse may throw on legacy gradient input             | `model/element.ts`                           | W0-MODEL-02  | Typed failure result, never throw                                                                          |
| F-17 | MED  | Remote element-add payload bypasses Zod                        | `editor/collaboration/apply.ts`              | W0-SEC-02    | Malformed remote payload rejected atomically                                                               |
| F-18 | LOW  | Tuple path morph ignores easing                                | `playback/interpolation.ts`                  | W1-TIME-02   | Eased midpoint differs from linear                                                                         |
| F-19 | LOW  | Architecture dependency/version table drift                    | `implementation/architecture.md`             | W0-GOV-02    | Generated manifest comparison                                                                              |
| F-20 | LOW  | Cross-region CT derivation incomplete                          | `cross-region-ct-inventory.md`               | W2-QE-01     | Generated inventory has zero missing shipped scenarios                                                     |
| F-21 | LOW  | Prettier gate incomplete across workspaces                     | workspace package scripts                    | W0-QE-01     | Formatting drift fails every package gate                                                                  |
| B-20 | HIGH | Collaboration diff omits page override changes                 | `editor/collaboration/diff.ts`               | W0-COLLAB-01 | Page override convergence and undo-isolation tests                                                         |
| B-22 | HIGH | Project asset/settings changes lack project-level diff/apply   | `model/changes.ts`, `editor/collaboration/*` | W0-COLLAB-02 | Project-level round-trip/convergence tests                                                                 |
| B-23 | MED  | Video exporters disagree on frame-count rounding               | raster/interchange exporters                 | W0-TIME-01   | One ratified duration/frame-count contract                                                                 |
| B-37 | HIGH | Export endpoint sampling semantics are undefined               | raster/interchange exporters                 | W0-TIME-01   | Inclusive/exclusive RFC tests across every timed exporter                                                  |

## W0 verification queue

The following remain hypotheses until reproduced against the current worktree:

- U-01 sanitizer recursion/depth exhaustion;
- U-02 fetch redirect/private-network/decompression protections;
- U-03 zero-duration completion callback;
- U-04 parser regex worst-case behavior while `sonarjs/slow-regex` is disabled;
- U-05 formats CI test discovery depends on a maintained list;
- U-06 instruction documents refer to nonexistent files;
- U-07 oversized source files and mixed responsibilities;
- U-08 unused UI peer dependencies;
- U-09 preserved snapshot JSON lacks schema-owned validation;
- U-10 CI/install contract differs from documented `npm ci`;
- X-01 CT inventory counts or classifications are stale.

Each item receives a W0 tracker row with one of: reproduced/fix, disproved/test, accepted/waiver, or superseded/evidence.

## Legacy open-gap routing

| Legacy IDs                                                                                                                                | Destination                                      | Release treatment                                                                                                                                       |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P2.1, CFIO.4.1                                                                                                                            | W1-COLOR-01 and W3-PSD-01                        | Typed color pipeline and PSD profile conversion                                                                                                         |
| P2.2                                                                                                                                      | W1-ASSET-01 and W2-ASSET-01                      | Font resolution, licensing metadata, proxies, dedup                                                                                                     |
| P2.3                                                                                                                                      | W1-TEXT-01                                       | HarfBuzz/Unicode shaping is no longer deferred                                                                                                          |
| P3.G1                                                                                                                                     | W1-RENDER-02                                     | Pattern/picture fill parity                                                                                                                             |
| UI.1–UI.15 (`UI.1`, `UI.2`, `UI.3`, `UI.4`, `UI.5`, `UI.6`, `UI.7`, `UI.8`, `UI.9`, `UI.10`, `UI.11`, `UI.12`, `UI.13`, `UI.14`, `UI.15`) | W2-STYLE-01, W2-TEXT-01, W2-CANVAS-01, W2-DOC-01 | Every item ships mounted with CT; no “implemented but hidden” closure                                                                                   |
| P5.4b, P5.G1, P5.G2, P5.G3, P5.G4, P5.G5, CFIO.4.3, CFIO.4.6                                                                              | W3-PSD-01                                        | Third-party PSD, color/bit depth, effects, clipping/adjustment, BsPs                                                                                    |
| P6.4b, P6.G1–G3                                                                                                                           | W3-PDF-01                                        | Rich PDF import, profile/spot output, pre-parse budgets                                                                                                 |
| P7.G1, P7.G2, P7.G3                                                                                                                       | W3-SVG-01 and W1-WORKER-01                       | Structural reuse, animated SVG strategy, module/worker split                                                                                            |
| P8.G2, P8.G3, CFIO.5.1, CFIO.5.3, CFIO.5.7 (`CFIO.5.1, 5.3, 5.7`); CFIO.5.2                                                               | W3-PPTX-01 and W3-QE-01                          | Tables/charts policy, visual CI, licensed fixtures, large decks, PowerPoint protocol                                                                    |
| P9.G1, P9.G2, P9.G3                                                                                                                       | W3-PDF-02                                        | Real profiles and explicit PDF/A support matrix; veraPDF remains the canonical validator                                                                |
| B.5–B.6, D.3, CFIO.5.5                                                                                                                    | W2-QE-01 and W2-A11Y-01                          | Zero missing shipped CT scenarios and complete modal audit                                                                                              |
| D.5–D.9                                                                                                                                   | W3-QE-01 and W6-REL-01                           | Producer evidence and fresh-clone release verification                                                                                                  |
| C.1–C.5, P7.G3, U-07                                                                                                                      | W0-PLAT-01, W1-WORKER-01, W6-ARCH-01             | Only boundary-enabling splits occur early; cleanup split follows stable contracts                                                                       |
| CFIO.4.10                                                                                                                                 | Deferred with review at W3-SVG-01                | Extract shared CSS only if the second consumer and measurable duplication exist                                                                         |
| io-prereqs audit A1–A2                                                                                                                    | W1-SCENE-01, W3-CORPUS-01, and W3-QE-01          | Nested-group transform composition audit ships with CT; 200 KB preserved-blob (`extensions.<format>.raw`) round-trip stress fixtures land in the corpus |
| io-prereqs Phase-6 carry-overs (`assertReImportableBy` helper, CT chain round-trip harness)                                               | W3-QE-01 and W3-CORPUS-01                        | Cross-format chain re-import assertions become corpus-backed CI checks                                                                                  |
| DOC.1                                                                                                                                     | W0-DEF-01 and W6-REL-01                          | Reconcile stale specs/trackers in W0 and prove freshness again at release                                                                               |
