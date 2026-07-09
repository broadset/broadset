# Master Roadmap Task Board

Status: active per-task tracker for [plan.md](./plan.md).

**Reconciled 2026-07-09** against actual code in `packages/*`, tests, CI workflows, and CT files on PR #2 (`initial-dev-phase` → `main`). Status here reflects **code reality**, not prior checkbox history. When code and this board disagree, fix the code or update this board in the same change.

## How to read this board

[plan.md](./plan.md) owns strategy, initiative scope, dependencies, and W0–W6 sequencing. `project/spec/**` owns behavioral acceptance criteria. This file owns **execution status and evidence**. [io-prereqs-ui-features-plan.md](./io-prereqs-ui-features-plan.md) is mapped historical UX evidence, while the legacy phase sections below preserve the completed 2026 program and current gap tiers.

### Stable initiative lifecycle

New roadmap initiatives use `proposed`, `ready`, `active`, `functional`, `release`, `deferred`, and `blocked` exactly as defined in plan.md §2.2. A `ready` or `active` row requires a named human DRI and an approved child plan. The separate legacy register retains its historical tiers below.

### Legacy evidence tiers

| Tier           | Meaning                                                                                |
| -------------- | -------------------------------------------------------------------------------------- |
| **release**    | Spec acceptance criteria met; suitable for release signoff evidence.                   |
| **functional** | Primary path works (especially Broadset round-trip); known spec gaps remain.           |
| **scaffold**   | Types, wiring, or partial implementation landed; core behavior incomplete or shallow.  |
| **open**       | Not implemented.                                                                       |
| **deferred**   | Intentionally postponed (YAGNI, external tool/host, or dependency not yet integrated). |

Legacy `[x]` / `[ ]` checkboxes are retired. Use the tier column instead.

### Where detail lives

| Concern                               | Owner file                                                         |
| ------------------------------------- | ------------------------------------------------------------------ |
| Release blockers and command evidence | [production-readiness-status.md](./production-readiness-status.md) |
| Cross-region CT row accounting        | [cross-region-ct-inventory.md](./cross-region-ct-inventory.md)     |
| Producer pass/fail/waived rows        | [real-producer-compatibility.md](./real-producer-compatibility.md) |
| Per-format spec gaps                  | `project/spec/formats/{psd,pdf,svg,pptx}.md` §Spec Gaps            |

### Stable initiative register

Every roadmap initiative is registered before execution. `Unassigned` is valid only while `proposed`; promotion requires the named human DRI and evidence contract from plan.md §2.3.

<!-- BEGIN MANAGED: INITIATIVE REGISTER -->

