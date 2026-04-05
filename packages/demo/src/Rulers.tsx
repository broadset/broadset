import { computeRulerTicks } from '@broadset/editor';
import type { Guide } from '@broadset/model';
import type { JSX, MouseEvent } from 'react';
import { useCallback, useRef } from 'react';

const RULER_SIZE = 24;
const RULER_BG = 'hsl(var(--heroui-default-100))';
const RULER_TICK = 'hsl(var(--heroui-default-500))';
const RULER_TEXT = 'hsl(var(--heroui-default-600))';
const RULER_BORDER = 'hsl(var(--heroui-default-300))';

interface RulersProps {
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly zoom: number;
  readonly panX: number;
  readonly panY: number;
  readonly units: 'px' | 'mm' | 'in';
  readonly originX: number;
  readonly originY: number;
  readonly showRulers: boolean;
  readonly onAddGuide: (guide: Omit<Guide, 'id'>) => void;
}

export function Rulers(props: RulersProps): JSX.Element | null {
  if (!props.showRulers) return null;

  return (
    <>
      <HorizontalRuler {...props} />
      <VerticalRuler {...props} />
      {/* Corner square */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: RULER_SIZE,
          height: RULER_SIZE,
          backgroundColor: RULER_BG,
          borderRight: `1px solid ${RULER_BORDER}`,
          borderBottom: `1px solid ${RULER_BORDER}`,
          zIndex: 8002,
        }}
      />
    </>
  );
}

function HorizontalRuler(props: RulersProps): JSX.Element {
  const dragRef = useRef<{ startY: number } | null>(null);

  const ticks = computeRulerTicks({
    length: props.canvasWidth * props.zoom,
    unit: props.units,
    zoom: props.zoom,
    origin: props.originX,
  });

  const handleMouseDown = useCallback(
    (e: MouseEvent<HTMLDivElement>): void => {
      e.preventDefault();
      dragRef.current = { startY: e.clientY };

      const canvasAreaEl = (e.target as HTMLElement).closest('[data-canvas-area]');

      const onMove = (): void => {
        // Visual feedback: cursor changes during drag
        document.body.style.cursor = 'row-resize';
      };

      const onUp = (ev: globalThis.MouseEvent): void => {
        document.body.style.cursor = '';
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);

        if (dragRef.current === null) return;

        // Calculate position on the canvas in canvas-space units
        if (canvasAreaEl !== null) {
          const areaRect = canvasAreaEl.getBoundingClientRect();
          const centerY = areaRect.height / 2;
          const yOnCanvas = (ev.clientY - areaRect.top - centerY - props.panY) / props.zoom;

          props.onAddGuide({ type: 'h', pos: Math.round(yOnCanvas), locked: false });
        }

        dragRef.current = null;
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [props],
  );

  // Compute the horizontal offset so ticks align with the scaled canvas
  // The canvas is centered in the viewport, so we need to know where it starts
  return (
    <div
      data-testid="ruler-horizontal"
      style={{
        position: 'absolute',
        top: 0,
        left: RULER_SIZE,
        right: 0,
        height: RULER_SIZE,
        backgroundColor: RULER_BG,
        borderBottom: `1px solid ${RULER_BORDER}`,
        overflow: 'hidden',
        cursor: 'row-resize',
        zIndex: 8002,
      }}
      onMouseDown={handleMouseDown}
    >
      <svg width="100%" height={RULER_SIZE} style={{ position: 'absolute', top: 0, left: 0 }}>
        {ticks.map((tick) => (
          <g key={`ht-${tick.label}-${String(tick.position)}`}>
            <line
              x1={tick.position}
              y1={RULER_SIZE - 8}
              x2={tick.position}
              y2={RULER_SIZE}
              stroke={RULER_TICK}
              strokeWidth={1}
            />
            <text x={tick.position + 2} y={RULER_SIZE - 10} fontSize={9} fill={RULER_TEXT}>
              {tick.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function VerticalRuler(props: RulersProps): JSX.Element {
  const dragRef = useRef<{ startX: number } | null>(null);

  const ticks = computeRulerTicks({
    length: props.canvasHeight * props.zoom,
    unit: props.units,
    zoom: props.zoom,
    origin: props.originY,
  });

  const handleMouseDown = useCallback(
    (e: MouseEvent<HTMLDivElement>): void => {
      e.preventDefault();
      dragRef.current = { startX: e.clientX };

      const canvasAreaEl = (e.target as HTMLElement).closest('[data-canvas-area]');

      const onMove = (): void => {
        document.body.style.cursor = 'col-resize';
      };

      const onUp = (ev: globalThis.MouseEvent): void => {
        document.body.style.cursor = '';
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);

        if (dragRef.current === null) return;

        if (canvasAreaEl !== null) {
          const areaRect = canvasAreaEl.getBoundingClientRect();
          const centerX = areaRect.width / 2;
          const xOnCanvas = (ev.clientX - areaRect.left - centerX - props.panX) / props.zoom;

          props.onAddGuide({ type: 'v', pos: Math.round(xOnCanvas), locked: false });
        }

        dragRef.current = null;
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [props],
  );

  return (
    <div
      data-testid="ruler-vertical"
      style={{
        position: 'absolute',
        top: RULER_SIZE,
        left: 0,
        bottom: 0,
        width: RULER_SIZE,
        backgroundColor: RULER_BG,
        borderRight: `1px solid ${RULER_BORDER}`,
        overflow: 'hidden',
        cursor: 'col-resize',
        zIndex: 8002,
      }}
      onMouseDown={handleMouseDown}
    >
      <svg width={RULER_SIZE} height="100%" style={{ position: 'absolute', top: 0, left: 0 }}>
        {ticks.map((tick) => (
          <g key={`vt-${tick.label}-${String(tick.position)}`}>
            <line
              x1={RULER_SIZE - 8}
              y1={tick.position}
              x2={RULER_SIZE}
              y2={tick.position}
              stroke={RULER_TICK}
              strokeWidth={1}
            />
            <text
              x={2}
              y={tick.position - 2}
              fontSize={9}
              fill={RULER_TEXT}
              transform={`rotate(-90, 2, ${String(tick.position - 2)})`}
            >
              {tick.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
