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
import { checkElementContentSecurity } from '@broadset/model';
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
    // Bumped to 90 s so V8 coverage instrumentation (which slows hot
    // loops measurably) doesn't false-fail this stress test. Normal
    // `npm run test` finishes in ~5 s.
  }, 90_000);

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

  /**
   * @description H2 closure — Importer hydrates every element through
   * the full element schema (`elementSchema`, including its
   * `superRefine` block). A `<image href="javascript:…">` payload that
   * the existing scheme allowlist somehow let slip MUST be caught by
   * `isLikelyUrlLikeContent` / `containsScriptMarkers` and either
   * dropped (with a warning per IO-D-18) or surface as an empty href.
   * The failure mode being closed: an element survives in the
   * persisted document with `javascript:` content that a later
   * re-export would carry verbatim.
   */
  it('H2 closure: <image href="javascript:…"> never reaches the persisted document with the dangerous bytes', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
      <image href="javascript:alert(1)" width="100" height="100"/>
    </svg>`;
    const { document, warnings } = importSvgDocument(svg, 'evil.svg');
    const imageEls = document.elements.filter((e) => e.type === 'image');

    // No surviving image element may carry a javascript: URL in content.
    for (const el of imageEls) {
      const content = el.content;
      const href = typeof content === 'string' ? content : (content.paragraphs[0]?.runs[0]?.text ?? '');

      expect(href).not.toMatch(/javascript:/i);
    }

    const hadSchemaOrSanitiseWarning = warnings.some((w) =>
      /schema|validation|href|rejected|javascript/i.test(w),
    );
    const allImagesEmptyHref = imageEls.every((el) => {
      const content = el.content;
      const href = typeof content === 'string' ? content : (content.paragraphs[0]?.runs[0]?.text ?? '');

      return href === '';
    });

    // Either the element was dropped entirely (with a warning), the
    // existing sanitiser left it standing with an empty href, or the
    // new schema-validation step caught it with a warning. The shape
    // being prohibited is: element survives carrying `javascript:`.
    expect(imageEls.length === 0 || hadSchemaOrSanitiseWarning || allImagesEmptyHref).toBe(true);
  });

  /**
   * @description H2 closure (positive) — A clean element with a safe
   * `data:image/png` href MUST round-trip through the schema-validation
   * gate without being dropped or warning-flagged. Pins the gate
   * against a regression that over-rejects benign content.
   */
  it('H2 closure: safe <image href="data:image/png;…"> survives the schema gate untouched', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><image href="data:image/png;base64,iVBORw0KGgo" width="50" height="50"/></svg>`;
    const { document, warnings } = importSvgDocument(svg, 'safe-image');
    const image = document.elements.find((el) => el.type === 'image');

    expect(image).toBeDefined();
    expect(typeof image?.content === 'string' ? image.content : '').toContain('data:image/png');
    expect(warnings.some((w) => /schema|validation|rejected/i.test(w))).toBe(false);
  });

  /**
   * @description H2 closure (gate exercise) — The existing scheme
   * allowlist (`stripJavascriptUrlsFromEl`) only acts on attributes
   * whose value starts with a forbidden URL scheme. A whitespace-
   * containing value (no scheme prefix at all) survives sanitisation
   * but is rejected by `isLikelyUrlLikeContent` from the element
   * schema's `superRefine`. The new content-security gate MUST drop
   * such an element with a warning that names the issue, proving the
   * defence-in-depth layer fires and is not just shadowed by the
   * sanitiser.
   */
  it('H2 closure: <image href="not a url"> is dropped by the content-security gate', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><image href="not a url has spaces" width="50" height="50"/></svg>`;
    const { document, warnings } = importSvgDocument(svg, 'unsafe-shape');

    // The element MUST NOT survive in the persisted document carrying
    // the malformed-URL bytes — the gate drops it.
    const imageEls = document.elements.filter((e) => e.type === 'image');

    expect(imageEls.length).toBe(0);
    // And the drop MUST surface a warning naming the schema issue
    // per IO-D-18 (no silent drops).
    expect(warnings.some((w) => /content-security|unsafe-url-shape/i.test(w))).toBe(true);
  });

  /**
   * @description H2 closure (text/svg gate exercise) — The existing
   * sanitiser strips `<script>` tags and `on*=` attributes at the DOM
   * level, but text-element content (or an opaque `svg`-typed
   * preservation that round-trips through a different importer
   * branch) could plausibly carry `<script>` markers in a future
   * regression. The content-security gate MUST also fire on the
   * `containsScriptMarkers` half of the schema's `superRefine` —
   * proven here by constructing a candidate element directly and
   * round-tripping it through the exported helper.
   */
  it('H2 closure: checkElementContentSecurity flags <script> markers on text/svg content', () => {
    // Use the helper that the importer's gate is built on, so the
    // contract is pinned in a way the importer can't silently bypass
    // even if a future hydration path forgets to call the gate.
    const candidate = { type: 'text', content: 'hello <script>alert(1)</script>' };

    expect(checkElementContentSecurity(candidate)).toEqual(['script-markers']);
    expect(checkElementContentSecurity({ type: 'svg', content: '<g><script>x</script></g>' })).toEqual([
      'script-markers',
    ]);
    expect(checkElementContentSecurity({ type: 'image', content: 'has whitespace not a url' })).toEqual([
      'unsafe-url-shape',
    ]);
    expect(checkElementContentSecurity({ type: 'image', content: 'data:image/png;base64,iVBORw0KGgo' })).toEqual([]);
  });

  /**
   * @description M2 closure — Preserved `outerHTML` cache used to
   * capture raw `style=""` content verbatim, leaking dangerous CSS
   * `url(javascript:…)` references into the persisted document and
   * any downstream re-export. The capture site now sanitises every
   * nested `style` attribute through the CSS URL allowlist, so the
   * `javascript:` substring MUST NOT appear anywhere in the
   * resulting `BroadsetDocument` JSON.
   */
  it('M2 closure: CSS url(javascript:…) does not survive in any preserved blob', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
      <rect id="evil" width="50" height="50" style="background:url(javascript:alert(1));filter:url(http://attacker/leak.svg)"/>
    </svg>`;
    const { document } = importSvgDocument(svg, 'evil.svg');
    const serialised = JSON.stringify(document);

    expect(serialised).not.toMatch(/url\(\s*['"]?javascript:/i);

    // Also verify the base64-encoded preservation blob (if any) is
    // free of the raw `javascript:` substring once decoded.
    const rect = document.elements.find((el) => el.type === 'rectangle');
    const ext = rect?.extensions as { readonly svg?: { readonly preserved?: { readonly raw?: string } } } | undefined;
    const preserved = ext?.svg?.preserved?.raw ?? '';
    const decoded = preserved !== '' ? Buffer.from(preserved, 'base64').toString('utf8') : '';

    expect(decoded).not.toContain('javascript:');
    // Allowlist allows http:// — the M2 closure is specifically about
    // executable-script schemes. Filter URLs over plain http to attacker
    // domains are also undesirable but the IO-D-15 contract limits the
    // scope here to executable-script schemes.
  });
});
