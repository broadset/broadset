interface DateTimePatternOptionsV1 {
  readonly locale: string;
  readonly timeZone: string;
}

interface TokenDefinition {
  readonly optionsKey: string;
  readonly fieldOptions: Intl.DateTimeFormatOptions;
  readonly partType: Intl.DateTimeFormatPartTypes;
  readonly padToTwoDigits?: boolean;
  readonly removeLeadingZero?: boolean;
}

const ASCII_UPPERCASE_A = 'A'.codePointAt(0) ?? 0;
const ASCII_UPPERCASE_Z = 'Z'.codePointAt(0) ?? 0;
const ASCII_LOWERCASE_A = 'a'.codePointAt(0) ?? 0;
const ASCII_LOWERCASE_Z = 'z'.codePointAt(0) ?? 0;
const APOSTROPHE = "'";
const TWO_DIGIT_WIDTH = 2;

const TOKEN_DEFINITIONS: Readonly<Record<string, TokenDefinition>> = {
  yyyy: { optionsKey: 'year:numeric', fieldOptions: { year: 'numeric' }, partType: 'year' },
  yy: { optionsKey: 'year:2-digit', fieldOptions: { year: '2-digit' }, partType: 'year', padToTwoDigits: true },
  MMMM: { optionsKey: 'month:long', fieldOptions: { month: 'long' }, partType: 'month' },
  MMM: { optionsKey: 'month:short', fieldOptions: { month: 'short' }, partType: 'month' },
  MM: {
    optionsKey: 'month:2-digit',
    fieldOptions: { month: '2-digit' },
    partType: 'month',
    padToTwoDigits: true,
  },
  M: { optionsKey: 'month:numeric', fieldOptions: { month: 'numeric' }, partType: 'month' },
  dd: { optionsKey: 'day:2-digit', fieldOptions: { day: '2-digit' }, partType: 'day', padToTwoDigits: true },
  d: { optionsKey: 'day:numeric', fieldOptions: { day: 'numeric' }, partType: 'day' },
  EEEE: { optionsKey: 'weekday:long', fieldOptions: { weekday: 'long' }, partType: 'weekday' },
  EEE: { optionsKey: 'weekday:short', fieldOptions: { weekday: 'short' }, partType: 'weekday' },
  HH: {
    optionsKey: 'hour:2-digit:h23',
    fieldOptions: { hour: '2-digit', hourCycle: 'h23' },
    partType: 'hour',
    padToTwoDigits: true,
  },
  H: {
    optionsKey: 'hour:numeric:h23',
    fieldOptions: { hour: 'numeric', hourCycle: 'h23' },
    partType: 'hour',
    removeLeadingZero: true,
  },
  hh: {
    optionsKey: 'hour:2-digit:h12',
    fieldOptions: { hour: '2-digit', hourCycle: 'h12' },
    partType: 'hour',
    padToTwoDigits: true,
  },
  h: { optionsKey: 'hour:numeric:h12', fieldOptions: { hour: 'numeric', hourCycle: 'h12' }, partType: 'hour' },
  mm: {
    optionsKey: 'minute:2-digit',
    fieldOptions: { minute: '2-digit' },
    partType: 'minute',
    padToTwoDigits: true,
  },
  m: {
    optionsKey: 'minute:numeric',
    fieldOptions: { minute: 'numeric' },
    partType: 'minute',
    removeLeadingZero: true,
  },
  ss: {
    optionsKey: 'second:2-digit',
    fieldOptions: { second: '2-digit' },
    partType: 'second',
    padToTwoDigits: true,
  },
  s: {
    optionsKey: 'second:numeric',
    fieldOptions: { second: 'numeric' },
    partType: 'second',
    removeLeadingZero: true,
  },
  a: {
    optionsKey: 'dayPeriod:h12',
    fieldOptions: { hour: 'numeric', hourCycle: 'h12' },
    partType: 'dayPeriod',
  },
};

const DATE_TIME_FORMAT_CACHE = new Map<string, Intl.DateTimeFormat>();

function isAsciiLetter(character: string): boolean {
  const codePoint = character.codePointAt(0);

  return (
    codePoint !== undefined &&
    ((codePoint >= ASCII_UPPERCASE_A && codePoint <= ASCII_UPPERCASE_Z) ||
      (codePoint >= ASCII_LOWERCASE_A && codePoint <= ASCII_LOWERCASE_Z))
  );
}

