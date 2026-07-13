import type { BlendMode } from 'ag-psd';

/** Default fill rule for PSD vector masks. */
export const DEFAULT_FILL_RULE = 'even-odd' as const;

/** PSD coordinates are normalized to [0, 1] relative to image size. */
export const PSD_COORD_MAX = 1;

/** CSS blend mode -> PSD blend mode mapping. */
const BLEND_MODE_MAP: Readonly<Record<string, BlendMode>> = {
  normal: 'normal',
  multiply: 'multiply',
  screen: 'screen',
  overlay: 'overlay',
  darken: 'darken',
  lighten: 'lighten',
  'color-dodge': 'color dodge',
  'color-burn': 'color burn',
  'hard-light': 'hard light',
  'soft-light': 'soft light',
  difference: 'difference',
  exclusion: 'exclusion',
  hue: 'hue',
  saturation: 'saturation',
  color: 'color',
  luminosity: 'luminosity',
};

/** PSD blend mode -> CSS blend mode mapping. */
export const REVERSE_BLEND_MAP: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(BLEND_MODE_MAP).map(([css, psd]) => [psd, css]),
);
