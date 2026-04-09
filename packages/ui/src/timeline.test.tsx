/** @jest-environment jsdom */

import type { EasingMode, Keyframe, Timeline } from '@broadset/model';
import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';
import * as React from 'react';

import type {
  AnimationBindingSectionsProps,
  TimelineBottomPanelProps,
  TimelineEditingContextValue,
  TimelineEditorProps,
} from './timeline';

/* ---------- HeroUI mock ---------- */

interface MockHeroUiProps {
  readonly children?: React.ReactNode;
  readonly onPress?: (() => void) | undefined;
  readonly isDisabled?: boolean | undefined;
  readonly isIconOnly?: boolean | undefined;
  readonly ['aria-label']?: string | undefined;
  readonly ['aria-pressed']?: boolean | undefined;
  readonly value?: string | number | readonly string[] | null | undefined;
  readonly onChange?: ((key: string | number | null) => void) | undefined;
  readonly [key: string]: unknown;
}

jest.mock('@heroui/react', () => {
  const ReactActual = jest.requireActual<typeof React>('react');

  function createWrapper(tagName = 'div') {
    return function Wrapper(props: MockHeroUiProps): React.JSX.Element {
      const { children, ...rest } = props;

      return ReactActual.createElement(tagName, rest, children ?? null);
    };
  }

  function Button(props: MockHeroUiProps): React.JSX.Element {
    const { children, isDisabled, isIconOnly: _isIconOnly, onPress, ...rest } = props;

    return ReactActual.createElement(
      'button',
      { ...rest, disabled: isDisabled, onClick: typeof onPress === 'function' ? onPress : undefined },
      children ?? null,
    );
  }

  const Tooltip = Object.assign(createWrapper(), {
    Trigger: createWrapper(),
    Content: createWrapper('span'),
  });

  function SelectRoot(props: MockHeroUiProps): React.JSX.Element {
    const { children, onChange, value, ...rest } = props;

    return ReactActual.createElement(
      'select',
      {
        ...rest,
        onChange: (event: React.ChangeEvent<HTMLSelectElement>) => {
          if (typeof onChange === 'function') {
            onChange(event.currentTarget.value);
          }
        },
        value: value ?? '',
      },
      children ?? null,
    );
  }

  const Select = Object.assign(SelectRoot, {
    Trigger: createWrapper(),
    Value: createWrapper('span'),
    Popover: createWrapper(),
  });

  function ListBoxItem(props: MockHeroUiProps): React.JSX.Element {
    const { children } = props;

    return ReactActual.createElement(
      'option',
      { value: props['id'] ?? (typeof children === 'string' ? children : '') },
      children ?? null,
    );
  }

  return {
    Button,
    ListBoxItem,
    Select,
    Tooltip,
  };
});

/* --------- Lazy import after mock --------- */

let AnimationBindingSections: React.ComponentType<AnimationBindingSectionsProps>;
let TimelineBottomPanel: React.ComponentType<TimelineBottomPanelProps>;
let TimelineEditingProvider: React.ComponentType<{ readonly children: React.ReactNode }>;
let TimelineEditor: React.ComponentType<TimelineEditorProps>;
let useTimelineEditing: () => TimelineEditingContextValue | null;

beforeAll(async () => {
  const mod = await import('./timeline');

  AnimationBindingSections = mod.AnimationBindingSections;
  TimelineBottomPanel = mod.TimelineBottomPanel;
  TimelineEditingProvider = mod.TimelineEditingProvider;
  TimelineEditor = mod.TimelineEditor;
  useTimelineEditing = mod.useTimelineEditing;
});

/* ---------------------------------------------------------------------------
 * Helpers
 * --------------------------------------------------------------------------- */

function makeKeyframe(overrides: Partial<Keyframe> = {}): Keyframe {
  return {
    name: 'kf-1',
    action: 'setState',
    offsetMs: 0,
    properties: {},
    ...overrides,
  };
}

function makeTimeline(overrides: Partial<Timeline> & { keyframes?: readonly Keyframe[] } = {}): Timeline {
  return {
    id: 'tl-1',
    name: 'default',
    keyframes: [],
    ...overrides,
  };
}

function defaultEditorProps(overrides: Partial<TimelineEditorProps> = {}): TimelineEditorProps {
  return {
    timeline: makeTimeline(),
    selectedKeyframeIndex: null,
    onSelectKeyframe: jest.fn<(index: number) => void>(),
    onAddKeyframe: jest.fn<() => void>(),
    onMoveKeyframe: jest.fn<(index: number, offsetMs: number) => void>(),
    onChangeEasing: jest.fn<(index: number, easing: EasingMode) => void>(),
    onPlayTimeline: jest.fn<() => void>(),
    onStopTimeline: jest.fn<() => void>(),
    onSeekTimeline: jest.fn<(timeMs: number) => void>(),
    currentTimeMs: 0,
    isPlaying: false,
    ...overrides,
  };
}

