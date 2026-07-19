import { EncryptedPDFError, PDFDocument } from 'pdf-lib';

import { parsePdfDocumentV1 } from '../v1/source-details';
import type { ParsedPdfDocumentV1 } from '../v1/types';

export type PdfParseResultV1 =
  | { readonly kind: 'ok'; readonly parsed: ParsedPdfDocumentV1 | undefined }
  | { readonly kind: 'encrypted' }
  | { readonly kind: 'malformed' };

function isEncryptionError(error: unknown): boolean {
  if (error instanceof EncryptedPDFError) return true;

  return error instanceof Error && error.message.toLowerCase().includes('is encrypted');
}

/** Loads untrusted PDF bytes without throwing across the importer boundary. */
export async function parsePdfBytesV1(
  bytes: Uint8Array,
  _options: { readonly password?: string } = {},
): Promise<PdfParseResultV1> {
  try {
    const pdf = await PDFDocument.load(bytes, {
      ignoreEncryption: false,
      updateMetadata: false,
    });

    return { kind: 'ok', parsed: parsePdfDocumentV1(pdf) };
  } catch (error: unknown) {
    return { kind: isEncryptionError(error) ? 'encrypted' : 'malformed' };
  }
}
