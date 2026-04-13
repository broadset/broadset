/** @jest-environment jsdom */
import { describe, expect, it } from '@jest/globals';
import { render, screen } from '@testing-library/react';

import { BoxEffectsPanel } from './panels';

describe('BoxEffectsPanel', () => {
  /** @description Screen mode must show compositing controls (mixBlendMode, isolation). */
  it('renders compositing controls in screen mode', () => {
    render(
      <BoxEffectsPanel
        boxShadow=""
        filter=""
        backdropFilter=""
        mixBlendMode="normal"
        isolation="auto"
        documentMode="screen"
        onUpdate={() => undefined}
      />,
    );

    expect(screen.getByLabelText(/Box shadow/i)).not.toBeNull();
    expect(screen.getByLabelText(/^Filter$/i)).not.toBeNull();
    expect(screen.getByLabelText(/Backdrop filter/i)).not.toBeNull();
    expect(screen.getByText(/Mix blend mode/i)).not.toBeNull();
    expect(screen.getByText(/Isolation/i)).not.toBeNull();
  });
});
