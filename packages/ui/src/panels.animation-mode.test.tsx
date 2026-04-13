/** @jest-environment jsdom */
import { describe, expect, it, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react';

import type { PropertyFieldAdapter } from './panels';
import { AnimationModePropertiesPanel } from './panels';
import { GROUP_ELEMENT, TEXT_ELEMENT } from './panels-test-helpers';

describe('AnimationModePropertiesPanel', () => {
  /** @description When a keyframe is selected, AnimationModePropertiesPanel must render with the adapter active. */
  it('renders with PropertyEditingProvider when adapter is provided', () => {
    const adapter: PropertyFieldAdapter = {
      isIncluded: (key: string) => key === 'x',
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
      />,
    );

    expect(screen.getByText('Geometry')).not.toBeNull();
    expect(screen.getByText('Typography')).not.toBeNull();
  });

  /** @description Animation builder and group settings must not render in animation mode. */
  it('does not render animation builder in animation mode', () => {
    render(
      <AnimationModePropertiesPanel
        element={GROUP_ELEMENT}
        adapter={{
          isIncluded: () => false,
          getValue: () => 0,
          toggleProperty: jest.fn(),
          updateValue: jest.fn(),
        }}
        documentMode="screen"
        onUpdate={() => undefined}
      />,
    );

    expect(screen.queryByText(/animation/i)).toBeNull();
    expect(screen.queryByText(/group/i)).toBeNull();
  });
});
