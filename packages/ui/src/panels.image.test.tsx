/** @jest-environment jsdom */
import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';

import type { PropertyValue } from './panels';
import { ImagePanel } from './panels';

describe('ImagePanel', () => {
  /** @description Image elements must have editable source URL. */
  it('renders source URL input', () => {
    const onUpdate = jest.fn<(key: string, value: PropertyValue) => void>();

    render(<ImagePanel content="https://example.com/photo.jpg" onUpdate={onUpdate} />);

    const urlInput = screen.getByRole('textbox', { name: /source/i });

    expect(urlInput.getAttribute('value')).toBe('https://example.com/photo.jpg');

    fireEvent.change(urlInput, { target: { value: 'https://example.com/new.jpg' } });
    expect(onUpdate).toHaveBeenCalledWith('content', 'https://example.com/new.jpg');
  });
});
