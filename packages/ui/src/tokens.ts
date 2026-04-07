import type { CSSProperties } from 'react';

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
} as const;

const FONT_TOKENS = {
  label: '0.75rem',
  'body-compact': '0.875rem',
  'heading-sm': '0.875rem',
  'heading-md': '1rem',
} as const;

export type SpacingToken = keyof typeof SPACING_SCALE;
export type ColorToken = keyof typeof COLOR_TOKENS;
export type FontToken = keyof typeof FONT_TOKENS;

export function sp(token: SpacingToken): string {
  return `var(--${token}, ${SPACING_SCALE[token]})`;
}

export function color(token: ColorToken): string {
  return `var(--${token}, ${COLOR_TOKENS[token]})`;
}

export function font(token: FontToken): string {
  return `var(--font-${token}, ${FONT_TOKENS[token]})`;
}

export function glassPanelStyle(): CSSProperties {
  return {
    backgroundColor: color('glass-bg'),
    border: `1px solid ${color('border')}`,
    backdropFilter: 'blur(var(--glass-blur, 8px))',
    boxShadow: 'var(--overlay-shadow, 0 2px 8px rgba(0, 0, 0, 0.4))',
    borderRadius: 'var(--radius-large, 1rem)',
  };
}
