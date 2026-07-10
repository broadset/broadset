# Wave W6 — Craft, hardening, scale, and award readiness

W6 refines an already complete product into an exceptional one and establishes a sustainable release system. Quality, research, and craft practices run continuously throughout the program, but their release qualification occurs only after their dependencies ship. Human-bound validation is tracked through the wave-level external evidence gates below, never as agent checkboxes.

**Wave gate:** Award Ready. Craft is distinctive, benchmarked workflows are fast and learnable, release evidence is reproducible, and the showcase is itself a production Broadset artifact. **External evidence gates:** standing professional cohort studies and external panel review with score ≥8.5; moderated assistive-technology sessions; external design critique and award-rubric audit; commissioned showcase samples (owner: maintainer).

## W6-CRAFT-01 — Signature visual and motion language (L)

- **Dependencies:** W0-UX-01/W4-SOAK-01/W5-JOBS-01/W5-LIB-01/W5-MCP-01/W5-BCAST-01/W5-OBS-01
- **Definition:** Signature visual and motion language across editor chrome: interruptible chrome motion, reduced-motion alternatives, and an optional sound/haptics preference.
- **Acceptance criteria:**
  - [ ] Signature visual/motion language passes design review with a recorded approval
  - [ ] Chrome motion is interruptible and reduced-motion alternatives are verified by CT
  - [ ] Motion and theming stay within performance budgets; cold shell load meets QG-PERF-01
  - [ ] Sound and haptics ship off by default behind an accessible preference
- **User-visible:** yes — authors experience the signature motion and visual language across all editor chrome, with reduced-motion and sound preferences.

## W6-UX-01 — Workspace customization and productivity surfaces (XL)

- **Dependencies:** W2-CMD-01
- **Definition:** Saved workspaces, panel and layout customization, a multi-document switcher, command history and macros, and contextual learning, built on the central command registry.
- **Acceptance criteria:**
  - [ ] Professional benchmark tasks improve versus the recorded W0-UX-01 baseline
  - [ ] Workspaces, panel layouts, and preferences recover exactly after reload and crash restart
  - [ ] Every new surface is fully keyboard operable with visible focus, meeting QG-A11Y-01
- **User-visible:** yes — authors save and switch workspaces, customize panels, switch documents, and replay command macros.

## W6-ONBOARD-01 — Onboarding and first-run activation (L)

- **Dependencies:** W2-QE-01/W3-RECON-01/W3-MOTION-02/W3-PLAYER-01/W3-QE-01
- **Definition:** Commissioned sample documents, action-gated first-run learning, teaching empty states, progressive disclosure, and an instrumented activation funnel.
- **Acceptance criteria:**
  - [ ] Time-to-first-animation meets the recorded activation target for new users
  - [ ] Time-to-first-valid-export meets the recorded activation target
  - [ ] Activation funnel instrumentation reports both metrics deterministically in CT-driven flows
- **User-visible:** yes — new users get commissioned samples, teaching empty states, and action-gated first-run learning.

## W6-I18N-01 — Internationalization and localization readiness (XL)

- **Dependencies:** W2-TEXT-01
- **Definition:** Full message catalog, locale-aware formatting, RTL layout, pseudo-locale testing, IME support, and copy-expansion tolerance across the shipped UI.
- **Acceptance criteria:**
  - [ ] Zero clipped strings under pseudo-locale copy expansion across the shipped UI
  - [ ] Locale/keyboard matrix passes, including RTL layout and IME entry flows
  - [ ] Localized flows remain fully keyboard operable with visible focus, meeting QG-A11Y-01
- **User-visible:** yes — the UI renders correctly in every supported locale, including RTL layout and IME text entry.

## W6-QE-01 — Deep verification and hardening program (XL)

- **Dependencies:** W3-MOTION-02/W3-QE-01/W4-SOAK-01/W5-JOBS-01/W5-LIB-01/W5-MCP-01/W5-BCAST-01/W5-OBS-01
- **Definition:** Coverage-guided fuzzing, mutation spot checks, fault injection, a browser support matrix, and formal or model checks for critical state machines.
- **Acceptance criteria:**
  - [ ] Nightly fuzzing, mutation, fault-injection, and browser-matrix lanes are green
  - [ ] ≥80% mutants killed on security/validation kernels
  - [ ] Fuzzing surfaces zero unwaived critical or high findings, meeting QG-SEC-01
  - [ ] Formal/model checks pass for every designated critical state machine

## W6-ARCH-01 — Architecture consolidation and cleanup (XL)

- **Dependencies:** W0-PLAT-01/W5-JOBS-01/W5-LIB-01/W5-MCP-01/W5-BCAST-01/W5-OBS-01
- **Definition:** Responsibility-driven file and package split performed after contracts stabilize, stable public facades, and dead-code and dependency cleanup.
- **Acceptance criteria:**
  - [ ] ≤5 files exceed 500 non-empty lines, each with a recorded justification
  - [ ] No package-boundary regression; the dependency graph matches architecture.md
  - [ ] Dead-code and unused-dependency checks pass across all packages

## W6-GPU-01 — Renderer technology benchmark ADR (M)

- **Dependencies:** W1-RENDER-01
- **Definition:** Benchmark DOM versus Canvas, WebGL, and WebGPU rendering at 500, 1000, and 2000 elements, comparing quality and accessibility, and ratify the resulting ADR.
- **Acceptance criteria:**
  - [ ] Benchmark results recorded at 500, 1000, and 2000 elements for each rendering candidate
  - [ ] ADR ratified; adoption proceeds only if frame budgets measurably improve
  - [ ] Any adopted renderer shows no text, accessibility, or fidelity regression, meeting QG-COR-02 and QG-A11Y-01

## W6-REL-01 — Release engineering and documentation (XL)

- **Dependencies:** W6-RESEARCH-01/W6-QE-01/W6-ARCH-01/W6-GPU-01/W6-SHOW-01
- **Definition:** Changesets-driven releases with canary and stable channels, signed artifacts, SBOM and provenance, release:verify, rollback procedures, and user and API documentation.
- **Acceptance criteria:**
  - [ ] Every merge and release artifact reproduces from a clean checkout via release:verify
  - [ ] Every release ships signed artifacts with SBOM and provenance attached
  - [ ] Canary-to-stable promotion and rollback are drilled and documented
  - [ ] User and API documentation is published and current for every released surface

## W6-SHOW-01 — Public showcase and playground (L)

- **Dependencies:** W3-PLAYER-01/W6-CRAFT-01/W6-ONBOARD-01
- **Definition:** Public showcase and playground built on the Broadset player, with a real-work gallery and at least 8 commissioned samples.
- **Acceptance criteria:**
  - [ ] Public dogfood performance is green, meeting QG-PERF-01 and QG-PERF-04
  - [ ] Showcase accessibility checks are green, including full keyboard operability
  - [ ] Real-work gallery ships ≥8 commissioned samples authored in Broadset
- **User-visible:** yes — anyone can browse the public gallery and play showcase graphics rendered by the production Broadset player.

## W6-RESEARCH-01 — External research and award validation (M)

- **Dependencies:** W6-CRAFT-01/W6-UX-01/W6-ONBOARD-01/W6-I18N-01
- **Definition:** Standing designer and operator research cohort, external design critique, moderated assistive-technology sessions, and an award-rubric audit.
- **Acceptance criteria:**
  - [ ] External panel review records a score ≥8.5, satisfied via the wave's external evidence gates
  - [ ] Zero critical usability blockers remain open at panel close
  - [ ] Cohort study, AT session, and award-rubric findings are recorded with dispositions
