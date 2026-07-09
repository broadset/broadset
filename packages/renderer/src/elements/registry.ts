import type { ElementRendererFactory } from '../core/contracts';
import { createClockRenderer } from './clock';
import { createGroupRenderer } from './group';
import { createImageRenderer } from './image';
import { createPathRenderer } from './path';
import { createQrCodeRenderer } from './qrcode';
import { createShapeRenderer } from './shape';
import { createSvgRenderer } from './svg';
import { createTextRenderer } from './text';
import { createTickerRenderer } from './ticker';
import { createVideoRenderer } from './video';

/**
 * Registry of built-in element renderers keyed by `BroadsetElement['type']`.
 * Plugins registered through `ScreenRendererOptions.plugins` take precedence
 * over this registry; unknown types fall back to the shared fallback renderer
 * (see `elements/fallback.ts`).
 */
export const BUILT_IN_RENDERERS: Readonly<Record<string, ElementRendererFactory>> = {
  text: createTextRenderer,
  image: createImageRenderer,
  svg: createSvgRenderer,
  path: createPathRenderer,
  rectangle: createShapeRenderer,
  ellipse: createShapeRenderer,
  qrcode: createQrCodeRenderer,
  group: createGroupRenderer(),
  video: createVideoRenderer,
  clock: createClockRenderer,
  ticker: createTickerRenderer,
};
