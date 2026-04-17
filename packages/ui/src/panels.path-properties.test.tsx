/** @jest-environment jsdom */
import { describe, expect, it } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';

import { PathPropertiesPanel } from './panels';

describe('PathPropertiesPanel', () => {
  /** @description Draw and Edit controls must be immediately available; editing points must stay disabled when there is no path content. */
  it('renders draw and edit controls with empty-content edit protection', () => {
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
        content=""
        onUpdate={() => undefined}
        onStartDrawing={() => undefined}
        onStopDrawing={() => undefined}
        onStartEditing={() => undefined}
        onStopEditing={() => undefined}
        isDrawing={false}
        isEditing={false}
      />,
    );

    expect(screen.getByRole('button', { name: 'Draw' })).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Edit points' }).hasAttribute('disabled')).toBe(true);
  });

  /** @description Stroke section must expose color/width/opacity/line controls and keep dash controls behind Advanced disclosure. */
  it('renders stroke controls with advanced-gated dash controls', () => {
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

    expect(screen.getByRole('textbox', { name: 'Stroke width' })).not.toBeNull();
    expect(screen.getByRole('slider', { name: 'Stroke opacity' })).not.toBeNull();
    expect(screen.getByText('Line cap')).not.toBeNull();
    expect(screen.getByText('Line join')).not.toBeNull();

    expect(screen.queryByRole('textbox', { name: 'Dash pattern' })).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Dash offset' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Stroke advanced' }));

    expect(screen.getByRole('textbox', { name: 'Dash pattern' })).not.toBeNull();
    expect(screen.getByRole('textbox', { name: 'Dash offset' })).not.toBeNull();
  });

  /** @description Fill section must present friendly inside-rule names and preserve fill color/opacity controls. */
  it('renders fill controls with plain-language inside rule options', () => {
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

    expect(screen.getByRole('textbox', { name: 'Fill color text' })).not.toBeNull();
    expect(screen.getByRole('slider', { name: 'Fill opacity' })).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Inside rule/i }));

    expect(screen.getByRole('option', { name: 'Non-zero' })).not.toBeNull();
    expect(screen.getByRole('option', { name: 'Even-odd' })).not.toBeNull();
  });

  /** @description Shape source must stay hidden by default and only appear after opening advanced mode and enabling the source switch. */
  it('gates raw shape source behind advanced and show-source toggles', () => {
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

    expect(screen.queryByRole('textbox', { name: 'Shape source' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Shape' }));

    fireEvent.click(screen.getByRole('button', { name: 'Advanced / Power user' }));

    expect(screen.getByText('Path preview')).not.toBeNull();
    expect(screen.getByRole('switch', { name: 'Show path source' })).not.toBeNull();

    fireEvent.click(screen.getByRole('switch', { name: 'Show path source' }));

    expect(screen.getByRole('textbox', { name: 'Shape source' })).not.toBeNull();
  });
});
