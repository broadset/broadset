import { access, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  checkMarkdownLinks,
  checkMarkdownTables,
  checkStrictJsonFences,
  createFinding,
  lineNumberAt,
  normalizeRelative,
  stripFencedCode,
} from './check-documentation-markdown.mjs';

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

const ADR_DIRECTORY = 'project/implementation/decisions';
const ADR_NON_OVERRIDE_PHRASE = 'does not override `project/spec/**`';

/**
 * The six roadmap contract ADRs are pinned: they must stay `Status: proposed`
 * until a maintainer ratifies them, and ratification is a deliberate edit to
 * this list — not a silent status flip in the ADR file.
 */
const PROPOSED_CONTRACT_ADRS = [
  'project/implementation/decisions/ADR-003-006-time-duration.md',
  'project/implementation/decisions/ADR-007-components.md',
  'project/implementation/decisions/ADR-008-bsp-persistence.md',
  'project/implementation/decisions/ADR-010-resolved-scene-pages.md',
  'project/implementation/decisions/ADR-011-collaboration-changes.md',
  'project/implementation/decisions/ADR-IO-014-016-preflight-loss.md',
];

const IGNORED_DIRECTORIES = new Set(['.git', 'coverage', 'dist', 'node_modules']);

async function pathExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function discoverFiles({ currentDir, extensions, skipHiddenDirectories }) {
  const entries = await readdir(currentDir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (
      entry.isDirectory() &&
      (IGNORED_DIRECTORIES.has(entry.name) || (skipHiddenDirectories && entry.name.startsWith('.')))
    ) {
      continue;
    }
    const entryPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await discoverFiles({ currentDir: entryPath, extensions, skipHiddenDirectories })));
    } else if (entry.isFile() && extensions.some((extension) => entry.name.endsWith(extension))) {
      files.push(entryPath);
    }
  }
  return files.sort();
}

async function discoverMarkdownFiles(rootDir) {
  return discoverFiles({ currentDir: rootDir, extensions: ['.md'], skipHiddenDirectories: false });
}

function findTokenOccurrences({ relativePath, body, token, code, describe }) {
  const findings = [];
  let offset = 0;
  while (offset < body.length) {
    const index = body.indexOf(token, offset);
    if (index < 0) break;
    findings.push(createFinding(relativePath, lineNumberAt(body, index), code, describe(token)));
    offset = index + token.length;
  }
  return findings;
}

function checkActiveGuidance(rootDir, filePath, body) {
  const relativePath = normalizeRelative(rootDir, filePath);
  if (!ACTIVE_GUIDANCE_FILES.has(relativePath)) return [];
  return REMOVED_EXECUTION_TOKENS.flatMap((token) =>
    findTokenOccurrences({
      relativePath,
      body,
      token,
      code: 'stale-execution-guidance',
      describe: (value) => `active guidance contains removed token "${value}"`,
    }),
  );
}

function checkRemovedDocumentReferences(rootDir, filePath, body) {
  const relativePath = normalizeRelative(rootDir, filePath);
  return REMOVED_EXECUTION_DOCUMENTS.flatMap((documentName) =>
    findTokenOccurrences({
      relativePath,
      body,
      token: documentName,
      code: 'removed-document-reference',
      describe: (value) => `documentation references removed execution document "${value}"`,
    }),
  );
}

const SOURCE_REFERENCE_ROOT = 'packages';
const SOURCE_REFERENCE_EXTENSIONS = ['.ts', '.tsx'];

/**
 * Package sources must not reference retired plan documents either — a stale
 * tracking comment misleads both human readers and coding agents, and the
 * Markdown-only scan cannot see it.
 */
async function checkSourceRemovedDocumentReferences(rootDir) {
  const sourceRoot = path.join(rootDir, SOURCE_REFERENCE_ROOT);
  if (!(await pathExists(sourceRoot))) return [];
  const sourceFiles = await discoverFiles({
    currentDir: sourceRoot,
    extensions: SOURCE_REFERENCE_EXTENSIONS,
    skipHiddenDirectories: true,
  });
  const findings = [];
  for (const filePath of sourceFiles) {
    findings.push(...checkRemovedDocumentReferences(rootDir, filePath, await readFile(filePath, 'utf8')));
  }
  return findings;
}

async function readOptionalText(filePath) {
  return (await pathExists(filePath)) ? readFile(filePath, 'utf8') : null;
}

async function discoverAdrFiles(rootDir) {
  const directoryPath = path.join(rootDir, ADR_DIRECTORY);
  if (!(await pathExists(directoryPath))) return [];
  return (await readdir(directoryPath))
    .filter((name) => name.startsWith('ADR-') && name.endsWith('.md'))
    .sort()
    .map((name) => `${ADR_DIRECTORY}/${name}`);
}

/**
 * Every ADR needs a recognized status, every proposed ADR must disclaim
 * authority over the specs, and the pinned roadmap contract ADRs must remain
 * proposed until a maintainer deliberately ratifies them here.
 */
