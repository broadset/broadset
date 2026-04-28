/**
 * Hardened fetch wrapper used by the PSD/PDF exporters when pulling
 * remote assets and fonts. Closes the 2026-04-28 production-readiness
 * audit finding "Export fetches are unbounded": exports MUST NOT hang
 * indefinitely on a slow upstream, MUST NOT buffer multi-gigabyte
 * responses, and MUST NOT load arbitrary local-file or `data:` URLs
 * that bypass the asset registry.
 *
 * The wrapper:
 *
 * - rejects URLs whose scheme is not in the allowlist (default
 *   `http:` / `https:`),
 * - aborts the request after `timeoutMs` (default 10 seconds),
 * - aborts streaming when the response body crosses `maxBytes`
 *   (default 32 MiB),
 * - returns a structured failure with the cap that fired so the
 *   caller can surface a precise warning.
 */

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BYTES = 32 * 1024 * 1024;
const DEFAULT_ALLOWED_SCHEMES = new Set(['http:', 'https:']);

interface SafeFetchOptions {
  readonly fetchFn?: typeof globalThis.fetch | undefined;
  /**
   * When set, only URLs whose protocol matches one of the given values
   * (e.g. `'http:'`, `'https:'`) are allowed. Defaults to `http:` and
   * `https:`. `data:` and `file:` URLs are excluded by default — they
   * are an arbitrary-read surface from the export side.
   */
  readonly allowedSchemes?: ReadonlySet<string> | undefined;
  /** Optional host allowlist; when present, requests to other hosts are rejected. */
  readonly allowedHosts?: ReadonlySet<string> | undefined;
  readonly timeoutMs?: number | undefined;
  readonly maxBytes?: number | undefined;
}

type SafeFetchFailureReason =
  | 'invalid-url'
  | 'scheme-not-allowed'
  | 'host-not-allowed'
  | 'timeout'
  | 'max-bytes-exceeded'
  | 'http-error'
  | 'network-error';

interface SafeFetchSuccess {
  readonly ok: true;
  readonly mime: string;
  readonly bytes: Uint8Array;
}

interface SafeFetchFailure {
  readonly ok: false;
  readonly reason: SafeFetchFailureReason;
  readonly url: string;
  readonly status?: number;
  readonly cap?: number;
  readonly detail?: string;
}

type SafeFetchResult = SafeFetchSuccess | SafeFetchFailure;

function parseUrl(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

/**
 * Concatenate a list of {@link Uint8Array} chunks into a single
 * contiguous buffer. Avoids the `Buffer.concat` Node-only path so the
 * helper runs identically in browser bundles.
 */
function concatChunks(chunks: readonly Uint8Array[], totalBytes: number): Uint8Array {
  const out = new Uint8Array(totalBytes);
  let offset = 0;

  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return out;
}

/**
 * Read a fetch response body up to `maxBytes`, aborting via the
 * provided controller when the cap is exceeded. Returns the buffered
 * bytes alongside a flag indicating whether the cap fired.
 */
async function readBodyWithCap(
  response: Response,
  controller: AbortController,
  maxBytes: number,
): Promise<{ readonly bytes: Uint8Array; readonly capFired: boolean }> {
  const reader = response.body?.getReader();

  if (reader === undefined) {
    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    if (bytes.byteLength > maxBytes) {
      return { bytes, capFired: true };
    }

    return { bytes, capFired: false };
  }

  const chunks: Uint8Array[] = [];
  let total = 0;

  for (;;) {
    const { value, done } = await reader.read();

    if (done) break;

    total += value.byteLength;

    if (total > maxBytes) {
      controller.abort();

      try {
        await reader.cancel();
      } catch {
        // ignore — the abort already propagates the failure to the caller.
      }

      return { bytes: concatChunks(chunks, total - value.byteLength), capFired: true };
    }

    chunks.push(value);
  }

  return { bytes: concatChunks(chunks, total), capFired: false };
}

export async function safeFetchBytes(url: string, options: SafeFetchOptions = {}): Promise<SafeFetchResult> {
  const fetchFn = options.fetchFn ?? globalThis.fetch;
  const allowedSchemes = options.allowedSchemes ?? DEFAULT_ALLOWED_SCHEMES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const parsed = parseUrl(url);

  if (parsed === null) {
    return { ok: false, reason: 'invalid-url', url };
  }

  if (!allowedSchemes.has(parsed.protocol)) {
    return { ok: false, reason: 'scheme-not-allowed', url, detail: parsed.protocol };
  }

  if (options.allowedHosts !== undefined && !options.allowedHosts.has(parsed.host)) {
    return { ok: false, reason: 'host-not-allowed', url, detail: parsed.host };
  }

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetchFn(url, { signal: controller.signal });

    if (!response.ok) {
      return { ok: false, reason: 'http-error', url, status: response.status };
    }

    const contentType = response.headers.get('content-type') ?? 'application/octet-stream';
    const mime = contentType.split(';')[0]?.trim() ?? 'application/octet-stream';
    const { bytes, capFired } = await readBodyWithCap(response, controller, maxBytes);

    if (capFired) {
      return { ok: false, reason: 'max-bytes-exceeded', url, cap: maxBytes };
    }

    return { ok: true, mime, bytes };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { ok: false, reason: 'timeout', url, cap: timeoutMs };
    }

    return {
      ok: false,
      reason: 'network-error',
      url,
      detail: err instanceof Error ? err.message : 'unknown',
    };
  } finally {
    clearTimeout(timeoutHandle);
  }
}
