# Release Quality Closure Plan

Date: 2026-04-28
Owner: Follow-up implementation agent
Status: in progress — RQ-1, RQ-2, and RQ-4 complete; RQ-3 gap closure and RQ-5 through RQ-9 pending

This plan turns the current release-readiness gaps into executable work. It covers three release-level needs:

1. Resolve the full dev audit advisories.
2. Wire coverage reporting and complete the cross-region CT audit.
3. Run and document real producer compatibility checks for PPTX, PDF, PSD, and SVG.

The starting assumption is that `npm run gate:full` is green. This plan must keep it green after every unit.

## Release Bar

This plan is done when all of these are true:

- `npm run gate:full` passes from a clean checkout.
- `npm audit --omit=dev --json` and `npm audit --json` both exit 0, or every remaining dev-only advisory has a written release-risk acceptance with owner and expiry.
- `npm run test:coverage` exists, produces a non-committed coverage report, and writes baseline numbers to `project/implementation/coverage-baseline.md`.
- `project/implementation/cross-region-ct-inventory.md` exists and every cross-region row is marked covered or has a spec-gap waiver.
- Real producer compatibility results are documented for PPTX, PDF, PSD, and SVG.
- Supported/unsupported external compatibility claims in specs match the compatibility results.

## Global Rules

1. Do not weaken or bypass quality gates, lint rules, audit checks, or CT coverage.
2. Keep `gate:full` green at the end of each unit.
3. Prefer direct fixes over `overrides`; use `overrides` only when the upstream dependency range cannot be upgraded cleanly and document the reason.
4. Coverage remains non-gating in this plan unless a later threshold proposal is explicitly accepted.
5. Real producer fixtures must follow the external-tool fixture convention from `io-prereqs-plan.md`: provenance manifest, small committed fixtures where license permits, and private/encrypted fixture mounts where license does not permit committing files.
6. Do not commit proprietary or licensed third-party fixtures unless their license explicitly permits redistribution in this repository.
7. Each new CT must satisfy the cross-region derivation rule: one user action, every affected visible region asserted in the same CT.

## Execution Order

1. RQ-1 Audit remediation
2. RQ-2 Coverage reporting
3. RQ-3 Cross-region CT audit
4. RQ-4 Compatibility harness and fixture governance
5. RQ-5 PPTX real producer checks
6. RQ-6 PDF real producer checks
7. RQ-7 PSD real producer checks
8. RQ-8 SVG real producer checks
9. RQ-9 Release closeout

## Units

### Unit RQ-1.1 Snapshot and classify full dev audit advisories

- [x] tests: red
- [x] impl: green

Scope:

- Run `npm audit --omit=dev --json` and `npm audit --json`.
- Run dependency graph checks for the advisory owners:
  - `npm ls postcss`
  - `npm ls vite`
  - `npm ls @playwright/experimental-ct-react @playwright/experimental-ct-core @playwright/test`
- Record the exact advisory IDs, affected dependency paths, current installed versions, and candidate fixed versions in `project/implementation/dev-audit-remediation.md`.

Acceptance criteria:

- The remediation doc identifies every current full-audit advisory.
- Each advisory has one preferred fix path and one fallback path.
- No code or package lock changes are made in this unit except the remediation doc.

Validation:

- `npm audit --omit=dev --json`
- `npm audit --json || true`
- `npm ls postcss vite @playwright/experimental-ct-react @playwright/experimental-ct-core @playwright/test || true`

### Unit RQ-1.2 Resolve PostCSS advisory

- [x] tests: red
- [x] impl: green

Scope:

- Upgrade or dedupe PostCSS so the installed `postcss` version is outside the vulnerable `<8.5.10` range.
- Prefer lockfile-only npm update if the existing dependency ranges permit it.
- If ranges block the fix, upgrade the owning package that brings PostCSS in.
- Avoid adding a direct PostCSS dependency unless it is the only clean way to resolve a transitive advisory.

Acceptance criteria:

- `npm audit --json` no longer reports `GHSA-qx2v-qp2m-jg93` for PostCSS.
- Package changes are minimal and explainable in `dev-audit-remediation.md`.
- `npm run gate:full` remains green.

Validation:

- `npm ls postcss`
- `npm audit --json`
- `npm run gate:full`

### Unit RQ-1.3 Resolve nested Playwright CT Vite advisory

- [x] tests: red
- [x] impl: green

Scope:

- First try upgrading `@playwright/experimental-ct-react`, `@playwright/test`, and `playwright` together to a version whose `@playwright/experimental-ct-core` depends on a non-vulnerable Vite.
- If Playwright has no compatible fixed release yet, test a minimal npm `overrides` entry for the nested `vite` dependency that satisfies Playwright CT and removes the advisory.
- If neither path works, document a time-boxed release-risk acceptance in `dev-audit-remediation.md` with affected command surface, exploitability, mitigation, owner, and expiry date.

