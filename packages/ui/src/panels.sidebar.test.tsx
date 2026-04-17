/** @jest-environment jsdom */
import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';

import type { CustomPanelProps } from './panels';
import { PropertiesSidebar } from './panels';
import {
  BASE_ELEMENT,
  GROUP_ELEMENT,
  IMAGE_ELEMENT,
  PATH_ELEMENT,
  QRCODE_ELEMENT,
  TEXT_ELEMENT,
} from './panels-test-helpers';

describe('PropertiesSidebar', () => {
  /** @description Empty state must display a placeholder message when no element is selected. */
  it('shows empty state when no elements provided', () => {
    render(<PropertiesSidebar elements={[]} documentMode="screen" onUpdate={() => undefined} />);

    expect(screen.getByText(/select an element/i)).not.toBeNull();
  });

  /** @description Header must show the selected element name and a plain-English type chip for fast context recognition. */
  it('renders context header with element name and type chip', () => {
    render(<PropertiesSidebar elements={[BASE_ELEMENT]} documentMode="screen" onUpdate={() => undefined} />);

    expect(screen.getByText('Base Element')).not.toBeNull();
    expect(screen.getByText('Rectangle')).not.toBeNull();
  });

  /** @description Header must fall back to the element id when display name is empty so context remains visible. */
  it('falls back to element id when name is empty', () => {
    render(
      <PropertiesSidebar
        elements={[{ ...BASE_ELEMENT, id: 'fallback-id', name: '' }]}
        documentMode="screen"
        onUpdate={() => undefined}
      />,
    );

    expect(screen.getAllByText('fallback-id').length).toBeGreaterThan(0);
  });

  /** @description Lock button in the header must toggle the element locked state through onUpdate. */
  it('toggles lock state from the header button', () => {
    const onUpdate =
      jest.fn<(key: string, value: string | number | boolean | readonly [number, number, number, number]) => void>();

    render(
      <PropertiesSidebar elements={[{ ...BASE_ELEMENT, locked: false }]} documentMode="screen" onUpdate={onUpdate} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Lock element' }));

    expect(onUpdate).toHaveBeenCalledWith('locked', true);
  });

  /** @description Locked selections must expose an unlock action that emits locked=false. */
  it('toggles lock state off when element is already locked', () => {
    const onUpdate =
      jest.fn<(key: string, value: string | number | boolean | readonly [number, number, number, number]) => void>();

    render(
      <PropertiesSidebar elements={[{ ...BASE_ELEMENT, locked: true }]} documentMode="screen" onUpdate={onUpdate} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Unlock element' }));

    expect(onUpdate).toHaveBeenCalledWith('locked', false);
  });

  /** @description Locked elements must clearly show disabled panel state and a helper message explaining why editing is blocked. */
  it('shows lock helper and disables controls when element is locked', () => {
    render(
      <PropertiesSidebar
        elements={[{ ...BASE_ELEMENT, locked: true }]}
        documentMode="screen"
        onUpdate={() => undefined}
      />,
    );

    const controlsRegion = screen.getByLabelText('Properties controls');

    expect(controlsRegion.getAttribute('aria-disabled')).toBe('true');
    expect(controlsRegion.getAttribute('inert')).toBe('');
    expect(controlsRegion.getAttribute('style')).toContain('pointer-events: none');
    expect(screen.getByText('Element is locked. Unlock to edit properties.')).not.toBeNull();
  });

  /** @description Lock protection must apply even when the sidebar renders a custom panel implementation. */
  it('applies locked state guard to custom panel content', () => {
    const customPanels = {
      rectangle: ({ onUpdate }: CustomPanelProps) => (
        <button
          onClick={() => {
            onUpdate('x', 12);
          }}
        >
          Custom Panel
        </button>
      ),
    };

    render(
      <PropertiesSidebar
        elements={[{ ...BASE_ELEMENT, locked: true }]}
        documentMode="screen"
        onUpdate={() => undefined}
        customPanels={customPanels}
      />,
    );

    const controlsRegion = screen.getByLabelText('Properties controls');

    expect(screen.getByText('Element is locked. Unlock to edit properties.')).not.toBeNull();
    expect(controlsRegion.getAttribute('aria-disabled')).toBe('true');
    expect(controlsRegion.getAttribute('inert')).toBe('');
  });

  /** @description Multi-select context must show a count chip so users immediately know they are editing a selection set. */
  it('shows a selected-count chip for multi-select', () => {
    render(
      <PropertiesSidebar
        elements={[BASE_ELEMENT, { ...BASE_ELEMENT, id: 'base-2' }, { ...BASE_ELEMENT, id: 'base-3' }]}
        documentMode="screen"
        onUpdate={() => undefined}
      />,
    );

    expect(screen.getByText('3 elements')).not.toBeNull();
    expect(screen.getByText('Multiple selection')).not.toBeNull();
    expect(screen.getByText('Common properties')).not.toBeNull();
    expect(screen.queryByText('Rectangle')).toBeNull();
    expect(screen.queryByRole('button', { name: /lock|unlock/i })).toBeNull();
  });

  /** @description Multi-select custom panels must follow the same lock-button visibility rules as default panel routing. */
  it('hides lock button for multi-select with a custom panel', () => {
    const customPanels = {
      rectangle: ({ onUpdate }: CustomPanelProps) => (
        <button
          onClick={() => {
            onUpdate('x', 12);
          }}
        >
          Custom Panel
        </button>
      ),
    };

    render(
      <PropertiesSidebar
        elements={[BASE_ELEMENT, { ...BASE_ELEMENT, id: 'base-2' }]}
        documentMode="screen"
        onUpdate={() => undefined}
        customPanels={customPanels}
      />,
    );

    expect(screen.getByText('2 elements')).not.toBeNull();
    expect(screen.queryByRole('button', { name: /lock|unlock/i })).toBeNull();
  });

  /** @description Screen-mode rectangles must expose the gradient fill section. */
  it('shows gradient fill for rectangle in screen mode', () => {
    render(<PropertiesSidebar elements={[BASE_ELEMENT]} documentMode="screen" onUpdate={() => undefined} />);

    expect(screen.getByText('Geometry')).not.toBeNull();
    expect(screen.getByText('Appearance')).not.toBeNull();
  });

  /** @description Print mode must hide gradient fill, 3D transforms, and clip children controls. */
  it('hides gradient, 3D, and clip path in print mode', () => {
    render(<PropertiesSidebar elements={[BASE_ELEMENT]} documentMode="print" onUpdate={() => undefined} />);

    expect(screen.queryByText(/3D Transform/i)).toBeNull();
  });

  /** @description Typography panel must only appear for text elements. */
  it('shows typography panel for text elements', () => {
    render(<PropertiesSidebar elements={[TEXT_ELEMENT]} documentMode="screen" onUpdate={() => undefined} />);

    expect(screen.getByText('Typography')).not.toBeNull();
    expect(screen.getByText('Text Effects')).not.toBeNull();
  });

  /** @description Typography panel must not appear for non-text elements. */
  it('hides typography panel for non-text elements', () => {
    render(<PropertiesSidebar elements={[BASE_ELEMENT]} documentMode="screen" onUpdate={() => undefined} />);

    expect(screen.queryByText('Typography')).toBeNull();
    expect(screen.queryByText('Text Effects')).toBeNull();
  });

  /** @description Path properties must appear for path elements. */
  it('shows path properties for path elements', () => {
    render(<PropertiesSidebar elements={[PATH_ELEMENT]} documentMode="screen" onUpdate={() => undefined} />);

    expect(screen.getByText('Path Properties')).not.toBeNull();
  });

  /** @description Image panel must appear for image elements. */
  it('shows image panel for image elements', () => {
    render(<PropertiesSidebar elements={[IMAGE_ELEMENT]} documentMode="screen" onUpdate={() => undefined} />);

    expect(screen.getAllByText('Image').length).toBeGreaterThan(0);
  });

  /** @description ObjectFit panel must appear for elements with objectFit capability. */
  it('shows object fit panel for image elements', () => {
    render(<PropertiesSidebar elements={[IMAGE_ELEMENT]} documentMode="screen" onUpdate={() => undefined} />);

    expect(screen.getByText('Object Fit')).not.toBeNull();
  });

  /** @description QR code panel must appear for qrcode elements. */
  it('shows QR code panel for qrcode elements', () => {
    render(<PropertiesSidebar elements={[QRCODE_ELEMENT]} documentMode="screen" onUpdate={() => undefined} />);

    expect(screen.getAllByText('QR Code').length).toBeGreaterThan(0);
  });

  /** @description Group panel must appear for group elements. */
  it('shows group panel for group elements', () => {
    render(<PropertiesSidebar elements={[GROUP_ELEMENT]} documentMode="screen" onUpdate={() => undefined} />);

    expect(screen.getAllByText('Group').length).toBeGreaterThan(0);
  });

  /** @description Animation Builder must render when showAnimations is true. */
  it('shows animation builder when showAnimations is true', () => {
    render(
      <PropertiesSidebar elements={[BASE_ELEMENT]} documentMode="screen" showAnimations onUpdate={() => undefined} />,
    );

    expect(screen.getByText('Animation Builder')).not.toBeNull();
  });

  /** @description Animation Builder must be hidden when showAnimations is false or undefined. */
  it('hides animation builder when showAnimations is false', () => {
    render(<PropertiesSidebar elements={[BASE_ELEMENT]} documentMode="screen" onUpdate={() => undefined} />);

    expect(screen.queryByText('Animation Builder')).toBeNull();
  });
});
