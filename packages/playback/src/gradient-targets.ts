import type { BroadsetGradient, BroadsetGradientStop } from '@broadset/model';

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
export function applyGradientPropertyUpdates(
  gradient: BroadsetGradient,
  updates: readonly GradientPropertyUpdate[],
): BroadsetGradient {
  let angle = gradient.angle;
  let center = gradient.center;
  const stops: BroadsetGradientStop[] = gradient.stops.map((stop) => ({ ...stop }));

  for (const update of updates) {
    switch (update.target.kind) {
      case 'angle':
        if (typeof update.value === 'number') {
          angle = update.value;
        }

        break;

      case 'center':
        if (
          Array.isArray(update.value) &&
          update.value.length >= 2 &&
          typeof update.value[0] === 'number' &&
          typeof update.value[1] === 'number'
        ) {
          center = [update.value[0], update.value[1]];
        }

        break;

      case 'stop': {
        const { index, field } = update.target;

        if (index < 0 || index >= stops.length) {
          break;
        }

        const stop = stops[index];

        if (stop === undefined) {
          break;
        }

        if (field === 'color' && typeof update.value === 'string') {
          stops[index] = { ...stop, color: update.value };
        } else if (field === 'position' && typeof update.value === 'number') {
          stops[index] = { ...stop, position: update.value };
        }

        break;
      }
    }
  }

  return {
    type: gradient.type,
    stops,
    ...(angle !== undefined ? { angle } : {}),
    ...(center !== undefined ? { center } : {}),
  };
}

/** Serialize a BroadsetGradient to a CSS gradient string. */
export function serializeGradientToCss(gradient: BroadsetGradient): string {
  const stops = gradient.stops.map((stop) => `${stop.color} ${String(stop.position)}%`).join(', ');

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
