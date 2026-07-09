/**
 * Phase 6 I6.2 — shared structural integrity helper. Every format
 * exporter's tests pipe the bytes it produces through the format's
 * own reader to catch writer regressions that produce output the
 * reader cannot parse. A failure here means the exporter shipped
 * something structurally invalid for the format.
 *
 * Usage:
 * ```ts
 * assertReImportableBy(exportedBytes, (bytes) => readPsd(bytes.buffer));
 * ```
 *
 * Reader functions MAY throw on malformed input; the helper catches
 * and produces a descriptive error that names the format so CI logs
 * pinpoint the regression.
 */

interface ReImportableOptions {
  readonly formatLabel?: string;
}

/**
 * Runs `reader(bytes)` inside a guard and throws a descriptive error
 * if the reader rejects the input or produces no output. The error
 * message carries the format label so CI / test failures pinpoint
 * which exporter regressed.
 */
export function assertReImportableBy<T>(
  bytes: Uint8Array,
  reader: (data: Uint8Array) => T,
  options: ReImportableOptions = {},
): T {
  const label = options.formatLabel ?? 'format';

  if (bytes.byteLength === 0) {
    throw new Error(`assertReImportableBy(${label}): exporter produced zero-length output`);
  }

  let result: T;

  try {
    result = reader(bytes);
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);

    throw new Error(`assertReImportableBy(${label}): reader rejected exporter output — ${detail}`, {
      cause: error,
    });
  }

  if (result === null) {
    throw new Error(`assertReImportableBy(${label}): reader returned null for ${String(bytes.byteLength)}-byte output`);
  }

  return result;
}
