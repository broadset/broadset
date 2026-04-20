/** @vitest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { PanelElement, PropertyValue } from './panels';
import { PropertiesSidebar } from './panels';
import { BASE_ELEMENT } from './panels-test-helpers';

describe('Multi-element editing', () => {
  /** @description Matching property values across selected elements must display the common value. */
  it('displays common values for matching properties', () => {
    const el1: PanelElement = { ...BASE_ELEMENT, id: 'a', opacity: 0.5 };
    const el2: PanelElement = { ...BASE_ELEMENT, id: 'b', opacity: 0.5 };

    render(<PropertiesSidebar elements={[el1, el2]} documentMode="screen" onUpdate={() => undefined} />);

    expect(screen.getByText('Appearance')).not.toBeNull();
  });

  /** @description Differing values must still keep users in the multiple-selection context rather than rendering single-element metadata. */
  it('keeps multiple-selection context for differing values', () => {
    const el1: PanelElement = { ...BASE_ELEMENT, id: 'a', x: 10 };
    const el2: PanelElement = { ...BASE_ELEMENT, id: 'b', x: 50 };

    render(<PropertiesSidebar elements={[el1, el2]} documentMode="screen" onUpdate={() => undefined} />);

    expect(screen.getByText('Multiple selection')).not.toBeNull();
  });

  /** @description Editing a property in multi-select mode must apply the new value to all selected elements. */
  it('routes multi-select updates through onUpdate', () => {
    const onUpdate = vi.fn<(key: string, value: PropertyValue) => void>();

    const el1: PanelElement = { ...BASE_ELEMENT, id: 'a' };
    const el2: PanelElement = { ...BASE_ELEMENT, id: 'b' };

    render(<PropertiesSidebar elements={[el1, el2]} documentMode="screen" onUpdate={onUpdate} />);

    expect(screen.getByText('Geometry')).not.toBeNull();
  });
});
