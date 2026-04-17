/** @jest-environment jsdom */
import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';

import type { PropertyValue } from './panels';
import { GeometryPanel } from './panels';

describe('GeometryPanel', () => {
  /** @description Geometry labels must include document units and numeric edits must still emit numeric model updates. */
  it('renders geometry fields with unit labels and reports numeric updates', () => {
    const onUpdate = jest.fn<(key: string, value: PropertyValue) => void>();

    render(
      <GeometryPanel
        x={10}
        y={20}
        width={100}
        height={50}
        rotation={5}
        documentUnit="mm"
        onUpdate={onUpdate}
        documentMode="screen"
      />,
    );

    const xInput = screen.getByRole('textbox', { name: 'X (mm)' });

    fireEvent.change(xInput, { target: { value: '42' } });
    fireEvent.blur(xInput);

    expect(screen.getByRole('textbox', { name: 'Width (mm)' })).not.toBeNull();
    expect(screen.getByRole('textbox', { name: 'Rotation' })).not.toBeNull();
    expect(onUpdate).toHaveBeenCalledWith('x', 42);
  });

  /** @description Element name editing must commit through onUpdate on blur and Enter for keyboard and pointer workflows. */
  it('commits element name on blur and Enter', () => {
    const onUpdate = jest.fn<(key: string, value: PropertyValue) => void>();

    render(
      <GeometryPanel
        name="Hero Title"
        x={0}
        y={0}
        width={100}
        height={50}
        rotation={0}
        onUpdate={onUpdate}
        documentMode="screen"
      />,
    );

    const nameInput = screen.getByRole('textbox', { name: 'Element name' });

    fireEvent.change(nameInput, { target: { value: 'Updated Title' } });
    fireEvent.keyDown(nameInput, { key: 'Enter' });
    fireEvent.blur(nameInput);

    expect(onUpdate).toHaveBeenCalledWith('name', 'Updated Title');
  });

  /** @description Print mode must hide the entire 3D transform disclosure because 3D controls are screen-only. */
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

    expect(screen.queryByRole('button', { name: '3D transform' })).toBeNull();
    expect(screen.queryByRole('textbox', { name: /Rotate X/i })).toBeNull();
    expect(screen.queryByRole('textbox', { name: /Rotate Y/i })).toBeNull();
    expect(screen.queryByRole('textbox', { name: /Translate Z/i })).toBeNull();
  });

  /** @description 3D controls must be collapsed by default in screen mode and only render after opening the disclosure. */
  it('keeps 3D controls collapsed by default and reveals them when disclosure opens', () => {
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

    const disclosureToggle = screen.getByRole('button', { name: '3D transform' });

    expect(screen.queryByRole('textbox', { name: /Rotate X/i })).toBeNull();
    fireEvent.click(disclosureToggle);

    expect(screen.getByRole('textbox', { name: /Rotate X/i })).not.toBeNull();
    expect(screen.getByRole('textbox', { name: /Rotate Y/i })).not.toBeNull();
    expect(screen.getByRole('textbox', { name: /Translate Z/i })).not.toBeNull();
  });

  /** @description Width and height must be clamped to a minimum displayed value of 0.1 to prevent zero-size elements. */
  it('clamps width and height display to minimum 0.1', () => {
    render(
      <GeometryPanel x={0} y={0} width={0} height={0} rotation={0} onUpdate={() => undefined} documentMode="screen" />,
    );

    const widthInput = screen.getByRole('textbox', { name: 'Width (px)' });
    const heightInput = screen.getByRole('textbox', { name: 'Height (px)' });

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
        documentUnit="mm"
        onUpdate={onUpdate}
        documentMode="screen"
      />,
    );

    // Expected: 1920 - 100 - 80 = 1740
    const xInput = screen.getByRole('textbox', { name: 'X (Right mm)' });

    expect((xInput.getAttribute('value') ?? '').replace(/,/g, '')).toBe('1740');

    fireEvent.change(xInput, { target: { value: '1700' } });
    fireEvent.blur(xInput);

    // Expected converted model x: 1920 - 1700 - 80 = 140
    expect(onUpdate).toHaveBeenCalledWith('x', 140);
  });

  /** @description Anchor-relative positioning: bottom anchor should display position from bottom edge. */
  it('displays and commits bottom-anchored Y relative to canvas bottom edge', () => {
    const onUpdate = jest.fn<(key: string, value: PropertyValue) => void>();

    render(
      <GeometryPanel
        x={0}
        y={200}
        width={100}
        height={50}
        rotation={0}
        anchorY="bottom"
        canvasHeight={1080}
        documentUnit="in"
        onUpdate={onUpdate}
        documentMode="screen"
      />,
    );

    // Expected: 1080 - 200 - 50 = 830
    const yInput = screen.getByRole('textbox', { name: 'Y (Bottom in)' });

    expect((yInput.getAttribute('value') ?? '').replace(/,/g, '')).toBe('830');

    fireEvent.change(yInput, { target: { value: '820' } });
    fireEvent.blur(yInput);

    // Expected converted model y: 1080 - 820 - 50 = 210
    expect(onUpdate).toHaveBeenCalledWith('y', 210);
  });

  /** @description Anchor toggles must emit anchor mode updates so users can switch left/right and top/bottom positioning semantics. */
  it('emits anchor mode changes from anchor toggle controls', () => {
    const onUpdate = jest.fn<(key: string, value: PropertyValue) => void>();

    render(
      <GeometryPanel
        x={0}
        y={0}
        width={100}
        height={50}
        rotation={0}
        anchorX="left"
        anchorY="top"
        onUpdate={onUpdate}
        documentMode="screen"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Anchor X Right' }));
    fireEvent.click(screen.getByRole('button', { name: 'Anchor Y Bottom' }));

    expect(onUpdate).toHaveBeenCalledWith('anchorX', 'right');
    expect(onUpdate).toHaveBeenCalledWith('anchorY', 'bottom');
  });
});