Acceptance criteria:

- Preferred: `npm audit --json` exits 0.
- Acceptable only if blocked upstream: advisory remains documented with explicit risk acceptance and the formal release decision is recorded.
- `npm run ct:all` and `npm run gate:full` remain green.

Validation:

- `npm ls vite @playwright/experimental-ct-core`
- `npm audit --json`
- `npm run ct:all`
- `npm run gate:full`

### Unit RQ-1.4 Add audit scripts and release check documentation

- [x] tests: red
- [x] impl: green

Scope:

- Add root scripts if absent:
  - `audit:prod`: `npm audit --omit=dev`
  - `audit:all`: `npm audit`
- Document when to run each script in `CONTRIBUTING.md` or the release-quality plan closeout section.
- Do not add audit scripts to `gate:full` in this unit unless the team explicitly decides full dev audit should gate every local run.

Acceptance criteria:

- `npm run audit:prod` and `npm run audit:all` exist and work.
- Release docs state that both audit commands are required for release signoff.
- `npm run lint:dead` still passes after script additions.

Validation:

- `npm run audit:prod`
- `npm run audit:all`
- `npm run lint:dead`
- `npm run gate:full`

### Unit RQ-2.1 Execute coverage-reporting units CR-1.1 through CR-1.3

- [x] tests: red
- [x] impl: green

Scope:

- Follow `coverage-reporting.md` units CR-1.1, CR-1.2, and CR-1.3 exactly:
  - install `@vitest/coverage-v8`, matching the Vitest major/minor line,
  - wire coverage through `vitest.base.ts` behind `VITEST_COVERAGE=1`,
  - add production-code exclusion rules,
  - add root `test:coverage` script,
  - ignore generated coverage output.

Acceptance criteria:

- `npm run test:coverage` exists and emits `text-summary`, `json-summary`, and `html` coverage output.
- Coverage output files are ignored by git.
- Default `npm run test` behavior remains unchanged.
- `npm run gate:full` remains green.

Validation:

- `npm run test:coverage`
- `git status --short coverage packages/*/coverage`
- `npm run test`
- `npm run gate:full`

### Unit RQ-2.2 Capture coverage baseline and docs

- [x] tests: red
- [x] impl: green

Scope:

- Follow `coverage-reporting.md` units CR-2.1 and CR-2.2:
  - run `npm run test:coverage`,
  - write `project/implementation/coverage-baseline.md`,
  - update architecture and testing guidance with the new script and report location.
- Include per-package line, branch, function, and statement numbers.
- Include the five lowest-covered production files per package.

Acceptance criteria:

- Coverage baseline covers all workspace packages.
- Docs explain that coverage is a release signal, not a gate.
- Baseline numbers match the most recent coverage run.

Validation:

- `npm run test:coverage`
- `rg -n "test:coverage|coverage-baseline" agents project`
- `npm run quality:all`
- `npm run gate:full`

### Unit RQ-2.3 Decide coverage threshold follow-up

- [x] tests: red
- [x] impl: green

Scope:

- Follow `coverage-reporting.md` unit CR-3.1.
- Write `project/implementation/coverage-thresholds-proposal.md` with recommended non-blocking or future-blocking thresholds per package.
- Do not add thresholds to `gate:full` unless explicitly accepted in a separate decision.

Acceptance criteria:

- Proposal lists thresholds per package and metric.
- Proposal includes a clear go/no-go recommendation for future gate inclusion.
- No threshold is wired into Vitest or CI in this unit.

Validation:

- `npm run test:coverage`
- `npm run gate:full`

### Unit RQ-3.1 Inventory cross-region scenarios

- [x] tests: red
- [x] impl: green

Scope:

- Execute `cross-region-ct-audit.md` units CRA-1.1 through CRA-1.3.
- Read every spec file under `project/spec/editor/**`, `project/spec/ui/**`, and `project/spec/demo/**`.
- Write `project/implementation/cross-region-ct-inventory.md` with one row per acceptance criterion classification.

Acceptance criteria:

- Every relevant spec file is represented.
- Every cross-region row names the source region and every affected region.
- No `TODO` or `TBD` rows remain in the inventory.

Validation:

- Inventory row counts match spec requirement counts.
- `rg -n "TODO|TBD" project/implementation/cross-region-ct-inventory.md` returns no matches.

### Unit RQ-3.2 Map inventory to CT coverage and materialize gap units