| Initiative     | Status   | DRI        | Dependencies                                                                             | Child plan                         | Evidence |
| -------------- | -------- | ---------- | ---------------------------------------------------------------------------------------- | ---------------------------------- | -------- |
| W0-GOV-01      | proposed | unassigned | none                                                                                     | —                                  | —        |
| W0-GOV-02      | proposed | unassigned | none                                                                                     | [child plan](./plans/W0-GOV-02.md) | —        |
| W0-DEF-01      | proposed | unassigned | W0-GOV-01                                                                                | [child plan](./plans/W0-DEF-01.md) | —        |
| W0-RFC-01      | proposed | unassigned | W0-DEF-01                                                                                | [child plan](./plans/W0-RFC-01.md) | —        |
| W0-UX-01       | proposed | unassigned | none                                                                                     | —                                  | —        |
| W0-PLAT-01     | proposed | unassigned | W0-RFC-01                                                                                | —                                  | —        |
| W0-PERF-01     | proposed | unassigned | W0-PLAT-01                                                                               | —                                  | —        |
| W0-QE-01       | proposed | unassigned | W0-GOV-01                                                                                | —                                  | —        |
| W0-SEC-01      | proposed | unassigned | RFC-10                                                                                   | —                                  | —        |
| W0-SEC-02      | proposed | unassigned | W0-SEC-01                                                                                | —                                  | —        |
| W0-COLLAB-01   | proposed | unassigned | RFC-11                                                                                   | —                                  | —        |
| W0-COLLAB-02   | proposed | unassigned | W0-COLLAB-01                                                                             | —                                  | —        |
| W0-TIME-01     | proposed | unassigned | RFC-06                                                                                   | —                                  | —        |
| W0-IO-01       | proposed | unassigned | W0-RFC-01                                                                                | —                                  | —        |
| W0-IO-02       | proposed | unassigned | W0-SEC-01                                                                                | —                                  | —        |
| W0-IO-03       | proposed | unassigned | W0-SEC-01                                                                                | —                                  | —        |
| W0-IO-04       | proposed | unassigned | W0-IO-01                                                                                 | —                                  | —        |
| W0-IO-05       | proposed | unassigned | W0-SEC-01                                                                                | —                                  | —        |
| W0-IO-06       | proposed | unassigned | W0-SEC-01                                                                                | —                                  | —        |
| W0-IO-07       | proposed | unassigned | W0-IO-03                                                                                 | —                                  | —        |
| W0-IO-08       | proposed | unassigned | W0-IO-01                                                                                 | —                                  | —        |
| W0-IO-09       | proposed | unassigned | W0-IO-04                                                                                 | —                                  | —        |
| W0-IO-10       | proposed | unassigned | W0-SEC-01                                                                                | —                                  | —        |
| W0-IO-11       | proposed | unassigned | W0-IO-02                                                                                 | —                                  | —        |
| W0-MODEL-01    | proposed | unassigned | W0-SEC-01                                                                                | —                                  | —        |
| W0-MODEL-02    | proposed | unassigned | W0-SEC-01                                                                                | —                                  | —        |
| W0-RECOVER-01  | proposed | unassigned | W0-SEC-01                                                                                | —                                  | —        |
| W1-TIME-01     | proposed | unassigned | W0-TIME-01                                                                               | —                                  | —        |
| W1-TIME-02     | proposed | unassigned | RFC-02/RFC-03                                                                            | —                                  | —        |
| W1-SCENE-01    | proposed | unassigned | RFC-01/RFC-07/RFC-10                                                                     | —                                  | —        |
| W1-TEXT-01     | proposed | unassigned | W0-PLAT-01/RFC-10                                                                        | —                                  | —        |
| W1-COLOR-01    | proposed | unassigned | RFC-09/RFC-10                                                                            | —                                  | —        |
| W1-SEC-01      | proposed | unassigned | RFC-10/W0-SEC-01                                                                         | —                                  | —        |
| W1-ASSET-01    | proposed | unassigned | RFC-08/W0-PLAT-01                                                                        | —                                  | —        |
| W1-PERSIST-01  | proposed | unassigned | RFC-08/W1-ASSET-01                                                                       | —                                  | —        |
| W1-WORKER-01   | proposed | unassigned | W0-PLAT-01/W1-SEC-01                                                                     | —                                  | —        |
| W1-PLAYBACK-01 | proposed | unassigned | W1-TIME-01/W1-SCENE-01                                                                   | —                                  | —        |
| W1-RENDER-01   | proposed | unassigned | W1-SCENE-01/W1-PLAYBACK-01                                                               | —                                  | —        |
| W1-RENDER-02   | proposed | unassigned | W1-COLOR-01/W1-ASSET-01                                                                  | —                                  | —        |
| W1-PLAYER-01   | proposed | unassigned | W1-PLAYBACK-01/W1-RENDER-01/RFC-12                                                       | —                                  | —        |
| W1-HISTORY-01  | proposed | unassigned | W1-PERSIST-01                                                                            | —                                  | —        |
| W2-CMD-01      | proposed | unassigned | W1-HISTORY-01                                                                            | —                                  | —        |
| W2-CANVAS-01   | proposed | unassigned | W1-SCENE-01/W2-CMD-01                                                                    | —                                  | —        |
| W2-PATH-01     | proposed | unassigned | W2-CANVAS-01/W1-RENDER-02                                                                | —                                  | —        |
| W2-TIMELINE-01 | proposed | unassigned | W1-TIME-02/W2-CMD-01                                                                     | —                                  | —        |
| W2-GRAPH-01    | proposed | unassigned | W2-TIMELINE-01                                                                           | —                                  | —        |
| W2-COMP-01     | proposed | unassigned | W1-SCENE-01/W2-CMD-01                                                                    | —                                  | —        |
| W2-VAR-01      | proposed | unassigned | W1-COLOR-01/W2-COMP-01                                                                   | —                                  | —        |
| W2-DATA-01     | proposed | unassigned | W2-VAR-01/RFC-05                                                                         | —                                  | —        |
| W2-TEXT-01     | proposed | unassigned | W1-TEXT-01/W2-CANVAS-01                                                                  | —                                  | —        |
| W2-AUDIO-01    | proposed | unassigned | RFC-14/W1-TIME-01/W1-ASSET-01                                                            | —                                  | —        |
| W2-STYLE-01    | proposed | unassigned | W1-COLOR-01/W1-RENDER-02                                                                 | —                                  | —        |
| W2-DOC-01      | proposed | unassigned | W2-STYLE-01/W1-ASSET-01                                                                  | —                                  | —        |
| W2-ASSET-01    | proposed | unassigned | W1-ASSET-01/W1-PERSIST-01                                                                | —                                  | —        |
| W2-A11Y-01     | proposed | unassigned | W2-PATH-01/W2-GRAPH-01/W2-DATA-01/W2-TEXT-01/W2-AUDIO-01/W2-DOC-01/W2-ASSET-01/W2-UX-01  | —                                  | —        |
| W2-UX-01       | proposed | unassigned | W0-UX-01/W2-CMD-01                                                                       | —                                  | —        |
| W2-QE-01       | proposed | unassigned | W2-A11Y-01                                                                               | —                                  | —        |
| W3-CORPUS-01   | proposed | unassigned | W0-GOV-01                                                                                | —                                  | —        |
| W3-RECON-01    | proposed | unassigned | W2-CANVAS-01/W3-CORPUS-01                                                                | —                                  | —        |
| W3-PSD-01      | proposed | unassigned | W1-COLOR-01/W3-CORPUS-01                                                                 | —                                  | —        |
| W3-PDF-01      | proposed | unassigned | W1-TEXT-01/W1-WORKER-01/W3-CORPUS-01                                                     | —                                  | —        |
| W3-PDF-02      | proposed | unassigned | W1-COLOR-01/W3-CORPUS-01                                                                 | —                                  | —        |
| W3-SVG-01      | proposed | unassigned | W1-SEC-01/W1-WORKER-01/W3-CORPUS-01                                                      | —                                  | —        |
| W3-PPTX-01     | proposed | unassigned | W1-TEXT-01/W3-CORPUS-01                                                                  | —                                  | —        |
| W3-MOTION-01   | proposed | unassigned | W2-TIMELINE-01/W2-AUDIO-01/RFC-04                                                        | —                                  | —        |
| W3-MOTION-02   | proposed | unassigned | RFC-05/W2-DATA-01/W3-MOTION-01                                                           | —                                  | —        |
| W3-VIDEO-01    | proposed | unassigned | W1-TIME-01/W1-PLAYER-01/W2-AUDIO-01                                                      | —                                  | —        |
| W3-LOTTIE-01   | proposed | unassigned | W1-SCENE-01/W3-CORPUS-01                                                                 | —                                  | —        |
| W3-FIGMA-01    | proposed | unassigned | W2-COMP-01/W2-VAR-01/W3-RECON-01                                                         | —                                  | —        |
| W3-OGRAF-01    | proposed | unassigned | W1-PLAYER-01/W2-DATA-01/RFC-12                                                           | —                                  | —        |
| W3-PLAYER-01   | proposed | unassigned | W3-OGRAF-01/W3-VIDEO-01                                                                  | —                                  | —        |
| W3-QE-01       | proposed | unassigned | W3-PSD-01/W3-PDF-01/W3-PDF-02/W3-SVG-01/W3-PPTX-01/W3-LOTTIE-01/W3-FIGMA-01/W3-PLAYER-01 | —                                  | —        |
| W4-STATE-01    | proposed | unassigned | W2-TIMELINE-01/W2-DATA-01                                                                | —                                  | —        |
| W4-RUNDOWN-01  | proposed | unassigned | W4-STATE-01                                                                              | —                                  | —        |
| W4-OP-01       | proposed | unassigned | W4-RUNDOWN-01/W2-A11Y-01                                                                 | —                                  | —        |
| W4-CONTROL-01  | proposed | unassigned | W2-COMP-01/W3-OGRAF-01                                                                   | —                                  | —        |
| W4-DATA-01     | proposed | unassigned | W2-DATA-01/W4-CONTROL-01                                                                 | —                                  | —        |
| W4-VARIANT-01  | proposed | unassigned | W2-VAR-01/W2-CANVAS-01                                                                   | —                                  | —        |
| W4-PLAYOUT-01  | proposed | unassigned | W3-PLAYER-01/W4-OP-01                                                                    | —                                  | —        |
| W4-CLOCK-01    | proposed | unassigned | W1-TIME-01/W4-PLAYOUT-01                                                                 | —                                  | —        |
| W4-SOAK-01     | proposed | unassigned | W4-CLOCK-01/W4-DATA-01/W4-VARIANT-01                                                     | —                                  | —        |
| W5-SVC-01      | proposed | unassigned | W0-PLAT-01/RFC-11                                                                        | —                                  | —        |
| W5-STORE-01    | proposed | unassigned | W1-PERSIST-01/W5-SVC-01                                                                  | —                                  | —        |
| W5-COLLAB-01   | proposed | unassigned | W0-COLLAB-01/W5-STORE-01                                                                 | —                                  | —        |
| W5-REVIEW-01   | proposed | unassigned | W5-COLLAB-01                                                                             | —                                  | —        |
| W5-JOBS-01     | proposed | unassigned | W3-PLAYER-01/W5-SVC-01                                                                   | —                                  | —        |
| W5-LIB-01      | proposed | unassigned | W2-COMP-01/W5-REVIEW-01                                                                  | —                                  | —        |
| W5-PLUGIN-01   | proposed | unassigned | W2-CMD-01/W5-SVC-01                                                                      | —                                  | —        |
| W5-MCP-01      | proposed | unassigned | W5-PLUGIN-01/W5-SVC-01                                                                   | —                                  | —        |
| W5-BCAST-01    | proposed | unassigned | W4-PLAYOUT-01/W5-SVC-01                                                                  | —                                  | —        |
| W5-OBS-01      | proposed | unassigned | W5-SVC-01                                                                                | —                                  | —        |
| W6-CRAFT-01    | proposed | unassigned | W0-UX-01/W4-SOAK-01/W5-JOBS-01/W5-LIB-01/W5-MCP-01/W5-BCAST-01/W5-OBS-01                 | —                                  | —        |
| W6-UX-01       | proposed | unassigned | W2-CMD-01                                                                                | —                                  | —        |
| W6-ONBOARD-01  | proposed | unassigned | W2-QE-01/W3-RECON-01/W3-MOTION-02/W3-PLAYER-01/W3-QE-01                                  | —                                  | —        |
| W6-I18N-01     | proposed | unassigned | W2-TEXT-01                                                                               | —                                  | —        |
| W6-QE-01       | proposed | unassigned | W3-MOTION-02/W3-QE-01/W4-SOAK-01/W5-JOBS-01/W5-LIB-01/W5-MCP-01/W5-BCAST-01/W5-OBS-01    | —                                  | —        |
| W6-ARCH-01     | proposed | unassigned | W0-PLAT-01/W5-JOBS-01/W5-LIB-01/W5-MCP-01/W5-BCAST-01/W5-OBS-01                          | —                                  | —        |
| W6-GPU-01      | proposed | unassigned | W1-RENDER-01                                                                             | —                                  | —        |
| W6-REL-01      | proposed | unassigned | W6-RESEARCH-01/W6-QE-01/W6-ARCH-01/W6-GPU-01/W6-SHOW-01                                  | —                                  | —        |
| W6-SHOW-01     | proposed | unassigned | W3-PLAYER-01/W6-CRAFT-01/W6-ONBOARD-01                                                   | —                                  | —        |
| W6-RESEARCH-01 | proposed | unassigned | W6-CRAFT-01/W6-UX-01/W6-ONBOARD-01/W6-I18N-01                                            | —                                  | —        |

