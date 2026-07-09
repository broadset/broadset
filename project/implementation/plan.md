# Broadset World-Class Master Roadmap

> **For agentic workers:** this file is the portfolio roadmap and governing execution contract. Before implementing an initiative, create a child plan under `project/implementation/plans/<initiative-id>.md` with `superpowers:writing-plans`, then execute it task-by-task with `superpowers:subagent-driven-development` or `superpowers:executing-plans`. A child plan is required to contain exact files, interfaces, failing-first tests, commands, expected results, and review checkpoints. This master roadmap never substitutes for that task-level plan.

- **Date:** 2026-07-09
- **Status:** Active after maintainer approval of the W0 roadmap corrections and RFC register.
- **Goal:** Build the most trustworthy, responsive, expressive, accessible, and interoperable professional web-native motion-graphics and broadcast-graphics authoring system in its category.
- **Architecture:** Broadset resolves validated project data into one deterministic semantic scene, applies shared time/text/color/geometry kernels, and drives interactive, offline-render, player, broadcast, and format-export targets from that common truth. Local-first durability is foundational; cloud collaboration and services are optional adapters over the same commands, change model, and content-addressed assets.
- **Tech stack:** Node.js 24+, TypeScript 6, React 19, Zustand/Zundo, Zod, HeroUI, Vitest, Playwright CT, Vite, the existing format libraries in `architecture.md`, browser workers, IndexedDB/OPFS where supported, and service-side rendering only after the service ADR gate.
- **Product strategy:** quality-gated vertical slices, with broadcast authoring and EBU OGraf as the protected flagship. Broadset does not attempt to win by accumulating disconnected controls; each release completes a real author-to-operator workflow.

## Global constraints

- `project/spec/**` remains the source of truth for behavior; this file defines sequencing and implementation strategy.
- Existing requirements may only be refined additively. An RFC may analyze and propose a behavioral contract change, but it does not authorize an agent to rewrite `project/spec/**`; explicit maintainer ratification and a policy-compliant spec change are required before implementation.
- Package boundaries, barrel exports, HeroUI rules, strict TypeScript, runtime validation, and cross-region CT derivation remain non-negotiable.
- Broadset-owned formats are greenfield until the first supported release; third-party compatibility is always sacred.
- No quality, security, accessibility, fidelity, or performance gate may be weakened to achieve a passing result.
- Every external input is hostile until size-capped, parsed, validated, normalized, and policy-checked.
- Every direct-manipulation path uses ephemeral preview updates and one committed undoable transaction.
- Interactive preview, deterministic offline rendering, and playout use separate clocks behind one exact timebase contract.
- Accessibility, localization, professional-user validation, performance, and recovery are design inputs from W0, not late polish.
- Every initiative has a stable ID, one owning workstream, explicit dependencies, spec links, measurable evidence, and a named human DRI before implementation begins.
- `npm run gate:full` must be green at every merge and wave exit, with the performance, fidelity, security, and release lanes active for that wave.

---

## 1. Product contract and release claims

### 1.1 Category thesis

Broadset combines four strengths that competing tools usually separate:

1. **Professional authoring:** precise vector, text, animation, component, variable, data, and responsive-layout tools.
2. **Trustworthy interoperability:** editable imports where possible, appearance-preserving fallbacks where not, and canonical-tool-valid exports.
3. **Broadcast operation:** exposed controls, stateful templates, live data, rundown/TAKE workflows, OGraf portability, and deterministic playout behavior.
4. **Web-native collaboration and delivery:** local-first files, optional realtime teamwork, embeddable playback, and secure automation.

The broadcast workflow is the flagship vertical slice:

```text
author graphic
  → define components, variables, states, and exposed controls
  → bind sample/live data and author responsive variants
  → preview through the same player contract used for delivery
  → validate/preflight
  → export OGraf/video/player package
  → operate through preview/program/TAKE
  → recover, audit, and reproduce every on-air state
```

### 1.2 Release tiers

Broadset uses explicit support claims rather than one ambiguous “production-ready” label.

| Tier                           | Claim                                                             | Required exit                                                                                                     |
| ------------------------------ | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Foundation verified**        | Safe internal development foundation                              | W0 and W1 complete; no open critical/high data-loss, injection, timebase, persistence, or scene-resolution defect |
| **Professional Authoring 1.0** | Complete local professional authoring workflow                    | W2 and W3 complete for the advertised authoring/format matrix; keyboard-only authoring and recovery signoff       |
| **Broadcast Qualified**        | Suitable for supported browser-engine playout workflows           | W4 complete; OGraf conformance, integration matrix, deterministic render, fault tests, and 24 h soak green        |
| **Team/Cloud Qualified**       | Secure collaborative and service-backed workflows                 | W5 complete; authorization, convergence, backup/restore, tenancy, audit, and operational SLOs green               |
| **Award Ready**                | Exceptional craft, usability, accessibility, and showcase quality | W6 complete; external professional review, AT studies, commissioned samples, and public dogfood evidence          |

A release may ship a narrower tier only by narrowing its published support matrix. It may not call a failed requirement “out of scope” without changing the product claim.

### 1.3 Non-goals until their gate

- No network-exposed MCP or plugin capability before WS12 authorization and audit controls.
- No “broadcast frame accurate” claim before RFC-06 and W1-TIME-01.
- No “component system complete” claim before RFC-07 reconciles the contradictory component contracts.
- No wide-gamut/HDR authoring claim before RFC-09 and W1-COLOR-01.
- No realtime-collaboration maturity claim while project-level/page-override changes can be dropped.
- No format is “production-grade” while its advertised producer rows or critical visual fixtures fail.

---

## 2. Governance, evidence, and plan structure

### 2.1 Documents and precedence

- **`plan.md`** — this portfolio roadmap: strategy, quality bars, RFCs, waves, ownership, and stable initiative index.
- **`plans/<initiative-id>.md`** — task-level execution plans created just in time. Multiple child plans are expected; “single master plan” means one authoritative portfolio plan, not one giant implementation task.
- **[plan-progress.md](./plan-progress.md)** — current tier/status and evidence for legacy work. W0-GOV-01 adds the new stable initiative rows before any new initiative may move from **proposed** to **ready**.
- **[production-readiness-status.md](./production-readiness-status.md)** — release-tier signoff and command evidence.
- **[real-producer-compatibility.md](./real-producer-compatibility.md)** — generated producer/fixture results and manual canonical-tool signoff.
- **[cross-region-ct-inventory.md](./cross-region-ct-inventory.md)** — generated spec-scenario-to-CT mapping.
- **[decisions.md](./decisions.md)** and future `decisions/ADR-*.md` — ratified product and architecture decisions.
- **`reviews/<date>-*.md`** — immutable audit evidence, scoring rubric, commands, and source commit.

Behavioral disagreement is resolved by the spec. Status disagreement is resolved by the live tracker. Sequencing disagreement is resolved by this roadmap. No deleted historical plan may be treated as the only location of a live requirement.

### 2.2 Stable ID and status rules

New IDs use `W<wave>-<domain>-<number>`, for example `W1-TIME-01`. IDs are permanent after publication.

Statuses are:

- **proposed** — roadmap seed exists; RFC/spec or child plan is not yet ready.
- **ready** — dependencies, specs, child plan, DRI, and test strategy are approved.
- **active** — implementation is in progress.
- **functional** — primary path works but an advertised acceptance criterion remains open.
- **release** — every requirement and evidence gate for the initiative is green.
- **deferred** — excluded from the current release claim with owner, user impact, rationale, and review date.
- **blocked** — an external decision or prerequisite prevents progress and is named explicitly.

### 2.3 Required initiative record

Before an initiative becomes **ready**, its child plan and tracker row must contain:

- stable ID, outcome, owning workstream, named DRI, and reviewers;
- exact specs/scenarios and additive clarifications;
- dependencies and consumers;
- exact created/modified/tested files;
- public interfaces and package-boundary impact;
- red/green/refactor steps with exact commands and expected failures/passes;
- performance, reliability, security, accessibility, fidelity, and telemetry implications;
- demoable user workflow and cross-region CT derivation;
- rollback/recovery behavior;
- closure evidence and documentation impact.

### 2.4 Evidence and waiver policy

- A finding closes only with a regression test that fails on the defective revision and passes on the fix.
- A visual baseline update is a dedicated reviewed change with before/after artifacts and an oracle explanation; bulk baseline blessing is forbidden.
- A manual signoff records tool/version/OS, fixture, operator, result, and artifact.
- A waiver records owner, affected users, product-claim impact, reason, compensating control, expiry, and re-review date.
- Medians never hide catastrophic failures. Every corpus reports p50, p95, worst case, and zero-unwaived-critical status.

---

## 3. Current state and complete repair floor

### 3.1 Evidence-qualified current verdict

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

### 3.2 Confirmed findings ledger

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

### 3.3 W0 verification queue

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

### 3.4 Legacy open-gap routing

| Legacy IDs                                                                                                                                | Destination                                      | Release treatment                                                                        |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| P2.1, CFIO.4.1                                                                                                                            | W1-COLOR-01 and W3-PSD-01                        | Typed color pipeline and PSD profile conversion                                          |
| P2.2                                                                                                                                      | W1-ASSET-01 and W2-ASSET-01                      | Font resolution, licensing metadata, proxies, dedup                                      |
| P2.3                                                                                                                                      | W1-TEXT-01                                       | HarfBuzz/Unicode shaping is no longer deferred                                           |
| P3.G1                                                                                                                                     | W1-RENDER-02                                     | Pattern/picture fill parity                                                              |
| UI.1–UI.15 (`UI.1`, `UI.2`, `UI.3`, `UI.4`, `UI.5`, `UI.6`, `UI.7`, `UI.8`, `UI.9`, `UI.10`, `UI.11`, `UI.12`, `UI.13`, `UI.14`, `UI.15`) | W2-STYLE-01, W2-TEXT-01, W2-CANVAS-01, W2-DOC-01 | Every item ships mounted with CT; no “implemented but hidden” closure                    |
| P5.4b, P5.G1, P5.G2, P5.G3, P5.G4, P5.G5, CFIO.4.3, CFIO.4.6                                                                              | W3-PSD-01                                        | Third-party PSD, color/bit depth, effects, clipping/adjustment, BsPs                     |
| P6.4b, P6.G1–G3                                                                                                                           | W3-PDF-01                                        | Rich PDF import, profile/spot output, pre-parse budgets                                  |
| P7.G1, P7.G2, P7.G3                                                                                                                       | W3-SVG-01 and W1-WORKER-01                       | Structural reuse, animated SVG strategy, module/worker split                             |
| P8.G2, P8.G3, CFIO.5.1, CFIO.5.3, CFIO.5.7 (`CFIO.5.1, 5.3, 5.7`); CFIO.5.2                                                               | W3-PPTX-01 and W3-QE-01                          | Tables/charts policy, visual CI, licensed fixtures, large decks, PowerPoint protocol     |
| P9.G1, P9.G2, P9.G3                                                                                                                       | W3-PDF-02                                        | Real profiles and explicit PDF/A support matrix; veraPDF remains the canonical validator |
| B.5–B.6, D.3, CFIO.5.5                                                                                                                    | W2-QE-01 and W2-A11Y-01                          | Zero missing shipped CT scenarios and complete modal audit                               |
| D.5–D.9                                                                                                                                   | W3-QE-01 and W6-REL-01                           | Producer evidence and fresh-clone release verification                                   |
| C.1–C.5, P7.G3, U-07                                                                                                                      | W0-PLAT-01, W1-WORKER-01, W6-ARCH-01             | Only boundary-enabling splits occur early; cleanup split follows stable contracts        |
| CFIO.4.10                                                                                                                                 | Deferred with review at W3-SVG-01                | Extract shared CSS only if the second consumer and measurable duplication exist          |
| DOC.1                                                                                                                                     | W0-DEF-01 and W6-REL-01                          | Reconcile stale specs/trackers in W0 and prove freshness again at release                |

