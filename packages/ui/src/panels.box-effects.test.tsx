/** @vitest-environment jsdom */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { PropertyValue } from './panels';
import { BoxEffectsPanel } from './panels';

function renderPanel(
  onUpdate: (key: string, value: PropertyValue) => void,
  overrides?: Partial<{ boxShadow: string; filter: string; backdropFilter: string; documentMode: 'screen' | 'print' }>,
): void {
  render(
    <BoxEffectsPanel
      boxShadow={overrides?.boxShadow ?? ''}
      filter={overrides?.filter ?? ''}
      backdropFilter={overrides?.backdropFilter ?? ''}
      mixBlendMode="normal"
      isolation="auto"
      documentMode={overrides?.documentMode ?? 'screen'}
      onUpdate={onUpdate}
    />,
  );
}

describe('BoxEffectsPanel', () => {
  /** @description Enabling the box shadow toggle must emit a non-"none" boxShadow string. */
  it('emits a concrete boxShadow string when the shadow toggle is enabled', () => {
    const onUpdate = vi.fn<(key: string, value: PropertyValue) => void>();

    renderPanel(onUpdate);

    fireEvent.click(screen.getByRole('switch', { name: 'Enable shadow' }));

    const [key, value] = onUpdate.mock.calls.at(-1) ?? [];

    expect(key).toBe('boxShadow');
    expect(typeof value).toBe('string');
    expect(value).not.toBe('none');
    expect((value as string).trim().length).toBeGreaterThan(0);
  });

  /** @description Disabling the box shadow toggle must emit "none" so the renderer drops the effect entirely. */
  it('emits "none" when the shadow toggle is disabled', () => {
    const onUpdate = vi.fn<(key: string, value: PropertyValue) => void>();

    renderPanel(onUpdate, { boxShadow: '0 2px 4px rgba(0,0,0,0.25)' });

    fireEvent.click(screen.getByRole('switch', { name: 'Enable shadow' }));

    expect(onUpdate).toHaveBeenCalledWith('boxShadow', 'none');
  });

  /** @description Adding a filter function via the Filter editor must emit a CSS filter string containing that function. */
  it('emits a filter string including the added function', () => {
    const onUpdate = vi.fn<(key: string, value: PropertyValue) => void>();

    renderPanel(onUpdate);

    const fieldset = screen.getByRole('group', { name: 'Filter' });

    fireEvent.click(fieldset.querySelector('button[aria-haspopup="listbox"]') ?? fieldset);
    fireEvent.click(screen.getByRole('option', { name: /blur/i }));

    expect(onUpdate).toHaveBeenCalledWith('filter', expect.stringContaining('blur('));
  });

  /** @description Backdrop filter editor must emit `backdropFilter` updates — not `filter` — when filters are added. */
  it('routes backdrop-filter edits to the backdropFilter key', () => {
    const onUpdate = vi.fn<(key: string, value: PropertyValue) => void>();

    renderPanel(onUpdate);

    const fieldset = screen.getByRole('group', { name: 'Backdrop filter' });

    fireEvent.click(fieldset.querySelector('button[aria-haspopup="listbox"]') ?? fieldset);
    fireEvent.click(screen.getByRole('option', { name: /grayscale/i }));

    expect(onUpdate).toHaveBeenCalledWith('backdropFilter', expect.stringContaining('grayscale('));
    expect(onUpdate).not.toHaveBeenCalledWith('filter', expect.anything());
  });

  /** @description Changing the mix-blend-mode select must emit the exact CSS keyword to onUpdate. */
  it('emits the selected mixBlendMode keyword', () => {
    const onUpdate = vi.fn<(key: string, value: PropertyValue) => void>();

    renderPanel(onUpdate);

    fireEvent.click(screen.getByRole('button', { name: /mix blend mode/i }));
    fireEvent.click(screen.getByRole('option', { name: 'multiply' }));

    expect(onUpdate).toHaveBeenCalledWith('mixBlendMode', 'multiply');
  });

  /** @description Changing the isolation select must emit isolation updates with the CSS keyword. */
  it('emits the selected isolation keyword', () => {
    const onUpdate = vi.fn<(key: string, value: PropertyValue) => void>();

    renderPanel(onUpdate);

    fireEvent.click(screen.getByRole('button', { name: /isolation/i }));
    fireEvent.click(screen.getByRole('option', { name: 'isolate' }));

    expect(onUpdate).toHaveBeenCalledWith('isolation', 'isolate');
  });

  /** @description Print mode must hide the compositing controls because mix-blend-mode and isolation have no print equivalent. */
  it('hides compositing controls in print mode', () => {
    renderPanel(() => undefined, { documentMode: 'print' });

    expect(screen.queryByRole('button', { name: /mix blend mode/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /isolation/i })).toBeNull();
  });
});
