import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { color, font, radius, zLayer } from '../tokens';
import { TimelineBottomPanel } from './bottom-panel';

function createProps(overrides: Partial<{ readonly isOpen: boolean }> = {}): {
  readonly isOpen: boolean;
  readonly onClose: () => void;
} {
  return {
    isOpen: true,
    onClose: vi.fn<() => void>(),
    ...overrides,
  };
}

describe('TimelineBottomPanel visual integration', () => {
  /** @description The timeline panel z-index must use the token system (zLayer) instead of hardcoded magic numbers for consistent stacking order across all chrome surfaces. */
  it('uses token-based z-index from the zLayer system', () => {
    render(
      <TimelineBottomPanel {...createProps()}>
        <div>content</div>
      </TimelineBottomPanel>,
    );

    const panel = screen.getByTestId('timeline-bottom-panel');

    expect(panel.style.zIndex).toBe(String(zLayer('overlay')));
  });

  /** @description The timeline panel border-radius must use token-based values for design system consistency with other chrome surfaces. */
  it('uses token-based border-radius values', () => {
    render(
      <TimelineBottomPanel {...createProps()}>
        <div>content</div>
      </TimelineBottomPanel>,
    );

    const panel = screen.getByTestId('timeline-bottom-panel');

    expect(panel.style.borderTopLeftRadius).toBe(radius('lg'));
    expect(panel.style.borderTopRightRadius).toBe(radius('lg'));
  });

  /** @description The timeline panel must have a dark surface background from the token system for visual consistency with the sidebar and toolbar chrome. */
  it('uses token-based surface background color', () => {
    render(
      <TimelineBottomPanel {...createProps()}>
        <div>content</div>
      </TimelineBottomPanel>,
    );

    const panel = screen.getByTestId('timeline-bottom-panel');

    expect(panel.style.backgroundColor).toBe(color('surface'));
  });

  /** @description The timeline panel must accept host-provided insets so app chrome such as side rails and open sidebars cannot cover the timeline controls. */
  it('applies host-provided side insets', () => {
    render(
      <TimelineBottomPanel {...createProps()} leftInset={56} rightInset={336}>
        <div>content</div>
      </TimelineBottomPanel>,
    );

    const panel = screen.getByTestId('timeline-bottom-panel');

    expect(panel.style.left).toBe('56px');
    expect(panel.style.right).toBe('336px');
  });

  /** @description The timeline header font size must use the token system for consistent typography across all chrome surfaces. */
  it('renders timeline header with token-based font styling', () => {
    render(
      <TimelineBottomPanel {...createProps()} subtitle="Editing Score Bug In" title="Score Bug Timeline">
        <div>content</div>
      </TimelineBottomPanel>,
    );

    const header = screen.getByText('Score Bug Timeline');

    expect(header.style.fontSize).toBe(font('label'));
    expect(header.style.fontWeight).toBe('600');
    expect(screen.getByText('Editing Score Bug In')).toBeTruthy();
  });
});
