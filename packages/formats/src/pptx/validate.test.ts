import { createDefaultElement, createEmptyBroadsetDocument } from '@broadset/model';
import { describe, expect, it } from 'vitest';

import { exportPptxBytes } from './export';
import { encodeText, writeOoxmlPackage } from './ooxml/zip';
import { validatePptxPackage } from './validate';

/**
 * @description The OOXML validation gate catches malformed packages
 * before callers see "repair" dialogs. A Broadset-exported PPTX must
 * validate clean; contrived malformed packages must surface specific
 * error codes.
 */
describe('validatePptxPackage — Broadset-exported PPTX', () => {
  it('reports a Broadset-exported empty document as valid', () => {
    const bytes = exportPptxBytes(createEmptyBroadsetDocument());
    const result = validatePptxPackage(bytes);

    expect(result.valid).toBe(true);
    expect(result.issues.filter((i) => i.level === 'error')).toEqual([]);
  });

  it('reports a Broadset-exported document with elements as valid', () => {
    const doc = {
      ...createEmptyBroadsetDocument(),
      elements: [
        createDefaultElement('rectangle', { id: 'r1' }),
        createDefaultElement('text', { id: 't1', content: 'hello' }),
        createDefaultElement('ellipse', { id: 'e1' }),
      ],
    };
    const bytes = exportPptxBytes(doc);
    const result = validatePptxPackage(bytes);

    expect(result.valid).toBe(true);
  });
});

describe('validatePptxPackage — malformed packages', () => {
  it('reports invalid ZIP', () => {
    const result = validatePptxPackage(new Uint8Array([0, 1, 2, 3]));

    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === 'zip-invalid')).toBe(true);
  });

  it('reports missing [Content_Types].xml', () => {
    const bytes = writeOoxmlPackage(
      new Map([
        ['_rels/.rels', encodeText('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>')],
      ]),
    );
    const result = validatePptxPackage(bytes);

    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === 'missing-content-types')).toBe(true);
  });

  it('reports missing root rels', () => {
    const bytes = writeOoxmlPackage(
      new Map([['[Content_Types].xml', encodeText('<Types/>')]]),
    );
    const result = validatePptxPackage(bytes);

    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === 'missing-root-rels')).toBe(true);
  });

  it('reports a dangling presentation relationship', () => {
    const bytes = writeOoxmlPackage(
      new Map([
        ['[Content_Types].xml', encodeText('<Types/>')],
        [
          '_rels/.rels',
          encodeText(
            '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>',
          ),
        ],
      ]),
    );
    const result = validatePptxPackage(bytes);

    expect(result.issues.some((i) => i.code === 'dangling-presentation-rel')).toBe(true);
  });

  it('rejects packages containing vbaProject.bin', () => {
    const bytes = writeOoxmlPackage(
      new Map([
        ['[Content_Types].xml', encodeText('<Types/>')],
        [
          '_rels/.rels',
          encodeText(
            '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>',
          ),
        ],
        ['ppt/vbaProject.bin', new Uint8Array([0, 0, 0, 0])],
      ]),
    );
    const result = validatePptxPackage(bytes);

    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === 'macro-payload-present')).toBe(true);
  });
});
