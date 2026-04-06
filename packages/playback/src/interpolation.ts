import type { KeyframeValue } from '@broadset/model';

const CUBIC_BEZIER_RE = /^cubic-bezier\(\s*([^\s,]+)\s*,\s*([^\s,]+)\s*,\s*([^\s,]+)\s*,\s*([^\s,)]+)\s*\)$/;
const SPRING_RE = /^spring\(\s*([^\s,]+)\s*,\s*([^\s,]+)\s*,\s*([^\s,)]+)\s*\)$/;
const HEX_COLOR_RE = /^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i;
const NUMERIC_STRING_RE = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;
const EPSILON = 1e-6;
const MAX_NEWTON_ITERATIONS = 8;
const MAX_BINARY_SEARCH_ITERATIONS = 20;

const CUBIC_PRESETS: Readonly<Record<string, readonly [number, number, number, number]>> = {
  ease: [0.25, 0.1, 0.25, 1],
  'ease-in': [0.42, 0, 1, 1],
  'ease-out': [0, 0, 0.58, 1],
  'ease-in-out': [0.42, 0, 0.58, 1],
};

const SPRING_PRESETS: Readonly<
  Record<string, { readonly stiffness: number; readonly damping: number; readonly mass: number }>
> = {
  'spring-gentle': { stiffness: 100, damping: 20, mass: 1 },
  'spring-bouncy': { stiffness: 400, damping: 10, mass: 1 },
  'spring-stiff': { stiffness: 500, damping: 30, mass: 1 },
};

const PATH_ARGUMENTS_PER_COMMAND: Readonly<Record<string, number>> = {
  A: 7,
  C: 6,
  H: 1,
  L: 2,
  M: 2,
  Q: 4,
  S: 4,
  T: 2,
  V: 1,
  Z: 0,
};

export interface CountingFormat {
  readonly decimalPlaces?: number | undefined;
  readonly thousandsSeparator?: string | undefined;
  readonly prefix?: string | undefined;
  readonly suffix?: string | undefined;
}

export interface InterpolateValueOptions {
  readonly from: unknown;
  readonly to: unknown;
  readonly progress: number;
  readonly easing: string;
  readonly countingFormat?: CountingFormat | undefined;
}

export interface InterpolatePathOptions {
  readonly commands: string | readonly string[];
  readonly from: readonly number[];
  readonly to: readonly number[];
  readonly progress: number;
}

export interface InterpolateKeyframePropertiesOptions {
  readonly fromProperties: Readonly<Record<string, KeyframeValue>>;
  readonly toProperties: Readonly<Record<string, KeyframeValue>>;
  readonly progress: number;
}

interface ParsedHexColor {
  readonly red: number;
  readonly green: number;
  readonly blue: number;
  readonly alpha: number;
  readonly hadExplicitAlpha: boolean;
}

interface OklabColor {
  readonly l: number;
  readonly a: number;
  readonly b: number;
}

function clampUnitInterval(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  if (value <= 0) {
    return 0;
  }

  if (value >= 1) {
    return 1;
  }

  return value;
}

function sampleCubicBezier(t: number, a1: number, a2: number): number {
  const inverse = 1 - t;

  return 3 * inverse * inverse * t * a1 + 3 * inverse * t * t * a2 + t * t * t;
}

function sampleCubicBezierDerivative(t: number, a1: number, a2: number): number {
  return 3 * a1 * ((1 - t) * (1 - t)) + 6 * (a2 - a1) * (1 - t) * t + 3 * (1 - a2) * t * t;
}

function solveCubicBezier(progress: number, x1: number, y1: number, x2: number, y2: number): number {
  let parameter = progress;

  for (let iteration = 0; iteration < MAX_NEWTON_ITERATIONS; iteration += 1) {
    const x = sampleCubicBezier(parameter, x1, x2) - progress;

    if (Math.abs(x) <= EPSILON) {
      return clampUnitInterval(sampleCubicBezier(parameter, y1, y2));
    }

    const derivative = sampleCubicBezierDerivative(parameter, x1, x2);

    if (Math.abs(derivative) <= EPSILON) {
      break;
    }

    parameter = clampUnitInterval(parameter - x / derivative);
  }

  let lower = 0;
  let upper = 1;

  for (let iteration = 0; iteration < MAX_BINARY_SEARCH_ITERATIONS; iteration += 1) {
    parameter = (lower + upper) / 2;

    const sample = sampleCubicBezier(parameter, x1, x2);

    if (Math.abs(sample - progress) <= EPSILON) {
      break;
    }

    if (sample < progress) {
      lower = parameter;
    } else {
      upper = parameter;
    }
  }

  return clampUnitInterval(sampleCubicBezier(parameter, y1, y2));
}

