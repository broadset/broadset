# Wave W0 — Truth, decisions, trust, and design foundation

W0 establishes truthful evidence, resolves contract decisions, closes critical correctness and security defects, and defines the product and host architecture before feature expansion. Workstreams run in parallel only where their dependencies and file ownership do not overlap.

**Wave gate:** zero open critical/high known defects; every unverified finding classified; all RFCs resolved; visual language and professional benchmark baseline approved; host/package architecture approved; performance and hostile-input gates live. **External evidence gates:** professional workflow research sessions with 5–10 professional participants for W0-UX-01 (owner: maintainer); PowerPoint desktop fidelity signoff for W0-IO-01 and W0-IO-08 (owner: maintainer).

## W0-GOV-01 — Spec scenario ID traceability (L)

- **Dependencies:** none
- **Definition:** Stable spec scenario IDs with bidirectional test traceability across `project/spec/**`, test JSDoc, the CT inventory, and plan-progress.
- **Acceptance criteria:**
  - [ ] CI rejects unknown or missing scenario links
  - [ ] CT inventory regenerates deterministically from source

## W0-GOV-02 — Generated architecture dependency baseline (M)

- **Dependencies:** none
- **Definition:** Generate the architecture dependency and version baseline from package manifests; fix F-19 and stale experimental/docs claims.
- **Acceptance criteria:**
  - [ ] Generated check fails on manifest drift
  - [ ] `architecture.md` matches package manifests

## W0-DEF-01 — Findings and defect ledger re-audit (L)

- **Dependencies:** W0-GOV-01
- **Definition:** Re-audit every `bugs.md` entry, every F/B/U/X row, every spec gap, and every production-readiness item.
- **Acceptance criteria:**
  - [ ] Every audited row carries current commit evidence
  - [ ] Every audited row records its destination

## W0-RFC-01 — Contract RFC decisions and ADRs (XXL)

- **Dependencies:** W0-DEF-01
- **Definition:** Decide RFC-01 through RFC-14 and write the resulting ADRs and spec changes.
- **Acceptance criteria:**
  - [ ] All 14 RFC decisions approved with ADRs and spec changes
  - [ ] No W1 behavior depends on an undecided contract

## W0-UX-01 — Professional workflow research and design direction (XL)

- **Dependencies:** none
- **Definition:** Professional workflow research with baseline benchmark tasks, plus product voice, density, typography, interaction principles, and a signature design direction.
- **Acceptance criteria:**
  - [ ] Findings from 5–10 professional participants recorded via the external evidence gate
  - [ ] Measurable benchmark task baseline recorded

## W0-PLAT-01 — Host topology and package strategy (L)

- **Dependencies:** W0-RFC-01
- **Definition:** Define the browser/desktop/PWA/worker/player/service topology and the boundary-enabling package strategy in `architecture.md`.
- **Acceptance criteria:**
  - [ ] Support matrix approved
  - [ ] Capability adapters and codec/filesystem fallbacks approved
  - [ ] Package dependency graph approved

## W0-PERF-01 — Performance spec and gate infrastructure (XL)

- **Dependencies:** W0-PLAT-01
- **Definition:** Canonical performance spec with instrumentation, a dev HUD, and fixed-runner Lighthouse, Playwright, and bundle-size gates.
- **Acceptance criteria:**
  - [ ] Baseline-plus-margin gates active, enforcing QG-PERF-01, QG-PERF-02, and QG-PERF-03
  - [ ] Traces retained on gate failure
  - [ ] Obsolete TTI metric absent

## W0-QE-01 — Test infrastructure and flake telemetry (L)

- **Dependencies:** W0-GOV-01
- **Definition:** Prettier across all packages, a discovered test matrix, flake telemetry, a generated CT inventory, and a fresh-clone CI job.
- **Acceptance criteria:**
  - [ ] F-21, X-01, U-05, and U-06 resolved
  - [ ] Repeat-each flake lane active
  - [ ] Expiry-bound quarantine policy active

## W0-SEC-01 — Sanitizer, fetch, and parser policies (L)

- **Dependencies:** RFC-10
- **Definition:** Fix F-08, verify U-01/U-02/U-04/U-09, and define the sanitizer, fetch, and parser policies for external input.
- **Acceptance criteria:**
  - [ ] Hostile-input corpus green, meeting QG-SEC-01
  - [ ] No preserved content rendered active
  - [ ] CSP report-only telemetry clean

## W0-SEC-02 — Atomic trust boundary batch validation (M)

- **Dependencies:** W0-SEC-01
- **Definition:** Fix F-17 and validate collaboration, reconciliation, paste, and drop batches atomically at trust boundaries.
- **Acceptance criteria:**
  - [ ] Malformed payload batches return typed diagnostics
  - [ ] Malformed payload batches perform zero partial mutation, meeting QG-SEC-01

## W0-COLLAB-01 — Document change semantics completion (L)

- **Dependencies:** RFC-11
- **Definition:** Complete page-override and document-level change semantics for B-20 before choosing a network transport.
- **Acceptance criteria:**
  - [ ] Page-override changes converge
  - [ ] Data-schema changes converge
  - [ ] Remote changes stay out of local undo

## W0-COLLAB-02 — Project-level diff and apply (M)

- **Dependencies:** W0-COLLAB-01
- **Definition:** Add project-level diff/apply covering assets and project settings to close B-22.
- **Acceptance criteria:**
  - [ ] Project round-trip tests converge
  - [ ] Randomized change-order tests converge

## W0-TIME-01 — Duration and sampling semantics ratification (M)

