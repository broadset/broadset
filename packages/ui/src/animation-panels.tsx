import { Button } from '@heroui/react';
import type { JSX, ReactNode } from 'react';
import { createContext, useContext } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Partial animation config shape for resilient rendering. */
export interface AnimationConfigLike {
  readonly timelines?: readonly { readonly id: string; readonly name: string; readonly entries: readonly unknown[] }[];
  readonly stateTimelineBindings?: readonly unknown[];
  readonly modifierTimelineBindings?: readonly unknown[];
}

export interface AnimationSidebarProps {
  readonly elementId: string | null;
  readonly animationsEnabled: boolean;
  readonly locked: boolean;
  readonly config?: AnimationConfigLike;
}

export interface AnimationBuilderProps {
  readonly config: AnimationConfigLike | undefined;
}

export interface KeyframeAdapter {
  isIncluded(key: string): boolean;
  getValue(key: string): unknown;
  toggleProperty(key: string, included: boolean, defaultValue: unknown): void;
  updateValue(key: string, value: unknown): void;
}

export interface PropertyFieldProps {
  readonly propertyKey: string;
  readonly defaultValue?: unknown;
  readonly children: ReactNode;
}

export interface AnimationModePropertiesPanelProps {
  readonly adapter: KeyframeAdapter;
  readonly children: ReactNode;
}

// ---------------------------------------------------------------------------
// PropertyEditingContext
// ---------------------------------------------------------------------------

const PropertyEditingContext = createContext<KeyframeAdapter | null>(null);

/**
 * Returns the keyframe adapter when inside a PropertyEditingProvider,
 * or null when in normal (non-keyframe) editing mode.
 */
export function usePropertyEditing(): KeyframeAdapter | null {
  return useContext(PropertyEditingContext);
}

/**
 * Provides a KeyframeAdapter to descendant PropertyField components.
 */
export function PropertyEditingProvider({
  adapter,
  children,
}: {
  readonly adapter: KeyframeAdapter;
  readonly children: ReactNode;
}): JSX.Element {
  return <PropertyEditingContext value={adapter}>{children}</PropertyEditingContext>;
}

// ---------------------------------------------------------------------------
// AnimationSidebar
// ---------------------------------------------------------------------------

/**
 * Shows the animation builder when an element is selected and animations
 * are enabled. Renders empty, disabled, or lock states as appropriate.
 */
export function AnimationSidebar({ elementId, animationsEnabled, locked, config }: AnimationSidebarProps): JSX.Element {
  if (elementId === null) {
    return (
      <aside role="region" aria-label="Animation">
        <p>No element selected</p>
      </aside>
    );
  }

  if (!animationsEnabled) {
    return (
      <aside role="region" aria-label="Animation">
        <p>Animations disabled</p>
      </aside>
    );
  }

  return (
    <aside role="region" aria-label="Animation">
      {locked ?
        <p>Element is locked</p>
      : null}
      <AnimationBuilder config={config} />
    </aside>
  );
}

// ---------------------------------------------------------------------------
// AnimationBuilder
// ---------------------------------------------------------------------------

/**
 * Renders animation timelines from config. Resilient to partial or missing
 * config — renders an empty state instead of crashing.
 */
export function AnimationBuilder({ config }: AnimationBuilderProps): JSX.Element {
  const timelines = config?.timelines ?? [];

  if (timelines.length === 0) {
    return <div>No timelines configured</div>;
  }

  return (
    <div>
      {timelines.map((tl) => (
        <div key={tl.id}>{tl.name}</div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PropertyField
// ---------------------------------------------------------------------------

/**
 * Wraps a property input. In normal mode, renders children directly.
 * In keyframe mode (when a KeyframeAdapter is provided via context),
 * shows include/remove toggle buttons for keyframe property management.
 */
export function PropertyField({ propertyKey, defaultValue, children }: PropertyFieldProps): JSX.Element {
  const adapter = usePropertyEditing();

  if (adapter === null) {
    // Normal mode — render children directly
    return <>{children}</>;
  }

  const included = adapter.isIncluded(propertyKey);

  return (
    <div>
      {children}
      {included ?
        <Button
          size="sm"
          variant="ghost"
          aria-label="Remove property"
          onPress={() => {
            adapter.toggleProperty(propertyKey, false, defaultValue);
          }}
        >
          Remove
        </Button>
      : <Button
          size="sm"
          variant="ghost"
          aria-label="Include property"
          onPress={() => {
            adapter.toggleProperty(propertyKey, true, defaultValue);
          }}
        >
          Include
        </Button>
      }
    </div>
  );
}

// ---------------------------------------------------------------------------
// AnimationModePropertiesPanel
// ---------------------------------------------------------------------------

/**
 * Wraps content in a PropertyEditingProvider when a keyframe is selected.
 * This enables descendant PropertyField components to detect keyframe mode
 * and route edits through the adapter.
 */
export function AnimationModePropertiesPanel({ adapter, children }: AnimationModePropertiesPanelProps): JSX.Element {
  return (
    <section role="region" aria-label="Animation Properties">
      <PropertyEditingProvider adapter={adapter}>{children}</PropertyEditingProvider>
    </section>
  );
}
