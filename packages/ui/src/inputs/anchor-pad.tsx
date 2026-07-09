import { Button } from '@heroui/react';
import type { CSSProperties, JSX } from 'react';

import { color } from '../tokens';

export interface AnchorPadProps {
  readonly anchorX: 'left' | 'right';
  readonly anchorY: 'top' | 'bottom';
  readonly onChange: (anchor: { readonly x: 'left' | 'right'; readonly y: 'top' | 'bottom' }) => void;
}

const CORNERS: readonly {
  readonly x: 'left' | 'right';
  readonly y: 'top' | 'bottom';
  readonly ariaLabel: string;
}[] = [
  { x: 'left', y: 'top', ariaLabel: 'Anchor top-left' },
  { x: 'right', y: 'top', ariaLabel: 'Anchor top-right' },
  { x: 'left', y: 'bottom', ariaLabel: 'Anchor bottom-left' },
  { x: 'right', y: 'bottom', ariaLabel: 'Anchor bottom-right' },
];

function cellButtonStyle(isActive: boolean, isTop: boolean, isLeft: boolean): CSSProperties {
  return {
    alignItems: isTop ? 'flex-start' : 'flex-end',
    background: isActive ? color('accent') : 'transparent',
    borderRadius: 0,
    display: 'flex',
    height: '100%',
    justifyContent: isLeft ? 'flex-start' : 'flex-end',
    minWidth: 0,
    padding: '3px',
    width: '100%',
  };
}

function dotStyle(isActive: boolean): CSSProperties {
  return {
    background: isActive ? color('foreground') : color('muted'),
    borderRadius: '50%',
    height: 5,
    opacity: isActive ? 1 : 0.6,
    width: 5,
  };
}

/**
 * Compact 2×2 anchor-origin picker. Selects which canvas edges the element's
 * X/Y coordinates are measured from (CSS left/right + top/bottom). Built on
 * HeroUI `Button`s arranged in a 2×2 grid.
 */
export function AnchorPad({ anchorX, anchorY, onChange }: AnchorPadProps): JSX.Element {
  return (
    <div
      role="group"
      aria-label="Anchor origin"
      style={{
        background: color('field-background'),
        border: `1px solid ${color('border')}`,
        borderRadius: 4,
        display: 'grid',
        gap: 1,
        gridTemplateColumns: '1fr 1fr',
        gridTemplateRows: '1fr 1fr',
        height: '2rem',
        overflow: 'hidden',
        width: '2rem',
      }}
    >
      {CORNERS.map((corner) => {
        const isActive = corner.x === anchorX && corner.y === anchorY;
        const isTop = corner.y === 'top';
        const isLeft = corner.x === 'left';

        return (
          <Button
            key={corner.ariaLabel}
            aria-label={corner.ariaLabel}
            aria-pressed={isActive}
            size="sm"
            variant="ghost"
            style={cellButtonStyle(isActive, isTop, isLeft)}
            onPress={() => {
              onChange({ x: corner.x, y: corner.y });
            }}
          >
            <span style={dotStyle(isActive)} />
          </Button>
        );
      })}
    </div>
  );
}
