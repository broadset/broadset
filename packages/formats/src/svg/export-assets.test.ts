/**
 * P7.7j — `<image>` and `<pattern>` asset resolution on export.
 *
 * Per the spec feature matrix, embedded images export with
 * inline data URIs (line 23 of `svg.md`) and pattern fills
 * round-trip natively. Earlier loops emitted the bare Broadset
 * asset id as the `<image href>` value, which a standalone SVG
 * viewer (Illustrator / Inkscape / browser) cannot resolve —
 * the image / pattern fill renders empty.
 *
 * This unit adds an `assetResolver` callback to
 * `SvgExportOptions` so callers (the demo, custom build
 * pipelines) can map `assetId → data URI` or `assetId →
 * external URL`. The exporter consults the resolver for
 * `<image>` elements (when `content` is empty) and for
 * pattern / picture fills.
 */
import {
  type BroadsetDocument,
  type BroadsetElement,
  type BroadsetElementStyle,
  type BroadsetElementStyleInput,
  type Canvas,
  styleSchema,
} from '@broadset/model';
import { describe, expect, it } from 'vitest';

import { exportSvgString } from './index';

function makeCanvas(o: Partial<Canvas> = {}): Canvas {
  return {
    width: 400,
    height: 300,
    unit: 'px',
    dpi: 72,
    padding: [0, 0, 0, 0],
    backgroundColor: '#ffffff',
    backgroundMode: 'solid',
    ...o,
  };
}

function makeStyle(o: Partial<BroadsetElementStyleInput> = {}): BroadsetElementStyle {
  return styleSchema.parse({ opacity: 1, ...o });
}

function makeElement(o: Partial<BroadsetElement> = {}): BroadsetElement {
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
    ...o,
  };
}

function makeDocument(o: Partial<BroadsetDocument> = {}): BroadsetDocument {
  return {
    id: 'doc-1',
    name: 'T',
    documentMode: 'screen',
    canvas: makeCanvas(),
    elements: [],
    animations: [],
    pages: [],
    dataSchema: { fields: [] },
    ...o,
  };
}

describe('P7.7j — <image> asset resolution', () => {
  /**
   * @description When an `<image>` element has no `content` URL
   * but carries an `assetId`, the exporter MUST consult
   * `options.assetResolver` and use its return value as the
   * `<image href>`. Closes the spec line-23 acceptance "embedded
   * assets export with inline data URIs".
   */
  it('resolves assetId to a data URI via assetResolver', async () => {
    const doc = makeDocument({
      elements: [
        makeElement({
          id: 'image-1',
          type: 'image',
          content: '',
          assetId: 'photo-asset',
          width: 100,
          height: 80,
        }),
      ],
    });
    const dataUri = 'data:image/png;base64,iVBORw0KGgoAAA';
    const svg = await exportSvgString(doc, {
      assetResolver: (assetId) => (assetId === 'photo-asset' ? dataUri : undefined),
    });

    expect(svg).toContain(`href="${dataUri}"`);
  });

  /**
   * @description When `content` is already a URL (the legacy
   * shape), the exporter MUST use it directly without calling
   * the resolver. This preserves backward compatibility with
   * existing fixtures that store URLs in `content`.
   */
  it('prefers content URL over assetResolver when content is non-empty', async () => {
    const doc = makeDocument({
      elements: [
        makeElement({
          id: 'image-2',
          type: 'image',
          content: 'https://example.com/img.png',
          assetId: 'photo-asset',
        }),
      ],
    });
    const svg = await exportSvgString(doc, {
      assetResolver: () => 'data:image/png;base64,SHOULD_NOT_BE_USED',
    });

    expect(svg).toContain('href="https://example.com/img.png"');
    expect(svg).not.toContain('SHOULD_NOT_BE_USED');
  });
});

describe('P7.7l — assetResolver URL scheme allowlist', () => {
  /**
   * @description A `javascript:` URL returned by `assetResolver`
   * MUST be rejected and surface a warning. The exporter
   * preserves the spec's import-side `javascript:` stripping
   * symmetrically on the export side: a malicious or
   * compromised asset registry cannot produce a viewer-exploit
   * SVG via the resolver hook.
   */
  it('rejects javascript: URLs from assetResolver and falls back', async () => {
    const doc = makeDocument({
      elements: [makeElement({ id: 'image-x', type: 'image', content: '', assetId: 'evil-asset' })],
    });
    const result = await exportSvgString(doc, {
      assetResolver: () => 'javascript:alert(1)',
    });

    expect(result).not.toContain('javascript:');
    expect(result).not.toContain('alert');
  });

  /**
   * @description `data:text/html` and similar non-image data
   * URIs MUST be rejected. Only `data:image/...`, `data:font/...`,
   * `http(s):`, fragment refs, and relative paths are allowed.
   */
  it('rejects data:text/html URLs from assetResolver', async () => {
    const doc = makeDocument({
      elements: [makeElement({ id: 'image-y', type: 'image', content: '', assetId: 'sneaky' })],
    });
    const result = await exportSvgString(doc, {
      assetResolver: () => 'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
    });

    expect(result).not.toContain('data:text/html');
    expect(result).not.toContain('PHNjcmlwdD');
  });

  /**
   * @description A `data:image/png;base64,…` URL MUST pass
   * through unchanged — that's the canonical embedded-image
   * shape consumers expect.
   */
  it('accepts data:image/png;base64 URLs', async () => {
    const dataUri = 'data:image/png;base64,iVBORw0KGgo';
    const doc = makeDocument({
      elements: [makeElement({ id: 'image-ok', type: 'image', content: '', assetId: 'photo' })],
    });
    const result = await exportSvgString(doc, {
      assetResolver: () => dataUri,
    });

    expect(result).toContain(`href="${dataUri}"`);
  });
});

describe('P7.7j — <pattern> asset resolution', () => {
  /**
   * @description A `pattern` fill MUST resolve its asset id via
   * the resolver when present, so the emitted `<pattern>` body's
   * `<image href>` carries a valid URL — not the bare asset id.
   */
  it('resolves pattern fill assetId through assetResolver', async () => {
    const doc = makeDocument({
      elements: [
        makeElement({
          id: 'rect-p',
          style: makeStyle({ fill: { kind: 'pattern', assetId: 'tile-asset', repeat: 'repeat' } }),
        }),
      ],
    });
    const dataUri = 'data:image/png;base64,TILE_BYTES';
    const svg = await exportSvgString(doc, {
      assetResolver: (assetId) => (assetId === 'tile-asset' ? dataUri : undefined),
    });

    expect(svg).toMatch(/<pattern[\s\S]*<image[^/]*href="data:image\/png;base64,TILE_BYTES"/);
  });
});
