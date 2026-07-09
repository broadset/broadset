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

  /** @description Excluded child properties inside a grouped row must render disabled and show the BASE element's value (not the adapter's getValue), so the user sees the starting point before opting in. */
  it('shows base element value and disables excluded child controls', () => {
    const groupElementWithX = { ...GROUP_ELEMENT, x: 48, y: 72 };

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

    expect(xField.getAttribute('data-disabled')).toBeNull();
    expect(xInput).toBeDisabled();
    expect(xInput).toHaveValue('48');
  });

  /** @description Included properties must render the selected keyframe value, not the base element value, so animation editing does not appear to jump back. */
  it('shows selected keyframe values for included properties', () => {
    const groupElementWithBaseOpacity = { ...GROUP_ELEMENT, opacity: 1 };

    render(
      <AnimationModePropertiesPanel
        element={groupElementWithBaseOpacity}
        adapter={makeAdapter({
          isIncluded: (key) => key === 'opacity',
          getValue: (key) => (key === 'opacity' ? 0.5 : 0),
        })}
        documentMode="screen"
        onUpdate={() => undefined}
      />,
    );

    expect(screen.getByText('50%')).toBeTruthy();
    expect(screen.getByRole('slider', { name: 'Opacity' })).toHaveValue('50');
  });

  /** @description Axis groups must remain editable when any child property is included, so y-only keyframes are not trapped behind the x field wrapper. */
  it('keeps position controls editable for y-only keyframes', () => {
    const updateValue = vi.fn<(key: string, value: PropertyValue) => void>();

    render(
      <AnimationModePropertiesPanel
        element={{ ...GROUP_ELEMENT, x: 48, y: 64 }}
        adapter={makeAdapter({
          isIncluded: (key) => key === 'y',
          getValue: (key) => (key === 'y' ? 96 : 0),
          updateValue,
        })}
        documentMode="screen"
        onUpdate={() => undefined}
      />,
    );

    const yInput = screen.getByRole('textbox', { name: 'Position Y (px)' });

    expect(yInput).not.toBeDisabled();
    expect(yInput).toHaveValue('96');

    fireEvent.change(yInput, { target: { value: '120' } });
    fireEvent.blur(yInput);

    expect(updateValue).toHaveBeenCalledWith('y', 120);
  });

  /** @description Position Z must behave like X/Y in animation mode, so translateZ-only keyframes can be scrubbed without first adding unrelated axes. */
  it('keeps position controls editable for translateZ-only keyframes', () => {
    const updateValue = vi.fn<(key: string, value: PropertyValue) => void>();

    render(
      <AnimationModePropertiesPanel
        element={{ ...GROUP_ELEMENT, x: 48, y: 64, translateZ: 4 }}
        adapter={makeAdapter({
          isIncluded: (key) => key === 'translateZ',
          getValue: (key) => (key === 'translateZ' ? 32 : 0),
          updateValue,
        })}
        documentMode="screen"
        onUpdate={() => undefined}
      />,
    );

    const zInput = screen.getByRole('textbox', { name: 'Position Z (px)' });

    expect(zInput).not.toBeDisabled();
    expect(zInput).toHaveValue('32');

    fireEvent.change(zInput, { target: { value: '64' } });
    fireEvent.blur(zInput);

    expect(updateValue).toHaveBeenCalledWith('translateZ', 64);
  });

  /** @description Size groups must remain editable when any child property is included, so height-only keyframes are not trapped behind the width field wrapper. */
  it('keeps size controls editable for height-only keyframes', () => {
    const updateValue = vi.fn<(key: string, value: PropertyValue) => void>();

    render(
      <AnimationModePropertiesPanel
        element={{ ...GROUP_ELEMENT, width: 320, height: 180 }}
        adapter={makeAdapter({
          isIncluded: (key) => key === 'height',
          getValue: (key) => (key === 'height' ? 240.1 : 0),
          updateValue,
        })}
        documentMode="screen"
        onUpdate={() => undefined}
      />,
    );

    const heightInput = screen.getByRole('textbox', { name: 'Size H (px)' });

    expect(heightInput).not.toBeDisabled();
    expect(heightInput).toHaveValue('240.1');

    fireEvent.change(heightInput, { target: { value: '300.1' } });
    fireEvent.blur(heightInput);

    expect(updateValue).toHaveBeenCalledWith('height', 300.1);
  });

  /** @description 3D rotation axes must render selected keyframe values and remain independently editable in animation mode. */
  it('keeps rotation controls editable for rotateX-only keyframes', () => {
    const updateValue = vi.fn<(key: string, value: PropertyValue) => void>();

    render(
      <AnimationModePropertiesPanel
        element={{ ...GROUP_ELEMENT, rotateX: 5, rotateY: 6, rotateZ: 7 }}
        adapter={makeAdapter({
          isIncluded: (key) => key === 'rotateX',
          getValue: (key) => (key === 'rotateX' ? 35 : 0),
          updateValue,
        })}
        documentMode="screen"
        onUpdate={() => undefined}
      />,
    );

    const xInput = screen.getByRole('textbox', { name: 'Rotation X' });

    expect(xInput).not.toBeDisabled();
    expect(xInput).toHaveValue('35');

    fireEvent.change(xInput, { target: { value: '42' } });
    fireEvent.blur(xInput);

    expect(updateValue).toHaveBeenCalledWith('rotateX', 42);
  });

  /** @description Animation mode must expose rectangle gradient controls so keyframes can include gradient fills instead of only solid colors. */
  it('shows gradient controls for rectangle appearance keyframes', () => {
    render(
      <AnimationModePropertiesPanel
        element={{ ...GROUP_ELEMENT, type: 'rectangle', backgroundGradient: 'linear-gradient(#fff, #000)' }}
        adapter={makeAdapter({
          isIncluded: (key) => key === 'backgroundGradient',
          getValue: (key) => (key === 'backgroundGradient' ? 'linear-gradient(#f00, #00f)' : 0),
        })}
        documentMode="screen"
        onUpdate={() => undefined}
      />,
    );

    expect(screen.getByRole('button', { name: 'Gradient' })).toBeTruthy();
  });

  /** @description The include button on an excluded grouped row must include every related key with the element's current style. */
  it('calls toggleProperty(key, true, baseValue) for grouped position keys', () => {
    const toggleProperty = vi.fn<(key: string, include: boolean, defaultValue: PropertyValue) => void>();
    const groupElementWithX = { ...GROUP_ELEMENT, x: 48, y: 72 };

    render(
      <AnimationModePropertiesPanel
        element={groupElementWithX}
        adapter={makeAdapter({
          isIncluded: (key) => key !== 'x' && key !== 'y' && key !== 'translateZ',
          toggleProperty,
        })}
        documentMode="screen"
        onUpdate={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /^include x \/ y \/ translate z$/i }));

    expect(toggleProperty).toHaveBeenCalledWith('x', true, 48);
    expect(toggleProperty).toHaveBeenCalledWith('y', true, 72);
    expect(toggleProperty).toHaveBeenCalledWith('translateZ', true, 0);
  });

  /** @description Including the grouped position row in screen mode must include X/Y/Z defaults together so 3D motion does not start half-owned. */
  it('calls toggleProperty(key, true, baseValue) for grouped position 3D keys', () => {
    const toggleProperty = vi.fn<(key: string, include: boolean, defaultValue: PropertyValue) => void>();
    const groupElementWithPosition = { ...GROUP_ELEMENT, x: 48, y: 72, translateZ: 11 };

    render(
      <AnimationModePropertiesPanel
        element={groupElementWithPosition}
        adapter={makeAdapter({
          isIncluded: (key) => key !== 'x' && key !== 'y' && key !== 'translateZ',
          toggleProperty,
        })}
        documentMode="screen"
        onUpdate={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /^include x \/ y \/ translate z$/i }));

    expect(toggleProperty).toHaveBeenCalledWith('x', true, 48);
    expect(toggleProperty).toHaveBeenCalledWith('y', true, 72);
    expect(toggleProperty).toHaveBeenCalledWith('translateZ', true, 11);
  });

  /** @description The remove button on a grouped row must only remove currently included keys, preserving partial x/y keyframe ownership. */
  it('calls toggleProperty(key, false, currentValue) only for included grouped keys', () => {
    const toggleProperty = vi.fn<(key: string, include: boolean, defaultValue: PropertyValue) => void>();
    const groupElementWithX = { ...GROUP_ELEMENT, x: 64, y: 72 };

    render(
      <AnimationModePropertiesPanel
        element={groupElementWithX}
        adapter={makeAdapter({
          isIncluded: (key) => key === 'x',
          getValue: (key) => (key === 'x' ? groupElementWithX.x : groupElementWithX.y),
          toggleProperty,
        })}
        documentMode="screen"
        onUpdate={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /^remove x \/ y \/ translate z$/i }));

    expect(toggleProperty).toHaveBeenCalledWith('x', false, groupElementWithX.x);
    expect(toggleProperty).not.toHaveBeenCalledWith('y', false, groupElementWithX.y);
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

  /** @description Targeted keyframe editing must name the child target in the animation-mode properties header. */
  it('labels the header with the targeted keyframe element name', () => {
    render(
      <AnimationModePropertiesPanel
        element={TEXT_ELEMENT}
        adapter={makeAdapter()}
        documentMode="screen"
        onUpdate={() => undefined}
        timelineName="Intro"
        keyframeName="Child Fade"
        keyframeTargetName="Lower Third Text"
      />,
    );

    expect(screen.getByText('Editing timeline Intro · keyframe Child Fade · target Lower Third Text')).toBeTruthy();
  });
});
