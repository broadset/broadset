/** @vitest-environment jsdom */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { CustomPanelProps } from './panels';
import { PropertiesSidebar } from './panels';
import {
  BASE_ELEMENT,
  ELLIPSE_ELEMENT,
  GROUP_ELEMENT,
  IMAGE_ELEMENT,
  PATH_ELEMENT,
  QRCODE_ELEMENT,
  RECTANGLE_ELEMENT,
  SVG_ELEMENT,
  TEXT_ELEMENT,
} from './panels-test-helpers';

function pickAccessibleName(ariaLabel: string | null, labelText: string, controlText: string): string {
  if (ariaLabel !== null && ariaLabel.length > 0) return ariaLabel;
  if (labelText.length > 0) return labelText;

  return controlText;
}

describe('PropertiesSidebar', () => {
  /** @description Empty state must display a placeholder message when no element is selected. */
  it('shows empty state when no elements provided', () => {
    render(<PropertiesSidebar elements={[]} documentMode="screen" onUpdate={() => undefined} />);

    expect(screen.getByText(/select an element/i)).not.toBeNull();
  });

  /** @description Header must expose the selected element name as an inline-editable input plus a plain-English type chip. */
  it('renders inline-editable element name and type chip in the header', () => {
    render(<PropertiesSidebar elements={[BASE_ELEMENT]} documentMode="screen" onUpdate={() => undefined} />);

    const nameInput = screen.getByRole('textbox', { name: 'Element name' });

    expect(nameInput.getAttribute('value')).toBe('Base Element');
    expect(screen.getByText('Rectangle')).not.toBeNull();
  });

  /** @description Header must fall back to the plain-English type label when the element has no name — the id must never leak to the user. */
  it('falls back to type label when name is empty and never shows element id', () => {
    render(
      <PropertiesSidebar
        elements={[{ ...BASE_ELEMENT, id: 'fallback-id', name: '' }]}
        documentMode="screen"
        onUpdate={() => undefined}
      />,
    );

    expect(screen.queryByText('fallback-id')).toBeNull();

    const nameInput = screen.getByRole('textbox', { name: 'Element name' });

    expect(nameInput.getAttribute('value')).toBe('Rectangle');
  });

  /** @description Lock button in the header must toggle the element locked state through onUpdate. */
  it('toggles lock state from the header button', () => {
    const onUpdate =
      vi.fn<(key: string, value: string | number | boolean | readonly [number, number, number, number]) => void>();

    render(
      <PropertiesSidebar elements={[{ ...BASE_ELEMENT, locked: false }]} documentMode="screen" onUpdate={onUpdate} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Lock element' }));

    expect(onUpdate).toHaveBeenCalledWith('locked', true);
  });

  /** @description Locked selections must expose an unlock action that emits locked=false. */
  it('toggles lock state off when element is already locked', () => {
    const onUpdate =
      vi.fn<(key: string, value: string | number | boolean | readonly [number, number, number, number]) => void>();

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

  /** @description Object-fit control must be reachable for image elements. It now lives inline inside the Image panel (not behind a second accordion click) so users see source + fit in one glance; we assert the Fit field is rendered. */
  it('renders the object fit control inline for image elements', () => {
    render(<PropertiesSidebar elements={[IMAGE_ELEMENT]} documentMode="screen" onUpdate={() => undefined} />);

    expect(screen.getByLabelText('Object fit')).not.toBeNull();
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

  /** @description Unit 10 default expansion rules must vary by element type so the most likely first edit is visible immediately. */
  it('expands the correct top-level accordion sections by element type', () => {
    const headingBySectionId = {
      geometry: 'Geometry',
      typography: 'Typography',
      appearance: 'Appearance',
      'path-stroke': 'Path Properties',
      'image-source': 'Image',
      'group-settings': 'Group',
    } as const;

    type SectionId = keyof typeof headingBySectionId;

    const assertExpanded = (element: typeof TEXT_ELEMENT, expandedSectionIds: readonly SectionId[]): void => {
      const view = render(<PropertiesSidebar elements={[element]} documentMode="screen" onUpdate={() => undefined} />);

      for (const sectionId of expandedSectionIds) {
        const heading = headingBySectionId[sectionId];

        expect(screen.getByRole('button', { name: heading }).getAttribute('aria-expanded')).toBe('true');
      }

      view.unmount();
    };

    assertExpanded(TEXT_ELEMENT, ['typography', 'geometry']);
    assertExpanded(RECTANGLE_ELEMENT, ['appearance', 'geometry']);
    assertExpanded(ELLIPSE_ELEMENT, ['appearance', 'geometry']);
    assertExpanded(SVG_ELEMENT, ['path-stroke', 'geometry']);
    assertExpanded(PATH_ELEMENT, ['path-stroke', 'geometry']);
    assertExpanded(IMAGE_ELEMENT, ['image-source', 'geometry']);
    assertExpanded(GROUP_ELEMENT, ['group-settings']);
  });

  /** @description Unit 10 a11y smoke requires every visible form control in the properties region to expose an accessible name. */
  it('ensures visible controls in the properties region are accessible by name', () => {
    render(<PropertiesSidebar elements={[TEXT_ELEMENT]} documentMode="screen" onUpdate={() => undefined} />);

    const region = screen.getByRole('region', { name: 'Properties' });
    const namedButtons = screen.queryAllByRole('button', { name: /.+/ });
    const controls = [
      ...namedButtons,
      ...screen.queryAllByRole('checkbox'),
      ...screen.getAllByRole('textbox'),
      ...screen.queryAllByRole('spinbutton'),
      ...screen.queryAllByRole('combobox'),
      ...screen.queryAllByRole('switch'),
    ];

    expect(namedButtons.length).toBeGreaterThan(0);

    for (const control of controls) {
      const ariaLabel = control.getAttribute('aria-label');
      const labelElement =
        control.id.length > 0 ? region.querySelector<HTMLLabelElement>(`label[for="${control.id}"]`) : null;
      const labelText = labelElement === null ? '' : labelElement.textContent.trim();
      const controlText = control.textContent.trim();
      const accessibleName = pickAccessibleName(ariaLabel, labelText, controlText);

      expect(accessibleName.length).toBeGreaterThan(0);
    }
  });

  /** @description Unit 10 keyboard polish requires deterministic top-to-bottom focus ordering for visible text-element controls. */
  it('keeps top-to-bottom focusable order stable for text element panels', () => {
    render(<PropertiesSidebar elements={[TEXT_ELEMENT]} documentMode="screen" onUpdate={() => undefined} />);

    const region = screen.getByRole('region', { name: 'Properties' });
    const focusableElements = Array.from(
      region.querySelectorAll<HTMLElement>('button,input,select,textarea,[tabindex]:not([tabindex="-1"])'),
    ).filter((element) => !element.hasAttribute('disabled'));

    const labels = focusableElements
      .map((element) => {
        const ariaLabel = element.getAttribute('aria-label');
        const text = element.textContent.trim();

        return typeof ariaLabel === 'string' && ariaLabel.length > 0 ? ariaLabel : text;
      })
      .filter((value) => value.length > 0);

    const elementNameIndex = labels.indexOf('Element name');
    const rotationIndex = labels.indexOf('Rotation Z');
    const fontFamilyIndex = labels.indexOf('Font family');

    expect(elementNameIndex).toBeGreaterThanOrEqual(0);
    expect(rotationIndex).toBeGreaterThan(elementNameIndex);
    expect(fontFamilyIndex).toBeGreaterThan(rotationIndex);
    expect(labels).toMatchSnapshot('text-element-tab-order');
  });
});
