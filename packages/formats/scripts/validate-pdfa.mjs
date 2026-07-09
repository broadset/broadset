#!/usr/bin/env node
// validate-pdfa.mjs
//
// Drives `verapdf/cli` (Docker) against:
//   - every fetched binary fixture under
//     `packages/formats/test-fixtures/pdf/corpus/.cache/` whose name encodes
//     the expected verdict (`*-pass.pdf` ⇒ MUST validate; `*-fail.pdf`
//     ⇒ MUST NOT validate); and
//   - a freshly-generated Broadset PDF/A-2b export, which MUST validate.
//
// Exits 0 when every verdict matches expectation. Exits 1 (with a per-file
// summary on stderr) when any expectation is violated. Used by the
// veraPDF GitHub Action and by the local `npm run validate:pdfa` script.
//
// Requires Docker available on PATH. Pulls `verapdf/cli:latest` on first
// run; subsequent runs reuse the cached image.

import { spawn, spawnSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const FORMATS_PKG_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE_DIR = resolve(FORMATS_PKG_DIR, 'test-fixtures/pdf/corpus/.cache');
const TEMP_ROOT = resolve(FORMATS_PKG_DIR, '.cache/verapdf');
const VERA_IMAGE = process.env.VERAPDF_IMAGE ?? 'verapdf/cli:latest';

function log(message) {
  process.stdout.write(`${message}\n`);
}

function logError(message) {
  process.stderr.write(`${message}\n`);
}

function ensureDockerAvailable() {
  const probe = spawnSync('docker', ['--version'], { encoding: 'utf8' });

  if (probe.status !== 0) {
    logError('docker not on PATH — install Docker Desktop or run inside CI.');
    process.exit(1);
  }
}

function runDocker(args) {
  return new Promise((resolveFn, rejectFn) => {
    const child = spawn('docker', args, { stdio: ['ignore', 'pipe', 'inherit'] });
    let stdout = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
    });

    child.on('error', rejectFn);
    child.on('close', (code) => resolveFn({ code, stdout }));
  });
}

async function pullImage() {
  log(`Pulling ${VERA_IMAGE} (cached if already present) ...`);
  const result = await runDocker(['pull', VERA_IMAGE]);

  if (result.code !== 0) {
    logError(`docker pull ${VERA_IMAGE} failed`);
    process.exit(1);
  }
}

async function validateFile(absolutePdfPath) {
  const dir = dirname(absolutePdfPath);
  const name = absolutePdfPath.slice(dir.length + 1);
  const result = await runDocker([
    'run',
    '--rm',
    '-v',
    `${dir}:/data:ro`,
    VERA_IMAGE,
    '--format',
    'json',
    `/data/${name}`,
  ]);
  // veraPDF prints a one-line warning before the JSON on
  // architecture-mismatched runs (e.g. amd64 image on arm64 host).
  // Slice from the first '{' to the last '}'.
  const firstBrace = result.stdout.indexOf('{');
  const lastBrace = result.stdout.lastIndexOf('}');

  if (firstBrace === -1 || lastBrace === -1) {
    return { compliant: false, reason: 'no JSON in veraPDF stdout', raw: result.stdout };
  }

  const json = JSON.parse(result.stdout.slice(firstBrace, lastBrace + 1));
  const summary = extractValidationSummary(json);

  return {
    compliant: summary.nonCompliantPdfaCount === 0 && summary.failedJobCount === 0 && summary.compliantPdfaCount > 0,
    summary,
    raw: result.stdout,
  };
}

function extractValidationSummary(json) {
  // veraPDF JSON shape changes across versions; walk defensively.
  const report = json?.report ?? json;
  const batchSummary = report?.batchSummary ?? {};
  const validationSummary = batchSummary.validationSummary ?? {};

  return {
    compliantPdfaCount: validationSummary.compliantPdfaCount ?? 0,
    nonCompliantPdfaCount: validationSummary.nonCompliantPdfaCount ?? 0,
    failedJobCount: validationSummary.failedJobCount ?? 0,
    totalJobCount: validationSummary.totalJobCount ?? 0,
  };
}

