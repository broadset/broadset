interface ExactIsoInstant {
  readonly epochSeconds: bigint;
  readonly fractionalDigits: string;
}

const EXPECTED_DATE_PARTS = 3;
const EXPECTED_TIME_PARTS = 3;
const EXPECTED_OFFSET_PARTS = 2;
const MAX_SECOND_PARTS = 2;
const YEAR_DIGITS = 4;
const COMPONENT_DIGITS = 2;
const DATE_TIME_SEPARATOR_INDEX = 10;
const OFFSET_HOUR_LIMIT = 23;
const OFFSET_MINUTE_LIMIT = 59;
const SECONDS_PER_MINUTE = 60n;
const MINUTES_PER_HOUR = 60n;
const HOURS_PER_DAY = 24n;
const DAYS_PER_ERA = 146_097n;
const DAYS_FROM_CIVIL_EPOCH = 719_468n;
const YEARS_PER_ERA = 400n;
const ASCII_ZERO = 48;
const ASCII_NINE = 57;

function parseDecimalDigits(value: string, expectedLength?: number): number | undefined {
  if ((expectedLength !== undefined && value.length !== expectedLength) || value.length === 0) {
    return undefined;
  }

  let result = 0;

  for (const character of value) {
    const digit = character.codePointAt(0);

    if (digit === undefined || digit < ASCII_ZERO || digit > ASCII_NINE) {
      return undefined;
    }

    result = result * 10 + digit - ASCII_ZERO;
  }

  return Number.isSafeInteger(result) ? result : undefined;
}

function containsOnlyDecimalDigits(value: string): boolean {
  if (value.length === 0) {
    return false;
  }

  for (const character of value) {
    const digit = character.codePointAt(0);

    if (digit === undefined || digit < ASCII_ZERO || digit > ASCII_NINE) {
      return false;
    }
  }

  return true;
}

function floorDivide(value: bigint, divisor: bigint): bigint {
  const quotient = value / divisor;

  return value < 0n && value % divisor !== 0n ? quotient - 1n : quotient;
}

function calculateEpochDay(year: number, month: number, day: number): bigint {
  const bigintMonth = BigInt(month);
  const adjustedYear = BigInt(year) - (month <= 2 ? 1n : 0n);
  const era = floorDivide(adjustedYear, YEARS_PER_ERA);
  const yearOfEra = adjustedYear - era * YEARS_PER_ERA;
  const adjustedMonth = bigintMonth + (month > 2 ? -3n : 9n);
  const dayOfYear = (153n * adjustedMonth + 2n) / 5n + BigInt(day) - 1n;
  const dayOfEra = yearOfEra * 365n + yearOfEra / 4n - yearOfEra / 100n + dayOfYear;

  return era * DAYS_PER_ERA + dayOfEra - DAYS_FROM_CIVIL_EPOCH;
}

function parseOffsetSeconds(offset: string): bigint | undefined {
  if (offset === 'Z') {
    return 0n;
  }

  const sign = offset[0];
  const parts = offset.slice(1).split(':');

  if ((sign !== '+' && sign !== '-') || parts.length !== EXPECTED_OFFSET_PARTS) {
    return undefined;
  }

  const hours = parseDecimalDigits(parts[0] ?? '', COMPONENT_DIGITS);
  const minutes = parseDecimalDigits(parts[1] ?? '', COMPONENT_DIGITS);

  if (hours === undefined || minutes === undefined || hours > OFFSET_HOUR_LIMIT || minutes > OFFSET_MINUTE_LIMIT) {
    return undefined;
  }

  const absoluteSeconds = BigInt(hours) * MINUTES_PER_HOUR * SECONDS_PER_MINUTE + BigInt(minutes) * SECONDS_PER_MINUTE;

  return sign === '+' ? absoluteSeconds : -absoluteSeconds;
}

