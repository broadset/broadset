import type { UnsupportedShapeInfo } from './table';

export function classifyChartGraphicFrame(uri: string | undefined): UnsupportedShapeInfo | null {
  if (uri?.endsWith('/chart')) {
    return { label: 'OOXML chart (<c:chart>)', detail: uri };
  }

  if (uri?.includes('/diagram')) {
    return { label: 'OOXML SmartArt diagram', detail: uri };
  }

  return null;
}
