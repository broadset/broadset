# Extended program: quality bars, architecture north star, ownership, and risk

(moved from plan.md §4, §5, §8, §9, §10, §11, §13, and §14 on 2026-07-10 — behavior-neutral relocation)

## Definition of world class

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

## Architecture north star

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

## Workstream ownership and arbitration

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

## Professional authoring and UX blueprint

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

## Performance, reliability, and security engineering program

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

## Verification strategy

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

## Professional research, craft, and award program

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

## Risk register

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

## Planned spec and ADR index

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

## External standards and product references

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
