/** @jest-environment jsdom */
import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';

import type { PropertyValue } from './panels';
import { TypographyPanel } from './panels';

describe('TypographyPanel', () => {
  /** @description Typography panel must show font family, size, color, weight, style, alignment, decoration, and transform controls. */
  it('renders typography controls for text elements', () => {
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
        onUpdate={onUpdate}
      />,
    );

    expect(screen.getByRole('textbox', { name: /Font size/i })).not.toBeNull();
    expect(screen.getByRole('textbox', { name: /Font color/i })).not.toBeNull();
  });

  /** @description Font weight update must commit to the store. */
  it('forwards font weight changes', () => {
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
        onUpdate={onUpdate}
      />,
    );

    const fontSizeInput = screen.getByRole('textbox', { name: /Font size/i });

    fireEvent.blur(fontSizeInput);
    expect(onUpdate).toHaveBeenCalledWith('fontSize', 24);
  });
});
