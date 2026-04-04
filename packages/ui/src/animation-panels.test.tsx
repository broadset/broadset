/// <reference types="@testing-library/jest-dom/jest-globals" />
import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';
import type { JSX } from 'react';

import type { AnimationBuilderProps, AnimationSidebarProps, KeyframeAdapter } from './animation-panels';
import {
  AnimationBuilder,
  AnimationModePropertiesPanel,
  AnimationSidebar,
  PropertyEditingProvider,
  PropertyField,
  usePropertyEditing,
} from './animation-panels';

// ===========================================================================
// Animation Sidebar
// ===========================================================================

describe('AnimationSidebar', () => {
  const baseProps: AnimationSidebarProps = {
    elementId: 'el-1',
    animationsEnabled: true,
    locked: false,
    config: {
      timelines: [],
      stateTimelineBindings: [],
      modifierTimelineBindings: [],
    },
  };

  /**
   * @description When an element is selected and animations are enabled,
   * the animation builder must be shown so users can edit animation config.
   */
  it('shows animation builder when element selected and animations enabled', () => {
    render(<AnimationSidebar {...baseProps} />);

    expect(screen.getByRole('region', { name: /animation/i })).toBeInTheDocument();
    expect(screen.queryByText(/no element selected/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/animations.*disabled/i)).not.toBeInTheDocument();
  });

  /**
   * @description When no element is selected, an empty state must be shown
   * instead of the animation builder.
   */
  it('shows empty state when no element is selected', () => {
    render(<AnimationSidebar {...baseProps} elementId={null} />);

    expect(screen.getByText(/no element selected/i)).toBeInTheDocument();
  });

  /**
   * @description When the animation feature is disabled, a disabled state
   * message must be shown instead of the builder.
   */
  it('shows disabled state when animations are off', () => {
    render(<AnimationSidebar {...baseProps} animationsEnabled={false} />);

    expect(screen.getByText(/animations.*disabled/i)).toBeInTheDocument();
  });

  /**
   * @description When the selected element is locked, a helper text must
   * appear informing the user that the element is locked.
   */
  it('shows lock helper text when element is locked', () => {
    render(<AnimationSidebar {...baseProps} locked={true} />);

    expect(screen.getByText(/locked/i)).toBeInTheDocument();
  });
});

// ===========================================================================
// Animation Builder Resilience
// ===========================================================================

describe('AnimationBuilder', () => {
  /**
   * @description A partial or malformed animation config must not crash
   * the builder — it should render gracefully with whatever data is available.
   */
  it('does not crash with partial config', () => {
    const partialConfig = { timelines: [] } as AnimationBuilderProps['config'];

    expect(() => {
      render(<AnimationBuilder config={partialConfig} />);
    }).not.toThrow();
  });

  /**
   * @description An undefined config must not crash the builder — it should
   * render an empty state instead.
   */
  it('does not crash with undefined config', () => {
    expect(() => {
      render(<AnimationBuilder config={undefined} />);
    }).not.toThrow();
  });

  /**
   * @description A well-formed config with timelines must render the
   * timeline names so the user can see which animations exist.
   */
  it('renders timeline names from a well-formed config', () => {
    const config: AnimationBuilderProps['config'] = {
      timelines: [
        { id: 't-1', name: 'Entrance', entries: [] },
        { id: 't-2', name: 'Exit', entries: [] },
      ],
      stateTimelineBindings: [],
      modifierTimelineBindings: [],
    };

    render(<AnimationBuilder config={config} />);

    expect(screen.getByText('Entrance')).toBeInTheDocument();
    expect(screen.getByText('Exit')).toBeInTheDocument();
  });
});

// ===========================================================================
// PropertyField — Normal Mode
// ===========================================================================

