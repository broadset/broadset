import {
  type BroadsetDocument,
  type BroadsetElement,
  createDefaultElement,
  createEmptyBroadsetDocument,
} from '@broadset/model';

export function makeElement(id: string, overrides: Partial<BroadsetElement> = {}): BroadsetElement {
  return {
    ...createDefaultElement('rectangle', { width: 100, height: 50 }),
    id,
    name: id,
    ...overrides,
  };
}

export function makeDocument(elements: readonly BroadsetElement[]): BroadsetDocument {
  const base = createEmptyBroadsetDocument();

  return { ...base, elements: [...elements] };
}

export function pressKey(
  key: string,
  modifiers: { ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean; metaKey?: boolean } = {},
): KeyboardEvent {
  const prevented = { value: false };

  return {
    key,
    ctrlKey: modifiers.ctrlKey ?? false,
    shiftKey: modifiers.shiftKey ?? false,
    altKey: modifiers.altKey ?? false,
    metaKey: modifiers.metaKey ?? false,
    preventDefault: () => {
      prevented.value = true;
    },
    get defaultPrevented() {
      return prevented.value;
    },
  } as unknown as KeyboardEvent;
}
