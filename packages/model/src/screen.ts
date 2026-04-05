import { z } from 'zod';

/** Runtime-only horizontal responsive anchor. */
export type AnchorX = 'left' | 'right';
/** Runtime-only vertical responsive anchor. */
export type AnchorY = 'top' | 'bottom';
/** Runtime-only visibility state used by playback/editor helpers. */
export type Visibility = 'onscreen' | 'offscreen';
/**
 * Legacy compatibility mask vocabulary.
 *
 * The serialized model now stores masking on `style.maskType`, but a small
 * runtime-only helper remains exported for later playback/editor phases.
 */
export type MaskType = 'none' | 'alpha' | 'luminance' | 'custom';

export interface BroadsetScreenProps {
  readonly name: string;
  readonly anchorX: AnchorX;
  readonly anchorY: AnchorY;
  readonly visibility: Visibility;
  readonly activeState: string | null;
  readonly modifiers: readonly string[];
  readonly locked: boolean;
  readonly maskType: MaskType;
  readonly rotateX: number;
  readonly rotateY: number;
  readonly rotateZ: number;
  readonly translateZ: number;
  readonly clipChildren: boolean;
  readonly customClipPath: string;
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

/**
 * Returns true when `value` is a syntactically plausible SVG path `d` string.
 * Empty string is accepted to represent the absence of clipping.
 */
export function isValidCustomClipPath(value: string): boolean {
  if (value === '') {
    return true;
  }

  const trimmed = value.trim();

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

export const screenPropsSchema = z
  .object({
    name: z.string(),
    anchorX: z.enum(['left', 'right']),
    anchorY: z.enum(['top', 'bottom']),
    visibility: z.enum(['onscreen', 'offscreen']),
    activeState: z.string().nullable(),
    modifiers: z.array(z.string()),
    locked: z.boolean(),
    maskType: z.enum(['none', 'alpha', 'luminance', 'custom']),
    rotateX: z.number(),
    rotateY: z.number(),
    rotateZ: z.number(),
    translateZ: z.number(),
    clipChildren: z.boolean(),
    customClipPath: z.string(),
  })
  .refine(
    (value) => {
      if (value.maskType === 'custom') {
        return isValidCustomClipPath(value.customClipPath);
      }

      return true;
    },
    { message: 'Invalid SVG path value for custom mask' },
  );

/** Creates a runtime-only screen helper object with deterministic defaults. */
export function createDefaultScreenProps(): BroadsetScreenProps {
  return {
    name: '',
    anchorX: 'left',
    anchorY: 'top',
    visibility: 'onscreen',
    activeState: null,
    modifiers: [],
    locked: false,
    maskType: 'none',
    rotateX: 0,
    rotateY: 0,
    rotateZ: 0,
    translateZ: 0,
    clipChildren: false,
    customClipPath: '',
  };
}
