import { describe, expect, it } from 'vitest';

import { rgbColor } from './broadset-color';
import {
  autoBullet,
  type Bullet,
  bulletSchema,
  charBullet,
  isAutoBullet,
  isCharBullet,
  isNoneBullet,
  isTextBody,
  noneBullet,
  type Paragraph,
  paragraph,
  PARAGRAPH_LEVELS,
  type Run,
  run,
  type TextBody,
  textBody,
  textBodyFromPlainString,
  textBodySchema,
} from './text-body';

/**
 * Phase 1 unit #9 — the `TextBody` / `Paragraph` / `Run` / `RunProps`
 * / `ParagraphProps` / `Bullet` surface underpins mixed-run text
 * round-trip for PSD (`TySh`), PPTX (`<a:txBody>`), and PDF (tagged
 * content). This first sub-commit (9a) is additive: it lands the
 * types, Zod schemas, factories, and validators. A later sub-commit
 * flips `content: string` on `BroadsetElement` to `string | TextBody`
 * and teaches the renderer / editor the dual-path.
 */
describe('TextBody factories', () => {
  /**
   * @description `run(text)` without props must produce the canonical
   * no-props shape — the majority of imported runs are plain text, so
   * keeping the factory terse keeps importer code readable.
   */
  it('run produces the canonical shape without props', () => {
    expect(run('hello')).toEqual<Run>({ text: 'hello' });
  });

  /**
   * @description `run(text, props)` preserves every provided field so
   * inline color, language, and hyperlink metadata survive round-trip
   * through the factory.
   */
  it('run preserves props when provided', () => {
    const r = run('world', {
      style: { fontWeight: 700 },
      lang: 'en-US',
      hyperlink: { url: 'https://example.com', target: '_blank' },
    });

    expect(r).toEqual<Run>({
      text: 'world',
      props: {
        style: { fontWeight: 700 },
        lang: 'en-US',
        hyperlink: { url: 'https://example.com', target: '_blank' },
      },
    });
  });

  /**
   * @description `paragraph` requires at least one run. The factory
   * passes the caller's array through verbatim so the schema can
   * enforce the non-empty invariant on load.
   */
  it('paragraph preserves runs and props', () => {
    const p = paragraph([run('hi')], { align: 'center', level: 1 });

    expect(p).toEqual<Paragraph>({
      runs: [{ text: 'hi' }],
      props: { align: 'center', level: 1 },
    });
  });

  /**
   * @description `textBody` simply wraps a paragraph array. It is the
   * canonical entry point so importers never hand-construct the shape
   * and drift from the type.
   */
  it('textBody wraps paragraphs', () => {
    const body = textBody([paragraph([run('line')])]);

    expect(body).toEqual<TextBody>({ paragraphs: [{ runs: [{ text: 'line' }] }] });
  });

  /**
   * @description `textBodyFromPlainString` must preserve newline-
   * delimited paragraphs so fixtures migrating from `content: string`
   * retain paragraph structure without manual parsing.
   */
  it('textBodyFromPlainString splits on newlines into paragraphs', () => {
    const body = textBodyFromPlainString('first\nsecond\nthird');

    expect(body.paragraphs).toHaveLength(3);
    expect(body.paragraphs[0]?.runs[0]?.text).toBe('first');
    expect(body.paragraphs[1]?.runs[0]?.text).toBe('second');
    expect(body.paragraphs[2]?.runs[0]?.text).toBe('third');
  });

  /**
   * @description The empty string must promote to a single paragraph
   * with a single empty run. Every `TextBody` returned by the factory
   * MUST validate against `textBodySchema` so callers can feed the
   * result straight into element construction without additional
   * normalization.
   */
  it('textBodyFromPlainString handles the empty string', () => {
    const body = textBodyFromPlainString('');

    expect(body).toEqual<TextBody>({ paragraphs: [{ runs: [{ text: '' }] }] });
    expect(textBodySchema.safeParse(body).success).toBe(true);
  });
});

describe('Bullet factories and guards', () => {
  /**
   * @description The three bullet kinds MUST have reliable factories
   * and type guards so paragraph editors can dispatch to the right
   * rendering path without discriminator juggling at the call site.
   */
  it.each([
    [noneBullet(), isNoneBullet, 'none'],
    [charBullet({ char: '•' }), isCharBullet, 'char'],
    [autoBullet({ format: 'arabicPeriod', startAt: 1 }), isAutoBullet, 'auto'],
  ] as const)('factory + guard pair narrows to %s kind', (bullet, guard, kind) => {
    expect(guard(bullet)).toBe(true);
    expect(bullet.kind).toBe(kind);
  });

  /**
   * @description `charBullet` preserves `color` when provided so
   * themed bullets (e.g. OOXML `<a:buClr>`) round-trip cleanly.
   */
  it('charBullet preserves color and font overrides', () => {
    const color = rgbColor('#ff0000');
    const bullet: Bullet = charBullet({ char: '•', font: 'Arial', color });

    expect(bullet).toEqual<Bullet>({ kind: 'char', char: '•', font: 'Arial', color });
  });

  /**
   * @description `autoBullet` preserves `startAt` when provided;
   * OOXML's `<a:buAutoNum startAt="N">` controls the ordinal base of
   * generated numbering, so the factory must carry it forward.
   */
  it('autoBullet preserves startAt', () => {
    expect(autoBullet({ format: 'romanUcPeriod', startAt: 3 })).toEqual<Bullet>({
      kind: 'auto',
      format: 'romanUcPeriod',
      startAt: 3,
    });
  });
});

