import type { Layer, Psd } from 'ag-psd';
import { writePsdUint8Array } from 'ag-psd';

/**
 * Producer-quirks fixture generator. Each entry simulates the variation
 * a different real-world PSD producer would introduce. We can't ship
 * licensed Photoshop / Affinity exports under the repo's open-source
 * licence (see `__fixtures__/README.md`), so the test suite generates
 * structurally diverse PSDs at test-time and round-trips them through
 * the importer + cross-reader validator.
 *
 * The fixtures are deliberately written with raw `ag-psd` calls — not
 * through Broadset's exporter — so they exercise the importer's
 * resilience against producer choices Broadset itself never makes.
 */

export interface PsdFixture {
  readonly name: string;
  readonly description: string;
  readonly bytes: Uint8Array;
}

function buildPsd(overrides: Partial<Psd>): Uint8Array {
  const psd: Psd = {
    width: 200,
    height: 100,
    channels: 4,
    bitsPerChannel: 8,
    colorMode: 3,
    children: [],
    ...overrides,
  };

  return writePsdUint8Array(psd);
}

function solidFillLayer(name: string, x: number, y: number, w: number, h: number, rgba: readonly [number, number, number, number]): Layer {
  const data = new Uint8Array(w * h * 4);

  for (let i = 0; i < w * h; i++) {
    const offset = i * 4;

    data[offset] = rgba[0];
    data[offset + 1] = rgba[1];
    data[offset + 2] = rgba[2];
    data[offset + 3] = rgba[3];
  }

  return {
    name,
    left: x,
    top: y,
    right: x + w,
    bottom: y + h,
    opacity: 1,
    hidden: false,
    imageData: { width: w, height: h, data },
  };
}

/**
 * Empty document: header only, no layers. Importer must not crash on
 * a structurally valid PSD that has nothing to map.
 */
function emptyDocumentFixture(): PsdFixture {
  return {
    name: 'empty-document',
    description: 'Header-only PSD with zero layers — importer must succeed with an empty Broadset document.',
    bytes: buildPsd({ width: 100, height: 50, children: [] }),
  };
}

/**
 * Single solid raster layer. The simplest non-trivial shape every
 * importer must handle.
 */
function singleRasterLayerFixture(): PsdFixture {
  return {
    name: 'single-raster-layer',
    description: 'One solid-fill raster layer — proves the importer maps an axis-aligned bitmap layer.',
    bytes: buildPsd({
      width: 200,
      height: 100,
      children: [solidFillLayer('Red', 10, 10, 80, 50, [255, 0, 0, 255])],
    }),
  };
}

/**
 * Three layers stacked at different opacities. Tests that opacity is
 * preserved across the import boundary and that the layer order
 * matches the producer's intent.
 */
function stackedOpacityFixture(): PsdFixture {
  const layer1 = solidFillLayer('Red', 0, 0, 100, 100, [255, 0, 0, 255]);
  const layer2 = { ...solidFillLayer('Green', 25, 25, 100, 100, [0, 255, 0, 255]), opacity: 0.6 };
  const layer3 = { ...solidFillLayer('Blue', 50, 50, 100, 100, [0, 0, 255, 255]), opacity: 0.3 };

  return {
    name: 'stacked-opacity',
    description: 'Three overlapping layers with varying opacities — importer must preserve opacity per-layer.',
    bytes: buildPsd({ width: 150, height: 150, children: [layer1, layer2, layer3] }),
  };
}

/**
 * Two layers wrapped in a layer group. Tests that the importer
 * preserves the group hierarchy via the parentId tree.
 */
function nestedGroupFixture(): PsdFixture {
  const child1 = solidFillLayer('Inner-A', 0, 0, 50, 50, [255, 128, 0, 255]);
  const child2 = solidFillLayer('Inner-B', 60, 0, 50, 50, [128, 0, 255, 255]);
  const group: Layer = { name: 'Group', opened: true, children: [child1, child2] };

  return {
    name: 'nested-group',
    description: 'Two layers inside a layer group — importer must reconstruct the parent / child tree.',
    bytes: buildPsd({ width: 200, height: 100, children: [group] }),
  };
}

/**
 * A layer with a non-default blend mode. Tests blend-mode mapping
 * across the bidirectional REVERSE_BLEND_MAP.
 */
function blendModeFixture(): PsdFixture {
  const base = solidFillLayer('Base', 0, 0, 100, 100, [255, 255, 0, 255]);
  const blended = { ...solidFillLayer('Multiply', 25, 25, 100, 100, [0, 200, 200, 255]), blendMode: 'multiply' as const };

  return {
    name: 'blend-mode-multiply',
    description: 'Two layers with a "multiply" blend mode on the top — importer must preserve blendMode.',
    bytes: buildPsd({ width: 150, height: 150, children: [base, blended] }),
  };
}

/**
 * Many small layers in a flat list. Tests that the importer doesn't
 * choke on documents with high layer counts.
 */
function manyLayersFixture(): PsdFixture {
  const layers: Layer[] = [];

  for (let i = 0; i < 24; i++) {
    layers.push(solidFillLayer(`Layer ${String(i)}`, i * 8, 10, 6, 80, [(i * 10) & 0xff, 100, 200, 255]));
  }

  return {
    name: 'many-flat-layers',
    description: '24 small flat layers — proves the importer scales beyond the trivial single-layer case.',
    bytes: buildPsd({ width: 200, height: 100, children: layers }),
  };
}

/**
 * Layer with a hidden flag set. Tests that the importer respects
 * visibility (mapped to per-page instance.visible at import time).
 */
function hiddenLayerFixture(): PsdFixture {
  const visible = solidFillLayer('Visible', 0, 0, 100, 100, [200, 200, 200, 255]);
  const hidden = { ...solidFillLayer('Hidden', 50, 50, 100, 100, [50, 50, 50, 255]), hidden: true };

  return {
    name: 'hidden-layer',
    description: 'A document with one visible and one hidden layer — visibility must round-trip.',
    bytes: buildPsd({ width: 150, height: 150, children: [visible, hidden] }),
  };
}

export function buildProducerQuirksFixtures(): readonly PsdFixture[] {
  return [
    emptyDocumentFixture(),
    singleRasterLayerFixture(),
    stackedOpacityFixture(),
    nestedGroupFixture(),
    blendModeFixture(),
    manyLayersFixture(),
    hiddenLayerFixture(),
  ];
}
