# Broadset Project Format v2 Model Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the authoritative v2 project contract, strict DOM-free TypeScript/Zod model, semantic validator, canonical JSON loader, and published JSON Schema without yet migrating editor, renderer, playback, or format consumers.

**Architecture:** Add a temporary `packages/model/src/v2/` implementation namespace so the complete v2 model can be built and verified while existing consumers continue compiling. This is development staging, not a compatibility layer: downstream cutover plans replace current imports and delete all v1 model code and migrations before release. Structural Zod parsing, whole-project semantic validation, and bounded package loading remain separate concerns.

**Tech Stack:** Node.js >=24, TypeScript ^6.0.2, Zod ^4.3.0, Vitest ^4.1.9, Ajv ^8.20.0, JSON Schema 2020-12, RFC 6901 JSON Pointer, RFC 8785 JSON Canonicalization Scheme, SHA-256 through the Web Crypto API.

## Global Constraints

- `project/spec/` remains the behavioral source of truth; update the relevant specification before or alongside implementation.
- Broadset-owned v1 project data receives no production migration, compatibility parser, alias, or fallback.
- `@broadset/model` MUST NOT import another workspace package.
- Every core Zod object is strict. Open JSON values are allowed only inside versioned extension, plugin, and interop payloads.
- No `any`, suppressions, skipped tests, warning silencing, or weakened quality gates.
- Every public v2 symbol is re-exported through `packages/model/src/v2/index.ts` and the package root.
- Every addressable entity has a stable non-empty ID; array index is never durable identity.
- Every number is finite. Ticks, byte lengths, and declared integers are JSON-safe integers.
- Model files remain DOM-free and below the 500 non-empty-line soft limit.
- Canonical projects exclude UI state, undo, presence, CRDT metadata, journals, caches, and render plans.
- Structural and semantic validation never mutate or silently repair input.
- Every task uses red-green-refactor TDD and ends with a focused conventional commit.

---

## Program Decomposition

The approved design requires eight independently testable programs, executed in this dependency order:

1. **Model foundation — this plan:** authoritative contracts, strict schemas, semantic validation, canonical JSON, loader result, JSON Schema.
2. **Scene and component resolution:** hierarchy, component expansion, page instances, overrides, provenance, `ResolvedSceneSnapshot`.
3. **Professional resources:** content-addressed assets, text, colors, swatches, variables, shared styles, appearance/effect stacks.
4. **View models and components:** expression evaluation, bindings, repeaters, exposed properties, unlink and cycle behavior.
5. **Exact time and playback:** rational timebase, stable tracks/keyframes, sequences, state machines, lifecycle, offline sampling.
6. **Project store and persistence:** whole-project store, atomic changes, IndexedDB/OPFS, recovery, `.bsp` codec.
7. **Interoperability and formats:** v2 importer emission, interop records, foreign nodes, resolver-based exporters and preflight.
8. **Application cutover:** editor/UI/demo/player migration, fixture replacement, v1 deletion, complete quality and producer gates.

Programs 2-8 must not begin until this plan's public schemas, validator, canonical loader, and JSON Schema are complete.

## Design Coverage Map

