import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Built-app smoke test for browser-externalized Node modules.
 *
 * The demo bundle pulls in two libraries that ship Node-only code paths
 * alongside their browser code paths:
 *
 *   - `ag-psd` — uses `util.promisify` in `dist/abr.js` and
 *     `dist/additionalInfo.js` for stream helpers; the synchronous
 *     `readPsd` browser path never reaches them.
 *   - `wawoff2` — ships native Node bindings (`compress_binding.js`,
 *     `decompress_binding.js`) plus a WASM fallback; the package.json
 *     `exports` map routes browser imports to the WASM build.
 *
 * Rolldown emits a "Module 'X' has been externalized" warning at build
 * time because the import statements exist in the source. The runtime
 * never reaches them in the browser, so the warnings are noise — but
 * "browser-externalized Node modules deserve a built-app smoke check
 * because they can mean 'this dependency path works in tests but may
 * explode if reached in the browser bundle.'"
 *
 * This test backs the suppression policy in `vite.config.ts` by
 * proving the Node-only branches are gone from the *bundled* output:
 *
 *   1. Run a programmatic Vite build using the demo's actual config.
 *      That gives us the same tree-shaking, plugin set, and entry
 *      graph that ships in production.
 *   2. Scan every emitted JS chunk for residual references to the
 *      externalized Node modules. The bundle must contain ZERO
 *      `require("util")` / `from "util"` style references; if any
 *      survive, the suppression in `vite.config.ts` is hiding a real
 *      runtime bomb and this test fires.
 *   3. Spot-check that the suspect Node-only files (`compress_binding`,
 *      `decompress_binding`) are not present in the chunk text — they
 *      should have been tree-shaken out via the package exports map
 *      before they reach the browser.
 */

interface ScanResult {
  readonly fileName: string;
  readonly forbiddenMatches: readonly string[];
}

const FORBIDDEN_MODULE_REFERENCE_PATTERNS: readonly RegExp[] = [
  // Synchronous CJS-style require of a Node builtin.
  /\brequire\(\s*["'](?:util|fs|path|os|stream|crypto|zlib|node:[a-z_]+)["']\s*\)/g,
  // ESM bare-specifier import surviving externalization. Includes the
  // leading whitespace so it doesn't match identifier-form text like
  // `presetClass="path"` inside an embedded string.
  /(?:^|[\s;{}(])from\s+["'](?:util|fs|path|os|stream|crypto|zlib|node:[a-z_]+)["']/gm,
  // Dynamic import of a Node builtin — would attempt a network fetch
  // for `/util` in the browser.
  /\bimport\(\s*["'](?:util|fs|path|os|stream|crypto|zlib|node:[a-z_]+)["']\s*\)/g,
];

const SUSPECT_NODE_BINDING_FILES: readonly string[] = ['compress_binding', 'decompress_binding'];

function scanBundleFile(fileName: string, content: string): ScanResult {
  const forbiddenMatches: string[] = [];

  for (const pattern of FORBIDDEN_MODULE_REFERENCE_PATTERNS) {
    const matches = content.match(pattern);

    if (matches !== null) forbiddenMatches.push(...matches.map((m) => m.trim()));
  }

  for (const suspect of SUSPECT_NODE_BINDING_FILES) {
    if (content.includes(suspect)) forbiddenMatches.push(`reference to ${suspect}`);
  }

  return { fileName, forbiddenMatches };
}

describe('built-app smoke — externalized Node modules unreachable in browser bundle', () => {
  it('produces a clean bundle with zero Node-builtin references', { timeout: 90_000 }, async () => {
    const { build: viteBuild } = await import('vite');
    const here = dirname(fileURLToPath(import.meta.url));
    const demoRoot = resolvePath(here, '..');
    const tempDir = mkdtempSync(resolvePath(tmpdir(), 'broadset-built-smoke-'));
    const outDir = resolvePath(tempDir, 'dist');

    try {
      // Use the demo's real `vite.config.ts` so plugins, define, and
      // resolution match production exactly. We only override `outDir`
      // and `emptyOutDir` to keep the test self-contained.
      await viteBuild({
        root: demoRoot,
        logLevel: 'error',
        build: {
          outDir,
          emptyOutDir: true,
        },
      });

      const assetDir = resolvePath(outDir, 'assets');
      const emitted = readdirSync(assetDir).filter((name) => name.endsWith('.js'));
      const offenders: ScanResult[] = [];

      for (const fileName of emitted) {
        const content = readFileSync(resolvePath(assetDir, fileName), 'utf8');
        const result = scanBundleFile(fileName, content);

        if (result.forbiddenMatches.length > 0) offenders.push(result);
      }

      expect(emitted.length, 'expected at least one emitted JS chunk').toBeGreaterThan(0);
      expect(
        offenders,
        `Browser bundle leaked Node-only references — externalized modules survived bundling:\n${JSON.stringify(offenders, null, 2)}`,
      ).toEqual([]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
