import { describe, expect, it } from 'vitest';

import {
  containsForbiddenXmlDeclaration,
  inspectMarkupBounds,
  measureUtf8BytesUpTo,
  productFitsLimit,
} from './import-limits';

describe('shared hostile-input limits', () => {
  it('stops UTF-8 measurement once the configured byte cap is exceeded', () => {
    expect(measureUtf8BytesUpTo('a€🙂', 7)).toEqual({ status: 'exceeded' });
    expect(measureUtf8BytesUpTo('a€🙂', 8)).toEqual({ status: 'within', byteLength: 8 });
  });

  it('rejects unsafe allocation products without overflowing multiplication', () => {
    expect(productFitsLimit([30_000, 30_000, 4], 512 * 1024 * 1024)).toBe(false);
    expect(productFitsLimit([100, 100, 4], 512 * 1024 * 1024)).toBe(true);
  });

  it('bounds markup node count and depth before DOM allocation', () => {
    const nested = `<svg>${'<g>'.repeat(5)}<rect/>${'</g>'.repeat(5)}</svg>`;

    expect(inspectMarkupBounds(nested, { maxNodes: 20, maxDepth: 3 })).toEqual({
      status: 'rejected',
      reason: 'depth-limit',
    });
    expect(inspectMarkupBounds('<svg><rect/><rect/></svg>', { maxNodes: 2, maxDepth: 10 })).toEqual({
      status: 'rejected',
      reason: 'node-limit',
    });
  });

  it('counts text, comment, CDATA, and processing-instruction nodes before DOM allocation', () => {
    const nodes = '<?xml version="1.0"?><svg>text<!--comment--><![CDATA[data]]></svg>';

    expect(inspectMarkupBounds(nodes, { maxNodes: 4, maxDepth: 10 })).toEqual({
      status: 'rejected',
      reason: 'node-limit',
    });
  });

  it('detects DTD declarations only in XML markup context', () => {
    expect(containsForbiddenXmlDeclaration('<!DOCTYPE root><root/>')).toBe(true);
    expect(containsForbiddenXmlDeclaration('<!ENTITY payload "value"><root/>')).toBe(true);
    expect(containsForbiddenXmlDeclaration('<root><!-- <!DOCTYPE harmless> --></root>')).toBe(false);
    expect(containsForbiddenXmlDeclaration('<root><![CDATA[<!DOCTYPE harmless>]]></root>')).toBe(false);
    expect(containsForbiddenXmlDeclaration('<?probe value="<!DOCTYPE harmless>"?><root/>')).toBe(false);
    expect(containsForbiddenXmlDeclaration('<!DOCTYPEevil><root/>')).toBe(false);
  });
});