| Approved design sections                                  | Owning work                                                                         |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 1-6 purpose, goals, principles, foundational values, root | Tasks 1, 2, and 6                                                                   |
| 7 resources                                               | Tasks 2 and 6; operational asset pipeline in program 3                              |
| 8 documents and surfaces                                  | Tasks 1 and 6                                                                       |
| 9 elements and transforms                                 | Task 3; resolved world geometry in program 2                                        |
| 10 appearance                                             | Task 3; rendering/color/effect kernels in program 3                                 |
| 11 text                                                   | Task 3; shaping and editor behavior in program 3                                    |
| 12 components                                             | Task 6; expansion/unlink/editor behavior in programs 2 and 4                        |
| 13 pages and instances                                    | Task 4; resolution/provenance in program 2                                          |
| 14 view models and bindings                               | Task 4; evaluation/repeaters/editor behavior in program 4                           |
| 15 exact time and animation                               | Task 5; evaluation and clocks in program 5                                          |
| 16 output profiles                                        | Tasks 5 and 6; exporter consumption in program 7                                    |
| 17 interop                                                | Task 6; importer/exporter behavior in program 7                                     |
| 18 generic extensions                                     | Tasks 2 and 6                                                                       |
| 19 validation                                             | Tasks 2-7                                                                           |
| 20 canonical serialization                                | Task 7                                                                              |
| 21 `.bsp` package                                         | Structural references in Tasks 2 and 7; codec/security in program 6                 |
| 22 persistence and collaboration                          | Stable identity prerequisites here; journals/operations in program 6                |
| 23 resolution                                             | Schema prerequisites here; implementation in program 2                              |
| 24 security                                               | Strict inert model in Tasks 2-7; boundary sanitization/fetch in program 7           |
| 25 recovery                                               | JSON quarantine in Task 7; byte/package recovery in program 6                       |
| 26 performance                                            | File/index constraints here; measured subsystem budgets in every downstream program |
| 27 verification                                           | Each task plus Task 8 foundation gate; downstream program gates remain mandatory    |
| 28 greenfield cutover                                     | Program 8                                                                           |
| 29 acceptance criteria                                    | Foundation subset in Task 8; full closure only after programs 2-8                   |

## File Map

**Specifications:**

- Modify `project/spec/model/project.md`, `spec.md`, `assets.md`, `element.md`, `style.md`, `data-schema.md`, `animation.md`, `output-spec.md`, `changes.md`, and `format-reference.md`.
- Create `project/spec/model/components.md`, `timebase.md`, `color-management.md`, and `interop.md`.
- Modify `project/spec/README.md`.

**Implementation:**

- Create focused modules under `packages/model/src/v2/`: `json-value.ts`, `identity.ts`, `diagnostics.ts`, `typed-value.ts`, `color.ts`, `resources.ts`, `appearance.ts`, `text.ts`, `element.ts`, `component.ts`, `page.ts`, `data.ts`, `time.ts`, `sequence.ts`, `output-profile.ts`, `interop.ts`, `document.ts`, `project.ts`, `semantic-validation.ts`, `canonical-json.ts`, `load.ts`, and `index.ts`.
- Create adjacent tests and `packages/model/src/v2/fixtures/minimal-project.ts`.
- Modify `packages/model/src/index.ts` only after the v2 public API is complete.

**Generated schema and enforcement:**

- Create `project/schema/v2/project.schema.json`.
- Create `scripts/generate-project-schema.mjs` and `scripts/generate-project-schema.test.mjs`.
- Modify root `package.json`, `scripts/check-documentation.mjs`, and `scripts/check-documentation.test.mjs`.

---

### Task 1: Ratify and Reconcile the Authoritative Model Specifications

**Files:**

- Modify: every specification listed in the File Map.
- Create: `project/spec/model/components.md`
- Create: `project/spec/model/timebase.md`
- Create: `project/spec/model/color-management.md`
- Create: `project/spec/model/interop.md`

**Interfaces:**

- Consumes: `docs/superpowers/specs/2026-07-10-broadset-project-format-v2-design.md`.
- Produces: authoritative names, shapes, resolution order, validation rules, and acceptance criteria consumed by Tasks 2-8.

- [ ] **Step 1: Replace the root identity requirement**

Use this exact normative contract in `project/spec/model/project.md`:

```markdown
### Requirement: Canonical v2 Project Identity

Every canonical project MUST contain `$schema`, `format`, and `schemaVersion` with these exact values:

- `$schema: 'https://schema.broadset.dev/v2/project.schema.json'`
- `format: 'broadset-project'`
- `schemaVersion: 2`

Consumers MUST reject every other schema version with a typed unsupported-version diagnostic. The production v2 loader MUST NOT migrate or accept earlier Broadset-owned project shapes.

#### Acceptance Criteria

- [ ] Given all three exact identity values, structural validation proceeds
- [ ] Given a missing or different identity value, validation fails at that field
- [ ] Given `schemaVersion: 1`, loading returns `unsupported-version` and preserves the source bytes
```

- [ ] **Step 2: Reconcile every model domain**

