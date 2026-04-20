/** @vitest-environment jsdom */

import './test-helpers';

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SegmentedSwitcher } from './index';

describe('SegmentedSwitcher', () => {
  /** @description A segmented switcher must expose a keyboard-friendly grouped toggle for fast option switching. */
  it('renders all options with one selected', () => {
    render(
      <SegmentedSwitcher
        ariaLabel="Fill type"
        value="solid"
        options={[
          { value: 'solid', label: 'Solid' },
          { value: 'gradient', label: 'Gradient' },
        ]}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('group', { name: 'Fill type' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Solid' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Gradient' })).toBeTruthy();
  });

  /** @description Clicking an option must emit the corresponding value for immediate panel updates. */
  it('emits selected value on click', () => {
    const onChange = vi.fn<(value: string) => void>();

    render(
      <SegmentedSwitcher
        ariaLabel="Text align"
        value="left"
        options={[
          { value: 'left', label: 'Left' },
          { value: 'center', label: 'Center' },
          { value: 'right', label: 'Right' },
        ]}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Center' }));

    expect(onChange).toHaveBeenCalledWith('center');
  });

  /** @description Arrow keys must switch adjacent options to satisfy keyboard-first accessibility. */
  it('supports arrow-key navigation', () => {
    const onChange = vi.fn<(value: string) => void>();

    render(
      <SegmentedSwitcher
        ariaLabel="Text align"
        value="left"
        options={[
          { value: 'left', label: 'Left' },
          { value: 'center', label: 'Center' },
          { value: 'right', label: 'Right' },
        ]}
        onChange={onChange}
      />,
    );

    const group = screen.getByRole('group', { name: 'Text align' });

    fireEvent.keyDown(group, { key: 'ArrowRight' });

    expect(onChange).toHaveBeenCalledWith('center');
  });
});
