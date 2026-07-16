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

  return { type: 'string', value: splitGraphemes(value.value).slice(0, maximumLength.value).join('') };
}

type GraphemeClass = 'cr' | 'lf' | 'control' | 'extend' | 'zwj' | 'spacing-mark' | 'prepend' | 'ri' | 'l' | 'v' | 't' | 'lv' | 'lvt' | 'other';

function hangulClass(codePoint: number): GraphemeClass | undefined {
  if ((codePoint >= 0x1100 && codePoint <= 0x115f) || (codePoint >= 0xa960 && codePoint <= 0xa97c)) return 'l';
  if ((codePoint >= 0x1160 && codePoint <= 0x11a7) || (codePoint >= 0xd7b0 && codePoint <= 0xd7c6)) return 'v';
  if ((codePoint >= 0x11a8 && codePoint <= 0x11ff) || (codePoint >= 0xd7cb && codePoint <= 0xd7fb)) return 't';
  if (codePoint < 0xac00 || codePoint > 0xd7a3) return undefined;

  return (codePoint - 0xac00) % 28 === 0 ? 'lv' : 'lvt';
}

function graphemeClass(character: string): GraphemeClass {
  const codePoint = character.codePointAt(0) ?? 0;
  const hangul = hangulClass(codePoint);

  if (hangul !== undefined) return hangul;
  if (character === '\r') return 'cr';
  if (character === '\n') return 'lf';
  if (character === '\u200D') return 'zwj';
  if (/\p{Regional_Indicator}/u.test(character)) return 'ri';
  if (/\p{Grapheme_Extend}/u.test(character) || /\p{Emoji_Modifier}/u.test(character) || (codePoint >= 0xe0020 && codePoint <= 0xe007f)) return 'extend';
  if (/\p{Mc}/u.test(character)) return 'spacing-mark';
  if (/[\u0600-\u0605\u06DD\u070F\u0890\u0891\u08E2\u{110BD}\u{110CD}]/u.test(character)) return 'prepend';
  if (/\p{Cc}|\p{Cf}/u.test(character)) return 'control';

  return 'other';
}

function joinsHangul(previous: GraphemeClass, current: GraphemeClass): boolean {
  if (previous === 'l') return ['l', 'v', 'lv', 'lvt'].includes(current);
  if (previous === 'lv' || previous === 'v') return current === 'v' || current === 't';

  return (previous === 'lvt' || previous === 't') && current === 't';
}

function isIndicLinker(character: string): boolean {
  return /[\u094D\u09CD\u0A4D\u0ACD\u0B4D\u0BCD\u0C4D\u0CCD\u0D3B\u0D3C\u0D4D\u0DCA\u0E3A\u0F84\u1039\u103A\u1714\u1734\u17D2\u1A60\u1B44\u1BAA\u1BAB\uA806\uA8C4\uA953\uA9C0\uAAF6\uABED\u{10A3F}\u{11046}\u{11070}\u{11133}\u{11134}\u{111C0}\u{11235}\u{112EA}\u{1134D}\u{11442}\u{11446}\u{114C2}\u{115BF}\u{1163F}\u{116B6}\u{1172B}\u{11839}\u{1193D}\u{1193E}\u{119E0}\u{11A34}\u{11A47}\u{11A99}\u{11C3F}\u{11D44}\u{11D45}\u{11D97}\u{11F41}\u{11F42}]/u.test(character);
}

interface GraphemeState {
  previousClass: GraphemeClass;
  regionalCount: number;
  indicLinkerPending: boolean;
  emojiBaseBeforeExtends: boolean;
  emojiZwjPending: boolean;
}

function isExtendedPictographic(character: string): boolean {
  return /\p{Extended_Pictographic}/u.test(character);
}

function createGraphemeState(character: string, characterClass: GraphemeClass): GraphemeState {
  return {
    previousClass: characterClass,
    regionalCount: characterClass === 'ri' ? 1 : 0,
    indicLinkerPending: isIndicLinker(character),
    emojiBaseBeforeExtends: isExtendedPictographic(character),
    emojiZwjPending: false,
  };
}

function joinsCluster(state: GraphemeState, current: string, currentClass: GraphemeClass): boolean {
  if (state.previousClass === 'cr' && currentClass === 'lf') return true;
  if (['cr', 'lf', 'control'].includes(state.previousClass) || ['cr', 'lf', 'control'].includes(currentClass)) return false;
  if (joinsHangul(state.previousClass, currentClass)) return true;
  if (currentClass === 'extend' || currentClass === 'zwj' || currentClass === 'spacing-mark') return true;
  if (state.previousClass === 'prepend') return true;
  if (state.indicLinkerPending && /\p{Letter}/u.test(current)) return true;
  if (state.emojiZwjPending && isExtendedPictographic(current)) return true;

  return currentClass === 'ri' && state.regionalCount % 2 === 1;
}

function updateGraphemeState(state: GraphemeState, character: string, characterClass: GraphemeClass): void {
  state.previousClass = characterClass;
  state.regionalCount = characterClass === 'ri' ? state.regionalCount + 1 : 0;

  if (isIndicLinker(character)) state.indicLinkerPending = true;
  else if (characterClass !== 'extend' && characterClass !== 'zwj') state.indicLinkerPending = false;

  if (characterClass === 'zwj') {
    state.emojiZwjPending = state.emojiBaseBeforeExtends;
    state.emojiBaseBeforeExtends = false;
  } else if (characterClass !== 'extend') {
    state.emojiZwjPending = false;
    state.emojiBaseBeforeExtends = isExtendedPictographic(character);
  }
}

function splitGraphemes(value: string): readonly string[] {
  const graphemes: string[] = [];
  let parts: string[] = [];
  let state: GraphemeState | undefined;

  for (const character of value) {
    const characterClass = graphemeClass(character);

    if (state === undefined || !joinsCluster(state, character, characterClass)) {
      if (parts.length > 0) graphemes.push(parts.join(''));
      parts = [character];
      state = createGraphemeState(character, characterClass);
    } else {
      parts.push(character);
      updateGraphemeState(state, character, characterClass);
    }
  }

  if (parts.length > 0) graphemes.push(parts.join(''));

  return graphemes;
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
