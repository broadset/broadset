import { describe, expect, it } from 'vitest';

import { safeFetchBytes } from './safe-fetch';

/**
 * @description The hardened fetch wrapper bounds export-side network
 * I/O. Closes the 2026-04-28 production-readiness audit finding
 * "Export fetches are unbounded": the wrapper enforces a scheme
 * allowlist, an optional host allowlist, a request timeout, and a
 * response byte cap so a hostile or just-slow upstream cannot stall or
 * exhaust memory in the export pipeline.
 */
describe('safeFetchBytes', () => {
  it('rejects URLs with non-allowlisted schemes', async () => {
    const result = await safeFetchBytes('javascript:alert(1)');

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.reason).toBe('scheme-not-allowed');
    }
  });

  it('rejects URLs whose host is not in the allowlist', async () => {
    const fetchFn = ((): Promise<Response> => Promise.resolve(new Response('hello'))) as typeof globalThis.fetch;
    const result = await safeFetchBytes('https://evil.example.com/font.ttf', {
      fetchFn,
      allowedHosts: new Set(['fonts.gstatic.com']),
    });

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.reason).toBe('host-not-allowed');
    }
  });

  it('rejects responses larger than the byte cap', async () => {
    const fetchFn = ((): Promise<Response> => Promise.resolve(new Response(new Uint8Array(2048)))) as typeof globalThis.fetch;
    const result = await safeFetchBytes('https://fonts.gstatic.com/big.bin', {
      fetchFn,
      allowedHosts: new Set(['fonts.gstatic.com']),
      maxBytes: 1024,
    });

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.reason).toBe('max-bytes-exceeded');
      expect(result.cap).toBe(1024);
    }
  });

  it('returns the bytes for a successful fetch under the cap', async () => {
    const payload = new Uint8Array([1, 2, 3, 4]);
    const fetchFn = ((): Promise<Response> =>
      Promise.resolve(new Response(payload, { headers: { 'content-type': 'image/png' } }))) as typeof globalThis.fetch;
    const result = await safeFetchBytes('https://fonts.gstatic.com/ok.png', {
      fetchFn,
      allowedHosts: new Set(['fonts.gstatic.com']),
      maxBytes: 1024,
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.mime).toBe('image/png');
      expect(Array.from(result.bytes)).toEqual([1, 2, 3, 4]);
    }
  });

  it('returns timeout when the upstream signal is aborted', async () => {
    const fetchFn = ((_url: string, init?: RequestInit): Promise<Response> =>
      new Promise((_, reject) => {
        const signal = init?.signal ?? null;

        if (signal !== null) {
          if (signal.aborted) {
            reject(new DOMException('Aborted', 'AbortError'));

            return;
          }

          signal.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        }
      })) as typeof globalThis.fetch;
    const result = await safeFetchBytes('https://fonts.gstatic.com/slow.bin', { fetchFn, timeoutMs: 50 });

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.reason).toBe('timeout');
    }
  });
});
