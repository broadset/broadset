import { readdir, readFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * @description Static-analysis guard for the demo's lazy-formats
 * boundary.
 *
 * The demo's main bundle MUST stay free of runtime-loaded
 * `@broadset/formats` references. Native BSP package loading remains
 * behind a dynamic `await import()` so startup does not pay for the
 * formats package. Without this guard, one accidental value import
 * anywhere in demo source pulls the complete formats graph into the
 * entry chunk.
 *
 * Allowed:
 *   - `import type ... from '@broadset/formats'` (type-only, erased)
 *   - `await import('@broadset/formats')` inside an approved lazy loader
 *
 * Anything else — bare static `import { X } from '@broadset/formats'`,
 * `require('@broadset/formats')`, or `import('@broadset/formats')`
 * outside an approved loader — is a regression.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const FORMATS_MODULE = '@broadset/formats';
const ALLOWED_DYNAMIC_IMPORTERS: ReadonlySet<string> = new Set(['formatBridge.ts', 'formats-loader.ts']);

interface Offender {
  readonly file: string;
  readonly match: string;
}

async function collectSourceFiles(rootDir: string): Promise<readonly string[]> {
  const collected: string[] = [];
  const entries = await readdir(rootDir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(rootDir, entry.name);

    if (entry.isDirectory()) {
      const nested = await collectSourceFiles(fullPath);

      collected.push(...nested);
      continue;
    }

    if (!entry.isFile()) continue;
    if (!/\.(ts|tsx|mts|cts)$/.test(entry.name)) continue;
    if (entry.name.endsWith('.test.ts') || entry.name.endsWith('.test.tsx')) continue;
    if (entry.name.endsWith('.d.ts')) continue;

    collected.push(fullPath);
  }

  return collected;
}

const STATIC_VALUE_IMPORT = new RegExp(`^\\s*import\\s+(?!type\\b)[^;]*?from\\s*['"]${FORMATS_MODULE}['"]`, 'gm');
const SIDE_EFFECT_IMPORT = new RegExp(`^\\s*import\\s*['"]${FORMATS_MODULE}['"]`, 'gm');
const REQUIRE_CALL = new RegExp(`require\\(\\s*['"]${FORMATS_MODULE}['"]`, 'g');
const DYNAMIC_IMPORT = new RegExp(`import\\(\\s*['"]${FORMATS_MODULE}['"]`, 'g');

describe('demo lazy-formats bundle boundary', () => {
  it('never statically imports values from @broadset/formats', async () => {
    const files = await collectSourceFiles(HERE);
    const offenders: Offender[] = [];

    for (const file of files) {
      const source = await readFile(file, 'utf8');

      const staticMatches = [
        ...(source.match(STATIC_VALUE_IMPORT) ?? []),
        ...(source.match(SIDE_EFFECT_IMPORT) ?? []),
        ...(source.match(REQUIRE_CALL) ?? []),
      ];

      for (const match of staticMatches) {
        offenders.push({ file, match });
      }
    }

    expect(
      offenders,
      `Static imports of @broadset/formats found — these would pull the formats module into the demo entry chunk:\n${JSON.stringify(offenders, null, 2)}`,
    ).toHaveLength(0);
  });

  it('only approved lazy loaders use dynamic import("@broadset/formats")', async () => {
    const files = await collectSourceFiles(HERE);
    const offenders: Offender[] = [];

    for (const file of files) {
      const source = await readFile(file, 'utf8');
      const fileName = basename(file);
      const dynamicMatches = source.match(DYNAMIC_IMPORT) ?? [];

      if (dynamicMatches.length === 0) continue;
      if (ALLOWED_DYNAMIC_IMPORTERS.has(fileName)) continue;

      for (const match of dynamicMatches) {
        offenders.push({ file, match });
      }
    }

    expect(
      offenders,
      `Dynamic import("@broadset/formats") outside approved lazy loaders:\n${JSON.stringify(offenders, null, 2)}`,
    ).toHaveLength(0);
  });
});
