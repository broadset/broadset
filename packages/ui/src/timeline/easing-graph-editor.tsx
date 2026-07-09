import type { EasingMode } from '@broadset/model';
import { validateCubicBezier } from '@broadset/model';
import { Button } from '@heroui/react';
import { X } from 'lucide-react';
import { type JSX, useCallback, useEffect, useRef, useState } from 'react';

import { color, sp } from '../tokens';

const GRAPH_SIZE = 160;
const HANDLE_RADIUS = 6;

const EASING_GRAPH_PRESETS: readonly EasingMode[] = [
  'linear',
  'ease',
  'ease-in',
  'ease-out',
  'ease-in-out',
  'spring-gentle',
  'spring-bouncy',
  'spring-stiff',
];

const CUBIC_BEZIER_RE = /^cubic-bezier\(\s*([^\s,]+)\s*,\s*([^\s,]+)\s*,\s*([^\s,]+)\s*,\s*([^\s,)]+)\s*\)$/;

interface BezierHandles {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

function parseCubicBezier(easing: string): BezierHandles | null {
  const m = CUBIC_BEZIER_RE.exec(easing);

  if (m === null) {
    return null;
  }

  const x1 = Number(m[1]);
  const y1 = Number(m[2]);
  const x2 = Number(m[3]);
  const y2 = Number(m[4]);

  if (!validateCubicBezier(x1, y1, x2, y2)) {
    return null;
  }

  return { x1, y1, x2, y2 };
}

function isSpringEasing(easing: EasingMode): boolean {
  return (
    easing === 'spring-gentle' ||
    easing === 'spring-bouncy' ||
    easing === 'spring-stiff' ||
    easing.startsWith('spring(')
  );
}

const PRESET_CURVES: Readonly<Record<string, BezierHandles>> = {
  linear: { x1: 0, y1: 0, x2: 1, y2: 1 },
  ease: { x1: 0.25, y1: 0.1, x2: 0.25, y2: 1 },
  'ease-in': { x1: 0.42, y1: 0, x2: 1, y2: 1 },
  'ease-out': { x1: 0, y1: 0, x2: 0.58, y2: 1 },
  'ease-in-out': { x1: 0.42, y1: 0, x2: 0.58, y2: 1 },
};

function getDisplayHandles(easing: EasingMode): BezierHandles | null {
  const preset = PRESET_CURVES[easing];

  if (preset !== undefined) {
    return preset;
  }

  return parseCubicBezier(easing);
}

function buildCurvePath(h: BezierHandles, size: number): string {
  const sx = (v: number): number => v * size;
  const sy = (v: number): number => (1 - v) * size;

  return `M ${String(sx(0))} ${String(sy(0))} C ${String(sx(h.x1))} ${String(sy(h.y1))}, ${String(sx(h.x2))} ${String(sy(h.y2))}, ${String(sx(1))} ${String(sy(1))}`;
}

function evalBezierY(h: BezierHandles, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  const mt = 1 - t;
  const mt2 = mt * mt;
  const mt3 = mt2 * mt;

  return mt3 * 0 + 3 * mt2 * t * h.y1 + 3 * mt * t2 * h.y2 + t3 * 1;
}

export interface EasingGraphEditorProps {
  readonly easing: EasingMode;
  readonly onChange: (easing: EasingMode) => void;
  readonly isPlaying: boolean;
  readonly playbackProgress: number;
  readonly onClose?: (() => void) | undefined;
}

export function EasingGraphEditor(props: EasingGraphEditorProps): JSX.Element {
  const { easing, onChange, isPlaying, playbackProgress, onClose } = props;

  const isCubicBezier = parseCubicBezier(easing) !== null;
  const isSpring = isSpringEasing(easing);
  const handles = getDisplayHandles(easing);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [dragHandle, setDragHandle] = useState<1 | 2 | null>(null);
  const [localHandles, setLocalHandles] = useState<BezierHandles | null>(null);

  useEffect(() => {
    if (onClose === undefined) {
      return;
    }

    function handleClickOutside(e: MouseEvent): void {
      if (rootRef.current !== null && !rootRef.current.contains(e.target as Node)) {
        onClose?.();
      }
    }

    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  const activeHandles = localHandles ?? handles;

  const clientToUnit = useCallback((clientX: number, clientY: number): { readonly ux: number; readonly uy: number } => {
    const svg = svgRef.current;

    if (svg === null) {
      return { ux: 0, uy: 0 };
    }

    const rect = svg.getBoundingClientRect();
    const width = rect.width > 0 ? rect.width : GRAPH_SIZE;
    const height = rect.height > 0 ? rect.height : GRAPH_SIZE;
    const left = Number.isFinite(rect.left) ? rect.left : 0;
    const top = Number.isFinite(rect.top) ? rect.top : 0;
    const rawX = (clientX - left) / width;
    const rawY = 1 - (clientY - top) / height;
    const ux = Number.isFinite(rawX) ? Math.max(0, Math.min(1, rawX)) : 0;
    const uy = Number.isFinite(rawY) ? Math.max(0, Math.min(1, rawY)) : 0;

    return { ux, uy };
  }, []);

  const handlePointerDownHandle = useCallback(
    (which: 1 | 2, e: React.PointerEvent<SVGCircleElement>): void => {
      e.stopPropagation();
      setDragHandle(which);

      if (handles !== null) {
        setLocalHandles(handles);
      }

      const target = e.target;

      if (target instanceof Element && 'setPointerCapture' in target) {
        try {
          (target as Element & { setPointerCapture(id: number): void }).setPointerCapture(e.pointerId);
        } catch {
          // jsdom doesn't support setPointerCapture
        }
      }
    },
    [handles],
  );

  const handlePointerMoveGraph = useCallback(
    (e: React.PointerEvent<SVGSVGElement>): void => {
      if (dragHandle === null || localHandles === null) {
        return;
      }

      const { ux, uy } = clientToUnit(e.clientX, e.clientY);
      const clampedX = Math.max(0, Math.min(1, ux));

      if (dragHandle === 1) {
        setLocalHandles({ ...localHandles, x1: clampedX, y1: uy });
      } else {
        setLocalHandles({ ...localHandles, x2: clampedX, y2: uy });
      }
    },
    [clientToUnit, dragHandle, localHandles],
  );

  const handlePointerUpGraph = useCallback(
    (_e: React.PointerEvent<SVGSVGElement>): void => {
      if (dragHandle === null || localHandles === null) {
        return;
      }

      const h = localHandles;
      const newEasing: EasingMode = `cubic-bezier(${h.x1.toFixed(2)}, ${h.y1.toFixed(2)}, ${h.x2.toFixed(2)}, ${h.y2.toFixed(2)})`;

      onChange(newEasing);
      setDragHandle(null);
      setLocalHandles(null);
    },
    [dragHandle, localHandles, onChange],
  );

  const previewDotVisible = isPlaying && playbackProgress > 0;
  const previewDotY = activeHandles !== null ? evalBezierY(activeHandles, playbackProgress) : playbackProgress;

  return (
    <div
      ref={rootRef}
      data-testid="easing-graph-editor"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: sp('sp-02'),
        padding: sp('sp-03'),
        backgroundColor: color('surface-tertiary'),
        borderRadius: '8px',
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: sp('sp-01') }}>
        {EASING_GRAPH_PRESETS.map((preset) => (
          <Button
            key={preset}
            size="sm"
            variant={easing === preset ? 'primary' : 'ghost'}
            aria-label={preset}
            onPress={() => {
              onChange(preset);
            }}
          >
            {preset}
          </Button>
        ))}
      </div>

      <div data-testid="easing-graph-canvas" style={{ position: 'relative' }}>
        {isSpring ?
          <div
            data-testid="spring-curve-indicator"
            style={{
              width: `${String(GRAPH_SIZE)}px`,
              height: `${String(GRAPH_SIZE)}px`,
              border: `1px solid ${color('border')}`,
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: color('muted'),
              fontSize: '11px',
              backgroundColor: color('surface'),
            }}
          >
            <svg width={GRAPH_SIZE} height={GRAPH_SIZE} viewBox={`0 0 ${String(GRAPH_SIZE)} ${String(GRAPH_SIZE)}`}>
              <path
                d={`M 0 ${String(GRAPH_SIZE)} Q ${String(GRAPH_SIZE * 0.3)} ${String(-GRAPH_SIZE * 0.15)}, ${String(GRAPH_SIZE * 0.5)} ${String(GRAPH_SIZE * 0.05)} T ${String(GRAPH_SIZE)} 0`}
                fill="none"
                stroke={color('accent')}
                strokeWidth="2"
              />
              <line
                x1="0"
                y1={String(GRAPH_SIZE)}
                x2={String(GRAPH_SIZE)}
                y2={String(GRAPH_SIZE)}
                stroke={color('border')}
                strokeDasharray="4"
              />
              <line x1="0" y1="0" x2={String(GRAPH_SIZE)} y2="0" stroke={color('border')} strokeDasharray="4" />
            </svg>
          </div>
        : <svg
            ref={svgRef}
            data-testid="easing-graph-svg"
            width={GRAPH_SIZE}
            height={GRAPH_SIZE}
            viewBox={`0 0 ${String(GRAPH_SIZE)} ${String(GRAPH_SIZE)}`}
            style={{
              border: `1px solid ${color('border')}`,
              borderRadius: '4px',
              backgroundColor: color('surface'),
            }}
            onPointerMove={handlePointerMoveGraph}
            onPointerUp={handlePointerUpGraph}
          >
            <line
              x1="0"
              y1={String(GRAPH_SIZE)}
              x2={String(GRAPH_SIZE)}
              y2={String(GRAPH_SIZE)}
              stroke={color('border')}
              strokeDasharray="4"
            />
            <line x1="0" y1="0" x2={String(GRAPH_SIZE)} y2="0" stroke={color('border')} strokeDasharray="4" />
            <line x1="0" y1="0" x2="0" y2={String(GRAPH_SIZE)} stroke={color('border')} strokeDasharray="4" />
            <line
              x1={String(GRAPH_SIZE)}
              y1="0"
              x2={String(GRAPH_SIZE)}
              y2={String(GRAPH_SIZE)}
              stroke={color('border')}
              strokeDasharray="4"
            />

            {activeHandles !== null ?
              <path
                d={buildCurvePath(activeHandles, GRAPH_SIZE)}
                fill="none"
                stroke={color('accent')}
                strokeWidth="2"
              />
            : null}

            {isCubicBezier && activeHandles !== null ?
              <>
                <line
                  x1="0"
                  y1={String(GRAPH_SIZE)}
                  x2={String(activeHandles.x1 * GRAPH_SIZE)}
                  y2={String((1 - activeHandles.y1) * GRAPH_SIZE)}
                  stroke={color('muted')}
                  strokeWidth="1"
                />
                <circle
                  data-testid="bezier-handle"
                  cx={activeHandles.x1 * GRAPH_SIZE}
                  cy={(1 - activeHandles.y1) * GRAPH_SIZE}
                  r={HANDLE_RADIUS}
                  fill={color('accent')}
                  style={{ cursor: 'grab' }}
                  onPointerDown={(e) => {
                    handlePointerDownHandle(1, e);
                  }}
                />
                <line
                  x1={String(GRAPH_SIZE)}
                  y1="0"
                  x2={String(activeHandles.x2 * GRAPH_SIZE)}
                  y2={String((1 - activeHandles.y2) * GRAPH_SIZE)}
                  stroke={color('muted')}
                  strokeWidth="1"
                />
                <circle
                  data-testid="bezier-handle"
                  cx={activeHandles.x2 * GRAPH_SIZE}
                  cy={(1 - activeHandles.y2) * GRAPH_SIZE}
                  r={HANDLE_RADIUS}
                  fill={color('accent')}
                  style={{ cursor: 'grab' }}
                  onPointerDown={(e) => {
                    handlePointerDownHandle(2, e);
                  }}
                />
              </>
            : null}

            {previewDotVisible ?
              <circle
                data-testid="preview-dot"
                cx={playbackProgress * GRAPH_SIZE}
                cy={(1 - previewDotY) * GRAPH_SIZE}
                r={4}
                fill={color('danger')}
              />
            : null}
          </svg>
        }

        {isSpring && previewDotVisible ?
          <svg
            style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
            width={GRAPH_SIZE}
            height={GRAPH_SIZE}
            viewBox={`0 0 ${String(GRAPH_SIZE)} ${String(GRAPH_SIZE)}`}
          >
            <circle
              data-testid="preview-dot"
              cx={playbackProgress * GRAPH_SIZE}
              cy={GRAPH_SIZE * 0.5}
              r={4}
              fill={color('danger')}
            />
          </svg>
        : null}
      </div>

      {onClose !== undefined ?
        <Button size="sm" variant="ghost" aria-label="Close" onPress={onClose}>
          <X size={14} />
        </Button>
      : null}
    </div>
  );
}
