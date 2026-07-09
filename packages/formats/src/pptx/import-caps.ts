import type { OoxmlSkippedEntry } from './ooxml/zip';
import type { PptxImportOptions, PptxImportWarning } from './types';

/**
 * Default caps per the Importer Security Contract in
 * `project/spec/formats/spec.md`.
 */
const DEFAULT_MAX_INPUT_BYTES = 200 * 1024 * 1024; // 200 MiB
const DEFAULT_MAX_PART_BYTES = 50 * 1024 * 1024; // 50 MiB
const DEFAULT_MAX_ENTRIES = 4096;
/**
 * Cumulative uncompressed-bytes budget for the entire ZIP. Stops a
 * payload that fans out into many small entries (each within the
 * per-entry cap) but whose total inflates to gigabytes from exhausting
 * memory before the cap fires.
 */
const DEFAULT_MAX_TOTAL_UNCOMPRESSED_BYTES = 1024 * 1024 * 1024; // 1 GiB

interface ResolvedPptxCaps {
  readonly maxInputBytes: number;
  readonly maxEntries: number;
  readonly maxPartBytes: number;
  readonly maxTotalUncompressedBytes: number;
}

export function resolvePptxImportCaps(options?: PptxImportOptions): ResolvedPptxCaps {
  return {
    maxInputBytes: options?.maxInputBytes ?? DEFAULT_MAX_INPUT_BYTES,
    maxEntries: options?.maxEntries ?? DEFAULT_MAX_ENTRIES,
    maxPartBytes: options?.maxPartBytes ?? DEFAULT_MAX_PART_BYTES,
    maxTotalUncompressedBytes: options?.maxTotalUncompressedBytes ?? DEFAULT_MAX_TOTAL_UNCOMPRESSED_BYTES,
  };
}

export function warningForSkippedOoxmlEntry(entry: OoxmlSkippedEntry, caps: ResolvedPptxCaps): PptxImportWarning {
  switch (entry.reason) {
    case 'entry-cap':
      return {
        code: 'entry-cap',
        message: `Skipped entry "${entry.path}" — package exceeds entry-count cap of ${String(caps.maxEntries)} before decompression.`,
        detail: entry.path,
      };
    case 'size-cap':
      return {
        code: 'size-cap',
        message: `Skipped entry "${entry.path}" — declared uncompressed size ${String(entry.originalSize)} exceeds per-part cap ${String(caps.maxPartBytes)}.`,
        detail: entry.path,
      };
    case 'total-size-cap':
      return {
        code: 'size-cap',
        message: `Skipped entry "${entry.path}" — cumulative uncompressed size would exceed total cap ${String(caps.maxTotalUncompressedBytes)} bytes.`,
        detail: entry.path,
      };
  }
}
