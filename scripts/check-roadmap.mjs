import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkMarkdownLinks, createFinding, stripFencedCode } from './check-documentation-markdown.mjs';
import {
  countWords,
  findMalformedDirectiveHeadings,
  findQualityGateCitations,
  isParseableDependencyExpression,
  parseDependencyTokens,
  parseImplementationSections,
  parseIoDecisionIds,
  parseQualityGateIds,
  parseRegistry,
  parseRfcRegister,
  parseWaveDefinitions,
  SIZES,
  STATUSES,
  STATUSES_REQUIRING_EVIDENCE,
  waveNumber,
} from './check-roadmap-parse.mjs';

export const WAVES = ['W0', 'W1', 'W2', 'W3', 'W4', 'W5', 'W6'];
export const WIP_LIMIT = 3;

const INDEX_FILE = 'project/implementation/plan.md';
const STATE_FILE = 'project/implementation/program-state.json';
const DIRECTIVES_FILE = 'project/implementation/directives.md';
const RUNBOOK_FILE = 'project/implementation/operating-loop.md';
const RFC_REGISTER_FILE = 'project/implementation/roadmap/rfc-register.md';
const CURRENT_STATE_FILE = 'project/implementation/roadmap/current-state.md';
const PROGRAM_FILE = 'project/implementation/roadmap/program.md';
const DECISIONS_FILE = 'project/implementation/decisions.md';

const WORD_BUDGETS = new Map([
  [INDEX_FILE, 4000],
  [RUNBOOK_FILE, 3500],
  ...WAVES.map((wave) => [waveFile(wave), 3500]),
]);

export function waveFile(wave) {
  return `project/implementation/roadmap/wave-${wave.toLowerCase()}.md`;
}

export function implFile(wave) {
  return `project/implementation/roadmap/impl-${wave.toLowerCase()}.md`;
}

async function readOptional(rootDir, relativePath) {
  try {
    return await readFile(path.join(rootDir, relativePath), 'utf8');
  } catch {
    return null;
  }
}

function findWaveDependencyCycles(registryById) {
  const graph = new Map(
    [...registryById.entries()].map(([id, row]) => [
      id,
      parseDependencyTokens(row.dependencies).filter((token) => token !== id && registryById.has(token)),
    ]),
  );
  const visited = new Set();
  const active = new Set();
  const stack = [];
  const cycles = new Map();

  function visit(id) {
    if (visited.has(id)) return;
    visited.add(id);
    active.add(id);
    stack.push(id);
    for (const dependency of graph.get(id) ?? []) {
      if (active.has(dependency)) {
        const cycle = [...stack.slice(stack.indexOf(dependency)), dependency];
        cycles.set([...new Set(cycle)].sort().join('|'), cycle);
      } else {
        visit(dependency);
      }
    }
    stack.pop();
    active.delete(id);
  }

  for (const id of [...graph.keys()].sort()) visit(id);
  return [...cycles.values()];
}

async function loadModel(rootDir) {
  const files = new Map();
  const requiredFiles = [
    INDEX_FILE,
    STATE_FILE,
    DIRECTIVES_FILE,
    RUNBOOK_FILE,
    RFC_REGISTER_FILE,
    CURRENT_STATE_FILE,
    PROGRAM_FILE,
    DECISIONS_FILE,
    ...WAVES.map(waveFile),
    ...WAVES.map(implFile),
  ];
  for (const relativePath of requiredFiles) {
    files.set(relativePath, await readOptional(rootDir, relativePath));
  }
  return files;
}

/**
 * Structural audit for the autonomous execution model: the roadmap index
 * registry, wave definition files, implementation plans, RFC/IO-D decision
 * registries, program state, directives channel, and word budgets must agree
 * with each other before any agent may act on them.
 */
