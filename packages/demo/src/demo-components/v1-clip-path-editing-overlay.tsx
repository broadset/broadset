import { getEditorElementRectV1 } from '@broadset/editor';
import type { projectFormatV1 } from '@broadset/model';
import type { PhysicalUnitContextV1 } from '@broadset/renderer';

import { documentValueToCssPixelsV1 } from '../demo-app/v1-canvas-units';

interface V1ClipPathEditingOverlayProps {
  readonly clipElement: projectFormatV1.Element;
  readonly panX: number;
  readonly panY: number;
  readonly units: PhysicalUnitContextV1;
  readonly zoom: number;
}

export function V1ClipPathEditingOverlay({
  clipElement,
  panX,
  panY,
  units,
  zoom,
}: V1ClipPathEditingOverlayProps): React.JSX.Element | null {
  if (clipElement.kind !== 'vector' || clipElement.geometryData.kind !== 'path') return null;

  const rect = getEditorElementRectV1(clipElement);
  const points = clipElement.geometryData.path.points;

  return (
    <svg
      aria-label="Clip path editing overlay"
      data-testid="clip-path-editing-overlay"
      height="100%"
      width="100%"
      style={{ inset: 0, pointerEvents: 'none', position: 'absolute', zIndex: 5 }}
    >
      {points.map((point) => (
        <circle
          key={point.id}
          data-testid={`clip-path-handle-${point.id}`}
          cx={documentValueToCssPixelsV1(rect.x + point.x, units) * zoom + panX}
          cy={documentValueToCssPixelsV1(rect.y + point.y, units) * zoom + panY}
          fill="#ffffff"
          r={5}
          stroke="#7c3aed"
          strokeWidth={2}
        />
      ))}
      {points.map((point, index) => {
        const next = points[(index + 1) % points.length];

        if (next === undefined) return null;

        return (
          <circle
            key={`midpoint-${point.id}`}
            data-testid={`clip-path-midpoint-${point.id}`}
            cx={documentValueToCssPixelsV1(rect.x + (point.x + next.x) / 2, units) * zoom + panX}
            cy={documentValueToCssPixelsV1(rect.y + (point.y + next.y) / 2, units) * zoom + panY}
            fill="#ddd6fe"
            r={3}
            stroke="#7c3aed"
          />
        );
      })}
    </svg>
  );
}