Add requirements and self-contained acceptance criteria for the exact approved root vocabulary: `resources`, `documents`, `templateGroups`, `interop`, and `extensions`; and the exact document vocabulary: `surface`, `color`, `elements`, `components`, `pages`, `sequences`, `lifecycle`, `stateMachines`, `viewModels`, `bindings`, `selectedVariableModes`, and `outputProfileIds`.

Remove contradictory v1 normative behavior rather than documenting both behaviors. Move historical rationale to implementation ADRs when it remains useful.

- [ ] **Step 3: Add focused sub-specs and documentation links**

Each new file includes Purpose, Requirements, Acceptance Criteria, Spec Gaps, and Non-Goals. Add links in `project/spec/README.md` and the model sub-spec table.

- [ ] **Step 4: Verify documentation and placeholder absence**

```bash
npx prettier --write "project/spec/**/*.md"
npm run docs:check
rg -n "TBD|TODO|FIXME|schemaVersion: 1|plain JSON.*\.bsp|silently ignored" project/spec/model
```

Expected: documentation integrity passes and the final search returns no unresolved placeholder, v1 identity, ambiguous `.bsp`, or silent-reference rule in normative v2 text.

- [ ] **Step 5: Commit**

```bash
git add project/spec/README.md project/spec/model
git commit -m "docs(model): ratify project format v2"
```

### Task 2: Implement Foundational JSON, Identity, Typed Values, Colors, and Resource Entities

**Files:**

- Create: `packages/model/src/v2/json-value.ts`
- Create: `packages/model/src/v2/identity.ts`
- Create: `packages/model/src/v2/diagnostics.ts`
- Create: `packages/model/src/v2/typed-value.ts`
- Create: `packages/model/src/v2/color.ts`
- Create: `packages/model/src/v2/resources.ts`
- Create: adjacent test files and `packages/model/src/v2/index.ts`

**Interfaces:**

- Produces: `JsonValue`, `ExtensionEnvelope`, `Id`, `UtcTimestamp`, `Sha256Digest`, `EntityAddress`, `PropertyTarget`, `Diagnostic`, `ValueType`, `TypedValue`, `ColorValue`, `BlobReference`, `Asset`, `FontFamilyResource`, `Swatch`, `VariableCollection`, `SharedStyle`, and strict schemas for each. `ProjectResources` is composed in Task 6 after output profiles exist.

- [ ] **Step 1: Write failing foundational tests**

```ts
import { describe, expect, it } from 'vitest';

import {
  colorValueSchema,
  extensionEnvelopeSchema,
  idSchema,
  jsonValueSchema,
  sha256DigestSchema,
  utcTimestampSchema,
} from './index';

describe('v2 foundational schemas', () => {
  it('accepts nested JSON and versioned extension payloads', () => {
    expect(jsonValueSchema.parse({ values: [1, true, null, 'x'] })).toEqual({ values: [1, true, null, 'x'] });
    expect(
      extensionEnvelopeSchema.parse({
        namespace: 'com.example.test',
        schema: 'https://example.com/test.schema.json',
        version: 1,
        payload: { enabled: true },
      }),
    ).toBeDefined();
  });

  it('rejects invalid identity primitives', () => {
    expect(idSchema.safeParse('').success).toBe(false);
    expect(idSchema.safeParse('bad\u0000id').success).toBe(false);
    expect(utcTimestampSchema.safeParse('2026-07-10').success).toBe(false);
    expect(sha256DigestSchema.safeParse('sha256:not-hex').success).toBe(false);
  });

  it('stores authoritative wide-gamut channels without an sRGB surrogate', () => {
    expect(colorValueSchema.parse({ kind: 'color', space: 'display-p3', channels: [0.9, 0.2, 0.1], alpha: 1 })).toEqual(
      { kind: 'color', space: 'display-p3', channels: [0.9, 0.2, 0.1], alpha: 1 },
    );
  });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm run test -w @broadset/model -- src/v2`

Expected: FAIL because the v2 modules and exports do not exist.

- [ ] **Step 3: Implement strict schemas**

Use `z.lazy` for recursive JSON and typed values. IDs reject empty/control-character strings. UTC timestamps require timezone-qualified ISO 8601. Digests are lowercase `sha256:` plus 64 hexadecimal characters. `PropertyTarget` contains only `{ entity, pointer }`; property value types are derived from target schemas.

