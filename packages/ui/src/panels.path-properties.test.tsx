/** @jest-environment jsdom */
import { describe, expect, it } from '@jest/globals';
import { render, screen } from '@testing-library/react';

import { PathPropertiesPanel } from './panels';

describe('PathPropertiesPanel', () => {
  /** @description Path/SVG elements must have editable stroke and fill properties. */
  it('renders stroke and fill controls', () => {
    render(
      <PathPropertiesPanel
        stroke="#ff0000"
        strokeWidth={3}
        strokeOpacity={1}
        strokeDasharray=""
        strokeDashoffset={0}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        fillOpacity={1}
        fillRule="nonzero"
        trimStart={0}
        trimEnd={1}
        trimOffset={0}
        content="M0,0 L100,100"
        onUpdate={() => undefined}
        onStartDrawing={() => undefined}
        onStopDrawing={() => undefined}
        onStartEditing={() => undefined}
        onStopEditing={() => undefined}
        isDrawing={false}
        isEditing={false}
      />,
    );

    expect(screen.getByRole('textbox', { name: /Stroke color/i })).not.toBeNull();
    expect(screen.getByRole('textbox', { name: /Stroke width/i })).not.toBeNull();
    expect(screen.getByRole('textbox', { name: /Fill color/i })).not.toBeNull();
  });

  /** @description Draw path and edit path point toggle buttons must be available. */
  it('provides draw path and edit points toggles', () => {
    render(
      <PathPropertiesPanel
        stroke="#000"
        strokeWidth={2}
        strokeOpacity={1}
        strokeDasharray=""
        strokeDashoffset={0}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        fillOpacity={1}
        fillRule="nonzero"
        trimStart={0}
        trimEnd={1}
        trimOffset={0}
        content="M0,0 L100,100"
        onUpdate={() => undefined}
        onStartDrawing={() => undefined}
        onStopDrawing={() => undefined}
        onStartEditing={() => undefined}
        onStopEditing={() => undefined}
        isDrawing={false}
        isEditing={false}
      />,
    );

    expect(screen.getByRole('button', { name: /draw path/i })).not.toBeNull();
    expect(screen.getByRole('button', { name: /edit.*path.*points/i })).not.toBeNull();
  });

  /** @description Trim path sliders must be visible in the path properties panel for animated stroke draw effects. */
  it('renders trim path sliders', () => {
    render(
      <PathPropertiesPanel
        stroke="#000"
        strokeWidth={2}
        strokeOpacity={1}
        strokeDasharray=""
        strokeDashoffset={0}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        fillOpacity={1}
        fillRule="nonzero"
        trimStart={0.25}
        trimEnd={0.75}
        trimOffset={0}
        content="M0,0 L100,100"
        onUpdate={() => undefined}
        onStartDrawing={() => undefined}
        onStopDrawing={() => undefined}
        onStartEditing={() => undefined}
        onStopEditing={() => undefined}
        isDrawing={false}
        isEditing={false}
      />,
    );

    expect(screen.getAllByRole('slider').length).toBeGreaterThanOrEqual(3);
  });
});
