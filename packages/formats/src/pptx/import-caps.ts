import { resolvePositiveIntegerLimit } from '../_shared/import-limits';
import type { OoxmlSkippedEntry } from './ooxml/zip';
import type { PptxImportOptions, PptxImportWarning } from './types';

/**
 * Default caps per the Importer Security Contract in
 * `project/spec/formats/spec.md`.
 */
const DEFAULT_MAX_INPUT_BYTES = 200 * 1024 * 1024; // 200 MiB
const DEFAULT_MAX_PART_BYTES = 50 * 1024 * 1024; // 50 MiB
const DEFAULT_MAX_ENTRIES = 4096;
const DEFAULT_MAX_EXPANSION_RATIO = 100;
const DEFAULT_MAX_DEPTH = 100;
/**
 * Cumulative uncompressed-bytes budget for the entire ZIP. Stops a
 * payload that fans out into many small entries (each within the
 * per-entry cap). 64 MiB is the retained-output ceiling so browser
 * imports stay within the same resource envelope as other importers.
 */
const DEFAULT_MAX_TOTAL_UNCOMPRESSED_BYTES = 64 * 1024 * 1024; // 64 MiB

interface ResolvedPptxCaps {
  readonly maxInputBytes: number;
  readonly maxEntries: number;
  readonly maxPartBytes: number;
  readonly maxTotalUncompressedBytes: number;
  readonly maxExpansionRatio: number;
  readonly maxDepth: number;
}

export function resolvePptxImportCaps(options?: PptxImportOptions): ResolvedPptxCaps {
  return {
    maxInputBytes: resolvePositiveIntegerLimit(options?.maxInputBytes, DEFAULT_MAX_INPUT_BYTES),
    maxEntries: resolvePositiveIntegerLimit(options?.maxEntries, DEFAULT_MAX_ENTRIES),
    maxPartBytes: resolvePositiveIntegerLimit(options?.maxPartBytes, DEFAULT_MAX_PART_BYTES),
    maxTotalUncompressedBytes: resolvePositiveIntegerLimit(
      options?.maxTotalUncompressedBytes,
      DEFAULT_MAX_TOTAL_UNCOMPRESSED_BYTES,
    ),
    maxExpansionRatio: positiveFiniteLimit(options?.maxExpansionRatio, DEFAULT_MAX_EXPANSION_RATIO),
    maxDepth: resolvePositiveIntegerLimit(options?.maxDepth, DEFAULT_MAX_DEPTH),
  };
}

function positiveFiniteLimit(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : fallback;
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
    case 'expansion-ratio-cap':
      return {
        code: 'size-cap',
        message: `Skipped entry "${entry.path}" because its declared compression ratio exceeds ${String(caps.maxExpansionRatio)}:1.`,
        detail: entry.path,
      };
    case 'path-cap':
      return {
        code: 'depth-cap',
        message: `Skipped entry "${entry.path}" because its archive path exceeds depth ${String(caps.maxDepth)}.`,
        detail: entry.path,
      };
    case 'unsafe-path':
      return {
        code: 'malformed-xml',
        message: `Skipped unsafe or duplicate archive path "${entry.path}".`,
        detail: entry.path,
      };
    case 'malformed-archive':
      return {
        code: 'malformed-xml',
        message: 'PPTX package is not a readable ZIP archive — import rejected.',
        detail: entry.path,
      };
  }
}
