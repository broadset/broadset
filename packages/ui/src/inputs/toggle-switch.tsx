import { Switch } from '@heroui/react';
import type { JSX, ReactNode } from 'react';

export interface ToggleSwitchProps {
  readonly ariaLabel: string;
  readonly isSelected: boolean;
  readonly onChange: (next: boolean) => void;
  readonly children?: ReactNode;
  readonly isDisabled?: boolean | undefined;
}

/**
 * Thin wrapper around HeroUI's compound Switch that renders its required
 * interactive content, track, and thumb while keeping call sites concise.
 */
export function ToggleSwitch({
  ariaLabel,
  isSelected,
  onChange,
  children,
  isDisabled,
}: ToggleSwitchProps): JSX.Element {
  return (
    <Switch
      aria-label={ariaLabel}
      isSelected={isSelected}
      {...(isDisabled === true ? { isDisabled: true } : {})}
      onChange={onChange}
    >
      <Switch.Content>
        <Switch.Control>
          <Switch.Thumb />
        </Switch.Control>
        {children}
      </Switch.Content>
    </Switch>
  );
}
