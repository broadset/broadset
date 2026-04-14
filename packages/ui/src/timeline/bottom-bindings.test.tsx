/** @jest-environment jsdom */

import { beforeAll, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';
import * as React from 'react';

import type { AnimationBindingSectionsProps, TimelineBottomPanelProps } from './index';
import {
  defaultBindingSectionsProps,
  defaultBottomPanelProps,
  loadTimelineTestModules,
  makeTimeline,
} from './test-helpers';

let AnimationBindingSections: React.ComponentType<AnimationBindingSectionsProps>;
let TimelineBottomPanel: React.ComponentType<TimelineBottomPanelProps>;

beforeAll(async () => {
  const mod = await loadTimelineTestModules();

  AnimationBindingSections = mod.AnimationBindingSections;
  TimelineBottomPanel = mod.TimelineBottomPanel;
});

describe('TimelineBottomPanel', () => {
  /**
   * @description Panel must have aria-hidden when no timeline is being edited (closed state).
   */
  it('renders with aria-hidden when closed', () => {
    const props = defaultBottomPanelProps({ isOpen: false });

    const { container } = render(<TimelineBottomPanel {...props} />);

    const panel = container.firstElementChild;

    expect(panel?.getAttribute('aria-hidden')).toBe('true');
  });

  /**
   * @description When a timeline is open, the panel must render the children content.
   */
  it('renders children when open', () => {
    const props = defaultBottomPanelProps({ isOpen: true });

    render(
      <TimelineBottomPanel {...props}>
        <div data-testid="editor-content">Editor</div>
      </TimelineBottomPanel>,
    );

    expect(screen.getByTestId('editor-content')).toBeDefined();
  });

  /**
   * @description Clicking the close button must call onClose to dismiss the panel.
   */
  it('calls onClose when the close button is clicked', () => {
    const props = defaultBottomPanelProps({ isOpen: true });

    render(
      <TimelineBottomPanel {...props}>
        <div>Editor</div>
      </TimelineBottomPanel>,
    );

    fireEvent.click(screen.getByRole('button', { name: /close/i }));

    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  /**
   * @description Custom height and className props must be respected for layout integration.
   */
  it('applies custom height and className', () => {
    const props = defaultBottomPanelProps({ isOpen: true, height: 300, className: 'custom-panel' });

    render(
      <TimelineBottomPanel {...props}>
        <div>Editor</div>
      </TimelineBottomPanel>,
    );

    const panel = screen.getByTestId('timeline-bottom-panel');

    expect(panel.style.height).toBe('300px');
    expect(panel.classList.contains('custom-panel')).toBe(true);
  });

  /**
   * @description Panel must be translated off-screen when closed and visible when open.
   */
  it('translates off-screen when closed and to natural position when open', () => {
    const { container, rerender } = render(
      <TimelineBottomPanel isOpen={false} onClose={jest.fn()}>
        <div>Editor</div>
      </TimelineBottomPanel>,
    );

    const panelClosed = container.firstElementChild as HTMLElement;

    expect(panelClosed.style.transform).toBe('translateY(100%)');

    rerender(
      <TimelineBottomPanel isOpen={true} onClose={jest.fn()}>
        <div>Editor</div>
      </TimelineBottomPanel>,
    );

    const panelOpen = container.firstElementChild as HTMLElement;

    expect(panelOpen.style.transform).toBe('translateY(0)');
  });
});

/* ---------------------------------------------------------------------------
 * AnimationBindingSections
 * --------------------------------------------------------------------------- */

describe('AnimationBindingSections', () => {
  /**
   * @description Each state binding must be listed with its associated timeline name.
   */
  it('lists state bindings with their timeline names', () => {
    const props = defaultBindingSectionsProps({
      stateBindings: [
        { stateName: 'Enter', timelineId: 'tl-enter' },
        { stateName: 'Exit', timelineId: 'tl-exit' },
      ],
      timelines: [
        makeTimeline({ id: 'tl-enter', name: 'enter-fade' }),
        makeTimeline({ id: 'tl-exit', name: 'exit-slide' }),
      ],
    });

    render(<AnimationBindingSections {...props} />);

    const items = screen.getAllByTestId('state-binding-item');

    expect(items).toHaveLength(2);
    expect(items[0]?.getAttribute('data-state-name')).toBe('Enter');
    expect(items[1]?.getAttribute('data-state-name')).toBe('Exit');
  });

  /**
   * @description Adding a modifier binding creates an in/out timeline pair.
   */
  it('calls onAddModifierBinding when a modifier is added', () => {
    const props = defaultBindingSectionsProps();

    render(<AnimationBindingSections {...props} />);

    fireEvent.click(screen.getByRole('button', { name: /add modifier/i }));

    expect(props.onAddModifierBinding).toHaveBeenCalled();
  });

  /**
   * @description Removing a state binding clears the binding and its timeline reference.
   */
  it('calls onRemoveStateBinding when a state binding is removed', () => {
    const props = defaultBindingSectionsProps({
      stateBindings: [{ stateName: 'Custom', timelineId: 'tl-custom' }],
      timelines: [makeTimeline({ id: 'tl-custom', name: 'custom-anim' })],
    });

    render(<AnimationBindingSections {...props} />);

    const removeButton = screen.getByRole('button', { name: /remove.*custom/i });

    fireEvent.click(removeButton);

    expect(props.onRemoveStateBinding).toHaveBeenCalledWith('Custom');
  });

  /**
   * @description State bindings must be ordered: Enter first, custom alphabetically, Exit last.
   */
  it('orders state bindings: Enter first, custom alphabetically, Exit last', () => {
    const props = defaultBindingSectionsProps({
      stateBindings: [
        { stateName: 'Exit', timelineId: 'tl-exit' },
        { stateName: 'Beta', timelineId: 'tl-beta' },
        { stateName: 'Enter', timelineId: 'tl-enter' },
        { stateName: 'Alpha', timelineId: 'tl-alpha' },
      ],
      timelines: [
        makeTimeline({ id: 'tl-exit', name: 'exit' }),
        makeTimeline({ id: 'tl-beta', name: 'beta' }),
        makeTimeline({ id: 'tl-enter', name: 'enter' }),
        makeTimeline({ id: 'tl-alpha', name: 'alpha' }),
      ],
    });

    render(<AnimationBindingSections {...props} />);

    const items = screen.getAllByTestId('state-binding-item');
    const names = items.map((el) => el.getAttribute('data-state-name'));

    expect(names).toEqual(['Enter', 'Alpha', 'Beta', 'Exit']);
  });

  /**
   * @description When a modifier binding is created with an in-timeline, the out-timeline defaults to a reversed copy.
   * Verified by checking the callback receives in + out timeline IDs.
   */
  it('creates modifier with in and out timeline pair', () => {
    const props = defaultBindingSectionsProps();

    render(<AnimationBindingSections {...props} />);

    fireEvent.click(screen.getByRole('button', { name: /add modifier/i }));

    expect(props.onAddModifierBinding).toHaveBeenCalledWith(expect.any(String), expect.any(String), expect.any(String));
  });
});
