import { z } from 'zod';

import { isValidSvgPathData, sanitizeTextContent } from './element/content-types';
import { defaultContent, defaultTypeConfig } from './element/defaults';
import { isLikelyUrlLikeContent, isTickerContent, isValidVisibleWhenExpression } from './element/guards';
import { type BroadsetElement, type ElementOverrides } from './element/style-types';
import { refineExtensionsAgainstRegistry } from './extensions-types';
import { createDefaultStyle, styleSchema } from './style';
import { resolveContentAsPlainString, type TextBody, textBodySchema } from './text-body';

export { isValidSvgPathData, sanitizeTextContent } from './element/content-types';
export {
  type AutoSizeMode,
  type BooleanOperation,
  type BroadsetElement,
  BUILT_IN_ELEMENT_TYPES,
  type BuiltInElementType,
  type ClockTypeConfig,
  type ComponentRef,
  type DataFieldBinding,
  type ElementOverrides,
  type ElementPosition,
  type ElementTypeConfig,
  type RepeaterConfig,
  type TickerTypeConfig,
  type VideoTypeConfig,
} from './element/style-types';

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

/**
 * Matches a `<script` tag opening (including `<script>`, `<script type="…">`,
 * `<SCRIPT>`). Linear time — a literal string followed by a word boundary.
 */
const SCRIPT_TAG_RE = /<\s*script\b/i;

/**
 * Matches an HTML event-handler attribute inside an open tag — `<tag on*="…">`
 * or `<tag on*='…'>` or unquoted `<tag on*=handler>`. The `<[^>]*` prefix is
 * bounded by the negative class `[^>]`, so the expression runs in time linear
 * to the input length and avoids the "onion=cheese" false positive because it
 * requires the match to occur inside a tag.
 */
const HTML_EVENT_HANDLER_RE = /<[^>]*\son[a-z]+\s*=/i;

/** Element types whose `content` flows into an HTML / SVG rendering path. */
const HTML_RENDERED_ELEMENT_TYPES: ReadonlySet<string> = new Set(['text', 'svg']);

function containsScriptMarkers(content: string): boolean {
  return SCRIPT_TAG_RE.test(content) || HTML_EVENT_HANDLER_RE.test(content);
}

/**
 * Normalizes element content for persisted output. Text elements run
 * the plain-string form through `sanitizeTextContent`; {@link TextBody}
 * payloads are kept verbatim (run-level sanitization happens at the
 * renderer boundary and on import). Non-text elements pass through
 * unchanged.
 */
function normalizeContent(type: string, content: string | TextBody): string | TextBody {
  if (type === 'text' && typeof content === 'string') {
    return sanitizeTextContent(content);
  }

  return content;
}

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
    content: z.union([z.string(), textBodySchema]).default(''),
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
      opacity: 1,
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

    const contentString = resolveContentAsPlainString(value.content);

    if ((value.type === 'image' || value.type === 'video') && !isLikelyUrlLikeContent(contentString)) {
      context.addIssue({
        code: 'custom',
        message: 'Image and video content must be a valid URL or path',
        path: ['content'],
      });
    }

    if (value.type === 'path' && contentString !== '' && !isValidSvgPathData(contentString)) {
      context.addIssue({
        code: 'custom',
        message: 'Invalid SVG path data',
        path: ['content'],
      });
    }

    if (value.type === 'qrcode' && contentString.trim() === '') {
      context.addIssue({
        code: 'custom',
        message: 'QR code content must not be empty',
        path: ['content'],
      });
    }

    if (value.type === 'ticker' && !isTickerContent(contentString)) {
      context.addIssue({
        code: 'custom',
        message: 'Ticker content must be a JSON array of strings',
        path: ['content'],
      });
    }

    if (HTML_RENDERED_ELEMENT_TYPES.has(value.type) && containsScriptMarkers(contentString)) {
      context.addIssue({
        code: 'custom',
        message: 'content must not contain <script> tags or HTML event-handler attributes',
        path: ['content'],
      });
    }

    refineExtensionsAgainstRegistry(value.extensions, context);
  })
  .transform((value): BroadsetElement => {
    const normalizedStyle = styleSchema.safeParse({
      opacity: 1,
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
      content: normalizeContent(value.type, value.content),
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
      opacity: 1,
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