function parseCubicBezier(mode: string): readonly [number, number, number, number] | null {
  const match = CUBIC_BEZIER_RE.exec(mode);

  if (match === null) {
    return null;
  }

  const x1 = Number(match[1]);
  const y1 = Number(match[2]);
  const x2 = Number(match[3]);
  const y2 = Number(match[4]);

  if (!Number.isFinite(x1) || !Number.isFinite(y1) || !Number.isFinite(x2) || !Number.isFinite(y2)) {
    return null;
  }

  if (x1 < 0 || x1 > 1 || x2 < 0 || x2 > 1) {
    return null;
  }

  return [x1, y1, x2, y2];
}

function parseSpring(
  mode: string,
): { readonly stiffness: number; readonly damping: number; readonly mass: number } | null {
  const preset = SPRING_PRESETS[mode];

  if (preset !== undefined) {
    return preset;
  }

  const match = SPRING_RE.exec(mode);

  if (match === null) {
    return null;
  }

  const stiffness = Number(match[1]);
  const damping = Number(match[2]);
  const mass = Number(match[3]);

  if (!Number.isFinite(stiffness) || !Number.isFinite(damping) || !Number.isFinite(mass)) {
    return null;
  }

  if (stiffness <= 0 || damping <= 0 || mass <= 0) {
    return null;
  }

  return { stiffness, damping, mass };
}

function evaluateSpring(progress: number, stiffness: number, damping: number, mass: number): number {
  if (progress <= 0) {
    return 0;
  }

  if (progress >= 1) {
    return 1;
  }

  const normalizedTime = clampUnitInterval(progress);
  const omega0 = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));

  if (zeta >= 1) {
    return 1 - Math.exp(-((damping / (2 * mass)) * normalizedTime * 1.5));
  }

  const envelope = Math.exp(-((damping / (2 * mass)) * normalizedTime));
  const oscillation = Math.cos((omega0 * normalizedTime) / 2);

  return 1 - envelope * oscillation;
}

export function applyEasing(mode: string, progress: number): number {
  const clampedProgress = clampUnitInterval(progress);

  if (mode === 'linear' || mode === 'counting') {
    return clampedProgress;
  }

  if (mode === 'step') {
    return clampedProgress >= 1 ? 1 : 0;
  }

  const preset = CUBIC_PRESETS[mode];

  if (preset !== undefined) {
    return solveCubicBezier(clampedProgress, preset[0], preset[1], preset[2], preset[3]);
  }

  const cubicBezier = parseCubicBezier(mode);

  if (cubicBezier !== null) {
    return solveCubicBezier(clampedProgress, cubicBezier[0], cubicBezier[1], cubicBezier[2], cubicBezier[3]);
  }

  const spring = parseSpring(mode);

  if (spring !== null) {
    return evaluateSpring(clampedProgress, spring.stiffness, spring.damping, spring.mass);
  }

  return clampedProgress;
}

function isNumericString(value: string): boolean {
  return NUMERIC_STRING_RE.test(value.trim());
}

function formatSimpleNumber(value: number): string {
  const rounded = Math.abs(value) < EPSILON ? 0 : value;
  const fixed = rounded.toFixed(6);

  return fixed.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}

function formatCountingNumber(value: number, format?: CountingFormat): string {
  const decimalPlaces = Math.max(0, format?.decimalPlaces ?? 0);
  const thousandsSeparator = format?.thousandsSeparator ?? '';
  const prefix = format?.prefix ?? '';
  const suffix = format?.suffix ?? '';
  const fixed = value.toFixed(decimalPlaces);
  const parts = fixed.split('.');
  const integerPart = parts[0] ?? '0';
  const decimalPart = parts[1];
  const sign = integerPart.startsWith('-') ? '-' : '';
  const unsignedInteger = sign === '' ? integerPart : integerPart.slice(1);
  const groupedInteger =
    thousandsSeparator === '' ? unsignedInteger : unsignedInteger.replace(/\B(?=(\d{3})+(?!\d))/g, thousandsSeparator);
  const fraction = decimalPart === undefined ? '' : `.${decimalPart}`;

  return `${prefix}${sign}${groupedInteger}${fraction}${suffix}`;
}

function interpolateNumber(from: number, to: number, progress: number): number {
  return from + (to - from) * progress;
}