<!-- END MANAGED: INITIATIVE REGISTER -->

---

## Open work queue (status register)

Sequencing lives in [plan.md](./plan.md) §7 (waves W0–W6); this table registers legacy IDs and their current evidence tiers. Current destinations are mapped in plan.md §3.4.

| Priority | ID                     | Work item                                                                                                     | Tier today | Exit tier  |
| -------- | ---------------------- | ------------------------------------------------------------------------------------------------------------- | ---------- | ---------- |
| P0       | **UI.1–UI.15**         | io-prereqs editor features (theme, run-edit, FilterStack, picture/pattern fill, prepress, …)                  | open       | functional |
| P0       | **B.5–B.6**            | Cross-region CT gap closure (31 missing + 12 partial bullets; 63 gap-list rows)                               | open       | release    |
| P0       | **D.5–D.8**            | Real producer compatibility triage (16 generated/public matrix rows passed; licensed/manual rows remain open) | functional | release    |
| P1       | **CFIO.4.1**           | CMYK / Lab / Grayscale + ICC round-trip (`lcms-wasm`)                                                         | open       | functional |
| P1       | **P5.G1**              | PSD per-layer `BsPs` export + id-based reconcile                                                              | open       | functional |
| P1       | **P6.G1**              | PDF third-party import beyond text extraction                                                                 | scaffold   | functional |
| P1       | **CFIO.4.3**           | PSD effects parity (bevel, satin, pattern overlay, native inner glow/overlays)                                | open       | functional |
| P1       | **P3.G1**              | Renderer pattern/picture fill consumption                                                                     | open       | functional |
| P2       | **P8.G1**              | PPTX unit `chain-round-trip.test.ts` (PDF/PSD/SVG parity)                                                     | functional | functional |
| P2       | **CFIO.5.1, 5.3, 5.7** | PPTX visual CI, licensed fixture mounts, large-deck load tests                                                | open       | release    |
| P2       | **CFIO.4.6**           | PSD 16/32-bpc preservation                                                                                    | open       | functional |
| P2       | **CFIO.5.5**           | Accessibility audit on format modals (screen reader + keyboard)                                               | scaffold   | release    |
| P2       | **D.9**                | Fresh-checkout release validation log                                                                         | functional | release    |
| P3       | **DOC.1**              | Stale spec/tracker debt (see §Documentation debt below)                                                       | open       | —          |
| —        | **C.1–C.5**            | Package split                                                                                                 | deferred   | —          |

