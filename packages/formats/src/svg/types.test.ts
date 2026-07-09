/**
 * P7.1 — SVG types & architecture.
 *
 * Covers:
 * - `FontEmbedChoice` / `UnitSystem` union shapes
 * - `SvgImportOptions` / `SvgExportOptions` defaults
 * - `SvgRoundTripMetadata` / `SvgSanitizationReport` / `BroadsetRdfPacket`
 *   / `ElementTagAttrs` Zod schemas
 * - `SvgExtensions` Zod registration against the model's extensions
 *   registry, per IO-D-11
 *
 * These tests are the TDD red phase for the SVG type surface every
 * later Phase 7 unit depends on. Future loops reading this suite
 * can confirm: (a) the namespace URI used here matches the shared
 * IO-D-08 URI, (b) the per-element tag carries the fields the spec
 * requires (`id`, `kind`, fingerprint, optional data bindings), and
 * (c) the registry refuses extensions missing the universal `dirty`
 * flag.
 */
import { BROADSET_FORMAT_IDS, getExtensionsSchema } from '@broadset/model';
import { describe, expect, it } from 'vitest';

import { BROADSET_XMP_NAMESPACE } from '../_shared/xmp';
import {
  type BroadsetRdfPacket,
  broadsetRdfPacketSchema,
  type ElementTagAttrs,
  elementTagAttrsSchema,
  type FontEmbedChoice,
  fontEmbedChoiceSchema,
  SVG_BROADSET_NAMESPACE,
  type SvgExportOptions,
  svgExportOptionsSchema,
  type SvgExtensions,
  svgExtensionsSchema,
  type SvgImportOptions,
  svgImportOptionsSchema,
  type SvgPreservedData,
  svgPreservedDataSchema,
  type SvgRoundTripMetadata,
  svgRoundTripMetadataSchema,
  type SvgSanitizationReport,
  svgSanitizationReportSchema,
  type UnitSystem,
  unitSystemSchema,
} from './types';

describe('SVG types — FontEmbedChoice', () => {
  /**
   * @description FontEmbedChoice MUST have the three canonical values per
   * the spec — `embed`, `reference`, `flatten` — so the export UI (I7.1) can
   * offer the exact options the spec enumerates.
   */
  it('parses the three canonical values', () => {
    const values: readonly FontEmbedChoice[] = ['embed', 'reference', 'flatten'];

    for (const v of values) {
      expect(fontEmbedChoiceSchema.parse(v)).toBe(v);
    }
  });

  /**
   * @description Any value outside the canonical set MUST be rejected by
   * Zod — future UI additions cannot silently smuggle invalid choices past
   * the validator.
   */
  it('rejects unknown values', () => {
    expect(fontEmbedChoiceSchema.safeParse('link').success).toBe(false);
    expect(fontEmbedChoiceSchema.safeParse('').success).toBe(false);
    expect(fontEmbedChoiceSchema.safeParse(null).success).toBe(false);
  });
});

describe('SVG types — UnitSystem', () => {
  /**
   * @description UnitSystem MUST carry the five units the SVG spec
   * recognises (`px`, `mm`, `in`, `pt`, `em`) so the importer can
   * honour `viewBox` / `width` / `height` expressed in any of them.
   */
  it('parses every canonical unit', () => {
    const values: readonly UnitSystem[] = ['px', 'mm', 'in', 'pt', 'em'];

    for (const v of values) {
      expect(unitSystemSchema.parse(v)).toBe(v);
    }
  });
});

