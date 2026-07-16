import { projectFormatV1 } from '@broadset/model';
import type { Layer, Psd } from 'ag-psd';
import { writePsdUint8Array } from 'ag-psd';
import { describe, expect, it, vi } from 'vitest';

import { importPsdProjectV1 } from '../../index';
import { buildProducerQuirksFixtures } from '../__fixtures__/producer-quirks.fixture';
import { buildRectangleMask } from '../vector-mask';

const IMPORTED_AT = projectFormatV1.utcTimestampSchema.parse('2026-07-12T00:00:00Z');

function buildPsd(children: readonly Layer[]): Uint8Array {
  const psd: Psd = {
    width: 100,
    height: 80,
    channels: 4,
    bitsPerChannel: 8,
    colorMode: 3,
    children: [...children],
  };

  return writePsdUint8Array(psd);
}

function buildSolidLayer(): Layer {
  const width = 20;
  const height = 10;
  const data = new Uint8Array(width * height * 4);

  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const offset = pixel * 4;

    data[offset] = 220;
    data[offset + 1] = 40;
    data[offset + 2] = 80;
    data[offset + 3] = 255;
  }

  return {
    name: 'Raster layer',
    left: 12,
    top: 18,
    right: 32,
    bottom: 28,
    imageData: { width, height, data },
  };
}

function buildNestedGroup(depth: number): Layer {
  return depth <= 0 ? buildSolidLayer() : { name: `Group ${String(depth)}`, children: [buildNestedGroup(depth - 1)] };
}

function expectValid(result: Awaited<ReturnType<typeof importPsdProjectV1>>): void {
  const structural = projectFormatV1.parseProjectV1Unknown(result.project).diagnostics;

  expect(structural.filter(({ code }) => code === 'structural-invalid')).toEqual([]);
  expect(projectFormatV1.validateBroadsetProjectV1Semantics(result.project)).toEqual([]);
}

