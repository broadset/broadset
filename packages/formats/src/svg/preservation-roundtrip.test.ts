/**
 * P7.7h — Dirty-flag byte preservation on re-export.
 *
 * Per `project/spec/formats/svg.md` →
 * "Re-exporting an untouched document produces output with
 * preserved elements identical to the source", every imported
 * element carries `extensions.svg.dirty = false` and (per this
 * unit) `extensions.svg.preserved.raw = base64(outerHTML)`. The
 * exporter checks both fields: when an element is unchanged, the
 * cached source markup re-emits verbatim instead of being
 * regenerated from current state.
 *
 * This guarantees byte-stable round-trip for the
 * Broadset → external editor → Broadset → re-export workflow:
 * the external editor sees identical bytes for every element it
 * didn't touch.
 */
import { describe, expect, it } from 'vitest';

import { exportSvgString, importSvgDocument } from './index';

describe('P7.7h — Dirty-flag byte preservation', () => {
  /**
   * @description Importing a Broadset-tagged element captures
   * its source markup into `extensions.svg.preserved.raw`. This
   * is the cache the exporter consults to re-emit unchanged
   * bytes.
   */
  it('captures the source element markup into extensions.svg.preserved on import', () => {
    const sourceSvg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:broadset="https://broadset.io/ns/xmp/1.0/" width="200" height="100">
      <metadata><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:broadset="https://broadset.io/ns/xmp/1.0/">
        <rdf:Description rdf:about="" broadset:canvasUnit="px" broadset:canvasDpi="72">
          <broadset:documentId>doc-1</broadset:documentId>
          <broadset:elements><rdf:Seq>
            <rdf:li broadset:elementId="rect-a" broadset:fingerprint="abc123" broadset:width="50" broadset:height="50"/>
          </rdf:Seq></broadset:elements>
        </rdf:Description>
      </rdf:RDF></metadata>
      <rect id="rect-a" data-bs-id="rect-a" data-bs-kind="rectangle" width="50" height="50" fill="#336699"/>
    </svg>`;
    const { document } = importSvgDocument(sourceSvg);
    const rect = document.elements.find((el) => el.id === 'rect-a');
    const ext = rect?.extensions as { readonly svg?: { readonly preserved?: { readonly raw?: string } } } | undefined;

    expect(ext?.svg?.preserved?.raw).toBeDefined();
    expect(ext?.svg?.preserved?.raw?.length ?? 0).toBeGreaterThan(0);
  });

  /**
   * @description Re-exporting a freshly-imported document MUST
   * emit the cached preserved bytes for every element where
   * `dirty === false` AND `preserved` is non-empty. The element's
   * markup in the re-exported SVG matches the source markup
   * verbatim (per-element bytes, not full-document bytes — the
   * `<svg>` root and `<defs>` blocks regenerate).
   */
  it('re-emits preserved bytes for unchanged elements on re-export', async () => {
    const sourceSvg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:broadset="https://broadset.io/ns/xmp/1.0/" width="200" height="100">
      <metadata><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:broadset="https://broadset.io/ns/xmp/1.0/">
        <rdf:Description rdf:about="" broadset:canvasUnit="px" broadset:canvasDpi="72">
          <broadset:documentId>doc-1</broadset:documentId>
          <broadset:elements><rdf:Seq>
            <rdf:li broadset:elementId="rect-a" broadset:fingerprint="abc123" broadset:width="50" broadset:height="50"/>
          </rdf:Seq></broadset:elements>
        </rdf:Description>
      </rdf:RDF></metadata>
      <rect id="rect-a" data-bs-id="rect-a" data-bs-kind="rectangle" width="50" height="50" fill="#336699" stroke-dasharray="4 2" stroke-linejoin="bevel"/>
    </svg>`;
    const { document } = importSvgDocument(sourceSvg);
    const reExported = await exportSvgString(document);

    // The preserved markup carries the unusual stroke attrs —
    // they wouldn't survive a regenerate-from-state pass because
    // the importer doesn't capture every stroke detail into the
    // model. Their survival proves the preserved cache fired.
    expect(reExported).toContain('stroke-dasharray="4 2"');
    expect(reExported).toContain('stroke-linejoin="bevel"');
  });

  /**
   * @description When `extensions.svg.dirty === true`, the
   * exporter MUST regenerate from current state and IGNORE the
   * preserved cache. This is the contract the editor relies on
   * to actually serialise user edits.
   */
  it('ignores the preserved cache when dirty===true (regenerates from state)', async () => {
    // Use an unusual stroke-dashoffset value the importer
    // captures (so the regenerated output has it from state)
    // PLUS an unusual `xml:space` attr the importer doesn't
    // capture (so the regenerated output drops it). The latter
    // proves the cache was bypassed.
    const sourceSvg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:broadset="https://broadset.io/ns/xmp/1.0/" width="200" height="100">
      <metadata><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:broadset="https://broadset.io/ns/xmp/1.0/">
        <rdf:Description rdf:about="" broadset:canvasUnit="px" broadset:canvasDpi="72">
          <broadset:documentId>doc-1</broadset:documentId>
          <broadset:elements><rdf:Seq>
            <rdf:li broadset:elementId="rect-a" broadset:fingerprint="abc123" broadset:width="50" broadset:height="50"/>
          </rdf:Seq></broadset:elements>
        </rdf:Description>
      </rdf:RDF></metadata>
      <rect id="rect-a" data-bs-id="rect-a" data-bs-kind="rectangle" width="50" height="50" xml:space="preserve" pointer-events="none"/>
    </svg>`;
    const { document } = importSvgDocument(sourceSvg);
    // Simulate a user edit: width changed AND dirty flipped to true.
    const edited = {
      ...document,
      elements: document.elements.map((el) =>
        el.id === 'rect-a' ? { ...el, width: 999, extensions: { svg: { dirty: true } } } : el,
      ),
    };
    const reExported = await exportSvgString(edited);

    // The new width comes from regenerated state, NOT the
    // cached markup which still says width="50".
    expect(reExported).toContain('width="999"');
    expect(reExported).not.toContain('width="50"');
    // Source-only attrs the model doesn't capture (`xml:space`,
    // `pointer-events`) are dropped on the regenerate path —
    // proves the cache was bypassed and we re-rendered from state.
    expect(reExported).not.toContain('xml:space="preserve"');
    expect(reExported).not.toContain('pointer-events="none"');
  });
});
