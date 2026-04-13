/** @jest-environment jsdom */
import { describe, expect, it } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';

import { TextEffectsPanel } from './panels';

describe('TextEffectsPanel', () => {
  /** @description Text effects panel must provide letter spacing, line height, word spacing, and text transform for text elements. */
  it('renders text effects controls', () => {
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

    expect(screen.getByRole('textbox', { name: /Letter spacing value/i })).not.toBeNull();
    expect(screen.getByRole('textbox', { name: /Line height value/i })).not.toBeNull();
    expect(screen.getByRole('textbox', { name: /Word spacing value/i })).not.toBeNull();
  });

  /** @description Advanced toggle must reveal text stroke and text shadow fields. */
  it('shows text stroke and shadow behind advanced toggle', () => {
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

    // Text stroke should not be visible initially (behind advanced toggle)
    expect(screen.queryByLabelText(/Text stroke/i)).toBeNull();

    // Click advanced toggle
    const advancedBtn = screen.getByRole('button', { name: /advanced/i });

    fireEvent.click(advancedBtn);

    expect(screen.getByLabelText(/Text stroke/i)).not.toBeNull();
    expect(screen.getByLabelText(/Text shadow/i)).not.toBeNull();
  });
});
