import { describe, expect, it } from 'vitest';

import { writeOoxmlPackage } from './ooxml/zip';
import { importPptxSourceWithReport as importPptxWithReport } from './source-import';

/**
 * @description PPTX importer fuzz harness.
 *
 * Hostile inputs (malformed bytes, billion-laughs payloads, zip-bombs,
 * path-traversal, deeply-nested XML, macro-bearing packages) MUST
 * never crash the importer. The contract from
 * `project/spec/formats/spec.md` Importer Security Contract is:
 *
 *   - No exceptions escape the importer surface.
 *   - Resource caps (size, depth, entry count) trip and surface a
 *     warning rather than running unbounded.
 *   - Path-traversal entries cannot escape the package logical root.
 *   - DTD declarations / external entities are rejected outright.
 *   - Macro / OLE execution surfaces are rejected.
 *
 * The corpus below is a curated set of attack vectors. Each input
 * MUST produce a `PptxImportReport` (document + warnings) without
 * throwing. The acceptance bar is intentionally low — the harness is
 * a "did the importer crash?" gate, not a fidelity gate.
 */

const TEXT_ENCODER = new TextEncoder();

function encode(text: string): Uint8Array {
  return TEXT_ENCODER.encode(text);
}

interface FuzzCase {
  readonly name: string;
  readonly bytes: Uint8Array;
  readonly expectsWarning?: RegExp;
}

function buildBillionLaughsXml(): string {
  return `<?xml version="1.0"?>
<!DOCTYPE lolz [
  <!ENTITY lol "lol">
  <!ENTITY lol1 "&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;">
  <!ENTITY lol2 "&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;">
  <!ENTITY lol3 "&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;">
]>
<root>&lol3;</root>`;
}

function buildXxeXml(): string {
  return `<?xml version="1.0"?>
<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>
<foo>&xxe;</foo>`;
}

function buildDeeplyNestedXml(depth: number): string {
  return `<?xml version="1.0"?>${'<n>'.repeat(depth)}content${'</n>'.repeat(depth)}`;
}

function buildLargeXml(byteTarget: number): string {
  const filler = 'x'.repeat(64);
  const repeats = Math.ceil(byteTarget / filler.length);

  return `<?xml version="1.0"?><a>${filler.repeat(repeats)}</a>`;
}

function emptyContentTypes(): string {
  return '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>';
}

function emptyRootRels(): string {
  return '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>';
}

function buildEmptyPackage(): Uint8Array {
  return writeOoxmlPackage(
    new Map<string, Uint8Array>([
      ['[Content_Types].xml', encode(emptyContentTypes())],
      ['_rels/.rels', encode(emptyRootRels())],
    ]),
  );
}

function buildPackageWith(parts: Iterable<[string, string | Uint8Array]>): Uint8Array {
  const map = new Map<string, Uint8Array>([
    ['[Content_Types].xml', encode(emptyContentTypes())],
    ['_rels/.rels', encode(emptyRootRels())],
  ]);

  for (const [path, content] of parts) {
    map.set(path, typeof content === 'string' ? encode(content) : content);
  }

  return writeOoxmlPackage(map);
}

function buildVbaPackage(): Uint8Array {
  return buildPackageWith([['ppt/vbaProject.bin', new Uint8Array([0xd0, 0xcf, 0x11, 0xe0])]]);
}

function buildOleEmbeddingPackage(): Uint8Array {
  return buildPackageWith([['ppt/embeddings/oleObject1.bin', new Uint8Array(1024)]]);
}

const FUZZ_CASES: readonly FuzzCase[] = [
  {
    name: 'empty bytes',
    bytes: new Uint8Array(0),
  },
  {
    name: 'random non-ZIP bytes',
    bytes: ((): Uint8Array => {
      const random = new Uint8Array(1024);

      for (let i = 0; i < random.length; i += 1) random[i] = (i * 17 + 31) & 0xff;

      return random;
    })(),
  },
  {
    name: 'truncated ZIP header (PK signature only)',
    bytes: new Uint8Array([0x50, 0x4b, 0x03, 0x04]),
  },
  {
    name: 'empty but well-formed package',
    bytes: buildEmptyPackage(),
  },
  {
    name: 'package with a billion-laughs payload',
    bytes: buildPackageWith([['ppt/slides/slide1.xml', buildBillionLaughsXml()]]),
    expectsWarning: /malformed-xml/,
  },
  {
    name: 'package with an XXE external-entity payload',
    bytes: buildPackageWith([['ppt/slides/slide1.xml', buildXxeXml()]]),
    expectsWarning: /malformed-xml/,
  },
  {
    name: 'package with deeply nested XML (1024 levels)',
    bytes: buildPackageWith([['ppt/slides/slide1.xml', buildDeeplyNestedXml(1024)]]),
  },
  {
    name: 'package with a large but valid XML part (256 KiB)',
    bytes: buildPackageWith([['ppt/slides/slide1.xml', buildLargeXml(256 * 1024)]]),
  },
  {
    name: 'package containing a vbaProject.bin macro stream',
    bytes: buildVbaPackage(),
    expectsWarning: /vba|macro|execution/i,
  },
  {
    name: 'package containing an OLE embedding',
    bytes: buildOleEmbeddingPackage(),
    expectsWarning: /ole|embedding|execution/i,
  },
  {
    name: 'malformed XML inside a slide part',
    bytes: buildPackageWith([['ppt/slides/slide1.xml', '<?xml version="1.0"?><not closed']]),
    expectsWarning: /malformed-xml/,
  },
  {
    name: 'package with a path-traversal entry',
    bytes: buildPackageWith([['../../../etc/passwd', '<?xml version="1.0"?><x/>']]),
  },
  {
    name: 'package with binary garbage in a slide part',
    bytes: buildPackageWith([['ppt/slides/slide1.xml', new Uint8Array([0x00, 0xff, 0x7f, 0x80, 0x42])]]),
    // No specific warning required — the slide isn't referenced from
    // ppt/_rels/presentation.xml.rels so it's never enumerated. The
    // gate here is "no exception escapes".
  },
];

describe('PPTX importer fuzz harness', () => {
  for (const fuzzCase of FUZZ_CASES) {
    it(`survives without throwing: ${fuzzCase.name}`, () => {
      const start = process.hrtime.bigint();
      const result = importPptxWithReport(fuzzCase.bytes);
      const elapsedMs = Number(process.hrtime.bigint() - start) / 1_000_000;

      expect(result.document).toBeDefined();
      expect(Array.isArray(result.warnings)).toBe(true);
      // Importer must finish in bounded time even on hostile inputs.
      // 5 seconds is generous; real production budget is sub-second
      // and the security contract mandates no unbounded loops.
      expect(elapsedMs).toBeLessThan(5_000);

      if (fuzzCase.expectsWarning !== undefined) {
        const matched = result.warnings.some((w) => fuzzCase.expectsWarning?.test(`${w.code}: ${w.message}`) ?? false);

        expect(
          matched,
          `expected a warning matching ${String(fuzzCase.expectsWarning)} for ${fuzzCase.name}; got ${JSON.stringify(result.warnings)}`,
        ).toBe(true);
      }
    });
  }

  it('source import returns the controlled base report when ZIP bytes are malformed', () => {
    const result = importPptxWithReport(new Uint8Array([0x50, 0x4b, 0x03, 0x04]));

    expect(result.document.elements).toEqual([]);
    expect(result.warnings.some((warning) => warning.code === 'malformed-xml')).toBe(true);
  });
});