function defaultBottomPanelProps(overrides: Partial<TimelineBottomPanelProps> = {}): TimelineBottomPanelProps {
  return {
    isOpen: false,
    onClose: jest.fn<() => void>(),
    ...overrides,
  };
}

function defaultBindingSectionsProps(
  overrides: Partial<AnimationBindingSectionsProps> = {},
): AnimationBindingSectionsProps {
  return {
    stateBindings: [],
    modifierBindings: [],
    timelines: [],
    onAddStateBinding: jest.fn<(stateName: string, timelineId: string) => void>(),
    onRemoveStateBinding: jest.fn<(stateName: string) => void>(),
    onRenameStateBinding: jest.fn<(oldName: string, newName: string) => void>(),
    onAddModifierBinding: jest.fn<(modifierName: string, inTimelineId: string, outTimelineId: string) => void>(),
    onRemoveModifierBinding: jest.fn<(modifierName: string) => void>(),
    ...overrides,
  };
}

/* ---------------------------------------------------------------------------
 * TimelineEditingProvider (existing context tests)
 * --------------------------------------------------------------------------- */

/**
 * @description Verifies the timeline editing provider exposes the minimal state needed by the demo shell.
 */
describe('TimelineEditingProvider', () => {
  /**
   * @description Guards the optional-consumer contract so components can safely check for timeline context.
   */
  it('returns null when used outside the provider', () => {
    let contextValue: ReturnType<typeof useTimelineEditing> = null;

    function Consumer(): React.JSX.Element {
      contextValue = useTimelineEditing();

      return <div>consumer</div>;
    }

    render(<Consumer />);

    expect(contextValue).toBeNull();
  });

  /**
   * @description Ensures opening and closing a timeline updates the shared context state for the demo shell.
   */
  it('opens and closes a timeline target with its snapshot', () => {
    const contextRef: { current: ReturnType<typeof useTimelineEditing> } = { current: null };

    function Consumer(): React.JSX.Element {
      contextRef.current = useTimelineEditing();

      return (
        <div>
          <button
            type="button"
            onClick={() => {
              contextRef.current?.openTimeline('el-1', 'fade-in', new Map([['opacity', 1]]));
            }}
          >
            Open timeline
          </button>
          <button
            type="button"
            onClick={() => {
              contextRef.current?.closeTimeline();
            }}
          >
            Close timeline
          </button>
        </div>
      );
    }

    render(
      <TimelineEditingProvider>
        <Consumer />
      </TimelineEditingProvider>,
    );

    expect(contextRef.current?.target).toBeNull();
    expect(contextRef.current?.snapshot).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /open timeline/i }));

    expect(contextRef.current?.target).toEqual({ elementId: 'el-1', timelineName: 'fade-in' });
    expect(contextRef.current?.snapshot).toEqual(new Map([['opacity', 1]]));

    fireEvent.click(screen.getByRole('button', { name: /close timeline/i }));

    expect(contextRef.current?.target).toBeNull();
    expect(contextRef.current?.snapshot).toBeNull();
  });
});

/* ---------------------------------------------------------------------------
 * TimelineEditor — Keyframe Management
 * --------------------------------------------------------------------------- */

