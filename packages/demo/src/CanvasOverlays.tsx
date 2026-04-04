import { computeGridLines, computeSafetyBoundaries } from '@broadset/editor';
import type { JSX } from 'react';

interface CanvasOverlaysProps {
  readonly showGrid: boolean;
  readonly gridSize: number;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly padding: readonly [number, number, number, number];
  readonly viewMode: 'broadcast' | 'none' | 'print';
}

export function CanvasOverlays(props: CanvasOverlaysProps): JSX.Element {
  return (
    <>
      {/* Grid overlay */}
      {props.showGrid ?
        <svg
          data-testid="grid-overlay"
          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
        >
          {computeGridLines({
            canvasWidth: props.canvasWidth,
            canvasHeight: props.canvasHeight,
            gridSize: props.gridSize,
            zoom: 1,
          }).map((line) =>
            line.axis === 'v' ?
              <line
                key={`v-${String(line.position)}`}
                x1={line.position}
                y1={0}
                x2={line.position}
                y2={props.canvasHeight}
                stroke="rgba(0,0,0,0.1)"
                strokeWidth={0.5}
              />
            : <line
                key={`h-${String(line.position)}`}
                x1={0}
                y1={line.position}
                x2={props.canvasWidth}
                y2={line.position}
                stroke="rgba(0,0,0,0.1)"
                strokeWidth={0.5}
              />,
          )}
        </svg>
      : null}

      {/* Safety boundaries */}
      {computeSafetyBoundaries({
        canvasWidth: props.canvasWidth,
        canvasHeight: props.canvasHeight,
        padding: props.padding,
        viewMode: props.viewMode,
      }).map((rect, idx) => (
        <div
          key={`safety-${String(idx)}`}
          data-testid="safety-boundary"
          style={{
            position: 'absolute',
            left: rect.x,
            top: rect.y,
            width: rect.width,
            height: rect.height,
            backgroundColor: 'rgba(255,0,0,0.08)',
            pointerEvents: 'none',
          }}
        />
      ))}
    </>
  );
}
