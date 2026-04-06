import { z } from 'zod';

import { type BroadsetElementStyle, createDefaultStyle, styleSchema } from './style';

export const BUILT_IN_ELEMENT_TYPES = [
  'text',
  'image',
  'svg',
  'path',
  'rectangle',
  'ellipse',
  'qrcode',
  'group',
  'video',
  'clock',
  'ticker',
] as const;

export type BuiltInElementType = (typeof BUILT_IN_ELEMENT_TYPES)[number];

export interface ElementPosition {
  readonly x: number;
  readonly y: number;
}

export interface DataFieldBinding {
  readonly fieldName: string;
  readonly overflow: 'clip' | 'ellipsis' | 'shrink' | 'scroll';
  readonly prefix?: string | undefined;
  readonly suffix?: string | undefined;
  readonly formatPattern?: string | undefined;
}

export interface RepeaterConfig {
  readonly dataArrayField: string;
  readonly direction: 'horizontal' | 'vertical' | 'grid';
  readonly gap: number;
  readonly maxItems?: number | undefined;
}

export interface ComponentRef {
  readonly componentId: string;
  readonly overrides?: Readonly<Record<string, unknown>> | undefined;
}

export interface VideoTypeConfig {
  readonly loop: boolean;
  readonly autoplay: boolean;
  readonly muted: boolean;
  readonly startTimeS: number;
  readonly endTimeS: number | null;
}

export interface ClockTypeConfig {
  readonly mode: 'realtime' | 'countdown' | 'countup' | 'stopwatch';
  readonly startValue: string | number | null;
  readonly targetValue: string | number | null;
  readonly countdownTo: string | null;
}

export interface TickerTypeConfig {
  readonly speed: number;
  readonly direction: 'left' | 'right' | 'up' | 'down';
  readonly gap: number;
  readonly paused: boolean;
}

export type ElementTypeConfig =
  | VideoTypeConfig
  | ClockTypeConfig
  | TickerTypeConfig
  | Readonly<Record<string, unknown>>;

export type AutoSizeMode = 'fixed' | 'auto-height' | 'shrink-to-fit';
export type BooleanOperation = 'union' | 'subtract' | 'intersect' | 'exclude';

export interface BroadsetElement {
  readonly id: string;
  readonly type: string;
  readonly name: string;
  readonly locked: boolean;
  readonly position: ElementPosition;
  readonly width: number;
  readonly height: number;
  readonly rotation: number;
  readonly content: string;
  readonly style: BroadsetElementStyle;
  readonly parentId: string | null;
  readonly groupId: string | null;
  readonly assetId: string | null;
  readonly dataField: DataFieldBinding | null;
  readonly visibleWhen: string | null;
  readonly repeater: RepeaterConfig | null;
  readonly typeConfig: ElementTypeConfig | null;
  readonly componentRef: ComponentRef | null;
  readonly autoSize: AutoSizeMode;
  readonly textPathElementId: string | null;
  readonly booleanOperation: BooleanOperation | null;
  readonly extensions: Readonly<Record<string, unknown>>;
}

export type ElementOverrides = Readonly<
  Partial<Omit<BroadsetElement, 'style' | 'type'>> & {
    readonly style?: Partial<BroadsetElementStyle>;
  }
>;

const ALLOWED_TAGS = new Set(['b', 'i', 'u', 'br', 'span', 'strong', 'em']);
const ALLOWED_INLINE_STYLE_PROPERTIES = new Set([
  'color',
  'background-color',
  'font-weight',
  'font-style',
  'text-decoration',
]);

