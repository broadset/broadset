import type { projectFormatV1 } from '@broadset/model';

import { formatCssNumber } from './paint-css';
import { type PhysicalUnitContextV1, spatialValueToCssPixelsV1 } from './physical-units';

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
export function transformToCss(
  transform: ElementTransform,
  units: PhysicalUnitContextV1 = { unit: 'px', dpi: 96 },
): string {
  const values = transform.matrix.map((value, index) => {
    const isTranslation = transform.kind === 'affine2d' ? index === 4 || index === 5 : index >= 12 && index <= 14;

    return formatCssNumber(isTranslation ? spatialValueToCssPixelsV1(value, units) : value);
  });

  return transform.kind === 'affine2d' ? `matrix(${values.join(', ')})` : `matrix3d(${values.join(', ')})`;
}

/**
 * Map a v1 `ElementGeometry` to the box CSS for a rendered node. This function converts bounds and
 * origin values from the owning surface unit to CSS pixels; `origin` (x, y, z) becomes `transform-origin`.
 */
export function geometryToBoxStyle(
  geometry: ElementGeometry,
  units: PhysicalUnitContextV1 = { unit: 'px', dpi: 96 },
): ElementBoxStyle {
  const [originX, originY, originZ] = geometry.origin;
  const pixels = (value: number): string => `${formatCssNumber(spatialValueToCssPixelsV1(value, units))}px`;

  return {
    width: pixels(geometry.bounds.width),
    height: pixels(geometry.bounds.height),
    transform: transformToCss(geometry.transform, units),
    transformOrigin: `${pixels(originX)} ${pixels(originY)} ${pixels(originZ)}`,
  };
}
