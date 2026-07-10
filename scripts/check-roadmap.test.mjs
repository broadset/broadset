import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { checkRoadmap, computeFrontier, seedState } from './check-roadmap.mjs';

const REGISTRY = [
  '<!-- BEGIN MANAGED: INITIATIVE REGISTRY -->',
  '',
  '| ID         | Wave | Size | Title               | Dependencies      |',
  '| ---------- | ---- | ---- | ------------------- | ----------------- |',
  '| W0-GOV-01  | W0   | M    | Governance baseline | none              |',
  '| W1-TIME-01 | W1   | XL   | Time kernel         | W0-GOV-01/RFC-01  |',
  '',
  '<!-- END MANAGED: INITIATIVE REGISTRY -->',
].join('\n');

const INDEX = [
  '# Roadmap index',
  '',
  '| Gate       | Metric         | Target | Ceiling | Source |',
  '| ---------- | -------------- | ------ | ------- | ------ |',
  '| QG-PERF-01 | cold shell LCP | 1.8 s  | 2.5 s   | perf   |',
  '',
  REGISTRY,
  '',
].join('\n');

const WAVE_W0 = [
  '# Wave W0 — Foundations',
  '',
  '## W0-GOV-01 — Governance baseline (M)',
  '',
  '- **Dependencies:** none',
  '- **Definition:** Establish governance.',
  '- **Acceptance criteria:**',
  '  - [ ] audit passes and meets QG-PERF-01',
  '- **User-visible:** yes — faster editor shell',
  '',
].join('\n');

const WAVE_W1 = [
  '# Wave W1 — Kernels',
  '',
  '## W1-TIME-01 — Time kernel (XL)',
  '',
  '- **Dependencies:** W0-GOV-01/RFC-01',
  '- **Definition:** Build the time kernel.',
  '- **Acceptance criteria:**',
  '  - [ ] deterministic ticks',
  '- **User-visible:** yes — smooth scrubbing',
  '',
].join('\n');

const IMPL_W1 = [
  '# Wave W1 implementation plan',
  '',
  'Status: draft — re-sliced at the W0 phase exit',
  '',
  '## W1-TIME-01 tasks',
  '',
  '### T1 — kernel seam',
  '',
  '- Files: `packages/playback/src/kernel.ts` (new)',
  '',
  '| Slice        | Scope  | Proof | Rollback / evidence | Merge prerequisite |',
  '| ------------ | ------ | ----- | ------------------- | ------------------ |',
  '| W1-TIME-01.S1 | kernel | tests | revert slice        | none               |',
  '',
].join('\n');

const STATE = {
  version: 1,
  initiatives: {
    'W0-GOV-01': { phase: 'W0', status: 'discovery', pr: null, evidence: null },
    'W1-TIME-01': { phase: 'W1', status: 'discovery', pr: null, evidence: null },
  },
};

async function createFixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'broadset-roadmap-'));
  await mkdir(path.join(root, 'project/implementation/roadmap'), { recursive: true });
  const files = new Map([
    ['project/implementation/plan.md', INDEX],
    ['project/implementation/roadmap/wave-w0.md', WAVE_W0],
    ['project/implementation/roadmap/wave-w1.md', WAVE_W1],
    [
      'project/implementation/roadmap/impl-w0.md',
      '# Wave W0 implementation plan\n\n## W0-GOV-01 tasks\n\n### T1 — seed\n\n- Files: `scripts/x.mjs` (new)\n',
    ],
    ['project/implementation/roadmap/impl-w1.md', IMPL_W1],
    [
      'project/implementation/roadmap/rfc-register.md',
      '# RFC register\n\n| RFC    | Decision        | Status |\n| ------ | --------------- | ------ |\n| RFC-01 | Group container | open   |\n',
    ],
    ['project/implementation/roadmap/current-state.md', '# Current state\n\nLedger.\n'],
    ['project/implementation/roadmap/program.md', '# Extended program\n\nQuality bars.\n'],
    ['project/implementation/operating-loop.md', '# Operating loop\n\nLoop.\n'],
    [
      'project/implementation/directives.md',
      '# Directives\n\n## D-001 — 2026-07-10 — roadmap\n\n**Directive:** example.\n',
    ],
    ['project/implementation/program-state.json', `${JSON.stringify(STATE, null, 2)}\n`],
    ['project/implementation/decisions.md', '# Decisions\n\n- **IO-D-01 Runs, not HTML.**\n'],
  ]);
  for (const wave of ['w2', 'w3', 'w4', 'w5', 'w6']) {
    files.set(`project/implementation/roadmap/wave-${wave}.md`, `# Wave ${wave.toUpperCase()} — reserved\n`);
    files.set(
      `project/implementation/roadmap/impl-${wave}.md`,
      `# Wave ${wave.toUpperCase()} implementation plan\n\nStatus: draft\n`,
    );
  }
  for (const [relativePath, body] of files) {
    await writeFile(path.join(root, relativePath), body);
  }
  return root;
}