Package blob paths are exactly `blobs/sha256/<digest-without-prefix>`. External sources require HTTPS plus integrity. Missing sources preserve declared digest, byte length, MIME, and optional last-known name. Colors validate channel count/range by color space.

Use this exact diagnostic contract:

```ts
export interface Diagnostic {
  readonly code: string;
  readonly severity: 'info' | 'warning' | 'error';
  readonly message: string;
  readonly pointer?: string;
  readonly entity?: EntityAddress;
  readonly remediation?: string;
}
```

- [ ] **Step 4: Add complete positive/negative tests**

Cover every `TypedValue`, color, blob source, asset, and resource discriminant; strict unknown-field rejection; non-finite values; wrong channel counts; invalid package paths; invalid external URLs; duplicate local IDs detectable structurally where local scope is available; and typed defaults.

- [ ] **Step 5: Verify and commit**

```bash
npm run test -w @broadset/model -- src/v2
npm run quality:strict -w @broadset/model
git add packages/model/src/v2
git commit -m "feat(model): add v2 foundation types"
```

### Task 3: Implement Appearance, Structured Text, Geometry, and Elements

**Files:**

- Create: `packages/model/src/v2/appearance.ts`
- Create: `packages/model/src/v2/text.ts`
- Create: `packages/model/src/v2/element.ts`
- Create: adjacent test files
- Modify: `packages/model/src/v2/index.ts`

**Interfaces:**

- Consumes: Task 2 colors, assets, IDs, JSON payloads.
- Produces: `Paint`, `Appearance`, `TextBody`, `ElementGeometry`, `Element`, and `elementSchema`.

- [ ] **Step 1: Write failing closed-union tests**

```ts
it('accepts structured inert text with stable paragraph and run ids', () => {
  const element = createTextElementFixture();
  expect(elementSchema.parse(element)).toEqual(element);
});

it.each([
  ['content', 'https://example.com/image.png'],
  ['typeConfig', { loop: true }],
  ['groupId', 'selection-group'],
  ['customClipPath', 'polygon(0 0, 100% 0, 100% 100%)'],
])('rejects removed generic field %s', (key, value) => {
  expect(elementSchema.safeParse({ ...createTextElementFixture(), [key]: value }).success).toBe(false);
});

it('preserves affine skew and reflection', () => {
  const element = createVectorElementFixture([-1, 0.25, 0.5, 1, 20, 30]);
  expect(elementSchema.parse(element).geometry.transform.kind).toBe('affine2d');
});
```

- [ ] **Step 2: Verify failure**

Run: `npm run test -w @broadset/model -- src/v2/appearance.test.ts src/v2/text.test.ts src/v2/element.test.ts`

Expected: FAIL because modules and fixtures are absent.

- [ ] **Step 3: Implement exact closed variants**

Element kinds are exactly `text`, `image`, `vector`, `group`, `component-instance`, `video`, `audio`, `clock`, `ticker`, `qrcode`, `foreign`, and `plugin`. Use one affine six-number matrix or one 16-number 3D matrix; do not persist decomposition. Text always has stable paragraph/run IDs and inert Unicode strings. Appearance has ordered stable-ID fill, stroke, and effect arrays. Foreign elements require source blob, preview asset, safe render mode, and reason. Plugin payloads remain inert `JsonValue`.

- [ ] **Step 4: Add exhaustive discriminant tests**

Test all twelve element kinds, every paint/effect kind, multiple ordered fills/strokes, strict run/paragraph properties, malformed matrices, missing foreign preview/source, plugin envelope versioning, and unknown core fields.

- [ ] **Step 5: Verify and commit**

```bash
npm run test -w @broadset/model -- src/v2/appearance.test.ts src/v2/text.test.ts src/v2/element.test.ts
npm run quality:strict -w @broadset/model
git add packages/model/src/v2
git commit -m "feat(model): add v2 element model"
```

### Task 4: Implement Pages, View Models, Expressions, and Bindings

**Files:**

- Create: `packages/model/src/v2/page.ts`
- Create: `packages/model/src/v2/data.ts`
- Create: adjacent test files
- Modify: `packages/model/src/v2/index.ts`

