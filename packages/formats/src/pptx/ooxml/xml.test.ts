import { describe, expect, it } from 'vitest';

import { escapeXmlAttribute, escapeXmlText, parseXml, XML_DECLARATION } from './xml';

describe('parseXml', () => {
  it('returns null for empty / whitespace input', () => {
    expect(parseXml('')).toBeNull();
    expect(parseXml('   \n\t')).toBeNull();
  });

  it('parses a namespaced element with an attribute', () => {
    expect(parseXml('<p:sp><p:nvSpPr id="1"/></p:sp>')).toBeDefined();
  });

  it('preserves z-order-significant child order via preserveOrder', () => {
    expect(Array.isArray(parseXml('<root><a/><b/><a/></root>'))).toBe(true);
  });

  it('rejects DTD-declared entities before parser entry', () => {
    const declaration = '<!DOCTYPE root [<!ENTITY payload "expanded">]><root>&payload;</root>';

    expect(() => parseXml(declaration)).toThrow(/forbidden/u);
  });

  it('rejects excessive XML depth before parser entry', () => {
    const depth = 101;
    const nested = `${'<n>'.repeat(depth)}${'</n>'.repeat(depth)}`;

    expect(() => parseXml(nested)).toThrow(/depth-limit/u);
  });

  it('allows declaration-shaped text inside comments, CDATA, and processing instructions', () => {
    expect(() => parseXml('<root><!-- <!DOCTYPE harmless> --></root>')).not.toThrow();
    expect(() => parseXml('<root><![CDATA[<!DOCTYPE harmless>]]></root>')).not.toThrow();
    expect(() => parseXml('<?probe value="<!DOCTYPE harmless>"?><root/>')).not.toThrow();
  });
});

describe('escape helpers', () => {
  it('escapes `<`, `>`, and `&` in text', () => {
    expect(escapeXmlText('a & b < c > d')).toBe('a &amp; b &lt; c &gt; d');
  });

  it('escapes quotes in addition to text escapes for attributes', () => {
    expect(escapeXmlAttribute('a"b\'c')).toContain('&quot;');
    expect(escapeXmlAttribute('a"b\'c')).toContain('&apos;');
  });

  it('declares the canonical XML header used by every PPTX part', () => {
    expect(XML_DECLARATION).toBe('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
  });
});