---

## Shared foundation

### Legacy Phase 0 — Shared decisions and spec lock

Historical source: [decisions.md](./decisions.md) and git history; current routing: plan.md §3.4

| ID   | Task                                                     | Tier        | Code evidence                                      |
| ---- | -------------------------------------------------------- | ----------- | -------------------------------------------------- |
| P0.1 | Ratify IO-D-01…18                                        | **release** | [decisions.md](./decisions.md)                     |
| P0.2 | Pre-emptive model spec updates for legacy Phase 1 shapes | **release** | `project/spec/model/**`                            |
| P0.3 | Importer security contract baseline                      | **release** | [../spec/formats/spec.md](../spec/formats/spec.md) |
| P0.4 | Importer contract baseline                               | **release** | same                                               |
| P0.5 | No-sidecar + no-silent-drops requirements                | **release** | same                                               |

### Legacy Phase 1 — Shared model additions

Historical source: [decisions.md](./decisions.md) and git history; current routing: plan.md §3.4

| ID    | Task                                      | Tier        | Code evidence                                         |
| ----- | ----------------------------------------- | ----------- | ----------------------------------------------------- |
| P1.1  | Unit utilities + `parseLength`            | **release** | `packages/model/src/utilities.ts`                     |
| P1.2  | Importer security contract spec           | **release** | formats spec                                          |
| P1.3  | `BroadsetColor` union + migration         | **release** | `packages/model/src/broadset-color.ts`                |
| P1.4  | Content-hash identity                     | **release** | `packages/model/src/content-hash.ts`                  |
| P1.5  | Stroke enhancements                       | **release** | model + style spec                                    |
| P1.6  | `FilterStack`                             | **release** | `packages/model/src/filter-stack.ts`                  |
| P1.7  | Gradient enhancements                     | **release** | model types + renderer CSS                            |
| P1.8  | `BroadsetFill` union                      | **release** | `packages/model/src/broadset-fill.ts`                 |
| P1.9  | Text model (`string \| TextBody`)         | **release** | `packages/model/src/text-body.ts`, renderer text path |
| P1.10 | Text-on-path reference                    | **release** | model + SVG import/export                             |
| P1.11 | Text fidelity fields                      | **release** | model types                                           |
| P1.12 | Model-level script rejection              | **release** | validators                                            |
| P1.13 | Extensions typing registry                | **release** | `packages/model/src/extensions-types.ts`              |
| P1.14 | Per-format dirty flag + editor middleware | **release** | `packages/editor/src/extensions-dirty.test.ts`        |
| P1.15 | Page/canvas/document additions            | **release** | `packages/model/src/document.ts`                      |
| P1.16 | Importer contract spec closeout           | **release** | formats spec                                          |

### Legacy Phase 2 — Shared libraries and `_shared` modules

Historical source: [decisions.md](./decisions.md) and git history; current routing: plan.md §3.4