async function overwrite(root, relativePath, body) {
  await writeFile(path.join(root, relativePath), body);
}

async function codes(root) {
  return new Set((await checkRoadmap(root)).map((finding) => finding.code));
}

test('a structurally clean execution model produces zero findings', async () => {
  const root = await createFixture();
  assert.deepEqual(await checkRoadmap(root), []);
});

test('detects missing required files', async () => {
  const root = await createFixture();
  await rm(path.join(root, 'project/implementation/operating-loop.md'));
  assert.ok((await codes(root)).has('roadmap-file-missing'));
});

test('detects duplicate registry rows and duplicate definitions', async () => {
  const root = await createFixture();
  await overwrite(
    root,
    'project/implementation/plan.md',
    INDEX.replace(
      '| W0-GOV-01  | W0   | M    | Governance baseline | none              |',
      '| W0-GOV-01  | W0   | M    | Governance baseline | none              |\n| W0-GOV-01  | W0   | M    | Governance baseline | none              |',
    ),
  );
  assert.ok((await codes(root)).has('duplicate-registry-row'));

  const root2 = await createFixture();
  await overwrite(
    root2,
    'project/implementation/roadmap/wave-w0.md',
    `${WAVE_W0}\n${WAVE_W0.split('\n').slice(2).join('\n')}`,
  );
  assert.ok((await codes(root2)).has('duplicate-initiative-definition'));
});

test('requires registry and definitions to agree in both directions', async () => {
  const root = await createFixture();
  await overwrite(root, 'project/implementation/roadmap/wave-w0.md', '# Wave W0 — Foundations\n');
  assert.ok((await codes(root)).has('registry-definition-missing'));

  const rootNoUserVisible = await createFixture();
  await overwrite(
    rootNoUserVisible,
    'project/implementation/roadmap/wave-w0.md',
    WAVE_W0.replace('- **User-visible:** yes — faster editor shell\n', ''),
  );
  assert.ok((await codes(rootNoUserVisible)).has('wave-user-visible-missing'));

  const root2 = await createFixture();
  await overwrite(
    root2,
    'project/implementation/roadmap/wave-w0.md',
    WAVE_W0.replace('(M)', '(L)').replace('Governance baseline (L)', 'Governance rebaseline (L)'),
  );
  const found2 = await codes(root2);
  assert.ok(found2.has('registry-size-mismatch'));
  assert.ok(found2.has('registry-title-mismatch'));

  const root3 = await createFixture();
  await overwrite(
    root3,
    'project/implementation/roadmap/wave-w0.md',
    `${WAVE_W0}\n## W0-NEW-01 — Unregistered work (S)\n\n- **Dependencies:** none\n`,
  );
  assert.ok((await codes(root3)).has('definition-not-registered'));
});

test('detects wrong-wave placement, dependency-line count, and registry dependency drift', async () => {
  const root = await createFixture();
  await overwrite(
    root,
    'project/implementation/roadmap/wave-w0.md',
    `${WAVE_W0}\n## W1-EXTRA-01 — Misplaced (S)\n\n- **Dependencies:** none\n`,
  );
  assert.ok((await codes(root)).has('initiative-wrong-wave-file'));

  const root2 = await createFixture();
  await overwrite(
    root2,
    'project/implementation/roadmap/wave-w0.md',
    WAVE_W0.replace('- **Dependencies:** none\n', ''),
  );
  assert.ok((await codes(root2)).has('dependencies-line-count'));

  const root3 = await createFixture();
  await overwrite(root3, 'project/implementation/roadmap/wave-w1.md', WAVE_W1.replace('W0-GOV-01/RFC-01', 'W0-GOV-01'));
  assert.ok((await codes(root3)).has('registry-dependency-mismatch'));
});

