import { Button } from '@heroui/react';
import { Link2, Unlink2 } from 'lucide-react';
import type { JSX } from 'react';

import { ICON_SIZE } from '../panel-types';

export interface LinkToggleProps {
  readonly isLinked: boolean;
  readonly onToggle: (next: boolean) => void;
  readonly ariaLabel: string;
}

export function LinkToggle({ isLinked, onToggle, ariaLabel }: LinkToggleProps): JSX.Element {
  return (
    <Button
      aria-label={ariaLabel}
      aria-pressed={isLinked}
      size="sm"
      variant={isLinked ? 'secondary' : 'ghost'}
      onPress={() => {
        onToggle(!isLinked);
      }}
    >
      {isLinked ?
        <Link2 size={ICON_SIZE} />
      : <Unlink2 size={ICON_SIZE} />}
    </Button>
  );
}