**Interfaces:**

- Consumes: Task 2 property targets/typed values and Task 3 elements/text.
- Produces: `PageDefinition`, `PageRootInstance`, `InstanceAddress`, `ViewModel`, `ValueSchema`, `ExpressionAst`, `FormatterPipeline`, and `Binding`.

- [ ] **Step 1: Write failing page and expression tests**

```ts
it('allows repeated definitions through independent page instance ids', () => {
  const page = createPageFixture([
    createRootInstanceFixture('instance-a', 'shared-root'),
    createRootInstanceFixture('instance-b', 'shared-root'),
  ]);
  expect(pageDefinitionSchema.parse(page).rootInstances.map((item) => item.id)).toEqual(['instance-a', 'instance-b']);
});

it('rejects unparsed expression strings and unregistered functions', () => {
  expect(expressionAstSchema.safeParse('score > 0').success).toBe(false);
  expect(expressionAstSchema.safeParse({ kind: 'safe-function', functionId: 'eval', arguments: [] }).success).toBe(
    false,
  );
});
```

- [ ] **Step 2: Verify failure**

Run: `npm run test -w @broadset/model -- src/v2/page.test.ts src/v2/data.test.ts`

Expected: FAIL because modules are missing.

- [ ] **Step 3: Implement structural contracts**

Pages store ordered root instances with independent IDs, sparse typed overrides, descendant instance paths, structured notes, locale, modes, sample data, and sequence references. View-model fields use stable IDs and recursive schemas. Task 3's component-instance element payload stores stable exposed-property IDs with `TypedValue`; Task 6 validates those IDs against completed component definitions.

The safe-function registry is exactly `coalesce`, `length`, `lowercase`, `uppercase`, `round`, `min`, `max`, `clamp`, and `format-date`. The formatter registry is exactly `number`, `date-time`, `duration`, `prefix`, `suffix`, and `truncate`.

- [ ] **Step 4: Implement expression type inference tests**

Add `inferExpressionValueType(expression, context): { valueType?: ValueType; diagnostics: readonly Diagnostic[] }`. Test operand compatibility, field/variable references, conditional branch agreement, registered function signatures, formatter input/output, and binding target compatibility. Do not evaluate expressions in this plan.

- [ ] **Step 5: Verify and commit**

```bash
npm run test -w @broadset/model -- src/v2/page.test.ts src/v2/data.test.ts
npm run quality:strict -w @broadset/model
git add packages/model/src/v2
git commit -m "feat(model): add v2 pages and data"
```

### Task 5: Implement Rational Time, Sequences, State Machines, and Output Profiles

**Files:**

- Create: `packages/model/src/v2/time.ts`
- Create: `packages/model/src/v2/sequence.ts`
- Create: `packages/model/src/v2/output-profile.ts`
- Create: adjacent test files
- Modify: `packages/model/src/v2/index.ts`

**Interfaces:**

- Produces: `Rational`, `Timebase`, `Sequence`, `Track`, `Keyframe`, `StateMachine`, `LifecycleDefinition`, `OutputProfile`, and pure exact-time helpers.

- [ ] **Step 1: Write failing exact-time tests**

```ts
it('represents 30000/1001 with integer frame ticks', () => {
  const timebase = timebaseSchema.parse({
    frameRate: { numerator: 30000, denominator: 1001 },
    ticksPerSecond: 30000,
    timecode: { nominalFramesPerSecond: 30, dropFrame: true },
  });
  expect(frameStartTicks(17_982, timebase)).toBe(17_999_982);
});

it('requires stable track and key ids with homogeneous values', () => {
  const sequence = createOpacitySequenceFixture();
  expect(sequenceSchema.parse(sequence)).toEqual(sequence);
  expect(sequenceSchema.safeParse({ ...sequence, tracks: [{ ...sequence.tracks[0], id: '' }] }).success).toBe(false);
});
```

- [ ] **Step 2: Verify failure**

Run: `npm run test -w @broadset/model -- src/v2/time.test.ts src/v2/sequence.test.ts src/v2/output-profile.test.ts`

Expected: FAIL because modules are missing.

