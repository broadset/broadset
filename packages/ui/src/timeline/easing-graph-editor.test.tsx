import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { EasingGraphEditorProps } from './easing-graph-editor';
import { EasingGraphEditor } from './easing-graph-editor';

const BEZIER = { kind: 'cubic-bezier', controlPoints: [0.42, 0, 0.58, 1] } as const;
const PRESETS = ['linear', 'ease-in', 'ease-out', 'ease-in-out', 'spring'] as const;

type SetupOverrides = Partial<Pick<EasingGraphEditorProps, 'interpolation' | 'presets' | 'previewProgress'>>;

function setup(overrides: SetupOverrides = {}) {
  const props = {
    interpolation: BEZIER,
    presets: [...PRESETS],
    previewProgress: null,
    onCommit: vi.fn(),
    onClose: vi.fn(),
    onSelectPreset: vi.fn(),
    ...overrides,
  };

  render(<EasingGraphEditor {...props} />);

  return props;
}

function mockGraphRect(): void {
  const svg = screen.getByTestId('easing-graph-svg');

  vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({
    x: 0, y: 0, left: 0, top: 0, right: 200, bottom: 200, width: 200, height: 200, toJSON: () => ({}),
  });
}

describe('EasingGraphEditor', () => {
  it('renders draggable handles for cubic-bezier and commits typed clamped control points', () => {
    const props = setup();

    mockGraphRect();

    const handle = screen.getByTestId('easing-handle-1');

    fireEvent.pointerDown(handle, { button: 0, pointerId: 1 });
    // Graph space: x right 0..1, y up 0..1 (SVG y inverted). Pointer at (150, 40) → (0.75, 0.8).
    fireEvent.pointerMove(handle, { buttons: 1, pointerId: 1, clientX: 150, clientY: 40 });
    expect(props.onCommit).toHaveBeenLastCalledWith({
      kind: 'cubic-bezier',
      controlPoints: [0.75, 0.8, 0.58, 1],
    });

    // x clamps to [0,1]; y may exceed.
    fireEvent.pointerMove(handle, { buttons: 1, pointerId: 1, clientX: 320, clientY: -60 });

    const last = props.onCommit.mock.calls.at(-1)?.[0] as { controlPoints: readonly number[] };

    expect(last.controlPoints[0]).toBe(1);
    expect(last.controlPoints[1]).toBeGreaterThan(1);
  });

  it('renders spring parameters read-only with no bezier handles', () => {
    setup({ interpolation: { kind: 'spring', mass: 1, stiffness: 100, damping: 10, initialVelocity: 0, settleThreshold: 0.001 } });
    expect(screen.getByTestId('easing-spring-params').textContent).toContain('stiffness 100');
    expect(screen.queryByTestId('easing-handle-1')).toBeNull();
  });

  it('offers only the provided presets and reports chip selection', () => {
    const props = setup({ presets: ['linear', 'spring'] });

    expect(screen.queryByRole('button', { name: 'ease-in' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'spring' }));
    expect(props.onSelectPreset).toHaveBeenCalledWith('spring');
  });

  it('shows the preview dot only while previewing', () => {
    const { rerender } = render(
      <EasingGraphEditor interpolation={BEZIER} presets={[]} previewProgress={null} onClose={vi.fn()} onCommit={vi.fn()} onSelectPreset={vi.fn()} />,
    );

    expect(screen.queryByTestId('easing-preview-dot')).toBeNull();
    rerender(
      <EasingGraphEditor interpolation={BEZIER} presets={[]} previewProgress={0.5} onClose={vi.fn()} onCommit={vi.fn()} onSelectPreset={vi.fn()} />,
    );
    expect(screen.getByTestId('easing-preview-dot')).toBeDefined();
  });

  it('closes on outside mousedown but not on inside clicks', () => {
    const props = setup();

    fireEvent.mouseDown(screen.getByTestId('easing-graph-svg'));
    expect(props.onClose).not.toHaveBeenCalled();
    fireEvent.mouseDown(document.body);
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });
});
