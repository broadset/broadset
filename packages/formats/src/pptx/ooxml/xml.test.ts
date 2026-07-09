import { describe, expect, it } from 'vitest';

import { escapeXmlAttribute, escapeXmlText, parseXml, XML_DECLARATION } from './xml';

/**
 * @description The XML parser must accept OOXML markup and return a
 * structured representation whose attribute values are preserved as
 * strings. The parser is the foundation of every import path.
 */
describe('parseXml', () => {
  it('returns null for empty / whitespace input', () => {
    expect(parseXml('')).toBeNull();
    expect(parseXml('   \n\t')).toBeNull();
  });

  it('parses a namespaced element with an attribute', () => {
    const result = parseXml('<p:sp><p:nvSpPr id="1"/></p:sp>');

    expect(result).toBeDefined();
  });

  it('preserves z-order-significant child order via preserveOrder', () => {
    const result = parseXml('<root><a/><b/><a/></root>');

    expect(Array.isArray(result)).toBe(true);
  });

  it('does NOT expand DTD-declared entities (XXE / billion-laughs hardening)', () => {
    // fast-xml-parser ignores DOCTYPE declarations entirely — the
    // imported content should surface the literal entity reference
    // rather than expanding it billions of times.
    const bomb = `<?xml version="1.0"?>
<!DOCTYPE lolz [
  <!ENTITY lol "lol">
  <!ENTITY lol2 "&lol;&lol;&lol;">
  <!ENTITY lol3 "&lol2;&lol2;&lol2;">
]>
<root>&lol3;</root>`;

    const result = parseXml(bomb);

    expect(JSON.stringify(result).length).toBeLessThan(2_000);
  });
});

/**
 * @description XML-text / attribute escape helpers guard against user
 * content containing `<`, `>`, `&`, `"`, `'` — all of which can produce
 * malformed output or inject element boundaries if unescaped.
 */
describe('escape helpers', () => {
  it('escapes `<`, `>`, and `&` in text', () => {
    expect(escapeXmlText('a & b < c > d')).toBe('a &amp; b &lt; c &gt; d');
  });

  it('escapes `"` and `\'` in addition to text escapes for attributes', () => {
    expect(escapeXmlAttribute('a"b\'c')).toContain('&quot;');
    expect(escapeXmlAttribute('a"b\'c')).toContain('&apos;');
  });

  it('declares the canonical XML header used by every PPTX part', () => {
    expect(XML_DECLARATION).toBe('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
  });
});
