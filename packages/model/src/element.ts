import { z } from 'zod';

import type { BroadsetScreenProps } from './screen';
import { createDefaultScreenProps, screenPropsSchema } from './screen';
import type { BroadsetElementStyle } from './style';
import { styleSchema } from './style';

// ---------------------------------------------------------------------------
// Built-in element type vocabulary
// ---------------------------------------------------------------------------

const BUILT_IN_ELEMENT_TYPES_TUPLE = [
  'text',
  'image',
  'svg',
  'path',
  'rectangle',
  'ellipse',
  'qrcode',
  'group',
] as const;

/** The 8 built-in element types. Custom plugin types are also accepted. */
export const BUILT_IN_ELEMENT_TYPES: readonly string[] = BUILT_IN_ELEMENT_TYPES_TUPLE;

export type BuiltInElementType = (typeof BUILT_IN_ELEMENT_TYPES_TUPLE)[number];

// ---------------------------------------------------------------------------
// Sub-structures
// ---------------------------------------------------------------------------

export interface ElementPosition {
  readonly x: number;
  readonly y: number;
}

// ---------------------------------------------------------------------------
// BroadsetElement
// ---------------------------------------------------------------------------

export interface BroadsetElement {
  readonly id: string;
  readonly type: string;
  readonly position: ElementPosition;
  readonly width: number;
  readonly height: number;
  readonly rotation: number;
  readonly content: string;
  readonly parentId: string | null;
  readonly groupId: string | null;
  readonly screen: BroadsetScreenProps;
  readonly style: BroadsetElementStyle;
}

// ---------------------------------------------------------------------------
// Text content sanitiser (no DOM dependency)
// ---------------------------------------------------------------------------

const ALLOWED_TAGS = new Set(['b', 'i', 'u', 'br', 'span', 'strong', 'em']);

/**
 * Strips disallowed HTML tags and attributes (except `style`) from rich text.
 * Allowed tags: b, i, u, br, span, strong, em.
 * Dangerous block elements (script, style, etc.) have their content removed entirely.
 */
export function sanitizeTextContent(html: string): string {
  // First strip dangerous block elements including their content
  let result = html.replace(/<(script|style|iframe|object|embed|form)\b[^>]*>[\s\S]*?<\/\1>/gi, '');

  // Strip self-closing or unclosed dangerous tags
  result = result.replace(/<(script|style|iframe|object|embed|form)\b[^>]*\/?>/gi, '');

  // Then strip remaining disallowed tags (preserving their text content)
  return result.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*?)\/?>/g, (match, tagName: string, attrs: string) => {
    const lower = tagName.toLowerCase();

    if (!ALLOWED_TAGS.has(lower)) {
      return '';
    }

    // Closing tags carry no attributes
    if (match.startsWith('</')) {
      return `</${lower}>`;
    }

    // Keep only the style attribute
    const styleMatch = /\bstyle\s*=\s*"([^"]*)"/.exec(attrs);
    const styleValue = styleMatch?.[1] ?? '';
    const styleAttr = styleMatch ? ` style="${styleValue}"` : '';

    return `<${lower}${styleAttr}>`;
  });
}

// ---------------------------------------------------------------------------
// SVG path-data validator (lightweight, no DOM)
// ---------------------------------------------------------------------------

/** Valid SVG path command letters. */
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

/**
 * Returns true when `d` is syntactically plausible SVG path data.
 * Empty string is accepted (produces an empty path).
 */
export function isValidSvgPathData(d: string): boolean {
  if (d === '') {
    return true;
  }

  const trimmed = d.trim();

  if (trimmed.length === 0) {
    return true;
  }

  // Must start with M or m
  if (trimmed[0] !== 'M' && trimmed[0] !== 'm') {
    return false;
  }

  // Tokenise: every non-numeric, non-whitespace, non-separator character must
  // be a valid SVG path command letter.
  const tokens = trimmed.split(/[\s,]+/);

  for (const token of tokens) {
    if (token === '') {
      continue;
    }

    // Pure number
    if (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(token)) {
      continue;
    }

    // Single command letter
    if (token.length === 1 && SVG_PATH_COMMANDS.has(token)) {
      continue;
    }

    // Command letter followed immediately by a number (e.g. "M0" or "L-5")
    if (
      token.length > 1 &&
      SVG_PATH_COMMANDS.has(token[0] ?? '') &&
      /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(token.slice(1))
    ) {
      continue;
    }

    return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// Zod schema (validates + sanitises text content via transform)
// ---------------------------------------------------------------------------

const positionSchema = z.object({
  x: z.number(),
  y: z.number(),
});

const baseElementSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  position: positionSchema,
  width: z.number().positive(),
  height: z.number().positive(),
  rotation: z.number(),
  content: z.string(),
  parentId: z.string().nullable(),
  groupId: z.string().nullable(),
  screen: screenPropsSchema,
  style: styleSchema,
});

/**
 * Full element Zod schema.
 * - Sanitises text content (strips disallowed tags).
 * - Rejects path elements with invalid SVG d data.
 * - Rejects qrcode elements with empty content.
 */
export const elementSchema = baseElementSchema
  .transform((val) => {
    if (val.type === 'text') {
      return { ...val, content: sanitizeTextContent(val.content) };
    }

    return val;
  })
  .refine(
    (val) => {
      if (val.type === 'path' && val.content !== '') {
        return isValidSvgPathData(val.content);
      }

      return true;
    },
    { message: 'Invalid SVG path d attribute' },
  )
  .refine(
    (val) => {
      if (val.type === 'qrcode') {
        return val.content.length > 0;
      }

      return true;
    },
    { message: 'QR code content must not be empty' },
  );

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/** Overrides accepted by createDefaultElement. */
export interface ElementOverrides {
  readonly id?: string;
  readonly position?: ElementPosition;
  readonly width?: number;
  readonly height?: number;
  readonly rotation?: number;
  readonly content?: string;
  readonly parentId?: string | null;
  readonly groupId?: string | null;
}

/**
 * Creates a new BroadsetElement with deterministic defaults.
 * Screen and style defaults match the spec in element.md.
 */
export function createDefaultElement(type: string, overrides?: ElementOverrides): BroadsetElement {
  return {
    id: overrides?.id ?? crypto.randomUUID(),
    type,
    position: overrides?.position ?? { x: 0, y: 0 },
    width: overrides?.width ?? 100,
    height: overrides?.height ?? 100,
    rotation: overrides?.rotation ?? 0,
    content: overrides?.content ?? (type === 'qrcode' ? 'https://example.com' : ''),
    parentId: overrides?.parentId ?? null,
    groupId: overrides?.groupId ?? null,
    screen: createDefaultScreenProps(),
    style: {
      opacity: 1,
    },
  };
}
