import { Button } from '@heroui/react';
import { X } from 'lucide-react';
import type { JSX, ReactNode } from 'react';

import { color, font, radius, sp, zLayer } from '../tokens';

export const TIMELINE_BOTTOM_PANEL_HEIGHT_PX = 240;
export const TIMELINE_BOTTOM_PANEL_SIDE_INSET_PX = 16;

export interface TimelineBottomPanelProps {
  readonly isOpen: boolean;
  readonly title: string;
  readonly subtitle: string;
  readonly onClose: () => void;
  readonly height?: number | undefined;
  readonly children: ReactNode;
}

/** Fixed sliding host for the TimelineEditor; inert and aria-hidden while closed (timeline.md MUST). */
export function TimelineBottomPanel(props: TimelineBottomPanelProps): JSX.Element {
  return (
    <div
      aria-hidden={props.isOpen ? undefined : true}
      data-testid="timeline-bottom-panel"
      style={{
        position: 'fixed',
        left: TIMELINE_BOTTOM_PANEL_SIDE_INSET_PX,
        right: TIMELINE_BOTTOM_PANEL_SIDE_INSET_PX,
        bottom: 0,
        height: props.height ?? TIMELINE_BOTTOM_PANEL_HEIGHT_PX,
        background: color('surface'),
        borderTopLeftRadius: radius('md'),
        borderTopRightRadius: radius('md'),
        border: `1px solid ${color('border')}`,
        borderBottom: 'none',
        zIndex: zLayer('overlay'),
        transform: props.isOpen ? 'translateY(0)' : 'translateY(100%)',
        transition: 'transform 160ms ease',
        pointerEvents: props.isOpen ? 'auto' : 'none',
        display: 'flex',
        flexDirection: 'column',
        gap: sp('sp-02'),
        padding: sp('sp-03'),
        overflow: 'hidden',
      }}
    >
      <header style={{ display: 'flex', alignItems: 'center', gap: sp('sp-03') }}>
        <span style={{ font: font('heading-sm'), color: color('foreground') }}>{props.title}</span>
        <span style={{ font: font('label'), color: color('muted') }}>{props.subtitle}</span>
        <span style={{ marginLeft: 'auto' }}>
          <Button aria-label="Close timeline" size="sm" variant="ghost" onPress={props.onClose}>
            <X size={14} />
          </Button>
        </span>
      </header>
      <div style={{ overflowY: 'auto', minHeight: 0 }}>{props.children}</div>
    </div>
  );
}
