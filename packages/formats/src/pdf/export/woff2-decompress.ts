/**
 * Pure-JS WOFF2 → SFNT decompression wrapper around the `wawoff2`
 * package. wawoff2 ships no TypeScript declarations and no
 * `@types/wawoff2` exists, so we resolve the module via dynamic
 * `import()` (which yields `unknown` to TypeScript when paired with a
 * non-typed module) and narrow with runtime `typeof` / `instanceof`
 * checks at the boundary — no `as` assertions, no triple-slash
 * references, no ambient declaration files leaking out of formats.
 *
 * Used by the PDF font pipeline so Google-Fonts WOFF2-only URLs can
 * be embedded into the document via pdf-lib's fontkit (which only
 * speaks raw SFNT / TrueType bytes).
 */

type DecompressFn = (woff2: Uint8Array) => Promise<Uint8Array>;

let cachedDecompress: DecompressFn | undefined;

function isDecompressFn(value: unknown): value is DecompressFn {
  return typeof value === 'function';
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

async function loadWawoff2Decompress(): Promise<DecompressFn> {
  if (cachedDecompress !== undefined) return cachedDecompress;

  // Build the module specifier dynamically so TypeScript treats the
  // import as `unknown` (avoiding the missing-types error from a
  // static `import 'wawoff2'`). The runtime resolution is identical.
  const moduleSpecifier = 'wawoff2';
  const wawoff2Module: unknown = await import(moduleSpecifier);

  if (!isObject(wawoff2Module)) {
    throw new TypeError('wawoff2: module did not resolve to an object');
  }

  const defaultExport = isObject(wawoff2Module['default']) ? wawoff2Module['default'] : wawoff2Module;
  const decompress = defaultExport['decompress'];

  if (!isDecompressFn(decompress)) {
    throw new TypeError('wawoff2: decompress export is not a function');
  }

  cachedDecompress = decompress;

  return decompress;
}

/**
 * Decompress a WOFF2 byte buffer to the underlying SFNT (TTF or OTF)
 * representation. Returns a real `Uint8Array` even when wawoff2's
 * binding produces a `Buffer` so callers can hand the result straight
 * to `pdf-lib`'s `embedFont`.
 */
export async function decompressWoff2Bytes(woff2: Uint8Array): Promise<Uint8Array> {
  const decompress = await loadWawoff2Decompress();
  const decompressed = await decompress(woff2);

  return decompressed instanceof Uint8Array ? decompressed : new Uint8Array(decompressed);
}