function parseHexColor(value: string): ParsedHexColor | null {
  if (!HEX_COLOR_RE.test(value)) {
    return null;
  }

  const normalized = value.slice(1);

  if (normalized.length === 3 || normalized.length === 4) {
    const [red = '0', green = '0', blue = '0', alpha = 'f'] = normalized.split('');

    return {
      red: Number.parseInt(`${red}${red}`, 16),
      green: Number.parseInt(`${green}${green}`, 16),
      blue: Number.parseInt(`${blue}${blue}`, 16),
      alpha: Number.parseInt(`${alpha}${alpha}`, 16),
      hadExplicitAlpha: normalized.length === 4,
    };
  }

  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  const alpha = normalized.length === 8 ? Number.parseInt(normalized.slice(6, 8), 16) : 255;

  return {
    red,
    green,
    blue,
    alpha,
    hadExplicitAlpha: normalized.length === 8,
  };
}

function srgbChannelToLinear(channel: number): number {
  const normalized = channel / 255;

  if (normalized <= 0.04045) {
    return normalized / 12.92;
  }

  return ((normalized + 0.055) / 1.055) ** 2.4;
}

function linearChannelToSrgb(channel: number): number {
  const clamped = Math.max(0, Math.min(1, channel));

  if (clamped <= 0.0031308) {
    return clamped * 12.92;
  }

  return 1.055 * clamped ** (1 / 2.4) - 0.055;
}

function rgbToOklab(red: number, green: number, blue: number): OklabColor {
  const l = 0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue;
  const m = 0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue;
  const s = 0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue;
  const lRoot = Math.cbrt(l);
  const mRoot = Math.cbrt(m);
  const sRoot = Math.cbrt(s);

  return {
    l: 0.2104542553 * lRoot + 0.793617785 * mRoot - 0.0040720468 * sRoot,
    a: 1.9779984951 * lRoot - 2.428592205 * mRoot + 0.4505937099 * sRoot,
    b: 0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.808675766 * sRoot,
  };
}

function oklabToRgb(color: OklabColor): { readonly red: number; readonly green: number; readonly blue: number } {
  const lRoot = color.l + 0.3963377774 * color.a + 0.2158037573 * color.b;
  const mRoot = color.l - 0.1055613458 * color.a - 0.0638541728 * color.b;
  const sRoot = color.l - 0.0894841775 * color.a - 1.291485548 * color.b;
  const l = lRoot * lRoot * lRoot;
  const m = mRoot * mRoot * mRoot;
  const s = sRoot * sRoot * sRoot;

  return {
    red: 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    green: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    blue: -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  };
}

function toHexChannel(value: number): string {
  const rounded = Math.round(Math.max(0, Math.min(255, value)));

  return rounded.toString(16).padStart(2, '0');
}

function interpolateHexColor(from: string, to: string, progress: number): string {
  const fromColor = parseHexColor(from);
  const toColor = parseHexColor(to);

  if (fromColor === null || toColor === null) {
    return from;
  }

  if (from.toLowerCase() === to.toLowerCase()) {
    return `#${toHexChannel(fromColor.red)}${toHexChannel(fromColor.green)}${toHexChannel(fromColor.blue)}${
      fromColor.hadExplicitAlpha ? toHexChannel(fromColor.alpha) : ''
    }`;
  }

  const easedProgress = clampUnitInterval(progress);
  const fromLab = rgbToOklab(
    srgbChannelToLinear(fromColor.red),
    srgbChannelToLinear(fromColor.green),
    srgbChannelToLinear(fromColor.blue),
  );
  const toLab = rgbToOklab(
    srgbChannelToLinear(toColor.red),
    srgbChannelToLinear(toColor.green),
    srgbChannelToLinear(toColor.blue),
  );
  const interpolatedLab: OklabColor = {
    l: interpolateNumber(fromLab.l, toLab.l, easedProgress),
    a: interpolateNumber(fromLab.a, toLab.a, easedProgress),
    b: interpolateNumber(fromLab.b, toLab.b, easedProgress),
  };
  const interpolatedRgb = oklabToRgb(interpolatedLab);
  const red = linearChannelToSrgb(interpolatedRgb.red) * 255;
  const green = linearChannelToSrgb(interpolatedRgb.green) * 255;
  const blue = linearChannelToSrgb(interpolatedRgb.blue) * 255;
  const alpha = interpolateNumber(fromColor.alpha, toColor.alpha, easedProgress);
  const includeAlpha = fromColor.hadExplicitAlpha || toColor.hadExplicitAlpha || Math.round(alpha) < 255;

  return `#${toHexChannel(red)}${toHexChannel(green)}${toHexChannel(blue)}${includeAlpha ? toHexChannel(alpha) : ''}`;
}

