import { EncryptedPDFError, PDFDocument } from 'pdf-lib';

type PdfLoadResult =
  | { readonly kind: 'ok'; readonly pdf: PDFDocument }
  | { readonly kind: 'encrypted' }
  | { readonly kind: 'malformed' };

function isEncryptionError(error: unknown): boolean {
  if (error instanceof EncryptedPDFError) return true;

  return error instanceof Error && error.message.toLowerCase().includes('is encrypted');
}

/** Loads untrusted PDF bytes without throwing across the importer boundary. */
export async function probeLoadPdf(
  bytes: Uint8Array,
  _options: { readonly password?: string } = {},
): Promise<PdfLoadResult> {
  try {
    const pdf = await PDFDocument.load(bytes, {
      ignoreEncryption: false,
      updateMetadata: false,
    });

    return { kind: 'ok', pdf };
  } catch (error: unknown) {
    return { kind: isEncryptionError(error) ? 'encrypted' : 'malformed' };
  }
}
