import type { ReactNode } from 'react';

import { color, font, sp } from './tokens';

export interface SidebarContextHeaderProps {
  readonly icon: ReactNode;
  readonly label: string;
  readonly subtitle?: string;
}

/** In-panel context header for sidebar panels. Shows the active tab name + icon. */
export function SidebarContextHeader({ icon, label, subtitle }: SidebarContextHeaderProps): React.JSX.Element {
  return (
    <div
      data-testid="sidebar-context-header"
      style={{
        alignItems: 'center',
        borderBottom: `1px solid ${color('border')}`,
        display: 'flex',
        gap: sp('sp-02'),
        marginBottom: sp('sp-02'),
        padding: `${sp('sp-02')} ${sp('sp-01')}`,
      }}
    >
      <span style={{ color: color('muted'), display: 'flex', flexShrink: 0 }}>{icon}</span>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            color: color('foreground'),
            fontSize: font('heading-sm'),
            fontWeight: 600,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </div>
        {subtitle !== undefined && (
          <div
            data-testid="sidebar-context-subtitle"
            style={{
              color: color('muted'),
              fontSize: font('label'),
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {subtitle}
          </div>
        )}
      </div>
    </div>
  );
}
