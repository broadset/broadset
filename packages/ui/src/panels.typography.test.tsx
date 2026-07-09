/** @vitest-environment jsdom */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { PropertyValue } from './panels';
import { TypographyPanel } from './panels';

function renderPanel(overrides: {
  readonly onUpdate?: (key: string, value: PropertyValue) => void;
  readonly fontSize?: number;
  readonly fontFamily?: string;
  readonly availableFonts?: readonly string[];
  readonly isAnimationMode?: boolean;
}): void {
  render(
    <TypographyPanel
      fontFamily={overrides.fontFamily ?? 'Inter'}
      availableFonts={overrides.availableFonts}
      fontSize={overrides.fontSize ?? 24}
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
      isAnimationMode={overrides.isAnimationMode ?? false}
      onUpdate={overrides.onUpdate ?? (() => undefined)}
    />,
  );
}

describe('TypographyPanel', () => {
  /** @description Each quick-toggle formatting button must emit an update with the exact model field and value, so one click in the UI lands the right write on the model. */
  it('bold, italic, underline, and strikethrough toggles emit exact model updates', () => {
    const onUpdate = vi.fn<(key: string, value: PropertyValue) => void>();

    renderPanel({ onUpdate });

    fireEvent.click(screen.getByRole('button', { name: 'Bold' }));
    fireEvent.click(screen.getByRole('button', { name: 'Italic' }));
    fireEvent.click(screen.getByRole('button', { name: 'Underline' }));
    fireEvent.click(screen.getByRole('button', { name: 'Strikethrough' }));

    expect(onUpdate).toHaveBeenNthCalledWith(1, 'fontWeight', 700);
    expect(onUpdate).toHaveBeenNthCalledWith(2, 'fontStyle', 'italic');
    expect(onUpdate).toHaveBeenNthCalledWith(3, 'textDecoration', 'underline');
    expect(onUpdate).toHaveBeenNthCalledWith(4, 'textDecoration', 'line-through');
  });

  /** @description The four segmented horizontal alignment buttons must be exposed in the primary panel and must emit textAlignment updates keyed by the canonical CSS value. */
  it('alignment segmented buttons emit textAlignment updates with canonical CSS values', () => {
    const onUpdate = vi.fn<(key: string, value: PropertyValue) => void>();

    renderPanel({ onUpdate });

    fireEvent.click(screen.getByRole('button', { name: 'Center' }));
    fireEvent.click(screen.getByRole('button', { name: 'Right' }));
    fireEvent.click(screen.getByRole('button', { name: 'Justify' }));
    fireEvent.click(screen.getByRole('button', { name: 'Left' }));

    expect(onUpdate).toHaveBeenCalledWith('textAlignment', 'center');
    expect(onUpdate).toHaveBeenCalledWith('textAlignment', 'right');
    expect(onUpdate).toHaveBeenCalledWith('textAlignment', 'justify');
    expect(onUpdate).toHaveBeenCalledWith('textAlignment', 'left');
  });

  /** @description Numeric font-weight input must stay hidden until the user opens Advanced, and must appear as an editable textbox once opened. */
  it('reveals numeric weight input only after Advanced is opened', () => {
    renderPanel({});

    expect(screen.queryByRole('textbox', { name: 'Weight' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Advanced' }));

    expect(screen.getByRole('textbox', { name: 'Weight' })).toBeTruthy();
  });

  /** @description Font family control must be an option-picker sourced from availableFonts — not freeform text — so users can't typo a missing font. */
  it('font family select lists the fonts supplied via availableFonts', () => {
    renderPanel({ availableFonts: ['Inter', 'Roboto', 'Open Sans'] });

    fireEvent.click(screen.getByRole('button', { name: /Font family/i }));

    expect(screen.getByRole('option', { name: 'Inter' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Roboto' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Open Sans' })).toBeTruthy();
  });

  /** @description Arrow-key nudges on font size must clamp at the minimum so size cannot drift below the safe floor. */
  it('clamps font size at the minimum when arrow-down is pressed at the floor', () => {
    const onUpdate = vi.fn<(key: string, value: PropertyValue) => void>();

    renderPanel({ onUpdate, fontSize: 1 });

    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Font size (pt)' }), { key: 'ArrowDown' });

    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith('fontSize', 1);
  });

  /** @description Arrow-key nudges on font size must clamp at the maximum so size cannot drift above the safe ceiling. */
  it('clamps font size at the maximum when arrow-up is pressed at the ceiling', () => {
    const onUpdate = vi.fn<(key: string, value: PropertyValue) => void>();

    renderPanel({ onUpdate, fontSize: 512 });

    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Font size (pt)' }), { key: 'ArrowUp' });

    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith('fontSize', 512);
  });

  /** @description Inline-edit helper text must disappear in animation mode so the editing guidance does not conflict with keyframe authoring. */
  it('hides the inline text edit helper in animation mode', () => {
    renderPanel({ isAnimationMode: true });

    expect(screen.queryByText('Double-click the text on canvas to edit content inline.')).toBeNull();
  });

  /** @description The panel must not surface raw internal style property names (fontWeight, textDecoration, etc.) to the user. */
  it('does not expose raw style property names in the panel body', () => {
    renderPanel({});

    const panel = screen.getByRole('region', { name: 'Typography' });

    expect(within(panel).queryByText(/fontWeight|textDecoration|textTransform/i)).toBeNull();
  });
});
