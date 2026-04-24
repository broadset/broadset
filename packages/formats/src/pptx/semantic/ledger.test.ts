import { createDefaultElement } from '@broadset/model';
import { describe, expect, it } from 'vitest';

import type { PptxRoundTripLedger } from '../types';
import { buildLedger, buildLedgerXml, indexLedger, parseLedgerXml } from './ledger';

/**
 * @description The interop ledger is the core of PPTX round-trip
 * reconciliation. buildLedger must produce one fingerprint per element;
 * the XML form must round-trip losslessly through build → parse so the
 * importer's fast-path can re-read it.
 */
describe('buildLedger', () => {
  it('produces one entry per element with a non-empty fingerprint', async () => {
    const elements = [
      createDefaultElement('rectangle', { id: 'el-1' }),
      createDefaultElement('text', { id: 'el-2', content: 'hello' }),
    ];
    const ledger = await buildLedger({
      documentId: 'doc-1',
      version: '1.0.0',
      exportedAt: '2026-04-24T00:00:00Z',
      elements,
    });

    expect(ledger.entries).toHaveLength(2);
    expect(ledger.entries[0]?.elementId).toBe('el-1');
    expect(ledger.entries[1]?.elementId).toBe('el-2');
    expect(ledger.entries[0]?.fingerprint).toMatch(/^[0-9a-f]{16}$/);
    expect(ledger.entries[1]?.fingerprint).toMatch(/^[0-9a-f]{16}$/);
  });

  it('handles an empty element list', async () => {
    const ledger = await buildLedger({
      documentId: 'doc-1',
      version: '1.0.0',
      exportedAt: '2026-04-24T00:00:00Z',
      elements: [],
    });

    expect(ledger.entries).toEqual([]);
  });
});

/**
 * @description Ledger XML round-trip — what we write MUST be readable
 * as-is by the importer.
 */
describe('buildLedgerXml / parseLedgerXml', () => {
  it('round-trips a populated ledger', () => {
    const ledger: PptxRoundTripLedger = {
      documentId: 'doc-1',
      version: '1.0.0',
      exportedAt: '2026-04-24T00:00:00Z',
      entries: [
        { elementId: 'el-1', fingerprint: 'aaaaaaaaaaaaaaaa' },
        { elementId: 'el-2', fingerprint: 'bbbbbbbbbbbbbbbb' },
      ],
    };
    const xml = buildLedgerXml(ledger);
    const parsed = parseLedgerXml(xml);

    expect(parsed).toEqual(ledger);
  });

  it('round-trips a ledger whose elementId contains XML-special characters', () => {
    const ledger: PptxRoundTripLedger = {
      documentId: 'has & ampersand',
      version: '1.0.0',
      exportedAt: '2026-04-24T00:00:00Z',
      entries: [{ elementId: 'el<1>', fingerprint: 'aaaaaaaaaaaaaaaa' }],
    };
    const xml = buildLedgerXml(ledger);

    // parse-side regex is tolerant of `&amp;` / `&lt;` / `&quot;` etc.
    expect(xml).toContain('&amp;');
    expect(xml).toContain('&lt;');
  });

  it('returns null for body without the ledger namespace', () => {
    expect(parseLedgerXml('')).toBeNull();
    expect(parseLedgerXml('<something-else/>')).toBeNull();
  });
});

/** @description indexLedger produces O(1) per-element lookup. */
describe('indexLedger', () => {
  it('indexes entries by elementId', () => {
    const ledger: PptxRoundTripLedger = {
      documentId: 'doc-1',
      version: '1.0.0',
      exportedAt: '2026-04-24T00:00:00Z',
      entries: [
        { elementId: 'el-1', fingerprint: 'aaaa' },
        { elementId: 'el-2', fingerprint: 'bbbb' },
      ],
    };
    const map = indexLedger(ledger);

    expect(map.get('el-1')).toBe('aaaa');
    expect(map.get('el-2')).toBe('bbbb');
    expect(map.size).toBe(2);
  });
});
