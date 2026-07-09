/** @vitest-environment jsdom */

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { LinkToggle } from './link-toggle';

describe('LinkToggle', () => {
  /** @description Link toggle must expose aria-pressed so assistive tech can announce whether axes are currently linked. */
  it('exposes aria-pressed reflecting the linked state', () => {
    const { rerender } = render(<LinkToggle isLinked={false} onToggle={vi.fn()} ariaLabel="Link corners" />);

    expect(screen.getByRole('button', { name: 'Link corners' }).getAttribute('aria-pressed')).toBe('false');

    rerender(<LinkToggle isLinked onToggle={vi.fn()} ariaLabel="Link corners" />);

    expect(screen.getByRole('button', { name: 'Link corners' }).getAttribute('aria-pressed')).toBe('true');
  });

  /** @description Clicking the toggle must emit the inverted linked state so downstream primitives can sync. */
  it('emits inverted state on press', () => {
    const onToggle = vi.fn<(next: boolean) => void>();

    render(<LinkToggle isLinked={false} onToggle={onToggle} ariaLabel="Link aspect ratio" />);

    fireEvent.click(screen.getByRole('button', { name: 'Link aspect ratio' }));

    expect(onToggle).toHaveBeenCalledWith(true);
  });
});