---

## 4. Definition of world class

### 4.1 Correctness and interoperability

- Zero open critical/high findings in an advertised path.
- 100% pass for every advertised producer/tool/version row; unsupported rows are absent from the claim, not counted as tolerated failures.
- Exact structural assertions where the external format is exact.
- Geometry error ≤0.5 px or ≤0.25 external-format unit, whichever is stricter and representable.
- Text content/run identity exact; baseline and line-wrap tolerances fixture-specific and below visible displacement.
- SDR color difference ΔE00 ≤1.0 target and ≤2.0 ceiling under a declared profile/illuminant; HDR uses a ratified HDR metric.
- Import results expose separate appearance and editability scores plus element-level warnings.
- Unsupported source constructs remain appearance-preserving, quarantined, and round-trippable where safe.

### 4.2 Performance

The canonical budget lives in `project/spec/performance/spec.md` after W0-PERF-01. Until then this table is the roadmap proposal.

| Metric                              |                                       Target |          Merge/release ceiling | Cadence                         |
| ----------------------------------- | -------------------------------------------: | -----------------------------: | ------------------------------- |
| Cold shell LCP                      |                                       <1.8 s |                          2.5 s | per PR, fixed Lighthouse runner |
| `broadset-document-interactive`     |                                       <2.5 s |                          3.5 s | per PR, custom User Timing      |
| Eager critical JS, gzip             |                                      <300 kB |                         450 kB | per PR                          |
| Optional player core, gzip          |                                      <100 kB |                         150 kB | per PR after W1-PLAYER-01       |
| Plain SVG importer lazy chunk, gzip |                                      <100 kB |                         250 kB | per PR                          |
| TBT                                 |                                      <150 ms |                         300 ms | per PR                          |
| INP p75                             |                                      <100 ms |                         200 ms | field SLO                       |
| Discrete command input-to-paint p95 |                                       <50 ms |                         100 ms | per PR                          |
| Pointer-to-next-frame p95           |                         one refresh interval |          two refresh intervals | per PR                          |
| Drag/scrub frame p95, 500 elements  |                                     <16.7 ms |                          33 ms | per PR                          |
| Playback dropped frames, 10 s       |                                          <1% |                             5% | per PR                          |
| Undo/redo, 500 elements             |                                       <50 ms |                         100 ms | per PR                          |
| Timeline scrub, 10k keyframes       |                                 <16.7 ms p95 |                      33 ms p95 | nightly                         |
| Layers search/scroll, 10k rows      |                              <50 ms response |                         100 ms | nightly                         |
| Worker import main-thread tasks     |                                  none >50 ms |                    one <100 ms | nightly                         |
| Heavy import wall time              |                         fixture-specific p95 | baseline +20% and absolute cap | nightly                         |
| Durable journal acknowledgement     |                                  <100 ms p95 |                         250 ms | per PR                          |
| Open/edit/close ×10 retained heap   |                  no significant upward slope |      no confirmed leak cluster | nightly                         |
| One-hour 1000-element heap          |                                      <500 MB |                           1 GB | nightly                         |
| 60 s 1080p offline export ratio     |                             ≤0.25 wall/media |                           ≤1.0 | nightly by codec                |
| 24 h playout                        | zero fatal errors; <1 frame/h measured drift |        heap <1 GB; drops <0.1% | release/monthly                 |
| Per-PR performance suite            |                                      <10 min |                         15 min | meta-gate                       |

Each result records browser/build, OS, CPU, RAM, GPU, refresh rate, DPR, power profile, cache state, fixture hash, warmup, samples, statistic, noise band, and trace artifact. Absolute and relative-regression gates both apply.

### 4.3 Reliability and data integrity

| SLO                              | Target                                                              |
| -------------------------------- | ------------------------------------------------------------------- |
| Silent data loss                 | zero in all fault-injection and field evidence                      |
| Autosave recovery point          | ≤5 s                                                                |
| Crash recovery time              | ≤30 s for the canonical 100 MB project                              |
| Durable commit success           | ≥99.99% once field telemetry exists                                 |
| Crash-free authoring sessions    | ≥99.9% once field telemetry exists                                  |
| Supported import/export success  | ≥99.5% field; 100% controlled corpus                                |
| Multi-tab split-brain corruption | zero in model-checked/fault tests                                   |
| Cloud backup RPO/RTO             | ≤5 min / ≤60 min, proven by quarterly restore drill                 |
| Collaboration convergence        | identical canonical state after every tested partition/interleaving |
| On-air state reproducibility     | input/event log reproduces the same frame and control state         |

### 4.4 UX and accessibility

- A new user plays a first animation in under five minutes without external documentation.
- A professional completes benchmark authoring tasks with ≥95% unassisted success.
- Every command is discoverable through the central registry and reachable by keyboard; spatial dragging has a non-drag alternative.
- Pointer, menu/contextual UI, and command palette reach every meaningful operation unless the interaction is inherently one-dimensional and documented.
- WCAG 2.2 AA automated scans have zero violations on shipped surfaces.
- 200% zoom, 400% text zoom/reflow where applicable, forced colors, reduced motion, reduced transparency, keyboard layouts, IME, RTL, and pseudo-localization are tested.
- Keyboard-only E2E creates, animates, binds, validates, exports, and recovers a graphic.
- Two moderated VoiceOver and NVDA sessions occur before each qualified release; blockers prevent release.
- Professional interaction feedback appears within the performance budget and never shifts surrounding layout unexpectedly.

### 4.5 Security and privacy

- Zero unvalidated external model edges, enforced by lint plus boundary tests.
- Sanitization is symmetric at capture, render, export, player, and OGraf packaging boundaries.
- Hostile corpus produces no script execution, network escape, unbounded allocation, tab crash, or silent active-content preservation.
- Browser fetching is allowlisted, credentialless, redirect-denying, capped, cancellable, and MIME-verified.
- Service fetching additionally blocks private/link-local/metadata networks after every DNS resolution and redirect.
- CSP and Trusted Types are enforced after a report-only burn-in.
- Plugins run in sandboxed workers/iframes with capability manifests, quotas, deterministic change proposals, and kill switches.
- Telemetry is consented, schema-bound, redacted, default-off before consent, and contains no document-derived strings.
- Releases include signed artifacts, SBOM, provenance, vulnerability/license gates, and rollback instructions.

---

## 5. Architecture north star

### 5.1 One semantic pipeline

```text
untrusted bytes / local project / remote changes
  → bounded parser and Zod validation
  → canonical BroadsetProject
  → ResolvedSceneSnapshot
       hierarchy + page overrides + components + variables + live data
       coordinate spaces + layout + text shaping + color + effects
       exact timebase + deterministic randomness
  → RenderPlan (immutable, cacheable, worker-transferable)
       ↘ interactive DOM renderer and accessible semantic mirror
       ↘ deterministic offline frame renderer
       ↘ @broadset/player / OGraf lifecycle
       ↘ format exporters and visual-fidelity harness
```

The `ResolvedSceneSnapshot` and deterministic kernels are internal contracts, not new persisted compatibility baggage. Their exact package placement is decided by RFC-10 before code moves.

### 5.2 Clock separation

- `Timebase` converts rational frame rates, integer frames/ticks, milliseconds, and SMPTE timecode with explicit rounding.
- `InteractiveClock` follows rAF and may coalesce display work.
- `OfflineFrameClock` advances exact integer frames and never reads wall time.
- `PlayoutClock` consumes an external/reference clock when available, measures drift, and declares degraded software-timed mode otherwise.
- Timeline UI stores and manipulates stable IDs; it never relies on array index as durable identity.

### 5.3 Local-first durability

```text
validated command transaction
  → immutable change set
  → content-addressed blob writes
  → checksummed journal commit + atomic IndexedDB head update
  → background snapshot/compaction
  → optional cloud sync of the same immutable records
```

OPFS is an acceleration/blob adapter, not the sole source of truth. Recovery can rebuild from the last valid snapshot plus idempotent journal replay. The user can always export the last valid project and quarantined invalid bytes.

### 5.4 Interoperability representation

Every importer may produce:

- native editable Broadset elements;
- safe source/provenance metadata;
- a sanitized opaque fallback for unsupported constructs;
- a raster/vector appearance fallback;
- warnings and per-element confidence.

Appearance fidelity and editability fidelity are measured separately. Editing a native representation marks only the relevant preserved source branch dirty.

### 5.5 Host topology

The core remains browser-capable. W0-PLAT-01 decides and documents:

- supported evergreen authoring browsers;
- whether a desktop shell is a qualified host and which native capabilities it owns;
- worker, service worker, and cross-origin-isolation requirements;
- codec/export capability detection and fallback;
- filesystem/open/save adapters;
- playout Chromium/CEF pinning and upgrade qualification;
- offline and PWA support tier.

### 5.6 Shared kernel ownership

`model` owns persisted semantics and DOM-free value types. It must not become a dumping ground for HTML/SVG security or renderer implementation.

Potential shared leaf kernels—markup security, text layout, color, geometry/time—require an `architecture.md` amendment before consumers import them. The decision optimizes semantic ownership, worker safety, tree-shaking, and identical results across renderer and formats.

---

## 6. RFC register — W0 maintainer decisions

All RFCs are decided before W1 starts. Rejection means the documented default is the binding implementation path.

