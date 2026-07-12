import type { projectFormatV1 } from '@broadset/model';

import { formatDateTimePatternV1 } from './date-time-pattern';

type TypedValue = projectFormatV1.TypedValue;
type FormatterPipeline = projectFormatV1.FormatterPipeline;
type FormatterStep = projectFormatV1.FormatterStep;

type DurationUnit = 'milliseconds' | 'seconds' | 'minutes' | 'hours';
type IntlDurationUnit = 'millisecond' | 'second' | 'minute' | 'hour';

function isFiniteNumericInput(value: TypedValue): value is Extract<TypedValue, { readonly type: 'integer' | 'number' }> {
  return (
    (value.type === 'integer' || value.type === 'number') &&
    Number.isFinite(value.value) &&
    (value.type !== 'integer' || Number.isSafeInteger(value.value))
  );
}

function formatNumber(value: TypedValue, step: FormatterStep): TypedValue | undefined {
  const locale = step.arguments[0];

  if (!isFiniteNumericInput(value) || step.arguments.length !== 1 || locale?.type !== 'string') return undefined;

  try {
    return { type: 'string', value: new Intl.NumberFormat(locale.value).format(value.value) };
  } catch {
    return undefined;
  }
}

function formatDateTime(value: TypedValue, step: FormatterStep): TypedValue | undefined {
  const pattern = step.arguments[0];
  const locale = step.arguments[1];
  const timeZone = step.arguments[2];

  if (
    value.type !== 'date-time' ||
    step.arguments.length !== 3 ||
    pattern?.type !== 'string' ||
    locale?.type !== 'string' ||
    timeZone?.type !== 'string'
  ) {
    return undefined;
  }

  const timestamp = Date.parse(value.value);

  if (Number.isNaN(timestamp)) return undefined;

  const formatted = formatDateTimePatternV1(new Date(timestamp), pattern.value, {
    locale: locale.value,
    timeZone: timeZone.value,
  });

  return formatted === undefined ? undefined : { type: 'string', value: formatted };
}

function getIntlDurationUnit(unit: string): IntlDurationUnit | undefined {
  const durationUnits: Readonly<Record<DurationUnit, IntlDurationUnit>> = {
    milliseconds: 'millisecond',
    seconds: 'second',
    minutes: 'minute',
    hours: 'hour',
  };

  if (unit === 'milliseconds' || unit === 'seconds' || unit === 'minutes' || unit === 'hours') {
    return durationUnits[unit];
  }

  return undefined;
}

function formatDuration(value: TypedValue, step: FormatterStep): TypedValue | undefined {
  const unitArgument = step.arguments[0];
  const locale = step.arguments[1];

  if (
    !isFiniteNumericInput(value) ||
    step.arguments.length !== 2 ||
    unitArgument?.type !== 'string' ||
    locale?.type !== 'string'
  ) {
    return undefined;
  }

  const unit = getIntlDurationUnit(unitArgument.value);

  if (unit === undefined) return undefined;

  try {
    // V1 formats the magnitude in one declared unit; mixed-unit decomposition is outside this formatter contract.
    const formatted = new Intl.NumberFormat(locale.value, {
      style: 'unit',
      unit,
      unitDisplay: 'long',
    }).format(value.value);

    return { type: 'string', value: formatted };
  } catch {
    return undefined;
  }
}

function applyAffix(value: TypedValue, step: FormatterStep, position: 'prefix' | 'suffix'): TypedValue | undefined {
  const text = step.arguments[0];

  if (value.type !== 'string' || step.arguments.length !== 1 || text?.type !== 'string') return undefined;

  return {
    type: 'string',
    value: position === 'prefix' ? text.value + value.value : value.value + text.value,
  };
}

function truncateString(value: TypedValue, step: FormatterStep): TypedValue | undefined {
  const maximumLength = step.arguments[0];

  if (
    value.type !== 'string' ||
    step.arguments.length !== 1 ||
    maximumLength?.type !== 'integer' ||
    !Number.isSafeInteger(maximumLength.value) ||
    maximumLength.value < 0
  ) {
    return undefined;
  }

  return { type: 'string', value: Array.from(value.value).slice(0, maximumLength.value).join('') };
}

function applyFormatterStep(value: TypedValue, step: FormatterStep): TypedValue | undefined {
  switch (step.formatterId) {
    case 'number':
      return formatNumber(value, step);
    case 'date-time':
      return formatDateTime(value, step);
    case 'duration':
      return formatDuration(value, step);
    case 'prefix':
    case 'suffix':
      return applyAffix(value, step, step.formatterId);
    case 'truncate':
      return truncateString(value, step);
  }
}

export function applyFormatterPipelineV1(
  value: TypedValue,
  pipeline: FormatterPipeline,
): TypedValue | undefined {
  try {
    let formatted = value;

    for (const step of pipeline.steps) {
      const nextValue = applyFormatterStep(formatted, step);

      if (nextValue === undefined) return undefined;

      formatted = nextValue;
    }

    return formatted;
  } catch {
    return undefined;
  }
}
