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

  if (trimmed === '') {
    return SHADOW_DEFAULTS;
  }

  const inset = trimmed.startsWith('inset');
  const working = inset ? trimmed.slice('inset'.length).trim() : trimmed;
  // CSS accepts bare `0` (no unit) alongside `0px`, so the `px` suffix is
  // optional on every component. Without this, common multi-shadow values
  // from real documents (e.g. `0 2px 32px rgba(...)`) failed the regex and
  // the ShadowEditor fell back to all-zero defaults even when the element
  // style was populated.
  const NUMBER_WITH_OPTIONAL_PX = '(-?\\d+(?:\\.\\d+)?)(?:px)?';
  const pattern = new RegExp(
    `^${NUMBER_WITH_OPTIONAL_PX}\\s+${NUMBER_WITH_OPTIONAL_PX}(?:\\s+${NUMBER_WITH_OPTIONAL_PX})?(?:\\s+${NUMBER_WITH_OPTIONAL_PX})?\\s*(.*)$`,
    'u',
  );
  const match = pattern.exec(working);

  if (match === null) {
    return SHADOW_DEFAULTS;
  }

  const trimmedColor = match[5]?.trim() ?? '';

  return {
    offsetX: Number.parseFloat(match[1] ?? '0'),
    offsetY: Number.parseFloat(match[2] ?? '0'),
    blur: Number.parseFloat(match[3] ?? '0'),
    spread: Number.parseFloat(match[4] ?? '0'),
    color: trimmedColor === '' ? SHADOW_DEFAULTS.color : trimmedColor,
    inset,
  };
}

export function buildBoxShadow(data: ShadowData): string {
  const prefix = data.inset ? 'inset ' : '';

  return `${prefix}${String(data.offsetX)}px ${String(data.offsetY)}px ${String(data.blur)}px ${String(
    data.spread,
  )}px ${data.color}`;
}

export function buildTextShadow(data: ShadowData): string {
  return `${String(data.offsetX)}px ${String(data.offsetY)}px ${String(data.blur)}px ${data.color}`;
}

export interface FilterEntry {
  readonly fn: string;
  readonly value: number;
  readonly unit: string;
}

export function parseFilter(str: string): readonly FilterEntry[] {
  const trimmed = str.trim();

  if (trimmed === '') {
    return [];
  }

  const results: FilterEntry[] = [];
  const regex = /([a-z-]+)\(([^)]+)\)/giu;

  for (const match of trimmed.matchAll(regex)) {
    const fn = match[1] ?? '';
    const rawValue = match[2]?.trim() ?? '';
    const valueMatch = /^(-?\d+(?:\.\d+)?)(.*)$/u.exec(rawValue);

    if (valueMatch === null) {
      continue;
    }

    results.push({
      fn,
      value: Number.parseFloat(valueMatch[1] ?? '0'),
      unit: valueMatch[2] ?? '',
    });
  }

  return results;
}

export function buildFilter(entries: readonly FilterEntry[]): string {
  return entries.map((entry) => `${entry.fn}(${String(entry.value)}${entry.unit})`).join(' ');
}

export interface CssLength {
  readonly value: number;
  readonly unit: string;
}

export function parseCssLength(str: string): CssLength {
  const trimmed = str.trim();

  if (trimmed === '') {
    return { value: 0, unit: 'px' };
  }

  const match = /^(-?\d+(?:\.\d+)?)(.*)$/u.exec(trimmed);

  if (match === null) {
    return { value: 0, unit: 'px' };
  }

  return {
    value: Number.parseFloat(match[1] ?? '0'),
    unit: (match[2] ?? 'px').trim() || 'px',
  };
}

export interface StateBinding {
  readonly stateName: string;
  readonly timelineId: string;
  readonly order: number;
}

const RESERVED_STATE_LABELS = ['IN', 'OUT'] as const;

function normalizeTimelineId(binding: StateBinding): string {
  const trimmed = binding.timelineId.trim();

  return trimmed === '' ? binding.stateName : trimmed;
}

export function normalizeStateBindings(bindings: readonly StateBinding[]): readonly StateBinding[] {
  const inBinding = bindings.find((binding) => binding.stateName === 'IN');
  const outBinding = bindings.find((binding) => binding.stateName === 'OUT');
  const customBindings = bindings.filter(
    (binding) => !RESERVED_STATE_LABELS.includes(binding.stateName as 'IN' | 'OUT'),
  );

  const collected: StateBinding[] = [
    inBinding ?? { stateName: 'IN', timelineId: 'IN', order: 0 },
    ...customBindings,
    outBinding ?? { stateName: 'OUT', timelineId: 'OUT', order: 0 },
  ];

  return collected.map((binding, index) => ({
    ...binding,
    timelineId: normalizeTimelineId(binding),
    order: index,
  }));
}

export interface TimelineOption {
  readonly id: string;
  readonly label: string;
}

export function buildTimelineOptions(
  timelines: readonly { readonly id: string; readonly name: string | null | undefined }[],
): readonly TimelineOption[] {
  return [...timelines]
    .map((timeline) => ({
      id: timeline.id,
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- empty-string name should also fall back to id, so `||` is intentional
      label: timeline.name?.trim() || timeline.id,
    }))
    .sort((left, right) => left.label.localeCompare(right.label));
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

interface NumericKeyframeEntry {
  readonly value: number;
}

interface NumericKeyframeAdapter {
  readonly [property: string]: NumericKeyframeEntry | undefined;
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
    return { value: input.elementValue, disabled: false };
  }

  const entry = input.adapter[input.property];

  if (entry === undefined) {
    return { value: input.elementValue, disabled: true };
  }

  return { value: entry.value, disabled: false };
}

interface StringKeyframeEntry {
  readonly value: string;
}

interface StringKeyframeAdapter {
  readonly [property: string]: StringKeyframeEntry | undefined;
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
      disabled: false,
      onChange: (value) => {
        input.onChange(input.property, value);
      },
    };
  }

  const entry = input.adapter[input.property];

  if (entry === undefined) {
    return {
      value: input.elementValue,
      disabled: true,
      onChange: () => undefined,
    };
  }

  return {
    value: entry.value,
    disabled: false,
    onChange: (value) => {
      input.onChange(input.property, value);
    },
  };
}

export type WheelAction = 'pan' | 'zoom' | 'none';

interface WheelInput {
  readonly deltaX: number;
  readonly deltaY: number;
  readonly deltaMode: number;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
  readonly screenReaderActive?: boolean | undefined;
}

export function classifyWheelInput(input: WheelInput): WheelAction {
  if (input.screenReaderActive === true) {
    return 'none';
  }

  if (input.deltaMode !== 0) {
    if (input.ctrlKey || input.altKey) {
      return 'pan';
    }

    return 'zoom';
  }

  if (input.ctrlKey || input.altKey) {
    return 'zoom';
  }

  const absoluteDeltaX = Math.abs(input.deltaX);
  const absoluteDeltaY = Math.abs(input.deltaY);

  // macOS browsers can report physical mouse-wheel steps as large pixel deltas instead of line deltas.
  // Treat those coarse vertical jumps as zoom so plain mouse-wheel scrolling still follows the canvas spec.
  if (absoluteDeltaY >= 60 && absoluteDeltaY >= absoluteDeltaX * 2) {
    return 'zoom';
  }

  if (absoluteDeltaX > 0.5) {
    return 'pan';
  }

  return absoluteDeltaY >= 60 ? 'zoom' : 'pan';
}
