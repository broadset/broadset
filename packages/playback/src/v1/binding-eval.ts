import type { projectFormatV1 } from '@broadset/model';

import { evaluateExpressionV1, type ExpressionContextV1 } from './expression-eval';
import { applyFormatterPipelineV1 } from './formatter-pipeline';

type Binding = projectFormatV1.Binding;
type PropertyTarget = projectFormatV1.PropertyTarget;
type TypedValue = projectFormatV1.TypedValue;

export interface ResolvedBindingV1 {
  readonly target: PropertyTarget;
  readonly value: TypedValue;
}

export function evaluateBindingV1(binding: Binding, context: ExpressionContextV1): ResolvedBindingV1 | undefined {
  const raw = evaluateExpressionV1(binding.expression, context);
  let formatted = raw;

  if (formatted !== undefined && binding.formatter !== undefined) {
    formatted = applyFormatterPipelineV1(formatted, binding.formatter);
  }

  if (formatted !== undefined) return { target: binding.target, value: formatted };
  if (binding.fallback !== undefined) return { target: binding.target, value: binding.fallback };

  return undefined;
}