function splitLocalTimeAndOffset(value: string): readonly [string, string] | undefined {
  if (value.endsWith('Z')) {
    return [value.slice(DATE_TIME_SEPARATOR_INDEX + 1, -1), 'Z'];
  }

  const plusIndex = value.lastIndexOf('+');
  const minusIndex = value.lastIndexOf('-');
  const offsetIndex = Math.max(plusIndex, minusIndex);

  if (offsetIndex <= DATE_TIME_SEPARATOR_INDEX) {
    return undefined;
  }

  return [value.slice(DATE_TIME_SEPARATOR_INDEX + 1, offsetIndex), value.slice(offsetIndex)];
}

function parseExactIsoInstant(value: string): ExactIsoInstant | undefined {
  if (value[DATE_TIME_SEPARATOR_INDEX] !== 'T') {
    return undefined;
  }

  const dateParts = value.slice(0, DATE_TIME_SEPARATOR_INDEX).split('-');
  const localTimeAndOffset = splitLocalTimeAndOffset(value);

  if (dateParts.length !== EXPECTED_DATE_PARTS || localTimeAndOffset === undefined) {
    return undefined;
  }

  const [localTime, offset] = localTimeAndOffset;
  const timeParts = localTime.split(':');

  if (timeParts.length !== EXPECTED_TIME_PARTS) {
    return undefined;
  }

  const secondParts = (timeParts[2] ?? '').split('.');

  if (secondParts.length > MAX_SECOND_PARTS) {
    return undefined;
  }

  const year = parseDecimalDigits(dateParts[0] ?? '', YEAR_DIGITS);
  const month = parseDecimalDigits(dateParts[1] ?? '', COMPONENT_DIGITS);
  const day = parseDecimalDigits(dateParts[2] ?? '', COMPONENT_DIGITS);
  const hour = parseDecimalDigits(timeParts[0] ?? '', COMPONENT_DIGITS);
  const minute = parseDecimalDigits(timeParts[1] ?? '', COMPONENT_DIGITS);
  const second = parseDecimalDigits(secondParts[0] ?? '', COMPONENT_DIGITS);
  const fractionalDigits = secondParts[1] ?? '';
  const offsetSeconds = parseOffsetSeconds(offset);

  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    hour === undefined ||
    minute === undefined ||
    second === undefined ||
    offsetSeconds === undefined ||
    (secondParts.length === EXPECTED_OFFSET_PARTS && !containsOnlyDecimalDigits(fractionalDigits))
  ) {
    return undefined;
  }

  const secondsPerHour = MINUTES_PER_HOUR * SECONDS_PER_MINUTE;
  const secondsPerDay = HOURS_PER_DAY * secondsPerHour;
  const localSeconds =
    calculateEpochDay(year, month, day) * secondsPerDay +
    BigInt(hour) * secondsPerHour +
    BigInt(minute) * SECONDS_PER_MINUTE +
    BigInt(second);

  return { epochSeconds: localSeconds - offsetSeconds, fractionalDigits };
}

function compareFractionalDigits(left: string, right: string): number {
  const length = Math.max(left.length, right.length);

  for (let index = 0; index < length; index += 1) {
    const leftDigit = left[index] ?? '0';
    const rightDigit = right[index] ?? '0';

    if (leftDigit < rightDigit) {
      return -1;
    }

    if (leftDigit > rightDigit) {
      return 1;
    }
  }

  return 0;
}

export function compareExactIsoInstants(left: string, right: string): number | undefined {
  const leftInstant = parseExactIsoInstant(left);
  const rightInstant = parseExactIsoInstant(right);

  if (leftInstant === undefined || rightInstant === undefined) {
    return undefined;
  }

  if (leftInstant.epochSeconds < rightInstant.epochSeconds) {
    return -1;
  }

  if (leftInstant.epochSeconds > rightInstant.epochSeconds) {
    return 1;
  }

  return compareFractionalDigits(leftInstant.fractionalDigits, rightInstant.fractionalDigits);
}