| RFC    | Decision                                                                                                      | Contract affected                                                                           | Default while undecided                                                                      |
| ------ | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| RFC-01 | Whether editor Group creates a real `group` container with `parentId`                                         | `parentId` and `groupId` remain independent                                                 | Keep selection-only `groupId`; import/export must support both                               |
| RFC-02 | Segment easing/keyframe tangent model                                                                         | `KeyframeValue.easing`                                                                      | One easing curve per property segment; no split tangents                                     |
| RFC-03 | Stable keyframe IDs and required/explicit duration policy                                                     | Keyframe shape; optional `durationMs`; current derived pad is **+1000 ms, minimum 3000 ms** | Stable IDs remain absent; single-select timeline only; current duration rule remains         |
| RFC-04 | Sequence/master timeline and reusable timeline references                                                     | Inline `childTimelines`                                                                     | No document sequencer; inline child timelines remain                                         |
| RFC-05 | Typed expression AST and expression-driven properties                                                         | Existing `visibleWhen` string expression                                                    | Data binding ships without general property expressions                                      |
| RFC-06 | Rational timebase, integer frames/ticks, drop-frame timecode, duration interval                               | Decimal `output.frameRate` and millisecond offsets                                          | Do not claim broadcast frame accuracy; map existing rates to exact rationals internally only |
| RFC-07 | Reconcile component contract and implementation                                                               | `componentRef`, page overrides, component master storage                                    | Components remain experimental and cannot claim propagation                                  |
| RFC-08 | Persistence/host contract and replacement of demo localStorage behavior                                       | Demo save requirement and host adapters                                                     | Keep `EditorConfig.onSave`; no silent replacement of the specified host behavior             |
| RFC-09 | Typed wide-gamut/HDR color and working-space model                                                            | Current sRGB-centered edited color representation                                           | Advertise sRGB/SDR authoring only; preserve external wide-gamut metadata when safe           |
| RFC-10 | `ResolvedSceneSnapshot` and shared kernel package topology                                                    | Architecture dependency graph and renderer/export sharing                                   | Keep current packages; duplicate behavior cannot be called parity without differential tests |
| RFC-11 | Collaboration substrate: mature CRDT adapter versus custom operation model                                    | Change identity, ordering, history, storage, remote undo                                    | No network maturity claim; complete local/project change semantics first                     |
| RFC-12 | OGraf/player lifecycle as the canonical delivery runtime                                                      | Player API, IN/HOLD/UPDATE/OUT mapping, exposed controls                                    | Export-only experiments; no OGraf conformance claim                                          |
| RFC-13 | Pre-release migration helpers and schema-version policy                                                       | Specs that explicitly require legacy color/fill/filter migrators                            | Keep spec-mandated helpers until an approved behavioral RFC removes them                     |
| RFC-14 | Audio media/time contract: tracks, cues, waveform, scrub, offline mux, sample clock, and initial mixing scope | Existing audio cues and output non-goals                                                    | Keep cue-only behavior; no waveform, audio-track, or A/V-sync claim                          |

Proposal artifacts from the documentation-reconciliation audit (none overrides current `project/spec/**` until explicitly ratified by a maintainer):

- RFC-03/RFC-06 duration and sampling: [ADR-003/006](./decisions/ADR-003-006-time-duration.md); RFC-03 stable keyframe identity remains open
- RFC-07 components: [ADR-007](./decisions/ADR-007-components.md)
- RFC-08 BSP/persistence boundary: [ADR-008](./decisions/ADR-008-bsp-persistence.md)
- RFC-10 page/resolved-scene semantics: [ADR-010](./decisions/ADR-010-resolved-scene-pages.md); concrete shared-kernel package topology remains under W0-PLAT-01
- RFC-11 local collaboration semantics: [ADR-011](./decisions/ADR-011-collaboration-changes.md); network substrate selection remains open for W5
- IO-D-14/15/16 preflight, authoring exposure, and intentional loss: [ADR-IO-014/016](./decisions/ADR-IO-014-016-preflight-loss.md)

All proposal artifacts above remain undecided alongside RFC-01/02, RFC-03 stable keyframe identity, RFC-04/05/09/12/13/14, RFC-10 package topology, and RFC-11's network-substrate choice. W0-RFC-01 cannot move to `release` until every row has an explicitly maintainer-ratified artifact and every required behavioral spec change is applied by an authorized maintainer.

Each RFC document includes examples, rejected alternatives, data shapes, migration impact, package boundaries, security/privacy implications, performance implications, accessibility implications, and a decision test.

---

## 7. Roadmap waves and stable initiatives

### 7.1 Execution model

Waves express dependency order and release outcomes, not promises that unrelated subsystems finish simultaneously. Workstreams may run in parallel only when their dependencies and file ownership do not overlap.

Calendar forecasts are published after W0 using observed throughput and named staffing. The planning baseline for forecasting is:

- one product/design lead with professional motion/broadcast experience;
- one UX researcher/content designer shared across waves;
- two model/renderer/playback engineers;
- two editor/UI interaction engineers;
- two formats/text/color engineers;
- one performance/reliability/security engineer;
- one platform/collaboration engineer beginning during W0 architecture work;
- dedicated QA automation capacity plus external accessibility and broadcast reviewers.

With materially fewer people, scope or calendar changes; quality bars do not.

Every wave closes with:

1. all initiatives at **release** or explicitly removed from that release claim;
2. `npm run gate:full` green from a fresh clone;
3. active performance/fidelity/security lanes green;
4. tracker/spec/gap/support-matrix updates in the same changes as evidence;
5. demo and user documentation for every shipped behavior;
6. a professional workflow review and a closure audit against the wave objective.

### 7.2 W0 — Truth, decisions, trust, and design foundation

**Objective:** establish truthful evidence, resolve contract decisions, close critical correctness/security defects, and define the product/host architecture before feature expansion.

| ID            | Outcome and primary surfaces                                                                                                                         | Dependencies | Release evidence                                                                               |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------- |
| W0-GOV-01     | Stable spec scenario IDs and bidirectional test traceability across `project/spec/**`, test JSDoc, CT inventory, and plan-progress                   | none         | CI rejects unknown/missing scenario links; inventory regenerated deterministically             |
| W0-GOV-02     | Generate architecture dependency/version baseline from package manifests; fix F-19 and stale experimental/docs claims                                | none         | generated check fails on drift; `architecture.md` matches manifests                            |
| W0-DEF-01     | Re-audit every `bugs.md` entry, F/B/U/X row, spec gap, and production-readiness item                                                                 | W0-GOV-01    | every row has current commit evidence and destination                                          |
| W0-RFC-01     | Decide RFC-01 through RFC-14 and write ADRs/spec changes                                                                                             | W0-DEF-01    | all decisions approved; no W1 behavior depends on an undecided contract                        |
| W0-UX-01      | Professional workflow research, baseline benchmark tasks, product voice, density, typography, interaction principles, and signature design direction | none         | 5–10 professional participants; findings and measurable task baseline recorded                 |
| W0-PLAT-01    | Browser/desktop/PWA/worker/player/service topology and boundary-enabling package strategy in `architecture.md`                                       | W0-RFC-01    | support matrix, capability adapters, codec/filesystem fallbacks, and dependency graph approved |
| W0-PERF-01    | Canonical performance spec, instrumentation, dev HUD, fixed-runner Lighthouse/Playwright/size gates                                                  | W0-PLAT-01   | baseline+margin gates active; traces retained on failure; obsolete TTI absent                  |
| W0-QE-01      | Prettier all packages, discovered test matrix, flake telemetry, generated CT inventory, fresh-clone job                                              | W0-GOV-01    | F-21/X-01/U-05/U-06 resolved; repeat-each lane and expiry-bound quarantine policy active       |
| W0-SEC-01     | Fix F-08; verify U-01/U-02/U-04/U-09; define sanitizer/fetch/parser policies                                                                         | RFC-10       | hostile corpus green; no active preserved content; CSP report-only telemetry clean             |
| W0-SEC-02     | Fix F-17 and validate collaboration/reconciliation/paste/drop batches atomically at trust boundaries                                                 | W0-SEC-01    | malformed payload batches return typed diagnostics and perform zero partial mutation           |
| W0-COLLAB-01  | Complete page-override and document-level change semantics for B-20 before choosing network transport                                                | RFC-11       | page overrides and data-schema changes converge; remote changes stay out of local undo         |
| W0-COLLAB-02  | Add project-level diff/apply for assets and project settings to close B-22                                                                           | W0-COLLAB-01 | project round-trip and randomized change-order tests converge                                  |
| W0-TIME-01    | Ratify duration interval, frame-count, sampling, timestamp, and endpoint semantics for B-23/B-37                                                     | RFC-06       | one shared helper and cross-exporter contract tests specified                                  |
| W0-IO-01      | Fix F-01/F-04 with parent/group distinction and z-order-safe PPTX structure                                                                          | W0-RFC-01    | nested/interleaved geometry, structure, re-import, PowerPoint/LibreOffice evidence             |
| W0-IO-02      | Fix F-02 percentage/fraction/default radial-gradient centers                                                                                         | W0-SEC-01    | property tests prove finite in-range centers and no document crash                             |
| W0-IO-03      | Fix F-03 PDF page-box coordinate conversion                                                                                                          | W0-SEC-01    | CropBox/MediaBox/rotation fixtures within 0.5 pt                                               |
| W0-IO-04      | Fix F-05 PPTX placeholder layout/master geometry inheritance                                                                                         | W0-IO-01     | title/body/custom placeholder oracle fixtures within 0.5 px                                    |
| W0-IO-05      | Fix F-06 SVG inline/presentation/stylesheet cascade                                                                                                  | W0-SEC-01    | specificity/inheritance/inline fixtures match browser reference                                |
| W0-IO-06      | Fix F-10 PDF CID/Identity-H decoding                                                                                                                 | W0-SEC-01    | ToUnicode/CMap multilingual fixtures are exact                                                 |
| W0-IO-07      | Fix F-11 multi-page PDF association                                                                                                                  | W0-IO-03     | page structure and visual fixtures preserve page identity                                      |
| W0-IO-08      | Fix F-12 PPTX gradient angle conversion                                                                                                              | W0-IO-01     | canonical angle matrix matches PowerPoint/LibreOffice raster                                   |
| W0-IO-09      | Fix F-13 PPTX theme style-matrix references                                                                                                          | W0-IO-04     | default and custom theme galleries retain paint/stroke                                         |
| W0-IO-10      | Fix F-14 PSD Uint8Array byteOffset handling                                                                                                          | W0-SEC-01    | sliced-view input equals copied bytes for valid/malformed files                                |
| W0-IO-11      | Fix F-15 SVG stop-opacity                                                                                                                            | W0-IO-02     | transparent-stop structural and visual fixtures pass                                           |
| W0-MODEL-01   | Fix F-07 with a linear SVG-path tokenizer                                                                                                            | W0-SEC-01    | minified-path fuzz and worst-case linearity tests green                                        |
| W0-MODEL-02   | Fix F-16 so safe parsing is total for legacy gradient input                                                                                          | W0-SEC-01    | typed failure is returned; safeParse never throws                                              |
| W0-RECOVER-01 | Stop silent discard of unparseable saved data; quarantine plus raw download and last-valid recovery                                                  | W0-SEC-01    | corrupt-save CT proves no silent loss and accessible recovery                                  |

**W0 exit:** zero open critical/high known defects; every unverified finding classified; all RFCs resolved; visual language and professional benchmark baseline approved; host/package architecture approved; performance and hostile-input gates live.

### 7.3 W1 — Deterministic, recoverable, worker-safe engine

**Objective:** make time, scene resolution, text, color, assets, rendering, playback, and persistence deterministic shared foundations.