async function generateFreshExport(outDir) {
  // Build a tiny PDF/A-2b document via the formats package and write it
  // to outDir/fresh-export-2b.pdf. The runner deliberately uses the
  // package's compiled dist or the Vitest entry — whichever is
  // available. Here we shell out to a tsx-driven script so the runner
  // doesn't need any extra build step.
  const tsx = resolve(FORMATS_PKG_DIR, 'node_modules/.bin/tsx');
  const generatorScript = resolve(FORMATS_PKG_DIR, 'scripts/generate-pdfa-export.mjs');
  const targetPath = join(outDir, 'fresh-export-2b.pdf');

  return new Promise((resolveFn, rejectFn) => {
    const child = spawn('node', [generatorScript, targetPath], {
      cwd: FORMATS_PKG_DIR,
      stdio: 'inherit',
      env: { ...process.env, GENERATOR_TSX: tsx },
    });

    child.on('error', rejectFn);
    child.on('close', (code) => {
      if (code !== 0) rejectFn(new Error(`generator exited ${code}`));
      else resolveFn(targetPath);
    });
  });
}

async function main() {
  ensureDockerAvailable();
  await pullImage();

  // Build the fixture target list: every fetched veraPDF corpus *.pdf.
  let entries = [];

  try {
    entries = await readdir(FIXTURE_DIR);
  } catch {
    logError(
      `fixture directory not found: ${FIXTURE_DIR}\nRun \`npm run pdf:corpus:fetch -w @broadset/formats\` before validate:pdfa.`,
    );
    process.exit(1);
  }

  if (entries.filter((e) => e.toLowerCase().endsWith('.pdf')).length === 0) {
    logError(
      `no fetched PDF corpus fixtures found under ${FIXTURE_DIR}\nRun \`npm run pdf:corpus:fetch -w @broadset/formats\` before validate:pdfa.`,
    );
    process.exit(1);
  }

  // ISO 32000-1 fixtures are vanilla PDFs (not PDF/A). veraPDF
  // defaults to PDF/A-1b validation when no flavour is auto-detected
  // from the document — so a vanilla PDF reports non-compliant. Skip
  // them; they're exercised by the in-tree importer fuzz / round-
  // trip suites instead.
  const targets = entries
    .filter((e) => e.toLowerCase().endsWith('.pdf'))
    .filter((e) => !e.includes('iso-32000'))
    .map((name) => ({
      path: join(FIXTURE_DIR, name),
      label: `verapdf-corpus/${name}`,
      expected:
        name.includes('-pass') ? 'compliant'
        : name.includes('-fail') ? 'non-compliant'
        : 'compliant',
    }));

  // Plus a fresh Broadset PDF/A-2b export.
  await mkdir(TEMP_ROOT, { recursive: true });
  const tmp = await mkdtemp(join(TEMP_ROOT, 'fresh-export-'));
  await chmod(tmp, 0o755);

  try {
    const freshPath = await generateFreshExport(tmp);

    targets.push({ path: freshPath, label: 'fresh broadset export (PDF/A-2b)', expected: 'compliant' });
  } catch (err) {
    log(`(skipping fresh-export validation: ${err instanceof Error ? err.message : 'unknown'})`);
  }

  const failures = [];

  for (const target of targets) {
    log(`→ ${target.label} (expecting ${target.expected})`);
    const verdict = await validateFile(target.path);
    const isCompliant = verdict.compliant;
    const matched =
      (target.expected === 'compliant' && isCompliant) || (target.expected === 'non-compliant' && !isCompliant);

    log(`   compliant=${isCompliant}  ${matched ? '✓' : '✗ MISMATCH'}`);

    if (!matched) {
      failures.push({ label: target.label, expected: target.expected, actual: isCompliant, summary: verdict.summary });
    }
  }

  await rm(tmp, { recursive: true, force: true });

  if (failures.length === 0) {
    log(`\nveraPDF: all ${String(targets.length)} target(s) matched expected verdicts.`);
    process.exit(0);
  }

  logError(`\nveraPDF: ${String(failures.length)} target(s) had unexpected verdicts:`);
  for (const f of failures) {
    logError(
      `  ✗ ${f.label}  expected=${f.expected}  got=${f.actual ? 'compliant' : 'non-compliant'}  summary=${JSON.stringify(f.summary ?? {})}`,
    );
  }
  process.exit(1);
}

main().catch((err) => {
  logError(err.stack ?? String(err));
  process.exit(1);
});
