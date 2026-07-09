/** @vitest-environment jsdom */

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AxisTriplet, PairInput } from './axis-triplet';

describe('AxisTriplet', () => {
  /** @description Axis triplet groups three axes under a shared label so art directors can scan Position X/Y/Z at a glance. */
  it('exposes a group role with the shared label', () => {
    render(
      <AxisTriplet
        label="Position"
        unit="mm"
        axes={[
          { chip: 'X', color: 'x', ariaLabel: 'Position X (mm)', value: 10, onChange: vi.fn() },
          { chip: 'Y', color: 'y', ariaLabel: 'Position Y (mm)', value: 20, onChange: vi.fn() },
          { chip: 'Z', color: 'z', ariaLabel: 'Position Z (mm)', value: 0, onChange: vi.fn() },
        ]}
      />,
    );

    expect(screen.getByRole('group', { name: 'Position (mm)' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Position X (mm)' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Position Y (mm)' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Position Z (mm)' })).toBeTruthy();
  });

  /** @description Each axis cell must emit only its own onChange so coordinate edits stay scoped to one axis. */
  it('routes changes to the correct axis handler', () => {
    const onX = vi.fn<(value: number) => void>();
    const onY = vi.fn<(value: number) => void>();
    const onZ = vi.fn<(value: number) => void>();

    render(
      <AxisTriplet
        label="Rotation"
        unit="deg"
        axes={[
          { chip: 'X', color: 'x', ariaLabel: 'Rotation X', value: 0, onChange: onX },
          { chip: 'Y', color: 'y', ariaLabel: 'Rotation Y', value: 0, onChange: onY },
          { chip: 'Z', color: 'z', ariaLabel: 'Rotation Z', value: 0, onChange: onZ },
        ]}
      />,
    );

    const yInput = screen.getByRole('textbox', { name: 'Rotation Y' });

    fireEvent.change(yInput, { target: { value: '45' } });
    fireEvent.blur(yInput);

    expect(onY).toHaveBeenCalledWith(45);
    expect(onX).not.toHaveBeenCalled();
    expect(onZ).not.toHaveBeenCalled();
  });

  /** @description Hidden axes must not render textbox inputs so the 3D disclosure can collapse Z without layout glitches. */
  it('omits axes marked isHidden from the accessibility tree', () => {
    render(
      <AxisTriplet
        label="Rotation"
        axes={[
          { chip: 'X', color: 'x', ariaLabel: 'Rotation X', value: 0, onChange: vi.fn(), isHidden: true },
          { chip: 'Y', color: 'y', ariaLabel: 'Rotation Y', value: 0, onChange: vi.fn(), isHidden: true },
          { chip: 'Z', color: 'z', ariaLabel: 'Rotation Z', value: 0, onChange: vi.fn() },
        ]}
      />,
    );

    expect(screen.queryByRole('textbox', { name: 'Rotation X' })).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Rotation Y' })).toBeNull();
    expect(screen.getByRole('textbox', { name: 'Rotation Z' })).toBeTruthy();
  });
});

describe('PairInput', () => {
  /** @description Pair input renders exactly two axis cells so the size/trim/motion pairings stay visually paired. */
  it('renders both axis cells under the shared group', () => {
    render(
      <PairInput
        label="Size"
        unit="px"
        axes={[
          { chip: 'W', color: 'neutral', ariaLabel: 'Size W (px)', value: 300, onChange: vi.fn() },
          { chip: 'H', color: 'neutral', ariaLabel: 'Size H (px)', value: 200, onChange: vi.fn() },
        ]}
      />,
    );

    expect(screen.getByRole('group', { name: 'Size (px)' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Size W (px)' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Size H (px)' })).toBeTruthy();
  });

  /** @description Optional link toggle renders only when provided and announces its own aria-label. */
  it('renders the link toggle when provided', () => {
    render(
      <PairInput
        label="Size"
        unit="px"
        axes={[
          { chip: 'W', color: 'neutral', ariaLabel: 'Size W (px)', value: 400, onChange: vi.fn() },
          { chip: 'H', color: 'neutral', ariaLabel: 'Size H (px)', value: 300, onChange: vi.fn() },
        ]}
        linkToggle={{ isLinked: false, onToggle: vi.fn(), ariaLabel: 'Link aspect ratio' }}
      />,
    );

    expect(screen.getByRole('button', { name: 'Link aspect ratio' })).toBeTruthy();
  });

  /** @description With the link toggle active, editing one axis must also scale the paired axis so aspect ratio is preserved. */
  it('preserves aspect ratio when linked', () => {
    const onW = vi.fn<(value: number) => void>();
    const onH = vi.fn<(value: number) => void>();

    render(
      <PairInput
        label="Size"
        unit="px"
        axes={[
          { chip: 'W', color: 'neutral', ariaLabel: 'Size W (px)', value: 400, onChange: onW },
          { chip: 'H', color: 'neutral', ariaLabel: 'Size H (px)', value: 200, onChange: onH },
        ]}
        linkToggle={{ isLinked: true, onToggle: vi.fn(), ariaLabel: 'Link aspect ratio' }}
      />,
    );

    const wInput = screen.getByRole('textbox', { name: 'Size W (px)' });

    fireEvent.change(wInput, { target: { value: '800' } });
    fireEvent.blur(wInput);

    expect(onW).toHaveBeenCalledWith(800);
    expect(onH).toHaveBeenCalledWith(400);
  });
});
