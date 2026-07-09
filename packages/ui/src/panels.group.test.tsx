/** @vitest-environment jsdom */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { PropertyValue } from './panels';
import { GroupPanel } from './panels';

describe('GroupPanel', () => {
  /** @description Group panel must expose opacity as a percent slider so group transparency can be edited without leaving the panel. */
  it('renders and updates group opacity slider', () => {
    const onUpdate = vi.fn<(key: string, value: PropertyValue) => void>();

    render(
      <GroupPanel
        name="My Group"
        opacity={0.5}
        clipChildren={false}
        booleanOperation={null}
        documentMode="screen"
        onUpdate={onUpdate}
      />,
    );

    const opacitySlider = screen.getByRole('slider', { name: /group opacity/i });

    expect(screen.getByText('50%')).not.toBeNull();

    fireEvent.change(opacitySlider, { target: { value: '80' } });

    expect(onUpdate).toHaveBeenCalledWith('opacity', 0.8);
  });

  /** @description Clip children control must use the explicit group-bounds label and remain interactive in screen mode. */
  it('renders clip children switch with the group-bounds label in screen mode', () => {
    const onUpdate = vi.fn<(key: string, value: PropertyValue) => void>();

    render(
      <GroupPanel
        name="My Group"
        opacity={1}
        clipChildren={false}
        booleanOperation={null}
        documentMode="screen"
        onUpdate={onUpdate}
      />,
    );

    const clipToggle = screen.getByRole('switch', { name: /clip children to group bounds/i });

    expect(clipToggle).not.toBeNull();

    fireEvent.click(clipToggle);
    expect(onUpdate).toHaveBeenCalledWith('clipChildren', true);
  });

  /** @description Print mode must explain that clip-children is unavailable to avoid silent missing behavior. */
  it('shows print mode clip-children unavailable message', () => {
    render(
      <GroupPanel
        name="Print Group"
        opacity={1}
        clipChildren={false}
        booleanOperation={null}
        documentMode="print"
        onUpdate={() => undefined}
      />,
    );

    const clipToggle = screen.getByRole('switch', { name: /clip children to group bounds/i });
    const isDisabled =
      clipToggle.getAttribute('disabled') !== null ||
      clipToggle.getAttribute('aria-disabled') === 'true' ||
      clipToggle.getAttribute('data-disabled') === 'true';

    expect(screen.getByText('Clip children is not available in this document mode.')).not.toBeNull();
    expect(isDisabled).toBe(true);
  });

  /** @description Group name and boolean operation controls must remain available after adding new group-scoped controls. */
  it('renders boolean operation dropdown', () => {
    const onUpdate = vi.fn<(key: string, value: PropertyValue) => void>();

    render(
      <GroupPanel
        name="Test Group"
        opacity={1}
        clipChildren={false}
        booleanOperation="union"
        documentMode="screen"
        onUpdate={onUpdate}
      />,
    );

    const region = screen.getByRole('region', { name: 'Group' });

    expect(within(region).getByRole('textbox', { name: /group name/i })).not.toBeNull();
    expect(within(region).getByLabelText(/boolean operation/i)).not.toBeNull();
  });

  /** @description Group name edits must still route through onUpdate so naming remains consistent with geometry panel behavior. */
  it('updates group name from the group name field', () => {
    const onUpdate = vi.fn<(key: string, value: PropertyValue) => void>();

    render(
      <GroupPanel
        name="Original Group"
        opacity={1}
        clipChildren={false}
        booleanOperation={null}
        documentMode="screen"
        onUpdate={onUpdate}
      />,
    );

    const nameInput = screen.getByRole('textbox', { name: /group name/i });

    fireEvent.change(nameInput, { target: { value: 'Renamed Group' } });

    expect(onUpdate).toHaveBeenCalledWith('name', 'Renamed Group');
  });
});
