/**
 * Pure-JS WOFF2 → SFNT decompression wrapper around the `wawoff2`
 * package. wawoff2 ships no upstream `.d.ts`, so the module is
 * declared minimally in
 * `packages/formats/src/_shared/text-layout/text-layout.types.d.ts`
 * (just the `decompress` export this file actually uses). The static
 * import keeps the dependency visible to `knip` so the dead-code
 * gate runs without an `ignoreDependencies` exception.
 *
 * Used by the PDF font pipeline so Google-Fonts WOFF2-only URLs can
 * be embedded into the document via pdf-lib's fontkit (which only
 * speaks raw SFNT / TrueType bytes).
 */

import { decompress } from 'wawoff2';

/**
 * Decompress a WOFF2 byte buffer to the underlying SFNT (TTF or OTF)
 * representation. Returns a real `Uint8Array` even when wawoff2's
 * binding produces a `Buffer` so callers can hand the result straight
 * to `pdf-lib`'s `embedFont`.
 */
export async function decompressWoff2Bytes(woff2: Uint8Array): Promise<Uint8Array> {
  const decompressed = await decompress(woff2);

  return decompressed instanceof Uint8Array ? decompressed : new Uint8Array(decompressed);
}
