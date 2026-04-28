import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type PluginOption, type Rolldown } from 'vite';

const plugins: PluginOption[] = [tailwindcss(), react()];

/**
 * Build-warning suppression policy. Closes the 2026-04-28 release-
 * hygiene finding "build / CT output prints warning-level messages
 * that should be either fixed or explicitly documented before a
 * release". Each entry below is justified — the bundler MUST surface
 * every unrecognized warning so new noise can never hide silently.
 *
 * Pattern format: a substring match against the warning's `message`
 * (or its embedded module path). Keep patterns narrow.
 */
interface SuppressionRule {
  readonly pattern: RegExp;
  readonly justification: string;
}

const SUPPRESSED_WARNINGS: readonly SuppressionRule[] = [
  {
    // `ag-psd` ships separate Node and browser code paths in
    // `dist/abr.js` and `dist/additionalInfo.js`. The Node path uses
    // `util.promisify` for stream helpers; the browser path that the
    // demo bundle reaches at runtime never executes those branches
    // (it goes through the synchronous `readPsd` entry point).
    // Rolldown-vite still emits a "Module 'util' has been externalized"
    // warning at build time because the `import` statement exists in
    // the source. The warning is informational; the runtime never
    // reaches the externalized symbol. Verified by the demo built-app
    // smoke test in `packages/demo/src/built-app-smoke.test.ts`.
    pattern: /Module "util" has been externalized.*ag-psd/,
    justification:
      'ag-psd Node-only `util` paths are unreachable in the browser bundle (verified by built-app smoke test).',
  },
  {
    // `wawoff2` ships a Node-native binding (`compress_binding.js`,
    // `decompress_binding.js`) and a WASM fallback. The package.json
    // `exports` map routes the browser entry to the WASM build, but
    // rolldown-vite still walks the Node binding files during dep
    // resolution and warns about their `fs` / `path` imports. The
    // runtime never reaches them — `decompressWoff2Bytes` resolves
    // the WASM build via the package exports map. Verified by the
    // same smoke test for the PDF font subsetting path.
    pattern: /Module "(fs|path)" has been externalized.*wawoff2/,
    justification:
      'wawoff2 native Node bindings are unreachable in the browser bundle (verified by built-app smoke test).',
  },
];

function isSuppressedWarning(message: string): boolean {
  return SUPPRESSED_WARNINGS.some((rule) => rule.pattern.test(message));
}

/**
 * Filter known-safe build warnings. Anything that does NOT match a
 * suppression rule MUST surface — that is how new noise gets caught.
 *
 * Vite 8 uses Rolldown under the hood, so the on-log handler signature
 * comes from the Rolldown namespace (`(level, log, defaultHandler)`)
 * where `defaultHandler` takes a single argument.
 */
function onLog(level: Rolldown.LogLevel, log: Rolldown.RolldownLog, defaultHandler: Rolldown.LogOrStringHandler): void {
  if (isSuppressedWarning(log.message)) {
    return;
  }

  defaultHandler(level, log);
}

// https://vite.dev/config/
export default defineConfig({
  define: {
    'process.env.PATH_BOOL_DEV_ASSERTS': JSON.stringify('0'),
  },
  plugins,
  build: {
    /*
     * The lazy formats bundle (PSD + PPTX + PDF + SVG + dependencies
     * like `pdf-lib`, `ag-psd`, `fontkit`, `wawoff2`) intentionally
     * lands as one large chunk so its bytes only ship when the demo
     * actually needs format support. The 4 MB ceiling absorbs that
     * lazy chunk; the eager main bundle is well under 1.5 MB. If a
     * non-lazy import accidentally pulls a format library into the
     * eager bundle, the bundle-boundary test
     * (`packages/demo/src/bundle-boundary.test.ts`) catches it.
     */
    chunkSizeWarningLimit: 4_000,
    rollupOptions: {
      onLog,
    },
  },
});