| ID             | Outcome and primary surfaces                                                                                                                          | Dependencies                       | Release evidence                                                                            |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------- |
| W1-TIME-01     | Implement ratified `FrameRate/Timebase`, frame/tick/timecode conversions, drop-frame rules, and exact export sampling in `model`/`playback`/`formats` | W0-TIME-01                         | exhaustive boundary/property tests; hour-long 29.97/59.94 drift zero by contract            |
| W1-TIME-02     | Stable keyframe addressing and compiled binary-search tracks; F-18 eased tuple path                                                                   | RFC-02/RFC-03                      | seek equals sequential evaluation; easing and identity tests green                          |
| W1-SCENE-01    | `ResolvedSceneSnapshot` resolves hierarchy, page overrides, component/default data, coordinate spaces, and provenance                                 | RFC-01/RFC-07/RFC-10               | nested rotated round-trip properties; F-09 and all coordinate consumers migrated            |
| W1-TEXT-01     | Shared HarfBuzz/Unicode text layout: shaping, BiDi, graphemes, line breaks, fallback, variable axes, vertical directions                              | W0-PLAT-01/RFC-10                  | multilingual golden metrics identical across renderer/export consumers                      |
| W1-COLOR-01    | Ratified working-space pipeline, float channels, profile transforms, linear-light premultiplied compositing, SDR/HDR policy                           | RFC-09/RFC-10                      | color-chart oracles, profile round trips, gamut/alpha tests                                 |
| W1-SEC-01      | Shared context-specific safe-markup policy and iterative bounded AST processing; sanitizer capture/render/export symmetry                             | RFC-10/W0-SEC-01                   | mutation score target, depth/size corpus, Trusted Types preparation                         |
| W1-ASSET-01    | Content-addressed font/image/video/ICC blobs, metadata extraction, dedup, integrity hash, license/provenance fields                                   | RFC-08/W0-PLAT-01                  | corrupt/missing/duplicate asset tests; deterministic resolution                             |
| W1-PERSIST-01  | IndexedDB journal/head, OPFS/blob adapter, checksummed snapshots, compaction, quota/eviction, Web Locks/BroadcastChannel coordination                 | RFC-08/W1-ASSET-01                 | crash injection at every write boundary; RPO/RTO budgets; multi-tab model tests             |
| W1-WORKER-01   | Worker RPC/progress/cancel/error contract; first heavy SVG/PPTX/PSD parse path and WASM/trie load off main thread                                     | W0-PLAT-01/W1-SEC-01               | no import main-thread task >50 ms; cancellation releases resources                          |
| W1-PLAYBACK-01 | Interactive, offline, and playout clocks behind one playback interface; precompiled appliers and indexed nodes                                        | W1-TIME-01/W1-SCENE-01             | zero hot-loop querySelector/JSON parse; deterministic offline frame hashes                  |
| W1-RENDER-01   | Incremental RenderPlan and dirty-ID updates; parent index; React region selectors; transient scrub/drag path                                          | W1-SCENE-01/W1-PLAYBACK-01         | render-count assertions and frame budgets at 200/500/1000 elements                          |
| W1-RENDER-02   | Pattern/picture fills, filter/mask groundwork, accessible semantic mirror, DOM contract stewardship                                                   | W1-COLOR-01/W1-ASSET-01            | P3.G1 closed; visual and accessibility baselines reviewed                                   |
| W1-PLAYER-01   | Tree-shakeable `@broadset/player` skeleton consuming RenderPlan and exact lifecycle/timebase                                                          | W1-PLAYBACK-01/W1-RENDER-01/RFC-12 | ≤150 kB gzip ceiling, deterministic seek, CSP-safe sample embed                             |
| W1-HISTORY-01  | Named local versions and visual recovery history over persistence snapshots                                                                           | W1-PERSIST-01                      | create/rename/restore/delete/version-diff CT; restore never overwrites without confirmation |

**W1 exit:** foundation-verified release tier; exact frame snapshots; deterministic scene/text/color output; worker import path; crash-safe autosave; pattern/picture fills; player core; performance budgets green with zero known data-loss/injection path.

### 7.4 W2 — Professional authoring core

**Objective:** deliver a coherent, fully mounted, keyboard-authorable professional editor rather than disconnected implementation fragments.

| ID             | Outcome and primary surfaces                                                                                                              | Dependencies                                                                            | Release evidence                                                                                    |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| W2-CMD-01      | Central typed command registry consumed by shortcuts, menus, context UI, palette, toolbar, automation, and help                           | W1-HISTORY-01                                                                           | 100% shipped commands registered; conflicts detected; commands are undoable or explicitly read-only |
| W2-CANVAS-01   | Marquee, hit testing, multi-select, mixed values, smart snapping, guides, unit-correct rulers/nudge, transform HUD, modifier semantics    | W1-SCENE-01/W2-CMD-01                                                                   | cross-region CT for every scenario; direct manipulation stays within frame budget                   |
| W2-PATH-01     | Pen/path phases A–B, Bézier handles, anchor conversion, path selection, text-path authoring, masks/mattes editing                         | W2-CANVAS-01/W1-RENDER-02                                                               | geometry property tests, undo grouping, keyboard and pointer parity                                 |
| W2-TIMELINE-01 | De-gated virtualized property lanes, stable key operations, zoom/pan, frame/timecode modes, markers, work area, copy/paste/multi-select   | W1-TIME-02/W2-CMD-01                                                                    | keyboard-only timeline E2E; 10k-keyframe budget                                                     |
| W2-GRAPH-01    | Value/speed graphs, temporal/spatial tangents per RFC-02, presets, motion paths, separate dimensions where approved                       | W2-TIMELINE-01                                                                          | curve oracle tests, accessible handle alternatives, playback parity                                 |
| W2-COMP-01     | Components per RFC-07: create, instantiate, nested propagation, exposed properties, overrides, unlink, cycle handling                     | W1-SCENE-01/W2-CMD-01                                                                   | 100-instance propagation <100 ms; collaboration-ready stable identity                               |
| W2-VAR-01      | Typed document variables/tokens with aliases, modes, cycle detection, impact preview, component bindings                                  | W1-COLOR-01/W2-COMP-01                                                                  | theme/locale/aspect-mode CT; alias and cycle property tests                                         |
| W2-DATA-01     | Typed view-model/data-schema editor, binding builder, sample/live preview, lists/repeaters, conditional visibility, fallback/stale states | W2-VAR-01/RFC-05                                                                        | end-to-end scoreboard/lower-third flows; invalid/stale data never corrupts project                  |
| W2-TEXT-01     | Structured TextBody/run editor, inline rich text, bullets, links, language/direction, variable axes, auto-size, font fallback UI          | W1-TEXT-01/W2-CANVAS-01                                                                 | multilingual editing/IME/RTL CT; renderer/export metrics unchanged                                  |
| W2-AUDIO-01    | Ratified audio tracks/cues, waveform cache, scrub/solo/mute, markers, sample-clock conversion, and accessible controls                    | RFC-14/W1-TIME-01/W1-ASSET-01                                                           | long-duration A/V sync, seek/scrub, offline frame/audio alignment, and missing-codec tests          |
| W2-STYLE-01    | Theme/swatches, gradients, FilterStack, picture/pattern, stroke ends, clip path, 3D inputs, effect stack                                  | W1-COLOR-01/W1-RENDER-02                                                                | UI.1–UI.10 closed with mounted controls and CT                                                      |
| W2-DOC-01      | Prepress, metadata/output intent, notes, unit-aware fields, canvas/profile settings, actionable preflight                                 | W2-STYLE-01/W1-ASSET-01                                                                 | UI.11–UI.15 closed; unit/profile/preflight CT                                                       |
| W2-ASSET-01    | Virtualized asset library, search/tags, relink, replace-everywhere, viewport proxies, font/license warnings                               | W1-ASSET-01/W1-PERSIST-01                                                               | 10k-asset budgets; missing/relink/offline workflows                                                 |
| W2-A11Y-01     | Semantic canvas/layers relationship, announcements, focus restoration, drag alternatives, forced colors, target/focus mechanics           | W2-PATH-01/W2-GRAPH-01/W2-DATA-01/W2-TEXT-01/W2-AUDIO-01/W2-DOC-01/W2-ASSET-01/W2-UX-01 | axe zero; VoiceOver/NVDA blockers cleared; modal audit closed                                       |
| W2-UX-01       | Command palette, shortcut discovery/editor, contextual inspector, empty states, progress/cancel feedback, light/dark/high-contrast themes | W0-UX-01/W2-CMD-01                                                                      | professional benchmark improvement and ≤100 ms feedback                                             |
| W2-QE-01       | Generated cross-region coverage, property tests for authoring math/state, visual CT, performance assertions                               | W2-A11Y-01                                                                              | B.5/B.6/D.3/F-20 zero missing shipped rows                                                          |

**W2 exit:** a professional user can create, animate, componentize, bind, validate, save, restore, and operate a sample graphic entirely through shipped UI and keyboard. No W2 feature remains behind the generic experimental flag.

### 7.5 W3 — Interoperability and delivery excellence

**Objective:** make Broadset a trustworthy bridge to real professional ecosystems and a deterministic delivery tool.

