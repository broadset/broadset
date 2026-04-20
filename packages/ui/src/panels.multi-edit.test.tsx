/** @vitest-environment jsdom */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { PanelElement, PropertyValue } from './panels';
import { PropertiesSidebar } from './panels';
import { BASE_ELEMENT } from './panels-test-helpers';

describe('Multi-element editing', () => {
  /** @description Selecting multiple elements must flip the sidebar header into the "Multiple selection" context and expose the selection count, not the first element's name. */
  it('shows the multi-selection context label and element count', () => {
    const el1: PanelElement = { ...BASE_ELEMENT, id: 'a', name: 'Alpha', x: 10 };
    const el2: PanelElement = { ...BASE_ELEMENT, id: 'b', name: 'Beta', x: 50 };

    render(<PropertiesSidebar elements={[el1, el2]} documentMode="screen" onUpdate={() => undefined} />);

    expect(screen.getByText('Multiple selection')).toBeTruthy();
    expect(screen.getByText('2 elements')).toBeTruthy();
    expect(screen.queryByText('Alpha')).toBeNull();
    expect(screen.queryByText('Beta')).toBeNull();
  });

  /** @description Editing a geometry field in multi-select mode must emit a single `onUpdate(key, value)` so the caller can broadcast it to every selected element. */
  it('routes a multi-select field edit to onUpdate with the exact key and value', () => {
    const onUpdate = vi.fn<(key: string, value: PropertyValue) => void>();

    const el1: PanelElement = { ...BASE_ELEMENT, id: 'a', x: 10 };
    const el2: PanelElement = { ...BASE_ELEMENT, id: 'b', x: 10 };

    render(<PropertiesSidebar elements={[el1, el2]} documentMode="screen" onUpdate={onUpdate} />);

    const xInput = screen.getByRole('textbox', { name: /position x/i });

    fireEvent.change(xInput, { target: { value: '42' } });
    fireEvent.blur(xInput);

    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith('x', 42);
  });

  /** @description Multi-select fields must still surface the primary element's current value so the user has a stable starting point when they edit — the panel does not blank out or stringify "Mixed" when values differ. */
  it('displays the primary element value when selected elements have differing values', () => {
    const el1: PanelElement = { ...BASE_ELEMENT, id: 'a', x: 10 };
    const el2: PanelElement = { ...BASE_ELEMENT, id: 'b', x: 500 };

    render(<PropertiesSidebar elements={[el1, el2]} documentMode="screen" onUpdate={() => undefined} />);

    const xInput = screen.getByRole('textbox', { name: /position x/i });

    expect(xInput).toHaveValue('10');
  });
});
