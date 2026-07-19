import { z } from 'zod';

export type PptxThemeSlot =
  | 'accent1'
  | 'accent2'
  | 'accent3'
  | 'accent4'
  | 'accent5'
  | 'accent6'
  | 'lt1'
  | 'lt2'
  | 'dk1'
  | 'dk2'
  | 'hlink'
  | 'folHlink';

export interface PptxSourceColorMods {
  readonly lumMod?: number | undefined;
  readonly lumOff?: number | undefined;
  readonly tint?: number | undefined;
  readonly shade?: number | undefined;
  readonly alpha?: number | undefined;
}

export type PptxSourceColor =
  | {
      readonly kind: 'rgb';
      readonly hex: `#${string}`;
      readonly space?: 'srgb' | 'display-p3' | 'oklch' | 'oklab' | undefined;
      readonly originalColor?: string | undefined;
    }
  | { readonly kind: 'theme'; readonly slot: PptxThemeSlot; readonly mods?: PptxSourceColorMods | undefined };

const themeSlotSchema = z.enum([
  'accent1',
  'accent2',
  'accent3',
  'accent4',
  'accent5',
  'accent6',
  'lt1',
  'lt2',
  'dk1',
  'dk2',
  'hlink',
  'folHlink',
]);
const colorModsSchema: z.ZodType<PptxSourceColorMods> = z.object({
  lumMod: z.number().optional(),
  lumOff: z.number().optional(),
  tint: z.number().optional(),
  shade: z.number().optional(),
  alpha: z.number().optional(),
});

export const pptxSourceColorSchema: z.ZodType<PptxSourceColor> = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('rgb'),
    hex: z.templateLiteral(['#', z.string()]),
    space: z.enum(['srgb', 'display-p3', 'oklch', 'oklab']).optional(),
    originalColor: z.string().optional(),
  }),
  z.object({ kind: z.literal('theme'), slot: themeSlotSchema, mods: colorModsSchema.optional() }),
]);

export interface PptxSourceGradientStop {
  readonly color: PptxSourceColor;
  readonly position: number;
  readonly mods?: PptxSourceColorMods;
}

export interface PptxSourceGradient {
  readonly type: 'linear' | 'radial' | 'conic';
  readonly stops: readonly PptxSourceGradientStop[];
  readonly angle?: number;
  readonly center?: readonly [number, number];
  readonly startAngle?: number;
}

export type PptxSourceFill =
  | { readonly kind: 'none' }
  | { readonly kind: 'solid'; readonly color: PptxSourceColor }
  | { readonly kind: 'gradient'; readonly gradient: PptxSourceGradient };

export interface PptxSourceArrowEnd {
  readonly shape: 'triangle' | 'stealth' | 'diamond' | 'oval' | 'none';
  readonly width?: 'sm' | 'md' | 'lg';
  readonly length?: 'sm' | 'md' | 'lg';
}

export interface PptxSourceStyle {
  readonly opacity: number;
  readonly fontFamily?: string;
  readonly fontSize?: number;
  readonly fontColor?: PptxSourceColor;
  readonly fontWeight?: number;
  readonly fontStyle?: 'normal' | 'italic' | 'oblique';
  readonly textAlignment?: 'left' | 'center' | 'right' | 'justify';
  readonly fill: PptxSourceFill;
  readonly borderWidth?: number;
  readonly borderColor?: PptxSourceColor;
  readonly borderRadius?: readonly [number, number, number, number];
  readonly boxShadow?: string;
  readonly filter?: Readonly<Record<string, unknown>>;
  readonly backdropFilter?: Readonly<Record<string, unknown>>;
  readonly mixBlendMode?:
    | 'normal'
    | 'multiply'
    | 'screen'
    | 'overlay'
    | 'darken'
    | 'lighten'
    | 'color-dodge'
    | 'color-burn'
    | 'hard-light'
    | 'soft-light'
    | 'difference'
    | 'exclusion'
    | 'hue'
    | 'saturation'
    | 'color'
    | 'luminosity';
  readonly isolation?: 'auto' | 'isolate';
  readonly objectFit?: 'fill' | 'contain' | 'cover' | 'none' | 'scale-down';
  readonly stroke?: PptxSourceColor;
  readonly strokeWidth?: number;
  readonly strokeDasharray?: string;
  readonly strokeDashoffset?: number;
  readonly strokeLinecap?: 'butt' | 'round' | 'square';
  readonly strokeLinejoin?: 'miter' | 'round' | 'bevel';
  readonly strokeMiterlimit?: number;
  readonly strokeOpacity?: number;
  readonly strokeHeadEnd?: PptxSourceArrowEnd;
  readonly strokeTailEnd?: PptxSourceArrowEnd;
  readonly fillOpacity?: number;
  readonly fillRule?: 'nonzero' | 'evenodd';
  readonly customClipPath?: string;
}

export interface PptxSourceHyperlink {
  readonly url: string;
  readonly tooltip?: string;
  readonly target?: '_blank' | '_self';
}

export type PptxSourceBullet =
  | { readonly kind: 'none' }
  | { readonly kind: 'char'; readonly char: string; readonly font?: string; readonly color?: PptxSourceColor }
  | { readonly kind: 'auto'; readonly format: string; readonly startAt?: number };

export interface PptxSourceParagraphProps {
  readonly align?: 'start' | 'end' | 'center' | 'justify';
  readonly indent?: number;
  readonly lineSpacing?: number;
  readonly spaceBefore?: number;
  readonly spaceAfter?: number;
  readonly bullet?: PptxSourceBullet;
  readonly level?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
}