function getDateTimeFormat(
  definition: TokenDefinition,
  options: DateTimePatternOptionsV1,
): Intl.DateTimeFormat | undefined {
  const cacheKey = `${options.locale}|${options.timeZone}|${definition.optionsKey}`;
  const cached = DATE_TIME_FORMAT_CACHE.get(cacheKey);

  if (cached !== undefined) return cached;

  try {
    const formatter = new Intl.DateTimeFormat(options.locale, {
      timeZone: options.timeZone,
      ...definition.fieldOptions,
    });

    DATE_TIME_FORMAT_CACHE.set(cacheKey, formatter);

    return formatter;
  } catch {
    return undefined;
  }
}

function hasValidDateTimeContext(options: DateTimePatternOptionsV1): boolean {
  const cacheKey = `${options.locale}|${options.timeZone}|validation`;

  if (DATE_TIME_FORMAT_CACHE.has(cacheKey)) return true;

  try {
    const formatter = new Intl.DateTimeFormat(options.locale, { timeZone: options.timeZone });

    DATE_TIME_FORMAT_CACHE.set(cacheKey, formatter);

    return true;
  } catch {
    return false;
  }
}

function isValidDateTimeRequest(date: Date, options: DateTimePatternOptionsV1): boolean {
  return Number.isFinite(date.getTime()) && hasValidDateTimeContext(options);
}

function formatToken(
  date: Date,
  token: string,
  options: DateTimePatternOptionsV1,
): string | undefined {
  const definition = TOKEN_DEFINITIONS[token];

  if (definition === undefined) return undefined;

  const formatter = getDateTimeFormat(definition, options);

  if (formatter === undefined) return undefined;

  try {
    const part = formatter.formatToParts(date).find((candidate) => candidate.type === definition.partType);

    if (part === undefined) return undefined;

    const localizedZero = new Intl.NumberFormat(options.locale, { useGrouping: false }).format(0);

    if (definition.removeLeadingZero === true && part.value.startsWith(localizedZero)) {
      const stripped = part.value.slice(localizedZero.length);

      return stripped === '' ? part.value : stripped;
    }

    if (definition.padToTwoDigits !== true || Array.from(part.value).length >= TWO_DIGIT_WIDTH) return part.value;

    return localizedZero + part.value;
  } catch {
    return undefined;
  }
}

function readQuotedLiteral(pattern: string, startIndex: number): readonly [string, number] | undefined {
  let index = startIndex + 1;
  let literal = '';

  while (index < pattern.length) {
    const character = pattern[index];

    if (character !== APOSTROPHE) {
      literal += character ?? '';
      index += 1;
      continue;
    }

    if (pattern[index + 1] === APOSTROPHE) {
      literal += APOSTROPHE;
      index += 2;
      continue;
    }

    return [literal, index + 1];
  }

  return undefined;
}

function findTokenEnd(pattern: string, startIndex: number, character: string): number {
  let tokenEnd = startIndex + 1;

  while (pattern[tokenEnd] === character) tokenEnd += 1;

  return tokenEnd;
}

export function formatDateTimePatternV1(
  date: Date,
  pattern: string,
  options: DateTimePatternOptionsV1,
): string | undefined {
  if (!isValidDateTimeRequest(date, options)) return undefined;

  let formatted = '';
  let index = 0;

  while (index < pattern.length) {
    const character = pattern[index] ?? '';

    if (character === APOSTROPHE) {
      if (pattern[index + 1] === APOSTROPHE) {
        formatted += APOSTROPHE;
        index += 2;
        continue;
      }

      const quoted = readQuotedLiteral(pattern, index);

      if (quoted === undefined) return undefined;

      formatted += quoted[0];
      index = quoted[1];
      continue;
    }

    if (!isAsciiLetter(character)) {
      formatted += character;
      index += 1;
      continue;
    }

    const tokenEnd = findTokenEnd(pattern, index, character);

    const tokenValue = formatToken(date, pattern.slice(index, tokenEnd), options);

    if (tokenValue === undefined) return undefined;

    formatted += tokenValue;
    index = tokenEnd;
  }

  return formatted;
}
