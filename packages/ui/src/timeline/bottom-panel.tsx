import { Button } from '@heroui/react';
import { X } from 'lucide-react';
import type { JSX, ReactNode } from 'react';

import { color, sp } from '../tokens';

const DEFAULT_HEIGHT_PX = 240;
const PANEL_INSET = sp('sp-04');
const PANEL_Z_INDEX = 8000;

export interface TimelineBottomPanelProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly height?: number | undefined;
  readonly className?: string | undefined;
  readonly children?: ReactNode;
}

export function TimelineBottomPanel(props: TimelineBottomPanelProps): JSX.Element {
  const { isOpen, onClose, height = DEFAULT_HEIGHT_PX, className, children } = props;

  return (
    <div
      data-testid="timeline-bottom-panel"
      aria-hidden={!isOpen}
      className={className}
      style={{
        position: 'fixed',
        bottom: 0,
        left: PANEL_INSET,
        right: PANEL_INSET,
        height: `${String(height)}px`,
        zIndex: PANEL_Z_INDEX,
        backgroundColor: color('surface'),
        borderTopLeftRadius: '12px',
        borderTopRightRadius: '12px',
        borderTop: `1px solid ${color('border')}`,
        transform: isOpen ? 'translateY(0)' : 'translateY(100%)',
        transition: 'var(--transition-panel, transform 0.25s ease)',
        pointerEvents: isOpen ? 'auto' : 'none',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: `${sp('sp-02')} ${sp('sp-03')}`,
          borderBottom: `1px solid ${color('border')}`,
        }}
      >
        <span style={{ fontSize: '12px', fontWeight: 600, color: color('foreground') }}>Timeline</span>
        <Button size="sm" variant="ghost" isIconOnly aria-label="Close" onPress={onClose}>
          <X size={14} />
        </Button>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: sp('sp-03') }}>{children}</div>
    </div>
  );
}
