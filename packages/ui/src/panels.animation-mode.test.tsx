/** @jest-environment jsdom */
import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';

import type { PropertyFieldAdapter, PropertyValue } from './panels';
import { AnimationModePropertiesPanel } from './panels';
import { GROUP_ELEMENT, TEXT_ELEMENT } from './panels-test-helpers';

describe('AnimationModePropertiesPanel', () => {
  /** @description Animation mode must clearly communicate context so users know they are editing timeline keyframe values, not base styles. */
  it('renders animation mode header chip and helper copy', () => {
    const adapter: PropertyFieldAdapter = {
      isIncluded: () => true,
      getValue: () => 100,
      toggleProperty: jest.fn(),
      updateValue: jest.fn(),
    };

    render(
      <AnimationModePropertiesPanel
        element={TEXT_ELEMENT}
        adapter={adapter}
        documentMode="screen"
        onUpdate={() => undefined}
        timelineName="Intro"
        keyframeName="Start"
      />,
    );

    expect(screen.getByText('Animation Mode')).not.toBeNull();
    expect(screen.getByText('Editing timeline Intro · keyframe Start')).not.toBeNull();
    expect(screen.getByText('Geometry')).not.toBeNull();
    expect(screen.getByText('Typography')).not.toBeNull();
  });

  /** @description Included keyframe properties must route updates through the adapter so base element style is not mutated during keyframe edits. */
  it('routes included property edits to adapter.updateValue and not onUpdate', () => {
    const onUpdate =
      jest.fn<(key: string, value: string | number | readonly [number, number, number, number]) => void>();
    const adapter: PropertyFieldAdapter = {
      isIncluded: () => true,
      getValue: () => 0,
      toggleProperty: jest.fn(),
      updateValue: jest.fn(),
    };

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

    expect(adapter.updateValue).toHaveBeenCalledWith('x', 120);
    expect(onUpdate).not.toHaveBeenCalledWith('x', 120);
  });

  /** @description Excluded properties must render disabled with include/remove controls so users can add keyframe-scoped properties in one click. */
  it('renders include toggle for excluded property and uses base element value when including', () => {
    const toggleProperty = jest.fn<(key: string, include: boolean, defaultValue: PropertyValue) => void>();
    const groupElementWithX = {
      ...GROUP_ELEMENT,
      x: 48,
    };

    render(
      <AnimationModePropertiesPanel
        element={groupElementWithX}
        adapter={{
          isIncluded: (key: string) => key !== 'x',
          getValue: () => 0,
          toggleProperty,
          updateValue: jest.fn(),
        }}
        documentMode="screen"
        onUpdate={() => undefined}
      />,
    );

    const xField = screen.getByTestId('property-field-x');
    const xInput = screen.getByRole('textbox', { name: 'Position X (px)' });

    expect(xField.getAttribute('data-disabled')).toBe('true');

    if (!(xInput instanceof HTMLInputElement)) {
      throw new Error('Expected X input to be an HTML input element.');
    }

    expect(xInput.value).toBe('48');

    fireEvent.click(screen.getByRole('button', { name: /^include x$/i }));

    expect(toggleProperty).toHaveBeenCalledWith('x', true, groupElementWithX.x);
  });

  /** @description Included keyframe properties must expose a remove action that calls toggleProperty with included=false. */
  it('calls toggleProperty with included=false when removing an included property', () => {
    const toggleProperty = jest.fn<(key: string, include: boolean, defaultValue: PropertyValue) => void>();
    const groupElementWithX = {
      ...GROUP_ELEMENT,
      x: 64,
    };

    render(
      <AnimationModePropertiesPanel
        element={groupElementWithX}
        adapter={{
          isIncluded: (key: string) => key === 'x',
          getValue: () => groupElementWithX.x,
          toggleProperty,
          updateValue: jest.fn(),
        }}
        documentMode="screen"
        onUpdate={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /^remove x$/i }));

    expect(toggleProperty).toHaveBeenCalledWith('x', false, groupElementWithX.x);
  });
});
