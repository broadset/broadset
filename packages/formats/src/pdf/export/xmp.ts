import type { BroadsetDocument } from '@broadset/model';
import { type PDFDocument, PDFName, PDFRawStream } from 'pdf-lib';

import { fingerprintElement } from '../../_shared/fingerprint';
import {
  BROADSET_XMP_VERSION,
  type BroadsetXmpPacket,
  writeBroadsetXmp,
} from '../../_shared/xmp';

/**
 * Optional fields layered onto the base `broadset:` packet at build
 * time. Today only the PDF/A identifier is carried via this options
 * hatch; future PDF-specific identifiers can extend the shape.
 */
export interface BroadsetXmpPacketOptions {
  readonly pdfa?: { readonly part: string; readonly conformance: string };
}

/**
 * Build a `broadset:` XMP packet (IO-D-08 shared namespace) from the
 * document. The packet carries the document id, packet version, export
 * timestamp, and per-element identity entries (id + content-hash
 * fingerprint) so round-trip importers (P6.4a) can hydrate state before
 * walking the operator stream and the reconciliation pipeline (P6.5) can
 * recover identity via `_shared/fingerprint/` when an external tool has
 * stripped the `/BSET` marked-content tags.
 *
 * When PDF/A mode is requested, callers pass `{ pdfa: { part, conformance } }`
 * and the packet emits the `pdfaid:part` + `pdfaid:conformance` block
 * alongside the `broadset:` block (ISO 19005-1 Annex C).
 */
export async function buildBroadsetXmpPacket(
  doc: BroadsetDocument,
  options: BroadsetXmpPacketOptions = {},
): Promise<BroadsetXmpPacket> {
  const entries = await Promise.all(
    doc.elements.map(async (el) => ({
      id: el.id,
      fingerprint: await fingerprintElement(el),
      // Carry the element's full JSON snapshot so the importer can
      // hydrate geometry, style, and content without re-deriving them
      // from the operator stream. The XMP packet is the trusted
      // round-trip surface for Broadset-authored PDFs (IO-D-08).
      payload: JSON.stringify(el),
    })),
  );

  return {
    documentId: doc.id,
    version: BROADSET_XMP_VERSION,
    exportedAt: new Date().toISOString(),
    elements: entries,
    ...(options.pdfa !== undefined ? { pdfa: options.pdfa } : {}),
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