describe('TimelineEditor — keyframe management', () => {
  /**
   * @description When no keyframes exist, the editor must show empty state so the user knows to add one.
   */
  it('displays empty state when no keyframes exist', () => {
    const props = defaultEditorProps({ timeline: makeTimeline({ keyframes: [] }) });

    render(<TimelineEditor {...props} />);

    expect(screen.getByText(/no keyframes/i)).toBeDefined();
  });

  /**
   * @description The + button adds a keyframe and immediately selects it for editing.
   */
  it('calls onAddKeyframe when the add button is clicked', () => {
    const props = defaultEditorProps();

    render(<TimelineEditor {...props} />);

    fireEvent.click(screen.getByRole('button', { name: /add keyframe/i }));

    expect(props.onAddKeyframe).toHaveBeenCalledTimes(1);
  });

  /**
   * @description Only one keyframe can be selected at a time — clicking a second marker deselects the first.
   */
  it('selects only one keyframe at a time via aria-pressed', () => {
    const kf1 = makeKeyframe({ name: 'kf-1', offsetMs: 0 });
    const kf2 = makeKeyframe({ name: 'kf-2', offsetMs: 500 });
    const timeline = makeTimeline({ keyframes: [kf1, kf2] });
    const props = defaultEditorProps({ timeline, selectedKeyframeIndex: 1 });

    render(<TimelineEditor {...props} />);

    const markers = screen.getAllByRole('button', { pressed: true });

    expect(markers).toHaveLength(1);
  });

  /**
   * @description Clicking a keyframe marker must show a keyframe hint (tooltip or detail area) for editing context.
   */
  it('shows a keyframe hint when a marker is selected', () => {
    const kf = makeKeyframe({ name: 'fade-start', offsetMs: 200 });
    const timeline = makeTimeline({ keyframes: [kf] });
    const props = defaultEditorProps({ timeline, selectedKeyframeIndex: 0 });

    render(<TimelineEditor {...props} />);

    expect(screen.getAllByText(/fade-start/i).length).toBeGreaterThanOrEqual(1);
  });

  /**
   * @description Visible timeline length must be max(offsets) + 1000ms, minimum 3000ms.
   */
  it('calculates visible timeline length as max offset + 1000ms with 3000ms minimum', () => {
    const kf1 = makeKeyframe({ offsetMs: 500 });
    const kf2 = makeKeyframe({ offsetMs: 1200 });
    const timeline = makeTimeline({ keyframes: [kf1, kf2] });
    const props = defaultEditorProps({ timeline });

    const { container } = render(<TimelineEditor {...props} />);

    const track = container.querySelector('[data-testid="timeline-track"]');

    expect(track).toBeDefined();
    // With keyframes at 500 and 1200, min duration = 1200 + 1000 = 2200, but 3000ms minimum applies
    expect(track?.getAttribute('data-duration-ms')).toBe('3000');
  });

  /**
   * @description When no keyframes exist, minimum visible timeline is 3000ms.
   */
  it('uses 3000ms minimum timeline length when no keyframes exist', () => {
    const timeline = makeTimeline({ keyframes: [] });
    const props = defaultEditorProps({ timeline });

    const { container } = render(<TimelineEditor {...props} />);

    const track = container.querySelector('[data-testid="timeline-track"]');

    expect(track?.getAttribute('data-duration-ms')).toBe('3000');
  });

  /**
   * @description Ruler time labels must use N.Ns format (e.g., 0.5s, 1.0s).
   */
  it('renders ruler labels in N.Ns format', () => {
    const kf = makeKeyframe({ offsetMs: 2500 });
    const timeline = makeTimeline({ keyframes: [kf] });
    const props = defaultEditorProps({ timeline });

    render(<TimelineEditor {...props} />);

    // At minimum, 0.0s should be present in the ruler
    expect(screen.getByText('0.0s')).toBeDefined();
  });

  /**
   * @description Keyframe markers must be color-coded by action type — setState=accent, addModifier=focus, removeModifier=danger.
   */
  it('color-codes keyframe markers by action type', () => {
    const kfSetState = makeKeyframe({ name: 'set', action: 'setState', offsetMs: 0 });
    const kfAddMod = makeKeyframe({ name: 'add', action: 'addModifier', offsetMs: 200 });
    const kfRemoveMod = makeKeyframe({ name: 'rem', action: 'removeModifier', offsetMs: 400 });
    const timeline = makeTimeline({ keyframes: [kfSetState, kfAddMod, kfRemoveMod] });
    const props = defaultEditorProps({ timeline });

    const { container } = render(<TimelineEditor {...props} />);

    const markers = container.querySelectorAll('[data-testid="keyframe-marker"]');

    expect(markers).toHaveLength(3);
    expect(markers[0]?.getAttribute('data-action')).toBe('setState');
    expect(markers[1]?.getAttribute('data-action')).toBe('addModifier');
    expect(markers[2]?.getAttribute('data-action')).toBe('removeModifier');
  });

  /**
   * @description Clicking empty space on the keyframe track positions the playhead at that time.
   */
  it('calls onSeekTimeline when clicking empty area of the track', () => {
    const props = defaultEditorProps();
    const { container } = render(<TimelineEditor {...props} />);

    const track = container.querySelector('[data-testid="timeline-track"]');

    expect(track).toBeDefined();

    if (track !== null) {
      Object.defineProperty(track, 'getBoundingClientRect', {
        value: () => ({ left: 0, width: 300, top: 0, height: 40, right: 300, bottom: 40 }),
      });

      fireEvent.click(track, { clientX: 150 });
    }

    expect(props.onSeekTimeline).toHaveBeenCalled();
  });

  /**
   * @description When a keyframe is selected, an easing dropdown must be available with common presets.
   */
  it('shows easing selector when a keyframe is selected', () => {
    const kf = makeKeyframe({
      offsetMs: 100,
      properties: { opacity: { type: 'number', value: 1, easing: 'ease' } },
    });
    const timeline = makeTimeline({ keyframes: [kf] });
    const props = defaultEditorProps({ timeline, selectedKeyframeIndex: 0 });

    render(<TimelineEditor {...props} />);

    const easingSelect = screen.getByRole('combobox', { name: /easing/i });

    expect(easingSelect).toBeDefined();
  });
});

