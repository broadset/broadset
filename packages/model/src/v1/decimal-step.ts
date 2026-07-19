interface ExactDecimal {
  readonly coefficient: bigint;
  readonly scale: number;
}

function splitExponent(value: string): readonly [string, number] {
  const lower = value.toLowerCase();
  const index = lower.indexOf('e');

  return index < 0 ? [lower, 0] : [lower.slice(0, index), Number(lower.slice(index + 1))];
}

function parseExactDecimal(value: number): ExactDecimal {
  const [mantissa, exponent] = splitExponent(JSON.stringify(value));
  const negative = mantissa.startsWith('-');
  const unsigned = negative ? mantissa.slice(1) : mantissa;
  const point = unsigned.indexOf('.');
  const integer = point < 0 ? unsigned : unsigned.slice(0, point);
  const fraction = point < 0 ? '' : unsigned.slice(point + 1);
  const coefficient = BigInt(`${negative ? '-' : ''}${integer}${fraction}`);

  return { coefficient, scale: fraction.length - exponent };
}

function scaleDecimal(value: ExactDecimal, scale: number): bigint {
  return value.coefficient * 10n ** BigInt(scale - value.scale);
}

/**
 * JSON's shortest decimal spelling is the authored numeric truth. Scaling those exact decimals to
 * integers avoids binary floating-point division while preserving exponent notation deterministically.
 */
export function isExactDecimalStepAligned(value: number, origin: number, step: number): boolean {
  const parsedValue = parseExactDecimal(value);
  const parsedOrigin = parseExactDecimal(origin);
  const parsedStep = parseExactDecimal(step);
  const scale = Math.max(0, parsedValue.scale, parsedOrigin.scale, parsedStep.scale);
  const valueInteger = scaleDecimal(parsedValue, scale);
  const originInteger = scaleDecimal(parsedOrigin, scale);
  const stepInteger = scaleDecimal(parsedStep, scale);

  return (valueInteger - originInteger) % stepInteger === 0n;
}
