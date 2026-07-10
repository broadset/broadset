import { statSync } from 'node:fs';
import { access, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ARCHITECTURE_START_MARKER = '<!-- BEGIN GENERATED: MANIFEST BASELINE -->';
export const ARCHITECTURE_END_MARKER = '<!-- END GENERATED: MANIFEST BASELINE -->';

const ACTIVE_GUIDANCE_FILES = new Set([
  'AGENTS.md',
  'CONTRIBUTING.md',
  'agents/ralph.agent.md',
  'agents/instructions/testing.instructions.md',
  'agents/instructions/ways-of-working.instructions.md',
  'agents/instructions/workflow.instructions.md',
  'project/implementation/README.md',
  'project/implementation/plan-progress.md',
  'project/implementation/production-readiness-status.md',
  'project/implementation/coverage-baseline.md',
  'project/implementation/coverage-reporting.md',
]);

const REMOVED_EXECUTION_TOKENS = [
  'plan-phase-N.md',
  'plan-phase-1.md',
  'plan-phase-5.md',
  'Active Phase',
  '[DONE]',
  'W0–W5',
  'W0-W5',
  'QE-10',
];

const REMOVED_EXECUTION_DOCUMENTS = [
  'coverage-thresholds-proposal.md',
  'cross-format-io-improvement-plan.md',
  'editor-preview-runtime-separation.md',
  'io-prereqs-plan.md',
  'main-integration-plan.md',
  'package-split.md',
  'pdf-pdfa-compliance-plan.md',
  'pdf-support-plan.md',
  'pptx-support-plan.md',
  'psd-support-plan.md',
  'renderer-refactor-plan.md',
  'svg-support-plan.md',
  'test-improvement-plan.md',
];

const PROPOSED_CONTRACT_ADRS = [
  'project/implementation/decisions/ADR-003-006-time-duration.md',
  'project/implementation/decisions/ADR-007-components.md',
  'project/implementation/decisions/ADR-008-bsp-persistence.md',
  'project/implementation/decisions/ADR-010-resolved-scene-pages.md',
  'project/implementation/decisions/ADR-011-collaboration-changes.md',
  'project/implementation/decisions/ADR-IO-014-016-preflight-loss.md',
];

const IGNORED_DIRECTORIES = new Set(['.git', 'coverage', 'dist', 'node_modules']);

function normalizeRelative(rootDir, filePath) {
  return path.relative(rootDir, filePath).split(path.sep).join('/');
}

async function pathExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function discoverMarkdownFiles(rootDir, currentDir = rootDir) {
  const entries = await readdir(currentDir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) continue;
    const entryPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await discoverMarkdownFiles(rootDir, entryPath)));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(entryPath);
    }
  }
  return files.sort();
}

function lineNumberAt(body, index) {
  return body.slice(0, index).split('\n').length;
}

function createFinding(file, line, code, message) {
  return { file, line, code, message };
}

