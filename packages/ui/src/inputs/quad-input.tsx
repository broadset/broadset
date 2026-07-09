import type { CSSProperties, JSX, PointerEvent } from 'react';
import { useCallback, useRef } from 'react';

import { color, sp } from '../tokens';
import { LinkToggle, type LinkToggleProps } from './link-toggle';
import { NumField } from './number-inputs';

export type QuadMode = 'TRBL' | 'corners';

export interface QuadInputProps {
  readonly label: string;
  readonly unit?: string | undefined;
  readonly mode: QuadMode;
  readonly value: readonly [number, number, number, number];
  readonly onChange: (next: readonly [number, number, number, number]) => void;
  readonly min?: number | undefined;
  readonly linkToggle?: Omit<LinkToggleProps, 'ariaLabel'> & { readonly ariaLabel?: string | undefined };
  readonly cellAriaLabels?: readonly [string, string, string, string] | undefined;
}

const TRBL_CHIPS = ['T', 'R', 'B', 'L'] as const;
const TRBL_DEFAULT_LABELS = ['Padding top', 'Padding right', 'Padding bottom', 'Padding left'] as const;

const CORNERS_CHIPS = ['TL', 'TR', 'BR', 'BL'] as const;
const CORNERS_DEFAULT_LABELS = [
  'Corner radius top-left',
  'Corner radius top-right',
  'Corner radius bottom-right',
  'Corner radius bottom-left',
] as const;

const SCRUB_STEP_PX = 2;

function scrubMultiplier(modifier: { readonly shift: boolean; readonly alt: boolean }): number {
  if (modifier.shift) return 10;
  if (modifier.alt) return 0.1;

  return 1;
}

function chipStyle(isDisabled: boolean): CSSProperties {
  return {
    alignItems: 'center',
    background: `color-mix(in srgb, ${color('axis-xyz')} 22%, transparent)`,
    color: color('foreground'),
    cursor: isDisabled ? 'default' : 'ew-resize',
    display: 'inline-flex',
    flex: '0 0 auto',
    fontSize: '0.625rem',
    fontWeight: 700,
    height: '100%',
    justifyContent: 'center',
    opacity: isDisabled ? 0.5 : 0.85,
    touchAction: 'none',
    userSelect: 'none',
    width: '1.5rem',
  };
}

function cellFrameStyle(): CSSProperties {
  return {
    alignItems: 'stretch',
    background: color('field-background'),
    border: `1px solid ${color('border')}`,
    borderRadius: '0.25rem',
    display: 'flex',
    height: '1.75rem',
    minWidth: 0,
    overflow: 'hidden',
  };
}

function headerStyle(): CSSProperties {
  return {
    alignItems: 'center',
    color: color('muted'),
    display: 'flex',
    fontSize: '0.6875rem',
    gap: sp('sp-02'),
    letterSpacing: '0.04em',
    minWidth: 0,
    textTransform: 'uppercase',
  };
}

function gridStyle(): CSSProperties {
  return {
    display: 'grid',
    gap: sp('sp-01'),
    gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
    minWidth: 0,
    width: '100%',
  };
}

function ScrubChip({
  chip,
  ariaLabel,
  onScrub,
}: {
  readonly chip: string;
  readonly ariaLabel: string;
  readonly onScrub: (delta: number, modifier: { readonly shift: boolean; readonly alt: boolean }) => void;
}): JSX.Element {
  const scrubOriginRef = useRef<{ readonly x: number; readonly accumulatedPx: number } | null>(null);

  const handlePointerDown = useCallback((event: PointerEvent<HTMLSpanElement>) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    scrubOriginRef.current = { accumulatedPx: 0, x: event.clientX };
  }, []);

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLSpanElement>) => {
      const origin = scrubOriginRef.current;

      if (origin === null) {
        return;
      }

      const nextAccumulated = event.clientX - origin.x;
      const stepsDelta = Math.trunc(nextAccumulated / SCRUB_STEP_PX) - Math.trunc(origin.accumulatedPx / SCRUB_STEP_PX);

      if (stepsDelta !== 0) {
        onScrub(stepsDelta, { alt: event.altKey, shift: event.shiftKey });
      }

      scrubOriginRef.current = { accumulatedPx: nextAccumulated, x: origin.x };
    },
    [onScrub],
  );

  const handlePointerUp = useCallback((event: PointerEvent<HTMLSpanElement>) => {
    scrubOriginRef.current = null;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  return (
    <span
      aria-hidden="true"
      role="presentation"
      data-scrub={ariaLabel}
      style={chipStyle(false)}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {chip}
    </span>
  );
}

/**
 * Four-cell numeric input for padding (T/R/B/L) or corner radius (TL/TR/BR/BL).
 * Shares the chip+compact-input visual language with AxisTriplet.
 */
export function QuadInput({
  label,
  unit,
  mode,
  value,
  onChange,
  min = 0,
  linkToggle,
  cellAriaLabels,
}: QuadInputProps): JSX.Element {
  const chips = mode === 'TRBL' ? TRBL_CHIPS : CORNERS_CHIPS;
  const defaultLabels = mode === 'TRBL' ? TRBL_DEFAULT_LABELS : CORNERS_DEFAULT_LABELS;
  const ariaLabels = cellAriaLabels ?? defaultLabels;
  const isLinked = linkToggle?.isLinked === true;
  const unitSuffix = unit !== undefined && unit.length > 0 ? ` · ${unit}` : '';

  const handleCellChange = useCallback(
    (index: number, nextValue: number) => {
      if (isLinked) {
        onChange([nextValue, nextValue, nextValue, nextValue]);

        return;
      }

      const next: [number, number, number, number] = [...value] as [number, number, number, number];

      next[index] = nextValue;
      onChange(next);
    },
    [isLinked, onChange, value],
  );

  return (
    <div
      role="group"
      aria-label={label}
      style={{ display: 'flex', flexDirection: 'column', gap: sp('sp-01'), minWidth: 0, width: '100%' }}
    >
      <div style={headerStyle()}>
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label}
          {unitSuffix}
        </span>
        {linkToggle !== undefined ?
          <LinkToggle
            isLinked={linkToggle.isLinked}
            onToggle={linkToggle.onToggle}
            ariaLabel={linkToggle.ariaLabel ?? `Link ${label.toLowerCase()}`}
          />
        : null}
      </div>
      <div style={gridStyle()}>
        {quadChips(chips).map((chip, index) => {
          const ariaLabel = ariaLabels[index] ?? `${label} ${chip}`;
          const cellValue = value[index] ?? 0;

          return (
            <div key={chip} style={cellFrameStyle()}>
              <ScrubChip
                chip={chip}
                ariaLabel={ariaLabel}
                onScrub={(delta, modifier) => {
                  const next = Math.max(min, cellValue + delta * scrubMultiplier(modifier));

                  handleCellChange(index, next);
                }}
              />
              <NumField
                compact
                embedded
                label={ariaLabel}
                value={cellValue}
                min={min}
                onChange={(v) => {
                  handleCellChange(index, v);
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function quadChips(chips: readonly string[]): readonly string[] {
  return [...chips];
}
