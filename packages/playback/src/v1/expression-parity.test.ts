import type { projectFormatV1 } from '@broadset/model';
import { describe, expect, it } from 'vitest';

import { evaluateExpressionV1, type ExpressionContextV1 } from './expression-eval';

type ExpressionAst = projectFormatV1.ExpressionAst;
type TypedValue = projectFormatV1.TypedValue;

const context: ExpressionContextV1 = { resolveField: () => undefined, resolveVariable: () => undefined };
const literal = (value: TypedValue): ExpressionAst => ({ kind: 'literal', value });
const evaluate = (expression: ExpressionAst) => evaluateExpressionV1(expression, context);
const safe = (functionId: Extract<ExpressionAst, { kind: 'safe-function' }>['functionId'], values: readonly TypedValue[]): ExpressionAst => ({ kind: 'safe-function', functionId, arguments: values.map(literal) });
const binary = (operator: Extract<ExpressionAst, { kind: 'binary' }>['operator'], left: TypedValue, right: TypedValue): ExpressionAst => ({ kind: 'binary', operator, left: literal(left), right: literal(right) });

describe('expression runtime parity with model inference', () => {
  it('rounds with precision and returns number', () => {
    expect(evaluate(safe('round', [{ type: 'number', value: 1.234 }, { type: 'integer', value: 2 }]))).toEqual({ type: 'number', value: 1.23 });
    expect(evaluate(safe('round', [{ type: 'integer', value: 5 }]))).toEqual({ type: 'number', value: 5 });
  });

  it('supports mixed integer/number arithmetic, extrema, clamp, and comparison', () => {
    expect(evaluate(binary('add', { type: 'integer', value: 2 }, { type: 'number', value: 0.5 }))).toEqual({ type: 'number', value: 2.5 });
    expect(evaluate(binary('lt', { type: 'integer', value: 2 }, { type: 'number', value: 2.5 }))).toEqual({ type: 'boolean', value: true });
    expect(evaluate(safe('min', [{ type: 'integer', value: 2 }, { type: 'number', value: 1.5 }]))).toEqual({ type: 'number', value: 1.5 });
    expect(evaluate(safe('clamp', [{ type: 'number', value: 12 }, { type: 'integer', value: 0 }, { type: 'integer', value: 10 }]))).toEqual({ type: 'number', value: 10 });
  });

  it('adds strings and orders strings and date-times', () => {
    expect(evaluate(binary('add', { type: 'string', value: 'Broad' }, { type: 'string', value: 'set' }))).toEqual({ type: 'string', value: 'Broadset' });
    expect(evaluate(binary('lt', { type: 'string', value: 'a' }, { type: 'string', value: 'b' }))).toEqual({ type: 'boolean', value: true });
    expect(evaluate(binary('gte', { type: 'date-time', value: '2026-01-02T00:00:00.000Z' }, { type: 'date-time', value: '2026-01-01T00:00:00.000Z' }))).toEqual({ type: 'boolean', value: true });
    expect(evaluate(binary('lte', { type: 'date-time', value: '2026-01-01T00:00:00.000Z' }, { type: 'date-time', value: '2026-01-01T01:00:00.000+01:00' }))).toEqual({ type: 'boolean', value: true });
  });

  it('formats dates with four explicit arguments and rejects bad locale/time zone', () => {
    const values: readonly TypedValue[] = [
      { type: 'date-time', value: '2026-07-12T10:30:00.000Z' },
      { type: 'string', value: 'yyyy-MM-dd HH:mm' },
      { type: 'string', value: 'en-US' },
      { type: 'string', value: 'UTC' },
    ];

    expect(evaluate(safe('format-date', values))).toEqual({ type: 'string', value: '2026-07-12 10:30' });
    expect(evaluate(safe('format-date', [...values.slice(0, 2), { type: 'string', value: 'invalid_locale' }, { type: 'string', value: 'Not/A_Zone' }]))).toBeUndefined();
  });

  it('returns typed null when every coalesce argument is null', () => {
    expect(evaluate(safe('coalesce', [{ type: 'null', value: null }, { type: 'null', value: null }]))).toEqual({ type: 'null', value: null });
  });
});
