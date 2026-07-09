import { Button, ButtonGroup } from '@heroui/react';
import type { JSX, ReactNode } from 'react';

export interface ToggleRowItem<V extends string> {
  readonly value: V;
  readonly ariaLabel: string;
  readonly icon?: ReactNode;
  readonly label?: string;
  readonly isActive: boolean;
}

export interface ToggleRowProps<V extends string> {
  readonly ariaLabel: string;
  /** When true, acts like a radio group (calls onChange with the new value). Otherwise each button toggles independently via onToggle. */
  readonly mutuallyExclusive?: boolean | undefined;
  readonly items: readonly ToggleRowItem<V>[];
  readonly onChange?: ((value: V) => void) | undefined;
  readonly onToggle?: ((value: V, nextActive: boolean) => void) | undefined;
}

function renderToggleContent<V extends string>(item: ToggleRowItem<V>): ReactNode {
  if (item.icon !== undefined) {
    return (
      <span style={{ alignItems: 'center', display: 'inline-flex', gap: 4 }}>
        {item.icon}
        {item.label !== undefined ? <span>{item.label}</span> : null}
      </span>
    );
  }

  if (item.label !== undefined) return <span>{item.label}</span>;

  return null;
}

/**
 * Dense horizontal cluster of icon toggle buttons. Used for:
 *  - Text formatting (B/I/U/S) — independent toggles via onToggle
 *  - Alignment, object-fit, ticker direction — mutually exclusive via onChange
 */
export function ToggleRow<V extends string>({
  ariaLabel,
  mutuallyExclusive,
  items,
  onChange,
  onToggle,
}: ToggleRowProps<V>): JSX.Element {
  return (
    <ButtonGroup aria-label={ariaLabel}>
      {items.map((item) => (
        <Button
          key={item.value}
          aria-label={item.ariaLabel}
          aria-pressed={item.isActive}
          size="sm"
          variant={item.isActive ? 'secondary' : 'ghost'}
          style={{ height: '1.75rem', minWidth: '1.75rem', padding: '0 0.4rem' }}
          onPress={() => {
            if (mutuallyExclusive === true) {
              onChange?.(item.value);
            } else {
              onToggle?.(item.value, !item.isActive);
            }
          }}
        >
          {renderToggleContent(item)}
        </Button>
      ))}
    </ButtonGroup>
  );
}
