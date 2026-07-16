import { PDFDocument, PDFName, PDFRawStream } from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import { parsePdfDocumentV1 } from './source-details';

describe('PDF image resource limits', () => {
  it('memoizes aliased image streams and omits oversized retained bytes', async () => {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([100, 100]);
    const small = PDFRawStream.of(
      pdf.context.obj({ Subtype: 'Image', Width: 1, Height: 1, Filter: 'DCTDecode' }),
      new Uint8Array([1, 2, 3]),
    );
    const oversized = PDFRawStream.of(
      pdf.context.obj({ Subtype: 'Image', Width: 1, Height: 1, Filter: 'DCTDecode' }),
      new Uint8Array(32 * 1024 * 1024 + 1),
    );
    const smallRef = pdf.context.register(small);

    page.node.setXObject(PDFName.of('AliasA'), smallRef);
    page.node.setXObject(PDFName.of('AliasB'), smallRef);
    page.node.setXObject(PDFName.of('Oversized'), pdf.context.register(oversized));

    const parsed = parsePdfDocumentV1(pdf);
    const aliasA = parsed?.page.images.get('AliasA');
    const aliasB = parsed?.page.images.get('AliasB');
    const omitted = parsed?.page.images.get('Oversized');

    expect(aliasA).toBe(aliasB);
    expect(omitted?.bytes).toBeUndefined();
    expect(omitted?.warnings).toContainEqual(expect.objectContaining({ code: 'pdf.image-size-limit' }));
  });
});
