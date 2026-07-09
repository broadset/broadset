import { Button, Chip, Input } from '@heroui/react';
import { Lock, LockOpen, Pencil } from 'lucide-react';
import type { KeyboardEvent, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';

import { color, font, sp } from './tokens';

const LOCK_ICON_SIZE = 14;

export interface SidebarContextHeaderProps {
  readonly icon: ReactNode;
  readonly label: string;
  readonly typeChipLabel?: string | undefined;
  readonly countChipLabel?: string | undefined;
  readonly isLocked?: boolean | undefined;
  readonly onToggleLock?: (() => void) | undefined;
  readonly showAnimationMode?: boolean | undefined;
  readonly animationModeLabel?: string | undefined;
  /** When provided, the label turns into an inline-editable input — used for single-element selections. */
  readonly onLabelChange?: ((next: string) => void) | undefined;
}

/** In-panel context header for sidebar panels. Shows the active tab name + icon. */
export function SidebarContextHeader({
  icon,
  label,
  typeChipLabel,
  countChipLabel,
  isLocked,
  onToggleLock,
  showAnimationMode,
  animationModeLabel,
  onLabelChange,
}: SidebarContextHeaderProps): React.JSX.Element {
  const lockLabel = isLocked ? 'Unlock element' : 'Lock element';
  const [draft, setDraft] = useState(label);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setDraft(label);
  }, [label]);

  const commit = (): void => {
    if (onLabelChange !== undefined && draft.trim() !== '' && draft !== label) {
      onLabelChange(draft);
    } else {
      setDraft(label);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') {
      event.preventDefault();
      inputRef.current?.blur();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setDraft(label);
      inputRef.current?.blur();
    }
  };

  return (
    <div
      data-testid="sidebar-context-header"
      style={{
        alignItems: 'center',
        borderBottom: `1px solid ${color('border')}`,
        display: 'flex',
        gap: sp('sp-02'),
        marginBottom: sp('sp-03'),
        padding: `${sp('sp-02')} ${sp('sp-01')}`,
      }}
    >
      <span style={{ color: color('muted'), display: 'flex', flexShrink: 0 }}>{icon}</span>
      <div style={{ alignItems: 'center', display: 'flex', flex: 1, gap: sp('sp-01'), minWidth: 0 }}>
        {onLabelChange !== undefined ?
          <div style={{ alignItems: 'center', display: 'flex', flex: 1, gap: sp('sp-01'), minWidth: 0 }}>
            <Input
              ref={inputRef}
              aria-label="Element name"
              value={draft}
              spellCheck={false}
              style={{
                color: color('foreground'),
                flex: 1,
                fontSize: font('heading-sm'),
                fontWeight: 600,
                minWidth: 0,
              }}
              onChange={(event) => {
                setDraft(event.currentTarget.value);
              }}
              onBlur={commit}
              onKeyDown={handleKeyDown}
            />
            <Pencil aria-hidden="true" size={12} style={{ color: color('muted'), flexShrink: 0, opacity: 0.6 }} />
          </div>
        : <div
            style={{
              color: color('foreground'),
              fontSize: font('heading-sm'),
              fontWeight: 600,
              overflow: 'hidden',
              padding: '2px 4px',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {label}
          </div>
        }
      </div>
      <div style={{ alignItems: 'center', display: 'flex', flexShrink: 0, gap: sp('sp-01') }}>
        {typeChipLabel !== undefined && <Chip size="sm">{typeChipLabel}</Chip>}
        {countChipLabel !== undefined && <Chip size="sm">{countChipLabel}</Chip>}
        {showAnimationMode === true && <Chip size="sm">{animationModeLabel ?? 'Animation Mode'}</Chip>}
        {onToggleLock !== undefined && (
          <Button
            aria-label={lockLabel}
            aria-pressed={isLocked === true}
            size="sm"
            variant={isLocked === true ? 'secondary' : 'ghost'}
            onPress={onToggleLock}
          >
            {isLocked === true ?
              <Lock size={LOCK_ICON_SIZE} />
            : <LockOpen size={LOCK_ICON_SIZE} />}
          </Button>
        )}
      </div>
    </div>
  );
}