describe('SVG types — BroadsetRdfPacket', () => {
  /**
   * @description The document-level packet MUST reference the shared
   * Broadset XMP namespace URI from IO-D-08. A format-specific URI
   * (e.g. `/ns/svg/1.0/`) would break cross-format reconciliation and
   * the svg.md spec rules it out. This test hard-pins the URI against
   * `_shared/xmp`'s canonical constant.
   */
  it('uses the shared Broadset XMP namespace URI (IO-D-08)', () => {
    expect(SVG_BROADSET_NAMESPACE).toBe(BROADSET_XMP_NAMESPACE);
    expect(SVG_BROADSET_NAMESPACE).toBe('https://broadset.io/ns/xmp/1.0/');
  });

  /**
   * @description A well-formed packet with document id, canvas unit,
   * dpi, and an element list parses successfully via Zod.
   */
  it('parses a well-formed packet', () => {
    const packet: BroadsetRdfPacket = {
      documentId: 'doc-1',
      version: '0.1.0',
      exportedAt: '2026-04-24T00:00:00Z',
      canvas: { unit: 'px', dpi: 72 },
      elements: [
        { id: 'el-1', fingerprint: 'abcdef0123456789' },
        { id: 'el-2', fingerprint: '0011223344556677' },
      ],
    };

    expect(broadsetRdfPacketSchema.parse(packet)).toEqual(packet);
  });

  /**
   * @description Missing required fields MUST be rejected. An empty
   * string for `documentId` is also rejected since it cannot identify
   * the document across round-trips.
   */
  it('rejects an empty documentId', () => {
    expect(
      broadsetRdfPacketSchema.safeParse({
        documentId: '',
        version: '0.1.0',
        exportedAt: '2026-04-24T00:00:00Z',
        canvas: { unit: 'px', dpi: 72 },
        elements: [],
      }).success,
    ).toBe(false);
  });
});

describe('SVG types — ElementTagAttrs', () => {
  /**
   * @description Every rendered element's tag MUST carry at minimum
   * `dataBsId` and `dataBsKind`. These map to the `data-bs-*` attributes
   * described in the spec and they drive the fast-path importer.
   */
  it('parses a minimal tag', () => {
    const tag: ElementTagAttrs = {
      dataBsId: 'el-1',
      dataBsKind: 'rectangle',
      contentHash: 'abcdef0123456789',
    };

    expect(elementTagAttrsSchema.parse(tag)).toEqual(tag);
  });

  /**
   * @description Optional data-binding attrs round-trip when present and
   * are omitted when absent. The importer uses these to recover
   * `dataField` / `visibleWhen` / `repeater` semantics.
   */
  it('parses a tag with data-binding attributes', () => {
    const tag: ElementTagAttrs = {
      dataBsId: 'el-2',
      dataBsKind: 'text',
      contentHash: '0011223344556677',
      dataBsDataField: 'headline',
      dataBsVisibleWhen: 'hasHeadline',
      dataBsRepeater: 'cards',
    };

    expect(elementTagAttrsSchema.parse(tag)).toEqual(tag);
  });

  /**
   * @description Unknown `dataBsKind` values are rejected — the per-element
   * tag only carries Broadset's 11 canonical element types.
   */
  it('rejects an unknown kind', () => {
    expect(
      elementTagAttrsSchema.safeParse({
        dataBsId: 'el-3',
        dataBsKind: 'widget',
        contentHash: 'abcdef0123456789',
      }).success,
    ).toBe(false);
  });
});

describe('SVG types — SvgRoundTripMetadata', () => {
  /**
   * @description The per-element round-trip tag MUST always carry the
   * stable element id. Zod rejects an empty string so future bugs that
   * strip the id surface loudly on load.
   */
  it('parses a minimal round-trip tag', () => {
    const meta: SvgRoundTripMetadata = {
      elementId: 'el-1',
      fingerprint: 'abcdef0123456789',
    };

    expect(svgRoundTripMetadataSchema.parse(meta)).toEqual(meta);
  });

  /**
   * @description Optional `preserved` payload rides along when the
   * importer recognised a construct but could not represent it natively
   * — used for opaque `<foreignObject>` / unknown vendor elements.
   */
  it('parses with preservation payload', () => {
    const meta: SvgRoundTripMetadata = {
      elementId: 'el-4',
      fingerprint: '0011223344556677',
      preserved: { mime: 'image/svg+xml', raw: 'base64-payload' },
    };

    expect(svgRoundTripMetadataSchema.parse(meta)).toEqual(meta);
  });
});

