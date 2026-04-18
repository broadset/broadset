import { Button, ButtonGroup } from '@heroui/react';
import type { JSX } from 'react';

import { sp } from '../tokens';

interface SegmentedOption<TValue extends string> {
  readonly value: TValue;
  readonly label: string;
}

export interface SegmentedSwitcherProps<TValue extends string> {
  readonly ariaLabel: string;
  readonly value: TValue;
  readonly options: readonly SegmentedOption<TValue>[];
  readonly onChange: (value: TValue) => void;
}

export function SegmentedSwitcher<TValue extends string>({
  ariaLabel,
  value,
  options,
  onChange,
}: SegmentedSwitcherProps<TValue>): JSX.Element {
  const selectedIndex = options.findIndex((option) => option.value === value);

  return (
    /* eslint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex --
       segmented switcher needs keyboard arrow-nav on the group itself to move
       focus between its buttons; role="group" is the accurate semantic (not
       radiogroup, because children are Buttons, not radios). */
    <div
      role="group"
      aria-label={ariaLabel}
      tabIndex={0}
      style={{ display: 'flex', gap: sp('sp-01') }}
      onKeyDown={(event) => {
        if (selectedIndex === -1 || options.length === 0) {
          return;
        }

        if (event.key === 'ArrowRight') {
          event.preventDefault();

          const nextIndex = (selectedIndex + 1) % options.length;

          const nextOption = options[nextIndex];

          if (nextOption !== undefined) {
            onChange(nextOption.value);
          }

          return;
        }

        if (event.key === 'ArrowLeft') {
          event.preventDefault();

          const nextIndex = (selectedIndex - 1 + options.length) % options.length;

          const nextOption = options[nextIndex];

          if (nextOption !== undefined) {
            onChange(nextOption.value);
          }
        }
      }}
    >
      <ButtonGroup>
        {options.map((option) => (
          <Button
            key={option.value}
            aria-label={option.label}
            variant={option.value === value ? 'secondary' : 'ghost'}
            onPress={() => {
              onChange(option.value);
            }}
          >
            {option.label}
          </Button>
        ))}
      </ButtonGroup>
    </div>
    /* eslint-enable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */
  );
}
