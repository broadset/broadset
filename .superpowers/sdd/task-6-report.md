# Task 6 Report — v1 Aggregates and Semantic Validation

## Status

Complete. The exact aggregate shapes were ratified additively, strict v1 component, interop,
document, resource, template-group, and project schemas were implemented, a complete minimal
fixture was added, and deterministic whole-project semantic validation now runs over immutable
indexes in the required pass order.

Implementation commit: `5cf8923 feat(model): validate v1 projects`.

## Spec refinement commit

- `cc3d7cd docs(model): define v1 aggregate records`
- Added the approved closed aggregate records, exposed-property constraints and bindings, interop
  diagnostics, target allowlist/type matrix, and structural/semantic validation boundary.
- `npm run docs:check` passed.
- Workspace typecheck and the repository pre-commit quality hook passed.

## TDD evidence

### Aggregate RED

Command:

```text
npm run test -w @broadset/model -- src/v1/component.test.ts src/v1/project.test.ts src/v1/document.test.ts src/v1/interop.test.ts
```

Observed: 4 failed files. Document/project suites could not resolve the minimal fixture; component
and interop tests failed because their schemas did not exist.

### Aggregate GREEN

The same focused command passed 4 files and 11 tests after the structural schemas and fixture were
implemented. Aggregate structural tests also prove duplicate track IDs and out-of-duration
keyframes are rejected before semantic validation.

### Semantic RED

Command:

```text
npm run test -w @broadset/model -- src/v1/semantic-validation.test.ts src/v1/project.test.ts
```

Observed: all 18 semantic tests failed because `validateBroadsetProjectV1Semantics` did not exist.
Two later one-defect additions independently captured RED for duplicate extension namespaces and
invalid selected variable modes.

### Semantic GREEN

The matrix now covers 19 one-fixture/one-defect code-and-pointer cases plus minimal-project success,
deterministic ordering, and approved/forbidden target resolution. The focused v1 suite passes 23
files and 345 tests.

## Implementation

- Added strict aggregate schemas in `component.ts`, `interop.ts`, `document.ts`, and `project.ts`.
- Exported and reused the Task 4 typed-value/schema matcher and schema-to-value-type derivation.
- Added `fixtures/minimal-project.ts`; it supplies every required field without schema defaults.
- Added immutable once-built project/document/component/resource indexes.
- Added a pure closed-matrix property-target type resolver.
- Semantic passes execute identities, resources, hierarchy, components, variables, pages/bindings,
  sequences/state/lifecycle, output profiles, template groups, and interop, then sort by pointer and
  code.
- Validation includes resource kinds, hierarchy/preorder/cycles, component and sequence graphs,
  exposed values/constraints/targets, variable aliases/modes, page roots/overrides/sample data,
  binding fields/result/fallback types, exact interval/rate compatibility, template membership,
  extension ownership, and interop reference integrity.

## Verification

```text
npm run test -w @broadset/model -- src/v1
  23 files passed; 345 tests passed

npm run quality:strict -w @broadset/model
  lint:strict passed
  typecheck passed
  48 files passed; 948 tests passed

git diff --cached --check
  passed
```

Non-empty-line counts at final verification:

- `semantic-validation.ts`: 480
- `target-resolution.ts`: 329
- `semantic-validation.test.ts`: 496

All other new cohesive production/test files are also below 500 non-empty lines.

## Self-review

- Package boundary: model imports no workspace package.
- Public API: all new v1 public types, schemas, fixture, resolver, and validator are exported through
  the v1 barrel.
- Strictness: no defaults, migrations, unknown-field dropping, runtime registries, mutations of the
  parsed project, unsafe casts, `any`, suppressions, skipped tests, or legacy compatibility paths.
- Determinism: index construction is input-order stable; validation collects independent findings;
  returned diagnostics are copied and sorted by pointer then code.
- File design: semantic work is split by pass concern and all required size gates are satisfied.

## Security review

- Interop records are strict inert data. Parsing and semantic validation perform no network, DOM,
  filesystem, execution, or plugin behavior.
- No `eval`, `new Function`, HTML injection, remote fetch, unsafe regex, path construction, secret,
  credential, or dependency change was introduced.
- External URLs and preserved blobs reuse the already validated v1 primitives; interop previews are
  restricted semantically to image/vector assets.
- Out of scope: container byte/digest verification and producer-specific preserved-fragment schemas
  remain in persistence/format programs.

## Concerns

None blocking.

## Review repair

The findings in `task-6-review.md` were repaired with a scope-aware address resolver and expanded
semantic passes. Page descendants now traverse component-instance paths and prove override target
ownership; component bindings, nested property values, and sequences resolve only in their owning
component scope. State values/actions/guards, binding inference diagnostics, optional-property
presence, shared styles, blob/background resources, output/template compatibility, lifecycle seeks,
interop warning addresses, component root completeness, deterministic code-unit sorting, and
collision-safe allowed-value keys are now validated.

### Repair RED

The three review suites initially ran 29 cases with 26 failures and 3 incidental passes:

```text
npm run test -w @broadset/model -- src/v1/semantic-address-scope.test.ts \
  src/v1/semantic-state-binding-review.test.ts src/v1/semantic-resource-output-review.test.ts
```

### Repair GREEN and regressions

The same focused matrix passes all 29 review cases. A dedicated target-resolution test additionally
proves project ownership, nested stable-entity resolution, and variant pointer allowlisting. The
first full v1 run exposed two established diagnostic-code regressions; preserving
`binding.missing-field` and `binding.incompatible-result` restored compatibility without discarding
the new expression diagnostics.

Final repair verification:

```text
npm run test -w @broadset/model -- src/v1
  27 files passed; 374 tests passed

npm run quality:strict -w @broadset/model
  52 files passed; 977 tests passed

git diff --check
  passed
```

Final non-empty-line counts remain below 500: `semantic-validation.ts` is 481,
`semantic-validation.test.ts` is 482, and all newly added review files are smaller.
