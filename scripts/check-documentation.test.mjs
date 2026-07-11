import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  ARCHITECTURE_END_MARKER,
  ARCHITECTURE_START_MARKER,
  checkDocumentation,
  renderManifestBaseline,
  reportCrossSpecCheckActivation,
} from './check-documentation.mjs';
import { stripFencedCode } from './check-documentation-markdown.mjs';

async function createFixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'broadset-docs-'));
  await Promise.all([
    mkdir(path.join(root, 'project/implementation'), { recursive: true }),
    mkdir(path.join(root, 'project/schema/v1'), { recursive: true }),
    mkdir(path.join(root, 'packages/example'), { recursive: true }),
    mkdir(path.join(root, 'agents/instructions'), { recursive: true }),
  ]);
  await writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({
      engines: { node: '>=24.0.0' },
      workspaces: ['packages/*'],
      dependencies: { alpha: '^1.0.0' },
      devDependencies: { vitest: '^4.1.9' },
    }),
  );
  await writeFile(
    path.join(root, 'packages/example/package.json'),
    JSON.stringify({
      name: '@broadset/example',
      dependencies: { beta: '^2.0.0' },
      peerDependencies: { react: '^19.2.4' },
    }),
  );
  await writeFile(
    path.join(root, 'project/implementation/plan.md'),
    '# Plan\n\n| W0-GOV-01 | outcome | none | evidence |\n',
  );
  await writeFile(
    path.join(root, 'project/implementation/plan-progress.md'),
    '# Tracker\n\n| W0-GOV-01 | proposed | unassigned | none | — | — |\n',
  );
  await writeFile(
    path.join(root, 'project/schema/v1/project.schema.json'),
    JSON.stringify({ $id: 'https://schema.broadset.dev/v1/project.schema.json' }),
  );
  return root;
}

test('reports broken local Markdown links and malformed tables together', async () => {
  const root = await createFixture();
  await writeFile(
    path.join(root, 'README.md'),
    '# Docs\n\n[missing](./missing.md)\n\n| A | B |\n| --- | --- | --- |\n',
  );
  const baseline = await renderManifestBaseline(root);
  await writeFile(
    path.join(root, 'project/implementation/architecture.md'),
    `# Architecture\n\n${ARCHITECTURE_START_MARKER}\n${baseline}\n${ARCHITECTURE_END_MARKER}\n`,
  );

  const findings = await checkDocumentation(root);

  assert.ok(findings.some((finding) => finding.code === 'broken-local-link'));
  assert.ok(findings.some((finding) => finding.code === 'table-column-mismatch'));
});

test('reports malformed strict JSON code fences', async () => {
  const root = await createFixture();
  const baseline = await renderManifestBaseline(root);
  await writeFile(
    path.join(root, 'project/implementation/architecture.md'),
    `# Architecture\n\n${ARCHITECTURE_START_MARKER}\n${baseline}\n${ARCHITECTURE_END_MARKER}\n`,
  );
  await writeFile(path.join(root, 'README.md'), '# Data\n\n```json\n{ "missing": true, }\n```\n');

  const findings = await checkDocumentation(root);

  assert.ok(findings.some((finding) => finding.code === 'invalid-json-fence'));
});

test('reports a missing published v1 project schema', async () => {
  const root = await createFixture();
  await rm(path.join(root, 'project/schema/v1/project.schema.json'));

  const findings = await checkDocumentation(root);

  assert.ok(findings.some((finding) => finding.code === 'project-schema-missing'));
});

test('reports drift in the published v1 project schema identity', async () => {
  const root = await createFixture();
  await mkdir(path.join(root, 'project/schema/v1'), { recursive: true });
  await writeFile(
    path.join(root, 'project/schema/v1/project.schema.json'),
    JSON.stringify({ $id: 'https://schema.broadset.dev/v2/project.schema.json' }),
  );

  const findings = await checkDocumentation(root);

  assert.ok(findings.some((finding) => finding.code === 'project-schema-id-drift'));
});

test('reports malformed published v1 project schema JSON or shape', async () => {
  const root = await createFixture();
  await writeFile(path.join(root, 'project/schema/v1/project.schema.json'), '{');

  const malformedJsonFindings = await checkDocumentation(root);
  await writeFile(path.join(root, 'project/schema/v1/project.schema.json'), 'null');
  const malformedShapeFindings = await checkDocumentation(root);

  assert.ok(malformedJsonFindings.some((finding) => finding.code === 'project-schema-invalid'));
  assert.ok(malformedShapeFindings.some((finding) => finding.code === 'project-schema-invalid'));
});

