import {
  type BroadsetGradient,
  type BroadsetGradientStop,
  colorToCss,
  migrateLegacyColor,
} from '@broadset/model';

const GRADIENT_STOP_RE = /^backgroundGradient\.stops\[(\d+)\]\.(color|position)$/;
const GRADIENT_FIXED_TARGETS = new Set(['backgroundGradient.angle', 'backgroundGradient.center']);

export type ParsedGradientTarget =
  | { readonly kind: 'stop'; readonly index: number; readonly field: 'color' | 'position' }
  | { readonly kind: 'angle' }
  | { readonly kind: 'center' };

export interface GradientPropertyUpdate {
  readonly target: ParsedGradientTarget;
  readonly value: unknown;
}

/** Check whether a property name is a gradient animation dot-path target. */
export function isGradientAnimationTarget(propertyName: string): boolean {
  if (GRADIENT_FIXED_TARGETS.has(propertyName)) {
    return true;
  }

  return GRADIENT_STOP_RE.test(propertyName);
}

const GRADIENT_STOP_FIELDS = new Set<string>(['color', 'position']);

/**
 * Parse a gradient animation target string into a structured descriptor.
 * Returns null if the string is not a valid gradient target.
 */
export function parseGradientTarget(propertyName: string): ParsedGradientTarget | null {
  if (propertyName === 'backgroundGradient.angle') {
    return { kind: 'angle' };
  }

  if (propertyName === 'backgroundGradient.center') {
    return { kind: 'center' };
  }

  const stopMatch = GRADIENT_STOP_RE.exec(propertyName);

  if (stopMatch !== null) {
    const index = Number(stopMatch[1]);
    const rawField = stopMatch[2] ?? '';

    if (!GRADIENT_STOP_FIELDS.has(rawField)) {
      return null;
    }

    return { kind: 'stop', index, field: rawField as 'color' | 'position' };
  }

  return null;
}

/**
 * Apply a list of gradient property updates to a base gradient, returning
 * a new gradient object. Out-of-bounds stop indices are silently ignored.
 * The original gradient is not mutated.
 */
function parseCenterValue(value: unknown): readonly [number, number] | null {
  if (!Array.isArray(value) || value.length < 2) return null;

  const x: unknown = value[0];
  const y: unknown = value[1];

  if (typeof x !== 'number' || typeof y !== 'number') return null;

  return [x, y];
}

function applyStopUpdate(
  stops: BroadsetGradientStop[],
  target: { readonly index: number; readonly field: 'color' | 'position' },
  value: unknown,
): void {
  const { index, field } = target;

  if (index < 0 || index >= stops.length) return;

  const stop = stops[index];

  if (stop === undefined) return;

  if (field === 'color' && typeof value === 'string') {
    const color = migrateLegacyColor(value);

    if (color !== undefined) {
      stops[index] = { ...stop, color };
    }
  } else if (
    field === 'color' &&
    typeof value === 'object' &&
    value !== null &&
    'kind' in (value as Record<string, unknown>)
  ) {
    stops[index] = { ...stop, color: value as BroadsetGradientStop['color'] };
  } else if (field === 'position' && typeof value === 'number') {
    stops[index] = { ...stop, position: value };
  }
}

interface GradientAccumulator {
  angle: number | undefined;
  center: readonly [number, number] | undefined;
  readonly stops: BroadsetGradientStop[];
}

function applyOneGradientUpdate(acc: GradientAccumulator, update: GradientPropertyUpdate): void {
  const { target, value } = update;

  if (target.kind === 'angle') {
    if (typeof value === 'number') acc.angle = value;

    return;
  }

  if (target.kind === 'center') {
    const parsed = parseCenterValue(value);

    if (parsed !== null) acc.center = parsed;

    return;
  }

  applyStopUpdate(acc.stops, target, value);
}

export function applyGradientPropertyUpdates(
  gradient: BroadsetGradient,
  updates: readonly GradientPropertyUpdate[],
): BroadsetGradient {
  const acc: GradientAccumulator = {
    angle: gradient.angle,
    center: gradient.center,
    stops: gradient.stops.map((stop) => ({ ...stop })),
  };

  for (const update of updates) applyOneGradientUpdate(acc, update);

  return {
    type: gradient.type,
    stops: acc.stops,
    ...(acc.angle !== undefined ? { angle: acc.angle } : {}),
    ...(acc.center !== undefined ? { center: acc.center } : {}),
  };
}

/** Serialize a BroadsetGradient to a CSS gradient string. */
export function serializeGradientToCss(gradient: BroadsetGradient): string {
  const stops = gradient.stops
    .map((stop) => `${colorToCss(stop.color)} ${String(stop.position)}%`)
    .join(', ');

  switch (gradient.type) {
    case 'linear': {
      const angle = gradient.angle ?? 180;

      return `linear-gradient(${String(angle)}deg, ${stops})`;
    }

    case 'radial': {
      const center = gradient.center ?? [50, 50];

      return `radial-gradient(circle at ${String(center[0])}% ${String(center[1])}%, ${stops})`;
    }

    case 'conic': {
      const angle = gradient.angle ?? 0;
      const center = gradient.center ?? [50, 50];

      return `conic-gradient(from ${String(angle)}deg at ${String(center[0])}% ${String(center[1])}%, ${stops})`;
    }
  }
}
