/** @vitest-environment jsdom */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { PropertyValue } from './panels';
import { ObjectFitPanel } from './panels';

describe('ObjectFitPanel', () => {
  /** @description Every CSS object-fit value must be offered so users can match any real-world asset. */
  it('renders the full set of object-fit options with accessible labels', () => {
    const onUpdate = vi.fn<(key: string, value: PropertyValue) => void>();

    render(<ObjectFitPanel objectFit="contain" onUpdate={onUpdate} />);

    const group = screen.getByRole('group', { name: 'Object fit' });

    for (const label of ['Contain', 'Cover', 'Fill', 'None', 'Scale down']) {
      expect(within(group).getByRole('button', { name: label })).toBeTruthy();
    }
  });

  /** @description Selecting a new option must emit an `objectFit` update carrying the exact CSS value. */
  it('emits the selected objectFit value to onUpdate', () => {
    const onUpdate = vi.fn<(key: string, value: PropertyValue) => void>();

    render(<ObjectFitPanel objectFit="contain" onUpdate={onUpdate} />);

    fireEvent.click(screen.getByRole('button', { name: 'Cover' }));

    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith('objectFit', 'cover');
  });

  /** @description The `scale-down` option must serialize with its CSS-canonical hyphenated value, not the human-readable label. */
  it('emits scale-down using the CSS-canonical hyphenated value', () => {
    const onUpdate = vi.fn<(key: string, value: PropertyValue) => void>();

    render(<ObjectFitPanel objectFit="contain" onUpdate={onUpdate} />);

    fireEvent.click(screen.getByRole('button', { name: 'Scale down' }));

    expect(onUpdate).toHaveBeenCalledWith('objectFit', 'scale-down');
  });
});