| ID           | Outcome and primary surfaces                                                                                                                                 | Dependencies                                                                             | Release evidence                                                                  |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| W3-CORPUS-01 | Licensed/public/generated corpus manifest with hashes, provenance, feature assertions, expected warnings, and update policy                                  | W0-GOV-01                                                                                | missing golden/fixture fails CI; licenses and fetch instructions auditable        |
| W3-RECON-01  | Import report with separate appearance/editability scores, per-element confidence, side-by-side diff, fallback visibility, and reconciliation actions        | W2-CANVAS-01/W3-CORPUS-01                                                                | no silent drops; decisions undoable; warnings accessible and exportable           |
| W3-PSD-01    | Third-party PSD completeness: color modes/profiles, 16/32 bpc, effects, clipping/adjustment, smart/opaque preservation, BsPs                                 | W1-COLOR-01/W3-CORPUS-01                                                                 | P5/CFIO gaps closed for advertised matrix; Photoshop manual protocol              |
| W3-PDF-01    | Rich PDF import: page boxes, text/CMaps, images, paths, CTMs, clipping, resources, per-page mapping, pre-parse caps                                          | W1-TEXT-01/W1-WORKER-01/W3-CORPUS-01                                                     | P6.4b/P6.G1/P6.G3 closed; editable + appearance scores                            |
| W3-PDF-02    | PDF/PDF-A output: real profiles, CMYK/Lab/spot support policy, font totality, veraPDF and canonical viewer matrix                                            | W1-COLOR-01/W3-CORPUS-01                                                                 | P6.G2/P9.G1–G3 resolved in support matrix and validators                          |
| W3-SVG-01    | Full CSS/defs/reuse/transform fidelity, structural use/symbol policy, animated SVG strategy, safe fallback                                                   | W1-SEC-01/W1-WORKER-01/W3-CORPUS-01                                                      | P7.G1–G3 resolved; Chromium/WebKit/Firefox raster parity                          |
| W3-PPTX-01   | Layout/master inheritance, groups/placeholders, text/theme fidelity, tables/charts native-or-labeled fallback, large-deck worker path                        | W1-TEXT-01/W3-CORPUS-01                                                                  | P8/CFIO gaps; XSD, LibreOffice, PowerPoint Windows protocol                       |
| W3-MOTION-01 | Reusable sequences/presets, text animators, behaviors, repeaters/stagger, onion skin, motion blur, and time remap under approved contracts                   | W2-TIMELINE-01/W2-AUDIO-01/RFC-04                                                        | deterministic seeds, bake-to-keyframes, export parity, and performance budgets    |
| W3-MOTION-02 | Typed expression/procedural authoring UI with cycle diagnostics, dependency graph, sandboxed evaluation, and value tracing                                   | RFC-05/W2-DATA-01/W3-MOTION-01                                                           | total/cycle-safe evaluation, deterministic replay, accessible editor diagnostics  |
| W3-VIDEO-01  | Deterministic MP4/WebM/GIF/PNG/EXR sequence export with capability detection, exact timestamps, audio mux policy, alpha policy, progress/cancel/resume queue | W1-TIME-01/W1-PLAYER-01/W2-AUDIO-01                                                      | codec matrix, media inspection, A/V duration/frame/hash tests, wall/media budgets |
| W3-LOTTIE-01 | Lottie/dotLottie import/export with explicit supported-feature matrix, theming, fallback, and validator                                                      | W1-SCENE-01/W3-CORPUS-01                                                                 | ≤1% approved perceptual diff on supported corpus; unsupported features warned     |
| W3-FIGMA-01  | Figma import/update reconciliation mapped to components, variables, text, assets, auto-layout/constraints where representable                                | W2-COMP-01/W2-VAR-01/W3-RECON-01                                                         | update preserves local edits by policy; corpus and conflict UI                    |
| W3-OGRAF-01  | OGraf package export/import, manifest/GDD, lifecycle, steps, assets/fonts, thumbnails, validator                                                             | W1-PLAYER-01/W2-DATA-01/RFC-12                                                           | official schema green; two independent renderer/controller validations            |
| W3-PLAYER-01 | Versioned player API, lazy feature modules, exact seek/state/data lifecycle, sandbox/CSP, diagnostics                                                        | W3-OGRAF-01/W3-VIDEO-01                                                                  | size tiers, deterministic conformance suite, showcase embed                       |
| W3-QE-01     | Two-tier visual CI: renderer and canonical-tool export rasters; producer matrix and manual protocols                                                         | W3-PSD-01/W3-PDF-01/W3-PDF-02/W3-SVG-01/W3-PPTX-01/W3-LOTTIE-01/W3-FIGMA-01/W3-PLAYER-01 | 100% advertised rows, p95/worst-case gates, no wholesale baseline update          |

**W3 exit:** Professional Authoring 1.0. Advertised imports are honest about editability and preserve appearance; exports validate in canonical tools; player, timed media, Lottie, and OGraf have explicit conformance evidence.

### 7.6 W4 — Broadcast authoring and local operate mode

**Objective:** complete the differentiated author-to-operator workflow without requiring cloud services.

| ID            | Outcome and primary surfaces                                                                                                  | Dependencies                         | Release evidence                                               |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | -------------------------------------------------------------- |
| W4-STATE-01   | Visual state-machine authoring: states, transitions, conditions, triggers, layers, trace/debug, deterministic priority        | W2-TIMELINE-01/W2-DATA-01            | model/property tests; state trace reproduces exact result      |
| W4-RUNDOWN-01 | Playlist/rundown/cue model with validation, rehearsal, skip/hold/take-back policy, and immutable event log                    | W4-STATE-01                          | restart/replay produces identical active item/state            |
| W4-OP-01      | Studio UI with preview/program, TAKE, hotkeys, touch/tablet layout, confidence/status, role-separated destructive controls    | W4-RUNDOWN-01/W2-A11Y-01             | operator task benchmark, keyboard/touch/AT flows               |
| W4-CONTROL-01 | Author-curated exposed-property builder and generated operator controls with validation, grouping, permissions, presets       | W2-COMP-01/W3-OGRAF-01               | author→OGraf→operator control contract round trip              |
| W4-DATA-01    | Live data connectors, transforms, credentials boundary, rate tiers, backpressure, frame-coalescing, stale/fallback/test modes | W2-DATA-01/W4-CONTROL-01             | 10 Hz feed→60 fps; partition/reconnect/flood tests             |
| W4-VARIANT-01 | Responsive/aspect variants, constraints, safe areas, content-fit policy, variant preview matrix                               | W2-VAR-01/W2-CANVAS-01               | 16:9/9:16/1:1/ultrawide corpus and overflow preflight          |
| W4-PLAYOUT-01 | CasparCG/OBS/vMix and OGraf integration matrix; key/fill alpha, font/asset readiness, lifecycle, pinned engine policy         | W3-PLAYER-01/W4-OP-01                | clean-machine integration scripts and recorded output          |
| W4-CLOCK-01   | Software-timed versus externally synchronized playout tiers, clock diagnostics, drift/failover behavior                       | W1-TIME-01/W4-PLAYOUT-01             | no false genlock claim; drift injection and degraded-state UI  |
| W4-SOAK-01    | 24 h playlist/live-data/asset/video soak with fault injection, heap/DOM/GPU tracking, diagnostics bundle                      | W4-CLOCK-01/W4-DATA-01/W4-VARIANT-01 | zero fatal/data-loss errors; budgets and reproducibility green |

**W4 exit:** Broadcast Qualified for the published engine/integration matrix. An operator can rehearse and run a playlist with live data, recover from failures, and reproduce the event log without entering authoring mode.

### 7.7 W5 — Secure cloud, collaboration, and ecosystem

**Objective:** add optional team/cloud power without compromising local ownership, determinism, or authorization.

| ID           | Outcome and primary surfaces                                                                                                               | Dependencies             | Release evidence                                                               |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------ | ------------------------------------------------------------------------------ |
| W5-SVC-01    | Service ADR implementation: identity/session, tenant isolation, capability authorization, API versioning, secrets, deployment environments | W0-PLAT-01/RFC-11        | threat model, authz matrix, tenant-isolation tests, key rotation               |
| W5-STORE-01  | Encrypted document/asset storage, sync protocol, quotas, deletion/export, backup/restore, retention                                        | W1-PERSIST-01/W5-SVC-01  | restore drill, RPO/RTO, corruption and partial-upload tests                    |
| W5-COLLAB-01 | Ratified CRDT/operation adapter, offline edits, partitions, presence, comments, local undo, tombstone/GC policy                            | W0-COLLAB-01/W5-STORE-01 | randomized convergence, rich text/order/hierarchy/component conflicts          |
| W5-REVIEW-01 | Version diff, named branches, review/approval, conflict presentation, audit trail, share-link viewer                                       | W5-COLLAB-01             | branch/update/merge/restore E2E and permission tests                           |
| W5-JOBS-01   | Idempotent job queue and render service using exact player/offline clock; cancellation, retry, quota, artifact integrity                   | W3-PLAYER-01/W5-SVC-01   | duplicate/retry/worker-loss tests; ProRes/HAP reference output                 |
| W5-LIB-01    | Team component/variable/template libraries with semantic versioning, impact review, staged publish, rollback                               | W2-COMP-01/W5-REVIEW-01  | cross-project update, conflict, rollback, permission tests                     |
| W5-PLUGIN-01 | Typed plugin SDK in sandboxed worker/iframe, signed manifest, capability grants, quotas, UI slots, validated change proposals              | W2-CMD-01/W5-SVC-01      | escape/flood/crash/revoke tests; no direct store/DOM mutation                  |
| W5-MCP-01    | Local stdio MCP by default; network mode uses short-lived scoped capabilities and read/propose/apply separation                            | W5-PLUGIN-01/W5-SVC-01   | explicit apply approval, audit/replay protection, red-team tests               |
| W5-BCAST-01  | Authenticated automation/control API, OGraf Server API alignment, Caspar AMCP adapter, and MOS/NRCS integration ADR                        | W4-PLAYOUT-01/W5-SVC-01  | permissioned clean-room integration, replay/audit, reconnect/idempotency tests |
| W5-OBS-01    | Logs/metrics/traces/alerts, consented product telemetry, local redacted diagnostic bundle, incident/runbook ownership                      | W5-SVC-01                | SLO dashboards, alert drills, privacy schema enforcement                       |

**W5 exit:** Team/Cloud Qualified. Offline/local use remains first class; collaboration converges; authorization is deny-by-default; backups restore; every automated mutation is previewable, auditable, and reversible.

### 7.8 W6 — Craft, hardening, scale, and award readiness

**Objective:** refine an already complete product into an exceptional one and establish a sustainable release system.

| ID             | Outcome and primary surfaces                                                                                                    | Dependencies                                                                          | Release evidence                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| W6-CRAFT-01    | Signature visual/motion language, interruptible chrome motion, reduced alternatives, optional sound/haptics preference          | W0-UX-01/W4-SOAK-01/W5-JOBS-01/W5-LIB-01/W5-MCP-01/W5-BCAST-01/W5-OBS-01              | design review and motion/a11y/performance budgets                      |
| W6-UX-01       | Saved workspaces, panel/layout customization, multi-document switcher, command history/macros, contextual learning              | W2-CMD-01                                                                             | professional benchmark and preference recovery                         |
| W6-ONBOARD-01  | Commissioned samples, action-gated first-run learning, teaching empty states, progressive disclosure, activation funnel         | W2-QE-01/W3-RECON-01/W3-MOTION-02/W3-PLAYER-01/W3-QE-01                               | first-animation and first-valid-export targets                         |
| W6-I18N-01     | Full message catalog, locale formatting, RTL, pseudo-locale, IME and copy expansion                                             | W2-TEXT-01                                                                            | zero clipped strings; locale/keyboard matrix                           |
| W6-QE-01       | Coverage-guided fuzzing, mutation spot checks, fault injection, browser matrix, formal/model checks for critical state machines | W3-MOTION-02/W3-QE-01/W4-SOAK-01/W5-JOBS-01/W5-LIB-01/W5-MCP-01/W5-BCAST-01/W5-OBS-01 | nightly green; ≥80% mutation killed on security/validation kernels     |
| W6-ARCH-01     | Responsibility-driven file/package split after contracts stabilize; stable public facades; dead-code/dependency cleanup         | W0-PLAT-01/W5-JOBS-01/W5-LIB-01/W5-MCP-01/W5-BCAST-01/W5-OBS-01                       | ≤5 justified files over 500 lines; no boundary regression              |
| W6-GPU-01      | DOM versus Canvas/WebGL/WebGPU benchmark/quality/accessibility ADR at 500/1000/2000 elements                                    | W1-RENDER-01                                                                          | adoption only if budgets improve without text/a11y/fidelity regression |
| W6-REL-01      | Changesets, canary/stable, signed artifacts, SBOM/provenance, release:verify, rollback, user/API docs                           | W6-RESEARCH-01/W6-QE-01/W6-ARCH-01/W6-GPU-01/W6-SHOW-01                               | every merge/release artifact reproducible and documented               |
| W6-SHOW-01     | Public showcase/playground using Broadset player, real-work gallery, ≥8 commissioned samples                                    | W3-PLAYER-01/W6-CRAFT-01/W6-ONBOARD-01                                                | public dogfood performance and accessibility green                     |
| W6-RESEARCH-01 | Standing designer/operator cohort, external design critique, moderated AT sessions, award-rubric audit                          | W6-CRAFT-01/W6-UX-01/W6-ONBOARD-01/W6-I18N-01                                         | external panel score ≥8.5 with no critical usability blocker           |

