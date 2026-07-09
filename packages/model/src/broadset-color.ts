import { z } from 'zod';

import { normalizeColor } from './color';

/**
 * `BroadsetColor` is the canonical color representation across the Broadset
 * model. It is a discriminated union so colors can be either:
 *
 * 1. A concrete RGB value with optional non-sRGB color-space metadata and an
 *    `originalColor` round-trip string (`oklch(...)`, `color(display-p3 ...)`,
 *    etc.) preserved from the source.
 * 2. A theme reference with optional PowerPoint-style modifiers (luminance,
 *    tint/shade, alpha). Theme references resolve through a `ThemePalette` at
 *    render or export time.
 *
 * Per IO-D-05 (`project/implementation/decisions.md`) Broadset never silently
 * downgrades color spaces or modifiers; preflight surfaces unsupported targets.
 */
export type BroadsetColor = RgbBroadsetColor | ThemeBroadsetColor;

/** Concrete RGB color, optionally tagged with the source color space. */
export interface RgbBroadsetColor {
  readonly kind: 'rgb';
  /** Canonical sRGB hex form: `#RRGGBB` or `#RRGGBBAA`, lowercase. */
  readonly hex: `#${string}`;
  /** Source color space when not sRGB. Triggers `originalColor` round-trip. */
  readonly space?: BroadsetColorSpace | undefined;
  /** Untouched CSS color string from the source for lossless round-trip. */
  readonly originalColor?: string | undefined;
}

/** Theme palette reference resolved against a `ThemePalette`. */
export interface ThemeBroadsetColor {
  readonly kind: 'theme';
  readonly slot: ThemeSlot;
  readonly mods?: ColorMods | undefined;
}

/**
 * Theme palette slots mirror PowerPoint / OOXML so PPTX, PSD, PDF, and SVG
 * importers can map `<a:srgbClr>` and `<a:schemeClr>` references without
 * lossy translation.
 */
export type ThemeSlot =
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

export const THEME_SLOTS = [
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
] as const satisfies readonly ThemeSlot[];

/**
 * Color spaces preserved on `RgbBroadsetColor.space`. Distinct from
 * `ColorSpace` in `output-spec.ts` (video color spaces). Named `BroadsetColorSpace`
 * to avoid that collision and to make ownership explicit at call sites.
 */
export type BroadsetColorSpace = 'srgb' | 'display-p3' | 'oklch' | 'oklab';

export const BROADSET_COLOR_SPACES = [
  'srgb',
  'display-p3',
  'oklch',
  'oklab',
] as const satisfies readonly BroadsetColorSpace[];

/**
 * PowerPoint-style color modifiers. Each value is a fraction in `[0, 1]`.
 * Concrete application math is owned by `_shared/color/applyMods` (Phase 2);
 * the model-level `colorToCss` rejects unmodified resolution unless an
 * `applyMods` callback is supplied via `ColorResolutionContext`.
 */
export interface ColorMods {
  /** Luminance multiplier in `[0, 1]`. `0.5` = halve the luminance. */
  readonly lumMod?: number | undefined;
  /** Luminance offset in `[0, 1]` added after `lumMod`. */
  readonly lumOff?: number | undefined;
  /** Blend toward white in `[0, 1]`. */
  readonly tint?: number | undefined;
  /** Blend toward black in `[0, 1]`. */
  readonly shade?: number | undefined;
  /** Alpha multiplier in `[0, 1]`. Replaces the color's alpha channel. */
  readonly alpha?: number | undefined;
}

/** Resolves every `ThemeSlot` to a concrete RGB color. */
export type ThemePalette = Readonly<Record<ThemeSlot, RgbBroadsetColor>>;

/**
 * Optional context supplied to `colorToCss`. When present, a `ThemeBroadsetColor`
 * with `mods` is resolved by calling `applyMods` after looking up the palette
 * slot. Without `applyMods`, theme references with mods throw rather than be
 * silently downgraded (IO-D-05).
 */
