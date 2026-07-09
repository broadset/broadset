import { RULER_SIZE } from '../demo-types';

export function RulerStrip({
  ticks,
  orientation,
}: {
  readonly ticks: readonly { readonly position: number; readonly label: string }[];
  readonly orientation: 'horizontal' | 'vertical';
}): React.JSX.Element {
  return (
    <div
      aria-hidden="true"
      style={{
        background: 'rgba(20, 20, 20, 0.72)',
        backdropFilter: 'blur(6px)',
        height: orientation === 'horizontal' ? `${String(RULER_SIZE)}px` : '100%',
        position: 'relative',
        width: orientation === 'vertical' ? `${String(RULER_SIZE)}px` : '100%',
      }}
    >
      {ticks.map((tick) => (
        <div
          key={`${orientation}-${tick.label}-${String(Math.round(tick.position))}`}
          style={
            orientation === 'horizontal' ?
              {
                left: `${String(tick.position)}px`,
                position: 'absolute',
                top: 0,
              }
            : {
                position: 'absolute',
                right: 0,
                top: `${String(tick.position)}px`,
              }
          }
        >
          <div
            style={
              orientation === 'horizontal' ?
                {
                  background: 'rgba(255,255,255,0.45)',
                  height: '8px',
                  width: '1px',
                }
              : {
                  background: 'rgba(255,255,255,0.45)',
                  height: '1px',
                  width: '8px',
                }
            }
          />
          <span
            style={{
              color: 'rgba(255,255,255,0.65)',
              fontFamily: 'IBM Plex Mono, ui-monospace, monospace',
              fontSize: '9px',
              left: orientation === 'horizontal' ? '-2px' : undefined,
              position: 'absolute',
              top: orientation === 'horizontal' ? '8px' : '-4px',
              transform: orientation === 'vertical' ? 'translate(-18px, -4px)' : 'none',
              whiteSpace: 'nowrap',
            }}
          >
            {tick.label}
          </span>
        </div>
      ))}
    </div>
  );
}