export async function checkRoadmap(rootDir) {
  const absoluteRoot = path.resolve(rootDir);
  const files = await loadModel(absoluteRoot);
  const findings = [];

  for (const [relativePath, body] of files) {
    if (body === null) {
      findings.push(createFinding(relativePath, 1, 'roadmap-file-missing', 'required execution-model file is missing'));
    }
  }
  const indexBody = files.get(INDEX_FILE);
  if (indexBody === null) return sortFindings(findings);

  const { rows: registryRows, invalidRows, markersPresent } = parseRegistry(indexBody);
  if (!markersPresent) {
    findings.push(
      createFinding(
        INDEX_FILE,
        1,
        'registry-markers-missing',
        'the index is missing the MANAGED: INITIATIVE REGISTRY markers',
      ),
    );
  }
  for (const invalid of invalidRows) {
    findings.push(
      createFinding(
        INDEX_FILE,
        invalid.line,
        'registry-row-unparseable',
        `registry row starts with "${invalid.cell}", which is not a valid initiative ID`,
      ),
    );
  }
  const registryById = new Map();
  for (const row of registryRows) {
    if (registryById.has(row.id)) {
      findings.push(
        createFinding(
          INDEX_FILE,
          row.line,
          'duplicate-registry-row',
          `initiative ${row.id} appears twice in the registry`,
        ),
      );
    } else {
      registryById.set(row.id, row);
    }
  }
  if (registryRows.length === 0) {
    findings.push(createFinding(INDEX_FILE, 1, 'registry-empty', 'the index contains no initiative registry rows'));
  }

  const qualityGateIds = parseQualityGateIds(indexBody);
  if (qualityGateIds.size === 0) {
    findings.push(createFinding(INDEX_FILE, 1, 'quality-gates-missing', 'the index defines no QG-* quality gates'));
  }

  const rfcBody = files.get(RFC_REGISTER_FILE);
  const rfcRows = rfcBody === null ? [] : parseRfcRegister(rfcBody);
  const rfcById = new Map(rfcRows.map((row) => [row.id, row]));
  const decisionsBody = files.get(DECISIONS_FILE);
  const ioDecisionIds = decisionsBody === null ? new Set() : parseIoDecisionIds(decisionsBody);

  const definitionsById = new Map();
  for (const wave of WAVES) {
    const body = files.get(waveFile(wave));
    if (body === null) continue;
    const definitions = parseWaveDefinitions(body);
    let userVisibleCount = 0;
    for (const definition of definitions) {
      if (definitionsById.has(definition.id)) {
        findings.push(
          createFinding(
            waveFile(wave),
            definition.line,
            'duplicate-initiative-definition',
            `initiative ${definition.id} is defined more than once across wave files`,
          ),
        );
        continue;
      }
      definitionsById.set(definition.id, { ...definition, file: waveFile(wave), wave });
      if (definition.userVisible) userVisibleCount += 1;
      if (!definition.id.startsWith(`${wave}-`)) {
        findings.push(
          createFinding(
            waveFile(wave),
            definition.line,
            'initiative-wrong-wave-file',
            `initiative ${definition.id} is defined in the ${wave} wave file`,
          ),
        );
      }
      if (definition.dependencyLineCount !== 1) {
        findings.push(
          createFinding(
            waveFile(wave),
            definition.line,
            'dependencies-line-count',
            `initiative ${definition.id} must carry exactly one Dependencies line, found ${definition.dependencyLineCount}`,
          ),
        );
      }
    }
    if (definitions.length > 0 && userVisibleCount === 0) {
      findings.push(
        createFinding(
          waveFile(wave),
          1,
          'wave-user-visible-missing',
          `wave ${wave} ships no user-visible improvement (no "User-visible: yes" line)`,
        ),
      );
    }
  }

  for (const [id, row] of registryById) {
    const definition = definitionsById.get(id);
    if (!definition) {
      findings.push(
        createFinding(
          INDEX_FILE,
          row.line,
          'registry-definition-missing',
          `registry initiative ${id} has no wave-file definition`,
        ),
      );
      continue;
    }
    if (row.wave !== definition.wave || !id.startsWith(`${row.wave}-`)) {
      findings.push(
        createFinding(
          INDEX_FILE,
          row.line,
          'registry-wave-mismatch',
          `registry wave "${row.wave}" disagrees with ${definition.file}`,
        ),
      );
    }
    if (row.size !== definition.size || !SIZES.includes(row.size)) {
      findings.push(
        createFinding(
          INDEX_FILE,
          row.line,
          'registry-size-mismatch',
          `registry size "${row.size}" disagrees with definition "${definition.size}"`,
        ),
      );
    }
    if (row.title !== definition.title) {
      findings.push(
        createFinding(
          INDEX_FILE,
          row.line,
          'registry-title-mismatch',
          `registry title "${row.title}" disagrees with definition "${definition.title}"`,
        ),
      );
    }
    if (definition.dependencies !== null && row.dependencies !== definition.dependencies) {
      findings.push(
        createFinding(
          INDEX_FILE,
          row.line,
          'registry-dependency-mismatch',
          `registry dependencies "${row.dependencies}" disagree with definition "${definition.dependencies}"`,
        ),
      );
    }
  }
  for (const [id, definition] of definitionsById) {
    if (!registryById.has(id)) {
      findings.push(
        createFinding(
          definition.file,
          definition.line,
          'definition-not-registered',
          `initiative ${id} is missing from the index registry`,
        ),
      );
    }
  }

  for (const [id, row] of registryById) {
    if (!isParseableDependencyExpression(row.dependencies)) {
      findings.push(
        createFinding(
          INDEX_FILE,
          row.line,
          'dependency-unparseable',
          `${id} dependencies must be "none" or slash-separated W/RFC/IO-D IDs, received "${row.dependencies}"`,
        ),
      );
      continue;
    }
    for (const token of parseDependencyTokens(row.dependencies)) {
      if (token === id) {
        findings.push(createFinding(INDEX_FILE, row.line, 'dependency-self', `${id} depends on itself`));
      } else if (token.startsWith('RFC-')) {
        if (!rfcById.has(token)) {
          findings.push(
            createFinding(
              INDEX_FILE,
              row.line,
              'dependency-unknown',
              `${id} depends on ${token}, absent from ${RFC_REGISTER_FILE}`,
            ),
          );
        }
      } else if (token.startsWith('IO-D-')) {
        if (!ioDecisionIds.has(token)) {
          findings.push(
            createFinding(
              INDEX_FILE,
              row.line,
              'dependency-unknown',
              `${id} depends on ${token}, absent from ${DECISIONS_FILE}`,
            ),
          );
        }
      } else if (!registryById.has(token)) {
        findings.push(
          createFinding(INDEX_FILE, row.line, 'dependency-unknown', `${id} depends on unknown initiative ${token}`),
        );
      } else if ((waveNumber(token) ?? 0) > (waveNumber(id) ?? 0)) {
        findings.push(
          createFinding(
            INDEX_FILE,
            row.line,
            'dependency-later-phase',
            `${id} depends on later-phase initiative ${token}`,
          ),
        );
      }
    }
  }
  for (const cycle of findWaveDependencyCycles(registryById)) {
    findings.push(
      createFinding(
        INDEX_FILE,
        registryById.get(cycle[0]).line,
        'dependency-cycle',
        `dependency cycle: ${cycle.join(' -> ')}`,
      ),
    );
  }

  for (const wave of WAVES) {
    const body = files.get(implFile(wave));
    if (body === null) continue;
    const sections = parseImplementationSections(body);
    const sectionsById = new Map();
    for (const section of sections) {
      if (sectionsById.has(section.id)) {
        findings.push(
          createFinding(
            implFile(wave),
            section.line,
            'impl-section-duplicate',
            `duplicate "## ${section.id} tasks" section`,
          ),
        );
        continue;
      }
      sectionsById.set(section.id, section);
    }
    for (const [id, row] of registryById) {
      if (row.wave !== wave) continue;
      const section = sectionsById.get(id);
      if (!section) {
        findings.push(
          createFinding(implFile(wave), 1, 'impl-section-missing', `initiative ${id} has no "## ${id} tasks" section`),
        );
        continue;
      }
      if ((row.size === 'XL' || row.size === 'XXL') && !section.hasSliceTable) {
        findings.push(
          createFinding(
            implFile(wave),
            section.line,
            'slice-table-missing',
            `${row.size} initiative ${id} has no PR-slice table`,
          ),
        );
      }
    }
    for (const section of sections) {
      if (!registryById.has(section.id)) {
        findings.push(
          createFinding(
            implFile(wave),
            section.line,
            'impl-section-orphan',
            `implementation section ${section.id} has no registry row`,
          ),
        );
      }
    }
  }

  const citationScope = [
    INDEX_FILE,
    RUNBOOK_FILE,
    CURRENT_STATE_FILE,
    RFC_REGISTER_FILE,
    PROGRAM_FILE,
    ...WAVES.map(waveFile),
    ...WAVES.map(implFile),
  ];
  for (const relativePath of citationScope) {
    const body = files.get(relativePath);
    if (body === null) continue;
    for (const citation of findQualityGateCitations(stripFencedCode(body))) {
      if (!qualityGateIds.has(citation.id)) {
        findings.push(
          createFinding(
            relativePath,
            citation.line,
            'quality-gate-unresolved',
            `cited quality gate ${citation.id} is not defined in the index`,
          ),
        );
      }
    }
    findings.push(...checkMarkdownLinks(absoluteRoot, path.join(absoluteRoot, relativePath), stripFencedCode(body)));
  }

  for (const [relativePath, budget] of WORD_BUDGETS) {
    const body = files.get(relativePath);
    if (body === null) continue;
    const words = countWords(body);
    if (words > budget) {
      findings.push(
        createFinding(relativePath, 1, 'word-budget-exceeded', `${words} words exceeds the ${budget}-word budget`),
      );
    }
  }

  const stateBody = files.get(STATE_FILE);
  if (stateBody !== null) {
    let state = null;
    try {
      state = JSON.parse(stateBody);
    } catch (error) {
      findings.push(
        createFinding(
          STATE_FILE,
          1,
          'state-unparseable',
          `program state is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
    const parseFailed = state === null && findings.some((finding) => finding.code === 'state-unparseable');
    const stateIsObject = state !== null && typeof state === 'object' && !Array.isArray(state);
    const entries = stateIsObject ? (state.initiatives ?? null) : null;
    const entriesAreObject = entries !== null && typeof entries === 'object' && !Array.isArray(entries);
    if (!parseFailed && !entriesAreObject) {
      findings.push(
        createFinding(STATE_FILE, 1, 'state-unparseable', 'program state must carry an "initiatives" object'),
      );
    } else if (entriesAreObject) {
      for (const [id, row] of registryById) {
        const entry = entries[id];
        if (!entry) {
          findings.push(
            createFinding(STATE_FILE, 1, 'state-entry-missing', `initiative ${id} has no program-state entry`),
          );
          continue;
        }
        if (entry.phase !== row.wave) {
          findings.push(
            createFinding(
              STATE_FILE,
              1,
              'state-phase-mismatch',
              `${id} phase "${entry.phase}" disagrees with registry wave "${row.wave}"`,
            ),
          );
        }
        if (!STATUSES.includes(entry.status)) {
          findings.push(
            createFinding(
              STATE_FILE,
              1,
              'state-status-invalid',
              `${id} status "${entry.status}" is not a valid status`,
            ),
          );
        }
        if (STATUSES_REQUIRING_EVIDENCE.includes(entry.status) && !entry.pr && !entry.evidence) {
          findings.push(
            createFinding(
              STATE_FILE,
              1,
              'state-evidence-missing',
              `${id} status "${entry.status}" requires a pr or evidence link`,
            ),
          );
        }
      }
      for (const id of Object.keys(entries)) {
        if (!registryById.has(id)) {
          findings.push(
            createFinding(STATE_FILE, 1, 'state-entry-orphan', `program-state entry ${id} has no registry row`),
          );
        }
      }
      const closedStatuses = new Set(['stopped', 'superseded']);
      for (const [id, row] of registryById) {
        if (closedStatuses.has(entries[id]?.status)) continue;
        for (const token of parseDependencyTokens(row.dependencies)) {
          if (closedStatuses.has(entries[token]?.status)) {
            findings.push(
              createFinding(
                STATE_FILE,
                1,
                'dependency-stopped',
                `${id} depends on ${token}, whose status is ${entries[token].status}; re-route or stop the dependent`,
              ),
            );
          }
        }
      }
    }
  }

  const directivesBody = files.get(DIRECTIVES_FILE);
  if (directivesBody !== null) {
    for (const malformed of findMalformedDirectiveHeadings(stripFencedCode(directivesBody))) {
      findings.push(
        createFinding(
          DIRECTIVES_FILE,
          malformed.line,
          'directive-format',
          `directive heading does not match "## D-### — YYYY-MM-DD — scope": ${malformed.heading}`,
        ),
      );
    }
  }

  return sortFindings(findings);
}

function sortFindings(findings) {
  return findings.sort(
    (left, right) =>
      left.file.localeCompare(right.file) || left.line - right.line || left.code.localeCompare(right.code),
  );
}

function rfcSatisfied(row) {
  return /^ratified/iu.test(row?.status ?? '');
}

/**
 * The frontier is only meaningful over a structurally clean roadmap: ready =
 * every dependency shipped/ratified and the initiative sits in the active
 * phase; one advance slot may be taken from the next phase per the index
 * execution rules.
 */
export async function computeFrontier(rootDir) {
  const absoluteRoot = path.resolve(rootDir);
  const files = await loadModel(absoluteRoot);
  const registry = parseRegistry(files.get(INDEX_FILE) ?? '').rows;
  const parsedState = JSON.parse(files.get(STATE_FILE) ?? '{}');
  const state =
    parsedState !== null && typeof parsedState === 'object' && !Array.isArray(parsedState) ?
      (parsedState.initiatives ?? {})
    : {};
  const rfcById = new Map(parseRfcRegister(files.get(RFC_REGISTER_FILE) ?? '').map((row) => [row.id, row]));
  const shipped = new Set(registry.filter(({ id }) => state[id]?.status === 'shipped').map(({ id }) => id));
  const closed = new Set(['shipped', 'stopped', 'superseded']);

  const openWaves = registry
    .filter(({ id }) => !closed.has(state[id]?.status))
    .map(({ wave }) => waveNumber(wave))
    .filter((value) => value !== null);
  const activePhase = openWaves.length === 0 ? null : `W${Math.min(...openWaves)}`;
  const nextPhase = activePhase === null ? null : `W${Math.min(waveNumber(activePhase) + 1, 6)}`;

  const frontier = {
    activePhase,
    wipLimit: WIP_LIMIT,
    shipped: shipped.size,
    ready: [],
    advanceCandidates: [],
    inProgress: [],
    measuring: [],
    blocked: [],
  };
  for (const row of registry) {
    const status = state[row.id]?.status ?? 'discovery';
    if (status === 'implementing') frontier.inProgress.push(row.id);
    if (status === 'measuring') frontier.measuring.push(row.id);
    if (status !== 'discovery' && status !== 'approved') continue;
    const missing = parseDependencyTokens(row.dependencies).filter((token) => {
      if (token.startsWith('RFC-')) return !rfcSatisfied(rfcById.get(token));
      // IO-D decisions are ratified by definition (decisions.md); the audit validates their existence.
      if (token.startsWith('IO-D-')) return false;
      return !shipped.has(token);
    });
    if (missing.length > 0) {
      frontier.blocked.push({ id: row.id, missingDependencies: missing });
    } else if (row.wave === activePhase) {
      frontier.ready.push(row.id);
    } else if (row.wave === nextPhase) {
      frontier.advanceCandidates.push(row.id);
    } else {
      frontier.blocked.push({ id: row.id, missingDependencies: [`phase ${row.wave} not active`] });
    }
  }
  return frontier;
}

/** Seeds program-state.json from the registry; existing entries are preserved verbatim. */
export async function seedState(rootDir) {
  const absoluteRoot = path.resolve(rootDir);
  const registry = parseRegistry((await readOptional(absoluteRoot, INDEX_FILE)) ?? '').rows;
  if (registry.length === 0) throw new Error('cannot seed program state: the index registry is empty');
  const existingBody = await readOptional(absoluteRoot, STATE_FILE);
  const existing = existingBody === null ? {} : (JSON.parse(existingBody).initiatives ?? {});
  const initiatives = {};
  for (const row of registry) {
    initiatives[row.id] = existing[row.id] ?? { phase: row.wave, status: 'discovery', pr: null, evidence: null };
  }
  // Entries without a registry row (renamed or removed initiatives) are
  // lifecycle history — carry them through; the state-entry-orphan audit flags
  // them for explicit human resolution instead of silent deletion.
  for (const [id, entry] of Object.entries(existing)) {
    if (!initiatives[id]) initiatives[id] = entry;
  }
  const state = {
    version: 1,
    note: 'Generated by `npm run roadmap:seed-state` from the plan.md registry. Statuses change only via PRs; beyond approved a pr or evidence link is required.',
    initiatives,
  };
  await writeFile(path.join(absoluteRoot, STATE_FILE), `${JSON.stringify(state, null, 2)}\n`);
  return {
    seeded: registry.length,
    preserved: Object.keys(existing).filter((id) => initiatives[id] === existing[id]).length,
  };
}

function formatFinding(finding) {
  return `${finding.file}:${finding.line} — ${finding.code}: ${finding.message}`;
}

async function main() {
  const rootDir = process.cwd();
  if (process.argv.includes('--seed-state')) {
    const { seeded, preserved } = await seedState(rootDir);
    console.log(`Program state seeded: ${seeded} initiatives (${preserved} pre-existing entries preserved).`);
    return;
  }
  const findings = await checkRoadmap(rootDir);
  if (findings.length > 0) {
    for (const finding of findings) console.error(formatFinding(finding));
    console.error(`Roadmap execution-model audit failed with ${findings.length} finding(s).`);
    process.exitCode = 1;
    return;
  }
  if (process.argv.includes('--frontier')) {
    console.log(JSON.stringify(await computeFrontier(rootDir), null, 2));
    return;
  }
  console.log('Roadmap execution-model audit passed.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
