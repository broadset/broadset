import { describe, expect, it } from 'vitest';

import { formatDateTimePatternV1 } from './date-time-pattern';

const FIXED_INSTANT = new Date('2026-03-09T15:04:05Z');
const UTC_OPTIONS = { locale: 'en-US', timeZone: 'UTC' } as const;

describe('formatDateTimePatternV1 numeric fields', () => {
  it('formats deterministic calendar fields in UTC', () => {
    expect(formatDateTimePatternV1(FIXED_INSTANT, 'yyyy-MM-dd', UTC_OPTIONS)).toBe('2026-03-09');
    expect(formatDateTimePatternV1(FIXED_INSTANT, 'yy-M-d', UTC_OPTIONS)).toBe('26-3-9');
  });

  it('formats deterministic time fields in UTC', () => {
    expect(formatDateTimePatternV1(FIXED_INSTANT, 'HH:mm:ss', UTC_OPTIONS)).toBe('15:04:05');
    expect(formatDateTimePatternV1(FIXED_INSTANT, 'H:m:s', UTC_OPTIONS)).toBe('15:4:5');
    expect(formatDateTimePatternV1(new Date('2026-03-09T04:04:05Z'), 'H', UTC_OPTIONS)).toBe('4');
  });

  it('keeps a single zero digit for no-leading-zero fields at zero', () => {
    const midnight = new Date('2026-03-09T00:00:00Z');

    expect(formatDateTimePatternV1(midnight, 'H:m:s', UTC_OPTIONS)).toBe('0:0:0');
    expect(formatDateTimePatternV1(midnight, 'HH:mm:ss', UTC_OPTIONS)).toBe('00:00:00');
  });

  it('applies a non-UTC time zone', () => {
    expect(formatDateTimePatternV1(FIXED_INSTANT, 'HH', UTC_OPTIONS)).toBe('15');
    expect(
      formatDateTimePatternV1(FIXED_INSTANT, 'HH', {
        locale: 'en-US',
        timeZone: 'America/New_York',
      }),
    ).toBe('11');
  });
});

describe('formatDateTimePatternV1 localized fields', () => {
  it('formats month and weekday names', () => {
    expect(formatDateTimePatternV1(FIXED_INSTANT, 'MMMM', UTC_OPTIONS)).toContain('March');
    expect(formatDateTimePatternV1(FIXED_INSTANT, 'MMM', UTC_OPTIONS)).toContain('Mar');
    expect(formatDateTimePatternV1(FIXED_INSTANT, 'EEEE', UTC_OPTIONS)).toContain('Monday');
    expect(formatDateTimePatternV1(FIXED_INSTANT, 'EEE', UTC_OPTIONS)).toContain('Mon');
  });

  it('formats 12-hour time and its locale-specific day period', () => {
    const formatted = formatDateTimePatternV1(FIXED_INSTANT, 'hh h a', UTC_OPTIONS);

    expect(formatted).toContain('03 3');
    expect(formatted?.toLocaleUpperCase('en-US')).toContain('PM');
  });
});

describe('formatDateTimePatternV1 literals and failures', () => {
  it('preserves literal text, quoted letters, and escaped apostrophes', () => {
    expect(
      formatDateTimePatternV1(FIXED_INSTANT, "yyyy-MM-dd 'at' HH:mm 'o''clock'", UTC_OPTIONS),
    ).toBe("2026-03-09 at 15:04 o'clock");
    expect(formatDateTimePatternV1(FIXED_INSTANT, "''yyyy''", UTC_OPTIONS)).toBe("'2026'");
  });

  it('fails softly for unsupported tokens and unterminated quotes', () => {
    expect(formatDateTimePatternV1(FIXED_INSTANT, 'yyyy-QQ', UTC_OPTIONS)).toBeUndefined();
    expect(formatDateTimePatternV1(FIXED_INSTANT, "yyyy 'unfinished", UTC_OPTIONS)).toBeUndefined();
  });

  it('fails softly for invalid dates, locales, and time zones', () => {
    expect(formatDateTimePatternV1(new Date(Number.NaN), 'yyyy', UTC_OPTIONS)).toBeUndefined();
    expect(
      formatDateTimePatternV1(FIXED_INSTANT, 'yyyy', { locale: 'invalid_locale', timeZone: 'UTC' }),
    ).toBeUndefined();
    expect(
      formatDateTimePatternV1(FIXED_INSTANT, 'yyyy', { locale: 'en-US', timeZone: 'Not/A_Zone' }),
    ).toBeUndefined();
    expect(
      formatDateTimePatternV1(FIXED_INSTANT, "'literal'", {
        locale: 'invalid_locale',
        timeZone: 'UTC',
      }),
    ).toBeUndefined();
    expect(
      formatDateTimePatternV1(FIXED_INSTANT, '', {
        locale: 'en-US',
        timeZone: 'Not/A_Zone',
      }),
    ).toBeUndefined();
  });
});
