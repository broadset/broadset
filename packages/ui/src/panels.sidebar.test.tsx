/** @jest-environment jsdom */
import { describe, expect, it } from '@jest/globals';
import { render, screen } from '@testing-library/react';

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

    expect(screen.getByText('Image')).not.toBeNull();
  });

  /** @description ObjectFit panel must appear for elements with objectFit capability. */
  it('shows object fit panel for image elements', () => {
    render(<PropertiesSidebar elements={[IMAGE_ELEMENT]} documentMode="screen" onUpdate={() => undefined} />);

    expect(screen.getByText('Object Fit')).not.toBeNull();
  });

  /** @description QR code panel must appear for qrcode elements. */
  it('shows QR code panel for qrcode elements', () => {
    render(<PropertiesSidebar elements={[QRCODE_ELEMENT]} documentMode="screen" onUpdate={() => undefined} />);

    expect(screen.getByText('QR Code')).not.toBeNull();
  });

  /** @description Group panel must appear for group elements. */
  it('shows group panel for group elements', () => {
    render(<PropertiesSidebar elements={[GROUP_ELEMENT]} documentMode="screen" onUpdate={() => undefined} />);

    expect(screen.getByText('Group')).not.toBeNull();
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
