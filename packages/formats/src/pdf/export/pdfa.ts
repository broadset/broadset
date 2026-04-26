import type { Asset, BroadsetDocument, IccProfileAsset } from '@broadset/model';
import { isIccProfileAsset } from '@broadset/model';
import { type PDFDocument, PDFHexString, PDFName, PDFRawStream } from 'pdf-lib';

import { DEFAULT_PROFILE_IDENTIFIER, getDefaultProfile } from '../../_shared/color';
import { decodeDataUri } from '../data-uri';

/**
 * PDF/A conformance level the exporter currently supports.
 *
 * Only `2b` is wired today; `2u` (Unicode mapping for every text run)
 * and `2a` (tagged structure tree) are explicit Spec Gaps in
 * `project/spec/formats/pdf.md`.
 */
export type PdfAConformance = '2b';

/**
 * Resolved bytes + metadata for the OutputIntent ICC profile.
 */
export interface ResolvedOutputIntent {
  readonly profileBytes: Uint8Array;
  readonly identifier: string;
  readonly numberOfComponents: number;
  readonly source: 'document-asset' | 'bundled-default';
}

/**
 * Resolve the ICC profile to embed as the document `/OutputIntent`.
 * Prefers the user's declared `document.outputIntent.iccProfileAssetId`
 * + matching `icc-profile` asset; falls back to the bundled minimal
 * sRGB profile when none is declared so PDF/A export NEVER fails for
 * "no profile available" per the spec's "fallback to bundled default"
 * scenario.
 */
export function resolveOutputIntent(
  doc: BroadsetDocument,
  assets: readonly Asset[],
): ResolvedOutputIntent {
  const declared = doc.outputIntent;

  if (declared !== undefined) {
    const asset = findIccProfileAsset(assets, declared.iccProfileAssetId);
    const bytes = asset === null ? null : iccProfileBytesFromAsset(asset);

    if (bytes !== null) {
      return {
        profileBytes: bytes,
        identifier: declared.identifier ?? DEFAULT_PROFILE_IDENTIFIER,
        numberOfComponents: numberOfComponentsForColorSpace(declared.colorSpace),
        source: 'document-asset',
      };
    }
  }

  return {
    profileBytes: getDefaultProfile('rgb'),
    identifier: DEFAULT_PROFILE_IDENTIFIER,
    numberOfComponents: 3,
    source: 'bundled-default',
  };
}

function findIccProfileAsset(assets: readonly Asset[], id: string): IccProfileAsset | null {
  for (const asset of assets) {
    if (asset.id === id && isIccProfileAsset(asset)) {
      return asset;
    }
  }

  return null;
}

/**
 * Resolve the ICC profile bytes from an `IccProfileAsset`. Today only
 * the `embedded` (base64 data URI) source is supported; `url` and
 * `file` sources require an async fetch and land with the asset
 * pipeline integration. Returns `null` when the asset cannot be
 * resolved synchronously so the caller falls back to the bundled
 * default.
 */
function iccProfileBytesFromAsset(asset: IccProfileAsset): Uint8Array | null {
  const source = asset.source;

  if (source.type !== 'embedded') return null;

  const decoded = decodeDataUri(source.dataUri);

  if (decoded === undefined) return null;

  return decoded.bytes;
}

function numberOfComponentsForColorSpace(colorSpace: 'rgb' | 'cmyk' | 'gray' | 'lab'): number {
  switch (colorSpace) {
    case 'rgb':
    case 'lab':
      return 3;
    case 'cmyk':
      return 4;
    case 'gray':
      return 1;
  }
}

/**
 * Attach the PDF/A `/OutputIntent` array to the document catalog. The
 * ICC profile bytes are emitted as a Flate-encoded raw stream with
 * `/N <numberOfComponents>` so PDF/A validators can read the embedded
 * profile.
 */
export function attachOutputIntent(pdf: PDFDocument, intent: ResolvedOutputIntent): void {
  const profileStreamDict = pdf.context.obj({
    N: intent.numberOfComponents,
    Length: intent.profileBytes.length,
  });
  const profileStream = PDFRawStream.of(profileStreamDict, intent.profileBytes);
  const profileRef = pdf.context.register(profileStream);

  const outputIntentDict = pdf.context.obj({
    Type: 'OutputIntent',
    S: 'GTS_PDFA1',
    OutputConditionIdentifier: intent.identifier,
    Info: intent.identifier,
    DestOutputProfile: profileRef,
  });

  pdf.catalog.set(PDFName.of('OutputIntents'), pdf.context.obj([outputIntentDict]));
}

/**
 * Ensure the file trailer carries an `ID` array. PDF/A-2b requires
 * one for byte-stable identity across copies; pdf-lib does not write
 * one by default for documents without incremental updates, so we
 * synthesise a deterministic 16-byte hex pair from the document id.
 */
export function ensureTrailerId(pdf: PDFDocument, documentId: string): void {
  const idBytes = deterministicId(documentId);
  const idHex = PDFHexString.of(bytesToHex(idBytes));

  pdf.context.trailerInfo.ID = pdf.context.obj([idHex, idHex]);
}

function deterministicId(seed: string): Uint8Array {
  // 16-byte FNV-1a-derived id; sufficient for trailer-ID stability
  // (PDF/A only requires the field be present and 16 bytes per entry).
  const bytes = new Uint8Array(16);
  let hash = 0x811c9dc5;

  for (let i = 0; i < bytes.length; i++) {
    for (let j = 0; j < seed.length; j++) {
      hash ^= seed.charCodeAt(j) + i;
      hash = Math.imul(hash, 0x01000193);
    }

    bytes[i] = (hash >>> ((i % 4) * 8)) & 0xff;
  }

  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  let out = '';

  for (let i = 0; i < bytes.length; i++) {
    out += (bytes[i] ?? 0).toString(16).padStart(2, '0');
  }

  return out;
}
