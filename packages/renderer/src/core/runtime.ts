/**
 * Runtime service interfaces consumed by the renderer to resolve dynamic
 * content that should not be baked into the persisted document snapshot.
 *
 * Each service is optional — the renderer falls back to safe defaults
 * when a service is not provided. Callers that want runtime behavior
 * (live data substitution, time-driven clocks, on-demand font loading,
 * asset resolution, visibility/state transitions without document
 * replacement) supply the relevant services through
 * `ScreenRendererOptions.runtime`.
 *
 * This file defines the contract. Concrete providers (Broadset's
 * document data store, playback engine, asset registry, etc.) wire
 * implementations in at the adapter layer.
 */

/** Simple unsubscribe callback returned from `subscribe` helpers. */
export type Unsubscribe = () => void;

/**
 * Time source used by motion-graphics renderers (clock, ticker, future
 * keyframe playback). Implementations may surface wall-clock time, media
 * time, or a test-controllable fake clock.
 */
export interface TimeService {
  /** Current time in milliseconds since the epoch or since the time origin. */
  now(): number;
  /**
   * Subscribe to tick events. The callback fires at an implementation-
   * defined cadence (typically every animation frame or every second);
   * the renderer itself does not throttle. Returns an unsubscribe handle.
   */
  subscribe(tick: () => void): Unsubscribe;
}

/**
 * Data service backing dynamic `{{key}}` substitution. Keys use
 * dot-notation and resolve against whatever the host provides
 * (live scoreboard, form values, Broadset data store).
 */
export interface DataService {
  get(key: string): unknown;
  subscribe(change: () => void): Unsubscribe;
}

export type VisibilityState = 'onscreen' | 'offscreen';

/**
 * State service surfacing per-element visibility and active state.
 * Consumers include the playback engine (driving onscreen/offscreen
 * transitions) and the editor (previewing hover/focus states).
 */
export interface StateService {
  getVisibility(elementId: string): VisibilityState;
  getActiveState(elementId: string): string | null;
  subscribe(change: () => void): Unsubscribe;
}

/**
 * Font loading service. Deduplicates repeated requests for the same
 * family/weight/style — the renderer delegates dedup responsibility to
 * the implementation so there is a single source of truth for what has
 * been loaded.
 */
export interface FontService {
  ensureLoaded(family: string, weight?: number, style?: string): Promise<void>;
}

/**
 * Asset service for resolving asset IDs to concrete URLs or data URIs.
 * Broadset's asset registry wires this up; pure renderer tests can
 * provide a map-backed stub.
 */
export interface AssetService {
  resolve(assetId: string): string | null;
}

/**
 * Bag of runtime services passed through `ScreenRendererOptions.runtime`.
 * All entries are optional so consumers can opt into behaviors
 * independently.
 */
export interface RuntimeServices {
  readonly time?: TimeService;
  readonly data?: DataService;
  readonly state?: StateService;
  readonly fonts?: FontService;
  readonly assets?: AssetService;
}

const DYNAMIC_TOKEN_RE = /\{\{([^{}]+)\}\}/gu;

/**
 * Resolve `{{key.path}}` tokens inside `content` against the supplied
 * data service. Unresolved tokens are left as the literal token string
 * so callers can detect missing data (the spec requires the literal
 * passthrough).
 *
 * Pure function — safe to call from any renderer without holding
 * service state across updates.
 */
export function substituteDynamicTokens(content: string, data: DataService | undefined): string {
  if (data === undefined) return content;

  return content.replace(DYNAMIC_TOKEN_RE, (match, rawKey: string) => {
    const resolved = resolveDotPath(data, rawKey.trim());

    return stringifyResolved(resolved) ?? match;
  });
}

function stringifyResolved(value: unknown): string | null {
  if (value === undefined) return null;
  if (value === null) return 'null';

  switch (typeof value) {
    case 'string':
      return value;
    case 'number':
    case 'boolean':
    case 'bigint':
      return String(value);
    default:
      // Objects and arrays are not stringified to `[object Object]`; the
      // caller can pre-flatten or expose a string-valued view. Returning
      // null surfaces the missing-scalar condition as a literal token.
      return null;
  }
}

function resolveDotPath(data: DataService, key: string): unknown {
  if (key === '') return undefined;

  const direct = data.get(key);

  if (direct !== undefined) return direct;

  const parts = key.split('.');

  for (let i = parts.length - 1; i > 0; i -= 1) {
    const head = parts.slice(0, i).join('.');
    const root = data.get(head);

    if (root === undefined) continue;

    const tail = parts.slice(i);
    const value = walkTail(root, tail);

    if (value !== undefined) return value;
  }

  return undefined;
}

function walkTail(root: unknown, tail: readonly string[]): unknown {
  let cursor: unknown = root;

  for (const segment of tail) {
    if (cursor === null || cursor === undefined) return undefined;
    if (typeof cursor !== 'object') return undefined;

    const record = cursor as Readonly<Record<string, unknown>>;

    cursor = record[segment];
  }

  return cursor;
}

/**
 * Idempotent font-loader helper. Tracks already-resolved
 * `family|weight|style` keys so repeated requests — across elements and
 * across document updates — resolve to a single underlying
 * `FontService.ensureLoaded` call.
 */
export function createIdempotentFontLoader(service: FontService): {
  readonly ensureLoaded: (family: string, weight?: number, style?: string) => Promise<void>;
  readonly loadedKeys: () => readonly string[];
} {
  const loaded = new Map<string, Promise<void>>();

  return {
    ensureLoaded(family, weight, style) {
      const key = `${family}|${String(weight ?? 'normal')}|${style ?? 'normal'}`;
      const existing = loaded.get(key);

      if (existing !== undefined) return existing;

      const promise = service.ensureLoaded(family, weight, style);

      loaded.set(key, promise);

      return promise;
    },
    loadedKeys() {
      return Array.from(loaded.keys());
    },
  };
}
