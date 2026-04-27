#!/usr/bin/env node
// generate-pdfa-export.mjs <output-path>
//
// Thin wrapper that locates `tsx` and runs `generate-pdfa-export-impl.ts`
// against it with the output-path argument forwarded. The TS file
// imports the formats package and writes a Broadset-exported PDF/A-2b
// PDF to <output-path>. Used by `validate-pdfa.mjs` to feed a
// fresh-from-the-exporter document through veraPDF.

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const FORMATS_PKG_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const IMPL = resolve(FORMATS_PKG_DIR, 'scripts/generate-pdfa-export-impl.ts');

const target = process.argv[2];

if (target === undefined) {
  process.stderr.write('usage: generate-pdfa-export.mjs <output-path>\n');
  process.exit(2);
}

// `tsx` lives in the workspace root's node_modules in our hoisted
// install (npm workspaces hoist by default). Search both candidate
// paths so the script works whether tsx was installed at the
// workspace root or per-package.
const tsxCandidates = [
  process.env.GENERATOR_TSX,
  `${FORMATS_PKG_DIR}/node_modules/.bin/tsx`,
  resolve(FORMATS_PKG_DIR, '../../node_modules/.bin/tsx'),
].filter(Boolean);
const tsxBin = tsxCandidates.find((p) => p !== undefined && existsSync(p));

if (tsxBin === undefined) {
  process.stderr.write('tsx binary not found. Install with: npm install --save-dev tsx --workspace @broadset/formats\n');
  process.exit(1);
}

const child = spawn(tsxBin, [IMPL, target], {
  cwd: FORMATS_PKG_DIR,
  stdio: 'inherit',
});

child.on('close', (codeOut) => process.exit(codeOut ?? 0));
