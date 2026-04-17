import type { CSSProperties, JSX } from 'react';

import { color, sp } from '../tokens';

export type AnchorHorizontal = 'left' | 'center' | 'right';
export type AnchorVertical = 'top' | 'middle' | 'bottom';

export interface AnchorPadProps {
  readonly anchorX: 'left' | 'right';
  readonly anchorY: 'top' | 'bottom';
  readonly onChange: (anchor: { readonly x: 'left' | 'right'; readonly y: 'top' | 'bottom' }) => void;
}

const PAD_SIZE = '1.75rem';
const DOT_SIZE = '0.3125rem';

const POSITIONS: readonly {
  readonly x: AnchorHorizontal;
  readonly y: AnchorVertical;
}[] = [
  { x: 'left', y: 'top' },
  { x: 'center', y: 'top' },
  { x: 'right', y: 'top' },
  { x: 'left', y: 'middle' },
  { x: 'center', y: 'middle' },
  { x: 'right', y: 'middle' },
  { x: 'left', y: 'bottom' },
  { x: 'center', y: 'bottom' },
  { x: 'right', y: 'bottom' },
];

function padStyle(): CSSProperties {
  return {
    alignItems: 'center',
    background: color('field-background'),
    border: `1px solid ${color('border')}`,
    borderRadius: '0.25rem',
    display: 'grid',
    gap: 0,
    gridTemplateColumns: 'repeat(3, 1fr)',
    gridTemplateRows: 'repeat(3, 1fr)',
    height: PAD_SIZE,
    justifyItems: 'center',
    padding: sp('sp-01'),
    width: PAD_SIZE,
  };
}

function dotStyle(isActive: boolean, isBindable: boolean): CSSProperties {
  return {
    background: isActive ? color('accent') : color('muted'),
    border: 'none',
    borderRadius: '50%',
    cursor: isBindable ? 'pointer' : 'default',
    height: DOT_SIZE,
    opacity:
      isActive ? 1
      : isBindable ? 0.7
      : 0.3,
    padding: 0,
    transform: isActive ? 'scale(1.5)' : 'scale(1)',
    transition: 'transform 80ms ease-out, opacity 80ms ease-out, background 80ms ease-out',
    width: DOT_SIZE,
  };
}

function anchorAriaLabel(x: AnchorHorizontal, y: AnchorVertical): string {
  return `Anchor ${y}-${x}`;
}

export function AnchorPad({ anchorX, anchorY, onChange }: AnchorPadProps): JSX.Element {
  return (
    <div role="group" aria-label="Anchor origin" style={padStyle()}>
      {POSITIONS.map((pos) => {
        const bindableX = pos.x === 'left' || pos.x === 'right' ? pos.x : null;
        const bindableY = pos.y === 'top' || pos.y === 'bottom' ? pos.y : null;
        const isBindable = bindableX !== null && bindableY !== null;
        const resolvedActive = isBindable && bindableX === anchorX && bindableY === anchorY;

        return (
          <button
            key={`${pos.x}-${pos.y}`}
            aria-label={anchorAriaLabel(pos.x, pos.y)}
            aria-pressed={resolvedActive}
            disabled={!isBindable}
            type="button"
            style={dotStyle(resolvedActive, isBindable)}
            onClick={() => {
              if (bindableX === null || bindableY === null) return;

              onChange({ x: bindableX, y: bindableY });
            }}
          />
        );
      })}
    </div>
  );
}