function checkMarkdownLinks(rootDir, filePath, body) {
  const findings = [];
  for (const match of body.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    let target = match[1].trim();
    if (target.startsWith('<') && target.endsWith('>')) target = target.slice(1, -1);
    if (/^(?:https?:|mailto:|data:|#)/u.test(target)) continue;
    target = target.split('#')[0];
    if (!target) continue;
    let decodedTarget = target;
    try {
      decodedTarget = decodeURIComponent(target);
    } catch {
      // The unresolved encoded path is reported below.
    }
    const resolved = path.resolve(path.dirname(filePath), decodedTarget);
    if (!resolved.startsWith(path.resolve(rootDir)) || !pathExistsSync(resolved)) {
      findings.push(
        createFinding(
          normalizeRelative(rootDir, filePath),
          lineNumberAt(body, match.index),
          'broken-local-link',
          `local link target does not exist: ${target}`,
        ),
      );
    }
  }
  return findings;
}

function pathExistsSync(filePath) {
  try {
    statSync(filePath);
    return true;
  } catch {
    return false;
  }
}

function countPipes(line) {
  return (line.match(/\|/g) ?? []).length;
}

function isTableSeparator(line) {
  return /^\|\s*:?-{3,}/u.test(line);
}

function checkMarkdownTables(rootDir, filePath, body) {
  const findings = [];
  const lines = body.split('\n');
  for (let index = 1; index < lines.length; index += 1) {
    if (isTableSeparator(lines[index - 1]) && isTableSeparator(lines[index])) {
      findings.push(
        createFinding(
          normalizeRelative(rootDir, filePath),
          index + 1,
          'consecutive-table-separators',
          'table contains consecutive separator rows',
        ),
      );
    }
    if (
      lines[index - 1].startsWith('|') &&
      isTableSeparator(lines[index]) &&
      countPipes(lines[index - 1]) !== countPipes(lines[index])
    ) {
      findings.push(
        createFinding(
          normalizeRelative(rootDir, filePath),
          index + 1,
          'table-column-mismatch',
          'table header and separator have different column counts',
        ),
      );
    }
  }
  return findings;
}

function checkStrictJsonFences(rootDir, filePath, body) {
  const findings = [];
  for (const match of body.matchAll(/```json\s*\n([\s\S]*?)```/gu)) {
    try {
      JSON.parse(match[1]);
    } catch (error) {
      findings.push(
        createFinding(
          normalizeRelative(rootDir, filePath),
          lineNumberAt(body, match.index),
          'invalid-json-fence',
          `strict JSON code fence is not parseable: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }
  return findings;
}

function checkActiveGuidance(rootDir, filePath, body) {
  const relativePath = normalizeRelative(rootDir, filePath);
  if (!ACTIVE_GUIDANCE_FILES.has(relativePath)) return [];
  const findings = [];
  for (const token of REMOVED_EXECUTION_TOKENS) {
    let offset = 0;
    while (offset < body.length) {
      const index = body.indexOf(token, offset);
      if (index < 0) break;
      findings.push(
        createFinding(
          relativePath,
          lineNumberAt(body, index),
          'stale-execution-guidance',
          `active guidance contains removed token "${token}"`,
        ),
      );
      offset = index + token.length;
    }
  }
  return findings;
}

function checkRemovedDocumentReferences(rootDir, filePath, body) {
  const relativePath = normalizeRelative(rootDir, filePath);
  const findings = [];
  for (const documentName of REMOVED_EXECUTION_DOCUMENTS) {
    let offset = 0;
    while (offset < body.length) {
      const index = body.indexOf(documentName, offset);
      if (index < 0) break;
      findings.push(
        createFinding(
          relativePath,
          lineNumberAt(body, index),
          'removed-document-reference',
          `documentation references removed execution document "${documentName}"`,
        ),
      );
      offset = index + documentName.length;
    }
  }
  return findings;
}

async function readOptionalText(filePath) {
  return (await pathExists(filePath)) ? readFile(filePath, 'utf8') : null;
}

async function checkProposalAdrAuthority(rootDir) {
  const findings = [];
  for (const relativePath of PROPOSED_CONTRACT_ADRS) {
    const body = await readOptionalText(path.join(rootDir, relativePath));
    if (body === null) continue;
    if (!/^Status:\s*proposed\b/mu.test(body) || !body.includes('does not override `project/spec/**`')) {
      const statusIndex = Math.max(0, body.indexOf('Status:'));
      findings.push(
        createFinding(
          relativePath,
          lineNumberAt(body, statusIndex),
          'proposal-adr-claims-authority',
          'roadmap contract ADR must remain proposed and state that it does not override project/spec/**',
        ),
      );
    }
  }
  return findings;
}

function detectAnimationReferenceMode(body) {
  if (/stale[^\n]{0,180}silently ignored/iu.test(body)) return 'ignore';
  if (/stale[^\n]{0,180}(?:reject|validation fail)/iu.test(body)) return 'reject';
  return null;
}

async function checkCrossSpecContracts(rootDir) {
  const modelSpecPath = path.join(rootDir, 'project/spec/model/spec.md');
  const formatReferencePath = path.join(rootDir, 'project/spec/model/format-reference.md');
  const componentsPath = path.join(rootDir, 'project/spec/model/components.md');
  const changesPath = path.join(rootDir, 'project/spec/model/changes.md');
  const collaborationPath = path.join(rootDir, 'project/spec/editor/collaboration.md');
  const [modelSpec, formatReference, components, changes, collaboration] = await Promise.all([
    readOptionalText(modelSpecPath),
    readOptionalText(formatReferencePath),
    readOptionalText(componentsPath),
    readOptionalText(changesPath),
    readOptionalText(collaborationPath),
  ]);
  const findings = [];

  if (modelSpec !== null && formatReference !== null) {
    const modelMode = detectAnimationReferenceMode(modelSpec);
    const referenceMode = detectAnimationReferenceMode(formatReference);
    if (modelMode !== null && referenceMode !== null && modelMode !== referenceMode) {
      findings.push(
        createFinding(
          'project/spec/model/format-reference.md',
          1,
          'cross-spec-animation-reference-drift',
          `animation stale-reference mode is ${modelMode} in model/spec.md but ${referenceMode} in format-reference.md`,
        ),
      );
    }
  }

  if (
    components !== null &&
    formatReference !== null &&
    /nested[\s\S]{0,160}component definition/iu.test(components) &&
    /componentRef[^\n]{0,160}only on a document-level/iu.test(formatReference)
  ) {
    findings.push(
      createFinding(
        'project/spec/model/format-reference.md',
        1,
        'cross-spec-component-host-drift',
        'nested component instances conflict with a document-only componentRef host rule',
      ),
    );
  }

  if (
    formatReference !== null &&
    /descendant[^\n]{0,180}parent-relative/iu.test(formatReference) &&
    /Position offset relative to canvas origin\./u.test(formatReference) &&
    !/Canvas-relative for root[^\n]{0,180}parent-relative for descendant/iu.test(formatReference)
  ) {
    findings.push(
      createFinding(
        'project/spec/model/format-reference.md',
        1,
        'cross-spec-page-coordinate-drift',
        'descendant transforms are parent-relative but the page position field is described as unconditionally canvas-relative',
      ),
    );
  }

  if (
    changes !== null &&
    collaboration !== null &&
    changes.includes('oldBeforeId') &&
    changes.includes('newBeforeId') &&
    /two[^\n]{0,80}`element:reorder`/iu.test(collaboration) &&
    !/batch-relative/iu.test(collaboration)
  ) {
    findings.push(
      createFinding(
        'project/spec/editor/collaboration.md',
        1,
        'cross-spec-reorder-semantics-drift',
        'multiple stable-anchor reorders require explicit batch-relative or deterministic sequential semantics',
      ),
    );
  }

  return findings;
}

function formatDependencyMap(value) {
  const entries = Object.entries(value ?? {}).sort(([left], [right]) => left.localeCompare(right));
  if (entries.length === 0) return '—';
  return entries.map(([name, version]) => `\`${name}@${version}\``).join('<br>');
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function discoverWorkspaceManifests(rootDir, rootManifest) {
  const manifests = [];
  for (const workspacePattern of rootManifest.workspaces ?? []) {
    if (!workspacePattern.endsWith('/*')) continue;
    const workspaceRoot = path.join(rootDir, workspacePattern.slice(0, -2));
    if (!(await pathExists(workspaceRoot))) continue;
    for (const entry of await readdir(workspaceRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const manifestPath = path.join(workspaceRoot, entry.name, 'package.json');
      if (!(await pathExists(manifestPath))) continue;
      manifests.push({ path: manifestPath, manifest: await readJson(manifestPath) });
    }
  }
  return manifests.sort((left, right) => String(left.manifest.name).localeCompare(String(right.manifest.name)));
}

function renderMarkdownTable(headers, rows) {
  const widths = headers.map((header, columnIndex) =>
    Math.max(header.length, 3, ...rows.map((row) => (row[columnIndex] ?? '').length)),
  );
  const renderRow = (row) => `| ${row.map((cell, columnIndex) => cell.padEnd(widths[columnIndex])).join(' | ')} |`;
  return [renderRow(headers), renderRow(widths.map((width) => '-'.repeat(width))), ...rows.map(renderRow)];
}

export async function renderManifestBaseline(rootDir) {
  const rootManifest = await readJson(path.join(rootDir, 'package.json'));
  const workspaces = await discoverWorkspaceManifests(rootDir, rootManifest);
  const headers = ['Package', 'Runtime dependencies', 'Peer dependencies', 'Development dependencies'];
  const rows = [
    [
      `workspace root (Node ${rootManifest.engines?.node ?? 'unspecified'})`,
      formatDependencyMap(rootManifest.dependencies),
      formatDependencyMap(rootManifest.peerDependencies),
      formatDependencyMap(rootManifest.devDependencies),
    ],
    ...workspaces.map(({ manifest }) => [
      manifest.name ?? 'unnamed',
      formatDependencyMap(manifest.dependencies),
      formatDependencyMap(manifest.peerDependencies),
      formatDependencyMap(manifest.devDependencies),
    ]),
  ];
  return [
    '### Generated runtime and dependency baseline',
    '',
    '> Generated by `node scripts/check-documentation.mjs --write-architecture`. Do not edit this block manually.',
    '',
    ...renderMarkdownTable(headers, rows),
  ].join('\n');
}

function extractGeneratedArchitectureBlock(body) {
  const start = body.indexOf(ARCHITECTURE_START_MARKER);
  const end = body.indexOf(ARCHITECTURE_END_MARKER);
  if (start < 0 || end < 0 || end < start) return null;
  const contentStart = start + ARCHITECTURE_START_MARKER.length;
  return body.slice(contentStart, end).trim();
}

function replaceGeneratedArchitectureBlock(body, baseline) {
  const start = body.indexOf(ARCHITECTURE_START_MARKER);
  const end = body.indexOf(ARCHITECTURE_END_MARKER);
  if (start < 0 || end < 0 || end < start) {
    throw new Error('architecture.md is missing generated manifest baseline markers');
  }
  const suffixStart = end + ARCHITECTURE_END_MARKER.length;
  return `${body.slice(0, start)}${ARCHITECTURE_START_MARKER}\n\n${baseline}\n\n${ARCHITECTURE_END_MARKER}${body.slice(suffixStart)}`;
}

function extractInitiativeRows(body, kind) {
  const rows = [];
  for (const match of body.matchAll(/^\|\s*(W[0-6]-[A-Z][A-Z0-9]*-\d{2})\s*\|.*$/gmu)) {
    const columns = match[0]
      .slice(1, -1)
      .split('|')
      .map((column) => column.trim());
    rows.push({
      id: columns[0],
      line: lineNumberAt(body, match.index),
      dependencies: columns[kind === 'plan' ? 2 : 3] ?? '',
      status: kind === 'tracker' ? (columns[1] ?? '') : undefined,
      dri: kind === 'tracker' ? (columns[2] ?? '') : undefined,
      childPlan: kind === 'tracker' ? (columns[4] ?? '') : undefined,
      evidence: kind === 'tracker' ? (columns[5] ?? '') : undefined,
    });
  }
  return rows;
}

function indexInitiativeRows(rows) {
  const byId = new Map();
  for (const row of rows) {
    const existing = byId.get(row.id) ?? [];
    existing.push(row);
    byId.set(row.id, existing);
  }
  return byId;
}

function extractInitiativeIds(value) {
  return [...new Set(value.match(/W[0-6]-[A-Z][A-Z0-9]*-\d{2}/gu) ?? [])];
}

function isParseableDependencyExpression(value) {
  const token = String.raw`(?:W[0-6]-[A-Z][A-Z0-9]*-\d{2}|RFC-\d{2}|IO-D-\d{2})`;
  return value === 'none' || new RegExp(`^${token}(?:/${token})*$`, 'u').test(value);
}

function findInitiativeDependencyCycles(definitions) {
  const graph = new Map(
    [...definitions.entries()].map(([initiativeId, rows]) => [
      initiativeId,
      extractInitiativeIds(rows[0].dependencies).filter(
        (dependencyId) => dependencyId !== initiativeId && definitions.has(dependencyId),
      ),
    ]),
  );
  const visited = new Set();
  const active = new Set();
  const stack = [];
  const cycles = new Map();

  function visit(initiativeId) {
    if (visited.has(initiativeId)) return;
    visited.add(initiativeId);
    active.add(initiativeId);
    stack.push(initiativeId);
    for (const dependencyId of graph.get(initiativeId) ?? []) {
      if (active.has(dependencyId)) {
        const cycle = [...stack.slice(stack.indexOf(dependencyId)), dependencyId];
        cycles.set([...new Set(cycle)].sort().join('|'), cycle);
      } else {
        visit(dependencyId);
      }
    }
    stack.pop();
    active.delete(initiativeId);
  }

  for (const initiativeId of [...graph.keys()].sort()) visit(initiativeId);
  return [...cycles.values()];
}

export async function checkDocumentation(rootDir) {
  const absoluteRoot = path.resolve(rootDir);
  const markdownFiles = await discoverMarkdownFiles(absoluteRoot);
  const findings = [];
  for (const filePath of markdownFiles) {
    const body = await readFile(filePath, 'utf8');
    findings.push(...checkMarkdownLinks(absoluteRoot, filePath, body));
    findings.push(...checkMarkdownTables(absoluteRoot, filePath, body));
    findings.push(...checkStrictJsonFences(absoluteRoot, filePath, body));
    findings.push(...checkActiveGuidance(absoluteRoot, filePath, body));
    findings.push(...checkRemovedDocumentReferences(absoluteRoot, filePath, body));
  }
  findings.push(...(await checkProposalAdrAuthority(absoluteRoot)));
  findings.push(...(await checkCrossSpecContracts(absoluteRoot)));

  const planPath = path.join(absoluteRoot, 'project/implementation/plan.md');
  const trackerPath = path.join(absoluteRoot, 'project/implementation/plan-progress.md');
  if ((await pathExists(planPath)) && (await pathExists(trackerPath))) {
    const definitions = indexInitiativeRows(extractInitiativeRows(await readFile(planPath, 'utf8'), 'plan'));
    const trackerRows = indexInitiativeRows(extractInitiativeRows(await readFile(trackerPath, 'utf8'), 'tracker'));
    for (const [initiativeId, rows] of [...definitions.entries()].sort(([left], [right]) =>
      left.localeCompare(right),
    )) {
      if (rows.length !== 1) {
        findings.push(
          createFinding(
            'project/implementation/plan.md',
            rows[1]?.line ?? rows[0].line,
            'duplicate-roadmap-initiative',
            `roadmap initiative ${initiativeId} is defined ${rows.length} times`,
          ),
        );
      }
      if (!isParseableDependencyExpression(rows[0].dependencies)) {
        findings.push(
          createFinding(
            'project/implementation/plan.md',
            rows[0].line,
            'initiative-dependency-unparseable',
            `${initiativeId} dependencies must be "none" or slash-separated roadmap/RFC/IO-D IDs, received "${rows[0].dependencies}"`,
          ),
        );
      }
      for (const dependencyId of extractInitiativeIds(rows[0].dependencies)) {
        if (dependencyId === initiativeId) {
          findings.push(
            createFinding(
              'project/implementation/plan.md',
              rows[0].line,
              'initiative-dependency-self',
              `${initiativeId} depends on itself`,
            ),
          );
        } else if (!definitions.has(dependencyId)) {
          findings.push(
            createFinding(
              'project/implementation/plan.md',
              rows[0].line,
              'initiative-dependency-unknown',
              `${initiativeId} depends on unknown roadmap initiative ${dependencyId}`,
            ),
          );
        }
      }
      const registered = trackerRows.get(initiativeId) ?? [];
      if (registered.length === 0) {
        findings.push(
          createFinding(
            'project/implementation/plan-progress.md',
            1,
            'initiative-missing-tracker-row',
            `roadmap initiative ${initiativeId} has no tracker row`,
          ),
        );
        continue;
      }
      if (registered.length !== 1) {
        findings.push(
          createFinding(
            'project/implementation/plan-progress.md',
            registered[1]?.line ?? registered[0].line,
            'duplicate-initiative-tracker-row',
            `roadmap initiative ${initiativeId} has ${registered.length} tracker rows`,
          ),
        );
      }
      const definition = rows[0];
      const tracker = registered[0];
      if (definition.dependencies !== tracker.dependencies) {
        findings.push(
          createFinding(
            'project/implementation/plan-progress.md',
            tracker.line,
            'initiative-dependency-drift',
            `${initiativeId} dependencies are "${tracker.dependencies}" but roadmap defines "${definition.dependencies}"`,
          ),
        );
      }

      const executableStatuses = new Set(['ready', 'active', 'functional', 'release']);
      if (executableStatuses.has(tracker.status) && tracker.dri.toLowerCase() === 'unassigned') {
        findings.push(
          createFinding(
            'project/implementation/plan-progress.md',
            tracker.line,
            'initiative-dri-required',
            `${initiativeId} status ${tracker.status} requires a named DRI`,
          ),
        );
      }
      if (executableStatuses.has(tracker.status) && tracker.childPlan === '—') {
        findings.push(
          createFinding(
            'project/implementation/plan-progress.md',
            tracker.line,
            'initiative-child-plan-required',
            `${initiativeId} status ${tracker.status} requires an approved child plan`,
          ),
        );
      }
      if (new Set(['functional', 'release']).has(tracker.status) && tracker.evidence === '—') {
        findings.push(
          createFinding(
            'project/implementation/plan-progress.md',
            tracker.line,
            'initiative-evidence-required',
            `${initiativeId} status ${tracker.status} requires evidence`,
          ),
        );
      }
    }
    for (const [initiativeId, rows] of [...trackerRows.entries()].sort(([left], [right]) =>
      left.localeCompare(right),
    )) {
      if (!definitions.has(initiativeId)) {
        findings.push(
          createFinding(
            'project/implementation/plan-progress.md',
            rows[0].line,
            'initiative-not-in-roadmap',
            `tracker initiative ${initiativeId} has no roadmap definition`,
          ),
        );
      }
    }
    for (const cycle of findInitiativeDependencyCycles(definitions)) {
      findings.push(
        createFinding(
          'project/implementation/plan.md',
          definitions.get(cycle[0])[0].line,
          'initiative-dependency-cycle',
          `roadmap initiative dependency cycle: ${cycle.join(' -> ')}`,
        ),
      );
    }
  }

  const architecturePath = path.join(absoluteRoot, 'project/implementation/architecture.md');
  if (await pathExists(architecturePath)) {
    const architectureBody = await readFile(architecturePath, 'utf8');
    const actualBaseline = extractGeneratedArchitectureBlock(architectureBody);
    const expectedBaseline = await renderManifestBaseline(absoluteRoot);
    if (actualBaseline !== expectedBaseline) {
      findings.push(
        createFinding(
          'project/implementation/architecture.md',
          1,
          'architecture-manifest-drift',
          'generated manifest baseline does not match package manifests; run npm run docs:architecture',
        ),
      );
    }
  }

  return findings.sort(
    (left, right) =>
      left.file.localeCompare(right.file) || left.line - right.line || left.code.localeCompare(right.code),
  );
}

async function writeArchitecture(rootDir) {
  const architecturePath = path.join(rootDir, 'project/implementation/architecture.md');
  const body = await readFile(architecturePath, 'utf8');
  const baseline = await renderManifestBaseline(rootDir);
  await writeFile(architecturePath, replaceGeneratedArchitectureBlock(body, baseline));
}

function formatFinding(finding) {
  return `${finding.file}:${finding.line} — ${finding.code}: ${finding.message}`;
}

async function main() {
  const rootDir = process.cwd();
  if (process.argv.includes('--write-architecture')) {
    await writeArchitecture(rootDir);
    return;
  }
  const findings = await checkDocumentation(rootDir);
  if (findings.length === 0) {
    console.log('Documentation integrity check passed.');
    return;
  }
  for (const finding of findings) console.error(formatFinding(finding));
  console.error(`Documentation integrity check failed with ${findings.length} finding(s).`);
  process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
