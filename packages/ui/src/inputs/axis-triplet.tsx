import type { CSSProperties, JSX, PointerEvent, ReactNode } from 'react';
import { useCallback, useRef } from 'react';

import { color, sp } from '../tokens';
import { LinkToggle, type LinkToggleProps } from './link-toggle';
import { NumField } from './number-inputs';

export type AxisColor = 'x' | 'y' | 'z' | 'neutral';

export interface AxisCell {
  readonly chip: string;
  readonly color: AxisColor;
  readonly ariaLabel: string;
  readonly value: number;
  readonly onChange: (value: number) => void;
  readonly min?: number | undefined;
  readonly max?: number | undefined;
  readonly step?: number | undefined;
  readonly isDisabled?: boolean | undefined;
  readonly isHidden?: boolean | undefined;
}

export interface AxisTripletProps {
  readonly label: string;
  readonly icon?: ReactNode;
  readonly unit?: string | undefined;
  readonly axes: readonly AxisCell[];
  readonly trailing?: ReactNode;
}

export interface PairInputProps {
  readonly label: string;
  readonly icon?: ReactNode;
  readonly unit?: string | undefined;
  readonly axes: readonly [AxisCell, AxisCell];
  readonly linkToggle?: LinkToggleProps | undefined;
  readonly trailing?: ReactNode;
}

const AXIS_COLOR_TOKEN: Readonly<Record<AxisColor, 'axis-x' | 'axis-y' | 'axis-z' | 'axis-xyz'>> = {
  x: 'axis-x',
  y: 'axis-y',
  z: 'axis-z',
  neutral: 'axis-xyz',
};

const SCRUB_STEP_PX = 2;
const CELL_HEIGHT = '1.75rem';

function chipStyle(axisColor: AxisColor, isDisabled: boolean): CSSProperties {
  return {
    alignItems: 'center',
    background: `color-mix(in srgb, ${color(AXIS_COLOR_TOKEN[axisColor])} 28%, transparent)`,
    color: color(AXIS_COLOR_TOKEN[axisColor]),
    cursor: isDisabled ? 'default' : 'ew-resize',
    display: 'inline-flex',
    flex: '0 0 auto',
    fontSize: '0.6875rem',
    fontWeight: 700,
    height: '100%',
    justifyContent: 'center',
    opacity: isDisabled ? 0.5 : 1,
    touchAction: 'none',
    userSelect: 'none',
    width: '1.125rem',
  };
}

function ScrubChip({
  chip,
  axisColor,
  ariaLabel,
  onScrub,
  isDisabled,
}: {
  readonly chip: string;
  readonly axisColor: AxisColor;
  readonly ariaLabel: string;
  readonly onScrub: (delta: number, modifier: { readonly shift: boolean; readonly alt: boolean }) => void;
  readonly isDisabled: boolean;
}): JSX.Element {
  const scrubOriginRef = useRef<{ readonly x: number; readonly accumulatedPx: number } | null>(null);

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLSpanElement>) => {
      if (isDisabled || event.button !== 0) {
        return;
      }

      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      scrubOriginRef.current = { accumulatedPx: 0, x: event.clientX };
    },
    [isDisabled],
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLSpanElement>) => {
      const origin = scrubOriginRef.current;

      if (origin === null || isDisabled) {
        return;
      }

      const nextAccumulated = event.clientX - origin.x;
      const stepsDelta = Math.trunc(nextAccumulated / SCRUB_STEP_PX) - Math.trunc(origin.accumulatedPx / SCRUB_STEP_PX);

      if (stepsDelta !== 0) {
        onScrub(stepsDelta, { alt: event.altKey, shift: event.shiftKey });
      }

      scrubOriginRef.current = { accumulatedPx: nextAccumulated, x: origin.x };
    },
    [isDisabled, onScrub],
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
      style={chipStyle(axisColor, isDisabled)}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {chip}
    </span>
  );
}

function stepMultiplier(modifier: { readonly shift: boolean; readonly alt: boolean }): number {
  if (modifier.shift) return 10;
  if (modifier.alt) return 0.1;

  return 1;
}

function cellFrameStyle(isDisabled: boolean): CSSProperties {
  return {
    alignItems: 'stretch',
    background: color('field-background'),
    border: `1px solid ${color('border')}`,
    borderRadius: '0.25rem',
    display: 'flex',
    height: CELL_HEIGHT,
    minWidth: 0,
    opacity: isDisabled ? 0.55 : 1,
    overflow: 'hidden',
  };
}

