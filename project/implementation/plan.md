# Broadset World-Class Master Roadmap

> **For agentic workers:** this file is the portfolio roadmap and governing execution contract. Before implementing an initiative, create a child plan under `project/implementation/plans/<initiative-id>.md` with `superpowers:writing-plans`, then execute it task-by-task with `superpowers:subagent-driven-development` or `superpowers:executing-plans`. A child plan is required to contain exact files, interfaces, failing-first tests, commands, expected results, and review checkpoints. This master roadmap never substitutes for that task-level plan.

- **Date:** 2026-07-09
- **Status:** Active after maintainer approval of the W0 roadmap corrections and RFC register.
- **Goal:** Build the most trustworthy, responsive, expressive, accessible, and interoperable professional web-native motion-graphics and broadcast-graphics authoring system in its category.
- **Architecture:** Broadset resolves validated project data into one deterministic semantic scene, applies shared time/text/color/geometry kernels, and drives interactive, offline-render, player, broadcast, and format-export targets from that common truth. Local-first durability is foundational; cloud collaboration and services are optional adapters over the same commands, change model, and content-addressed assets.
- **Tech stack:** Node.js 24+, TypeScript 6, React 19, Zustand/Zundo, Zod, HeroUI, Vitest, Playwright CT, Vite, the existing format libraries in `architecture.md`, browser workers, IndexedDB/OPFS where supported, and service-side rendering only after the service ADR gate.
- **Product strategy:** quality-gated vertical slices, with broadcast authoring and EBU OGraf as the protected flagship. Broadset does not attempt to win by accumulating disconnected controls; each release completes a real author-to-operator workflow.

## Contents