| ID   | Task                             | Tier           | Code evidence / gap                                                                     |
| ---- | -------------------------------- | -------------- | --------------------------------------------------------------------------------------- |
| P2.1 | `_shared/color/`                 | **functional** | `packages/formats/src/_shared/color/` — culori ops only; **`lcms-wasm` not integrated** |
| P2.2 | `_shared/fonts/`                 | **functional** | metrics, subset, embed-policy landed; no Google Fonts resolver                          |
| P2.3 | `_shared/text-layout/`           | **functional** | linebreak + bidi; **`harfbuzzjs` deferred**                                             |
| P2.4 | `_shared/xmp/`                   | **release**    | `packages/formats/src/_shared/xmp/`                                                     |
| P2.5 | `_shared/fingerprint/`           | **release**    | `packages/formats/src/_shared/fingerprint/`                                             |
| P2.6 | `_shared/reconcile/`             | **release**    | `packages/formats/src/_shared/reconcile/`                                               |
| P2.7 | `_shared/shape-classifier/`      | **release**    | `packages/formats/src/_shared/shape-classifier/`                                        |
| P2.8 | `_shared/sanitize/`              | **release**    | `packages/formats/src/_shared/sanitize/`                                                |
| P2.9 | Bundle-size guard for lazy paths | **release**    | `packages/formats/src/_shared/bundle-size-guard.test.ts`                                |

### Legacy Phase 3 — Renderer refactor

Historical source: retired renderer plan in git history; current routing: plan.md §3.4 and W1-RENDER-01/02

| ID    | Task                               | Tier           | Code evidence / gap                                             |
| ----- | ---------------------------------- | -------------- | --------------------------------------------------------------- |
| P3.0  | Contract cleanup                   | **release**    | generic `html-motion-renderer` entry                            |
| P3.1  | Internal layer split               | **release**    | `packages/renderer/src/elements/`, `dom/`                       |
| P3.2  | Keyed reconciliation               | **release**    | `packages/renderer/src/dom/controller.ts`                       |
| P3.3  | Semantic renderers + safe builders | **release**    | `elements/text-semantic.ts`, tests                              |
| P3.4  | Runtime services                   | **release**    | adapter + services split                                        |
| P3.5  | Broadset adapter migration         | **release**    | `packages/renderer/src/adapters/broadset/`                      |
| P3.6  | Spec closure and hardening         | **functional** | architecture complete; see **P3.G1**                            |
| P3.G1 | Pattern/picture fill rendering     | **open**       | `packages/renderer/src/background.ts` stubs `pattern`/`picture` |

### Legacy Phase 4 — Shared asset pipeline

Historical source: [decisions.md](./decisions.md) and git history; current routing: W1-ASSET-01/W2-ASSET-01

| ID   | Task                               | Tier        | Code evidence                                  |
| ---- | ---------------------------------- | ----------- | ---------------------------------------------- |
| P4.1 | Font asset type                    | **release** | `packages/model/src/asset.ts`                  |
| P4.2 | Image bytes + metadata             | **release** | same                                           |
| P4.3 | ICC on image assets                | **release** | `ImageAsset.iccProfileAssetId`                 |
| P4.4 | `icc-profile` asset type           | **release** | `IccProfileAsset` variant                      |
| P4.5 | Font subsetting pipeline           | **release** | `packages/formats/src/_shared/fonts/subset.ts` |
| P4.6 | Font embed-permission surface      | **release** | `embed-policy.ts`                              |
| P4.7 | Content-hash asset dedup on import | **release** | `packages/formats/src/_shared/asset-dedup/`    |

---

## Interleaved shared tasks

Source: [io-prereqs-ui-features-plan.md](./io-prereqs-ui-features-plan.md)

### Format I/O UI slice (done)

| ID   | Task                             | Tier        | Code evidence                                       |
| ---- | -------------------------------- | ----------- | --------------------------------------------------- |
| I5.1 | PSD-required format modals       | **release** | `packages/ui/src/modals/` + demo bridge             |
| I6.1 | PDF-required format modals       | **release** | same                                                |
| I7.1 | SVG-required format modals       | **release** | same                                                |
| I8.1 | PPTX-required format modals      | **release** | same                                                |
| I6.2 | Shared chain test infrastructure | **release** | `packages/formats/src/_shared/test-infrastructure/` |

### io-prereqs editor UI features (not started)

Scope: [io-prereqs-ui-features-plan.md](./io-prereqs-ui-features-plan.md). Model types exist; **editor UX for these fields is overwhelmingly open**.

| ID    | Feature                                                                  | Tier         | Evidence / open remainder                                |
| ----- | ------------------------------------------------------------------------ | ------------ | -------------------------------------------------------- |
| UI.1  | Design-token / theme system (swatches panel, theme tab in color pickers) | **open**     |
| UI.2  | Run styles + run-edit mode                                               | **open**     |
| UI.3  | Structured text editing (TextBody runs in properties)                    | **open**     |
| UI.4  | FilterStack editor                                                       | **open**     |
| UI.5  | Gradient editor (linear/radial/conic + mods)                             | **open**     |
| UI.6  | Stroke arrow ends + miterlimit                                           | **open**     |
| UI.7  | Picture fill picker + asset binding                                      | **open**     |
| UI.8  | Pattern fill picker                                                      | **open**     |
| UI.9  | Clip-path editor (beyond canvas overlay)                                 | **scaffold** | clip-path overlay CT exists; full properties parity open |
| UI.10 | 3D transform inputs (rotateX/Y/Z, perspective)                           | **scaffold** | partial via geometry panel CT                            |
| UI.11 | Prepress insets panel (bleed/trim/safe)                                  | **open**     |
| UI.12 | Document metadata + output intent panel                                  | **open**     |
| UI.13 | Page notes editor                                                        | **open**     |
| UI.14 | Unit-aware spatial inputs (px/mm/in + dpi)                               | **open**     |
| UI.15 | Text-on-path authoring UI                                                | **open**     |

