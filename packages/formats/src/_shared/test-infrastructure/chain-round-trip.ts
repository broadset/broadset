import { type BroadsetDocument } from '@broadset/model';

/**
 * Phase 6 I6.2 — shared chain round-trip helper. Every format's
 * Phase 5 test suite uses this to cover the headline scenario:
 * `Broadset doc → export → re-import → assert survival`. The helper
 * is format-agnostic — callers inject the exporter + importer
 * closures so the harness stays in `_shared/` rather than being
 * duplicated per format.
 *
 * Usage:
 * ```ts
 * const result = runChainRoundTrip({
 *   source: doc,
 *   exportBytes: exportPsdBytes,
 *   importDocument: importPsd,
 * });
 *
 * expect(result.imported.elements).toHaveLength(source.elements.length);
 * ```
 */

interface ChainRoundTripInput {
  readonly source: BroadsetDocument;
  readonly exportBytes: (doc: BroadsetDocument) => Uint8Array;
  readonly importDocument: (bytes: Uint8Array) => BroadsetDocument;
}

interface ChainRoundTripResult {
  readonly source: BroadsetDocument;
  readonly exportedBytes: Uint8Array;
  readonly imported: BroadsetDocument;
}

export function runChainRoundTrip(input: ChainRoundTripInput): ChainRoundTripResult {
  const exportedBytes = input.exportBytes(input.source);
  const imported = input.importDocument(exportedBytes);

  return { source: input.source, exportedBytes, imported };
}

