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
 * Thin wrapper around HeroUI's compound Switch that renders the track + thumb
 * automatically so callers don't have to repeat `<Switch.Control><Switch.Thumb />`.
 * HeroUI's base `Switch` renders only the children — without the compound
 * subcomponents you get the label text but no visible toggle track.
 */
export function ToggleSwitch({ ariaLabel, isSelected, onChange, children, isDisabled }: ToggleSwitchProps): JSX.Element {
  return (
    <Switch
      aria-label={ariaLabel}
      isSelected={isSelected}
      {...(isDisabled === true ? { isDisabled: true } : {})}
      onChange={onChange}
    >
      <Switch.Control>
        <Switch.Thumb />
      </Switch.Control>
      {children !== undefined && children !== null ? <Switch.Content>{children}</Switch.Content> : null}
    </Switch>
  );
}
