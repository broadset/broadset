import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  BROADSET_FORMAT_IDS,
  broadsetFormatExtensionsBaseSchema,
  type BroadsetFormatId,
  broadsetFormatIdSchema,
  getExtensions,
  getExtensionsSchema,
  listRegisteredExtensionsFormats,
  registerExtensionsSchema,
  unregisterExtensionsSchema,
  validateExtensions,
} from './extensions-types';

/** Tests own the registry while they run; clean up between cases so registrations never leak across tests. */
function unregisterAll(): void {
  for (const id of BROADSET_FORMAT_IDS) {
    unregisterExtensionsSchema(id);
  }
}

afterEach(unregisterAll);

/** @description The four format ids reserved by the model match the io-prereqs plan and are the only namespaces the registry validates. */
describe('BROADSET_FORMAT_IDS', () => {
  /** @description The full list of format ids is exposed and matches the spec. */
  it('exposes psd, pdf, pptx, svg', () => {
    expect(BROADSET_FORMAT_IDS).toEqual(['psd', 'pdf', 'pptx', 'svg']);
  });

  /** @description Unknown ids are rejected by `broadsetFormatIdSchema`. */
  it('rejects unknown format ids', () => {
    expect(broadsetFormatIdSchema.safeParse('aep').success).toBe(false);
    expect(broadsetFormatIdSchema.safeParse('json').success).toBe(false);
  });
});

/** @description The base extensions schema enforces the universal `dirty` flag every per-format schema must extend. */
describe('broadsetFormatExtensionsBaseSchema', () => {
  /** @description A payload missing `dirty` is rejected. */
  it('rejects payloads missing the dirty flag', () => {
    expect(broadsetFormatExtensionsBaseSchema.safeParse({}).success).toBe(false);
  });

  /** @description Boolean `dirty` is required; non-boolean values are rejected. */
  it('rejects non-boolean dirty values', () => {
    expect(broadsetFormatExtensionsBaseSchema.safeParse({ dirty: 'no' }).success).toBe(false);
    expect(broadsetFormatExtensionsBaseSchema.safeParse({ dirty: 0 }).success).toBe(false);
  });

  /** @description Both `dirty: true` and `dirty: false` are accepted. */
  it('accepts dirty: true and dirty: false', () => {
    expect(broadsetFormatExtensionsBaseSchema.parse({ dirty: false })).toEqual({ dirty: false });
    expect(broadsetFormatExtensionsBaseSchema.parse({ dirty: true })).toEqual({ dirty: true });
  });
});

/** @description The registry is the wiring point format packages use to teach the model how to validate their persisted extensions. */
describe('extensions registry', () => {
  /** @description Newly registered schemas show up in `listRegisteredExtensionsFormats` and `getExtensionsSchema`. */
  it('registers and looks up a schema', () => {
    const schema = broadsetFormatExtensionsBaseSchema.extend({ raw: z.string() });

    registerExtensionsSchema('pdf', schema);

    expect(getExtensionsSchema('pdf')).toBeDefined();
    expect(listRegisteredExtensionsFormats()).toContain('pdf');
  });

  /** @description Re-registering replaces the previous schema (idempotent registration). */
  it('replaces an existing registration on re-register', () => {
    const v1 = broadsetFormatExtensionsBaseSchema.extend({ field: z.literal('v1') });
    const v2 = broadsetFormatExtensionsBaseSchema.extend({ field: z.literal('v2') });

    registerExtensionsSchema('psd', v1);
    registerExtensionsSchema('psd', v2);

    const schema = getExtensionsSchema('psd');

    expect(schema?.safeParse({ dirty: false, field: 'v1' }).success).toBe(false);
    expect(schema?.safeParse({ dirty: false, field: 'v2' }).success).toBe(true);
  });

  /** @description Unregistering removes the schema and the listing entry. */
  it('unregisters a schema cleanly', () => {
    registerExtensionsSchema(
      'svg',
      broadsetFormatExtensionsBaseSchema,
    );
    unregisterExtensionsSchema('svg');

    expect(getExtensionsSchema('svg')).toBeUndefined();
    expect(listRegisteredExtensionsFormats()).not.toContain('svg');
  });
});

