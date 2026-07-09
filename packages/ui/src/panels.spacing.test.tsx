/** @vitest-environment jsdom */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { PropertyValue } from './panels';
import { SpacingPanel } from './panels';

describe('SpacingPanel', () => {
  /** @description Editing a single side while the link toggle is off must only change that side. The other three values must be preserved. */
  it('edits a single side when link toggle is off', () => {
    const onUpdate = vi.fn<(key: string, value: PropertyValue) => void>();

    render(<SpacingPanel padding={[10, 20, 30, 40]} onUpdate={onUpdate} />);

    const topInput = screen.getByRole('textbox', { name: 'Padding top' });

    fireEvent.change(topInput, { target: { value: '99' } });
    fireEvent.blur(topInput);

    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith('padding', [99, 20, 30, 40]);
  });

  /** @description Enabling the link toggle and editing one side must synchronize all four sides to the new value. */
  it('synchronizes all four sides when link toggle is on', () => {
    const onUpdate = vi.fn<(key: string, value: PropertyValue) => void>();

    render(<SpacingPanel padding={[10, 10, 10, 10]} onUpdate={onUpdate} />);

    fireEvent.click(screen.getByRole('button', { name: /link padding/i }));

    const rightInput = screen.getByRole('textbox', { name: 'Padding right' });

    fireEvent.change(rightInput, { target: { value: '24' } });
    fireEvent.blur(rightInput);

    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith('padding', [24, 24, 24, 24]);
  });
});
