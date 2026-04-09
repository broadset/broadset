import { describe, expect, it, jest } from '@jest/globals';

import { createDataStore } from './data-store';

describe('store initialization', () => {
  /** @description A data store created with no arguments MUST start with an empty elements map so consumers can safely iterate without null checks. */
  it('creates a store with empty elements by default', () => {
    const store = createDataStore();

    expect(store.getState().elements).toEqual({});
  });

  /** @description A data store created with initial elements MUST expose those values immediately so pre-seeded data is available on first render. */
  it('accepts initial elements and makes them available', () => {
    const store = createDataStore({ 'el-1': { text: 'hello' } });

    expect(store.getState().elements['el-1']?.['text']).toBe('hello');
  });
});

describe('element data merge update', () => {
  /** @description Merge update MUST preserve fields not included in the partial so incremental live updates do not wipe unrelated data. */
  it('merges partial data into existing element data without losing other fields', () => {
    const store = createDataStore({ 'el-1': { text: 'old', data: { keep: true } } });

    store.getState().updateElementData('el-1', { text: 'updated' });

    const el1 = store.getState().elements['el-1'];

    expect(el1?.['text']).toBe('updated');
    expect((el1?.['data'] as Record<string, unknown> | undefined)?.['keep']).toBe(true);
  });

  /** @description Updating one element MUST NOT affect other elements so concurrent data bindings stay correct. */
  it('does not affect other elements when one is updated', () => {
    const store = createDataStore({
      'el-1': { text: 'alpha' },
      'el-2': { text: 'beta' },
    });

    store.getState().updateElementData('el-1', { text: 'changed' });

    expect(store.getState().elements['el-2']?.['text']).toBe('beta');
  });

  /** @description Merge update on a non-existent element MUST create the entry so consumers can bind data to not-yet-rendered elements. */
  it('creates a new entry when updating a non-existent element', () => {
    const store = createDataStore();

    store.getState().updateElementData('new-el', { text: 'fresh' });

    expect(store.getState().elements['new-el']?.['text']).toBe('fresh');
  });
});

describe('element data full replacement', () => {
  /** @description Full replacement MUST discard all prior fields so stale data from a previous binding does not leak through. */
  it('replaces element data entirely, discarding old fields', () => {
    const store = createDataStore({ 'el-1': { text: 'old', data: { extra: true } } });

    store.getState().setElementData('el-1', { text: 'new' });

    const el1 = store.getState().elements['el-1'];

    expect(el1?.['text']).toBe('new');
    expect(el1?.['data']).toBeUndefined();
  });
});

describe('bulk update', () => {
  /** @description Bulk update MUST apply all element changes atomically with exactly one subscription notification so subscribers do not see partial states. */
  it('updates multiple elements in one batch with a single notification', () => {
    const store = createDataStore();
    const listener = jest.fn();

    store.subscribe(listener);

    store.getState().bulkUpdate({
      'el-1': { text: 'one' },
      'el-2': { text: 'two' },
      'el-3': { text: 'three' },
    });

    expect(store.getState().elements['el-1']?.['text']).toBe('one');
    expect(store.getState().elements['el-2']?.['text']).toBe('two');
    expect(store.getState().elements['el-3']?.['text']).toBe('three');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  /** @description Bulk update MUST merge into existing element data, not replace it, so existing fields are preserved. */
  it('merges into existing element data during bulk update', () => {
    const store = createDataStore({ 'el-1': { existing: 'kept' } });

    store.getState().bulkUpdate({ 'el-1': { text: 'added' } });

    const el1 = store.getState().elements['el-1'];

    expect(el1?.['existing']).toBe('kept');
    expect(el1?.['text']).toBe('added');
  });
});

describe('selector isolation', () => {
  /** @description Selector subscriptions MUST only fire when the selected slice changes so unrelated data updates do not cause unnecessary work. */
  it('does not fire a selector watching el-1 when el-2 is updated', () => {
    const store = createDataStore({
      'el-1': { text: 'alpha' },
      'el-2': { text: 'beta' },
    });
    const listener = jest.fn();

    store.subscribe(
      (state) => state.elements['el-1'],
      (value, previousValue) => {
        if (value !== previousValue) {
          listener();
        }
      },
    );

    store.getState().updateElementData('el-2', { text: 'changed' });

    expect(listener).not.toHaveBeenCalled();
  });

  /** @description A selector watching el-1 MUST fire when el-1's data actually changes. */
  it('fires a selector watching el-1 when el-1 is updated', () => {
    const store = createDataStore({ 'el-1': { text: 'alpha' } });
    const listener = jest.fn();

    store.subscribe(
      (state) => state.elements['el-1'],
      () => {
        listener();
      },
    );

    store.getState().updateElementData('el-1', { text: 'changed' });

    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('store instance independence', () => {
  /** @description Multiple store instances MUST be fully isolated so independent provider trees cannot interfere with each other. */
  it('isolates mutations between independent store instances', () => {
    const storeA = createDataStore({ 'el-1': { text: 'A' } });
    const storeB = createDataStore({ 'el-1': { text: 'B' } });

    storeA.getState().updateElementData('el-1', { text: 'A-updated' });

    expect(storeA.getState().elements['el-1']?.['text']).toBe('A-updated');
    expect(storeB.getState().elements['el-1']?.['text']).toBe('B');
  });
});
