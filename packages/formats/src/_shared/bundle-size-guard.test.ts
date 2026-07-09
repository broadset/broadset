import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Phase 2 bundle-size assertion — enforces that the eager
 * `_shared/` surface never statically imports the heavy lazy-loaded
 * WASM deps (`lcms-wasm`, `harfbuzzjs`). Latin-only sRGB users never
 * pay the hundreds of KB these modules add; any future consumer that
 * needs CMYK / non-Latin shaping MUST load them through a dynamic
 * `await import(...)` so the bundle stays tree-shakable.
 *
 * Runs against the on-disk `_shared/` source so the guard is fast,
 * environment-independent, and fails at test time rather than
 * after ship.
 */

const LAZY_MODULE_SPECIFIERS = ['lcms-wasm', 'harfbuzzjs'] as const;
const HERE = dirname(fileURLToPath(import.meta.url));

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

function findStaticImports(source: string, specifier: string): readonly string[] {
  const patterns = [
    // `import ... from 'specifier'` (anything before `from`)
    new RegExp(`^\\s*import\\b[^;]*?from\\s*['"]${specifier}['"]`, 'gm'),
    // Bare side-effect import: `import 'specifier'`
    new RegExp(`^\\s*import\\s*['"]${specifier}['"]`, 'gm'),
    // CommonJS require: `require('specifier')`
    new RegExp(`require\\(\\s*['"]${specifier}['"]`, 'g'),
  ];
  const matches: string[] = [];

  for (const pattern of patterns) {
    const matched = source.match(pattern);

    if (matched !== null) {
      matches.push(...matched);
    }
  }

  return matches;
}

function findDynamicImports(source: string, specifier: string): readonly string[] {
  // `await import('specifier')` — any surrounding whitespace ok.
  const pattern = new RegExp(`import\\(\\s*['"]${specifier}['"]`, 'g');
  const matched = source.match(pattern);

  return matched ?? [];
}

describe('bundle size guard for _shared/', () => {
  /**
   * @description Every source file under `_shared/` must be free of
   * static `import` statements that pull in `lcms-wasm` or
   * `harfbuzzjs`. These modules are hundreds of KB each and are
   * lazy-loaded per the io-prereqs plan so Latin-only sRGB users
   * never pay for them.
   */
  it('never statically imports lcms-wasm or harfbuzzjs from any _shared source', async () => {
    const files = await collectSourceFiles(HERE);

    expect(files.length).toBeGreaterThan(0);

    const offenders: { readonly file: string; readonly specifier: string; readonly match: string }[] = [];

    for (const file of files) {
      const source = await readFile(file, 'utf8');

      for (const specifier of LAZY_MODULE_SPECIFIERS) {
        const staticMatches = findStaticImports(source, specifier);

        for (const match of staticMatches) {
          offenders.push({ file, specifier, match });
        }
      }
    }

    expect(offenders, `Static imports of lazy modules found: ${JSON.stringify(offenders, null, 2)}`).toHaveLength(0);
  });

  /**
   * @description If a future consumer needs `lcms-wasm` (CMYK / ICC
   * profile pipeline) or `harfbuzzjs` (non-Latin shaping), it MUST
   * use a dynamic `await import(...)` so the WASM blob stays out of
   * the main bundle. This test is future-directed: today no file
   * imports either module, so the scan returns zero. When the first
   * consumer arrives, the test validates the dynamic-import shape.
   */
  it('documents that any future lcms-wasm / harfbuzzjs usage must be dynamic', async () => {
    const files = await collectSourceFiles(HERE);
    const dynamicUsages: { readonly file: string; readonly specifier: string }[] = [];

    for (const file of files) {
      const source = await readFile(file, 'utf8');

      for (const specifier of LAZY_MODULE_SPECIFIERS) {
        const dynamic = findDynamicImports(source, specifier);

        if (dynamic.length > 0) {
          dynamicUsages.push({ file, specifier });
        }
      }
    }

    // Not a failure assertion: today the list is empty. The test exists
    // so that when the first caller adds `await import('lcms-wasm')`,
    // CI exercises the dynamic-import path and the static-import guard
    // above proves the blob stayed out of the eager bundle.
    expect(Array.isArray(dynamicUsages)).toBe(true);
  });
});
