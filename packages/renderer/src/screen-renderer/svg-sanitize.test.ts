/** @vitest-environment jsdom */

import { describe, expect, it } from 'vitest';

import { parseSanitizedSvg, renderSanitizedSvgInto } from './svg-sanitize';

describe('parseSanitizedSvg', () => {
  it('returns null for empty input', () => {
    expect(parseSanitizedSvg('')).toBeNull();
    expect(parseSanitizedSvg('   ')).toBeNull();
  });

  it('returns null for non-SVG markup', () => {
    expect(parseSanitizedSvg('<div>hello</div>')).toBeNull();
  });

  it('preserves well-formed SVG shape elements and attributes', () => {
    const result = parseSanitizedSvg(
      '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="20" fill="red"/></svg>',
    );

    expect(result).not.toBeNull();
    expect(result?.tagName.toLowerCase()).toBe('svg');

    const rect = result?.querySelector('rect');

    expect(rect?.getAttribute('width')).toBe('10');
    expect(rect?.getAttribute('fill')).toBe('red');
  });

  it('strips <script> elements', () => {
    const result = parseSanitizedSvg(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>window.pwned = true</script><rect/></svg>',
    );

    expect(result?.querySelectorAll('script').length).toBe(0);
    expect(result?.querySelector('rect')).not.toBeNull();
  });

  it('strips <foreignObject> elements that can host HTML script islands', () => {
    const result = parseSanitizedSvg(
      '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><script>1</script></foreignObject></svg>',
    );

    expect(result?.querySelectorAll('foreignObject').length).toBe(0);
  });

  it('removes inline event handler attributes', () => {
    const result = parseSanitizedSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><rect onclick="alert(2)" onmouseover="alert(3)" fill="blue"/></svg>',
    );

    expect(result?.hasAttribute('onload')).toBe(false);

    const rect = result?.querySelector('rect');

    expect(rect?.hasAttribute('onclick')).toBe(false);
    expect(rect?.hasAttribute('onmouseover')).toBe(false);
    expect(rect?.getAttribute('fill')).toBe('blue');
  });

  it('drops javascript: URLs in href and xlink:href attributes', () => {
    const result = parseSanitizedSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><a href="javascript:alert(1)"><rect/></a><use xlink:href="javascript:alert(2)"/></svg>',
    );

    const anchor = result?.querySelector('a');
    const useElement = result?.querySelector('use');

    expect(anchor?.hasAttribute('href')).toBe(false);
    expect(useElement?.hasAttribute('xlink:href')).toBe(false);
  });

  it('keeps safe https, mailto, fragment, and same-origin URLs', () => {
    const result = parseSanitizedSvg(
      '<svg xmlns="http://www.w3.org/2000/svg"><a href="https://example.com/"/><a href="#frag"/><a href="/path"/><a href="mailto:foo@example.com"/></svg>',
    );
    const anchors = result?.querySelectorAll('a');

    expect(anchors?.[0]?.getAttribute('href')).toBe('https://example.com/');
    expect(anchors?.[1]?.getAttribute('href')).toBe('#frag');
    expect(anchors?.[2]?.getAttribute('href')).toBe('/path');
    expect(anchors?.[3]?.getAttribute('href')).toBe('mailto:foo@example.com');
  });

  it('allows safe data: URIs for inline images but rejects data: text/html', () => {
    const result = parseSanitizedSvg(
      '<svg xmlns="http://www.w3.org/2000/svg"><image href="data:image/png;base64,iVBOR"/><image href="data:text/html,payload"/></svg>',
    );
    const images = result?.querySelectorAll('image');

    expect(images?.[0]?.getAttribute('href')).toBe('data:image/png;base64,iVBOR');
    expect(images?.[1]?.hasAttribute('href')).toBe(false);
  });

  it('strips <animate> + friends that can carry values="javascript:..."', () => {
    const result = parseSanitizedSvg(
      '<svg xmlns="http://www.w3.org/2000/svg"><set attributeName="href" to="javascript:alert(1)"/><animate attributeName="href" values="javascript:alert(2)"/></svg>',
    );

    expect(result?.querySelectorAll('animate').length).toBe(0);
    expect(result?.querySelectorAll('set').length).toBe(0);
  });
});

describe('renderSanitizedSvgInto', () => {
  it('injects sanitized SVG and drops scripts', () => {
    const host = document.createElement('div');

    renderSanitizedSvgInto(
      host,
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><rect width="10" height="10"/></svg>',
    );

    expect(host.querySelectorAll('script').length).toBe(0);
    expect(host.querySelector('rect')).not.toBeNull();
  });

  it('clears host when the input is not valid SVG', () => {
    const host = document.createElement('div');

    host.innerHTML = '<span>sentinel</span>';

    const result = renderSanitizedSvgInto(host, '<div>not svg</div>');

    expect(result).toBeNull();
    expect(host.children.length).toBe(0);
  });
});
