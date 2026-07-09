import { describe, expect, it } from 'vitest';

import { exportPdfBytes, importPdfDocument, validatePdfA2b, validatePdfAXmpPacket } from './index';
import { makeDocument, makeElement, makeStyle } from './test-helpers';

/**
 * Phase 9 — PDF/A-2b conformance tests. Cover the structural floor
 * the in-tree `validatePdfA2b` validator enforces:
 *
 * - `pdfaConformance: '2b'` opt-in produces a valid PDF/A-2b file.
 * - The `pdfaid:` XMP block is present with `part="2"` and
 *   `conformance="B"`.
 * - The trailer carries an `/ID` array.
 * - The catalog carries an `/OutputIntents` array with `/GTS_PDFA1`.
 * - No `/Encrypt`, no `/JavaScript`, no `LZWDecode` filter.
 * - Default (non-PDF/A) exports do NOT carry the PDF/A surfaces.
 * - Re-importing a PDF/A export preserves the `pdfaid:` identifiers
 *   on the document for round-trip re-emission.
 *
 * Full ISO 19005-2 conformance via veraPDF is recorded as a Spec Gap
 * in `project/spec/formats/pdf.md` § PDF/A-2b Conformance Mode → Spec
 * Gaps.
 */

describe('PDF/A-2b — exportPdfBytes opt-in', () => {
  /**
   * @description Default export (no `pdfaConformance` flag) emits
   * regular PDF 1.7 — no `/OutputIntents`, no `pdfaid:` XMP block.
   * The default path stays minimal so users who don't need PDF/A
   * don't pay for embedded ICC profiles.
   */
  it('does not emit PDF/A surfaces when the option is omitted', async () => {
    const doc = makeDocument({
      id: 'no-pdfa',
      elements: [makeElement('rectangle', { id: 'rect-no-pdfa', style: makeStyle() })],
    });

    const bytes = await exportPdfBytes(doc);
    const text = new TextDecoder('latin1').decode(bytes);

    expect(text).not.toContain('/OutputIntents');
    expect(text).not.toContain('pdfaid:');
  });

  /**
   * @description `pdfaConformance: '2b'` makes the exporter embed a
   * `/OutputIntents` array referencing an ICC profile and emit the
   * `pdfaid:part` / `pdfaid:conformance` XMP block.
   */
  it('emits /OutputIntents and pdfaid: XMP when pdfaConformance is 2b', async () => {
    const doc = makeDocument({
      id: 'pdfa-doc',
      elements: [makeElement('rectangle', { id: 'rect-pdfa', style: makeStyle() })],
    });

    const bytes = await exportPdfBytes(doc, { pdfaConformance: '2b' });
    const text = new TextDecoder('latin1').decode(bytes);

    expect(text).toContain('/OutputIntents');
    expect(text).toContain('/GTS_PDFA1');
    expect(text).toContain('pdfaid:part');
    expect(text).toContain('pdfaid:conformance');
  });

  /**
   * @description The trailer carries an `/ID` array per PDF/A-2b
   * requirement.
   */
  it('emits a populated trailer /ID array under PDF/A mode', async () => {
    const doc = makeDocument({
      id: 'pdfa-trailer-id',
      elements: [makeElement('rectangle', { id: 'rt-id', style: makeStyle() })],
    });

    const bytes = await exportPdfBytes(doc, { pdfaConformance: '2b' });
    const text = new TextDecoder('latin1').decode(bytes);

    expect(text).toMatch(/trailer[\s\S]*?\/ID\s*\[/);
  });
});

describe('PDF/A-2b — validatePdfA2b', () => {
  /**
   * @description The in-tree validator confirms a Broadset-exported
   * PDF/A passes the structural floor: XMP block present, trailer
   * `/ID` populated, `/OutputIntents` includes `/GTS_PDFA1`, no
   * `/Encrypt`, no `/JavaScript`, no LZW filter.
   */
  it('validates a freshly-exported PDF/A document', async () => {
    const doc = makeDocument({
      id: 'pdfa-validate',
      elements: [
        makeElement('rectangle', { id: 'rect-v', style: makeStyle() }),
        makeElement('text', { id: 'text-v', content: 'Hello', style: makeStyle({ fontFamily: 'Helvetica' }) }),
      ],
    });

    const bytes = await exportPdfBytes(doc, { pdfaConformance: '2b' });
    const result = await validatePdfA2b(bytes);

    expect(result.valid).toBe(true);
    expect(result.violations).toEqual([]);
  });

  /**
   * @description A non-PDF/A export fails the validator with the
   * expected per-rule violations enumerated. Confirms the validator
   * actually catches missing surfaces rather than no-op-passing.
   */
  it('rejects a non-PDF/A document with explicit violation messages', async () => {
    const doc = makeDocument({
      id: 'plain-pdf',
      elements: [makeElement('rectangle', { id: 'rect-plain', style: makeStyle() })],
    });

    const bytes = await exportPdfBytes(doc); // no pdfaConformance
    const result = await validatePdfA2b(bytes);

    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.includes('OutputIntents'))).toBe(true);
    expect(result.violations.some((v) => v.includes('pdfaid'))).toBe(true);
  });

  /**
   * @description Malformed input fails validation with a clear
   * "could not load" violation rather than crashing.
   */
  it('returns a load-failure violation for malformed bytes', async () => {
    const garbage = new Uint8Array([0x00, 0x01, 0x02]);
    const result = await validatePdfA2b(garbage);

    expect(result.valid).toBe(false);
    expect(result.violations[0]).toContain('could not load');
  });
});