function sanitizeInlineStyle(styleValue: string): string {
  const declarations = styleValue.split(';');
  const safeDeclarations: string[] = [];

  for (const declaration of declarations) {
    const trimmed = declaration.trim();

    if (trimmed === '') {
      continue;
    }

    const separatorIndex = trimmed.indexOf(':');

    if (separatorIndex <= 0) {
      continue;
    }

    const property = trimmed.slice(0, separatorIndex).trim().toLowerCase();
    const value = trimmed.slice(separatorIndex + 1).trim();

    if (!ALLOWED_INLINE_STYLE_PROPERTIES.has(property) || value === '') {
      continue;
    }

    if (/[<>`]/.test(value) || /expression\s*\(|url\s*\(|javascript:|data:/i.test(value)) {
      continue;
    }

    safeDeclarations.push(`${property}: ${value}`);
  }

  return safeDeclarations.join('; ');
}

export function sanitizeTextContent(html: string): string {
  let result = html.replace(/<(script|style|iframe|object|embed|form)\b[^>]*>[\s\S]*?<\/\1>/gi, '');

  result = result.replace(/<(script|style|iframe|object|embed|form)\b[^>]*\/?>/gi, '');

  return result.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*?)\/?>/g, (match, tagName, attrs) => {
    const lower = String(tagName).toLowerCase();

    if (!ALLOWED_TAGS.has(lower)) {
      return '';
    }

    if (match.startsWith('</')) {
      return `</${lower}>`;
    }

    const styleMatch = /\bstyle\s*=\s*(['"])(.*?)\1/i.exec(String(attrs));
    const safeStyleValue = styleMatch === null ? '' : sanitizeInlineStyle(styleMatch[2] ?? '');
    const escapedStyleValue = safeStyleValue.replace(/"/g, '&quot;');
    const styleAttribute = escapedStyleValue === '' ? '' : ` style="${escapedStyleValue}"`;

    return `<${lower}${styleAttribute}>`;
  });
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

export function isValidSvgPathData(pathData: string): boolean {
  if (pathData === '') {
    return true;
  }

  const trimmed = pathData.trim();

  if (trimmed.length === 0) {
    return true;
  }

  if (trimmed[0] !== 'M' && trimmed[0] !== 'm') {
    return false;
  }

  const tokens = trimmed.split(/[\s,]+/);

  for (const token of tokens) {
    if (token === '') {
      continue;
    }

    if (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(token)) {
      continue;
    }

    const firstCharacter = token[0] ?? '';

    if (token.length === 1 && SVG_PATH_COMMANDS.has(firstCharacter)) {
      continue;
    }

    if (
      token.length > 1 &&
      SVG_PATH_COMMANDS.has(firstCharacter) &&
      /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(token.slice(1))
    ) {
      continue;
    }

    return false;
  }

  return true;
}

const VISIBLE_WHEN_TOKEN_RE =
  /&&|\|\||==|!=|>=|<=|>|<|!|\(|\)|true|false|-?\d+(?:\.\d+)?|'[^']*'|[a-zA-Z_][a-zA-Z0-9_]*/g;

function isVisibleWhenOperand(token: string): boolean {
  return /^(?:true|false|-?\d+(?:\.\d+)?|'[^']*'|[a-zA-Z_][a-zA-Z0-9_]*)$/.test(token);
}

function isValidVisibleWhenExpression(expression: string | null | undefined): boolean {
  if (expression === null || expression === undefined || expression.trim() === '') {
    return true;
  }

  const trimmed = expression.replace(/\s+/g, '');
  const tokens = trimmed.match(VISIBLE_WHEN_TOKEN_RE);

  if (tokens === null || tokens.join('') !== trimmed) {
    return false;
  }

  let depth = 0;
  let expectsOperand = true;

  for (const token of tokens) {
    if (token === '(') {
      if (!expectsOperand) {
        return false;
      }

      depth += 1;
      continue;
    }

    if (token === ')') {
      if (expectsOperand || depth === 0) {
        return false;
      }

      depth -= 1;
      continue;
    }

    if (token === '!') {
      if (!expectsOperand) {
        return false;
      }

      continue;
    }

    if (token === '&&' || token === '||') {
      if (expectsOperand) {
        return false;
      }

      expectsOperand = true;
      continue;
    }

    if (token === '==' || token === '!=' || token === '>=' || token === '<=' || token === '>' || token === '<') {
      if (expectsOperand) {
        return false;
      }

      expectsOperand = true;
      continue;
    }

    if (!isVisibleWhenOperand(token) || !expectsOperand) {
      return false;
    }

    expectsOperand = false;
  }

  return depth === 0 && !expectsOperand;
}

function isLikelyUrlLikeContent(value: string): boolean {
  if (value === '') {
    return true;
  }

  if (/^(https?:\/\/|data:|\.\/|\.\.\/|\/)/.test(value)) {
    return true;
  }

  return !/\s/.test(value);
}

function isTickerContent(value: string): boolean {
  if (value === '') {
    return true;
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    return Array.isArray(parsed) && parsed.every((item) => typeof item === 'string');
  } catch {
    return false;
  }
}

function defaultTypeConfig(type: string): ElementTypeConfig | null {
  switch (type) {
    case 'video':
      return {
        loop: false,
        autoplay: true,
        muted: true,
        startTimeS: 0,
        endTimeS: null,
      };
    case 'clock':
      return {
        mode: 'realtime',
        startValue: null,
        targetValue: null,
        countdownTo: null,
      };
    case 'ticker':
      return {
        speed: 60,
        direction: 'left',
        gap: 40,
        paused: false,
      };
    default:
      return null;
  }
}

function defaultContent(type: string): string {
  switch (type) {
    case 'qrcode':
      return 'https://example.com';
    case 'clock':
      return 'HH:mm:ss';
    case 'ticker':
      return '[]';
    default:
      return '';
  }
}

const dataFieldSchema = z.object({
  fieldName: z.string().min(1),
  overflow: z.enum(['clip', 'ellipsis', 'shrink', 'scroll']),
  prefix: z.string().optional(),
  suffix: z.string().optional(),
  formatPattern: z.string().optional(),
});

const repeaterSchema = z.object({
  dataArrayField: z.string().min(1),
  direction: z.enum(['horizontal', 'vertical', 'grid']),
  gap: z.number().nonnegative(),
  maxItems: z.number().int().positive().optional(),
});

const componentRefSchema = z.object({
  componentId: z.string().min(1),
  overrides: z.record(z.string(), z.unknown()).optional(),
});

const videoTypeConfigSchema = z.object({
  loop: z.boolean(),
  autoplay: z.boolean(),
  muted: z.boolean(),
  startTimeS: z.number().nonnegative(),
  endTimeS: z.number().nonnegative().nullable(),
});

const clockTypeConfigSchema = z.object({
  mode: z.enum(['realtime', 'countdown', 'countup', 'stopwatch']),
  startValue: z.union([z.string(), z.number()]).nullable().optional(),
  targetValue: z.union([z.string(), z.number()]).nullable().optional(),
  countdownTo: z.string().nullable().optional(),
});

const tickerTypeConfigSchema = z.object({
  speed: z.number().positive().max(2000),
  direction: z.enum(['left', 'right', 'up', 'down']),
  gap: z.number().nonnegative(),
  paused: z.boolean(),
});

const typeConfigSchema = z
  .union([videoTypeConfigSchema, clockTypeConfigSchema, tickerTypeConfigSchema, z.record(z.string(), z.unknown())])
  .nullable();

export const elementSchema: z.ZodType<BroadsetElement> = z
  .object({
    id: z.string().min(1),
    type: z.string().min(1),
    name: z.string().default(''),
    locked: z.boolean().default(false),
    position: z.object({
      x: z.number(),
      y: z.number(),
    }),
    width: z.number().positive(),
    height: z.number().positive(),
    rotation: z.number(),
    content: z.string().default(''),
    style: z.record(z.string(), z.unknown()).optional(),
    parentId: z.string().nullable().optional(),
    groupId: z.string().nullable().optional(),
    assetId: z.string().nullable().optional(),
    dataField: dataFieldSchema.nullable().optional(),
    visibleWhen: z.string().nullable().optional(),
    repeater: repeaterSchema.nullable().optional(),
    typeConfig: typeConfigSchema.optional(),
    componentRef: componentRefSchema.nullable().optional(),
    autoSize: z.enum(['fixed', 'auto-height', 'shrink-to-fit']).optional(),
    textPathElementId: z.string().nullable().optional(),
    booleanOperation: z.enum(['union', 'subtract', 'intersect', 'exclude']).nullable().optional(),
    extensions: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((value, context) => {
    const normalizedStyleResult = styleSchema.safeParse({
      ...createDefaultStyle(),
      ...(value.style ?? {}),
    });

    if (!normalizedStyleResult.success) {
      for (const issue of normalizedStyleResult.error.issues) {
        context.addIssue({
          ...issue,
          path: ['style', ...issue.path],
        });
      }
    }

    if (!isValidVisibleWhenExpression(value.visibleWhen)) {
      context.addIssue({
        code: 'custom',
        message: 'visibleWhen must be a valid boolean expression',
        path: ['visibleWhen'],
      });
    }

    if ((value.type === 'image' || value.type === 'video') && !isLikelyUrlLikeContent(value.content)) {
      context.addIssue({
        code: 'custom',
        message: 'Image and video content must be a valid URL or path',
        path: ['content'],
      });
    }

    if (value.type === 'path' && value.content !== '' && !isValidSvgPathData(value.content)) {
      context.addIssue({
        code: 'custom',
        message: 'Invalid SVG path data',
        path: ['content'],
      });
    }

    if (value.type === 'qrcode' && value.content.trim() === '') {
      context.addIssue({
        code: 'custom',
        message: 'QR code content must not be empty',
        path: ['content'],
      });
    }

    if (value.type === 'ticker' && !isTickerContent(value.content)) {
      context.addIssue({
        code: 'custom',
        message: 'Ticker content must be a JSON array of strings',
        path: ['content'],
      });
    }
  })
  .transform((value): BroadsetElement => {
    const normalizedStyle = styleSchema.safeParse({
      ...createDefaultStyle(),
      ...(value.style ?? {}),
    });

    return {
      id: value.id,
      type: value.type,
      name: value.name,
      locked: value.locked,
      position: value.position,
      width: value.width,
      height: value.height,
      rotation: value.rotation,
      content: value.type === 'text' ? sanitizeTextContent(value.content) : value.content,
      style: normalizedStyle.success ? normalizedStyle.data : createDefaultStyle(),
      parentId: value.parentId ?? null,
      groupId: value.groupId ?? null,
      assetId: value.assetId ?? null,
      dataField: value.dataField ?? null,
      visibleWhen: value.visibleWhen ?? null,
      repeater: value.repeater ?? null,
      typeConfig: value.typeConfig ?? defaultTypeConfig(value.type),
      componentRef: value.componentRef ?? null,
      autoSize: value.autoSize ?? 'fixed',
      textPathElementId: value.textPathElementId ?? null,
      booleanOperation: value.booleanOperation ?? null,
      extensions: value.extensions ?? {},
    };
  });

export function createDefaultElement(type: string, overrides?: ElementOverrides): BroadsetElement {
  return {
    id: overrides?.id ?? crypto.randomUUID(),
    type,
    name: overrides?.name ?? '',
    locked: overrides?.locked ?? false,
    position: overrides?.position ?? { x: 0, y: 0 },
    width: overrides?.width ?? 100,
    height: overrides?.height ?? 100,
    rotation: overrides?.rotation ?? 0,
    content: overrides?.content ?? defaultContent(type),
    style: styleSchema.parse({
      ...createDefaultStyle(),
      ...(overrides?.style ?? {}),
    }),
    parentId: overrides?.parentId ?? null,
    groupId: overrides?.groupId ?? null,
    assetId: overrides?.assetId ?? null,
    dataField: overrides?.dataField ?? null,
    visibleWhen: overrides?.visibleWhen ?? null,
    repeater: overrides?.repeater ?? null,
    typeConfig: overrides?.typeConfig ?? defaultTypeConfig(type),
    componentRef: overrides?.componentRef ?? null,
    autoSize: overrides?.autoSize ?? 'fixed',
    textPathElementId: overrides?.textPathElementId ?? null,
    booleanOperation: overrides?.booleanOperation ?? null,
    extensions: overrides?.extensions ?? {},
  };
}
