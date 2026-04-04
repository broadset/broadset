// ---------------------------------------------------------------------------
// UI Utilities — CSS parsers, animation helpers, wheel classification
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// CSS Shadow Parsing and Building
// ---------------------------------------------------------------------------

export interface ShadowData {
  readonly offsetX: number;
  readonly offsetY: number;
  readonly blur: number;
  readonly spread: number;
  readonly color: string;
  readonly inset: boolean;
}

const SHADOW_DEFAULTS: ShadowData = {
  offsetX: 0,
  offsetY: 0,
  blur: 0,
  spread: 0,
  color: 'rgba(0,0,0,0)',
  inset: false,
};

export function parseShadow(str: string): ShadowData {
  const trimmed = str.trim();

  if (trimmed === '') return SHADOW_DEFAULTS;

  const inset = trimmed.startsWith('inset');
  const working = inset ? trimmed.slice(5).trim() : trimmed;

  // Match px values then the remaining color string
  const match =
    /^(-?\d+(?:\.\d+)?)px\s+(-?\d+(?:\.\d+)?)px(?:\s+(-?\d+(?:\.\d+)?)px)?(?:\s+(-?\d+(?:\.\d+)?)px)?\s*(.*)$/.exec(
      working,
    );

  if (!match) return SHADOW_DEFAULTS;

  return {
    offsetX: parseFloat(match[1] ?? '0'),
    offsetY: parseFloat(match[2] ?? '0'),
    blur: parseFloat(match[3] ?? '0'),
    spread: parseFloat(match[4] ?? '0'),
    color: match[5]?.trim() || SHADOW_DEFAULTS.color,
    inset,
  };
}

export function buildBoxShadow(data: ShadowData): string {
  const parts: string[] = [];

  if (data.inset) {
    parts.push('inset');
  }

  parts.push(`${String(data.offsetX)}px`);
  parts.push(`${String(data.offsetY)}px`);
  parts.push(`${String(data.blur)}px`);
  parts.push(`${String(data.spread)}px`);
  parts.push(data.color);

  return parts.join(' ');
}

export function buildTextShadow(data: ShadowData): string {
  return `${String(data.offsetX)}px ${String(data.offsetY)}px ${String(data.blur)}px ${data.color}`;
}

// ---------------------------------------------------------------------------
// CSS Filter Parsing and Building
// ---------------------------------------------------------------------------

export interface FilterEntry {
  readonly fn: string;
  readonly value: number;
  readonly unit: string;
}

export function parseFilter(str: string): readonly FilterEntry[] {
  const trimmed = str.trim();

  if (trimmed === '') return [];

  const results: FilterEntry[] = [];
  const regex = /([a-z-]+)\(([^)]+)\)/gi;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(trimmed)) !== null) {
    const fn = match[1] ?? '';
    const raw = match[2] ?? '';
    const numMatch = /^(-?\d+(?:\.\d+)?)(.*)$/.exec(raw.trim());

    if (numMatch) {
      results.push({
        fn,
        value: parseFloat(numMatch[1] ?? '0'),
        unit: numMatch[2] ?? '',
      });
    }
  }

  return results;
}

export function buildFilter(entries: readonly FilterEntry[]): string {
  return entries.map((e) => `${e.fn}(${String(e.value)}${e.unit})`).join(' ');
}

// ---------------------------------------------------------------------------
// CSS Length Parsing
// ---------------------------------------------------------------------------

export interface CssLength {
  readonly value: number;
  readonly unit: string;
}

export function parseCssLength(str: string): CssLength {
  const trimmed = str.trim();

  if (trimmed === '') return { value: 0, unit: 'px' };

  const match = /^(-?\d+(?:\.\d+)?)(.+)$/.exec(trimmed);

  if (!match) return { value: 0, unit: 'px' };

  return {
    value: parseFloat(match[1] ?? '0'),
    unit: match[2] ?? 'px',
  };
}

// ---------------------------------------------------------------------------
// Animation Binding Normalization
// ---------------------------------------------------------------------------

export interface StateBinding {
  readonly stateName: string;
  readonly timelineId: string;
  readonly order: number;
}

