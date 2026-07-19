import type { projectFormatV1 } from '@broadset/model';
import { type PhysicalUnitContextV1, spatialValueToCssPixelsV1 } from '@broadset/renderer';

const DEFAULT_CONTEXT: PhysicalUnitContextV1 = { unit: 'px', dpi: 96 };

export function surfaceUnitContextV1(document: projectFormatV1.BroadsetDocumentV1 | undefined): PhysicalUnitContextV1 {
  return document === undefined ? DEFAULT_CONTEXT : { unit: document.surface.unit, dpi: document.surface.dpi };
}

export function documentValueToCssPixelsV1(value: number, context: PhysicalUnitContextV1): number {
  return spatialValueToCssPixelsV1(value, context);
}

export function cssPixelsToDocumentValueV1(value: number, context: PhysicalUnitContextV1): number {
  if (!Number.isFinite(value)) return 0;

  const pixelsPerUnit = spatialValueToCssPixelsV1(1, context);

  return pixelsPerUnit > 0 ? value / pixelsPerUnit : 0;
}
