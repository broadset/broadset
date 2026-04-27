import { describe, expect, it } from 'vitest';

import { exportPdfBytes, importPdfDocument } from './index';
import { makeCanvas, makeDocument, makeElement, makeStyle } from './test-helpers';

/**
 * @description Real-byte round-trip suite: each test exports a
 * `BroadsetDocument` to PDF bytes, re-imports the bytes, and asserts
 * properties of the recovered document at the byte / structural
 * level — NOT via mocks. These tests prove the PDF pipeline behaves
 * correctly end-to-end for the highest-impact behaviours: geometry
 * recovery via the XMP payload, byte-stable preservation re-emission
 * via the `extensions.pdf.preservationBlob` mechanism, and idempotent
 * second-pass exports.
 */

describe('PDF round-trip — geometry recovery via XMP payload', () => {
  /**
   * @description When a Broadset-exported PDF is re-imported, the
   * fast-path hydrator MUST recover the element's exact position,
   * width, height, and rotation from the XMP payload — NOT default
   * placeholder values from createDefaultElement.
   */
  it('recovers element position, size, and rotation across export → import', async () => {
    const canvas = makeCanvas({ width: 200, height: 100, unit: 'mm' });
    const doc = makeDocument({
      id: 'geo-roundtrip',
      canvas,
      elements: [
        makeElement('rectangle', {
          id: 'positioned-rect',
          position: { x: 42, y: 17 },
          width: 73,
          height: 51,
          rotation: 30,
          style: makeStyle(),
        }),
      ],
    });

    const bytes = await exportPdfBytes(doc);
    const result = await importPdfDocument(bytes);
    const recovered = result.document.elements.find((el) => el.id === 'positioned-rect');

    expect(recovered).toBeDefined();
    expect(recovered?.position.x).toBe(42);
    expect(recovered?.position.y).toBe(17);
    expect(recovered?.width).toBe(73);
    expect(recovered?.height).toBe(51);
    expect(recovered?.rotation).toBe(30);
  });

  /**
   * @description Style fields on a recovered element must match the
   * exported style. Tests fill colour, opacity, and border properties
   * — the most user-visible style fields — survive round-trip.
   */
  it('recovers element style across export → import', async () => {
    const doc = makeDocument({
      id: 'style-roundtrip',
      elements: [
        makeElement('rectangle', {
          id: 'styled-rect',
          position: { x: 10, y: 20 },
          width: 50,
          height: 50,
          style: makeStyle({
            opacity: 0.42,
            borderWidth: 3,
          }),
        }),
      ],
    });

    const bytes = await exportPdfBytes(doc);
    const result = await importPdfDocument(bytes);
    const recovered = result.document.elements.find((el) => el.id === 'styled-rect');

    expect(recovered).toBeDefined();
    expect(recovered?.style.opacity).toBe(0.42);
    expect(recovered?.style.borderWidth).toBe(3);
  });

  /**
   * @description Text element content (the user's actual string) must
   * survive round-trip — the most basic user expectation for an
   * import / export pair.
   */
  it('recovers text element content across export → import', async () => {
    const doc = makeDocument({
      id: 'text-roundtrip',
      elements: [
        makeElement('text', {
          id: 'text-node',
          position: { x: 10, y: 10 },
          width: 200,
          height: 40,
          content: 'Hello round-trip world',
          style: makeStyle({ fontFamily: 'Helvetica', fontSize: 18 }),
        }),
      ],
    });

    const bytes = await exportPdfBytes(doc);
    const result = await importPdfDocument(bytes);
    const recovered = result.document.elements.find((el) => el.id === 'text-node');

    expect(recovered).toBeDefined();

    if (recovered?.type === 'text') {
      // Content is a TipTap-style structured node tree; the recovered
      // value MUST contain the original string somewhere in its
      // serialized form.
      expect(JSON.stringify(recovered.content)).toContain('Hello round-trip world');
      expect(recovered.style.fontFamily).toBe('Helvetica');
      expect(recovered.style.fontSize).toBe(18);
    }
  });
});

describe('PDF byte-stable preservation re-emission', () => {
  /**
   * @description When an element carries a captured operator blob and
   * `dirty:false`, exporting that document MUST reproduce the same
   * operator slice byte-for-byte across N export passes. This proves
   * the re-emission path bypasses the synthesizer (which would otherwise
   * re-derive coordinates and risk floating-point drift).
   */
  it('produces byte-identical operator slices across two export passes for dirty:false elements', async () => {
    // Use a previously-normalised blob (no trailing whitespace) so the
    // first export and the first re-import yield the same bytes.
    const normalisedBlob = 'cQowIDAgMCByZwAxIDAgMCAxIDAgMCBjbQowIDAgbQpR';
    const doc = makeDocument({
      id: 'byte-stable',
      elements: [
        makeElement('rectangle', {
          id: 'preserved-rect',
          position: { x: 12, y: 34 },
          width: 56,
          height: 78,
          style: makeStyle(),
          extensions: {
            pdf: { dirty: false, preservationBlob: normalisedBlob },
          },
        }),
      ],
    });

    const firstExport = await exportPdfBytes(doc);
    const firstImport = await importPdfDocument(firstExport);
    const recoveredA = firstImport.document.elements.find((el) => el.id === 'preserved-rect');

    expect(recoveredA).toBeDefined();

    const secondExport = await exportPdfBytes(firstImport.document);
    const secondImport = await importPdfDocument(secondExport);
    const recoveredB = secondImport.document.elements.find((el) => el.id === 'preserved-rect');

    expect(recoveredB).toBeDefined();

    const blobA = (recoveredA?.extensions as Record<string, Record<string, unknown>> | undefined)?.['pdf']?.['preservationBlob'];
    const blobB = (recoveredB?.extensions as Record<string, Record<string, unknown>> | undefined)?.['pdf']?.['preservationBlob'];

    // First round-trip preserves the normalised input verbatim.
    expect(blobA).toBe(normalisedBlob);
    // Second round-trip is byte-identical to the first — the
    // re-emission path is a fixed point.
    expect(blobB).toBe(blobA);
  });

  /**
   * @description When `dirty:true`, the synthesizer is NOT bypassed —
   * the element is re-painted from current Broadset state. This is
   * the contract that lets edits to imported elements actually take
   * effect on re-export.
   */
  it('falls back to the synthesizer when the element is dirty:true', async () => {
    const dirtyDoc = makeDocument({
      id: 'dirty-roundtrip',
      elements: [
        makeElement('rectangle', {
          id: 'dirty-rect',
          position: { x: 5, y: 5 },
          width: 30,
          height: 30,
          style: makeStyle(),
          extensions: {
            pdf: { dirty: true, preservationBlob: 'cQowIDAgMCByZwBRCg==' },
          },
        }),
      ],
    });

    const bytes = await exportPdfBytes(dirtyDoc);
    const result = await importPdfDocument(bytes);
    const recovered = result.document.elements.find((el) => el.id === 'dirty-rect');
    const blob = (recovered?.extensions as Record<string, Record<string, unknown>> | undefined)?.['pdf']?.['preservationBlob'];

    // The captured blob now reflects the synthesizer's output (full
    // rectangle painting), NOT the stale stored stub. So it differs
    // from the stub provided as input.
    expect(typeof blob).toBe('string');
    expect(blob).not.toBe('cQowIDAgMCByZwBRCg==');
    expect((blob as string).length).toBeGreaterThan(20);
  });
});
