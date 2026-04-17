/** @jest-environment jsdom */
import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';

import type { PropertyValue } from './panels';
import { GeometryPanel } from './panels';

describe('GeometryPanel', () => {
  /** @description Geometry labels must include document units and numeric edits must still emit numeric model updates. */
  it('renders transform fields with unit labels and reports numeric updates', () => {
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

    const xInput = screen.getByRole('textbox', { name: 'Position X (mm)' });

    fireEvent.change(xInput, { target: { value: '42' } });
    fireEvent.blur(xInput);

    expect(screen.getByRole('textbox', { name: 'Size W (mm)' })).not.toBeNull();
    expect(screen.getByRole('textbox', { name: 'Rotation Z' })).not.toBeNull();
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

  /** @description Print mode must hide the 3D axes because 3D controls are screen-only. */
  it('hides 3D axes in print mode', () => {
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

    expect(screen.queryByRole('textbox', { name: /Rotation X/i })).toBeNull();
    expect(screen.queryByRole('textbox', { name: /Rotation Y/i })).toBeNull();
    expect(screen.queryByRole('textbox', { name: /Position Z/i })).toBeNull();
    // The 2D-only rotation input must still be present as the primary rotation control.
    expect(screen.getByRole('textbox', { name: /Rotation Z/i })).not.toBeNull();
  });

  /** @description Screen mode must show Position X/Y/Z and Rotation X/Y/Z side-by-side so all transform axes stay visible without toggling. */
  it('shows Position and Rotation X/Y/Z axes together in screen mode', () => {
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

    expect(screen.getByRole('textbox', { name: /Position X/i })).not.toBeNull();
    expect(screen.getByRole('textbox', { name: /Position Y/i })).not.toBeNull();
    expect(screen.getByRole('textbox', { name: /Position Z/i })).not.toBeNull();
    expect(screen.getByRole('textbox', { name: /Rotation X/i })).not.toBeNull();
    expect(screen.getByRole('textbox', { name: /Rotation Y/i })).not.toBeNull();
    expect(screen.getByRole('textbox', { name: /Rotation Z/i })).not.toBeNull();
  });

  /** @description Width and height must be clamped to a minimum displayed value of 0.1 to prevent zero-size elements. */
  it('clamps width and height display to minimum 0.1', () => {
    render(
      <GeometryPanel x={0} y={0} width={0} height={0} rotation={0} onUpdate={() => undefined} documentMode="screen" />,
    );

    const widthInput = screen.getByRole('textbox', { name: 'Size W (px)' });
    const heightInput = screen.getByRole('textbox', { name: 'Size H (px)' });

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
    const xInput = screen.getByRole('textbox', { name: 'Position X (Right mm)' });

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
    const yInput = screen.getByRole('textbox', { name: 'Position Y (Bottom in)' });

    expect((yInput.getAttribute('value') ?? '').replace(/,/g, '')).toBe('830');

    fireEvent.change(yInput, { target: { value: '820' } });
    fireEvent.blur(yInput);

    // Expected converted model y: 1080 - 820 - 50 = 210
    expect(onUpdate).toHaveBeenCalledWith('y', 210);
  });

  /** @description 9-dot anchor pad must emit both anchorX and anchorY in a single interaction when a corner dot is clicked. */
  it('emits anchor mode changes from the 9-dot anchor pad', () => {
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

    fireEvent.click(screen.getByRole('button', { name: 'Anchor bottom-right' }));

    expect(onUpdate).toHaveBeenCalledWith('anchorX', 'right');
    expect(onUpdate).toHaveBeenCalledWith('anchorY', 'bottom');
  });

  /** @description Size must expose a link-aspect toggle so designers can scale width and height proportionally. */
  it('exposes a link-aspect toggle in the Size group', () => {
    render(
      <GeometryPanel
        x={0}
        y={0}
        width={400}
        height={200}
        rotation={0}
        onUpdate={() => undefined}
        documentMode="screen"
      />,
    );

    expect(screen.getByRole('button', { name: 'Link aspect ratio' })).not.toBeNull();
  });
});
