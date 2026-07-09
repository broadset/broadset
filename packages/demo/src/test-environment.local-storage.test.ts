/** @vitest-environment jsdom */

import { describe, expect, it } from 'vitest';

describe('jsdom localStorage test environment', () => {
  /** @description The shared jsdom setup must provide the complete Storage API even when the Node runtime exposes partial web storage globals. */
  it('provides setItem, getItem, removeItem, and clear', () => {
    window.localStorage.setItem('broadset:test-storage', 'available');

    expect(window.localStorage.getItem('broadset:test-storage')).toBe('available');

    window.localStorage.removeItem('broadset:test-storage');

    expect(window.localStorage.getItem('broadset:test-storage')).toBeNull();

    window.localStorage.setItem('broadset:test-storage', 'available');
    window.localStorage.clear();

    expect(window.localStorage.getItem('broadset:test-storage')).toBeNull();
  });
});
