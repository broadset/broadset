export interface SvgSourceColor {
  readonly kind: 'rgb';
  readonly hex: `#${string}`;
  readonly originalColor?: string | undefined;
}

export interface SvgSourceGradientStop {
  readonly color: SvgSourceColor;
  readonly position: number;
}

export interface SvgSourceGradient {
  readonly type: 'linear' | 'radial' | 'conic';
  readonly stops: readonly SvgSourceGradientStop[];
  readonly angle?: number | undefined;
  readonly center?: readonly [number, number] | undefined;
  readonly startAngle?: number | undefined;
}

export type SvgSourceAffineMatrix = readonly [number, number, number, number, number, number];

export interface SvgSourcePatternFill {
  readonly kind: 'pattern';
  readonly assetId: string;
  readonly repeat?: 'repeat' | 'repeat-x' | 'repeat-y' | 'no-repeat' | undefined;
  readonly transform?: SvgSourceAffineMatrix | undefined;
}

export type SvgSourceFilterPrimitive =
  | {
      readonly kind: 'drop-shadow';
      readonly offsetX: number;
      readonly offsetY: number;
      readonly blur: number;
      readonly color: SvgSourceColor;
    }
  | { readonly kind: 'blur'; readonly stdDeviation: number }
  | { readonly kind: 'color-matrix'; readonly matrix: readonly number[] }
  | {
      readonly kind:
        | 'brightness'
        | 'contrast'
        | 'saturate'
        | 'hue-rotate'
        | 'grayscale'
        | 'sepia'
        | 'invert'
        | 'opacity';
      readonly amount: number;
    }
  | { readonly kind: 'custom-svg'; readonly svg: string };

export type SvgSourceFilterStack = readonly SvgSourceFilterPrimitive[];

type SvgSourceFill =
  | string
  | { readonly kind: 'none' }
  | { readonly kind: 'solid'; readonly color: SvgSourceColor }
  | { readonly kind: 'gradient'; readonly gradient: SvgSourceGradient }
  | SvgSourcePatternFill;

export interface SvgSourceStyle {
  readonly opacity?: number | undefined;
  readonly fontFamily?: string | undefined;
  readonly fontSize?: number | undefined;
  readonly fontWeight?: number | string | undefined;
  readonly fontStyle?: 'normal' | 'italic' | 'oblique' | undefined;
  readonly textAlignment?: 'left' | 'center' | 'right' | 'justify' | undefined;
  readonly fill?: SvgSourceFill | undefined;
  readonly backgroundGradient?: SvgSourceGradient | undefined;
  readonly filter?: SvgSourceFilterStack | string | undefined;
  readonly isolation?: 'auto' | 'isolate' | undefined;
  readonly objectFit?: 'fill' | 'contain' | 'cover' | 'none' | 'scale-down' | undefined;
  readonly stroke?: SvgSourceColor | string | undefined;
  readonly strokeWidth?: number | undefined;
  readonly strokeDasharray?: string | undefined;
  readonly strokeDashoffset?: number | undefined;
  readonly strokeLinecap?: 'butt' | 'round' | 'square' | undefined;
  readonly strokeLinejoin?: 'miter' | 'round' | 'bevel' | undefined;
  readonly strokeMiterlimit?: number | undefined;
  readonly strokeOpacity?: number | undefined;
  readonly fillOpacity?: number | undefined;
  readonly fillRule?: 'nonzero' | 'evenodd' | undefined;
  readonly maskType?: 'none' | 'alpha' | 'luminance' | 'custom' | undefined;
  readonly customClipPath?: string | undefined;
  readonly clipChildren?: boolean | undefined;
}

export interface SvgSourceRunProperties {
  readonly style?: Readonly<Record<string, unknown>> | undefined;
}

export interface SvgSourceRun {
  readonly text: string;
  readonly props?: SvgSourceRunProperties | undefined;
}

export interface SvgSourceParagraph {
  readonly runs: readonly SvgSourceRun[];
}

export interface SvgSourceTextBody {
  readonly paragraphs: readonly SvgSourceParagraph[];
}

export function createSvgSourceColor(input: string): SvgSourceColor {
  const value = input.trim();

  if (/^#[0-9A-Fa-f]{3,8}$/u.test(value)) {
    const hex: `#${string}` = `#${value.slice(1).toLowerCase()}`;

    return { kind: 'rgb', hex };
  }

  return value === ''
    ? { kind: 'rgb', hex: '#000000' }
    : { kind: 'rgb', hex: '#000000', originalColor: value };
}

export function createSvgSourceRun(text: string, props?: SvgSourceRunProperties): SvgSourceRun {
  return props === undefined ? { text } : { text, props };
}

export function createSvgSourceParagraph(runs: readonly SvgSourceRun[]): SvgSourceParagraph {
  return { runs };
}

export function createSvgSourceTextBody(paragraphs: readonly SvgSourceParagraph[]): SvgSourceTextBody {
  return { paragraphs };
}

export function svgSourceTextToPlainString(body: SvgSourceTextBody): string {
  return body.paragraphs.map((paragraph) => paragraph.runs.map((run) => run.text).join('')).join('\n');
}

const SVG_PATH_COMMANDS = new Set([
  'M',
  'm',
  'L',
  'l',
  'H',
  'h',
  'V',
  'v',
  'C',
  'c',
  'S',
  's',
  'Q',
  'q',
  'T',
  't',
  'A',
  'a',
  'Z',
  'z',
]);
const NUMERIC_TOKEN = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/u;

export function isSafeSvgPathData(pathData: string): boolean {
  const trimmed = pathData.trim();

  if (trimmed === '') return true;
  if (!trimmed.startsWith('M') && !trimmed.startsWith('m')) return false;

  for (const token of trimmed.split(/[\s,]+/u)) {
    if (token === '' || NUMERIC_TOKEN.test(token)) continue;

    const command = token[0] ?? '';

    if (token.length === 1 && SVG_PATH_COMMANDS.has(command)) continue;
    if (SVG_PATH_COMMANDS.has(command) && NUMERIC_TOKEN.test(token.slice(1))) continue;

    return false;
  }

  return true;
}
