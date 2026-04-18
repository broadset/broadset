/** @jest-environment jsdom */
import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen, within } from '@testing-library/react';

import type { PropertyValue } from './panels';
import { TypographyPanel } from './panels';

describe('TypographyPanel', () => {
  /** @description Typography panel must expose fast formatting controls and segmented alignment controls without requiring advanced disclosure. */
  it('renders toggle formatting controls and segmented alignment controls', () => {
    const onUpdate = jest.fn<(key: string, value: PropertyValue) => void>();

    render(
      <TypographyPanel
        fontFamily="Inter"
        fontSize={24}
        fontColor="#333333"
        fontWeight={700}
        fontStyle="normal"
        textAlignment="center"
        verticalAlignment="top"
        textDecoration=""
        textTransform="none"
        lineHeight="1.5"
        letterSpacing={0}
        wordSpacing={0}
        onUpdate={onUpdate}
      />,
    );

    expect(screen.getByRole('button', { name: 'Bold' })).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Italic' })).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Underline' })).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Strikethrough' })).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Left' })).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Center' })).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Right' })).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Justify' })).not.toBeNull();
  });

  /** @description Primary typography surface must show a plain helper message for inline text editing while keeping advanced numeric controls hidden by default. */
  it('shows inline text edit helper and keeps numeric weight hidden until advanced is opened', () => {
    render(
      <TypographyPanel
        fontFamily="Inter"
        fontSize={24}
        fontColor="#333333"
        fontWeight={400}
        fontStyle="normal"
        textAlignment="center"
        verticalAlignment="top"
        textDecoration=""
        textTransform="none"
        lineHeight="1.5"
        letterSpacing={0}
        wordSpacing={0}
        onUpdate={() => undefined}
      />,
    );

    expect(screen.getByText('Double-click the text on canvas to edit content inline.')).not.toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Weight' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Advanced' }));

    expect(screen.getByRole('textbox', { name: 'Weight' })).not.toBeNull();
  });

  /** @description Font family control must use curated available font options rather than freeform text entry. */
  it('renders font family select options from available fonts', () => {
    render(
      <TypographyPanel
        fontFamily="Inter"
        availableFonts={['Inter', 'Roboto', 'Open Sans']}
        fontSize={24}
        fontColor="#333333"
        fontWeight={400}
        fontStyle="normal"
        textAlignment="left"
        verticalAlignment="top"
        textDecoration=""
        textTransform="none"
        lineHeight="1.5"
        letterSpacing={0}
        wordSpacing={0}
        onUpdate={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Font family/i }));

    expect(screen.getByRole('option', { name: 'Inter' })).not.toBeNull();
    expect(screen.getByRole('option', { name: 'Roboto' })).not.toBeNull();
    expect(screen.getByRole('option', { name: 'Open Sans' })).not.toBeNull();
  });

  /** @description Font size control must enforce configured min/max bounds so text size cannot drift outside safe limits. */
  it('clamps font size updates at min and max bounds', () => {
    const onUpdate = jest.fn<(key: string, value: PropertyValue) => void>();

    const { rerender } = render(
      <TypographyPanel
        fontFamily="Inter"
        fontSize={1}
        fontColor="#333333"
        fontWeight={400}
        fontStyle="normal"
        textAlignment="left"
        verticalAlignment="top"
        textDecoration=""
        textTransform="none"
        lineHeight="1.5"
        letterSpacing={0}
        wordSpacing={0}
        onUpdate={onUpdate}
      />,
    );

    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Font size (pt)' }), { key: 'ArrowDown' });
    expect(onUpdate).toHaveBeenCalledWith('fontSize', 1);

    onUpdate.mockClear();

    rerender(
      <TypographyPanel
        fontFamily="Inter"
        fontSize={512}
        fontColor="#333333"
        fontWeight={400}
        fontStyle="normal"
        textAlignment="left"
        verticalAlignment="top"
        textDecoration=""
        textTransform="none"
        lineHeight="1.5"
        letterSpacing={0}
        wordSpacing={0}
        onUpdate={onUpdate}
      />,
    );

    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Font size (pt)' }), { key: 'ArrowUp' });
    expect(onUpdate).toHaveBeenCalledWith('fontSize', 512);
  });

  /** @description Inline edit helper must be hidden while animation mode is active to avoid conflicting editing guidance. */
  it('hides inline text edit helper in animation mode', () => {
    render(
      <TypographyPanel
        fontFamily="Inter"
        fontSize={24}
        fontColor="#333333"
        fontWeight={400}
        fontStyle="normal"
        textAlignment="left"
        verticalAlignment="top"
        textDecoration=""
        textTransform="none"
        lineHeight="1.5"
        letterSpacing={0}
        wordSpacing={0}
        isAnimationMode
        onUpdate={() => undefined}
      />,
    );

    expect(screen.queryByText('Double-click the text on canvas to edit content inline.')).toBeNull();
  });

  /** @description Toggle controls must mutate the expected model fields and avoid exposing raw internal property names to users. */
  it('forwards toggle edits and avoids raw style property labels', () => {
    const onUpdate = jest.fn<(key: string, value: PropertyValue) => void>();

    render(
      <TypographyPanel
        fontFamily="Inter"
        fontSize={24}
        fontColor="#333333"
        fontWeight={400}
        fontStyle="normal"
        textAlignment="center"
        verticalAlignment="top"
        textDecoration=""
        textTransform="none"
        lineHeight="1.5"
        letterSpacing={0}
        wordSpacing={0}
        onUpdate={onUpdate}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Bold' }));
    fireEvent.click(screen.getByRole('button', { name: 'Italic' }));
    fireEvent.click(screen.getByRole('button', { name: 'Underline' }));
    fireEvent.click(screen.getByRole('button', { name: 'Strikethrough' }));

    expect(onUpdate).toHaveBeenCalledWith('fontWeight', 700);
    expect(onUpdate).toHaveBeenCalledWith('fontStyle', 'italic');
    expect(onUpdate).toHaveBeenCalledWith('textDecoration', 'underline');
    expect(onUpdate).toHaveBeenCalledWith('textDecoration', 'line-through');

    const panel = screen.getByRole('region', { name: 'Typography' });

    expect(within(panel).queryByText(/fontWeight|textDecoration|textTransform/i)).toBeNull();
  });
});
