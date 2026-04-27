/**
 * Browser-rendered visual parity checks for canonical SVG round-trip.
 *
 * Structural checks can miss visual regressions where markup remains
 * valid but paints differently. This suite compares browser-rendered
 * pixels of canonical Broadset-exported SVG against the same SVG after
 * import -> export round-trip.
 */
import {
  type BroadsetDocument,
  type BroadsetElement,
  type BroadsetElementStyle,
  type BroadsetElementStyleInput,
  type Canvas,
  rgbColor,
  styleSchema,
} from '@broadset/model';
import { type Browser, chromium, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { exportSvgString, importSvgDocument } from './index';

const STRICT_VISUAL_DIFF_RATIO_LIMIT = 0.005;

function makeCanvas(overrides: Partial<Canvas> = {}): Canvas {
  return {
    width: 400,
    height: 300,
    unit: 'px',
    dpi: 72,
    padding: [0, 0, 0, 0],
    backgroundColor: '#ffffff',
    backgroundMode: 'solid',
    ...overrides,
  };
}

function makeStyle(overrides: Partial<BroadsetElementStyleInput> = {}): BroadsetElementStyle {
  return styleSchema.parse({ opacity: 1, ...overrides });
}

function makeElement(overrides: Partial<BroadsetElement> = {}): BroadsetElement {
  return {
    id: `el-${String(Math.random()).slice(2, 8)}`,
    type: 'rectangle',
    name: '',
    content: '',
    position: { x: 0, y: 0 },
    width: 100,
    height: 100,
    rotation: 0,
    parentId: null,
    groupId: null,
    style: makeStyle(),
    assetId: null,
    dataField: null,
    visibleWhen: null,
    repeater: null,
    componentRef: null,
    typeConfig: null,
    autoSize: 'fixed',
    locked: false,
    textPathElementId: null,
    booleanOperation: null,
    extensions: {},
    ...overrides,
  } as BroadsetElement;
}

function makeDocument(overrides: Partial<BroadsetDocument> = {}): BroadsetDocument {
  return {
    id: 'doc-visual-svg',
    name: 'Visual Roundtrip',
    documentMode: 'screen',
    canvas: makeCanvas(),
    elements: [],
    animations: [],
    pages: [],
    dataSchema: { fields: [] },
    ...overrides,
  } as BroadsetDocument;
}

interface PixelDiffResult {
  readonly width: number;
  readonly height: number;
  readonly totalPixels: number;
  readonly differingPixels: number;
  readonly diffRatio: number;
}

async function compareRenderedSvg(
  page: Page,
  baselineSvg: string,
  candidateSvg: string,
): Promise<PixelDiffResult> {
  return page.evaluate(
    async ({ baselineSvg, candidateSvg }) => {
      const FALLBACK_SIZE = 256;

      const parsePositiveNumber = (raw: string | null): number | null => {
        if (raw === null || raw.trim() === '') {
          return null;
        }

        const parsed = Number.parseFloat(raw);

        return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
      };

      const readSvgSize = (svg: string): { readonly width: number; readonly height: number } => {
        const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml');
        const root = parsed.documentElement;
        const widthAttr = parsePositiveNumber(root.getAttribute('width'));
        const heightAttr = parsePositiveNumber(root.getAttribute('height'));

        if (widthAttr !== null && heightAttr !== null) {
          return { width: widthAttr, height: heightAttr };
        }

        const viewBox = root.getAttribute('viewBox');

        if (viewBox !== null && viewBox.trim() !== '') {
          const parts = viewBox.trim().split(/[\s,]+/);
          const width = parsePositiveNumber(parts[2] ?? null);
          const height = parsePositiveNumber(parts[3] ?? null);

          if (width !== null && height !== null) {
            return { width, height };
          }
        }

        return { width: FALLBACK_SIZE, height: FALLBACK_SIZE };
      };

      const aSize = readSvgSize(baselineSvg);
      const bSize = readSvgSize(candidateSvg);
      const width = Math.max(1, Math.round(Math.max(aSize.width, bSize.width)));
      const height = Math.max(1, Math.round(Math.max(aSize.height, bSize.height)));

      const render = async (svg: string): Promise<Uint8ClampedArray> => {
        const blob = new Blob([svg], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);

        try {
          const image = await new Promise<HTMLImageElement>((resolveImage, rejectImage) => {
            const img = new Image();

            img.onload = () => { resolveImage(img); };

            img.onerror = () => { rejectImage(new Error('failed to decode SVG image')); };

            img.src = url;
          });

          const canvas = document.createElement('canvas');

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');

          if (ctx === null) {
            throw new Error('failed to obtain 2D canvas context');
          }

          ctx.clearRect(0, 0, width, height);
          ctx.drawImage(image, 0, 0, width, height);

          return ctx.getImageData(0, 0, width, height).data;
        } finally {
          URL.revokeObjectURL(url);
        }
      };

      const baselinePixels = await render(baselineSvg);
      const candidatePixels = await render(candidateSvg);

      let differingPixels = 0;

      for (let i = 0; i < baselinePixels.length; i += 4) {
        const dr = Math.abs((baselinePixels[i] ?? 0) - (candidatePixels[i] ?? 0));
        const dg = Math.abs((baselinePixels[i + 1] ?? 0) - (candidatePixels[i + 1] ?? 0));
        const db = Math.abs((baselinePixels[i + 2] ?? 0) - (candidatePixels[i + 2] ?? 0));
        const da = Math.abs((baselinePixels[i + 3] ?? 0) - (candidatePixels[i + 3] ?? 0));

        // Ignore sub-pixel anti-aliasing noise.
        if (dr + dg + db + da > 8) {
          differingPixels += 1;
        }
      }

      const totalPixels = width * height;

      return {
        width,
        height,
        totalPixels,
        differingPixels,
        diffRatio: differingPixels / totalPixels,
      };
    },
    { baselineSvg, candidateSvg },
  );
}

function makeVisualScenarioDocument(kind: 'gradient-mask' | 'filter-stack' | 'group-transform'): BroadsetDocument {
  if (kind === 'gradient-mask') {
    return makeDocument({
      elements: [
        makeElement({
          id: 'grad-rect',
          type: 'rectangle',
          width: 160,
          height: 120,
          style: makeStyle({
            backgroundGradient: {
              type: 'linear',
              angle: 45,
              stops: [
                { position: 0, color: rgbColor('#ff0066') },
                { position: 1, color: rgbColor('#00c2ff') },
              ],
            },
          }),
        }),
        makeElement({
          id: 'mask-rect',
          type: 'rectangle',
          position: { x: 180, y: 40 },
          width: 140,
          height: 140,
          style: makeStyle({
            fill: '#2f9e44',
            maskType: 'alpha',
            customClipPath: 'M0,0 L140,0 L140,140 L0,140 Z M35,35 L105,35 L105,105 L35,105 Z',
          }),
        }),
      ],
    });
  }

  if (kind === 'filter-stack') {
    return makeDocument({
      elements: [
        makeElement({
          id: 'filtered',
          type: 'rectangle',
          position: { x: 60, y: 70 },
          width: 180,
          height: 120,
          style: makeStyle({
            fill: '#336699',
            filter: [
              { kind: 'blur', stdDeviation: 2 },
              { kind: 'contrast', amount: 0.7 },
              { kind: 'brightness', amount: 1.1 },
            ],
          }),
        }),
      ],
    });
  }

  return makeDocument({
    elements: [
      makeElement({ id: 'group-a', type: 'group', position: { x: 40, y: 50 } }),
      makeElement({
        id: 'child-ellipse',
        type: 'ellipse',
        parentId: 'group-a',
        width: 120,
        height: 80,
        rotation: 18,
        style: makeStyle({ fill: '#f08c00', stroke: '#5f3dc4', strokeWidth: 3 }),
      }),
      makeElement({
        id: 'child-path',
        type: 'path',
        parentId: 'group-a',
        position: { x: 130, y: 30 },
        content: 'M10,10 L90,10 L50,70 Z',
        style: makeStyle({ fill: '#12b886' }),
      }),
    ],
  });
}

describe('P7.7n - SVG browser-render visual parity', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
    await page.goto('about:blank');
  }, 30_000);

  afterAll(async () => {
    await page.close();
    await browser.close();
  });

  it.each([
    ['gradient-mask', 'gradient + mask canonical fixture', 0.18],
    ['filter-stack', 'filter stack canonical fixture', 0.23],
    ['group-transform', 'group/transform canonical fixture', STRICT_VISUAL_DIFF_RATIO_LIMIT],
  ] as const)(
    '%s: %s stays within visual regression budget after export -> import -> export',
    async (kind, description, budget) => {
      expect(description.length).toBeGreaterThan(0);

      const sourceDoc = makeVisualScenarioDocument(kind);
      const baselineSvg = await exportSvgString(sourceDoc);
      const { document: importedDoc } = importSvgDocument(baselineSvg, `${kind}.svg`);
      const roundTrippedSvg = await exportSvgString(importedDoc);
      const diff = await compareRenderedSvg(page, baselineSvg, roundTrippedSvg);

      expect(diff.totalPixels).toBeGreaterThan(0);
      expect(diff.diffRatio).toBeLessThanOrEqual(budget);
    },
  );
});