**W6 exit:** Award Ready. Craft is distinctive, benchmarked workflows are fast and learnable, release evidence is reproducible, and the showcase is itself a production Broadset artifact.

---

## 8. Workstream ownership and arbitration

Every concern has exactly one defining owner. Consumers may contribute requirements but may not create a competing contract.

| Workstream                              | Owns                                                                                                | Does not own                               |
| --------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| WS1 Interop                             | Format parsers/emitters, reconciliation, external-tool compatibility, producer corpus assertions    | Core model semantics, renderer truth       |
| WS2 Performance                         | Budget spec, measurement lab, profiling, startup, workers, memory, degradation policy               | Product acceptance or renderer semantics   |
| WS3 Time & Animation                    | Timebase consumption, playback evaluation, timeline behavior, graph/motion authoring                | Persisted model decisions without RFC      |
| WS4 Canvas & Interaction                | Selection, transforms, path editing, snapping, guides, clipboard, constraints                       | Renderer output semantics                  |
| WS5 Pro Authoring Platform              | Components, variables, view models/data, assets, exposed controls, local versions                   | Cloud tenancy/auth                         |
| WS6 Quality & Release                   | Traceability, test harnesses, fidelity CI, fuzz/mutation, release evidence                          | Feature semantics                          |
| WS7 UX, Accessibility & Research        | Interaction system, command experience, themes, content, onboarding, AT/pro research                | Performance budget definition              |
| WS8 Architecture, Security & Durability | Package topology, validation, markup security, persistence, schema/version policy, trust boundaries | Format-specific fidelity decisions         |
| WS9 Rendering, Text & Color             | Resolved scene/render plan, DOM/accessibility contract, text/color/effects parity                   | Editor state or format parsing             |
| WS10 Broadcast Operate                  | Rundown, state machine, control panels, live data, playout qualification, soak                      | Generic cloud infrastructure               |
| WS11 Brand & Showcase                   | Identity, signature motion, samples, product site/showcase, external critique                       | Core editor interaction correctness        |
| WS12 Services                           | Authn/authz, tenancy, storage service, jobs, deployment, secrets, observability, operations         | Local document semantics                   |
| WS13 Player & OGraf                     | Runtime API, lifecycle, player packaging, OGraf conformance, embed contract                         | Authoring UI                               |
| WS14 Collaboration & Ecosystem          | CRDT/operation adapter, presence/review, libraries, plugin SDK, MCP                                 | Authorization implementation owned by WS12 |

### 8.1 Shared-contract owners

| Concern                                 | Defining owner                         | Consumers                   |
| --------------------------------------- | -------------------------------------- | --------------------------- |
| Persisted model and RFC outcomes        | WS8 + maintainer                       | all                         |
| Rational timebase and duration interval | WS8 defines; WS3 implements evaluation | WS1, WS10, WS13             |
| Resolved scene and coordinate spaces    | WS9 defines with WS8 types             | WS1, WS3, WS4, WS13         |
| Text shaping/layout                     | WS9                                    | WS1, WS3, WS4               |
| Color/compositing                       | WS9                                    | WS1, WS3, WS4               |
| Command registry                        | WS7                                    | WS3, WS4, WS5, WS10, WS14   |
| Persistence transaction protocol        | WS8                                    | WS5, WS12, WS14             |
| Performance budgets                     | WS2                                    | all                         |
| Fidelity harness                        | WS6                                    | WS1, WS9, WS13              |
| Sanitizer/markup policy                 | WS8                                    | WS1, WS9, WS13              |
| Player/OGraf lifecycle                  | WS13                                   | WS3, WS5, WS10              |
| Authorization/capabilities              | WS12                                   | WS10, WS14                  |
| Professional UX benchmark               | WS7                                    | all user-facing workstreams |

If a child plan discovers that ownership is wrong, it pauses and amends `architecture.md`/this table through review; it does not silently create a second implementation.

---

## 9. Professional authoring and UX blueprint

### 9.1 Command system

The command registry is the application’s behavioral spine:

- stable command ID, localized label/description, category, icon, shortcut, context predicate, argument schema, destructive flag, undo policy, and telemetry-safe outcome;
- one execution path shared by menus, toolbar, context UI, keyboard, palette, macros, plugins, MCP proposals, and tests;
- shortcut collision detection, platform conventions, customizable keymap, printable reference, and discoverable tooltips;
- palette preview for safe view/navigation commands and explicit confirmation for destructive commands;
- typed argument flows such as “go to frame,” “set opacity,” “replace asset,” and “export preset” without ambiguous natural-language mutation;
- recent/frequent commands stored locally without document content.

### 9.2 Canvas feel

The canvas must feel immediate and physically coherent:

- deterministic hit testing with cycling and click-through modes;
- marquee modes for contain/intersect and direction semantics;
- deep select, enter/exit container, isolation, and breadcrumb navigation;
- one transform model for canvas, properties, keyboard, and collaboration;
- snapping priority, hysteresis, visible reason, temporary override, and accessible non-pointer controls;
- transform HUD with expressions, units, aspect lock, pivot, distribute/alignment, and exact rollback on Escape;
- zoom centered on pointer/selection, predictable pan, fit/100%/pixel preview, and no browser-zoom conflict;
- selection/handles/guides remain legible in all themes, zooms, HDR/forced-color modes, and dense documents;
- touch/pen gestures are additive and never remove keyboard/mouse capability.

### 9.3 Timeline and motion

Professional timeline behavior includes:

- layer/property lanes, search/filter, solo/mute/lock, labels, markers, work area, frame/timecode display, and scalable density;
- stable keyframe IDs, multi-select, box select, ripple/slide only when explicitly invoked, copy/paste across compatible properties, and collision rules;
- value and speed graphs, spatial tangents, roving/hold/auto behavior per the approved model, separate dimensions, motion-path handles, orientation, and path percentages;
- deterministic interpolation with color-space declaration and exact spring termination policy;
- onion skin, motion blur, time remap, audio waveform/scrub after the time/audio contract exists;
- nested/reusable sequences and protected intro/outro regions only under RFC-04;
- preview quality/degradation status visible when the editor intentionally reduces effects.

### 9.4 Text and typography

- rich paragraph/run editing with reliable IME composition and undo;
- OpenType features, variable axes, script/language/direction, font fallback, line breaking, hyphenation, bullets/numbering, links, baseline shifts, tabular numerals, text on path, vertical writing, auto-height, and shrink-to-fit;
- deterministic authoring metrics derived from W1-TEXT-01 rather than browser-dependent guesswork;
- missing/substituted font warnings with relink/replace and impact preview;
- font license/embedding constraints visible before export;
- semantic text remains available to assistive technology even when visual rendering uses positioned glyphs or per-character animation.

### 9.5 Components, variables, and data

The product distinguishes three concepts:

1. **Components** define reusable structure, animation, and exposed controls.
2. **Variables** define authoring-time reusable values and modes such as brand, locale, aspect, or theme.
3. **View models/live data** define runtime contracts with sample/live values, validation, freshness, and fallbacks.

The UI must show provenance for every resolved value and allow “go to source.” Overrides are intentional, inspectable, resettable, and counted before master/library updates. Publishing a breaking exposed-control or data-schema change produces an impact report.

### 9.6 Asset and document management

- multi-document switcher and unsaved/recovery state;
- content-addressed assets with thumbnails/proxies, folder/tag/search, replace/relink, usage count, color/profile/font metadata, and license notes;
- background thumbnail/proxy generation with progress/cancel;
- project package inspector showing assets, sizes, missing links, profiles, versions, and compatibility;
- actionable preflight that focuses the affected element and offers safe fixes;
- local versions, visual diff, restore-as-copy, and raw recovery export;
- export presets, queue, cancellation, retry, artifact location, canonical-tool validation status, and reproducibility manifest.

### 9.7 Import and reconciliation

Import is a guided workflow, not a toast:

- safe preflight and estimated cost before expensive work;
- progressive parse with cancel and partial diagnostics;
- source/converted side-by-side view;
- per-element editability/appearance confidence;
- preserved-fallback visibility and reason;
- font/asset/color/profile reconciliation;
- match/replace/keep decisions with batch rules;
- a downloadable import report and deterministic reproduction bundle;
- “open anyway as appearance-only” when native editability is impossible but safe visual preservation succeeds.

### 9.8 Author versus operator experience

Authors curate what operators may change. Operators see:

- generated, grouped, validated controls with safe presets;
- preview/program distinction and unmistakable TAKE state;
- stale/disconnected/live data status;
- rehearsal and on-air locks;
- hotkey/touch workflows with confirmation boundaries;
- cue history, notes, countdown, next-item readiness, and clear failure recovery;
- zero authoring-only complexity unless role/permission explicitly allows it.

### 9.9 HeroUI and high-density spatial surfaces

HeroUI remains mandatory for chrome, forms, menus, modals, tabs, accordions, toggles, and standard controls. Canvas, graph, timeline rail, transform handles, and thousands-of-row virtualized primitives may use purpose-built implementations only when:

- no HeroUI component represents the spatial interaction;
- semantics and keyboard behavior are specified;
- React Aria/HeroUI tokens are reused where applicable;
- the performance test proves the need;
- the exception is recorded in the child plan and HeroUI usage audit;
- equivalent accessible non-pointer control exists.

This is not a blanket raw-HTML exception.

---

## 10. Performance, reliability, and security engineering program

### 10.1 Performance architecture rules

- Parse, decode, hash, thumbnail, shape, and export work moves to workers when it can exceed one frame.
- Worker messages transfer buffers rather than clone large payloads; progress and cancellation use one shared protocol.
- Render updates consume changed IDs and resolved dependencies, never whole-document stringify comparisons.
- Playback precompiles property appliers, node references, easing, path arc-length tables, text segments, and parent maps.
- React subscribes per region/entity; pointer/timeline preview avoids global state churn until commit.
- Large lists and timelines virtualize with focus persistence, stable ARIA position metadata, and bounded overscan.
- Images use viewport-aware proxy/full-resolution tiers; decode work is cancellable.
- Fonts and required assets have explicit readiness barriers; unrelated assets remain lazy.
- Heavy format modules, WASM, validators, and panels load by behavior-driven prefetch, not at shell startup.
- Every cache defines key, invalidation, memory bound, eviction, and correctness oracle.
- GPU adoption follows measured DOM/Canvas bottlenecks and cannot compromise text, accessibility, determinism, or parity.

### 10.2 Benchmark fixture matrix

Performance gates cover at least:

- 200/500/1000/2000 visible elements;
- 1k/10k/100k keyframes;
- 100/1000/10k assets;
- 1/10/100/500 MB compressed inputs with bounded expanded forms;
- deeply nested groups/components at the maximum supported depth;
- long multilingual text, complex scripts, variable fonts, text animators, and missing fonts;
- filters/masks/blends/video plus low/high-resolution images;
- simultaneous playback, data updates, collaboration changes, autosave, and UI interaction;
- low-end supported device, mid-range reference, high-refresh display, and software-render fallback.

### 10.3 Fault-injection matrix

Required injected failures include:

- tab/process termination before and after every persistence boundary;
- quota exhaustion, eviction, private mode, permission denial, and corrupted journal/snapshot/blob;
- two tabs racing, frozen leader, stolen lock, clock skew, and duplicate replay;
- worker crash, timeout, cancellation, malformed message, and out-of-memory termination;
- network partition, reorder, duplicate, stale auth, token expiry, reconnect flood, and server retry;
- missing/corrupt fonts, images, ICC profiles, videos, decoders, and export codecs;
- parser bombs: ZIP ratios/entries, XML depth, path points, dimensions, channels, object/xref counts, fonts, and recursion;
- playout data flood, slow renderer, missing next cue, clock loss, browser reload, and output reconnect;
- plugin infinite loop, memory flood, invalid change proposal, permission revocation, and iframe navigation attempt.

### 10.4 Security architecture

- Context-specific allowlist parsers replace ad hoc regex sanitization.
- Sanitized source and quarantined original bytes are distinct types and stores.
- URL policy canonicalizes scheme/host/port before allowlisting and never sends ambient credentials.
- Browser arbitrary-network import is not considered SSRF-safe merely because CORS prevents reading; arbitrary fetches use a service egress proxy or explicit user-supplied files.
- Service egress resolves DNS and verifies every address/redirect against IPv4/IPv6 private, loopback, link-local, and metadata ranges.
- Untrusted content never reaches `innerHTML`, `eval`, `new Function`, string timers, unrestricted Web Components, or unsandboxed plugin code.
- External payload validation returns typed diagnostics and applies atomically; partial invalid remote batches do not mutate state.
- Secrets are never stored in project files, telemetry, client bundles, or plugin-readable state.
- Security-sensitive changes require the repository security-review checklist and a hostile regression.

### 10.5 Reliability architecture

- Every user action has one transaction ID and deterministic change list.
- Durable acknowledgement means journal/head commit completed, not merely state updated in memory.
- Autosave coalesces without losing transaction boundaries needed for undo, collaboration, or audit.
- Recovery ranks valid candidates and never destroys a newer invalid payload before the user can export it.
- Background compaction is interruptible and leaves the previous snapshot valid until cutover.
- Services use idempotency keys, immutable artifacts, bounded retries, dead-letter inspection, and explicit cancellation.
- Playout uses state/event logs, deterministic seeds, asset manifests, and exact player/runtime versions for reproduction.
- Diagnostics are redacted, downloadable, and sufficient to identify build, capability matrix, fixture hashes, timings, warnings, and failure phase.

---

## 11. Verification strategy

### 11.1 Traceability

Every normative scenario receives a stable ID such as `UI-CANVAS-SELECT-001`. Tests declare `@spec UI-CANVAS-SELECT-001`. CI fails when:

- a shipped scenario has no required unit/CT/integration/manual evidence;
- a test references a missing scenario;
- a cross-region scenario lacks one CT asserting every affected region;
- a manual-only scenario lacks a current protocol/result;
- a tracker calls an item release while linked evidence is missing or stale.

### 11.2 Test layers

| Layer                | Purpose                                                                                                   |
| -------------------- | --------------------------------------------------------------------------------------------------------- |
| Unit                 | Pure validation, math, conversion, interpolation, commands, reducers, serializers                         |
| Property/metamorphic | Coordinate round trips, parser invariants, transforms, time conversion, schema normalization              |
| Differential         | Shared kernel versus exporter/renderer, old/new implementation during refactor, multiple external oracles |
| Component/CT         | Real pointer/keyboard behavior, focus, cross-region state, visual feedback, HeroUI integration            |
| Visual               | Reviewed renderer and canonical-tool raster parity under pinned fonts/engines                             |
| Integration          | Import→edit→export→canonical tool; player/OGraf lifecycle; local persistence and workers                  |
| Fuzz                 | Parsers, sanitizers, schemas, URLs, timecode, paths, collaboration change sequences                       |
| Fault                | Crash, quota, network, worker, service, plugin, and playout failure boundaries                            |
| Model/formal         | Persistence cutover, multi-tab leadership, collaboration convergence, rundown/playout state machine       |
| Manual professional  | PowerPoint/Photoshop, assistive technology, browser/CEF integrations, designer/operator workflows         |

### 11.3 Visual and fidelity rules

- Golden fixtures include semantic assertions; a screenshot alone is insufficient.
- Fonts, locale, timezone, DPR, color profile, browser/tool version, and rendering flags are pinned.
- Antialias noise uses masks/perceptual comparison, but edge displacement and missing content remain hard failures.
- Baseline updates contain generated diff images and a human-readable reason per changed fixture.
- External-tool oracles never use Broadset re-import as the sole proof.
- Fallback fidelity and native editability are tested independently.

### 11.4 Performance test rules

- Fixed runners never share noisy workloads.
- Warmup and median/p95 method are written in the performance spec.
- A retry cannot turn a deterministic failure green; statistical retries are bounded and all samples retained.
- Quarantine requires owner, linked root-cause issue, compensating signal, and expiry.
- Regressions are compared against the merge base and an absolute ceiling.
- Performance optimizations retain semantic/fidelity tests; faster wrong output fails.

---

## 12. Dependency graph, merge trains, and change discipline

### 12.1 Critical path

```text
W0 evidence + RFCs + product/host design
  → W1 timebase + resolved scene + text/color/security
      → W1 persistence/workers/playback/render/player
          → W2 commands/canvas/timeline/components/variables/data
              → W3 reconciliation/formats/video/Lottie/OGraf/player
                  → W4 state/rundown/operator/data/playout
                  → W5 services/collaboration/libraries/plugins/MCP
                      → W6 release, scale, showcase, award qualification
```

W4 local operate work may overlap W5 service implementation after W3. W6 quality, research, and craft practices run continuously, but their release qualification occurs after their dependencies.

### 12.2 High-contention files and merge order

| Surface                                                        | Contenders                                              | Required order                                                                      |
| -------------------------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `project/spec/model/animation.md` and `model/src/animation.ts` | RFC-02/03/04/06, W1-TIME, W2 timeline, W4 state         | RFC/timebase first; stable IDs next; authoring consumers after                      |
| `project/spec/model/config.md` and component types             | RFC-07, W2-COMP, W2-VAR, W4 controls                    | reconcile spec/model first; components; variables/exposed controls                  |
| `editor/collaboration/*` and `model/changes.ts`                | W0-COLLAB, W1 persistence, W5 CRDT                      | complete local/project semantics; persistence transaction origin; network adapter   |
| `demo/src/demo-app/app.tsx`                                    | selectors, persistence UX, command registry, onboarding | region split; persistence; command consumption; onboarding                          |
| `editor/store-actions/store.ts`                                | transactions, coordinate migration, commands, recovery  | command/transaction seam; coordinate consumers; recovery integration                |
| `ui/src/timeline/**`                                           | timebase, virtualization, graph, accessibility          | timebase APIs; timeline owner; perf/a11y requirements integrated in same child plan |
| `renderer/**` DOM contract                                     | resolved scene, accessibility, effects, player          | resolved scene contract; parity fixtures; renderer/player adapters                  |
| `formats/svg/export.ts`                                        | sanitizer, structural reuse, animation                  | security policy first; structural fidelity; animated export                         |
| `formats/pptx/export/shape-tree.ts`                            | F-01/F-04, component/group semantics                    | W0 group fix under current contract; component exports after RFC-07                 |
| `demo/src/formatBridge.ts`                                     | chunks, worker RPC, reconciliation                      | worker RPC first; per-format adapters; UI report                                    |

### 12.3 Change sizing

- A child-plan task is the smallest independently reviewable unit with its own red/green cycle.
- A contract migration may span packages but lands package-by-package behind a consistently green gate.
- Unrelated RFCs do not share one giant commit merely because they occur in the same wave.
- Fixture regeneration is isolated from semantic code where reviewers need to inspect generated churn.
- Visual baseline changes are separate from the renderer behavior change.
- Tracker/spec/doc evidence lands with the behavior it describes.

---

## 13. Professional research, craft, and award program

### 13.1 Standing benchmark tasks

The same tasks are measured every wave:

1. Import an external PowerPoint and identify/repair degraded content.
2. Build and animate a two-line lower third.
3. Create a reusable component with protected style and exposed text/color/media.
4. Add brand/aspect/locale variable modes.
5. Bind sample/live data with stale and fallback behavior.
6. Build an operator panel and rehearse TAKE.
7. Export OGraf and deterministic video.
8. Recover after an injected crash.
9. Replace a missing font/asset globally.
10. Diagnose and fix a preflight issue.
11. Complete the authoring path keyboard-only.

Metrics include unassisted completion, time, errors, reversals/undo, recovery success, command discovery, confidence, perceived workload, and qualitative delight/friction.

### 13.2 Cohorts and review cadence

- 5–10 working broadcast/motion designers in a standing beta cohort.
- Operators/template integrators represented separately from authors.
- At least two moderated AT sessions per qualified release.
- Weekly design critique during active UI waves.
- Monthly professional benchmark review.
- Per-wave support-matrix and fidelity review.
- External craft critique before Award Ready; internal scoring alone is insufficient.

### 13.3 Showcase standard

- ≥8 commissioned production-quality projects spanning news, sport, election, finance, weather, social, channel branding, and event graphics.
- Every sample includes editable source, exposed controls, responsive variants, data contract, OGraf/player output, accessibility notes, and performance evidence.
- The public hero, demos, thumbnails, and product motion are authored and delivered by Broadset.
- The playground starts without signup for safe sample content and clearly separates local/private from cloud actions.

---

## 14. Risk register

