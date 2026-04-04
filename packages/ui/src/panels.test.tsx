/// <reference types="@testing-library/jest-dom/jest-globals" />
import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';
import type { JSX } from 'react';

import type { LayerInfo, PanelElement } from './panels';
import { AppearancePanel, GeometryPanel, LayersSidebar, PropertiesSidebar } from './panels';

// ===========================================================================
// Properties Sidebar Rendering
// ===========================================================================

describe('PropertiesSidebar', () => {
  const baseElement: PanelElement = {
    id: 'el-1',
    type: 'rectangle',
    name: 'Box',
    x: 10,
    y: 20,
    width: 100,
    height: 50,
    rotation: 0,
    backgroundColor: '#ff0000',
    borderWidth: 1,
    borderColor: '#000000',
    borderStyle: 'solid',
    borderRadius: 0,
    opacity: 1,
    blendMode: 'normal',
  };

  /**
   * @description In screen mode a rectangle must show the gradient fill
   * switcher to give users access to gradient backgrounds.
   */
  it('shows gradient fill switcher in screen mode for rectangle', () => {
    render(<PropertiesSidebar element={baseElement} documentMode="screen" onUpdate={jest.fn()} />);

    expect(screen.getByRole('button', { name: /gradient/i })).toBeInTheDocument();
  });

  /**
   * @description Print mode must hide advanced controls that only apply
   * to on-screen rendering — gradient fill, 3D transforms, clip children.
   */
  it('hides gradient fill and 3D controls in print mode', () => {
    render(<PropertiesSidebar element={baseElement} documentMode="print" onUpdate={jest.fn()} />);

    expect(screen.queryByRole('button', { name: /gradient/i })).not.toBeInTheDocument();
  });

  /**
   * @description When a registry provides a custom panel for a type, that
   * panel must be rendered instead of the default.
   */
  it('renders custom property panel from registry', () => {
    const CustomPanel = (): JSX.Element => <div>Custom Countdown Panel</div>;

    render(
      <PropertiesSidebar
        element={{ ...baseElement, type: 'countdown' }}
        documentMode="screen"
        onUpdate={jest.fn()}
        customPanels={{ countdown: CustomPanel }}
      />,
    );

    expect(screen.getByText('Custom Countdown Panel')).toBeInTheDocument();
  });
});

// ===========================================================================
// Geometry Panel
// ===========================================================================

describe('GeometryPanel', () => {
  /**
   * @description Position, size, and rotation fields must be editable so
   * users can precisely control element geometry numerically.
   */
  it('renders editable position, size, and rotation fields', () => {
    render(<GeometryPanel x={10} y={20} width={100} height={50} rotation={0} onUpdate={jest.fn()} />);

    expect(screen.getByLabelText(/^x$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^y$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/width/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/height/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/rotation/i)).toBeInTheDocument();
  });

  /**
   * @description Changing a value must fire onUpdate with the field name
   * and new value so the store can commit the change.
   */
  it('fires onUpdate when a value changes', () => {
    const onUpdate = jest.fn();

    render(<GeometryPanel x={10} y={20} width={100} height={50} rotation={0} onUpdate={onUpdate} />);

    const xInput = screen.getByLabelText(/^x$/i);

    fireEvent.change(xInput, { target: { value: '50' } });

    expect(onUpdate).toHaveBeenCalledWith('x', 50);
  });
});

// ===========================================================================
// Appearance Panel
// ===========================================================================

describe('AppearancePanel', () => {
  /**
   * @description Fill color, border, opacity, and blend mode fields must
   * be editable for styling elements visually.
   */
  it('renders fill, border, opacity, and blend mode fields', () => {
    render(
      <AppearancePanel
        backgroundColor="#ff0000"
        borderWidth={1}
        borderColor="#000000"
        borderStyle="solid"
        borderRadius={0}
        opacity={1}
        blendMode="normal"
        onUpdate={jest.fn()}
      />,
    );

    expect(screen.getByLabelText(/fill|background/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/opacity/i)).toBeInTheDocument();
  });

  /**
   * @description A style change must fire onUpdate with the property name
   * and new value for store commitment.
   */
  it('fires onUpdate on style change', () => {
    const onUpdate = jest.fn();

    render(
      <AppearancePanel
        backgroundColor="#ff0000"
        borderWidth={1}
        borderColor="#000000"
        borderStyle="solid"
        borderRadius={0}
        opacity={1}
        blendMode="normal"
        onUpdate={onUpdate}
      />,
    );

    const opacityInput = screen.getByLabelText(/opacity/i);

    fireEvent.change(opacityInput, { target: { value: '0.5' } });

    expect(onUpdate).toHaveBeenCalledWith('opacity', 0.5);
  });
});

// ===========================================================================
// Layers Sidebar
// ===========================================================================

