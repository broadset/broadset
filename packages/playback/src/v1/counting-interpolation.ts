import { projectFormatV1 } from '@broadset/model';

const GROUP_SIZE = 3;

/**
 * Insert thousands separators in linear time by walking the digit string in
 * fixed-size chunks from the right. The equivalent lookahead regex
 * (`/\B(?=(\d{3})+(?!\d))/g`) is quadratic in the digit count, which the
 * blocking linear-regex rule forbids for values derived from document data.
 */
function groupThousands(digits: string): string {
  if (digits.length <= GROUP_SIZE) return digits;

  const groups: string[] = [];

  for (let end = digits.length; end > 0; end -= GROUP_SIZE) {
    groups.unshift(digits.slice(Math.max(0, end - GROUP_SIZE), end));
  }

  return groups.join(',');
}

export function interpolateCountingV1(options: {
  readonly from: string;
  readonly to: string;
  readonly progress: number;
  readonly rounding: 'floor' | 'ceil' | 'round' | 'truncate';
  readonly minimumDigits: number;
  readonly grouping: boolean;
}): string | undefined {
  const from = Number(options.from);
  const to = Number(options.to);

  if (!Number.isFinite(from) || !Number.isFinite(to) || options.from.trim() === '' || options.to.trim() === '') return undefined;

  const raw = from + (to - from) * options.progress;
  const rounders = { floor: Math.floor, ceil: Math.ceil, round: Math.round, truncate: Math.trunc } as const;
  const rounded = rounders[options.rounding](raw);
  const negative = rounded < 0;
  // The model schema bounds minimumDigits, but this function is reachable independently, so clamp
  // defensively to the same limit: padStart throws RangeError once the target string grows too large.
  const padTarget = Math.min(Math.max(0, Math.trunc(options.minimumDigits)), projectFormatV1.PROJECT_V1_LIMITS.maxCountingMinimumDigits);
  const digits = String(Math.abs(rounded)).padStart(padTarget, '0');
  const grouped = options.grouping ? groupThousands(digits) : digits;

  return `${negative ? '-' : ''}${grouped}`;
}