describe('importPsdProjectV1', () => {
  it('maps a raster layer to a content-addressed v1 image element', async () => {
    const bytes = buildPsd([buildSolidLayer()]);
    const result = await importPsdProjectV1({ bytes, fileName: 'raster.psd', importedAt: IMPORTED_AT });
    const image = result.project.documents[0]?.elements.find(({ kind }) => kind === 'image');
    const asset = result.project.resources.assets.find(
      ({ id }) => image?.kind === 'image' && image.image.assetId === id,
    );
    const baseline = result.project.interop.records.find(({ target }) => target.entityId === image?.id);

    expect(image).toMatchObject({
      kind: 'image',
      name: 'Raster layer',
      geometry: { bounds: { width: 20, height: 10 } },
    });
    expect(asset).toMatchObject({ kind: 'image', blob: { mediaType: 'image/png' } });
    expect(baseline?.baselineSemanticHash).toBe(await projectFormatV1.computeCanonicalJsonHashV1(image));
    expect(result.project.interop.sources[0]).toMatchObject({ format: 'psd', importedAt: IMPORTED_AT });
    expectValid(result);
  });

  it('maps PSD layer opacity and blend mode to v1 appearance', async () => {
    const layer: Layer = { ...buildSolidLayer(), opacity: 0.4, blendMode: 'multiply' };
    const result = await importPsdProjectV1({ bytes: buildPsd([layer]), importedAt: IMPORTED_AT });
    const image = result.project.documents[0]?.elements.find(({ kind }) => kind === 'image');

    expect(image?.appearance.opacity).toBeCloseTo(0.4, 2);
    expect(image?.appearance.blendMode).toBe('multiply');
    expectValid(result);
  });

  it('preserves nested PSD groups as a v1 parent tree', async () => {
    const bytes = buildPsd([
      {
        name: 'Folder',
        children: [{ ...buildSolidLayer(), name: 'Nested raster' }],
      },
    ]);
    const result = await importPsdProjectV1({ bytes, importedAt: IMPORTED_AT });
    const group = result.project.documents[0]?.elements.find(({ name }) => name === 'Folder');
    const child = result.project.documents[0]?.elements.find(({ name }) => name === 'Nested raster');

    expect(group).toMatchObject({ kind: 'group' });
    expect(child?.parentId).toBe(group?.id);
    expectValid(result);
  });

  it('maps an editable PSD vector mask to a v1 structured path', async () => {
    const layer: Layer = {
      ...buildSolidLayer(),
      name: 'Vector rectangle',
      vectorMask: { paths: [buildRectangleMask(20, 10)] },
      vectorFill: { type: 'color', color: { r: 20, g: 120, b: 220 } },
    };
    const result = await importPsdProjectV1({ bytes: buildPsd([layer]), importedAt: IMPORTED_AT });
    const vector = result.project.documents[0]?.elements.find(({ name }) => name === 'Vector rectangle');

    expect(vector).toMatchObject({
      kind: 'vector',
      geometryData: { kind: 'path', path: { closed: true } },
      appearance: { fills: [{ paint: { kind: 'solid', color: { channels: [20 / 255, 120 / 255, 220 / 255] } } }] },
    });
    expectValid(result);
  });

  it('maps PSD text content and styling to a v1 text body', async () => {
    const layer: Layer = {
      name: 'Headline',
      left: 5,
      top: 6,
      right: 75,
      bottom: 30,
      text: {
        text: 'Hello PSD',
        style: { fontSize: 18, fillColor: { r: 10, g: 80, b: 160 } },
      },
    };
    const result = await importPsdProjectV1({ bytes: buildPsd([layer]), importedAt: IMPORTED_AT });
    const text = result.project.documents[0]?.elements.find(({ name }) => name === 'Headline');
    const run = text?.kind === 'text' ? text.text.paragraphs[0]?.runs[0] : undefined;
    const runColor = run?.properties.color;

    expect(text).toMatchObject({ kind: 'text' });
    expect(run).toMatchObject({
      text: 'Hello PSD',
      properties: { size: 18, color: { space: 'srgb' } },
    });
    expect(runColor?.kind).toBe('color');
    expect(runColor?.kind === 'color' ? runColor.channels[0] : undefined).toBeCloseTo(10 / 255, 4);
    expect(runColor?.kind === 'color' ? runColor.channels[1] : undefined).toBeCloseTo(80 / 255, 4);
    expect(runColor?.kind === 'color' ? runColor.channels[2] : undefined).toBeCloseTo(160 / 255, 4);
    expect(result.project.resources.fonts).toHaveLength(1);
    expectValid(result);
  });

  it('preserves PSD text style runs as distinct v1 runs', async () => {
    const layer: Layer = {
      name: 'Styled text',
      left: 5,
      top: 6,
      right: 90,
      bottom: 36,
      text: {
        text: 'RedBlue',
        style: { fontSize: 12 },
        styleRuns: [
          { length: 3, style: { fontSize: 12, fillColor: { r: 255, g: 0, b: 0 } } },
          { length: 4, style: { fontSize: 20, fillColor: { r: 0, g: 0, b: 255 } } },
        ],
      },
    };
    const result = await importPsdProjectV1({ bytes: buildPsd([layer]), importedAt: IMPORTED_AT });
    const text = result.project.documents[0]?.elements.find(({ name }) => name === 'Styled text');
    const runs = text?.kind === 'text' ? (text.text.paragraphs[0]?.runs ?? []) : [];

    expect(runs).toHaveLength(2);
    expect(runs.map(({ text: value }) => value)).toEqual(['Red', 'Blue']);
    expect(runs.map(({ properties }) => properties.size)).toEqual([12, 20]);
    expectValid(result);
  });

  it('reports placed-layer semantics that use a raster appearance fallback', async () => {
    const layer: Layer = {
      ...buildSolidLayer(),
      name: 'Smart object',
      placedLayer: {
        id: '20953ddb-9391-11ec-b4f1-c15674f50bc4',
        type: 'raster',
        width: 20,
        height: 10,
        transform: [0, 0, 20, 0, 20, 10, 0, 10],
      },
    };
    const result = await importPsdProjectV1({ bytes: buildPsd([layer]), importedAt: IMPORTED_AT });

    expect(result.project.interop.records.flatMap(({ warnings }) => warnings)).toContainEqual(
      expect.objectContaining({ code: 'psd.placed-layer-partial', dimension: 'editability' }),
    );
    expectValid(result);
  });

  it('maps PSD artboards to distinct v1 pages', async () => {
    const artboard = (name: string, left: number): Layer => ({
      name,
      left,
      top: 0,
      right: left + 50,
      bottom: 80,
      artboard: { rect: { left, top: 0, right: left + 50, bottom: 80 } },
      children: [{ ...buildSolidLayer(), name: `${name} content` }],
    });
    const result = await importPsdProjectV1({
      bytes: buildPsd([artboard('Artboard A', 0), artboard('Artboard B', 50)]),
      importedAt: IMPORTED_AT,
    });
    const document = result.project.documents[0];

    expect(document?.pages).toHaveLength(2);
    expect(document?.pages.map(({ name }) => name)).toEqual(['Artboard A', 'Artboard B']);
    expect(document?.pages.every(({ rootInstances }) => rootInstances.length === 1)).toBe(true);
    expectValid(result);
  });

  it('fails soft for malformed PSD bytes', async () => {
    const result = await importPsdProjectV1({
      bytes: new TextEncoder().encode('not a PSD'),
      importedAt: IMPORTED_AT,
    });

    expectValid(result);
    expect(result.project.interop.records.flatMap(({ warnings }) => warnings)).toContainEqual(
      expect.objectContaining({ code: 'psd.malformed', severity: 'error' }),
    );
  });

  it('rejects oversized bytes before hashing or parsing', async () => {
    const digest = vi.spyOn(globalThis.crypto.subtle, 'digest');

    try {
      const result = await importPsdProjectV1({
        bytes: buildPsd([buildSolidLayer()]),
        importedAt: IMPORTED_AT,
        maxBytes: 1,
      });

      expectValid(result);
      expect(result.project.interop.records.flatMap(({ warnings }) => warnings)).toContainEqual(
        expect.objectContaining({ code: 'psd.input-too-large', severity: 'error' }),
      );
      expect([...result.blobs.values()]).toEqual([new Uint8Array()]);
      expect(digest).not.toHaveBeenCalled();
    } finally {
      digest.mockRestore();
    }
  });

  it('returns a complete fallback when resource hashing fails', async () => {
    const digest = vi.spyOn(globalThis.crypto.subtle, 'digest').mockRejectedValue(new Error('digest unavailable'));

    try {
      const result = await importPsdProjectV1({ bytes: buildPsd([buildSolidLayer()]), importedAt: IMPORTED_AT });

      expectValid(result);
      expect(result.project.interop.records.flatMap(({ warnings }) => warnings)).toContainEqual(
        expect.objectContaining({ code: 'psd.import-failed', severity: 'error' }),
      );
    } finally {
      digest.mockRestore();
    }
  });

  it('caps recursive layer depth with an interop diagnostic', async () => {
    const result = await importPsdProjectV1({
      bytes: buildPsd([buildNestedGroup(4)]),
      importedAt: IMPORTED_AT,
      maxDepth: 1,
    });

    expectValid(result);
    expect(result.project.interop.records.flatMap(({ warnings }) => warnings)).toContainEqual(
      expect.objectContaining({ code: 'psd.depth-limit', severity: 'warning' }),
    );
  });

  it('caps cumulative raster pixels and reports omitted layers', async () => {
    const result = await importPsdProjectV1({
      bytes: buildPsd([buildSolidLayer(), { ...buildSolidLayer(), name: 'Second raster' }]),
      importedAt: IMPORTED_AT,
      maxTotalPixels: 200,
    });
    const images = result.project.documents[0]?.elements.filter(({ kind }) => kind === 'image') ?? [];

    expect(images).toHaveLength(1);
    expect(result.project.interop.records.flatMap(({ warnings }) => warnings)).toContainEqual(
      expect.objectContaining({ code: 'psd.pixel-limit', severity: 'warning' }),
    );
    expectValid(result);
  });

  it('maps unsupported leaf layers to an editable placeholder with a diagnostic', async () => {
    const layer: Layer = { name: 'Adjustment layer', left: 3, top: 4, right: 23, bottom: 14 };
    const result = await importPsdProjectV1({ bytes: buildPsd([layer]), importedAt: IMPORTED_AT });
    const placeholder = result.project.documents[0]?.elements.find(({ name }) => name === 'Adjustment layer');

    expect(placeholder).toMatchObject({ kind: 'vector', geometryData: { kind: 'rectangle' } });
    expect(result.project.interop.records.flatMap(({ warnings }) => warnings)).toContainEqual(
      expect.objectContaining({ code: 'psd.layer-placeholder', dimension: 'semantics' }),
    );
    expectValid(result);
  });

  it.each(buildProducerQuirksFixtures())('$name fixture reaches zero-error v1 validity', async ({ bytes, name }) => {
    const result = await importPsdProjectV1({ bytes, fileName: `${name}.psd`, importedAt: IMPORTED_AT });

    expectValid(result);
  });
});