- **Dependencies:** RFC-06
- **Definition:** Ratify duration interval, frame-count, sampling, timestamp, and endpoint semantics for B-23/B-37.
- **Acceptance criteria:**
  - [ ] One shared duration helper specified
  - [ ] Cross-exporter contract tests specified

## W0-IO-01 — PPTX group structure and z-order (M)

- **Dependencies:** W0-RFC-01
- **Definition:** Fix F-01/F-04 with a parent/group distinction and z-order-safe PPTX structure.
- **Acceptance criteria:**
  - [ ] Nested and interleaved geometry fixtures pass, meeting QG-COR-01
  - [ ] Structure and re-import fixtures pass with no silent drops, meeting QG-INT-02
  - [ ] LibreOffice rendering evidence recorded; PowerPoint evidence via the external evidence gate
- **User-visible:** yes — imported and exported PPTX decks keep grouping and stacking order in PowerPoint and LibreOffice.

## W0-IO-02 — Radial gradient center parsing (S)

- **Dependencies:** W0-SEC-01
- **Definition:** Fix F-02 percentage, fraction, and default radial-gradient centers.
- **Acceptance criteria:**
  - [ ] Property tests prove finite, in-range gradient centers
  - [ ] Property tests prove no document crash

## W0-IO-03 — PDF page box coordinates (S)

- **Dependencies:** W0-SEC-01
- **Definition:** Fix F-03 PDF page-box coordinate conversion.
- **Acceptance criteria:**
  - [ ] CropBox and MediaBox fixtures within 0.5 pt
  - [ ] Rotation fixtures within 0.5 pt

## W0-IO-04 — PPTX placeholder geometry inheritance (M)

- **Dependencies:** W0-IO-01
- **Definition:** Fix F-05 PPTX placeholder geometry inheritance from layout and master.
- **Acceptance criteria:**
  - [ ] Title and body placeholder oracle fixtures within 0.5 px, meeting QG-COR-01
  - [ ] Custom placeholder oracle fixtures within 0.5 px

## W0-IO-05 — SVG style cascade resolution (M)

- **Dependencies:** W0-SEC-01
- **Definition:** Fix F-06 SVG cascade across inline, presentation, and stylesheet declarations.
- **Acceptance criteria:**
  - [ ] Specificity and inheritance fixtures match the browser reference
  - [ ] Inline-style fixtures match the browser reference

## W0-IO-06 — PDF CID text decoding (M)

- **Dependencies:** W0-SEC-01
- **Definition:** Fix F-10 PDF CID/Identity-H decoding.
- **Acceptance criteria:**
  - [ ] ToUnicode multilingual fixtures decode exactly, meeting QG-COR-03
  - [ ] CMap multilingual fixtures decode exactly
- **User-visible:** yes — multilingual PDF imports show correct text instead of garbled characters.

## W0-IO-07 — Multi-page PDF association (S)

- **Dependencies:** W0-IO-03
- **Definition:** Fix F-11 multi-page PDF element-to-page association.
- **Acceptance criteria:**
  - [ ] Page-structure fixtures preserve page identity
  - [ ] Visual fixtures preserve page identity

## W0-IO-08 — PPTX gradient angle conversion (S)

- **Dependencies:** W0-IO-01
- **Definition:** Fix F-12 PPTX gradient angle conversion.
- **Acceptance criteria:**
  - [ ] Canonical angle matrix matches the LibreOffice raster
  - [ ] PowerPoint raster match recorded via the external evidence gate

## W0-IO-09 — PPTX theme style matrix references (M)

- **Dependencies:** W0-IO-04
- **Definition:** Fix F-13 PPTX theme style-matrix references.
- **Acceptance criteria:**
  - [ ] Default theme galleries retain paint and stroke, meeting QG-INT-02
  - [ ] Custom theme galleries retain paint and stroke

## W0-IO-10 — PSD byte offset handling (S)

- **Dependencies:** W0-SEC-01
- **Definition:** Fix F-14 PSD `Uint8Array` byteOffset handling.
- **Acceptance criteria:**
  - [ ] Sliced-view input equals copied bytes for valid files
  - [ ] Sliced-view input equals copied bytes for malformed files

## W0-IO-11 — SVG stop opacity support (S)

- **Dependencies:** W0-IO-02
- **Definition:** Fix F-15 SVG stop-opacity.
- **Acceptance criteria:**
  - [ ] Transparent-stop structural fixtures pass
  - [ ] Transparent-stop visual fixtures pass

## W0-MODEL-01 — Linear SVG path tokenizer (M)

- **Dependencies:** W0-SEC-01
- **Definition:** Fix F-07 with a linear SVG-path tokenizer.
- **Acceptance criteria:**
  - [ ] Minified-path fuzz tests green
  - [ ] Worst-case linearity tests green, meeting QG-SEC-01

## W0-MODEL-02 — Total gradient safe parsing (S)

- **Dependencies:** W0-SEC-01
- **Definition:** Fix F-16 so safe parsing is total for legacy gradient input.
- **Acceptance criteria:**
  - [ ] Typed failure returned for invalid legacy gradient input
  - [ ] `safeParse` never throws

## W0-RECOVER-01 — Corrupt save quarantine and recovery (L)

- **Dependencies:** W0-SEC-01
- **Definition:** Stop silent discard of unparseable saved data; quarantine corrupt saves with raw download and last-valid recovery.
- **Acceptance criteria:**
  - [ ] Corrupt-save CT proves no silent data loss
  - [ ] Corrupt-save CT proves recovery is accessible, meeting QG-A11Y-01
- **User-visible:** yes — authors get a quarantined copy, raw download, and last-valid document recovery instead of silent data loss.
