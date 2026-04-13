import { color, font, sp } from '@broadset/ui';

import { SIDEBAR_EDGE_INSET, SIDEBAR_TOP_OFFSET } from '../demo-types';
import { clampSidebarWidth } from '../demo-utils';
import type { DemoAppLayoutProps } from './layout-types';

export function LayoutSidebarShell(props: DemoAppLayoutProps): React.JSX.Element {
  const { isSidebarOpen, setSidebarWidth, sidebarPanel, sidebarWidth } = props;

  return (
    <aside
      className="absolute z-30"
      data-testid="demo-properties-sidebar"
      style={{
        backgroundColor: color('surface'),
        border: `1px solid ${color('border')}`,
        borderBottomLeftRadius: '1rem',
        borderBottomRightRadius: 0,
        borderRight: 'none',
        borderTopLeftRadius: '1rem',
        borderTopRightRadius: 0,
        bottom: `${String(SIDEBAR_EDGE_INSET)}px`,
        boxShadow: 'var(--overlay-shadow, 0 14px 40px rgba(15, 23, 42, 0.22))',
        overflow: 'hidden',
        pointerEvents: isSidebarOpen ? 'auto' : 'none',
        right: '0px',
        top: `${String(SIDEBAR_TOP_OFFSET)}px`,
        transform: isSidebarOpen ? 'translateX(0)' : `translateX(calc(100% + ${sp('sp-04')}))`,
        transition: 'var(--transition-panel, transform 160ms ease)',
        width: `${String(sidebarWidth)}px`,
      }}
    >
      {isSidebarOpen ?
        <div
          aria-hidden="true"
          onPointerDown={(event) => {
            event.preventDefault();

            const startX = event.clientX;
            const initialWidth = sidebarWidth;
            const handlePointerMove = (moveEvent: PointerEvent): void => {
              const delta = startX - moveEvent.clientX;

              setSidebarWidth(clampSidebarWidth(initialWidth + delta));
            };
            const handlePointerUp = (): void => {
              window.removeEventListener('pointermove', handlePointerMove);
              window.removeEventListener('pointerup', handlePointerUp);
            };

            window.addEventListener('pointermove', handlePointerMove);
            window.addEventListener('pointerup', handlePointerUp);
          }}
          style={{
            cursor: 'col-resize',
            display: 'flex',
            inset: '0 auto 0 -12px',
            justifyContent: 'center',
            position: 'absolute',
            width: '12px',
            zIndex: 2,
          }}
        >
          <span
            style={{
              alignSelf: 'center',
              backgroundColor: color('border'),
              borderRadius: '999px',
              color: color('muted'),
              display: 'inline-flex',
              fontSize: font('label'),
              padding: '0 2px',
            }}
          >
            ⋮⋮
          </span>
        </div>
      : null}

      <div className="h-full overflow-auto" style={{ padding: `${sp('sp-02')} ${sp('sp-03')}` }}>
        {sidebarPanel}
      </div>
    </aside>
  );
}
