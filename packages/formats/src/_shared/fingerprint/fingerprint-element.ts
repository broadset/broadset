import type { BroadsetElement } from '@broadset/model';
import xxhash from 'xxhash-wasm';

/**
 * Phase 2 `_shared/fingerprint/` — produces a stable cross-document
 * fingerprint for a `BroadsetElement` so the reconciliation pipeline
 * (PSD / PDF / SVG / PPTX re-import) can recover element identity
 * when external tools strip `data-bs-*` tags, XMP entries, or shape-
 * name markers. Two elements with visually identical geometry / text
 * / style hash to the same fingerprint regardless of the source
 * file's whitespace or attribute ordering.
 *
 * Wraps `xxhash-wasm` (h64 → hex string). The WASM module is loaded
 * once and cached; every `fingerprintElement` call awaits the same
 * initialization promise.
 */

type XXHashApi = Awaited<ReturnType<typeof xxhash>>;

let cachedApi: Promise<XXHashApi> | null = null;

function loadHashApi(): Promise<XXHashApi> {
  cachedApi ??= xxhash();

  return cachedApi;
}

/**
 * Canonicalizes a `BroadsetElement` into a deterministic string view
 * so two elements that differ only in source-file whitespace or
 * attribute ordering hash identically. Includes the fields that matter
 * for reconciliation: `type`, geometry, rotation, content, and a
 * canonical style key ordering.
 */
function canonicalize(element: BroadsetElement): string {
  const content = typeof element.content === 'string' ? element.content : JSON.stringify(element.content);
  const stylePairs = objectEntries(element.style)
    .filter((entry) => entry[1] !== undefined)
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .sort((a, b) => a.localeCompare(b));

  return [
    `t=${element.type}`,
    `w=${String(element.width)}`,
    `h=${String(element.height)}`,
    `r=${String(element.rotation)}`,
    `c=${content}`,
    `s=[${stylePairs.join('|')}]`,
  ].join(';');
}

function objectEntries<T extends object>(
  value: T,
): readonly (readonly [Extract<keyof T, string>, T[Extract<keyof T, string>]])[] {
  return Object.entries(value) as unknown as readonly (readonly [
    Extract<keyof T, string>,
    T[Extract<keyof T, string>],
  ])[];
}

/**
 * Returns a 16-char hex xxhash64 fingerprint for the given element.
 * Stable across irrelevant formatting of the source file.
 *
 * The WASM runtime initializes lazily on the first call; subsequent
 * calls reuse the cached module. Tests and callers MUST `await` the
 * promise — there is no sync variant because WASM initialization is
 * inherently async.
 */
export async function fingerprintElement(element: BroadsetElement): Promise<string> {
  const api = await loadHashApi();

  return api.h64ToString(canonicalize(element));
}

/**
 * Test-only reset hook that clears the cached WASM API so each test
 * sees a fresh initialization. NOT exported from the package barrel.
 */
export function _resetFingerprintCache(): void {
  cachedApi = null;
}
