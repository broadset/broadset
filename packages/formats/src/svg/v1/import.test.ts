import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { projectFormatV1 } from '@broadset/model';
import { describe, expect, it, vi } from 'vitest';

import { importSvgProjectV1 } from './import';

const importedAt = projectFormatV1.utcTimestampSchema.parse('2026-07-12T00:00:00Z');
const fixturesDirectory = join(dirname(fileURLToPath(import.meta.url)), '..', '__fixtures__');

async function importSvg(svg: string) {
  return importSvgProjectV1({ svg, importedAt, fileName: 'fixture.svg' });
}

function childElements(result: Awaited<ReturnType<typeof importSvgProjectV1>>) {
  return result.project.documents[0]?.elements.filter(({ parentId }) => parentId !== null) ?? [];
}

describe('importSvgProjectV1', () => {
  it.each(readdirSync(fixturesDirectory).filter((name) => name.endsWith('.svg')))(
    'imports real producer fixture %s as valid v1',
    async (name) => {
      const result = await importSvgProjectV1({
        svg: readFileSync(join(fixturesDirectory, name), 'utf8'),
        importedAt,
        fileName: name,
      });

      expect(projectFormatV1.parseProjectV1Unknown(result.project).diagnostics).not.toContainEqual(
        expect.objectContaining({ code: 'structural-invalid' }),
      );
      expect(projectFormatV1.validateBroadsetProjectV1Semantics(result.project)).toEqual([]);
    },
  );

  it.each([
    ['rect', '<rect x="1" y="2" width="30" height="40" fill="#123456"/>', 'rectangle'],
    ['circle', '<circle cx="10" cy="10" r="5"/>', 'ellipse'],
    ['ellipse', '<ellipse cx="10" cy="12" rx="5" ry="6"/>', 'ellipse'],
    ['line', '<line x1="0" y1="1" x2="20" y2="21"/>', 'path'],
    ['polygon', '<polygon points="0,0 10,0 10,10"/>', 'path'],
    ['path', '<path d="M0 0 C 2 3 4 5 6 7 Z"/>', 'path'],
  ])('maps <%s> to v1 vector %s geometry', async (_tag, markup, geometryKind) => {
    const result = await importSvg(`<svg xmlns="http://www.w3.org/2000/svg" width="100" height="80">${markup}</svg>`);
    const element = childElements(result)[0];
    const baseline = result.project.interop.records.find(({ target }) => target.entityId === element?.id);

    expect(element).toMatchObject({ kind: 'vector', geometryData: { kind: geometryKind } });
    expect(baseline?.baselineSemanticHash).toBe(await projectFormatV1.computeCanonicalJsonHashV1(element));
    expect(projectFormatV1.validateBroadsetProjectV1Semantics(result.project)).toEqual([]);
  });

  it('normalizes horizontal, vertical, and arc path commands into structured segments', async () => {
    const result = await importSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><path d="M1 2 H10 V20 A5 5 0 0 1 15 25 Z"/></svg>',
    );
    const element = childElements(result)[0];

    expect(
      element?.kind === 'vector' && element.geometryData.kind === 'path' ?
        element.geometryData.path.segments.map(({ kind }) => kind)
      : [],
    ).toEqual(['move', 'line', 'line', 'cubic', 'close']);
  });

  it('maps fill and stroke paint into ordered v1 appearance layers', async () => {
    const result = await importSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10"><rect width="20" height="10" fill="rgba(255,0,0,.5)" fill-opacity=".5" stroke="blue" stroke-width="3"/></svg>',
    );
    const element = childElements(result)[0];

    expect(element?.appearance).toMatchObject({
      fills: [{ paint: { kind: 'solid', color: { kind: 'color', space: 'srgb', channels: [1, 0, 0] } } }],
      strokes: [{ width: 3, paint: { kind: 'solid', color: { kind: 'color', space: 'srgb', channels: [0, 0, 1] } } }],
    });
  });

  it('uses the SVG default black fill for shapes without a fill declaration', async () => {
    const result = await importSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10"><rect width="20" height="10"/></svg>',
    );

    expect(childElements(result)[0]?.appearance.fills[0]).toMatchObject({
      paint: { kind: 'solid', color: { channels: [0, 0, 0], alpha: 1 } },
    });
  });

  it('applies group opacity once instead of inheriting it onto children', async () => {
    const result = await importSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10"><g opacity=".5"><rect width="20" height="10"/></g></svg>',
    );
    const elements = childElements(result);
    const group = elements.find(({ kind }) => kind === 'group');
    const rectangle = elements.find(({ kind }) => kind === 'vector');

    expect(group?.appearance.opacity).toBe(0.5);
    expect(rectangle?.appearance.opacity).toBe(1);
  });

  it('maps text and tspan runs with font properties', async () => {
    const result = await importSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="40"><text font-family="Arial" font-size="18" font-weight="700"><tspan>Hello </tspan><tspan font-style="italic">world</tspan></text></svg>',
    );
    const element = childElements(result)[0];

    expect(element).toMatchObject({ kind: 'text' });
    expect(element?.kind === 'text' ? element.text.paragraphs[0]?.runs.map(({ text }) => text) : []).toEqual([
      'Hello ',
      'world',
    ]);
    expect(element?.kind === 'text' ? element.text.paragraphs[0]?.runs[0]?.properties.weight : undefined).toBe(700);
  });

  it('maps inherited SVG font properties through the sanitized cascade', async () => {
    const result = await importSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="40"><g font-family="Arial" font-size="20" font-weight="700"><text>Hello</text></g></svg>',
    );
    const text = childElements(result).find(({ kind }) => kind === 'text');
    const properties = text?.kind === 'text' ? text.text.paragraphs[0]?.runs[0]?.properties : undefined;
    const family = result.project.resources.fonts.find(({ id }) => id === properties?.fontFamilyId);

    expect(properties).toMatchObject({ size: 20, weight: 700 });
    expect(family?.familyName).toBe('Arial');
  });

  it('registers data-uri images and references their blob bytes', async () => {
    const result = await importSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10"><image width="2" height="1" href="data:image/png;base64,AQID"/></svg>',
    );
    const image = childElements(result)[0];

    expect(image).toMatchObject({ kind: 'image', image: { fit: 'fill' } });
    expect(
      result.project.resources.assets.some(({ id }) => image?.kind === 'image' && id === image.image.assetId),
    ).toBe(true);
    expect([...result.blobs.values()]).toContainEqual(new Uint8Array([1, 2, 3]));
  });

  it('falls back without retaining decoded images beyond the cumulative resource budget', async () => {
    const result = await importSvgProjectV1({
      svg: '<svg xmlns="http://www.w3.org/2000/svg"><image href="data:image/png;base64,AQID"/><image href="data:image/png;base64,BAUG"/></svg>',
      importedAt,
      fileName: 'budget.svg',
      maxRetainedResourceBytes: 3,
    });

    expect([...result.blobs.values()]).toContainEqual(new Uint8Array([1, 2, 3]));
    expect([...result.blobs.values()]).not.toContainEqual(new Uint8Array([4, 5, 6]));
    expect(result.project.interop.records.flatMap(({ warnings }) => warnings)).toContainEqual(
      expect.objectContaining({ code: 'svg.image-resource-limit', dimension: 'appearance' }),
    );
    expect(projectFormatV1.parseProjectV1Unknown(result.project).diagnostics).not.toContainEqual(
      expect.objectContaining({ code: 'structural-invalid' }),
    );
    expect(projectFormatV1.validateBroadsetProjectV1Semantics(result.project)).toEqual([]);
  });

  it('registers remote image references as missing assets without fetching', async () => {
    const result = await importSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10"><image width="2" height="1" href="https://example.com/image.png"/></svg>',
    );
    const image = childElements(result)[0];
    const asset = result.project.resources.assets.find(
      ({ id }) => image?.kind === 'image' && id === image.image.assetId,
    );

    expect(asset?.blob.source).toEqual({ kind: 'missing', lastKnownName: 'https://example.com/image.png' });
  });

  it('preserves groups as the v1 parent-child tree', async () => {
    const result = await importSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10"><g id="layer"><rect width="2" height="3"/></g></svg>',
    );
    const elements = result.project.documents[0]?.elements ?? [];
    const group = elements.find(({ name }) => name === 'layer');
    const rectangle = elements.find(({ kind }) => kind === 'vector');

    expect(group).toMatchObject({ kind: 'group' });
    expect(rectangle?.parentId).toBe(group?.id);
  });

  it('warns and uses an appearance fallback for paint servers', async () => {
    const result = await importSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10"><defs><linearGradient id="g"><stop stop-color="#ff0000"/><stop offset="1" stop-color="#0000ff"/></linearGradient></defs><rect width="20" height="10" fill="url(#g)"/></svg>',
    );

    expect(result.project.interop.records.flatMap(({ warnings }) => warnings)).toContainEqual(
      expect.objectContaining({ severity: 'warning', dimension: 'appearance' }),
    );
    expect(childElements(result)[0]?.appearance.fills[0]).toMatchObject({
      paint: { kind: 'solid', color: { channels: [1, 0, 0] } },
    });
  });

  it('aggregates descendant appearance warnings onto the top-level interop record', async () => {
    const result = await importSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10"><defs><linearGradient id="g"><stop stop-color="#ff0000"/><stop offset="1" stop-color="#0000ff"/></linearGradient></defs><g id="layer"><rect width="20" height="10" fill="url(#g)"/></g></svg>',
    );

    expect(result.project.interop.records).toHaveLength(1);
    expect(result.project.interop.records[0]?.warnings).toContainEqual(
      expect.objectContaining({ code: 'svg.paint-server-fallback', dimension: 'appearance' }),
    );
  });

  it('fails soft to a valid minimal project for malformed or oversized SVG', async () => {
    const malformed = await importSvg('<svg><');
    const oversized = await importSvgProjectV1({ svg: '<svg/>', importedAt, maxBytes: 1 });

    for (const result of [malformed, oversized]) {
      expect(projectFormatV1.parseProjectV1Unknown(result.project).diagnostics).not.toContainEqual(
        expect.objectContaining({ code: 'structural-invalid' }),
      );
      expect(projectFormatV1.validateBroadsetProjectV1Semantics(result.project)).toEqual([]);
      expect(result.project.interop.records.flatMap(({ warnings }) => warnings)).toContainEqual(
        expect.objectContaining({ severity: 'error' }),
      );
    }
  });

  it('keeps the terminal fallback schema-valid and semantically valid when hashing fails', async () => {
    const digest = vi.spyOn(globalThis.crypto.subtle, 'digest').mockRejectedValue(new Error('hash unavailable'));

    try {
      const result = await importSvg('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>');

      expect(projectFormatV1.broadsetProjectV1Schema.safeParse(result.project).success).toBe(true);
      expect(projectFormatV1.validateBroadsetProjectV1Semantics(result.project)).toEqual([]);
      expect(result.project.interop.records.flatMap(({ warnings }) => warnings)).toContainEqual(
        expect.objectContaining({ code: 'svg.import-failed', severity: 'error' }),
      );
    } finally {
      digest.mockRestore();
    }
  });

  it('does not retain scripts, handlers, or foreignObject javascript', async () => {
    const result = await importSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10" onload="alert(1)"><script>alert(2)</script><foreignObject><div>javascript:alert(3)</div></foreignObject><text>safe</text></svg>',
    );
    const serialized = JSON.stringify(result.project.documents);
    const retainedSource = [...result.blobs.values()].map((bytes: Uint8Array): string => new TextDecoder().decode(bytes)).join('');

    expect(serialized).not.toMatch(/<script|onload=|javascript:/iu);
    expect(retainedSource).not.toMatch(/<script|onload=|javascript:/iu);
    expect(serialized).toContain('safe');
  });

  it('rejects DTD and entity declarations before DOM parsing or expansion', async () => {
    const result = await importSvg(
      '<!DOCTYPE svg [<!ENTITY expanded "EXPANDED-CONTENT">]><svg xmlns="http://www.w3.org/2000/svg"><text>&expanded;</text></svg>',
    );
    const retained = [...result.blobs.values()].map((bytes: Uint8Array): string => new TextDecoder().decode(bytes)).join('');

    expect(retained).not.toContain('EXPANDED-CONTENT');
    expect(result.project.interop.records.flatMap(({ warnings }) => warnings)).toContainEqual(
      expect.objectContaining({ code: 'svg.dtd-rejected', severity: 'error' }),
    );
  });

  it('does not encode, hash, or retain an SVG rejected by the byte cap', async () => {
    const hostile = `<svg>${'x'.repeat(4096)}</svg>`;
    const result = await importSvgProjectV1({ svg: hostile, importedAt, maxBytes: 64 });
    const retained = [...result.blobs.values()].some(
      (bytes: Uint8Array): boolean => new TextDecoder().decode(bytes).includes('xxxx'),
    );

    expect(retained).toBe(false);
    expect(result.project.resources.assets[0]?.blob.byteLength).toBe(0);
  });

  it('omits sanitized provenance when CSS expansion exceeds the derived-byte cap', async () => {
    const rectangles = Array.from(
      { length: 30 },
      (_unused, index): string => `<rect id="r${String(index)}" class="painted" width="1" height="1"/>`,
    ).join('');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><style>.painted{fill:#123456;stroke:#654321;stroke-width:12;opacity:.5}</style>${rectangles}</svg>`;
    const maxBytes = new TextEncoder().encode(svg).byteLength + 16;
    const result = await importSvgProjectV1({ svg, importedAt, maxBytes });
    const provenance = result.project.resources.assets.find(({ kind }) => kind === 'foreign');

    expect(provenance?.blob.byteLength).toBe(0);
    expect([...result.blobs.values()].every((bytes: Uint8Array): boolean => bytes.byteLength === 0)).toBe(true);
    expect(result.project.interop.records.flatMap(({ warnings }) => warnings)).toContainEqual(
      expect.objectContaining({ code: 'svg.provenance-too-large', severity: 'warning' }),
    );
    expect(projectFormatV1.parseProjectV1Unknown(result.project).diagnostics).not.toContainEqual(
      expect.objectContaining({ code: 'structural-invalid' }),
    );
    expect(projectFormatV1.validateBroadsetProjectV1Semantics(result.project)).toEqual([]);
  });

  it('charges expanded nodes before cloning repeated large symbol subtrees', async () => {
    const symbolChildren = Array.from(
      { length: 5_001 },
      (): string => '<!--cloned-node-->',
    ).join('');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><defs><symbol id="parts">${symbolChildren}</symbol></defs><use href="#parts"/></svg>`;
    const cloneNode = vi.spyOn(Node.prototype, 'cloneNode');

    try {
      const result = await importSvg(svg);
      const hasExpandedNodeWarning = result.project.interop.records
        .flatMap(({ warnings }) => warnings)
        .some(({ code, message }) => code === 'svg.sanitized' && /expanded-node budget/iu.test(message));

      expect(cloneNode.mock.calls.length).toBeLessThanOrEqual(5_000);
      expect(hasExpandedNodeWarning).toBe(true);
      expect(projectFormatV1.validateBroadsetProjectV1Semantics(result.project)).toEqual([]);
    } finally {
      cloneNode.mockRestore();
    }
  });

  it('indexes source elements without quadratic attribute lookups', async () => {
    const rectangles = Array.from(
      { length: 500 },
      (_unused, index): string => `<rect id="source-${String(index)}" width="1" height="1"/>`,
    ).join('');
    const getAttribute = vi.spyOn(Element.prototype, 'getAttribute');
    let attributeReads = 0;

    try {
      await importSvg(`<svg xmlns="http://www.w3.org/2000/svg">${rectangles}</svg>`);
      attributeReads = getAttribute.mock.calls.length;
    } finally {
      getAttribute.mockRestore();
    }

    expect(attributeReads).toBeLessThan(100_000);
  });

  it('aggregates top-level warnings with a bounded number of parent lookups', async () => {
    const groups = Array.from({ length: 50 }, (_unused, groupIndex): string => {
      const children = Array.from(
        { length: 10 },
        (_child, childIndex): string =>
          `<rect id="child-${String(groupIndex)}-${String(childIndex)}" width="1" height="1"/>`,
      ).join('');

      return `<g id="group-${String(groupIndex)}">${children}</g>`;
    }).join('');
    const mapGet = vi.spyOn(Map.prototype, 'get');
    let mapReads = 0;

    try {
      await importSvg(`<svg xmlns="http://www.w3.org/2000/svg">${groups}</svg>`);
      mapReads = mapGet.mock.calls.length;
    } finally {
      mapGet.mockRestore();
    }

    expect(mapReads).toBeLessThan(60_000);
  });

  it('rejects node and markup-depth excess before DOM walking and surfaces the cap', async () => {
    const nodes = await importSvgProjectV1({
      svg: '<svg><rect/><rect/></svg>',
      importedAt,
      maxNodes: 2,
    });
    const depth = await importSvgProjectV1({
      svg: '<svg><g><g><rect/></g></g></svg>',
      importedAt,
      maxDepth: 2,
    });

    expect(nodes.project.interop.records.flatMap(({ warnings }) => warnings)).toContainEqual(
      expect.objectContaining({ code: 'svg.node-limit' }),
    );
    expect(depth.project.interop.records.flatMap(({ warnings }) => warnings)).toContainEqual(
      expect.objectContaining({ code: 'svg.depth-limit' }),
    );
  });

  it('surfaces every sanitizer action as a public import diagnostic', async () => {
    const result = await importSvg(
      '<svg xmlns="http://www.w3.org/2000/svg"><g onclick="run()"><script>run()</script><image href="javascript:run()"/></g></svg>',
    );
    const messages = result.project.interop.records.flatMap(({ warnings }) => warnings.map(({ message }) => message));

    expect(result.project.resources.assets[0]?.kind).toBe('foreign');

    expect(messages).toEqual(expect.arrayContaining([
      expect.stringMatching(/stripped <script>/iu),
      expect.stringMatching(/event-handler attribute onclick/iu),
      expect.stringMatching(/javascript:/iu),
    ]));
  });
});