function AxisCellView({ cell }: { readonly cell: AxisCell }): JSX.Element {
  const step = cell.step ?? 1;
  const isDisabled = cell.isDisabled === true;

  const handleScrub = useCallback(
    (delta: number, modifier: { readonly shift: boolean; readonly alt: boolean }) => {
      if (isDisabled) {
        return;
      }

      const multiplier = stepMultiplier(modifier);
      const next = cell.value + delta * step * multiplier;
      const clampMin = cell.min !== undefined ? Math.max(cell.min, next) : next;
      const clamped = cell.max !== undefined ? Math.min(cell.max, clampMin) : clampMin;

      cell.onChange(clamped);
    },
    [cell, isDisabled, step],
  );

  return (
    <div style={cellFrameStyle(isDisabled)}>
      <ScrubChip
        chip={cell.chip}
        axisColor={cell.color}
        ariaLabel={cell.ariaLabel}
        onScrub={handleScrub}
        isDisabled={isDisabled}
      />
      <NumField
        compact
        embedded
        label={cell.ariaLabel}
        value={cell.value}
        onChange={cell.onChange}
        {...(cell.min !== undefined ? { min: cell.min } : {})}
        {...(cell.max !== undefined ? { max: cell.max } : {})}
        step={step}
        {...(isDisabled ? { isDisabled: true } : {})}
      />
    </div>
  );
}

function sectionStyle(): CSSProperties {
  return {
    display: 'flex',
    flexDirection: 'column',
    gap: sp('sp-01'),
    minWidth: 0,
    width: '100%',
  };
}

function sectionHeadStyle(): CSSProperties {
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

function axisGridStyle(cellCount: number): CSSProperties {
  // Single row: all visible axes side by side. Empty placeholders keep the
  // grid stable when an axis is hidden (e.g. Z in print mode).
  const columns = Math.max(1, cellCount);

  return {
    display: 'grid',
    gap: sp('sp-02'),
    gridTemplateColumns: `repeat(${String(columns)}, minmax(0, 1fr))`,
    minWidth: 0,
    width: '100%',
  };
}

function groupAriaLabel(label: string, unit: string | undefined): string {
  return unit !== undefined && unit.length > 0 ? `${label} (${unit})` : label;
}

export function AxisTriplet({ label, icon, unit, axes, trailing }: AxisTripletProps): JSX.Element {
  const groupName = groupAriaLabel(label, unit);
  const unitSuffix = unit !== undefined && unit.length > 0 ? ` · ${unit}` : '';
  const visibleCount = axes.filter((axis) => axis.isHidden !== true).length;

  return (
    <div role="group" aria-label={groupName} style={sectionStyle()}>
      <div style={sectionHeadStyle()}>
        {icon !== undefined ?
          <span aria-hidden="true">{icon}</span>
        : null}
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label}
          {unitSuffix}
        </span>
        {trailing !== undefined ?
          <span style={{ alignItems: 'center', display: 'inline-flex', gap: sp('sp-01') }}>{trailing}</span>
        : null}
      </div>
      <div style={axisGridStyle(visibleCount)}>
        {axes
          .filter((axis) => axis.isHidden !== true)
          .map((axis) => (
            <AxisCellView key={axis.ariaLabel} cell={axis} />
          ))}
      </div>
    </div>
  );
}

export function PairInput({ label, icon, unit, axes, linkToggle, trailing }: PairInputProps): JSX.Element {
  const groupName = groupAriaLabel(label, unit);
  const [first, second] = axes;
  const isLinked = linkToggle?.isLinked === true;
  const hasTrailing = trailing !== undefined || linkToggle !== undefined;
  const unitSuffix = unit !== undefined && unit.length > 0 ? ` · ${unit}` : '';

  const handleFirstChange = (nextValue: number): void => {
    first.onChange(nextValue);

    if (isLinked && first.value !== 0) {
      const ratio = second.value / first.value;

      second.onChange(nextValue * ratio);
    }
  };

  const handleSecondChange = (nextValue: number): void => {
    second.onChange(nextValue);

    if (isLinked && second.value !== 0) {
      const ratio = first.value / second.value;

      first.onChange(nextValue * ratio);
    }
  };

  const firstCell: AxisCell = { ...first, onChange: handleFirstChange };
  const secondCell: AxisCell = { ...second, onChange: handleSecondChange };

  return (
    <div role="group" aria-label={groupName} style={sectionStyle()}>
      <div style={sectionHeadStyle()}>
        {icon !== undefined ?
          <span aria-hidden="true">{icon}</span>
        : null}
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label}
          {unitSuffix}
        </span>
        {hasTrailing ?
          <span style={{ alignItems: 'center', display: 'inline-flex', gap: sp('sp-01') }}>
            {linkToggle !== undefined ?
              <LinkToggle {...linkToggle} />
            : null}
            {trailing !== undefined ? trailing : null}
          </span>
        : null}
      </div>
      <div style={axisGridStyle(2)}>
        <AxisCellView cell={firstCell} />
        <AxisCellView cell={secondCell} />
      </div>
    </div>
  );
}
