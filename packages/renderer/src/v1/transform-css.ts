import type { projectFormatV1 } from '@broadset/model';

import { formatCssNumber } from './paint-css';

type ElementTransform = projectFormatV1.ElementTransform;
type ElementGeometry = projectFormatV1.ElementGeometry;

/** The geometry-derived CSS an absolutely-positioned element node needs to size and place itself. */
export interface ElementBoxStyle {
  readonly width: string;
  readonly height: string;
  readonly transform: string;
  readonly transformOrigin: string;
}

/**
 * Map a v1 `ElementTransform` to a CSS `transform` value. The canonical six-value `affine2d` matrix is
 * the CSS `matrix(a, b, c, d, e, f)` layout (identity `[1,0,0,1,0,0]`), and the sixteen-value `matrix3d`
 * is the column-major CSS `matrix3d(...)` layout.
 */
export function transformToCss(transform: ElementTransform): string {
  const values = transform.matrix.map(formatCssNumber).join(', ');

  return transform.kind === 'affine2d' ? `matrix(${values})` : `matrix3d(${values})`;
}

/**
 * Map a v1 `ElementGeometry` to the box CSS for a rendered node. Bounds are emitted as pixels (callers
 * resolve document-unit → device pixels upstream); `origin` (x, y, z) becomes `transform-origin`.
 */
export function geometryToBoxStyle(geometry: ElementGeometry): ElementBoxStyle {
  const [originX, originY, originZ] = geometry.origin;

  return {
    width: `${formatCssNumber(geometry.bounds.width)}px`,
    height: `${formatCssNumber(geometry.bounds.height)}px`,
    transform: transformToCss(geometry.transform),
    transformOrigin: `${formatCssNumber(originX)}px ${formatCssNumber(originY)}px ${formatCssNumber(originZ)}px`,
  };
}
