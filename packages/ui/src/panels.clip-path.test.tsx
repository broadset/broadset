/** @jest-environment jsdom */
import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';

import type { PropertyValue } from './panels';
import { ClipPathPanel } from './panels';

describe('ClipPathPanel', () => {
  /** @description Selecting a preset must immediately apply the clip-path. */
  it('applies circle preset', () => {
    const onUpdate = jest.fn<(key: string, value: PropertyValue) => void>();

    render(<ClipPathPanel maskType="none" customClipPath="" onUpdate={onUpdate} />);

    const circleBtn = screen.getByRole('button', { name: /circle/i });

    fireEvent.click(circleBtn);
    expect(onUpdate).toHaveBeenCalledWith('customClipPath', 'circle(50%)');
    expect(onUpdate).toHaveBeenCalledWith('maskType', 'custom');
  });

  /** @description None preset must clear the clip-path and set maskType to 'none'. */
  it('clears clip-path with None preset', () => {
    const onUpdate = jest.fn<(key: string, value: PropertyValue) => void>();

    render(<ClipPathPanel maskType="custom" customClipPath="circle(50%)" onUpdate={onUpdate} />);

    const noneBtn = screen.getByRole('button', { name: /^none$/i });

    fireEvent.click(noneBtn);
    expect(onUpdate).toHaveBeenCalledWith('customClipPath', '');
    expect(onUpdate).toHaveBeenCalledWith('maskType', 'none');
  });

  /** @description Raw CSS input must validate and apply valid clip-path values. */
  it('validates raw CSS input', () => {
    const onUpdate = jest.fn<(key: string, value: PropertyValue) => void>();

    render(<ClipPathPanel maskType="custom" customClipPath="" onUpdate={onUpdate} />);

    const rawInput = screen.getByRole('textbox', { name: /clip.*path/i });

    fireEvent.change(rawInput, { target: { value: 'polygon(50% 0%, 100% 100%, 0% 100%)' } });
    fireEvent.blur(rawInput);

    expect(onUpdate).toHaveBeenCalledWith('customClipPath', 'polygon(50% 0%, 100% 100%, 0% 100%)');
  });

  /** @description Spec requires Squircle and Star presets (not Ellipse/Inset). */
  it('provides spec-defined presets: None, Circle, Squircle, Triangle, Star', () => {
    render(<ClipPathPanel maskType="none" customClipPath="" onUpdate={() => undefined} />);

    expect(screen.getByRole('button', { name: /^none$/i })).not.toBeNull();
    expect(screen.getByRole('button', { name: /circle/i })).not.toBeNull();
    expect(screen.getByRole('button', { name: /squircle/i })).not.toBeNull();
    expect(screen.getByRole('button', { name: /triangle/i })).not.toBeNull();
    expect(screen.getByRole('button', { name: /star/i })).not.toBeNull();
  });
});
