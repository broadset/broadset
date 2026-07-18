import type { JSX, ReactNode } from 'react';
import { createContext, useContext } from 'react';

/** RFC 6901 pointer into an entity's data, addressed by the entity it belongs to. */
export interface KeyframePropertyTargetRef {
  readonly entityId: string;
  readonly pointer: string;
}

/**
 * panels.md "Property Editing Context for Keyframes": while a keyframe is selected on the
 * timeline, properties-panel edits for the keyframe's own property must commit to the
 * keyframe's typed value instead of the element's base appearance. This adapter is the single
 * seam the properties sidebar uses to route those edits without knowing about sequences,
 * tracks, or keyframes directly.
 */
export interface KeyframePropertyAdapter {
  readonly target: KeyframePropertyTargetRef;
  readonly getValue: () => number | null;
  readonly updateValue: (value: number) => boolean;
  readonly createTrack: (target: KeyframePropertyTargetRef, tick: number, initialValue: number) => boolean;
  readonly removeKeyframe: (trackId: string, keyframeId: string) => boolean;
}

const KeyframePropertyContext = createContext<KeyframePropertyAdapter | null>(null);

/** panels.md "Animation Mode Properties": present only while a stable keyframe is selected. */
export function KeyframePropertyProvider(props: {
  readonly adapter: KeyframePropertyAdapter | null;
  readonly children: ReactNode;
}): JSX.Element {
  return <KeyframePropertyContext.Provider value={props.adapter}>{props.children}</KeyframePropertyContext.Provider>;
}

/** Returns null in normal (non-keyframe) editing mode, or outside a provider. */
export function useKeyframePropertyAdapter(): KeyframePropertyAdapter | null {
  return useContext(KeyframePropertyContext);
}