- [ ] **Step 3: Implement schemas and pure helpers**

Implement `reduceRational`, `frameStartTicks`, `frameCountForDuration`, `ticksToFrame`, and SMPTE annotation validation with safe integer arithmetic. Timed media is `[0,durationTicks)`. Sequences reference child sequences by ID, store deterministic stagger seeds, and validate stable local identities. State-machine guards reuse Task 4 expressions. Output profiles are a closed `motion`/`print` union.

- [ ] **Step 4: Add boundary tests**

Cover rational reduction, safe-integer overflow, 24000/1001, 30000/1001, 60000/1001, valid/invalid drop-frame combinations, duration/work-area bounds, duplicate local IDs, key/value mismatch, clip range, deterministic seed presence, and output-profile required fields.

- [ ] **Step 5: Verify and commit**

```bash
npm run test -w @broadset/model -- src/v2/time.test.ts src/v2/sequence.test.ts src/v2/output-profile.test.ts
npm run quality:strict -w @broadset/model
git add packages/model/src/v2
git commit -m "feat(model): add v2 time contracts"
```

### Task 6: Build Components, Project Aggregates, and Whole-Project Semantic Validation

**Files:**

- Create: `packages/model/src/v2/component.ts`
- Create: `packages/model/src/v2/interop.ts`
- Create: `packages/model/src/v2/document.ts`
- Create: `packages/model/src/v2/project.ts`
- Create: `packages/model/src/v2/semantic-validation.ts`
- Create: adjacent test files
- Create: `packages/model/src/v2/fixtures/minimal-project.ts`
- Modify: `packages/model/src/v2/index.ts`

**Interfaces:**

- Consumes: Task 5 `Sequence` and Task 4 `ExpressionAst`, which removes the component/sequence/expression dependency cycle.
- Produces: `ComponentDefinition`, `ExposedProperty`, `ProjectResources`, `InteropRegistry`, `BroadsetDocumentV2`, `TemplateGroup`, `BroadsetProjectV2`, `broadsetProjectV2Schema`, `validateBroadsetProjectV2Semantics`.

- [ ] **Step 1: Write failing aggregate tests**

```ts
it('parses a complete minimal v2 project without hidden defaults', () => {
  const project = createMinimalProjectV2();
  expect(broadsetProjectV2Schema.parse(project)).toEqual(project);
});

it.each([
  ['$schema', 'https://schema.broadset.dev/v1/project.schema.json'],
  ['format', 'other-project'],
  ['schemaVersion', 1],
])('rejects invalid identity field %s', (field, value) => {
  expect(broadsetProjectV2Schema.safeParse({ ...createMinimalProjectV2(), [field]: value }).success).toBe(false);
});

it('rejects runtime UI state at the root', () => {
  expect(broadsetProjectV2Schema.safeParse({ ...createMinimalProjectV2(), viewport: { zoom: 2 } }).success).toBe(false);
});
```

- [ ] **Step 2: Verify aggregate tests fail**

Run: `npm run test -w @broadset/model -- src/v2/component.test.ts src/v2/project.test.ts src/v2/document.test.ts src/v2/interop.test.ts`

Expected: FAIL because aggregate modules are missing.

- [ ] **Step 3: Implement strict structural aggregates**

Component definitions own local elements, root IDs, completed Task 5 sequences, and typed exposed properties; nested component cycles remain a semantic check. Compose `ProjectResources` from Task 2 resource entities plus Task 5 output profiles. The project requires exact v2 identity, metadata, resources, at least one document, template groups, interop, and extensions. Documents require at least one page. Structural parsing must not call runtime registries, insert defaults, run v1 migrations, mutate values, or drop unknown fields. Enforce `updatedAt >= createdAt` structurally.

- [ ] **Step 4: Write the failing semantic-validation matrix**

Create one-fixture-one-defect cases for duplicate IDs, missing/wrong-kind resource references, non-preorder hierarchy, orphan parent, element cycle, component cycle, variable alias cycle, missing page root, orphan descendant override, invalid override pointer, missing binding field, incompatible binding result, missing sequence, duplicate track ID, out-of-duration key, invalid output profile, invalid interop target, and invalid template-group member.