export type PptxSourceParagraphAlign = NonNullable<PptxSourceParagraphProps['align']>;

export interface PptxSourceRun {
  readonly text: string;
  readonly props?: {
    readonly style?: Readonly<Record<string, unknown>>;
    readonly lang?: string;
    readonly hyperlink?: PptxSourceHyperlink;
  };
}

export interface PptxSourceParagraph {
  readonly runs: readonly PptxSourceRun[];
  readonly props?: PptxSourceParagraphProps;
}

export interface PptxSourceTextBody {
  readonly paragraphs: readonly PptxSourceParagraph[];
}

export interface PptxSourceCanvas {
  readonly width: number;
  readonly height: number;
  readonly unit: 'px' | 'mm' | 'in';
  readonly dpi: number;
  readonly padding: readonly [number, number, number, number];
  readonly backgroundColor?: string;
  readonly backgroundGradient?: PptxSourceGradient;
  readonly backgroundMode: 'transparent' | 'solid' | 'gradient';
}

export interface PptxSourceElement {
  readonly id: string;
  readonly type: string;
  readonly name: string;
  readonly locked: boolean;
  readonly position: { readonly x: number; readonly y: number };
  readonly width: number;
  readonly height: number;
  readonly rotation: number;
  readonly content: string | PptxSourceTextBody;
  readonly style: PptxSourceStyle;
  readonly parentId: string | null;
  readonly groupId: string | null;
  readonly assetId: string | null;
  readonly dataField: {
    readonly fieldName: string;
    readonly overflow: 'clip' | 'ellipsis' | 'shrink' | 'scroll';
  } | null;
  readonly visibleWhen: string | null;
  readonly repeater: Readonly<Record<string, unknown>> | null;
  readonly typeConfig: Readonly<Record<string, unknown>> | null;
  readonly componentRef: Readonly<Record<string, unknown>> | null;
  readonly autoSize: 'fixed' | 'auto-height' | 'shrink-to-fit';
  readonly textPathElementId: string | null;
  readonly booleanOperation: 'union' | 'subtract' | 'intersect' | 'exclude' | null;
  readonly extensions: Readonly<Record<string, unknown>>;
}

interface PptxSourcePageElement {
  readonly elementId: string;
  readonly visible: boolean;
}

interface PptxSourcePage {
  readonly id: string;
  readonly name: string;
  readonly elements: readonly PptxSourcePageElement[];
  readonly locale: string | null;
  readonly extensions: Readonly<Record<string, unknown>>;
  readonly notes?: string;
}

export interface PptxSourceDocument {
  readonly id: string;
  readonly name: string;
  readonly documentMode: 'screen' | 'print';
  readonly canvas: PptxSourceCanvas;
  readonly elements: readonly PptxSourceElement[];
  readonly pages: readonly PptxSourcePage[];
  readonly animations: readonly never[];
  readonly dataSchema: { readonly fields: readonly never[] };
}

export interface PptxEmbeddedFontAsset {
  readonly id: string;
  readonly kind: 'font';
  readonly name: string;
  readonly mimeType: string;
  readonly source:
    | { readonly type: 'embedded'; readonly dataUri: string }
    | { readonly type: 'url'; readonly url: string }
    | { readonly type: 'file'; readonly path: string };
  readonly format: 'ttf' | 'otf';
  readonly postScriptName: string;
  readonly familyName: string;
  readonly weight?: number;
  readonly italic?: boolean;
  readonly fileSizeBytes?: number;
}

export function createPptxSourceElement(type: string, overrides: Partial<PptxSourceElement> = {}): PptxSourceElement {
  return {
    id: 'pptx-element',
    type,
    name: '',
    locked: false,
    position: { x: 0, y: 0 },
    width: 1,
    height: 1,
    rotation: 0,
    content: '',
    style: { opacity: 1, fill: { kind: 'none' } },
    parentId: null,
    groupId: null,
    assetId: null,
    dataField: null,
    visibleWhen: null,
    repeater: null,
    typeConfig: null,
    componentRef: null,
    autoSize: 'fixed',
    textPathElementId: null,
    booleanOperation: null,
    extensions: {},
    ...overrides,
  };
}

export function createEmptyPptxSourceDocument(): PptxSourceDocument {
  return {
    id: 'pptx-import',
    name: 'Imported from PPTX',
    documentMode: 'screen',
    canvas: {
      width: 254,
      height: 190.5,
      unit: 'mm',
      dpi: 72,
      padding: [0, 0, 0, 0],
      backgroundMode: 'solid',
    },
    elements: [],
    pages: [{ id: 'page-1', name: 'Page 1', elements: [], locale: null, extensions: {} }],
    animations: [],
    dataSchema: { fields: [] },
  };
}

export function createPptxEmbeddedFontAsset(input: Omit<PptxEmbeddedFontAsset, 'kind'>): PptxEmbeddedFontAsset {
  return { ...input, kind: 'font' };
}

export function isPptxSourceTextBody(value: unknown): value is PptxSourceTextBody {
  if (value === null || typeof value !== 'object') return false;

  return Array.isArray(Reflect.get(value, 'paragraphs'));
}

export function createPptxPageElement(element: PptxSourceElement): PptxSourcePageElement {
  return { elementId: element.id, visible: true };
}

export function normalizePptxElementContent(
  _type: string,
  content: string | PptxSourceTextBody,
): string | PptxSourceTextBody {
  return content;
}

export function solidPptxFill(color: PptxSourceColor): PptxSourceFill {
  return { kind: 'solid', color };
}