|   # | Risk                                                 | Mitigation and trigger                                                                             |
| --: | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
|   1 | The roadmap becomes another stale narrative          | Stable IDs, generated traceability, same-change tracker evidence, quarterly closure audit          |
|   2 | Scope overwhelms a small team                        | Release tiers, protected flagship, staffed forecasts, dependency-gated child plans                 |
|   3 | RFCs stall core work                                 | W0 exit requires decisions; defaults prohibit unsupported claims rather than invite shadow designs |
|   4 | One break wave becomes unreviewable                  | Separate RFC/package migrations with green gates and one declared release boundary                 |
|   5 | Browser limitations undermine professional claims    | W0 host topology, capability matrix, desktop/server fallbacks, honest support tiers                |
|   6 | rAF preview is mistaken for broadcast timing         | Separate clocks, rational timebase, explicit software/external sync tiers                          |
|   7 | DOM optimization changes visual truth                | Resolved scene, differential tests, reviewed baselines, deterministic offline oracle               |
|   8 | Text differs across renderer/exporters               | Shared shaping/layout kernel, embedded fonts, multilingual goldens                                 |
|   9 | Wide-gamut/HDR labels exceed implementation          | RFC-09 support claims, explicit working/display/output transforms, color oracles                   |
|  10 | Persistence loses edits across IDB/OPFS boundary     | Immutable blobs, atomic IDB head, cutover markers, crash injection, raw recovery                   |
|  11 | Custom collaboration protocol diverges               | Mature CRDT evaluation, property/interleaving tests, formal model, project-level semantics first   |
|  12 | Corpus conversion exposes a flood of bugs            | Gate new signatures, prioritize catastrophic/user-frequency, keep claims narrow until fixed        |
|  13 | Visual CI flakes or blesses regressions              | Fixed environment, semantic assertions, separate baseline review, p95/worst-case evidence          |
|  14 | HeroUI density conflicts with spatial performance    | Narrow reviewed spatial exceptions with semantics/tokens/perf evidence                             |
|  15 | Plugins/MCP become a mutation/security bypass        | Command proposals only, sandbox/capabilities/approval/audit/replay controls                        |
|  16 | Service tier ships without operational maturity      | Threat model, on-call, SLOs, backup restore, incident and alert drills before qualification        |
|  17 | OGraf becomes a checkbox rather than ecosystem wedge | First-class WS13 ownership, two-renderer validation, generated controls/lifecycle mapping          |
|  18 | Award work becomes superficial polish                | W0 design/research, continuous benchmark, commissioned work, external critique                     |
|  19 | Package split consumes effort without user value     | Only boundary-enabling split early; measured/stable-contract cleanup in W6                         |
|  20 | Waivers normalize unfinished work                    | Claim reduction, named owner, expiry, compensating control, public support-matrix impact           |

---

## 15. Completion criteria and execution protocol

### 15.1 Foundation verified

- [ ] All W0 findings and W1 foundation initiatives are **release**.
- [ ] No critical/high data-loss, injection, timing, persistence, scene-resolution, or collaboration-semantics defect is open.
- [ ] Performance/security/fidelity runners are reproducible and green.
- [ ] Exact time, scene, text, color, asset, worker, player, and persistence contracts have evidence.

### 15.2 Professional Authoring 1.0

- [ ] Keyboard-only E2E creates, animates, componentizes, binds, validates, saves, restores, and exports.
- [ ] All advertised authoring surfaces are mounted and documented.
- [ ] CT inventory has zero missing shipped cross-region scenarios.
- [ ] Advertised format matrix is 100% green with worst-case and canonical-tool evidence.
- [ ] Appearance/editability import report and recovery flows pass professional benchmarks.
- [ ] No AT blocker remains.

### 15.3 Broadcast Qualified

- [ ] OGraf manifest/package/lifecycle conformance passes and two independent systems validate it.
- [ ] Operator completes rehearsal, TAKE, update, stop, recovery, and event replay.
- [ ] Live data flood/stale/disconnect behavior is deterministic and visible.
- [ ] Published CasparCG/OBS/vMix/CEF matrix passes clean-machine qualification.
- [ ] 24 h soak, timing tier, alpha/key-fill, asset/font readiness, and diagnostics budgets pass.

### 15.4 Team/Cloud Qualified

- [ ] Tenant authorization matrix and denial tests pass.
- [ ] Offline/partition/reconnect collaboration converges with local undo isolation.
- [ ] Backup/restore drill meets RPO/RTO.
- [ ] Job retries are idempotent and artifacts integrity-checked.
- [ ] Plugin/MCP mutations require scoped capability, validated proposal, approval, audit, and replay protection.
- [ ] SLO dashboards, alerts, on-call/runbooks, deletion/export, privacy, and security review are complete.

### 15.5 Award Ready

- [ ] Professional benchmark success ≥95% with material improvement from W0 baseline.
- [ ] Time to first animation <5 min and first valid export target is met.
- [ ] VoiceOver/NVDA sessions have zero release blocker.
- [ ] ≥8 commissioned samples and public dogfooded showcase are live.
- [ ] External craft/usability panel score ≥8.5 with no critical concern.
- [ ] Every artifact is signed/versioned/documented and `release:verify` passes from a fresh clone.

### 15.6 Child-plan template

Every initiative child plan starts with:

```markdown
# <Initiative ID>: <Outcome> Implementation Plan

**Goal:** one testable user/system outcome.
**Owner and reviewers:** named DRI plus required domain reviewers.
**Dependencies:** stable initiative/RFC IDs and exact interfaces consumed.
**Produces:** exact public/internal interfaces and consumers.
**Files:** exact create/modify/test/spec/demo paths.
**Budgets:** applicable performance, reliability, fidelity, security, and accessibility rows.

### Task N: independently reviewable unit

- [ ] Add or refine the spec scenario.
- [ ] Write the exact failing unit/property/CT/integration test.
- [ ] Run the narrow command and record the expected failure.
- [ ] Implement the minimum complete production behavior.
- [ ] Run the narrow command and record the expected pass.
- [ ] Run the touched-package strict quality gate.
- [ ] Demonstrate the workflow in demo/CT.
- [ ] Update tracker, gap, support-matrix, and docs evidence.
- [ ] Commit one logical green change.
```

Code-changing steps in the child plan include the actual types/signatures/code required by `superpowers:writing-plans`; phrases such as “handle edge cases” or “add tests” without exact content are plan failures.

### 15.7 Initiative execution loop

1. Select the next dependency-ready initiative; assign DRI/reviewers.
2. Confirm its product release claim and RFC/spec basis.
3. Create/review the child plan with exact files/interfaces/tests/commands.
4. Add the tracker row or move it to **ready**.
5. Execute spec-first, red/green/refactor, in small green commits.
6. Run derived cross-region CT, security review, and active budget gates.
7. Demonstrate the complete user workflow.
8. Update specs, tracker, CT inventory, producer matrix, gap files, support matrix, changelog, and docs in the same landing change.
9. Run `npm run gate:full` and initiative-specific release evidence.
10. Mark **release** only after an independent closure audit.

### 15.8 Planned spec and ADR index

These paths are created only through their owning RFC/initiative. Parent specs remain concise indexes.

| Surface                                      | Owner                     | Purpose                                                             |
| -------------------------------------------- | ------------------------- | ------------------------------------------------------------------- |
| `project/spec/performance/spec.md`           | W0-PERF-01                | Canonical lab/field budgets and measurement protocol                |
| `project/spec/reliability/spec.md`           | W1-PERSIST-01/WS6         | Recovery, durability, fault, and operational SLOs                   |
| `project/spec/platform/support-matrix.md`    | W0-PLAT-01                | Browser/desktop/worker/filesystem/codec/offline support claims      |
| `project/spec/model/timebase.md`             | RFC-06/W1-TIME-01         | Rational rates, ticks/frames/timecode, interval and rounding rules  |
| `project/spec/model/components.md`           | RFC-07/W2-COMP-01         | Masters, instances, overrides, propagation, nesting, unlink         |
| `project/spec/model/color-management.md`     | RFC-09/W1-COLOR-01        | Working/display/output spaces, alpha, profiles, HDR                 |
| `project/spec/model/audio.md`                | RFC-14/W2-AUDIO-01        | Tracks/cues/sample timebase/waveform/offline mux scope              |
| `project/spec/renderer/resolved-scene.md`    | RFC-10/W1-SCENE-01        | Resolution order, provenance, invalidation, immutable snapshot      |
| `project/spec/renderer/text-layout.md`       | W1-TEXT-01                | Shaping, BiDi, breaking, fallback, metrics, semantic mirror         |
| `project/spec/demo/persistence.md`           | RFC-08/W1-PERSIST-01      | Host adapter, journal/snapshot/recovery/multi-tab UX                |
| `project/spec/editor/commands.md`            | W2-CMD-01                 | Command metadata, context, argument, undo, execution contract       |
| `project/spec/editor/state-machine.md`       | W4-STATE-01               | States, transitions, conditions, priority, trace/replay             |
| `project/spec/ui/accessibility.md`           | W2-A11Y-01                | Keyboard/AT/forced-color/zoom/announcement/focus contract           |
| `project/spec/ui/motion.md`                  | W6-CRAFT-01               | Chrome motion, interruption, reduced alternatives, sound preference |
| `project/spec/formats/ograf.md`              | RFC-12/W3-OGRAF-01        | Package, GDD, lifecycle, steps, import/export conformance           |
| `project/spec/player/spec.md`                | W1-PLAYER-01/W3-PLAYER-01 | Runtime API, lifecycle, size tiers, sandbox, determinism            |
| `project/spec/broadcast/operate.md`          | W4-OP-01                  | Rundown, preview/program/TAKE, control and failure UX               |
| `project/spec/services/spec.md`              | W5-SVC-01                 | Capabilities, tenancy, storage/jobs, API and operational behaviors  |
| `project/implementation/decisions/ADR-*.md`  | W0-RFC-01                 | Approved alternatives and architecture consequences                 |
| `project/implementation/reviews/<date>-*.md` | W0-DEF-01/WS6             | Immutable audit, grade rubric, commands, commit and artifacts       |

### 15.9 External standards and product references

These sources inform child plans but never override Broadset specs:

- [WCAG 2.2](https://www.w3.org/TR/WCAG22/) — accessibility requirements.
- [Core Web Vitals threshold methodology](https://web.dev/articles/defining-core-web-vitals-thresholds) and [Lighthouse TTI removal](https://developer.chrome.com/docs/lighthouse/performance/interactive) — performance measurement.
- [WebCodecs](https://www.w3.org/TR/webcodecs/) — timestamp/duration APIs and capability-dependent codec model.
- [File System Standard](https://fs.spec.whatwg.org/), [Storage Standard](https://storage.spec.whatwg.org/), and [Web Locks](https://www.w3.org/TR/web-locks/) — local durability primitives.
- [HarfBuzz shaping](https://harfbuzz.github.io/harfbuzz-hb-shape.html) and [Unicode Bidirectional Algorithm](https://unicode.org/reports/tr9/) — text layout.
- [CSS Color 4](https://www.w3.org/TR/css-color-4/) and [PNG 3](https://www.w3.org/TR/png-3/) — wide-gamut/HDR and color metadata.
- [EBU OGraf](https://ograf.ebu.io/v1/specification/docs/Specification.html) — portable broadcast graphic package/lifecycle.
- [Yjs shared types](https://docs.yjs.dev/getting-started/working-with-shared-types) and [Automerge architecture](https://automerge.org/docs/hello/) — collaboration evaluation inputs.
- Adobe Essential Graphics, Rive data binding/state machines, Figma components/variables/libraries, and Apple Motion behaviors/replicators — professional workflow comparators; features are adopted only when they strengthen Broadset’s product thesis.

---

_Roadmap rule: truth before claims, deterministic foundations before authoring scale, complete workflows before breadth, and evidence before “done.”_