Each case asserts a stable error code and JSON Pointer:

```ts
expect(validateBroadsetProjectV2Semantics(project)).toContainEqual(
  expect.objectContaining({ code: expectedCode, severity: 'error', pointer: expectedPointer }),
);
```

- [ ] **Step 5: Implement deterministic indexed validation passes**

Build immutable lookup maps once. Validate in this order: global identities, resources, hierarchy, components, variables, pages/overrides, view models/bindings, sequences/state/lifecycle, output profiles, template groups, interop. Sort diagnostics by pointer then code. The validator returns all independently establishable errors and never throws for structurally valid input.

- [ ] **Step 6: Verify and commit**

```bash
npm run test -w @broadset/model -- src/v2
npm run quality:strict -w @broadset/model
git add packages/model/src/v2
git commit -m "feat(model): validate v2 projects"
```

### Task 7: Implement Canonical JSON, Typed Loading, and Published JSON Schema

**Files:**

- Create: `packages/model/src/v2/canonical-json.ts`
- Create: `packages/model/src/v2/load.ts`
- Create: adjacent tests and `schema-parity.test.ts`
- Create: `scripts/generate-project-schema.mjs`
- Create: `scripts/generate-project-schema.test.mjs`
- Create: `project/schema/v2/project.schema.json`
- Modify: root `package.json`
- Modify: root `package-lock.json`
- Modify: `project/implementation/architecture.md`
- Modify: documentation checker and tests

**Interfaces:**

- Produces: `canonicalizeProjectV2`, `computeProjectSemanticHashV2`, `loadProjectV2Json`, `parseProjectV2Unknown`, `ProjectLoadResult`, and `npm run schema:project`.

- [ ] **Step 1: Write failing canonicalization and load tests**

```ts
it('canonicalizes independent object insertion orders identically', () => {
  const project = createMinimalProjectV2();
  const reparsed = broadsetProjectV2Schema.parse(JSON.parse(JSON.stringify(project)) as unknown);
  expect(canonicalizeProjectV2(project)).toBe(canonicalizeProjectV2(reparsed));
});

it('excludes non-semantic update/build metadata from semantic hashes', async () => {
  const first = createMinimalProjectV2();
  const second = {
    ...first,
    metadata: {
      ...first.metadata,
      updatedAt: '2026-07-10T09:00:00Z',
      generator: { name: 'Broadset', version: '2.0.0', build: 'other-build' },
    },
  };
  expect(await computeProjectSemanticHashV2(first)).toBe(await computeProjectSemanticHashV2(second));
});

it('quarantines v1 JSON without rewriting it', async () => {
  const source = '{"schemaVersion":1,"id":"legacy"}';
  const result = await loadProjectV2Json(source);
  expect(result.status).toBe('quarantined');
  expect(result.originalText).toBe(source);
  expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: 'unsupported-version' }));
});
```

- [ ] **Step 2: Verify failure**

Run: `npm run test -w @broadset/model -- src/v2/canonical-json.test.ts src/v2/load.test.ts`

Expected: FAIL because APIs are absent.

- [ ] **Step 3: Implement canonicalization and typed load results**

Implement RFC 8785-compatible key ordering and accepted-number serialization. The semantic projection removes only `metadata.updatedAt` and `metadata.generator.build`. Hash UTF-8 canonical bytes with Web Crypto SHA-256. Load diagnostics distinguish `invalid-json`, `unsupported-version`, `structural-invalid`, and `semantic-invalid`, and quarantine returns exact input text. No defaults or migrations run.

- [ ] **Step 4: Write failing schema-generation drift tests**

The Node test generates JSON Schema into a temporary directory and compares parsed JSON with the checked artifact. Documentation checks fail when the artifact is absent or `$id` differs from `https://schema.broadset.dev/v2/project.schema.json`.

- [ ] **Step 5: Implement deterministic schema generation**

Add this root script:

```json
{
  "schema:project": "npm run typecheck -w @broadset/model && node scripts/generate-project-schema.mjs"
}
```

Use Zod 4 `z.toJSONSchema`, JSON Schema 2020-12, exact `$id`, recursive key sorting, two-space JSON, and one trailing newline. Fail generation if a core object permits unknown properties. The parity corpus contains every positive/negative structural fixture from Tasks 2-6 and asserts equal Zod/JSON Schema outcomes.