function splitPathCommands(commands: string | readonly string[]): readonly string[] {
  if (typeof commands === 'string') {
    return commands
      .trim()
      .split(/\s+/u)
      .filter((command: string) => command.length > 0);
  }

  return [...commands];
}

function roundPathCoordinate(value: number): string {
  return Number(value.toFixed(2)).toString();
}

export function interpolatePath(options: InterpolatePathOptions): string {
  const commands = splitPathCommands(options.commands);

  if (options.from.length !== options.to.length) {
    throw new Error('Path coordinate arrays must have the same length');
  }

  const easedProgress = clampUnitInterval(options.progress);
  const interpolatedCoordinates = options.from.map((coordinate, index) => {
    const target = options.to[index];

    return roundPathCoordinate(interpolateNumber(coordinate, target ?? coordinate, easedProgress));
  });
  const parts: string[] = [];
  let coordinateIndex = 0;

  for (const command of commands) {
    const normalizedCommand = command.toUpperCase();
    const argumentCount = PATH_ARGUMENTS_PER_COMMAND[normalizedCommand] ?? 0;

    parts.push(command);

    for (let index = 0; index < argumentCount; index += 1) {
      const coordinate = interpolatedCoordinates[coordinateIndex];

      if (coordinate !== undefined) {
        parts.push(coordinate);
      }

      coordinateIndex += 1;
    }
  }

  return parts.join(' ');
}

function isNumberArray(value: unknown): value is readonly number[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'number');
}

export function interpolateValue(options: InterpolateValueOptions): unknown {
  const easedProgress = applyEasing(options.easing, options.progress);

  if (typeof options.from === 'number' && typeof options.to === 'number') {
    return interpolateNumber(options.from, options.to, easedProgress);
  }

  if (typeof options.from === 'boolean' && typeof options.to === 'boolean') {
    return easedProgress >= 1 ? options.to : options.from;
  }

  if (isNumberArray(options.from) && isNumberArray(options.to)) {
    const targetValues = options.to;

    return options.from.map((item, index) => interpolateNumber(item, targetValues[index] ?? item, easedProgress));
  }

  if (typeof options.from === 'string' && typeof options.to === 'string') {
    if (options.easing === 'counting') {
      if (!isNumericString(options.from) || !isNumericString(options.to)) {
        return easedProgress >= 1 ? options.to : options.from;
      }

      const value = interpolateNumber(Number(options.from), Number(options.to), easedProgress);

      return formatCountingNumber(value, options.countingFormat);
    }

    if (HEX_COLOR_RE.test(options.from) && HEX_COLOR_RE.test(options.to)) {
      return interpolateHexColor(options.from, options.to, easedProgress);
    }

    if (isNumericString(options.from) && isNumericString(options.to)) {
      const value = interpolateNumber(Number(options.from), Number(options.to), easedProgress);

      return formatSimpleNumber(value);
    }

    return easedProgress >= 1 ? options.to : options.from;
  }

  return easedProgress >= 1 ? options.to : options.from;
}

function getCountingFormat(value: KeyframeValue): CountingFormat | undefined {
  if (value.type !== 'string') {
    return undefined;
  }

  return 'countingFormat' in value ? value.countingFormat : undefined;
}

function readKeyframeValue(value: KeyframeValue): unknown {
  return value.value;
}

export function interpolateKeyframeProperties(
  options: InterpolateKeyframePropertiesOptions,
): Readonly<Record<string, unknown>> {
  const keys = new Set<string>([...Object.keys(options.fromProperties), ...Object.keys(options.toProperties)]);
  const result: Record<string, unknown> = {};
  const pathCommands = options.fromProperties['pathCommands'] ?? options.toProperties['pathCommands'];

  for (const key of keys) {
    if (key === 'pathCommands') {
      continue;
    }

    const fromValue = options.fromProperties[key];
    const toValue = options.toProperties[key];

    if (fromValue === undefined) {
      if (options.progress >= 1 && toValue !== undefined) {
        result[key] = readKeyframeValue(toValue);
      }

      continue;
    }

    if (toValue === undefined) {
      result[key] = readKeyframeValue(fromValue);
      continue;
    }

    if (pathCommands?.type === 'string' && fromValue.type === 'tuple' && toValue.type === 'tuple') {
      result[key] = interpolatePath({
        commands: pathCommands.value,
        from: fromValue.value,
        to: toValue.value,
        progress: options.progress,
      });
      continue;
    }

    result[key] = interpolateValue({
      from: readKeyframeValue(fromValue),
      to: readKeyframeValue(toValue),
      progress: options.progress,
      easing: fromValue.easing,
      countingFormat: getCountingFormat(fromValue),
    });
  }

  return result;
}