export function normalizeStateBindings(bindings: readonly StateBinding[]): readonly StateBinding[] {
  const hasIn = bindings.some((b) => b.stateName === 'IN');
  const hasOut = bindings.some((b) => b.stateName === 'OUT');

  const collected: StateBinding[] = [];

  if (!hasIn) {
    collected.push({ stateName: 'IN', timelineId: '', order: 0 });
  }

  // Insert existing bindings (IN first if present, then custom, then OUT)
  const inBindings = bindings.filter((b) => b.stateName === 'IN');
  const outBindings = bindings.filter((b) => b.stateName === 'OUT');
  const customBindings = bindings.filter((b) => b.stateName !== 'IN' && b.stateName !== 'OUT');

  collected.push(...inBindings);
  collected.push(...customBindings);

  if (!hasOut) {
    collected.push({ stateName: 'OUT', timelineId: '', order: 0 });
  }

  collected.push(...outBindings);

  // Renumber sequentially
  return collected.map((b, i) => ({ ...b, order: i }));
}

// ---------------------------------------------------------------------------
// Timeline and State Resolution
// ---------------------------------------------------------------------------

export interface TimelineOption {
  readonly id: string;
  readonly label: string;
}

export function buildTimelineOptions(
  timelines: readonly { readonly id: string; readonly name: string }[],
): readonly TimelineOption[] {
  return [...timelines]
    .map((t) => ({
      id: t.id,
      label: t.name || t.id,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

interface BindingConfig {
  readonly stateTimelineBindings?: readonly unknown[];
  readonly modifierTimelineBindings?: readonly unknown[];
}

export function getStateBindings(config: BindingConfig): readonly unknown[] {
  return config.stateTimelineBindings ?? [];
}

export function getModifierBindings(config: BindingConfig): readonly unknown[] {
  return config.modifierTimelineBindings ?? [];
}

// ---------------------------------------------------------------------------
// Keyframe Value Resolution
// ---------------------------------------------------------------------------

interface NumericKeyframeAdapter {
  readonly [property: string]: { readonly value: number } | undefined;
}

interface ResolveNumberInput {
  readonly adapter: NumericKeyframeAdapter | null;
  readonly property: string;
  readonly elementValue: number;
}

interface ResolvedNumber {
  readonly value: number;
  readonly disabled: boolean;
}

export function resolveNumber(input: ResolveNumberInput): ResolvedNumber {
  if (input.adapter === null) {
    return { value: input.elementValue, disabled: true };
  }

  const entry = input.adapter[input.property];

  if (entry === undefined) {
    return { value: input.elementValue, disabled: true };
  }

  return { value: entry.value, disabled: false };
}

interface StringKeyframeAdapter {
  readonly [property: string]: { readonly value: string } | undefined;
}

interface ResolveStringInput {
  readonly adapter: StringKeyframeAdapter | null;
  readonly property: string;
  readonly elementValue: string;
  readonly onChange: (property: string, value: string) => void;
}

interface ResolvedString {
  readonly value: string;
  readonly disabled: boolean;
  readonly onChange: (value: string) => void;
}

export function resolveString(input: ResolveStringInput): ResolvedString {
  if (input.adapter === null) {
    return {
      value: input.elementValue,
      disabled: true,
      onChange: () => {
        /* no-op when disabled */
      },
    };
  }

  const entry = input.adapter[input.property];

  if (entry === undefined) {
    return {
      value: input.elementValue,
      disabled: true,
      onChange: () => {
        /* no-op when disabled */
      },
    };
  }

  return {
    value: entry.value,
    disabled: false,
    onChange: (v: string) => {
      input.onChange(input.property, v);
    },
  };
}

// ---------------------------------------------------------------------------
// Wheel Input Classification
// ---------------------------------------------------------------------------

export type WheelAction = 'pan' | 'zoom' | 'none';

interface WheelInput {
  readonly deltaX: number;
  readonly deltaY: number;
  readonly deltaMode: number;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
}

export function classifyWheelInput(input: WheelInput): WheelAction {
  // Ctrl+wheel = pinch zoom (browser reports pinch gestures this way)
  if (input.ctrlKey) {
    return 'zoom';
  }

  // Alt + smooth delta = trackpad zoom
  if (input.altKey && input.deltaMode === 0) {
    return 'zoom';
  }

  // Smooth pixel delta without modifiers = trackpad pan
  if (input.deltaMode === 0) {
    return 'pan';
  }

  // Coarse wheel steps (deltaMode !== 0) = legacy mode, no action
  return 'none';
}