describe('bulletSchema', () => {
  /**
   * @description Every supported bullet kind must pass the schema.
   * Rejecting a valid kind here would block an entire class of
   * imported paragraphs from loading.
   */
  it('accepts every kind', () => {
    expect(bulletSchema.safeParse(noneBullet()).success).toBe(true);
    expect(bulletSchema.safeParse(charBullet({ char: '•' })).success).toBe(true);
    expect(bulletSchema.safeParse(autoBullet({ format: 'arabicPeriod' })).success).toBe(true);
  });

  /**
   * @description A `char` bullet with an empty `char` string MUST be
   * rejected — an empty character is meaningless and likely signals
   * corrupt import data.
   */
  it('rejects char bullet with an empty char', () => {
    expect(bulletSchema.safeParse({ kind: 'char', char: '' }).success).toBe(false);
  });

  /**
   * @description An unknown bullet `kind` MUST be rejected so the
   * renderer never receives a shape it has no path for.
   */
  it('rejects unknown bullet kinds', () => {
    expect(bulletSchema.safeParse({ kind: 'emoji' }).success).toBe(false);
  });
});

describe('textBodySchema', () => {
  /**
   * @description A minimal valid body: one paragraph, one run. The
   * simplest shape a text importer can produce must not require
   * gymnastics to validate.
   */
  it('accepts a minimal single-run body', () => {
    const body = textBody([paragraph([run('text')])]);

    expect(textBodySchema.safeParse(body).success).toBe(true);
  });

  /**
   * @description Multi-run paragraphs (the whole point of the unit)
   * must pass — mixed-run content is the primary use case for the
   * structured model.
   */
  it('accepts a multi-run paragraph with mixed props', () => {
    const body = textBody([
      paragraph(
        [run('Hello '), run('world', { style: { fontWeight: 700 } }), run('!', { hyperlink: { url: 'https://x' } })],
        { align: 'center', level: 0 },
      ),
    ]);

    expect(textBodySchema.safeParse(body).success).toBe(true);
  });

  /**
   * @description An empty `paragraphs` array MUST be rejected. A
   * document containing a text element with zero paragraphs is a
   * structural error — every text element carries at least one
   * (possibly empty-run) paragraph.
   */
  it('rejects an empty paragraphs array', () => {
    expect(textBodySchema.safeParse({ paragraphs: [] }).success).toBe(false);
  });

  /**
   * @description An empty `runs` array inside a paragraph MUST be
   * rejected — the `min(1)` invariant on paragraph runs keeps the
   * structural contract tight and surfaces importer bugs at load
   * time.
   */
  it('rejects a paragraph with zero runs', () => {
    expect(textBodySchema.safeParse({ paragraphs: [{ runs: [] }] }).success).toBe(false);
  });

  /**
   * @description `RunProps.lang` MUST match the BCP 47 shape when
   * provided. Accepting arbitrary strings would let tag-less runs
   * pass validation and later trip `bidi-js` / `harfbuzzjs` when the
   * layout engine tries to interpret them.
   */
  it('rejects RunProps.lang that is not a BCP 47 tag', () => {
    const invalid = textBody([paragraph([run('x', { lang: '☃️ not-bcp47' })])]);

    expect(textBodySchema.safeParse(invalid).success).toBe(false);
  });

  /**
   * @description A hyperlink without a URL MUST be rejected — the
   * whole point of the field is the target, and validation here
   * prevents the renderer from emitting an empty `<a href="">`.
   */
  it('rejects a hyperlink missing its url', () => {
    const invalid = {
      paragraphs: [{ runs: [{ text: 'x', props: { hyperlink: { url: '' } } }] }],
    };

    expect(textBodySchema.safeParse(invalid).success).toBe(false);
  });

  /**
   * @description `ParagraphProps.level` must be one of 0…8. The plan
   * caps nesting at 9 levels to match OOXML list outlines, so level
   * 9+ or fractional levels are rejected.
   */
  it('rejects ParagraphProps.level outside 0..8', () => {
    const invalid = textBody([paragraph([run('x')], { level: 9 as 0 })]);

    expect(textBodySchema.safeParse(invalid).success).toBe(false);
  });
});

describe('isTextBody', () => {
  /**
   * @description The `isTextBody` guard must accept valid shapes and
   * reject anything else so consumers can distinguish
   * `content: string` from `content: TextBody` at runtime when the
   * field becomes a union in a later sub-commit.
   */
  it('returns true for a valid TextBody and false otherwise', () => {
    expect(isTextBody(textBody([paragraph([run('ok')])]))).toBe(true);
    expect(isTextBody('plain string')).toBe(false);
    expect(isTextBody(null)).toBe(false);
    expect(isTextBody(undefined)).toBe(false);
    expect(isTextBody({ paragraphs: [] })).toBe(false);
  });
});

describe('PARAGRAPH_LEVELS', () => {
  /**
   * @description `PARAGRAPH_LEVELS` MUST enumerate exactly 0 through
   * 8. List-outline editors iterate over this to render the level
   * picker — a missing entry would hide a level from the UI.
   */
  it('enumerates 0..8', () => {
    expect<ReadonlyArray<number>>(PARAGRAPH_LEVELS).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });
});
