import { rgbColor } from '@broadset/model';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import { exportPdfBytes, importPdfDocument } from './index';
import { makeDocument, makeElement, makeStyle } from './test-helpers';

/**
 * Build a bare PDF via pdf-lib directly (no `broadset:` XMP packet, no
 * marked-content tags). The operator extraction pass (P6.4b) should
 * recover text content from these.
 */
async function buildBarePdfWithText(
  texts: readonly { readonly content: string; readonly x: number; readonly y: number; readonly size: number }[],
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  for (const item of texts) {
    page.drawText(item.content, {
      x: item.x,
      y: item.y,
      size: item.size,
      color: rgb(0, 0, 0),
      font,
    });
  }

  return await pdf.save();
}

describe('P6.4b PDF import — third-party operator extraction', () => {
  /**
   * @description A PDF without the `broadset:` XMP packet must still
   * import usefully — the operator extraction pass recovers text
   * content from `Tj` operators and surfaces it as Broadset text
   * elements. Exact positioning is best-effort and bounded by
   * `_shared/`-wide approximations.
   */
  it('extracts text elements from a bare third-party PDF', async () => {
    const bytes = await buildBarePdfWithText([
      { content: 'Hello PDF', x: 72, y: 720, size: 14 },
      { content: 'Bottom line', x: 100, y: 60, size: 10 },
    ]);

    const result = await importPdfDocument(bytes);
    const textElements = result.document.elements.filter((el) => el.type === 'text');
    const recoveredTexts = textElements.map((el) => el.content);

    expect(recoveredTexts).toContain('Hello PDF');
    expect(recoveredTexts).toContain('Bottom line');
  });

  /**
   * @description Text recovered from an arbitrary third-party PDF is
   * untrusted input. The importer MUST sanitize script tags and HTML
   * event-handler attributes before returning Broadset text elements,
   * so later editing/rendering surfaces never receive active markup
   * from extracted PDF operators.
   */
  it('sanitizes hostile markup extracted from bare third-party PDF text', async () => {
    const bytes = await buildBarePdfWithText([
      { content: '<img src=x onerror=alert(1)> safe <script>alert(2)</script>', x: 72, y: 720, size: 14 },
    ]);

    const result = await importPdfDocument(bytes);
    const recoveredText = result.document.elements
      .filter((el) => el.type === 'text')
      .map((el) => (typeof el.content === 'string' ? el.content : ''))
      .join('\n');

    expect(recoveredText).toContain('safe');
    expect(recoveredText.toLowerCase()).not.toContain('<script');
    expect(recoveredText).not.toMatch(/\son[a-z]+\s*=/i);
  });

  /**
   * @description Third-party imports MUST surface a warning explaining
   * what extraction did — and what it didn't. Users need to know that
   * shapes / images are Spec Gap today so they don't assume the import
   * is complete.
   */
  it('surfaces an operator-extraction warning for third-party PDFs', async () => {
    const bytes = await buildBarePdfWithText([{ content: 'Warn me', x: 50, y: 700, size: 12 }]);
    const result = await importPdfDocument(bytes);

    expect(result.warnings.some((w) => w.toLowerCase().includes('p6.4b') || w.toLowerCase().includes('operator'))).toBe(true);
  });

  /**
   * @description A PDF with zero text-bearing operators must still
   * produce a non-crashing import. The empty-doc branch emits a
   * distinct warning from the partial-extraction branch so UIs can
   * render appropriate messaging.
   */
  it('returns an empty document with a clear warning for text-less bare PDFs', async () => {
    const pdf = await PDFDocument.create();

    pdf.addPage([612, 792]);

    const bytes = await pdf.save();
    const result = await importPdfDocument(bytes);

    expect(result.document.elements).toHaveLength(0);
    expect(result.warnings[0]).toMatch(/empty/i);
  });

  /**
   * @description Broadset-exported PDFs MUST still take the fast-path —
   * the third-party extraction is the else branch. A document with the
   * `broadset:` XMP packet gets hydrated with the XMP id even if its
   * operator stream contains text.
   */
  it('prefers the XMP fast-path over operator extraction when the broadset: packet is present', async () => {
    const doc = makeDocument({
      id: 'prefer-xmp-doc',
      elements: [
        makeElement('rectangle', {
          id: 'rect-prefer',
          style: makeStyle({ fill: { kind: 'solid', color: rgbColor('#ff00aa') } }),
        }),
      ],
    });

    const bytes = await exportPdfBytes(doc);
    const result = await importPdfDocument(bytes);

    expect(result.document.id).toBe('prefer-xmp-doc');
    // Fast-path hydrates from the marked-content tag, not from operator text.
    expect(result.document.elements.map((el) => el.id)).toContain('rect-prefer');
  });
});
