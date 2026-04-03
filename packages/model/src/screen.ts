import { z } from 'zod';

// ---------------------------------------------------------------------------
// Constrained enums
// ---------------------------------------------------------------------------

export type AnchorX = 'left' | 'right';
export type AnchorY = 'top' | 'bottom';
export type Visibility = 'onscreen' | 'offscreen';
export type MaskType = 'none' | 'circle' | 'squircle' | 'triangle' | 'star' | 'custom';

// ---------------------------------------------------------------------------
// BroadsetScreenProps interface
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Custom clip-path validator
// ---------------------------------------------------------------------------

/** Accepted CSS clip-path function prefixes. */
const CLIP_PATH_FUNCTIONS = ['polygon(', 'circle(', 'ellipse(', 'inset(', 'path('] as const;

/**
 * Returns true when `value` is a syntactically plausible CSS clip-path value.
 * Empty string is accepted (means "no clip-path").
 */
export function isValidCustomClipPath(value: string): boolean {
  if (value === '') {
    return true;
  }

  const trimmed = value.trim().toLowerCase();

  const startsWithValidFn = CLIP_PATH_FUNCTIONS.some((fn) => trimmed.startsWith(fn));

  if (!startsWithValidFn) {
    return false;
  }

  // Must end with a closing parenthesis
  return trimmed.endsWith(')');
}

// ---------------------------------------------------------------------------
// Zod schema
// ---------------------------------------------------------------------------

export const screenPropsSchema = z
  .object({
    name: z.string(),
    anchorX: z.enum(['left', 'right']),
    anchorY: z.enum(['top', 'bottom']),
    visibility: z.enum(['onscreen', 'offscreen']),
    activeState: z.string().nullable(),
    modifiers: z.array(z.string()),
    locked: z.boolean(),
    maskType: z.enum(['none', 'circle', 'squircle', 'triangle', 'star', 'custom']),
    rotateX: z.number(),
    rotateY: z.number(),
    rotateZ: z.number(),
    translateZ: z.number(),
    clipChildren: z.boolean(),
    customClipPath: z.string(),
  })
  .refine(
    (val) => {
      if (val.maskType === 'custom' && val.customClipPath !== '') {
        return isValidCustomClipPath(val.customClipPath);
      }

      return true;
    },
    { message: 'Invalid CSS clip-path value for custom mask' },
  );

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/** Creates a BroadsetScreenProps object with all documented defaults. */
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