test('reports removed phase workflow vocabulary in active guidance', async () => {
  const root = await createFixture();
  const baseline = await renderManifestBaseline(root);
  await writeFile(
    path.join(root, 'project/implementation/architecture.md'),
    `# Architecture\n\n${ARCHITECTURE_START_MARKER}\n${baseline}\n${ARCHITECTURE_END_MARKER}\n`,
  );
  await writeFile(
    path.join(root, 'agents/instructions/workflow.instructions.md'),
    '# Workflow\n\nOpen plan-phase-N.md and read Active Phase. Mark it [DONE].\n',
  );

  const findings = await checkDocumentation(root);

  assert.deepEqual(
    findings.filter((finding) => finding.code === 'stale-execution-guidance').map((finding) => finding.message),
    [
      'active guidance contains removed token "plan-phase-N.md"',
      'active guidance contains removed token "Active Phase"',
      'active guidance contains removed token "[DONE]"',
    ],
  );
});

test('reports literal references to removed execution documents', async () => {
  const root = await createFixture();
  const baseline = await renderManifestBaseline(root);
  await writeFile(
    path.join(root, 'project/implementation/architecture.md'),
    `# Architecture\n\n${ARCHITECTURE_START_MARKER}\n${baseline}\n${ARCHITECTURE_END_MARKER}\n`,
  );
  await writeFile(
    path.join(root, 'README.md'),
    '# Docs\n\nContinue from `project/implementation/io-prereqs-plan.md`.\n',
  );

  const findings = await checkDocumentation(root);

  assert.ok(
    findings.some(
      (finding) => finding.code === 'removed-document-reference' && finding.message.includes('io-prereqs-plan.md'),
    ),
  );
});

test('reports proposed contract ADRs that claim accepted behavioral authority', async () => {
  const root = await createFixture();
  await mkdir(path.join(root, 'project/implementation/decisions'), { recursive: true });
  await writeFile(
    path.join(root, 'project/implementation/decisions/ADR-003-006-time-duration.md'),
    '# ADR\n\nStatus: accepted\n\n## Decision\n\nReplace the timeline contract.\n',
  );

  const findings = await checkDocumentation(root);

  assert.ok(findings.some((finding) => finding.code === 'proposal-adr-claims-authority'));
});

test('reports contradictory animation, component, page, and reorder contracts', async () => {
  const root = await createFixture();
  await Promise.all([
    mkdir(path.join(root, 'project/spec/model'), { recursive: true }),
    mkdir(path.join(root, 'project/spec/editor'), { recursive: true }),
  ]);
  await writeFile(
    path.join(root, 'project/spec/model/spec.md'),
    '# Model\n\nStale entries referencing deleted elements MUST be silently ignored.\n',
  );
  await writeFile(
    path.join(root, 'project/spec/model/format-reference.md'),
    [
      '# Reference',
      '',
      'Stale animation entries MUST be rejected by validation.',
      'A descendant reference has a parent-relative transform.',
      '| `position` | `Vector3` | Yes | Position offset relative to canvas origin. |',
      '`componentRef` is valid only on a document-level `group` instance host.',
      '',
    ].join('\n'),
  );
  await writeFile(
    path.join(root, 'project/spec/model/components.md'),
    '# Components\n\nNested instances are valid in a component definition local element collection.\n',
  );
  await writeFile(
    path.join(root, 'project/spec/model/changes.md'),
    '# Changes\n\nReorder operations carry `oldBeforeId` and `newBeforeId`.\n',
  );
  await writeFile(
    path.join(root, 'project/spec/editor/collaboration.md'),
    '# Collaboration\n\nReversing two elements produces two `element:reorder` changes.\n',
  );

  const findings = await checkDocumentation(root);
  const codes = new Set(findings.map((finding) => finding.code));

  assert.ok(codes.has('cross-spec-animation-reference-drift'));
  assert.ok(codes.has('cross-spec-component-host-drift'));
  assert.ok(codes.has('cross-spec-page-coordinate-drift'));
  assert.ok(codes.has('cross-spec-reorder-semantics-drift'));
});

test('reports manifest baseline drift and accepts exact generated content', async () => {
  const root = await createFixture();
  await writeFile(
    path.join(root, 'project/implementation/architecture.md'),
    `# Architecture\n\n${ARCHITECTURE_START_MARKER}\nstale\n${ARCHITECTURE_END_MARKER}\n`,
  );

  const drifted = await checkDocumentation(root);
  assert.ok(drifted.some((finding) => finding.code === 'architecture-manifest-drift'));

  const baseline = await renderManifestBaseline(root);
  await writeFile(
    path.join(root, 'project/implementation/architecture.md'),
    `# Architecture\n\n${ARCHITECTURE_START_MARKER}\n${baseline}\n${ARCHITECTURE_END_MARKER}\n`,
  );

  const clean = await checkDocumentation(root);
  assert.equal(clean.length, 0);
});

test('skips link, table, and vocabulary scans inside fenced code blocks without shifting line numbers', async () => {
  const root = await createFixture();
  await writeFile(
    path.join(root, 'README.md'),
    [
      '# Docs',
      '',
      '```text',
      '[missing](./missing.md)',
      'Continue from io-prereqs-plan.md.',
      '```',
      '',
      '[also-missing](./absent.md)',
      '',
    ].join('\n'),
  );
  await writeFile(
    path.join(root, 'agents/instructions/workflow.instructions.md'),
    '# Workflow\n\n```md\nActive Phase example inside a fence.\n```\n',
  );

  const findings = await checkDocumentation(root);
  const brokenLinks = findings.filter((finding) => finding.code === 'broken-local-link');

  assert.equal(brokenLinks.length, 1);
  assert.equal(brokenLinks[0].line, 8);
  assert.ok(!findings.some((finding) => finding.code === 'removed-document-reference'));
  assert.ok(!findings.some((finding) => finding.code === 'stale-execution-guidance'));
});