- [x] tests: red
- [x] impl: green

Scope:

- Execute `cross-region-ct-audit.md` unit CRA-1.4.
- For every cross-region row, cite existing CT coverage or mark the row partial/missing.
- Add CRA-2.x unit stubs for every partial or missing row. In the current implementation, these stubs live in `cross-region-ct-inventory.md` next to the Gap List.

Acceptance criteria:

- Every cross-region row has a coverage verdict.
- The gap list is ordered by affected UI region.
- The number of CRA-2.x units equals the number of gap-list entries.

Validation:

- `rg "^### Unit CRA-2" project/implementation/cross-region-ct-inventory.md | wc -l`
- Spot-check at least three covered rows against their cited CT files.
- `npm run ct:all`

### Unit RQ-3.3 Land missing cross-region CTs in focused batches

- [ ] tests: red
- [ ] impl: green

Scope:

- Execute the materialized CRA-2.x units.
- Limit each batch to at most five new CTs.
- Prefer extending existing CT files when the flow belongs to an existing feature cluster.

Acceptance criteria:

- Every new CT asserts all affected regions listed by the inventory row.
- No CT relies on HeroUI mocks.
- `npm run ct:all` passes after each batch.

Validation:

- Focused package CT command for the edited CT files.
- `npm run ct:all`
- `npm run gate:full`

### Unit RQ-3.4 Final cross-region reconciliation

- [ ] tests: red
- [ ] impl: green

Scope:

- Execute `cross-region-ct-audit.md` unit CRA-3.1.
- Mark every inventory row covered or record a spec-gap waiver in the owning spec.
- Run the CT suite three consecutive times to catch local flake.

Acceptance criteria:

- Gap list is empty, or every remaining row links to a spec-gap waiver.
- `npm run gate:full` passes.
- `npm run ct:all` passes three times consecutively.

Validation:

- `npm run gate:full`
- `for i in 1 2 3; do npm run ct:all || break; done`

### Unit RQ-4.1 Establish producer fixture governance

- [x] tests: red
- [x] impl: green

Scope:

- Write `project/implementation/real-producer-compatibility.md` as the working report and matrix.
- Define fixture classes:
  - committed redistributable fixtures,
  - generated fixtures produced by scripts in CI,
  - private/licensed fixtures mounted only in CI or local validation,
  - manual-only producer checks.
- Define required manifest fields: file path, format, producer, producer version, OS, creation/export path, license status, expected import result, expected export/re-import result, and known limitations.
- Define storage rules for private fixtures and ensure secrets/license material are never committed.

Acceptance criteria:

- The compatibility report has a matrix section for PPTX, PDF, PSD, and SVG.
- Every row has an owner, fixture class, and validation command/protocol.
- The report states which fixture classes are required for release signoff.

Validation:

- `npx prettier --check project/implementation/real-producer-compatibility.md`
- `npm run gate:full`

### Unit RQ-4.2 Add shared producer fixture harness

- [x] tests: red
- [x] impl: green

Scope:

- Add or extend a formats test helper that can load producer fixtures from committed paths and optional mounted fixture roots.
- Environment variables should make private fixtures opt-in locally and required only in the release validation job.
- The helper must skip with an explicit message when optional private fixtures are unavailable outside release validation.
- Add per-format manifest validation so malformed fixture metadata fails fast.

Acceptance criteria:

- Fixture tests never fail because private fixtures are absent in normal local runs.
- Release-validation mode fails if required private fixture roots are absent.
- Manifests are validated before fixture tests run.

Validation:

- `npm run test -w @broadset/formats`
- Release-validation dry run with fixture env vars unset to verify the intended skip/fail mode.
- `npm run gate:full`

### Unit RQ-5.1 PPTX producer compatibility checks

- [ ] tests: red
- [ ] impl: green

Scope:

- Cover the producer set from `pptx-support-plan.md`: PowerPoint Windows, PowerPoint Mac, PowerPoint Web, Keynote, Google Slides, LibreOffice Impress, and Canva.
- Include a PowerPoint-on-Windows manual sanity protocol.
- Include a large-deck load test protocol and fixture acquisition plan.
- Include visual-fidelity CI strategy for at least the canonical Broadset export deck.

Acceptance criteria:

- Each producer has import smoke coverage or a documented manual validation row.
- Each producer has export/re-open/re-import expectations documented.
- Large-deck and visual-fidelity checks have owners and release-blocking status.

Validation:

- PPTX-focused formats tests.
- `npm run test -w @broadset/formats -- src/pptx`
- `npm run gate:full`

### Unit RQ-6.1 PDF producer compatibility checks

- [ ] tests: red
- [ ] impl: green

Scope:

- Cover the producer set from `pdf-support-plan.md`: Illustrator Save As, Illustrator Export PDF, Acrobat Print to PDF, InDesign Export, Figma PDF export, macOS Preview Export, Microsoft Word, and LaTeX/pdflatex.
- Validate page boxes, fonts, color spaces, OCG behavior, malformed streams, and XMP/marked-content preservation where applicable.
- Document lossy producers and expected fallback behavior.

Acceptance criteria:

- Each producer has a fixture row, expected import result, and expected round-trip/reconciliation result.
- PDF spec gaps are updated for unsupported or lossy behavior.
- Fixture smoke tests are deterministic in normal local mode.

Validation:

- `npm run test -w @broadset/formats -- src/pdf`
- `npm run gate:full`

### Unit RQ-7.1 PSD producer compatibility checks

- [ ] tests: red
- [ ] impl: green

Scope:

- Cover the producer set from `psd-support-plan.md`: Photoshop macOS, Photoshop Windows, Photoshop Web/iPad, Affinity Photo, Photopea, GIMP, Krita, and Figma.
- Validate CMYK/Lab/Gray with ICC, 16/32-bpc files, layer comps, adjustment layers, smart objects, masks, text, and effects according to the current spec claims.
- Document tools that strip XMP or alter additionalInfo metadata.

Acceptance criteria:

- Each producer has a fixture row, expected import result, and expected round-trip/reconciliation result.
- PSD spec gaps are updated for unsupported or lossy behavior.
- Private/licensed PSD fixtures are mounted only through the approved fixture-governance path.

Validation:

- `npm run test -w @broadset/formats -- src/psd`
- `npm run gate:full`

### Unit RQ-8.1 SVG producer compatibility checks

- [ ] tests: red
- [ ] impl: green

Scope:

- Cover the producer set from `svg-support-plan.md`: Illustrator Save As SVG, Illustrator Export As SVG, Inkscape Plain SVG, Inkscape SVG, Figma, Sketch, Affinity Designer, d3, hand-authored stress SVGs, and browser-captured SVG.
- Validate symbols/use, filters, fonts, gradients, masks, clip paths, text-on-path, vendor metadata, large node graphs, and hostile SVG handling.
- Include chain fixtures for Illustrator and Inkscape where Broadset export is opened/saved externally and re-imported.

Acceptance criteria:

- Every SVG fixture maps content natively or preserves it explicitly as opaque SVG content.
- No fixture silently drops content without a warning/spec-gap entry.
- Hostile SVG cases are rejected or sanitized before renderer exposure.

Validation:

- `npm run test -w @broadset/formats -- src/svg`
- `npm run gate:full`

### Unit RQ-9.1 Release compatibility report and spec closeout

- [ ] tests: red
- [ ] impl: green

Scope:

- Finalize `project/implementation/real-producer-compatibility.md` with pass/fail/waived status for every producer row.
- Update `project/spec/formats/*.md` so support claims match validated behavior.
- Update `production-readiness-rerun-2026-04-28.md` only if the current readiness label changes.

Acceptance criteria:

- The compatibility report has no untriaged rows.
- Every failed or skipped release-blocking row has either a fix, a spec-gap waiver, or an explicit release-risk acceptance.
- Format specs do not overclaim external compatibility.

Validation:

- `rg -n "TODO|TBD|untriaged" project/implementation/real-producer-compatibility.md project/spec/formats || true`
- `npm run gate:full`

### Unit RQ-9.2 Fresh-checkout release validation

- [ ] tests: red
- [ ] impl: green

Scope:

- From a clean checkout or clean worktree, install dependencies and run final validation.
- Run public validation and, where available, private fixture validation.
- Capture final command results in the compatibility report.

Acceptance criteria:

- `npm ci` succeeds.
- `npm run gate:full` succeeds.
- `npm run audit:prod` and `npm run audit:all` succeed, or accepted dev-only risks are documented.
- Real producer compatibility report reflects the final validation date and environment.

Validation:

- `npm ci`
- `npm run gate:full`
- `npm run audit:prod`
- `npm run audit:all`
- Private fixture validation command defined by RQ-4.2

## Done Definition

- RQ-1.x resolves or explicitly risk-accepts all full dev audit advisories.
- RQ-2.x lands coverage reporting and baseline docs.
- RQ-3.x completes the cross-region CT inventory, CT gap closure, and final regression loop.
- RQ-4.x establishes producer fixture governance and harness behavior.
- RQ-5.x through RQ-8.x document and validate real producer compatibility for PPTX, PDF, PSD, and SVG.
- RQ-9.x updates specs/reports and proves release validation from a clean checkout.
