import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  ARCHITECTURE_END_MARKER,
  ARCHITECTURE_START_MARKER,
  checkDocumentation,
  renderManifestBaseline,
} from './check-documentation.mjs';

async function createFixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'broadset-docs-'));
  await Promise.all([
    mkdir(path.join(root, 'project/implementation'), { recursive: true }),
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

test('requires every roadmap initiative definition to have a tracker row', async () => {
  const root = await createFixture();
  const baseline = await renderManifestBaseline(root);
  await writeFile(
    path.join(root, 'project/implementation/architecture.md'),
    `# Architecture\n\n${ARCHITECTURE_START_MARKER}\n${baseline}\n${ARCHITECTURE_END_MARKER}\n`,
  );
  await writeFile(
    path.join(root, 'project/implementation/plan.md'),
    '# Plan\n\n| W0-GOV-01 | outcome | none | evidence |\n| W1-TIME-01 | outcome | W0-GOV-01 | evidence |\n',
  );

  const findings = await checkDocumentation(root);

  assert.ok(
    findings.some(
      (finding) => finding.code === 'initiative-missing-tracker-row' && finding.message.includes('W1-TIME-01'),
    ),
  );
});

test('recognizes alphanumeric initiative domains when checking tracker coverage', async () => {
  const root = await createFixture();
  await writeFile(
    path.join(root, 'project/implementation/plan.md'),
    '# Plan\n\n| W2-A11Y-01 | outcome | none | evidence |\n',
  );

  const findings = await checkDocumentation(root);

  assert.ok(
    findings.some(
      (finding) => finding.code === 'initiative-missing-tracker-row' && finding.message.includes('W2-A11Y-01'),
    ),
  );
});

test('rejects initiative dependencies that are absent from the roadmap', async () => {
  const root = await createFixture();
  await writeFile(
    path.join(root, 'project/implementation/plan.md'),
    '# Plan\n\n| W0-GOV-01 | outcome | W1-MISSING-01 | evidence |\n',
  );
  await writeFile(
    path.join(root, 'project/implementation/plan-progress.md'),
    '# Tracker\n\n| W0-GOV-01 | proposed | unassigned | W1-MISSING-01 | — | — |\n',
  );

  const findings = await checkDocumentation(root);

  assert.ok(
    findings.some(
      (finding) => finding.code === 'initiative-dependency-unknown' && finding.message.includes('W1-MISSING-01'),
    ),
  );
});

test('rejects prose dependency expressions that the roadmap graph cannot validate', async () => {
  const root = await createFixture();
  await writeFile(
    path.join(root, 'project/implementation/plan.md'),
    '# Plan\n\n| W0-GOV-01 | outcome | all foundations | evidence |\n',
  );
  await writeFile(
    path.join(root, 'project/implementation/plan-progress.md'),
    '# Tracker\n\n| W0-GOV-01 | proposed | unassigned | all foundations | — | — |\n',
  );

  const findings = await checkDocumentation(root);

  assert.ok(findings.some((finding) => finding.code === 'initiative-dependency-unparseable'));
});

test('rejects initiative self-dependencies', async () => {
  const root = await createFixture();
  await writeFile(
    path.join(root, 'project/implementation/plan.md'),
    '# Plan\n\n| W0-GOV-01 | outcome | W0-GOV-01 | evidence |\n',
  );
  await writeFile(
    path.join(root, 'project/implementation/plan-progress.md'),
    '# Tracker\n\n| W0-GOV-01 | proposed | unassigned | W0-GOV-01 | — | — |\n',
  );

  const findings = await checkDocumentation(root);

  assert.ok(findings.some((finding) => finding.code === 'initiative-dependency-self'));
});

test('rejects cycles in the initiative dependency graph', async () => {
  const root = await createFixture();
  await writeFile(
    path.join(root, 'project/implementation/plan.md'),
    [
      '# Plan',
      '',
      '| W0-GOV-01 | outcome | W1-TIME-01 | evidence |',
      '| W1-TIME-01 | outcome | W0-GOV-01 | evidence |',
      '',
    ].join('\n'),
  );
  await writeFile(
    path.join(root, 'project/implementation/plan-progress.md'),
    [
      '# Tracker',
      '',
      '| W0-GOV-01 | proposed | unassigned | W1-TIME-01 | — | — |',
      '| W1-TIME-01 | proposed | unassigned | W0-GOV-01 | — | — |',
      '',
    ].join('\n'),
  );

  const findings = await checkDocumentation(root);

  assert.ok(
    findings.some((finding) => finding.code === 'initiative-dependency-cycle' && finding.message.includes('W0-GOV-01')),
  );
});

test('requires a one-to-one roadmap register with matching dependencies', async () => {
  const root = await createFixture();
  const baseline = await renderManifestBaseline(root);
  await writeFile(
    path.join(root, 'project/implementation/architecture.md'),
    `# Architecture\n\n${ARCHITECTURE_START_MARKER}\n${baseline}\n${ARCHITECTURE_END_MARKER}\n`,
  );
  await writeFile(
    path.join(root, 'project/implementation/plan-progress.md'),
    '# Tracker\n\n| W0-GOV-01 | proposed | unassigned | RFC-99 | — | — |\n| W1-TIME-01 | proposed | unassigned | W0-GOV-01 | — | — |\n',
  );

  const findings = await checkDocumentation(root);

  assert.ok(findings.some((finding) => finding.code === 'initiative-dependency-drift'));
  assert.ok(findings.some((finding) => finding.code === 'initiative-not-in-roadmap'));
});

test('enforces lifecycle metadata for executable and evidenced initiatives', async () => {
  const root = await createFixture();
  const baseline = await renderManifestBaseline(root);
  await writeFile(
    path.join(root, 'project/implementation/architecture.md'),
    `# Architecture\n\n${ARCHITECTURE_START_MARKER}\n${baseline}\n${ARCHITECTURE_END_MARKER}\n`,
  );
  await writeFile(
    path.join(root, 'project/implementation/plan-progress.md'),
    '# Tracker\n\n| W0-GOV-01 | ready | unassigned | none | — | — |\n',
  );

  const findings = await checkDocumentation(root);

  assert.ok(findings.some((finding) => finding.code === 'initiative-dri-required'));
  assert.ok(findings.some((finding) => finding.code === 'initiative-child-plan-required'));
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
