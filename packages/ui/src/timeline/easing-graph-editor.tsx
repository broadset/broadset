import type { projectFormatV1 } from '@broadset/model';
import { Button } from '@heroui/react';
import type { JSX, KeyboardEvent, PointerEvent } from 'react';
import { useEffect, useRef } from 'react';

import { color, font, sp } from '../tokens';

export interface EasingGraphEditorProps {
  readonly interpolation: projectFormatV1.Interpolation;
  /** Presets legal for this track's value type; host filters via interpolationMatchesType. */
  readonly presets: readonly string[];
  /** Normalized [0,1] progress of the playhead through this segment, or null when idle. */
  readonly previewProgress: number | null;
  readonly onCommit: (interpolation: projectFormatV1.Interpolation) => void;
  readonly onClose: () => void;
  readonly onSelectPreset: (preset: string) => void;
}

const GRAPH_SIZE = 200;
const HANDLE_RADIUS = 6;
const SPRING_SAMPLES = 64;
const HANDLE_KEY_STEP = 0.02;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Damped-oscillator sketch used purely as an overshoot/decay visualization (not the runtime solver). */
function springPolyline(spring: Extract<projectFormatV1.Interpolation, { readonly kind: 'spring' }>): string {
  const omega = Math.sqrt(spring.stiffness / Math.max(spring.mass, 1e-6));
  const zeta = spring.damping / (2 * Math.sqrt(spring.stiffness * Math.max(spring.mass, 1e-6)));
  const points: string[] = [];

  for (let index = 0; index <= SPRING_SAMPLES; index += 1) {
    const t = index / SPRING_SAMPLES;
    const decay = Math.exp(-zeta * omega * t * 4);
    const value = 1 - decay * Math.cos(omega * t * 4 * Math.sqrt(Math.max(1 - zeta * zeta, 0.01)));

    points.push(`${String(t * GRAPH_SIZE)},${String((1 - value) * GRAPH_SIZE)}`);
  }

  return points.join(' ');
}

