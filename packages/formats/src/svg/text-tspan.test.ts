/**
 * P7.7j — `<tspan>` per-run text export + import.
 *
 * Per `project/spec/formats/svg.md` feature matrix line 79
 * (`Multi-run styled text (TextBody + Paragraph + Run)`), the
 * track promises native export and import via one `<tspan>` per
 * `Run`. Earlier loops emitted plain text and discarded run-level
 * style overrides; the import side flattened every `<tspan>` into
 * a single string. This unit closes both gaps.
 *
 * Export: walks `TextBody.paragraphs[].runs[]` and emits one
 * `<tspan>` per run carrying any run-level style overrides
 * (`fontFamily`, `fontSize`, `fontWeight`, `fontStyle`, `fill`,
 * `textDecoration`). Paragraph breaks emit a `dy="1em"` baseline
 * shift on the first `<tspan>` of each non-first paragraph.
 *
 * Import: when a `<text>` element has `<tspan>` children, the
 * importer builds a structured `TextBody` from them and
 * preserves per-run style overrides (so a later re-export can
 * round-trip the runs).
 */
import {
  type BroadsetDocument,
  type BroadsetElement,
  type BroadsetElementStyle,
  type BroadsetElementStyleInput,
  type Canvas,
  paragraph,
  run,
  styleSchema,
  textBody,
} from '@broadset/model';
import { describe, expect, it } from 'vitest';

import { exportSvgString, importSvgDocument } from './index';

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
    type: 'text',
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
  } as BroadsetElement;
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
  } as BroadsetDocument;
}

describe('P7.7j — Multi-run text export', () => {
  /**
   * @description Plain `string` content keeps the existing
   * behaviour: one `<text>` element with the text as its body.
   * No `<tspan>` MUST appear when the source is just a string.
   */
  it('emits plain text body for string content (no tspan)', async () => {
    const doc = makeDocument({
      elements: [makeElement({ id: 't1', content: 'Plain string' })],
    });
    const svg = await exportSvgString(doc);

    expect(svg).toContain('<text');
    expect(svg).not.toContain('<tspan');
    expect(svg).toContain('Plain string</text>');
  });

  /**
   * @description A `TextBody` with a single paragraph and two
   * runs (each with its own `fontFamily` / `fill`) MUST emit
   * one `<tspan>` per run carrying those overrides.
   */
  it('emits one <tspan> per run with style overrides', async () => {
    const doc = makeDocument({
      elements: [
        makeElement({
          id: 't2',
          content: textBody([
            paragraph([
              run('Hello ', { style: { fontFamily: 'Inter', fill: '#ff0000' } }),
              run('World', { style: { fontWeight: 700 } }),
            ]),
          ]),
        }),
      ],
    });
    const svg = await exportSvgString(doc);

    expect(svg).toMatch(/<tspan font-family="Inter" fill="#ff0000">Hello <\/tspan>/);
    expect(svg).toMatch(/<tspan font-weight="700">World<\/tspan>/);
  });

  /**
   * @description A `TextBody` with two paragraphs MUST emit a
   * `dy="1em"` baseline shift on the first `<tspan>` of the
   * second paragraph so paragraph breaks render as line breaks.
   */
  it('emits dy="1em" between paragraphs', async () => {
    const doc = makeDocument({
      elements: [
        makeElement({
          id: 't3',
          content: textBody([paragraph([run('Line 1')]), paragraph([run('Line 2')])]),
        }),
      ],
    });
    const svg = await exportSvgString(doc);

    expect(svg).toMatch(/<tspan>Line 1<\/tspan>/);
    expect(svg).toMatch(/<tspan x="0" dy="1em">Line 2<\/tspan>/);
  });
});

describe('P7.7j — Multi-run text import', () => {
  /**
   * @description When a `<text>` has `<tspan>` children, the
   * importer MUST build a structured `TextBody` carrying each
   * run's text and any inline style overrides. Later re-export
   * round-trips the run shape.
   */
  it('builds a TextBody from <tspan> children', () => {
    const input = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100">
      <text x="0" y="20"><tspan font-family="Inter" fill="#ff0000">Hello </tspan><tspan font-weight="700">World</tspan></text>
    </svg>`;
    const { document } = importSvgDocument(input);
    const text = document.elements.find((el) => el.type === 'text');

    expect(text).toBeDefined();

    const content = text?.content;

    expect(typeof content).not.toBe('string');

    if (content !== undefined && typeof content !== 'string') {
      expect(content.paragraphs).toHaveLength(1);
      expect(content.paragraphs[0]?.runs).toHaveLength(2);
      expect(content.paragraphs[0]?.runs[0]?.text).toBe('Hello ');
      expect(content.paragraphs[0]?.runs[1]?.text).toBe('World');
    }
  });

  /**
   * @description A `<text>` with NO `<tspan>` children imports
   * as a plain string `content` (preserves the existing
   * single-line text fixture round-trip).
   */
  it('imports string content when no <tspan> children are present', () => {
    const input = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100">
      <text x="0" y="20">Plain string</text>
    </svg>`;
    const { document } = importSvgDocument(input);
    const text = document.elements.find((el) => el.type === 'text');

    expect(typeof text?.content).toBe('string');
    expect(text?.content).toBe('Plain string');
  });

  /**
   * @description Nested `<tspan>` MUST NOT duplicate text.
   * `getElementsByTagName('tspan')` walks descendants — the outer
   * tspan's `textContent` already contains the inner tspan's text.
   * The importer MUST iterate direct children, not descendants,
   * so each text byte appears in exactly one Run. Closes the
   * P7.7l review #4 blocker.
   */
  it('does not duplicate text from nested <tspan>', () => {
    const input = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100">
      <text x="0" y="20"><tspan>outer <tspan font-weight="700">inner</tspan></tspan></text>
    </svg>`;
    const { document } = importSvgDocument(input);
    const text = document.elements.find((el) => el.type === 'text');
    const content = text?.content;

    expect(typeof content).not.toBe('string');

    if (content !== undefined && typeof content !== 'string') {
      const allText = content.paragraphs[0]?.runs.map((r) => r.text).join('') ?? '';

      expect(allText).toBe('outer inner');
    }
  });

  /**
   * @description A `<tspan>` with `dy="1em"` (the canonical SVG
   * paragraph-break convention emitted by Broadset's own exporter
   * and other authoring tools) MUST start a new `Paragraph`. The
   * round-trip otherwise loses the multi-paragraph structure on
   * import. Closes the P7.7l review #4 blocker.
   */
  it('detects dy="1em" as a paragraph break', () => {
    const input = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100">
      <text x="0" y="20"><tspan>Line 1</tspan><tspan x="0" dy="1em">Line 2</tspan></text>
    </svg>`;
    const { document } = importSvgDocument(input);
    const text = document.elements.find((el) => el.type === 'text');
    const content = text?.content;

    expect(typeof content).not.toBe('string');

    if (content !== undefined && typeof content !== 'string') {
      expect(content.paragraphs).toHaveLength(2);
      expect(content.paragraphs[0]?.runs[0]?.text).toBe('Line 1');
      expect(content.paragraphs[1]?.runs[0]?.text).toBe('Line 2');
    }
  });
});
