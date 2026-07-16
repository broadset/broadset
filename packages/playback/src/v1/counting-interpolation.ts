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
  const digits = String(Math.abs(rounded)).padStart(options.minimumDigits, '0');
  const grouped = options.grouping ? digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : digits;

  return `${negative ? '-' : ''}${grouped}`;
}