export function EasingGraphEditor(props: EasingGraphEditorProps): JSX.Element {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const { onClose } = props;

  useEffect(() => {
    const handleOutside = (event: MouseEvent): void => {
      if (rootRef.current !== null && event.target instanceof Node && !rootRef.current.contains(event.target)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleOutside);

    return (): void => {
      document.removeEventListener('mousedown', handleOutside);
    };
  }, [onClose]);

  const bezier = props.interpolation.kind === 'cubic-bezier' ? props.interpolation : null;
  const spring = props.interpolation.kind === 'spring' ? props.interpolation : null;

  const commitHandle = (handleIndex: 1 | 2, event: PointerEvent<SVGCircleElement>): void => {
    if (bezier === null || svgRef.current === null) return;

    const bounds = svgRef.current.getBoundingClientRect();
    const x = clamp01((event.clientX - bounds.left) / bounds.width);
    const y = 1 - (event.clientY - bounds.top) / bounds.height; // unclamped: overshoot allowed
    const [x1, y1, x2, y2] = bezier.controlPoints;
    const controlPoints: readonly [number, number, number, number] =
      handleIndex === 1 ? [x, y, x2, y2] : [x1, y1, x, y];

    props.onCommit({ kind: 'cubic-bezier', controlPoints });
  };

  /** Keyboard equivalent of dragging a handle: arrow keys nudge by HANDLE_KEY_STEP and commit via the same onCommit path as pointer drag. */
  const nudgeHandle = (handleIndex: 1 | 2, event: KeyboardEvent<SVGCircleElement>): void => {
    if (bezier === null) return;

    const [x1, y1, x2, y2] = bezier.controlPoints;
    const x = handleIndex === 1 ? x1 : x2;
    const y = handleIndex === 1 ? y1 : y2;
    let nextX = x;
    let nextY = y;

    switch (event.key) {
      case 'ArrowLeft':
        nextX = clamp01(x - HANDLE_KEY_STEP);
        break;
      case 'ArrowRight':
        nextX = clamp01(x + HANDLE_KEY_STEP);
        break;
      case 'ArrowUp':
        nextY = y + HANDLE_KEY_STEP; // unclamped: overshoot allowed, matches drag behavior
        break;
      case 'ArrowDown':
        nextY = y - HANDLE_KEY_STEP; // unclamped: overshoot allowed, matches drag behavior
        break;
      default:
        return;
    }

    event.preventDefault();

    const controlPoints: readonly [number, number, number, number] =
      handleIndex === 1 ? [nextX, nextY, x2, y2] : [x1, y1, nextX, nextY];

    props.onCommit({ kind: 'cubic-bezier', controlPoints });
  };

  const handlePosition = (x: number, y: number): { readonly cx: number; readonly cy: number } => ({
    cx: x * GRAPH_SIZE,
    cy: (1 - y) * GRAPH_SIZE,
  });

  return (
    <div
      ref={rootRef}
      data-testid="easing-graph-editor"
      style={{ display: 'flex', flexDirection: 'column', gap: sp('sp-02'), padding: sp('sp-02') }}
    >
      <svg
        ref={svgRef}
        data-testid="easing-graph-svg"
        height={GRAPH_SIZE}
        style={{ background: color('surface-secondary'), border: `1px solid ${color('border')}`, overflow: 'visible' }}
        viewBox={`0 0 ${String(GRAPH_SIZE)} ${String(GRAPH_SIZE)}`}
        width={GRAPH_SIZE}
      >
        {bezier !== null && (
          <>
            <path
              d={`M 0 ${String(GRAPH_SIZE)} C ${String(bezier.controlPoints[0] * GRAPH_SIZE)} ${String((1 - bezier.controlPoints[1]) * GRAPH_SIZE)}, ${String(bezier.controlPoints[2] * GRAPH_SIZE)} ${String((1 - bezier.controlPoints[3]) * GRAPH_SIZE)}, ${String(GRAPH_SIZE)} 0`}
              fill="none"
              stroke={color('accent')}
              strokeWidth={2}
            />
            {([1, 2] as const).map((handleIndex) => {
              const x = handleIndex === 1 ? bezier.controlPoints[0] : bezier.controlPoints[2];
              const y = handleIndex === 1 ? bezier.controlPoints[1] : bezier.controlPoints[3];
              const position = handlePosition(x, y);

              return (
                <circle
                  key={handleIndex}
                  aria-label={`Ease control point ${String(handleIndex)}`}
                  data-testid={`easing-handle-${String(handleIndex)}`}
                  cx={position.cx}
                  cy={position.cy}
                  fill={color('focus')}
                  r={HANDLE_RADIUS}
                  role="slider"
                  style={{ cursor: 'grab', touchAction: 'none' }}
                  tabIndex={0}
                  onKeyDown={(event) => {
                    nudgeHandle(handleIndex, event);
                  }}
                  onPointerDown={(event) => {
                    if (event.button === 0 && typeof event.currentTarget.setPointerCapture === 'function') {
                      try {
                        event.currentTarget.setPointerCapture(event.pointerId);
                      } catch {
                        /* jsdom does not implement pointer capture on SVG elements */
                      }
                    }
                  }}
                  onPointerMove={(event) => {
                    if (event.buttons === 1) commitHandle(handleIndex, event);
                  }}
                />
              );
            })}
          </>
        )}
        {spring !== null && (
          <polyline fill="none" points={springPolyline(spring)} stroke={color('accent')} strokeWidth={2} />
        )}
        {props.previewProgress !== null && (
          <circle
            data-testid="easing-preview-dot"
            cx={clamp01(props.previewProgress) * GRAPH_SIZE}
            cy={GRAPH_SIZE / 2}
            fill={color('danger')}
            r={4}
          />
        )}
      </svg>
      {spring !== null && (
        <span data-testid="easing-spring-params" style={{ font: font('label'), color: color('muted') }}>
          {`mass ${String(spring.mass)} · stiffness ${String(spring.stiffness)} · damping ${String(spring.damping)}`}
        </span>
      )}
      <div style={{ display: 'flex', gap: sp('sp-01'), flexWrap: 'wrap' }}>
        {props.presets.map((preset) => (
          <Button
            key={preset}
            aria-label={preset}
            size="sm"
            variant="ghost"
            onPress={() => {
              props.onSelectPreset(preset);
            }}
          >
            {preset}
          </Button>
        ))}
      </div>
    </div>
  );
}
