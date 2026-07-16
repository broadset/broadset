import { getEditorElementRectV1 } from '@broadset/editor';
import type { projectFormatV1 } from '@broadset/model';

interface V1ClipPathEditingOverlayProps {
  readonly clipElement: projectFormatV1.Element;
  readonly panX: number;
  readonly panY: number;
  readonly zoom: number;
}

export function V1ClipPathEditingOverlay({
  clipElement,
  panX,
  panY,
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
          cx={(rect.x + point.x) * zoom + panX}
          cy={(rect.y + point.y) * zoom + panY}
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
            cx={(rect.x + (point.x + next.x) / 2) * zoom + panX}
            cy={(rect.y + (point.y + next.y) / 2) * zoom + panY}
            fill="#ddd6fe"
            r={3}
            stroke="#7c3aed"
          />
        );
      })}
    </svg>
  );
}