test('stripFencedCode preserves the line structure of the document', () => {
  const body = 'a\n```js\ncode\n```\nb';

  const stripped = stripFencedCode(body);

  assert.equal(stripped.split('\n').length, body.split('\n').length);
  assert.equal(stripped, 'a\n\n\n\nb');
});

test('accepts markdown links that carry a quoted title', async () => {
  const root = await createFixture();
  await writeFile(
    path.join(root, 'README.md'),
    '# Docs\n\n[tracker](./project/implementation/plan-progress.md "The live tracker")\n',
  );

  const findings = await checkDocumentation(root);

  assert.ok(!findings.some((finding) => finding.code === 'broken-local-link'));
});

test('reports links that resolve outside the repository root', async () => {
  const root = await createFixture();
  await writeFile(path.join(root, 'README.md'), '# Docs\n\n[escape](../outside.md)\n');

  const findings = await checkDocumentation(root);

  assert.ok(findings.some((finding) => finding.code === 'broken-local-link'));
});

test('reports consecutive table separator rows', async () => {
  const root = await createFixture();
  await writeFile(path.join(root, 'README.md'), '# Docs\n\n| A |\n| --- |\n| --- |\n');

  const findings = await checkDocumentation(root);

  assert.ok(findings.some((finding) => finding.code === 'consecutive-table-separators'));
});

test('reports proposed ADRs that omit the non-override disclaimer', async () => {
  const root = await createFixture();
  await mkdir(path.join(root, 'project/implementation/decisions'), { recursive: true });
  await writeFile(
    path.join(root, 'project/implementation/decisions/ADR-007-components.md'),
    '# ADR\n\nStatus: proposed 2026-07-09\n\n## Decision\n\nComponents everywhere.\n',
  );

  const findings = await checkDocumentation(root);

  assert.ok(findings.some((finding) => finding.code === 'proposal-adr-claims-authority'));
});

test('requires a recognized status on every ADR and allows non-pinned accepted ADRs', async () => {
  const root = await createFixture();
  await mkdir(path.join(root, 'project/implementation/decisions'), { recursive: true });
  await writeFile(
    path.join(root, 'project/implementation/decisions/ADR-777-example.md'),
    '# ADR\n\nNo status line at all.\n',
  );
  await writeFile(
    path.join(root, 'project/implementation/decisions/ADR-888-example.md'),
    '# ADR\n\nStatus: accepted 2026-07-09\n\n## Decision\n\nRatified.\n',
  );

  const findings = await checkDocumentation(root);

  assert.ok(
    findings.some(
      (finding) => finding.code === 'adr-status-unparseable' && finding.file.includes('ADR-777-example.md'),
    ),
  );
  assert.ok(!findings.some((finding) => finding.file.includes('ADR-888-example.md')));
});

test('reports removed plan references inside package sources', async () => {
  const root = await createFixture();
  await mkdir(path.join(root, 'packages/example/src'), { recursive: true });
  await writeFile(
    path.join(root, 'packages/example/src/legacy.ts'),
    '// Tracked in cross-format-io-improvement-plan.md Phase 4.1.\nexport const legacy = true;\n',
  );

  const findings = await checkDocumentation(root);

  assert.ok(
    findings.some(
      (finding) => finding.code === 'removed-document-reference' && finding.file === 'packages/example/src/legacy.ts',
    ),
  );
});

test('pins the armed/dormant state of the cross-spec checks against this repository', async () => {
  // Three of the four cross-spec checks are dormant by design: their sentinel
  // phrases only exist in the proposed contract ADRs. If this test fails, a
  // sentinel phrase was reworded (silently disabling a check) or a proposal
  // landed in the specs (arming one) — update the checker deliberately.
  const repoRoot = path.resolve(fileURLToPath(import.meta.url), '../..');

  const activation = await reportCrossSpecCheckActivation(repoRoot);

  // Re-pinned for the project format v1 specs: the v1 contract docs arm the animation
  // reject-mode, component nested-instance, and page descendant-parent-relative checks that
  // were dormant on the pre-v1 baseline. docs:check validates these armed contracts pass.
  assert.deepEqual(activation, {
    animation: { modelMode: 'reject', referenceMode: 'reject' },
    componentHost: { nestedInstancesProposed: true, documentOnlyHostRule: false },
    pageCoordinates: {
      descendantParentRelative: true,
      canvasOriginPosition: false,
      rootVersusDescendantResolution: false,
    },
    reorderSemantics: { stableAnchorPayloads: false, twoReorderScenario: true, batchRelativeGuard: false },
  });
});
