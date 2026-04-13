/** @jest-environment jsdom */
import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';

import type { PropertyValue } from './panels';
import { SpacingPanel } from './panels';

describe('SpacingPanel', () => {
  /** @description Padding values must be editable for selected elements. */
  it('renders padding inputs and forwards updates', () => {
    const onUpdate = jest.fn<(key: string, value: PropertyValue) => void>();

    render(<SpacingPanel padding={[10, 20, 10, 20]} onUpdate={onUpdate} />);

    const topInput = screen.getByRole('textbox', { name: /Padding top/i });

    fireEvent.blur(topInput);
    expect(onUpdate).toHaveBeenCalled();
  });

  /** @description Link toggle must synchronize all four padding values when active. */
  it('synchronizes padding values via link toggle', () => {
    const onUpdate = jest.fn<(key: string, value: PropertyValue) => void>();

    render(<SpacingPanel padding={[10, 10, 10, 10]} onUpdate={onUpdate} />);

    // Enable link toggle (uniform padding)
    const linkBtn = screen.getByRole('button', { name: /link padding/i });

    fireEvent.click(linkBtn);

    // Change one value — all should sync
    const topInput = screen.getByRole('textbox', { name: /Padding top/i });

    fireEvent.blur(topInput);
    expect(onUpdate).toHaveBeenCalledWith('padding', [10, 10, 10, 10] as const);
  });
});
