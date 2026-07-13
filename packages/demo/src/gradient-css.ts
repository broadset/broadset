interface CssGradientStop {
  readonly color: string;
  readonly position: number;
}

type CssGradient =
  | {
      readonly type: 'linear';
      readonly angle: number;
      readonly stops: readonly CssGradientStop[];
    }
  | {
      readonly type: 'radial';
      readonly center: readonly [number, number];
      readonly stops: readonly CssGradientStop[];
    }
  | {
      readonly type: 'conic';
      readonly startAngle: number;
      readonly center: readonly [number, number];
      readonly stops: readonly CssGradientStop[];
    };

const DEFAULT_LINEAR_ANGLE = 90;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeAngle(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return ((value % 360) + 360) % 360;
}

function splitTopLevelCommas(value: string): readonly string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];

    if (character === '(') {
      depth += 1;
    } else if (character === ')') {
      depth = Math.max(0, depth - 1);
    } else if (character === ',' && depth === 0) {
      parts.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }

  parts.push(value.slice(start).trim());

  return parts.filter((part) => part !== '');
}

function findFunctionEnd(value: string, openParenIndex: number): number {
  let depth = 0;

  for (let index = openParenIndex; index < value.length; index += 1) {
    const character = value[index];

    if (character === '(') {
      depth += 1;
    } else if (character === ')') {
      depth -= 1;

      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

function parseColorToken(colorText: string): string | null {
  return colorText.trim() === '' ? null : colorText.trim();
}

function extractColorToken(value: string): { readonly color: string; readonly rest: string } | null {
  const trimmed = value.trim();

  if (trimmed === '') {
    return null;
  }

  const hexMatch = /^#[0-9a-f]{3,8}\b/iu.exec(trimmed);

  if (hexMatch !== null) {
    const colorText = hexMatch[0];
    const color = parseColorToken(colorText);

    return color === null ? null : { color, rest: trimmed.slice(colorText.length).trim() };
  }

  const functionStart = /^[a-z][\w-]*\(/iu.exec(trimmed);

  if (functionStart !== null) {
    const openParenIndex = functionStart[0].length - 1;
    const functionEnd = findFunctionEnd(trimmed, openParenIndex);

    if (functionEnd >= 0) {
      const colorText = trimmed.slice(0, functionEnd + 1);
      const color = parseColorToken(colorText);

      return color === null ? null : { color, rest: trimmed.slice(functionEnd + 1).trim() };
    }
  }

  const keywordMatch = /^[a-z]+/iu.exec(trimmed);

  if (keywordMatch === null) {
    return null;
  }

  const colorText = keywordMatch[0];
  const color = parseColorToken(colorText);

  return color === null ? null : { color, rest: trimmed.slice(colorText.length).trim() };
}

function parseStopPart(value: string): { readonly color: string; readonly position?: number | undefined } | null {
  const colorToken = extractColorToken(value);

  if (colorToken === null) {
    return null;
  }

  const positionMatch = /(-?\d+(?:\.\d+)?)%/u.exec(colorToken.rest);
  const position = positionMatch === null ? undefined : Number.parseFloat(positionMatch[1] ?? '0');

  return {
    color: colorToken.color,
    ...(position === undefined || !Number.isFinite(position) ? {} : { position: clamp(position, 0, 100) }),
  };
}

function withResolvedStopPositions(
  parsedStops: readonly { readonly color: string; readonly position?: number | undefined }[],
): readonly CssGradientStop[] {
  const lastIndex = Math.max(parsedStops.length - 1, 1);

  return parsedStops
    .map((stop, index) => ({
      color: stop.color,
      position: stop.position ?? (index / lastIndex) * 100,
    }))
    .sort((left, right) => left.position - right.position);
}

function parseStops(parts: readonly string[]): readonly CssGradientStop[] | null {
  const parsedStops = parts.map(parseStopPart);

  if (parsedStops.some((stop) => stop === null)) {
    return null;
  }

  const stops = withResolvedStopPositions(
    parsedStops.filter(
      (stop): stop is { readonly color: string; readonly position?: number | undefined } => stop !== null,
    ),
  );

  return stops.length < 2 ? null : stops;
}

function parseCenter(value: string): readonly [number, number] | undefined {
  const centerMatch = /\bat\s+(-?\d+(?:\.\d+)?)%\s+(-?\d+(?:\.\d+)?)%/iu.exec(value);

  if (centerMatch === null) {
    return undefined;
  }

  const x = Number.parseFloat(centerMatch[1] ?? '50');
  const y = Number.parseFloat(centerMatch[2] ?? '50');

  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return undefined;
  }

  return [clamp(x, 0, 100), clamp(y, 0, 100)];
}

function parseGradientDescriptorAngle(value: string): number | undefined {
  const angleMatch = /(?:^|\bfrom\s+)(-?\d+(?:\.\d+)?)deg\b/iu.exec(value);

  if (angleMatch === null) {
    return undefined;
  }

  const angle = Number.parseFloat(angleMatch[1] ?? '0');

  return Number.isFinite(angle) ? normalizeAngle(angle) : undefined;
}

function parseLinearDirectionAngle(value: string): number | undefined {
  const normalized = value.trim().toLowerCase();

  if (!normalized.startsWith('to ')) {
    return undefined;
  }

  const directions = new Set(normalized.slice(3).split(/\s+/u));
  const hasTop = directions.has('top');
  const hasRight = directions.has('right');
  const hasBottom = directions.has('bottom');
  const hasLeft = directions.has('left');

  if (hasTop && hasRight) return 45;
  if (hasBottom && hasRight) return 135;
  if (hasBottom && hasLeft) return 225;
  if (hasTop && hasLeft) return 315;
  if (hasTop) return 0;
  if (hasRight) return 90;
  if (hasBottom) return 180;
  if (hasLeft) return 270;

  return undefined;
}

function parseLinearGradientParts(parts: readonly string[]): CssGradient | null {
  const firstPart = parts[0] ?? '';
  const angleMatch = /^(-?\d+(?:\.\d+)?)deg$/iu.exec(firstPart);
  const directionAngle = parseLinearDirectionAngle(firstPart);
  const hasDescriptor = angleMatch !== null || directionAngle !== undefined;
  const angle =
    angleMatch === null ?
      (directionAngle ?? DEFAULT_LINEAR_ANGLE)
    : normalizeAngle(Number.parseFloat(angleMatch[1] ?? '0'));
  const stopParts = hasDescriptor ? parts.slice(1) : parts;
  const stops = parseStops(stopParts);

  return stops === null ? null : { type: 'linear', angle, stops };
}

function parseRadialGradientParts(parts: readonly string[]): CssGradient | null {
  const firstStop = parseStopPart(parts[0] ?? '');
  const descriptor = firstStop === null ? (parts[0] ?? '') : '';
  const stopParts = firstStop === null ? parts.slice(1) : parts;
  const stops = parseStops(stopParts);

  if (stops === null) {
    return null;
  }

  return {
    type: 'radial',
    center: parseCenter(descriptor) ?? [50, 50],
    stops,
  };
}

function parseConicGradientParts(parts: readonly string[]): CssGradient | null {
  const firstStop = parseStopPart(parts[0] ?? '');
  const descriptor = firstStop === null ? (parts[0] ?? '') : '';
  const stopParts = firstStop === null ? parts.slice(1) : parts;
  const stops = parseStops(stopParts);

  if (stops === null) {
    return null;
  }

  return {
    type: 'conic',
    startAngle: parseGradientDescriptorAngle(descriptor) ?? 0,
    center: parseCenter(descriptor) ?? [50, 50],
    stops,
  };
}

export function parseCssGradient(value: string): CssGradient | null {
  const trimmed = value.trim();

  if (trimmed === '') {
    return null;
  }

  const gradientMatch = /^(linear|radial|conic)-gradient\((.*)\)$/isu.exec(trimmed);

  if (gradientMatch === null) {
    return null;
  }

  const type = gradientMatch[1];
  const parts = splitTopLevelCommas(gradientMatch[2] ?? '');

  switch (type) {
    case 'linear':
      return parseLinearGradientParts(parts);

    case 'radial':
      return parseRadialGradientParts(parts);

    case 'conic':
      return parseConicGradientParts(parts);

    default:
      return null;
  }
}