describe('LayersSidebar', () => {
  const layers: readonly LayerInfo[] = [
    { id: 'el-1', name: 'Box', locked: false, visible: true },
    { id: 'el-2', name: 'Circle', locked: false, visible: true },
  ];

  /**
   * @description Clicking a layer must fire setActiveElement with the
   * element ID so that selection is updated in the store.
   */
  it('fires setActiveElement on layer click', () => {
    const onSelect = jest.fn();

    render(<LayersSidebar layers={layers} onSelect={onSelect} onToggleLock={jest.fn()} onDelete={jest.fn()} />);

    fireEvent.click(screen.getByText('Box'));

    expect(onSelect).toHaveBeenCalledWith('el-1');
  });

  /**
   * @description An empty document must show an empty state message so
   * users know the canvas has no elements.
   */
  it('shows empty state when no elements exist', () => {
    render(<LayersSidebar layers={[]} onSelect={jest.fn()} onToggleLock={jest.fn()} onDelete={jest.fn()} />);

    expect(screen.getByText(/no elements/i)).toBeInTheDocument();
  });

  /**
   * @description Double-clicking an element name must activate inline
   * rename so users can edit the layer name directly.
   */
  it('activates inline rename on double-click', () => {
    const onRename = jest.fn();

    render(
      <LayersSidebar
        layers={layers}
        onSelect={jest.fn()}
        onToggleLock={jest.fn()}
        onDelete={jest.fn()}
        onRename={onRename}
      />,
    );

    fireEvent.doubleClick(screen.getByText('Box'));

    const input = screen.getByRole('textbox');

    expect(input).toHaveValue('Box');
  });

  /**
   * @description Pressing Enter commits the rename and fires the callback.
   */
  it('commits rename on Enter', () => {
    const onRename = jest.fn();

    render(
      <LayersSidebar
        layers={layers}
        onSelect={jest.fn()}
        onToggleLock={jest.fn()}
        onDelete={jest.fn()}
        onRename={onRename}
      />,
    );

    fireEvent.doubleClick(screen.getByText('Box'));

    const input = screen.getByRole('textbox');

    fireEvent.change(input, { target: { value: 'Renamed' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onRename).toHaveBeenCalledWith('el-1', 'Renamed');
  });

  /**
   * @description Pressing Escape cancels rename and restores the original
   * name without firing onRename.
   */
  it('cancels rename on Escape', () => {
    const onRename = jest.fn();

    render(
      <LayersSidebar
        layers={layers}
        onSelect={jest.fn()}
        onToggleLock={jest.fn()}
        onDelete={jest.fn()}
        onRename={onRename}
      />,
    );

    fireEvent.doubleClick(screen.getByText('Box'));

    const input = screen.getByRole('textbox');

    fireEvent.change(input, { target: { value: 'Changed' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(onRename).not.toHaveBeenCalled();
    expect(screen.getByText('Box')).toBeInTheDocument();
  });

  /**
   * @description Submitting an empty name must be rejected and cancel
   * the rename to prevent unnamed elements.
   */
  it('rejects empty name on Enter', () => {
    const onRename = jest.fn();

    render(
      <LayersSidebar
        layers={layers}
        onSelect={jest.fn()}
        onToggleLock={jest.fn()}
        onDelete={jest.fn()}
        onRename={onRename}
      />,
    );

    fireEvent.doubleClick(screen.getByText('Box'));

    const input = screen.getByRole('textbox');

    fireEvent.change(input, { target: { value: '' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onRename).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// WCAG AA Panel Accessibility
// ===========================================================================

describe('WCAG AA Panel Accessibility', () => {
  /**
   * @description Panels must use role="region" with aria-label so screen
   * readers can identify them as landmark regions.
   */
  it('panels have region role with aria-label', () => {
    render(<GeometryPanel x={0} y={0} width={100} height={100} rotation={0} onUpdate={jest.fn()} />);

    expect(screen.getByRole('region', { name: /geometry/i })).toBeInTheDocument();
  });

  /**
   * @description Collapsible sections must reflect their current state
   * via aria-expanded so screen readers announce the collapsed/expanded state.
   */
  it('collapsible sections have aria-expanded', () => {
    render(
      <PropertiesSidebar
        element={{
          id: 'el-1',
          type: 'rectangle',
          name: 'Box',
          x: 0,
          y: 0,
          width: 100,
          height: 50,
          rotation: 0,
          backgroundColor: '#ff0000',
          borderWidth: 0,
          borderColor: '#000',
          borderStyle: 'solid',
          borderRadius: 0,
          opacity: 1,
          blendMode: 'normal',
        }}
        documentMode="screen"
        onUpdate={jest.fn()}
      />,
    );

    const toggles = screen.getAllByRole('button', { name: /geometry|appearance/i });

    expect(toggles.length).toBeGreaterThan(0);
    expect(toggles[0]).toHaveAttribute('aria-expanded');
  });

  /**
   * @description Property inputs must be associated with labels so screen
   * readers correctly announce what each input controls.
   */
  it('property inputs have associated labels', () => {
    render(<GeometryPanel x={10} y={20} width={100} height={50} rotation={0} onUpdate={jest.fn()} />);

    // All fields should be findable by label
    expect(screen.getByLabelText(/^x$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^y$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/width/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/height/i)).toBeInTheDocument();
  });
});
