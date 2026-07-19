import { getEditorElementRectV1, type ProjectEditorStore } from '@broadset/editor';
import type { projectFormatV1 } from '@broadset/model';
import type { PhysicalUnitContextV1 } from '@broadset/renderer';

import { documentValueToCssPixelsV1 } from '../demo-app/v1-canvas-units';

interface V1PathEditingOverlayProps {
  readonly editorStore: ProjectEditorStore;
  readonly element: projectFormatV1.Element;
  readonly panX: number;
  readonly panY: number;
  readonly units: PhysicalUnitContextV1;
  readonly zoom: number;
}

export function V1PathEditingOverlay({
  element,
  panX,
  panY,
  units,
  zoom,
}: V1PathEditingOverlayProps): React.JSX.Element | null {
  if (element.kind !== 'vector' || element.geometryData.kind !== 'path') return null;

  const rect = getEditorElementRectV1(element);

  return (
    <svg
      aria-label="Path editing overlay"
      data-testid="path-editing-overlay"
      height="100%"
      width="100%"
      style={{ inset: 0, pointerEvents: 'none', position: 'absolute', zIndex: 5 }}
    >
      {element.geometryData.path.points.map((point) => (
        <circle
          key={point.id}
          data-testid={`path-handle-anchor-${point.id}`}
          cx={documentValueToCssPixelsV1(rect.x + point.x, units) * zoom + panX}
          cy={documentValueToCssPixelsV1(rect.y + point.y, units) * zoom + panY}
          fill="#ffffff"
          r={5}
          stroke="#2563eb"
          strokeWidth={2}
        />
      ))}
    </svg>
  );
}