test('validates dependency expressions, resolution, direction, self-reference, and cycles', async () => {
  const root = await createFixture();
  const swap = async (deps) => {
    await overwrite(root, 'project/implementation/plan.md', INDEX.replace('W0-GOV-01/RFC-01', deps));
    await overwrite(root, 'project/implementation/roadmap/wave-w1.md', WAVE_W1.replace('W0-GOV-01/RFC-01', deps));
  };
  await swap('all the things');
  assert.ok((await codes(root)).has('dependency-unparseable'));
  await swap('W0-MISSING-09');
  assert.ok((await codes(root)).has('dependency-unknown'));
  await swap('RFC-99');
  assert.ok((await codes(root)).has('dependency-unknown'));
  await swap('IO-D-99');
  assert.ok((await codes(root)).has('dependency-unknown'));
  await swap('W1-TIME-01');
  assert.ok((await codes(root)).has('dependency-self'));

  const root2 = await createFixture();
  await overwrite(
    root2,
    'project/implementation/plan.md',
    INDEX.replace(
      '| W0-GOV-01  | W0   | M    | Governance baseline | none              |',
      '| W0-GOV-01  | W0   | M    | Governance baseline | W1-TIME-01        |',
    ),
  );
  await overwrite(
    root2,
    'project/implementation/roadmap/wave-w0.md',
    WAVE_W0.replace('- **Dependencies:** none', '- **Dependencies:** W1-TIME-01'),
  );
  await overwrite(root2, 'project/implementation/roadmap/wave-w1.md', WAVE_W1.replace('W0-GOV-01/RFC-01', 'W0-GOV-01'));
  await overwrite(
    root2,
    'project/implementation/plan.md',
    INDEX.replace(
      '| W0-GOV-01  | W0   | M    | Governance baseline | none              |',
      '| W0-GOV-01  | W0   | M    | Governance baseline | W1-TIME-01        |',
    ).replace('W0-GOV-01/RFC-01', 'W0-GOV-01'),
  );
  const found = await codes(root2);
  assert.ok(found.has('dependency-later-phase'));
  assert.ok(found.has('dependency-cycle'));
});

test('requires implementation coverage and PR-slice tables for XL/XXL work', async () => {
  const root = await createFixture();
  await overwrite(root, 'project/implementation/roadmap/impl-w0.md', '# Wave W0 implementation plan\n');
  assert.ok((await codes(root)).has('impl-section-missing'));

  const root2 = await createFixture();
  await overwrite(root2, 'project/implementation/roadmap/impl-w1.md', IMPL_W1.split('| Slice')[0]);
  assert.ok((await codes(root2)).has('slice-table-missing'));

  const root3 = await createFixture();
  await overwrite(
    root3,
    'project/implementation/roadmap/impl-w0.md',
    '# Wave W0 implementation plan\n\n## W0-GOV-01 tasks\n\n## W0-GHOST-99 tasks\n',
  );
  assert.ok((await codes(root3)).has('impl-section-orphan'));
});

test('resolves quality-gate citations against the index gate table', async () => {
  const root = await createFixture();
  await overwrite(root, 'project/implementation/roadmap/wave-w0.md', WAVE_W0.replace('QG-PERF-01', 'QG-PERF-77'));
  assert.ok((await codes(root)).has('quality-gate-unresolved'));

  const root2 = await createFixture();
  await overwrite(
    root2,
    'project/implementation/plan.md',
    INDEX.replace('| QG-PERF-01 | cold shell LCP | 1.8 s  | 2.5 s   | perf   |\n', ''),
  );
  const found = await codes(root2);
  assert.ok(found.has('quality-gates-missing'));
  assert.ok(found.has('quality-gate-unresolved'));
});

test('reports broken relative links and word-budget violations in roadmap documents', async () => {
  const root = await createFixture();
  await overwrite(
    root,
    'project/implementation/roadmap/wave-w0.md',
    WAVE_W0.replace(
      '- **Definition:** Establish governance.',
      '- **Definition:** Establish [governance](./missing-file.md).',
    ),
  );
  assert.ok((await codes(root)).has('broken-local-link'));

  const root2 = await createFixture();
  await overwrite(root2, 'project/implementation/operating-loop.md', `# Operating loop\n\n${'word '.repeat(3600)}\n`);
  assert.ok((await codes(root2)).has('word-budget-exceeded'));
});

