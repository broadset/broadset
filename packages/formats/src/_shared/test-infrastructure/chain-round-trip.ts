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

export interface ChainRoundTripInput {
  readonly source: BroadsetDocument;
  readonly exportBytes: (doc: BroadsetDocument) => Uint8Array;
  readonly importDocument: (bytes: Uint8Array) => BroadsetDocument;
}

export interface ChainRoundTripResult {
  readonly source: BroadsetDocument;
  readonly exportedBytes: Uint8Array;
  readonly imported: BroadsetDocument;
}

export function runChainRoundTrip(input: ChainRoundTripInput): ChainRoundTripResult {
  const exportedBytes = input.exportBytes(input.source);
  const imported = input.importDocument(exportedBytes);

  return { source: input.source, exportedBytes, imported };
}

export interface PreservedBlobStressInput {
  /** The base64 blob stashed under the format's preservation key. */
  readonly blobBase64: string;
  /** Serializer that roundtrips a Broadset doc through `.bsp` save + load. */
  readonly saveAndLoad: (doc: BroadsetDocument) => BroadsetDocument;
  /** A document whose element carries the blob in `extensions.<format>`. */
  readonly seedDocument: BroadsetDocument;
  /** A path extractor returning the blob from the loaded doc. */
  readonly extractBlob: (doc: BroadsetDocument) => string | undefined;
}

/**
 * Audit A2 preserved-blob stress helper. Confirms a format's
 * preservation key survives a `.bsp` save + load byte-for-byte. The
 * canonical caller pumps a 200 KB blob through every format's
 * preservation pathway; this helper handles the save/load/extract
 * pipeline so each format only has to wire its seed doc and extractor.
 */
export function assertPreservedBlobSurvives(input: PreservedBlobStressInput): void {
  const roundTripped = input.saveAndLoad(input.seedDocument);
  const recovered = input.extractBlob(roundTripped);

  if (recovered === undefined) {
    throw new Error('assertPreservedBlobSurvives: extractor returned undefined after round-trip');
  }

  if (recovered !== input.blobBase64) {
    const beforeLen = String(input.blobBase64.length);
    const afterLen = String(recovered.length);

    throw new Error(`assertPreservedBlobSurvives: blob changed (${beforeLen} → ${afterLen} bytes)`);
  }
}