async function checkAdrAuthority(rootDir) {
  const findings = [];
  const pinned = new Set(PROPOSED_CONTRACT_ADRS);
  for (const relativePath of await discoverAdrFiles(rootDir)) {
    const body = await readOptionalText(path.join(rootDir, relativePath));
    if (body === null) continue;
    const statusLine = lineNumberAt(body, Math.max(0, body.indexOf('Status:')));
    const status = /^Status:\s*(proposed|accepted)\b/mu.exec(body)?.[1] ?? null;
    if (status === null) {
      findings.push(
        createFinding(
          relativePath,
          statusLine,
          'adr-status-unparseable',
          'ADR must declare "Status: proposed" or "Status: accepted"',
        ),
      );
      continue;
    }
    if (status === 'proposed' && !body.includes(ADR_NON_OVERRIDE_PHRASE)) {
      findings.push(
        createFinding(
          relativePath,
          statusLine,
          'proposal-adr-claims-authority',
          'proposed ADR must state that it does not override project/spec/**',
        ),
      );
    }
    if (pinned.has(relativePath) && status !== 'proposed') {
      findings.push(
        createFinding(
          relativePath,
          statusLine,
          'proposal-adr-claims-authority',
          'roadmap contract ADR must remain proposed until ratified via the pinned list in scripts/check-documentation.mjs',
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

/**
 * Sentinel phrases for the cross-spec contract checks. Three of the four
 * checks are dormant by design: their trigger phrases only exist in the
 * proposed contract ADRs, so they arm automatically if a ratified proposal
 * lands its wording in the specs. The activation regression test in
 * check-documentation.test.mjs pins the expected armed/dormant state so that
 * rewording an anchor phrase (which would silently disable a check) fails
 * loudly instead.
 */
const CROSS_SPEC_SENTINELS = {
  componentNestedInstances: /nested[\s\S]{0,160}component definition/iu,
  componentDocumentOnlyHost: /componentRef[^\n]{0,160}only on a document-level/iu,
  pageDescendantParentRelative: /descendant[^\n]{0,180}parent-relative/iu,
  pageCanvasOriginPosition: /Position offset relative to canvas origin\./u,
  pageRootVersusDescendantResolution: /Canvas-relative for root[^\n]{0,180}parent-relative for descendant/iu,
  reorderTwoElementReorders: /two[^\n]{0,80}`element:reorder`/iu,
  reorderBatchRelative: /batch-relative/iu,
};

function testSentinel(body, sentinel) {
  return body === null ? null : sentinel.test(body);
}

/**
 * Reports the raw sentinel state behind each cross-spec check so tests can pin
 * which checks are currently armed versus dormant. `null` means the source
 * file does not exist.
 */
export async function reportCrossSpecCheckActivation(rootDir) {
  const [modelSpec, formatReference, components, changes, collaboration] = await Promise.all([
    readOptionalText(path.join(rootDir, 'project/spec/model/spec.md')),
    readOptionalText(path.join(rootDir, 'project/spec/model/format-reference.md')),
    readOptionalText(path.join(rootDir, 'project/spec/model/components.md')),
    readOptionalText(path.join(rootDir, 'project/spec/model/changes.md')),
    readOptionalText(path.join(rootDir, 'project/spec/editor/collaboration.md')),
  ]);
  return {
    animation: {
      modelMode: modelSpec === null ? null : detectAnimationReferenceMode(modelSpec),
      referenceMode: formatReference === null ? null : detectAnimationReferenceMode(formatReference),
    },
    componentHost: {
      nestedInstancesProposed: testSentinel(components, CROSS_SPEC_SENTINELS.componentNestedInstances),
      documentOnlyHostRule: testSentinel(formatReference, CROSS_SPEC_SENTINELS.componentDocumentOnlyHost),
    },
    pageCoordinates: {
      descendantParentRelative: testSentinel(formatReference, CROSS_SPEC_SENTINELS.pageDescendantParentRelative),
      canvasOriginPosition: testSentinel(formatReference, CROSS_SPEC_SENTINELS.pageCanvasOriginPosition),
      rootVersusDescendantResolution: testSentinel(
        formatReference,
        CROSS_SPEC_SENTINELS.pageRootVersusDescendantResolution,
      ),
    },
    reorderSemantics: {
      stableAnchorPayloads:
        changes === null ? null : changes.includes('oldBeforeId') && changes.includes('newBeforeId'),
      twoReorderScenario: testSentinel(collaboration, CROSS_SPEC_SENTINELS.reorderTwoElementReorders),
      batchRelativeGuard: testSentinel(collaboration, CROSS_SPEC_SENTINELS.reorderBatchRelative),
    },
  };
}

async function checkCrossSpecContracts(rootDir) {
  const activation = await reportCrossSpecCheckActivation(rootDir);
  const findings = [];

  const { modelMode, referenceMode } = activation.animation;
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

  if (
    activation.componentHost.nestedInstancesProposed === true &&
    activation.componentHost.documentOnlyHostRule === true
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
    activation.pageCoordinates.descendantParentRelative === true &&
    activation.pageCoordinates.canvasOriginPosition === true &&
    activation.pageCoordinates.rootVersusDescendantResolution === false
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
    activation.reorderSemantics.stableAnchorPayloads === true &&
    activation.reorderSemantics.twoReorderScenario === true &&
    activation.reorderSemantics.batchRelativeGuard === false
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

export async function checkDocumentation(rootDir) {
  const absoluteRoot = path.resolve(rootDir);
  const markdownFiles = await discoverMarkdownFiles(absoluteRoot);
  const findings = [];
  for (const filePath of markdownFiles) {
    const body = await readFile(filePath, 'utf8');
    const proseBody = stripFencedCode(body);
    findings.push(...checkMarkdownLinks(absoluteRoot, filePath, proseBody));
    findings.push(...checkMarkdownTables(absoluteRoot, filePath, proseBody));
    findings.push(...checkStrictJsonFences(absoluteRoot, filePath, body));
    findings.push(...checkActiveGuidance(absoluteRoot, filePath, proseBody));
    findings.push(...checkRemovedDocumentReferences(absoluteRoot, filePath, proseBody));
  }
  findings.push(...(await checkSourceRemovedDocumentReferences(absoluteRoot)));
  findings.push(...(await checkAdrAuthority(absoluteRoot)));
  findings.push(...(await checkCrossSpecContracts(absoluteRoot)));

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