test('enforces program-state consistency: coverage, phases, statuses, and evidence', async () => {
  const root = await createFixture();
  await overwrite(root, 'project/implementation/program-state.json', 'not json\n');
  assert.ok((await codes(root)).has('state-unparseable'));

  const mutate = async (initiatives) => {
    const fresh = await createFixture();
    await overwrite(
      fresh,
      'project/implementation/program-state.json',
      `${JSON.stringify({ version: 1, initiatives }, null, 2)}\n`,
    );
    return codes(fresh);
  };
  assert.ok((await mutate({ 'W0-GOV-01': STATE.initiatives['W0-GOV-01'] })).has('state-entry-missing'));
  assert.ok(
    (
      await mutate({
        ...STATE.initiatives,
        'W9-GHOST-01': { phase: 'W9', status: 'discovery', pr: null, evidence: null },
      })
    ).has('state-entry-orphan'),
  );
  assert.ok(
    (
      await mutate({
        ...STATE.initiatives,
        'W0-GOV-01': { phase: 'W1', status: 'discovery', pr: null, evidence: null },
      })
    ).has('state-phase-mismatch'),
  );
  assert.ok(
    (
      await mutate({ ...STATE.initiatives, 'W0-GOV-01': { phase: 'W0', status: 'flying', pr: null, evidence: null } })
    ).has('state-status-invalid'),
  );
  assert.ok(
    (
      await mutate({
        ...STATE.initiatives,
        'W0-GOV-01': { phase: 'W0', status: 'implementing', pr: null, evidence: null },
      })
    ).has('state-evidence-missing'),
  );
});

test('rejects malformed directive headings', async () => {
  const root = await createFixture();
  await overwrite(root, 'project/implementation/directives.md', '# Directives\n\n## D-2 — sometime — vague\n');
  assert.ok((await codes(root)).has('directive-format'));
});

test('frontier reports ready, blocked, advance candidates, and active phase from shipped dependencies', async () => {
  const root = await createFixture();
  const frontier = await computeFrontier(root);
  assert.equal(frontier.activePhase, 'W0');
  assert.deepEqual(frontier.ready, ['W0-GOV-01']);
  assert.deepEqual(frontier.blocked, [{ id: 'W1-TIME-01', missingDependencies: ['W0-GOV-01', 'RFC-01'] }]);

  await overwrite(
    root,
    'project/implementation/program-state.json',
    `${JSON.stringify({ version: 1, initiatives: { ...STATE.initiatives, 'W0-GOV-01': { phase: 'W0', status: 'shipped', pr: 'https://example.invalid/pr/1', evidence: null } } }, null, 2)}\n`,
  );
  const afterShip = await computeFrontier(root);
  assert.equal(afterShip.activePhase, 'W1');
  assert.deepEqual(afterShip.blocked, [{ id: 'W1-TIME-01', missingDependencies: ['RFC-01'] }]);

  await overwrite(
    root,
    'project/implementation/roadmap/rfc-register.md',
    '# RFC register\n\n| RFC    | Decision        | Status              |\n| ------ | --------------- | ------------------- |\n| RFC-01 | Group container | ratified (ADR-0XX)  |\n',
  );
  const afterRatify = await computeFrontier(root);
  assert.deepEqual(afterRatify.ready, ['W1-TIME-01']);
});

test('frontier surfaces next-phase advance candidates while the active phase is open', async () => {
  const root = await createFixture();
  await overwrite(
    root,
    'project/implementation/roadmap/wave-w1.md',
    WAVE_W1.replace('- **Dependencies:** W0-GOV-01/RFC-01', '- **Dependencies:** none'),
  );
  await overwrite(root, 'project/implementation/plan.md', INDEX.replace('W0-GOV-01/RFC-01 ', 'none             '));
  const frontier = await computeFrontier(root);
  assert.equal(frontier.activePhase, 'W0');
  assert.deepEqual(frontier.ready, ['W0-GOV-01']);
  assert.deepEqual(frontier.advanceCandidates, ['W1-TIME-01']);
});

