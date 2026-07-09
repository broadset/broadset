/** @vitest-environment jsdom */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PropertyField } from './panels';

describe('PropertyField', () => {
  /** @description In normal mode (no adapter), PropertyField must render children directly. */
  it('renders children directly without adapter', () => {
    render(
      <PropertyField propertyKey="opacity">
        <span>Direct child</span>
      </PropertyField>,
    );

    expect(screen.getByText('Direct child')).not.toBeNull();
  });

  /** @description In keyframe mode, include/remove toggle must call toggleProperty. */
  it('calls toggleProperty when include/remove is toggled', () => {
    const toggle = vi.fn();

    render(
      <PropertyField
        propertyKey="opacity"
        adapter={{
          isIncluded: () => false,
          getValue: () => 0.5,
          toggleProperty: toggle,
          updateValue: vi.fn(),
        }}
      >
        <span>Opacity control</span>
      </PropertyField>,
    );

    const includeBtn = screen.getByRole('button', { name: /include/i });

    fireEvent.click(includeBtn);
    expect(toggle).toHaveBeenCalledWith('opacity', true, expect.anything());
  });

  /** @description Excluded property must be rendered as disabled in keyframe mode. */
  it('marks excluded properties as disabled', () => {
    render(
      <PropertyField
        propertyKey="opacity"
        adapter={{
          isIncluded: () => false,
          getValue: () => 0.5,
          toggleProperty: vi.fn(),
          updateValue: vi.fn(),
        }}
      >
        <span>Opacity control</span>
      </PropertyField>,
    );

    const wrapper = screen.getByText('Opacity control').closest('[data-disabled]');

    expect(wrapper).not.toBeNull();
  });
});
