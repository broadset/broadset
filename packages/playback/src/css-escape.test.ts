// ---------------------------------------------------------------------------
// CSS Identifier Escaping — tests
// ---------------------------------------------------------------------------

import { describe, expect, it } from '@jest/globals';

import { escapeCssId } from './css-escape';

describe('escapeCssId', () => {
  /**
   * @description Special characters in element IDs must be escaped for
   * safe use in CSS attribute selectors like [data-element-id="..."].
   */
  it('escapes double quotes in element IDs', () => {
    const result = escapeCssId('el"test');

    expect(result).toBe('el\\"test');
  });

  /**
   * @description Simple IDs and UUIDs should pass through unchanged.
   */
  it('passes simple alphanumeric IDs unchanged', () => {
    expect(escapeCssId('el-title-01')).toBe('el-title-01');
    expect(escapeCssId('550e8400-e29b-41d4-a716-446655440000')).toBe('550e8400-e29b-41d4-a716-446655440000');
  });

  /**
   * @description Backslashes themselves must be escaped.
   */
  it('escapes backslashes', () => {
    expect(escapeCssId('el\\test')).toBe('el\\\\test');
  });
});
