/** @jest-environment jsdom */

import type { PanelElement } from './panels';

/** Shared fixtures for panel tests. */

export function mockCallOnChange(p: Record<string, unknown>, ...args: readonly unknown[]): void {
  if (typeof p['onChange'] === 'function') {
    (p['onChange'] as (...a: readonly unknown[]) => void)(...args);
  }
}

export function mockStr(v: unknown, fallback = ''): string {
  return (
    typeof v === 'string' ? v
    : typeof v === 'number' ? String(v)
    : fallback
  );
}

export const BASE_ELEMENT: PanelElement = {
  autoSize: 'none',
  backgroundColor: '#ffffff',
  backgroundGradient: '',
  backdropFilter: '',
  booleanOperation: null,
  borderColor: '#000000',
  borderRadius: [0, 0, 0, 0],
  borderStyle: 'solid',
  borderWidth: 0,
  boxShadow: '',
  clipChildren: false,
  clockCountdownTo: undefined,
  clockMode: undefined,
  clockStartValue: undefined,
  clockTargetValue: undefined,
  content: '',
  assetId: null,
  customClipPath: '',
  errorCorrection: 'M',
  fill: '#000000',
  fillOpacity: 1,
  fillRule: 'nonzero',
  filter: '',
  fontColor: '#000000',
  fontFamily: 'Arial',
  fontSize: 32,
  fontStyle: 'normal',
  fontVariationSettings: '',
  fontWeight: 400,
  height: 100,
  id: 'base-id',
  isolation: 'auto',
  locked: false,
  letterSpacing: 0,
  lineHeight: 'normal',
  maskType: 'none',
  mixBlendMode: 'normal',
  name: 'Base Element',
  objectFit: 'cover',
  opacity: 1,
  padding: [10, 10, 10, 10],
  qrBackgroundColor: '#ffffff',
  qrForegroundColor: '#000000',
  rotateX: 0,
  rotateY: 0,
  rotateZ: 0,
  rotation: 0,
  stroke: '#000000',
  strokeDasharray: '',
  strokeDashoffset: 0,
  strokeLinecap: 'butt',
  strokeLinejoin: 'miter',
  strokeOpacity: 1,
  strokeWidth: 1,
  textAlignment: 'left',
  textDecoration: '',
  textShadow: '',
  textStroke: '',
  textTransform: 'none',
  tickerDirection: undefined,
  tickerGap: undefined,
  tickerItems: undefined,
  tickerPaused: undefined,
  tickerSpeed: undefined,
  trimEnd: 1,
  trimOffset: 0,
  trimStart: 0,
  translateZ: 0,
  type: 'rectangle',
  verticalAlignment: 'top',
  videoAutoplay: undefined,
  videoEndTime: undefined,
  videoLoop: undefined,
  videoMuted: undefined,
  videoStartTime: undefined,
  width: 100,
  wordSpacing: 0,
  writingMode: 'horizontal-tb',
  x: 0,
  y: 0,
};

export const TEXT_ELEMENT: PanelElement = {
  ...BASE_ELEMENT,
  content: 'Hello',
  type: 'text',
};

export const IMAGE_ELEMENT: PanelElement = {
  ...BASE_ELEMENT,
  content: 'img-1',
  type: 'image',
};

export const SVG_ELEMENT: PanelElement = {
  ...BASE_ELEMENT,
  content: 'svg-1',
  type: 'svg',
};

export const PATH_ELEMENT: PanelElement = {
  ...BASE_ELEMENT,
  content: 'M0 0 L100 100',
  type: 'path',
};

export const QRCODE_ELEMENT: PanelElement = {
  ...BASE_ELEMENT,
  content: 'https://example.com',
  type: 'qrcode',
};

export const GROUP_ELEMENT: PanelElement = {
  ...BASE_ELEMENT,
  content: 'Group',
  type: 'group',
};

export const VIDEO_ELEMENT: PanelElement = {
  ...BASE_ELEMENT,
  content: 'vid-1',
  type: 'video',
};

export const CLOCK_ELEMENT: PanelElement = {
  ...BASE_ELEMENT,
  content: 'HH:mm',
  type: 'clock',
};

export const TICKER_ELEMENT: PanelElement = {
  ...BASE_ELEMENT,
  content: 'Item 1,Item 2',
  tickerItems: ['Item 1', 'Item 2'],
  type: 'ticker',
};

export const ELLIPSE_ELEMENT: PanelElement = {
  ...BASE_ELEMENT,
  type: 'ellipse',
};

export const RECTANGLE_ELEMENT: PanelElement = {
  ...BASE_ELEMENT,
  type: 'rectangle',
};
