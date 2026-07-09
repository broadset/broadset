import type { ElementAnimationConfig, Keyframe, Timeline } from '@broadset/model';

export function createKeyframe(args: {
  readonly name: string;
  readonly offsetMs: number;
  readonly action?: Keyframe['action'] | undefined;
  readonly payload?: string | undefined;
  readonly target?: string | undefined;
  readonly properties?: Keyframe['properties'] | undefined;
}): Keyframe {
  return {
    name: args.name,
    action: args.action ?? 'none',
    offsetMs: args.offsetMs,
    properties: args.properties ?? {},
    payload: args.payload,
    target: args.target,
  };
}

export function createTimeline(args: {
  readonly id: string;
  readonly name: string;
  readonly keyframes: readonly Keyframe[];
  readonly durationMs?: number | undefined;
  readonly loop?: Timeline['loop'] | undefined;
  readonly loopCount?: Timeline['loopCount'] | undefined;
}): Timeline {
  return {
    id: args.id,
    name: args.name,
    keyframes: args.keyframes,
    durationMs: args.durationMs,
    loop: args.loop ?? 'none',
    loopCount: args.loopCount ?? null,
    childTimelines: [],
    audioCues: [],
  };
}

export function createConfig(args?: {
  readonly timelines?: readonly Timeline[] | undefined;
  readonly stateTimelineBindings?: ElementAnimationConfig['stateTimelineBindings'] | undefined;
  readonly modifierTimelineBindings?: ElementAnimationConfig['modifierTimelineBindings'] | undefined;
}): ElementAnimationConfig {
  return {
    timelines: args?.timelines ?? [],
    stateTimelineBindings: args?.stateTimelineBindings ?? [],
    modifierTimelineBindings: args?.modifierTimelineBindings ?? [],
    textAnimator: null,
  };
}

export function createHostElement(elementId: string): {
  readonly root: HTMLDivElement;
  readonly host: HTMLDivElement;
  readonly opacityTarget: HTMLDivElement;
  readonly contentTarget: HTMLDivElement;
} {
  const root = document.createElement('div');
  const host = document.createElement('div');
  const opacityTarget = document.createElement('div');
  const contentTarget = document.createElement('div');

  host.dataset['elementId'] = elementId;
  host.dataset['visibility'] = 'onscreen';
  opacityTarget.dataset['opacityTarget'] = '';
  contentTarget.dataset['elementContent'] = '';

  opacityTarget.appendChild(contentTarget);
  host.appendChild(opacityTarget);
  root.appendChild(host);

  return { root, host, opacityTarget, contentTarget };
}
