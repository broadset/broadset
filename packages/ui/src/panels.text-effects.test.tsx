/** @jest-environment jsdom */
import { describe, expect, it } from '@jest/globals';
import { render, screen, within } from '@testing-library/react';

import { TextEffectsPanel } from './panels';

describe('TextEffectsPanel', () => {
  /** @description Text-effect controls (outline, shadow) must be immediately visible when the Text Effects accordion opens. Line height and letter/word spacing are typographic metrics and live in the Typography panel, not here. */
  it('renders stroke and shadow controls inline (no typographic metrics)', () => {
    render(
      <TextEffectsPanel
        textStroke="1px #000000"
        textShadow="2px 2px 4px #000"
        textTransform="none"
        onUpdate={() => undefined}
      />,
    );

    expect(screen.getByLabelText(/Text stroke/i)).not.toBeNull();
    expect(screen.getByLabelText(/Text shadow/i)).not.toBeNull();

    const panel = screen.getByRole('region', { name: 'Text Effects' });

    expect(within(panel).queryByText(/Line height/i)).toBeNull();
    expect(within(panel).queryByText(/Letter spacing/i)).toBeNull();
    expect(within(panel).queryByText(/Word spacing/i)).toBeNull();
  });
});
