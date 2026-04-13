/** @jest-environment jsdom */
import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';

import type { PropertyValue } from './panels';
import { GeometryPanel } from './panels';

describe('GeometryPanel', () => {
  /** @description Position, size, and rotation fields are the core property controls and must report changes as numbers for real-time canvas updates. */
  it('renders all geometry fields and reports numeric updates', () => {
    const onUpdate = jest.fn<(key: string, value: PropertyValue) => void>();

    render(
      <GeometryPanel x={10} y={20} width={100} height={50} rotation={5} onUpdate={onUpdate} documentMode="screen" />,
    );

    const xInput = screen.getByRole('textbox', { name: 'X' });

    fireEvent.change(xInput, { target: { value: '42' } });
    fireEvent.blur(xInput);

    expect(screen.getByRole('textbox', { name: 'Width' })).not.toBeNull();
    expect(screen.getByRole('textbox', { name: 'Rotation' })).not.toBeNull();
    expect(onUpdate).toHaveBeenCalledWith('x', 42);
  });

  /** @description Print mode must hide 3D transform fields (rotateX/Y/Z, translateZ) since 3D transforms are screen-only. */
  it('hides 3D transform fields in print mode', () => {
    render(
      <GeometryPanel
        x={0}
        y={0}
        width={100}
        height={100}
        rotation={0}
        rotateX={10}
        rotateY={20}
        rotateZ={30}
        translateZ={5}
        onUpdate={() => undefined}
        documentMode="print"
      />,
    );

    expect(screen.queryByRole('textbox', { name: /Rotate X/i })).toBeNull();
    expect(screen.queryByRole('textbox', { name: /Rotate Y/i })).toBeNull();
    expect(screen.queryByRole('textbox', { name: /Translate Z/i })).toBeNull();
  });

  /** @description Screen mode must show 3D transform fields for spatial transforms. */
  it('renders 3D transform fields in screen mode when provided', () => {
    render(
      <GeometryPanel
        x={0}
        y={0}
        width={100}
        height={100}
        rotation={0}
        rotateX={10}
        rotateY={20}
        rotateZ={30}
        translateZ={5}
        onUpdate={() => undefined}
        documentMode="screen"
      />,
    );

    expect(screen.getByRole('textbox', { name: /Rotate X/i })).not.toBeNull();
    expect(screen.getByRole('textbox', { name: /Rotate Y/i })).not.toBeNull();
    expect(screen.getByRole('textbox', { name: /Translate Z/i })).not.toBeNull();
  });

  /** @description Width and height must be clamped to a minimum displayed value of 0.1 to prevent zero-size elements. */
  it('clamps width and height display to minimum 0.1', () => {
    render(
      <GeometryPanel x={0} y={0} width={0} height={0} rotation={0} onUpdate={() => undefined} documentMode="screen" />,
    );

    const widthInput = screen.getByRole('textbox', { name: 'Width' });
    const heightInput = screen.getByRole('textbox', { name: 'Height' });

    expect(Number(widthInput.getAttribute('value'))).toBeGreaterThanOrEqual(0.1);
    expect(Number(heightInput.getAttribute('value'))).toBeGreaterThanOrEqual(0.1);
  });

  /** @description Anchor-relative positioning: right anchor should display position from right edge. */
  it('displays right-anchored X relative to canvas right edge', () => {
    const onUpdate = jest.fn<(key: string, value: PropertyValue) => void>();

    render(
      <GeometryPanel
        x={100}
        y={0}
        width={80}
        height={50}
        rotation={0}
        anchorX="right"
        canvasWidth={1920}
        onUpdate={onUpdate}
        documentMode="screen"
      />,
    );

    // Expected: 1920 - 100 - 80 = 1740
    const xInput = screen.getByRole('textbox', { name: /X/i });

    expect((xInput.getAttribute('value') ?? '').replace(/,/g, '')).toBe('1740');
  });

  /** @description Anchor-relative positioning: bottom anchor should display position from bottom edge. */
  it('displays bottom-anchored Y relative to canvas bottom edge', () => {
    render(
      <GeometryPanel
        x={0}
        y={200}
        width={100}
        height={50}
        rotation={0}
        anchorY="bottom"
        canvasHeight={1080}
        onUpdate={() => undefined}
        documentMode="screen"
      />,
    );

    // Expected: 1080 - 200 - 50 = 830
    const yInput = screen.getByRole('textbox', { name: /Y/i });

    expect((yInput.getAttribute('value') ?? '').replace(/,/g, '')).toBe('830');
  });
});
