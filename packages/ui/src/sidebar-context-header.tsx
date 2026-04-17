import { Button, Chip } from '@heroui/react';
import { Lock, LockOpen } from 'lucide-react';
import type { ReactNode } from 'react';

import { color, font, sp } from './tokens';

const LOCK_ICON_SIZE = 14;

export interface SidebarContextHeaderProps {
  readonly icon: ReactNode;
  readonly label: string;
  readonly subtitle?: string | undefined;
  readonly typeChipLabel?: string | undefined;
  readonly countChipLabel?: string | undefined;
  readonly isLocked?: boolean | undefined;
  readonly onToggleLock?: (() => void) | undefined;
  readonly showAnimationMode?: boolean | undefined;
  readonly animationModeLabel?: string | undefined;
}

/** In-panel context header for sidebar panels. Shows the active tab name + icon. */
export function SidebarContextHeader({
  icon,
  label,
  subtitle,
  typeChipLabel,
  countChipLabel,
  isLocked,
  onToggleLock,
  showAnimationMode,
  animationModeLabel,
}: SidebarContextHeaderProps): React.JSX.Element {
  const lockLabel = isLocked ? 'Unlock element' : 'Lock element';

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
      <div style={{ display: 'flex', gap: sp('sp-01'), marginLeft: 'auto' }}>
        {typeChipLabel !== undefined && <Chip size="sm">{typeChipLabel}</Chip>}
        {countChipLabel !== undefined && <Chip size="sm">{countChipLabel}</Chip>}
        {showAnimationMode === true && <Chip size="sm">{animationModeLabel ?? 'Animation Mode'}</Chip>}
        {onToggleLock !== undefined && (
          <Button aria-label={lockLabel} size="sm" variant="ghost" onPress={onToggleLock}>
            {isLocked ?
              <LockOpen size={LOCK_ICON_SIZE} />
            : <Lock size={LOCK_ICON_SIZE} />}
          </Button>
        )}
      </div>
    </div>
  );
}