Each UI feature requires a cross-region CT when landed ([testing.instructions.md](../../agents/instructions/testing.instructions.md)).

---

## Format tracks

Tier legend for format rows: **functional** = Broadset round-trip + demo wiring + security caps; **release** = spec acceptance + producer/visual evidence.

### Legacy Phase 5 — PSD

Source: [../spec/formats/psd.md](../spec/formats/psd.md); roadmap [plan.md](./plan.md)

| ID    | Task                                                             | Tier           | Code evidence / gap                                                               |
| ----- | ---------------------------------------------------------------- | -------------- | --------------------------------------------------------------------------------- |
| P5.0  | Spec + scope lock                                                | **release**    | `project/spec/formats/psd.md`                                                     |
| P5.1  | Types + XMP spike                                                | **release**    | `packages/formats/src/psd/types.ts`, spike test                                   |
| P5.2  | Export parity (groups, rotation, text runs, XMP)                 | **functional** | `export.ts`, `export/text.ts`                                                     |
| P5.3  | Export beyond prior art (shapes, partial effects, smart objects) | **functional** | `export/shape.ts`, `export/effects.ts`, `export/image.ts` — full effects set open |
| P5.4a | Import fast path (XMP)                                           | **functional** | `import-xmp.ts` — hydrates `extensions.psd.roundTrip`                             |
| P5.4b | Third-party import                                               | **scaffold**   | `import.ts` layer walker; adjustment layers, clipping masks, color modes open     |
| P5.5  | Reconciliation                                                   | **release**    | `reconcile.ts`                                                                    |
| P5.6  | Tests + UI wiring                                                | **functional** | `chain-round-trip.test.ts`; no committed real-tool PSD corpus                     |
| P5.G1 | Per-layer `BsPs` export                                          | **open**       | types + import read path; **no write in `psd/export/`**                           |
| P5.G2 | CMYK/Lab/Gray + ICC round-trip                                   | **open**       | preflight warns; export 8-bit RGB only                                            |
| P5.G3 | 16/32-bpc preservation                                           | **open**       | preflight warns on non-8                                                          |
| P5.G4 | Full layer effects parity                                        | **open**       | bevel, satin, pattern overlay, native inner glow/overlays                         |
| P5.G5 | Clipping masks + adjustment layers                               | **open**       | not in import/export paths                                                        |

### Legacy Phase 6 — PDF

Source: [../spec/formats/pdf.md](../spec/formats/pdf.md); roadmap [plan.md](./plan.md)

| ID    | Task                                       | Tier           | Code evidence / gap                                                                                                            |
| ----- | ------------------------------------------ | -------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| P6.0  | Spec + scope lock                          | **release**    | `project/spec/formats/pdf.md`                                                                                                  |
| P6.1  | Types + dependency swap                    | **release**    | pdf-lib + pdfjs-dist + fontkit                                                                                                 |
| P6.2  | Export parity (geometry, clips, radii)     | **release**    | `pdf/export/geometry.ts`, `clip.ts`, `rectangle.ts`                                                                            |
| P6.3  | Export beyond prior art                    | **functional** | marked content, XMP, page boxes, **shading patterns**, **per-element OCG**, font subsetting — ICC CMYK/Lab/spot still fallback |
| P6.4a | Import fast path                           | **release**    | `import/fast-path.ts`, `import/parse.ts`                                                                                       |
| P6.4b | Third-party import                         | **scaffold**   | `import/third-party.ts` — **text-only** (`Tj`/`TJ`)                                                                            |
| P6.5  | Reconciliation                             | **release**    | `pdf/roundtrip.ts`                                                                                                             |
| P6.6  | Tests + UI wiring                          | **functional** | `chain-round-trip.test.ts`; producer corpus harness exists, rows untriaged                                                     |
| P6.G1 | Third-party raster/vector/rich-text import | **open**       | explicit spec gap in `import/third-party.ts`                                                                                   |
| P6.G2 | ICC-based CMYK/Lab/spot emission           | **open**       | device fallback in `core.ts` / `export/color.ts`                                                                               |
| P6.G3 | Pre-parse xref/object budget caps          | **open**       | spec gap                                                                                                                       |

### Legacy Phase 7 — SVG

Source: [../spec/formats/svg.md](../spec/formats/svg.md); roadmap [plan.md](./plan.md)

| ID    | Task                                            | Tier           | Code evidence / gap                                                              |
| ----- | ----------------------------------------------- | -------------- | -------------------------------------------------------------------------------- |
| P7.0  | Spec + scope lock                               | **release**    | `project/spec/formats/svg.md`                                                    |
| P7.1  | Types + architecture                            | **release**    | `packages/formats/src/svg/` module                                               |
| P7.2  | Export parity + critical fixes                  | **release**    | recursive groups, strokes, gradients, sanitize                                   |
| P7.3  | Export beyond prior art                         | **functional** | metadata tagging, conic fallback; **font embedding landed** in `export-fonts.ts` |
| P7.4a | Import fast path                                | **release**    | `metadata.ts`, fast-path tests                                                   |
| P7.4b | Third-party import                              | **functional** | sanitizer, `<use>`/`<symbol>`, CSS blocks; pseudo-classes partial                |
| P7.5  | Reconciliation                                  | **release**    | `svg/roundtrip.ts`                                                               |
| P7.6  | Tests + UI wiring                               | **functional** | chain round-trip, hostile SVG suite, tool fixtures                               |
| P7.G1 | Structural `<use>`/`<symbol>` export round-trip | **open**       | import dereferences; export does not reconstruct                                 |
| P7.G2 | SMIL export                                     | **deferred**   | explicit non-goal; stripped on import                                            |
| P7.G3 | Large-file module split                         | **open**       | `KNOWN-GAPS.md` lists oversized modules                                          |

