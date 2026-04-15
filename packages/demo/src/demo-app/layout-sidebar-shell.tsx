import { color, font, radius, shadow, SidebarContextHeader, sp } from '@broadset/ui';
import { Layers, LayoutTemplate, ShieldCheck, Sliders, Workflow } from 'lucide-react';

import type { SidebarTab } from '../demo-types';
import { SIDEBAR_EDGE_INSET, SIDEBAR_TOP_OFFSET } from '../demo-types';
import { clampSidebarWidth } from '../demo-utils';
import type { DemoAppLayoutProps } from './layout-types';

const TAB_ICON_SIZE = 16;

const SIDEBAR_TAB_META: Record<SidebarTab, { readonly icon: React.ReactNode; readonly label: string }> = {
  layers: { icon: <Layers size={TAB_ICON_SIZE} />, label: 'Layers' },
  properties: { icon: <Sliders size={TAB_ICON_SIZE} />, label: 'Properties' },
  animation: { icon: <Workflow size={TAB_ICON_SIZE} />, label: 'Animation' },
  preflight: { icon: <ShieldCheck size={TAB_ICON_SIZE} />, label: 'Pre-flight' },
  'template-groups': { icon: <LayoutTemplate size={TAB_ICON_SIZE} />, label: 'Template Groups' },
};

export function LayoutSidebarShell(props: DemoAppLayoutProps): React.JSX.Element {
  const { isSidebarOpen, setSidebarWidth, sidebarPanel, sidebarTab, sidebarWidth } = props;

  return (
    <aside
      aria-hidden={!isSidebarOpen}
      className="absolute z-30"
      data-testid="demo-properties-sidebar"
      style={{
        backgroundColor: color('surface'),
        border: `1px solid ${color('border')}`,
        borderBottomLeftRadius: radius('xl'),
        borderBottomRightRadius: 0,
        borderRight: 'none',
        borderTopLeftRadius: radius('xl'),
        borderTopRightRadius: 0,
        bottom: `${String(SIDEBAR_EDGE_INSET)}px`,
        boxShadow: shadow('overlay'),
        overflow: 'hidden',
        pointerEvents: isSidebarOpen ? 'auto' : 'none',
        right: '0px',
        top: `${String(SIDEBAR_TOP_OFFSET)}px`,
        transform: isSidebarOpen ? 'translateX(0)' : `translateX(calc(100% + ${sp('sp-04')}))`,
        transition: 'var(--transition-panel, transform 160ms ease)',
        visibility: isSidebarOpen ? 'visible' : 'hidden',
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

      {isSidebarOpen ?
        <div className="h-full overflow-auto" style={{ padding: `${sp('sp-02')} ${sp('sp-03')}` }}>
          <SidebarContextHeader icon={SIDEBAR_TAB_META[sidebarTab].icon} label={SIDEBAR_TAB_META[sidebarTab].label} />
          {sidebarPanel}
        </div>
      : null}
    </aside>
  );
}
