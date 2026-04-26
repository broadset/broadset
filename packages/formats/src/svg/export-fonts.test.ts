/**
 * P7.7d — SVG export font embedding (`embed` / `reference` / `flatten`).
 *
 * Per `project/spec/formats/svg.md` → "Font Embedding (Embed / Reference
 * / Flatten)" and the previously-deferred Spec Gap entry. The exporter
 * now honours `FontEmbedChoice` and:
 *
 * - `'embed'` (default) — emits `<defs><style>@font-face { src: url(
 *   data:font/woff2;base64,…) }</style></defs>` for every text-element
 *   font supplied in `options.fonts`. The font is subset to the
 *   characters actually used in the document via
 *   `_shared/fonts/subsetFont`.
 * - `'reference'` — emits `@font-face { src: url('<external url>') }`
 *   when the source carries a URL. Falls back silently when no URL is
 *   available.
 * - `'flatten'` — replaces each `<text>` with a `<g>` of `<path>`
 *   glyph outlines via fontkit's `font.layout` + `glyph.path.toSVG()`.
 *   No `<text>` / `<tspan>` / `@font-face` survives in the output.
 *
 * Permission gating per IO-D-14: a font with OS/2 fsType bit 1
 * (`restricted`) MUST emit a warning and fall back to `'reference'`.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { type BroadsetDocument, type BroadsetElement, styleSchema } from '@broadset/model';
import { describe, expect, it } from 'vitest';

import { exportSvgDocument } from './index';
import { type SvgFontSource } from './types';

const FIXTURE_PATH = resolve(__dirname, '../_shared/fonts/__fixtures__/codicon.ttf');

function loadCodicon(): Uint8Array {
  return new Uint8Array(readFileSync(FIXTURE_PATH));
}

function makeDocWithText(fontFamily: string, content: string): BroadsetDocument {
  const textEl: BroadsetElement = {
    id: 'text-1',
    type: 'text',
    name: 'Text',
    content,
    position: { x: 10, y: 20 },
    width: 200,
    height: 40,
    rotation: 0,
    parentId: null,
    groupId: null,
    style: styleSchema.parse({
      opacity: 1,
      fontFamily,
      fontSize: 16,
    }),
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
  } as BroadsetElement;

  return {
    id: 'doc-1',
    name: 'Test',
    documentMode: 'screen',
    canvas: {
      width: 400,
      height: 200,
      unit: 'px',
      dpi: 72,
      padding: [0, 0, 0, 0],
      backgroundColor: '#ffffff',
      backgroundMode: 'solid',
    },
    elements: [textEl],
    animations: [],
    pages: [],
    dataSchema: { fields: [] },
  } as BroadsetDocument;
}

describe('P7.7d — Font embedding: embed mode', () => {
  /**
   * @description `'embed'` (default) MUST place an `@font-face` rule
   * inside `<defs><style>` whose `src:` value is a base64
   * `data:font/woff2;base64,…` (or `font/ttf` matching the source
   * format) URI. The same family used twice MUST emit a single
   * `@font-face` (de-duped).
   */
  it('emits a base64 data: @font-face inside <defs><style>', async () => {
    const bytes = loadCodicon();
    const fonts = new Map<string, SvgFontSource>([
      ['Codicon', { bytes, format: 'ttf' }],
    ]);
    const doc = makeDocWithText('Codicon', '');
    const { svg, warnings } = await exportSvgDocument(doc, { fontEmbedding: 'embed', fonts });

    expect(svg).toMatch(/<defs[^>]*>[\s\S]*<style[^>]*>[\s\S]*@font-face/);
    expect(svg).toMatch(/font-family:\s*['"]?Codicon['"]?/);
    expect(svg).toMatch(/src:\s*url\(['"]?data:font\/(?:woff2|ttf|otf);base64,/);
    expect(warnings).toEqual([]);
  });

  /**
   * @description The same `font-family` referenced from N text
   * elements MUST collapse to a single `@font-face` block.
   */
  it('emits a single @font-face for a family used by multiple elements', async () => {
    const bytes = loadCodicon();
    const fonts = new Map<string, SvgFontSource>([['Codicon', { bytes, format: 'ttf' }]]);
    const doc = makeDocWithText('Codicon', 'ê');
    const docWithTwo: BroadsetDocument = {
      ...doc,
      elements: [
        ...doc.elements,
        { ...doc.elements[0], id: 'text-2' } as BroadsetElement,
      ],
    };
    const { svg } = await exportSvgDocument(docWithTwo, { fontEmbedding: 'embed', fonts });
    const occurrences = (svg.match(/@font-face/g) ?? []).length;

    expect(occurrences).toBe(1);
  });

  /**
   * @description When no font bytes are supplied for a family, the
   * exporter MUST NOT emit an `@font-face` (no body to embed) and
   * MUST surface a warning so the caller can fix the asset wiring.
   */
  it('warns and skips @font-face when no bytes are supplied for a referenced family', async () => {
    const doc = makeDocWithText('UnknownFamily', 'hi');
    const { svg, warnings } = await exportSvgDocument(doc, { fontEmbedding: 'embed' });

    expect(svg).not.toMatch(/@font-face/);
    expect(warnings.some((w) => w.includes('UnknownFamily'))).toBe(true);
  });
});

describe('P7.7d — Font embedding: reference mode', () => {
  /**
   * @description `'reference'` MUST emit `@font-face { src: url(<external>) }`
   * for every supplied family that carries a `url`. No base64 data
   * URI; consumer fetches the font over the network.
   */
  it('emits external url() reference under reference mode', async () => {
    const fonts = new Map<string, SvgFontSource>([
      ['Codicon', { url: 'https://example.com/codicon.woff2', format: 'woff2' }],
    ]);
    const doc = makeDocWithText('Codicon', 'a');
    const { svg } = await exportSvgDocument(doc, { fontEmbedding: 'reference', fonts });

    expect(svg).toMatch(/@font-face/);
    expect(svg).toMatch(/src:\s*url\(['"]?https:\/\/example\.com\/codicon\.woff2['"]?\)/);
    expect(svg).not.toMatch(/data:font/);
  });
});

describe('P7.7d — Font embedding: flatten mode', () => {
  /**
   * @description `'flatten'` MUST replace each `<text>` element with
   * a `<g>` whose children are `<path>` glyph outlines. No
   * `@font-face` declaration is emitted because the rendered shape
   * carries no font dependency.
   */
  it('emits <path> glyphs and no <text> / @font-face', async () => {
    const bytes = loadCodicon();
    const fonts = new Map<string, SvgFontSource>([['Codicon', { bytes, format: 'ttf' }]]);
    const doc = makeDocWithText('Codicon', '');
    const { svg } = await exportSvgDocument(doc, { fontEmbedding: 'flatten', fonts });

    expect(svg).not.toMatch(/<text[\s>]/);
    expect(svg).not.toMatch(/<tspan/);
    expect(svg).not.toMatch(/@font-face/);
    expect(svg).toMatch(/<path[^>]*\sd=/);
  });
});

describe('P7.7d — CSS injection hardening', () => {
  /**
   * @description A hostile font-family name with `</style>` MUST be
   * escaped via CSS hex-codepoint syntax so the resulting markup
   * cannot break out of the surrounding `<style>` block. The literal
   * `</style` must not survive into the rendered SVG.
   */
  it('escapes </style> in font-family names so they cannot break out of <style>', async () => {
    const bytes = loadCodicon();
    const fonts = new Map<string, SvgFontSource>([
      ["Hostile</style><script>alert(1)</script>", { bytes, format: 'ttf' }],
    ]);
    const doc = makeDocWithText("Hostile</style><script>alert(1)</script>", '');
    const { svg } = await exportSvgDocument(doc, { fontEmbedding: 'embed', fonts });

    expect(svg).not.toMatch(/<\/style><script>/);
  });

  /**
   * @description A reference URL with a disallowed scheme
   * (`javascript:`) MUST be rejected; the exporter MUST emit a
   * warning and skip the `@font-face` for that family.
   */
  it('rejects javascript: URLs in reference mode and warns', async () => {
    const fonts = new Map<string, SvgFontSource>([
      ['Hostile', { url: 'javascript:alert(1)', format: 'woff2' }],
    ]);
    const doc = makeDocWithText('Hostile', 'a');
    const { svg, warnings } = await exportSvgDocument(doc, { fontEmbedding: 'reference', fonts });

    expect(svg).not.toMatch(/javascript:/);
    expect(warnings.some((w) => /disallowed scheme/i.test(w))).toBe(true);
  });
});

describe('P7.7d — Restricted-permission preflight', () => {
  /**
   * @description When the supplied `bytes` carry an OS/2 fsType bit 1
   * (restricted) the exporter MUST surface a warning AND fall back to
   * the `reference` mode for that family — no base64 embed.
   *
   * The codicon fixture does NOT carry restricted fsType. To exercise
   * the policy without a restricted fixture, the test passes
   * `permissionOverride: 'restricted'` so the exporter follows the
   * policy branch deterministically. Real fonts with fsType bit 1
   * exercise the same branch via `readEmbedPermission`.
   */
  it('falls back to reference and warns on restricted-permission fonts', async () => {
    const bytes = loadCodicon();
    const fonts = new Map<string, SvgFontSource>([
      [
        'Codicon',
        { bytes, format: 'ttf', url: 'https://example.com/codicon.woff2', permissionOverride: 'restricted' },
      ],
    ]);
    const doc = makeDocWithText('Codicon', 'a');
    const { svg, warnings } = await exportSvgDocument(doc, { fontEmbedding: 'embed', fonts });

    expect(warnings.some((w) => /restricted|forbids embedding/i.test(w))).toBe(true);
    expect(svg).not.toMatch(/data:font/);
    expect(svg).toMatch(/url\(['"]?https:\/\/example\.com\/codicon\.woff2/);
  });
});
