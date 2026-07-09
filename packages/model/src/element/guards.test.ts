/** @vitest-environment node */
import { describe, expect, it } from 'vitest';

import { isValidVisibleWhenExpression } from './guards';

describe('isValidVisibleWhenExpression', () => {
  describe('empty inputs', () => {
    it('treats null as valid (no expression)', () => {
      expect(isValidVisibleWhenExpression(null)).toBe(true);
    });

    it('treats undefined as valid (no expression)', () => {
      expect(isValidVisibleWhenExpression(undefined)).toBe(true);
    });

    it('treats empty string as valid', () => {
      expect(isValidVisibleWhenExpression('')).toBe(true);
    });

    it('treats whitespace-only as valid', () => {
      expect(isValidVisibleWhenExpression('   ')).toBe(true);
    });
  });

  describe('single operand', () => {
    it('accepts an identifier', () => {
      expect(isValidVisibleWhenExpression('foo')).toBe(true);
    });

    it('accepts an underscore identifier', () => {
      expect(isValidVisibleWhenExpression('_bar_42')).toBe(true);
    });

    it('accepts a string literal', () => {
      expect(isValidVisibleWhenExpression("'hello world'")).toBe(true);
    });

    it('accepts a positive number', () => {
      expect(isValidVisibleWhenExpression('42')).toBe(true);
    });

    it('accepts a negative number', () => {
      expect(isValidVisibleWhenExpression('-3.14')).toBe(true);
    });

    it('accepts the literal true', () => {
      expect(isValidVisibleWhenExpression('true')).toBe(true);
    });

    it('accepts the literal false', () => {
      expect(isValidVisibleWhenExpression('false')).toBe(true);
    });
  });

  describe('comparisons', () => {
    it('accepts equality', () => {
      expect(isValidVisibleWhenExpression("foo == 'bar'")).toBe(true);
    });

    it('accepts inequality', () => {
      expect(isValidVisibleWhenExpression('count != 0')).toBe(true);
    });

    it('accepts >=, <=, >, <', () => {
      expect(isValidVisibleWhenExpression('a >= 1')).toBe(true);
      expect(isValidVisibleWhenExpression('a <= 1')).toBe(true);
      expect(isValidVisibleWhenExpression('a > 1')).toBe(true);
      expect(isValidVisibleWhenExpression('a < 1')).toBe(true);
    });
  });

  describe('logical operators', () => {
    it('accepts && between operands', () => {
      expect(isValidVisibleWhenExpression('foo && bar')).toBe(true);
    });

    it('accepts || between operands', () => {
      expect(isValidVisibleWhenExpression('foo || bar')).toBe(true);
    });

    it('accepts a chain', () => {
      expect(isValidVisibleWhenExpression("a == 1 && b != 'x' || c")).toBe(true);
    });
  });

  describe('parentheses', () => {
    it('accepts a parenthesised operand', () => {
      expect(isValidVisibleWhenExpression('(foo)')).toBe(true);
    });

    it('accepts nested groupings', () => {
      expect(isValidVisibleWhenExpression("(foo == 'a' && (bar > 0))")).toBe(true);
    });

    it('rejects empty parens', () => {
      expect(isValidVisibleWhenExpression('()')).toBe(false);
    });

    it('rejects unmatched opening paren', () => {
      expect(isValidVisibleWhenExpression('(foo')).toBe(false);
    });

    it('rejects unmatched closing paren', () => {
      expect(isValidVisibleWhenExpression('foo)')).toBe(false);
    });

    it('rejects an extra closing paren', () => {
      expect(isValidVisibleWhenExpression('(foo))')).toBe(false);
    });
  });

  describe('negation', () => {
    it('accepts a single not', () => {
      expect(isValidVisibleWhenExpression('!foo')).toBe(true);
    });

    it('accepts double negation', () => {
      expect(isValidVisibleWhenExpression('!!foo')).toBe(true);
    });

    it('accepts not on parenthesised expression', () => {
      expect(isValidVisibleWhenExpression('!(foo && bar)')).toBe(true);
    });

    it('rejects ! after an operand', () => {
      expect(isValidVisibleWhenExpression('foo !')).toBe(false);
    });
  });

  describe('rejects malformed input', () => {
    it('rejects two operands separated only by an unrecognised symbol', () => {
      expect(isValidVisibleWhenExpression('foo @ bar')).toBe(false);
    });

    it('treats `foo bar` as the identifier `foobar` (whitespace is stripped before tokenising)', () => {
      expect(isValidVisibleWhenExpression('foo bar')).toBe(true);
    });

    it('rejects an operator with no left operand', () => {
      expect(isValidVisibleWhenExpression('&& foo')).toBe(false);
    });

    it('rejects an operator with no right operand', () => {
      expect(isValidVisibleWhenExpression('foo &&')).toBe(false);
    });

    it('rejects two binary operators in a row', () => {
      expect(isValidVisibleWhenExpression('foo && && bar')).toBe(false);
    });

    it('rejects unrecognised tokens', () => {
      expect(isValidVisibleWhenExpression('foo @ bar')).toBe(false);
    });

    it('rejects a malformed string literal', () => {
      expect(isValidVisibleWhenExpression("'unterminated")).toBe(false);
    });
  });
});