/** @description `validateExtensions` is the load-time guard IO-D-11 mandates — fail loudly on stale `.bsp`. */
describe('validateExtensions', () => {
  /** @description A namespace whose schema is registered and matches the payload validates and round-trips. */
  it('validates a registered namespace and returns the typed shape', () => {
    const schema = broadsetFormatExtensionsBaseSchema.extend({ rawHex: z.string() });

    registerExtensionsSchema('pdf', schema);

    const validated = validateExtensions({ pdf: { dirty: false, rawHex: 'deadbeef' } });

    expect(validated.pdf).toEqual({ dirty: false, rawHex: 'deadbeef' });
  });

  /** @description A namespace whose schema is registered but whose persisted shape is wrong throws (no silent recovery). */
  it('throws when a registered schema rejects the payload', () => {
    const schema = broadsetFormatExtensionsBaseSchema.extend({ requiredField: z.string() });

    registerExtensionsSchema('psd', schema);

    expect(() => validateExtensions({ psd: { dirty: false } })).toThrow();
  });

  /** @description A namespace with no registered schema is accepted (forward-compat for deployments without that format package loaded). */
  it('accepts unknown namespaces when no schema is registered', () => {
    const validated = validateExtensions({
      pdf: { dirty: false, anything: 'goes', here: 42 },
    });

    expect(validated.pdf).toBeUndefined();
  });

  /** @description Absent namespaces stay absent in the typed view. */
  it('omits namespaces that are absent from the raw record', () => {
    const validated = validateExtensions({});

    expect(validated.pdf).toBeUndefined();
    expect(validated.psd).toBeUndefined();
    expect(validated.pptx).toBeUndefined();
    expect(validated.svg).toBeUndefined();
  });

  /** @description Unknown top-level keys outside the four reserved format ids are ignored entirely. */
  it('ignores unknown top-level keys outside the reserved format ids', () => {
    registerExtensionsSchema(
      'pdf',
      broadsetFormatExtensionsBaseSchema,
    );

    const validated = validateExtensions({
      pdf: { dirty: false },
      docx: { dirty: false },
      'broadset:internal': { foo: 'bar' },
    });

    expect(validated.pdf).toEqual({ dirty: false });
    expect((validated as Record<string, unknown>)['docx']).toBeUndefined();
  });
});

/** @description `getExtensions<F>` is the typed accessor importers and exporters use to read their own namespace. */
describe('getExtensions', () => {
  /** @description Returns the validated payload when the namespace is present and the schema is registered. */
  it('returns the validated payload for the requested format', () => {
    const schema = broadsetFormatExtensionsBaseSchema.extend({ markedContent: z.boolean() });

    registerExtensionsSchema('pdf', schema);

    const value = getExtensions({ pdf: { dirty: true, markedContent: true } }, 'pdf');

    expect(value).toEqual({ dirty: true, markedContent: true });
  });

  /** @description Returns the raw value untouched when no schema is registered (forward-compat). */
  it('passes the raw value through when no schema is registered', () => {
    const raw = { dirty: false, mystery: 'unknown shape' };
    const value = getExtensions({ psd: raw }, 'psd');

    expect(value).toEqual(raw);
  });

  /** @description Returns undefined when the namespace is absent. */
  it('returns undefined when the namespace is absent', () => {
    expect(getExtensions({}, 'pdf')).toBeUndefined();
    expect(getExtensions({ pdf: undefined }, 'pdf')).toBeUndefined();
  });

  /** @description Throws when the registered schema rejects the persisted shape. */
  it('throws when the registered schema rejects the payload', () => {
    const schema = broadsetFormatExtensionsBaseSchema.extend({ required: z.literal('yes') });

    registerExtensionsSchema('pptx', schema);

    expect(() => getExtensions({ pptx: { dirty: false } }, 'pptx')).toThrow();
  });
});

/** @description `BroadsetFormatId` exhausts the four reserved namespaces. */
describe('BroadsetFormatId type', () => {
  /** @description Every id maps to a registry slot. */
  it('every id can register a schema', () => {
    const ids: readonly BroadsetFormatId[] = BROADSET_FORMAT_IDS;

    for (const id of ids) {
      registerExtensionsSchema(
        id,
        broadsetFormatExtensionsBaseSchema,
      );
    }

    const sorted = [...listRegisteredExtensionsFormats()].sort((a, b) => a.localeCompare(b));

    expect(sorted).toEqual(['pdf', 'pptx', 'psd', 'svg']);
  });
});