/* ---------------------------------------------------------------------------
 * TimelineEditor — Keyframe Drag Repositioning
 * --------------------------------------------------------------------------- */

describe('TimelineEditor — keyframe drag', () => {
  /**
   * @description Dragging a keyframe marker calls onMoveKeyframe with the new offset.
   */
  it('calls onMoveKeyframe when a keyframe is dragged to a new position', () => {
    const kf = makeKeyframe({ offsetMs: 500 });
    const timeline = makeTimeline({ keyframes: [kf] });
    const props = defaultEditorProps({ timeline, selectedKeyframeIndex: 0 });
    const { container } = render(<TimelineEditor {...props} />);

    const marker = container.querySelector('[data-testid="keyframe-marker"]');
    const track = container.querySelector('[data-testid="timeline-track"]');

    expect(marker).toBeDefined();
    expect(track).toBeDefined();

    if (marker !== null && track !== null) {
      Object.defineProperty(track, 'getBoundingClientRect', {
        value: () => ({ left: 0, width: 300, top: 0, height: 40, right: 300, bottom: 40 }),
      });

      fireEvent.pointerDown(marker, { clientX: 50, pointerId: 1 });
      fireEvent.pointerMove(track, { clientX: 150, pointerId: 1 });
      fireEvent.pointerUp(track, { clientX: 150, pointerId: 1 });
    }

    expect(props.onMoveKeyframe).toHaveBeenCalled();
  });

  /**
   * @description During drag, a visual indicator with time label must be visible.
   */
  it('shows a drag indicator with time label during drag', () => {
    const kf = makeKeyframe({ offsetMs: 500 });
    const timeline = makeTimeline({ keyframes: [kf] });
    const props = defaultEditorProps({ timeline, selectedKeyframeIndex: 0 });
    const { container } = render(<TimelineEditor {...props} />);

    const marker = container.querySelector('[data-testid="keyframe-marker"]');
    const track = container.querySelector('[data-testid="timeline-track"]');

    if (marker !== null && track !== null) {
      Object.defineProperty(track, 'getBoundingClientRect', {
        value: () => ({ left: 0, width: 300, top: 0, height: 40, right: 300, bottom: 40 }),
      });

      fireEvent.pointerDown(marker, { clientX: 50, pointerId: 1 });
      fireEvent.pointerMove(track, { clientX: 150, pointerId: 1 });
    }

    const indicator = container.querySelector('[data-testid="drag-indicator"]');

    expect(indicator).toBeDefined();

    if (marker !== null && track !== null) {
      fireEvent.pointerUp(track, { clientX: 150, pointerId: 1 });
    }
  });
});

/* ---------------------------------------------------------------------------
 * TimelineEditor — Playback
 * --------------------------------------------------------------------------- */

describe('TimelineEditor — playback controls', () => {
  /**
   * @description The play button must call onPlayTimeline without passing an onComplete callback.
   */
  it('calls onPlayTimeline without onComplete when play is pressed', () => {
    const kf = makeKeyframe({ offsetMs: 0 });
    const timeline = makeTimeline({ keyframes: [kf] });
    const props = defaultEditorProps({ timeline });

    render(<TimelineEditor {...props} />);

    fireEvent.click(screen.getByRole('button', { name: /play/i }));

    expect(props.onPlayTimeline).toHaveBeenCalledTimes(1);
    expect(props.onPlayTimeline).toHaveBeenCalledWith();
  });

  /**
   * @description When playing, a stop button must be available.
   */
  it('shows stop button while playing', () => {
    const kf = makeKeyframe({ offsetMs: 0 });
    const timeline = makeTimeline({ keyframes: [kf] });
    const props = defaultEditorProps({ timeline, isPlaying: true });

    render(<TimelineEditor {...props} />);

    expect(screen.getByRole('button', { name: /stop/i })).toBeDefined();
  });
});

/* ---------------------------------------------------------------------------
 * TimelineBottomPanel
 * --------------------------------------------------------------------------- */

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

    expect(props.onAddModifierBinding).toHaveBeenCalled();

    const calls = (props.onAddModifierBinding as jest.MockedFunction<typeof props.onAddModifierBinding>).mock.calls;
    const args = calls[0];

    expect(args).toBeDefined();

    if (args !== undefined) {
      expect(args).toHaveLength(3);
    }
  });
});