describe('SVG types — SvgSanitizationReport', () => {
  /**
   * @description The sanitization report MUST list every removal so the
   * import warnings modal can surface what was stripped per IO-D-18.
   */
  it('parses a report with removals', () => {
    const report: SvgSanitizationReport = {
      empty: false,
      removed: [
        { kind: 'element', name: 'script' },
        { kind: 'attribute', name: 'onclick' },
        { kind: 'url', name: 'javascript' },
      ],
    };

    expect(svgSanitizationReportSchema.parse(report)).toEqual(report);
  });

  /**
   * @description An empty sanitized input produces a report marked
   * `empty: true`; this is the signal the importer emits a
   * descriptive "no content" warning rather than silently returning
   * an empty document.
   */
  it('parses an empty report', () => {
    const report: SvgSanitizationReport = { empty: true, removed: [] };

    expect(svgSanitizationReportSchema.parse(report)).toEqual(report);
  });
});

describe('SVG types — import / export options', () => {
  /**
   * @description Import options accept an empty object; every field is
   * optional. This matches the PSD precedent — sensible defaults derived
   * from the shared importer security contract.
   */
  it('parses empty import options', () => {
    expect(svgImportOptionsSchema.parse({})).toEqual({});
  });

  /**
   * @description Every explicit import option parses cleanly.
   */
  it('parses full import options', () => {
    const opts: SvgImportOptions = {
      maxDepth: 32,
      maxBytes: 25_000_000,
      warnOnPreservation: true,
      allowForeignObject: false,
    };

    expect(svgImportOptionsSchema.parse(opts)).toEqual(opts);
  });

  /**
   * @description Export options accept an empty object. The default
   * `fontEmbedding` is applied by the exporter, not the schema, so
   * callers can pass `{}` to use the defaults.
   */
  it('parses empty export options', () => {
    expect(svgExportOptionsSchema.parse({})).toEqual({});
  });

  /**
   * @description Every explicit export option parses cleanly — the
   * default `fontEmbedding` is `embed` per the spec.
   */
  it('parses full export options', () => {
    const opts: SvgExportOptions = {
      fontEmbedding: 'embed',
      includeMetadata: true,
      includeElementTagging: true,
      flattenGroups: false,
    };

    expect(svgExportOptionsSchema.parse(opts)).toEqual(opts);
  });
});

describe('SVG types — SvgExtensions registration', () => {
  /**
   * @description The `svg` format id is reserved by the model and
   * appears in `BROADSET_FORMAT_IDS` so every per-format utility in
   * the registry treats SVG as a first-class citizen.
   */
  it('is a reserved format id on the model', () => {
    expect(BROADSET_FORMAT_IDS).toContain('svg');
  });

  /**
   * @description Loading the SVG types module (side effect in
   * `registerExtensionsSchema`) installs the concrete SvgExtensions
   * schema into the registry per IO-D-11. This test runs after the
   * top-of-file `import './types'` has already evaluated the module,
   * so the registration is expected to be present.
   */
  it('registers svgExtensionsSchema with the model registry on import', () => {
    expect(getExtensionsSchema('svg')).toBeDefined();
    expect(getExtensionsSchema('svg')).toBe(svgExtensionsSchema);
  });

  /**
   * @description A conforming SvgExtensions payload (dirty flag plus
   * optional round-trip tag) parses via Zod; the dirty-flag invariant
   * from `broadsetFormatExtensionsBaseSchema` MUST be enforced.
   */
  it('accepts a conforming payload', () => {
    const payload: SvgExtensions = {
      dirty: false,
      roundTrip: { elementId: 'el-1', fingerprint: 'abcdef0123456789' },
    };

    expect(svgExtensionsSchema.parse(payload)).toEqual(payload);
  });

  /**
   * @description A payload missing the `dirty` flag MUST be rejected.
   */
  it('rejects a payload missing dirty', () => {
    expect(svgExtensionsSchema.safeParse({ roundTrip: { elementId: 'el-1', fingerprint: 'a' } }).success).toBe(false);
  });

  /**
   * @description A payload with a preservation blob round-trips so
   * opaque fragments survive across `.bsp` save/load.
   */
  it('accepts a payload with preservation blob', () => {
    const preserved: SvgPreservedData = { mime: 'image/svg+xml', raw: 'base64-payload' };
    const payload: SvgExtensions = {
      dirty: false,
      preserved,
    };

    expect(svgExtensionsSchema.parse(payload)).toEqual(payload);
    expect(svgPreservedDataSchema.parse(preserved)).toEqual(preserved);
  });
});
