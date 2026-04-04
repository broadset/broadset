import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import {
  createToastController,
  DEFAULT_SIDEBAR_PREFS,
  getDismissDuration,
  lockViewportOverflow,
  readSidebarPreferences,
  saveSidebarPreferences,
  SIDEBAR_PREFS_KEY,
} from './demoState';

// ---------------------------------------------------------------------------
// Sidebar Preferences Persistence
// ---------------------------------------------------------------------------

describe('Sidebar Preferences Persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  /**
   * @description Sidebar state changes must persist open/closed, tab, and width
   * to localStorage.
   */
  it('saves open, tab, and width to localStorage', () => {
    const prefs = { open: false, tab: 'properties', width: 500 };

    saveSidebarPreferences(prefs);

    const stored = localStorage.getItem(SIDEBAR_PREFS_KEY);

    expect(stored).toBeTruthy();
    expect(JSON.parse(stored ?? '{}')).toEqual(prefs);
  });

  /**
   * @description Saved preferences must be restored on read.
   */
  it('restores saved preferences', () => {
    const prefs = { open: false, tab: 'animation', width: 400 };

    localStorage.setItem(SIDEBAR_PREFS_KEY, JSON.stringify(prefs));

    const result = readSidebarPreferences();

    expect(result).toEqual(prefs);
  });

  /**
   * @description Corrupt localStorage data must be silently ignored,
   * returning defaults.
   */
  it('returns defaults on corrupt localStorage data', () => {
    localStorage.setItem(SIDEBAR_PREFS_KEY, 'not valid json!!!');

    const result = readSidebarPreferences();

    expect(result).toEqual(DEFAULT_SIDEBAR_PREFS);
  });

  /**
   * @description Missing localStorage data must return defaults.
   */
  it('returns defaults when no data exists', () => {
    const result = readSidebarPreferences();

    expect(result).toEqual(DEFAULT_SIDEBAR_PREFS);
  });
});

// ---------------------------------------------------------------------------
// Toast Notification System
// ---------------------------------------------------------------------------

describe('Toast Notification System', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  /**
   * @description Success toasts must auto-dismiss after ~3 seconds.
   */
  it('success toast auto-dismisses after ~3 seconds', () => {
    const controller = createToastController();

    controller.show('success', 'Export complete');

    expect(controller.getToasts()).toHaveLength(1);

    jest.advanceTimersByTime(getDismissDuration('success'));

    expect(controller.getToasts()).toHaveLength(0);
  });

  /**
   * @description Error toasts must auto-dismiss after ~5 seconds.
   */
  it('error toast auto-dismisses after ~5 seconds', () => {
    const controller = createToastController();

    controller.show('error', 'Export failed');

    expect(controller.getToasts()).toHaveLength(1);

    jest.advanceTimersByTime(getDismissDuration('error'));

    expect(controller.getToasts()).toHaveLength(0);
  });

  /**
   * @description Multiple simultaneous toasts must be visible and dismiss
   * independently.
   */
  it('multiple toasts are visible and dismiss independently', () => {
    const controller = createToastController();

    controller.show('success', 'Saved');
    controller.show('error', 'Export failed');

    expect(controller.getToasts()).toHaveLength(2);

    // Success dismisses first (3s)
    jest.advanceTimersByTime(getDismissDuration('success'));
    expect(controller.getToasts()).toHaveLength(1);

    const remaining = controller.getToasts()[0];

    expect(remaining).toBeDefined();
    expect(remaining?.severity).toBe('error');

    // Error dismisses after (5s - 3s = 2s more)
    jest.advanceTimersByTime(getDismissDuration('error') - getDismissDuration('success'));
    expect(controller.getToasts()).toHaveLength(0);
  });

  /**
   * @description Newest toasts must be on top (first in array).
   */
  it('stacks toasts with newest on top', () => {
    const controller = createToastController();

    controller.show('info', 'First');
    controller.show('success', 'Second');

    const toasts = controller.getToasts();

    expect(toasts[0]?.message).toBe('Second');
    expect(toasts[1]?.message).toBe('First');
  });

  /**
   * @description Each toast must contain severity, message, and a unique id.
   */
  it('toast contains severity, message, and id', () => {
    const controller = createToastController();

    controller.show('success', 'Done!');

    const toast = controller.getToasts()[0];

    expect(toast).toBeDefined();

    if (toast === undefined) return;

    expect(toast.id).toBeTruthy();
    expect(toast.severity).toBe('success');
    expect(toast.message).toBe('Done!');
  });

  /**
   * @description Manual dismiss must remove the toast immediately.
   */
  it('dismiss removes toast immediately', () => {
    const controller = createToastController();
    const id = controller.show('info', 'Dismissable');

    expect(controller.getToasts()).toHaveLength(1);

    controller.dismiss(id);

    expect(controller.getToasts()).toHaveLength(0);
  });

  /**
   * @description Subscribe must receive toast updates.
   */
  it('subscriber receives toast changes', () => {
    const controller = createToastController();
    const updates: number[] = [];

    controller.subscribe((toasts) => {
      updates.push(toasts.length);
    });

    controller.show('success', 'A');
    controller.show('error', 'B');

    expect(updates).toEqual([1, 2]);
  });
});

// ---------------------------------------------------------------------------
// Viewport Overflow Lock
// ---------------------------------------------------------------------------

describe('Viewport Overflow Lock', () => {
  /**
   * @description On mount, overflow must be hidden and height 100% on html and body.
   */
  it('sets overflow hidden and height 100% on mount', () => {
    const restore = lockViewportOverflow();

    expect(document.documentElement.style.overflow).toBe('hidden');
    expect(document.documentElement.style.height).toBe('100%');
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.body.style.height).toBe('100%');

    restore();
  });

  /**
   * @description On unmount (restore), previous values must be restored.
   */
  it('restores previous values on unmount', () => {
    document.documentElement.style.overflow = 'auto';
    document.documentElement.style.height = 'auto';
    document.body.style.overflow = 'scroll';
    document.body.style.height = '50%';

    const restore = lockViewportOverflow();

    // Verify locked
    expect(document.documentElement.style.overflow).toBe('hidden');

    // Restore
    restore();

    expect(document.documentElement.style.overflow).toBe('auto');
    expect(document.documentElement.style.height).toBe('auto');
    expect(document.body.style.overflow).toBe('scroll');
    expect(document.body.style.height).toBe('50%');
  });
});

// ---------------------------------------------------------------------------
// getDismissDuration
// ---------------------------------------------------------------------------

describe('getDismissDuration', () => {
  /**
   * @description Success and info must be ~3000ms, error must be ~5000ms.
   */
  it('returns correct durations per severity', () => {
    expect(getDismissDuration('success')).toBe(3000);
    expect(getDismissDuration('error')).toBe(5000);
    expect(getDismissDuration('info')).toBe(3000);
  });
});