test('seed-state generates entries from the registry and preserves existing ones', async () => {
  const root = await createFixture();
  await rm(path.join(root, 'project/implementation/program-state.json'));
  const first = await seedState(root);
  assert.deepEqual(first, { seeded: 2, preserved: 0 });
  assert.deepEqual(await checkRoadmap(root), []);

  await overwrite(
    root,
    'project/implementation/program-state.json',
    `${JSON.stringify({ version: 1, initiatives: { 'W0-GOV-01': { phase: 'W0', status: 'approved', pr: null, evidence: null } } }, null, 2)}\n`,
  );
  const second = await seedState(root);
  assert.equal(second.seeded, 2);
  const body = JSON.parse(
    await (
      await import('node:fs/promises')
    ).readFile(path.join(root, 'project/implementation/program-state.json'), 'utf8'),
  );
  assert.equal(body.initiatives['W0-GOV-01'].status, 'approved');
  assert.equal(body.initiatives['W1-TIME-01'].status, 'discovery');
});

test('reports unparseable registry rows and missing managed markers', async () => {
  const root = await createFixture();
  await overwrite(
    root,
    'project/implementation/plan.md',
    INDEX.replace(
      '| W1-TIME-01 | W1   | XL   | Time kernel         | W0-GOV-01/RFC-01  |',
      '| W1-TIME-01 | W1   | XL   | Time kernel         | W0-GOV-01/RFC-01  |\n| W7-BAD-1   | W7   | M    | Out of enum         | none              |',
    ),
  );
  assert.ok((await codes(root)).has('registry-row-unparseable'));

  const root2 = await createFixture();
  await overwrite(
    root2,
    'project/implementation/plan.md',
    INDEX.replaceAll('MANAGED: INITIATIVE REGISTRY -->', 'x -->'),
  );
  assert.ok((await codes(root2)).has('registry-markers-missing'));
});

test('rejects program state that parses to a non-object', async () => {
  const root = await createFixture();
  await overwrite(root, 'project/implementation/program-state.json', 'null\n');
  assert.ok((await codes(root)).has('state-unparseable'));
});

test('flags dependents of stopped or superseded initiatives', async () => {
  const root = await createFixture();
  await overwrite(
    root,
    'project/implementation/program-state.json',
    `${JSON.stringify(
      {
        version: 1,
        initiatives: {
          'W0-GOV-01': { phase: 'W0', status: 'stopped', pr: null, evidence: 'stopped: replaced by nothing' },
          'W1-TIME-01': { phase: 'W1', status: 'discovery', pr: null, evidence: null },
        },
      },
      null,
      2,
    )}\n`,
  );
  assert.ok((await codes(root)).has('dependency-stopped'));
});

test('reports duplicate implementation sections', async () => {
  const root = await createFixture();
  await overwrite(
    root,
    'project/implementation/roadmap/impl-w0.md',
    '# Wave W0 implementation plan\n\n## W0-GOV-01 tasks\n\n## W0-GOV-01 tasks\n',
  );
  assert.ok((await codes(root)).has('impl-section-duplicate'));
});

test('ignores directive headings and QG citations inside fenced examples', async () => {
  const root = await createFixture();
  await overwrite(
    root,
    'project/implementation/directives.md',
    '# Directives\n\n```md\n## D-9 — malformed — example\n```\n\n## D-001 — 2026-07-10 — roadmap\n\n**Directive:** real.\n',
  );
  await overwrite(
    root,
    'project/implementation/roadmap/impl-w0.md',
    '# Wave W0 implementation plan\n\n## W0-GOV-01 tasks\n\n```md\nexample citing QG-FAKE-99\n```\n',
  );
  const found = await codes(root);
  assert.ok(!found.has('directive-format'));
  assert.ok(!found.has('quality-gate-unresolved'));
});

test('seed-state preserves orphaned lifecycle history instead of deleting it', async () => {
  const root = await createFixture();
  await overwrite(
    root,
    'project/implementation/program-state.json',
    `${JSON.stringify(
      {
        version: 1,
        initiatives: {
          'W0-OLD-99': { phase: 'W0', status: 'shipped', pr: 'https://example.invalid/pr/9', evidence: null },
        },
      },
      null,
      2,
    )}\n`,
  );
  const result = await seedState(root);
  assert.equal(result.preserved, 1);
  const saved = JSON.parse(
    await (
      await import('node:fs/promises')
    ).readFile(path.join(root, 'project/implementation/program-state.json'), 'utf8'),
  );
  assert.equal(saved.initiatives['W0-OLD-99'].status, 'shipped');
  assert.ok((await codes(root)).has('state-entry-orphan'));
});