describe('PDF/A-2b — validatePdfAXmpPacket', () => {
  /**
   * @description The standalone XMP validator confirms a packet has
   * the `pdfaid:` block with the expected part / conformance values.
   */
  it('passes when pdfaid:part="2" and pdfaid:conformance="B"', () => {
    const xmp = `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about="" xmlns:broadset="https://broadset.io/ns/xmp/1.0/">
      <broadset:documentId>doc-1</broadset:documentId>
      <broadset:version>1.0</broadset:version>
      <broadset:exportedAt>2026-04-26T00:00:00Z</broadset:exportedAt>
      <broadset:elements><rdf:Seq/></broadset:elements>
    </rdf:Description>
    <rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">
      <pdfaid:part>2</pdfaid:part>
      <pdfaid:conformance>B</pdfaid:conformance>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>`;

    const result = validatePdfAXmpPacket(xmp);

    expect(result.valid).toBe(true);
  });

  /**
   * @description When the pdfaid: block is missing, the validator
   * reports the gap so callers can patch their exporter without
   * decoding a binary PDF.
   */
  it('flags missing pdfaid: block', () => {
    const xmp = `<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about="" xmlns:broadset="https://broadset.io/ns/xmp/1.0/">
      <broadset:documentId>doc-1</broadset:documentId>
      <broadset:version>1.0</broadset:version>
      <broadset:exportedAt>2026-04-26T00:00:00Z</broadset:exportedAt>
      <broadset:elements><rdf:Seq/></broadset:elements>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>`;

    const result = validatePdfAXmpPacket(xmp);

    expect(result.valid).toBe(false);
    expect(result.violations[0]).toContain('pdfaid');
  });
});

describe('PDF/A-2b — round-trip preserves identifiers', () => {
  /**
   * @description A Broadset PDF/A export re-imported via
   * `importPdfDocument` must surface the `pdfaid:` identifiers on
   * `extensions.pdf.pdfa` so the next export can re-emit them when
   * the user has not changed output settings.
   */
  it('preserves pdfaid: identifiers on extensions.pdf.pdfa during re-import', async () => {
    const doc = makeDocument({
      id: 'pdfa-round-trip',
      elements: [makeElement('rectangle', { id: 'rt-rt', style: makeStyle() })],
    });

    const bytes = await exportPdfBytes(doc, { pdfaConformance: '2b' });
    const result = await importPdfDocument(bytes);

    const extensions = result.document.extensions;
    const pdfExt = extensions?.['pdf'] as Record<string, unknown> | undefined;
    const pdfa = pdfExt?.['pdfa'] as Record<string, unknown> | undefined;

    expect(pdfa?.['part']).toBe('2');
    expect(pdfa?.['conformance']).toBe('B');
  });
});
