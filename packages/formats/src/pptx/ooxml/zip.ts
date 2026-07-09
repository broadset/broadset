import { type UnzipFileInfo, type Unzipped, unzipSync, zipSync } from 'fflate';

/**
 * Thin wrapper around fflate for OOXML packages. Exposes a
 * byte-identical read + write path so importer and exporter never see
 * fflate's raw shape, and a future swap to a different ZIP library can
 * happen in one file.
 *
 * fflate vs pizzip: fflate is roughly 8× faster, ships a smaller bundle,
 * and runs identically in Node + browser. It does not preserve ZIP
 * comment or extra fields, which OOXML never populates in practice.
 */

/** A loaded OOXML package: part path → raw bytes. */
export type OoxmlPackage = ReadonlyMap<string, Uint8Array>;

/**
 * Pre-decompression caps enforced via fflate's filter callback. Any
 * cap that fires causes the matching entry to be skipped and a
 * structured warning to be emitted by the caller — the package is
 * still returned, but downstream consumers see only the entries that
 * cleared the cap. This is the ZIP-bomb defence: per-entry size and
 * total entry count are checked against the central-directory metadata
 * before the file's compressed bytes are inflated.
 */
interface OoxmlReadCaps {
  readonly maxEntries?: number;
  readonly maxPartBytes?: number;
  readonly maxTotalUncompressedBytes?: number;
}

interface OoxmlReadResult {
  readonly pkg: OoxmlPackage;
  readonly skippedEntries: readonly OoxmlSkippedEntry[];
}

export interface OoxmlSkippedEntry {
  readonly path: string;
  readonly reason: 'entry-cap' | 'size-cap' | 'total-size-cap';
  /** Reported uncompressed size from the central directory header. */
  readonly originalSize: number;
}

/**
 * Read a ZIP archive into an OoxmlPackage.
 *
 * @throws Error when the input is not a valid ZIP (fflate error text).
 */
export function readOoxmlPackage(bytes: Uint8Array): OoxmlPackage {
  const unzipped: Unzipped = unzipSync(bytes);
  const parts = new Map<string, Uint8Array>();

  for (const [path, content] of Object.entries(unzipped)) {
    parts.set(path, content);
  }

  return parts;
}

/**
 * Read a ZIP archive while enforcing pre-decompression caps via the
 * fflate filter callback. Entries whose declared uncompressed size,
 * cumulative count, or cumulative total exceeds a cap are skipped at
 * the central-directory header check — fflate's inflate path never
 * runs on those bytes, so a ZIP bomb cannot exhaust memory before the
 * cap fires.
 */
export function readOoxmlPackageWithCaps(bytes: Uint8Array, caps: OoxmlReadCaps): OoxmlReadResult {
  const skipped: OoxmlSkippedEntry[] = [];
  let entryCount = 0;
  let cumulativeBytes = 0;

  const filter = (file: UnzipFileInfo): boolean => {
    entryCount += 1;

    if (caps.maxEntries !== undefined && entryCount > caps.maxEntries) {
      skipped.push({ path: file.name, reason: 'entry-cap', originalSize: file.originalSize });

      return false;
    }

    if (caps.maxPartBytes !== undefined && file.originalSize > caps.maxPartBytes) {
      skipped.push({ path: file.name, reason: 'size-cap', originalSize: file.originalSize });

      return false;
    }

    if (
      caps.maxTotalUncompressedBytes !== undefined &&
      cumulativeBytes + file.originalSize > caps.maxTotalUncompressedBytes
    ) {
      skipped.push({ path: file.name, reason: 'total-size-cap', originalSize: file.originalSize });

      return false;
    }

    cumulativeBytes += file.originalSize;

    return true;
  };

  const unzipped: Unzipped = unzipSync(bytes, { filter });
  const parts = new Map<string, Uint8Array>();

  for (const [path, content] of Object.entries(unzipped)) {
    parts.set(path, content);
  }

  return { pkg: parts, skippedEntries: skipped };
}

/**
 * Write an OoxmlPackage to a ZIP archive.
 *
 * Uses fflate's default Deflate level (6); OOXML packages are
 * small-to-medium so the extra CPU from higher levels is not worth the
 * size savings.
 *
 * Realm note: jsdom's `TextEncoder` (used by {@link encodeText}) returns
 * a cross-realm Uint8Array that fails fflate's `instanceof U8` check,
 * which causes fflate to walk the bytes as a directory tree. We
 * normalize every entry to a same-realm Uint8Array before handing off.
 */
export function writeOoxmlPackage(parts: ReadonlyMap<string, Uint8Array>): Uint8Array {
  const obj: Record<string, Uint8Array> = {};

  for (const [path, content] of parts) {
    obj[path] = toSameRealmBytes(content);
  }

  return zipSync(obj);
}

function toSameRealmBytes(bytes: Uint8Array): Uint8Array {
  if (bytes instanceof Uint8Array && bytes.constructor === Uint8Array) return bytes;

  // Cross-realm or subclass — copy into a fresh same-realm Uint8Array.
  const copy = new Uint8Array(bytes.byteLength);

  copy.set(bytes);

  return copy;
}

/** UTF-8 text-decode helper for callers that read an XML / text part. */
export function decodeText(bytes: Uint8Array): string {
  return new TextDecoder('utf-8').decode(bytes);
}

/** UTF-8 text-encode helper for callers that write an XML / text part. */
export function encodeText(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/**
 * Convert a package entry to string form. Returns `null` when the entry
 * is absent so callers can branch on optional parts without throwing.
 */
export function readTextPart(pkg: OoxmlPackage, path: string): string | null {
  const bytes = pkg.get(path);

  if (!bytes) return null;

  return decodeText(bytes);
}