export interface ColorResolutionContext {
  readonly palette?: ThemePalette | undefined;
  readonly applyMods?: ((color: RgbBroadsetColor, mods: ColorMods) => RgbBroadsetColor) | undefined;
}

/** Document-level swatch entry for `settings.palette` consumers. */
export interface Swatch {
  readonly id: string;
  readonly name?: string | undefined;
  readonly color: BroadsetColor;
  readonly spot?: SpotInfo | undefined;
}

/** Spot-color metadata preserved through PSD / PDF prepress workflows. */
export interface SpotInfo {
  /** Spot color name (e.g. `PANTONE 185 C`). */
  readonly name: string;
  /** Optional CMYK fallback as `[c, m, y, k]` fractions in `[0, 1]`. */
  readonly cmyk?: readonly [number, number, number, number] | undefined;
}

// ────────────────────────────────────────────────────────────────────────────
// Zod schemas
// ────────────────────────────────────────────────────────────────────────────

const HEX_RGB_OR_RGBA_PATTERN = /^#(?:[0-9a-f]{6}|[0-9a-f]{8})$/i;

export const themeSlotSchema = z.enum(THEME_SLOTS);

export const broadsetColorSpaceSchema = z.enum(BROADSET_COLOR_SPACES);

export const colorModsSchema = z.object({
  lumMod: z.number().min(0).max(1).optional(),
  lumOff: z.number().min(0).max(1).optional(),
  tint: z.number().min(0).max(1).optional(),
  shade: z.number().min(0).max(1).optional(),
  alpha: z.number().min(0).max(1).optional(),
});

const hexColorStringSchema = z
  .string()
  .regex(HEX_RGB_OR_RGBA_PATTERN, 'BroadsetColor.hex must be #RRGGBB or #RRGGBBAA')
  .transform((value) => value.toLowerCase() as `#${string}`);

const rgbBroadsetColorSchema = z.object({
  kind: z.literal('rgb'),
  hex: hexColorStringSchema,
  space: broadsetColorSpaceSchema.optional(),
  originalColor: z.string().optional(),
});

const themeBroadsetColorSchema = z.object({
  kind: z.literal('theme'),
  slot: themeSlotSchema,
  mods: colorModsSchema.optional(),
});

export const broadsetColorSchema = z.discriminatedUnion('kind', [rgbBroadsetColorSchema, themeBroadsetColorSchema]);

const spotInfoSchema = z.object({
  name: z.string().min(1),
  cmyk: z
    .tuple([z.number().min(0).max(1), z.number().min(0).max(1), z.number().min(0).max(1), z.number().min(0).max(1)])
    .optional(),
});

export const swatchSchema = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  color: broadsetColorSchema,
  spot: spotInfoSchema.optional(),
});

// ────────────────────────────────────────────────────────────────────────────
// Factories
// ────────────────────────────────────────────────────────────────────────────

export interface RgbColorOptions {
  readonly space?: BroadsetColorSpace | undefined;
  readonly originalColor?: string | undefined;
}

/**
 * Creates an `RgbBroadsetColor`. The provided hex is normalized through
 * `normalizeColor` so callers may pass any CSS color literal that the legacy
 * `normalizeColor` helper accepts (named colors, `rgb()`, `hsl()`, 3/4/6/8-digit
 * hex). Throws for unparseable input.
 */
export function rgbColor(hex: string, options?: RgbColorOptions): RgbBroadsetColor {
  const normalized = normalizeColor(hex).toLowerCase() as `#${string}`;
  const space = options?.space;
  const originalColor = options?.originalColor;

  return {
    kind: 'rgb',
    hex: normalized,
    ...(space === undefined ? {} : { space }),
    ...(originalColor === undefined ? {} : { originalColor }),
  };
}

