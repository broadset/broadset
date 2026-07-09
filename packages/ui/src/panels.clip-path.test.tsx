/** @vitest-environment jsdom */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { PropertyValue } from './panels';
import { ClipPathPanel } from './panels';

describe('ClipPathPanel', () => {
  /** @description Preset buttons must include the full mask set so users can pick shape visually without typing CSS. */
  it('renders mask preset grid with required options', () => {
    render(<ClipPathPanel maskType="none" customClipPath="" onUpdate={() => undefined} />);

    expect(screen.getByRole('button', { name: /^none$/i })).not.toBeNull();
    expect(screen.getByRole('button', { name: /circle/i })).not.toBeNull();
    expect(screen.getByRole('button', { name: /squircle/i })).not.toBeNull();
    expect(screen.getByRole('button', { name: /triangle/i })).not.toBeNull();
    expect(screen.getByRole('button', { name: /star/i })).not.toBeNull();
    expect(screen.getByRole('button', { name: /^custom$/i })).not.toBeNull();
  });

  /** @description Choosing a visual mask preset must set both customClipPath and maskType in one action. */
  it('applies star preset from the mask grid', () => {
    const onUpdate = vi.fn<(key: string, value: PropertyValue) => void>();

    render(<ClipPathPanel maskType="none" customClipPath="" onUpdate={onUpdate} />);

    fireEvent.click(screen.getByRole('button', { name: /star/i }));

    expect(onUpdate).toHaveBeenCalledWith(
      'customClipPath',
      'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)',
    );
    expect(onUpdate).toHaveBeenCalledWith('maskType', 'custom');
  });

  /** @description Selecting custom mask mode must switch maskType to custom and trigger clip-path edit mode entrypoint. */
  it('starts clip path editing when custom mask is selected', () => {
    const onUpdate = vi.fn<(key: string, value: PropertyValue) => void>();
    const onStartEditingClipPath = vi.fn<() => void>();

    render(
      <ClipPathPanel
        maskType="none"
        customClipPath=""
        onUpdate={onUpdate}
        onStartEditingClipPath={onStartEditingClipPath}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /^custom$/i }));

    expect(onUpdate).toHaveBeenCalledWith('maskType', 'custom');
    expect(onStartEditingClipPath).toHaveBeenCalledTimes(1);
  });

  /** @description None preset must clear the clip-path and set maskType to none so no stale clipping remains. */
  it('clears clip-path with None preset', () => {
    const onUpdate = vi.fn<(key: string, value: PropertyValue) => void>();

    render(<ClipPathPanel maskType="custom" customClipPath="circle(50%)" onUpdate={onUpdate} />);

    fireEvent.click(screen.getByRole('button', { name: /^none$/i }));
    expect(onUpdate).toHaveBeenCalledWith('customClipPath', '');
    expect(onUpdate).toHaveBeenCalledWith('maskType', 'none');
  });

  /** @description Custom preset in select mode must expose edit and reset actions without forcing raw CSS editing. */
  it('shows custom actions for the custom mask shape', () => {
    const onUpdate = vi.fn<(key: string, value: PropertyValue) => void>();

    render(<ClipPathPanel maskType="custom" customClipPath="path('M 0 0 L 1 1 Z')" onUpdate={onUpdate} />);

    fireEvent.click(screen.getByRole('button', { name: /reset shape/i }));

    expect(screen.getByRole('button', { name: /start editing clip path/i })).not.toBeNull();
    expect(onUpdate).toHaveBeenCalledWith('customClipPath', '');
    expect(onUpdate).toHaveBeenCalledWith('maskType', 'none');
  });

  /** @description Raw CSS entry is advanced-only and must provide friendly validation feedback when invalid. */
  it('validates advanced clip-path css with a friendly error message', () => {
    const onUpdate = vi.fn<(key: string, value: PropertyValue) => void>();

    render(<ClipPathPanel maskType="custom" customClipPath="" onUpdate={onUpdate} />);

    expect(screen.queryByRole('textbox', { name: /custom shape value/i })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /advanced/i }));

    const rawInput = screen.getByRole('textbox', { name: /custom shape value/i });

    fireEvent.change(rawInput, { target: { value: 'this-is-not-valid' } });
    fireEvent.blur(rawInput);

    expect(rawInput.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByRole('alert').textContent).toBe("This shape can't be read. Try a preset, or reset.");
    expect(onUpdate).not.toHaveBeenCalledWith('customClipPath', 'this-is-not-valid');
  });

  /** @description Valid advanced CSS must still be accepted for power users once advanced mode is opened. */
  it('accepts valid advanced clip-path css', () => {
    const onUpdate = vi.fn<(key: string, value: PropertyValue) => void>();

    render(<ClipPathPanel maskType="custom" customClipPath="" onUpdate={onUpdate} />);

    fireEvent.click(screen.getByRole('button', { name: /advanced/i }));

    const rawInput = screen.getByRole('textbox', { name: /custom shape value/i });

    fireEvent.change(rawInput, { target: { value: 'polygon(50% 0%, 100% 100%, 0% 100%)' } });
    fireEvent.blur(rawInput);

    expect(onUpdate).toHaveBeenCalledWith('customClipPath', 'polygon(50% 0%, 100% 100%, 0% 100%)');
    expect(rawInput.getAttribute('aria-invalid')).toBe('false');
  });
});
