import type { CSSProperties, JSX, KeyboardEvent, PointerEvent } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { color } from '../tokens';

const CIRCLE_MAX = 360;
const ARROW_STEP = 1;
const SHIFT_MULTIPLIER = 10;
const ALT_MULTIPLIER = 0.1;

function arrowMultiplier(event: { readonly shiftKey: boolean; readonly altKey: boolean }): number {
  if (event.shiftKey) return SHIFT_MULTIPLIER;
  if (event.altKey) return ALT_MULTIPLIER;

  return 1;
}

export interface AngleDialProps {
  readonly value: number;
  readonly onChange: (next: number) => void;
  readonly ariaLabel: string;
  readonly size?: number | undefined;
  readonly isDisabled?: boolean | undefined;
}

function normalizeAngle(angle: number): number {
  const next = angle % CIRCLE_MAX;

  return next < 0 ? next + CIRCLE_MAX : next;
}

function computeAngleFromPointer(centerX: number, centerY: number, pointerX: number, pointerY: number): number {
  // CSS gradient angles: 0deg points up, increasing clockwise. atan2 gives us
  // the angle from the +X axis counter-clockwise, so we rotate +90° and flip.
  const radians = Math.atan2(pointerY - centerY, pointerX - centerX);
  const degrees = (radians * 180) / Math.PI + 90;

  return normalizeAngle(degrees);
}

function wrapperStyle(size: number, isDisabled: boolean): CSSProperties {
  return {
    alignItems: 'center',
    background: color('field-background'),
    border: `1px solid ${color('border')}`,
    borderRadius: '50%',
    cursor: isDisabled ? 'default' : 'grab',
    display: 'flex',
    flex: '0 0 auto',
    height: size,
    justifyContent: 'center',
    opacity: isDisabled ? 0.55 : 1,
    outline: 'none',
    position: 'relative',
    touchAction: 'none',
    userSelect: 'none',
    width: size,
  };
}

/**
 * Circular direction knob. Converts pointer position relative to the dial
 * center into a CSS-compatible angle (0° = up, increasing clockwise).
 * Drag or click anywhere in the dial to set the angle; arrow keys nudge by
 * 1° with Shift = 10° and Alt = 0.1°.
 */
export function AngleDial({ value, onChange, ariaLabel, size = 56, isDisabled }: AngleDialProps): JSX.Element {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const disabled = isDisabled === true;

  const setAngleFromPointer = useCallback(
    (pointerX: number, pointerY: number): void => {
      const rect = wrapperRef.current?.getBoundingClientRect();

      if (rect === undefined || rect.width <= 0 || rect.height <= 0) {
        return;
      }

      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const next = computeAngleFromPointer(centerX, centerY, pointerX, pointerY);

      onChange(Math.round(next));
    },
    [onChange],
  );

  useEffect(() => {
    if (!isDragging) {
      return;
    }

    const handleMove = (event: MouseEvent): void => {
      event.preventDefault();
      setAngleFromPointer(event.clientX, event.clientY);
    };

    const handleUp = (): void => {
      setIsDragging(false);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);

    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [isDragging, setAngleFromPointer]);

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    if (disabled) {
      return;
    }

    event.preventDefault();
    setIsDragging(true);
    setAngleFromPointer(event.clientX, event.clientY);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (disabled) {
      return;
    }

    if (event.key === 'ArrowUp' || event.key === 'ArrowRight') {
      event.preventDefault();
      onChange(normalizeAngle(value + ARROW_STEP * arrowMultiplier(event)));
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') {
      event.preventDefault();
      onChange(normalizeAngle(value - ARROW_STEP * arrowMultiplier(event)));
    } else if (event.key === 'Home') {
      event.preventDefault();
      onChange(0);
    }
  };

  return (
    <div
      ref={wrapperRef}
      role="slider"
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={CIRCLE_MAX}
      aria-valuenow={Math.round(value)}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : 0}
      style={wrapperStyle(size, disabled)}
      onPointerDown={handlePointerDown}
      onKeyDown={handleKeyDown}
    >
      {/* Fixed tick marks at 0/90/180/270° for orientation. */}
      <span
        aria-hidden="true"
        style={{
          background: color('muted'),
          borderRadius: 1,
          height: 4,
          left: '50%',
          opacity: 0.4,
          position: 'absolute',
          top: 2,
          transform: 'translateX(-50%)',
          width: 2,
        }}
      />
      {/* Rotating indicator: line from center to top edge, rotated to the current angle. */}
      <span
        aria-hidden="true"
        style={{
          background: color('accent'),
          borderRadius: 1,
          height: size / 2 - 4,
          left: '50%',
          position: 'absolute',
          top: 4,
          transform: `translateX(-50%) rotate(${String(value)}deg)`,
          transformOrigin: '50% 100%',
          width: 2,
        }}
      />
      <span
        aria-hidden="true"
        style={{
          background: color('accent'),
          borderRadius: '50%',
          height: 6,
          position: 'absolute',
          width: 6,
        }}
      />
    </div>
  );
}
