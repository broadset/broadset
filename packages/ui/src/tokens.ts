import type { CSSProperties } from 'react';

/* ── Spacing ─────────────────────────────────────────────── */

const SPACING_SCALE = {
  'sp-01': '0.125rem',
  'sp-02': '0.25rem',
  'sp-03': '0.5rem',
  'sp-04': '0.75rem',
  'sp-05': '1rem',
  'sp-06': '1.5rem',
  'sp-07': '2rem',
  'sp-08': '2.5rem',
  'sp-09': '3rem',
} as const;

/* ── Colors ──────────────────────────────────────────────── */

const COLOR_TOKENS = {
  foreground: 'hsl(210 20% 98%)',
  muted: 'hsl(215 16% 70%)',
  surface: 'rgba(15, 23, 42, 0.92)',
  'surface-secondary': 'rgba(30, 41, 59, 0.9)',
  'surface-tertiary': 'rgba(51, 65, 85, 0.95)',
  border: 'rgba(148, 163, 184, 0.28)',
  accent: 'hsl(217 91% 60%)',
  danger: 'hsl(0 84% 60%)',
  success: 'hsl(142 71% 45%)',
  'field-background': 'rgba(15, 23, 42, 0.72)',
  focus: 'hsl(217 91% 60%)',
  'glass-bg': 'rgba(28, 28, 28, 0.85)',
  'axis-x': 'hsl(4 82% 64%)',
  'axis-y': 'hsl(120 45% 58%)',
  'axis-z': 'hsl(215 85% 66%)',
  'axis-xyz': 'hsl(215 16% 70%)',
} as const;

/* ── Typography ──────────────────────────────────────────── */

const FONT_TOKENS = {
  label: '0.75rem',
  'body-compact': '0.875rem',
  'heading-sm': '0.875rem',
  'heading-md': '1rem',
} as const;

/* ── Radius ──────────────────────────────────────────────── */

const RADIUS_TOKENS = {
  sm: '0.375rem',
  md: '0.5rem',
  lg: '0.75rem',
  xl: '1rem',
  full: '9999px',
} as const;

/* ── Shadows ─────────────────────────────────────────────── */

const SHADOW_TOKENS = {
  sm: '0 1px 3px rgba(0, 0, 0, 0.25)',
  md: '0 2px 8px rgba(0, 0, 0, 0.4)',
  overlay: '0 8px 32px rgba(0, 0, 0, 0.55)',
} as const;

/* ── Blur ────────────────────────────────────────────────── */

const BLUR_TOKENS = {
  sm: '4px',
  md: '8px',
  lg: '12px',
} as const;

/* ── Z-Layers ────────────────────────────────────────────── */

const Z_LAYER_TOKENS = {
  base: 0,
  chrome: 30,
  panel: 100,
  overlay: 8000,
  modal: 9000,
} as const;

/* ── Plane Hierarchy ─────────────────────────────────────── */

const PLANE_TOKENS = {
  base: 'surface',
  raised: 'surface-secondary',
  active: 'surface-tertiary',
  overlay: 'glass-bg',
} as const;

/* ── Public types ────────────────────────────────────────── */

export type SpacingToken = keyof typeof SPACING_SCALE;
export type ColorToken = keyof typeof COLOR_TOKENS;
export type FontToken = keyof typeof FONT_TOKENS;
export type RadiusToken = keyof typeof RADIUS_TOKENS;
export type ShadowToken = keyof typeof SHADOW_TOKENS;
export type BlurToken = keyof typeof BLUR_TOKENS;
export type ZLayerToken = keyof typeof Z_LAYER_TOKENS;
export type PlaneLevel = keyof typeof PLANE_TOKENS;

/* ── Token helpers ───────────────────────────────────────── */

export function sp(token: SpacingToken): string {
  return `var(--${token}, ${SPACING_SCALE[token]})`;
}

export function color(token: ColorToken): string {
  return `var(--${token}, ${COLOR_TOKENS[token]})`;
}

export function font(token: FontToken): string {
  return `var(--font-${token}, ${FONT_TOKENS[token]})`;
}

/** Returns a CSS border-radius value from the radius token system. */
export function radius(token: RadiusToken): string {
  return `var(--radius-${token}, ${RADIUS_TOKENS[token]})`;
}

/** Returns a CSS box-shadow value from the shadow token system. */
export function shadow(token: ShadowToken): string {
  return `var(--shadow-${token}, ${SHADOW_TOKENS[token]})`;
}

/** Returns a CSS blur value from the blur token system. */
export function blur(token: BlurToken): string {
  return `var(--blur-${token}, ${BLUR_TOKENS[token]})`;
}

/** Returns a numeric z-index from the z-layer token system. */
export function zLayer(token: ZLayerToken): number {
  return Z_LAYER_TOKENS[token];
}

/** Returns a CSS color value for the given UI plane hierarchy level. */
export function planeColor(level: PlaneLevel): string {
  return color(PLANE_TOKENS[level]);
}

/* ── Surface style presets ───────────────────────────────── */

/** Glass-morphism style for floating chrome (toolbars, scene strip, popovers). */
export function glassPanelStyle(): CSSProperties {
  return {
    backgroundColor: color('glass-bg'),
    border: `1px solid ${color('border')}`,
    backdropFilter: `blur(${blur('md')})`,
    boxShadow: shadow('md'),
    borderRadius: radius('lg'),
  };
}

/** Opaque matte surface style for sidebar drawers and bottom panels. */
export function mattePanelStyle(): CSSProperties {
  return {
    backgroundColor: color('surface'),
    border: `1px solid ${color('border')}`,
    borderRadius: radius('lg'),
  };
}

/**
 * Elevated overlay style for modals and popovers.
 * Uses opaque `surface` background (not `glass-bg`) for readability of dense content,
 * combined with backdrop blur and the strongest shadow for clear layering separation.
 */
export function overlayPanelStyle(): CSSProperties {
  return {
    backgroundColor: color('surface'),
    border: `1px solid ${color('border')}`,
    backdropFilter: `blur(${blur('md')})`,
    boxShadow: shadow('overlay'),
    borderRadius: radius('xl'),
  };
}
