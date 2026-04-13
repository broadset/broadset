/** @jest-environment jsdom */
import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';

import type { PropertyValue } from './panels';
import { QrCodePanel } from './panels';

describe('QrCodePanel', () => {
  /** @description QR code elements must have editable content, error correction level, and colors. */
  it('renders content and error correction inputs', () => {
    const onUpdate = jest.fn<(key: string, value: PropertyValue) => void>();

    render(
      <QrCodePanel
        content="https://example.com"
        errorCorrection="M"
        foregroundColor="#000000"
        backgroundColor="#ffffff"
        onUpdate={onUpdate}
      />,
    );

    const contentInput = screen.getByRole('textbox', { name: /content/i });

    expect(contentInput.getAttribute('value')).toBe('https://example.com');

    fireEvent.change(contentInput, { target: { value: 'https://broadset.io' } });
    expect(onUpdate).toHaveBeenCalledWith('content', 'https://broadset.io');
  });
});
