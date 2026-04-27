/**
 * P7.7n — Adversarial-input regression tests.
 *
 * These pin the security-audit fixes (C1, C2, H1, M1, L2, L3)
 * against a future regression. Each test reproduces a payload an
 * attacker could plausibly craft and asserts the importer's
 * specific defense fires without silently swallowing the
 * structural identity (still emits a warning per IO-D-18).
 *
 * Companion to `import-third-party.test.ts` (synthetic baseline)
 * and `tool-fixtures.test.ts` (real-tool ecosystem coverage).
 */
import { describe, expect, it } from 'vitest';

import { importSvgDocument } from './index';

describe('P7.7n security audit — fixed findings', () => {
  /**
   * @description C1 — `<use>` fan-out bomb. A symbol tree where
   * each `<symbol>` contains 4 `<use>` references to the next
   * symbol grows as 4^N when dereferenced; without the total-node
   * budget, a 16-deep chain expands to ~4 billion clones. The
   * importer MUST cap total expansion (50 000 nodes) and emit a
   * warning naming the budget. Test depth = 8 with 4 children per
   * level (~65 000 expansions, just over the budget).
   */
  it('C1: <use> fan-out bomb halts at the total-node budget', () => {
    const levels: string[] = [];

    for (let i = 0; i < 8; i++) {
      const next = i === 7 ? '<rect width="1" height="1"/>' : `<use href="#s${String(i + 1)}"/>`.repeat(4);

      levels.push(`<symbol id="s${String(i)}">${next}</symbol>`);
    }

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><defs>${levels.join('')}</defs><use href="#s0"/></svg>`;
    const { warnings } = importSvgDocument(svg, 'fan-out-bomb');

    // The warning is the actual security signal. Without the
    // invocation cap, the same fixture spins for ~30 s in jsdom
    // (and would burn far longer at higher fan-out / depth);
    // hitting the cap proves the defence fired before that point.
    // Wall-clock assertions on jsdom were flaky under full-suite
    // load — the cap firing alone is sufficient proof.
    expect(warnings.some((w) => /exceeded budget/i.test(w))).toBe(true);
  }, 30_000);

  /**
   * @description C2 — Default byte cap. An import without an
   * explicit `maxBytes` option MUST still reject a multi-MB
   * pathological input rather than running `DOMParser` against
   * the full string. The cap default is 32 MB; a 33-MB payload
   * triggers the warning path.
   */
  it('C2: oversized SVG is rejected pre-parse without an explicit maxBytes option', () => {
    // 33 MB of valid-but-huge SVG (filled with a single repeating
    // benign comment so the parser doesn't see a hostile DTD even
    // if it ran — which it shouldn't, by the cap).
    const filler = '<!--padding-->'.repeat(2_400_000);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">${filler}<rect width="50" height="50" fill="#fff"/></svg>`;

    expect(svg.length).toBeGreaterThan(32 * 1024 * 1024);

    const { document, warnings } = importSvgDocument(svg, 'oversize');

    expect(warnings.some((w) => /byte cap of/i.test(w))).toBe(true);
    // Empty document hydrated as a safe fallback — no parsed elements.
    expect(document.elements.length).toBe(0);
  });

  /**
   * @description H1 — Scheme allowlist symmetry. An imported
   * `<image href="vbscript:…">` / `<image href="data:text/html,…">`
   * / `<image href="file:///…">` MUST be stripped before reaching
   * the persisted document. Previously only `javascript:` was
   * removed, leaving a re-export footgun and a renderer-side
   * vector for tools that honoured those schemes.
   */
  it.each([
    ['vbscript:msgbox(1)'],
    ['data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=='],
    ['file:///etc/passwd'],
    ['chrome-extension://foo/bar.png'],
  ])('H1: <image href="%s"> is stripped on import', (badUrl) => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><image href="${badUrl}" width="50" height="50"/></svg>`;
    const { document } = importSvgDocument(svg, 'bad-scheme');
    const image = document.elements.find((el) => el.type === 'image');

    if (image !== undefined) {
      const content = typeof image.content === 'string' ? image.content : '';

      expect(content).not.toContain(badUrl.split(':')[0] ?? badUrl);
    }
  });

  /**
   * @description H1 (positive) — `data:image/png` / `https://`
   * / fragment / relative URLs MUST survive untouched.
   */
  it('H1: safe schemes pass through unchanged', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><image href="data:image/png;base64,iVBORw0KGgo" width="50" height="50"/></svg>`;
    const { document } = importSvgDocument(svg, 'safe-scheme');
    const image = document.elements.find((el) => el.type === 'image');

    expect(typeof image?.content === 'string' ? image.content : '').toContain('data:image/png');
  });

  /**
   * @description M1 — Path data validation in clipPath bodies. An
   * attacker `<clipPath><path d="not-actually-a-path"/></clipPath>`
   * MUST NOT propagate raw bytes into `style.customClipPath`. Valid
   * sibling shapes still hydrate; only the malformed segment drops.
   */
  it('M1: invalid path data inside a <clipPath> is dropped', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
      <defs><clipPath id="c1"><path d="not a path /* injected */"/><rect x="0" y="0" width="50" height="50"/></clipPath></defs>
      <rect x="0" y="0" width="50" height="50" fill="#336699" clip-path="url(#c1)"/>
    </svg>`;
    const { document } = importSvgDocument(svg, 'clip-bytes');
    const rect = document.elements.find((el) => el.type === 'rectangle');
    const clip = rect?.style.customClipPath ?? '';

    expect(clip).not.toContain('not a path');
    expect(clip).not.toContain('/*');
    // The rect-from-the-clipPath geometry still survives as the
    // valid sibling — drops the bad segment, not the whole compound.
    expect(clip.length).toBeGreaterThan(0);
  });

  /**
   * @description L2 — `<!DOCTYPE>` block defensively removed. The
   * parsed tree's `xmlDoc.doctype` MUST be null after import, so
   * a future parser swap that did expand DTDs would not regress.
   * Today's browser DOMParser doesn't expand entities; this test
   * pins the defensive removal regardless.
   */
  it('L2: DOCTYPE block does not leak entity-expansion attacks', () => {
    const svg = `<?xml version="1.0"?>
<!DOCTYPE svg [
  <!ENTITY a "<!--harmless-->">
]>
<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="50" height="50" fill="#000"/></svg>`;
    const { document, warnings } = importSvgDocument(svg, 'doctype');

    // Document still hydrates — the DOCTYPE strip is silent + safe.
    expect(document.elements.length).toBeGreaterThan(0);
    // No warning about parse failure; the rect should be there.
    expect(warnings.some((w) => /invalid xml/i.test(w))).toBe(false);
  });

  /**
   * @description L3 — Namespaced event-handler attributes
   * (`xlink:onclick`, `ev:onload`) MUST be stripped, not just bare
   * `on*=` ones. Modern browsers ignore the prefixed form, but a
   * re-export carrying the bytes could leak to historic viewers.
   */
  it('L3: namespaced on* event handlers are stripped', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="100" height="100"><rect width="50" height="50" xlink:onclick="alert(1)" onload="alert(2)" fill="#fff"/></svg>`;
    const { document } = importSvgDocument(svg, 'ns-handlers');
    // The preserved markup (when present) MUST NOT carry either handler.
    const rect = document.elements.find((el) => el.type === 'rectangle');
    const ext = rect?.extensions as { readonly svg?: { readonly preserved?: { readonly raw?: string } } } | undefined;
    const preserved = ext?.svg?.preserved?.raw ?? '';
    const decoded = preserved !== '' ? Buffer.from(preserved, 'base64').toString('utf8') : '';

    expect(decoded).not.toContain('onclick=');
    expect(decoded).not.toContain('onload=');
    expect(decoded).not.toContain('alert(');
  });
});
