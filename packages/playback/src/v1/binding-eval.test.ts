import type { projectFormatV1 } from '@broadset/model';
import { projectFormatV1 as projectFormatV1Runtime } from '@broadset/model';
import { describe, expect, it } from 'vitest';

import { evaluateBindingV1 } from './binding-eval';
import type { ExpressionContextV1 } from './expression-eval';

type Binding = projectFormatV1.Binding;
type ExpressionAst = projectFormatV1.ExpressionAst;
type FormatterPipeline = projectFormatV1.FormatterPipeline;
type Id = projectFormatV1.Id;
type PropertyTarget = projectFormatV1.PropertyTarget;
type TypedValue = projectFormatV1.TypedValue;

const PROJECT_ID = createId('project');
const ELEMENT_ID = createId('element');
const VIEW_MODEL_ID = createId('view-model');
const FIELD_ID = createId('field');
const TARGET: PropertyTarget = {
  entity: {
    projectId: PROJECT_ID,
    entityKind: 'element',
    entityId: ELEMENT_ID,
  },
  pointer: '/content',
};
const EMPTY_CONTEXT: ExpressionContextV1 = {
  resolveField: () => undefined,
  resolveVariable: () => undefined,
};

function createId(value: string): Id {
  return projectFormatV1Runtime.idSchema.parse(value);
}

function literal(value: TypedValue): ExpressionAst {
  return { kind: 'literal', value };
}

function createFormatter(formatterId: 'prefix' | 'truncate', argument: TypedValue): FormatterPipeline {
  return {
    steps: [{ id: createId(`formatter-${formatterId}`), formatterId, arguments: [argument] }],
  };
}

function createBinding(options: {
  readonly expression: ExpressionAst;
  readonly formatter?: FormatterPipeline | undefined;
  readonly fallback?: TypedValue | undefined;
  readonly target?: PropertyTarget | undefined;
}): Binding {
  return {
    id: createId('binding'),
    target: options.target ?? TARGET,
    expression: options.expression,
    ...(options.formatter === undefined ? {} : { formatter: options.formatter }),
    ...(options.fallback === undefined ? {} : { fallback: options.fallback }),
  };
}

describe('evaluateBindingV1', () => {
  it('returns an unformatted resolved expression with the binding target', () => {
    const value = { type: 'string', value: 'Broadset' } as const;
    const target: PropertyTarget = { ...TARGET, pointer: '/style/opacity' };
    const binding = createBinding({ expression: literal(value), target });

    expect(evaluateBindingV1(binding, EMPTY_CONTEXT)).toEqual({ target, value, source: 'expression' });
  });

  it('applies the formatter pipeline to a resolved expression', () => {
    const binding = createBinding({
      expression: literal({ type: 'string', value: 'Broadset' }),
      formatter: createFormatter('prefix', { type: 'string', value: 'Hello ' }),
    });

    expect(evaluateBindingV1(binding, EMPTY_CONTEXT)).toEqual({
      target: TARGET,
      value: { type: 'string', value: 'Hello Broadset' },
      source: 'expression',
    });
  });

  it('uses the fallback when formatting fails', () => {
    const fallback = { type: 'string', value: 'fallback' } as const;
    const binding = createBinding({
      expression: literal({ type: 'integer', value: 5 }),
      formatter: createFormatter('prefix', { type: 'string', value: '#' }),
      fallback,
    });

    expect(evaluateBindingV1(binding, EMPTY_CONTEXT)).toEqual({ target: TARGET, value: fallback, source: 'fallback' });
  });

  it('returns undefined when formatting fails without a fallback', () => {
    const binding = createBinding({
      expression: literal({ type: 'integer', value: 5 }),
      formatter: createFormatter('prefix', { type: 'string', value: '#' }),
    });

    expect(evaluateBindingV1(binding, EMPTY_CONTEXT)).toBeUndefined();
  });

  it('uses the fallback when the expression is unresolved', () => {
    const fallback = { type: 'boolean', value: false } as const;
    const binding = createBinding({
      expression: { kind: 'field', viewModelId: VIEW_MODEL_ID, fieldId: FIELD_ID },
      fallback,
    });

    expect(evaluateBindingV1(binding, EMPTY_CONTEXT)).toEqual({ target: TARGET, value: fallback, source: 'fallback' });
  });

  it('returns undefined when the expression is unresolved without a fallback', () => {
    const binding = createBinding({
      expression: { kind: 'field', viewModelId: VIEW_MODEL_ID, fieldId: FIELD_ID },
    });

    expect(evaluateBindingV1(binding, EMPTY_CONTEXT)).toBeUndefined();
  });

  it('returns a fallback as-is without running it through the formatter', () => {
    const fallback = { type: 'string', value: 'unformatted' } as const;
    const binding = createBinding({
      expression: { kind: 'field', viewModelId: VIEW_MODEL_ID, fieldId: FIELD_ID },
      formatter: createFormatter('truncate', { type: 'integer', value: 3 }),
      fallback,
    });

    expect(evaluateBindingV1(binding, EMPTY_CONTEXT)).toEqual({ target: TARGET, value: fallback, source: 'fallback' });
  });
});