describe('PropertyField', () => {
  /**
   * @description In normal mode (no keyframe adapter), PropertyField must
   * render its children directly without any keyframe controls.
   */
  it('renders children directly in normal mode', () => {
    render(
      <PropertyField propertyKey="x">
        <span>X value input</span>
      </PropertyField>,
    );

    expect(screen.getByText('X value input')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /include/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument();
  });

  /**
   * @description In keyframe mode with the property included, PropertyField
   * must show a remove button and render children (editable).
   */
  it('shows remove button when property is included in keyframe', () => {
    const adapter: KeyframeAdapter = {
      isIncluded: jest.fn((key: string) => key === 'x'),
      getValue: jest.fn(() => 100),
      toggleProperty: jest.fn(),
      updateValue: jest.fn(),
    };

    render(
      <PropertyEditingProvider adapter={adapter}>
        <PropertyField propertyKey="x">
          <span>X value input</span>
        </PropertyField>
      </PropertyEditingProvider>,
    );

    expect(screen.getByText('X value input')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /remove/i })).toBeInTheDocument();
  });

  /**
   * @description In keyframe mode with the property NOT included, PropertyField
   * must show an include button and render children as disabled.
   */
  it('shows include button when property is not included in keyframe', () => {
    const adapter: KeyframeAdapter = {
      isIncluded: jest.fn(() => false),
      getValue: jest.fn(() => undefined),
      toggleProperty: jest.fn(),
      updateValue: jest.fn(),
    };

    render(
      <PropertyEditingProvider adapter={adapter}>
        <PropertyField propertyKey="opacity">
          <span>Opacity input</span>
        </PropertyField>
      </PropertyEditingProvider>,
    );

    expect(screen.getByRole('button', { name: /include/i })).toBeInTheDocument();
  });

  /**
   * @description Clicking include must call toggleProperty(key, true, defaultValue)
   * to add the property to the keyframe.
   */
  it('calls toggleProperty with included=true on include click', () => {
    const adapter: KeyframeAdapter = {
      isIncluded: jest.fn(() => false),
      getValue: jest.fn(() => undefined),
      toggleProperty: jest.fn(),
      updateValue: jest.fn(),
    };

    render(
      <PropertyEditingProvider adapter={adapter}>
        <PropertyField propertyKey="width" defaultValue={200}>
          <span>Width input</span>
        </PropertyField>
      </PropertyEditingProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /include/i }));

    expect(adapter.toggleProperty).toHaveBeenCalledWith('width', true, 200);
  });

  /**
   * @description Clicking remove must call toggleProperty(key, false, defaultValue)
   * to remove the property from the keyframe.
   */
  it('calls toggleProperty with included=false on remove click', () => {
    const adapter: KeyframeAdapter = {
      isIncluded: jest.fn((key: string) => key === 'height'),
      getValue: jest.fn(() => 300),
      toggleProperty: jest.fn(),
      updateValue: jest.fn(),
    };

    render(
      <PropertyEditingProvider adapter={adapter}>
        <PropertyField propertyKey="height" defaultValue={300}>
          <span>Height input</span>
        </PropertyField>
      </PropertyEditingProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /remove/i }));

    expect(adapter.toggleProperty).toHaveBeenCalledWith('height', false, 300);
  });
});

// ===========================================================================
// AnimationModePropertiesPanel + PropertyEditingProvider
// ===========================================================================

describe('AnimationModePropertiesPanel', () => {
  /**
   * @description When a keyframe is selected, AnimationModePropertiesPanel
   * must be rendered with the adapter available through context.
   */
  it('renders with PropertyEditingProvider wrapping content', () => {
    const adapter: KeyframeAdapter = {
      isIncluded: jest.fn(() => true),
      getValue: jest.fn(() => 50),
      toggleProperty: jest.fn(),
      updateValue: jest.fn(),
    };

    render(
      <AnimationModePropertiesPanel adapter={adapter}>
        <span>Keyframe properties</span>
      </AnimationModePropertiesPanel>,
    );

    expect(screen.getByText('Keyframe properties')).toBeInTheDocument();
  });

  /**
   * @description The adapter must be accessible through the usePropertyEditing
   * hook when rendered inside AnimationModePropertiesPanel.
   */
  it('provides adapter through usePropertyEditing hook', () => {
    const adapter: KeyframeAdapter = {
      isIncluded: jest.fn(() => true),
      getValue: jest.fn(() => 42),
      toggleProperty: jest.fn(),
      updateValue: jest.fn(),
    };

    const Consumer = (): JSX.Element => {
      const ctx = usePropertyEditing();

      return <span data-testid="value">{ctx ? String(ctx.getValue('x')) : 'no-ctx'}</span>;
    };

    render(
      <AnimationModePropertiesPanel adapter={adapter}>
        <Consumer />
      </AnimationModePropertiesPanel>,
    );

    expect(screen.getByTestId('value').textContent).toBe('42');
  });

  /**
   * @description Outside a PropertyEditingProvider, usePropertyEditing
   * must return null so components can detect normal mode.
   */
  it('returns null from usePropertyEditing outside provider', () => {
    const Consumer = (): JSX.Element => {
      const ctx = usePropertyEditing();

      return <span data-testid="result">{ctx === null ? 'null' : 'not-null'}</span>;
    };

    render(<Consumer />);

    expect(screen.getByTestId('result').textContent).toBe('null');
  });
});
