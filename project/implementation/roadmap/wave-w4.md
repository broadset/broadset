# Wave W4 — Broadcast authoring and local operate mode

W4 completes the differentiated author-to-operator workflow without requiring cloud services. Authors gain state machines, curated operator controls, live data feeds, and aspect variants; operators gain a rundown-driven studio surface with playout-engine integration, clock diagnostics, and soak-proven reliability. Everything in this wave runs locally.

**Wave gate:** Broadcast Qualified for the published engine/integration matrix. An operator can rehearse and run a playlist with live data, recover from failures, and reproduce the event log without entering authoring mode. **External evidence gates:** CasparCG/OBS/vMix clean-machine playout runs with recorded-output review, including licensed vMix manual signoff (owner: maintainer); operator task benchmark and assistive-technology sessions with human operators (owner: maintainer).

## W4-STATE-01 — Visual state-machine authoring (XL)

- **Dependencies:** W2-TIMELINE-01/W2-DATA-01
- **Definition:** Visual state-machine authoring covering states, transitions, conditions, triggers, and state layers, with trace/debug tooling and deterministic transition priority.
- **Acceptance criteria:**
  - [ ] Model and property tests cover states, transitions, conditions, triggers, layers, and deterministic priority ordering
  - [ ] Replaying a captured state trace reproduces the exact resulting state
- **User-visible:** yes — authors build, trigger, and debug graphic state machines directly in the editor.

## W4-RUNDOWN-01 — Rundown, cue, and event-log model (L)

- **Dependencies:** W4-STATE-01
- **Definition:** Playlist/rundown/cue model with validation, rehearsal support, skip/hold/take-back policy, and an immutable event log.
- **Acceptance criteria:**
  - [ ] Restart after interruption restores the identical active item and state
  - [ ] Replaying the immutable event log reproduces the identical active item and state

## W4-OP-01 — Studio operate mode UI (XL)

- **Dependencies:** W4-RUNDOWN-01/W2-A11Y-01
- **Definition:** Studio UI with preview/program, TAKE, hotkeys, touch/tablet layout, confidence/status indicators, and role-separated destructive controls.
- **Acceptance criteria:**
  - [ ] Keyboard-only, touch, and assistive-technology flows for rehearse, TAKE, and failure recovery pass CT with visible focus (meets QG-A11Y-01)
  - [ ] Role separation blocks destructive controls for unauthorized roles in CT
  - [ ] Operator task benchmark and AT session results from the external evidence gates are linked as release evidence
- **User-visible:** yes — operators run shows from a dedicated preview/program surface with TAKE, hotkeys, and status indicators.

## W4-CONTROL-01 — Exposed-property builder and operator controls (XL)

- **Dependencies:** W2-COMP-01/W3-OGRAF-01
- **Definition:** Author-curated exposed-property builder and generated operator controls with validation, grouping, permissions, and presets.
- **Acceptance criteria:**
  - [ ] Author-defined exposed properties export to OGraf and regenerate equivalent operator controls, proving the author→OGraf→operator contract round trip
  - [ ] Round-trip contract tests preserve validation, grouping, permission, and preset metadata without loss
- **User-visible:** yes — authors curate operator control panels; operators use the generated, validated controls.

## W4-DATA-01 — Live data connectors and runtime (XL)

- **Dependencies:** W2-DATA-01/W4-CONTROL-01
- **Definition:** Live data connectors and transforms with a credentials boundary, rate tiers, backpressure, frame-coalescing, and stale/fallback/test modes.
- **Acceptance criteria:**
  - [ ] A 10 Hz live feed drives rendering at a stable 60 fps through frame-coalescing
  - [ ] Network partition and reconnect tests pass with stale/fallback behavior engaged
  - [ ] Flood tests confirm live inputs are rate-limited, size-capped, and validated before use (meets QG-SEC-01)
- **User-visible:** yes — authors bind live feeds and see stale, fallback, and test-mode states in the UI.

## W4-VARIANT-01 — Responsive aspect variants and constraints (XL)

- **Dependencies:** W2-VAR-01/W2-CANVAS-01
- **Definition:** Responsive/aspect variants with constraints, safe areas, content-fit policy, and a variant preview matrix.
- **Acceptance criteria:**
  - [ ] Variant corpus covers 16:9, 9:16, 1:1, and ultrawide aspect ratios
  - [ ] Overflow preflight flags content that violates safe areas or the content-fit policy
- **User-visible:** yes — authors preview every aspect variant side by side and get overflow warnings before playout.

## W4-PLAYOUT-01 — Playout engine integration matrix (XXL)

- **Dependencies:** W3-PLAYER-01/W4-OP-01
- **Definition:** CasparCG/OBS/vMix and OGraf integration matrix covering key/fill alpha, font/asset readiness, lifecycle behavior, and a pinned engine policy.
- **Acceptance criteria:**
  - [ ] Clean-machine integration scripts run every published engine matrix row (meets QG-INT-01)
  - [ ] Recorded playout output for every advertised engine row is linked from the external evidence gate (meets QG-BCAST-01)

## W4-CLOCK-01 — Playout clock tiers and drift handling (L)

- **Dependencies:** W1-TIME-01/W4-PLAYOUT-01
- **Definition:** Software-timed versus externally synchronized playout tiers with clock diagnostics and defined drift/failover behavior.
- **Acceptance criteria:**
  - [ ] Published claims separate software-timed from externally synchronized tiers with no false genlock claim (meets QG-BCAST-01)
  - [ ] Drift-injection tests exercise failover behavior deterministically
  - [ ] Degraded-state UI surfaces clock diagnostics when drift or failover occurs
- **User-visible:** yes — operators see clock status, drift diagnostics, and degraded-state warnings during playout.

## W4-SOAK-01 — 24-hour production soak harness (L)

- **Dependencies:** W4-CLOCK-01/W4-DATA-01/W4-VARIANT-01
- **Definition:** 24 h playlist, live-data, asset, and video soak with fault injection, heap/DOM/GPU tracking, and a diagnostics bundle.
- **Acceptance criteria:**
  - [ ] 24 h soak completes with zero fatal or data-loss errors
  - [ ] Heap, DOM, and GPU budgets stay green across the full soak
  - [ ] Diagnostics bundle reproduces injected faults, keeping reproducibility green