Add Ajv as an explicit root development dependency and use its JSON Schema 2020-12 entry point; do not import the transitive copy supplied by commitlint:

```bash
npm install --save-dev ajv@^8.20.0
```

`scripts/generate-project-schema.mjs` imports `broadsetProjectV2Schema` from `packages/model/dist/v2/project.js` after the script's typecheck build. `schema-parity.test.ts` uses `Ajv2020` from `ajv/dist/2020.js` and compares Ajv acceptance with Zod acceptance for every corpus case.

Record Ajv's schema-parity purpose in `project/implementation/architecture.md` in the same change, then regenerate the manifest baseline with `npm run docs:architecture`.

- [ ] **Step 6: Verify and commit**

```bash
npm run schema:project
npm run docs:architecture
node --test scripts/generate-project-schema.test.mjs scripts/check-documentation.test.mjs
npm run docs:check
npm run test -w @broadset/model -- src/v2
npm run quality:strict -w @broadset/model
git add package.json package-lock.json scripts project/schema/v2 project/implementation/architecture.md packages/model/src/v2
git commit -m "feat(model): publish v2 project schema"
```

### Task 8: Publish the v2 API and Run the Foundation Gate

**Files:**

- Modify: `packages/model/src/v2/index.ts`
- Modify: `packages/model/src/index.ts`
- Modify: `packages/model/README.md`
- Modify: `project/spec/model/format-reference.md`
- Modify: `project/implementation/architecture.md`
- Create: `packages/model/src/v2/public-api.test.ts`
- Create: `packages/model/src/v2/format-roundtrip.test.ts`

**Interfaces:**

- Produces package-root exports: `BroadsetProjectV2`, `BroadsetDocumentV2`, `broadsetProjectV2Schema`, `validateBroadsetProjectV2Semantics`, `loadProjectV2Json`, `parseProjectV2Unknown`, `canonicalizeProjectV2`, and `computeProjectSemanticHashV2`.

- [ ] **Step 1: Write a failing package-root API test**

The test imports only from `../index`, builds the minimal fixture, parses, validates, canonicalizes, hashes, and reloads it. It must not import internal v2 modules.

- [ ] **Step 2: Verify failure**

Run: `npm run test -w @broadset/model -- src/v2/public-api.test.ts`

Expected: FAIL because package-root exports are incomplete.

- [ ] **Step 3: Complete barrels and public documentation**

Export every public symbol from the v2 barrel and add this line to the root barrel:

```ts
export * from './v2';
```

Document that v2 is the cutover target and current unversioned exports are deleted by program 8 rather than permanently aliased.

- [ ] **Step 4: Run complete verification**

```bash
npm run schema:project
npm run test -w @broadset/model -- src/v2
npm run docs:check
npm run quality:strict
npm run lint:typecoverage
npm run lint:dead
npm run build
```

Expected: schema regeneration is clean; all v2 tests pass; documentation and workspace strict quality pass; type coverage remains at least 99.95%; knip reports no new dead code/dependency drift; build succeeds.

- [ ] **Step 5: Perform the manual review gate**

Review the entire diff against `AGENTS.md`, `.claude/agents/code-reviewer.md`, and the approved design. Block completion for any v1 migration/alias, permissive core record, runtime default insertion, package-boundary violation, unstable identity, encoded transport string, missing barrel export, undocumented field, or untested discriminant.

- [ ] **Step 6: Commit**

```bash
git add packages/model/src/index.ts packages/model/src/v2 packages/model/README.md project/spec/model/format-reference.md project/implementation/architecture.md
git commit -m "feat(model): publish project format v2"
```

## Completion Boundary

This plan is complete when v2 project JSON can be strictly parsed, semantically validated, canonicalized, hashed, quarantined with typed diagnostics, checked against the published schema corpus, and consumed through the package root.

It does not authorize calling v2 the active application file format. That claim waits for programs 2-8 to migrate scene resolution, resources, playback, persistence, formats, editor/UI/demo, fixtures, and finally delete all v1 model code and migrations.