### Legacy Phase 8 — PPTX

Source: [../spec/formats/pptx.md](../spec/formats/pptx.md); roadmap [plan.md](./plan.md)

| ID    | Task                                        | Tier           | Code evidence / gap                                            |
| ----- | ------------------------------------------- | -------------- | -------------------------------------------------------------- |
| P8.0  | Spec + scope lock                           | **release**    | `project/spec/formats/pptx.md`                                 |
| P8.1  | Types + OOXML architecture                  | **release**    | fflate + fast-xml-parser AST under `ooxml/`                    |
| P8.2  | Export parity rebuild                       | **release**    | modular import/export                                          |
| P8.3  | Export beyond prior art                     | **functional** | multi-slide, theme, animations subset; tables/charts blob-only |
| P8.4a | Import fast path                            | **release**    | custom XML + shape tags                                        |
| P8.4b | Third-party import                          | **functional** | full slide walk; SmartArt/ink/3D open                          |
| P8.5  | Reconciliation                              | **release**    | `reconcile.ts`                                                 |
| P8.6  | Tests + UI wiring                           | **functional** | demo `pptx-chain.ct.tsx`; unit `chain-round-trip.test.ts`      |
| P8.G1 | Unit chain round-trip test                  | **functional** | `packages/formats/src/pptx/chain-round-trip.test.ts`           |
| P8.G2 | Native table/chart elements                 | **open**       | preserved as blobs + rectangle fallback                        |
| P8.G3 | Visual-fidelity CI + real licensed fixtures | **open**       | `real-fixtures.test.ts` skips when empty                       |

### Legacy Phase 9 — PDF/A

Source: [../spec/formats/pdf.md](../spec/formats/pdf.md) §PDF/A; roadmap [plan.md](./plan.md)

| ID    | Task                                 | Tier           | Code evidence / gap                                                |
| ----- | ------------------------------------ | -------------- | ------------------------------------------------------------------ |
| P9.0  | PDF/A audit + spec update            | **release**    | `pdf.md` PDF/A section                                             |
| P9.1  | Font embedding totality              | **functional** | subsetting via fontkit + preflight; Standard-14 edge cases remain  |
| P9.2  | Color-management + output intent     | **functional** | `export/pdfa.ts`; bundled minimal sRGB profile, not IEC61966-2.1   |
| P9.3  | Forbidden-feature gating             | **release**    | `validate-pdfa.ts` + importer rejects encrypted                    |
| P9.4  | Metadata + trailer `/ID`             | **release**    | XMP `pdfaid:` + `ensureTrailerId`                                  |
| P9.5  | Validator integration + CI           | **functional** | in-tree structural validator + **`.github/workflows/verapdf.yml`** |
| P9.6  | Round-trip support                   | **release**    | fast-path `extensions.pdf.pdfa`                                    |
| P9.G1 | Real sRGB IEC61966-2.1 profile       | **open**       | synthetic default profile today                                    |
| P9.G2 | CMYK PDF/A sub-phase                 | **deferred**   | plan Phase C                                                       |
| P9.G3 | Full ISO conformance without veraPDF | **deferred**   | structural floor only in-tree                                      |

---

## Supporting tracks

### Parallel Track A — Coverage reporting

Source: [coverage-reporting.md](./coverage-reporting.md)

| ID      | Task                                                | Tier        |
| ------- | --------------------------------------------------- | ----------- |
| A.1–A.6 | Coverage wiring, baseline, docs, threshold proposal | **release** |

### Parallel Track B — Cross-region CT audit

Source: [cross-region-ct-audit.md](./cross-region-ct-audit.md), [cross-region-ct-inventory.md](./cross-region-ct-inventory.md)

| ID      | Task                             | Tier        | Notes                                                                                             |
| ------- | -------------------------------- | ----------- | ------------------------------------------------------------------------------------------------- |
| B.1–B.4 | Inventory + gap list             | **release** | 120 cross-region bullets classified                                                               |
| B.5     | Land missing CT coverage         | **open**    | **77 covered / 12 partial / 31 missing**; 36 CT files on disk; update inventory when closing rows |
| B.6     | Final regression + gate closeout | **open**    | blocked on B.5                                                                                    |

### Release Track D — Release quality closure

Source: [production-readiness-status.md](./production-readiness-status.md), [real-producer-compatibility.md](./real-producer-compatibility.md)

| ID      | Task                                  | Tier           | Notes                                                                           |
| ------- | ------------------------------------- | -------------- | ------------------------------------------------------------------------------- |
| D.1     | Dev audit advisories                  | **release**    | overrides + risk acceptance documented                                          |
| D.2     | Coverage reporting                    | **release**    |                                                                                 |
| D.3     | CT inventory + gap closure            | **scaffold**   | inventory done; closure open (B.5)                                              |
| D.4     | Producer fixture governance + harness | **release**    | corpus fetch, manifests, class A/B/C/E                                          |
| D.5–D.8 | Producer compatibility triage         | **functional** | 16 generated/public rows passed; licensed/manual rows remain post-baseline work |
| D.9     | Fresh-checkout validation log         | **functional** | clean copied-directory validation recorded; repeat before release tag signoff   |

