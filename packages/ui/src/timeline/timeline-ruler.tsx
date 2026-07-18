import type { JSX, PointerEvent } from 'react';
import { useRef } from 'react';

import { color, font, sp } from '../tokens';
import { formatTickSeconds, railRatioFromTick, rulerLabelTicks, tickFromRailRatio } from './timeline-math';

export interface TimelineRulerProps {
  readonly durationTicks: number;
  readonly ticksPerSecond: number;
  readonly currentTick: number;
  readonly onSeekTick: (tick: number) => void;
  readonly onScrubStart?: () => void;
  readonly onScrubEnd?: () => void;
}

const RAIL_HEIGHT_PX = 24;

/** Exact-tick scrub rail. Pointer widgets are plain elements by repo precedent (not HeroUI chrome). */
export function TimelineRuler(props: TimelineRulerProps): JSX.Element {
  const railRef = useRef<HTMLDivElement | null>(null);
  const isDraggingRef = useRef(false);
  const seekFromPointer = (event: PointerEvent<HTMLDivElement>): void => {
    const rail = railRef.current;

    if (rail === null) return;

    const bounds = rail.getBoundingClientRect();
    const ratio = bounds.width === 0 ? 0 : (event.clientX - bounds.left) / bounds.width;

    props.onSeekTick(tickFromRailRatio(ratio, props.durationTicks));
  };
  const endDrag = (): void => {
    if (!isDraggingRef.current) return;

    isDraggingRef.current = false;
    props.onScrubEnd?.();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: sp('sp-01') }}>
      <div
        ref={railRef}
        data-testid="timeline-ruler-rail"
        style={{
          position: 'relative',
          height: RAIL_HEIGHT_PX,
          background: color('surface-secondary'),
          borderBottom: `1px solid ${color('border')}`,
          cursor: 'ew-resize',
          touchAction: 'none',
        }}
        onPointerDown={(event) => {
          if (event.button !== 0) return;

          isDraggingRef.current = true;
          props.onScrubStart?.();

          if (typeof event.currentTarget.setPointerCapture === 'function') {
            try {
              event.currentTarget.setPointerCapture(event.pointerId);
            } catch {
              /* jsdom */
            }
          }

          seekFromPointer(event);
        }}
        onPointerMove={(event) => {
          if (event.buttons !== 1) return;
          seekFromPointer(event);
        }}
        onPointerCancel={endDrag}
        onPointerUp={endDrag}
      >
        {rulerLabelTicks(props.durationTicks, props.ticksPerSecond).map((tick) => (
          <span
            key={tick}
            style={{
              position: 'absolute',
              left: `${String(railRatioFromTick(tick, props.durationTicks) * 100)}%`,
              transform: 'translateX(-50%)',
              font: font('label'),
              color: color('muted'),
              pointerEvents: 'none',
            }}
          >
            {formatTickSeconds(tick, props.ticksPerSecond)}
          </span>
        ))}
        <div
          data-testid="timeline-playhead"
          style={{
            position: 'absolute',
            top: 0,
            bottom: -2,
            width: 2,
            left: `${String(railRatioFromTick(props.currentTick, props.durationTicks) * 100)}%`,
            background: color('accent'),
            pointerEvents: 'none',
          }}
        />
      </div>
    </div>
  );
}
