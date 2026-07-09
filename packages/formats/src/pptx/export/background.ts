import type { BroadsetDocument } from '@broadset/model';

import { emitFill } from './primitives';

/**
 * Emit `<p:bg>` from the document's canvas background. Solid and
 * gradient canvases produce native DrawingML fills; transparent canvases
 * produce nothing (the master / theme background shows through).
 */
export function emitSlideBackground(canvas: BroadsetDocument['canvas']): string {
  if (canvas.backgroundMode === 'gradient') {
    const gradient = canvas.backgroundGradient;

    if (gradient === undefined) return '';

    return `<p:bg><p:bgPr>${emitFill({ kind: 'gradient', gradient })}</p:bgPr></p:bg>`;
  }

  if (canvas.backgroundMode !== 'solid') return '';

  const colour = canvas.backgroundColor;

  if (colour === undefined || colour.length === 0) return '';

  const stripped = colour.startsWith('#') ? colour.slice(1) : colour;
  const expanded = stripped.length === 3
    ? `${stripped[0] ?? ''}${stripped[0] ?? ''}${stripped[1] ?? ''}${stripped[1] ?? ''}${stripped[2] ?? ''}${stripped[2] ?? ''}`
    : stripped.slice(0, 6);
  const hex = expanded.toUpperCase();

  return `<p:bg><p:bgPr><a:solidFill><a:srgbClr val="${hex}"/></a:solidFill></p:bgPr></p:bg>`;
}