### Deferred Track C — Package split

Source: [plan.md](./plan.md) §3.4 and §7.2/§7.3/§7.8 (`W0-PLAT-01`, `W1-WORKER-01`, `W6-ARCH-01`)

| ID      | Task                                                  | Tier         |
| ------- | ----------------------------------------------------- | ------------ |
| C.1–C.5 | Prep, formats split, editor split, UI tokens, cleanup | **deferred** |

---

## Cross-format I/O improvement (CFIO)

Source: [plan.md](./plan.md) §3.4 (CFIO items route across W1–W3)

| ID        | Task                                  | Tier           | Code evidence / notes                                                                           |
| --------- | ------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------- |
| CFIO.1.1  | Export options modal wired            | **release**    | demo + UI modals                                                                                |
| CFIO.1.2  | Reconciliation modal generalized      | **release**    | PDF/PSD/SVG/PPTX                                                                                |
| CFIO.1.3  | Preflight modal                       | **release**    | `format-preflight.tsx`                                                                          |
| CFIO.2.1  | SVG H2 content-security               | **release**    | import security path                                                                            |
| CFIO.2.2  | SVG M2 CSS `url()` strip              | **release**    | `_shared/sanitize`                                                                              |
| CFIO.3.1  | Text-unicode in `_shared/text-layout` | **release**    |                                                                                                 |
| CFIO.3.2  | Shadow/glow in `_shared/effects`      | **release**    |                                                                                                 |
| CFIO.3.3  | Canvas units in `_shared/geometry`    | **release**    |                                                                                                 |
| CFIO.4.1  | PSD CMYK/Lab/Gray + ICC               | **open**       | blocks on `lcms-wasm`                                                                           |
| CFIO.4.2  | PDF shading + per-element OCG         | **functional** | **`pdf/export/shading.ts`**, **`export/ocg.ts` `bindingByElementId`** — was wrongly marked open |
| CFIO.4.3  | PSD effects parity                    | **open**       |                                                                                                 |
| CFIO.4.4  | PSD bitmap layer mask round-trip      | **release**    |                                                                                                 |
| CFIO.4.5  | PSD text rotation                     | **release**    |                                                                                                 |
| CFIO.4.6  | PSD 16/32-bpc                         | **open**       |                                                                                                 |
| CFIO.4.7  | PPTX font weight/style variants       | **release**    |                                                                                                 |
| CFIO.4.8  | PPTX page-override extension          | **release**    |                                                                                                 |
| CFIO.4.9  | Reconciliation conflict UI            | **release**    |                                                                                                 |
| CFIO.4.10 | `_shared/css` extraction              | **deferred**   | YAGNI                                                                                           |
| CFIO.5.1  | PPTX visual-fidelity CI               | **open**       | LibreOffice verify exists; no pixel baseline gate                                               |
| CFIO.5.2  | PowerPoint-on-Windows manual protocol | **deferred**   | external host                                                                                   |
| CFIO.5.3  | Licensed fixture mounts in CI         | **open**       |                                                                                                 |
| CFIO.5.4  | Telemetry sink for warning codes      | **release**    |                                                                                                 |
| CFIO.5.5  | Modal accessibility audit             | **scaffold**   | partial CT in `modals-a11y.ct.tsx`; format modals not covered                                   |
| CFIO.5.6  | Sister-format audits                  | **release**    | [sister-format-audit.md](./sister-format-audit.md)                                              |
| CFIO.5.7  | Large-deck load tests                 | **open**       |                                                                                                 |
| CFIO.5.8  | PDF font subsetting wiring            | **release**    |                                                                                                 |
| CFIO.6    | Gap-file rolling updates              | **functional** | some spec gap sections still stale — see DOC.1                                                  |

---

## Documentation debt (DOC.1)

Reconciled 2026-07-07 in the same pass as this task board. When touching related code, keep these files aligned with [plan-progress.md](./plan-progress.md) tiers:

| Document                                                | Maintenance rule                                                                                          |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `project/spec/formats/pdf.md` §Spec Gaps                | Open gaps = ICC CMYK + third-party import depth + parser caps; shading/OCG/veraPDF live under `_Closed…_` |
| `project/spec/formats/pptx.md`                          | Font embed + import recovery closed; release CI gaps stay open                                            |
| `project/spec/formats/psd.md`                           | `BsPs` export write is open; do not blame ag-psd — export path missing                                    |
| `project/implementation/cross-region-ct-inventory.md`   | Update CT file count when adding/removing `*.ct.tsx` files                                                |
| `project/implementation/production-readiness-status.md` | Use `git status` for worktree state; point open work to plan-progress queue                               |

---

## Maintenance rules

1. When a task changes tier, update this file in the **same change** as the code or spec evidence.
2. Do not mark **release** without pointing to acceptance tests, CT, or producer row evidence.
3. New spec acceptance criteria → append a row here and in [cross-region-ct-inventory.md](./cross-region-ct-inventory.md) when UI-crossing.
4. [plan.md](./plan.md) governs sequencing and scope; this board governs **honest completion state**. Every stable initiative is registered here at publication and updated in the same change as status/evidence.