[Global constraints](#global-constraints) · [1. Product contract](#1-product-contract-and-release-claims) · [2. Governance and execution rules](#2-governance-evidence-and-plan-structure) · [3. Current state](#3-current-state-and-complete-repair-floor) · [4. Quality gates](#4-quality-gates) · [5. Architecture guardrails](#5-architecture-guardrails) · [6. RFC register](#6-rfc-register--w0-maintainer-decisions) · [7. Waves and initiative registry](#7-roadmap-waves-and-stable-initiative-registry) · [8. Maintenance checklist](#8-maintenance-checklist)

This index is the canonical roadmap. Wave definitions live in [roadmap/](./roadmap/); execution policy lives in
[operating-loop.md](./operating-loop.md); lifecycle state lives in [program-state.json](./program-state.json); human
steering lives in [directives.md](./directives.md). `npm run roadmap:check` keeps all of them consistent.

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
- Every initiative has a stable ID, one owning workstream, explicit dependencies, spec links, measurable evidence, and an accountable human owner before implementation begins: the maintainer is the default DRI under the autonomous loop, and each child plan records its executing agent and independent reviewer ([operating-loop.md](./operating-loop.md)).
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

- **`plan.md`** — this index: strategy, quality gates, execution rules, and the stable initiative registry.
- **[roadmap/wave-w0.md](./roadmap/wave-w0.md) … [wave-w6.md](./roadmap/wave-w6.md)** — initiative definitions and acceptance criteria per wave.
- **[roadmap/impl-w0.md](./roadmap/impl-w0.md) … [impl-w6.md](./roadmap/impl-w6.md)** — implementation task stacks and PR-slice tables; later waves are drafts by construction.
- **`plans/<initiative-id>.md`** — just-in-time child plans; the execution unit of record (see §2.3).
- **[program-state.json](./program-state.json)** — the ONLY lifecycle-status authority, generated by `npm run roadmap:seed-state` and updated via PRs.
- **[operating-loop.md](./operating-loop.md)** — the autonomous operating loop, self-merge protocol, and model routing.
- **[directives.md](./directives.md)** — append-only human steering channel; agents read it first every iteration.
- **[roadmap/current-state.md](./roadmap/current-state.md)** — findings ledger, verification queue, and legacy crosswalk.
- **[roadmap/rfc-register.md](./roadmap/rfc-register.md)** — RFC-01…14 contract decisions; an open row blocks its dependents.
- **[roadmap/program.md](./roadmap/program.md)** — extended quality/architecture/ownership/risk program (moved from this file).
- **[plan-progress.md](./plan-progress.md)** — historical legacy-tier evidence board (no lifecycle authority).
- **[decisions.md](./decisions.md)**, `decisions/ADR-*.md` once ratified — ratified decisions; proposed ADRs carry no authority over `project/spec/**`.
- **`reviews/<date>-*.md`** — immutable audit evidence.

Behavioral disagreement is resolved by the spec. Lifecycle disagreement is resolved by program-state.json. Sequencing disagreement is resolved by this index and the dependency graph. No deleted historical plan is the only home of a live requirement.

### 2.2 Stable IDs and lifecycle statuses

IDs use `W<wave>-<domain>-<number>` and are permanent after publication. Statuses (owned by program-state.json):

- **discovery** — registered; definition exists, no approved child plan.
- **approved** — child plan authored per §2.3; cleared for implementation.
- **implementing** — slices in flight (requires a pr/evidence link).
- **measuring** — merged; acceptance-criteria measurement or external evidence pending.
- **shipped** — every acceptance criterion evidenced.
- **stopped / superseded** — abandoned with rationale, or replaced by a named successor.

### 2.3 Required initiative record

Before an initiative becomes **approved**, its child plan (and its program-state entry once work starts) must contain:

- stable ID, outcome, owning workstream, accountable owner (maintainer by default), executing agent, and reviewers;
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

### 2.5 Execution rules

- **Dependency gating, not phase gating:** an initiative may start when every dependency is shipped (RFC dependencies: ratified). Waves are planning and reporting groupings; the active phase is the lowest wave with unshipped work.
- **Advance slot:** at most one initiative from the next wave may run concurrently when the active wave's ready set underfills the WIP cap.
- **WIP cap 3** with **disjoint write scopes** — overlapping `Files:` scopes serialize.
- **Continuous value:** every wave ships at least one user-visible improvement (audited).
- **Re-planning gates:** each phase exit re-audits the next wave file against the codebase, re-slices its impl plan, and re-estimates sizes; later wave/impl files are drafts by construction.
- **Evidence ladder:** directional evidence gates iteration; expert evidence gates phase exits; full evidence gates the release claim. External evidence gates are owner-assigned (maintainer) and never agent checkboxes.
- Slices, not initiatives, are the PR unit; the full protocol lives in [operating-loop.md](./operating-loop.md).

## 3. Current state and complete repair floor

Moved to [roadmap/current-state.md](./roadmap/current-state.md): the evidence-qualified verdict, the confirmed findings ledger (F-/U-/X-/B-IDs), the W0 verification queue, and the legacy open-gap routing crosswalk.

## 4. Quality gates

Stable gate IDs with concrete numbers; the full quality, reliability, accessibility, security, and verification program (methods, cadences, and the remaining budget tables) lives in [roadmap/program.md](./roadmap/program.md). Acceptance criteria cite gates by ID; `npm run roadmap:check` verifies every citation resolves.

| Gate        | Metric                                   | Target                                                                                                             | Ceiling                                 | Verified by                                  |
| ----------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------- | -------------------------------------------- |
| QG-COR-01   | Geometry error                           | ≤0.5 px or ≤0.25 external-format unit (stricter wins)                                                              | same                                    | exact structural assertions per format suite |
| QG-COR-02   | SDR color difference                     | ΔE00 ≤1.0                                                                                                          | ΔE00 ≤2.0                               | declared profile/illuminant oracles          |
| QG-COR-03   | Text content/run identity                | exact                                                                                                              | exact                                   | round-trip suites                            |
| QG-INT-01   | Advertised producer/tool rows            | 100% pass                                                                                                          | 100% (unsupported rows leave the claim) | producer matrix                              |
| QG-INT-02   | Import silent drops                      | zero (map, preserve, or warn)                                                                                      | zero                                    | importer suites + corpus                     |
| QG-PERF-01  | Cold shell LCP                           | <1.8 s                                                                                                             | 2.5 s                                   | per PR, fixed Lighthouse runner              |
| QG-PERF-02  | broadset-document-interactive            | <2.5 s                                                                                                             | 3.5 s                                   | per PR, custom User Timing                   |
| QG-PERF-03  | Eager critical JS, gzip                  | <300 kB                                                                                                            | 450 kB                                  | per PR                                       |
| QG-PERF-04  | Optional player core, gzip               | <100 kB                                                                                                            | 150 kB                                  | per PR after W1-PLAYER-01                    |
| QG-PERF-05  | Discrete command input-to-paint p95      | <50 ms                                                                                                             | 100 ms                                  | per PR                                       |
| QG-PERF-06  | Drag/scrub frame p95, 500 elements       | <16.7 ms                                                                                                           | 33 ms                                   | per PR                                       |
| QG-PERF-07  | Undo/redo, 500 elements                  | <50 ms                                                                                                             | 100 ms                                  | per PR                                       |
| QG-PERF-08  | 60 s 1080p offline export ratio          | ≤0.25 wall/media                                                                                                   | ≤1.0                                    | nightly by codec                             |
| QG-REL-01   | Offline render determinism               | stable frame hashes                                                                                                | stable                                  | deterministic export suites                  |
| QG-REL-02   | Autosave recovery point / crash recovery | ≤5 s / ≤30 s at 100 MB                                                                                             | same                                    | recovery drills                              |
| QG-REL-03   | 24 h playout                             | zero fatal errors, <1 frame/h drift                                                                                | heap <1 GB, drops <0.1%                 | release/monthly soak                         |
| QG-A11Y-01  | Keyboard operability                     | complete with visible focus for every shipped editor scenario                                                      | complete                                | CT + manual audit                            |
| QG-A11Y-02  | Assistive matrix                         | 200%/400% zoom, forced colors, reduced motion/transparency, keyboard layouts, IME, RTL, pseudo-localization tested | tested                                  | release audit                                |
| QG-SEC-01   | Hostile input handling                   | every external input size-capped, parsed, validated; zero unwaived critical/high findings                          | zero                                    | security suites + audits                     |
| QG-BCAST-01 | Broadcast playout                        | playout determinism and OGraf conformance for advertised claims                                                    | conformant                              | conformance + soak evidence                  |

## 5. Architecture guardrails

The package graph, boundary matrix, and dependency baseline live in [architecture.md](./architecture.md) and are non-negotiable (AGENTS.md → "Package boundary rules"). The target architecture (deterministic resolved scene, shared time/text/color/geometry kernels, worker topology, local-first durability) is described in [roadmap/program.md](./roadmap/program.md) → "Architecture north star". Behavioral contracts change only through ratified RFCs (§6).

## 6. RFC register — W0 maintainer decisions

Moved to [roadmap/rfc-register.md](./roadmap/rfc-register.md): the fourteen contract decisions (RFC-01…RFC-14), their defaults while undecided, and their ratification status. The frontier treats an initiative depending on an open RFC as blocked.

## 7. Roadmap waves and stable initiative registry

| Wave | Theme                                          | Definitions                        | Implementation plan                |
| ---- | ---------------------------------------------- | ---------------------------------- | ---------------------------------- |
| W0   | Truth, decisions, trust, and design foundation | [wave-w0.md](./roadmap/wave-w0.md) | [impl-w0.md](./roadmap/impl-w0.md) |
| W1   | Deterministic, recoverable, worker-safe engine | [wave-w1.md](./roadmap/wave-w1.md) | [impl-w1.md](./roadmap/impl-w1.md) |
| W2   | Professional authoring core                    | [wave-w2.md](./roadmap/wave-w2.md) | [impl-w2.md](./roadmap/impl-w2.md) |
| W3   | Interoperability and delivery excellence       | [wave-w3.md](./roadmap/wave-w3.md) | [impl-w3.md](./roadmap/impl-w3.md) |
| W4   | Broadcast authoring and local operate mode     | [wave-w4.md](./roadmap/wave-w4.md) | [impl-w4.md](./roadmap/impl-w4.md) |
| W5   | Secure cloud, collaboration, and ecosystem     | [wave-w5.md](./roadmap/wave-w5.md) | [impl-w5.md](./roadmap/impl-w5.md) |
| W6   | Craft, hardening, scale, and award readiness   | [wave-w6.md](./roadmap/wave-w6.md) | [impl-w6.md](./roadmap/impl-w6.md) |

The registry below is the machine-validated source for IDs, sizes, and dependencies. Definitions and acceptance criteria live in the wave files; both must agree exactly (`npm run roadmap:check`).

<!-- BEGIN MANAGED: INITIATIVE REGISTRY -->

| ID             | Wave | Size | Title                                               | Dependencies                                                                             |
| -------------- | ---- | ---- | --------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| W0-GOV-01      | W0   | L    | Spec scenario ID traceability                       | none                                                                                     |
| W0-GOV-02      | W0   | M    | Generated architecture dependency baseline          | none                                                                                     |
| W0-DEF-01      | W0   | L    | Findings and defect ledger re-audit                 | W0-GOV-01                                                                                |
| W0-RFC-01      | W0   | XXL  | Contract RFC decisions and ADRs                     | W0-DEF-01                                                                                |
| W0-UX-01       | W0   | XL   | Professional workflow research and design direction | none                                                                                     |
| W0-PLAT-01     | W0   | L    | Host topology and package strategy                  | W0-RFC-01                                                                                |
| W0-PERF-01     | W0   | XL   | Performance spec and gate infrastructure            | W0-PLAT-01                                                                               |
| W0-QE-01       | W0   | L    | Test infrastructure and flake telemetry             | W0-GOV-01                                                                                |
| W0-SEC-01      | W0   | L    | Sanitizer, fetch, and parser policies               | RFC-10                                                                                   |
| W0-SEC-02      | W0   | M    | Atomic trust boundary batch validation              | W0-SEC-01                                                                                |
| W0-COLLAB-01   | W0   | L    | Document change semantics completion                | RFC-11                                                                                   |
| W0-COLLAB-02   | W0   | M    | Project-level diff and apply                        | W0-COLLAB-01                                                                             |
| W0-TIME-01     | W0   | M    | Duration and sampling semantics ratification        | RFC-06                                                                                   |
| W0-IO-01       | W0   | M    | PPTX group structure and z-order                    | W0-RFC-01                                                                                |
| W0-IO-02       | W0   | S    | Radial gradient center parsing                      | W0-SEC-01                                                                                |
| W0-IO-03       | W0   | S    | PDF page box coordinates                            | W0-SEC-01                                                                                |
| W0-IO-04       | W0   | M    | PPTX placeholder geometry inheritance               | W0-IO-01                                                                                 |
| W0-IO-05       | W0   | M    | SVG style cascade resolution                        | W0-SEC-01                                                                                |
| W0-IO-06       | W0   | M    | PDF CID text decoding                               | W0-SEC-01                                                                                |
| W0-IO-07       | W0   | S    | Multi-page PDF association                          | W0-IO-03                                                                                 |
| W0-IO-08       | W0   | S    | PPTX gradient angle conversion                      | W0-IO-01                                                                                 |
| W0-IO-09       | W0   | M    | PPTX theme style matrix references                  | W0-IO-04                                                                                 |
| W0-IO-10       | W0   | S    | PSD byte offset handling                            | W0-SEC-01                                                                                |
| W0-IO-11       | W0   | S    | SVG stop opacity support                            | W0-IO-02                                                                                 |
| W0-MODEL-01    | W0   | M    | Linear SVG path tokenizer                           | W0-SEC-01                                                                                |
| W0-MODEL-02    | W0   | S    | Total gradient safe parsing                         | W0-SEC-01                                                                                |
| W0-RECOVER-01  | W0   | L    | Corrupt save quarantine and recovery                | W0-SEC-01                                                                                |
| W1-TIME-01     | W1   | L    | Ratified timebase and exact export sampling         | W0-TIME-01                                                                               |
| W1-TIME-02     | W1   | M    | Keyframe addressing and compiled tracks             | RFC-02/RFC-03                                                                            |
| W1-SCENE-01    | W1   | XL   | Resolved scene snapshot kernel                      | RFC-01/RFC-07/RFC-10                                                                     |
| W1-TEXT-01     | W1   | XL   | Shared HarfBuzz Unicode text layout                 | W0-PLAT-01/RFC-10                                                                        |
| W1-COLOR-01    | W1   | L    | Working-space color pipeline                        | RFC-09/RFC-10                                                                            |
| W1-SEC-01      | W1   | L    | Shared safe-markup sanitizer policy                 | RFC-10/W0-SEC-01                                                                         |
| W1-ASSET-01    | W1   | L    | Content-addressed asset store                       | RFC-08/W0-PLAT-01                                                                        |
| W1-PERSIST-01  | W1   | XL   | Crash-safe local persistence runtime                | RFC-08/W1-ASSET-01                                                                       |
| W1-WORKER-01   | W1   | XL   | Worker import and RPC contract                      | W0-PLAT-01/W1-SEC-01                                                                     |
| W1-PLAYBACK-01 | W1   | L    | Unified playback clock interface                    | W1-TIME-01/W1-SCENE-01                                                                   |
| W1-RENDER-01   | W1   | L    | Incremental RenderPlan rendering                    | W1-SCENE-01/W1-PLAYBACK-01                                                               |
| W1-RENDER-02   | W1   | L    | Pattern fills and semantic mirror                   | W1-COLOR-01/W1-ASSET-01                                                                  |
| W1-PLAYER-01   | W1   | L    | Tree-shakeable player skeleton                      | W1-PLAYBACK-01/W1-RENDER-01/RFC-12                                                       |
| W1-HISTORY-01  | W1   | M    | Named versions and recovery history                 | W1-PERSIST-01                                                                            |
| W2-CMD-01      | W2   | L    | Central typed command registry                      | W1-HISTORY-01                                                                            |
| W2-CANVAS-01   | W2   | XL   | Canvas selection and transform mechanics            | W1-SCENE-01/W2-CMD-01                                                                    |
| W2-PATH-01     | W2   | XL   | Pen, path, and mask authoring                       | W2-CANVAS-01/W1-RENDER-02                                                                |
| W2-TIMELINE-01 | W2   | XL   | Virtualized professional timeline                   | W1-TIME-02/W2-CMD-01                                                                     |
| W2-GRAPH-01    | W2   | L    | Graph editor and motion paths                       | W2-TIMELINE-01                                                                           |
| W2-COMP-01     | W2   | XL   | Component creation and propagation                  | W1-SCENE-01/W2-CMD-01                                                                    |
| W2-VAR-01      | W2   | L    | Typed document variables and tokens                 | W1-COLOR-01/W2-COMP-01                                                                   |
| W2-DATA-01     | W2   | XL   | Data schema and binding authoring                   | W2-VAR-01/RFC-05                                                                         |
| W2-TEXT-01     | W2   | XL   | Structured rich text editing                        | W1-TEXT-01/W2-CANVAS-01                                                                  |
| W2-AUDIO-01    | W2   | XL   | Audio tracks, waveforms, and scrubbing              | RFC-14/W1-TIME-01/W1-ASSET-01                                                            |
| W2-STYLE-01    | W2   | XL   | Style, fill, and effect controls                    | W1-COLOR-01/W1-RENDER-02                                                                 |
| W2-DOC-01      | W2   | L    | Document setup and preflight                        | W2-STYLE-01/W1-ASSET-01                                                                  |
| W2-ASSET-01    | W2   | L    | Virtualized asset library                           | W1-ASSET-01/W1-PERSIST-01                                                                |
| W2-A11Y-01     | W2   | XXL  | Editor accessibility completeness                   | W2-PATH-01/W2-GRAPH-01/W2-DATA-01/W2-TEXT-01/W2-AUDIO-01/W2-DOC-01/W2-ASSET-01/W2-UX-01  |
| W2-UX-01       | W2   | XL   | Command palette and workflow polish                 | W0-UX-01/W2-CMD-01                                                                       |
| W2-QE-01       | W2   | L    | Authoring coverage and quality gates                | W2-A11Y-01                                                                               |
| W3-CORPUS-01   | W3   | L    | Interop fixture corpus manifest                     | W0-GOV-01                                                                                |
| W3-RECON-01    | W3   | XL   | Import report and reconciliation actions            | W2-CANVAS-01/W3-CORPUS-01                                                                |
| W3-PSD-01      | W3   | XL   | Third-party PSD completeness                        | W1-COLOR-01/W3-CORPUS-01                                                                 |
| W3-PDF-01      | W3   | XL   | Rich PDF import fidelity                            | W1-TEXT-01/W1-WORKER-01/W3-CORPUS-01                                                     |
| W3-PDF-02      | W3   | L    | PDF and PDF-A output conformance                    | W1-COLOR-01/W3-CORPUS-01                                                                 |
| W3-SVG-01      | W3   | L    | Full SVG fidelity and reuse policy                  | W1-SEC-01/W1-WORKER-01/W3-CORPUS-01                                                      |
| W3-PPTX-01     | W3   | XL   | PPTX inheritance and theme fidelity                 | W1-TEXT-01/W3-CORPUS-01                                                                  |
| W3-MOTION-01   | W3   | XL   | Reusable motion sequences and behaviors             | W2-TIMELINE-01/W2-AUDIO-01/RFC-04                                                        |
| W3-MOTION-02   | W3   | XL   | Typed expression authoring                          | RFC-05/W2-DATA-01/W3-MOTION-01                                                           |
| W3-VIDEO-01    | W3   | XL   | Deterministic video and sequence export             | W1-TIME-01/W1-PLAYER-01/W2-AUDIO-01                                                      |
| W3-LOTTIE-01   | W3   | XL   | Lottie import and export                            | W1-SCENE-01/W3-CORPUS-01                                                                 |
| W3-FIGMA-01    | W3   | XL   | Figma import and update reconciliation              | W2-COMP-01/W2-VAR-01/W3-RECON-01                                                         |
| W3-OGRAF-01    | W3   | XL   | OGraf package interchange                           | W1-PLAYER-01/W2-DATA-01/RFC-12                                                           |
| W3-PLAYER-01   | W3   | XL   | Versioned player runtime                            | W3-OGRAF-01/W3-VIDEO-01                                                                  |
| W3-QE-01       | W3   | XXL  | Two-tier visual CI and producer matrix              | W3-PSD-01/W3-PDF-01/W3-PDF-02/W3-SVG-01/W3-PPTX-01/W3-LOTTIE-01/W3-FIGMA-01/W3-PLAYER-01 |
| W4-STATE-01    | W4   | XL   | Visual state-machine authoring                      | W2-TIMELINE-01/W2-DATA-01                                                                |
| W4-RUNDOWN-01  | W4   | L    | Rundown, cue, and event-log model                   | W4-STATE-01                                                                              |
| W4-OP-01       | W4   | XL   | Studio operate mode UI                              | W4-RUNDOWN-01/W2-A11Y-01                                                                 |
| W4-CONTROL-01  | W4   | XL   | Exposed-property builder and operator controls      | W2-COMP-01/W3-OGRAF-01                                                                   |
| W4-DATA-01     | W4   | XL   | Live data connectors and runtime                    | W2-DATA-01/W4-CONTROL-01                                                                 |
| W4-VARIANT-01  | W4   | XL   | Responsive aspect variants and constraints          | W2-VAR-01/W2-CANVAS-01                                                                   |
| W4-PLAYOUT-01  | W4   | XXL  | Playout engine integration matrix                   | W3-PLAYER-01/W4-OP-01                                                                    |
| W4-CLOCK-01    | W4   | L    | Playout clock tiers and drift handling              | W1-TIME-01/W4-PLAYOUT-01                                                                 |
| W4-SOAK-01     | W4   | L    | 24-hour production soak harness                     | W4-CLOCK-01/W4-DATA-01/W4-VARIANT-01                                                     |
| W5-SVC-01      | W5   | XXL  | Cloud service identity and authorization platform   | W0-PLAT-01/RFC-11                                                                        |
| W5-STORE-01    | W5   | XL   | Encrypted cloud storage and sync                    | W1-PERSIST-01/W5-SVC-01                                                                  |
| W5-COLLAB-01   | W5   | XXL  | Collaboration convergence and presence              | W0-COLLAB-01/W5-STORE-01                                                                 |
| W5-REVIEW-01   | W5   | XL   | Branching review and audit workflow                 | W5-COLLAB-01                                                                             |
| W5-JOBS-01     | W5   | XL   | Idempotent render job service                       | W3-PLAYER-01/W5-SVC-01                                                                   |
| W5-LIB-01      | W5   | XL   | Versioned team libraries                            | W2-COMP-01/W5-REVIEW-01                                                                  |
| W5-PLUGIN-01   | W5   | XL   | Sandboxed plugin SDK                                | W2-CMD-01/W5-SVC-01                                                                      |
| W5-MCP-01      | W5   | L    | Scoped MCP access modes                             | W5-PLUGIN-01/W5-SVC-01                                                                   |
| W5-BCAST-01    | W5   | XL   | Broadcast automation control API                    | W4-PLAYOUT-01/W5-SVC-01                                                                  |
| W5-OBS-01      | W5   | L    | Observability and consented telemetry               | W5-SVC-01                                                                                |
| W6-CRAFT-01    | W6   | L    | Signature visual and motion language                | W0-UX-01/W4-SOAK-01/W5-JOBS-01/W5-LIB-01/W5-MCP-01/W5-BCAST-01/W5-OBS-01                 |
| W6-UX-01       | W6   | XL   | Workspace customization and productivity surfaces   | W2-CMD-01                                                                                |
| W6-ONBOARD-01  | W6   | L    | Onboarding and first-run activation                 | W2-QE-01/W3-RECON-01/W3-MOTION-02/W3-PLAYER-01/W3-QE-01                                  |
| W6-I18N-01     | W6   | XL   | Internationalization and localization readiness     | W2-TEXT-01                                                                               |
| W6-QE-01       | W6   | XL   | Deep verification and hardening program             | W3-MOTION-02/W3-QE-01/W4-SOAK-01/W5-JOBS-01/W5-LIB-01/W5-MCP-01/W5-BCAST-01/W5-OBS-01    |
| W6-ARCH-01     | W6   | XL   | Architecture consolidation and cleanup              | W0-PLAT-01/W5-JOBS-01/W5-LIB-01/W5-MCP-01/W5-BCAST-01/W5-OBS-01                          |
| W6-GPU-01      | W6   | M    | Renderer technology benchmark ADR                   | W1-RENDER-01                                                                             |
| W6-REL-01      | W6   | XL   | Release engineering and documentation               | W6-RESEARCH-01/W6-QE-01/W6-ARCH-01/W6-GPU-01/W6-SHOW-01                                  |
| W6-SHOW-01     | W6   | L    | Public showcase and playground                      | W3-PLAYER-01/W6-CRAFT-01/W6-ONBOARD-01                                                   |
| W6-RESEARCH-01 | W6   | M    | External research and award validation              | W6-CRAFT-01/W6-UX-01/W6-ONBOARD-01/W6-I18N-01                                            |

<!-- END MANAGED: INITIATIVE REGISTRY -->

## 8. Maintenance checklist

- Registry edits happen together with the wave file and `npm run roadmap:seed-state`; `npm run roadmap:check` must stay green (pre-commit, pre-push, CI).
- Keep this file ≤4000 words and wave files ≤3500 words (audited); move prose to roadmap/program.md, never delete requirements.
- Keep §-numbering of this index stable — external documents cite §1.3, §2.2, §2.3, §7.
- Every directive in directives.md gets an appended resolution; entries are never edited or deleted.
- Phase exits run the re-planning gate (§2.5) before work enters the next wave.
- New quality gates get new QG-IDs here; never renumber or weaken existing gates (AGENTS.md → "No cutting corners").

---

_Roadmap rule: truth before claims, deterministic foundations before authoring scale, complete workflows before breadth, and evidence before "done."_
