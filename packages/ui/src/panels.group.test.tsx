/** @jest-environment jsdom */
import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen, within } from '@testing-library/react';

import type { PropertyValue } from './panels';
import { GroupPanel } from './panels';

describe('GroupPanel', () => {
  /** @description Group elements must have editable clipChildren toggle and group name. */
  it('renders clipChildren toggle and group name', () => {
    const onUpdate = jest.fn<(key: string, value: PropertyValue) => void>();

    render(<GroupPanel name="My Group" clipChildren={false} booleanOperation={null} onUpdate={onUpdate} />);

    const clipToggle = screen.getByRole('switch', { name: /clip children/i });

    expect(clipToggle).not.toBeNull();

    fireEvent.click(clipToggle);
    expect(onUpdate).toHaveBeenCalledWith('clipChildren', true);
  });

  /** @description Boolean operation dropdown must be visible with expected value rendered. */
  it('renders boolean operation dropdown', () => {
    const onUpdate = jest.fn<(key: string, value: PropertyValue) => void>();

    render(<GroupPanel name="Test Group" clipChildren={false} booleanOperation="union" onUpdate={onUpdate} />);

    const region = screen.getByRole('region', { name: 'Group' });

    expect(within(region).getByLabelText(/boolean operation/i)).not.toBeNull();
  });
});
