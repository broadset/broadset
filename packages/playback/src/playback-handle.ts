const FRAME_STEP_MS = 16;

export interface PlaybackHandle {
  readonly currentTimeMs: number;
  readonly durationMs: number;
  readonly isActive: boolean;
  play(): void;
  pause(): void;
  seek(timeMs: number): void;
  setSpeed(speed: number): void;
  cancel(): void;
}

export interface CreatePlaybackHandleOptions {
  readonly durationMs: number;
  readonly onFrame?: ((timeMs: number) => void) | undefined;
  readonly onComplete?: (() => void) | undefined;
}

export function createPlaybackHandle(options: CreatePlaybackHandleOptions): PlaybackHandle {
  let currentTimeMs = 0;
  let isActive = false;
  let isCancelled = false;
  let speed = 1;
  let timerId: ReturnType<typeof setTimeout> | null = null;
  let lastTickTimestamp = Date.now();
  let hasCompleted = false;

  function clearTimer(): void {
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
  }

  function notifyFrame(): void {
    options.onFrame?.(currentTimeMs);
  }

  function scheduleNextTick(): void {
    if (!isActive) {
      return;
    }

    timerId = setTimeout(() => {
      if (!isActive) {
        return;
      }

      const now = Date.now();
      const deltaMs = Math.max(0, now - lastTickTimestamp) * speed;

      lastTickTimestamp = now;

      if (Number.isFinite(options.durationMs)) {
        currentTimeMs = Math.min(options.durationMs, currentTimeMs + deltaMs);
      } else {
        currentTimeMs += deltaMs;
      }

      notifyFrame();

      if (Number.isFinite(options.durationMs) && currentTimeMs >= options.durationMs) {
        isActive = false;
        clearTimer();

        if (!hasCompleted) {
          hasCompleted = true;
          options.onComplete?.();
        }

        return;
      }

      scheduleNextTick();
    }, FRAME_STEP_MS);
  }

  return {
    get currentTimeMs(): number {
      return currentTimeMs;
    },
    get durationMs(): number {
      return options.durationMs;
    },
    get isActive(): boolean {
      return isActive;
    },
    play(): void {
      if (isCancelled || isActive) {
        return;
      }

      if (Number.isFinite(options.durationMs) && currentTimeMs >= options.durationMs) {
        return;
      }

      isActive = true;
      lastTickTimestamp = Date.now();
      scheduleNextTick();
    },
    pause(): void {
      isActive = false;
      clearTimer();
    },
    seek(timeMs: number): void {
      const safeTime = Number.isFinite(timeMs) ? timeMs : 0;

      if (Number.isFinite(options.durationMs)) {
        currentTimeMs = Math.max(0, Math.min(options.durationMs, safeTime));
      } else {
        currentTimeMs = Math.max(0, safeTime);
      }

      hasCompleted = false;
      notifyFrame();
    },
    setSpeed(nextSpeed: number): void {
      if (Number.isFinite(nextSpeed) && nextSpeed > 0) {
        speed = nextSpeed;
      }
    },
    cancel(): void {
      isCancelled = true;
      isActive = false;
      clearTimer();
    },
  };
}
