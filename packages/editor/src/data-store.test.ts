import { describe, expect, it } from '@jest/globals';

import { createDataStore } from './data-store';

describe('BroadsetDataStore', () => {
  describe('Store Initialization', () => {
    /** @description Empty store must start with no element data so consumers know the store is clean. */
    it('creates an empty store when no initial elements are provided', () => {
      const store = createDataStore();

      expect(store.getState().elements).toEqual({});
    });

    /** @description Pre-populated stores must resolve element data immediately for use at mount time. */
    it('accepts initial elements and preserves their data', () => {
      const store = createDataStore({ 'el-1': { text: 'hello' } });

      expect(store.getState().elements['el-1']).toEqual({ text: 'hello' });
    });
  });

  describe('Element Data Merge Update', () => {
    /** @description Merge semantics are critical so that partial updates don't wipe unrelated fields. */
    it('merges partial data into existing element data without losing other fields', () => {
      const store = createDataStore({ 'el-1': { text: 'old', data: { keep: true } } });

      store.getState().updateElementData('el-1', { text: 'updated' });

      const el = store.getState().elements['el-1'];

      expect(el?.['text']).toBe('updated');
      expect(el?.['data']).toEqual({ keep: true });
    });

    /** @description Updating one element must not mutate other elements' data. */
    it('does not affect other elements when one is updated', () => {
      const store = createDataStore({
        'el-1': { text: 'a' },
        'el-2': { text: 'b' },
      });

      store.getState().updateElementData('el-1', { text: 'changed' });
      expect(store.getState().elements['el-2']).toEqual({ text: 'b' });
    });

    /** @description Creating data for a new element via merge must work from scratch. */
    it('creates element data when no prior entry exists', () => {
      const store = createDataStore();

      store.getState().updateElementData('el-new', { text: 'fresh' });
      expect(store.getState().elements['el-new']).toEqual({ text: 'fresh' });
    });
  });

  describe('Element Data Full Replacement', () => {
    /** @description Full replacement must discard all prior fields, not merge. */
    it('replaces element data entirely, discarding old fields', () => {
      const store = createDataStore({ 'el-1': { text: 'old', data: { extra: true } } });

      store.getState().setElementData('el-1', { text: 'new' });

      const el = store.getState().elements['el-1'];

      expect(el?.['text']).toBe('new');
      expect(el?.['data']).toBeUndefined();
    });
  });

  describe('Bulk Update', () => {
    /** @description Bulk update must be atomic (one notification) so subscribers don't see intermediate states. */
    it('updates multiple elements in a single notification', () => {
      const store = createDataStore();
      let notifyCount = 0;

      store.subscribe(() => {
        notifyCount++;
      });

      store.getState().bulkUpdate({
        'el-1': { score: 1 },
        'el-2': { score: 2 },
        'el-3': { score: 3 },
      });

      expect(store.getState().elements['el-1']).toEqual({ score: 1 });
      expect(store.getState().elements['el-2']).toEqual({ score: 2 });
      expect(store.getState().elements['el-3']).toEqual({ score: 3 });
      expect(notifyCount).toBe(1);
    });

    /** @description Bulk update must merge into existing data, not replace. */
    it('merge-updates existing element data during bulk update', () => {
      const store = createDataStore({ 'el-1': { text: 'keep', value: 10 } });

      store.getState().bulkUpdate({ 'el-1': { value: 20 } });

      const el = store.getState().elements['el-1'];

      expect(el?.['text']).toBe('keep');
      expect(el?.['value']).toBe(20);
    });
  });

  describe('Selector Isolation', () => {
    /** @description Selector isolation prevents wasted re-renders when unrelated elements change. */
    it('does not fire a selector for el-1 when el-2 changes', () => {
      const store = createDataStore({ 'el-1': { text: 'a' }, 'el-2': { text: 'b' } });

      const selectorFires: string[] = [];

      store.subscribe(
        (state) => state.elements['el-1']?.['text'],
        (value) => {
          selectorFires.push(value as string);
        },
      );

      // Update el-2 — selector for el-1 should not fire
      store.getState().updateElementData('el-2', { text: 'changed' });
      expect(selectorFires).toHaveLength(0);

      // Update el-1 — selector should fire
      store.getState().updateElementData('el-1', { text: 'updated' });
      expect(selectorFires).toEqual(['updated']);
    });
  });

  describe('Store Instance Independence', () => {
    /** @description Multiple stores must be fully independent to support multi-instance editors. */
    it('isolates mutations between store instances', () => {
      const storeA = createDataStore({ 'el-1': { text: 'a' } });
      const storeB = createDataStore({ 'el-1': { text: 'b' } });

      storeA.getState().updateElementData('el-1', { text: 'changed' });

      expect(storeA.getState().elements['el-1']?.['text']).toBe('changed');
      expect(storeB.getState().elements['el-1']?.['text']).toBe('b');
    });
  });
});
