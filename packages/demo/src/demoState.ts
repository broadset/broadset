// ---------------------------------------------------------------------------
// Sidebar Preferences Persistence
// ---------------------------------------------------------------------------

const SIDEBAR_PREFS_KEY = 'broadset-sidebar-prefs-v1';

export interface SidebarPreferences {
  readonly open: boolean;
  readonly tab: string;
  readonly width: number;
}

const DEFAULT_SIDEBAR_PREFS: SidebarPreferences = {
  open: true,
  tab: 'layers',
  width: 320,
};

/**
 * Reads sidebar preferences from localStorage.
 * Returns defaults on missing or corrupt data.
 */
export function readSidebarPreferences(): SidebarPreferences {
  try {
    const raw = localStorage.getItem(SIDEBAR_PREFS_KEY);

    if (raw === null) return DEFAULT_SIDEBAR_PREFS;

    const parsed: unknown = JSON.parse(raw);

    if (typeof parsed !== 'object' || parsed === null) return DEFAULT_SIDEBAR_PREFS;

    const obj = parsed as Record<string, unknown>;
    const open = typeof obj['open'] === 'boolean' ? obj['open'] : DEFAULT_SIDEBAR_PREFS.open;
    const tab = typeof obj['tab'] === 'string' ? obj['tab'] : DEFAULT_SIDEBAR_PREFS.tab;
    const width =
      typeof obj['width'] === 'number' && Number.isFinite(obj['width']) ? obj['width'] : DEFAULT_SIDEBAR_PREFS.width;

    return { open, tab, width };
  } catch {
    return DEFAULT_SIDEBAR_PREFS;
  }
}

/**
 * Persists sidebar preferences to localStorage.
 */
export function saveSidebarPreferences(prefs: SidebarPreferences): void {
  try {
    localStorage.setItem(SIDEBAR_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // localStorage may be unavailable
  }
}

export { DEFAULT_SIDEBAR_PREFS, SIDEBAR_PREFS_KEY };

// ---------------------------------------------------------------------------
// Toast Notification System
// ---------------------------------------------------------------------------

export type ToastSeverity = 'success' | 'error' | 'info';

export interface Toast {
  readonly id: string;
  readonly severity: ToastSeverity;
  readonly message: string;
}

const SUCCESS_DISMISS_MS = 3000;
const ERROR_DISMISS_MS = 5000;
const INFO_DISMISS_MS = 3000;

/**
 * Returns the auto-dismiss duration in ms for a given severity.
 */
export function getDismissDuration(severity: ToastSeverity): number {
  switch (severity) {
    case 'success':
      return SUCCESS_DISMISS_MS;
    case 'error':
      return ERROR_DISMISS_MS;
    case 'info':
      return INFO_DISMISS_MS;
  }
}

export type ToastListener = (toasts: readonly Toast[]) => void;

export interface ToastController {
  /** Show a toast. Returns the toast ID. */
  readonly show: (severity: ToastSeverity, message: string) => string;
  /** Dismiss a toast by ID. */
  readonly dismiss: (id: string) => void;
  /** Get current toasts (newest first). */
  readonly getToasts: () => readonly Toast[];
  /** Subscribe to toast list changes. Returns unsubscribe fn. */
  readonly subscribe: (listener: ToastListener) => () => void;
}

let nextToastId = 0;

/**
 * Creates a ToastController that manages toast lifecycles.
 * Toasts auto-dismiss after their severity-dependent duration.
 */
export function createToastController(): ToastController {
  const toasts: Toast[] = [];
  const listeners = new Set<ToastListener>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  function notify(): void {
    const snapshot = [...toasts] as readonly Toast[];

    for (const listener of listeners) {
      listener(snapshot);
    }
  }

  function dismiss(id: string): void {
    const idx = toasts.findIndex((t) => t.id === id);

    if (idx === -1) return;

    toasts.splice(idx, 1);

    const timer = timers.get(id);

    if (timer !== undefined) {
      clearTimeout(timer);
      timers.delete(id);
    }

    notify();
  }

  return {
    show(severity: ToastSeverity, message: string): string {
      const id = `toast-${String(++nextToastId)}`;
      const toast: Toast = { id, severity, message };

      // Newest on top — insert at beginning
      toasts.unshift(toast);

      const duration = getDismissDuration(severity);
      const timer = setTimeout(() => {
        dismiss(id);
      }, duration);

      timers.set(id, timer);

      notify();

      return id;
    },

    dismiss,

    getToasts(): readonly Toast[] {
      return [...toasts];
    },

    subscribe(listener: ToastListener): () => void {
      listeners.add(listener);

      return (): void => {
        listeners.delete(listener);
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Viewport Overflow Lock
// ---------------------------------------------------------------------------

interface OverflowState {
  readonly htmlOverflow: string;
  readonly htmlHeight: string;
  readonly bodyOverflow: string;
  readonly bodyHeight: string;
  readonly bodyMargin: string;
}

/**
 * Locks the viewport by setting overflow:hidden and height:100% on html/body/root.
 * Returns a restore function that reverts to previous values.
 */
export function lockViewportOverflow(): () => void {
  const html = document.documentElement;
  const body = document.body;

  const prev: OverflowState = {
    htmlOverflow: html.style.overflow,
    htmlHeight: html.style.height,
    bodyOverflow: body.style.overflow,
    bodyHeight: body.style.height,
    bodyMargin: body.style.margin,
  };

  html.style.overflow = 'hidden';
  html.style.height = '100%';
  body.style.overflow = 'hidden';
  body.style.height = '100%';
  body.style.margin = '0';

  return (): void => {
    html.style.overflow = prev.htmlOverflow;
    html.style.height = prev.htmlHeight;
    body.style.overflow = prev.bodyOverflow;
    body.style.height = prev.bodyHeight;
    body.style.margin = prev.bodyMargin;
  };
}

// ---------------------------------------------------------------------------
// Browser Zoom Prevention
// ---------------------------------------------------------------------------

/**
 * Installs event listeners that prevent browser-native zoom gestures.
 * Returns a cleanup function to remove all listeners.
 */
export function preventBrowserZoom(): () => void {
  function handleWheel(e: WheelEvent): void {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
    }
  }

  function handleKeydown(e: KeyboardEvent): void {
    if (e.ctrlKey || e.metaKey) {
      if (e.key === '+' || e.key === '=' || e.key === '-' || e.key === '0') {
        e.preventDefault();
      }
    }
  }

  function handleTouchStart(e: TouchEvent): void {
    if (e.touches.length > 1) {
      e.preventDefault();
    }
  }

  function handleGestureStart(e: Event): void {
    e.preventDefault();
  }

  document.addEventListener('wheel', handleWheel, { passive: false });
  document.addEventListener('keydown', handleKeydown);
  document.addEventListener('touchstart', handleTouchStart, { passive: false });
  document.addEventListener('gesturestart', handleGestureStart);
  document.addEventListener('gesturechange', handleGestureStart);

  return (): void => {
    document.removeEventListener('wheel', handleWheel);
    document.removeEventListener('keydown', handleKeydown);
    document.removeEventListener('touchstart', handleTouchStart);
    document.removeEventListener('gesturestart', handleGestureStart);
    document.removeEventListener('gesturechange', handleGestureStart);
  };
}
