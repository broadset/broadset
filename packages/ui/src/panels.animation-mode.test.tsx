/** @vitest-environment jsdom */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { PropertyFieldAdapter, PropertyValue } from './panels';
import { AnimationModePropertiesPanel } from './panels';
import { GROUP_ELEMENT, TEXT_ELEMENT } from './panels-test-helpers';

function makeAdapter(overrides: Partial<PropertyFieldAdapter> = {}): PropertyFieldAdapter {
  return {
    isIncluded: () => true,
    getValue: () => 0,
    toggleProperty: vi.fn(),
    updateValue: vi.fn(),
    ...overrides,
  };
}

describe('AnimationModePropertiesPanel', () => {
  /** @description Included keyframe property edits must route through adapter.updateValue so the timeline keyframe mutates instead of the base style. */
  it('routes included property edits to adapter.updateValue and not to onUpdate', () => {
    const onUpdate = vi.fn<(key: string, value: PropertyValue) => void>();
    const updateValue = vi.fn<(key: string, value: PropertyValue) => void>();
    const adapter = makeAdapter({ updateValue });

    render(
      <AnimationModePropertiesPanel
        element={TEXT_ELEMENT}
        adapter={adapter}
        documentMode="screen"
        onUpdate={onUpdate}
      />,
    );

    const xInput = screen.getByRole('textbox', { name: 'Position X (px)' });

    fireEvent.change(xInput, { target: { value: '120' } });
    fireEvent.blur(xInput);

    expect(updateValue).toHaveBeenCalledWith('x', 120);
    expect(onUpdate).not.toHaveBeenCalledWith('x', 120);
  });

  /** @description Excluded properties must render disabled and show the BASE element's value (not the adapter's getValue), so the user sees the starting point before opting in. */
  it('shows base element value and disables the field for excluded properties', () => {
    const groupElementWithX = { ...GROUP_ELEMENT, x: 48 };

    render(
      <AnimationModePropertiesPanel
        element={groupElementWithX}
        adapter={makeAdapter({
          isIncluded: (key) => key !== 'x',
          getValue: () => 9999,
        })}
        documentMode="screen"
        onUpdate={() => undefined}
      />,
    );

    const xField = screen.getByTestId('property-field-x');
    const xInput = screen.getByRole('textbox', { name: 'Position X (px)' });

    expect(xField.getAttribute('data-disabled')).toBe('true');
    expect(xInput).toHaveValue('48');
  });

  /** @description The include button on an excluded property must call toggleProperty(key, true, baseValue) so the keyframe seeds with the element's current style. */
  it('calls toggleProperty(key, true, baseValue) when including a property', () => {
    const toggleProperty = vi.fn<(key: string, include: boolean, defaultValue: PropertyValue) => void>();
    const groupElementWithX = { ...GROUP_ELEMENT, x: 48 };

    render(
      <AnimationModePropertiesPanel
        element={groupElementWithX}
        adapter={makeAdapter({
          isIncluded: (key) => key !== 'x',
          toggleProperty,
        })}
        documentMode="screen"
        onUpdate={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /^include x$/i }));

    expect(toggleProperty).toHaveBeenCalledWith('x', true, 48);
  });

  /** @description The remove button on an included property must call toggleProperty(key, false, currentValue) so the keyframe drops that property cleanly. */
  it('calls toggleProperty(key, false, currentValue) when removing an included property', () => {
    const toggleProperty = vi.fn<(key: string, include: boolean, defaultValue: PropertyValue) => void>();
    const groupElementWithX = { ...GROUP_ELEMENT, x: 64 };

    render(
      <AnimationModePropertiesPanel
        element={groupElementWithX}
        adapter={makeAdapter({
          isIncluded: (key) => key === 'x',
          getValue: () => groupElementWithX.x,
          toggleProperty,
        })}
        documentMode="screen"
        onUpdate={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /^remove x$/i }));

    expect(toggleProperty).toHaveBeenCalledWith('x', false, groupElementWithX.x);
  });

  /** @description The animation-mode header must echo the specific timeline and keyframe name so users know which keyframe they are editing. */
  it('labels the header with the active timeline and keyframe names', () => {
    render(
      <AnimationModePropertiesPanel
        element={TEXT_ELEMENT}
        adapter={makeAdapter()}
        documentMode="screen"
        onUpdate={() => undefined}
        timelineName="Intro"
        keyframeName="Start"
      />,
    );

    expect(screen.getByText('Editing timeline Intro · keyframe Start')).toBeTruthy();
  });
});
