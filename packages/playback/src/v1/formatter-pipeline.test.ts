import type { projectFormatV1 } from '@broadset/model';
import { projectFormatV1 as projectFormatV1Runtime } from '@broadset/model';
import { describe, expect, it } from 'vitest';

import { applyFormatterPipelineV1 } from './formatter-pipeline';

type TypedValue = projectFormatV1.TypedValue;
type FormatterPipeline = projectFormatV1.FormatterPipeline;
type FormatterStep = projectFormatV1.FormatterStep;

function createStep(
  id: string,
  formatterId: FormatterStep['formatterId'],
  arguments_: readonly TypedValue[],
): FormatterStep {
  return {
    id: projectFormatV1Runtime.idSchema.parse(id),
    formatterId,
    arguments: arguments_,
  };
}

function apply(value: TypedValue, steps: readonly FormatterStep[]): TypedValue | undefined {
  const pipeline: FormatterPipeline = { steps };

  return applyFormatterPipelineV1(value, pipeline);
}

describe('applyFormatterPipelineV1 locale-aware formatters', () => {
  it('returns the original value from an empty pipeline', () => {
    const value = { type: 'boolean', value: true } as const;

    expect(apply(value, [])).toBe(value);
  });

  it('formats finite numbers with the requested locale', () => {
    const input = { type: 'number', value: 1234.5 } as const;
    const enUs = apply(input, [createStep('number-en', 'number', [{ type: 'string', value: 'en-US' }])]);
    const deDe = apply(input, [createStep('number-de', 'number', [{ type: 'string', value: 'de-DE' }])]);

    expect(enUs).toEqual({ type: 'string', value: '1,234.5' });
    expect(deDe?.type).toBe('string');
    expect(deDe).not.toEqual(enUs);
  });

  it('formats a duration magnitude in its declared unit', () => {
    const result = apply(
      { type: 'integer', value: 5 },
      [
        createStep('duration', 'duration', [
          { type: 'string', value: 'minutes' },
          { type: 'string', value: 'en-US' },
        ]),
      ],
    );

    expect(result?.type).toBe('string');
    expect(result?.type === 'string' ? result.value : '').toContain('minute');
  });

  it('formats an ISO instant through the CLDR pattern formatter', () => {
    expect(
      apply(
        { type: 'date-time', value: '2026-03-09T15:04:05Z' },
        [
          createStep('date-time', 'date-time', [
            { type: 'string', value: 'yyyy-MM-dd HH:mm' },
            { type: 'string', value: 'en-US' },
            { type: 'string', value: 'UTC' },
          ]),
        ],
      ),
    ).toEqual({ type: 'string', value: '2026-03-09 15:04' });
  });
});

describe('applyFormatterPipelineV1 string formatters', () => {
  it('applies prefix and suffix formatters', () => {
    expect(
      apply(
        { type: 'string', value: 'Broadset' },
        [
          createStep('prefix', 'prefix', [{ type: 'string', value: '[' }]),
          createStep('suffix', 'suffix', [{ type: 'string', value: ']' }]),
        ],
      ),
    ).toEqual({ type: 'string', value: '[Broadset]' });
  });

  it('truncates by Unicode code point without leaving a lone surrogate', () => {
    expect(
      apply(
        { type: 'string', value: 'A😀B' },
        [createStep('truncate-two', 'truncate', [{ type: 'integer', value: 2 }])],
      ),
    ).toEqual({ type: 'string', value: 'A😀' });
    expect(
      apply(
        { type: 'string', value: 'A😀B' },
        [createStep('truncate-one', 'truncate', [{ type: 'integer', value: 1 }])],
      ),
    ).toEqual({ type: 'string', value: 'A' });
    expect(
      apply(
        { type: 'string', value: 'A😀B' },
        [createStep('truncate-zero', 'truncate', [{ type: 'integer', value: 0 }])],
      ),
    ).toEqual({ type: 'string', value: '' });
  });
});

describe('applyFormatterPipelineV1 chaining and fail-soft behavior', () => {
  it('feeds each formatted result into the following step', () => {
    expect(
      apply(
        { type: 'number', value: 12.5 },
        [
          createStep('number', 'number', [{ type: 'string', value: 'en-US' }]),
          createStep('percent', 'suffix', [{ type: 'string', value: '%' }]),
        ],
      ),
    ).toEqual({ type: 'string', value: '12.5%' });
  });

  it('returns undefined for wrong input types and non-finite numbers', () => {
    expect(
      apply(
        { type: 'string', value: '12' },
        [createStep('number', 'number', [{ type: 'string', value: 'en-US' }])],
      ),
    ).toBeUndefined();
    expect(
      apply(
        { type: 'number', value: Number.POSITIVE_INFINITY },
        [createStep('number', 'number', [{ type: 'string', value: 'en-US' }])],
      ),
    ).toBeUndefined();
  });

  it('returns undefined for invalid locale, date-time, time-zone, pattern, and truncate length', () => {
    expect(
      apply(
        { type: 'number', value: 1 },
        [createStep('number', 'number', [{ type: 'string', value: 'invalid_locale' }])],
      ),
    ).toBeUndefined();
    expect(
      apply(
        { type: 'date-time', value: 'not-an-instant' },
        [
          createStep('date-time', 'date-time', [
            { type: 'string', value: 'yyyy' },
            { type: 'string', value: 'en-US' },
            { type: 'string', value: 'UTC' },
          ]),
        ],
      ),
    ).toBeUndefined();
    expect(
      apply(
        { type: 'date-time', value: '2026-03-09T15:04:05Z' },
        [
          createStep('date-time', 'date-time', [
            { type: 'string', value: 'unknown Q' },
            { type: 'string', value: 'en-US' },
            { type: 'string', value: 'Not/A_Zone' },
          ]),
        ],
      ),
    ).toBeUndefined();
    expect(
      apply(
        { type: 'string', value: 'Broadset' },
        [createStep('truncate', 'truncate', [{ type: 'integer', value: -1 }])],
      ),
    ).toBeUndefined();
  });

  it('short-circuits the whole pipeline after a failed step', () => {
    expect(
      apply(
        { type: 'boolean', value: true },
        [
          createStep('prefix', 'prefix', [{ type: 'string', value: '[' }]),
          createStep('suffix', 'suffix', [{ type: 'string', value: ']' }]),
        ],
      ),
    ).toBeUndefined();
  });
});
