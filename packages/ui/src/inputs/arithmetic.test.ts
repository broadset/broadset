/** @vitest-environment node */

import { describe, expect, it } from 'vitest';

import { evaluateArithmeticExpression } from './arithmetic';

describe('evaluateArithmeticExpression', () => {
  /** @description Plain decimal literals must round-trip through the evaluator. */
  it('parses decimal literals', () => {
    expect(evaluateArithmeticExpression('200')).toBe(200);
    expect(evaluateArithmeticExpression('3.14')).toBe(3.14);
    expect(evaluateArithmeticExpression('.5')).toBe(0.5);
  });

  /** @description The four basic operators must evaluate with standard precedence. */
  it('evaluates binary operators with correct precedence', () => {
    expect(evaluateArithmeticExpression('200+50')).toBe(250);
    expect(evaluateArithmeticExpression('10 - 4')).toBe(6);
    expect(evaluateArithmeticExpression('3*4')).toBe(12);
    expect(evaluateArithmeticExpression('10/4')).toBe(2.5);
    expect(evaluateArithmeticExpression('2+3*4')).toBe(14);
    expect(evaluateArithmeticExpression('2*3+4')).toBe(10);
  });

  /** @description Parentheses must override operator precedence. */
  it('honors parenthesized sub-expressions', () => {
    expect(evaluateArithmeticExpression('(100+20)*2')).toBe(240);
    expect(evaluateArithmeticExpression('2*(3+4)')).toBe(14);
    expect(evaluateArithmeticExpression('((1+2)*3)')).toBe(9);
  });

  /** @description Unary plus/minus must apply to the next factor. */
  it('supports unary operators', () => {
    expect(evaluateArithmeticExpression('-5')).toBe(-5);
    expect(evaluateArithmeticExpression('+5')).toBe(5);
    expect(evaluateArithmeticExpression('10+-3')).toBe(7);
    expect(evaluateArithmeticExpression('-(2+3)')).toBe(-5);
  });

  /** @description Any syntactically malformed input must return null rather than throw. */
  it('returns null for malformed input', () => {
    expect(evaluateArithmeticExpression('')).toBeNull();
    expect(evaluateArithmeticExpression('   ')).toBeNull();
    expect(evaluateArithmeticExpression('2+')).toBeNull();
    expect(evaluateArithmeticExpression('*5')).toBeNull();
    expect(evaluateArithmeticExpression('(2+3')).toBeNull();
    expect(evaluateArithmeticExpression('2+3)')).toBeNull();
    expect(evaluateArithmeticExpression('2 3')).toBeNull();
  });

  /** @description Code-evaluation escapes must never tokenize — the grammar is numbers and operators only. */
  it('rejects any non-arithmetic characters', () => {
    expect(evaluateArithmeticExpression('alert(1)')).toBeNull();
    expect(evaluateArithmeticExpression('1;2')).toBeNull();
    expect(evaluateArithmeticExpression('2**3')).toBeNull();
    expect(evaluateArithmeticExpression('a+b')).toBeNull();
    expect(evaluateArithmeticExpression('0x10')).toBeNull();
  });

  /** @description Division by zero must fail safely rather than return Infinity. */
  it('rejects division by zero', () => {
    expect(evaluateArithmeticExpression('1/0')).toBeNull();
    expect(evaluateArithmeticExpression('5/(2-2)')).toBeNull();
  });
});
