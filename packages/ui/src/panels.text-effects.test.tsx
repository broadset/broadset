/** @jest-environment jsdom */
import { describe, expect, it } from '@jest/globals';
import { fireEvent, render, screen, within } from '@testing-library/react';

import { TextEffectsPanel } from './panels';

describe('TextEffectsPanel', () => {
  /** @description Advanced typography controls must be hidden by default so the primary surface stays focused on fast-edit controls. */
  it('keeps spacing, stroke, and shadow controls hidden until advanced is opened', () => {
    render(
      <TextEffectsPanel
        letterSpacing={0}
        lineHeight="1.5"
        wordSpacing={0}
        textStroke=""
        textShadow=""
        textTransform="none"
        onUpdate={() => undefined}
      />,
    );

    expect(screen.queryByRole('textbox', { name: /Letter spacing value/i })).toBeNull();
    expect(screen.queryByRole('textbox', { name: /Line height value/i })).toBeNull();
    expect(screen.queryByRole('textbox', { name: /Word spacing value/i })).toBeNull();
    expect(screen.queryByLabelText(/Text stroke/i)).toBeNull();
    expect(screen.queryByLabelText(/Text shadow/i)).toBeNull();
  });

  /** @description Opening advanced must reveal line-height, letter-spacing, word-spacing, text-stroke, and text-shadow controls for fine-grained typography edits. */
  it('reveals advanced text effect controls when advanced is opened', () => {
    render(
      <TextEffectsPanel
        letterSpacing={0}
        lineHeight="1.5"
        wordSpacing={0}
        textStroke="1px #000000"
        textShadow="2px 2px 4px #000"
        textTransform="none"
        onUpdate={() => undefined}
      />,
    );

    const advancedBtn = screen.getByRole('button', { name: /advanced/i });

    fireEvent.click(advancedBtn);

    expect(screen.getByRole('textbox', { name: /Letter spacing value/i })).not.toBeNull();
    expect(screen.getByRole('textbox', { name: /Line height value/i })).not.toBeNull();
    expect(screen.getByRole('textbox', { name: /Word spacing value/i })).not.toBeNull();
    expect(screen.getByLabelText(/Text stroke/i)).not.toBeNull();
    expect(screen.getByLabelText(/Text shadow/i)).not.toBeNull();

    const panel = screen.getByRole('region', { name: 'Text Effects' });

    expect(within(panel).queryByText(/fontWeight|textDecoration|textTransform/i)).toBeNull();
  });
});