/** Creates a `ThemeBroadsetColor` referencing a palette slot. */
export function themeColor(slot: ThemeSlot, mods?: ColorMods): ThemeBroadsetColor {
  return {
    kind: 'theme',
    slot,
    ...(mods === undefined ? {} : { mods }),
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Type guards
// ────────────────────────────────────────────────────────────────────────────

export function isBroadsetColor(value: unknown): value is BroadsetColor {
  return broadsetColorSchema.safeParse(value).success;
}

export function isRgbBroadsetColor(color: BroadsetColor): color is RgbBroadsetColor {
  return color.kind === 'rgb';
}

export function isThemeBroadsetColor(color: BroadsetColor): color is ThemeBroadsetColor {
  return color.kind === 'theme';
}

// ────────────────────────────────────────────────────────────────────────────
// Parser
// ────────────────────────────────────────────────────────────────────────────

const COLOR_SPACE_PREFIX_PATTERNS: ReadonlyArray<readonly [RegExp, BroadsetColorSpace]> = [
  [/^oklch\s*\(/i, 'oklch'],
  [/^oklab\s*\(/i, 'oklab'],
  [/^color\s*\(\s*display-p3\b/i, 'display-p3'],
];

function detectColorSpace(input: string): BroadsetColorSpace | undefined {
  const trimmed = input.trim();

  for (const [pattern, space] of COLOR_SPACE_PREFIX_PATTERNS) {
    if (pattern.test(trimmed)) {
      return space;
    }
  }

  return undefined;
}

/**
 * Parses any CSS color literal into an `RgbBroadsetColor`. CSS color spaces
 * beyond sRGB (oklch, oklab, display-p3) are tagged via `space` and preserved
 * verbatim in `originalColor`; the `hex` field always carries an sRGB
 * approximation. Phase 2's `_shared/color/parseColor` will replace this with
 * culori-backed parsing that extracts the true RGB component.
 *
 * Throws when the input cannot be normalized at all.
 */
export function parseColor(input: string): RgbBroadsetColor {
  const space = detectColorSpace(input);

  if (space !== undefined) {
    return rgbColor(extractFallbackHex(input), { space, originalColor: input.trim() });
  }

  return rgbColor(input);
}

/**
 * Best-effort sRGB fallback hex for a non-sRGB CSS color literal at the model
 * layer. Phase 2's `_shared/color/parseColor` (culori-backed) supersedes this;
 * for now we surface a neutral fallback so `parseColor` never silently throws
 * on a CSS Color Level 4 input — `originalColor` carries the real value for
 * round-trip and the fallback hex is only consumed by sRGB-only sinks.
 */
function extractFallbackHex(input: string): string {
  const trimmed = input.trim();
  const hexMatch = /#(?:[0-9a-f]{3,8})/i.exec(trimmed);

  if (hexMatch !== null) {
    return hexMatch[0];
  }

  return '#000000';
}

// ────────────────────────────────────────────────────────────────────────────
// Resolution
// ────────────────────────────────────────────────────────────────────────────

/**
 * Resolves a `BroadsetColor` to a CSS color string for renderer / export use.
 *
 * - For `RgbBroadsetColor`, returns `originalColor` when present (lossless
 *   non-sRGB round-trip), otherwise the canonical `hex`.
 * - For `ThemeBroadsetColor`, looks up the slot in `ctx.palette` and applies
 *   `mods` via `ctx.applyMods` when both are provided. Throws rather than
 *   silently downgrading when the palette or `applyMods` is missing.
 */
export function colorToCss(color: BroadsetColor, ctx?: ColorResolutionContext): string {
  if (color.kind === 'rgb') {
    return color.originalColor ?? color.hex;
  }

  const palette = ctx?.palette;

  if (palette === undefined) {
    throw new Error(`Cannot resolve theme color "${color.slot}" without a ThemePalette`);
  }

  const resolved = palette[color.slot];
  const mods = color.mods;

  if (mods === undefined) {
    return resolved.originalColor ?? resolved.hex;
  }

  const applyMods = ctx?.applyMods;

  if (applyMods === undefined) {
    throw new Error(
      `Cannot apply ColorMods to theme color "${color.slot}" without ColorResolutionContext.applyMods (provided by @broadset/formats _shared/color)`,
    );
  }

  const modded = applyMods(resolved, mods);

  return modded.originalColor ?? modded.hex;
}
