import type { BroadsetDocument } from '@broadset/model';
import { type PDFDocument, PDFName, PDFRawStream } from 'pdf-lib';

import { fingerprintElement } from '../../_shared/fingerprint';
import {
  BROADSET_XMP_VERSION,
  type BroadsetXmpPacket,
  writeBroadsetXmp,
} from '../../_shared/xmp';

/**
 * Build a `broadset:` XMP packet (IO-D-08 shared namespace) from the
 * document. The packet carries the document id, packet version, export
 * timestamp, and per-element identity entries (id + content-hash
 * fingerprint) so round-trip importers (P6.4a) can hydrate state before
 * walking the operator stream and the reconciliation pipeline (P6.5) can
 * recover identity via `_shared/fingerprint/` when an external tool has
 * stripped the `/BSET` marked-content tags.
 */
export async function buildBroadsetXmpPacket(doc: BroadsetDocument): Promise<BroadsetXmpPacket> {
  const entries = await Promise.all(
    doc.elements.map(async (el) => ({ id: el.id, fingerprint: await fingerprintElement(el) })),
  );

  return {
    documentId: doc.id,
    version: BROADSET_XMP_VERSION,
    exportedAt: new Date().toISOString(),
    elements: entries,
  };
}

/**
 * Attach the `broadset:` XMP packet to the PDF document catalog's
 * `/Metadata` entry as a PDF metadata stream (`/Type /Metadata
 * /Subtype /XML`). Per ISO 16684-1 this is how ISO-compliant readers
 * expose the packet to format-aware tooling.
 */
export function attachBroadsetXmp(pdf: PDFDocument, packet: BroadsetXmpPacket): void {
  const xmpString = writeBroadsetXmp(packet);
  const xmpBytes = new TextEncoder().encode(xmpString);

  const streamDict = pdf.context.obj({
    Type: 'Metadata',
    Subtype: 'XML',
    Length: xmpBytes.length,
  });
  const stream = PDFRawStream.of(streamDict, xmpBytes);
  const ref = pdf.context.register(stream);

  pdf.catalog.set(PDFName.of('Metadata'), ref);
}
