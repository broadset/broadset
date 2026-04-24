import { type BroadsetXmpPacket, readBroadsetXmp } from '../_shared/xmp';

/**
 * Phase 5 P5.4a — fast-path import reads the `broadset:`-namespaced
 * XMP packet produced by `exportPsdBytes` (see `export-xmp.ts`) and
 * returns its parsed form. Callers use the packet to seed the
 * reconciliation pipeline: element ids + fingerprints from the
 * packet are the canonical identity source; the PSD layer tree only
 * contributes visible geometry/style.
 *
 * Returns `null` when the PSD carries no packet or when the packet
 * fails Zod validation so the importer can fall back to layer-tree
 * extraction (P5.4b) without throwing.
 */
export interface PsdWithImageResources {
  readonly imageResources?:
    | {
        readonly xmpMetadata?: string | undefined;
      }
    | undefined;
}

export function readDocumentXmpPacket(psd: PsdWithImageResources): BroadsetXmpPacket | null {
  const xmp = psd.imageResources?.xmpMetadata;

  if (typeof xmp !== 'string' || xmp.length === 0) return null;

  return readBroadsetXmp(xmp);
}
