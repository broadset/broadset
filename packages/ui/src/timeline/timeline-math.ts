const MS_PER_SECOND = 1000;
const MAX_RULER_LABELS = 13;

export function clampRailRatio(ratio: number): number {
  if (!Number.isFinite(ratio)) return 0;

  return Math.min(1, Math.max(0, ratio));
}

/** Pointer positions map to a ratio of durationTicks first, then to an exact integer tick (timeline.md). */
export function tickFromRailRatio(ratio: number, durationTicks: number): number {
  return Math.round(clampRailRatio(ratio) * durationTicks);
}

export function railRatioFromTick(tick: number, durationTicks: number): number {
  if (durationTicks <= 0) return 0;

  return clampRailRatio(tick / durationTicks);
}

/**
 * A "100 ms" grid is a presentation preference converted ONCE to a positive integer tick interval.
 * `Math.max(1, …)` already floors non-positive `ticksPerSecond` products to 1, so no separate
 * `ticksPerSecond <= 0` guard is needed here (unlike `formatTickSeconds`/`rulerLabelTicks`, which
 * divide by `ticksPerSecond` and DO need one to avoid `Infinity`/an infinite loop).
 */
export function resolveSnapIntervalTicks(preferenceMs: number, ticksPerSecond: number): number {
  return Math.max(1, Math.round((preferenceMs / MS_PER_SECOND) * ticksPerSecond));
}

export function snapTick(tick: number, intervalTicks: number, durationTicks: number): number {
  const snapped = Math.round(tick / intervalTicks) * intervalTicks;

  return Math.min(durationTicks, Math.max(0, snapped));
}

export function formatTickSeconds(tick: number, ticksPerSecond: number): string {
  if (ticksPerSecond <= 0) return '0.0s';

  return `${(tick / ticksPerSecond).toFixed(1)}s`;
}

/** Whole-second (or multiple-of-seconds) label positions, bounded, always including 0 and the end. */
export function rulerLabelTicks(durationTicks: number, ticksPerSecond: number): readonly number[] {
  if (durationTicks <= 0) return [0];
  if (ticksPerSecond <= 0) return [0, durationTicks];

  const totalSeconds = durationTicks / ticksPerSecond;
  const stepSeconds = Math.max(1, Math.ceil(totalSeconds / (MAX_RULER_LABELS - 1)));
  const stepTicks = stepSeconds * ticksPerSecond;
  const labels: number[] = [];

  for (let tick = 0; tick < durationTicks; tick += stepTicks) labels.push(Math.round(tick));
  labels.push(durationTicks);

  return labels;
}

/** Horizontal fan-out so same-tick markers stay individually selectable within their lane. */
export function fanOffsets(
  keyframes: readonly { readonly id: string; readonly tick: number }[],
  stepPx: number,
): ReadonlyMap<string, number> {
  const seenPerTick = new Map<number, number>();
  const offsets = new Map<string, number>();

  for (const keyframe of keyframes) {
    const index = seenPerTick.get(keyframe.tick) ?? 0;

    offsets.set(keyframe.id, index * stepPx);
    seenPerTick.set(keyframe.tick, index + 1);
  }

  return offsets;
}
