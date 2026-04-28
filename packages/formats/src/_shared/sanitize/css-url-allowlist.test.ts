import { describe, expect, it } from 'vitest';

import { sanitizeCssUrls, sanitizeStyleAttribute } from './css-url-allowlist';

describe('sanitizeCssUrls', () => {
  it('strips url(javascript:…)', () => {
    expect(sanitizeCssUrls('background:url(javascript:alert(1))')).toBe('background:');
  });

  it('strips url(vbscript:…) and url(file://…)', () => {
    expect(sanitizeCssUrls('a:url(vbscript:foo)')).toBe('a:');
    expect(sanitizeCssUrls('a:url(file:///etc/passwd)')).toBe('a:');
  });

  it('keeps url(https://…) and url(data:image/png;base64,…)', () => {
    expect(sanitizeCssUrls('background:url(https://safe/img.png)')).toBe('background:url(https://safe/img.png)');
    expect(sanitizeCssUrls('background:url(data:image/png;base64,abc)')).toBe(
      'background:url(data:image/png;base64,abc)',
    );
  });

  it('strips url(data:application/javascript;base64,…)', () => {
    expect(sanitizeCssUrls('background:url(data:application/javascript;base64,YWxlcnQoMSk=)')).toBe('background:');
  });

  it('keeps fragment refs (#gradientId) and root-relative paths', () => {
    expect(sanitizeCssUrls('fill:url(#g1)')).toBe('fill:url(#g1)');
    expect(sanitizeCssUrls('background:url(/static/img.png)')).toBe('background:url(/static/img.png)');
  });

  it('handles quoted urls', () => {
    expect(sanitizeCssUrls("a:url('javascript:foo')")).toBe('a:');
    expect(sanitizeCssUrls('a:url("https://safe.com/x")')).toBe('a:url("https://safe.com/x")');
  });

  it('handles multiple url() in one string', () => {
    expect(sanitizeCssUrls('background:url(javascript:1) red url(https://safe/img.png) no-repeat')).toBe(
      'background: red url(https://safe/img.png) no-repeat',
    );
  });
});

describe('sanitizeStyleAttribute', () => {
  it('is an alias for sanitizeCssUrls', () => {
    const cases = [
      'background:url(javascript:alert(1));filter:url(http://attacker/leak.svg)',
      'fill:url(#gradient);stroke:url(javascript:foo)',
    ];

    for (const c of cases) {
      expect(sanitizeStyleAttribute(c)).toBe(sanitizeCssUrls(c));
    }
  });
});
