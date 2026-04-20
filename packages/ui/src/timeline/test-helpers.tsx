/** @vitest-environment jsdom */

import type { EasingMode, Keyframe, Timeline } from '@broadset/model';
import type * as React from 'react';
import { vi } from 'vitest';

import type {
  AnimationBindingSectionsProps,
  EasingGraphEditorProps,
  PerPropertyLanesProps,
  TimelineBottomPanelProps,
  TimelineEditingContextValue,
  TimelineEditorProps,
} from './index';

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

vi.mock('@heroui/react', async () => {
  const ReactActual = await vi.importActual<typeof React>('react');
  const { buildCommonHeroUi } = await import('../testing/heroui-mock-common');
  const common = buildCommonHeroUi(ReactActual);

  const Tooltip = Object.assign(common.createWrapper(), {
    Trigger: common.createWrapper(),
    Content: common.createWrapper('span'),
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

  function createFragment(props: MockHeroUiProps): React.JSX.Element {
    return ReactActual.createElement(ReactActual.Fragment, null, props.children ?? null);
  }

  const Select = Object.assign(SelectRoot, {
    Trigger: createFragment,
    Value: createFragment,
    Indicator: createFragment,
    Popover: createFragment,
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
    Button: common.Button,
    ListBox: Object.assign(createFragment, {
      Item: ListBoxItem,
      Section: common.createWrapper(),
      ItemIndicator: common.createWrapper('span'),
    }),
    ListBoxItem,
    Select,
    Tooltip,
  };
});

interface TimelineTestModules {
  readonly AnimationBindingSections: React.ComponentType<AnimationBindingSectionsProps>;
  readonly EasingGraphEditor: React.ComponentType<EasingGraphEditorProps>;
  readonly PerPropertyLanes: React.ComponentType<PerPropertyLanesProps>;
  readonly TimelineBottomPanel: React.ComponentType<TimelineBottomPanelProps>;
  readonly TimelineEditingProvider: React.ComponentType<{ readonly children: React.ReactNode }>;
  readonly TimelineEditor: React.ComponentType<TimelineEditorProps>;
  readonly useTimelineEditing: () => TimelineEditingContextValue | null;
}

let cachedModules: TimelineTestModules | null = null;

export async function loadTimelineTestModules(): Promise<TimelineTestModules> {
  if (cachedModules !== null) {
    return cachedModules;
  }

  const mod = await import('./index');

  cachedModules = {
    AnimationBindingSections: mod.AnimationBindingSections,
    EasingGraphEditor: mod.EasingGraphEditor,
    PerPropertyLanes: mod.PerPropertyLanes,
    TimelineBottomPanel: mod.TimelineBottomPanel,
    TimelineEditingProvider: mod.TimelineEditingProvider,
    TimelineEditor: mod.TimelineEditor,
    useTimelineEditing: mod.useTimelineEditing,
  };

  return cachedModules;
}

export function makeKeyframe(overrides: Partial<Keyframe> = {}): Keyframe {
  return {
    name: 'kf-1',
    action: 'setState',
    offsetMs: 0,
    properties: {},
    ...overrides,
  };
}

export function makeTimeline(overrides: Partial<Timeline> & { keyframes?: readonly Keyframe[] } = {}): Timeline {
  return {
    id: 'tl-1',
    name: 'default',
    keyframes: [],
    ...overrides,
  };
}

export function defaultEditorProps(overrides: Partial<TimelineEditorProps> = {}): TimelineEditorProps {
  return {
    timeline: makeTimeline(),
    selectedKeyframeIndex: null,
    onSelectKeyframe: vi.fn<(index: number) => void>(),
    onAddKeyframe: vi.fn<() => void>(),
    onMoveKeyframe: vi.fn<(index: number, offsetMs: number) => void>(),
    onChangeEasing: vi.fn<(index: number, easing: EasingMode) => void>(),
    onPlayTimeline: vi.fn<() => void>(),
    onStopTimeline: vi.fn<() => void>(),
    onSeekTimeline: vi.fn<(timeMs: number) => void>(),
    currentTimeMs: 0,
    isPlaying: false,
    ...overrides,
  };
}

export function defaultBottomPanelProps(overrides: Partial<TimelineBottomPanelProps> = {}): TimelineBottomPanelProps {
  return {
    isOpen: false,
    onClose: vi.fn<() => void>(),
    ...overrides,
  };
}

export function defaultBindingSectionsProps(
  overrides: Partial<AnimationBindingSectionsProps> = {},
): AnimationBindingSectionsProps {
  return {
    stateBindings: [],
    modifierBindings: [],
    timelines: [],
    onAddStateBinding: vi.fn<(stateName: string, timelineId: string) => void>(),
    onRemoveStateBinding: vi.fn<(stateName: string) => void>(),
    onRenameStateBinding: vi.fn<(oldName: string, newName: string) => void>(),
    onAddModifierBinding: vi.fn<(modifierName: string, inTimelineId: string, outTimelineId: string) => void>(),
    onRemoveModifierBinding: vi.fn<(modifierName: string) => void>(),
    ...overrides,
  };
}

export function defaultEasingGraphProps(overrides: Partial<EasingGraphEditorProps> = {}): EasingGraphEditorProps {
  return {
    easing: 'ease' as EasingMode,
    onChange: vi.fn<(easing: EasingMode) => void>(),
    isPlaying: false,
    playbackProgress: 0,
    ...overrides,
  };
}

export function makePropertyKeyframe(
  overrides: Partial<Keyframe> & {
    properties?: Record<string, { readonly type: 'number'; readonly value: number; readonly easing: EasingMode }>;
  } = {},
): Keyframe {
  return {
    name: 'kf-prop',
    action: 'none',
    offsetMs: 0,
    properties: {},
    ...overrides,
  };
}

export function defaultPerPropertyLanesProps(overrides: Partial<PerPropertyLanesProps> = {}): PerPropertyLanesProps {
  return {
    keyframes: [],
    durationMs: 3000,
    onAddPropertyKeyframe: vi.fn<(offsetMs: number, property: string) => void>(),
    onMovePropertyKeyframe: vi.fn<(fromIndex: number, property: string, toOffsetMs: number) => void>(),
    ...overrides,
  };
}
